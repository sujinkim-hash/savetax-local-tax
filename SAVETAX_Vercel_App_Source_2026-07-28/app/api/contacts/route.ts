import { ensureSchema } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const sql = await ensureSchema();
  if (!sql) return Response.json({ contacts: [] });
  const contacts = await sql`SELECT id, sido, local_name AS local, scope, phone, checked_on AS checked, status FROM contacts ORDER BY sido, local_name, phone`;
  return Response.json({ contacts });
}
