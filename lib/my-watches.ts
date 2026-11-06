/**
 * ⭐ การเตือนของฉัน (ของกลาง · ล้วน ๆ ไม่มี React — ใช้ได้ทั้งจอ เซิร์ฟเวอร์ และเทสต์)
 * แต่ละคนเพิ่มการเตือนเองได้: เลือก "หน้า" (แหล่ง) → ตั้งเงื่อนไข → เตือนแบบไหน (แท็บในศูนย์ / ตัว Pet เด้งเมื่อมีใบใหม่)
 * ต่างจากป๊อปเตือนงานของทีม (email_reports · แอดมินตั้ง) — อันนี้ของใครของมัน เก็บใน user_ui_prefs key my_watches
 *
 * เพิ่ม "หน้า" ใหม่ = เพิ่ม 1 รายการใน WATCH_SOURCES (+ ตัวดึงข้อมูลใน lib/my-watches-server) → ขึ้นในตัวเลือกเอง
 * ตัวคำนวณใช้ร่วมกับรายงานอีเมล/ป๊อปของทีม (buildReport) — ไม่เขียนเงื่อนไขซ้ำ
 */

export type WatchWhen = "all" | "flagged" | "stale" | "waiting";
export type WatchSource = {
  key: string;
  label: string;
  hint: string;
  icon: string;
  /** ต้องมีสิทธิ์นี้ถึงเลือกได้ (เซิร์ฟเวอร์ตรวจซ้ำ) */
  permission: string;
  /** กรองแบรนด์ได้ไหม */
  brands: boolean;
  /** เงื่อนไข "เตือนเมื่อ" ที่หน้านี้รองรับ */
  when: { key: WatchWhen; label: string }[];
  /** หน้าเต็ม ("ดูทั้งหมด") */
  viewAll: string;
};

export const WATCH_SOURCES: WatchSource[] = [
  {
    key: "design_pending", label: "Design Dashboard", hint: "งานออกแบบที่ยังไม่ปิด", icon: "design", permission: "products.view",
    brands: true, viewAll: "/master/design-dashboard",
    when: [
      { key: "all", label: "ค้างทั้งหมด" },
      { key: "flagged", label: "เกิน/ใกล้กำหนดเท่านั้น" },
      { key: "stale", label: "ไม่ขยับเกิน 7 วัน" },
      { key: "waiting", label: "มีของรอ" },
    ],
  },
];
export const watchSource = (key: string) => WATCH_SOURCES.find((s) => s.key === key);

export type MyWatch = {
  id: string;
  source: string;
  /** ว่าง = ทุกแบรนด์ */
  brand_ids: string[];
  when: WatchWhen;
  /** เปิดใช้อยู่ */
  on: boolean;
  /** ตัว Pet เด้งเมื่อมีใบใหม่ที่ยังไม่เคยเห็น */
  bounce: boolean;
  /** ชื่อที่ตั้งเอง (ว่าง = ตั้งให้จากเงื่อนไข) */
  name?: string;
};
export type MyWatchesPref = { list: MyWatch[] };
export const MY_WATCHES_KEY = "my_watches";
export const MY_WATCHES_MAX = 10;
export const MY_WATCHES_DEFAULT: MyWatchesPref = { list: [] };
export const STALE_DAYS = 7;

const UUIDISH = /^[0-9a-f-]{36}$/i;
export function parseMyWatches(raw: unknown): MyWatchesPref {
  const arr = raw && typeof raw === "object" && Array.isArray((raw as { list?: unknown }).list) ? (raw as { list: unknown[] }).list : [];
  const list: MyWatch[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const r = x as Partial<MyWatch>;
    const src = typeof r.source === "string" ? watchSource(r.source) : undefined;
    if (!src || typeof r.id !== "string" || !r.id || r.id.length > 40) continue;
    const when = src.when.some((w) => w.key === r.when) ? (r.when as WatchWhen) : "all";
    const brand_ids = src.brands && Array.isArray(r.brand_ids) ? [...new Set(r.brand_ids.filter((b): b is string => typeof b === "string" && UUIDISH.test(b)))].slice(0, 30) : [];
    const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 60) : undefined;
    list.push({ id: r.id, source: src.key, brand_ids, when, on: r.on !== false, bounce: r.bounce !== false, ...(name ? { name } : {}) });
    if (list.length >= MY_WATCHES_MAX) break;
  }
  return { list };
}

/** ใบงานที่ใช้กรอง (ตัดมาจากรายการของรายงาน) */
export type WatchItemFacts = { brand_id?: string | null; urgent: boolean; stale?: number; waitingCount: number };

/** ใบนี้ตรงเงื่อนไขการเตือนไหม */
export function watchMatches(w: Pick<MyWatch, "brand_ids" | "when">, it: WatchItemFacts): boolean {
  if (w.brand_ids.length && !(it.brand_id && w.brand_ids.includes(it.brand_id))) return false;
  if (w.when === "flagged") return it.urgent;
  if (w.when === "stale") return (it.stale ?? 0) >= STALE_DAYS;
  if (w.when === "waiting") return it.waitingCount > 0;
  return true;
}

/** ชื่อที่โชว์ เช่น "งานออกแบบ Pixie Dustie, Louis Montini · ไม่ขยับเกิน 7 วัน" */
export function watchLabel(w: MyWatch, brandName: (id: string) => string | undefined): string {
  if (w.name) return w.name;
  const src = watchSource(w.source);
  const brands = w.brand_ids.map((id) => brandName(id)).filter(Boolean);
  const who = src?.brands ? (brands.length ? brands.join(", ") : "ทุกแบรนด์") : "";
  const when = w.when === "all" ? "" : ` · ${src?.when.find((x) => x.key === w.when)?.label ?? ""}`;
  return `${src?.key === "design_pending" ? "งานออกแบบ" : src?.label ?? ""} ${who}`.trim() + when;
}

export const newWatchId = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
