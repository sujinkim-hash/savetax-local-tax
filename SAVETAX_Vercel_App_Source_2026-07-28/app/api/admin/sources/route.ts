import { ensureSchema, requireAdmin } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  const sources = await sql`SELECT id, sido, local_name AS local, source_url, created_at FROM source_pages ORDER BY created_at DESC LIMIT 8`;
  return Response.json({ sources });
}

export async function POST(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const body = (await request.json()) as { id?: number; sido?: string; local?: string; sourceUrl?: string };
  if (!body.sido || !body.local || !body.sourceUrl?.startsWith("http")) return Response.json({ error: "시도, 시·군·구, 올바른 공식 홈페이지 주소가 필요합니다." }, { status: 400 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  // 수정할 때는 기존 항목을 먼저 지우고, 같은 새 지역명이 있으면 하나로 합칩니다.
  if (body.id) await sql`DELETE FROM source_pages WHERE id = ${body.id}`;
  await sql`DELETE FROM source_pages WHERE sido = ${body.sido} AND local_name = ${body.local}`;
  const [source] = await sql`
    INSERT INTO source_pages (sido, local_name, source_url, is_active)
    VALUES (${body.sido}, ${body.local}, ${body.sourceUrl}, TRUE)
    RETURNING id, sido, local_name AS local, source_url, created_at
  `;
  return Response.json({ ok: true, source });
}

export async function DELETE(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const body = (await request.json()) as { id?: number };
  if (!body.id) return Response.json({ error: "삭제할 공식 주소를 찾을 수 없습니다." }, { status: 400 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  await sql`DELETE FROM source_pages WHERE id = ${body.id}`;
  return Response.json({ ok: true });
}
