"use client";

/**
 * MoStockActions — เดิมเป็นปุ่มเบิกวัตถุดิบ (−) / รับสินค้าเสร็จ (+) ด้วยมือ (เฟส 4)
 *
 * เฟส B: สต๊อกเดิน "อัตโนมัติ" ตามงานจริงแล้ว
 *   - จ่ายงาน (บอร์ดจ่ายงาน)  → ย้ายวัตถุดิบ RAW → WIP
 *   - รับเข้า QC (โกดัง QC)   → WIP → FG (ของดี) / SCRAP (ของเสีย)
 * → ปิดปุ่ม manual เดิมกัน "ตัดสต๊อกซ้ำ 2 เด้ง" · เหลือแค่ป้ายบอกสถานะ
 * (ถ้าต้องปรับสต๊อกด้วยมือจริง ๆ ทำที่หน้า /inventory: รับเข้า/เบิกออก/โอน/ปรับ)
 */
export function MoStockActions(_props: {
  moId: string; moQty: number; actor?: string | null; onDone?: () => void;
}) {
  return (
    <span
      title="สต๊อกจัดการอัตโนมัติจากบอร์ดจ่ายงาน (RAW→WIP) และโกดัง QC (WIP→FG/ของเสีย) — ปรับด้วยมือได้ที่หน้าคลังสินค้า /inventory"
      className="inline-flex items-center gap-1.5 h-9 px-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg"
    >
      <span aria-hidden>📦</span>
      สต๊อกอัตโนมัติ · จ่ายงาน→WIP · รับเข้า QC→FG/ของเสีย
    </span>
  );
}
