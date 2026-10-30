/**
 * 🚪 โซนของเว็บ — แบ่งเว็บร้านเป็นหลายส่วนที่เมนูต่างกัน (เช่น "รับผลิต" | "ร้านอะไหล่") + แถบสลับโซนบนสุด
 * ⚠️ มิเรอร์: ERP lib/website-site-zones.ts ↔ เว็บร้าน src/lib/site-zones.ts — แก้ที่ ERP แล้วคัดลอกทั้งไฟล์ (ไฟล์นี้ไม่มี import)
 * ข้อมูลอยู่ใน theme.siteZones (ร่าง/เผยแพร่พร้อมธีม) · เมนูของโซนใช้ชนิด MenuItem ของธีม → ส่งตัวทำความสะอาดเมนูเข้ามา
 * ใช้คู่กับ Section "หน้าเปิดแบ่งช่อง" (split-entry) ที่หน้าแรก · ERP ตั้งที่ ดีไซน์ › เมนู › 🚪 โซนของเว็บ
 */

/** ชิ้นบนหัวเว็บที่ซ่อนได้รายโซน (เช่น โซนรับผลิตไม่มีตะกร้า) */
export type SiteZoneHideEl = "cart" | "search" | "wishlist" | "account";
export const SITE_ZONE_HIDE_ELS: { value: SiteZoneHideEl; label: string }[] = [
  { value: "cart", label: "ตะกร้า" },
  { value: "search", label: "ค้นหา" },
  { value: "wishlist", label: "รายการโปรด" },
  { value: "account", label: "บัญชีสมาชิก" },
];

export interface SiteZone<M = unknown> {
  id: string;
  /** ชื่อโซน (แท็บบนแถบสลับ) */
  label: string;
  /** หน้าแรกของโซน — กดแท็บแล้วไปที่นี่ (ว่าง = หน้าแรกในรายการ paths) */
  home: string;
  /** หน้าที่นับเป็นโซนนี้ (ขึ้นต้นด้วย: "/oem" = /oem และ /oem/…) · ว่าง = "หน้าอื่นทั้งหมด" (โซนหลัก — ใช้ได้โซนเดียว) */
  paths: string[];
  /** เมนูของโซน · null = ใช้เมนูหลักของร้าน (ดีไซน์ › เมนู) */
  items: M[] | null;
  /** ปุ่มบนหัวเว็บเฉพาะโซน — ข้อความว่าง = ใช้ปุ่มของหัวเว็บตามเดิม */
  button: { text: string; href: string };
  /** ชิ้นบนหัวเว็บที่ซ่อนในโซนนี้ */
  hide: SiteZoneHideEl[];
}

export type SiteZoneBarBg = "ink" | "brand" | "custom";
export interface SiteZoneBar {
  /** โชว์แถบบนหน้าแรก "/" ด้วย (ปกติหน้าแรกเป็นหน้าเปิดแบ่งช่อง ไม่ต้องมีแถบ) */
  onHome: boolean;
  bg: SiteZoneBarBg;
  /** สีพื้นเมื่อ bg = custom (#rrggbb) */
  bgColor: string;
  align: "left" | "center";
  /** ลิงก์กลับหน้าแรกท้ายแถบ (ว่าง = ไม่มี) เช่น "หน้าแรก" */
  homeText: string;
}

export interface SiteZoneConfig<M = unknown> {
  /** เปิดใช้โซน — ปิด = เว็บใช้เมนูหลักชุดเดียวเหมือนเดิม (ค่าที่ตั้งไว้ไม่หาย) */
  enabled: boolean;
  items: SiteZone<M>[];
  bar: SiteZoneBar;
}

