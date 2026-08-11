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
  await sql`WITH seed AS (
    SELECT id FROM source_pages WHERE is_manual = FALSE ORDER BY created_at DESC LIMIT 8
  )
  UPDATE source_pages SET is_manual = TRUE
  WHERE id IN (SELECT id FROM seed)
    AND NOT EXISTS (SELECT 1 FROM source_pages WHERE is_manual = TRUE)`;
  await sql`CREATE TABLE IF NOT EXISTS review_candidates (id BIGSERIAL PRIMARY KEY, contact_id BIGINT REFERENCES contacts(id), sido TEXT NOT NULL, local_name TEXT NOT NULL, field TEXT NOT NULL, previous_value TEXT NOT NULL, proposed_value TEXT NOT NULL, reason TEXT NOT NULL, source_url TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ)`;
  await sql`CREATE TABLE IF NOT EXISTS review_runs (id BIGSERIAL PRIMARY KEY, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ, checked_count INTEGER NOT NULL DEFAULT 0, note TEXT)`;
  return sql;
}

export function requireAdmin(request: Request) {
  const expected = process.env.ADMIN_KEY;
  return Boolean(expected && request.headers.get("x-admin-key") === expected);
}
