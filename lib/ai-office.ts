/**
 * 🤖 ออฟฟิศทีม AI — ทะเบียนกลางของ "ผู้ช่วยอัตโนมัติ / AI" ที่ระบบมีอยู่จริง
 *
 * - หน้าจอ: /master/ai-office (components/ai-office) · สถานะสด: /api/ai-office/status (app/api/ai-office/live.ts)
 * - ไฟล์นี้ pure (ไม่มี DB/React) — ทั้งหน้า + API + เทสต์ lib/__tests__/ai-office.test.ts อ่านจากที่เดียว
 * - เพิ่ม/ย้าย/เลิกงานอัตโนมัติ (cron · ปุ่ม AI · คิว) เมื่อไร → แก้ OFFICE_WORKERS ที่นี่
 *   (เทสต์บังคับ: ทุก cron ใน vercel.json ต้องมีเจ้าของในทะเบียนนี้)
 * - งานตั้งเวลาของ Vercel จดผลรอบล่าสุดผ่าน lib/ai-office-runs.ts (recordWorkerRun) → ui_config key `ai_office_run:<id>`
 * - คู่มือ: docs/ai-office.md
 */

/** สิทธิ์ดูหน้า — ยังไม่มีแถวใน erp_permissions (แอดมินผ่านเพราะ erp_can/can() ของแอดมิน = true) */
export const AI_OFFICE_PERM = "ai_office.view";
/** สิทธิ์ตกแต่งฉากออฟฟิศ (ตัวละคร/โต๊ะ/ธีม) — ยังไม่มีแถวใน erp_permissions = แอดมินเท่านั้น */
export const AI_OFFICE_EDIT_PERM = "ai_office.edit";

export type OfficeZoneId = "control" | "sales" | "purchase" | "production" | "marketing" | "finance";
/** ai = เรียก AI (มีค่าใช้จ่ายต่อครั้ง) · auto = กติกาอัตโนมัติ ไม่ใช้ AI */
export type WorkerKind = "ai" | "auto";
/** ok ทำงานปกติ · idle ว่าง/ไม่มีงานเข้า · warn ต้องดู · error ติดปัญหา · unknown ยังไม่มีบันทึก */
export type WorkerStatus = "ok" | "idle" | "warn" | "error" | "unknown";

export type OfficeZone = { id: OfficeZoneId; name: string; nameEn: string; note: string };

export const OFFICE_ZONES: OfficeZone[] = [
  { id: "control", name: "ศูนย์ควบคุม", nameEn: "Control room", note: "นาฬิกาปลุก รายงานตามเวลา และงานดูแลระบบ" },
  { id: "sales", name: "ขาย & หน้าร้าน", nameEn: "Sales & shops", note: "ออเดอร์ออนไลน์ และการเชื่อมร้านค้า" },
  { id: "purchase", name: "จัดซื้อ & คลัง", nameEn: "Purchasing & stock", note: "ออเดอร์จาก LINE บิลร้านค้า และสต๊อก" },
  { id: "production", name: "ผลิต & ออกแบบ", nameEn: "Production & design", note: "เตือนงานช่าง และงานออกแบบที่ส่งมาทาง LINE" },
  { id: "marketing", name: "การตลาด & คอนเทนต์", nameEn: "Marketing & content", note: "AI เขียนคอนเทนต์ โพสต์ตามเวลา และคลังรูป" },
  { id: "finance", name: "บัญชี & บุคคล", nameEn: "Finance & people", note: "เงินสด ค่าบริการรายเดือน และเงินเดือน" },
];

