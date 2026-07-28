"use client";

import { useMemo, useState } from "react";
import "./globals.css";
import contactData from "./contacts.json";

type Contact = { sido: string; local: string; scope: string; phone: string; checked: string; status: "확인" | "검토필요" };

const contacts = contactData as Contact[];

export default function Home() {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("전체");
  const rows = useMemo(() => contacts.filter((x) => (region === "전체" || x.sido === region) && `${x.sido} ${x.local} ${x.scope} ${x.phone}`.includes(query)), [query, region]);
  const regions = ["전체", ...Array.from(new Set(contacts.map((x) => x.sido)))];
  return <main>
    <header><div><p className="eyebrow">SAVETAX · LOCAL INCOME TAX</p><h1>전국 지방소득세<br/>담당 연락처</h1><p className="lead">종합소득세 관련 담당 주무관 기준의 전국 시·군·구 연락처를 한 곳에서 확인합니다.</p></div><button className="admin">관리자 검토함 <span>3</span></button></header>
    <section className="stats"><article><b>{contacts.length}</b><span>등록 연락처</span></article><article><b>{new Set(contacts.map((x)=>x.sido)).size}</b><span>시·도</span></article><article><b>256</b><span>점검 대상 지자체</span></article><article><b>3</b><span>승인 대기 변경</span></article></section>
    <section className="toolbar"><input aria-label="검색" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="시·도, 시군구, 담당업무 또는 번호 검색"/><select value={region} onChange={(e)=>setRegion(e.target.value)}>{regions.map((x)=><option key={x}>{x}</option>)}</select><button className="download">엑셀 내려받기</button></section>
    <section className="panel"><div className="panelHead"><div><p className="eyebrow">DIRECT CONTACT DIRECTORY</p><h2>담당자 연락처</h2></div><p>{rows.length}건 표시</p></div><div className="table"><div className="tr th"><span>시·도</span><span>자치구</span><span>담당 업무</span><span>직통번호</span><span>확인일</span><span>상태</span></div>{rows.map((x)=><div className="tr" key={x.phone}><span>{x.sido}</span><strong>{x.local}</strong><span>{x.scope}</span><a href={`tel:${x.phone}`}>{x.phone}</a><span>{x.checked}</span><i>{x.status}</i></div>)}</div></section>
    <section className="review"><div><p className="eyebrow">CHANGE REVIEW</p><h2>최근 변경 후보</h2><p>공식 조직도에서 감지한 번호는 관리자 승인 전까지 기존 DB를 변경하지 않습니다.</p></div><button>검토함 열기 →</button></section>
  </main>;
}
