import { ensureSchema, requireAdmin } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const body = (await request.json()) as { sido?: string; local?: string; sourceUrl?: string };
  if (!body.sido || !body.local || !body.sourceUrl?.startsWith("http")) return Response.json({ error: "시도, 시·군·구, 올바른 공식 홈페이지 주소가 필요합니다." }, { status: 400 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  await sql`INSERT INTO source_pages (sido, local_name, source_url) VALUES (${body.sido}, ${body.local}, ${body.sourceUrl}) ON CONFLICT (source_url) DO NOTHING`;
  return Response.json({ ok: true });
}
