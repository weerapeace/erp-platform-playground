"use client";

/**
 * 📑 ตัวรวม PDF ในเบราว์เซอร์ (ของกลาง · ใช้ฝั่งเบราว์เซอร์เท่านั้น)
 *   - ไฟล์ไม่ออกจากเครื่อง: อ่าน/วาดรูปตัวอย่าง/รวม ทำในเบราว์เซอร์ทั้งหมด
 *   - ไลบรารีวางเป็นไฟล์สำเร็จรูปใน public/vendor (ไม่ผ่านขั้น build — กัน Vercel build หน่วยความจำหมด · ดู lib/image-decode)
 *       pdf-lib (ตัว fork ของ pdfme ที่โปรเจกต์มีอยู่แล้ว · MIT) = รวม/หมุน/ใส่รูป
 *       pdf.js 5.7.284 (Apache-2.0) = นับหน้า + วาดรูปตัวอย่างหน้า
 *     โหลดครั้งเดียวตอนใช้งานจริง (หน้าอื่นไม่โหลด)
 *
 *   ใช้ง่ายสุด (หน้าอื่น เช่น พิมพ์เอกสารหลายใบรวมไฟล์เดียว):
 *     const blob = await mergePdfBlobs([pdfBlob1, pdfBlob2, imageFile]);
 *     downloadBlob(blob, mergedFileName("ใบสั่งซื้อรวม"));
 *   ใช้แบบเต็ม (เลือกหน้า/หมุน) = buildMergedPdf(pages, files) — หน้าจอ components/pdf-merge ใช้ตัวนี้
 * กฎล้วน: lib/pdf-merge · คู่มือ docs/pdf-merge.md
 */
import { toDecodableImage } from "@/lib/image-decode";
import { fitImageOnA4, finalRotation, pagesForFile, sourceKindOf, type MergeFileMeta, type MergePage, type MergeSourceKind } from "@/lib/pdf-merge";

export const PDF_LIB_SRC = "/vendor/pdf-lib-pdfme-6.1.5.min.js";
export const PDFJS_SRC = "/vendor/pdfjs-5.7.284/pdf.min.mjs";
export const PDFJS_WORKER_SRC = "/vendor/pdfjs-5.7.284/pdf.worker.min.mjs";

/* ───────── โหลดไลบรารี ───────── */

// ชนิดเท่าที่ใช้ (ไม่ดึง type ทั้งไลบรารี)
type PdfLibPage = {
  getRotation: () => { angle: number };
  setRotation: (d: unknown) => void;
  drawImage: (img: unknown, o: { x: number; y: number; width: number; height: number }) => void;
};
type PdfLibDoc = {
  getPageCount: () => number;
  getPages: () => PdfLibPage[];
  copyPages: (src: PdfLibDoc, idx: number[]) => Promise<PdfLibPage[]>;
  addPage: (p?: PdfLibPage | [number, number]) => PdfLibPage;
  embedJpg: (b: Uint8Array) => Promise<{ width: number; height: number }>;
  embedPng: (b: Uint8Array) => Promise<{ width: number; height: number }>;
  setProducer: (s: string) => void;
  setCreator: (s: string) => void;
  setTitle: (s: string) => void;
  save: () => Promise<Uint8Array>;
};
type PdfLib = {
  PDFDocument: { create: () => Promise<PdfLibDoc>; load: (b: Uint8Array, o?: { ignoreEncryption?: boolean }) => Promise<PdfLibDoc> };
  degrees: (n: number) => unknown;
};
type PdfJsViewport = { width: number; height: number };
type PdfJsPage = {
  rotate: number;
  getViewport: (o: { scale: number; rotation?: number }) => PdfJsViewport;
  render: (o: { canvasContext: CanvasRenderingContext2D; canvas: HTMLCanvasElement; viewport: PdfJsViewport }) => { promise: Promise<void> };
  cleanup: () => void;
};
type PdfJsDoc = { numPages: number; getPage: (n: number) => Promise<PdfJsPage>; destroy: () => Promise<void> };
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (o: { data: Uint8Array; password?: string }) => { promise: Promise<PdfJsDoc> };
};

let pdfLibLoader: Promise<PdfLib> | null = null;
export function loadPdfLib(): Promise<PdfLib> {
  const w = window as unknown as { PDFLib?: PdfLib };
  if (w.PDFLib) return Promise.resolve(w.PDFLib);
  pdfLibLoader ??= new Promise<PdfLib>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PDF_LIB_SRC;
    s.async = true;
    s.onload = () => (w.PDFLib ? resolve(w.PDFLib) : reject(new Error("pdf-lib not found")));
    s.onerror = () => reject(new Error("load pdf-lib failed"));
    document.head.appendChild(s);
  }).catch((e) => { pdfLibLoader = null; throw e; });   // พลาด = ครั้งหน้าลองใหม่
  return pdfLibLoader;
}

