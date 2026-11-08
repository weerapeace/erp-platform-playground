// ============================================================
// storage-places — รายชื่อ "ที่เก็บ" สำหรับวาดผัง (กล่องที่เก็บในกระดาน flowchart) + ไอคอน SVG
//
// 3 ตัวแรก (Google Drive · R2 · Supabase) = ที่เก็บจริงของระบบ → ชื่อ/คำอธิบายดึงจาก lib/storage-policy (STORAGE_PROVIDERS) ที่เดียว
// ที่เหลือ (NAS · ฮาร์ดดิสก์ · คอมในเครื่อง ...) = ไว้วางแผน ระบบไม่ได้อัปโหลดไปที่นั่น
// ไอคอน = SVG ข้อความล้วน (ภาพจำง่าย ไม่ใช่โลโก้จริงของบริษัท) → ใช้ได้ทั้งบนจอและตอนบันทึกเป็นรูป
// ไม่มี React — เทสต์ได้ (lib/__tests__/storage-places.test.ts)
// ============================================================

import { STORAGE_PROVIDERS } from "./storage-policy";

export type StoragePlace = { key: string; th: string; en: string; hintTh: string; hintEn: string; color: string; tint: string };

const sp = STORAGE_PROVIDERS;
export const STORAGE_PLACES: StoragePlace[] = [
  { key: "drive",    th: sp.drive.label, en: sp.drive.en, hintTh: sp.drive.goodAt, hintEn: sp.drive.goodAtEn, color: "#1a73e8", tint: "#eef4fe" },
  { key: "r2",       th: "Cloudflare R2", en: "Cloudflare R2", hintTh: sp.r2.goodAt, hintEn: sp.r2.goodAtEn, color: "#f38020", tint: "#fff4ea" },
  { key: "supabase", th: sp.supabase.label, en: sp.supabase.en, hintTh: sp.supabase.goodAt, hintEn: sp.supabase.goodAtEn, color: "#249e6b", tint: "#ecfbf4" },
  { key: "gphotos",  th: "Google Photos", en: "Google Photos", hintTh: "คลังรูปในมือถือ/บัญชี Google", hintEn: "Phone / Google account photo library", color: "#ea4335", tint: "#fef2f1" },
  { key: "onedrive", th: "OneDrive", en: "OneDrive", hintTh: "คลาวด์ของ Microsoft", hintEn: "Microsoft cloud", color: "#0078d4", tint: "#eaf4fc" },
  { key: "dropbox",  th: "Dropbox", en: "Dropbox", hintTh: "คลาวด์แชร์ไฟล์", hintEn: "File-sharing cloud", color: "#0061ff", tint: "#ebf2ff" },
  { key: "cloud",    th: "คลาวด์อื่น ๆ", en: "Other cloud", hintTh: "บริการเก็บไฟล์ออนไลน์อื่น", hintEn: "Any other online storage", color: "#0891b2", tint: "#ecfeff" },
  { key: "nas",      th: "NAS / ไดรฟ์ในออฟฟิศ", en: "NAS / office drive", hintTh: "เครื่องเก็บไฟล์กลางในออฟฟิศ (เช่น ไดรฟ์ Z:)", hintEn: "Shared office storage (e.g. drive Z:)", color: "#334155", tint: "#f1f5f9" },
  { key: "pc",       th: "คอมในเครื่อง", en: "This computer", hintTh: "เก็บในเครื่องคนทำงาน (ไม่มีสำรอง)", hintEn: "On the worker's PC (no backup)", color: "#475569", tint: "#f8fafc" },
  { key: "hdd",      th: "ฮาร์ดดิสก์ภายนอก", en: "External hard drive", hintTh: "ไว้สำรอง/เก็บไฟล์ใหญ่", hintEn: "Backup / big files", color: "#57534e", tint: "#f5f5f4" },
  { key: "usb",      th: "แฟลชไดรฟ์ USB", en: "USB flash drive", hintTh: "ย้ายไฟล์ไปเครื่องจักร/เครื่องอื่น", hintEn: "Move files to machines / other PCs", color: "#6366f1", tint: "#eef2ff" },
  { key: "phone",    th: "มือถือ", en: "Phone", hintTh: "ไฟล์/รูปในมือถือพนักงาน", hintEn: "Files on a staff phone", color: "#0f766e", tint: "#f0fdfa" },
  { key: "db",       th: "ฐานข้อมูล", en: "Database", hintTh: "ข้อมูลในระบบ ERP", hintEn: "Data in the ERP", color: "#7c3aed", tint: "#f5f3ff" },
  { key: "cabinet",  th: "ตู้เอกสาร (กระดาษ)", en: "Paper filing cabinet", hintTh: "เอกสารตัวจริงที่เป็นกระดาษ", hintEn: "Original paper documents", color: "#a16207", tint: "#fefce8" },
  { key: "trash",    th: "ลบทิ้ง", en: "Delete", hintTh: "ไฟล์ที่ไม่ต้องเก็บ / ลบตามรอบ", hintEn: "Not kept / deleted on schedule", color: "#e11d48", tint: "#fff1f2" },
];

