import { ensureSchema, requireAdmin } from "@/lib/db";
import { seedContacts } from "@/lib/contacts";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다. ADMIN_KEY를 확인하세요." }, { status: 401 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  for (const contact of seedContacts) {
    await sql`INSERT INTO contacts (sido, local_name, scope, phone, checked_on, status) VALUES (${contact.sido}, ${contact.local}, ${contact.scope || "지방세"}, ${contact.phone}, ${contact.checked}, ${contact.status}) ON CONFLICT (sido, local_name, scope, phone) DO NOTHING`;
  }
  const result = await sql`SELECT COUNT(*)::int AS count FROM contacts`;
  return Response.json({ count: result[0]?.count ?? 0 });
}
