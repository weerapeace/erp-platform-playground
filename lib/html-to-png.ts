/**
 * ของกลาง — แปลง "ชิ้น HTML" (สไตล์ในบรรทัด) เป็นรูป PNG ในเบราว์เซอร์ · ไม่ต้องลงไลบรารีเพิ่ม
 * วิธี: วาง HTML ลงหน้าแบบซ่อน → แปลงรูปทุกรูปเป็น data URL (รูปในระบบเสิร์ฟจากโดเมนเดียวกัน ไม่ติด CORS)
 *       → ห่อด้วย SVG <foreignObject> → วาดลง canvas → PNG
 * ข้อควรรู้: ใช้ได้ดีกับ HTML ที่ใส่ style ในบรรทัด (ไม่พึ่ง class/Tailwind) เช่น lib/design-sheet-summary
 *           ฟอนต์ใช้ฟอนต์ที่มีในเครื่อง · Chrome/Edge/Firefox ใช้ได้ · Safari บางรุ่นอาจไม่ยอมแปลง (จะ throw)
 * ใช้คู่กับ copyBlobToClipboard / downloadBlob ใน lib/image-clipboard
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
    // รูป → data URL (SVG ที่วาดลง canvas โหลดไฟล์ภายนอกเองไม่ได้)
    const imgs = Array.from(content.querySelectorAll("img"));
    await Promise.all(imgs.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:")) return;
      try { img.setAttribute("src", await toDataUrl(src)); } catch { img.removeAttribute("src"); }
    }));
    await Promise.all(imgs.map((img) => (img.getAttribute("src") ? img.decode().catch(() => undefined) : undefined)));
    const height = Math.max(1, Math.ceil(content.scrollHeight));

    const xhtml = new XMLSerializer().serializeToString(content);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;
    const image = new Image();
    image.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("แปลงเป็นรูปไม่สำเร็จ"));
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("เบราว์เซอร์นี้วาดรูปไม่ได้");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      try { canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("แปลงเป็นรูปไม่สำเร็จ"))), "image/png"); }
      catch { reject(new Error("เบราว์เซอร์นี้ไม่ยอมให้แปลงเป็นรูป (ลองใช้ Chrome)")); }
    });
  } finally {
    host.remove();
  }
}