export type OfficeWorker = {
  id: string;
  zone: OfficeZoneId;
  kind: WorkerKind;
  title: string;
  titleEn: string;
  /** ค่าไอคอน (อีโมจิ) ส่งให้ <Icon value> — ระบบไอคอนกลางแปลงเป็นไอคอนเส้นตามที่แอดมินตั้ง */
  icon: string;
  /** ทำอะไร — ภาษาคน 1 ประโยค */
  does: string;
  /** ทำงานเมื่อไหร่ */
  trigger: string;
  can: string[];
  cannot: string[];
  /** สถานะบนหน้านี้ดูจากอะไร (ภาษาคน) */
  source: string;
  /** หน้าที่เกี่ยวข้องในระบบ */
  href?: string;
  /** path ใน vercel.json — ตัวที่ต้องพึ่งนาฬิกาปลุกของ Vercel (ถูกปฏิเสธถ้ายังไม่ตั้ง CRON_SECRET) */
  cron?: string;
  /** ควรทำงานอย่างน้อยทุกกี่ชั่วโมง — ใช้ดูว่าเงียบนานผิดปกติไหม */
  everyHours?: number;
  /** โค้ดหลัก (สำหรับทีมพัฒนา) — เทสต์เช็กว่ามีไฟล์จริง */
  files: string[];
};

const DAILY = "ทุกวัน";

