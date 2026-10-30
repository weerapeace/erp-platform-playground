/**
 * 📐 ของกลาง — "ใส่ได้ไหม / ใส่ได้กี่ตัว" (pure: ใช้ได้ทั้งหน้าจอ ERP · API · เว็บร้าน — ห้ามใส่ "use client")
 *
 *   ช่องใส่ของของกระเป๋า  = parent_skus_v2.compartments [{id,name,name_en,w,h,d,window,area}] (ขนาดด้านใน ซม.)
 *                            null = ยังไม่ได้วัด · [] = ไม่มีช่องใส่ของ (ไม่ใช่กระเป๋า)
 *                            area = กรอบของช่องบนรูปสินค้า (% ของรูป + ทรง) — ป๊อป 📏 เทียบขนาด วาดเส้นช่องทับรูป
 *   ของ/ตุ๊กตาที่จะใส่      = product_fit_items ที่มี width/height/depth_cm (is_soft = นุ่ม บีบได้ · squeeze_pct = บีบได้กี่ %)
 *
 * กฎ (ตั้งใจให้เข้าใจง่าย อธิบายลูกค้าได้):
 *   - หมุนของได้ทุกด้าน (ลองทุกท่า เลือกท่าที่ใส่ได้มากสุด)
 *   - ใส่สบาย  = ทุกด้านเล็กกว่าช่อง และเหลือที่ว่าง ≥ 0.5 ซม.
 *   - พอดี (แน่น) = ใส่ได้แต่ชิดขอบ (< 0.5 ซม.) หรือของนุ่มต้องบีบถึงจะเข้า (บีบได้ตามที่ตั้งต่อตัว · ไม่ตั้ง = 10%)
 *   - จำนวน = วางเรียงเป็นตาราง (ไม่วางซ้อนเหลื่อม) — เป็น "ค่าประมาณ" เสมอ
 */

/** ทรงของเส้นกรอบช่องบนรูป (หัวใจ/วงกลม ฯลฯ ยืดตามกรอบที่ลาก) */
export type AreaShape = "rect" | "round" | "ellipse" | "heart";
export const AREA_SHAPES: { key: AreaShape; th: string; en: string }[] = [
  { key: "round", th: "สี่เหลี่ยมมุมมน", en: "Rounded" },
  { key: "rect", th: "สี่เหลี่ยม", en: "Rectangle" },
  { key: "ellipse", th: "วงกลม / วงรี", en: "Oval" },
  { key: "heart", th: "หัวใจ", en: "Heart" },
];

/** กรอบของช่องบนรูป — x/y/w/h เป็น % ของรูป (0–100) · img = R2 key ของรูปที่ใช้ (ว่าง = รูปปก) */
export interface CompartmentArea {
  img?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape?: AreaShape;
}

export interface Compartment {
  id: string;
  name: string;
  /** ชื่อช่องภาษาอังกฤษ (หน้าเว็บ /en สลับเองด้วย localizeContent) */
  name_en?: string;
  /** กว้าง × สูง × หนา ด้านใน (ซม.) */
  w: number;
  h: number;
  d: number;
  /** ช่องโชว์ (หน้าใส) */
  window?: boolean;
  /** ตำแหน่งของช่องบนรูปสินค้า · ไม่มี = ป๊อปวาดเป็นกรอบเปล่าตามสัดส่วน */
  area?: CompartmentArea;
}

export interface FitTarget {
  id: string;
  name: string;
  w: number;
  h: number;
  d: number;
  /** นุ่ม บีบได้ (ตุ๊กตาผ้า) */
  soft?: boolean;
  /** ขนาดเป็นค่าประมาณ (ยังไม่ได้วัดของจริง) */
  estimated?: boolean;
  /** doll = ตุ๊กตา/ฟิกเกอร์ (นับเป็น "ตัว") · item = ของใช้ (นับเป็น "ชิ้น") */
  kind?: "item" | "doll";
  /** รูป (R2 key) — ปุ่มเลือกบนเว็บ · ว่าง = โชว์แค่ชื่อ */
  imageKey?: string | null;
  /** ของนุ่มบีบได้กี่ส่วน (0.25 = 25%) — ไม่มี = ค่ากลาง 10% · ใช้เฉพาะ soft */
  squeeze?: number;
  /** ชื่ออังกฤษ (หน้าเว็บ /en สลับเองด้วย localizeContent) */
  name_en?: string;
}

