/**
 * มุมมองด่วน (Quick Views) ของแท็บรอจ่าย — กติกากลาง (ตัวคำนวณล้วน ไม่มี UI → test ได้)
 * --------------------------------------------------------------------------
 * 1 มุมมอง = กรอง (แบรนด์หลายอัน · OEM/แบรนด์เรา · เงื่อนไขผสม ทุกข้อ/ข้อใดข้อหนึ่ง)
 *          + หน้าตา (ตาราง/การ์ด · ขนาดการ์ด · ช่อง/คอลัมน์) + เรียงหลัก/รอง/ทิศ + จัดกลุ่ม
 * เก็บ 2 ชั้น (./use-quick-views):
 *   👥 มุมมองของทีม = ui_config "admin_wb_quick_views" (แอดมินแก้) + ตั้ง "ใครเห็น" ทุกคน / เฉพาะตำแหน่ง / เฉพาะคน
 *   👤 มุมมองของฉัน + ปุ่มทีมที่ซ่อน + ความกว้างคอลัมน์เฉพาะตัว = useUserPref("wb_quick_views_mine")
 * หน้าบอร์ดแปลงใบสั่งผลิตเป็น QvRow (ค่าที่ต้องใช้คิดไว้แล้ว) ก่อนส่งเข้า qvMatch / qvSort
 */

export type QvCond = "late" | "due7" | "flag" | "short" | "ready" | "nodue" | "noprice";
export type QvSort = "urgent" | "late" | "due" | "age" | "stage" | "buy" | "left" | "value" | "brand" | "sku" | "none";
export type QvDir = "asc" | "desc";
export type QvGroup = "none" | "stage" | "brand" | "group" | "ready";
export type QvOwn = "all" | "oem" | "own";

export type QuickView = {
  id: string;
  name: string;
  icon: string;                 // อีโมจิบนปุ่ม
  brands: string[];             // ว่าง = ทุกแบรนด์ · "__none__" = ใบที่ไม่ระบุแบรนด์
  own: QvOwn;                   // งานลูกค้า OEM / แบรนด์เรา
  mode: "any" | "all";          // เงื่อนไข: ข้อใดข้อหนึ่ง / ทุกข้อ
  conds: QvCond[];
  layout: "table" | "cards";
  size: "s" | "m" | "l";        // ขนาดการ์ด
  cols: string[] | null;        // คอลัมน์ตาราง (null = ใช้คอลัมน์ปกติของชุด/ของแต่ละคน)
  cardFields: string[];         // ช่องบนการ์ด
  sort1: QvSort; dir1: QvDir;
  sort2: QvSort; dir2: QvDir;   // ถ้าค่าเรียงหลักเท่ากัน
  group: QvGroup;
  show: boolean;                // โชว์บนแถบ
  widths: Record<string, number>;   // ความกว้างคอลัมน์ที่ลากปรับแล้ว (px ต่อ key)
  fit: boolean;                 // พอดีเนื้อหา (คอลัมน์ไม่ยืดกินที่ว่าง)
};

/** มุมมองของทีม = มุมมอง + ใครเห็นปุ่มนี้ (role = admin/manager/staff · users = id ผู้ใช้) */
export type QvAudience = "all" | "roles" | "users";
export type TeamView = QuickView & { aud: QvAudience; roles: string[]; users: string[] };
/** ของแต่ละคน: มุมมองของฉัน + ปุ่มทีมที่ซ่อน + ความกว้างคอลัมน์ของมุมมองทีม (เฉพาะตัว) */
export type QvMine = { views: QuickView[]; hidden: string[]; widthOverride: Record<string, Record<string, number>> };

/** ค่าของใบ 1 ใบที่มุมมองต้องใช้ (หน้าบอร์ดคิดให้) */
export type QvRow = {
  brand: string | null; oem: boolean;
  late: number;                 // เลยกำหนดกี่วัน (0 = ไม่เลย)
  dueIn: number | null;         // อีกกี่วันถึงกำหนดใกล้สุด (ติดลบ = เลยแล้ว · null = ไม่มีวันส่ง)
  flag: number;                 // ธงเร่งจากผู้บริหาร (0/1/2)
  short: boolean; ready: boolean;
  noprice: boolean | null;      // null = ไม่รู้ (ไม่ใช่แอดมิน/ยังโหลดราคาไม่เสร็จ)
  age: number;                  // สร้างมากี่วัน
  stage: number;                // ลำดับขั้นตอน (น้อย = ค้างต้นทาง)
  buy: number;                  // ของที่ยังต้องซื้อ/รออนุมัติ (รายการ)
  left: number; value: number; sku: string;
};

