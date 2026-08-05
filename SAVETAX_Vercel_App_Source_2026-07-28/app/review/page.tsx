"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import contactData from "../contacts.json";
import missingContactData from "../contacts-missing.json";

type Contact = { sido: string; local: string; checked: string; status: "확인" | "검토중" };
type Source = { id: number; sido: string; local: string; source_url: string; created_at: string };

const contacts = [...(contactData as Contact[]), ...(missingContactData as Contact[])];

export default function ReviewPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [adminKeyDraft, setAdminKeyDraft] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [sourceUrlDraft, setSourceUrlDraft] = useState("");
  const [sourceSidoDraft, setSourceSidoDraft] = useState("");
  const [sourceLocalDraft, setSourceLocalDraft] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void fetch("/api/sources", { cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()) as { sources?: Source[] } : { sources: [] })
      .then((data) => setSources(data.sources ?? []))
      .catch(() => setSources([]))
      .finally(() => setSourcesLoaded(true));
  }, []);

  async function authenticateAdmin(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const key = adminKeyDraft.trim();
    if (!key) return;
    const response = await fetch("/api/admin/sources", { headers: { "x-admin-key": key } });
    if (!response.ok) {
      setNotice("관리자 키를 확인해 주세요.");
      return;
    }
    setAdminKey(key);
    setIsAdmin(true);
    setAdminDialogOpen(false);
    setAdminKeyDraft("");
    setNotice("관리자 인증이 완료되었습니다. 공식 주소를 수정할 수 있습니다.");
  }

  function openSourceEditor(source: Source) {
    setEditingSource(source);
    setSourceUrlDraft(source.source_url);
    setSourceSidoDraft(source.sido);
    setSourceLocalDraft(source.local);
  }

  async function saveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingSource || !adminKey || !sourceUrlDraft.trim() || !sourceSidoDraft.trim() || !sourceLocalDraft.trim()) return;
    const response = await fetch("/api/admin/sources", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": adminKey },
      body: JSON.stringify({ id: editingSource.id, sido: sourceSidoDraft.trim(), local: sourceLocalDraft.trim(), sourceUrl: sourceUrlDraft.trim() }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setNotice(data.error ?? "공식 주소 수정에 실패했습니다.");
      return;
    }
    setEditingSource(null);
    setSourceUrlDraft("");
    setNotice(`${sourceSidoDraft.trim()} ${sourceLocalDraft.trim()} 공식 주소를 수정했습니다.`);
    setSourcesLoaded(false);
    const refreshed = await fetch("/api/sources", { cache: "no-store" });
    const refreshedData = (await refreshed.json()) as { sources?: Source[] };
    setSources(refreshedData.sources ?? []);
    setSourcesLoaded(true);
  }

  async function deleteSource(source: Source) {
    if (!adminKey || !window.confirm(`${source.sido} ${source.local} 공식 주소를 삭제할까요?`)) return;
    const response = await fetch("/api/admin/sources", { method: "DELETE", headers: { "content-type": "application/json", "x-admin-key": adminKey }, body: JSON.stringify({ id: source.id }) });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) { setNotice(data.error ?? "공식 주소 삭제에 실패했습니다."); return; }
    setSources((current) => current.filter((item) => item.id !== source.id));
    setNotice(`${source.sido} ${source.local} 공식 주소를 삭제했습니다.`);
  }

  const areas = Array.from(new Set(contacts.map((item) => item.sido))).sort((a, b) => a.localeCompare(b, "ko"));
  const sourcesByArea = useMemo(() => {
    const groups = new Map<string, Source[]>();
    sources.forEach((source) => groups.set(source.sido, [...(groups.get(source.sido) ?? []), source]));
    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right, "ko"))
      .map(([sido, rows]) => ({ sido, rows: rows.sort((left, right) => left.local.localeCompare(right.local, "ko")) }));
  }, [sources]);
  const summary = areas.map((sido) => {
    const rows = contacts.filter((item) => item.sido === sido);
    const locals = new Set(rows.map((item) => item.local)).size;
    const pending = rows.filter((item) => item.status === "검토중").length;
    const checked = rows.map((item) => item.checked).sort().at(-1) ?? "-";
    return { sido, count: rows.length, locals, pending, checked };
  });

  return <main>
    <div className="reviewTopActions"><Link className="backLink" href="/">담당자 번호 확인</Link></div>
    <section className="reviewOverview"><article><b>{contacts.length}</b><span>등록 연락처</span></article><article><b>{areas.length}</b><span>검토 지역</span></article><article><b>{summary.reduce((total, item) => total + item.pending, 0)}</b><span>재검토 대상</span></article><article><b>{sourcesLoaded ? sources.length : "-"}</b><span>등록 공식 주소</span></article></section>
    <details className="reviewPanel sectionAccordion"><summary className="panelHead"><div><p className="eyebrow">REGIONAL REVIEW</p><h2>시·도별 확인 상태</h2></div><p>지역을 선택하면 연락처 목록으로 돌아갈 수 있습니다.</p><i aria-hidden="true" /></summary><div className="reviewGrid">{summary.map((item) => <Link href={`/?region=${encodeURIComponent(item.sido)}`} className="reviewCard" key={item.sido}><div><b>{item.sido}</b><span>{item.locals}개 시·군·구 · {item.count}건</span></div><div><strong>{item.checked}</strong><i className={item.pending ? "pending" : "confirmed"}>{item.pending ? `재검토 ${item.pending}건` : "확인 완료"}</i></div></Link>)}</div></details>
    <details className="sourceReviewPanel sectionAccordion"><summary className="panelHead"><div><p className="eyebrow">OFFICIAL SOURCES</p><h2>공식 주소 등록 현황</h2></div><p>시·도별로 모아둔 지자체 직원검색·조직도 주소입니다.</p><i aria-hidden="true" /></summary><div className="sourceAdminBar">{isAdmin ? <><span>관리자 수정 모드</span><button type="button" onClick={() => { setIsAdmin(false); setAdminKey(""); setNotice("관리자 수정 모드를 종료했습니다."); }}>수정 모드 종료</button></> : <button type="button" onClick={() => setAdminDialogOpen(true)}>관리자 인증 후 주소 수정</button>}</div>{notice && <p className="sourceNotice" role="status">{notice}</p>}{sourcesLoaded && sources.length > 0 ? <div className="sourceRegionGroups">{sourcesByArea.map((group) => <details className="sourceRegion" key={group.sido}><summary>{group.sido}<span>{group.rows.length}건</span></summary><ul className="sourceReviewList">{group.rows.map((source) => <li key={source.id}><div><b>{source.local}</b><span>등록일 {source.created_at.slice(0, 10)}</span></div><div className="sourceActions"><a href={source.source_url} target="_blank" rel="noreferrer">공식 페이지 열기</a>{isAdmin && <><button type="button" onClick={() => openSourceEditor(source)}>수정</button><button type="button" className="deleteSource" onClick={() => void deleteSource(source)}>삭제</button></>}</div></li>)}</ul></details>)}</div> : <p className="sourceReviewEmpty">{sourcesLoaded ? "아직 등록된 공식 주소가 없습니다." : "등록된 공식 주소를 불러오는 중입니다."}</p>}</details>
    {adminDialogOpen && <div className="dialogBackdrop" role="presentation"><form className="dialog" onSubmit={authenticateAdmin}><h2>관리자 인증</h2><p>관리자 키를 입력하면 공식 주소를 바로 수정할 수 있습니다.</p><label htmlFor="review-admin-key">관리자 키</label><input id="review-admin-key" type="password" autoFocus value={adminKeyDraft} onChange={(event) => setAdminKeyDraft(event.target.value)} /><div className="dialogActions"><button type="button" className="dialogCancel" onClick={() => { setAdminDialogOpen(false); setAdminKeyDraft(""); }}>취소</button><button type="submit">인증</button></div></form></div>}
    {editingSource && <div className="dialogBackdrop" role="presentation"><form className="dialog" onSubmit={saveSource}><h2>공식 주소 수정</h2><p>지역 이름과 직원검색·조직도 주소를 함께 수정할 수 있습니다.</p><label htmlFor="source-edit-sido">시·도</label><input id="source-edit-sido" autoFocus required value={sourceSidoDraft} onChange={(event) => setSourceSidoDraft(event.target.value)} placeholder="예: 경기도" /><label htmlFor="source-edit-local">시·군·구</label><input id="source-edit-local" required value={sourceLocalDraft} onChange={(event) => setSourceLocalDraft(event.target.value)} placeholder="예: 성남시" /><label htmlFor="source-edit-url">공식 직원검색·조직도 주소</label><input id="source-edit-url" type="url" required value={sourceUrlDraft} onChange={(event) => setSourceUrlDraft(event.target.value)} placeholder="https://" /><div className="dialogActions"><button type="button" className="dialogCancel" onClick={() => { setEditingSource(null); setSourceUrlDraft(""); setSourceSidoDraft(""); setSourceLocalDraft(""); }}>취소</button><button type="submit">저장</button></div></form></div>}
  </main>;
}