export const OFFICE_WORKERS: OfficeWorker[] = [
  // ── ศูนย์ควบคุม ──
  {
    id: "scheduler", zone: "control", kind: "auto", icon: "⏰",
    title: "ผู้ปลุกงานตามเวลา", titleEn: "Scheduler",
    does: "ปลุกงานอัตโนมัติ 8 ตัวของระบบให้ทำงานตามเวลาทุกวัน",
    trigger: "ตามตารางเวลาใน Vercel (vercel.json)",
    can: ["เรียกงานตั้งเวลาทั้ง 8 ตัวตามเวลา"], cannot: ["ทำงานแทนตัวที่ปลุก", "ข้ามการตรวจรหัสลับ"],
    source: "ดูว่าตั้งรหัสลับ CRON_SECRET ไว้หรือยัง (ถ้ายังไม่ตั้ง Vercel จะถูกปฏิเสธทุกครั้ง)",
    files: ["lib/cron-auth.ts", "vercel.json"],
  },
  {
    id: "email-reports", zone: "control", kind: "auto", icon: "📧",
    title: "ผู้ส่งรายงานตามเวลา", titleEn: "Scheduled reports",
    does: "ส่งรายงานตามรอบเวลาทางอีเมล LINE Discord และป๊อปอัป",
    trigger: "ทุก 15 นาที (ตัวตั้งเวลาในฐานข้อมูล)", everyHours: 24,
    can: ["รวบรวมตัวเลขตามรายงานที่ตั้งไว้", "ส่งให้ผู้รับที่ตั้งไว้"], cannot: ["เพิ่มผู้รับเอง", "แก้ข้อมูลในรายงาน"],
    source: "ประวัติการส่งรายงาน (email_report_runs)", href: "/admin/email-reports",
    files: ["app/api/cron/email-reports/route.ts", "lib/email-report/send.ts"],
  },
  {
    id: "print-purge", zone: "control", kind: "auto", icon: "🧹",
    title: "ผู้ลบรูปลูกค้าตาม PDPA", titleEn: "Customer upload purge",
    does: "ลบรูปที่ลูกค้าอัปโหลดมาพิมพ์ลงกระเป๋า เมื่อพ้นระยะเก็บตามนโยบาย",
    trigger: `${DAILY} 10:15`, cron: "/api/cron/print-uploads-purge", everyHours: 24,
    can: ["ลบไฟล์รูปลูกค้าที่หมดระยะเก็บ"], cannot: ["ลบงานออกแบบหรือออเดอร์"],
    source: "บันทึกรอบล่าสุด + เวลาลบรูปล่าสุด (store_print_designs.uploads_purged_at)",
    files: ["app/api/cron/print-uploads-purge/route.ts"],
  },

  // ── ขาย & หน้าร้าน ──
  {
    id: "order-email", zone: "sales", kind: "auto", icon: "📨",
    title: "ผู้อ่านอีเมลออเดอร์", titleEn: "Order email reader",
    does: "อ่านอีเมลแจ้งออเดอร์จากแพลตฟอร์ม แล้วนำเข้าระบบอัตโนมัติ",
    trigger: "ทุกครั้งที่ Gmail ส่งอีเมลออเดอร์เข้ามา", everyHours: 24,
    can: ["อ่านอีเมลแจ้งออเดอร์", "สร้างรายการออเดอร์ในระบบ"], cannot: ["ตอบอีเมลลูกค้า", "ยกเลิกออเดอร์"],
    source: "เวลาที่ Gmail ติดต่อล่าสุด + กล่องอีเมลออเดอร์ (platform_email_inbox)", href: "/admin/platform-email",
    files: ["app/api/platform-email/inbound/route.ts"],
  },
  {
    id: "lazada-token", zone: "sales", kind: "auto", icon: "🔑",
    title: "ผู้ต่ออายุกุญแจ Lazada", titleEn: "Lazada key renewer",
    does: "ต่ออายุกุญแจเชื่อมร้าน Lazada ทุกวัน กันร้านหลุดเงียบ",
    trigger: `${DAILY} 07:30 หรือกดเองที่หน้าบัญชีแพลตฟอร์ม`, cron: "/api/cron/lazada-token", everyHours: 24,
    can: ["ขอกุญแจใหม่จาก Lazada"], cannot: ["ส่งข้อมูลขึ้นร้าน", "เชื่อมร้านที่หลุดแล้วแทนคน"],
    source: "สถานะกุญแจแต่ละร้าน + บันทึกรอบล่าสุด", href: "/admin/platform-accounts",
    files: ["app/api/cron/lazada-token/route.ts", "lib/lazada.ts"],
  },

  // ── จัดซื้อ & คลัง ──
  {
    id: "line-order-ai", zone: "purchase", kind: "ai", icon: "💬",
    title: "AI อ่านออเดอร์จาก LINE", titleEn: "LINE order reader",
    does: "อ่านข้อความและรูปในกลุ่ม LINE แล้วร่างรายการสั่งซื้อให้คนยืนยัน",
    trigger: "ทุกครั้งที่มีข้อความเข้ากลุ่ม LINE ที่ผูกไว้",
    can: ["อ่านข้อความและรูปที่ส่งเข้ามา", "ร่างรายการสั่งซื้อ"], cannot: ["ยืนยันรายการเอง", "ส่งใบสั่งซื้อให้ร้าน"],
    source: "รายการรอยืนยัน (purchase_order_captures) + ประวัติการใช้ AI", href: "/purchasing/line-orders",
    files: ["lib/order-capture.ts", "app/api/china-pay/line-webhook/route.ts"],
  },
  {
    id: "seller-bill-ai", zone: "purchase", kind: "ai", icon: "🧾",
    title: "AI อ่านบิลร้านจีน", titleEn: "Supplier bill reader",
    does: "อ่านบิลภาษาจีน แปลไทย แล้วจับคู่กับใบสั่งซื้อให้คนตรวจทุกแถว",
    trigger: "เมื่อมีคนอัปบิลแล้วกดให้ AI อ่าน",
    can: ["อ่านบิลจีนและแปล", "จับคู่กับใบสั่งซื้อของร้านนั้น"], cannot: ["ใส่ลงใบสำคัญเองโดยไม่มีคนเช็ก", "โอนเงิน"],
    source: "ประวัติการใช้ AI (ai_seller_bill_read · ai_seller_bill_intake)", href: "/purchasing/vouchers",
    files: ["lib/seller-bill.ts", "app/api/purchasing/seller-bills/intake/route.ts"],
  },
  {
    id: "stock-sync", zone: "purchase", kind: "auto", icon: "📦",
    title: "ผู้ซิงก์สต๊อกขึ้นร้านค้า", titleEn: "Stock sync",
    does: "นำยอดสต๊อกจากไฟล์ BigSeller เข้าระบบ (เฟส 1 ยังไม่ส่งขึ้นร้านอัตโนมัติ)",
    trigger: "เมื่อมีคนนำเข้าไฟล์",
    can: ["อ่านไฟล์สต๊อก", "อัปเดตยอดในช่องทางที่ตั้งไว้"], cannot: ["ปรับยอดสต๊อกในคลังเอง"],
    source: "เวลานำเข้าล่าสุดของแต่ละช่องทาง (stock_sync_channels)", href: "/master/stock-sync",
    files: ["app/master/stock-sync/page.tsx"],
  },

  // ── ผลิต & ออกแบบ ──
  {
    id: "wo-due-soon", zone: "production", kind: "auto", icon: "🔔",
    title: "ผู้เตือนใบจ่ายงานใกล้กำหนด", titleEn: "Work order due reminder",
    does: "เตือนกระดิ่งและ LINE เมื่อใบจ่ายงานหรือใบสั่งผลิตใกล้หรือเลยกำหนด",
    trigger: `${DAILY} 09:00`, cron: "/api/cron/wo-due-soon", everyHours: 24,
    can: ["ส่งแจ้งเตือนให้คนที่เกี่ยวข้อง"], cannot: ["เลื่อนวันกำหนดส่ง", "เปลี่ยนสถานะงาน"],
    source: "บันทึกรอบล่าสุด + แจ้งเตือน wo.due_soon ที่ส่งออกไป", href: "/master/work-board",
    files: ["app/api/cron/wo-due-soon/route.ts"],
  },
  {
    id: "design-line-ai", zone: "production", kind: "ai", icon: "🎨",
    title: "AI รับงานออกแบบจาก LINE", titleEn: "LINE design inbox",
    does: "อ่านงานออกแบบที่ส่งมาทาง LINE แล้วพักไว้ในกล่องให้คนแปลงเป็นใบงาน",
    trigger: "ทุกครั้งที่มีข้อความเข้ากลุ่ม LINE ที่ผูกไว้",
    can: ["อ่านข้อความและรูป", "สรุปเป็นรายการรอแปลง"], cannot: ["สร้างใบงานออกแบบเอง"],
    source: "กล่องรับงานออกแบบ (design_sheet_line_inbox)", href: "/master/design-sheets/dashboard",
    files: ["lib/design-line-inbox.ts"],
  },

  // ── การตลาด & คอนเทนต์ ──
  {
    id: "ai-caption", zone: "marketing", kind: "ai", icon: "✍️",
    title: "AI เขียนแคปชั่น", titleEn: "Caption writer",
    does: "ดูรูปและการ์ดแบรนด์ แล้วเขียนแคปชั่นกับแฮชแท็กให้แต่ละแพลตฟอร์ม",
    trigger: "เมื่อมีคนกดปุ่ม \"AI เขียนให้\"",
    can: ["อ่านรูป ข้อมูลสินค้า และการ์ดแบรนด์", "เขียนแคปชั่นให้เลือก"], cannot: ["โพสต์ขึ้นเพจเอง"],
    source: "ประวัติการใช้ AI (ai_caption · ai_caption_all)", href: "/tasks/content",
    files: ["app/api/ai/caption/route.ts", "app/api/ai/caption-all/route.ts", "lib/ai-caption.ts"],
  },
  {
    id: "ai-planner", zone: "marketing", kind: "ai", icon: "🗂️",
    title: "AI วางแผนคอนเทนต์", titleEn: "Content planner",
    does: "ร่างแผนโพสต์หลายชิ้น แบ่งงานทีม ร่างการ์ดแบรนด์ และเขียนรายละเอียดสินค้า",
    trigger: "เมื่อมีคนกดปุ่ม AI ในหน้าแผนคอนเทนต์ แผนทีม หรือรายละเอียดสินค้า",
    can: ["ร่างแผนและข้อความให้คนตรวจ"], cannot: ["บันทึกแผนเองโดยไม่มีคนกด"],
    source: "ประวัติการใช้ AI (ai_mass_plan · ai_team_plan_split · ai_brand_profile_draft · ai_product_detail)", href: "/marketing/content-plan",
    files: ["app/api/ai/mass-plan/route.ts", "app/api/team-plan/ai-split/route.ts", "app/api/ai/brand-profile-draft/route.ts", "app/api/ai/product-detail/route.ts"],
  },
  {
    id: "social-publish", zone: "marketing", kind: "auto", icon: "📣",
    title: "ผู้โพสต์ตามเวลา", titleEn: "Scheduled poster",
    does: "โพสต์ Facebook / Instagram ตามเวลาที่ตั้งไว้ในคิว",
    trigger: "ทุก 5 นาที (ตัวตั้งเวลาในฐานข้อมูล)",
    can: ["โพสต์ตามคิวที่คนตั้งไว้"], cannot: ["เพิ่มโพสต์ใหม่เอง", "แก้แคปชั่น"],
    source: "คิวโพสต์ (social_publish_jobs)", href: "/tasks/content",
    files: ["app/api/cron/social-publish/route.ts", "lib/social-publish/queue.ts"],
  },
  {
    id: "album-reminders", zone: "marketing", kind: "auto", icon: "🖼️",
    title: "ผู้เตือนอัลบั้มคอนเทนต์", titleEn: "Album reminder",
    does: "เตือนทีมเมื่ออัลบั้มคอนเทนต์ค้างหรือถึงกำหนด",
    trigger: `${DAILY} 09:30`, cron: "/api/cron/content-album-reminders", everyHours: 24,
    can: ["ส่งแจ้งเตือนในระบบ"], cannot: ["แก้อัลบั้ม"],
    source: "บันทึกรอบล่าสุด + แจ้งเตือน content_album.reminder", href: "/tasks/content",
    files: ["app/api/cron/content-album-reminders/route.ts"],
  },
  {
    id: "drive-check", zone: "marketing", kind: "auto", icon: "🗄️",
    title: "ผู้ตรวจไฟล์หายใน Drive", titleEn: "Drive file checker",
    does: "ตรวจว่าไฟล์คอนเทนต์ที่อยู่ใน Google Drive ยังอยู่ครบไหม",
    trigger: `${DAILY} 11:15`, cron: "/api/cron/content-drive-check", everyHours: 24,
    can: ["ตรวจไฟล์ใน Drive", "ทำเครื่องหมายไฟล์ที่หาย"], cannot: ["ลบหรือย้ายไฟล์"],
    source: "บันทึกรอบล่าสุด + จำนวนไฟล์ที่ถูกทำเครื่องหมายว่าหาย", href: "/master/assets",
    files: ["app/api/cron/content-drive-check/route.ts"],
  },
  {
    id: "look-hash", zone: "marketing", kind: "auto", icon: "🧬",
    title: "ผู้ทำลายนิ้วมือรูป", titleEn: "Image fingerprinter",
    does: "คำนวณลายนิ้วมือรูปในคลัง เพื่อหารูปซ้ำหรือรูปหน้าตาคล้ายกัน",
    trigger: `${DAILY} 10:45`, cron: "/api/cron/asset-look-hash", everyHours: 24,
    can: ["อ่านรูปในคลัง", "บันทึกลายนิ้วมือรูป"], cannot: ["ลบหรือรวมรูปเอง"],
    source: "บันทึกรอบล่าสุด + จำนวนรูปที่ยังไม่มีลายนิ้วมือ", href: "/master/assets",
    files: ["app/api/cron/asset-look-hash/route.ts"],
  },

  // ── บัญชี & บุคคล ──
  {
    id: "cashflow-alert", zone: "finance", kind: "auto", icon: "💰",
    title: "ผู้เฝ้าเงินสด", titleEn: "Cash watcher",
    does: "ดูประมาณการเงินสด แล้วเตือนเมื่อเงินจะต่ำกว่าที่ตั้งไว้",
    trigger: `${DAILY} 08:05`, cron: "/api/cron/cashflow-alert", everyHours: 24,
    can: ["อ่านประมาณการเงินเข้าออก", "ส่งแจ้งเตือน"], cannot: ["โอนเงิน", "เลื่อนวันจ่าย"],
    source: "บันทึกรอบล่าสุด + แจ้งเตือน cashflow.low_cash (ส่งเฉพาะตอนเงินต่ำ)", href: "/cashflow",
    files: ["app/api/cron/cashflow-alert/route.ts"],
  },
  {
    id: "subscriptions", zone: "finance", kind: "auto", icon: "🗓️",
    title: "ผู้เตือนต่ออายุบริการ", titleEn: "Renewal reminder",
    does: "เตือนก่อนถึงวันต่ออายุบริการรายเดือน/รายปี",
    trigger: `${DAILY} 08:00`, cron: "/api/cron/subscriptions-renewals", everyHours: 24,
    can: ["อ่านวันต่ออายุ", "ส่งแจ้งเตือนในระบบและ LINE"], cannot: ["จ่ายเงินหรือยกเลิกบริการ"],
    source: "บันทึกรอบล่าสุด + แจ้งเตือน subscription.renewal_soon", href: "/subscriptions",
    files: ["app/api/cron/subscriptions-renewals/route.ts"],
  },
  {
    id: "payroll-calc", zone: "finance", kind: "auto", icon: "🧮",
    title: "ผู้คำนวณเงินเดือน", titleEn: "Payroll calculator",
    does: "คำนวณเงินเดือนทั้งงวดแบบเบื้องหลัง ไม่ต้องรอหน้าจอ",
    trigger: "เมื่อฝ่ายบุคคลกดคำนวณงวดเงินเดือน",
    can: ["คำนวณตามสูตรเงินเดือนกลาง"], cannot: ["อนุมัติหรือจ่ายเงินเดือน"],
    source: "งานเบื้องหลัง (erp_jobs ประเภท payroll_calc)", href: "/payroll/periods",
    files: ["app/api/jobs/run/route.ts"],
  },
];

