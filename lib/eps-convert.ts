/**
 * แปลงไฟล์ .eps / .ps (PostScript) → PDF ในเบราว์เซอร์ (ฝั่งหน้าเว็บเท่านั้น)
 *   ใช้ Ghostscript ที่คอมไพล์เป็น WebAssembly (public/vendor/ghostscript-wasm-0.0.2 · AGPL-3.0 ไม่ได้แก้ — ดู README.txt ในโฟลเดอร์)
 *   โหลดเฉพาะตอนมีคนโยน .eps (ครั้งแรก ~16MB แล้วเบราว์เซอร์จำไว้) · ไม่ผ่าน webpack (กัน build หนัก — กฎไลบรารีหนักอยู่ public/vendor)
 *   ไฟล์ไม่ออกจากเครื่องผู้ใช้
 * ใช้โดย: components/vector-splitter/render.ts (ตัวแยกชิ้น) — .eps แปลงเป็น PDF แล้วเข้าทางเดียวกับ .ai/.pdf
 * ⚠️ ห้าม import จาก API route
 */
const GS_BASE = "/vendor/ghostscript-wasm-0.0.2/";

type GsModule = {
  FS: { writeFile: (p: string, d: Uint8Array) => void; readFile: (p: string) => Uint8Array; unlink: (p: string) => void };
  callMain: (args: string[]) => number;
};
type GsFactory = (opts: Record<string, unknown>) => Promise<GsModule>;

let factoryLoader: Promise<GsFactory> | null = null;

/** โหลดสคริปต์ gs.js ครั้งเดียว → ได้ตัวสร้าง (สร้างตัวใหม่ทุกครั้งที่แปลง — Ghostscript รันซ้ำในตัวเดิมไม่เสถียร) */
function loadFactory(): Promise<GsFactory> {
  factoryLoader ??= new Promise<GsFactory>((resolve, reject) => {
    const g = globalThis as unknown as { exports?: { Module?: GsFactory } };
    const prev = g.exports;
    g.exports = {};   // gs.js (โหมดเบราว์เซอร์) ฝากตัวสร้างไว้ที่ exports.Module
    const s = document.createElement("script");
    s.src = `${GS_BASE}gs.js`;
    s.async = true;
    s.onload = () => {
      const f = g.exports?.Module;
      g.exports = prev;
      if (typeof f === "function") resolve(f); else reject(new Error("โหลดตัวแปลง .eps ไม่สำเร็จ"));
    };
    s.onerror = () => { g.exports = prev; reject(new Error("โหลดตัวแปลง .eps ไม่สำเร็จ — เช็กอินเทอร์เน็ตแล้วลองใหม่")); };
    document.head.appendChild(s);
  });
  factoryLoader.catch(() => { factoryLoader = null; });   // ล้มแล้วลองใหม่ได้
  return factoryLoader;
}

/** .eps/.ps → PDF (หน้าเดียวพอดีกรอบรูปด้วย -dEPSCrop) · ล้ม = throw ข้อความภาษาคน */
export async function epsToPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const factory = await loadFactory();
  const log: string[] = [];
  const gs = await factory({
    locateFile: (p: string) => `${GS_BASE}${p}`,
    print: (t: string) => { log.push(t); },
    printErr: (t: string) => { log.push(t); },
  });
  gs.FS.writeFile("/in.eps", bytes);
  let code = -1;
  try {
    code = gs.callMain(["-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dEPSCrop", "-sDEVICE=pdfwrite", "-sOutputFile=/out.pdf", "/in.eps"]);
  } catch (e) {
    // emscripten โยน ExitStatus ตอนจบ — โค้ด 0 = สำเร็จ
    const status = (e as { status?: number })?.status;
    code = typeof status === "number" ? status : -1;
  }
  let out: Uint8Array | null = null;
  try { out = gs.FS.readFile("/out.pdf"); } catch { out = null; }
  if (code !== 0 || !out || out.length < 100) {
    console.warn("[eps-convert]", log.slice(-20).join("\n"));
    throw new Error("แปลงไฟล์ .eps ไม่สำเร็จ — ไฟล์อาจเสีย หรือใช้ฟอนต์/รูปที่ฝังไม่ครบ · ลอง Save As เป็น .ai/.pdf ใน Illustrator แทน");
  }
  return out;
}