export const QV_CONDS: [QvCond, string][] = [
  ["late", "เกินกำหนดส่ง"], ["due7", "ส่งภายใน 7 วัน"], ["flag", "ผู้บริหารติดธงเร่ง"], ["short", "ของยังไม่ครบ"],
  ["ready", "พร้อมจ่าย"], ["nodue", "ยังไม่มีกำหนดส่ง"], ["noprice", "ยังไม่ตั้งราคา (แอดมิน)"],
];
export const QV_SORTS: [QvSort, string, QvDir][] = [
  ["urgent", "ด่วนสุด (เลยกำหนด → ธงเร่ง → ใกล้ส่ง)", "desc"], ["late", "เลยกำหนดกี่วัน", "desc"], ["due", "กำหนดส่ง (ใกล้สุดก่อน)", "asc"],
  ["age", "อายุใบ (สร้างนานสุดก่อน)", "desc"], ["stage", "ขั้นตอน (ค้างต้นทางก่อน)", "asc"], ["buy", "ของที่ยังต้องซื้อ (รายการ)", "desc"],
  ["left", "จำนวนที่เหลือจ่าย", "desc"], ["value", "มูลค่า (แอดมิน)", "desc"], ["brand", "แบรนด์ (ก → ฮ)", "asc"], ["sku", "รหัสสินค้า (ก → ฮ)", "asc"],
  ["none", "— ไม่เรียง —", "asc"],
];
export const QV_GROUPS: [QvGroup, string][] = [["none", "ไม่จัดกลุ่ม"], ["stage", "ตามขั้นตอน"], ["brand", "ตามแบรนด์"], ["group", "ตามกลุ่ม"], ["ready", "ตามความพร้อม"]];
export const QV_CARD_FIELDS: [string, string][] = [
  ["img", "รูป"], ["prod", "สินค้า"], ["mo", "เลขใบ"], ["left", "เหลือจ่าย"], ["due", "กำหนดส่ง"], ["stage", "ขั้นตอน"],
  ["buy", "ซื้อของ"], ["brand", "แบรนด์"], ["value", "มูลค่า (แอดมิน)"], ["created", "สร้างเมื่อ"],
];
export const QV_ICONS = ["📋", "🔥", "⏰", "🛒", "✅", "🧾", "📅", "❔", "⭐", "🏷", "👜", "🚚", "📦", "🎯"];
/** การ์ด: ความกว้างขั้นต่ำต่อใบ (เล็ก/กลาง/ใหญ่) → จำนวนใบต่อแถวปรับตามจอเอง */
export const QV_CARD_MIN: Record<QuickView["size"], string> = { s: "180px", m: "240px", l: "330px" };

const base = (id: string, name: string, icon: string, p: Partial<QuickView>): QuickView => ({
  id, name, icon, brands: [], own: "all", mode: "any", conds: [], layout: "table", size: "m", cols: null,
  cardFields: ["img", "prod", "left", "due", "stage"], sort1: "none", dir1: "desc", sort2: "none", dir2: "asc", group: "none", show: true,
  widths: {}, fit: false, ...p,
});

