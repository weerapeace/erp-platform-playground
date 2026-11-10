/**
 * รูปในรายละเอียดสินค้าบน LINE (ของกลาง · ช่วงทดสอบ — เจ้าของอนุมัติทำปุ่มทดสอบ 2026-11-10)
 * --------------------------------------------------------------------------
 * ปัญหา: LINE ไม่รับ <img> ที่ลิงก์ไปรูปนอก LINE ในรายละเอียด (400 "Invalid Description") และ API ไม่มีช่องอัปรูปเข้ารายละเอียด
 *   แต่รูปสินค้า (แกลเลอรี) ที่ส่งลิงก์ไป LINE จะก๊อปไปเก็บบนเซิร์ฟเวอร์ของ LINE เอง (obs-ect.line-scdn.net)
 *   และรูปในรายละเอียดของร้านเรา 867/934 รายการก็เป็นลิงก์ของ LINE ทั้งหมด (793 รายการวางรูปท้ายข้อความ)
 * วิธี "ฝากรูปผ่านแกลเลอรี": ใส่รูปเข้าแกลเลอรีชั่วคราว (≤7/รอบ) → ดึงสินค้ากลับมาเอาลิงก์ LINE → คืนแกลเลอรีเดิมเสมอ
 *   → ต่อรูป (ลิงก์ LINE) ท้ายรายละเอียด
 * ยังต้องพิสูจน์: (1) LINE รับลิงก์ของตัวเองในรายละเอียดไหม (2) รูปที่ฝากแล้วเอาออกจากแกลเลอรี ยังอยู่ถาวรไหม
 */
import { lineGetProduct, lineUpdateProduct } from "@/lib/line-shopping";
import { MAX_LINE_DESC_IMAGES, MAX_LINE_IMAGES } from "@/lib/line-listing-edit";

/** ใส่ได้ครั้งละไม่เกิน (ค่ากลางอยู่ที่ lib/line-listing-edit — หน้าเว็บใช้ตัวนั้น ไม่ต้องดึงไฟล์นี้ที่มีโค้ดฝั่งเซิร์ฟเวอร์) */
export const LINE_DESC_IMAGES_MAX = MAX_LINE_DESC_IMAGES;
const GALLERY_BATCH = MAX_LINE_IMAGES;   // LINE รับรูปสินค้า ≤ 7

/** ลิงก์รูปบนเซิร์ฟเวอร์ของ LINE ไหม */
export const isLineCdnUrl = (u: string): boolean => /^https:\/\/[\w.-]*line-scdn\.net\//i.test(u);

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** ต่อรูปท้ายรายละเอียด (1 รูป = 1 ย่อหน้า แบบตัวแก้ไขของ LINE) · ข้ามรูปที่มีอยู่แล้ว */
export function appendDescImages(html: string, urls: string[]): string {
  const base = (html ?? "").trim();
  const fresh = [...new Set(urls.map((u) => u.trim()).filter(Boolean))].filter((u) => !base.includes(u));
  if (!fresh.length) return base;
  return `${base}${fresh.map((u) => `<p><img src="${escAttr(u)}" alt=""></p>`).join("")}`;
}

/** นับว่ารูปที่ใส่ อยู่ในรายละเอียดบน LINE จริงกี่รูป */
export const countPresent = (html: string, urls: string[]): number => urls.filter((u) => (html ?? "").includes(u)).length;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const urlsOf = (row: Record<string, unknown> | null): string[] => (row && Array.isArray(row.imageUrls) ? (row.imageUrls as unknown[]).map((x) => String(x ?? "")).filter(Boolean) : []);

/**
 * ฝากรูปกับ LINE ผ่านแกลเลอรีชั่วคราว → ลิงก์รูปบนเซิร์ฟเวอร์ LINE (ลำดับเดียวกับที่ส่ง)
 * คืนแกลเลอรีเดิมเสมอ (finally) · แกลเลอรีเดิมว่าง = ไม่ทำ (คืนไม่ได้)
 */
export async function lineHostImagesViaGallery(apiKey: string, productId: string, publicUrls: string[]): Promise<{ ok: boolean; hosted: string[]; restored: boolean; original: string[]; error?: string }> {
  const cur = await lineGetProduct(apiKey, productId);
  if (!cur.ok || !cur.row) return { ok: false, hosted: [], restored: true, original: [], error: cur.error || "ดึงสินค้าจาก LINE ไม่ได้" };
  const original = urlsOf(cur.row);
  if (!original.length) return { ok: false, hosted: [], restored: true, original, error: "สินค้านี้ไม่มีรูปสินค้าบน LINE — คืนแกลเลอรีไม่ได้ จึงไม่ทำ" };
  const hosted: string[] = [];
  const errors: string[] = [];
  let restored = false;
  try {
    for (let i = 0; i < publicUrls.length; i += GALLERY_BATCH) {
      const batch = publicUrls.slice(i, i + GALLERY_BATCH);
      const up = await lineUpdateProduct(apiKey, productId, { imageUrls: batch });
      if (!up.ok) { errors.push(`ฝากรูปชุดที่ ${i / GALLERY_BATCH + 1} ไม่สำเร็จ: ${up.error ?? `HTTP ${up.status}`}`); break; }
      // LINE อาจใช้เวลาก๊อปรูป → ลองดึงซ้ำสูงสุด 4 ครั้ง จนได้ลิงก์ LINE ครบ
      let got: string[] = [];
      for (let t = 0; t < 4; t++) {
        const g = await lineGetProduct(apiKey, productId);
        got = urlsOf(g.row);
        if (got.length === batch.length && got.every(isLineCdnUrl)) break;
        await wait(1500);
      }
      if (got.length !== batch.length || !got.every(isLineCdnUrl)) { errors.push(`LINE ตอบรูปกลับมาไม่ครบ/ไม่ใช่ลิงก์ LINE (ส่ง ${batch.length} ได้ ${got.filter(isLineCdnUrl).length})`); break; }
      hosted.push(...got);
    }
  } finally {
    const back = await lineUpdateProduct(apiKey, productId, { imageUrls: original });
    restored = back.ok;
    if (!back.ok) errors.push(`คืนแกลเลอรีเดิมไม่สำเร็จ: ${back.error ?? `HTTP ${back.status}`} — ต้องเข้าไปตั้งรูปเองใน LINE`);
  }
  return { ok: errors.length === 0 && hosted.length === publicUrls.length, hosted, restored, original, ...(errors.length ? { error: errors.join(" · ") } : {}) };
}
