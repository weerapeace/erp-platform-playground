/**
 * 📍 ค้นที่อยู่ไทย (ตำบล → อำเภอ → จังหวัด → รหัสไปรษณีย์) — ฝั่งเซิร์ฟเวอร์ (ข้อมูล ~200KB ไม่ส่งไปเบราว์เซอร์)
 *
 * ใช้ที่: /api/public/address/search (เว็บร้าน: พิมพ์ตำบล/รหัสไปรษณีย์แล้วเลือก อีก 3 ช่องเติมให้เอง — ลดที่อยู่ผิด/ของตีกลับ)
 * ข้อมูล: lib/data/thai-address-db.ts (thai-address-database ISC ← jquery.Thailand.js MIT) — ถอดรูปย่อครั้งเดียวแล้วจำไว้ในหน่วยความจำ
 * ⚠️ ข้อมูลชุดนี้อาจขาดตำบลที่ตั้งใหม่ไม่กี่แห่ง → เว็บยังให้พิมพ์เองได้เสมอ (ช่วยเลือก ไม่บังคับ)
 * (จัดรูปแบบที่อยู่บนเอกสาร = lib/thai-address.ts คนละเรื่อง)
 */
import { THAI_ADDRESS_DB } from "@/lib/data/thai-address-db";

export interface ThaiAddress {
  subdistrict: string;
  district: string;
  province: string;
  postal: string;
}

let cache: ThaiAddress[] | null = null;

/** ถอดรูปฐานข้อมูลย่อ (ตามวิธีของ jquery.Thailand.js preprocess) */
function expand(): ThaiAddress[] {
  if (cache) return cache;
  const raw = THAI_ADDRESS_DB;
  const lookup = raw.lookup ? raw.lookup.split("|") : [];
  const words = raw.words ? raw.words.split("|") : [];
  const useLookup = !!(raw.lookup && raw.words);
  const t = (text: unknown): string => {
    if (!useLookup) return String(text ?? "");
    const s = typeof text === "number" ? lookup[text] ?? "" : String(text ?? "");
    return s.replace(/[A-Z]/gi, (m) => {
      const ch = m.charCodeAt(0);
      return words[ch < 97 ? ch - 65 : 26 + ch - 97] ?? m;
    });
  };
  const out: ThaiAddress[] = [];
  for (const prov of raw.data as unknown[][]) {
    const i = prov.length === 3 ? 2 : 1;
    for (const amp of prov[i] as unknown[][]) {
      for (const dist of amp[i] as unknown[][]) {
        const zips = Array.isArray(dist[i]) ? (dist[i] as unknown[]) : [dist[i]];
        for (const z of zips) out.push({ subdistrict: t(dist[0]), district: t(amp[0]), province: t(prov[0]), postal: String(z ?? "") });
      }
    }
  }
  cache = out;
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, "").replace(/^(ต\.|ตำบล|แขวง|อ\.|อำเภอ|เขต|จ\.|จังหวัด)/, "").toLowerCase();

/**
 * ค้นจากคำที่ลูกค้าพิมพ์ — ตัวเลข = รหัสไปรษณีย์ (ขึ้นต้น) · ตัวหนังสือ = ตำบล/อำเภอ/จังหวัด
 * เรียง: ตำบลขึ้นต้นด้วยคำค้น → อำเภอขึ้นต้น → จังหวัดขึ้นต้น → มีคำค้นอยู่ข้างใน
 * หลายคำ (เช่น "บางรัก กรุงเทพ") = ทุกคำต้องเจอในตำบล/อำเภอ/จังหวัด
 */
export function searchThaiAddress(q: string, limit = 10): ThaiAddress[] {
  const query = String(q ?? "").trim().slice(0, 60);
  if (!query) return [];
  const all = expand();
  const digits = query.replace(/\D/g, "");
  if (digits.length >= 2 && digits.length === query.replace(/\s/g, "").length) {
    return all.filter((a) => a.postal.startsWith(digits)).slice(0, limit);
  }
  const parts = query.split(/\s+/).map(norm).filter(Boolean);
  if (!parts.length) return [];
  const first = parts[0];
  const scored: { a: ThaiAddress; s: number }[] = [];
  for (const a of all) {
    const sub = norm(a.subdistrict);
    const dis = norm(a.district);
    const pro = norm(a.province);
    const hay = `${sub}|${dis}|${pro}|${a.postal}`;
    if (!parts.every((p) => hay.includes(p))) continue;
    const s = sub.startsWith(first) ? 0 : dis.startsWith(first) ? 1 : pro.startsWith(first) ? 2 : 3;
    scored.push({ a, s });
  }
  scored.sort((x, y) => x.s - y.s || x.a.subdistrict.length - y.a.subdistrict.length);
  return scored.slice(0, limit).map((x) => x.a);
}

/** จำนวนรายการทั้งหมด (ไว้เช็กว่าถอดรูปถูก) */
export const thaiAddressCount = () => expand().length;