/** ชุด "ปกติ" — เหมือนปุ่มกรองด่วนเดิม (ตาราง) */
export const QV_DEFAULT_NORMAL: QuickView[] = [
  base("all", "ทั้งหมด", "📋", {}),
  base("late", "เกินกำหนด", "⏰", { conds: ["late"], sort1: "late", dir1: "desc" }),
  base("short", "ของยังไม่ครบ", "🛒", { conds: ["short"], sort1: "buy", dir1: "desc", sort2: "due", dir2: "asc" }),
  base("ready", "พร้อมจ่าย", "✅", { conds: ["ready"], sort1: "due", dir1: "asc" }),
  base("noprice", "ยังไม่ตั้งราคา", "🏷", { conds: ["noprice"] }),
  base("rush", "งานเร่ง", "🔥", { conds: ["flag"], sort1: "urgent", dir1: "desc" }),
];
/** ชุด "โหมดง่าย" — ตามข้อแนะนำจากข้อมูลจริง (การ์ดอ่านง่าย · ด่วน = หลายเงื่อนไขรวม · แยกงานลูกค้า OEM · ไล่ตั้งวันส่งแบรนด์เรา) */
export const QV_DEFAULT_SIMPLE: QuickView[] = [
  base("all", "ทั้งหมด", "📋", { layout: "cards", size: "m", sort1: "urgent", dir1: "desc", sort2: "age", dir2: "desc" }),
  base("hot", "ของด่วน", "🔥", { conds: ["late", "due7", "flag"], mode: "any", layout: "cards", size: "l", cardFields: ["img", "prod", "due", "stage", "left"], sort1: "late", dir1: "desc", sort2: "value", dir2: "desc" }),
  base("oem", "งานลูกค้า OEM", "🧾", { own: "oem", layout: "cards", size: "m", sort1: "due", dir1: "asc", sort2: "late", dir2: "desc" }),
  base("short", "ของยังไม่ครบ", "🛒", { conds: ["short"], layout: "table", cols: ["img", "prod", "buy", "eta", "stage", "due"], sort1: "buy", dir1: "desc", sort2: "due", dir2: "asc", group: "brand" }),
  base("ready", "พร้อมจ่าย", "✅", { conds: ["ready"], layout: "cards", size: "s", cardFields: ["img", "prod", "left", "due"], sort1: "due", dir1: "asc" }),
  base("ownnodue", "แบรนด์เรา ยังไม่มีวันส่ง", "📅", { own: "own", conds: ["nodue"], mode: "all", layout: "table", cols: ["img", "prod", "created", "qty", "stage", "due"], sort1: "age", dir1: "desc", sort2: "brand", dir2: "asc" }),
  base("nobrand", "ยังไม่ระบุแบรนด์", "❔", { brands: ["__none__"], layout: "table" }),
];

/** มุมมองของทีมตั้งต้น (ยังไม่มีแอดมินบันทึก) — รวมของเดิม + ข้อแนะนำจากข้อมูลจริง · ทุกคนเห็น */
const team = (v: QuickView): TeamView => ({ ...v, aud: "all", roles: [], users: [] });
export const QV_DEFAULT_TEAM: TeamView[] = [
  base("all", "ทั้งหมด", "📋", {}),
  base("hot", "ของด่วน", "🔥", { conds: ["late", "due7", "flag"], mode: "any", layout: "cards", size: "l", cardFields: ["img", "prod", "due", "stage", "left"], sort1: "late", dir1: "desc", sort2: "value", dir2: "desc" }),
  base("oem", "งานลูกค้า OEM", "🧾", { own: "oem", sort1: "due", dir1: "asc", sort2: "late", dir2: "desc" }),
  base("late", "เกินกำหนด", "⏰", { conds: ["late"], sort1: "late", dir1: "desc" }),
  base("short", "ของยังไม่ครบ", "🛒", { conds: ["short"], sort1: "buy", dir1: "desc", sort2: "due", dir2: "asc", group: "brand" }),
  base("ready", "พร้อมจ่าย", "✅", { conds: ["ready"], layout: "cards", size: "s", cardFields: ["img", "prod", "left", "due"], sort1: "due", dir1: "asc" }),
  base("noprice", "ยังไม่ตั้งราคา", "🏷", { conds: ["noprice"] }),
  base("ownnodue", "แบรนด์เรา ยังไม่มีวันส่ง", "📅", { own: "own", conds: ["nodue"], mode: "all", sort1: "age", dir1: "desc", sort2: "brand", dir2: "asc" }),
  base("nobrand", "ยังไม่ระบุแบรนด์", "❔", { brands: ["__none__"] }),
].map(team);

/** คนนี้เห็นปุ่มทีมนี้ไหม (UX เท่านั้น — ไม่ใช่ด่านความปลอดภัย) */
export function qvAudienceOk(v: TeamView, user: { id?: string | null; role?: string | null } | null | undefined): boolean {
  if (v.aud === "all") return true;
  if (!user) return false;
  if (v.aud === "roles") return !!user.role && v.roles.includes(user.role);
  return !!user.id && v.users.includes(user.id);
}

