/**
 * แก้สินค้าบน LINE จากระบบ (ของกลาง · pure) — ลิ้นชักสินค้าบนร้าน (/master/platform-catalog)
 *
 *   ข้อมูลบนร้าน (raw.line ที่ดึงมา) → ฟอร์ม (lineEditStateFromRaw)
 *   ฟอร์มที่แก้ → planLineEdit: ส่งเฉพาะช่องที่เปลี่ยน + ตรวจค่า + รายการ "ก่อน → หลัง" ให้คนยืนยัน
 *   ส่งสำเร็จ → applyLineEditToRaw: แก้สำเนาในระบบให้ตรงร้าน (ไม่ต้องรอดึงใหม่)
 *
 * ที่ส่งได้ตอนนี้ (lib/line-shopping): ชื่อ · รายละเอียด · แบรนด์ · หมวด (PATCH /products/{id}) · ราคาเต็ม+ส่วนลดต่อตัวเลือก (PATCH /prices)
 * ยังไม่ส่ง: รูป · น้ำหนัก/บาร์โค้ด · เพิ่ม/ลบตัวเลือก (ต้องทดสอบกับร้านจริงก่อน — เฟส 2) · สต๊อก (ไประบบซิงค์สต๊อกกลาง)
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (v == null ? "" : String(v));
const num = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const round2 = (n: number) => Math.round(n * 100) / 100;

export type LineEditVariant = {
  /** id ตัวเลือกของ LINE (ตัวเลข) */
  id: string;
  label: string;
  sku: string | null;
  /** ราคาเต็ม */
  price: number | null;
  /** ราคาที่ลูกค้าจ่าย (= ราคาเต็ม − ส่วนลด) */
  pay: number | null;
};
export type LineEditState = {
  name: string;
  brand: string;
  description: string;
  categoryId: number | null;
  /** ชื่อหมวด (ไว้โชว์/แก้สำเนาในระบบ — ไม่ได้ส่งไป LINE) */
  categoryName: string | null;
  variants: LineEditVariant[];
};

/** ชื่อตัวเลือกที่ลูกค้าเห็น เช่น "สี: ดำ · ไซซ์: M" */
function variantLabelOf(v: Obj, i: number): string {
  const opts = arr(v.options).map(obj).filter((o): o is Obj => !!o)
    .map((o) => [str(o.name).trim(), str(o.value).trim()].filter(Boolean).join(": ")).filter(Boolean);
  return opts.join(" · ") || str(v.sku).trim() || `ตัวเลือก ${i + 1}`;
}

/** ข้อมูลบนร้าน (raw.line) → ค่าตั้งต้นของฟอร์ม · null = ยังไม่ได้ดึงจาก LINE */
export function lineEditStateFromRaw(line: unknown): LineEditState | null {
  const l = obj(line);
  if (!l) return null;
  const cat = obj(l.category);
  return {
    name: str(l.name),
    brand: str(l.brand),
    description: str(l.description),
    categoryId: num(cat?.id),
    categoryName: cat ? (str(cat.nameTh) || str(cat.nameEn) || null) : null,
    variants: arr(l.variants).map(obj).filter((v): v is Obj => !!v).map((v, i) => {
      const price = num(v.price); const disc = num(v.discountedPrice);
      return {
        id: str(v.id), label: variantLabelOf(v, i), sku: str(v.sku) || null,
        price, pay: disc != null && disc > 0 && (price == null || disc <= price) ? disc : price,
      };
    }).filter((v) => v.id),
  };
}

export type LineEditChange = { label: string; before: string; after: string };
export type LineEditPlan = {
  /** ช่องรายละเอียดที่จะส่ง (PATCH /products/{id}) */
  fields: { name?: string; description?: string; brand?: string; categoryId?: number };
  /** ราคาทุกตัวเลือก (PATCH /prices) — null = ราคาไม่เปลี่ยน ไม่ต้องส่ง */
  prices: { variantId: string; price: number; instantDiscount: number }[] | null;
  changes: LineEditChange[];
  errors: string[];
  /** ไม่บล็อก แต่ควรดูก่อนกด (เช่น รูปในรายละเอียดหายไป) */
  warnings: string[];
};

