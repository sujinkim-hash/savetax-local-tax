"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";

type Source = { id: number; sido: string; local: string; source_url: string; created_at: string };

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [adminKeyDraft, setAdminKeyDraft] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<number | null>(null);
  const [sourceUrlDraft, setSourceUrlDraft] = useState("");
  const [sourceSidoDraft, setSourceSidoDraft] = useState("");
  const [sourceLocalDraft, setSourceLocalDraft] = useState("");
  const [notice, setNotice] = useState("");

  async function loadSources() {
    const response = await fetch("/api/sources", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { sources?: Source[] };
    setSources(data.sources ?? []);
    setSourcesLoaded(true);
  }

  async function verifyAdminKey(key: string, silent?: boolean) {
    const response = await fetch("/api/admin/sources", { headers: { "x-admin-key": key } });
    if (!response.ok) {
      if (!silent) setNotice("관리자 키를 확인해 주세요.");
      window.localStorage.removeItem("savetax_admin_key");
      return false;
    }
    setAdminKey(key);
    setIsAdmin(true);
    window.localStorage.setItem("savetax_admin_key", key);
    if (!silent) setNotice("관리자 인증이 완료되었습니다.");
    return true;
  }

  useEffect(() => { void loadSources(); }, []);
  useEffect(() => {
    const savedKey = window.localStorage.getItem("savetax_admin_key");
    if (savedKey) void verifyAdminKey(savedKey, true);
  }, []);

  async function authenticateAdmin(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const key = adminKeyDraft.trim();
    if (!key) return;
    const ok = await verifyAdminKey(key);
    if (ok) { setAdminDialogOpen(false); setAdminKeyDraft(""); }
  }

  function exitAdmin() {
    setIsAdmin(false);
    setAdminKey("");
    window.localStorage.removeItem("savetax_admin_key");
    setNotice("관리자 모드를 종료했습니다.");
  }

  function openNewSource() {
    setEditingSourceId(null);
    setSourceUrlDraft("");
    setSourceSidoDraft("");
    setSourceLocalDraft("");
    setSourceDialogOpen(true);
  }

  function openEditSource(source: Source) {
    setEditingSourceId(source.id);
    setSourceUrlDraft(source.source_url);
    setSourceSidoDraft(source.sido);
    setSourceLocalDraft(source.local);
    setSourceDialogOpen(true);
  }

  async function saveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sourceUrl = sourceUrlDraft.trim();
    const sido = sourceSidoDraft.trim();
    const local = sourceLocalDraft.trim();
    if (!adminKey || !sourceUrl || !sido || !local) return;
    const response = await fetch("/api/admin/sources", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": adminKey },
      body: JSON.stringify({ id: editingSourceId ?? undefined, sido, local, sourceUrl }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) { setNotice(data.error ?? "공식 주소 저장에 실패했습니다."); return; }
    const wasEditing = editingSourceId !== null;
    setSourceDialogOpen(false);
    setEditingSourceId(null);
    setNotice(wasEditing ? `${sido} ${local} 공식 주소를 수정했습니다.` : `${sido} ${local} 공식 주소를 등록했습니다.`);
    await loadSources();
  }

  async function deleteSource(source: Source) {
    if (!adminKey || !window.confirm(`${source.sido} ${source.local} 공식 주소를 삭제할까요?`)) return;
    const response = await fetch("/api/admin/sources", { method: "DELETE", headers: { "content-type": "application/json", "x-admin-key": adminKey }, body: JSON.stringify({ id: source.id }) });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) { setNotice(data.error ?? "공식 주소 삭제에 실패했습니다."); return; }
    setSources((current) => current.filter((item) => item.id !== source.id));
    setNotice(`${source.sido} ${source.local} 공식 주소를 삭제했습니다.`);
  }

  const sourcesByArea = useMemo(() => {
    const groups = new Map<string, Source[]>();
    sources.forEach((source) => groups.set(source.sido, [...(groups.get(source.sido) ?? []), source]));
    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right, "ko"))
      .map(([sido, rows]) => ({ sido, rows: rows.sort((left, right) => left.local.localeCompare(right.local, "ko")) }));
  }, [sources]);

  return <main className="reviewShell">
    <aside className="sideRail reviewRail" aria-label="주요 메뉴">
      <div className="railBrand"><span>LOCAL TAX</span><strong>지방소득세<br />담당자 조회</strong></div>
      <nav><Link href="/">연락처 조회</Link><Link href="/review">검토 현황</Link><a className="active" href="#">공식 주소 관리</a></nav>
      <p>종합소득세 관련<br />담당 주무관 연락처</p>
    </aside>
    <div className="reviewContent">
      <header className="reviewBanner">
        <div><p className="eyebrow">OFFICIAL SOURCES</p><h1>공식 주소 관리</h1><p className="lead">지자체 공식 직원검색·조직도 주소를 등록하고 관리합니다.</p></div>
        <div className="reviewHeaderActions"><Link className="reviewLink" href="/review">검토 현황</Link><button type="button" className="headerAdminButton" onClick={() => isAdmin ? exitAdmin() : setAdminDialogOpen(true)}>{isAdmin ? "관리자 종료" : "관리자 인증"}</button></div>
      </header>
      <div className="reviewWorkspace">
        <section className="reviewOverview"><article><b>{sourcesLoaded ? sources.length : "-"}</b><span>등록 공식 주소</span></article></section>
        <div className="reviewPanel">
          <div className="panelHead">
            <div><p className="eyebrow">SOURCE LIST</p><h2>공식 주소 등록 현황</h2></div>
            {isAdmin && <button type="button" className="startAdminMode" onClick={openNewSource}>새 주소 등록</button>}
          </div>
          <div className="sourceStatusBody">
            <p className="sourceStatusGuide">시·도를 먼저 선택하면 해당 지자체의 공식 직원검색·조직도 주소를 확인할 수 있습니다.</p>
            <div className="sourceAdminBar">{isAdmin ? <><div className="adminModeStatus"><b>주소 관리 권한이 활성화되었습니다.</b><span>주소를 등록·수정·삭제할 수 있습니다.</span></div><button type="button" className="exitAdminMode" onClick={exitAdmin}>관리자 모드 종료</button></> : <button type="button" className="startAdminMode" onClick={() => setAdminDialogOpen(true)}>주소 수정 권한 인증</button>}</div>
            {notice && <p className="sourceNotice" role="status">{notice}</p>}
            {sourcesLoaded && sources.length > 0 ? <div className="sourceRegionGroups">{sourcesByArea.map((group) => <details className="sourceRegion" key={group.sido}><summary><span className="sourceRegionName">{group.sido}</span><span className="sourceRegionCount">{group.rows.length}개 지자체</span></summary><ul className="sourceReviewList">{group.rows.map((source) => <li key={source.id}><div className="sourceRowMeta"><b>{source.local}</b><span>등록일 {source.created_at.slice(0, 10)}</span></div><div className="sourceActions"><a href={source.source_url} target="_blank" rel="noreferrer">공식 페이지 열기</a>{isAdmin && <><button type="button" onClick={() => openEditSource(source)}>수정</button><button type="button" className="deleteSource" onClick={() => void deleteSource(source)}>삭제</button></>}</div></li>)}</ul></details>)}</div> : <p className="sourceReviewEmpty">{sourcesLoaded ? "아직 등록된 공식 주소가 없습니다." : "등록된 공식 주소를 불러오는 중입니다."}</p>}
          </div>
        </div>
      </div>
      {adminDialogOpen && <div className="dialogBackdrop" role="presentation"><form className="dialog" onSubmit={authenticateAdmin}><h2>관리자 인증</h2><p>관리자 키를 입력하면 공식 주소를 등록·수정할 수 있습니다.</p><label htmlFor="sources-admin-key">관리자 키</label><input id="sources-admin-key" type="password" autoFocus value={adminKeyDraft} onChange={(event) => setAdminKeyDraft(event.target.value)} /><div className="dialogActions"><button type="button" className="dialogCancel" onClick={() => { setAdminDialogOpen(false); setAdminKeyDraft(""); }}>취소</button><button type="submit">인증</button></div></form></div>}
      {sourceDialogOpen && <div className="dialogBackdrop" role="presentation"><form className="dialog" onSubmit={saveSource}><h2>{editingSourceId !== null ? "공식 주소 수정" : "공식 주소 등록"}</h2><p>지역 이름과 직원검색·조직도 주소를 입력하세요.</p><label htmlFor="source-sido">시·도</label><input id="source-sido" autoFocus required value={sourceSidoDraft} onChange={(event) => setSourceSidoDraft(event.target.value)} placeholder="예: 경기도" /><label htmlFor="source-local">시·군·구</label><input id="source-local" required value={sourceLocalDraft} onChange={(event) => setSourceLocalDraft(event.target.value)} placeholder="예: 성남시" /><label htmlFor="source-url">공식 직원검색·조직도 주소</label><input id="source-url" type="url" required value={sourceUrlDraft} onChange={(event) => setSourceUrlDraft(event.target.value)} placeholder="https://" /><div className="dialogActions"><button type="button" className="dialogCancel" onClick={() => { setSourceDialogOpen(false); setEditingSourceId(null); }}>취소</button><button type="submit">{editingSourceId !== null ? "저장" : "등록"}</button></div></form></div>}
    </div>
  </main>;
}
