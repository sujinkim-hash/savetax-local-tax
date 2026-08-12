import { neon } from "@neondatabase/serverless";

let sqlClient: ReturnType<typeof neon> | null = null;

export function getSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  if (!sqlClient) sqlClient = neon(connectionString);
  return sqlClient;
}

export async function ensureSchema() {
  const sql = getSql();
  if (!sql) return null;
  await sql`CREATE TABLE IF NOT EXISTS contacts (id BIGSERIAL PRIMARY KEY, sido TEXT NOT NULL, local_name TEXT NOT NULL, scope TEXT NOT NULL, phone TEXT NOT NULL, checked_on TEXT NOT NULL, status TEXT NOT NULL DEFAULT '확인', source_url TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS contacts_unique_row ON contacts (sido, local_name, scope, phone)`;
  await sql`CREATE TABLE IF NOT EXISTS source_pages (id BIGSERIAL PRIMARY KEY, sido TEXT NOT NULL, local_name TEXT NOT NULL, source_url TEXT NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE, last_checked_at TIMESTAMPTZ, last_result TEXT)`;
  await sql`ALTER TABLE source_pages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  await sql`ALTER TABLE source_pages ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE source_pages ADD COLUMN IF NOT EXISTS content_hash TEXT`;
  await sql`ALTER TABLE source_pages ADD COLUMN IF NOT EXISTS content_checked_at TIMESTAMPTZ`;
  await sql`ALTER TABLE source_pages ADD COLUMN IF NOT EXISTS navigation_note TEXT`;
  await sql`ALTER TABLE source_pages DROP CONSTRAINT IF EXISTS source_pages_source_url_key`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS source_pages_unique_office_url ON source_pages (sido, local_name, source_url)`;
  await sql`CREATE TABLE IF NOT EXISTS office_notes (sido TEXT NOT NULL, local_name TEXT NOT NULL, navigation_note TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (sido, local_name))`;
  await sql`WITH seed AS (
    SELECT id FROM source_pages WHERE is_manual = FALSE ORDER BY created_at DESC LIMIT 8
  )
  UPDATE source_pages SET is_manual = TRUE
  WHERE id IN (SELECT id FROM seed)
    AND NOT EXISTS (SELECT 1 FROM source_pages WHERE is_manual = TRUE)`;
  await sql`CREATE TABLE IF NOT EXISTS review_candidates (id BIGSERIAL PRIMARY KEY, contact_id BIGINT REFERENCES contacts(id), sido TEXT NOT NULL, local_name TEXT NOT NULL, field TEXT NOT NULL, previous_value TEXT NOT NULL, proposed_value TEXT NOT NULL, reason TEXT NOT NULL, source_url TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ)`;
  await sql`CREATE TABLE IF NOT EXISTS review_runs (id BIGSERIAL PRIMARY KEY, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ, checked_count INTEGER NOT NULL DEFAULT 0, note TEXT)`;
  await sql`CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  const [seochoUpdate] = await sql`INSERT INTO app_migrations (name) VALUES ('seocho_income_tax_update_2026_08_11') ON CONFLICT DO NOTHING RETURNING name`;
  if (seochoUpdate) {
    await sql`DELETE FROM contacts WHERE sido = '서울' AND local_name = '서초구' AND phone = '02-2155-6575'`;
    await sql`UPDATE contacts SET scope = '서초2동, 서초4동', checked_on = TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'), status = '확인', updated_at = NOW() WHERE sido = '서울' AND local_name = '서초구' AND phone = '02-2155-6573'`;
    await sql`DELETE FROM contacts WHERE sido = '서울' AND local_name = '서초구' AND phone = '02-2155-6571'`;
    await sql`INSERT INTO contacts (sido, local_name, scope, phone, checked_on, status) VALUES ('서울', '서초구', '내곡동', '02-2155-6571', TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'), '확인')`;
  }
  const [bucheonWonmiSplit] = await sql`INSERT INTO app_migrations (name) VALUES ('bucheon_wonmi_phone_split_2026_08_12') ON CONFLICT DO NOTHING RETURNING name`;
  if (bucheonWonmiSplit) {
    await sql`UPDATE contacts
      SET phone = '032-625-5211', checked_on = TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'), status = '확인', updated_at = NOW()
      WHERE sido = '경기도' AND local_name = '부천시 원미구' AND scope = '개인지방소득세'
        AND phone = '032-625-5211, 032-625-5213'`;
    await sql`INSERT INTO contacts (sido, local_name, scope, phone, checked_on, status)
      VALUES ('경기도', '부천시 원미구', '개인지방소득세', '032-625-5213', TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'), '확인')
      ON CONFLICT (sido, local_name, scope, phone) DO NOTHING`;
  }
  return sql;
}

export function requireAdmin(request: Request) {
  const expected = process.env.ADMIN_KEY;
  return Boolean(expected && request.headers.get("x-admin-key") === expected);
}
