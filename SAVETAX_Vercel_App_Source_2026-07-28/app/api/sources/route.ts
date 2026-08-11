import { ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = await ensureSchema();
  if (!sql) return Response.json({ sources: [] });

  const sources = await sql`
    SELECT id, sido, local_name AS local, source_url, navigation_note, created_at
    FROM source_pages
    WHERE is_active = TRUE AND is_manual = TRUE
    ORDER BY created_at DESC
  `;
  const officeNotes = await sql`SELECT sido, local_name AS local, navigation_note FROM office_notes ORDER BY sido, local_name`;
  return Response.json({ sources, officeNotes }, { headers: { "cache-control": "no-store" } });
}