export type FitStatus = "roomy" | "snug";
export interface FitResult {
  status: FitStatus;
  /** ใส่ได้ประมาณกี่ชิ้น (≥ 1) */
  count: number;
  compartment: Compartment;
}

/** ของนุ่มบีบได้กี่ % (0.9 = เล็กลงได้ 10%) — ค่ากลางเมื่อไม่ได้ตั้ง squeeze_pct ต่อตัว */
export const SOFT_SQUEEZE = 0.9;
/** ตั้ง "บีบได้" ต่อตัวได้สูงสุด 50% */
export const MAX_SQUEEZE = 0.5;
/** เหลือที่ว่างน้อยกว่านี้ (ซม.) = "พอดี แน่น" */
export const SNUG_GAP_CM = 0.5;
/** ช่องในกระเป๋า 1 รุ่น สูงสุด */
export const MAX_COMPARTMENTS = 8;
const MAX_CM = 300;

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 && x <= MAX_CM ? Math.round(x * 10) / 10 : 0;
};

/** อ่านค่าจาก DB/ฟอร์ม → null (ยังไม่วัด) · [] (ไม่มีช่อง) · รายการช่องที่ขนาดครบ */
export function parseCompartments(raw: unknown): Compartment[] | null {
  let v = raw;
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(v)) return null;
  const out: Compartment[] = [];
  for (const x of v as Record<string, unknown>[]) {
    const w = n(x?.w), h = n(x?.h), d = n(x?.d);
    if (!w || !h || !d) continue;
    const nameEn = typeof x?.name_en === "string" ? x.name_en.trim().slice(0, 40) : "";
    const area = parseArea(x?.area);
    out.push({
      id: String(x?.id ?? "").slice(0, 40) || `c${out.length + 1}`,
      name: String(x?.name ?? "").trim().slice(0, 40) || `ช่องที่ ${out.length + 1}`,
      ...(nameEn ? { name_en: nameEn } : {}),
      w, h, d,
      ...(x?.window === true ? { window: true } : {}),
      ...(area ? { area } : {}),
    });
    if (out.length >= MAX_COMPARTMENTS) break;
  }
  return out;
}

const pct = (v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(Math.min(100, Math.max(0, x)) * 100) / 100 : null;
};

/** กรอบบนรูป → ค่าที่ใช้ได้ (ตัดให้อยู่ในรูป · เล็กกว่า 1% = ไม่นับ) · ไม่ครบ = null */
export function parseArea(raw: unknown): CompartmentArea | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const x = pct(a.x), y = pct(a.y), w = pct(a.w), h = pct(a.h);
  if (x === null || y === null || w === null || h === null) return null;
  const cw = Math.min(w, 100 - x), ch = Math.min(h, 100 - y);
  if (cw < 1 || ch < 1) return null;
  const shape = AREA_SHAPES.some((s) => s.key === a.shape) ? (a.shape as AreaShape) : undefined;
  const img = typeof a.img === "string" ? a.img.trim().slice(0, 300) : "";
  return { ...(img ? { img } : {}), x, y, w: Math.round(cw * 100) / 100, h: Math.round(ch * 100) / 100, ...(shape && shape !== "round" ? { shape } : {}) };
}

