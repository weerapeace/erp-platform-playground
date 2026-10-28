#!/usr/bin/env node
/**
 * สร้าง lib/erp-icons.ts — ชุดไอคอนเส้นของ ERP (คัดจาก Tabler Icons · MIT · 24×24 stroke)
 *
 * ใช้: node scripts/gen-erp-icons.mjs <โฟลเดอร์แพ็กเกจ @tabler/icons>
 *   (ได้จาก `npm pack @tabler/icons@3.31.0` แล้วแตกไฟล์ — ไม่ต้องติดตั้งลงโปรเจกต์)
 * อยากเพิ่มไอคอน = เพิ่มชื่อ (จาก tabler.io/icons) + คำไทยในรายการ LIST ด้านล่าง แล้วรันใหม่
 */
import fs from "node:fs";
import path from "node:path";

// [ชื่อ tabler, ชื่อไทย (ใช้ค้นหาในหน้าเลือกไอคอน)]
const LIST = [
  // ── ปุ่มคำสั่ง ──
  ["device-floppy", "บันทึก"], ["pencil", "แก้ไข ดินสอ"], ["edit", "แก้ไข"], ["trash", "ลบ ถังขยะ"], ["trash-x", "ลบทิ้ง"],
  ["plus", "เพิ่ม"], ["circle-plus", "เพิ่ม วงกลม"], ["minus", "ลด"], ["x", "ปิด กากบาท"], ["check", "ถูก ตกลง"],
  ["copy", "คัดลอก"], ["clipboard", "คลิปบอร์ด"], ["clipboard-list", "รายการ คลิปบอร์ด"], ["clipboard-check", "ตรวจแล้ว"],
  ["search", "ค้นหา"], ["filter", "ตัวกรอง"], ["adjustments", "ปรับ ตั้งค่า"], ["adjustments-horizontal", "ปรับ แถบเลื่อน"],
  ["settings", "ตั้งค่า เฟือง"], ["printer", "พิมพ์"], ["download", "ดาวน์โหลด"], ["upload", "อัปโหลด"],
  ["file-import", "นำเข้าไฟล์"], ["file-export", "ส่งออกไฟล์"], ["refresh", "รีเฟรช ซิงค์"], ["repeat", "ทำซ้ำ ประจำ"],
  ["arrow-back-up", "ย้อนกลับ ส่งคืน"], ["arrow-forward-up", "ไปต่อ"], ["external-link", "เปิดหน้าใหม่"], ["link", "ลิงก์"],
  ["share", "แชร์"], ["send", "ส่ง"], ["eye", "ดู"], ["eye-off", "ซ่อน"], ["lock", "ล็อก"], ["lock-open", "ปลดล็อก"],
  ["key", "กุญแจ"], ["shield-lock", "สิทธิ์ ความปลอดภัย"], ["shield-check", "ปลอดภัย ยืนยัน"], ["logout", "ออกจากระบบ"],
  ["player-play", "เริ่ม เล่น"], ["player-pause", "หยุดชั่วคราว"], ["hand-stop", "หยุด อนุมัติ"], ["arrows-sort", "เรียงลำดับ"],
  ["arrows-shuffle", "สลับ"], ["arrows-exchange", "แลกเปลี่ยน"], ["list", "ลิสต์"], ["list-check", "เช็กลิสต์"],
  ["layout-grid", "การ์ด กริด"], ["table", "ตาราง"], ["columns", "คอลัมน์"], ["layout-kanban", "บอร์ด คัมบัง"],
  ["layout-dashboard", "แดชบอร์ด"], ["dots-vertical", "เมนูเพิ่ม"], ["menu-2", "เมนู"], ["grip-vertical", "ลาก"],
  ["maximize", "ขยาย"], ["history", "ประวัติ"], ["archive", "เก็บถาวร แฟ้ม"], ["ban", "ห้าม"], ["pin", "ปักหมุด"],
  ["bookmark", "บุ๊กมาร์ก"], ["star", "ดาว สำคัญ"], ["heart", "หัวใจ"], ["thumb-up", "ถูกใจ"], ["flag", "ธง"],
  ["flag-check", "จบงาน เส้นชัย"], ["tag", "ป้าย"], ["tags", "ป้ายหลายอัน"], ["hash", "เลขที่"], ["numbers", "ตัวเลข นับ"],
  ["barcode", "บาร์โค้ด"], ["qrcode", "คิวอาร์"], ["scan", "สแกน"], ["camera", "กล้อง ถ่ายรูป"], ["photo", "รูปภาพ"],
  ["movie", "วิดีโอ"], ["palette", "สี ออกแบบ"], ["brush", "แปรง"], ["wand", "ไม้กายสิทธิ์ อัตโนมัติ"],
  ["sparkles", "ใหม่ วิบวับ AI"], ["robot", "บอท AI"], ["bolt", "ด่วน เร็ว"], ["bulb", "ไอเดีย เคล็ดลับ"],
  // ── สถานะ ──
  ["help-circle", "ช่วยเหลือ คำถาม"], ["info-circle", "ข้อมูล"], ["alert-triangle", "คำเตือน"], ["alert-circle", "แจ้งเตือน"],
  ["alert-octagon", "หยุด อันตราย"], ["circle-check", "สำเร็จ ผ่าน"], ["circle-x", "ยกเลิก ไม่ผ่าน"], ["circle-dashed", "ร่าง"],
  ["hourglass", "รอ"], ["clock", "เวลา นาฬิกา"], ["alarm", "นาฬิกาปลุก เข้าออก"], ["calendar", "ปฏิทิน"],
  ["calendar-event", "ปฏิทิน นัด"], ["bell", "แจ้งเตือน กระดิ่ง"], ["flame", "มาแรง ด่วน"], ["confetti", "ฉลอง"],
  ["trophy", "ถ้วยรางวัล"], ["award", "รางวัล"], ["target", "เป้าหมาย"], ["rocket", "เปิดตัว"],
  // ── สื่อสาร ──
  ["mail", "อีเมล"], ["mail-forward", "ส่งต่อ คำขอ"], ["inbox", "กล่องข้อความ"], ["message-circle", "แชท"],
  ["messages", "ข้อความ"], ["brand-line", "ไลน์"], ["phone", "โทรศัพท์"], ["device-mobile", "มือถือ"],
  ["device-laptop", "คอมพิวเตอร์"], ["world", "เว็บ ออนไลน์"], ["speakerphone", "โฆษณา ประกาศ"], ["ad", "แคมเปญ โฆษณา"],
  ["lifebuoy", "ช่วยเหลือ แจ้งปัญหา"],
  // ── เอกสาร / ข้อมูล ──
  ["file", "ไฟล์"], ["file-text", "เอกสาร"], ["files", "หลายเอกสาร"], ["file-invoice", "ใบแจ้งหนี้"],
  ["file-certificate", "สัญญา ใบรับรอง"], ["file-spreadsheet", "สเปรดชีต"], ["receipt", "ใบเสร็จ"], ["receipt-2", "บิล"],
  ["receipt-tax", "ภาษี"], ["notes", "บันทึก โน้ต"], ["notebook", "สมุด"], ["book", "หนังสือ"], ["book-2", "คู่มือ"],
  ["books", "คลัง ทะเบียน"], ["forms", "ฟอร์ม"], ["checklist", "รายการตรวจ"], ["folder", "โฟลเดอร์"], ["folders", "หลายโฟลเดอร์ หมวด"],
  ["folder-open", "เปิดโฟลเดอร์"], ["paperclip", "แนบไฟล์"], ["signature", "ลายเซ็น"], ["stack-2", "ชั้น ซ้อน"],
  ["database", "ฐานข้อมูล"], ["sitemap", "ผังโครงสร้าง"], ["hierarchy-2", "ลำดับชั้น"], ["puzzle", "ชิ้นส่วน โมดูล"],
  ["plug", "ปลั๊กอิน"], ["apps", "แอป"], ["category", "หมวดหมู่"], ["report", "รายงาน"], ["report-analytics", "รายงานวิเคราะห์"],
  ["chart-bar", "กราฟแท่ง สถิติ"], ["chart-line", "กราฟเส้น"], ["chart-pie", "กราฟวงกลม"], ["trending-up", "ยอดขึ้น"],
  ["trending-down", "ยอดลง"], ["presentation", "นำเสนอ"], ["home", "หน้าแรก บ้าน"], ["map", "แผนที่ ผัง"],
  ["map-pin", "ตำแหน่ง"], ["compass", "เข็มทิศ นำทาง"], ["route", "เส้นทาง"],
  // ── สินค้า / คลัง / ผลิต ──
  ["box", "กล่อง"], ["package", "พัสดุ สินค้า"], ["packages", "หลายกล่อง"], ["package-import", "รับเข้า"],
  ["package-export", "ส่งออก"], ["building-warehouse", "คลังสินค้า"], ["truck", "รถขนส่ง"], ["truck-delivery", "จัดส่ง"],
  ["shopping-cart", "ตะกร้า ซื้อ"], ["shopping-bag", "ถุงช้อปปิ้ง กระเป๋า"], ["basket", "ตะกร้าสาน"], ["building-store", "ร้านค้า"],
  ["building-factory", "โรงงาน ผลิต"], ["building-factory-2", "โรงงาน 2"], ["building", "ตึก บริษัท"], ["buildings", "หลายตึก ห้าง"],
  ["building-bank", "ธนาคาร"], ["crane", "ก่อสร้าง ศูนย์งาน"], ["wall", "อิฐ พื้นฐาน"], ["dna", "ต้นแบบ สายพันธุ์"],
  ["scissors", "กรรไกร ตัด"], ["needle-thread", "เข็มด้าย"], ["needle", "เข็ม หมุด"], ["ruler", "ไม้บรรทัด หน่วย"],
  ["ruler-measure", "วัดขนาด สูตร"], ["tool", "เครื่องมือ ซ่อม"], ["tools", "กล่องเครื่องมือ"], ["hammer", "ค้อน"],
  ["color-swatch", "แถบสี"], ["shirt", "เสื้อผ้า"], ["hanger", "ไม้แขวน"], ["magnet", "แม่เหล็ก"], ["droplet", "หยดน้ำ กระแส"],
  ["flask", "ทดลอง"], ["microscope", "ตรวจสอบ"], ["recycle", "หมุนเวียน"], ["diamond", "เพชร พิเศษ"], ["gift", "ของขวัญ"],
  ["flower", "ดอกไม้"], ["leaf", "ใบไม้"], ["beach", "วันหยุด"],
  // ── เงิน ──
  ["coin", "เหรียญ"], ["coins", "หลายเหรียญ"], ["cash", "เงินสด"], ["cash-banknote", "ธนบัตร"], ["credit-card", "บัตร"],
  ["wallet", "กระเป๋าเงิน"], ["moneybag", "ถุงเงิน"], ["pig-money", "ออมเงิน"], ["report-money", "รายงานเงิน"],
  ["currency-baht", "บาท"], ["currency-yuan", "หยวน"], ["currency-dollar", "ดอลลาร์"], ["transfer-out", "โอนออก จ่าย"],
  ["calculator", "เครื่องคิดเลข คำนวณ"], ["percentage", "เปอร์เซ็นต์ ส่วนลด"], ["scale", "ตาชั่ง"],
  // ── คน / องค์กร ──
  ["user", "คน ผู้ใช้"], ["users", "หลายคน"], ["users-group", "กลุ่มคน ทีม"], ["user-plus", "เพิ่มคน"], ["user-check", "คนที่ยืนยัน"],
  ["user-star", "ลูกค้า คนสำคัญ"], ["user-circle", "โปรไฟล์"], ["id", "บัตร พนักงาน"], ["id-badge-2", "ป้ายชื่อ"],
  ["address-book", "สมุดรายชื่อ"], ["heart-handshake", "คู่ค้า จับมือ"], ["briefcase", "งาน ธุรกิจ"],
];