export const WORKER_BY_ID: Record<string, OfficeWorker> = Object.fromEntries(OFFICE_WORKERS.map((w) => [w.id, w]));

/** action ใน audit_logs ที่นับเป็น "การใช้ AI" ต่อผู้ช่วยแต่ละตัว */
export const AI_AUDIT_ACTIONS: Record<string, string[]> = {
  "line-order-ai": ["ai_order_read"],
  "seller-bill-ai": ["ai_seller_bill_read", "ai_seller_bill_intake"],
  "ai-caption": ["ai_caption", "ai_caption_all"],
  "ai-planner": ["ai_mass_plan", "ai_team_plan_split", "ai_brand_profile_draft", "ai_product_detail"],
};

/** ป้ายภาษาคนของ action AI (ใช้ในความเคลื่อนไหว) */
export const AI_ACTION_LABEL: Record<string, string> = {
  ai_order_read: "อ่านออเดอร์จาก LINE",
  ai_seller_bill_read: "อ่านบิลร้านจีน",
  ai_seller_bill_intake: "อ่านบิลร้านจีน (รับบิลใหม่)",
  ai_caption: "เขียนแคปชั่น",
  ai_caption_all: "เขียนแคปชั่นทุกแพลตฟอร์ม",
  ai_mass_plan: "ร่างแผนโพสต์หลายชิ้น",
  ai_team_plan_split: "แบ่งงานแผนทีม",
  ai_brand_profile_draft: "ร่างการ์ดแบรนด์",
  ai_product_detail: "เขียนรายละเอียดสินค้า",
};

