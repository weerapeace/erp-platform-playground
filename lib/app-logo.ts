/**
 * ของกลาง: หาโลโก้ของแอป/บริการจาก "เว็บ" ของมัน (ไม่ต้องมี API key)
 *
 * ใช้กับ LogoPicker (components/logo-picker) — ตอนนี้ใช้ที่ App Subscription
 * ใช้ซ้ำได้กับอะไรก็ตามที่มีชื่อ + เว็บ (ร้านค้า / ซัพพลายเออร์ / แพลตฟอร์ม)
 *
 * ⚠️ รูปจากบริการไอคอนภายนอกเป็นการเดา — ไม่เจอจริงบางทีได้รูปลูกโลกเปล่า ๆ → ให้ผู้ใช้เลือกด้วยตาเสมอ
 */
import { vendorDomain } from "@/lib/gmail-search";

export type LogoCandidate = { key: string; label: string; url: string };

/** ทำความสะอาดโดเมนที่พิมพ์มา (ตัด https:// และ path ออก) — ว่าง/ไม่ใช่โดเมน = null */
export function cleanDomain(input: string | null | undefined): string | null {
  const s = (input ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : null;
}

/** เดาเว็บของแอป: จากลิงก์ (เช่นหน้าบิล) ก่อน → ไม่มีก็เดาจากคำแรกของชื่อ + .com (เช่น "Adobe Full" → adobe.com) */
export function guessLogoDomain(p: { url?: string | null; name?: string | null }): string {
  const fromUrl = vendorDomain(p.url);
  if (fromUrl) return fromUrl;
  const word = (p.name ?? "").toLowerCase().match(/[a-z0-9]+/)?.[0];
  return word ? `${word}.com` : "";
}

/** รูปที่น่าจะเป็นโลโก้ของโดเมนนี้ (เรียงจากชัดสุด) */
export function logoCandidates(domainInput: string): LogoCandidate[] {
  const d = cleanDomain(domainInput);
  if (!d) return [];
  return [
    { key: "google", label: "ไอคอนเว็บ", url: `https://www.google.com/s2/favicons?domain=${d}&sz=256` },
    { key: "apple", label: "ไอคอนแอป", url: `https://${d}/apple-touch-icon.png` },
    { key: "ddg", label: "ไอคอนสำรอง", url: `https://icons.duckduckgo.com/ip3/${d}.ico` },
  ];
}

/** ลิงก์ค้นรูปโลโก้ใน Google รูปภาพ (ผู้ใช้ก๊อปรูปแล้วกลับมาวาง) */
export function logoImageSearchUrl(name: string): string {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${name.trim()} logo png`)}`;
}

/** สีพื้นหลังตัวอักษรแทนโลโก้ — สุ่มคงที่ตามชื่อ (ชื่อเดิมได้สีเดิมเสมอ) */
const LETTER_BG = ["bg-indigo-500", "bg-emerald-500", "bg-sky-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-teal-500", "bg-orange-500"];
export function letterBg(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LETTER_BG[h % LETTER_BG.length];
}
