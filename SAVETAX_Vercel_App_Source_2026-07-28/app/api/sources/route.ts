import { ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = await ensureSchema();
  if (!sql) return Response.json({ sources: [] });

  const sources = await sql`
    SELECT id, sido, local_name AS local, source_url, created_at
    FROM source_pages
    WHERE is_active = TRUE AND is_manual = TRUE
    ORDER BY created_at DESC
  `;
  return Response.json({ sources }, { headers: { "cache-control": "no-store" } });
}
