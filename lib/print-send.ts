// ============================================================
// print-send — ส่ง PDF จากแถบพิมพ์ไป LINE / อีเมล (ของกลาง · ส่วนที่ไม่แตะเครือข่าย เทสต์ได้)
// ทางเดิน (เจ้าของเลือกแบบ A 2026-11-18):
//   ทำ PDF ในเครื่อง (jsPDF + html2canvas ใน public/vendor) → POST /api/print-send
//   → เก็บ Google Drive "ERP เอกสารที่ส่ง/YYYY-MM" (ห้าม R2) → เปิดลิงก์ให้คนมีลิงก์ดูได้
//   → LINE = ข้อความ + ลิงก์ (LINE ส่งไฟล์ PDF ไม่ได้ · ผ่าน lib/line-send เท่านั้น) · อีเมล = แนบไฟล์ + ลิงก์
//   → บันทึกประวัติ (audit action "document.sent")
// ส่งเมื่อผู้ใช้กด "ส่งตอนนี้" เท่านั้น — ไม่มีการส่งอัตโนมัติ
// ข้อเสนอที่เจ้าของเลือก: 1) จำผู้รับล่าสุดต่อชนิดเอกสาร 2) บันทึกประวัติการส่ง 3) แก้ข้อความก่อนส่ง + ข้อความตั้งต้นต่อชนิดเอกสาร
// ============================================================

/** กลุ่ม LINE ที่เป็นกลุ่ม "รับเข้า" (ส่งของเข้าระบบ) ไม่ใช่ที่ส่งเอกสารออก */
export const LINE_INTAKE_SLOTS = ["purchase_capture", "design_intake", "design_idea"];

export const PRINT_SEND_MAX_BYTES = 4_000_000;   // Vercel รับ body ~4.5MB

/** ชนิดเอกสารจากที่อยู่หน้า /print/<type>/... (ไว้จำผู้รับ/ข้อความต่อชนิด) */
export function docTypeFromPath(pathname: string): string {
  const m = /\/print\/([a-z0-9-]+)/i.exec(pathname || "");
  return m ? m[1].toLowerCase() : "doc";
}

/** id เอกสารจากที่อยู่หน้า (/print/<type>/<id>) — ไม่มี = null */
export function docIdFromPath(pathname: string): string | null {
  const m = /\/print\/[a-z0-9-]+\/([^/?#]+)/i.exec(pathname || "");
  return m ? decodeURIComponent(m[1]) : null;
}

/** ข้อความตั้งต้น (แก้ได้ก่อนส่ง) */
export function defaultSendMessage(fileName: string): string {
  return `ส่ง ${fileName} ครับ\nเปิดดูเอกสารได้จากลิงก์ด้านล่าง`;
}

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

/** แยกอีเมลหลายตัว (คั่นด้วย , ; เว้นวรรค ขึ้นบรรทัด) → { ok, bad } */
export function parseEmails(text: string): { ok: string[]; bad: string[] } {
  const ok: string[] = [], bad: string[] = [];
  for (const raw of String(text ?? "").split(/[\s,;]+/)) {
    const e = raw.trim();
    if (!e) continue;
    if (EMAIL_RE.test(e)) { if (!ok.includes(e.toLowerCase())) ok.push(e.toLowerCase()); } else bad.push(e);
  }
  return { ok: ok.slice(0, 20), bad };
}

/** ชื่อไฟล์ PDF ที่ปลอดภัย (ไทยได้) */
export function safePdfName(name: string): string {
  const base = String(name ?? "").replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 120) || "เอกสาร";
  return `${base}.pdf`;
}

/** โฟลเดอร์เดือน YYYY-MM ตามเวลาไทย */
export function sendMonthFolder(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 7);
}

/** ข้อความ LINE: ข้อความผู้ส่ง + ชื่อไฟล์ + ลิงก์ */
export function lineSendText(message: string, fileName: string, link: string, sender?: string): string {
  return [message.trim(), `📄 ${fileName}`, link, sender ? `— ส่งโดย ${sender}` : ""].filter(Boolean).join("\n");
}

// ---- จำผู้รับล่าสุด + ข้อความต่อชนิดเอกสาร (ในเครื่องผู้ใช้) ----
export type SendMemory = { line: string[]; emails: string; message?: string; channels: { line: boolean; email: boolean } };
const KEY = (docType: string) => `erp:print-send:${docType}`;

export function readSendMemory(docType: string): SendMemory | null {
  try {
    const o = JSON.parse(localStorage.getItem(KEY(docType)) ?? "null") as SendMemory | null;
    if (!o || typeof o !== "object") return null;
    return { line: Array.isArray(o.line) ? o.line.filter((x) => typeof x === "string") : [], emails: String(o.emails ?? ""), message: typeof o.message === "string" ? o.message : undefined, channels: { line: !!o.channels?.line, email: !!o.channels?.email } };
  } catch { return null; }
}

export function saveSendMemory(docType: string, m: SendMemory): void {
  try { localStorage.setItem(KEY(docType), JSON.stringify(m)); } catch { /* โหมดส่วนตัว */ }
}
