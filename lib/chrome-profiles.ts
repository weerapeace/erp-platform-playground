/**
 * ทะเบียนโปรไฟล์ Chrome ของ App Subscription — ตั้งครั้งเดียวว่าแต่ละโปรไฟล์ใช้อีเมล/โฟลเดอร์อะไร
 * แล้วในฟอร์มรายการแค่ "เลือกโปรไฟล์" → อีเมล/โฟลเดอร์/ลิงก์ เติมให้เอง
 *
 * ตัวผูก = ชื่อเล่นโปรไฟล์ (subscriptions.chrome_profile และ members[].chrome_profile · ไม่สนตัวพิมพ์เล็ก-ใหญ่)
 * รายการยังเก็บค่าที่คัดลอกไว้ในแถวเหมือนเดิม (ปุ่ม .bat / หาในเมล / แอปเก่า ใช้ต่อได้ไม่ต้องแก้)
 * แก้โปรไฟล์ในทะเบียน → API ไล่อัปเดตทุกรายการงานที่ใช้ชื่อเล่นนั้น (applyChromeProfileToSub)
 *
 * ไฟล์นี้ใช้ได้ทั้ง client และ server (ไม่มีโค้ดฝั่ง server)
 */
import { normalizeMembers, type SubMember, type Subscription } from "@/lib/subscriptions";

export type ChromeProfile = {
  id: string;
  nickname: string;
  account_email: string;
  chrome_profile_dir: string;
  chrome_profile_url: string;
  sort_order: number;
  /** จำนวนรายการงานที่ใช้โปรไฟล์นี้ (GET คืนให้) */
  usage?: number;
};

export type ChromeProfileInput = Pick<ChromeProfile, "nickname" | "account_email" | "chrome_profile_dir" | "chrome_profile_url">;

/** ช่องที่คัดลอกจากโปรไฟล์ลงผู้ใช้/แถวรายการ */
export type ChromeProfileFields = Pick<SubMember, "chrome_profile" | "account_email" | "chrome_profile_dir" | "chrome_profile_url">;

export const CHROME_PROFILES_API = "/api/subscriptions/chrome-profiles";

const nickKey = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** หาโปรไฟล์ในทะเบียนจากชื่อเล่น — null ถ้าไม่มี (รายการที่ยังกรอกเอง) */
export function findChromeProfile(list: ChromeProfile[] | null | undefined, nickname: string | null | undefined): ChromeProfile | null {
  const k = nickKey(nickname);
  if (!k || !list) return null;
  return list.find((p) => nickKey(p.nickname) === k) ?? null;
}

export function chromeProfileFields(p: ChromeProfileInput): ChromeProfileFields {
  return {
    chrome_profile: p.nickname.trim(),
    account_email: p.account_email.trim(),
    chrome_profile_dir: p.chrome_profile_dir.trim(),
    chrome_profile_url: p.chrome_profile_url.trim(),
  };
}

/** ทำความสะอาด input ก่อนเขียน DB (ช่องข้อความเป็น '' เสมอ กันชน NOT NULL) */
export function toChromeProfileRow(input: Partial<ChromeProfileInput>): Partial<ChromeProfileInput> {
  const row: Partial<ChromeProfileInput> = {};
  if (input.nickname !== undefined) row.nickname = String(input.nickname ?? "").trim();
  if (input.account_email !== undefined) row.account_email = String(input.account_email ?? "").trim();
  if (input.chrome_profile_dir !== undefined) row.chrome_profile_dir = String(input.chrome_profile_dir ?? "").trim();
  if (input.chrome_profile_url !== undefined) row.chrome_profile_url = String(input.chrome_profile_url ?? "").trim();
  return row;
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** ตรวจ input — คืนข้อความ error (ภาษาคน) หรือ null ถ้าผ่าน */
export function validateChromeProfile(input: Partial<ChromeProfileInput>, isCreate: boolean): string | null {
  if (isCreate || input.nickname !== undefined) {
    const n = String(input.nickname ?? "").trim();
    if (!n) return "กรุณาใส่ชื่อเล่นโปรไฟล์";
    if (n.length > 60) return "ชื่อเล่นยาวเกิน 60 ตัวอักษร";
  }
  const email = String(input.account_email ?? "").trim();
  if (email && !EMAIL_RE.test(email)) return "อีเมลไม่ถูกต้อง (ใส่อีเมลอย่างเดียว เช่น name@gmail.com)";
  if (String(input.chrome_profile_dir ?? "").length > 60) return "ชื่อโฟลเดอร์ยาวเกินไป";
  return null;
}

type SubRowLike = Pick<Subscription, "chrome_profile" | "account_email" | "chrome_profile_dir" | "chrome_profile_url"> & { members?: unknown };

const sameFields = (a: ChromeProfileFields, b: ChromeProfileFields) =>
  a.chrome_profile === b.chrome_profile && a.account_email === b.account_email
  && a.chrome_profile_dir === b.chrome_profile_dir && a.chrome_profile_url === b.chrome_profile_url;

/**
 * รายการนี้ต้องแก้อะไรเมื่อโปรไฟล์ชื่อเล่น `oldNick` กลายเป็น `p` — null = ไม่เกี่ยว/ค่าตรงอยู่แล้ว
 * หลายผู้ใช้ (members ≥2) → แก้ทุกคนที่ใช้โปรไฟล์นี้ แล้ว mirror คนแรกลงช่องบนแถว (กติกาเดียวกับ toSubRow)
 */
export function applyChromeProfileToSub(row: SubRowLike, oldNick: string, p: ChromeProfileInput): Record<string, unknown> | null {
  const k = nickKey(oldNick);
  if (!k) return null;
  const fields = chromeProfileFields(p);
  const members = normalizeMembers(row.members);
  if (members.length >= 2) {
    let changed = false;
    const next = members.map((m) => {
      if (nickKey(m.chrome_profile) !== k || sameFields(m, fields)) return m;
      changed = true;
      return { ...m, ...fields };
    });
    if (!changed) return null;
    const first = next[0];
    return {
      members: next, account_email: first.account_email, chrome_profile: first.chrome_profile,
      chrome_profile_dir: first.chrome_profile_dir, chrome_profile_url: first.chrome_profile_url,
    };
  }
  if (nickKey(row.chrome_profile) !== k) return null;
  const cur: ChromeProfileFields = {
    chrome_profile: row.chrome_profile ?? "", account_email: row.account_email ?? "",
    chrome_profile_dir: row.chrome_profile_dir ?? "", chrome_profile_url: row.chrome_profile_url ?? "",
  };
  return sameFields(cur, fields) ? null : { ...fields };
}

/** นับว่าแต่ละชื่อเล่นถูกใช้ในกี่รายการ (รายการหลายผู้ใช้นับ 1 ต่อชื่อเล่น) — key = ชื่อเล่นตัวเล็ก */
export function countChromeProfileUsage(rows: SubRowLike[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const members = normalizeMembers(r.members);
    const nicks = new Set((members.length >= 2 ? members.map((m) => m.chrome_profile) : [r.chrome_profile]).map(nickKey).filter(Boolean));
    nicks.forEach((n) => out.set(n, (out.get(n) ?? 0) + 1));
  }
  return out;
}