// ---- อ่านค่าจาก DB/pref แบบปลอดภัย (ค่าเพี้ยน = ตัดทิ้ง/เติมค่าตั้งต้น) ----
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (typeof v === "string" && (opts as readonly string[]).includes(v) ? (v as T) : d);
const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const CONDS = QV_CONDS.map(([k]) => k), SORTS = QV_SORTS.map(([k]) => k), GROUPS = QV_GROUPS.map(([k]) => k);
export function parseViews(v: unknown): QuickView[] | null {
  if (!Array.isArray(v)) return null;
  const out: QuickView[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id ? o.id : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id, name: typeof o.name === "string" && o.name.trim() ? o.name.slice(0, 40) : "มุมมอง",
      icon: typeof o.icon === "string" && o.icon ? o.icon.slice(0, 4) : "📋",
      brands: strArr(o.brands), own: oneOf(o.own, ["all", "oem", "own"] as const, "all"),
      mode: oneOf(o.mode, ["any", "all"] as const, "any"), conds: strArr(o.conds).filter((c): c is QvCond => (CONDS as string[]).includes(c)),
      layout: oneOf(o.layout, ["table", "cards"] as const, "table"), size: oneOf(o.size, ["s", "m", "l"] as const, "m"),
      cols: Array.isArray(o.cols) ? strArr(o.cols) : null, cardFields: Array.isArray(o.cardFields) ? strArr(o.cardFields) : ["img", "prod", "left", "due", "stage"],
      sort1: oneOf(o.sort1, SORTS, "none"), dir1: oneOf(o.dir1, ["asc", "desc"] as const, "desc"),
      sort2: oneOf(o.sort2, SORTS, "none"), dir2: oneOf(o.dir2, ["asc", "desc"] as const, "asc"),
      group: oneOf(o.group, GROUPS, "none"), show: o.show !== false,
      widths: numMap(o.widths), fit: o.fit === true,
    });
  }
  return out.length ? out : null;
}
const numMap = (v: unknown): Record<string, number> => (v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "number" && x >= 40 && x <= 2000).map(([k, x]) => [k, Math.round(x as number)]))
  : {});
/** มุมมองของทีม (มี "ใครเห็น") — ว่าง/เพี้ยน = null (ใช้ค่าตั้งต้น) */
export function parseTeamViews(v: unknown): TeamView[] | null {
  const raw = Array.isArray(v) ? v : v && typeof v === "object" && Array.isArray((v as { views?: unknown }).views) ? (v as { views: unknown[] }).views : null;
  const base = parseViews(raw);
  if (!base || !raw) return null;
  const byId = new Map((raw as Record<string, unknown>[]).filter((x) => x && typeof x === "object").map((x) => [String(x.id), x]));
  return base.map((b) => {
    const o = byId.get(b.id) ?? {};
    return { ...b, aud: oneOf(o.aud, ["all", "roles", "users"] as const, "all"), roles: strArr(o.roles), users: strArr(o.users) };
  });
}
export const QV_MINE_DEFAULT: QvMine = { views: [], hidden: [], widthOverride: {} };
export function parseMine(v: unknown): QvMine | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const wo = o.widthOverride && typeof o.widthOverride === "object" ? o.widthOverride as Record<string, unknown> : {};
  return { views: parseViews(o.views) ?? [], hidden: strArr(o.hidden), widthOverride: Object.fromEntries(Object.entries(wo).map(([k, x]) => [k, numMap(x)])) };
}

/** ใบนี้อยู่ในมุมมองไหม — แบรนด์ → OEM/แบรนด์เรา → เงื่อนไข (noprice ที่ยังไม่รู้ = ไม่ผ่าน) */
export function qvMatch(v: QuickView, r: QvRow): boolean {
  if (v.brands.length && !v.brands.includes(r.brand || "__none__")) return false;
  if (v.own === "oem" && !r.oem) return false;
  if (v.own === "own" && (r.oem || !r.brand)) return false;
  if (!v.conds.length) return true;
  const hit = (c: QvCond) =>
    c === "late" ? r.late > 0
    : c === "due7" ? r.dueIn != null && r.dueIn >= 0 && r.dueIn <= 7
    : c === "flag" ? r.flag > 0
    : c === "short" ? r.short
    : c === "ready" ? r.ready
    : c === "nodue" ? r.dueIn == null
    : r.noprice === true;
  return v.mode === "all" ? v.conds.every(hit) : v.conds.some(hit);
}

