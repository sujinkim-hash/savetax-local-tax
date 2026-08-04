"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./globals.css";
import contactData from "./contacts.json";
import missingContactData from "./contacts-missing.json";

type Contact = { id?: number; sido: string; local: string; scope: string; phone: string; checked: string; status: "확인" | "검토중" };
type Review = { id: number; sido: string; local: string; field: string; previous_value: string; proposed_value: string; reason: string; source_url?: string; created_at: string };
type Source = { id: number; sido: string; local: string; source_url: string; created_at: string };

const fallbackContacts = [...(contactData as Contact[]), ...(missingContactData as Contact[])];

export default function Home() {
  const [contacts, setContacts] = useState<Contact[]>(fallbackContacts);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [adminKey, setAdminKey] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminKeyDraft, setAdminKeyDraft] = useState("");
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [sourceUrlDraft, setSourceUrlDraft] = useState("");
  const [sourceSidoDraft, setSourceSidoDraft] = useState("");
  const [sourceLocalDraft, setSourceLocalDraft] = useState("");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("전체");
  const [notice, setNotice] = useState("");
  const [copiedPhone, setCopiedPhone] = useState("");

  async function loadFromDatabase() {
    const response = await fetch("/api/contacts", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { contacts?: Contact[] };
    if (data.contacts?.length) setContacts(data.contacts);
  }
  useEffect(() => { void loadFromDatabase(); }, []);
  useEffect(() => { const selected = new URLSearchParams(window.location.search).get("region"); if (selected) setRegion(selected); }, []);

  const rows = useMemo(() => contacts.filter((item) =>
    (region === "전체" || item.sido === region) && `${item.sido} ${item.local} ${item.scope} ${item.phone}`.toLowerCase().includes(query.toLowerCase()),
  ), [contacts, query, region]);
  const regions = ["전체", ...Array.from(new Set(contacts.map((item) => item.sido)))];

  async function loadReviews(key: string) {
    const response = await fetch("/api/admin/reviews", { headers: { "x-admin-key": key } });
    const data = (await response.json()) as { reviews?: Review[]; error?: string };
    if (!response.ok) { setNotice(data.error ?? "관리자 인증에 실패했습니다."); return false; }
    setAdminKey(key);
    setIsAdmin(true);
    setReviews(data.reviews ?? []);
    await loadSources(key);
    return true;
  }

  async function loadSources(key: string) {
    const response = await fetch("/api/admin/sources", { headers: { "x-admin-key": key } });
    if (!response.ok) return;
    const data = (await response.json()) as { sources?: Source[] };
    setSources(data.sources ?? []);
  }

  async function authenticateAdmin(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const key = adminKeyDraft.trim();
    if (!key) return;
    if (await loadReviews(key)) {
      setAdminDialogOpen(false);
      setAdminKeyDraft("");
      setNotice("관리자 인증이 완료되었습니다.");
    }
  }

  async function initializeDatabase() {
    const key = adminKey || window.prompt("처음 한 번만 관리자 키를 입력하세요.");
    if (!key) return;
    setAdminKey(key);
    const response = await fetch("/api/admin/bootstrap", { method: "POST", headers: { "x-admin-key": key } });
    const data = (await response.json()) as { count?: number; error?: string };
    if (!response.ok) { setNotice(data.error ?? "DB 초기화에 실패했습니다."); return; }
    setNotice(`${data.count ?? 0}건을 DB에 저장했습니다. 이후 변경은 검토함에서 승인합니다.`);
    await loadFromDatabase();
  }

  async function approveReview(id: number) {
    const response = await fetch(`/api/admin/reviews/${id}/approve`, { method: "POST", headers: { "x-admin-key": adminKey } });
    if (!response.ok) { setNotice("승인 처리에 실패했습니다."); return; }
    setReviews((current) => current.filter((review) => review.id !== id));
    setNotice("승인한 변경을 반영했습니다.");
    await loadFromDatabase();
  }

  async function addSource() {
    const sourceUrl = sourceUrlDraft.trim();
    const sido = sourceSidoDraft.trim();
    const local = sourceLocalDraft.trim();
    if (!adminKey || !sourceUrl || !sido || !local) return;
    const response = await fetch("/api/admin/sources", { method: "POST", headers: { "content-type": "application/json", "x-admin-key": adminKey }, body: JSON.stringify({ sido, local, sourceUrl }) });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) { setNotice(data.error ?? "주소 등록에 실패했습니다."); return; }
    setSourceDialogOpen(false);
    setSourceUrlDraft("");
    setSourceSidoDraft("");
    setSourceLocalDraft("");
    setNotice("공식 주소를 등록했습니다. 아래 최근 등록 목록에서 바로 확인할 수 있습니다.");
    await loadSources(adminKey);
  }

  async function importMoisSources() {
    const key = adminKey || window.prompt("관리자 키를 입력하세요.");
    if (!key) return;
    setAdminKey(key);
    setNotice("행정안전부의 지자체 공식 홈페이지 목록을 수집하고 있습니다.");
    const response = await fetch("/api/admin/sources/import-mois", { method: "POST", headers: { "x-admin-key": key } });
    const data = (await response.json()) as { found?: number; added?: number; error?: string };
    if (!response.ok) { setNotice(data.error ?? "공식 주소 수집에 실패했습니다."); return; }
    setNotice(`공식 홈페이지 후보 ${data.found ?? 0}건을 찾았고, 새 후보 ${data.added ?? 0}건을 검토함에 추가했습니다.`);
    await loadReviews(key);
  }

  function downloadCsv() {
    const header = "시도,자치구,담당 업무,직통번호,확인일,상태";
    const lines = rows.map((item) => [item.sido, item.local, item.scope, item.phone, item.checked, item.status].map((value) => `\"${String(value).replaceAll('\"', '\"\"')}\"`).join(","));
    const blob = new Blob([["\ufeff", header, "\n", lines.join("\n")].join("")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "전국_지방소득세_담당연락처.csv"; link.click(); URL.revokeObjectURL(link.href);
  }

  async function copyPhone(phone: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(phone);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = phone;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Copy failed");
      }
      setCopiedPhone(phone);
      window.setTimeout(() => setCopiedPhone((current) => current === phone ? "" : current), 1600);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = phone;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) { setNotice("번호 복사에 실패했습니다. 번호를 길게 눌러 직접 복사해 주세요."); return; }
      setCopiedPhone(phone);
      window.setTimeout(() => setCopiedPhone((current) => current === phone ? "" : current), 1600);
    }
  }

  return <main>
      <header><div><p className="eyebrow">LOCAL INCOME TAX DIRECTORY</p><h1>전국 지방소득세 담당자 연락처</h1><p className="lead">종합소득세와 관련된 담당 주무관 기준으로 전국 시·군·구 연락처를 한 곳에서 확인합니다.</p></div><div className="headerActions"><Link className="reviewLink" href="/review">검토 현황</Link><button className="admin" onClick={isAdmin ? () => { setIsAdmin(false); setReviews([]); setNotice("관리자 모드를 종료했습니다."); } : () => setAdminDialogOpen(true)}>{isAdmin ? "관리자 모드 종료" : "관리자"} {!isAdmin && <span>🔒</span>}</button></div></header>
    <section className="stats"><article><span>등록 연락처</span><b>{contacts.length}</b></article><article><span>시도</span><b>{new Set(contacts.map((item) => item.sido)).size}</b></article><article><span>시·군·구 지자체</span><b>256</b></article>{isAdmin && <article><span>검토 대기 변경</span><b>{reviews.length}</b></article>}</section>
    <section className="toolbar"><select aria-label="지역 선택" value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select><input aria-label="검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="시도, 시·군·구, 담당 업무 또는 번호 검색" /><button className="download" onClick={downloadCsv}>자료 내려받기</button></section>
    {notice && <p className="notice" role="status">{notice}</p>}
    <section className="panel"><div className="panelHead"><div><p className="eyebrow">DIRECT CONTACT DIRECTORY</p><h2>담당자 연락처</h2></div><p>{rows.length}건 표시</p></div><div className="table"><div className="tr th"><span>시도</span><span>자치구</span><span>담당 업무</span><span>직통번호</span></div>{rows.map((item, index) => <div className="tr" key={`${item.sido}-${item.local}-${item.phone}-${index}`}><span>{item.sido}</span><strong>{item.local}</strong><span>{item.scope}</span><span className="phoneCell"><a href={`tel:${item.phone}`}>{item.phone}</a><button type="button" className="copyPhone" onClick={() => void copyPhone(item.phone)} aria-label={`${item.phone} 복사`}>{copiedPhone === item.phone ? "복사됨" : "복사"}</button></span></div>)}</div></section>
    {isAdmin && <section className="review"><div><p className="eyebrow">ADMINISTRATION</p><h2>관리자 검토 및 자동화</h2><p>이 영역은 관리자 키 인증 후에만 보입니다. 승인한 변경만 공개 연락처에 반영됩니다.</p>{reviews.length > 0 && <details className="reviewList"><summary>검토 대상 {reviews.length}건 보기</summary><ul>{reviews.map((review) => <li key={review.id}><b>{review.sido} {review.local}</b> · {review.field}: {review.previous_value} → {review.source_url ? <a href={review.source_url} target="_blank" rel="noreferrer">공식 페이지 열기</a> : review.proposed_value}<button onClick={() => approveReview(review.id)}>승인</button></li>)}</ul></details>}</div><div className="reviewActions"><button onClick={initializeDatabase}>연락처 DB 시작하기</button><button onClick={importMoisSources}>행안부 주소 일괄 수집</button><button className="secondary" onClick={() => setSourceDialogOpen(true)}>공식 주소 직접 등록</button></div>{sources.length > 0 && <div className="sourceList"><p className="eyebrow">RECENTLY ADDED</p><h3>최근 등록한 공식 주소</h3><ul>{sources.map((source) => <li key={source.id}><b>{source.sido} {source.local}</b><a href={source.source_url} target="_blank" rel="noreferrer">공식 페이지 열기</a></li>)}</ul></div>}</section>}
    {adminDialogOpen && <div className="dialogBackdrop" role="presentation"><form className="dialog" onSubmit={authenticateAdmin}><h2>관리자 인증</h2><p>관리자 키를 입력한 뒤 Enter를 누르거나 인증 버튼을 선택하세요.</p><label htmlFor="admin-key">관리자 키</label><input id="admin-key" type="password" autoFocus value={adminKeyDraft} onChange={(event) => setAdminKeyDraft(event.target.value)} /><div className="dialogActions"><button type="button" className="dialogCancel" onClick={() => { setAdminDialogOpen(false); setAdminKeyDraft(""); }}>취소</button><button type="submit">인증</button></div></form></div>}
    {sourceDialogOpen && <div className="dialogBackdrop" role="presentation"><form className="dialog" onSubmit={(event) => { event.preventDefault(); void addSource(); }}><h2>공식 주소 직접 등록</h2><p>주소부터 입력하고 시·도, 시·군·구를 이어서 입력하세요. 마지막 칸에서 Enter를 누르면 등록됩니다.</p><label htmlFor="source-url">공식 직원검색·조직도 주소</label><input id="source-url" type="url" autoFocus required value={sourceUrlDraft} onChange={(event) => setSourceUrlDraft(event.target.value)} placeholder="https://" /><label htmlFor="source-sido">시·도</label><input id="source-sido" required value={sourceSidoDraft} onChange={(event) => setSourceSidoDraft(event.target.value)} placeholder="예: 경기도" /><label htmlFor="source-local">시·군·구</label><input id="source-local" required value={sourceLocalDraft} onChange={(event) => setSourceLocalDraft(event.target.value)} placeholder="예: 성남시" /><div className="dialogActions"><button type="button" className="dialogCancel" onClick={() => setSourceDialogOpen(false)}>취소</button><button type="submit">등록</button></div></form></div>}
  </main>;
}

