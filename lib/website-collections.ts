/**
 * 📖 หน้าคอลเลกชันของเว็บร้าน (ของกลาง · pure) — ตั้งต่อร้านในแท็บ "🎞 คอลเลกชัน" (เก็บที่ shops.field_map.collections)
 * คอลเลกชันจริงมาจากตาราง collections (ผูกกับ Parent SKU) — ที่นี่เก็บเฉพาะ "หน้าตาบนเว็บ" ของร้านนั้น:
 *   เปิดหน้าไหม · ลิงก์ (/collection/<slug>) · ชื่อบนเว็บ · แบนเนอร์คอม/มือถือ · เรื่องราว · ชื่อ/คำอธิบายใน Google · ลำดับ (ตามลำดับในรายการ)
 * เว็บร้าน: src/app/collection/[slug]/page.tsx + Section "คอลเลกชัน" (CollectionsSection)
 */
export interface WebCollection {
  /** collections.id */
  id: string;
  /** ลิงก์ /collection/<slug> — a-z 0-9 - เท่านั้น */
  slug: string;
  enabled: boolean;
  /** ชื่อบนเว็บ (ว่าง = ชื่อคอลเลกชันใน ERP) */
  title: string;
  bannerKey: string | null;
  mobileBannerKey: string | null;
  story: string;
  seoTitle: string;
  seoDescription: string;
}

const KEY_RE = /^[\w\-./%()]+$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** ชื่อ → slug (อังกฤษ/ตัวเลขเท่านั้น · ชื่อไทยล้วน = ว่าง ให้ตั้งเอง) */
export const slugifyCollection = (v: unknown): string =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

export function normalizeWebCollections(raw: unknown): WebCollection[] {
  if (!Array.isArray(raw)) return [];
  const out: WebCollection[] = [];
  const seenId = new Set<string>();
  const seenSlug = new Set<string>();
  const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const key = (v: unknown) => (typeof v === "string" && KEY_RE.test(v.trim()) ? v.trim().slice(0, 300) : null);
  for (const x of raw.slice(0, 200)) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = txt(o.id, 40);
    if (!UUID.test(id) || seenId.has(id)) continue;
    let slug = slugifyCollection(o.slug);
    if (!slug || seenSlug.has(slug)) slug = `c-${id.slice(0, 8)}`;
    seenId.add(id);
    seenSlug.add(slug);
    out.push({
      id,
      slug,
      enabled: o.enabled === true,
      title: txt(o.title, 120),
      bannerKey: key(o.bannerKey),
      mobileBannerKey: key(o.mobileBannerKey),
      story: txt(o.story, 3000),
      seoTitle: txt(o.seoTitle, 120),
      seoDescription: txt(o.seoDescription, 300),
    });
  }
  return out;
}
