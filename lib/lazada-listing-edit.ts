/**
 * สินค้าบน Lazada ในลิ้นชักสินค้าบนร้าน (ของกลาง · pure) — /master/platform-catalog
 *
 *   ข้อมูลเต็มจาก GET /product/item/get → มุมมองที่ลิ้นชักโชว์ (lazadaListingView)
 *
 * เฟส 1 (2026-11-10) = ดูอย่างเดียว: ชื่อ · แบรนด์ · หมวด · รายละเอียด HTML · จุดเด่น · รูป · ชื่อตัวเลือก (สี/ไซซ์)
 *   · ราคาปกติ/ราคาลด+ช่วงวัน · สต๊อก · สถานะต่อตัวเลือก · น้ำหนัก/ขนาดกล่อง · เหตุผลที่ Lazada ปัดตก
 * เฟสถัดไป (แตะร้านจริง ต้องให้เจ้าของอนุมัติทีละเฟส): แก้ชื่อ/รายละเอียด + เปิดปิดขาย → ราคา → รูป/กล่อง
 *   แผน + กติกา Lazada ที่ต้องระวัง: docs/lazada-connector.md
 *
 * ไม่เก็บข้อมูลเต็มในระบบ (raw.lazada เก็บแค่ย่อ — รูป/HTML บวม) → ลิ้นชักดึงสดทุกครั้งที่เปิด
 * ไฟล์นี้ใช้ได้ทั้งหน้าเว็บและหลังบ้าน — ห้าม import lib/lazada (มีโค้ดเซ็นคำขอ/กุญแจ) · lib/lazada import จากที่นี่แทน
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const str = (v: unknown): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
const num = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

// ชื่อชั้นตัวเลือกที่พบบ่อย (Lazada ส่งเป็นชื่อช่อง เช่น color_family) → ภาษาคน
const SALE_PROP_TH: Record<string, string> = { color_family: "สี", color: "สี", size: "ไซซ์", length: "ความยาว", material: "วัสดุ", style: "แบบ", pattern: "ลาย" };
/**
 * ชื่อตัวเลือกที่ลูกค้าเห็น เช่น "สี: Black · ไซซ์: M" (pure · มี test)
 * saleProp ของ SKU ({color_family: "Black"}) + ป้ายชื่อชั้นจาก variation ของสินค้า (ถ้ามี) · ไม่มี = null (ใช้รหัสแทน)
 * ใช้ทั้งตอนดึงทั้งร้าน (lazProductToCatalogItem เก็บ label ใน raw.lazada) และลิ้นชัก
 */
export function lazSkuLabel(sku: Obj, variation?: unknown): string | null {
  const props = obj(sku.saleProp ?? sku.sale_prop);
  if (!props) return null;
  const labelOf = new Map<string, string>();
  const vars = obj(variation);
  if (vars) {
    for (const v of Object.values(vars)) {
      const o = obj(v);
      const name = str(o?.name); const label = str(o?.label);
      if (name && label) labelOf.set(name, label);
    }
  }
  const parts = Object.entries(props).map(([k, v]) => {
    const val = str(v); if (!val) return null;
    return `${SALE_PROP_TH[k.toLowerCase()] ?? labelOf.get(k) ?? k}: ${val}`;
  }).filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Lazada รับรูปได้ไม่เกิน 8 รูป (ทั้งรูปสินค้า และรูปต่อตัวเลือก) */
export const MAX_LAZADA_IMAGES = 8;

/** รายการรูป — Lazada ส่งได้ทั้ง array และ "ข้อความ JSON" · ตัดช่องว่าง (รูปต่อตัวเลือกเติม "" ให้ครบ 8) */
export function lazImageList(v: unknown): string[] {
  let list: unknown = v;
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("[")) { try { list = JSON.parse(t); } catch { list = []; } }
    else list = t ? [t] : [];
  }
  return (Array.isArray(list) ? list : []).map((u) => str(u)).filter((u): u is string => !!u && /^https?:\/\//i.test(u));
}

