/**
 * "ต้องแก้ N อย่าง" ของรุ่นสินค้า (Parent SKU) — ป้ายที่หัวลิ้นชัก กดแล้วพาไปแท็บที่ต้องแก้
 * pure + เทสต์ lib/__tests__/parent-health.test.ts · ข้อมูลจาก GET /api/parent-skus/[id]/health
 *
 * ไม่เช็ก name_platform: ข้อมูลจริงว่าง 1,478/1,509 รุ่น (หน้าจอใช้ชื่อสินค้าแทน) → เตือนทุกตัว = รก
 * เจ้าของขอ 2026-11-11 (ข้อแนะนำ 1): รวมสิ่งที่ยังขาดของสินค้าไว้ที่เดียว ไม่ต้องไล่เปิดทีละแท็บ
 *   required = ขาดแล้วขาย/ทำงานต่อไม่ได้จริง (สีแดง) · suggest = ควรเติม (สีเหลือง)
 *   field = ช่องในฟอร์ม (หน้าจอหาแท็บของช่องนี้เองจาก layout) · tab = แท็บพิเศษ (prices / platforms)
 */
export type HealthLevel = "required" | "suggest";
export type HealthItem = { key: string; level: HealthLevel; label: string; field?: string; tab?: string };

export type ParentHealthFacts = {
  hasCover: boolean;
  hasCategory: boolean;
  hasPlatformCategory: boolean;
  hasDescription: boolean;
  hasWeight: boolean;
  skuCount: number;
  skuNoPrice: number;          // SKU ที่เปิดขายแต่ยังไม่มีราคากลาง
  hasBom: boolean;             // มีสูตรผลิตอย่างน้อย 1 SKU
  hasBuyPrice: boolean;        // มีราคาซื้ออย่างน้อย 1 SKU (สินค้าซื้อมาขาย)
  notListedOn: string[];       // ร้านขายที่แบรนด์เชื่อมแล้ว แต่รุ่นนี้ยังไม่ลง (ชื่อร้าน)
};

export function parentHealthChecks(f: ParentHealthFacts): HealthItem[] {
  const out: HealthItem[] = [];
  if (!f.hasCover) out.push({ key: "no_cover", level: "required", label: "ยังไม่มีรูปปก (ใส่ที่ช่องรูปด้านซ้าย)" });
  if (!f.hasCategory) out.push({ key: "no_category", level: "required", label: "ยังไม่เลือกหมวดหมู่สินค้า", field: "category_id" });
  if (f.skuCount === 0) out.push({ key: "no_sku", level: "required", label: "ยังไม่มี SKU ลูก (สี/ไซซ์)" });
  if (f.skuNoPrice > 0) out.push({ key: "sku_no_price", level: "required", label: `SKU ยังไม่มีราคากลาง ${f.skuNoPrice} ตัว`, tab: "prices" });
  if (!f.hasDescription) out.push({ key: "no_description", level: "suggest", label: "ยังไม่มีรายละเอียดสินค้า (Description)", field: "description" });
  if (!f.hasWeight) out.push({ key: "no_weight", level: "suggest", label: "ยังไม่ใส่น้ำหนัก (ใช้คิดค่าส่ง)", field: "weight_g" });
  if (!f.hasPlatformCategory) out.push({ key: "no_platform_category", level: "suggest", label: "ยังไม่เลือกหมวดกลางสำหรับลงขาย", tab: "platforms" });
  if (f.skuCount > 0 && !f.hasBom && !f.hasBuyPrice) out.push({ key: "no_cost", level: "suggest", label: "ยังไม่มีต้นทุน (ไม่มีสูตรผลิตและราคาซื้อ)", tab: "prices" });
  if (f.notListedOn.length > 0) out.push({ key: "not_listed", level: "suggest", label: `ยังไม่ลงขายที่ ${f.notListedOn.join(", ")}`, tab: "platforms" });
  return out;
}

/** สรุปบนป้าย: นับ + สีตามระดับที่แรงสุด */
export function healthSummary(items: HealthItem[]): { count: number; level: HealthLevel | null } {
  return { count: items.length, level: items.some((i) => i.level === "required") ? "required" : items.length ? "suggest" : null };
}