const BY_KEY = new Map(STORAGE_PLACES.map((p) => [p.key, p]));
export const storagePlaceOf = (key: string | undefined | null): StoragePlace | null => (key ? BY_KEY.get(key) ?? null : null);
export const isPlaceKey = (v: unknown): v is string => typeof v === "string" && BY_KEY.has(v);

/** ชื่อกล่องเดิม → เดาที่เก็บ (ไว้ติ๊กให้ก่อนในป๊อป) เช่น "Google Drive\nไฟล์งาน" → drive */
export function guessPlace(label: string): string | null {
  const s = (label ?? "").toLowerCase();
  if (/google\s*drive|ไดรฟ์\s*google|\bgdrive\b/.test(s)) return "drive";
  if (/\br2\b|cloudflare/.test(s)) return "r2";
  if (/supabase/.test(s)) return "supabase";
  if (/google\s*photos?/.test(s)) return "gphotos";
  if (/onedrive/.test(s)) return "onedrive";
  if (/dropbox/.test(s)) return "dropbox";
  if (/\bnas\b|ไดรฟ์\s*z|z:\\?/.test(s)) return "nas";
  if (/usb|แฟลช/.test(s)) return "usb";
  if (/ฮาร์ดดิสก์|external|hdd/.test(s)) return "hdd";
  if (/ตู้เอกสาร|กระดาษ/.test(s)) return "cabinet";
  if (/ลบทิ้ง|ถังขยะ|trash/.test(s)) return "trash";
  return null;
}

