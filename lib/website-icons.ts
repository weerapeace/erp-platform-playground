/**
 * 🔣 ไอคอนกลางของเว็บร้าน — ชุดเส้น 24×24 (stroke · รูปทรงอ้างอิง Tabler Icons · MIT) · pure · ไม่มี import
 *   ⚠️ มิเรอร์ทั้งไฟล์ไป storefront src/lib/site-icons.ts — แก้ที่นี่แล้วคัดลอก
 * ใช้ทุกที่ที่ตั้งไอคอนได้: ตะกร้า (แถบความมั่นใจ + ไอคอนคูปอง/ห่อ/การ์ด/หมายเหตุ/แต้ม/วันได้รับ) · แถวความมั่นใจหน้าสินค้าแบบหรู
 *   · ลิงก์ในเมนูใหญ่ (Mega menu) · ต่อไป Footer / ศูนย์ช่วยเหลือ / ป้ายต่าง ๆ
 * ค่าที่เก็บเป็นข้อความเดียว: "i:<key>" = ไอคอนเส้นในชุด · "img:<r2 key>" = รูป/SVG ที่อัปโหลด · อื่น ๆ = อีโมจิ/ตัวอักษร (ค่าเดิมโชว์เหมือนเดิม)
 * ERP เลือกด้วย components/site-icon-picker (SiteIconPicker) · เว็บร้านวาดด้วย components/ui/SiteIcon (SVG inline เฉพาะตัวที่ใช้)
 */
export interface SiteIconDef {
  key: string;
  label: string;
  /** คำค้นเพิ่ม (ไทย/อังกฤษ) */
  tags: string;
  /** d ของ <path> */
  d: string[];
}

