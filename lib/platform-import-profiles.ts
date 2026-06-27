// ============================================================
// ทะเบียนโปรไฟล์ไฟล์นำเข้าจากแพลตฟอร์ม (ของกลาง) — ใช้ทั้งฝั่งหน้าจอ (เดาชนิด + พรีวิว) และเซิร์ฟเวอร์ (แตกข้อมูล)
//
// ปัญหาที่แก้: ไฟล์ export ของ Shopee (mass_update_*) มี "หัวตารางซ้อนกันหลายแถว" —
//   แถว 0 = รหัสคอลัมน์ภาษาอังกฤษ (et_title_*) ที่คงที่ไม่เปลี่ยนตามภาษา
//   แถว 1 = ข้อมูลร้าน (ช่องแรกบอกชนิดไฟล์: basic_info / sales_info / ...)
//   แถว 2-5 = ชื่อไทย + คำอธิบาย
//   ข้อมูลจริงเริ่มแถวที่ 6
// ระบบเดิมเดาว่า "แถวแรก = หัวตาราง" จึงอ่านไฟล์พวกนี้พลาดทั้งหมด
//
// โปรไฟล์แต่ละตัวบอก: เดายังไงว่าเป็นไฟล์นี้, หัวตารางอยู่แถวไหน, ข้อมูลเริ่มแถวไหน,
//   และคอลัมน์ (รหัสภาษาอังกฤษ) ไหนคือ รหัสสินค้า/SKU/ชื่อ/ราคา/สต๊อก
// ============================================================

export type ImportMatrix = unknown[][]; // แถว × คอลัมน์ (ดิบจากไฟล์ รวมแถวหัวตาราง)

// ข้อมูล 1 แถวหลังแตกตามโปรไฟล์ (ระดับสินค้า หรือ ตัวเลือก)
export type ImportRecord = {
  external_product_id: string | null;
  external_variation_id: string | null;
  parent_sku: string | null;
  variation_sku: string | null;
  variation_name: string | null;
  title: string | null;
  price: number | null;
  stock: number | null;
  status: string | null;
  raw: Record<string, unknown>; // ทั้งแถว keyed ด้วยรหัสคอลัมน์ (เก็บครบไว้ดูภายหลัง)
};

export type ImportFieldDef = { key: string; label: string | null; sample: string | null };

// คอลัมน์มาตรฐาน → รายชื่อรหัสคอลัมน์ในไฟล์ที่เป็นไปได้ (เทียบแบบไม่สนตัวพิมพ์)
type FieldMap = Partial<Record<
  "external_product_id" | "external_variation_id" | "parent_sku" | "variation_sku" | "variation_name" | "title" | "price" | "stock" | "status",
  string[]
>>;

export type ImportProfile = {
  id: string;                 // ระบุไม่ซ้ำ เช่น "shopee_sales_info"
  platformCode: string;       // "shopee" | "*" (generic ใช้ได้ทุกแพลตฟอร์ม)
  label: string;              // ชื่อภาษาคน
  kind: "catalog" | "orders"; // ไฟล์นี้เข้าหน้าไหน
  level: "product" | "variation"; // 1 แถว = 1 สินค้า หรือ 1 ตัวเลือก
  section: string;            // คีย์เก็บใน raw (กันไฟล์ที่อัปทีหลังทับของเดิม) เช่น "basic_info"
  headerRowIndex: number;     // แถวที่เป็นรหัสคอลัมน์
  labelRowIndex: number | null; // แถวที่เป็นชื่อไทย (ไว้โชว์เป็นป้ายฟิลด์)
  dataStartRowIndex: number;  // แถวที่ข้อมูลจริงเริ่ม
  // เงื่อนไขเดาว่าไฟล์นี้คือโปรไฟล์นี้ (ไม่มี = ใช้เป็น fallback สุดท้ายเท่านั้น)
  detect?: { metaRow?: number; metaCol?: number; metaEquals?: string; headerIncludes?: string[] };
  map: FieldMap;
};

// ---------- helpers ----------
const cell = (m: ImportMatrix, r: number, c: number): string => {
  const row = m[r]; if (!Array.isArray(row)) return "";
  const v = row[c]; return v == null ? "" : String(v).trim();
};
const norm = (s: string) => s.trim().toLowerCase();
const rowIsEmpty = (row: unknown[]) => !row || !row.some((c) => String(c ?? "").trim() !== "");
export const parseNum = (s: string | null): number | null => {
  if (s == null || s === "") return null;
  const n = Number(String(s).replace(/[^0-9.\-]/g, ""));
  return Number.isNaN(n) ? null : n;
};

