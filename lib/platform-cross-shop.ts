/**
 * เช็กข้ามร้าน — สินค้าในระบบ 1 รุ่น (Parent SKU) × ทุกร้าน · กฎกลาง (pure + เทสต์ lib/__tests__/platform-cross-shop.test.ts)
 * --------------------------------------------------------------------------
 * เจ้าของขอ 2026-11-19: "อยากได้หน้า Check ว่าแต่ละสินค้าลงในอีก Platforms หรือยัง" +
 *   "อยากได้โหมดหลายๆ view เช่น เช็คราคา, เช็คชื่อ, รายละเอียดสินค้า" → เลือกแบบ A (ตารางเดียว สลับเรื่องตรวจ) + ข้อ 1,3,4,5
 * ใช้: หน้าสินค้าบนแพลตฟอร์ม ?view=cross (components/platform-catalog/cross-shop-view) ← GET /api/platform-catalog/cross-shop
 *      ข้อมูลประกอบที่ lib/platform-cross-shop-server (อ่านอย่างเดียว ไม่แตะร้าน)
 *
 * ⚠️ ไม่ใช่กฎชุดที่ 2 — ใช้ของกลางเดิมทั้งหมด:
 *   สถานะ/ราคา/สต๊อกบนร้าน = summarizeListing (lib/platform-listing-health · กฎเดียวกับมุมมองหน้าร้าน)
 *   ตัวเลือกบนร้าน ↔ SKU + ราคาที่ระบบจะส่ง = lib/platform-variant-match (กฎเดียวกับปุ่มส่งราคา)
 *   "อาจมีแล้ว" = ตัวเดาคู่ของหน้าจับคู่ (lib/platform-match-server) แบบเดียวกับกอง "อาจมีบนร้านแล้ว" ของปุ่มเพิ่มสินค้าขึ้นร้าน
 *   เพดานความยาวชื่อ = ค่าคงที่ของแต่ละร้าน (TikTok/Lazada จากไฟล์แก้รายการ) · Shopee 120 / LINE 100 ตรวจกับข้อมูลจริง 2026-11-19
 *   ความพร้อมลง = ไม่คำนวณที่นี่ (ป้ายในหน้าเรียก /api/product-platforms/create-readiness ตัวเดียวกับตัวช่วยลงสินค้า)
 */
import { summarizeListing, isGoneStatus, type ShopState } from "@/lib/platform-listing-health";
import { matchVariantSku, shopVariantsOf, expectedLinePrice, linePriceDiff, type SkuLite } from "@/lib/platform-variant-match";
import { shopeeTextLength } from "@/lib/shopee-listing-edit";
import { TTS_TITLE_MAX, ttsTitleLength } from "@/lib/tiktok-listing-edit";
import { LAZADA_NAME_MAX } from "@/lib/lazada-listing-edit";
import { DRIFT_LABEL, type DriftKey } from "@/lib/platform-listing-drift";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

// ───────── เรื่องที่ตรวจ ─────────
export type CrossDim = "status" | "price" | "title" | "details" | "stock" | "variants" | "sync";
export const CROSS_DIMS: { key: CrossDim; label: string; icon: string; why: string }[] = [
  { key: "status", label: "ลงร้านไหนแล้ว", icon: "layout-grid", why: "สินค้ารุ่นนี้อยู่บนร้านไหนแล้ว ร้านไหนยังไม่ลง" },
  { key: "price", label: "ราคา", icon: "cash", why: "ราคาบนร้าน เทียบราคาที่ระบบจะส่ง (ราคาขาย/ราคาเต็มของ SKU)" },
  { key: "title", label: "ชื่อ", icon: "typography", why: "ความยาวชื่อเทียบเพดานของร้าน · มีชื่อแบรนด์/รหัสรุ่นในชื่อไหม" },
  { key: "details", label: "รายละเอียด", icon: "list-details", why: "รูป · หมวด · น้ำหนัก บนร้าน (ร้านที่ไม่ส่งข้อมูลมา = ขีด)" },
  { key: "stock", label: "สต๊อก", icon: "packages", why: "สต๊อกบนแต่ละร้าน เทียบกันเอง + เทียบระบบ (ดูอย่างเดียว BigSeller ยังคุมสต๊อก)" },
  { key: "variants", label: "ตัวเลือก", icon: "palette", why: "สี/ไซซ์บนร้าน เทียบ SKU ที่เปิดขายในระบบ" },
  { key: "sync", label: "ตรงกับระบบ", icon: "refresh", why: "รูป · รายละเอียด · ชื่อตัวเลือก · ราคา บนร้าน เทียบกับที่ระบบจะส่ง (ตรวจทุกคืน + ตอนเปิดแท็บแพลตฟอร์มของสินค้า) · กดช่อง = เทียบสดแล้วเลือกส่งให้ตรง" },
];

