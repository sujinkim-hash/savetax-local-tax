import Link from "next/link";
import contactData from "../contacts.json";
import missingContactData from "../contacts-missing.json";

type Contact = { sido: string; local: string; checked: string; status: "확인" | "검토중" };

const contacts = [...(contactData as Contact[]), ...(missingContactData as Contact[])];

export default function ReviewPage() {
  const areas = Array.from(new Set(contacts.map((item) => item.sido))).sort((a, b) => a.localeCompare(b, "ko"));
  const summary = areas.map((sido) => {
    const rows = contacts.filter((item) => item.sido === sido);
    const locals = new Set(rows.map((item) => item.local)).size;
    const pending = rows.filter((item) => item.status === "검토중").length;
    const checked = rows.map((item) => item.checked).sort().at(-1) ?? "-";
    return { sido, count: rows.length, locals, pending, checked };
  });

  return <main>
    <header className="pageHeader">
      <div><p className="eyebrow">REVIEW STATUS</p><h1>지역별 검토 현황</h1><p className="lead">공식 지자체 홈페이지 기준으로 확인한 연락처의 검토 상태와 기준일을 확인합니다.</p></div>
      <Link className="backLink" href="/">연락처 목록으로</Link>
    </header>
    <section className="reviewOverview"><article><b>{contacts.length}</b><span>등록 연락처</span></article><article><b>{areas.length}</b><span>검토 지역</span></article><article><b>{summary.reduce((total, item) => total + item.pending, 0)}</b><span>재검토 대상</span></article></section>
    <section className="reviewPanel"><div className="panelHead"><div><p className="eyebrow">REGIONAL REVIEW</p><h2>시·도별 확인 상태</h2></div><p>지역을 선택하면 연락처 목록으로 돌아갈 수 있습니다.</p></div><div className="reviewGrid">{summary.map((item) => <Link href={`/?region=${encodeURIComponent(item.sido)}`} className="reviewCard" key={item.sido}><div><b>{item.sido}</b><span>{item.locals}개 시·군·구 · {item.count}건</span></div><div><strong>{item.checked}</strong><i className={item.pending ? "pending" : "confirmed"}>{item.pending ? `재검토 ${item.pending}건` : "확인 완료"}</i></div></Link>)}</div></section>
  </main>;
}