const baht = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}฿`);
const short = (s: string, n = 60) => { const t = s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}…` : t || "(ว่าง)"; };

/** เทียบฟอร์มกับข้อมูลบนร้าน → ส่งอะไร / ตรวจไม่ผ่านตรงไหน / ก่อน → หลัง */
export function planLineEdit(before: LineEditState, after: LineEditState): LineEditPlan {
  const fields: LineEditPlan["fields"] = {};
  const changes: LineEditChange[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const name = after.name.trim();
  if (name !== before.name.trim()) {
    if (!name) errors.push("ชื่อสินค้าห้ามว่าง");
    else { fields.name = name; changes.push({ label: "ชื่อ", before: before.name || "(ว่าง)", after: name }); }
  }
  const brand = after.brand.trim();
  if (brand !== before.brand.trim()) {
    if (!brand) errors.push("แบรนด์ห้ามว่าง (LINE ไม่รับการล้างแบรนด์)");
    else { fields.brand = brand; changes.push({ label: "แบรนด์", before: before.brand || "(ว่าง)", after: brand }); }
  }
  if (after.categoryId !== before.categoryId) {
    if (!after.categoryId || after.categoryId <= 0) errors.push("เลือกหมวดของ LINE");
    else { fields.categoryId = after.categoryId; changes.push({ label: "หมวด", before: before.categoryName ?? (before.categoryId ? String(before.categoryId) : "(ว่าง)"), after: after.categoryName ?? String(after.categoryId) }); }
  }
  if (after.description !== before.description) {
    if (!after.description.replace(/<[^>]+>/g, "").trim()) errors.push("รายละเอียดสินค้าห้ามว่าง");
    else {
      fields.description = after.description; changes.push({ label: "รายละเอียด", before: short(before.description), after: short(after.description) });
      const imgs = (h: string) => (h.match(/<img\b/gi) ?? []).length;
      if (imgs(after.description) < imgs(before.description)) warnings.push(`รูปในรายละเอียดลดลง ${imgs(before.description)} → ${imgs(after.description)} รูป — ตรวจว่าตั้งใจลบไหม`);
    }
  }

  // ราคา: เปลี่ยนตัวไหนก็ส่งทุกตัวเลือก (LINE คิดส่วนลดระดับสินค้าจากทุกตัว) · ตรวจทุกตัวก่อนส่ง
  const beforeById = new Map(before.variants.map((v) => [v.id, v]));
  let priceChanged = false;
  const prices: { variantId: string; price: number; instantDiscount: number }[] = [];
  for (const v of after.variants) {
    const b = beforeById.get(v.id);
    if (!b) continue;   // ตัวเลือกที่ไม่มีบนร้าน (เพิ่ม/ลบตัวเลือก = เฟส 2)
    const changed = v.price !== b.price || v.pay !== b.pay;
    if (changed) {
      priceChanged = true;
      changes.push({ label: `ราคา ${v.label}`, before: `${baht(b.price)} → จ่าย ${baht(b.pay)}`, after: `${baht(v.price)} → จ่าย ${baht(v.pay)}` });
    }
    if (v.price == null || !(v.price > 0)) { if (changed) errors.push(`${v.label}: ราคาเต็มต้องมากกว่า 0`); continue; }
    if (v.pay == null || !(v.pay > 0)) { if (changed) errors.push(`${v.label}: ราคาที่ลูกค้าจ่ายต้องมากกว่า 0`); continue; }
    if (v.pay > v.price) { if (changed) errors.push(`${v.label}: ราคาที่ลูกค้าจ่ายต้องไม่เกินราคาเต็ม`); continue; }
    prices.push({ variantId: v.id, price: round2(v.price), instantDiscount: round2(v.price - v.pay) });
  }
  // ราคาเปลี่ยน แต่บางตัวที่ไม่ได้แก้มีราคาเดิมใช้ไม่ได้ (เช่น 0) → ส่งไม่ครบ = ไม่ส่ง
  if (priceChanged && prices.length !== after.variants.filter((v) => beforeById.has(v.id)).length && errors.length === 0) {
    errors.push("บางตัวเลือกไม่มีราคาที่ใช้ได้ — กรอกราคาให้ครบทุกตัวเลือกก่อนส่ง");
  }
  return { fields, prices: priceChanged ? prices : null, changes, errors, warnings };
}

/** ส่งสำเร็จ → แก้สำเนา raw.line ในระบบให้ตรงร้าน (ส่งเฉพาะส่วนที่ส่งสำเร็จเข้ามา) */
export function applyLineEditToRaw(
  line: unknown,
  sent: { fields?: LineEditPlan["fields"]; categoryName?: string | null; prices?: LineEditPlan["prices"] },
): Obj {
  const l = { ...(obj(line) ?? {}) };
  const f = sent.fields ?? {};
  if (f.name != null) l.name = f.name;
  if (f.brand != null) l.brand = f.brand;
  if (f.description != null) l.description = f.description;
  if (f.categoryId != null) {
    const cat = { ...(obj(l.category) ?? {}) };
    cat.id = f.categoryId;
    if (sent.categoryName) cat.nameTh = sent.categoryName;
    l.category = cat;
  }
  if (sent.prices && sent.prices.length) {
    const byId = new Map(sent.prices.map((p) => [String(p.variantId), p]));
    l.variants = arr(l.variants).map((v) => {
      const o = obj(v); if (!o) return v;
      const p = byId.get(str(o.id)); if (!p) return o;
      return { ...o, price: p.price, discountedPrice: round2(p.price - p.instantDiscount) };
    });
    const discs = sent.prices.map((p) => p.instantDiscount);
    l.instantDiscount = discs.every((d) => d === discs[0]) ? discs[0] : 0;
  }
  return l;
}

/** ประวัติของรายการบนร้าน (audit_logs.metadata) → ข้อความสั้นภาษาคน */
export function listingHistoryText(meta: unknown): string {
  const m = obj(meta) ?? {};
  const src = str(m.source);
  if (src === "line_listing_edit") {
    const labels = arr(m.changes).map(obj).filter((c): c is Obj => !!c).map((c) => str(c.label));
    const priceN = labels.filter((l) => l.startsWith("ราคา ")).length;
    const parts = [...new Set(labels.filter((l) => !l.startsWith("ราคา ")))];
    if (priceN) parts.push(`ราคา ${priceN} ตัวเลือก`);
    const fail = str(m.error);
    return `แก้บน LINE: ${parts.join(" · ") || "—"}${fail ? ` (บางส่วนไม่สำเร็จ: ${fail})` : ""}`;
  }
  if (src === "line_listing_display" || src === "line_display") return str(m.status) === "hide" ? "ปิดขายบน LINE" : "เปิดขายบน LINE";
  if ("manual_match" in m) return m.to ? `จับคู่กับ ${str(m.matched_code) || "สินค้าในระบบ"}` : "ยกเลิกจับคู่";
  const ig = obj(m.match_ignored);
  if (ig) return ig.to ? `ตั้งไม่ต้องจับคู่${m.reason ? ` · ${str(m.reason)}` : ""}` : "เลิกข้าม (กลับไปรอจับคู่)";
  if (src) return `แก้ข้อมูล (${src})`;
  return "แก้ข้อมูล";
}

// ───────── คำตอบของ GET /api/platform-catalog?view=listing&listing_id= (ลิ้นชักสินค้าบนร้าน) ─────────
export type ListingDetail = {
  id: string;
  platform_id: string;
  platform_code: string;
  brand_id: string | null;
  external_product_id: string | null;
  title: string | null;
  sku_code: string | null;
  /** "removed" = ไม่อยู่บนร้านแล้ว */
  status: string | null;
  matched_parent_sku_id: string | null;
  matched_code: string | null;
  matched_name: string | null;
  last_imported_at: string | null;
  /** ข้อมูลบนร้าน LINE (null = ร้านอื่น หรือยังไม่ได้ดึงจาก LINE) */
  line: {
    images: string[];
    display: boolean | null;
    /** ค่าตั้งต้นของฟอร์มแก้ (ชื่อ/แบรนด์/หมวด/รายละเอียด/ราคาต่อตัวเลือก) */
    edit: LineEditState;
  } | null;
  history: { at: string; actor: string | null; text: string }[];
};
export type ListingDetailResponse = { detail: ListingDetail | null; error: string | null };
