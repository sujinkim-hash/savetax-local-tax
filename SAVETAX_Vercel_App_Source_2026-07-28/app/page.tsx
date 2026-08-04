"use client";

import { useEffect, useMemo, useState } from "react";
import "./globals.css";
import contactData from "./contacts.json";
import missingContactData from "./contacts-missing.json";

type Contact = { id?: number; sido: string; local: string; scope: string; phone: string; checked: string; status: "확인" | "검토중" };
type Review = { id: number; sido: string; local: string; field: string; previous_value: string; proposed_value: string; reason: string; source_url?: string; created_at: string };

const fallbackContacts = [...(contactData as Contact[]), ...(missingContactData as Contact[])];

export default function Home() {
  const [contacts, setContacts] = useState<Contact[]>(fallbackContacts);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [adminKey, setAdminKey] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
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
    return true;
  }

  async function authenticateAdmin() {
    const key = window.prompt("관리자 키를 입력하세요.");
    if (!key) return;
    if (await loadReviews(key)) setNotice("관리자 인증이 완료되었습니다.");
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
    const key = adminKey || window.prompt("관리자 키를 입력하세요.");
    if (!key) return;
    const sido = window.prompt("시도명을 입력하세요. 예: 경기도");
    const local = window.prompt("시·군·구명을 입력하세요. 예: 성남시");
    const sourceUrl = window.prompt("공식 직원·조직도 페이지 주소를 붙여 넣으세요.");
    if (!sido || !local || !sourceUrl) return;
    setAdminKey(key);
    const response = await fetch("/api/admin/sources", { method: "POST", headers: { "content-type": "application/json", "x-admin-key": key }, body: JSON.stringify({ sido, local, sourceUrl }) });
    const data = (await response.json()) as { error?: string };
    setNotice(response.ok ? "공식 홈페이지 점검 목록에 추가했습니다." : (data.error ?? "주소 등록에 실패했습니다."));
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
      <header><div><p className="eyebrow">LOCAL INCOME TAX DIRECTORY</p><h1>전국 지방소득세 담당자 연락처</h1><p className="lead">종합소득세와 관련된 담당 주무관 기준으로 전국 시·군·구 연락처를 한 곳에서 확인합니다.</p></div><button className="admin" onClick={isAdmin ? () => { setIsAdmin(false); setReviews([]); setNotice("관리자 모드를 종료했습니다."); } : authenticateAdmin}>{isAdmin ? "관리자 모드 종료" : "관리자"} {!isAdmin && <span>🔒</span>}</button></header>
    <section className="stats"><article><b>{contacts.length}</b><span>등록 연락처</span></article><article><b>{new Set(contacts.map((item) => item.sido)).size}</b><span>시도</span></article><article><b>256</b><span>시·군·구 지자체</span></article>{isAdmin && <article><b>{reviews.length}</b><span>검토 대기 변경</span></article>}</section>
    <section className="toolbar"><input aria-label="검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="시도, 시·군·구, 담당 업무 또는 번호 검색" /><select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select><button className="download" onClick={downloadCsv}>자료 내려받기</button></section>
    {notice && <p className="notice" role="status">{notice}</p>}
    <section className="panel"><div className="panelHead"><div><p className="eyebrow">DIRECT CONTACT DIRECTORY</p><h2>담당자 연락처</h2></div><p>{rows.length}건 표시</p></div><div className="table"><div className="tr th"><span>시도</span><span>자치구</span><span>담당 업무</span><span>직통번호</span><span>확인일</span><span>상태</span></div>{rows.map((item, index) => <div className="tr" key={`${item.sido}-${item.local}-${item.phone}-${index}`}><span>{item.sido}</span><strong>{item.local}</strong><span>{item.scope}</span><span className="phoneCell"><a href={`tel:${item.phone}`}>{item.phone}</a><button type="button" className="copyPhone" onClick={() => void copyPhone(item.phone)} aria-label={`${item.phone} 복사`}>{copiedPhone === item.phone ? "복사됨" : "복사"}</button></span><span>{item.checked}</span><i>{item.status}</i></div>)}</div></section>
    {isAdmin && <section className="review"><div><p className="eyebrow">ADMINISTRATION</p><h2>관리자 검토 및 자동화</h2><p>이 영역은 관리자 키 인증 후에만 보입니다. 승인한 변경만 공개 연락처에 반영됩니다.</p>{reviews.length > 0 && <details className="reviewList"><summary>검토 대상 {reviews.length}건 보기</summary><ul>{reviews.map((review) => <li key={review.id}><b>{review.sido} {review.local}</b> · {review.field}: {review.previous_value} → {review.source_url ? <a href={review.source_url} target="_blank" rel="noreferrer">공식 페이지 열기</a> : review.proposed_value}<button onClick={() => approveReview(review.id)}>승인</button></li>)}</ul></details>}</div><div className="reviewActions"><button onClick={initializeDatabase}>연락처 DB 시작하기</button><button onClick={importMoisSources}>행안부 주소 일괄 수집</button><button className="secondary" onClick={addSource}>공식 주소 직접 등록</button></div></section>}
  </main>;
}
"use client";