export const SITE_ICONS: SiteIconDef[] = [
  // ── 🛍 สินค้า / ทั่วไป (ชุดเดียวกับเมนูใหญ่) ──
  { key: "bag", label: "ถุงช้อปปิ้ง", tags: "", d: ["M6.331 8h11.339a2 2 0 0 1 1.977 2.304l-1.255 8.152a3 3 0 0 1 -2.966 2.544h-6.852a3 3 0 0 1 -2.965 -2.544l-1.255 -8.152a2 2 0 0 1 1.977 -2.304z", "M9 11v-5a3 3 0 0 1 6 0v5"] },
  { key: "handbag", label: "กระเป๋าถือ", tags: "", d: ["M5 10h14l-1.2 9a2 2 0 0 1 -2 1.7h-7.6a2 2 0 0 1 -2 -1.7z", "M8.5 10v-1.5a3.5 3.5 0 0 1 7 0v1.5"] },
  { key: "briefcase", label: "กระเป๋าเอกสาร", tags: "", d: ["M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z", "M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2", "M12 12v.01", "M3 13a20 20 0 0 0 18 0"] },
  { key: "backpack", label: "กระเป๋าเป้", tags: "", d: ["M5 18v-6a6 6 0 0 1 6 -6h2a6 6 0 0 1 6 6v6a3 3 0 0 1 -3 3h-8a3 3 0 0 1 -3 -3z", "M10 6v-1a2 2 0 1 1 4 0v1", "M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4", "M11 10h2"] },
  { key: "luggage", label: "กระเป๋าเดินทาง", tags: "", d: ["M6 8a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z", "M9 6v-1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v1", "M6 10h12", "M6 16h12", "M9 20v1", "M15 20v1"] },
  { key: "clutch", label: "คลัตช์/ซอง", tags: "", d: ["M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z", "M3 7l9 6l9 -6"] },
  { key: "wallet", label: "กระเป๋าสตางค์", tags: "", d: ["M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12", "M20 12v4h-4a2 2 0 0 1 0 -4h4"] },
  { key: "belt", label: "เข็มขัด", tags: "", d: ["M2 10h20v4h-20z", "M13 8.5h5v7h-5z", "M15.5 12h4"] },
  { key: "laptop", label: "แล็ปท็อป", tags: "", d: ["M3 19h18", "M5 7a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1z"] },
  { key: "world", label: "เดินทาง/ทั่วโลก", tags: "", d: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M3.6 9h16.8", "M3.6 15h16.8", "M11.5 3a17 17 0 0 0 0 18", "M12.5 3a17 17 0 0 1 0 18"] },
  { key: "user", label: "คน/ผู้ใช้", tags: "", d: ["M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0", "M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"] },
  { key: "shirt", label: "เสื้อผ้า", tags: "", d: ["M15 4l6 2v5h-3v8a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1v-8h-3v-5l6 -2a3 3 0 0 0 6 0"] },
  { key: "gift", label: "ของขวัญ", tags: "", d: ["M3 9a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1z", "M12 8v13", "M19 12v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-7", "M7.5 8a2.5 2.5 0 0 1 0 -5a4.8 8 0 0 1 4.5 5a4.8 8 0 0 1 4.5 -5a2.5 2.5 0 0 1 0 5"] },
  { key: "star", label: "ดาว/แนะนำ", tags: "", d: ["M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z"] },
  { key: "heart", label: "หัวใจ", tags: "", d: ["M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"] },
  { key: "tag", label: "ป้าย/ลดราคา", tags: "", d: ["M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3z"] },
  { key: "diamond", label: "เพชร/พรีเมียม", tags: "", d: ["M6 5h12l3 5l-8.5 9.5a.7 .7 0 0 1 -1 0l-8.5 -9.5l3 -5", "M10 12l-2 -2.2l.6 -1"] },
  { key: "leaf", label: "ใบไม้/วัสดุธรรมชาติ", tags: "", d: ["M5 21c.5 -4.5 2.5 -8 7 -10", "M9 18c6.218 0 10.5 -3.288 11 -12v-2h-4.014c-9 0 -11.986 4 -12 9c0 1 0 3 2 5h3z"] },
  { key: "droplet", label: "หยดน้ำ/กันน้ำ", tags: "", d: ["M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546z"] },
  { key: "sparkles", label: "ใหม่/วิบวับ", tags: "", d: ["M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z"] },
  // ── 🛡 ความมั่นใจ / บริการ ──
  { key: "lock", label: "ล็อก/ชำระเงินปลอดภัย", tags: "secure payment safe ปลอดภัย", d: ["M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z", "M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0", "M8 11v-4a4 4 0 1 1 8 0v4"] },
  { key: "shield-check", label: "โล่/รับประกัน", tags: "shield guarantee warranty secure ของแท้ ประกัน", d: ["M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3", "M9 12l2 2l4 -4"] },
  { key: "truck", label: "รถส่งของ/จัดส่ง", tags: "delivery shipping ship ส่ง ขนส่ง", d: ["M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5"] },
  { key: "bolt", label: "สายฟ้า/ไว", tags: "fast quick express ด่วน เร็ว", d: ["M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"] },
  { key: "arrow-back-up", label: "เปลี่ยน/คืนสินค้า", tags: "return exchange refund คืน เปลี่ยน", d: ["M9 14l-4 -4l4 -4", "M5 10h11a4 4 0 1 1 0 8h-1"] },
  { key: "refresh", label: "หมุนเวียน/เปลี่ยนใหม่", tags: "refresh exchange renew", d: ["M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4", "M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"] },
  { key: "credit-card", label: "บัตร/ผ่อนชำระ", tags: "card payment pay installment จ่าย ผ่อน", d: ["M3 8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3z", "M3 10l18 0", "M7 15l.01 0", "M11 15l2 0"] },
  { key: "cash", label: "เงินสด/เก็บปลายทาง", tags: "cash cod money เงิน ปลายทาง", d: ["M3 8a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z", "M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0", "M18 12l.01 0", "M6 12l.01 0"] },
  { key: "package", label: "กล่องพัสดุ", tags: "box package parcel พัสดุ แพ็ก", d: ["M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5", "M12 12l8 -4.5", "M12 12l0 9", "M12 12l-8 -4.5"] },
  { key: "circle-check", label: "ถูกต้อง/ผ่านการตรวจ", tags: "check ok verified ตรวจแล้ว", d: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M9 12l2 2l4 -4"] },
  { key: "check", label: "เครื่องหมายถูก", tags: "check tick yes", d: ["M5 12l5 5l10 -10"] },
  { key: "badge-check", label: "ตรา/ของแท้", tags: "authentic genuine certified ของแท้ รับรอง", d: ["M5 7.2a2.2 2.2 0 0 1 2.2 -2.2h1a2.2 2.2 0 0 0 1.55 -.64l.7 -.7a2.2 2.2 0 0 1 3.12 0l.7 .7c.412 .41 .97 .64 1.55 .64h1a2.2 2.2 0 0 1 2.2 2.2v1c0 .58 .23 1.138 .64 1.55l.7 .7a2.2 2.2 0 0 1 0 3.12l-.7 .7a2.2 2.2 0 0 0 -.64 1.55v1a2.2 2.2 0 0 1 -2.2 2.2h-1a2.2 2.2 0 0 0 -1.55 .64l-.7 .7a2.2 2.2 0 0 1 -3.12 0l-.7 -.7a2.2 2.2 0 0 0 -1.55 -.64h-1a2.2 2.2 0 0 1 -2.2 -2.2v-1a2.2 2.2 0 0 0 -.64 -1.55l-.7 -.7a2.2 2.2 0 0 1 0 -3.12l.7 -.7a2.2 2.2 0 0 0 .64 -1.55v-1", "M9 12l2 2l4 -4"] },
  { key: "award", label: "รางวัล/คุณภาพ", tags: "award quality best คุณภาพ", d: ["M6 9a6 6 0 1 0 12 0a6 6 0 0 0 -12 0", "M12 15l3.4 5.89l1.598 -3.233l3.598 .232l-3.4 -5.889", "M6.802 12l-3.4 5.89l3.598 -.233l1.598 3.232l3.4 -5.889"] },
  { key: "crown", label: "มงกุฎ/พรีเมียม", tags: "crown premium vip", d: ["M12 6l4 6l5 -4l-2 10h-14l-2 -10l5 4z"] },
  { key: "thumb-up", label: "ถูกใจ/รีวิวดี", tags: "like review good รีวิว", d: ["M7 11v8a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1h3a4 4 0 0 0 4 -4v-1a2 2 0 0 1 4 0v5h3a2 2 0 0 1 2 2l-1 5a2 3 0 0 1 -2 2h-7a3 3 0 0 1 -3 -3"] },
  { key: "mood-smile", label: "ยิ้ม/ลูกค้าพอใจ", tags: "smile happy พอใจ", d: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M9 10l.01 0", "M15 10l.01 0", "M9.5 15a3.5 3.5 0 0 0 5 0"] },
  // ── ☎️ ติดต่อ / ข้อมูล ──
  { key: "headset", label: "ฝ่ายบริการลูกค้า", tags: "support service call center ช่วยเหลือ", d: ["M4 14v-3a8 8 0 1 1 16 0v3", "M18 19c0 1.657 -2.686 3 -6 3", "M4 14a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-1a2 2 0 0 1 -2 -2v-3z", "M15 14a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-1a2 2 0 0 1 -2 -2v-3z"] },
  { key: "message", label: "แชท/สอบถาม", tags: "chat message line ถาม คุย", d: ["M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1"] },
  { key: "phone", label: "โทรศัพท์", tags: "phone call tel โทร", d: ["M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2"] },
  { key: "mail", label: "อีเมล", tags: "email mail จดหมาย", d: ["M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10z", "M3 7l9 6l9 -6"] },
  { key: "map-pin", label: "ที่อยู่/สาขา", tags: "location address map แผนที่", d: ["M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0", "M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z"] },
  { key: "building-store", label: "หน้าร้าน", tags: "store shop ร้าน", d: ["M3 21l18 0", "M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2 -4h14l2 4", "M5 21l0 -10.15", "M19 21l0 -10.15", "M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4"] },
  { key: "home", label: "บ้าน/หน้าแรก", tags: "home house", d: ["M5 12l-2 0l9 -9l9 9l-2 0", "M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7", "M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"] },
  { key: "clock", label: "นาฬิกา/เวลาทำการ", tags: "time hours เวลา", d: ["M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0", "M12 7v5l3 3"] },
  { key: "calendar", label: "ปฏิทิน/วันส่ง", tags: "date calendar วันที่", d: ["M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z", "M16 3v4", "M8 3v4", "M4 11h16"] },
  { key: "info-circle", label: "ข้อมูล", tags: "info information", d: ["M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0", "M12 9h.01", "M11 12h1v4h1"] },
  { key: "help-circle", label: "คำถาม/ช่วยเหลือ", tags: "help faq question", d: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 17l0 .01", "M12 13.5a1.5 1.5 0 0 1 1 -1.5a2.6 2.6 0 1 0 -3 -4"] },
  // ── 🏷 สินค้า / โปร ──
  { key: "percentage", label: "ส่วนลด %", tags: "discount sale percent ลด", d: ["M16 17a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M6 7a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M6 18l12 -12"] },
  { key: "ruler", label: "ไม้บรรทัด/ไซส์", tags: "size measure ขนาด", d: ["M5 4h14a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-7a1 1 0 0 0 -1 1v7a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1", "M4 8l2 0", "M4 12l3 0", "M4 16l2 0", "M8 4l0 2", "M12 4l0 3", "M16 4l0 2"] },
  { key: "scissors", label: "กรรไกร/งานฝีมือ", tags: "handmade craft ทำมือ", d: ["M3 7a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M3 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M8.6 8.6l10.4 10.4", "M8.6 15.4l10.4 -10.4"] },
];

const BY_KEY = new Map(SITE_ICONS.map((i) => [i.key, i]));
export const siteIconDef = (key: string): SiteIconDef | null => BY_KEY.get(key) ?? null;

/** ค่าที่เก็บ → ไอคอนเส้น / รูปที่อัปโหลด / อีโมจิ-ตัวอักษร · ว่าง/ไม่รู้จัก = null */
export type SiteIconValue = { kind: "line"; def: SiteIconDef } | { kind: "img"; key: string } | { kind: "text"; text: string } | null;
const IMG_KEY_RE = /^[\w\-./%()]{1,200}$/;
export function parseSiteIcon(v: string | null | undefined): SiteIconValue {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (s.startsWith("i:")) {
    const def = siteIconDef(s.slice(2));
    return def ? { kind: "line", def } : null;
  }
  if (s.startsWith("img:")) {
    const key = s.slice(4);
    return IMG_KEY_RE.test(key) ? { kind: "img", key } : null;
  }
  return { kind: "text", text: s };
}
export const lineIconValue = (key: string) => `i:${key}`;
export const imageIconValue = (r2Key: string) => `img:${r2Key}`;

/** ทำความสะอาดค่าไอคอนก่อนเก็บ — i:<key> / img:<r2 key> เก็บเต็ม · อีโมจิ/ตัวอักษรตัดที่ maxText ตัว */
export function cleanSiteIcon(v: unknown, maxText = 8): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (/^i:[a-z0-9-]{1,40}$/.test(s)) return s;
  if (s.startsWith("img:")) return IMG_KEY_RE.test(s.slice(4)) ? s : "";
  return s.startsWith("i:") ? "" : s.slice(0, maxText);
}

/** ค้นไอคอนเส้น (คีย์ · ชื่อไทย · คำค้น) */
export function searchSiteIcons(q: string): SiteIconDef[] {
  const t = q.trim().toLowerCase();
  if (!t) return SITE_ICONS;
  return SITE_ICONS.filter((i) => `${i.key} ${i.label} ${i.tags}`.toLowerCase().includes(t));
}