// ───────────────────────── สถานะสด (ข้อมูลที่ API ส่งให้หน้าจอ) ─────────────────────────

export type WorkerStat = { label: string; value: string; tone?: "good" | "warn" | "bad" };
export type WorkerLive = {
  status: WorkerStatus;
  /** ประโยคสั้นบนการ์ด (จอเล็กของแต่ละตำแหน่ง) */
  headline: string;
  /** เวลาที่ทำงาน/มีความเคลื่อนไหวล่าสุด (ISO) */
  lastAt: string | null;
  stats: WorkerStat[];
  /** ถ้าติดปัญหา — คนต้องทำอะไร (ภาษาคน) */
  fix?: string;
};
export type OfficeEventTone = "done" | "error" | "info" | "wait";
export type OfficeEvent = { at: string; worker: string; tone: OfficeEventTone; text: string };
export type OfficeLive = {
  workers: Record<string, WorkerLive>;
  events: OfficeEvent[];
  /** ตั้ง CRON_SECRET ไว้หรือยัง (ส่งแค่ true/false ไม่ส่งค่า) */
  cronSecret: boolean;
  /** กดใช้ปุ่ม AI ทั้งหมดกี่ครั้งใน 30 วัน (นับจาก audit_logs) */
  aiUses30: number;
  /** ตัวอ่านข้อมูลที่ล้ม (ชื่อผู้ช่วย) — หน้าจอขึ้นป้ายเหลือง */
  failed: string[];
  at: string;
};

