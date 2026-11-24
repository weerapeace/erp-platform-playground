"use client";
/**
 * 💌 การ์ดของขวัญ → รูป PNG (ข้อ 10 · ส่งให้ลูกค้าดูในแชตก่อนพิมพ์) — ฝั่งเบราว์เซอร์เท่านั้น
 *   วาดด้วยสูตรเดียวกับหน้าพิมพ์ (cardHtml แบบ px) → ตัวแปลงกลาง lib/html-to-png (htmlToPngBlob)
 *   ฟอนต์: รูปที่วาดผ่าน SVG โหลดฟอนต์จากเว็บเองไม่ได้ → ดึงไฟล์ฟอนต์มาฝังเป็น data URL ก่อน
 *     Google Fonts (fonts.gstatic.com เปิดให้ดึงข้ามโดเมน) · ฟอนต์แบรนด์ = /api/order-gift-cards/fonts/<id> (โดเมนเดียวกัน)
 *   ฟอนต์โหลดไม่ได้ = ใช้ฟอนต์สำรอง (ไม่ให้ทั้งใบพัง)
 */
import { htmlToPngBlob } from "@/lib/html-to-png";
import { r2ImageUrl } from "@/lib/r2-image";
import { cardHtml, docFonts, findCardFont, googleFontsHref, isUploadFont, uploadFontFamily, type CardDoc } from "@/lib/gift-card-design";

const cache = new Map<string, Promise<string>>();

async function toDataUrl(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(String(res.status));
  const blob = await res.blob();
  return await new Promise<string>((ok, fail) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => fail(fr.error); fr.readAsDataURL(blob); });
}

/** CSS @font-face ที่ฝังไฟล์ฟอนต์ไว้ในตัว (เฉพาะตัวอักษรที่ใช้ — Google ตัดชุดอักษรให้ด้วย &text=) */
async function embeddedFontCss(doc: CardDoc): Promise<string> {
  const fonts = docFonts(doc);
  const text = [...new Set(doc.els.map((e) => e.text ?? "").join(""))].join("");
  const parts: string[] = [];
  for (const f of fonts) {
    try {
      if (isUploadFont(f)) {
        const id = f.slice(7);
        const key = `up:${id}`;
        if (!cache.has(key)) cache.set(key, toDataUrl(`/api/order-gift-cards/fonts/${id}`, { credentials: "same-origin" }));
        parts.push(`@font-face{font-family:'${uploadFontFamily(id)}';src:url('${await cache.get(key)!}')}`);
      } else if (findCardFont(f)) {
        const href = `${googleFontsHref([f])}&text=${encodeURIComponent(text || "Aa")}`;
        const key = `g:${href}`;
        if (!cache.has(key)) cache.set(key, (async () => {
          const css = await fetch(href).then((r) => (r.ok ? r.text() : ""));
          const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
          let out = css;
          for (const u of urls) out = out.replace(u, await toDataUrl(u));
          return out;
        })());
        parts.push(await cache.get(key)!);
      }
    } catch { cache.clear(); /* ฟอนต์นี้ใช้ฟอนต์สำรอง */ }
  }
  return parts.join("\n");
}

/** การ์ด 1 ใบ → PNG · pxPerMm 12 ≈ 300 dpi */
export async function cardToPngBlob(doc: CardDoc, pxPerMm = 12): Promise<Blob> {
  const css = await embeddedFontCss(doc);
  const html = `<style>${css}</style>${cardHtml(doc, { r2ToUrl: (k) => r2ImageUrl(k), pxPerMm })}`;
  return htmlToPngBlob(html, { width: Math.round(doc.w * pxPerMm), scale: 1, background: doc.bg.color });
}
