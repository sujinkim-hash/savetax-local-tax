import { ensureSchema, requireAdmin } from "@/lib/db";
export const dynamic = "force-dynamic";

async function syncSourceReviews(sql: NonNullable<Awaited<ReturnType<typeof ensureSchema>>>) {
  // 기존 주소 검토 이력을 현재의 등록 상태 표현으로 보정합니다.
  await sql`UPDATE review_candidates
    SET field = '공식 주소',
        previous_value = '미등록',
        proposed_value = '등록',
        reason = '등록된 공식 직원검색·조직도 주소입니다. 주소와 지자체를 확인한 뒤 반영하세요.'
    WHERE field = '공식 홈페이지' AND source_url IS NOT NULL`;

  await sql`INSERT INTO review_candidates (contact_id, sido, local_name, field, previous_value, proposed_value, reason, source_url, status)
    SELECT NULL, s.sido, s.local_name, '공식 주소', '미등록', '등록',
      '등록된 공식 직원검색·조직도 주소입니다. 주소와 지자체를 확인한 뒤 반영하세요.', s.source_url, 'pending'
    FROM source_pages s
    WHERE NOT EXISTS (
      SELECT 1 FROM review_candidates r
      WHERE r.sido = s.sido AND r.local_name = s.local_name
        AND r.field = '공식 주소' AND r.source_url = s.source_url
    )`;
}

export async function GET(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  await syncSourceReviews(sql);
  const sources = await sql`SELECT id, sido, local_name AS local, source_url, created_at FROM source_pages ORDER BY created_at DESC LIMIT 8`;
  return Response.json({ sources });
}

export async function POST(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const body = (await request.json()) as { id?: number; sido?: string; local?: string; sourceUrl?: string };
  if (!body.sido || !body.local || !body.sourceUrl?.startsWith("http")) return Response.json({ error: "시도, 시·군·구, 올바른 공식 홈페이지 주소가 필요합니다." }, { status: 400 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  if (body.id) await sql`DELETE FROM source_pages WHERE id = ${body.id}`;
  await sql`DELETE FROM source_pages WHERE sido = ${body.sido} AND local_name = ${body.local}`;
  await sql`DELETE FROM review_candidates
    WHERE sido = ${body.sido} AND local_name = ${body.local}
      AND field IN ('공식 홈페이지', '공식 주소') AND status = 'pending'`;
  const [source] = await sql`INSERT INTO source_pages (sido, local_name, source_url, is_active) VALUES (${body.sido}, ${body.local}, ${body.sourceUrl}, TRUE) RETURNING id, sido, local_name AS local, source_url, created_at`;
  await sql`INSERT INTO review_candidates (contact_id, sido, local_name, field, previous_value, proposed_value, reason, source_url, status)
    VALUES (NULL, ${body.sido}, ${body.local}, '공식 주소', '미등록', '등록', '관리자가 등록한 공식 직원검색·조직도 주소입니다. 주소와 지자체를 확인한 뒤 반영하세요.', ${body.sourceUrl}, 'pending')`;
  return Response.json({ ok: true, source });
}

export async function DELETE(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const body = (await request.json()) as { id?: number };
  if (!body.id) return Response.json({ error: "삭제할 공식 주소를 찾을 수 없습니다." }, { status: 400 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  const [source] = await sql`SELECT sido, local_name AS local, source_url FROM source_pages WHERE id = ${body.id}`;
  if (source) await sql`DELETE FROM review_candidates
    WHERE sido = ${source.sido} AND local_name = ${source.local}
      AND field IN ('공식 홈페이지', '공식 주소')
      AND source_url = ${source.source_url} AND status = 'pending'`;
  await sql`DELETE FROM source_pages WHERE id = ${body.id}`;
  return Response.json({ ok: true });
}
