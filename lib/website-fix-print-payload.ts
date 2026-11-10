/**
 * 🖨 ข้อมูลที่หน้า สินค้าบนเว็บ ส่งไปหน้าพิมพ์เช็กลิสต์ "ต้องแก้" (/print/website-fix) — แยกไฟล์เล็ก ให้หน้ารายการ import ได้โดยไม่ลากตัวสร้างใบพิมพ์ไปด้วย
 * ตัวสร้างใบ = lib/website-fix-print (re-export ทุกอย่างในไฟล์นี้)
 */
import type { ListingIssue } from "@/lib/website-listing-health";

export type WebFixIssue = Pick<ListingIssue, "key" | "label" | "detail">;
export type WebFixRow = {
  id: string; code: string; name: string;
  /** รูปปก (URL — /api/r2-image?… ก็ได้) */
  image_url: string | null;
  /** หมวดบนเว็บ (คั่นด้วย , ) · ไม่อยู่หมวด = หมวดใน ERP (ถ้ามี) */
  category: string | null;
  published: boolean;
  issues: WebFixIssue[];
};

/** กลุ่มเรื่องที่ต้องแก้ (ตรงกับชิปตัวกรองในหน้ารายการ) — เรียงตามงานที่มักค้างมากก่อน */
export const WEB_FIX_GROUPS = [
  { key: "web_none", label: "ยังไม่มีรูปบนเว็บเลย" },
  { key: "web_part", label: "บางสียังไม่มีรูปเว็บ" },
  { key: "no_image", label: "ยังไม่มีรูป" },
  { key: "no_category", label: "ยังไม่อยู่หมวดไหน" },
  { key: "swatch_missing", label: "สียังไม่ผูกทะเบียนสี" },
  { key: "color_no_image", label: "สีที่ยังไม่มีรูป" },
  { key: "no_price", label: "ยังไม่มีราคา" },
  { key: "no_compartments", label: "ยังไม่ได้วัดช่องใส่ของ" },
] as const;
export type WebFixGroupKey = (typeof WEB_FIX_GROUPS)[number]["key"];

/** ส่งไปหน้าพิมพ์ (localStorage) · scope = ตัวกรองที่เลือกอยู่ (ข้อความ) · focus = กลุ่มเรื่องของตัวกรองนั้น (ถ้ามี) */
export type WebFixPayload = { shop: string; scope: string; focus?: WebFixGroupKey | null; rows: WebFixRow[]; at: number };
export const WEB_FIX_PRINT_STORE = "erp.webFixPrint.";

/** เรื่องนี้อยู่กลุ่มไหน — รูปบนเว็บแยก "ไม่มีเลย" กับ "บางสี" เหมือนชิปตัวกรอง */
export function webFixGroupOf(i: WebFixIssue): WebFixGroupKey {
  if (i.key === "color_no_web_image") return i.label.startsWith("ยังไม่มีรูปบนเว็บเลย") ? "web_none" : "web_part";
  return i.key;
}