/** เพดานความยาวชื่อสินค้าต่อร้าน (0 = ไม่ตรวจ) */
export const TITLE_LIMITS: Record<string, number> = { shopee: 120, lazada: LAZADA_NAME_MAX, tiktok: TTS_TITLE_MAX, line_shopping: 100 };
/** นับความยาวชื่อแบบที่ร้านนับ (Shopee นับตัวอักษรที่คนเห็น · TikTok/อื่น ๆ นับตามตัวอักษร) */
export function titleLength(code: string, title: string): number {
  if (code === "shopee") return shopeeTextLength(title);
  if (code === "tiktok") return ttsTitleLength(title);
  return [...title].length;
}

// ───────── ช่องในตาราง (1 รุ่น × 1 ร้าน) ─────────
/** สถานะช่อง: สถานะบนร้าน (ตัวที่จับคู่แล้ว) · maybe = ยังไม่จับคู่แต่ตัวเดาชี้มาที่รุ่นนี้ · none = ยังไม่ลง · off = ร้านนี้ซ่อน/ไม่มีร้านของแบรนด์ */
export type CrossCellState = Exclude<ShopState, "gone"> | "maybe" | "none" | "off";
export type CrossCell = {
  st: CrossCellState;
  /** จำนวนรายการบนร้านที่จับคู่กับรุ่นนี้ (>1 = ลงซ้ำ) */
  listings: number;
  /** รายการแรกบนร้าน (เปิดลิ้นชักแก้ของร้านนั้น) */
  lid: string | null;
  title: string | null;
  price: number | null;
  sale: number | null;
  /** ตัวเลือกที่ราคาลูกค้าจ่ายไม่ตรงกับที่ระบบจะส่ง · ราคาเต็ม (ตัวขีดฆ่า/ราคาตั้ง) ไม่ตรง · จำนวนที่เทียบได้ */
  pay_diff: number;
  full_diff: number;
  priced: number;
  stock: number | null;
  /** ตัวเลือกบนร้าน · ที่รหัสไม่เจอใน SKU ของระบบ · SKU ที่เปิดขายในระบบแต่ไม่มีบนร้าน */
  vars: number;
  v_unknown: number;
  v_missing: number;
  /** รูปบนร้าน (null = ร้านไม่ส่งจำนวนรูปมา) · มีหมวดไหม · น้ำหนัก kg (null = ไม่รู้) */
  images: number | null;
  category: boolean | null;
  weight: number | null;
  /** ช่อง maybe: รายการบนร้านที่ตัวเดาชี้มา */
  maybe: { lid: string; title: string | null; score: number } | null;
  /** ลงซ้ำ (listings > 1): ทุกรายการบนร้านที่จับคู่กับรุ่นนี้ — ไว้เปิดดูทีละตัว */
  dups: { id: string; title: string | null; status: string | null; price: number | null }[];
  /** Website: ชื่อหน้าร้านเว็บที่มีสินค้านี้ */
  web_shops?: string[];
};
/** ผล "พร้อมลง" ที่ตรวจไว้ล่วงหน้า (cron ทุกคืน / ตรวจสดล่าสุด · ตาราง platform_create_readiness) */
export type CrossReady = { ready: boolean; on_shop: string | null; missing: string[]; at: string };
/** ข้อมูลฝั่งระบบของรุ่นนี้ */
export type CrossOur = {
  /** ราคาขาย/ราคาเต็มต่ำสุดของ SKU ที่เปิดขาย */
  sale: number | null;
  full: number | null;
  /** SKU ที่เปิดขาย */
  skus: number;
  /** สต๊อกรวมในระบบ (null = ระบบยังไม่มีข้อมูลสต๊อก — อย่าตีความเป็นหมด) */
  stock: number | null;
  /** ความยาวรายละเอียดสำหรับแพลตฟอร์ม (ไม่มี = รายละเอียดทั่วไป) */
  desc_len: number;
  weight_g: number | null;
  box: boolean;
};
/** ผลเทียบ "ร้านที่ลงแล้ว ตรงกับระบบไหม" ที่จดไว้ (ตาราง platform_listing_drift · lib/platform-listing-drift-server) */
export type CrossDrift = { listing_id: string; issues: DriftKey[]; at: string; error: string | null };
export type CrossRow = { id: string; code: string; name: string | null; name_platform: string | null; cover_key: string | null; our: CrossOur; cells: Record<string, CrossCell>; ready?: Record<string, CrossReady>; drift?: Record<string, CrossDrift> };
export type CrossShop = { code: string; name: string; state: "on" | "hidden" | "noshop" };
export type CrossShopResponse = {
  brand: { id: string; name: string } | null;
  shops: CrossShop[];
  rows: CrossRow[];
  /** รายการบนร้านที่ยังไม่จับคู่ (ไม่นับที่ข้าม/ไม่อยู่แล้ว) — เยอะ = ช่อง "ยังไม่ลง" อาจไม่จริง */
  unmatched: Record<string, number>;
  error: string | null;
};

