import { ensureSchema, requireAdmin } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다. ADMIN_KEY를 확인하세요." }, { status: 401 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  const reviews = await sql`SELECT id, sido, local_name AS local, field, previous_value, proposed_value, reason, source_url, created_at FROM review_candidates WHERE status = 'pending' ORDER BY created_at DESC`;
  return Response.json({ reviews });
}