export const SITE_ZONE_MAX = 4;
export const DEFAULT_SITE_ZONE_BAR: SiteZoneBar = { onHome: false, bg: "ink", bgColor: "", align: "left", homeText: "" };
export function defaultSiteZones<M = unknown>(): SiteZoneConfig<M> {
  return { enabled: false, items: [], bar: { ...DEFAULT_SITE_ZONE_BAR } };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** ที่อยู่หน้าในโซน: ต้องขึ้นต้นด้วย "/" · ตัด ?query/#hash และ "/" ท้าย · ตัวพิมพ์เล็ก · ลิงก์นอกเว็บ = "" */
export function cleanSiteZonePath(raw: unknown): string {
  let p = str(raw, 120).split(/[?#]/)[0].toLowerCase();
  if (!p.startsWith("/") || p.startsWith("//")) return "";
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return /^\/[\w\-./~%]*$/.test(p) ? p : "";
}

/** ลิงก์ในเว็บ (หน้าแรกของโซน / ปุ่ม): "/…" หรือ https:// · อย่างอื่น = "" */
function cleanHref(raw: unknown): string {
  const h = str(raw, 500);
  return /^\/(?!\/)/.test(h) || /^https?:\/\//i.test(h) ? h : "";
}

export function normalizeSiteZones<M>(raw: unknown, normItems: (raw: unknown) => M[]): SiteZoneConfig<M> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const b = (r.bar && typeof r.bar === "object" ? r.bar : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const items: SiteZone<M>[] = [];
  (Array.isArray(r.items) ? r.items : []).forEach((x, i) => {
    if (!x || typeof x !== "object" || items.length >= SITE_ZONE_MAX) return;
    const z = x as Record<string, unknown>;
    let id = str(z.id, 40) || `z${i}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    // หน้าเดียวกันอยู่ได้โซนเดียว (โซนแรกได้ก่อน)
    const paths = Array.from(new Set((Array.isArray(z.paths) ? z.paths : []).map(cleanSiteZonePath).filter(Boolean)))
      .filter((p) => !items.some((o) => o.paths.includes(p)))
      .slice(0, 12);
    const btn = (z.button && typeof z.button === "object" ? z.button : {}) as Record<string, unknown>;
    const hide = (Array.isArray(z.hide) ? z.hide : []).filter((h): h is SiteZoneHideEl => SITE_ZONE_HIDE_ELS.some((o) => o.value === h));
    items.push({
      id,
      label: str(z.label, 40) || `โซน ${items.length + 1}`,
      home: cleanHref(z.home),
      paths,
      items: Array.isArray(z.items) ? normItems(z.items) : null,
      button: { text: str(btn.text, 30), href: cleanHref(btn.href) },
      hide: Array.from(new Set(hide)),
    });
  });
  return {
    enabled: r.enabled === true,
    items,
    bar: {
      onHome: b.onHome === true,
      bg: b.bg === "brand" || b.bg === "custom" ? b.bg : "ink",
      bgColor: typeof b.bgColor === "string" && /^#[0-9a-f]{6}$/i.test(b.bgColor.trim()) ? b.bgColor.trim().toLowerCase() : "",
      align: b.align === "center" ? "center" : "left",
      homeText: str(b.homeText, 30),
    },
  };
}

/** ตัด /en ออก (หน้าอังกฤษ) — "/en/oem" → "/oem" · "/en" → "/" */
export function stripLangPath(pathname: string): string {
  const p = (pathname || "/").split(/[?#]/)[0].toLowerCase();
  if (p === "/en") return "/";
  return p.startsWith("/en/") ? p.slice(3) : p;
}

/** หน้านี้ตรงกับที่อยู่ในโซนไหม — "/" = หน้าแรกเท่านั้น · อื่น ๆ = ตัวมันเองและหน้าลูก */
const pathHit = (page: string, zonePath: string) => (zonePath === "/" ? page === "/" : page === zonePath || page.startsWith(`${zonePath}/`));

/**
 * หน้านี้อยู่โซนไหน: ที่อยู่ที่ตรงยาวที่สุดชนะ → ไม่ตรงโซนไหน = โซนหลัก (โซนแรกที่ไม่ได้เลือกหน้า) → ไม่มีโซนหลัก = null
 * ปิดโซน / ยังไม่มีโซน = null (ใช้เมนูหลักตามเดิม)
 */
export function siteZoneOf<M>(pathname: string, cfg: SiteZoneConfig<M> | null | undefined): SiteZone<M> | null {
  if (!cfg?.enabled || !cfg.items.length) return null;
  const page = stripLangPath(pathname);
  let best: SiteZone<M> | null = null;
  let bestLen = -1;
  for (const z of cfg.items) {
    for (const p of z.paths) {
      if (pathHit(page, p) && p.length > bestLen) {
        best = z;
        bestLen = p.length;
      }
    }
  }
  return best ?? cfg.items.find((z) => !z.paths.length) ?? null;
}

/** แถบสลับโซนโชว์ไหม: เปิดโซน + มีอย่างน้อย 2 โซน · หน้าแรกโชว์เมื่อติ๊ก onHome */
export function siteZoneBarShown(pathname: string, cfg: SiteZoneConfig | null | undefined): boolean {
  if (!cfg?.enabled || cfg.items.length < 2) return false;
  return stripLangPath(pathname) !== "/" || cfg.bar.onHome;
}

/** ลิงก์ของแท็บโซน: หน้าแรกของโซน → ที่อยู่แรก → "/" */
export const siteZoneHref = (z: Pick<SiteZone, "home" | "paths">): string => z.home || z.paths[0] || "/";
