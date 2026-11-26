"use client";

/**
 * 🏷 รวมไฟล์ใบปะหน้าหลายใบเป็น PDF เดียว + วางลงขนาดกระดาษที่เลือก (ย่อ/หมุนให้พอดี) — ทำในเบราว์เซอร์ ไฟล์ไม่ออกจากเครื่อง
 *   ไลบรารี pdf-lib ตัวเดียวกับตัวรวม PDF กลาง (public/vendor · loadPdfLib ใน lib/pdf-merge-engine) — ไม่ลง npm (กัน build หน่วยความจำหมด)
 *   กติกาวางใบ (fitPage/paperSlots) = lib/shipping-label (มีเทสต์)
 */
import { loadPdfLib } from "@/lib/pdf-merge-engine";
import { fitPage, paperSlots, type LabelPaper } from "@/lib/shipping-label";

type Embedded = { width: number; height: number };
type Page = { drawPage: (e: Embedded, o: { x: number; y: number; width: number; height: number; rotate?: unknown }) => void };
type Doc = {
  getPageCount: () => number;
  copyPages: (src: Doc, idx: number[]) => Promise<Page[]>;
  addPage: (p?: Page | [number, number]) => Page;
  embedPdf: (src: Doc, idx?: number[]) => Promise<Embedded[]>;
  setTitle: (s: string) => void; setCreator: (s: string) => void; setProducer: (s: string) => void;
  save: () => Promise<Uint8Array>;
};
type Lib = { PDFDocument: { create: () => Promise<Doc>; load: (b: Uint8Array, o?: { ignoreEncryption?: boolean }) => Promise<Doc> }; degrees: (n: number) => unknown };

export const b64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** ใบที่ได้ (เรียงตามที่เลือก) → ไฟล์ PDF เดียว · minScale = ย่อมากสุดกี่เท่า (ต่ำกว่า SMALL_SCALE = เตือนลองสแกน) */
export async function buildLabelPdf(labels: { pdf: Uint8Array }[], paper: LabelPaper, title = "ใบปะหน้า"): Promise<{ blob: Blob; pages: number; minScale: number }> {
  const lib = (await loadPdfLib()) as unknown as Lib;
  const out = await lib.PDFDocument.create();
  let minScale = 1;
  const slots = paper.code === "original" ? [] : paperSlots(paper);
  let sheet: Page | null = null;
  let slot = 0;
  for (const l of labels) {
    const src = await lib.PDFDocument.load(l.pdf, { ignoreEncryption: true });
    const idx = Array.from({ length: src.getPageCount() }, (_, i) => i);
    if (paper.code === "original") {
      for (const p of await out.copyPages(src, idx)) out.addPage(p);
      continue;
    }
    for (const emb of await out.embedPdf(src, idx)) {
      if (!sheet || slot >= slots.length) { sheet = out.addPage([slots[0].w * (paper.perPage === 4 ? 2 : 1), slots[0].h * (paper.perPage === 4 ? 2 : 1)]); slot = 0; }
      const f = fitPage(emb.width, emb.height, slots[slot], paper.perPage === 4 ? 6 : 2);
      minScale = Math.min(minScale, f.scale);
      sheet.drawPage(emb, { x: f.x, y: f.y, width: emb.width * f.scale, height: emb.height * f.scale, ...(f.rotate ? { rotate: lib.degrees(90) } : {}) });
      slot++;
    }
  }
  out.setTitle(title); out.setCreator("ERP"); out.setProducer("ERP shipping label");
  const bytes = await out.save();
  return { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), pages: out.getPageCount(), minScale };
}
