import { ensureSchema, requireAdmin } from "@/lib/db";
import { collectMoisSources } from "@/lib/mois";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function ensureMoisCandidates(sql: NonNullable<Awaited<ReturnType<typeof ensureSchema>>>) {
  const [existing] = await sql`SELECT COUNT(*)::int AS count FROM (
    SELECT DISTINCT sido, local_name FROM source_pages WHERE is_manual = FALSE
  ) AS candidates`;
  if (Number(existing?.count ?? 0) >= 250) return;

  try {
    const collected = await collectMoisSources();
    for (const source of collected) {
      await sql`INSERT INTO source_pages (sido, local_name, source_url, is_active, is_manual)
        VALUES (${source.sido}, ${source.local}, ${source.sourceUrl}, FALSE, FALSE)
        ON CONFLICT (sido, local_name, source_url) DO NOTHING`;
    }
  } catch {
    // 자동 수집 실패 시 기존에 저장된 공식 홈페이지 후보만 사용합니다.
  }
}

async function syncSourceReviews(sql: NonNullable<Awaited<ReturnType<typeof ensureSchema>>>) {
  // 실제로 등록된 주소와 일치하는 항목만 등록 상태로 표시합니다.
  await sql`UPDATE review_candidates
    SET previous_value = '미등록',
        proposed_value = '미등록',
        reason = '공식 주소 등록 여부를 확인해 주세요.'
    WHERE status = 'pending' AND field = '공식 주소'
      AND NOT EXISTS (
        SELECT 1 FROM source_pages s
        WHERE s.sido = review_candidates.sido
          AND s.local_name = review_candidates.local_name
          AND s.source_url = review_candidates.source_url
          AND s.is_manual = TRUE
      )`;

  await sql`UPDATE review_candidates
    SET field = '공식 주소',
        previous_value = '미등록',
        proposed_value = '등록',
        reason = '등록된 공식 직원검색·조직도 주소입니다. 주소와 지자체를 확인한 뒤 반영하세요.'
    WHERE status = 'pending' AND source_url IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM source_pages s
        WHERE s.sido = review_candidates.sido
          AND s.local_name = review_candidates.local_name
          AND s.source_url = review_candidates.source_url
          AND s.is_manual = TRUE
      )`;

  await sql`INSERT INTO review_candidates (contact_id, sido, local_name, field, previous_value, proposed_value, reason, source_url, status)
    SELECT NULL, s.sido, s.local_name, '공식 주소', '미등록', '등록',
      '등록된 공식 직원검색·조직도 주소입니다. 주소와 지자체를 확인한 뒤 반영하세요.', s.source_url, 'pending'
    FROM source_pages s
    WHERE s.is_manual = TRUE AND NOT EXISTS (
      SELECT 1 FROM review_candidates r
      WHERE r.sido = s.sido AND r.local_name = s.local_name
        AND r.field = '공식 주소' AND r.source_url = s.source_url
    )`;

  // 동일 주소의 중복 검토 건만 정리합니다. 한 지자체의 추가 페이지는 모두 유지합니다.
  await sql`DELETE FROM review_candidates older
    USING review_candidates newer
    WHERE older.id < newer.id
      AND older.status = 'pending' AND newer.status = 'pending'
      AND older.field = '공식 주소' AND newer.field = '공식 주소'
      AND older.sido = newer.sido AND older.local_name = newer.local_name
      AND older.source_url = newer.source_url`;
}

export async function GET(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  const fast = new URL(request.url).searchParams.get("fast") === "1";
  if (!fast) {
    await ensureMoisCandidates(sql);
    await syncSourceReviews(sql);
  }
  const sources = await sql`SELECT id, sido, local_name AS local, source_url, navigation_note, created_at FROM source_pages WHERE is_active = TRUE AND is_manual = TRUE ORDER BY created_at DESC`;
  const officeNotes = await sql`SELECT sido, local_name AS local, navigation_note FROM office_notes ORDER BY sido, local_name`;
  const candidates = await sql`SELECT DISTINCT ON (sido, local_name) id, sido, local_name AS local, source_url, navigation_note, created_at FROM source_pages WHERE is_manual = FALSE ORDER BY sido, local_name, created_at DESC`;
  return Response.json({ sources, candidates, officeNotes });
}

