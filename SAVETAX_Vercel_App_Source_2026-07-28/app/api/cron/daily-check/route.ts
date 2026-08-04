import { ensureSchema } from "@/lib/db";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function pageText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200_000);
}

async function pageHash(html: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pageText(html)));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const run = await sql`INSERT INTO review_runs (note) VALUES ('일일 공식 홈페이지 연결 점검') RETURNING id`;
  const sources = await sql`SELECT id, sido, local_name, source_url, content_hash FROM source_pages WHERE is_active = TRUE ORDER BY last_checked_at NULLS FIRST LIMIT 20`;
  let checkedCount = 0;
  for (const source of sources) {
    checkedCount += 1;
    let result = "ok";
    try {
      const response = await fetch(source.source_url, { redirect: "follow", signal: AbortSignal.timeout(8000) });
      result = response.ok ? `ok:${response.status}` : `error:${response.status}`;
      if (response.ok) {
        const currentHash = await pageHash(await response.text());
        // 첫 방문은 비교 기준만 저장합니다. 다음 방문부터 실제 페이지 변화만 검토 대상으로 만듭니다.
        if (source.content_hash && source.content_hash !== currentHash) {
          const pending = await sql`SELECT id FROM review_candidates WHERE status = 'pending' AND field = '공식 페이지 내용' AND source_url = ${source.source_url} LIMIT 1`;
          if (!pending.length) await sql`
            INSERT INTO review_candidates (sido, local_name, field, previous_value, proposed_value, reason, source_url)
            VALUES (${source.sido}, ${source.local_name}, '공식 페이지 내용', '기준 페이지 내용', '내용 변경 감지', '자동 점검에서 공식 직원검색·조직도 페이지의 텍스트 내용이 변경되었습니다. 종합소득세 담당자·직통번호 변경 여부를 확인해 주세요.', ${source.source_url})
          `;
        }
        await sql`UPDATE source_pages SET content_hash = ${currentHash}, content_checked_at = NOW() WHERE id = ${source.id}`;
      }
    } catch { result = "error:unreachable"; }
    await sql`UPDATE source_pages SET last_checked_at = NOW(), last_result = ${result} WHERE id = ${source.id}`;
    if (result.startsWith("error:")) {
      const pending = await sql`SELECT id FROM review_candidates WHERE status = 'pending' AND field = '공식 홈페이지' AND source_url = ${source.source_url} LIMIT 1`;
      if (!pending.length) await sql`INSERT INTO review_candidates (sido, local_name, field, previous_value, proposed_value, reason, source_url) VALUES (${source.sido}, ${source.local_name}, '공식 홈페이지', '정상 확인 필요', ${result}, '자동 점검에서 공식 홈페이지 응답을 확인하지 못했습니다.', ${source.source_url})`;
    }
  }
  await sql`UPDATE review_runs SET finished_at = NOW(), checked_count = ${checkedCount} WHERE id = ${run[0].id}`;
  return Response.json({ ok: true, checkedCount });
}
