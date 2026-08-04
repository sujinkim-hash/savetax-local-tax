import { ensureSchema } from "@/lib/db";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const run = await sql`INSERT INTO review_runs (note) VALUES ('일일 공식 홈페이지 연결 점검') RETURNING id`;
  const sources = await sql`SELECT id, sido, local_name, source_url FROM source_pages WHERE is_active = TRUE ORDER BY last_checked_at NULLS FIRST LIMIT 20`;
  let checkedCount = 0;
  for (const source of sources) {
    checkedCount += 1;
    let result = "ok";
    try { const response = await fetch(source.source_url, { redirect: "follow", signal: AbortSignal.timeout(8000) }); result = response.ok ? `ok:${response.status}` : `error:${response.status}`; } catch { result = "error:unreachable"; }
    await sql`UPDATE source_pages SET last_checked_at = NOW(), last_result = ${result} WHERE id = ${source.id}`;
    if (result.startsWith("error:")) await sql`INSERT INTO review_candidates (sido, local_name, field, previous_value, proposed_value, reason, source_url) VALUES (${source.sido}, ${source.local_name}, '공식 홈페이지', '정상 확인 필요', ${result}, '자동 점검에서 공식 홈페이지 응답을 확인하지 못했습니다.', ${source.source_url})`;
  }
  await sql`UPDATE review_runs SET finished_at = NOW(), checked_count = ${checkedCount} WHERE id = ${run[0].id}`;
  return Response.json({ ok: true, checkedCount });
}
