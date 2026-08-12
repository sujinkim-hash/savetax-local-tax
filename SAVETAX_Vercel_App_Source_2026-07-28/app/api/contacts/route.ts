import { ensureSchema, requireAdmin } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const sql = await ensureSchema();
  if (!sql) return Response.json({ contacts: [] });
  const contacts = await sql`SELECT id, sido, local_name AS local, scope, phone, checked_on AS checked, status FROM contacts ORDER BY sido, local_name, phone`;
  return Response.json({ contacts });
}
export async function POST(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const body = (await request.json()) as { sido?: string; local?: string; scope?: string; phone?: string };
  const sido = body.sido?.trim();
  const local = body.local?.trim();
  const scope = body.scope?.trim();
  const phone = body.phone?.trim();
  if (!sido || !local || !scope || !phone) return Response.json({ error: "시도·시군구·담당 업무·직통번호를 모두 입력해 주세요." }, { status: 400 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  const [contact] = await sql`INSERT INTO contacts (sido, local_name, scope, phone, checked_on, status)
    VALUES (${sido}, ${local}, ${scope}, ${phone}, TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'), '확인')
    ON CONFLICT (sido, local_name, scope, phone) DO UPDATE SET checked_on = EXCLUDED.checked_on, status = '확인', updated_at = NOW()
    RETURNING id, sido, local_name AS local, scope, phone, checked_on AS checked, status`;
  return Response.json({ ok: true, contact });
}

export async function PATCH(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const body = (await request.json()) as { id?: number; local?: string; scope?: string; phone?: string };
  const id = Number(body.id);
  const local = body.local?.trim();
  const scope = body.scope?.trim();
  const phone = body.phone?.trim();
  if (!Number.isFinite(id) || !local || !scope || !phone) return Response.json({ error: "수정할 지역·담당 업무·직통번호를 모두 입력해 주세요." }, { status: 400 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  const [contact] = await sql`UPDATE contacts SET local_name = ${local}, scope = ${scope}, phone = ${phone}, checked_on = TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'), status = '확인', updated_at = NOW() WHERE id = ${id} RETURNING id, sido, local_name AS local, scope, phone, checked_on AS checked, status`;
  if (!contact) return Response.json({ error: "연락처를 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ ok: true, contact });
}
export async function DELETE(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const body = (await request.json()) as { id?: number };
  const id = Number(body.id);
  if (!Number.isFinite(id)) return Response.json({ error: "삭제할 연락처를 선택해 주세요." }, { status: 400 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  const [contact] = await sql`DELETE FROM contacts WHERE id = ${id} RETURNING id, sido, local_name AS local, scope, phone, checked_on AS checked, status`;
  if (!contact) return Response.json({ error: "연락처를 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ ok: true, contact });
}