/** ตัวเดาคู่ที่โหลดแยกทีหลัง (โหลดหน้าเร็วก่อน) — ร้าน → รุ่น → รายการบนร้านที่ตัวเดาชี้มา */
export type CrossMaybe = Record<string, Record<string, NonNullable<CrossCell["maybe"]>>>;
/** เติมช่อง "อาจมีแล้ว" ลงแถวที่โหลดมาแบบไม่เดาคู่ — แตะเฉพาะช่องที่ยังเป็น "ยังไม่ลง" (ไม่แก้ของเดิม คืนแถวใหม่) */
export function mergeCrossMaybe(rows: CrossRow[], maybe: CrossMaybe | null | undefined): CrossRow[] {
  if (!maybe || !Object.keys(maybe).length) return rows;
  return rows.map((r) => {
    let cells: CrossRow["cells"] | null = null;
    for (const [code, byParent] of Object.entries(maybe)) {
      const mb = byParent[r.id]; const c = r.cells[code];
      if (!mb || !c || c.st !== "none") continue;
      cells ??= { ...r.cells };
      cells[code] = { ...c, st: "maybe", maybe: mb };
    }
    return cells ? { ...r, cells } : r;
  });
}

export const emptyCell = (st: CrossCellState): CrossCell => ({
  st, listings: 0, lid: null, title: null, price: null, sale: null, pay_diff: 0, full_diff: 0, priced: 0, stock: null,
  vars: 0, v_unknown: 0, v_missing: 0, images: null, category: null, weight: null, maybe: null, dups: [],
});

/** รูป/หมวด/น้ำหนักจากข้อมูลดิบของร้าน — ร้านที่ไม่ส่งมา = null (ไม่รู้ ≠ ไม่มี) */
export function listingDetails(code: string, raw: unknown): { images: number | null; category: boolean | null; weight: number | null } {
  const r = obj(raw) ?? {};
  if (code === "shopee" && obj(r.shopee)) {
    const sp = obj(r.shopee) as Obj;
    return { images: num(sp.image_count), category: "category_id" in sp ? sp.category_id != null && sp.category_id !== "" : null, weight: num(sp.weight) };
  }
  if (code === "line_shopping" && obj(r.line)) {
    const ln = obj(r.line) as Obj;
    const w = arr(ln.variants).map(obj).map((v) => num(v?.weight)).find((n) => n != null) ?? null;
    return { images: Array.isArray(ln.imageUrls) ? ln.imageUrls.length : null, category: "category" in ln ? !!ln.category : null, weight: w };
  }
  if (code === "lazada" && obj(r.lazada)) {
    const lz = obj(r.lazada) as Obj;
    return { images: null, category: "primary_category" in lz ? !!lz.primary_category : null, weight: null };
  }
  if (code === "tiktok" && obj(r.tiktok)) {
    const tt = obj(r.tiktok) as Obj;
    return { images: null, category: "category" in tt ? !!tt.category : null, weight: null };
  }
  return { images: null, category: null, weight: null };
}

