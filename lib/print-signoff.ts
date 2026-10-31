/**
 * ของกลาง — "กล่องลงชื่อ" บนเอกสารพิมพ์ (ช่องให้คนเซ็นมือบนกระดาษ: ชื่อ · ลายเซ็น · วันที่)
 *
 * ต่างจาก lib/doc-stamps (รูปลายเซ็น/ตราที่อัปโหลดไว้แปะลงเอกสาร) — อันนี้คือ "ช่องว่าง" ให้คนเซ็นจริงตอนส่ง-รับงาน
 * ใช้ครั้งแรก: ใบสั่งงานผลิต (lib/work-order-print — แผนกตัด/เตรียม · ช่างที่รับงาน · QC · ผู้สั่งผลิต)
 * ใบพิมพ์แบบรายการ (lib/list-print signatureHtml) ย้ายมาใช้ตัวนี้ได้ถ้าอยากได้ช่องวันที่/ชื่อด้วย
 *
 *   signoffHtml([
 *     { title: "แผนกตัด/เตรียม", lines: [{ kind: "write", label: "ผู้ตัด/เตรียม" }, { kind: "sign" }, { kind: "date" }] },
 *   ], { title: "ลงชื่อรับ-ส่งงาน" })
 *   + ต่อ SIGNOFF_CSS ท้าย custom_css ของเทมเพลต (ครั้งเดียว)
 *
 * ⚠️ เส้นทุกเส้นกำหนดเป็น mm (ไม่ใช่ px) — กระดาษวาดบางกว่า 1px ได้ (ดู memory report_print_system)
 */

export type SignLine =
  /** ป้าย + เส้นประให้เขียน · มี value = พิมพ์ค่านั้นบนเส้นแทน */
  | { kind: "write"; label: string; value?: string | null }
  /** "ลงชื่อ" + เส้นยาว */
  | { kind: "sign"; label?: string }
  /** วันที่ · มี value = พิมพ์วันที่นั้น · ไม่มี = ____/____/______ ให้เขียนมือ */
  | { kind: "date"; value?: string | null }
  /** ข้อความเฉย ๆ เช่น ชื่อช่าง · right = ข้อความชิดขวาในแถวเดียวกัน (เช่น "รับ 30 ชิ้น") */
  | { kind: "text"; text: string; right?: string; strong?: boolean }
  /** 2 ช่องเขียนในแถวเดียว เช่น ดี ____ เสีย ____ */
  | { kind: "pair"; left: string; right: string }
  /** เส้นคั่นบาง ๆ (เช่น คั่นระหว่างช่างแต่ละคนในกล่องเดียว) */
  | { kind: "sep" };

export type SignBox = { title: string; note?: string | null; lines: SignLine[] };

/** ช่องวันที่เปล่าให้เขียนมือ */
export const BLANK_DATE = "____/____/______";

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const writeRow = (label: string, value?: string | null) =>
  `<div class="sgn-row"><span class="sgn-lab">${esc(label)}</span>${value ? `<span class="sgn-val">${esc(value)}</span>` : `<span class="sgn-ln"></span>`}</div>`;

function lineHtml(l: SignLine): string {
  switch (l.kind) {
    case "write": return writeRow(l.label, l.value);
    case "sign": return writeRow(l.label ?? "ลงชื่อ");
    case "date": return l.value
      ? writeRow("วันที่", l.value)
      : `<div class="sgn-row"><span class="sgn-lab">วันที่</span><span class="sgn-blank">${BLANK_DATE}</span></div>`;
    case "text": return `<div class="sgn-row sgn-text${l.strong ? " sgn-strong" : ""}"><span>${esc(l.text)}</span>${l.right ? `<span class="sgn-right">${esc(l.right)}</span>` : ""}</div>`;
    case "pair": return `<div class="sgn-row">${writeRow(l.left)}${writeRow(l.right)}</div>`;
    case "sep": return `<div class="sgn-sep"></div>`;
  }
}

/** กล่องเดียว (หัว + บรรทัด) */
export function signBoxHtml(box: SignBox): string {
  const head = `<div class="sgn-head"><span>${esc(box.title)}</span>${box.note ? `<span class="sgn-note">${esc(box.note)}</span>` : ""}</div>`;
  return `<div class="sgn-box">${head}${box.lines.map(lineHtml).join("")}</div>`;
}

/** แถบกล่องลงชื่อ — วางเป็นตาราง N คอลัมน์ (ค่าเริ่ม 3) · ไม่มีกล่อง = คืนค่าว่าง */
export function signoffHtml(boxes: SignBox[], opts: { title?: string; cols?: number } = {}): string {
  if (boxes.length === 0) return "";
  const cols = Math.max(1, Math.min(5, Math.round(opts.cols ?? 3)));
  return `<section class="sgn-section">${opts.title ? `<div class="sgn-title">${esc(opts.title)}</div>` : ""}<div class="sgn-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${boxes.map(signBoxHtml).join("")}</div></section>`;
}

/** CSS ที่เทมเพลตต้องมี (ผนวกท้าย custom_css ครั้งเดียว) — ขนาดตัวอักษรตาม .doc ของเอกสารนั้น */
export const SIGNOFF_CSS = `
.sgn-section { margin: 3mm 0; break-inside: avoid; page-break-inside: avoid; }
.sgn-title { font-size: 1.1em; font-weight: 800; margin-bottom: 1.5mm; }
.sgn-grid { display: grid; gap: 2.5mm; }
.sgn-box { border: 0.15mm solid #94a3b8; border-radius: 0.6mm; padding: 1.6mm 2mm 2mm; display: flex; flex-direction: column; gap: 1.6mm; break-inside: avoid; page-break-inside: avoid; }
.sgn-head { display: flex; justify-content: space-between; gap: 2mm; font-weight: 800; border-bottom: 0.12mm solid #e2e8f0; padding-bottom: 0.8mm; }
.sgn-note { font-weight: 400; color: #64748b; font-size: 0.85em; text-align: right; }
.sgn-row { display: flex; align-items: flex-end; gap: 1.2mm; min-height: 4.5mm; }
.sgn-row > .sgn-row { flex: 1; min-height: 0; }
.sgn-lab { color: #475569; white-space: nowrap; }
.sgn-ln { flex: 1; min-width: 6mm; border-bottom: 0.2mm dotted #64748b; height: 4mm; }
.sgn-val { flex: 1; border-bottom: 0.2mm dotted #64748b; padding: 0 0.8mm; }
.sgn-blank { color: #64748b; letter-spacing: 0.3mm; }
.sgn-text { align-items: baseline; justify-content: space-between; min-height: 0; }
.sgn-strong { font-weight: 700; }
.sgn-right { white-space: nowrap; }
.sgn-sep { border-top: 0.12mm dashed #cbd5e1; }
@media print {
  .sgn-section { margin: 2mm 0; }
  .sgn-grid { gap: 2mm; }
  .sgn-box { padding: 1.2mm 1.6mm 1.6mm; gap: 1.3mm; }
  .sgn-row { min-height: 4.2mm; }
}
`;