/** ผลรอบล่าสุดที่งานตั้งเวลาจดไว้ (ui_config `ai_office_run:<id>`) */
export type WorkerRun = {
  at: string; ok: boolean; summary?: string; error?: string; last_ok_at?: string | null; fails?: number;
  /** ทำงานจบแต่ทำหน้าที่ไม่ได้เพราะยังขาดการตั้งค่า (เช่น ยังไม่กรอกยอดเงินในบัญชี) → ขึ้น "ต้องดู" */
  warn?: boolean;
};
export const WORKER_RUN_PREFIX = "ai_office_run:";
export const workerRunKey = (id: string) => `${WORKER_RUN_PREFIX}${id}`;

export const STATUS_LABEL: Record<WorkerStatus, { th: string; en: string }> = {
  ok: { th: "ทำงานปกติ", en: "Working" },
  idle: { th: "ว่าง", en: "Idle" },
  warn: { th: "ต้องดู", en: "Check" },
  error: { th: "ติดปัญหา", en: "Problem" },
  unknown: { th: "ยังไม่มีบันทึก", en: "No record" },
};
/** ลำดับความสำคัญ (ติดปัญหาก่อน) — ใช้เรียงกล่องต้องให้คนช่วย/ตาราง */
export const STATUS_RANK: Record<WorkerStatus, number> = { error: 0, warn: 1, unknown: 2, ok: 3, idle: 4 };