/** เส้นกรอบของช่อง (SVG path) ในกล่อง x,y,w,h — ทรงยืดตามกล่อง · ใช้ทั้งตัวลากใน ERP และป๊อปบนเว็บ (ต้องเหมือนกัน) */
export function areaPath(shape: AreaShape | undefined, x: number, y: number, w: number, h: number): string {
  const f = (v: number) => Math.round(v * 100) / 100;
  if (shape === "rect") return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
  if (shape === "ellipse") {
    const rx = f(w / 2), ry = f(h / 2), cy = f(y + h / 2);
    return `M${f(x)} ${cy}A${rx} ${ry} 0 1 0 ${f(x + w)} ${cy}A${rx} ${ry} 0 1 0 ${f(x)} ${cy}Z`;
  }
  if (shape === "heart") {
    // หัวใจในกล่อง 0–1 แล้วยืดตามกรอบ
    const pts = [
      [0.5, 0.24], [0.5, 0.1], [0.36, 0], [0.23, 0], [0.09, 0], [0, 0.12], [0, 0.29], [0, 0.56], [0.3, 0.76], [0.5, 1],
      [0.7, 0.76], [1, 0.56], [1, 0.29], [1, 0.12], [0.91, 0], [0.77, 0], [0.64, 0], [0.5, 0.1], [0.5, 0.24],
    ].map(([px, py]) => `${f(x + px * w)} ${f(y + py * h)}`);
    return `M${pts[0]}C${pts[1]} ${pts[2]} ${pts[3]}C${pts[4]} ${pts[5]} ${pts[6]}C${pts[7]} ${pts[8]} ${pts[9]}C${pts[10]} ${pts[11]} ${pts[12]}C${pts[13]} ${pts[14]} ${pts[15]}C${pts[16]} ${pts[17]} ${pts[18]}Z`;
  }
  const r = f(Math.min(w, h) * 0.18);
  return `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${r} ${r} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${r} ${r} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${r} ${r} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${r} ${r} 0 0 1 ${f(x + r)} ${f(y)}Z`;
}

/** ตรวจข้อมูลจากฟอร์ม (บอกว่าต้องแก้อะไร ไม่เดาค่าให้) · null = ผ่าน */
export function compartmentsProblem(rows: { name?: unknown; w?: unknown; h?: unknown; d?: unknown }[]): string | null {
  if (rows.length > MAX_COMPARTMENTS) return `ใส่ได้ไม่เกิน ${MAX_COMPARTMENTS} ช่อง`;
  for (const [i, r] of rows.entries()) {
    const label = String(r.name ?? "").trim() || `ช่องที่ ${i + 1}`;
    for (const [k, t] of [["w", "กว้าง"], ["h", "สูง"], ["d", "หนา"]] as const) {
      const v = Number(r[k]);
      if (r[k] === "" || r[k] === null || r[k] === undefined || !Number.isFinite(v) || v <= 0) return `${label}: ใส่${t} (ซม.) ให้ครบ`;
      if (v > MAX_CM) return `${label}: ${t} ${v} ซม. ดูมากเกินไป — ตรวจตัวเลขอีกครั้ง`;
    }
  }
  return null;
}

const PERMS: [number, number, number][] = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
];

/** บีบได้เหลือกี่ส่วน (0.9 = เล็กลงได้ 10%) — ของแข็ง = 1 · ของนุ่มไม่ตั้ง = ค่ากลาง SOFT_SQUEEZE */
export const squeezeFactor = (item: Pick<FitTarget, "soft" | "squeeze">): number =>
  !item.soft ? 1 : typeof item.squeeze === "number" && item.squeeze >= 0 && item.squeeze <= MAX_SQUEEZE ? 1 - item.squeeze : SOFT_SQUEEZE;

