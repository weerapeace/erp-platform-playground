"use client";

/**
 * 🖨 ListPrintFrame — พรีวิวใบพิมพ์แบบรายการ (ของกลาง) = PrintFrame + ลากขอบหัวคอลัมน์เพื่อปรับความกว้าง
 *   ลากขอบขวาของหัวคอลัมน์ซ้าย-ขวา · ดับเบิลคลิกขอบ = กลับความกว้างเดิม · ค่าเก็บผ่าน useListPrintSettings (จำต่อคนต่อใบ)
 *   ตัวจับลากมีเฉพาะบนจอ ไม่ติดไปตอนพิมพ์ · ใช้กับตารางจาก renderListTable (th/col มี data-col)
 *   onNote = ช่อง "พิมพ์เอง" (td.xt[data-note]) คลิกพิมพ์ในพรีวิวได้ → ส่งข้อความกลับให้หน้าเก็บ (usePrintNotes)
 *     ข้อความที่พิมพ์อยู่ในเอกสารพรีวิว · หน้าต้องไม่สร้าง html ใหม่ทุกครั้งที่พิมพ์ (iframe โหลดใหม่ = เคอร์เซอร์หลุด)
 */
import { useCallback, useRef } from "react";
import { PrintFrame } from "@/components/report";
import type { ListPrintSettingsState } from "@/components/report/use-list-print-settings";

const PX_PER_MM = 96 / 25.4;

const GRIP_CSS = `@media screen {
  .wb-t th[data-col] { position: relative; }
  .col-grip { position: absolute; top: 0; right: -5px; width: 10px; height: 100%; cursor: col-resize; z-index: 3; touch-action: none; }
  .col-grip::after { content: ""; position: absolute; top: 12%; bottom: 12%; left: 4px; width: 2px; border-radius: 1px; background: transparent; transition: background .12s; }
  .wb-t thead:hover .col-grip::after { background: #cbd5e1; }
  .wb-t th[data-col]:hover > .col-grip::after, .col-grip.on::after { background: #ea580c; }
  .col-tip { position: fixed; z-index: 10; pointer-events: none; background: #0f172a; color: #fff; font: 600 11px/1 sans-serif; padding: 4px 6px; border-radius: 4px; transform: translate(-50%, -130%); }
  body.col-resizing, body.col-resizing * { cursor: col-resize !important; user-select: none !important; }
}
@media print { .col-grip, .col-tip { display: none !important; } }`;

/** ติดตัวจับลากในเอกสารพรีวิว (เรียกทุกครั้งที่ iframe โหลดใหม่) */
export function attachColumnResize(doc: Document, opts: { onResize: (key: string, mm: number) => void; onReset: (key: string) => void }) {
  if (doc.documentElement.dataset.colResize === "1") return;
  doc.documentElement.dataset.colResize = "1";
  const style = doc.createElement("style");
  style.textContent = GRIP_CSS;
  doc.head.appendChild(style);

  doc.querySelectorAll<HTMLTableCellElement>(".wb-t thead th[data-col]").forEach((th) => {
    const key = th.dataset.col ?? "";
    if (!key || key === "img") return;   // คอลัมน์รูปกว้างตามขนาดรูป
    const grip = doc.createElement("div");
    grip.className = "col-grip";
    grip.title = "ลากเพื่อปรับความกว้าง · ดับเบิลคลิก = กลับค่าเดิม";
    th.appendChild(grip);

    grip.addEventListener("dblclick", (e) => { e.preventDefault(); e.stopPropagation(); opts.onReset(key); });
    grip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      grip.classList.add("on");
      doc.body.classList.add("col-resizing");
      // สัดส่วนจอ ↔ หน่วยในเอกสาร (พรีวิวอาจถูกย่อให้พอดีกรอบ)
      const scale = th.getBoundingClientRect().width / (th.offsetWidth || 1) || 1;
      const startX = e.clientX;
      const startPx = th.offsetWidth;
      const cols = [...doc.querySelectorAll<HTMLTableColElement>(`col[data-col="${CSS.escape(key)}"]`)];
      const tables = [...new Set(cols.map((c) => c.closest("table")).filter(Boolean))] as HTMLTableElement[];
      tables.forEach((t) => t.classList.add("fixed"));
      const tip = doc.createElement("div");
      tip.className = "col-tip";
      doc.body.appendChild(tip);
      let mm = startPx / PX_PER_MM;
      const move = (ev: PointerEvent) => {
        const px = Math.max(20, startPx + (ev.clientX - startX) / scale);
        mm = px / PX_PER_MM;
        cols.forEach((c) => { c.style.width = `${px}px`; });
        tip.textContent = `${Math.round(mm)} มม.`;
        tip.style.left = `${ev.clientX}px`;
        tip.style.top = `${ev.clientY}px`;
      };
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        grip.removeEventListener("pointercancel", up);
        grip.classList.remove("on");
        doc.body.classList.remove("col-resizing");
        tip.remove();
        if (Math.abs(mm - startPx / PX_PER_MM) >= 0.5) opts.onResize(key, mm);
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
      grip.addEventListener("pointercancel", up);
    });
  });
}

/** ช่องพิมพ์เองในพรีวิว: คลิกแล้วพิมพ์ได้ · Enter = จบช่อง (Shift+Enter = ขึ้นบรรทัด) · วางได้แค่ตัวหนังสือ */
export function attachNoteEditing(doc: Document, onNote: (key: string, text: string) => void, onDone?: (key: string) => void) {
  doc.querySelectorAll<HTMLTableCellElement>("td.xt[data-note]").forEach((td) => {
    if (td.isContentEditable) return;
    const key = td.dataset.note ?? "";
    if (!key) return;
    td.contentEditable = "true";
    td.spellcheck = false;
    td.title = "คลิกเพื่อพิมพ์ · บันทึกให้อัตโนมัติ";
    td.addEventListener("input", () => onNote(key, (td.innerText ?? "").replace(/\u00a0/g, " ").trimEnd().slice(0, 500)));
    td.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); td.blur(); } });
    td.addEventListener("blur", () => onDone?.(key));
    td.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      doc.execCommand("insertText", false, text);
    });
  });
}

export function ListPrintFrame({ html, state, maxWidth, onPrint, onNote, onNoteDone }: {
  html: string;
  state: ListPrintSettingsState;
  maxWidth?: number;
  onPrint?: () => void;
  /** ช่อง "พิมพ์เอง" — ไม่ส่ง = ช่องเป็นตัวหนังสือนิ่ง */
  onNote?: (key: string, text: string) => void;
  /** ออกจากช่องพิมพ์เอง (ใช้สั่งบันทึกทันที) */
  onNoteDone?: (key: string) => void;
}) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const noteRef = useRef({ onNote, onNoteDone });
  noteRef.current = { onNote, onNoteDone };
  const onDocLoad = useCallback((doc: Document) => {
    attachColumnResize(doc, {
      onResize: (key, mm) => stateRef.current.setColumnWidth(key, mm),
      onReset: (key) => stateRef.current.setColumnWidth(key, null),
    });
    if (noteRef.current.onNote) attachNoteEditing(doc, (k, t) => noteRef.current.onNote?.(k, t), (k) => noteRef.current.onNoteDone?.(k));
  }, []);
  return <PrintFrame html={html} maxWidth={maxWidth} onPrint={onPrint} fit onDocLoad={onDocLoad} />;
}