/** ราคาตัวเลือก 1 ตัว เทียบระบบ — TikTok เก็บราคาโปรแยก (ไม่อยู่ในสินค้า) → เทียบได้แค่ราคาตั้ง = นับเป็น "ราคาเต็มไม่ตรง" */
export function crossPriceDiff(code: string, v: { price: number | null; sale_price: number | null }, exp: { price: number; discount: number } | null): "pay" | "full" | null {
  if (code === "tiktok") return exp && v.price != null && Math.abs(v.price - exp.price) >= 1 ? "full" : null;
  return linePriceDiff(v, exp);
}

export type CellListing = { id: string; title: string | null; status: string | null; price: number | null; raw: unknown };
export type CellCtx = {
  /** SKU ของแบรนด์ (รหัส → SKU) ใช้จับตัวเลือก */
  byCode: Map<string, SkuLite>;
  fakeOf: Map<string, number>;
  saleOf: Map<string, number>;
  /** รหัส SKU ที่เปิดขายของรุ่นนี้ */
  ourCodes: string[];
};

/** สรุปช่องจากรายการบนร้านที่จับคู่กับรุ่นนี้ (ไม่รวมตัวที่ไม่อยู่บนร้านแล้ว) · ไม่มีรายการ = none */
export function buildCell(code: string, listings: CellListing[], ctx: CellCtx): CrossCell {
  const live = listings.filter((l) => !isGoneStatus(l.status));
  if (!live.length) return emptyCell("none");
  // ตัวแทน = ตัวที่ขายอยู่ก่อน (ลงซ้ำหลายรายการ → ใช้ตัวที่ดีที่สุดเป็นหน้าตาช่อง)
  const RANK: Record<string, number> = { selling: 0, low: 1, out: 2, review: 3, hidden: 4, nodata: 5, gone: 6 };
  const sums = live.map((l) => ({ l, s: summarizeListing(code, l.raw, l.price, l.status) }))
    .sort((a, b) => (RANK[a.s.state] ?? 9) - (RANK[b.s.state] ?? 9));
  const { l, s } = sums[0];
  const cell = emptyCell(s.state === "gone" ? "none" : s.state);
  cell.listings = live.length; cell.lid = l.id; cell.title = l.title;
  if (live.length > 1) cell.dups = sums.map(({ l: x, s: y }) => ({ id: x.id, title: x.title, status: y.state, price: y.salePrice ?? y.price }));
  cell.price = s.price; cell.sale = s.salePrice; cell.stock = s.stock;
  Object.assign(cell, listingDetails(code, l.raw));
  const vs = shopVariantsOf(code, l.raw);
  cell.vars = vs.length || s.variants;
  const covered = new Set<string>();
  for (const v of vs) {
    const m = matchVariantSku(v.sku, ctx.byCode);
    if (m.kind === "none" || m.kind === "nosku") { cell.v_unknown++; continue; }
    if (m.erp) covered.add(m.erp.code);
    const exp = expectedLinePrice(v.sku, ctx.fakeOf, ctx.saleOf);
    if (!exp) continue;
    cell.priced++;
    const d = crossPriceDiff(code, v, exp);
    if (d === "pay") cell.pay_diff++; else if (d === "full") cell.full_diff++;
  }
  // ตัวเลือกที่ขาด: เทียบได้เฉพาะร้านที่ส่งรายการตัวเลือกมา
  if (vs.length) cell.v_missing = ctx.ourCodes.filter((c) => !covered.has(c)).length;
  return cell;
}

// ───────── ปัญหาต่อช่อง (ป้ายสี + ตัวกรอง "มีปัญหา") ─────────
export type CellIssue = { tone: "danger" | "warning" | "info"; text: string };
const normCode = (s: string): string => s.toLowerCase().replace(/[^a-z0-9ก-๙]/g, "");

