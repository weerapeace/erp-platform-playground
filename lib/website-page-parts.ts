/**
 * 🎨 ทะเบียน "ชิ้นส่วน" ของแต่ละหน้า สำหรับชุดปรับหน้าตาละเอียด (ของกลาง · 2026-10-28)
 *
 * แต่ละหน้าในแท็บดีไซน์ประกาศรายการชิ้นส่วนที่นี่ → ตัวปรับกลาง components/website-part-style-editor สร้างแผงให้เอง
 * เว็บร้านติด data-part="<key>" ที่ชิ้นนั้น (คลิกเลือกในพรีวิวได้ · ตัววาด CSS src/lib/part-style-css.ts)
 * ค่าเก็บในธีม เช่น theme.page.account.parts (ชนิด/ตัวตรวจ PartStyles อยู่ lib/website-site-design — มิเรอร์กับเว็บร้าน)
 * เพิ่มหน้าใหม่ = เพิ่มรายการชิ้นส่วน + ติด data-part ฝั่งเว็บร้าน (ไม่ต้องทำแผงตั้งค่าเอง)
 */
import type { PartStyleValue } from "@/lib/website-site-design";

/** กลุ่มตัวปรับ: ตัวอักษร · กล่อง · ตำแหน่ง · รูปโปรไฟล์ · ไอคอน · ตอนถูกเลือก · ซ่อน */
export type PartGroup = "text" | "box" | "layout" | "avatar" | "icon" | "active" | "hide";
export interface PartDef {
  key: string;
  label: string;
  hint?: string;
  groups: PartGroup[];
}

/** ช่องในแต่ละกลุ่ม (ลำดับ = ลำดับในแผง) */
export const PART_GROUP_FIELDS: Record<PartGroup, (keyof PartStyleValue)[]> = {
  text: ["font", "size", "weight", "color", "ls", "lh", "align", "upper", "italic"],
  box: ["bg", "radius", "padY", "padX", "border", "borderColor", "shadow"],
  layout: ["align", "gap", "mt", "maxW"],
  avatar: ["dim", "radius", "bg", "color", "size", "border", "borderColor"],
  icon: ["iconSize", "iconColor"],
  active: ["activeBg", "activeColor", "activeBorder"],
  hide: ["hidden"],
};
export const PART_GROUP_LABEL: Record<PartGroup, string> = {
  text: "🔤 ตัวอักษร",
  box: "▭ กล่อง",
  layout: "📐 ตำแหน่ง",
  avatar: "🙂 รูปโปรไฟล์",
  icon: "🔣 ไอคอน",
  active: "✅ ตอนถูกเลือก",
  hide: "👁 การแสดง",
};

/** 👤 หน้าบัญชีของฉัน (เว็บร้าน components/account/AccountClient) */
export const ACCOUNT_PARTS: PartDef[] = [
  { key: "acc.page", label: "ทั้งหน้า", hint: "ความกว้าง · ระยะ · พื้น", groups: ["layout", "box"] },
  { key: "acc.notice", label: "แถบประกาศ", groups: ["text", "box"] },
  { key: "acc.header", label: "ส่วนหัว", groups: ["layout", "box"] },
  { key: "acc.avatar", label: "รูปโปรไฟล์", groups: ["avatar"] },
  { key: "acc.greet", label: "ข้อความทักทาย", hint: "ตัวเล็กเหนือชื่อ", groups: ["text", "hide"] },
  { key: "acc.name", label: "ชื่อสมาชิก", groups: ["text"] },
  { key: "acc.sub", label: "อีเมล / ข้อความรอง", groups: ["text", "hide"] },
  { key: "acc.badge", label: "ป้ายใต้ชื่อ", hint: "ระดับ · แต้ม · สมาชิกตั้งแต่", groups: ["text", "box"] },
  { key: "acc.mcard", label: "บัตรสมาชิก", hint: "แบบหัว = บัตรสมาชิก", groups: ["text", "box"] },
  { key: "acc.nav", label: "แถบเมนู", groups: ["layout", "box", "icon"] },
  { key: "acc.tab", label: "ปุ่มเมนู", groups: ["text", "box", "active", "icon"] },
  { key: "acc.card", label: "กล่องเนื้อหา", groups: ["box", "layout"] },
  { key: "acc.title", label: "หัวข้อในกล่อง", groups: ["text"] },
  { key: "acc.empty", label: "ข้อความตอนว่าง", groups: ["text"] },
  { key: "acc.btn", label: "ปุ่มหลัก", hint: "ปุ่มทึบ", groups: ["text", "box"] },
  { key: "acc.btn2", label: "ปุ่มรอง", hint: "ปุ่มขอบ", groups: ["text", "box"] },
  { key: "acc.input", label: "ช่องกรอก", groups: ["text", "box"] },
];