export const CRON_SECRET_FIX =
  "ให้ผู้ดูแลระบบตั้งค่า CRON_SECRET (ข้อความสุ่มยาว 32 ตัวขึ้นไป) ใน Vercel → Settings → Environment Variables (Production) แล้ว deploy ใหม่ 1 ครั้ง งานตั้งเวลาทั้ง 8 ตัวจะกลับมาทำงานเอง";

const HOUR = 3_600_000;
function hoursSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (now - t) / HOUR : null;
}

/** สถานะของงานตั้งเวลาที่พึ่งนาฬิกาปลุก Vercel — ยังไม่ตั้งรหัสลับ = ติดปัญหาเสมอ */
export function cronWorkerLive(
  w: Pick<OfficeWorker, "everyHours">,
  o: { cronSecret: boolean; run: WorkerRun | null; stats?: WorkerStat[]; evidenceAt?: string | null },
  now = Date.now(),
): WorkerLive {
  const stats = o.stats ?? [];
  const lastAt = o.run?.at ?? o.evidenceAt ?? null;
  if (!o.cronSecret) {
    return { status: "error", headline: "ถูกปฏิเสธทุกครั้ง เพราะยังไม่ได้ตั้งรหัสลับนาฬิกาปลุก", lastAt, stats, fix: CRON_SECRET_FIX };
  }
  if (!o.run) return { status: "unknown", headline: "ยังไม่มีบันทึกรอบการทำงาน (เริ่มจดหลังตั้งรหัสลับแล้ว)", lastAt, stats };
  if (!o.run.ok) {
    return { status: "error", headline: `รอบล่าสุดล้ม: ${o.run.error || "ไม่ทราบสาเหตุ"}`, lastAt, stats, fix: "เปิดดูรายละเอียดรอบที่ล้ม แล้วแจ้งทีมพัฒนาให้ตรวจ" };
  }
  const h = hoursSince(o.run.at, now);
  const limit = (w.everyHours ?? 24) * 2;
  if (h != null && h > limit) {
    return { status: "warn", headline: `เงียบไป ${Math.round(h)} ชม. (ปกติทำทุก ${w.everyHours ?? 24} ชม.)`, lastAt, stats, fix: "ตรวจว่าตัวตั้งเวลาใน Vercel ยังเปิดอยู่" };
  }
  if (o.run.warn) {
    return { status: "warn", headline: o.run.summary || "ทำงานจบแต่ยังขาดการตั้งค่า", lastAt, stats, fix: "เปิดหน้าที่เกี่ยวข้องแล้วตั้งค่าที่ขาด" };
  }
  return { status: "ok", headline: o.run.summary || "รอบล่าสุดสำเร็จ", lastAt, stats };
}

