import { ensureSchema, requireAdmin } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const sql = await ensureSchema();
  if (!sql) return Response.json({ contacts: [] });
  const contacts = await sql`SELECT id, sido, local_name AS local, scope, phone, checked_on AS checked, status FROM contacts ORDER BY sido, local_name, phone`;
  return Response.json({ contacts });
}
export async function PATCH(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const body = (await request.json()) as { id?: number; phone?: string };
  const id = Number(body.id);
  const phone = body.phone?.trim();
  if (!Number.isFinite(id) || !phone) return Response.json({ error: "수정할 연락처와 직통번호가 필요합니다." }, { status: 400 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  const [contact] = await sql`UPDATE contacts SET phone = ${phone}, checked_on = TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'), status = '확인', updated_at = NOW() WHERE id = ${id} RETURNING id, sido, local_name AS local, scope, phone, checked_on AS checked, status`;
  if (!contact) return Response.json({ error: "연락처를 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ ok: true, contact });
}
