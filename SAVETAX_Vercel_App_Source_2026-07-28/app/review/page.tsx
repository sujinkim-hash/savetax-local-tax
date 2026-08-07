"use client";


import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import contactData from "../contacts.json";
import missingContactData from "../contacts-missing.json";


type Contact = { sido: string; local: string; checked: string; status: "확인" | "검토중" };
type Source = { id: number; sido: string; local: string; source_url: string; created_at: string };
type Review = { id: number; sido: string; local: string; field: string; previous_value: string; proposed_value: string; reason: string; source_url?: string; created_at: string };


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
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStatusFilter, setReviewStatusFilter] = useState<"registered" | "unregistered">("registered");
  const [reviewSearch, setReviewSearch] = useState("");


  useEffect(() => {
    void fetch("/api/sources", { cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()) as { sources?: Source[] } : { sources: [] })
      .then((data) => setSources(data.sources ?? []))
      .catch(() => setSources([]))
      .finally(() => setSourcesLoaded(true));
  }, []);


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
const reviewResponse = await fetch("/api/admin/reviews", { headers: { "x-admin-key": key } });
const reviewData = (await reviewResponse.json()) as { reviews?: Review[] };
if (reviewResponse.ok) setReviews(reviewData.reviews ?? []);
if (!silent) setNotice("관리자 인증이 완료되었습니다. 검토 대기 변경을 확인하고 공식 주소를 수정할 수 있습니다.");
return true;
}

async function authenticateAdmin(event?: FormEvent<HTMLFormElement>) {
event?.preventDefault();
const key = adminKeyDraft.trim();
if (!key) return;
const ok = await verifyAdminKey(key);
if (ok) { setAdminDialogOpen(false); setAdminKeyDraft(""); }
}