// ค่าที่ใช้เรียง (ตัวเลข/ข้อความ) — "ด่วนสุด" รวมหลายอย่างเป็นคะแนนเดียว
const NO_DUE = 99999;
function sortKey(k: QvSort, r: QvRow): number | string {
  switch (k) {
    case "urgent": return r.late * 1e6 + r.flag * 1e5 + (r.dueIn == null ? 0 : Math.max(0, 9999 - Math.max(0, r.dueIn))) - r.stage;
    case "late": return r.late;
    case "due": return r.dueIn == null ? NO_DUE : r.dueIn;
    case "age": return r.age;
    case "stage": return r.stage;
    case "buy": return r.buy;
    case "left": return r.left;
    case "value": return r.value;
    case "brand": return r.brand ?? "￿";
    case "sku": return r.sku;
    default: return 0;
  }
}
const cmpOne = (k: QvSort, d: QvDir, a: QvRow, b: QvRow) => {
  if (k === "none") return 0;
  const x = sortKey(k, a), y = sortKey(k, b);
  // ไม่มีวันส่ง/ไม่มีแบรนด์ อยู่ท้ายเสมอ ไม่ว่าทิศไหน
  if (k === "due" && (x === NO_DUE) !== (y === NO_DUE)) return x === NO_DUE ? 1 : -1;
  const r = typeof x === "string" ? x.localeCompare(String(y), "th") : x - (y as number);
  return d === "desc" ? -r : r;
};
/** เรียงตามมุมมอง (หลัก → รอง) · เท่ากันหมด = ลำดับเดิม */
export function qvSort<T>(rows: T[], rowOf: (x: T) => QvRow, v: QuickView): T[] {
  if (v.sort1 === "none" && v.sort2 === "none") return rows;
  const cache = new Map<T, QvRow>();
  const get = (x: T) => { let r = cache.get(x); if (!r) { r = rowOf(x); cache.set(x, r); } return r; };
  return rows.map((x, i) => [x, i] as const)
    .sort(([a, ia], [b, ib]) => cmpOne(v.sort1, v.dir1, get(a), get(b)) || cmpOne(v.sort2, v.dir2, get(a), get(b)) || ia - ib)
    .map(([x]) => x);
}

/** มุมมองที่โชว์ได้สำหรับคนนี้ (ยังไม่ตั้งราคา = เฉพาะคนเห็นเงิน) */
export const qvVisible = (views: QuickView[], canSeeMoney: boolean) =>
  views.filter((v) => v.show && (canSeeMoney || !v.conds.includes("noprice")));

/** สรุปเป็นภาษาคน — โชว์ในตัวตั้งค่า */
export function qvSummary(v: QuickView): string {
  const b = v.brands.length ? v.brands.map((x) => (x === "__none__" ? "ไม่ระบุแบรนด์" : x)).join(", ") : "ทุกแบรนด์";
  const o = v.own === "oem" ? " (เฉพาะงานลูกค้า OEM)" : v.own === "own" ? " (เฉพาะแบรนด์เรา)" : "";
  const c = v.conds.length ? v.conds.map((k) => QV_CONDS.find(([x]) => x === k)?.[1] ?? k).join(v.mode === "all" ? " และ " : " หรือ ") : "ทุกใบ";
  const s1 = QV_SORTS.find(([k]) => k === v.sort1)?.[1].split(" (")[0];
  const s2 = QV_SORTS.find(([k]) => k === v.sort2)?.[1].split(" (")[0];
  const srt = v.sort1 === "none" ? "" : ` · เรียงตาม${s1} ${v.dir1 === "desc" ? "มาก→น้อย" : "น้อย→มาก"}${v.sort2 !== "none" ? ` แล้วตาม${s2}` : ""}`;
  return `โชว์ใบของ ${b}${o} ที่ ${c}${srt} · แสดงเป็น${v.layout === "cards" ? `การ์ด${({ s: "เล็ก", m: "กลาง", l: "ใหญ่" })[v.size]}` : "ตาราง"}`;
}

/** ใช้เมื่อชุดหน้าตาไม่มีมุมมองที่โชว์ได้เลย (= ทุกใบ ไม่เรียง) */
export const QV_FALLBACK: QuickView = base("all", "ทั้งหมด", "📋", {});

/** มุมมองใหม่ (ปุ่ม ＋ / บันทึกเป็นมุมมอง) */
export const qvNew = (p: Partial<QuickView> = {}): QuickView =>
  base(`v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, "มุมมองใหม่", "⭐", p);
