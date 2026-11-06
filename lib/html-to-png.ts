/**
 * ของกลาง — แปลง HTML เป็นรูป (PNG / JPG) ในเบราว์เซอร์ · ไม่ต้องลงไลบรารีเพิ่ม
 * วิธี: วาง HTML ลงที่ซ่อน → แปลงรูปทุกรูปเป็น data URL (รูปในระบบเสิร์ฟจากโดเมนเดียวกัน ไม่ติด CORS)
 *       → ห่อด้วย SVG <foreignObject> → วาดลง canvas → ไฟล์รูป
 *
 * 2 แบบ:
 *   htmlToPngBlob(ชิ้น HTML)      = ชิ้นที่ใส่ style ในบรรทัด (ไม่พึ่ง class/Tailwind) เช่น lib/design-sheet-summary
 *   htmlDocToImageBlob(เอกสารเต็ม) = ใบพิมพ์ทั้งใบ (<html> + <style> ของตัวเอง เช่น จาก lib/template / lib/list-print)
 *                                   วาดใน iframe ซ่อน → สไตล์ของเว็บไม่ปนกับใบ · หน้าตา = พรีวิวบนจอ (ใช้ @media screen)
 *                                   ★ 2026-11-06 เจ้าของขอ "โหลดแบบ JPG ได้ด้วย ข้าง ๆ บันทึก PDF" (หน้าสรุปบิลจีน)
 * ข้อควรรู้: ฟอนต์ใช้ฟอนต์ที่มีในเครื่อง · Chrome/Edge/Firefox ใช้ได้ · Safari บางรุ่นอาจไม่ยอมแปลง (จะ throw)
 *           รูปพื้นหลังใน CSS (background-image: url) ไม่ติดมา — ใช้ <img> เท่านั้น
 * ใช้คู่กับ copyBlobToClipboard / downloadBlob ใน lib/image-clipboard · ปุ่มกลาง = components/report/save-image-button
 */

async function toDataUrl(src: string): Promise<string> {
  const res = await fetch(src, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`โหลดรูปไม่ได้ (${res.status})`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("อ่านรูปไม่ได้"));
    fr.readAsDataURL(blob);
  });
}

/** รูปทุกรูปในกล่อง → data URL (SVG ที่วาดลง canvas โหลดไฟล์ภายนอกเองไม่ได้) · รูปที่โหลดไม่ได้ = เอาออก (ไม่ให้ทั้งใบพัง) */
async function inlineImages(root: ParentNode): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(imgs.map(async (img) => {
    const raw = img.getAttribute("src");
    if (!raw || raw.startsWith("data:")) return;
    try { img.setAttribute("src", await toDataUrl(img.src || raw)); } catch { img.removeAttribute("src"); }
    img.removeAttribute("srcset");
  }));
  await Promise.all(imgs.map((img) => (img.getAttribute("src") ? img.decode().catch(() => undefined) : undefined)));
}

/** canvas ใหญ่เกินเบราว์เซอร์รับไม่ได้ (Chrome: ด้านละ ≤ 32767 px · พื้นที่ ≤ ~268 ล้าน px) → ลดความคมลงให้พอดี
 *  คืน 0 = ยาวเกินจะทำเป็นรูปเดียวได้ (แม้ความคมเท่าจอ) */
export function fitImageScale(width: number, height: number, want = 2): number {
  const MAX_SIDE = 32000;
  const MAX_AREA = 250_000_000;
  const w = Math.max(1, width), h = Math.max(1, height);
  const s = Math.min(want, MAX_SIDE / w, MAX_SIDE / h, Math.sqrt(MAX_AREA / (w * h)));
  if (s < 0.75) return 0;
  return Math.floor(s * 100) / 100;
}

