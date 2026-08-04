"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import contactData from "../contacts.json";
import missingContactData from "../contacts-missing.json";

type Contact = { sido: string; local: string; checked: string; status: "확인" | "검토중" };
type Source = { id: number; sido: string; local: string; source_url: string; created_at: string };

const contacts = [...(contactData as Contact[]), ...(missingContactData as Contact[])];

export default function ReviewPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);

  useEffect(() => {
    void fetch("/api/sources", { cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()) as { sources?: Source[] } : { sources: [] })
      .then((data) => setSources(data.sources ?? []))
      .catch(() => setSources([]))
      .finally(() => setSourcesLoaded(true));
  }, []);

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
    <header className="pageHeader">
      <div><p className="eyebrow">REVIEW STATUS</p><h1>지역별 검토 현황</h1><p className="lead">공식 지자체 홈페이지 기준으로 확인한 연락처의 검토 상태와 기준일을 확인합니다.</p></div>
      <Link className="backLink" href="/">연락처 목록으로</Link>
    </header>
    <section className="reviewOverview"><article><b>{contacts.length}</b><span>등록 연락처</span></article><article><b>{areas.length}</b><span>검토 지역</span></article><article><b>{summary.reduce((total, item) => total + item.pending, 0)}</b><span>재검토 대상</span></article><article><b>{sourcesLoaded ? sources.length : "-"}</b><span>등록 공식 주소</span></article></section>
    <section className="reviewPanel"><div className="panelHead"><div><p className="eyebrow">REGIONAL REVIEW</p><h2>시·도별 확인 상태</h2></div><p>지역을 선택하면 연락처 목록으로 돌아갈 수 있습니다.</p></div><div className="reviewGrid">{summary.map((item) => <Link href={`/?region=${encodeURIComponent(item.sido)}`} className="reviewCard" key={item.sido}><div><b>{item.sido}</b><span>{item.locals}개 시·군·구 · {item.count}건</span></div><div><strong>{item.checked}</strong><i className={item.pending ? "pending" : "confirmed"}>{item.pending ? `재검토 ${item.pending}건` : "확인 완료"}</i></div></Link>)}</div></section>
    <section className="sourceReviewPanel"><div className="panelHead"><div><p className="eyebrow">OFFICIAL SOURCES</p><h2>공식 주소 등록 현황</h2></div><p>시·도별로 모아둔 지자체 직원검색·조직도 주소입니다.</p></div>{sourcesLoaded && sources.length > 0 ? <div className="sourceRegionGroups">{sourcesByArea.map((group) => <section className="sourceRegion" key={group.sido}><h3>{group.sido}<span>{group.rows.length}건</span></h3><ul className="sourceReviewList">{group.rows.map((source) => <li key={source.id}><div><b>{source.local}</b><span>등록일 {source.created_at.slice(0, 10)}</span></div><a href={source.source_url} target="_blank" rel="noreferrer">공식 페이지 열기</a></li>)}</ul></section>)}</div> : <p className="sourceReviewEmpty">{sourcesLoaded ? "아직 등록된 공식 주소가 없습니다." : "등록된 공식 주소를 불러오는 중입니다."}</p>}</section>
  </main>;
}

