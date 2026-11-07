// แถบสีแบรนด์ด้านซ้ายการ์ด (ของกลาง) — เจ้าของเลือกแบบ "แถบซ้าย" 2026-11-07 (อ่านง่ายสุดตอนการ์ดเยอะ · ไม่ชนป้ายแดงเกินกำหนด)
// วิธีใช้: การ์ดต้องเป็น `relative overflow-hidden` แล้ววาง <BrandStrip color={brand_color} /> ไว้ข้างใน
//          + เผื่อที่ซ้ายให้เนื้อหา (เช่น pl-2.5) ไม่ให้แถบทับรูป/ตัวหนังสือ
// กติกาสี (สีอ่อนเข้มให้เอง / ไม่มีสี = เทา) อยู่ที่ lib/brand-strip · docs/brand-strip.md
import { brandStripColor, BRAND_STRIP_FALLBACK } from "@/lib/brand-strip";

export function BrandStrip({ color, fallback = BRAND_STRIP_FALLBACK, title }: {
  /** สีแบรนด์ (#rrggbb) — ไม่มี/ผิดรูปแบบ = ใช้ fallback */
  color: string | null | undefined;
  /** สีสำรองเมื่อแบรนด์ไม่มีสี · null = ไม่วาดแถบเลย */
  fallback?: string | null;
  /** ข้อความตอนชี้ (เช่น ชื่อแบรนด์) */
  title?: string;
}) {
  const c = brandStripColor(color, fallback);
  if (!c) return null;
  return <span aria-hidden title={title} className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-1" style={{ backgroundColor: c }} />;
}