useEffect(() => {
const savedKey = window.localStorage.getItem("savetax_admin_key");
if (savedKey) void verifyAdminKey(savedKey, true);
}, []);


  async function approveReview(review: Review) {
    if (!adminKey) return;
    const response = await fetch("/api/admin/reviews/" + review.id + "/approve", { method: "POST", headers: { "x-admin-key": adminKey } });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) { setNotice(data.error ?? "변경 반영에 실패했습니다."); return; }
    setReviews((current) => current.filter((item) => item.id !== review.id));
    setNotice(review.sido + " " + review.local + " 변경 내용을 공개 연락처에 반영했습니다.");
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
  const registeredReviewKeys = useMemo(
    () => new Set(sources.map((source) => source.sido + "::" + source.local)),
    [sources],
  );
  const registeredReviews = reviews.filter((review) => registeredReviewKeys.has(review.sido + "::" + review.local));
  const unregisteredReviews = reviews.filter((review) => !registeredReviewKeys.has(review.sido + "::" + review.local));
  const visibleReviews = (reviewStatusFilter === "registered" ? registeredReviews : unregisteredReviews)
  .filter((review) => `${review.sido} ${review.local}`.toLowerCase().includes(reviewSearch.trim().toLowerCase()));

  const summary = areas.map((sido) => {
    const rows = contacts.filter((item) => item.sido === sido);
    const locals = new Set(rows.map((item) => item.local)).size;
    const pending = rows.filter((item) => item.status === "검토중").length;
    const checked = rows.map((item) => item.checked).sort().at(-1) ?? "-";
    return { sido, count: rows.length, locals, pending, checked };
  });


  return <main className="reviewShell">
    <aside className="sideRail reviewRail" aria-label="주요 메뉴">
      <div className="railBrand"><span>LOCAL TAX</span><strong>지방소득세<br />담당자 조회</strong></div>
      <nav><Link href="/">연락처 조회</Link><a className="active" href="#review-home">검토 현황</a><a href="#source-status">공식 주소 관리</a></nav>
      <p>종합소득세 관련<br />담당 주무관 연락처</p>
    </aside>
    <div className="reviewContent">
      <header className="reviewBanner" id="review-home">
        <div><p className="eyebrow">REVIEW & ADMINISTRATION</p><h1>검토·관리자 센터</h1><p className="lead">공식 주소와 담당 연락처의 변경 사항을 한 곳에서 검토하고 관리합니다.</p></div>
        <div className="reviewHeaderActions"><Link className="reviewLink" href="/">연락처 조회</Link><button type="button" className="headerAdminButton" onClick={() => isAdmin ? (setIsAdmin(false), setAdminKey(""), window.localStorage.removeItem("savetax_admin_key"), setNotice("관리자 모드를 종료했습니다.")) : setAdminDialogOpen(true)}>{isAdmin ? "관리자 종료" : "관리자 인증"}</button></div>
      </header>
      <div className="reviewWorkspace">
    <section className="reviewOverview"><article><b>{contacts.length}</b><span>등록 연락처</span></article><article><b>{areas.length}</b><span>검토 지역</span></article><article><b>{summary.reduce((total, item) => total + item.pending, 0)}</b><span>재검토 대상</span></article><article><b>{sourcesLoaded ? sources.length : "-"}</b><span>등록 공식 주소</span></article></section>
    <details className="reviewPanel sectionAccordion" onToggle={(event) => { if (event.currentTarget.open) window.setTimeout(() => event.currentTarget.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }}><summary className="panelHead"><div><p className="eyebrow">REGIONAL REVIEW</p><h2>시·도별 확인 상태</h2></div><p>지역을 선택하면 연락처 목록으로 돌아갈 수 있습니다.</p><i aria-hidden="true" /></summary><div className="regionalTable" role="table" aria-label="시도별 확인 상태"><div className="regionalTableHead" role="row"><span role="columnheader">시도</span><span role="columnheader">시·군·구</span><span role="columnheader">연락처</span><span role="columnheader">확인일</span><span role="columnheader">상태</span></div>{summary.map((item) => <Link href={"/?region=" + encodeURIComponent(item.sido)} className="regionalTableRow" key={item.sido} role="row"><b role="cell">{item.sido}</b><span role="cell">{item.locals}개</span><span role="cell">{item.count}건</span><span role="cell">{item.checked}</span><i role="cell" className={item.pending ? "pending" : "confirmed"}>{item.pending ? "재검토 " + item.pending + "건" : "확인 완료"}</i></Link>)}</div></details>
    <details className="reviewPanel sectionAccordion" onToggle={(event) => { if (event.currentTarget.open) window.setTimeout(() => event.currentTarget.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }}><summary className="panelHead"><div><p className="eyebrow">CHANGE REVIEW</p><h2>수정 내용 검토</h2></div><p>공식 주소와 담당 연락처의 변경 사항을 검토합니다.</p><i aria-hidden="true" /></summary><div className="changeReviewBody">{!isAdmin ? <button type="button" className="reviewAdminButton" onClick={() => setAdminDialogOpen(true)}>관리자 인증 후 변경 검토</button> : (registeredReviews.length + unregisteredReviews.length) > 0 ? <><div className="reviewStatusTabs" role="group" aria-label="검토 상태 선택"><button type="button" className={reviewStatusFilter === "registered" ? "active" : ""} onClick={() => setReviewStatusFilter("registered")}>등록 <span>{registeredReviews.length}</span></button><button type="button" className={reviewStatusFilter === "unregistered" ? "active" : ""} onClick={() => setReviewStatusFilter("unregistered")}>미등록 <span>{unregisteredReviews.length}</span></button></div><input type="text" className="reviewSearchInput" aria-label="지역 검색" placeholder="시·도 또는 시·군·구 검색" value={reviewSearch} onChange={(event) => setReviewSearch(event.target.value)} />{visibleReviews.length > 0 ? <ul className="changeReviewList">{visibleReviews.map((review) => <li key={review.id} className="reviewCandidateRow"><b>{review.sido} {review.local}</b><div className="changeReviewActions">{review.source_url && <a href={review.source_url} target="_blank" rel="noreferrer">공식 페이지 확인</a>}<button type="button" onClick={() => void approveReview(review)}>반영</button></div></li>)}</ul> : <p className="sourceReviewEmpty">{reviewStatusFilter === "registered" ? "등록 상태의 검토 항목이 없습니다." : "미등록 상태의 검토 항목이 없습니다."}</p>}</> : <p className="sourceReviewEmpty">현재 반영 대기 중인 수정 내용이 없습니다.</p>}</div></details>
    <details className="sourceReviewPanel sourceStatusAccordion" id="source-status" onToggle={(event) => { if (event.currentTarget.open) window.setTimeout(() => event.currentTarget.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }}>
      <summary className="sourceStatusSummary">
        <div>
          <p className="eyebrow">OFFICIAL SOURCES</p>
          <h2>공식 주소 등록 현황</h2>
        </div>
        <div className="sourceStatusSummaryMeta">
          <span>{sourcesLoaded ? `등록 ${sources.length}개` : "불러오는 중"}</span>
          <i aria-hidden="true" />
        </div>
      </summary>
      <div className="sourceStatusBody">
        <p className="sourceStatusGuide">시·도를 먼저 선택하면 해당 지자체의 공식 직원검색·조직도 주소를 확인할 수 있습니다.</p>
        <div className="sourceAdminBar">{isAdmin ? <><div className="adminModeStatus"><b>주소 관리 권한이 활성화되었습니다.</b><span>주소를 수정하거나 삭제할 수 있습니다.</span></div><button type="button" className="exitAdminMode" onClick={() => { setIsAdmin(false); setAdminKey(""); window.localStorage.removeItem("savetax_admin_key"); setNotice("관리자 모드를 종료했습니다."); }}>관리자 모드 종료</button></> : <button type="button" className="startAdminMode" onClick={() => setAdminDialogOpen(true)}>주소 수정 권한 인증</button>}</div>
        {notice && <p className="sourceNotice" role="status">{notice}</p>}
        {sourcesLoaded && sources.length > 0 ? <div className="sourceRegionGroups">{sourcesByArea.map((group) => <details className="sourceRegion" key={group.sido}><summary><span className="sourceRegionName">{group.sido}</span><span className="sourceRegionCount">{group.rows.length}개 지자체</span></summary><ul className="sourceReviewList">{group.rows.map((source) => <li key={source.id}><div className="sourceRowMeta"><b>{source.local}</b><span>등록일 {source.created_at.slice(0, 10)}</span></div><div className="sourceActions"><a href={source.source_url} target="_blank" rel="noreferrer">공식 페이지 열기</a>{isAdmin && <><button type="button" onClick={() => openSourceEditor(source)}>수정</button><button type="button" className="deleteSource" onClick={() => void deleteSource(source)}>삭제</button></>}</div></li>)}</ul></details>)}</div> : <p className="sourceReviewEmpty">{sourcesLoaded ? "아직 등록된 공식 주소가 없습니다." : "등록된 공식 주소를 불러오는 중입니다."}</p>}
      </div>
    </details>
    {adminDialogOpen && <div className="dialogBackdrop" role="presentation"><form className="dialog" onSubmit={authenticateAdmin}><h2>관리자 인증</h2><p>관리자 키를 입력하면 공식 주소를 바로 수정할 수 있습니다.</p><label htmlFor="review-admin-key">관리자 키</label><input id="review-admin-key" type="password" autoFocus value={adminKeyDraft} onChange={(event) => setAdminKeyDraft(event.target.value)} /><div className="dialogActions"><button type="button" className="dialogCancel" onClick={() => { setAdminDialogOpen(false); setAdminKeyDraft(""); }}>취소</button><button type="submit">인증</button></div></form></div>}
    {editingSource && <div className="dialogBackdrop" role="presentation"><form className="dialog" onSubmit={saveSource}><h2>공식 주소 수정</h2><p>지역 이름과 직원검색·조직도 주소를 함께 수정할 수 있습니다.</p><label htmlFor="source-edit-sido">시·도</label><input id="source-edit-sido" autoFocus required value={sourceSidoDraft} onChange={(event) => setSourceSidoDraft(event.target.value)} placeholder="예: 경기도" /><label htmlFor="source-edit-local">시·군·구</label><input id="source-edit-local" required value={sourceLocalDraft} onChange={(event) => setSourceLocalDraft(event.target.value)} placeholder="예: 성남시" /><label htmlFor="source-edit-url">공식 직원검색·조직도 주소</label><input id="source-edit-url" type="url" required value={sourceUrlDraft} onChange={(event) => setSourceUrlDraft(event.target.value)} placeholder="https://" /><div className="dialogActions"><button type="button" className="dialogCancel" onClick={() => { setEditingSource(null); setSourceUrlDraft(""); setSourceSidoDraft(""); setSourceLocalDraft(""); }}>취소</button><button type="submit">저장</button></div></form></div>}
      </div>
    </div>
  </main>;
}
