"use client";

/**
 * 🖨 usePrintLog — ของกลาง: หน้าพิมพ์เรียกตัวเดียว แล้วระบบบันทึก "พิมพ์แล้ว" ให้เอง (ตาราง print_logs · lib/print-log.ts)
 *   จับได้: ปุ่มพิมพ์/บันทึก PDF ของกลาง (printReportFrameOrWindow · printReportHtmlInNewWindow) · Ctrl+P ในพรีวิว ·
 *           ปุ่มเปิดไฟล์พิมพ์ (PrintDocLinkButton) · Ctrl+P ที่หน้า (beforeprint) · track("pdf") ที่หน้าเรียกเอง (ไฟล์ PDF)
 *   กดซ้ำภายใน 5 วิ = นับครั้งเดียว (ปุ่ม + หน้าต่างพิมพ์ยิงพร้อมกัน) · ยกเลิกในหน้าต่างพิมพ์ = นับไปแล้ว (เว็บรู้ไม่ได้ว่าพิมพ์ออกจริงไหม)
 *   บันทึกพังเงียบ (ไม่ขวางการพิมพ์)
 */
import { useCallback, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { PRINT_EVENT, type PrintDocType, type PrintHow, type PrintLogItem } from "@/lib/print-log";

const SAME_MS = 5000;

export function usePrintLog(docType: PrintDocType, items: PrintLogItem[]) {
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const last = useRef(0);
  const track = useCallback((how: PrintHow = "print") => {
    const now = Date.now();
    if (now - last.current < SAME_MS) return;
    const list = itemsRef.current.filter((x) => x.doc_id);
    if (!list.length) return;
    last.current = now;
    void apiFetch("/api/print-logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc_type: docType, variant: how, items: list }) })
      .catch(() => { /* บันทึกไม่ได้ก็ยังพิมพ์ได้ */ });
  }, [docType]);
  useEffect(() => {
    const onEvt = (e: Event) => track(((e as CustomEvent<{ how?: PrintHow }>).detail?.how) ?? "print");
    const onBefore = () => track("print");
    window.addEventListener(PRINT_EVENT, onEvt);
    window.addEventListener("beforeprint", onBefore);
    return () => { window.removeEventListener(PRINT_EVENT, onEvt); window.removeEventListener("beforeprint", onBefore); };
  }, [track]);
  return track;
}