let pdfJsLoader: Promise<PdfJs> | null = null;
export function loadPdfJs(): Promise<PdfJs> {
  pdfJsLoader ??= (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ (PDFJS_SRC as string)) as Promise<PdfJs>)
    .then((m) => { m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC; return m; })
    .catch((e) => { pdfJsLoader = null; throw e; });
  return pdfJsLoader;
}

/* ───────── อ่านไฟล์ต้นทาง ───────── */

/** เปิดไฟล์ไม่ได้ — message เป็นภาษาคนพร้อมโชว์ */
export class MergeSourceError extends Error {
  constructor(public reason: "type" | "password" | "broken" | "empty" | "image", public fileName: string) {
    super(
      reason === "type" ? `${fileName}: รวมได้เฉพาะ PDF และรูป (JPG/PNG)`
        : reason === "password" ? `${fileName}: ไฟล์ล็อกรหัสผ่าน — ปลดรหัสก่อนแล้วค่อยลากมาใหม่`
          : reason === "empty" ? `${fileName}: ไฟล์ว่าง (ถ้าเป็นไฟล์ใน Google Drive ให้โหลดลงเครื่องก่อน)`
            : reason === "image" ? `${fileName}: เปิดรูปนี้ไม่ได้`
              : `${fileName}: ไฟล์ PDF เสียหรืออ่านไม่ได้`,
    );
  }
}

const docCache = new Map<string, Promise<PdfJsDoc>>();
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

function openPdfJs(fileId: string, blob: Blob): Promise<PdfJsDoc> {
  let p = docCache.get(fileId);
  if (!p) {
    p = loadPdfJs().then(async (lib) => lib.getDocument({ data: await bytesOf(blob) }).promise);
    p.catch(() => docCache.delete(fileId));
    docCache.set(fileId, p);
  }
  return p;
}

/** ปิดไฟล์ที่เปิดค้างไว้วาดรูปตัวอย่าง (ตอนไฟล์ไม่อยู่ในรายการแล้ว) */
export function releaseSource(fileId: string) {
  const p = docCache.get(fileId);
  docCache.delete(fileId);
  thumbCache.forEach((t, k) => {
    if (!k.startsWith(`${fileId}:`)) return;
    thumbCache.delete(k);
    void t.then((u) => { if (u.startsWith("blob:")) URL.revokeObjectURL(u); }).catch(() => {});
  });
  void p?.then((d) => d.destroy()).catch(() => {});
}

/** ไฟล์ที่พร้อมรวม (รูป HEIC แปลงเป็น JPG แล้ว) */
export type PreparedSource = { meta: MergeFileMeta; blob: Blob };

let seq = 0;
const newId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** อ่านไฟล์ 1 ไฟล์: เช็กชนิด · นับหน้า · ไฟล์เสีย/ล็อกรหัส = MergeSourceError */
export async function prepareSource(file: File): Promise<PreparedSource> {
  const kind: MergeSourceKind | null = sourceKindOf(file.name, file.type);
  if (!kind) throw new MergeSourceError("type", file.name);
  if (!file.size) throw new MergeSourceError("empty", file.name);
  const id = newId();
  if (kind === "image") {
    let img: File;
    try { img = await toDecodableImage(file); } catch { throw new MergeSourceError("image", file.name); }
    return { meta: { id, name: file.name, kind, type: img.type || file.type, size: file.size, pageCount: 1 }, blob: img };
  }
  try {
    const doc = await openPdfJs(id, file);
    if (!doc.numPages) throw new MergeSourceError("broken", file.name);
    return { meta: { id, name: file.name, kind, type: "application/pdf", size: file.size, pageCount: doc.numPages }, blob: file };
  } catch (e) {
    docCache.delete(id);
    if (e instanceof MergeSourceError) throw e;
    const name = (e as { name?: string })?.name;
    throw new MergeSourceError(name === "PasswordException" ? "password" : "broken", file.name);
  }
}

/** หน้าเริ่มต้นของไฟล์ที่เพิ่งอ่าน */
export const initialPages = (s: PreparedSource): MergePage[] => pagesForFile(s.meta.id, s.meta.pageCount);

/* ───────── รูปตัวอย่างหน้า ───────── */

const thumbCache = new Map<string, Promise<string>>();
let renderChain: Promise<unknown> = Promise.resolve();   // วาดทีละหน้า (มือถือไม่ค้าง)

