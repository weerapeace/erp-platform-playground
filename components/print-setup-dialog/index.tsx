"use client";

/**
 * ของกลาง — "หน้าปรับก่อนพิมพ์" (กดพิมพ์ → เปิดหน้านี้ก่อน → ปรับไปดูผลไป → กดพิมพ์จริง)
 *
 * ซ้าย = ตัวเลือกของรายงานนั้น ๆ (ส่งเป็น children) · ขวา = ใบพิมพ์ A4 จริง เปลี่ยนตามทันที
 * ใช้ป๊อปกลาง ERPModal (เปิดเต็มจอ · จำขนาดต่อคน) + กรอบพรีวิวกลาง PrintFrame + สั่งพิมพ์กลาง printReportHtmlInNewWindow
 *
 *   <PrintSetupDialog open={open} onClose={() => setOpen(false)} title="พิมพ์รายงานสรุปยอดขาย"
 *     html={printHtml} fileName="สรุปยอดขาย - 2026-10">
 *     …ตัวเลือก (ติ๊กส่วน / เรียง / รูป ฯลฯ)…
 *   </PrintSetupDialog>
 *
 * พรีวิวหน่วง ~200ms (PrintFrame ใช้ srcDoc → เปลี่ยนทีโหลดใหม่ทั้งใบ ไม่หน่วงจะกระพริบรัวตอนกดติด ๆ)
 * ปุ่มพิมพ์ใช้ html ล่าสุดเสมอ (ไม่ใช่ตัวที่หน่วง) — กดเร็วแค่ไหนก็ได้ค่าที่ติ๊กล่าสุด
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function PrintSetupDialog({ open, onClose, title, html, fileName, note, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** HTML ใบพิมพ์ที่สร้างจากตัวเลือกปัจจุบัน */
  html: string;
  /** ชื่อไฟล์ตั้งต้นตอน "บันทึกเป็น PDF" (ดู lib/print-filename) */
  fileName?: string;
  /** ข้อความเล็กใต้ตัวเลือก เช่น "ตัวเลือกจำไว้ให้ครั้งหน้า" */
  note?: React.ReactNode;
  /** ตัวเลือกของรายงาน (แผงซ้าย) */
  children: React.ReactNode;
}) {
  const preview = useDebounced(html, 200);
  const doPrint = () => {
    if (!html) return;
    // ชื่อไฟล์ PDF = <title> ของเอกสาร → ใส่ก่อนเปิดแท็บพิมพ์
    const doc = fileName ? html.replace(/<title>[^<]*<\/title>/i, `<title>${fileName.replace(/[<>&]/g, "")}</title>`) : html;
    printReportHtmlInNewWindow(doc);
  };

  return (
    <ERPModal open={open} onClose={onClose} title={title} size="xl" storageKey="print-setup"
      description="ปรับตัวเลือกด้านซ้าย ใบพิมพ์ด้านขวาเปลี่ยนตามทันที แล้วกดพิมพ์"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose}
            className="h-9 px-4 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">ปิด</button>
          <button type="button" onClick={doPrint} disabled={!html}
            className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">🖨 พิมพ์ / PDF</button>
        </div>
      }>
      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
        <aside className="lg:sticky lg:top-0 space-y-4 bg-white border border-slate-200 rounded-xl p-4 text-sm">
          {children}
          {note && <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400">{note}</div>}
        </aside>
        <div className="bg-slate-100 rounded-xl p-4 overflow-x-auto">
          {preview
            ? <PrintFrame html={preview} fileName={fileName} onPrint={doPrint} />
            : <div className="py-24 text-center text-sm text-slate-400">กำลังเตรียมใบพิมพ์…</div>}
        </div>
      </div>
    </ERPModal>
  );
}

/** หัวข้อกลุ่มตัวเลือกในแผงซ้าย (ให้ทุกรายงานหน้าตาเดียวกัน) */
export function PrintSetupSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-slate-500">{title}</h3>
      {children}
    </section>
  );
}
