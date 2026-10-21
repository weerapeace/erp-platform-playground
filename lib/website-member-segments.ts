/**
 * 🎯 กลุ่มลูกค้าเว็บร้าน (ชุด 6) — กฎกลาง: ใครอยู่กลุ่มไหน + ทำไฟล์ CSV ไว้ทำแคมเปญ (LINE/อีเมล/โฆษณา)
 * ใช้ทั้งปุ่มกรองในแท็บ 👥 สมาชิก และ /api/website/members/export (ส่งออกได้เฉพาะคนที่ยินยอมรับข่าวสาร — PDPA)
 */

export interface SegmentMember {
  marketingOptIn: boolean;
  orderCount: number;
  lastOrderAt: string | null;
  tier: { key: string } | null;
}

export const MEMBER_SEGMENTS = [
  { key: "all", label: "ทั้งหมด", hint: "" },
  { key: "optin", label: "📬 รับข่าวสาร", hint: "ยินยอมรับข่าวสาร — ส่งโปรได้" },
  { key: "repeat", label: "🔁 ซื้อซ้ำ", hint: "สั่ง 2 ครั้งขึ้นไป" },
  { key: "new", label: "🆕 ยังไม่เคยซื้อ", hint: "สมัครแล้วแต่ยังไม่สั่ง — ส่งโค้ดต้อนรับ" },
  { key: "lapsed", label: "💤 ห่างหาย 90 วัน", hint: "เคยซื้อ แต่ไม่ได้สั่งมา 90 วันขึ้นไป — ชวนกลับมา" },
] as const;
export type SegmentKey = (typeof MEMBER_SEGMENTS)[number]["key"] | `tier:${string}`;

const DAY = 864e5;

/** สมาชิกคนนี้อยู่ในกลุ่มนี้ไหม · "tier:<key>" = ระดับสมาชิก */
export function inSegment(m: SegmentMember, key: string, now = new Date()): boolean {
  if (key.startsWith("tier:")) return m.tier?.key === key.slice(5);
  switch (key) {
    case "optin":
      return m.marketingOptIn;
    case "repeat":
      return m.orderCount >= 2;
    case "new":
      return m.orderCount === 0;
    case "lapsed":
      return m.orderCount >= 1 && !!m.lastOrderAt && now.getTime() - new Date(m.lastOrderAt).getTime() >= 90 * DAY;
    default:
      return true;
  }
}

/** ค่าในช่อง CSV — ใส่ "" ครอบ + กันสูตร Excel (ขึ้นต้น = + - @) */
export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export interface CsvMember {
  name: string;
  email: string | null;
  phone: string;
  marketingOptIn: boolean;
  orderCount: number;
  orderTotal: number;
  lastOrderAt: string | null;
  tierName: string | null;
  createdAt: string;
}

const thDay = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 10) : "");

/** CSV (มี BOM ให้ Excel อ่านภาษาไทยถูก) */
export function membersCsv(rows: CsvMember[]): string {
  const head = ["ชื่อ", "อีเมล", "เบอร์โทร", "รับข่าวสาร", "จำนวนออเดอร์", "ยอดซื้อรวม", "ซื้อล่าสุด", "ระดับ", "สมัครเมื่อ"];
  const lines = rows.map((r) => [r.name, r.email ?? "", r.phone, r.marketingOptIn ? "ใช่" : "ไม่", r.orderCount, r.orderTotal, thDay(r.lastOrderAt), r.tierName ?? "", thDay(r.createdAt)].map(csvCell).join(","));
  return `﻿${[head.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}