/** ท่าที่ดีที่สุด + ขนาดของตามแนว กว้าง/สูง/หนา ของช่อง (ป๊อปเทียบขนาดวาดภาพหน้า/ข้าง) · ใส่ไม่ได้ = null */
export function fitPose(item: Pick<FitTarget, "w" | "h" | "d" | "soft" | "squeeze">, comp: Pick<Compartment, "w" | "h" | "d">): { status: FitStatus; count: number; along: [number, number, number]; squeezed: boolean } | null {
  const it = [item.w, item.h, item.d];
  const c = [comp.w, comp.h, comp.d];
  if (it.some((x) => !(x > 0)) || c.some((x) => !(x > 0))) return null;
  const sq = squeezeFactor(item);
  let best: { status: FitStatus; count: number; along: [number, number, number]; squeezed: boolean } | null = null;
  for (const p of PERMS) {
    const a: [number, number, number] = [it[p[0]], it[p[1]], it[p[2]]];
    let squeezed = false;
    let ok = true;
    for (let i = 0; i < 3; i++) {
      if (a[i] <= c[i]) continue;
      if (sq < 1 && a[i] * sq <= c[i]) squeezed = true;
      else ok = false;
    }
    if (!ok) continue;
    const tight = squeezed || a.some((x, i) => c[i] - x < SNUG_GAP_CM);
    // จำนวน: วางเรียงตามท่านี้ (ของนุ่มที่ต้องบีบนับ 1 ชิ้น)
    const count = squeezed ? 1 : Math.max(1, Math.floor(c[0] / a[0]) * Math.floor(c[1] / a[1]) * Math.floor(c[2] / a[2]));
    const cand = { status: (tight ? "snug" : "roomy") as FitStatus, count, along: a, squeezed };
    if (!best || rank(cand) > rank(best)) best = cand;
  }
  return best;
}

/** ของ 1 ชิ้นใส่ช่องนี้ได้ไหม (ลองทุกท่า) → สถานะ + จำนวนโดยประมาณ · ใส่ไม่ได้ = null */
export function fitInto(item: Pick<FitTarget, "w" | "h" | "d" | "soft" | "squeeze">, comp: Pick<Compartment, "w" | "h" | "d">): { status: FitStatus; count: number } | null {
  const r = fitPose(item, comp);
  return r ? { status: r.status, count: r.count } : null;
}

/** สบายดีกว่าแน่น · แล้วใส่ได้มากกว่าดีกว่า */
const rank = (r: { status: FitStatus; count: number }) => (r.status === "roomy" ? 1_000_000 : 0) + r.count;

/** ช่องที่ดีที่สุดในกระเป๋าสำหรับของชิ้นนี้ · ไม่มีช่องไหนใส่ได้ = null */
export function bestFit(item: FitTarget, comps: Compartment[]): FitResult | null {
  let best: FitResult | null = null;
  for (const c of comps) {
    const r = fitInto(item, c);
    if (r && (!best || rank(r) > rank(best))) best = { ...r, compartment: c };
  }
  return best;
}

/** ผลของทุกรายการกับกระเป๋า 1 ใบ (ใส่ได้ก่อน เรียงตามลำดับเดิม) */
export function fitReport(items: FitTarget[], comps: Compartment[]): { item: FitTarget; result: FitResult | null }[] {
  const rows = items.map((item) => ({ item, result: bestFit(item, comps) }));
  return [...rows.filter((r) => r.result), ...rows.filter((r) => !r.result)];
}

/** แถว product_fit_items → ของที่คำนวณได้ (ขนาดไม่ครบ / ปิดใช้ = null) */
export function fitTargetOf(row: {
  id: string; name: string; name_en?: string | null; width_cm?: unknown; height_cm?: unknown; depth_cm?: unknown;
  is_soft?: unknown; size_estimated?: unknown; is_active?: unknown; kind?: unknown; image_key?: unknown; squeeze_pct?: unknown;
}, lang: "th" | "en" = "th"): FitTarget | null {
  if (row.is_active === false) return null;
  const w = n(row.width_cm), h = n(row.height_cm), d = n(row.depth_cm);
  if (!w || !h || !d) return null;
  const soft = row.is_soft === true;
  // บีบได้กี่ % (ตั้งต่อตัว · ว่าง = ค่ากลาง 10%) — มีผลเฉพาะของนุ่ม
  const sp = row.squeeze_pct === null || row.squeeze_pct === undefined || row.squeeze_pct === "" ? NaN : Number(row.squeeze_pct);
  const nameEn = row.name_en?.trim();
  return {
    id: row.id,
    name: (lang === "en" && nameEn) || row.name,
    w, h, d,
    soft,
    estimated: row.size_estimated === true,
    kind: row.kind === "doll" ? "doll" : "item",
    ...(typeof row.image_key === "string" && row.image_key.trim() ? { imageKey: row.image_key.trim() } : {}),
    ...(soft && Number.isFinite(sp) ? { squeeze: Math.min(MAX_SQUEEZE, Math.max(0, sp / 100)) } : {}),
    ...(nameEn ? { name_en: nameEn } : {}),
  };
}