export type LazadaSkuView = {
  skuId: string;
  sellerSku: string | null;
  /** ชื่อตัวเลือก เช่น "สี: Black · ไซซ์: M" · ไม่มี = รหัส */
  label: string;
  price: number | null;
  /** ราคาลด (ต่ำกว่าราคาปกติเท่านั้น) */
  specialPrice: number | null;
  /** ช่วงวันของราคาลด (ข้อความจาก Lazada เช่น "2026-11-01 00:00") */
  specialFrom: string | null;
  specialTo: string | null;
  /** สต๊อกรวม / ขายได้ */
  quantity: number | null;
  available: number | null;
  /** active / inactive */
  status: string | null;
  images: string[];
  /** กก. · ซม. */
  weight: number | null; length: number | null; width: number | null; height: number | null;
  /** ลิงก์หน้าสินค้าบน Lazada */
  url: string | null;
};
export type LazadaListingView = {
  itemId: string;
  name: string;
  brand: string | null;
  categoryId: string | null;
  /** HTML */
  description: string;
  /** HTML หัวข้อย่อย (<ul><li>) */
  shortDescription: string;
  images: string[];
  /** Active / InActive / Pending QC / Suspended / Deleted */
  status: string | null;
  subStatus: string | null;
  /** เหตุผลที่ Lazada ปัดตก/ระงับ (ถ้ามี) */
  rejectReasons: string[];
  skus: LazadaSkuView[];
};

/** วันที่ราคาลด — Lazada ส่งทั้งข้อความวันที่ และเลขมิลลิวินาที → ข้อความสั้น "YYYY-MM-DD HH:mm" (เวลาไทย) */
export function lazDateText(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (/^\d{12,14}$/.test(s)) {
    const d = new Date(Number(s) + 7 * 3600_000);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 16).replace("T", " ");
  }
  return s.slice(0, 16);
}

function rejectReasonsOf(v: unknown): string[] {
  const list = Array.isArray(v) ? v : v == null || v === "" ? [] : [v];
  return list.map((x) => {
    const o = obj(x);
    if (!o) return str(x);
    return [str(o.violationDetail ?? o.violation_detail ?? o.reason), str(o.suggestion)].filter(Boolean).join(" — ") || null;
  }).filter((x): x is string => !!x);
}

/** ข้อมูลเต็มจาก /product/item/get → มุมมองในลิ้นชัก · null = ข้อมูลใช้ไม่ได้ (ไม่มี item_id) */
export function lazadaListingView(item: unknown): LazadaListingView | null {
  const p = obj(item);
  const itemId = str(p?.item_id);
  if (!p || !itemId) return null;
  const a = obj(p.attributes) ?? {};
  const skus = (Array.isArray(p.skus) ? p.skus : []).map(obj).filter((s): s is Obj => !!s).map((s, i): LazadaSkuView => {
    const sellerSku = str(s.SellerSku ?? s.seller_sku);
    const price = num(s.price); const sp = num(s.special_price);
    return {
      skuId: str(s.SkuId ?? s.sku_id) ?? `#${i + 1}`,
      sellerSku,
      label: lazSkuLabel(s, p.variation) ?? sellerSku ?? `ตัวเลือก ${i + 1}`,
      price,
      specialPrice: sp != null && sp > 0 && (price == null || sp < price) ? sp : null,
      specialFrom: lazDateText(s.special_from_time ?? s.special_from_date),
      specialTo: lazDateText(s.special_to_time ?? s.special_to_date),
      quantity: num(s.quantity), available: num(s.Available ?? s.available),
      status: str(s.Status ?? s.status)?.toLowerCase() ?? null,
      images: lazImageList(s.Images ?? s.images),
      weight: num(s.package_weight), length: num(s.package_length), width: num(s.package_width), height: num(s.package_height),
      url: str(s.Url ?? s.url),
    };
  });
  return {
    itemId,
    name: str(a.name) ?? "",
    brand: str(a.brand),
    categoryId: str(p.primary_category),
    description: String(a.description ?? ""),
    shortDescription: String(a.short_description ?? ""),
    images: lazImageList(p.images),
    status: str(p.status),
    subStatus: str(p.subStatus ?? p.sub_status),
    rejectReasons: rejectReasonsOf(p.rejectReason ?? p.reject_reason),
    skus,
  };
}

