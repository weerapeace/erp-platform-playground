"use client";

/**
 * 🖼 SaveImageButton — ของกลาง: ปุ่ม "บันทึก JPG" วางข้างปุ่ม "พิมพ์ / บันทึก PDF" ในหน้าพิมพ์
 *   ส่ง html เดียวกับที่ใช้พิมพ์ (เอกสารเต็ม) → ได้ไฟล์ .jpg หน้าตาเหมือนพรีวิว (หลายหน้า = รูปยาวม้วนเดียว)
 *   ตัวแปลง = lib/html-to-png htmlDocToImageBlob (ไม่ต้องลงไลบรารี) · ดาวน์โหลด = lib/image-clipboard downloadBlob
 *   ★ 2026-11-06 เจ้าของขอที่หน้าสรุปบิลจีน (/app/china-pay/print) — หน้าพิมพ์อื่นอยากได้ ใส่ปุ่มนี้ 1 บรรทัด
 *   ใช้: <SaveImageButton html={html} fileName="สรุปบิลจีน 6 พ.ย. 69" pageWidthPx={794} />
 */
import { useState } from "react";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { htmlDocToImageBlob, imageFileName } from "@/lib/html-to-png";
import { downloadBlob } from "@/lib/image-clipboard";

export function SaveImageButton({ html, fileName, pageWidthPx = 794, scale, className, label = "บันทึก JPG" }: {
  html: string | null | undefined;
  fileName: string;
  /** ความกว้างกระดาษบนจอ (px) — A4 ตั้ง 794 · A4 แนวนอน 1123 · A5 559 */
  pageWidthPx?: number;
  /** ความคมชัด (ตั้งต้น 2 เท่า) — 3 = คมชัดสูง (ไฟล์ใหญ่ขึ้น · ใบยาวมากระบบลดให้เอง) */
  scale?: number;
  className?: string;
  label?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!html || busy) return;
    setBusy(true);
    try {
      const blob = await htmlDocToImageBlob(html, { width: pageWidthPx, scale, type: "image/jpeg", quality: 0.92 });
      downloadBlob(blob, imageFileName(fileName));
      toast.success("บันทึกรูป JPG แล้ว — ดูในโฟลเดอร์ดาวน์โหลด");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้างรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={() => void run()} disabled={!html || busy} title="บันทึกใบนี้เป็นรูป JPG (หน้าตาเหมือนพรีวิว)"
      className={className ?? "inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"}>
      <Icon name="image" /> {busy ? "กำลังสร้างรูป…" : label}
    </button>
  );
}