/** ชื่อบนร้านมีรหัสรุ่นไหม (ไม่สนตัวพิมพ์/ขีด/ช่องว่าง เช่น MPU-GS01 = mpugs01) */
export const titleHasCode = (title: string, code: string): boolean => !!normCode(code) && normCode(title).includes(normCode(code));
/** ชื่อบนร้านมีชื่อแบรนด์ไหม (ไม่สนตัวพิมพ์/ช่องว่าง) */
export const titleHasBrand = (title: string, brand: string): boolean => !normCode(brand) || normCode(title).includes(normCode(brand));

/** ร้านที่เปิดตรวจ (ไม่ซ่อน/มีร้าน) */
export const activeShops = (shops: CrossShop[]): CrossShop[] => shops.filter((s) => s.state === "on");

export function cellIssues(dim: CrossDim, row: CrossRow, code: string, brandName: string, shopCodes: string[] = []): CellIssue[] {
  const c = row.cells[code];
  if (!c || c.st === "off") return [];
  const out: CellIssue[] = [];
  if (dim === "status") {
    if (c.st === "none") out.push({ tone: "danger", text: "ยังไม่ลง" });
    else if (c.st === "maybe") out.push({ tone: "warning", text: "อาจมีแล้ว (ยังไม่จับคู่)" });
    if (c.listings > 1) out.push({ tone: "warning", text: `ลงซ้ำ ${c.listings} รายการ` });
    return out;
  }
  if (c.st === "none" || c.st === "maybe") return [];
  if (code === WEBSITE) return [];   // หน้าร้านเว็บ: ตรวจได้แค่ "ลงแล้วหรือยัง" (ราคา/ชื่อ ใช้ข้อมูลระบบตรง ๆ อยู่แล้ว)
  if (dim === "sync") {
    const d = row.drift?.[code];
    if (!d) return [{ tone: "info", text: "ยังไม่ได้เทียบ" }];
    if (d.error) return [{ tone: "info", text: "เทียบไม่ได้" }];
    return d.issues.map((k) => ({ tone: k === "price" ? "danger" as const : "warning" as const, text: `${DRIFT_LABEL[k].replace(/s*(.*)$/, "")}ไม่ตรง` }));
  }
  if (dim === "price") {
    if (c.pay_diff) out.push({ tone: "danger", text: `ราคาจ่ายไม่ตรง ${c.pay_diff} ตัวเลือก` });
    if (c.full_diff) out.push({ tone: "info", text: `ราคาเต็มไม่ตรง ${c.full_diff} ตัวเลือก` });
  } else if (dim === "title") {
    const t = c.title ?? "";
    const max = TITLE_LIMITS[code] ?? 0;
    const len = titleLength(code, t);
    if (!t) out.push({ tone: "danger", text: "ไม่มีชื่อ" });
    else {
      if (max && len > max) out.push({ tone: "danger", text: `ยาวเกิน ${len}/${max}` });
      if (!titleHasBrand(t, brandName)) out.push({ tone: "warning", text: "ไม่มีชื่อแบรนด์" });
      if (!titleHasCode(t, row.code)) out.push({ tone: "warning", text: "ไม่มีรหัสรุ่น" });
    }
  } else if (dim === "details") {
    if (c.images === 0) out.push({ tone: "danger", text: "ไม่มีรูป" });
    else if (c.images != null && c.images < 3) out.push({ tone: "warning", text: `รูปน้อย (${c.images})` });
    if (c.category === false) out.push({ tone: "danger", text: "ไม่มีหมวด" });
    if (c.weight === 0) out.push({ tone: "warning", text: "ไม่มีน้ำหนัก" });
  } else if (dim === "stock") {
    if (c.stock === 0) {
      const others = shopCodes.filter((s) => s !== code).map((s) => row.cells[s]?.stock ?? null).filter((n): n is number => n != null && n > 0);
      out.push(others.length ? { tone: "danger", text: "หมดที่ร้านนี้ (ร้านอื่นยังมี)" } : { tone: "warning", text: "หมด" });
    }
    if (row.our.stock != null && c.stock != null && c.stock > row.our.stock) out.push({ tone: "warning", text: `บนร้านมากกว่าระบบ (${row.our.stock})` });
  } else if (dim === "variants") {
    if (c.v_unknown) out.push({ tone: "warning", text: `รหัสไม่ตรงระบบ ${c.v_unknown}` });
    if (c.v_missing) out.push({ tone: "info", text: `ขาด ${c.v_missing} สี/ไซซ์` });
  }
  return out;
}

