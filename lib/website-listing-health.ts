/**
 * ตรวจ "ข้อมูลบนเว็บยังไม่ครบ" ของสินค้า 1 ตัว (pure — ใช้ได้ทั้งหน้าจอและ API)
 * ใช้ที่: หน้า "สินค้าบนเว็บ" (ป้ายเหลือง + ตัวกรอง "ต้องแก้") · เพิ่มกฎใหม่ที่นี่ที่เดียว ทุกหน้าที่ใช้จะเห็นตาม
 */
export interface ListingHealthInput {
  /** ราคาที่เว็บใช้จริง */
  price: number;
  /** จำนวนรูปบนเว็บ (แกลเลอรีของรุ่น) */
  imageCount: number;
  /** หมวดบนเว็บที่อยู่ */
  categories: string[];
  /** ตัวเลือก (สี) — swatch = จุดสีจากทะเบียนสี (null = ยังไม่ผูก) · hasImage = สีนี้มีรูปไหม */
  colors: { label: string; swatch: string | null; hasImage: boolean }[];
}

export interface ListingIssue {
  key: "no_price" | "no_image" | "no_category" | "swatch_missing" | "color_no_image";
  label: string;
  /** ชื่อสีที่เกี่ยว (ถ้ามี) — โชว์ใน tooltip */
  detail?: string;
}

export function listingIssues(x: ListingHealthInput): ListingIssue[] {
  const out: ListingIssue[] = [];
  if (!(x.price > 0)) out.push({ key: "no_price", label: "ยังไม่มีราคา" });
  if (x.imageCount <= 0) out.push({ key: "no_image", label: "ยังไม่มีรูป" });
  if (!x.categories.length) out.push({ key: "no_category", label: "ยังไม่อยู่หมวดไหน" });
  const noSwatch = x.colors.filter((c) => !c.swatch);
  if (noSwatch.length)
    out.push({ key: "swatch_missing", label: `สียังไม่ผูกทะเบียนสี ${noSwatch.length}`, detail: noSwatch.map((c) => c.label).join(", ") });
  const noImg = x.colors.filter((c) => !c.hasImage);
  if (noImg.length && x.colors.length > 1)
    out.push({ key: "color_no_image", label: `สีที่ยังไม่มีรูป ${noImg.length}`, detail: noImg.map((c) => c.label).join(", ") });
  return out;
}