/** รูปตัวอย่างหน้า (data URL · กว้าง ~width px) — รูปภาพคืน object URL ของรูปเลย · ยังไม่ใส่การหมุน (หน้าจอหมุนด้วย CSS) */
export function pageThumb(meta: MergeFileMeta, blob: Blob, index: number, width = 180): Promise<string> {
  const key = `${meta.id}:${index}:${width}`;
  let p = thumbCache.get(key);
  if (p) return p;
  if (meta.kind === "image") {
    p = Promise.resolve(URL.createObjectURL(blob));
  } else {
    const job = renderChain.then(async () => {
      const doc = await openPdfJs(meta.id, blob);
      const page = await doc.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(2, (width * (window.devicePixelRatio || 1)) / Math.max(1, base.width)) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, canvas, viewport: vp }).promise;
      page.cleanup();
      return canvas.toDataURL("image/jpeg", 0.8);
    });
    renderChain = job.catch(() => {});
    p = job;
  }
  p.catch(() => thumbCache.delete(key));
  thumbCache.set(key, p);
  return p;
}

/* ───────── รวมไฟล์ ───────── */

/** รูปที่ pdf-lib ใส่ตรงไม่ได้ (webp/gif/bmp) → แปลงเป็น JPG ผ่าน canvas */
async function imageBytes(blob: Blob): Promise<{ bytes: Uint8Array; kind: "jpg" | "png" }> {
  const t = blob.type.toLowerCase();
  if (t === "image/jpeg" || t === "image/jpg") return { bytes: await bytesOf(blob), kind: "jpg" };
  if (t === "image/png") return { bytes: await bytesOf(blob), kind: "png" };
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const out = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.92));
  if (!out) throw new Error("convert image failed");
  return { bytes: await bytesOf(out), kind: "jpg" };
}

export type MergeProgress = { done: number; total: number };

/**
 * รวมหน้าตามลำดับ → PDF ไฟล์เดียว (Blob)
 *   pages = ลำดับหน้าสุดท้าย · files = ไฟล์ต้นทางตาม id · onProgress = ทำไปกี่หน้าแล้ว
 */
export async function buildMergedPdf(
  pages: MergePage[],
  files: Map<string, PreparedSource>,
  opts: { title?: string; onProgress?: (p: MergeProgress) => void; signal?: AbortSignal } = {},
): Promise<Blob> {
  if (!pages.length) throw new Error("ยังไม่มีหน้าให้รวม");
  const lib = await loadPdfLib();
  const out = await lib.PDFDocument.create();
  const srcDocs = new Map<string, Promise<PdfLibDoc>>();
  const total = pages.length;
  const tick = (done: number) => opts.onProgress?.({ done, total });
  tick(0);
  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) throw new DOMException("ยกเลิกแล้ว", "AbortError");
    const pg = pages[i];
    const src = files.get(pg.fileId);
    if (!src) throw new Error("ไม่พบไฟล์ต้นทางของบางหน้า");
    if (src.meta.kind === "image") {
      const { bytes, kind } = await imageBytes(src.blob);
      const img = kind === "jpg" ? await out.embedJpg(bytes) : await out.embedPng(bytes);
      const fit = fitImageOnA4(img.width, img.height);
      const page = out.addPage([fit.pageW, fit.pageH]);
      page.drawImage(img, { x: fit.x, y: fit.y, width: fit.w, height: fit.h });
      if (pg.rotation) page.setRotation(lib.degrees(pg.rotation));
    } else {
      let d = srcDocs.get(pg.fileId);
      if (!d) {
        d = bytesOf(src.blob).then((b) => lib.PDFDocument.load(b, { ignoreEncryption: true }));
        srcDocs.set(pg.fileId, d);
      }
      const doc = await d.catch(() => { throw new MergeSourceError("broken", src.meta.name); });
      const [copied] = await out.copyPages(doc, [pg.index]);
      copied.setRotation(lib.degrees(finalRotation(copied.getRotation().angle, pg.rotation)));
      out.addPage(copied);
    }
    tick(i + 1);
    if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0));   // ให้หน้าจอขยับแถบ % ได้
  }
  out.setProducer("ERP รวม PDF");
  out.setCreator("ERP รวม PDF");
  if (opts.title) out.setTitle(opts.title);
  const bytes = await out.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

/** รวมไฟล์ทั้งไฟล์ตามลำดับที่ส่งมา (PDF/รูป) → PDF ไฟล์เดียว · สำหรับหน้าอื่นที่ไม่ต้องเลือกหน้า */
export async function mergePdfBlobs(sources: (File | Blob)[], opts: { title?: string; onProgress?: (p: MergeProgress) => void } = {}): Promise<Blob> {
  const files = new Map<string, PreparedSource>();
  const pages: MergePage[] = [];
  try {
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      const f = s instanceof File ? s : new File([s], `ไฟล์-${i + 1}${s.type.startsWith("image/") ? "" : ".pdf"}`, { type: s.type || "application/pdf" });
      const prep = await prepareSource(f);
      files.set(prep.meta.id, prep);
      pages.push(...initialPages(prep));
    }
    return await buildMergedPdf(pages, files, opts);
  } finally {
    files.forEach((_, id) => releaseSource(id));
  }
}

/** ดาวน์โหลด Blob เป็นไฟล์ */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
