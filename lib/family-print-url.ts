/**
 * 🖨 ลิงก์หน้าพิมพ์รวมทั้งรุ่น (ตัวเบา) — แยกออกจาก lib/family-print.ts (~1,000 บรรทัด ตัวสร้าง HTML ใบพิมพ์)
 * หน้าจอที่แค่ "ทำปุ่ม/ลิงก์ไปหน้าพิมพ์" ให้ import จากไฟล์นี้ — ไม่ต้องลากตัวสร้างใบพิมพ์ทั้งก้อนเข้าโค้ดหน้า
 * (perf-check 2026-11-07: บอร์ดจ่ายงานโหลด lib/family-print ทั้งก้อนเพราะปุ่ม "พิมพ์ทั้งรุ่น" ใช้แค่ฟังก์ชันนี้)
 * lib/family-print.ts ยัง re-export ทั้ง 2 ชื่อนี้ — import เดิมใช้ได้เหมือนเดิม
 */

/** ใบที่พิมพ์ได้: buy = ซื้อ-ตัด (ของ × สี) · route = ติดตามงานแบบ A · status = ตามสถานะแบบ D · track = A + D */
export type FamilySheetKind = "buy" | "route" | "status" | "track" | "all";

/** ลิงก์หน้าพิมพ์รวมทั้งรุ่น — ทุกทางเข้าเรียกตัวนี้ (หน้าพิมพ์ใบเดียว · พิมพ์รวม · รายการใบสั่งผลิต · หัวกลุ่มบนบอร์ด) */
export function familyPrintUrl(by: { mo: string } | { ids: string[] } | { parent: string }, sheet?: FamilySheetKind): string {
  const p = new URLSearchParams();
  if ("mo" in by) p.set("mo", by.mo);
  else if ("ids" in by) p.set("ids", by.ids.join(","));
  else p.set("parent", by.parent);
  if (sheet && sheet !== "buy") p.set("sheet", sheet);
  return `/print/work-order/family?${p.toString().replace(/%2C/g, ",")}`;
}