/** สถานะสินค้าบน Lazada → ป้ายภาษาคน + โทนสี (ใช้ในหัวลิ้นชัก) */
export function lazStatusBadge(status: string | null | undefined): { label: string; tone: "ok" | "off" | "wait" | "bad" | "none" } {
  const s = String(status ?? "").toLowerCase().replace(/[\s_-]/g, "");
  if (s === "active") return { label: "เปิดขายอยู่", tone: "ok" };
  if (s === "inactive") return { label: "ปิดขาย", tone: "off" };
  if (s === "pendingqc" || s === "pending") return { label: "รอ Lazada ตรวจ", tone: "wait" };
  if (s === "suspended") return { label: "ถูก Lazada ระงับ", tone: "bad" };
  if (s === "deleted") return { label: "ถูกลบแล้ว", tone: "bad" };
  return { label: status ? String(status) : "ไม่รู้สถานะ", tone: "none" };
}

/** คำตอบของ GET/POST /api/lazada/listing-detail */
export type LazadaListingDetailResponse = { view: LazadaListingView | null; fetched_at: string | null; saved?: boolean; error: string | null };

// ═════════════════════════════ เฟส 2: แก้ชื่อ / รายละเอียด / จุดเด่น + เปิดปิดขาย (แตะร้านจริง) ═════════════════════════════
//
// กติกา Lazada ที่ต้องระวัง (คู่มือ open.lazada.com สำรวจ 2026-11-10 · รายละเอียด docs/lazada-connector.md):
//  - /product/update ต้องมี SkuId ทุก SKU · สถานะ SKU "ค่าเริ่ม = active" → ส่งสถานะเดิมของทุก SKU ไปด้วยเสมอ (ไม่งั้นตัวที่ปิดอยู่อาจเปิดเอง)
//  - ส่ง SKU ครบตามลำดับเดิม (ส่งสลับ = Lazada เรียงตัวเลือกใหม่) · ชื่อ ≤ 255 · รายละเอียด HTML ≤ 25,000 ตัวอักษร รูปต้องเป็นของ Lazada
//  - จุดเด่น = ข้อความล้วนแบบหัวข้อย่อย (<ul><li>) — Lazada ตัดรูป/ลิงก์ทิ้ง
//  - ปิดขาย = /product/deactivate (ทั้งสินค้า หรือระบุ SKU) · ไม่มี API เปิดขาย → /product/update ตั้ง Status active

export const LAZADA_NAME_MAX = 255;
export const LAZADA_DESC_MAX = 25_000;
/** โดเมนรูปของ Lazada (รูปในรายละเอียดต้องอยู่บน Lazada แล้ว — รูปภายนอกโดนปฏิเสธ error 4138) */
const LAZADA_IMG_HOST = /(^|\.)(slatic\.net|lazcdn\.com|alicdn\.com)$/i;

/** ค่าที่แก้ได้ในเฟส 2 · จุดเด่นเก็บเป็น "บรรทัดละข้อ" (คนทั่วไปแก้ง่ายกว่า HTML) */
export type LazadaEditState = { name: string; description: string; highlights: string };