const pkg = process.argv[2];
if (!pkg) { console.error("ใส่โฟลเดอร์แพ็กเกจ @tabler/icons ด้วย"); process.exit(1); }
const nodes = JSON.parse(fs.readFileSync(path.join(pkg, "tabler-nodes-outline.json"), "utf8"));
const version = JSON.parse(fs.readFileSync(path.join(pkg, "package.json"), "utf8")).version;

// แปลงรูปทรงอื่นเป็น path (ชุดนี้ส่วนใหญ่เป็น path อยู่แล้ว)
const toD = ([tag, a]) => {
  if (tag === "path") return a.d;
  if (tag === "circle") return `M${a.cx - a.r} ${a.cy}a${a.r} ${a.r} 0 1 0 ${a.r * 2} 0a${a.r} ${a.r} 0 1 0 ${-a.r * 2} 0`;
  if (tag === "rect") { const x = +a.x, y = +a.y, w = +a.width, h = +a.height; return `M${x} ${y}h${w}v${h}h${-w}z`; }
  if (tag === "line") return `M${a.x1} ${a.y1}L${a.x2} ${a.y2}`;
  if (tag === "polyline" || tag === "polygon") return `M${a.points}${tag === "polygon" ? "z" : ""}`;
  throw new Error(`ไม่รู้จักรูปทรง ${tag}`);
};

