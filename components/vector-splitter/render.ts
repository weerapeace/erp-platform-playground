// ตัววาดไฟล์ออกแบบสำหรับตัวแยกชิ้น (ฝั่งเบราว์เซอร์เท่านั้น)
//   .ai (PDF Compatible) / .pdf → pdf.js ใน public/vendor (ของกลาง loadPdfJs) · .svg → เบราว์เซอร์วาดเอง
//   .eps / .ai รุ่นเก่า (PostScript) → Ghostscript ในเบราว์เซอร์แปลงเป็น PDF ก่อน (lib/eps-convert)
//   วาดพื้นใสเสมอ · วาดเฉพาะกรอบที่ต้องการที่สเกลไหนก็ได้ (จากเส้นเวกเตอร์ใหม่ → คม)
import { loadPdfJs } from "@/lib/pdf-merge-engine";
import { type Box, vectorFileProblem, isSvgName, isPostScript } from "@/lib/vector-split";

export type VectorSource = {
  /** ขนาดแผ่นในหน่วยไฟล์ (PDF = point · SVG = px) */
  width: number; height: number;
  pages: number; page: number;
  /** หน่วยต่อ 1 นิ้ว (PDF 72 · SVG 96) — ใช้กับขนาด "เท่าจริง 300 DPI" */
  unitsPerInch: number;
  /** วาดกรอบ box (หน่วยไฟล์) ที่สเกล scale + ขอบใส pad px รอบ ๆ */
  renderRegion: (box: Box, scale: number, pad?: number) => Promise<HTMLCanvasElement>;
  setPage: (n: number) => Promise<VectorSource>;
  destroy: () => void;
};

type PdfViewport = { width: number; height: number };
type PdfPage = { getViewport: (o: { scale: number }) => PdfViewport; render: (o: Record<string, unknown>) => { promise: Promise<void> }; cleanup: () => void };
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => Promise<void> };
type PdfJsLib = { getDocument: (o: { data: Uint8Array }) => { promise: Promise<PdfDoc> } };

export const MAX_VECTOR_BYTES = 80 * 1024 * 1024;

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** เปิดไฟล์ → ตัววาด · ไฟล์เปิดไม่ได้ = throw ข้อความภาษาคน
 *  .eps / .ai รุ่นเก่า (PostScript) → แปลงเป็น PDF ในเครื่องก่อน (lib/eps-convert · ครั้งแรกโหลดตัวแปลง ~16MB) · onStatus = ข้อความระหว่างรอ */
export async function openVectorFile(file: File, onStatus?: (msg: string) => void): Promise<VectorSource> {
  if (file.size > MAX_VECTOR_BYTES) throw new Error("ไฟล์ใหญ่เกิน 80MB");
  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  const problem = vectorFileProblem(bytes, file.name, file.type);
  if (problem) throw new Error(problem);
  if (isSvgName(file.name, file.type)) return openSvg(new TextDecoder().decode(bytes));
  if (isPostScript(bytes, file.name)) {
    onStatus?.("กำลังแปลงไฟล์ .eps (ครั้งแรกต้องโหลดตัวแปลง ~16MB อาจใช้เวลาสักครู่)…");
    const { epsToPdf } = await import("@/lib/eps-convert");
    bytes = await epsToPdf(bytes);
    onStatus?.("กำลังหาชิ้น…");
  }
  return openPdf(bytes);
}

async function openPdf(bytes: Uint8Array): Promise<VectorSource> {
  const lib = (await loadPdfJs()) as unknown as PdfJsLib;
  let doc: PdfDoc;
  try { doc = await lib.getDocument({ data: bytes }).promise; }
  catch { throw new Error("เปิดไฟล์ไม่ได้ — ไฟล์อาจเสีย หรือมีรหัสผ่าน"); }
  const atPage = async (n: number): Promise<VectorSource> => {
    const page = await doc.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    // pdf.js วาดทีละงานต่อหน้า — ต่อคิวกันวาดซ้อน
    let chain: Promise<unknown> = Promise.resolve();
    const src: VectorSource = {
      width: vp1.width, height: vp1.height, pages: doc.numPages, page: n, unitsPerInch: 72,
      renderRegion: (box, scale, pad = 0) => {
        const job = chain.then(async () => {
          const canvas = makeCanvas(box.w * scale + pad * 2, box.h * scale + pad * 2);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("เบราว์เซอร์วาดภาพไม่ได้");
          const viewport = page.getViewport({ scale });
          await page.render({
            canvasContext: ctx, canvas, viewport, background: "rgba(0,0,0,0)",
            transform: [1, 0, 0, 1, -box.x * scale + pad, -box.y * scale + pad],
          }).promise;
          return canvas;
        });
        chain = job.catch(() => undefined);
        return job;
      },
      setPage: (m) => { page.cleanup(); return atPage(m); },
      destroy: () => { page.cleanup(); void doc.destroy().catch(() => undefined); },
    };
    return src;
  };
  return atPage(1);
}

/** ขนาด + viewBox ของ SVG */
function svgGeometry(root: SVGSVGElement) {
  const num = (v: string | null) => { const n = parseFloat(v ?? ""); return Number.isFinite(n) && n > 0 ? n : NaN; };
  const vb = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const hasVb = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  let w = num(root.getAttribute("width")), h = num(root.getAttribute("height"));
  if (/%$/.test(root.getAttribute("width") ?? "")) w = NaN;
  if (/%$/.test(root.getAttribute("height") ?? "")) h = NaN;
  if (!Number.isFinite(w) || !Number.isFinite(h)) { w = hasVb ? vb[2] : 1000; h = hasVb ? vb[3] : 1000; }
  const [vx, vy, vw, vh] = hasVb ? vb : [0, 0, w, h];
  return { w, h, vx, vy, vw, vh };
}

async function openSvg(text: string): Promise<VectorSource> {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement as unknown as SVGSVGElement;
  if (!root || root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length)
    throw new Error("ไฟล์ SVG เสีย อ่านไม่ได้");
  const g = svgGeometry(root);
  const src: VectorSource = {
    width: g.w, height: g.h, pages: 1, page: 1, unitsPerInch: 96,
    renderRegion: async (box, scale, pad = 0) => {
      // ตัด viewBox เฉพาะกรอบ แล้วให้เบราว์เซอร์วาดตามขนาดจริงที่ต้องการ → คม ไม่ขยายจากภาพเล็ก
      const kx = g.vw / g.w, ky = g.vh / g.h;
      const outW = Math.max(1, Math.round(box.w * scale)), outH = Math.max(1, Math.round(box.h * scale));
      const clone = root.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("viewBox", `${g.vx + box.x * kx} ${g.vy + box.y * ky} ${box.w * kx} ${box.h * ky}`);
      clone.setAttribute("width", String(outW));
      clone.setAttribute("height", String(outH));
      clone.setAttribute("preserveAspectRatio", "none");
      if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
      try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = () => rej(new Error("วาด SVG ไม่ได้ (ไฟล์อาจอ้างรูป/ฟอนต์ภายนอก)"));
          i.src = url;
        });
        const canvas = makeCanvas(outW + pad * 2, outH + pad * 2);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("เบราว์เซอร์วาดภาพไม่ได้");
        ctx.drawImage(img, pad, pad, outW, outH);
        return canvas;
      } finally { URL.revokeObjectURL(url); }
    },
    setPage: async () => src,
    destroy: () => undefined,
  };
  return src;
}

export function canvasToPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("แปลง PNG ไม่สำเร็จ"))), "image/png"));
}