const decodeEntities = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** จุดเด่น HTML (<ul><li>…) → บรรทัดละข้อ · ไม่มี <li> = แยกตามขึ้นบรรทัด/<br>/<p> */
export function highlightsToLines(html: string | null | undefined): string {
  const h = String(html ?? "");
  if (!h.trim()) return "";
  const items = /<li\b/i.test(h)
    ? [...h.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1])
    : h.split(/<br\s*\/?>|<\/p>|\n/i);
  return items.map((x) => decodeEntities(x.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}
/** บรรทัดละข้อ → <ul><li>…</li></ul> (ข้อความล้วน ตามกติกา Lazada) */
export function linesToHighlights(lines: string): string {
  const items = String(lines ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  return items.length ? `<ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : "";
}

export function lazadaEditStateFromView(v: LazadaListingView): LazadaEditState {
  return { name: v.name, description: v.description, highlights: highlightsToLines(v.shortDescription) };
}

export type LazadaEditChange = { label: string; before: string; after: string };
export type LazadaEditPlan = {
  /** ช่องที่จะส่ง (เฉพาะที่เปลี่ยน) · shortDescription เป็น HTML แล้ว */
  fields: { name?: string; description?: string; shortDescription?: string };
  changes: LazadaEditChange[];
  errors: string[];
  warnings: string[];
};

const plain = (h: string) => decodeEntities(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const short = (h: string, n = 60) => { const t = plain(h); return t.length > n ? `${t.slice(0, n)}…` : t || "(ว่าง)"; };
const countTag = (h: string, tag: string) => (h.match(new RegExp(`<${tag}\\b`, "gi")) ?? []).length;
/** ลิงก์รูปในรายละเอียดที่ไม่ใช่ของ Lazada */
export function foreignDescImages(html: string): string[] {
  return [...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]).filter((src) => {
    try { return !LAZADA_IMG_HOST.test(new URL(src, "https://x.invalid").hostname); } catch { return true; }
  });
}

/** เทียบฟอร์มกับของบนร้าน → ส่งอะไร / ตรวจไม่ผ่านตรงไหน / ก่อน → หลัง (หน้าเว็บกับ API ใช้ตัวเดียวกัน) */
export function planLazadaEdit(before: LazadaEditState, after: LazadaEditState): LazadaEditPlan {
  const fields: LazadaEditPlan["fields"] = {};
  const changes: LazadaEditChange[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const name = after.name.replace(/\s+/g, " ").trim();
  if (name !== before.name.replace(/\s+/g, " ").trim()) {
    if (!name) errors.push("ชื่อสินค้าห้ามว่าง");
    else if (name.length > LAZADA_NAME_MAX) errors.push(`ชื่อสินค้ายาวเกิน ${LAZADA_NAME_MAX} ตัวอักษร (ตอนนี้ ${name.length})`);
    else { fields.name = name; changes.push({ label: "ชื่อ", before: before.name || "(ว่าง)", after: name }); }
  }

  if (after.description !== before.description) {
    const foreign = foreignDescImages(after.description);
    if (!plain(after.description) && countTag(after.description, "img") === 0) errors.push("รายละเอียดสินค้าห้ามว่าง");
    else if (after.description.length > LAZADA_DESC_MAX) errors.push(`รายละเอียดยาวเกิน ${LAZADA_DESC_MAX.toLocaleString()} ตัวอักษร (ตอนนี้ ${after.description.length.toLocaleString()})`);
    else if (foreign.length) errors.push(`รูปในรายละเอียดต้องเป็นรูปที่อยู่บน Lazada แล้ว — มีรูปจากที่อื่น ${foreign.length} รูป (เพิ่มรูปใหม่ได้ในเฟสรูป)`);
    else {
      fields.description = after.description;
      changes.push({ label: "รายละเอียด", before: short(before.description), after: short(after.description) });
      const bi = countTag(before.description, "img"), ai = countTag(after.description, "img");
      if (ai < bi) warnings.push(`รูปในรายละเอียดลดลง ${bi} → ${ai} รูป — ตรวจว่าตั้งใจลบไหม`);
      const bt = countTag(before.description, "table"), at = countTag(after.description, "table");
      if (at < bt) warnings.push(`ตารางในรายละเอียดหายไป ${bt - at} ตาราง (กล่องแก้ของระบบอาจไม่รองรับตารางแบบเดิม) — ตรวจก่อนส่ง`);
      // กล่องแก้จัดรูป HTML ใหม่เองได้ แม้คนไม่ได้พิมพ์อะไร → บอกให้รู้ จะได้ยกเลิกถ้าไม่ได้ตั้งใจ
      if (plain(before.description) === plain(after.description) && ai === bi) warnings.push("ข้อความรายละเอียดเหมือนเดิม (เปลี่ยนแค่รูปแบบ) — ถ้าไม่ได้ตั้งใจแก้รายละเอียด กด \"ยกเลิกที่แก้\"");
    }
  }

  const bl = before.highlights.split("\n").map((x) => x.trim()).filter(Boolean);
  const al = after.highlights.split("\n").map((x) => x.trim()).filter(Boolean);
  if (bl.join("\n") !== al.join("\n")) {
    if (!al.length) errors.push("ล้างจุดเด่นทั้งหมดยังไม่รองรับ — ต้องเหลืออย่างน้อย 1 ข้อ");
    else {
      fields.shortDescription = linesToHighlights(al.join("\n"));
      changes.push({ label: "จุดเด่นสินค้า", before: bl.length ? `${bl.length} ข้อ: ${short(bl.join(" · "), 50)}` : "(ไม่มี)", after: `${al.length} ข้อ: ${short(al.join(" · "), 50)}` });
      if (/https?:\/\/|www\./i.test(al.join(" "))) warnings.push("จุดเด่นมีลิงก์ — Lazada จะตัดลิงก์ทิ้ง");
    }
  }
  if (Object.keys(fields).length) warnings.push("Lazada อาจส่งสินค้าไปตรวจใหม่ (ไม่เกิน 24 ชม.) หลังแก้ข้อมูล — ช่วงแคมเปญใหญ่ควรเลี่ยง");
  return { fields, changes, errors, warnings };
}

// ───────── ประกอบคำขอ XML (pure · มี test) ─────────
const xmlText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** HTML ใส่ใน CDATA — แตก "]]>" กัน CDATA ปิดก่อน */
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
export type LazSkuRef = { skuId: string; sellerSku: string | null; status: string | null };

/**
 * /product/update (payload) — แก้ข้อมูลสินค้า และ/หรือ สถานะ SKU
 * ส่ง SKU ครบตามลำดับเดิม พร้อม "สถานะ" ทุกตัว (statusOverride = ตัวที่จะเปลี่ยน · ที่เหลือ = สถานะเดิม)
 */
export function lazUpdateProductXml(itemId: string, skus: LazSkuRef[], fields: LazadaEditPlan["fields"], statusOverride?: Map<string, "active" | "inactive">): string {
  const attrs = [
    fields.name != null ? `<name>${xmlText(fields.name)}</name>` : "",
    fields.description != null ? `<description>${cdata(fields.description)}</description>` : "",
    fields.shortDescription != null ? `<short_description>${cdata(fields.shortDescription)}</short_description>` : "",
  ].join("");
  const skuXml = skus.map((s) => {
    const st = statusOverride?.get(s.skuId) ?? (s.status === "inactive" ? "inactive" : "active");
    return `<Sku><SkuId>${xmlText(s.skuId)}</SkuId>${s.sellerSku ? `<SellerSku>${xmlText(s.sellerSku)}</SellerSku>` : ""}<Status>${st}</Status></Sku>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Request><Product><ItemId>${xmlText(itemId)}</ItemId><Attributes>${attrs}</Attributes><Skus>${skuXml}</Skus></Product></Request>`;
}
/** /product/deactivate (apiRequestBody) — ไม่ระบุ SKU = ปิดทั้งสินค้า */
export function lazDeactivateXml(itemId: string, skuIds?: string[]): string {
  const skus = skuIds && skuIds.length ? `<Skus>${skuIds.map((id) => `<SkuId>${xmlText(id)}</SkuId>`).join("")}</Skus>` : "";
  return `<Request><Product><ItemId>${xmlText(itemId)}</ItemId>${skus}</Product></Request>`;
}

// ───────── เปิด / ปิดขาย ─────────
export type LazadaDisplayAction = { open: boolean; /** ว่าง/ไม่ส่ง = ทั้งสินค้า */ skuIds?: string[] };
export type LazadaDisplayPlan = {
  /** deactivate = ปิด · update = เปิด (ตั้ง Status active) · none = ไม่มีอะไรต้องทำ */
  api: "deactivate" | "update" | "none";
  /** ทั้งสินค้า (ปิด) — ไม่ระบุ SKU ใน deactivate */
  wholeItem: boolean;
  /** SKU ที่จะเปลี่ยนจริง (ข้ามตัวที่อยู่สถานะนั้นแล้ว) */
  targets: LazadaSkuView[];
  statusOverride: Map<string, "active" | "inactive">;
  summary: string;
  errors: string[];
};
/**
 * ส่งสำเร็จแต่ดึงกลับมาเช็กไม่ได้ (Lazada ตอบช้า/จำกัดความถี่) → มุมมองตามที่สั่งไว้ (ไม่โชว์ของเก่าให้คนเข้าใจผิดว่าไม่สำเร็จ)
 * ใช้คู่กับคำเตือนให้กด "ดึงตัวนี้จาก Lazada" ยืนยันภายหลังเสมอ (pure · มี test)
 */
export function lazViewAfterWrite(view: LazadaListingView, w: { fields?: LazadaEditPlan["fields"]; statusOverride?: Map<string, "active" | "inactive"> }): LazadaListingView {
  const f = w.fields ?? {};
  const skus = w.statusOverride && w.statusOverride.size ? view.skus.map((s) => (w.statusOverride!.has(s.skuId) ? { ...s, status: w.statusOverride!.get(s.skuId)! } : s)) : view.skus;
  const anyOpen = skus.some((s) => s.status !== "inactive");
  return {
    ...view,
    name: f.name ?? view.name, description: f.description ?? view.description, shortDescription: f.shortDescription ?? view.shortDescription,
    skus, status: w.statusOverride && w.statusOverride.size ? (anyOpen ? "Active" : "InActive") : view.status,
  };
}
/** สำเนาย่อในระบบ (raw.lazada) แบบเดียวกัน — สถานะ SKU ตามที่สั่ง + สถานะสินค้า (เปิดอยู่ ≥ 1 ตัว = active) */
export function lazRawAfterStatus(rawLazada: unknown, statusOverride: Map<string, "active" | "inactive">): { lazada: Obj; status: "active" | "inactive" } {
  const l = { ...(obj(rawLazada) ?? {}) };
  const skus = (Array.isArray(l.skus) ? l.skus : []).map((s) => {
    const o = obj(s); if (!o) return s;
    const id = str(o.sku_id ?? o.SkuId);
    return id && statusOverride.has(id) ? { ...o, status: statusOverride.get(id) } : o;
  });
  const status = skus.some((s) => str(obj(s)?.status) !== "inactive") ? "active" : "inactive";
  return { lazada: { ...l, skus, status: status === "active" ? "Active" : "InActive" }, status };
}

/** คำตอบของ POST /api/lazada/listing-edit และ /listing-display */
export type LazadaWriteResponse = {
  ok: boolean;
  /** ข้อมูลล่าสุดหลังส่ง (ดึงจาก Lazada ใหม่) — null = ดึงไม่ได้ */
  view: LazadaListingView | null;
  changes?: LazadaEditChange[];
  summary?: string;
  /** Lazada ส่งไปรอตรวจ (Pending QC) */
  qc?: boolean;
  warnings?: string[];
  error: string | null;
};

export function planLazadaDisplay(view: LazadaListingView, action: LazadaDisplayAction): LazadaDisplayPlan {
  const ids = new Set((action.skuIds ?? []).map(String));
  const whole = ids.size === 0;
  const unknown = [...ids].filter((id) => !view.skus.some((s) => s.skuId === id));
  const errors = unknown.length ? [`ไม่พบตัวเลือก ${unknown.join(", ")} บน Lazada (อาจถูกลบ/เปลี่ยนแล้ว — โหลดใหม่)`] : [];
  const scope = whole ? view.skus : view.skus.filter((s) => ids.has(s.skuId));
  const want = action.open ? "active" : "inactive";
  const targets = scope.filter((s) => (s.status === "inactive" ? "inactive" : "active") !== want);
  const statusOverride = new Map(targets.map((s) => [s.skuId, want] as [string, "active" | "inactive"]));
  const verb = action.open ? "เปิดขาย" : "ปิดขาย";
  const api = errors.length || targets.length === 0 ? "none" : action.open ? "update" : "deactivate";
  const summary = targets.length === 0
    ? `${whole ? "ทุกตัวเลือก" : "ตัวเลือกที่เลือก"}${action.open ? "เปิดขาย" : "ปิดขาย"}อยู่แล้ว`
    : whole && targets.length === view.skus.length ? `${verb}ทั้งสินค้า (${targets.length} ตัวเลือก)` : `${verb} ${targets.length} ตัวเลือก`;
  // ปิดทั้งสินค้าเมื่อเลือกทั้งหมด → deactivate ระดับสินค้า (ไม่ต้องระบุ SKU)
  return { api, wholeItem: !action.open && whole, targets, statusOverride, summary, errors };
}
