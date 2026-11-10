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
