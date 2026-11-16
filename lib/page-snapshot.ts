/**
 * ของกลาง (เบราว์เซอร์เท่านั้น) — ถ่ายรูป "ส่วนที่เห็นบนจอ" ของหน้าที่เปิดใน iframe โดเมนเดียวกัน + วาดกรอบเลขโซนทับ
 * วิธี: คัดลอกโครงหน้า + สไตล์ทั้งหมดของหน้านั้น → เอกสารใหม่ → ตัวแปลงรูปกลาง lib/html-to-png (htmlDocToImageBlob) → canvas วาดกรอบ
 * ใช้โดย: ป๊อปดูหน้าจริงของแผนผังการทำงาน (components/flow-map/page-preview) ปุ่ม "คัดลอกทั้งหมด (ข้อความ + รูป)"
 * ข้อจำกัด: ค่าที่พิมพ์ในช่อง/รูปพื้นหลัง CSS/ฟอนต์พิเศษ อาจไม่ติด (ใช้ฟอนต์ในเครื่อง) · กรอบที่อยู่นอกจอไม่ติดในรูป
 */
import { htmlDocToImageBlob } from "./html-to-png";

export type SnapZone = { x: number; y: number; w: number; h: number; n: number };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** สไตล์ทั้งหมดของหน้า (ไฟล์ CSS โดเมนเดียวกัน + <style>) เป็นข้อความเดียว */
function collectCss(doc: Document): string {
  const out: string[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    try { out.push(Array.from(sheet.cssRules).map((r) => r.cssText).join("\n")); } catch { /* ไฟล์ข้ามโดเมน — ข้าม */ }
  }
  return out.join("\n");
}

/** iframe → รูป PNG ของส่วนที่เห็น (กว้าง × สูง ของกรอบ) · zones = พิกัดในจอของ iframe (px) */
export async function snapshotFrame(frame: HTMLIFrameElement, zones: SnapZone[]): Promise<Blob> {
  const doc = frame.contentDocument, win = frame.contentWindow;
  if (!doc || !win) throw new Error("ถ่ายรูปหน้านี้ไม่ได้");
  const w = Math.max(1, win.innerWidth), h = Math.max(1, win.innerHeight);
  const sx = win.scrollX, sy = win.scrollY;
  const body = doc.body.cloneNode(true) as HTMLElement;
  body.querySelectorAll("script, noscript, iframe, [data-snapshot-skip]").forEach((n) => n.remove());
  // ค่าที่พิมพ์อยู่ในช่อง → ใส่เป็นค่าเริ่มต้น (ไม่งั้นรูปเป็นช่องว่าง)
  const src = doc.body.querySelectorAll("input, textarea, select"), dst = body.querySelectorAll("input, textarea, select");
  src.forEach((el, i) => {
    const d = dst[i] as HTMLInputElement | undefined; if (!d) return;
    const v = (el as HTMLInputElement).value;
    if (el.tagName === "TEXTAREA") d.textContent = v; else if (el.tagName === "SELECT") d.setAttribute("data-v", v); else d.setAttribute("value", v);
  });
  const html = `<!DOCTYPE html><html class="${esc(doc.documentElement.className)}"><head><meta charset="utf-8"><style>${collectCss(doc)}</style></head>`
    + `<body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#fff">`
    + `<div class="${esc(doc.body.className)}" style="position:relative;left:${-sx}px;top:${-sy}px;width:${doc.documentElement.scrollWidth}px">${body.innerHTML}</div></body></html>`;
  const page = await htmlDocToImageBlob(html, { width: w, scale: 1, type: "image/png" });
  return await drawZones(page, w, h, zones);
}

/** รูปหน้า + กรอบประม่วง + วงเลข ตามโซน */
export async function drawZones(png: Blob, w: number, h: number, zones: SnapZone[]): Promise<Blob> {
  const url = URL.createObjectURL(png);
  try {
    const img = new Image();
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error("อ่านรูปไม่ได้")); img.src = url; });
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("เบราว์เซอร์นี้วาดรูปไม่ได้");
    ctx.drawImage(img, 0, 0, w, h);
    for (const z of zones) {
      ctx.fillStyle = "rgba(124,58,237,.10)"; ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.setLineDash([7, 4]); ctx.lineWidth = 3; ctx.strokeStyle = "#7c3aed"; ctx.strokeRect(z.x, z.y, z.w, z.h);
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(z.x, z.y, 13, 0, Math.PI * 2); ctx.fillStyle = "#6d28d9"; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(z.n), z.x, z.y + 1);
    }
    return await new Promise<Blob>((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error("แปลงเป็นรูปไม่สำเร็จ"))), "image/png"));
  } finally { URL.revokeObjectURL(url); }
}

/** คัดลอกข้อความ + รูป ลงคลิปบอร์ดพร้อมกัน (วางในแชต Claude ได้ทั้งคู่) · เบราว์เซอร์ไม่รองรับรูป = ข้อความอย่างเดียว */
export async function copyTextAndImage(text: string, png: Blob | null): Promise<"both" | "text"> {
  if (png && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "image/png": png })]);
      return "both";
    } catch { /* บางเบราว์เซอร์ไม่ยอมใส่ 2 แบบ — ใส่ข้อความอย่างเดียว */ }
  }
  await navigator.clipboard.writeText(text);
  return "text";
}
