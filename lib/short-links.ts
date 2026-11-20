// ============================================================
// 🔗 ลิงก์สั้น (ของกลาง) — กติกาฝั่งเดียวกันทั้งหน้าเว็บ ERP / API / เว็บร้าน
//   ลิงก์สั้น = louismontini.co.th/go/<code> → เว็บร้านถาม ERP (/api/public/short-links/<code>) แล้วพาไปปลายทาง
//   ฝั่ง DB: ตาราง short_links + short_link_click_daily (migration 202612200900) · ตัวเรียกฝั่ง server: lib/short-links-db
//   ตัวเรียกฝั่งหน้าเว็บ: lib/short-links-client · หน้าจัดการ: /tasks/short-links · คู่มือ docs/short-links.md
// ไฟล์นี้ pure (ไม่ยิง API) ใช้ได้ทั้ง client/server
// ============================================================

/** หน้าลิงก์สั้น (ท้ายมี /) — เปลี่ยนโดเมนได้ด้วย env โดยไม่แก้โค้ด */
export const SHORT_LINK_BASE = (process.env.NEXT_PUBLIC_SHORT_LINK_BASE || "https://louismontini.co.th/go/").replace(/\/?$/, "/");

/** โฮสต์แบบไม่มี https:// สำหรับโชว์ (louismontini.co.th/go/) */
export const SHORT_LINK_DISPLAY = SHORT_LINK_BASE.replace(/^https?:\/\//, "");

export const shortUrlOf = (code: string) => `${SHORT_LINK_BASE}${code}`;

/** รหัสท้ายลิงก์: a-z 0-9 และ - (2-40 ตัว) ตรงกับ check ใน DB */
export const SHORT_CODE_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

/** คำที่ห้ามตั้งเป็นชื่อเอง (กันสับสนกับหน้าระบบ) */
const RESERVED = new Set(["admin", "api", "go", "login", "cart", "checkout", "account", "shop", "new", "www"]);

/** ทำชื่อที่พิมพ์ให้เป็นรหัสที่ใช้ได้ (ตัวเล็ก · ช่องว่าง/_ → - · ตัดอักขระอื่น) */
export function normalizeShortCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** ตรวจชื่อตั้งเอง → ข้อความผิด (ภาษาคน) หรือ null = ใช้ได้ */
export function shortCodeProblem(code: string): string | null {
  if (!code) return "ใส่ชื่อลิงก์ก่อน";
  if (!SHORT_CODE_RE.test(code)) return "ใช้ได้แค่ a-z ตัวเลข และขีด - (2-40 ตัว)";
  if (RESERVED.has(code)) return "ชื่อนี้ระบบจองไว้ ลองชื่ออื่น";
  return null;
}

/** รหัสสุ่ม 5 ตัว (ไม่มี 0/o/1/l กันอ่านสับสน) */
export function randomShortCode(len = 5): string {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const buf = new Uint32Array(len);
  globalThis.crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) s += abc[buf[i] % abc.length];
  return s;
}

/** ปลายทางต้องเป็น http/https เท่านั้น — คืน URL ที่ตัดช่องว่างแล้ว หรือ null */
export function cleanTargetUrl(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 2000 || /\s/.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch { return null; }
}

/** เป็นลิงก์สั้นของเราอยู่แล้วไหม (ไม่ย่อซ้ำ) */
export function isOurShortLink(url: string): boolean {
  return url.trim().toLowerCase().replace(/^https?:\/\//, "").startsWith(SHORT_LINK_DISPLAY.toLowerCase());
}

/** โฮสต์ร้านค้าที่ "ย่ออัตโนมัติ" ในแคปชั่น (ลิงก์อื่นไม่แตะ) */
const SHOP_HOSTS = [
  "shopee.co.th", "shopee.com", "shp.ee",
  "lazada.co.th", "lazada.com", "s.lazada.co.th",
  "tiktok.com", // shop.tiktok.com / vt.tiktok.com
  "shop.line.me", "lin.ee", "line.me",
  "louismontini.co.th",
];

/** ลิงก์ร้าน (ที่ควรย่อ) — ยาวพอจะคุ้มย่อ + ไม่ใช่ลิงก์สั้นของเราเอง */
export function isShortenableShopUrl(url: string): boolean {
  const clean = cleanTargetUrl(url);
  if (!clean || isOurShortLink(clean)) return false;
  let host = "";
  try { host = new URL(clean).hostname.toLowerCase().replace(/^www\./, ""); } catch { return false; }
  if (!SHOP_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return false;
  return clean.length > SHORT_LINK_BASE.length + 8;
}

// ── นับคลิกแยกที่มา ─────────────────────────────────────────
export const SHORT_LINK_SOURCES = ["facebook", "instagram", "line", "tiktok", "qr", "other"] as const;
export type ShortLinkSource = (typeof SHORT_LINK_SOURCES)[number];
export const SHORT_LINK_SOURCE_LABEL: Record<ShortLinkSource, string> = {
  facebook: "Facebook", instagram: "Instagram", line: "LINE", tiktok: "TikTok", qr: "QR", other: "อื่น ๆ",
};

/** เดาที่มาจากเบราว์เซอร์ในแอป (User-Agent) + ?q=1 (สแกน QR) + referer — ไม่เก็บค่าดิบ */
export function shortLinkSourceOf(ua: string | null | undefined, opts: { qr?: boolean; referer?: string | null } = {}): ShortLinkSource {
  if (opts.qr) return "qr";
  const u = (ua ?? "").toLowerCase();
  const r = (opts.referer ?? "").toLowerCase();
  if (u.includes("instagram") || r.includes("instagram.com")) return "instagram";
  if (u.includes("fban") || u.includes("fbav") || u.includes("fb_iab") || u.includes("messenger") || r.includes("facebook.com") || r.includes("fb.com")) return "facebook";
  if (/\bline\//.test(u) || r.includes("line.me")) return "line";
  if (u.includes("musical_ly") || u.includes("bytedancewebview") || u.includes("tiktok") || r.includes("tiktok.com")) return "tiktok";
  return "other";
}

/** ดึงลิงก์ http/https ทั้งหมดในข้อความ (ตัดวงเล็บ/จุดท้ายประโยค) */
export function extractUrls(text: string | null | undefined): string[] {
  return [...String(text ?? "").matchAll(/https?:\/\/[^\s<>"'`]+/gi)].map((m) => m[0].replace(/[),.;!?]+$/, ""));
}

/** แทนลิงก์ยาวในข้อความด้วยลิงก์สั้น (map ยาว → สั้น) — ใช้ตอนประกอบแคปชั่น */
export function replaceWithShortLinks(text: string, map: Record<string, string> | null | undefined): string {
  if (!map || !text) return text;
  // ยาวก่อน — กันลิงก์ที่เป็นส่วนหน้าของอีกลิงก์ถูกแทนผิด
  const pairs = Object.entries(map).filter(([l, s]) => l && s).sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [long, short] of pairs) out = out.split(long).join(short);
  return out;
}

export type ShortLinkRow = {
  id: string; code: string; target_url: string; label: string | null;
  source_module: string | null; source_id: string | null; custom_code: boolean;
  is_active: boolean; deleted_at: string | null; click_count: number; last_clicked_at: string | null;
  created_by: string | null; created_at: string; updated_at: string;
};
export type ShortLinkListItem = ShortLinkRow & { short_url: string; created_by_name: string | null; by_source: Partial<Record<ShortLinkSource, number>> };
