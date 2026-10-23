/**
 * ค่าหน้าตาช่องกรอก / ป้ายชื่อ / การ์ด ของหลังบ้านเว็บ (ของกลาง) — แก้ที่นี่ที่เดียว ทุกแผงที่ใช้ชุดเดียวกันเปลี่ยนตาม
 *
 * เดิมแต่ละไฟล์ประกาศ inputCls / labelCls / lbl / cardCls / mini เอง (~50 ที่ หน้าตาเดียวกันแต่ก๊อปกันไปมา)
 * ตอนย้ายมาเก็บค่าเดิมเป๊ะทุกตัว (หน้าตาไม่เปลี่ยน) — ชุดที่ต่างกันจริงจึงยังมีหลายแบบ ตั้งชื่อตามลักษณะ
 *
 *   import { webForm } from "@/lib/website-form-styles";
 *   <input className={webForm.input} /> · <label className={webForm.label}>
 *
 * ช่องใหม่ในหลังบ้านเว็บ: ใช้ webForm.input + webForm.label เป็นค่าเริ่มต้น (ชุดเดียวกับฟอร์ม Section กลาง SchemaForm)
 */
export const webForm = {
  /** ⭐ ช่องกรอกมาตรฐาน — ฟอร์ม Section กลาง (SchemaForm) · ข้อมูลร้าน · หน้าเว็บ · จับคู่ฟิลด์ · สินค้าบนเว็บ */
  input:
    "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400",
  /** ช่องกรอกพื้นขาว ไม่มีวงแหวนตอนโฟกัส — คอลเลกชัน · บัตรของขวัญ */
  inputPlain: "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-blue-400 bg-white",
  /** ช่องกรอกตัวเล็ก (แผงตั้งค่าแน่น) — การแสดงรายการสินค้า */
  inputXs: "w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 bg-white",
  /** ช่องกรอกสูง 9 — คูปอง · โปรโมชัน */
  inputH9: "w-full h-9 rounded-lg border border-slate-200 px-3 text-sm",
  /** ช่องกรอกใหญ่ ขอบเข้ม — หมวดหมู่ · เปลี่ยนลิงก์หมวด */
  inputRoomy: "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none",
  /** ช่องกรอกใหญ่ ขอบเข้ม (ไม่มีสีตอนโฟกัส) — ฐานหน้าตาทั้งเว็บ · ตั้งเวลาธีม */
  inputBasic: "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm",

  /** ⭐ ป้ายชื่อช่องมาตรฐาน (ตัวเล็ก หนา) */
  label: "block text-[11px] font-medium text-slate-500 mb-1",
  /** ป้ายชื่อช่องตัวเล็ก ไม่หนา */
  labelPlain: "block text-[11px] text-slate-500 mb-1",
  /** ป้ายชื่อช่องใหญ่ — ฐานหน้าตาทั้งเว็บ · ตั้งเวลาธีม */
  labelRoomy: "block text-xs font-medium text-slate-600 mb-1.5",

  /** การ์ดกลุ่มช่อง */
  card: "rounded-xl border border-slate-200 bg-white p-4",
  /** การ์ดกลุ่มช่อง มุมมนกว่า */
  cardRoomy: "rounded-2xl border border-slate-200 bg-white p-4",

  /** ช่องเลือก/กรอกจิ๋ว สูง 7 (ในแถวรายการ) */
  mini: "h-7 rounded-lg border border-slate-200 text-[11px] px-1.5 bg-white text-slate-700",
} as const;