/** ชื่อไฟล์ปลอดภัย (ไทย/อังกฤษ/ตัวเลข · ตัดอักขระที่ Windows ห้าม) + นามสกุล */
export function imageFileName(name: string, ext = "jpg"): string {
  const base = (name || "").replace(/\.(jpe?g|png)$/i, "").replace(/[\\/:*?"<>|\s]+/g, " ").trim().replace(/\s+/g, "_").slice(0, 80) || "print";
  return `${base}.${ext}`;
}

type RasterOpts ={ scale: number; background: string; type: "image/png" | "image/jpeg"; quality?: number };

/** XHTML (จาก XMLSerializer) → รูป */
async function rasterize(xhtml: string, width: number, height: number, o: RasterOpts): Promise<Blob> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const image = new Image();
  image.decoding = "sync";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("แปลงเป็นรูปไม่สำเร็จ"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * o.scale);
  canvas.height = Math.round(height * o.scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้วาดรูปไม่ได้");
  ctx.fillStyle = o.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(o.scale, o.scale);
  ctx.drawImage(image, 0, 0);
  return await new Promise<Blob>((resolve, reject) => {
    try { canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("แปลงเป็นรูปไม่สำเร็จ"))), o.type, o.quality); }
    catch { reject(new Error("เบราว์เซอร์นี้ไม่ยอมให้แปลงเป็นรูป (ลองใช้ Chrome)")); }
  });
}

export async function htmlToPngBlob(html: string, opts: { width?: number; scale?: number; background?: string } = {}): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("ใช้ได้เฉพาะในเบราว์เซอร์");
  const width = opts.width ?? 960;
  const scale = opts.scale ?? 2;
  const background = opts.background ?? "#ffffff";

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none;";
  const content = document.createElement("div");
  content.style.cssText = `width:${width}px;background:${background};`;
  content.innerHTML = html;
  host.appendChild(content);
  document.body.appendChild(host);
  try {
    await inlineImages(content);
    const height = Math.max(1, Math.ceil(content.scrollHeight));
    const xhtml = new XMLSerializer().serializeToString(content);
    return await rasterize(xhtml, width, height, { scale, background, type: "image/png" });
  } finally {
    host.remove();
  }
}

/**
 * เอกสารพิมพ์ทั้งใบ (<!DOCTYPE html>…) → รูป JPG/PNG ยาวม้วนเดียว (หลายหน้า = ต่อกันลงมา เหมือนพรีวิว)
 *   width = ความกว้างกระดาษบนจอ (px) — ใบที่มี min-width กว้างกว่านี้ ใช้ความกว้างจริงของใบ
 */
export async function htmlDocToImageBlob(docHtml: string, opts: { width?: number; scale?: number; background?: string; type?: "image/png" | "image/jpeg"; quality?: number } = {}): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("ใช้ได้เฉพาะในเบราว์เซอร์");
  const background = opts.background ?? "#ffffff";
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${opts.width ?? 794}px;height:10px;border:0;pointer-events:none;visibility:hidden;`;
  document.body.appendChild(frame);
  try {
    // srcdoc = โดเมนเดียวกับเว็บ → ลิงก์รูปแบบย่อ (/api/r2-image?…) อ้างเว็บจริงได้ · ไม่รันสคริปต์ในใบ
    await new Promise<void>((resolve) => { frame.onload = () => resolve(); frame.srcdoc = docHtml.replace(/<script\b[\s\S]*?<\/script>/gi, ""); });
    const doc = frame.contentDocument;
    if (!doc?.documentElement) throw new Error("เปิดเอกสารไม่ได้");
    await inlineImages(doc);
    await (doc.fonts?.ready ?? Promise.resolve());
    const root = doc.documentElement;
    const width = Math.max(1, Math.ceil(Math.max(root.scrollWidth, doc.body?.scrollWidth ?? 0)));
    const height = Math.max(1, Math.ceil(Math.max(root.scrollHeight, doc.body?.scrollHeight ?? 0)));
    const scale = fitImageScale(width, height, opts.scale ?? 2);
    if (!scale) throw new Error("ใบยาวเกินจะทำเป็นรูปเดียวได้ — ลองกรองให้น้อยลง หรือใช้บันทึก PDF");
    // ส่วนหัว (<head>) ไม่ต้องวาด · พื้นใบขาว (ไม่งั้นส่วนที่โปร่งใสกลายเป็นดำใน JPG)
    const guard = doc.createElement("style");
    guard.textContent = `head, script { display: none !important; } html { background: ${background}; }`;
    doc.head?.appendChild(guard);
    const xhtml = new XMLSerializer().serializeToString(root);
    return await rasterize(xhtml, width, height, { scale, background, type: opts.type ?? "image/jpeg", quality: opts.quality ?? 0.92 });
  } finally {
    frame.remove();
  }
}
