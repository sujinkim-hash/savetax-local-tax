"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./globals.css";
import contactData from "./contacts.json";
import missingContactData from "./contacts-missing.json";

type Contact = { id?: number; sido: string; local: string; scope: string; phone: string; checked: string; status: "확인" | "검토중" };
type Review = { id: number; sido: string; local: string; field: string; previous_value: string; proposed_value: string; reason: string; source_url?: string; created_at: string };
type Source = { id: number; sido: string; local: string; source_url: string; navigation_note?: string | null; created_at: string };

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
  const [editingSourceId, setEditingSourceId] = useState<number | null>(null);
  const [sourceNoteDraft, setSourceNoteDraft] = useState("");
  const [viewingSourceNote, setViewingSourceNote] = useState<Source | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactPhoneDraft, setContactPhoneDraft] = useState("");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("전체");
  const [notice, setNotice] = useState("");
  const [copiedPhone, setCopiedPhone] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  async function loadFromDatabase() {
    const response = await fetch("/api/contacts", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { contacts?: Contact[] };
    if (data.contacts?.length) setContacts(data.contacts);
  }
  useEffect(() => { setPage(1); }, [query, region]);
  useEffect(() => { void loadFromDatabase(); void loadPublicSources(); }, []);
  useEffect(() => { const savedKey = window.localStorage.getItem("savetax_admin_key"); if (savedKey) void loadReviews(savedKey); }, []);
  useEffect(() => { const selected = new URLSearchParams(window.location.search).get("region"); if (selected) setRegion(selected); }, []);

  const rows = useMemo(() => contacts.filter((item) =>
    (region === "전체" || item.sido === region) && `${item.sido} ${item.local} ${item.scope} ${item.phone}`.toLowerCase().includes(query.toLowerCase()),
  ), [contacts, query, region]);
  const regions = ["전체", ...Array.from(new Set(contacts.map((item) => item.sido)))];
  const sourcesByOffice = useMemo(() => {
    const grouped = new Map<string, Source[]>();
    sources.forEach((source) => {
      const key = source.sido + "::" + source.local;
      grouped.set(key, [...(grouped.get(key) ?? []), source]);
    });
    return grouped;
  }, [sources]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page]);

  async function loadReviews(key: string) {
    const response = await fetch("/api/admin/reviews", { headers: { "x-admin-key": key } });
    const data = (await response.json()) as { reviews?: Review[]; error?: string };
    if (!response.ok) { setNotice(data.error ?? "관리자 인증에 실패했습니다."); return false; }
    setAdminKey(key);
    setIsAdmin(true);
    window.localStorage.setItem("savetax_admin_key", key);
    setReviews(data.reviews ?? []);
    await loadSources(key);
    return true;
  }

  async function loadSources(key: string) {
    const response = await fetch("/api/admin/sources?fast=1", { headers: { "x-admin-key": key } });
    if (!response.ok) return;
    const data = (await response.json()) as { sources?: Source[] };
    setSources(data.sources ?? []);
  }

  async function loadPublicSources() {
    const response = await fetch("/api/sources", { cache: "no-store" });
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

  function toggleAdminAccess() {
    if (isAdmin) {
      if (!window.confirm("관리자 인증을 해제할까요?")) return;
      setIsAdmin(false);
      setAdminKey("");
      setReviews([]);
      window.localStorage.removeItem("savetax_admin_key");
      setNotice("관리자 인증을 해제했습니다.");
      return;
    }
    setAdminDialogOpen(true);
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
    const response = await fetch("/api/admin/sources", { method: "POST", headers: { "content-type": "application/json", "x-admin-key": adminKey }, body: JSON.stringify({ id: editingSourceId ?? undefined, sido, local, sourceUrl, navigationNote: sourceNoteDraft.trim() }) });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) { setNotice(data.error ?? "주소 등록에 실패했습니다."); return; }
    const wasEditing = editingSourceId !== null;
    setSourceDialogOpen(false);
    setEditingSourceId(null);
    setSourceUrlDraft("");
    setSourceSidoDraft("");
    setSourceLocalDraft("");
    setSourceNoteDraft("");
    setNotice(wasEditing ? "공식 주소 정보를 수정했습니다." : "공식 주소를 등록했습니다. 아래 등록 현황에서 바로 확인할 수 있습니다.");
    await loadSources(adminKey);
  }

  function openSourceRegistration(contact: Contact) {
    setEditingSourceId(null);
    setSourceUrlDraft("");
    setSourceSidoDraft(contact.sido);
    setSourceLocalDraft(contact.local);
    setSourceNoteDraft("");
    setSourceDialogOpen(true);
  }

  function editSource(source: Source) {
    setEditingSourceId(source.id);
    setSourceUrlDraft(source.source_url);
    setSourceSidoDraft(source.sido);
    setSourceLocalDraft(source.local);
    setSourceNoteDraft(source.navigation_note ?? "");
    setSourceDialogOpen(true);
  }

  async function deleteSource(source: Source) {
    if (!window.confirm(source.sido + " " + source.local + "의 공식 주소를 삭제할까요?")) return;
    const response = await fetch("/api/admin/sources", { method: "DELETE", headers: { "content-type": "application/json", "x-admin-key": adminKey }, body: JSON.stringify({ id: source.id }) });
    if (!response.ok) { setNotice("공식 주소 삭제에 실패했습니다."); return; }
    setSources((current) => current.filter((item) => item.id !== source.id));
    setNotice("공식 주소를 삭제했습니다.");
  }

  function openContactEdit(contact: Contact) {
    if (!contact.id) { setNotice("저장된 연락처만 수정할 수 있습니다. 먼저 연락처 DB 시작하기를 실행하세요."); return; }
    setEditingContact(contact);
    setContactPhoneDraft(contact.phone);
  }

  async function saveContactPhone() {
    if (!editingContact?.id || !contactPhoneDraft.trim()) return;
    const response = await fetch("/api/contacts", { method: "PATCH", headers: { "content-type": "application/json", "x-admin-key": adminKey }, body: JSON.stringify({ id: editingContact.id, phone: contactPhoneDraft.trim() }) });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) { setNotice(data.error ?? "직통번호 수정에 실패했습니다."); return; }
    const newPhone = contactPhoneDraft.trim();
    setContacts((current) => current.map((item) => item.id === editingContact.id ? { ...item, phone: newPhone, checked: new Date().toISOString().slice(0, 10), status: "확인" } : item));
    setEditingContact(null);
    setNotice("직통번호를 수정했습니다.");
  }

  async function deleteContact(contact: Contact) {
    if (!contact.id) { setNotice("저장된 연락처만 삭제할 수 있습니다. 먼저 연락처 DB 시작하기를 실행하세요."); return; }
    if (!window.confirm(contact.sido + " " + contact.local + " · " + contact.scope + " 연락처를 삭제할까요?")) return;
    const response = await fetch("/api/contacts", { method: "DELETE", headers: { "content-type": "application/json", "x-admin-key": adminKey }, body: JSON.stringify({ id: contact.id }) });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) { setNotice(data.error ?? "연락처 삭제에 실패했습니다."); return; }
    setContacts((current) => current.filter((item) => item.id !== contact.id));
    setNotice("연락처를 삭제했습니다. 삭제한 행은 공개 목록에서 제외됩니다.");
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
    const lines = rows.map((item) => [item.sido, item.local, item.scope, item.phone, item.checked, item.status].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
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

  return <main className="appShell">
    <aside className="sideRail" aria-label="주요 메뉴"><div className="railBrand"><span>LOCAL TAX</span><strong>지방소득세<br />담당자 조회</strong></div><nav><a className="active" href="#directory">연락처 조회</a><Link href="/review">검토 현황</Link><Link href="/review">관리자·검토</Link></nav><p>종합소득세 관련<br />담당 주무관 연락처</p></aside>
    <div className="appContent">
      <header className="topBanner"><div><p className="eyebrow">LOCAL INCOME TAX DIRECTORY</p><h1>전국 지방소득세 담당자 연락처</h1><p className="lead">종합소득세와 관련된 담당 주무관 기준으로 전국 시·군·구 연락처를 한 곳에서 확인합니다.</p></div><div className="headerActions"><Link className="reviewLink" href="/review">검토 현황</Link><button type="button" className="admin" onClick={toggleAdminAccess}>{isAdmin ? "관리자 인증됨" : "관리자 인증"}</button></div></header>
    <section className="stats"><article><span>등록 연락처</span><b>{contacts.length}</b></article><article><span>시도</span><b>{new Set(contacts.map((item) => item.sido)).size}</b></article><article><span>시·군·구 지자체</span><b>256</b></article></section>
    <section className="toolbar"><select aria-label="지역 선택" value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select><input aria-label="검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="시도, 시·군·구, 담당 업무 또는 번호 검색" /><button className="download" onClick={downloadCsv}>자료 내려받기</button></section>
    {notice && <p className="notice" role="status">{notice}</p>}
    <section className="panel" id="directory">
      <div className="panelHead">
        <div><p className="eyebrow">DIRECT CONTACT DIRECTORY</p><h2>담당자 연락처</h2></div>
        <p>{rows.length}건 표시 · {page}/{totalPages}페이지</p>
      </div>
      <div className="table">
        <div className="tr th"><span>시도</span><span>자치구</span><span>담당 업무</span><span>직통번호</span><span>공식 페이지</span><span>메모</span></div>
        {pagedRows.map((item, index) => {
          const officialSources = sourcesByOffice.get(item.sido + "::" + item.local) ?? [];
          return <div className="tr" key={item.sido + "-" + item.local + "-" + item.phone + "-" + index}>
            <span>{item.sido}</span>
            <strong>{item.local}</strong>
            <span className="scopeCell" title={item.scope}>{item.scope}</span>
            <span className="phoneCell">
              <a href={"tel:" + item.phone}>{item.phone}</a>
              <button type="button" className="copyPhone" onClick={() => void copyPhone(item.phone)} aria-label={item.phone + " 복사"}>{copiedPhone === item.phone ? "복사됨" : "복사"}</button>
              {isAdmin && <><button type="button" className="contactEdit" onClick={() => openContactEdit(item)}>수정</button><button type="button" className="contactDelete" onClick={() => void deleteContact(item)}>삭제</button></>}
            </span>
            <span className="sourceCell">{officialSources.length > 0 ? <span className="sourceLinks">{officialSources.map((source, sourceIndex) => <a key={source.id} href={source.source_url} target="_blank" rel="noreferrer">열기{officialSources.length > 1 ? " " + (sourceIndex + 1) : ""}</a>)}</span> : isAdmin ? <button type="button" onClick={() => openSourceRegistration(item)}>등록</button> : <em>미등록</em>}</span>
            <span className="memoCell">{officialSources.some((source) => source.navigation_note?.trim()) ? <span className="sourceLinks">{officialSources.filter((source) => source.navigation_note?.trim()).map((source, noteIndex) => <button type="button" key={source.id} className="sourceMemoButton" onClick={() => setViewingSourceNote(source)}>메모{officialSources.filter((item) => item.navigation_note?.trim()).length > 1 ? " " + (noteIndex + 1) : ""}</button>)}</span> : <em>-</em>}</span>
          </div>;
        })}
      </div>
      {totalPages > 1 && (
        <div className="pager" aria-label="페이지 이동">
          <button type="button" disabled={page === 1} onClick={() => setPage(1)} aria-label="첫 페이지로 이동">&lt;&lt;</button>
          <button type="button" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>이전</button>
          <span>{page} / {totalPages}</span>
          <button type="button" disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>다음</button>
          <button type="button" disabled={page === totalPages} onClick={() => setPage(totalPages)} aria-label="마지막 페이지로 이동">&gt;&gt;</button>
        </div>
      )}
    </section>
    {adminDialogOpen && <div className="dialogBackdrop" role="presentation"><form className="dialog" onSubmit={authenticateAdmin}><h2>관리자 인증</h2><p>관리자 키를 입력한 뒤 Enter를 누르거나 인증 버튼을 선택하세요.</p><label htmlFor="admin-key">관리자 키</label><input id="admin-key" type="password" autoFocus value={adminKeyDraft} onChange={(event) => setAdminKeyDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void authenticateAdmin(); } }} /><div className="dialogActions"><button type="button" className="dialogCancel" onClick={() => { setAdminDialogOpen(false); setAdminKeyDraft(""); }}>취소</button><button type="submit">인증</button></div></form></div>}
    {editingContact && <div className="dialogBackdrop" role="presentation"><form className="dialog" onSubmit={(event) => { event.preventDefault(); void saveContactPhone(); }}><h2>직통번호 수정</h2><p>{editingContact.sido} {editingContact.local} · {editingContact.scope}</p><label htmlFor="contact-phone">직통번호</label><input id="contact-phone" type="tel" autoFocus required value={contactPhoneDraft} onChange={(event) => setContactPhoneDraft(event.target.value)} placeholder="예: 02-0000-0000" /><div className="dialogActions"><button type="button" className="dialogCancel" onClick={() => setEditingContact(null)}>취소</button><button type="submit">저장</button></div></form></div>}
    {sourceDialogOpen && <div className="dialogBackdrop" role="presentation"><form className="dialog" onSubmit={(event) => { event.preventDefault(); void addSource(); }}><h2>{editingSourceId !== null ? "공식 주소 수정" : "공식 페이지 추가 등록"}</h2><p>기존 페이지는 유지되며, 같은 지자체에 추가 직원검색·조직도 주소를 등록할 수 있습니다.</p><label htmlFor="source-url">공식 직원검색·조직도 주소</label><input id="source-url" type="url" autoFocus required value={sourceUrlDraft} onChange={(event) => setSourceUrlDraft(event.target.value)} placeholder="https://" /><label htmlFor="source-sido">시·도</label><input id="source-sido" required value={sourceSidoDraft} onChange={(event) => setSourceSidoDraft(event.target.value)} placeholder="예: 경기도" /><label htmlFor="source-local">시·군·구</label><input id="source-local" required value={sourceLocalDraft} onChange={(event) => setSourceLocalDraft(event.target.value)} placeholder="예: 성남시" /><label htmlFor="source-note">확인 경로 메모 <small>(선택)</small></label><textarea id="source-note" value={sourceNoteDraft} onChange={(event) => setSourceNoteDraft(event.target.value)} placeholder="예: 세무2과 선택 후 지방소득세(종합소득) 담당자 확인" /><div className="dialogActions"><button type="button" className="dialogCancel" onClick={() => { setSourceDialogOpen(false); setEditingSourceId(null); }}>취소</button><button type="submit">{editingSourceId !== null ? "저장" : "등록"}</button></div></form></div>}
    {viewingSourceNote && <div className="dialogBackdrop" role="presentation"><div className="dialog sourceNoteDialog" role="dialog" aria-modal="true" aria-labelledby="source-note-title"><h2 id="source-note-title">{viewingSourceNote.sido} {viewingSourceNote.local} 확인 경로</h2><p className="sourceNoteText">{viewingSourceNote.navigation_note}</p><a className="sourceNoteOpen" href={viewingSourceNote.source_url} target="_blank" rel="noreferrer">공식 페이지 열기</a><div className="dialogActions"><button type="button" onClick={() => setViewingSourceNote(null)}>닫기</button></div></div></div>}
    </div>
  </main>;
}
