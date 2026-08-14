"use client";


import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import contactData from "../contacts.json";
import missingContactData from "../contacts-missing.json";
import officialHomepageData from "../mois-homepages.json";


type Contact = { id?: number; sido: string; local: string; scope: string; phone: string; checked: string; status: "확인" | "검토중" };
type Source = { id: number; sido: string; local: string; source_url: string; navigation_note?: string | null; created_at: string };
type Review = { id: number; sido: string; local: string; field: string; previous_value: string; proposed_value: string; reason: string; source_url?: string; created_at: string };



const fallbackContacts = [...(contactData as Contact[]), ...(missingContactData as Contact[])];
const fallbackOfficialHomepages = officialHomepageData as Source[];

function normalizeSidoName(value: string) {
  return value
    .replace("강원특별자치도", "강원도")
    .replace("전북특별자치도", "전라북도");
}

function normalizeLocalName(value: string) {
  return value.replace(/\s+/g, "").replace(/(특별자치시|특별시|광역시)$/, "");
}

function findOfficialHomepage(candidates: Source[], office: { sido: string; local: string }) {
  const sameRegion = candidates.filter((candidate) => normalizeSidoName(candidate.sido) === normalizeSidoName(office.sido));
  const exact = sameRegion.find((candidate) => candidate.local === office.local);
  if (exact) return exact;
  const officeName = normalizeLocalName(office.local);
  return sameRegion.find((candidate) => {
    const candidateName = normalizeLocalName(candidate.local);
    return officeName.startsWith(candidateName) || candidateName.startsWith(officeName);
  });
}


