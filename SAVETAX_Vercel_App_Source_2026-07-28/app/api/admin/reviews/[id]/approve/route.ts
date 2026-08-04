import { ensureSchema, requireAdmin } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  const { id } = await context.params;
  const candidates = await sql`SELECT * FROM review_candidates WHERE id = ${id} AND status = 'pending'`;
  const candidate = candidates[0];
  if (!candidate) return Response.json({ error: "검토 대상을 찾을 수 없습니다." }, { status: 404 });
  if (candidate.contact_id && ["phone", "scope"].includes(candidate.field)) {
    const column = candidate.field === "phone" ? "phone" : "scope";
    if (column === "phone") await sql`UPDATE contacts SET phone = ${candidate.proposed_value}, updated_at = NOW() WHERE id = ${candidate.contact_id}`;
    if (column === "scope") await sql`UPDATE contacts SET scope = ${candidate.proposed_value}, updated_at = NOW() WHERE id = ${candidate.contact_id}`;
  }
  await sql`UPDATE review_candidates SET status = 'approved', reviewed_at = NOW() WHERE id = ${id}`;
  return Response.json({ ok: true });
}
