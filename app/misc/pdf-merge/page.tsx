"use client";

/**
 * /misc/pdf-merge — รวม PDF (App "งานอื่นๆ")
 *   ลากไฟล์ PDF / รูป มาวาง → เรียงลำดับ (ทีละไฟล์ / ทีละหน้า · หมุน · ลบ) → ตั้งชื่อ → รวมแล้วดาวน์โหลดเป็นไฟล์เดียว
 *   ทำในเบราว์เซอร์ทั้งหมด ไฟล์ไม่ขึ้นเซิร์ฟเวอร์ · งานค้างกู้ได้ (เก็บในเครื่องนี้)
 *   ตัวเครื่องมือ = ของกลาง components/pdf-merge (หน้าอื่นใช้ซ้ำได้) · คู่มือ docs/pdf-merge.md
 */
import { PlaygroundShell } from "@/components/playground-shell";
import { PdfMergeTool } from "@/components/pdf-merge";
import { Icon } from "@/components/icon";

export default function PdfMergePage() {
  return (
    <PlaygroundShell>
      <div className="min-h-full bg-slate-50">
        <div className="mx-auto max-w-6xl p-4 sm:p-6">
          <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-slate-800"><Icon name="documents" /> รวม PDF</h1>
          <p className="mb-4 text-sm text-slate-500">รวมไฟล์ PDF และรูปหลายไฟล์เป็น PDF ไฟล์เดียว เรียงลำดับได้ — ทำในเครื่องนี้ ไฟล์ไม่ถูกส่งขึ้นเซิร์ฟเวอร์</p>
          <PdfMergeTool storageKey="misc.pdf-merge" />
        </div>
      </div>
    </PlaygroundShell>
  );
}