const seen = new Set();
const out = [];
for (const [name, label] of LIST) {
  if (seen.has(name)) { console.error("ซ้ำ:", name); process.exit(1); }
  seen.add(name);
  const n = nodes[name];
  if (!n) { console.error("ไม่มีใน Tabler:", name); process.exit(1); }
  out.push(`  { key: ${JSON.stringify(name)}, label: ${JSON.stringify(label)}, d: ${JSON.stringify(n.map(toD))} },`);
}

const file = `/**
 * 〰 ชุดไอคอนเส้นของ ERP — คัดจาก Tabler Icons ${version} (MIT · 24×24 · stroke) · ${out.length} ตัว
 * ⚠️ ไฟล์นี้สร้างอัตโนมัติด้วย scripts/gen-erp-icons.mjs — อย่าแก้มือ (เพิ่มไอคอน = แก้รายการในสคริปต์แล้วรันใหม่)
 * ใช้ผ่านของกลาง components/icon (Icon) + lib/icon-registry เท่านั้น · pure ไม่มี import (API ใช้ได้)
 */
export interface ErpIconDef {
  key: string;
  /** ชื่อไทย/คำค้น */
  label: string;
  /** d ของ <path> */
  d: string[];
}

export const ERP_ICONS: ErpIconDef[] = [
${out.join("\n")}
];

const BY_KEY = new Map(ERP_ICONS.map((i) => [i.key, i]));
export const erpIconDef = (key: string): ErpIconDef | null => BY_KEY.get(key) ?? null;
`;
const dest = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "lib", "erp-icons.ts");
fs.writeFileSync(dest, file);
console.log(`เขียน ${dest} · ${out.length} ไอคอน`);