/** ชื่อของที่ใส่ได้ (ไม่มีจำนวน) — ตัวกรองหน้ารวมสินค้า "ใส่อะไรได้" (ชื่อเดียวกันรวมเป็นตัวเลือกเดียว) */
export function fitNames(comps: Compartment[] | null, targets: FitTarget[]): string[] {
  if (!comps?.length) return [];
  return fitReport(targets, comps).flatMap((r) => (r.result ? [r.item.name] : []));
}

/** หน่วยนับ: ตุ๊กตา = ตัว · ของใช้ = ชิ้น */
export const fitUnit = (t: Pick<FitTarget, "kind">, lang: "th" | "en" = "th") => (lang === "en" ? "" : t.kind === "doll" ? "ตัว" : "ชิ้น");

/**
 * เติมบรรทัด "ใส่ได้ … ประมาณ N ตัว" (เฉพาะของที่ใส่ได้) ต่อท้ายรายการ "ใส่ได้" เดิมของหัวข้อขนาด
 * ไม่มีช่อง/ไม่มีของที่มีขนาด/ไม่มีอะไรใส่ได้ = คืนค่าเดิม · เดิมว่าง (undefined) แต่ใส่ได้ = สร้างใหม่ (rows ว่าง)
 * ใช้ที่ products API (เว็บร้าน: หัวข้อขนาด + ป๊อป 📏 เทียบขนาด อ่านรายการนี้)
 */
export function withFitLines<R>(d: { fits: string[]; rows: R[] } | undefined, comps: Compartment[] | null, targets: FitTarget[], lang: "th" | "en" = "th"): { fits: string[]; rows: R[] } | undefined {
  if (!comps?.length || !targets.length) return d;
  const labels = fitReport(targets, comps).flatMap((r) => (r.result ? [fitLabel(r.item, r.result, lang)] : []));
  return labels.length ? { fits: [...(d?.fits ?? []), ...labels], rows: d?.rows ?? [] } : d;
}

/** บรรทัด "ใส่ได้" สำหรับหน้าสินค้า เช่น "Labubu พวงกุญแจ (~17 ซม.) ประมาณ 2 ตัว" · "… 1 ตัว (แน่น)" */
export function fitLabel(t: FitTarget, r: FitResult, lang: "th" | "en" = "th"): string {
  if (lang === "en") return `${t.name} approx. ${r.count}${r.status === "snug" ? " (snug)" : ""}`;
  return `${t.name} ประมาณ ${r.count} ${fitUnit(t)}${r.status === "snug" ? " (แน่น)" : ""}`;
}

/** ข้อความสั้น เช่น "ใส่สบาย · ประมาณ 2 ชิ้น · ช่องหน้าใส" */
export function fitText(r: FitResult, lang: "th" | "en" = "th"): string {
  if (lang === "en") return `${r.status === "roomy" ? "Fits" : "Snug fit"} · approx. ${r.count} · ${r.compartment.name}`;
  return `${r.status === "roomy" ? "ใส่สบาย" : "พอดี (แน่น)"} · ประมาณ ${r.count} ชิ้น · ${r.compartment.name}`;
}
