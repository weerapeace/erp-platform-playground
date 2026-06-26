// ============================================================
// ฟิลด์ต้นทาง ERP (ของกลาง) ที่ map ไปฟิลด์แพลตฟอร์มได้ — ใช้ทั้ง UI mapping + resolver ตอน publish
// key = แหล่งข้อมูล (parent/sku/brand/category/listing) · group ไว้โชว์ใน dropdown
// ============================================================

export type SourceField = { key: string; label: string; group: "Parent SKU" | "SKU (สี)" | "อื่นๆ" };

export const PLATFORM_SOURCE_FIELDS: SourceField[] = [
  { key: "parent.name_th", label: "ชื่อสินค้า (ไทย)", group: "Parent SKU" },
  { key: "parent.name_en", label: "ชื่อสินค้า (อังกฤษ)", group: "Parent SKU" },
  { key: "parent.name_platform", label: "ชื่อสำหรับแพลตฟอร์ม", group: "Parent SKU" },
  { key: "parent.description", label: "รายละเอียด", group: "Parent SKU" },
  { key: "parent.introduction", label: "เกริ่นนำ (Introduction)", group: "Parent SKU" },
  { key: "parent.code", label: "รหัส Parent SKU", group: "Parent SKU" },
  { key: "parent.cover_image", label: "รูปปกสินค้า", group: "Parent SKU" },
  { key: "sku.code", label: "รหัส SKU", group: "SKU (สี)" },
  { key: "sku.color", label: "สี", group: "SKU (สี)" },
  { key: "sku.price", label: "ราคา", group: "SKU (สี)" },
  { key: "sku.image", label: "รูปประจำ SKU", group: "SKU (สี)" },
  { key: "brand.name", label: "แบรนด์", group: "อื่นๆ" },
  { key: "category.name", label: "หมวดหมู่กลาง", group: "อื่นๆ" },
  { key: "listing.category_path", label: "หมวดหมู่ปลายทาง (จากร่าง)", group: "อื่นๆ" },
  { key: "listing.title", label: "ชื่อร่างของแพลตฟอร์มนี้", group: "อื่นๆ" },
  { key: "listing.description", label: "รายละเอียดร่างของแพลตฟอร์มนี้", group: "อื่นๆ" },
];

export const SOURCE_FIELD_KEYS = new Set(PLATFORM_SOURCE_FIELDS.map((f) => f.key));