// ---------- โปรไฟล์ Shopee (mass_update_*) ----------
// รหัสคอลัมน์ร่วมทุกไฟล์: et_title_product_id, et_title_parent_sku
const SHOPEE_PROFILES: ImportProfile[] = [
  {
    id: "shopee_basic_info", platformCode: "shopee", label: "Shopee — ข้อมูลพื้นฐาน (ชื่อ/รายละเอียด)",
    kind: "catalog", level: "product", section: "basic_info",
    headerRowIndex: 0, labelRowIndex: 2, dataStartRowIndex: 6,
    detect: { metaRow: 1, metaCol: 0, metaEquals: "basic_info" },
    map: { external_product_id: ["et_title_product_id"], parent_sku: ["et_title_parent_sku"], title: ["et_title_product_name"] },
  },
  {
    id: "shopee_sales_info", platformCode: "shopee", label: "Shopee — ราคา/สต๊อก (ตัวเลือกสินค้า)",
    kind: "catalog", level: "variation", section: "sales_info",
    headerRowIndex: 0, labelRowIndex: 2, dataStartRowIndex: 6,
    detect: { metaRow: 1, metaCol: 0, metaEquals: "sales_info" },
    map: {
      external_product_id: ["et_title_product_id"], external_variation_id: ["et_title_variation_id"],
      parent_sku: ["et_title_parent_sku"], variation_sku: ["et_title_variation_sku"],
      variation_name: ["et_title_variation_name"], title: ["et_title_product_name"],
      price: ["et_title_variation_price"], stock: ["et_title_variation_stock"],
    },
  },
  {
    id: "shopee_media_info", platformCode: "shopee", label: "Shopee — รูปภาพ",
    kind: "catalog", level: "product", section: "media_info",
    headerRowIndex: 0, labelRowIndex: 2, dataStartRowIndex: 6,
    detect: { metaRow: 1, metaCol: 0, metaEquals: "media_info" },
    map: { external_product_id: ["et_title_product_id"], parent_sku: ["et_title_parent_sku"], title: ["et_title_product_name"] },
  },
  {
    id: "shopee_shipping_info", platformCode: "shopee", label: "Shopee — น้ำหนัก/ขนาด/ค่าส่ง (ตัวเลือกสินค้า)",
    kind: "catalog", level: "variation", section: "shipping_info",
    headerRowIndex: 0, labelRowIndex: 3, dataStartRowIndex: 6,
    detect: { metaRow: 1, metaCol: 0, metaEquals: "shipping_info" },
    map: {
      external_product_id: ["et_title_product_id"], external_variation_id: ["et_title_variation_id"],
      parent_sku: ["et_title_parent_sku"], variation_sku: ["et_title_variation_sku"],
      variation_name: ["et_title_variation_name"], title: ["et_title_product_name"],
    },
  },
  {
    id: "shopee_dts_info", platformCode: "shopee", label: "Shopee — ระยะเวลาเตรียมพัสดุ",
    kind: "catalog", level: "product", section: "dts_info",
    headerRowIndex: 0, labelRowIndex: 2, dataStartRowIndex: 6,
    detect: { metaRow: 1, metaCol: 0, metaEquals: "dts_info" },
    map: { external_product_id: ["et_title_product_id"], parent_sku: ["et_title_parent_sku"], title: ["et_title_product_name"] },
  },
];

// ---------- โปรไฟล์ทั่วไป (fallback) — ไฟล์หัวตารางแถวเดียวแบบเดิม ----------
// ใช้กับ CSV/Excel ทั่วไปที่ไม่ใช่ Shopee mass_update (เดาคอลัมน์จากชื่อที่พบบ่อย)
export const GENERIC_CATALOG_PROFILE: ImportProfile = {
  id: "generic_catalog", platformCode: "*", label: "ไฟล์ทั่วไป (หัวตารางแถวแรก)",
  kind: "catalog", level: "product", section: "import",
  headerRowIndex: 0, labelRowIndex: null, dataStartRowIndex: 1,
  map: {
    external_product_id: ["product_id", "item_id", "product id", "global_item_id", "id"],
    title: ["name", "product_name", "title", "ชื่อสินค้า", "product name"],
    variation_sku: ["sku", "seller sku", "sku code", "variation_sku", "variation sku", "เลข sku", "รหัสสินค้า", "รหัส"],
    parent_sku: ["parent sku", "parent_sku"],
    price: ["price", "ราคา", "variation_price", "special_price", "ราคาขาย"],
    stock: ["stock", "คลัง", "สต๊อก", "variation_stock", "จำนวน"],
    status: ["status", "สถานะ"],
  },
};

