/**
 * 🧱 บล็อกพิมพ์ — อ่านไฟล์ .ai / .pdf ในเบราว์เซอร์ → ชิ้นเวกเตอร์ (ฝั่งหน้าเว็บเท่านั้น)
 *   ไฟล์ .ai ที่บันทึกแบบติ๊ก "Create PDF Compatible File" (ค่าเริ่มของ Illustrator) ข้างในเป็น PDF → ใช้ตัวอ่าน PDF ที่ระบบมีอยู่แล้ว
 *   (pdf.js ใน public/vendor ผ่าน loadPdfJs ของ lib/pdf-merge-engine) ดึง "คำสั่งวาด" ของหน้าแรก → lib/block-print แปลงเป็นชิ้น
 *   ไฟล์ .ai รุ่นเก่า/ไม่ได้ติ๊ก = ข้างในเป็น PostScript อ่านไม่ได้ → แจ้งให้บันทึกใหม่
 */
import { loadPdfJs } from "@/lib/pdf-merge-engine";
import { piecesFromOperatorList, type AiParseResult, type OperatorList } from "@/lib/block-print";

export const AI_ACCEPT = ".ai,.pdf,application/pdf,application/illustrator,application/postscript";
export const AI_MAX_BYTES = 80 * 1024 * 1024;

type PdfPage = { view: number[]; getOperatorList: () => Promise<OperatorList> };
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => Promise<void> };
type PdfJsFull = { OPS: Record<string, number>; getDocument: (o: { data: Uint8Array }) => { promise: Promise<PdfDoc> } };

/** ไบต์แรกของไฟล์บอกว่าอ่านได้ไหม — คืนข้อความเตือน หรือ null = อ่านได้ */
export function aiHeaderProblem(head: Uint8Array): string | null {
  const s = new TextDecoder("latin1").decode(head.slice(0, 1024));
  if (s.includes("%PDF-")) return null;
  if (s.startsWith("%!PS")) return "ไฟล์ .ai นี้บันทึกแบบไม่ติ๊ก \"Create PDF Compatible File\" — เปิดใน Illustrator แล้ว Save As ใหม่ (ติ๊กช่องนี้) แล้วเปิดอีกครั้ง";
  return "เปิดได้เฉพาะไฟล์ .ai (แบบ PDF Compatible) หรือ .pdf ที่เป็นเวกเตอร์";
}

/** อ่านไฟล์ → ชิ้นเวกเตอร์ของหน้าแรก (อาร์ตบอร์ดแรก) + จำนวนหน้า */
export async function readAiFile(file: File): Promise<AiParseResult & { pages: number }> {
  if (file.size > AI_MAX_BYTES) throw new Error("ไฟล์ใหญ่เกิน 80MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const problem = aiHeaderProblem(bytes);
  if (problem) throw new Error(problem);
  const lib = (await loadPdfJs()) as unknown as PdfJsFull;
  let doc: PdfDoc;
  try { doc = await lib.getDocument({ data: bytes }).promise; }
  catch { throw new Error("เปิดไฟล์ไม่ได้ — ไฟล์อาจเสีย หรือมีรหัสผ่าน"); }
  try {
    const page = await doc.getPage(1);
    const list = await page.getOperatorList();
    const res = piecesFromOperatorList(list, lib.OPS, page.view);
    return { ...res, pages: doc.numPages };
  } finally {
    void doc.destroy().catch(() => undefined);
  }
}

/** ไฟล์ที่เปิด/ลากมาวางได้ทั้งหมด (.ai .pdf .svg) — ใช้ตอนเพิ่มไฟล์เข้างาน/เข้าคลังสัญลักษณ์ */
export const ART_ACCEPT = ".ai,.pdf,.svg,application/pdf,application/postscript,application/illustrator,image/svg+xml";
export const isSvgFile = (f: File) => /\.svg$/i.test(f.name) || f.type === "image/svg+xml";
export const isArtFile = (f: File) => isSvgFile(f) || /\.(ai|pdf)$/i.test(f.name) || f.type === "application/pdf";
/** เปิดไฟล์ .ai / .pdf / .svg → ชิ้นเวกเตอร์ (ไฟล์ SVG อ่านด้วย lib/block-print-svg) */
export async function readArtFile(file: File): Promise<AiParseResult & { pages: number }> {
  if (isSvgFile(file)) {
    const { readSvgFile } = await import("@/lib/block-print-svg");
    return readSvgFile(file);
  }
  return readAiFile(file);
}