/** ช่วงแถบเลื่อนในแผง (แคบกว่าที่ระบบรับ — พิมพ์ตัวเลขเกินได้ถึงขอบ PART_RANGES) + ค่าโชว์ตอนยังไม่ตั้ง */
export const PART_SLIDER: Partial<Record<keyof PartStyleValue, { min: number; max: number; step?: number; unit: string; label: string; hint?: number }>> = {
  size: { min: 10, max: 64, unit: "px", label: "ขนาด", hint: 16 },
  weight: { min: 300, max: 800, step: 100, unit: "", label: "ความหนา", hint: 400 },
  ls: { min: -5, max: 40, unit: "", label: "ระยะตัวอักษร", hint: 0 },
  lh: { min: 100, max: 200, step: 5, unit: "", label: "ระยะบรรทัด", hint: 150 },
  radius: { min: 0, max: 48, unit: "px", label: "มุมโค้ง", hint: 12 },
  padY: { min: 0, max: 64, unit: "px", label: "ระยะใน บน-ล่าง", hint: 16 },
  padX: { min: 0, max: 64, unit: "px", label: "ระยะใน ซ้าย-ขวา", hint: 16 },
  border: { min: 0, max: 4, unit: "px", label: "เส้นขอบ", hint: 1 },
  shadow: { min: 0, max: 3, unit: "", label: "เงา", hint: 0 },
  gap: { min: 0, max: 64, unit: "px", label: "ระยะห่างข้างใน", hint: 16 },
  mt: { min: -40, max: 120, unit: "px", label: "ระยะด้านบน", hint: 0 },
  maxW: { min: 0, max: 1600, step: 20, unit: "px", label: "กว้างสุด (0 = เต็ม)", hint: 0 },
  dim: { min: 32, max: 160, unit: "px", label: "ขนาดรูป", hint: 56 },
  iconSize: { min: 10, max: 40, unit: "px", label: "ขนาดไอคอน", hint: 16 },
};

export const PART_COLOR_LABEL: Partial<Record<keyof PartStyleValue, string>> = {
  color: "สีตัวอักษร",
  bg: "สีพื้น",
  borderColor: "สีเส้นขอบ",
  iconColor: "สีไอคอน",
  activeBg: "สีพื้น (ที่เลือก)",
  activeColor: "สีตัวอักษร (ที่เลือก)",
  activeBorder: "สีขอบ (ที่เลือก)",
};

/** 👤 หน้าเข้าสู่ระบบ + ป๊อปสมัคร + ปุ่มสมัครบนหัวเว็บ (เว็บร้าน MemberAuthHost / MemberAuthPanel / LoginShell / Navbar) */
export const LOGIN_PARTS: PartDef[] = [
  { key: "login.hbtn", label: "ปุ่มสมัครบนหัวเว็บ", hint: "ปุ่มเด่นข้างไอคอน 👤", groups: ["text", "box"] },
  { key: "login.modal", label: "กรอบป๊อป", hint: "มือถือ = แผ่นเลื่อนจากล่าง", groups: ["box", "layout"] },
  { key: "login.mtitle", label: "หัวป๊อป", groups: ["text", "hide"] },
  { key: "login.tabs", label: "แถบแท็บ", hint: "สมัคร / เข้าสู่ระบบ", groups: ["box"] },
  { key: "login.tab", label: "ปุ่มแท็บ", groups: ["text", "box", "active"] },
  { key: "login.perks", label: "กล่องข้อดีสมาชิก", groups: ["text", "box"] },
  { key: "login.consent", label: "ข้อความยินยอม", hint: "ช่องติ๊ก PDPA", groups: ["text"] },
  { key: "login.provider", label: "ปุ่ม Google/LINE/Facebook", groups: ["text", "box"] },
  { key: "login.note", label: "ข้อความเล็ก", hint: "ใต้ปุ่ม / ต้อนรับกลับ", groups: ["text", "hide"] },
  { key: "login.guest", label: "ลิงก์สั่งโดยไม่สมัคร", groups: ["text"] },
  { key: "login.card", label: "กรอบหน้าเข้าสู่ระบบ", hint: "หน้า /account/login", groups: ["box", "layout"] },
  { key: "login.heading", label: "หัวข้อหน้าเข้าสู่ระบบ", groups: ["text"] },
  { key: "login.intro", label: "ข้อความต้อนรับ", groups: ["text", "hide"] },
];