const ALL_PROFILES: ImportProfile[] = [...SHOPEE_PROFILES, GENERIC_CATALOG_PROFILE];

// โปรไฟล์ทั้งหมดของแพลตฟอร์มหนึ่ง (เฉพาะเจาะจง + generic) — ใช้ทำ dropdown ให้ผู้ใช้เปลี่ยนเอง
export function profilesForPlatform(platformCode: string): ImportProfile[] {
  const specific = ALL_PROFILES.filter((p) => p.platformCode === platformCode);
  return [...specific, GENERIC_CATALOG_PROFILE];
}

export function getProfile(id: string): ImportProfile | null {
  return ALL_PROFILES.find((p) => p.id === id) ?? null;
}

function matchesDetect(p: ImportProfile, m: ImportMatrix): boolean {
  const d = p.detect; if (!d) return false;
  if (d.metaEquals != null) {
    const got = norm(cell(m, d.metaRow ?? 1, d.metaCol ?? 0));
    if (got !== norm(d.metaEquals)) return false;
  }
  if (d.headerIncludes?.length) {
    const hdr = (m[p.headerRowIndex] ?? []).map((c) => norm(String(c ?? "")));
    if (!d.headerIncludes.every((k) => hdr.includes(norm(k)))) return false;
  }
  return true;
}

// เดาว่าไฟล์นี้คือโปรไฟล์ไหน (จาก matrix ดิบ) — ไม่เจอเฉพาะเจาะจง → generic
export function detectProfile(platformCode: string, m: ImportMatrix): ImportProfile {
  for (const p of ALL_PROFILES) {
    if (p.platformCode === platformCode && matchesDetect(p, m)) return p;
  }
  return GENERIC_CATALOG_PROFILE;
}

// หา index คอลัมน์ของแต่ละฟิลด์มาตรฐาน จากหัวตาราง (เทียบแบบไม่สนตัวพิมพ์)
function resolveColumns(p: ImportProfile, header: string[]): Partial<Record<keyof FieldMap, number>> {
  const lower = header.map((h) => norm(h));
  const out: Partial<Record<keyof FieldMap, number>> = {};
  for (const [field, cands] of Object.entries(p.map) as [keyof FieldMap, string[]][]) {
    for (const c of cands) {
      const idx = lower.indexOf(norm(c));
      if (idx >= 0) { out[field] = idx; break; }
    }
  }
  return out;
}

// รายการฟิลด์ (หัวคอลัมน์) ของไฟล์ พร้อมป้ายไทย + ตัวอย่างค่า (ไว้แสดงในแท็บ "ฟิลด์")
export function extractFields(p: ImportProfile, m: ImportMatrix): ImportFieldDef[] {
  const header = (m[p.headerRowIndex] ?? []).map((c) => String(c ?? "").trim());
  const labels = p.labelRowIndex != null ? (m[p.labelRowIndex] ?? []) : [];
  const sample = m[p.dataStartRowIndex] ?? [];
  const out: ImportFieldDef[] = [];
  for (let i = 0; i < header.length; i++) {
    const key = header[i]; if (!key) continue;
    const label = String(labels[i] ?? "").trim() || null;
    const s = String(sample[i] ?? "").trim();
    out.push({ key, label, sample: s ? s.slice(0, 120) : null });
  }
  return out;
}

// แตกข้อมูลตามโปรไฟล์ → records มาตรฐาน
export function parseRecords(p: ImportProfile, m: ImportMatrix): ImportRecord[] {
  const header = (m[p.headerRowIndex] ?? []).map((c) => String(c ?? "").trim());
  const col = resolveColumns(p, header);
  const get = (row: unknown[], idx: number | undefined): string | null => {
    if (idx == null) return null; const v = row[idx]; const s = v == null ? "" : String(v).trim(); return s || null;
  };
  const records: ImportRecord[] = [];
  for (let r = p.dataStartRowIndex; r < m.length; r++) {
    const row = m[r]; if (rowIsEmpty(row)) continue;
    const raw: Record<string, unknown> = {};
    for (let i = 0; i < header.length; i++) { if (header[i]) raw[header[i]] = row[i] ?? ""; }
    records.push({
      external_product_id: get(row, col.external_product_id),
      external_variation_id: get(row, col.external_variation_id),
      parent_sku: get(row, col.parent_sku),
      variation_sku: get(row, col.variation_sku),
      variation_name: get(row, col.variation_name),
      title: get(row, col.title),
      price: parseNum(get(row, col.price)),
      stock: parseNum(get(row, col.stock)),
      status: get(row, col.status),
      raw,
    });
  }
  return records;
}
