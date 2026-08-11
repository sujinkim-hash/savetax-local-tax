import contactData from "@/app/contacts.json";
import missingContactData from "@/app/contacts-missing.json";

const MOIS_DIRECTORY_URL = "https://www.mois.go.kr/frt/sub/a04/localGovernment/screen.do";

type OfficeLink = { region: string; name: string; url: string };
export type MoisSource = { sido: string; local: string; sourceUrl: string };

const regionAliases: Record<string, string[]> = {
  "서울": ["서울특별시"],
  "서울특별시": ["서울특별시"],
  "전라북도": ["전라북도", "전북특별자치도"],
  "전북특별자치도": ["전북특별자치도", "전라북도"],
  "전라남도": ["전라남도", "전남광주통합특별시"],
  "광주광역시": ["광주광역시", "전남광주통합특별시"],
};

function text(value: string) {
  return value.replace(/<[^>]+>/g, "").replaceAll("&amp;", "&").replace(/\s+/g, " ").trim();
}

function anchors(html: string) {
  return [...html.matchAll(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ name: text(match[2]), url: match[1] }))
    .filter((link) => /^https?:\/\//.test(link.url));
}

function parseDirectory(html: string): OfficeLink[] {
  const offices: OfficeLink[] = [];
  const blocks = html.matchAll(/<h3[^>]*class="location_title"[^>]*>[\s\S]*?<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>\s*<ul[^>]*class="location_list"[^>]*>([\s\S]*?)<\/ul>/gi);
  for (const block of blocks) {
    const region = text(block[2]);
    offices.push({ region, name: region, url: block[1] });
    for (const link of anchors(block[3])) offices.push({ region, ...link });
  }
  return offices;
}

function localNames(local: string) {
  const names = [local];
  const parent = local.split(" ")[0];
  if (parent && parent !== local) {
    names.push(parent);
    if (!parent.endsWith("시") && !parent.endsWith("군") && !parent.endsWith("구")) names.push(`${parent}시`);
  }
  return names;
}

function allowedRegions(sido: string) {
  return regionAliases[sido] ?? [sido];
}

/** Collect official city/county/district homepages from the MOIS directory.
 * This deliberately collects only authoritative starting pages. It never changes a contact.
 */
export async function collectMoisSources(): Promise<MoisSource[]> {
  const response = await fetch(MOIS_DIRECTORY_URL, {
    headers: { "user-agent": "LocalTaxContactDirectory/1.0 (official-source-review)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`행정안전부 목록 응답 오류: ${response.status}`);
  const offices = parseDirectory(await response.text());
  if (offices.length < 150) throw new Error("행정안전부 목록에서 충분한 지자체 주소를 찾지 못했습니다.");

  const contactRows = [...(contactData as Array<{ sido: string; local: string }>), ...(missingContactData as Array<{ sido: string; local: string }>)];
  const locals = [...new Map(contactRows.map((item) => [item.sido + "|" + item.local, item])).values()];
  const sources: MoisSource[] = [];
  for (const item of locals) {
    const names = new Set(localNames(item.local));
    const office = offices.find((candidate) => allowedRegions(item.sido).includes(candidate.region) && names.has(candidate.name));
    if (office) sources.push({ sido: item.sido, local: item.local, sourceUrl: office.url });
  }
  return sources;
}