/** สถานะของปุ่ม AI ที่คนกดใช้ — ไม่มีใครใช้ ≠ เสีย (แค่ว่าง) */
export function aiUsageLive(o: { n7: number; n30: number; lastAt: string | null; stats?: WorkerStat[] }, now = Date.now()): WorkerLive {
  const stats = [{ label: "ใช้ใน 7 วัน", value: `${o.n7} ครั้ง` }, { label: "ใช้ใน 30 วัน", value: `${o.n30} ครั้ง` }, ...(o.stats ?? [])];
  if (o.n7 > 0) return { status: "ok", headline: `ใช้ไป ${o.n7} ครั้งใน 7 วันที่ผ่านมา`, lastAt: o.lastAt, stats };
  if (o.n30 > 0) {
    const d = Math.floor((hoursSince(o.lastAt, now) ?? 0) / 24);
    return { status: "idle", headline: `ใช้ล่าสุด ${d} วันก่อน`, lastAt: o.lastAt, stats };
  }
  return { status: "idle", headline: "ยังไม่มีใครใช้ใน 30 วันที่ผ่านมา", lastAt: o.lastAt, stats };
}

export type StatusCounts = Record<WorkerStatus, number>;
export function countStatuses(live: Record<string, WorkerLive> | null | undefined): StatusCounts {
  const c: StatusCounts = { ok: 0, idle: 0, warn: 0, error: 0, unknown: 0 };
  for (const w of OFFICE_WORKERS) c[live?.[w.id]?.status ?? "unknown"]++;
  return c;
}

/**
 * เรื่องที่ต้องให้คนช่วย (ติดปัญหา/ต้องดู) เรียงตามความหนัก — 1 แถว = 1 เรื่องที่ต้องทำ
 * งานตั้งเวลาที่ติดแค่ "ยังไม่ตั้ง CRON_SECRET" รวมไว้ที่ผู้ปลุกงานตามเวลาแถวเดียว (แก้ครั้งเดียวหายทั้งหมด)
 */
export function workersNeedingHelp(live: Record<string, WorkerLive> | null | undefined): OfficeWorker[] {
  if (!live) return [];
  return OFFICE_WORKERS
    .filter((w) => {
      const x = live[w.id];
      if (!x || (x.status !== "error" && x.status !== "warn")) return false;
      return !(w.cron && x.fix === CRON_SECRET_FIX && live.scheduler?.status === "error");
    })
    .sort((a, b) => STATUS_RANK[live[a.id].status] - STATUS_RANK[live[b.id].status]);
}
