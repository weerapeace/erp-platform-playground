"use client";

/**
 * 📑 พรีวิวของกลางรวม PDF (PdfMergeTool) — ไม่เก็บงานค้าง ไม่ต่อ DB
 *   ของจริง: /misc/pdf-merge · คู่มือ docs/pdf-merge.md
 *   (โฟลเดอร์ _demos ไม่ build — ก๊อปไปไว้ใต้ app/ ชั่วคราวถ้าจะเปิดดู)
 */
import { PdfMergeTool } from "@/components/pdf-merge";

export default function PdfMergePreview() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-xl font-bold">PdfMergeTool</h1>
      <p className="mb-4 text-sm text-slate-500">ลาก PDF/รูปมาวาง · สลับโหมดทีละไฟล์/ทีละหน้า · ลอง เอาออก / ล้างทั้งหมด แล้วกดย้อนกลับ · storageKey=null (ไม่เก็บงานค้าง)</p>
      <PdfMergeTool storageKey={null} defaultName="ทดลองรวม" onMerged={(b, n) => console.info("merged", n, b.size)} />
    </div>
  );
}
