import { ensureSchema, requireAdmin } from "@/lib/db";
import { collectMoisSources } from "@/lib/mois";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다. ADMIN_KEY를 확인하세요." }, { status: 401 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });

  try {
    const sources = await collectMoisSources();
    let added = 0;
    for (const source of sources) {
      const inserted = await sql`
        INSERT INTO source_pages (sido, local_name, source_url, is_active)
        VALUES (${source.sido}, ${source.local}, ${source.sourceUrl}, FALSE)
        ON CONFLICT (sido, local_name, source_url) DO NOTHING
        RETURNING id
      `;
      if (inserted.length) {
        added += 1;
        await sql`
          INSERT INTO review_candidates (sido, local_name, field, previous_value, proposed_value, reason, source_url)
          VALUES (${source.sido}, ${source.local}, '공식 홈페이지', '미등록', ${source.sourceUrl}, '행정안전부 지자체 누리집 목록에서 수집한 공식 홈페이지입니다. 주소와 지자체를 확인한 뒤 승인하세요.', ${source.sourceUrl})
        `;
      }
    }
    return Response.json({ ok: true, found: sources.length, added });
  } catch (error) {
    const message = error instanceof Error ? error.message : "행정안전부 목록을 불러오지 못했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }
}