/** รูปเล็กกลางไอคอน (viewBox 48×48) */
function glyph(key: string, c: string): string {
  const s = `fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"`;
  const cloud = (fill: string) => `<path d="M15 33 H33 A7 7 0 0 0 33.5 19 A10 10 0 0 0 14.5 21.5 A6 6 0 0 0 15 33 Z" fill="${fill}"/>`;
  switch (key) {
    case "drive":    return `<path d="M24 12 L11 34" stroke="#0f9d58" stroke-width="5.5" stroke-linecap="round"/><path d="M24 12 L37 34" stroke="#f4b400" stroke-width="5.5" stroke-linecap="round"/><path d="M11 34 H37" stroke="#4285f4" stroke-width="5.5" stroke-linecap="round"/>`;
    case "r2":       return cloud(c) + `<text x="24" y="30.5" text-anchor="middle" font-family="'Segoe UI',Arial,sans-serif" font-size="8.5" font-weight="800" fill="#fff">R2</text>`;
    case "supabase": return `<path d="M26.5 9 L13 27 H24 L21.5 39 L35 21 H24 Z" fill="${c}"/>`;
    case "gphotos":  return `<path d="M24 24 V12 A6 6 0 0 1 24 24 Z" fill="#ea4335"/><path d="M24 24 H36 A6 6 0 0 1 24 24 Z" fill="#4285f4"/><path d="M24 24 V36 A6 6 0 0 1 24 24 Z" fill="#34a853"/><path d="M24 24 H12 A6 6 0 0 1 24 24 Z" fill="#fbbc05"/>`;
    case "onedrive": return cloud(c);
    case "dropbox":  return `<path d="M17 13 L24 17.5 L17 22 L10 17.5 Z M31 13 L38 17.5 L31 22 L24 17.5 Z M17 22 L24 26.5 L17 31 L10 26.5 Z M31 22 L38 26.5 L31 31 L24 26.5 Z M17 33 L24 28.5 L31 33 L24 37.5 Z" fill="${c}"/>`;
    case "cloud":    return `<path d="M15 33 H33 A7 7 0 0 0 33.5 19 A10 10 0 0 0 14.5 21.5 A6 6 0 0 0 15 33 Z" ${s}/>`;
    case "nas":      return `<rect x="13" y="10" width="22" height="28" rx="3" ${s}/><path d="M17 17 H27 M17 23.5 H27 M17 30 H27" ${s}/><circle cx="31" cy="17" r="1.3" fill="${c}"/><circle cx="31" cy="23.5" r="1.3" fill="${c}"/><circle cx="31" cy="30" r="1.3" fill="${c}"/>`;
    case "pc":       return `<rect x="10" y="12" width="28" height="19" rx="2.5" ${s}/><path d="M20 37 H28 M24 31 V37" ${s}/>`;
    case "hdd":      return `<rect x="12" y="13" width="24" height="22" rx="4" ${s}/><path d="M17 29 H24" ${s}/><circle cx="30.5" cy="29" r="1.6" fill="${c}"/><path d="M12 19 H36" ${s}/>`;
    case "usb":      return `<rect x="17" y="18" width="14" height="20" rx="3" ${s}/><path d="M19.5 18 V10.5 H28.5 V18" ${s}/><path d="M22.5 13.5 V15 M25.5 13.5 V15" ${s}/>`;
    case "phone":    return `<rect x="16" y="9" width="16" height="30" rx="3.5" ${s}/><path d="M22 34.5 H26" ${s}/>`;
    case "db":       return `<ellipse cx="24" cy="14" rx="11" ry="4" ${s}/><path d="M13 14 V34 A11 4 0 0 0 35 34 V14 M13 24 A11 4 0 0 0 35 24" ${s}/>`;
    case "cabinet":  return `<rect x="13" y="9" width="22" height="30" rx="2.5" ${s}/><path d="M13 19 H35 M13 29 H35 M21.5 14 H26.5 M21.5 24 H26.5 M21.5 34 H26.5" ${s}/>`;
    case "trash":    return `<path d="M12 15 H36 M20 15 V11.5 H28 V15 M15.5 15 L17 37 H31 L32.5 15 M21 20.5 V31.5 M27 20.5 V31.5" ${s}/>`;
    default:         return `<circle cx="24" cy="24" r="3" fill="${c}"/>`;
  }
}

/** ไอคอนที่เก็บเป็น SVG ข้อความ (สี่เหลี่ยมมุมมน + รูปตามที่เก็บ) · ไม่รู้จัก = ฐานข้อมูลทั่วไป */
export function storagePlaceSvg(key: string, size = 44): string {
  const p = storagePlaceOf(key) ?? storagePlaceOf("db")!;
  const w = Math.max(8, Math.round(size));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 48 48" role="img" aria-label="${p.key}">`
    + `<rect x="1.5" y="1.5" width="45" height="45" rx="12" fill="${p.tint}" stroke="${p.color}" stroke-opacity=".35" stroke-width="1.5"/>`
    + glyph(p.key, p.color)
    + `</svg>`;
}