export async function POST(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const body = (await request.json()) as {
    id?: number; sido?: string; local?: string; sourceUrl?: string; navigationNote?: string;
    sourceUrls?: Array<{ sourceUrl?: string; navigationNote?: string }>;
    noteOnly?: boolean;
  };
  const sourceEntries = (body.sourceUrls?.length
    ? body.sourceUrls
    : [{ sourceUrl: body.sourceUrl, navigationNote: body.navigationNote }])
    .map((item) => ({ sourceUrl: item.sourceUrl?.trim() ?? "", navigationNote: item.navigationNote?.trim() || null }))
    .filter((item) => item.sourceUrl);
  if (!body.sido || !body.local || (body.noteOnly ? !body.navigationNote?.trim() : sourceEntries.length === 0) || (!body.noteOnly && sourceEntries.some((item) => !item.sourceUrl.startsWith("http")))) {
    return Response.json({ error: "시도, 시·군·구와 공식 주소 또는 확인 메모가 필요합니다." }, { status: 400 });
  }
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  if (body.noteOnly) {
    await sql`INSERT INTO office_notes (sido, local_name, navigation_note, updated_at)
      VALUES (${body.sido}, ${body.local}, ${body.navigationNote!.trim()}, NOW())
      ON CONFLICT (sido, local_name) DO UPDATE SET navigation_note = EXCLUDED.navigation_note, updated_at = NOW()`;
    return Response.json({ ok: true, noteOnly: true });
  }

  // 같은 지자체에는 여러 조직도·직원검색 페이지를 등록할 수 있습니다.
  // 수정일 때만 선택한 주소 1건을 교체하고, 기존 추가 페이지는 유지합니다.
  if (body.id) {
    await sql`DELETE FROM review_candidates
      WHERE source_url = (SELECT source_url FROM source_pages WHERE id = ${body.id})
        AND status = 'pending' AND field IN ('공식 홈페이지', '공식 주소')`;
    await sql`DELETE FROM source_pages WHERE id = ${body.id}`;
  }
  const sources = [];
  for (const entry of sourceEntries) {
    const [source] = await sql`INSERT INTO source_pages (sido, local_name, source_url, navigation_note, is_active, is_manual)
      VALUES (${body.sido}, ${body.local}, ${entry.sourceUrl}, ${entry.navigationNote}, TRUE, TRUE)
      ON CONFLICT (sido, local_name, source_url) DO UPDATE SET
        navigation_note = EXCLUDED.navigation_note, is_active = TRUE, is_manual = TRUE
      RETURNING id, sido, local_name AS local, source_url, navigation_note, created_at`;
    sources.push(source);
    await sql`INSERT INTO review_candidates (contact_id, sido, local_name, field, previous_value, proposed_value, reason, source_url, status)
      SELECT NULL, ${body.sido}, ${body.local}, '공식 주소', '미등록', '등록',
        '관리자가 등록한 공식 직원검색·조직도 주소입니다. 주소와 지자체를 확인한 뒤 반영하세요.', ${entry.sourceUrl}, 'pending'
      WHERE NOT EXISTS (
        SELECT 1 FROM review_candidates
        WHERE sido = ${body.sido} AND local_name = ${body.local}
          AND field = '공식 주소' AND source_url = ${entry.sourceUrl} AND status = 'pending'
      )`;
  }
  return Response.json({ ok: true, sources });
}

export async function PATCH(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const body = (await request.json()) as { action?: "deleteSourceNote"; id?: number; sido?: string; local?: string; navigationNote?: string };
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  if (body.action === "deleteSourceNote") {
    if (!body.id) return Response.json({ error: "삭제할 메모를 찾을 수 없습니다." }, { status: 400 });
    await sql`UPDATE source_pages SET navigation_note = NULL WHERE id = ${body.id}`;
    return Response.json({ ok: true, sourceNoteDeleted: true });
  }
  const sido = body.sido?.trim();
  const local = body.local?.trim();
  const navigationNote = body.navigationNote?.trim();
  if (!sido || !local || !navigationNote) return Response.json({ error: "시도, 시·군·구와 메모 내용이 필요합니다." }, { status: 400 });
  await sql`INSERT INTO office_notes (sido, local_name, navigation_note, updated_at)
    VALUES (${sido}, ${local}, ${navigationNote}, NOW())
    ON CONFLICT (sido, local_name) DO UPDATE
    SET navigation_note = EXCLUDED.navigation_note, updated_at = NOW()`;
  return Response.json({ ok: true, officeNote: { sido, local, navigation_note: navigationNote } });
}

export async function DELETE(request: Request) {
  if (!requireAdmin(request)) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 401 });
  const body = (await request.json()) as { id?: number; noteOnly?: boolean; sido?: string; local?: string };
  if (body.noteOnly) {
    const sido = body.sido?.trim();
    const local = body.local?.trim();
    if (!sido || !local) return Response.json({ error: "삭제할 메모를 찾을 수 없습니다." }, { status: 400 });
    const sql = await ensureSchema();
    if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
    await sql`DELETE FROM office_notes WHERE sido = ${sido} AND local_name = ${local}`;
    return Response.json({ ok: true, noteOnly: true });
  }
  if (!body.id) return Response.json({ error: "삭제할 공식 주소를 찾을 수 없습니다." }, { status: 400 });
  const sql = await ensureSchema();
  if (!sql) return Response.json({ error: "DATABASE_URL 연결을 확인하세요." }, { status: 503 });
  const [source] = await sql`SELECT sido, local_name AS local, source_url FROM source_pages WHERE id = ${body.id}`;
  if (source) await sql`DELETE FROM review_candidates
    WHERE sido = ${source.sido} AND local_name = ${source.local}
      AND field IN ('공식 홈페이지', '공식 주소')
      AND source_url = ${source.source_url} AND status = 'pending'`;
  await sql`DELETE FROM source_pages WHERE id = ${body.id}`;
  return Response.json({ ok: true });
}