import { useEffect, useMemo, useState } from "react";
import "./globals.css";
import contactData from "./contacts.json";
import missingContactData from "./contacts-missing.json";

type Contact = { id?: number; sido: string; local: string; scope: string; phone: string; checked: string; status: "확인" | "검토중" };
type Review = { id: number; sido: string; local: string; field: string; previous_value: string; proposed_value: string; reason: string; source_url?: string; created_at: string };

const fallbackContacts = [...(contactData as Contact[]), ...(missingContactData as Contact[])];

export default function Home() {
  const [contacts, setContacts] = useState<Contact[]>(fallbackContacts);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [adminKey, setAdminKey] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
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
    return true;
  }

  async function authenticateAdmin() {
    const key = window.prompt("관리자 키를 입력하세요.");
    if (!key) return;
    if (await loadReviews(key)) setNotice("관리자 인증이 완료되었습니다.");
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
    const key = adminKey || window.prompt("관리자 키를 입력하세요.");
    if (!key) return;
    const sido = window.prompt("시도명을 입력하세요. 예: 경기도");
    const local = window.prompt("시·군·구명을 입력하세요. 예: 성남시");
    const sourceUrl = window.prompt("공식 직원·조직도 페이지 주소를 붙여 넣으세요.");
    if (!sido || !local || !sourceUrl) return;
    setAdminKey(key);
    const response = await fetch("/api/admin/sources", { method: "POST", headers: { "content-type": "application/json", "x-admin-key": key }, body: JSON.stringify({ sido, local, sourceUrl }) });
    const data = (await response.json()) as { error?: string };
    setNotice(response.ok ? "공식 홈페이지 점검 목록에 추가했습니다." : (data.error ?? "주소 등록에 실패했습니다."));
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
      await navigator.clipboard.writeText(phone);
      setCopiedPhone(phone);
      window.setTimeout(() => setCopiedPhone((current) => current === phone ? "" : current), 1600);
    } catch {
      setNotice("번호 복사에 실패했습니다. 번호를 길게 눌러 직접 복사해 주세요.");
    }
  }

  return <main>
      <header><div><p className="eyebrow">LOCAL INCOME TAX DIRECTORY</p><h1>전국 지방소득세 담당자 연락처</h1><p className="lead">종합소득세와 관련된 담당 주무관 기준으로 전국 시·군·구 연락처를 한 곳에서 확인합니다.</p></div><button className="admin" onClick={isAdmin ? () => { setIsAdmin(false); setReviews([]); setNotice("관리자 모드를 종료했습니다."); } : authenticateAdmin}>{isAdmin ? "관리자 모드 종료" : "관리자"} {!isAdmin && <span>🔒</span>}</button></header>
    <section className="stats"><article><b>{contacts.length}</b><span>등록 연락처</span></article><article><b>{new Set(contacts.map((item) => item.sido)).size}</b><span>시도</span></article><article><b>256</b><span>시·군·구 지자체</span></article>{isAdmin && <article><b>{reviews.length}</b><span>검토 대기 변경</span></article>}</section>
    <section className="toolbar"><input aria-label="검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="시도, 시·군·구, 담당 업무 또는 번호 검색" /><select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select><button className="download" onClick={downloadCsv}>자료 내려받기</button></section>
    {notice && <p className="notice" role="status">{notice}</p>}
    <section className="panel"><div className="panelHead"><div><p className="eyebrow">DIRECT CONTACT DIRECTORY</p><h2>담당자 연락처</h2></div><p>{rows.length}건 표시</p></div><div className="table"><div className="tr th"><span>시도</span><span>자치구</span><span>담당 업무</span><span>직통번호</span><span>확인일</span><span>상태</span></div>{rows.map((item, index) => <div className="tr" key={`${item.sido}-${item.local}-${item.phone}-${index}`}><span>{item.sido}</span><strong>{item.local}</strong><span>{item.scope}</span><span className="phoneCell"><a href={`tel:${item.phone}`}>{item.phone}</a><button type="button" className="copyPhone" onClick={() => void copyPhone(item.phone)} aria-label={`${item.phone} 복사`}>{copiedPhone === item.phone ? "복사됨" : "복사"}</button></span><span>{item.checked}</span><i>{item.status}</i></div>)}</div></section>
    {isAdmin && <section className="review"><div><p className="eyebrow">ADMINISTRATION</p><h2>관리자 검토 및 자동화</h2><p>이 영역은 관리자 키 인증 후에만 보입니다. 승인한 변경만 공개 연락처에 반영됩니다.</p>{reviews.length > 0 && <details className="reviewList"><summary>검토 대상 {reviews.length}건 보기</summary><ul>{reviews.map((review) => <li key={review.id}><b>{review.sido} {review.local}</b> · {review.field}: {review.previous_value} → {review.source_url ? <a href={review.source_url} target="_blank" rel="noreferrer">공식 페이지 열기</a> : review.proposed_value}<button onClick={() => approveReview(review.id)}>승인</button></li>)}</ul></details>}</div><div className="reviewActions"><button onClick={initializeDatabase}>연락처 DB 시작하기</button><button onClick={importMoisSources}>행안부 주소 일괄 수집</button><button className="secondary" onClick={addSource}>공식 주소 직접 등록</button></div></section>}
  </main>;
}