export default function ReviewPage() {
  const [contacts, setContacts] = useState<Contact[]>(fallbackContacts);
  const [sources, setSources] = useState<Source[]>([]);
  const [homepageCandidates, setHomepageCandidates] = useState<Source[]>(fallbackOfficialHomepages);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [adminKeyDraft, setAdminKeyDraft] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [reviewingOffice, setReviewingOffice] = useState<{ sido: string; local: string } | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactEditorReturnOffice, setContactEditorReturnOffice] = useState<{ sido: string; local: string } | null>(null);
  const [contactLocalDraft, setContactLocalDraft] = useState("");
  const [contactScopeDraft, setContactScopeDraft] = useState("");
  const [contactPhoneDraft, setContactPhoneDraft] = useState("");
  const [addingContact, setAddingContact] = useState(false);
  const [newContactSidoDraft, setNewContactSidoDraft] = useState("");
  const [newContactLocalDraft, setNewContactLocalDraft] = useState("");
  const [newContactScopeDraft, setNewContactScopeDraft] = useState("");
  const [newContactPhoneDraft, setNewContactPhoneDraft] = useState("");
  const [sourceUrlDraft, setSourceUrlDraft] = useState("");
  const [sourceSidoDraft, setSourceSidoDraft] = useState("");
  const [sourceLocalDraft, setSourceLocalDraft] = useState("");
  const [sourceNoteDraft, setSourceNoteDraft] = useState("");
  const [sourceExtraUrlDraft, setSourceExtraUrlDraft] = useState("");
  const [sourceExtraNoteDraft, setSourceExtraNoteDraft] = useState("");
  const [showExtraSource, setShowExtraSource] = useState(false);
  const [notice, setNotice] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStatusFilter, setReviewStatusFilter] = useState<"registered" | "unregistered">("registered");
  const [reviewSearch, setReviewSearch] = useState("");


  useEffect(() => {
    void fetch("/api/contacts", { cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()) as { contacts?: Contact[] } : { contacts: [] })
      .then((data) => { if (data.contacts?.length) setContacts(data.contacts); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch("/api/sources", { cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()) as { sources?: Source[] } : { sources: [] })
      .then((data) => setSources(data.sources ?? []))
      .catch(() => setSources([]))
      .finally(() => setSourcesLoaded(true));
  }, []);


  async function verifyAdminKey(key: string, silent?: boolean) {
const response = await fetch("/api/admin/sources?fast=1", { headers: { "x-admin-key": key } });
if (!response.ok) {
if (!silent) setNotice("관리자 키를 확인해 주세요.");
window.localStorage.removeItem("savetax_admin_key");
return false;
}
const sourceData = (await response.json()) as { candidates?: Source[] };
setHomepageCandidates(Array.from(new Map([...fallbackOfficialHomepages, ...(sourceData.candidates ?? [])].map((candidate) => [candidate.sido + "::" + candidate.local, candidate])).values()));
setAdminKey(key);
setIsAdmin(true);
window.localStorage.setItem("savetax_admin_key", key);
if (!silent) setNotice("관리자 인증이 완료되었습니다. 검토 목록을 불러오는 중입니다.");
void fetch("/api/admin/reviews", { headers: { "x-admin-key": key } })
  .then(async (reviewResponse) => reviewResponse.ok ? (await reviewResponse.json()) as { reviews?: Review[] } : { reviews: [] })
  .then((reviewData) => setReviews(reviewData.reviews ?? []))
  .catch(() => undefined);
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

  function openOfficeContacts(office: { sido: string; local: string }) {
    setReviewingOffice({ sido: office.sido, local: office.local });
  }

  function openReviewContactEdit(contact: Contact) {
    if (!contact.id) {
      setNotice("저장된 연락처만 수정할 수 있습니다. 먼저 연락처 DB 시작하기를 실행하세요.");
      return;
    }
    const officeToReturn = reviewingOffice;
    setReviewingOffice(null);
    setContactEditorReturnOffice(officeToReturn);
    setEditingContact(contact);
    setContactLocalDraft(contact.local);
    setContactScopeDraft(contact.scope);
    setContactPhoneDraft(contact.phone);
  }

  function openOfficeContactAdd(office: { sido: string; local: string }) {
    setReviewingOffice(null);
    setNewContactSidoDraft(office.sido);
    setNewContactLocalDraft(office.local);
    setNewContactScopeDraft("");
    setNewContactPhoneDraft("");
    setAddingContact(true);
  }

  async function saveContactPhone() {
    if (!editingContact?.id || !contactLocalDraft.trim() || !contactScopeDraft.trim() || !contactPhoneDraft.trim()) return;
    const response = await fetch("/api/contacts", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-admin-key": adminKey },
      body: JSON.stringify({
        id: editingContact.id,
        local: contactLocalDraft.trim(),
        scope: contactScopeDraft.trim(),
        phone: contactPhoneDraft.trim(),
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setNotice(data.error ?? "연락처 수정에 실패했습니다.");
      return;
    }
    const nextLocal = contactLocalDraft.trim();
    const nextScope = contactScopeDraft.trim();
    const nextPhone = contactPhoneDraft.trim();
    setContacts((current) => current.map((item) =>
      item.id === editingContact.id
        ? { ...item, local: nextLocal, scope: nextScope, phone: nextPhone, checked: new Date().toISOString().slice(0, 10), status: "확인" }
        : item,
    ));
    const officeToReturn = contactEditorReturnOffice;
    setEditingContact(null);
    setContactEditorReturnOffice(null);
    if (officeToReturn) setReviewingOffice(officeToReturn);
    setNotice("담당 지역·업무·직통번호를 수정했습니다.");
  }

    function openContactAdd() {
    setNewContactSidoDraft("");
    setNewContactLocalDraft("");
    setNewContactScopeDraft("");
    setNewContactPhoneDraft("");
    setAddingContact(true);
  }

  async function addContact() {
    if (!adminKey || !newContactSidoDraft.trim() || !newContactLocalDraft.trim() || !newContactScopeDraft.trim() || !newContactPhoneDraft.trim()) return;
    const response = await fetch("/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": adminKey },
      body: JSON.stringify({ sido: newContactSidoDraft.trim(), local: newContactLocalDraft.trim(), scope: newContactScopeDraft.trim(), phone: newContactPhoneDraft.trim() }),
    });
    const data = (await response.json()) as { contact?: Contact; error?: string };
    if (!response.ok || !data.contact) { setNotice(data.error ?? "연락처 추가에 실패했습니다."); return; }
    setContacts((current) => {
      const exists = current.some((item) => item.id === data.contact?.id || (item.sido === data.contact?.sido && item.local === data.contact?.local && item.scope === data.contact?.scope && item.phone === data.contact?.phone));
      return exists ? current.map((item) => item.id === data.contact?.id ? data.contact! : item) : [...current, data.contact!];
    });
    setAddingContact(false);
    setNotice("연락처를 추가했습니다. 연락처 조회에서도 바로 확인할 수 있습니다.");
  }

  function openSourceEditor(source: Source) {
    setEditingSource(source);
    setSourceUrlDraft(source.source_url);
    setSourceSidoDraft(source.sido);
    setSourceLocalDraft(source.local);
    setSourceNoteDraft(source.navigation_note ?? "");
    setSourceExtraUrlDraft("");
    setSourceExtraNoteDraft("");
    setShowExtraSource(false);
  }


  async function saveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingSource || !adminKey || !sourceSidoDraft.trim() || !sourceLocalDraft.trim() || (!sourceUrlDraft.trim() && !sourceNoteDraft.trim())) return;
    const response = await fetch("/api/admin/sources", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": adminKey },
      body: JSON.stringify({ id: editingSource.id || undefined, sido: sourceSidoDraft.trim(), local: sourceLocalDraft.trim(), navigationNote: sourceNoteDraft.trim(), noteOnly: !sourceUrlDraft.trim(), sourceUrls: sourceUrlDraft.trim() ? [{ sourceUrl: sourceUrlDraft.trim(), navigationNote: sourceNoteDraft.trim() }, ...(editingSource.id ? [] : sourceExtraUrlDraft.trim() ? [{ sourceUrl: sourceExtraUrlDraft.trim(), navigationNote: sourceExtraNoteDraft.trim() }] : [])] : [] }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setNotice(data.error ?? "공식 주소 수정에 실패했습니다.");
      return;
    }
    setEditingSource(null);
    setSourceUrlDraft("");
    setSourceNoteDraft("");
    setSourceExtraUrlDraft("");
    setSourceExtraNoteDraft("");
    setShowExtraSource(false);
    setNotice(`${sourceSidoDraft.trim()} ${sourceLocalDraft.trim()} 공식 주소를 ${editingSource.id ? "수정" : "등록"}했습니다.`);
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
  const officeRows = useMemo(() => {
    const sourceMap = new Map(sources.map((source) => [source.sido + "::" + source.local, source]));
    const offices = new Map<string, { sido: string; local: string; source?: Source }>();
    contacts.forEach((contact) => {
      const key = contact.sido + "::" + contact.local;
      if (!offices.has(key)) offices.set(key, { sido: contact.sido, local: contact.local, source: sourceMap.get(key) });
    });
    return Array.from(offices.values()).sort((left, right) => (left.sido + left.local).localeCompare(right.sido + right.local, "ko"));
  }, [contacts, sources]);
  const homepageCandidateByOffice = useMemo(() => new Map(homepageCandidates.map((source) => [source.sido + "::" + source.local, source])), [homepageCandidates]);
  const reviewingContacts = useMemo(() => reviewingOffice ? contacts.filter((contact) => contact.sido === reviewingOffice.sido && contact.local === reviewingOffice.local).sort((left, right) => left.phone.localeCompare(right.phone, "ko", { numeric: true })) : [], [contacts, reviewingOffice]);
  const registeredOffices = officeRows.filter((office) => office.source);
  const unregisteredOffices = officeRows.filter((office) => !office.source);
  const visibleOffices = (reviewStatusFilter === "registered" ? registeredOffices : unregisteredOffices)
    .filter((office) => [office.sido, office.local].join(" ").toLowerCase().includes(reviewSearch.trim().toLowerCase()));
  const officeGroups = Array.from(new Set(visibleOffices.map((office) => office.sido)))
    .sort((left, right) => left.localeCompare(right, "ko"))
    .map((sido) => ({ sido, rows: visibleOffices.filter((office) => office.sido === sido) }));

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
      <nav><Link href="/">연락처 조회</Link><a className="active" href="#review-home">검토 현황</a><Link href="/sources">공식 주소 관리</Link></nav>
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
    <details className="reviewPanel sectionAccordion" onToggle={(event) => { if (event.currentTarget.open) window.setTimeout(() => event.currentTarget.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }}><summary className="panelHead"><div><p className="eyebrow">CHANGE REVIEW</p><h2>수정 내용 검토</h2></div><p>공식 주소와 담당 연락처의 변경 사항을 검토합니다.</p><i aria-hidden="true" /></summary><div className="changeReviewBody">{isAdmin && <button type="button" className="reviewAddContactButton" onClick={openContactAdd}>+ 연락처 추가</button>}{!isAdmin ? <button type="button" className="reviewAdminButton" onClick={() => setAdminDialogOpen(true)}>관리자 인증 후 변경 검토</button> : (registeredOffices.length + unregisteredOffices.length) > 0 ? <><div className="reviewStatusTabs" role="group" aria-label="검토 상태 선택"><button type="button" className={reviewStatusFilter === "registered" ? "active" : ""} onClick={() => setReviewStatusFilter("registered")}>등록 <span>{registeredOffices.length}</span></button><button type="button" className={reviewStatusFilter === "unregistered" ? "active" : ""} onClick={() => setReviewStatusFilter("unregistered")}>미등록 <span>{unregisteredOffices.length}</span></button></div><input type="text" className="reviewSearchInput" aria-label="지역 검색" placeholder="시·도 또는 시·군·구 검색" value={reviewSearch} onChange={(event) => setReviewSearch(event.target.value)} />{visibleOffices.length > 0 ? <div className="reviewRegionGroups">{officeGroups.map((group) => <details className="reviewRegion" key={group.sido}><summary><span className="reviewRegionName">{group.sido}</span><span className="reviewRegionCount">{group.rows.length}건</span></summary><ul className="changeReviewList">{group.rows.map((office) => { const homepageCandidate = homepageCandidateByOffice.get(office.sido + "::" + office.local) ?? findOfficialHomepage(homepageCandidates, office); return <li key={office.sido + office.local} className="reviewCandidateRow"><b>{office.local}</b><div className="changeReviewActions">{reviewStatusFilter === "registered" ? <><a href={office.source?.source_url} target="_blank" rel="noreferrer">홈페이지</a><button type="button" className="reviewContactAction" onClick={() => openOfficeContacts(office)}>연락처 확인·수정</button><button type="button" onClick={() => office.source && openSourceEditor(office.source)}>주소 수정</button></> : <>{homepageCandidate && <a href={homepageCandidate.source_url} target="_blank" rel="noreferrer">공식 페이지 확인</a>}<button type="button" className="reviewContactAction" onClick={() => openOfficeContacts(office)}>연락처 확인·수정</button><button type="button" onClick={() => openSourceEditor({ id: 0, sido: office.sido, local: office.local, source_url: "" })}>주소 등록</button></>}</div></li>; })}</ul></details>)}</div> : <p className="sourceReviewEmpty">{reviewStatusFilter === "registered" ? "등록 상태의 검토 항목이 없습니다." : "미등록 상태의 검토 항목이 없습니다."}</p>}</> : <p className="sourceReviewEmpty">현재 반영 대기 중인 수정 내용이 없습니다.</p>}</div></details>
    
    {adminDialogOpen && <div className="dialogBackdrop" role="presentation"><form className="dialog" onSubmit={authenticateAdmin}><h2>관리자 인증</h2><p>관리자 키를 입력하면 공식 주소를 바로 수정할 수 있습니다.</p><label htmlFor="review-admin-key">관리자 키</label><input id="review-admin-key" type="password" autoFocus value={adminKeyDraft} onChange={(event) => setAdminKeyDraft(event.target.value)} /><div className="dialogActions"><button type="button" className="dialogCancel" onClick={() => { setAdminDialogOpen(false); setAdminKeyDraft(""); }}>취소</button><button type="submit">인증</button></div></form></div>}
    {addingContact && <div className="dialogBackdrop" role="presentation"><form className="dialog" onSubmit={(event) => { event.preventDefault(); void addContact(); }}><h2>담당자 연락처 추가</h2><p>종합소득세 관련 담당 주무관의 지역·업무·직통번호를 입력하세요.</p><label htmlFor="review-new-contact-sido">시·도</label><input id="review-new-contact-sido" autoFocus required value={newContactSidoDraft} onChange={(event) => setNewContactSidoDraft(event.target.value)} placeholder="예: 경기도" /><label htmlFor="review-new-contact-local">시·군·구</label><input id="review-new-contact-local" required value={newContactLocalDraft} onChange={(event) => setNewContactLocalDraft(event.target.value)} placeholder="예: 안양시 동안구" /><label htmlFor="review-new-contact-scope">담당 업무·구역</label><textarea id="review-new-contact-scope" required value={newContactScopeDraft} onChange={(event) => setNewContactScopeDraft(event.target.value)} placeholder="예: 지방소득세(종합소득·평촌동)" /><label htmlFor="review-new-contact-phone">직통번호</label><input id="review-new-contact-phone" type="tel" required value={newContactPhoneDraft} onChange={(event) => setNewContactPhoneDraft(event.target.value)} placeholder="예: 031-0000-0000" /><div className="dialogActions"><button type="button" className="dialogCancel" onClick={() => setAddingContact(false)}>취소</button><button type="submit">추가</button></div></form></div>}
    {reviewingOffice && <div className="dialogBackdrop" role="presentation">
      <section className="dialog officeContactReviewDialog" role="dialog" aria-modal="true" aria-label="담당자 연락처 확인 및 수정">
        <div className="officeContactReviewHead">
          <div><p className="eyebrow">CONTACT REVIEW</p><h2>{reviewingOffice.sido} {reviewingOffice.local} 담당자 연락처</h2><p>공식 페이지를 확인한 뒤 담당 지역·업무·직통번호를 바로 수정할 수 있습니다.</p></div>
          
        </div>
        {reviewingContacts.length > 0 ? <div className="officeContactRows">
          {reviewingContacts.map((contact) => <article key={contact.id ?? contact.sido + contact.local + contact.phone} className="officeContactRow">
            <div><strong>{contact.scope}</strong><span>직통번호 {contact.phone}</span></div>
            <button type="button" className="reviewContactEditButton" onClick={() => openReviewContactEdit(contact)}>수정</button>
          </article>)}
        </div> : <p className="officeContactEmpty">이 지역에 등록된 담당 연락처가 없습니다. 아래 버튼으로 바로 추가할 수 있습니다.</p>}
        <div className="dialogActions officeContactReviewActions"><button type="button" className="dialogCancel" onClick={() => openOfficeContactAdd(reviewingOffice)}>+ 연락처 추가</button><button type="button" onClick={() => setReviewingOffice(null)}>닫기</button></div>
      </section>
    </div>}
    {editingContact && <div className="dialogBackdrop" role="presentation"><form className="dialog" onSubmit={(event) => { event.preventDefault(); void saveContactPhone(); }}><h2>담당자 연락처 수정</h2><p>담당 구역이 바뀐 경우 자치구와 담당 업무를 함께 수정하세요.</p><label htmlFor="review-contact-local">자치구·담당 지역</label><input id="review-contact-local" autoFocus required value={contactLocalDraft} onChange={(event) => setContactLocalDraft(event.target.value)} placeholder="예: 시흥시" /><label htmlFor="review-contact-scope">담당 업무·구역</label><textarea id="review-contact-scope" required value={contactScopeDraft} onChange={(event) => setContactScopeDraft(event.target.value)} placeholder="예: 지방소득세(종합소득분) · 정왕동, 배곧동" /><label htmlFor="review-contact-phone">직통번호</label><input id="review-contact-phone" type="tel" required value={contactPhoneDraft} onChange={(event) => setContactPhoneDraft(event.target.value)} placeholder="예: 02-0000-0000" /><div className="dialogActions">{contactEditorReturnOffice && <button type="button" className="dialogCancel" onClick={() => { setEditingContact(null); setReviewingOffice(contactEditorReturnOffice); setContactEditorReturnOffice(null); }}>뒤로가기</button>}<button type="button" className="dialogCancel" onClick={() => { setEditingContact(null); setContactEditorReturnOffice(null); }}>취소</button><button type="submit">저장</button></div></form></div>}
        {editingSource && <div className="dialogBackdrop" role="presentation"><form className="dialog" onSubmit={saveSource}><h2>{editingSource.id ? "공식 주소 수정" : "공식 주소 등록"}</h2><p>{editingSource.id ? "지역 이름과 직원검색·조직도 주소를 함께 수정할 수 있습니다." : "조직도 정비 중이면 주소 없이 확인 메모만 저장할 수 있습니다."}</p><label htmlFor="source-edit-sido">시·도</label><input id="source-edit-sido" required readOnly={editingSource.id === 0} value={sourceSidoDraft} onChange={(event) => setSourceSidoDraft(event.target.value)} placeholder="예: 경기도" /><label htmlFor="source-edit-local">시·군·구</label><input id="source-edit-local" required readOnly={editingSource.id === 0} value={sourceLocalDraft} onChange={(event) => setSourceLocalDraft(event.target.value)} placeholder="예: 성남시" /><label htmlFor="source-edit-url">공식 직원검색·조직도 주소 <small>(선택)</small></label><input id="source-edit-url" type="url" autoFocus value={sourceUrlDraft} onChange={(event) => setSourceUrlDraft(event.target.value)} placeholder="https://" /><label htmlFor="source-edit-note">확인 경로 메모 <small>(선택)</small></label><textarea id="source-edit-note" value={sourceNoteDraft} onChange={(event) => setSourceNoteDraft(event.target.value)} placeholder="예: 세무2과 선택 후 지방소득세(종합소득) 담당자 확인" />{!editingSource.id && (!showExtraSource ? <button type="button" className="addSourceButton" onClick={() => setShowExtraSource(true)}>+ 추가 공식 주소</button> : <div className="additionalSourceFields"><div className="additionalSourceHead"><strong>추가 공식 주소</strong><button type="button" onClick={() => { setShowExtraSource(false); setSourceExtraUrlDraft(""); setSourceExtraNoteDraft(""); }}>삭제</button></div><label htmlFor="source-edit-extra-url">공식 직원검색·조직도 주소 <small>(두 번째)</small></label><input id="source-edit-extra-url" type="url" value={sourceExtraUrlDraft} onChange={(event) => setSourceExtraUrlDraft(event.target.value)} placeholder="https://" /><label htmlFor="source-edit-extra-note">확인 경로 메모 <small>(선택)</small></label><textarea id="source-edit-extra-note" value={sourceExtraNoteDraft} onChange={(event) => setSourceExtraNoteDraft(event.target.value)} placeholder="두 번째 주소의 확인 경로를 적어주세요" /></div>)}<div className="dialogActions"><button type="button" className="dialogCancel" onClick={() => { setEditingSource(null); setSourceUrlDraft(""); setSourceSidoDraft(""); setSourceLocalDraft(""); setSourceNoteDraft(""); setSourceExtraUrlDraft(""); setSourceExtraNoteDraft(""); setShowExtraSource(false); }}>취소</button><button type="submit">{editingSource.id ? "저장" : "등록"}</button></div></form></div>}
      </div>
    </div>
  </main>;
}