/** รุ่นนี้มีปัญหาเรื่องที่ตรวจในร้านที่เปิดตรวจไหม */
export const rowHasIssue = (dim: CrossDim, row: CrossRow, shopCodes: string[], brandName: string): boolean =>
  shopCodes.some((code) => cellIssues(dim, row, code, brandName, shopCodes).some((i) => i.tone !== "info"));

// ───────── ตัวกรองการลงร้าน ─────────
export type PresenceFilter = "" | "missing" | "none" | "all" | "dup" | "ready" | `miss:${string}`;
/** หน้าร้านเว็บของเราเอง — อยู่ในตาราง แต่ลงผ่านแท็บเว็บไซต์ของ Parent SKU ไม่ใช่ตัวช่วยลงสินค้า */
export const WEBSITE = "website";
const isMissing = (c: CrossCell | undefined): boolean => !c || c.st === "none" || c.st === "maybe";

export function matchPresence(row: CrossRow, f: PresenceFilter, shopCodes: string[]): boolean {
  if (!f) return true;
  if (f === "missing") return shopCodes.some((s) => isMissing(row.cells[s]));
  if (f === "none") return shopCodes.every((s) => isMissing(row.cells[s]) && row.cells[s]?.st !== "maybe");
  if (f === "all") return shopCodes.every((s) => !isMissing(row.cells[s]));
  if (f === "dup") return shopCodes.some((s) => (row.cells[s]?.listings ?? 0) > 1);
  if (f === "ready") return readyToList(row, shopCodes);
  const code = f.slice(5);
  return isMissing(row.cells[code]);
}

/** นับไว้บนชิปตัวกรอง */
export function presenceCounts(rows: CrossRow[], shopCodes: string[]): Record<string, number> {
  const out: Record<string, number> = { "": rows.length, missing: 0, none: 0, all: 0, dup: 0, ready: 0 };
  for (const s of shopCodes) out[`miss:${s}`] = 0;
  for (const r of rows) {
    if (matchPresence(r, "missing", shopCodes)) out.missing++;
    if (matchPresence(r, "none", shopCodes)) out.none++;
    if (matchPresence(r, "all", shopCodes)) out.all++;
    if (matchPresence(r, "dup", shopCodes)) out.dup++;
    if (readyToList(r, shopCodes)) out.ready++;
    for (const s of shopCodes) if (isMissing(r.cells[s])) out[`miss:${s}`]++;
  }
  return out;
}

/** ร้านที่รุ่นนี้ยังไม่ลง (ไม่นับ "อาจมีแล้ว" — ควรไปจับคู่ก่อน ไม่ใช่ลงซ้ำ) → ส่งให้ตัวช่วยลงสินค้า */
export const missingShopCodes = (row: CrossRow, shopCodes: string[]): string[] => shopCodes.filter((s) => row.cells[s]?.st === "none");

/** ร้านที่ขาดและลงผ่านตัวช่วยลงสินค้าได้ (ไม่รวมหน้าร้านเว็บ) */
export const listableMissing = (row: CrossRow, shopCodes: string[]): string[] => missingShopCodes(row, shopCodes).filter((c) => c !== WEBSITE);

/** "พร้อมลงเลย" = ขาดอย่างน้อย 1 ร้าน และผลตรวจล่าสุดบอกว่าพร้อมครบทุกร้านที่ขาด */
export function readyToList(row: CrossRow, shopCodes: string[]): boolean {
  const codes = listableMissing(row, shopCodes);
  return codes.length > 0 && codes.every((c) => row.ready?.[c]?.ready === true);
}
