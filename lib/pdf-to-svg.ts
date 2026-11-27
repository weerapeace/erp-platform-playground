/**
 * แปลงหน้า PDF (.ai PDF Compatible / .pdf / .eps ที่แปลงแล้ว) → SVG เส้นเวกเตอร์จริง ในเบราว์เซอร์ (ฝั่งหน้าเว็บเท่านั้น)
 *   ใช้ MuPDF.js (public/vendor/mupdf-1.27.0 · AGPL ไม่ได้แก้ — ดู README.txt) · ตัวอักษรแปลงเป็นเส้น (text=path) เปลี่ยนสีได้เหมือนรูปทรง
 *   โหลดเฉพาะตอนบันทึกชิ้นแบบเก็บเวกเตอร์ (~10MB ครั้งแรก แล้วเบราว์เซอร์จำ) · ไม่ผ่าน webpack (ไลบรารีหนักอยู่ public/vendor)
 * ใช้โดย: components/vector-splitter (เก็บ SVG คู่ PNG เพื่อเปลี่ยนสีทีหลัง) · ⚠️ ห้าม import จาก API route
 */
const MUPDF_URL = "/vendor/mupdf-1.27.0/mupdf.js";

type MuBuffer = { asString: () => string; destroy?: () => void };
type MuDevice = unknown;
type MuPage = { getBounds: () => [number, number, number, number]; run: (dev: MuDevice, m: unknown) => void; destroy?: () => void };
type MuDoc = { loadPage: (i: number) => MuPage; destroy?: () => void };
type MuPdf = {
  Document: { openDocument: (b: Uint8Array, magic: string) => MuDoc };
  Buffer: new () => MuBuffer;
  DocumentWriter: new (b: MuBuffer, fmt: string, opts: string) => { beginPage: (r: [number, number, number, number]) => MuDevice; endPage: () => void; close: () => void; destroy?: () => void };
  Matrix: { identity: unknown };
};

let loader: Promise<MuPdf> | null = null;
function loadMuPdf(): Promise<MuPdf> {
  loader ??= (import(/* webpackIgnore: true */ MUPDF_URL) as Promise<MuPdf>).catch((e) => {
    loader = null;   // ล้มแล้วลองใหม่ได้
    throw new Error("โหลดตัวแปลงเวกเตอร์ไม่สำเร็จ — เช็กอินเทอร์เน็ตแล้วลองใหม่" + (e instanceof Error ? ` (${e.message})` : ""));
  });
  return loader;
}

/** หน้า pageIndex (เริ่ม 0) → ข้อความ SVG (viewBox = 0 0 กว้าง สูง หน่วย point ตรงกับ pdf.js scale 1) */
export async function pdfPageToSvg(bytes: Uint8Array, pageIndex = 0): Promise<{ svg: string; width: number; height: number }> {
  const mu = await loadMuPdf();
  const doc = mu.Document.openDocument(bytes, "application/pdf");
  try {
    const page = doc.loadPage(pageIndex);
    const b = page.getBounds();
    const buf = new mu.Buffer();
    const w = new mu.DocumentWriter(buf, "svg", "text=path");
    const dev = w.beginPage(b);
    page.run(dev, mu.Matrix.identity);
    w.endPage(); w.close();
    const svg = buf.asString();
    w.destroy?.(); buf.destroy?.(); page.destroy?.();
    return { svg, width: b[2] - b[0], height: b[3] - b[1] };
  } finally { doc.destroy?.(); }
}
