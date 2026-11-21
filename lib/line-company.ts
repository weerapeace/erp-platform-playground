/**
 * ไลน์บริษัท — กติกาล้วน (ไม่มี I/O · เทสต์ lib/__tests__/line-company.test.ts)
 *
 * ไลน์บริษัท = LINE OA ตัวเดียวที่ทั้งพนักงานและลูกค้าทักแชท 1:1 ได้ (เจ้าของเลือก 2026-11-21 · docs/line-company-oa.md)
 *   - คนที่ทักเข้ามาแยกเป็น (ตัวแยกคน lib/line-identity): ยังไม่ผูก / พนักงาน / ลูกค้า / แอดมิน
 *   - แต่ละแบบเห็น "เมนูล่างจอ" (Rich Menu) คนละชุด — ระบบสลับเมนูให้เองตอนผูก/ถอนผูก
 *   - แอดมิน (คนที่มีสิทธิ์ admin.users ใน ERP) เห็นเมนูแบบแท็บ: แอดมิน / ดูแบบพนักงาน / ดูแบบลูกค้า (สลับในไลน์ได้เอง)
 *   - ปุ่มเมนูส่ง postback "cmp=<คำสั่ง>" กลับมาที่ตัวรับไลน์กลาง → บอทตอบกลับ (reply = ฟรี ไม่กินโควตา)
 *   - ตัวเงิน (สลิป/ค่าแรง) ห้ามพิมพ์ในแชต — ต้องเปิดหน้าเล็ก (LIFF) ที่เช็กตัวตนใหม่ทุกครั้ง
 *
 * ปุ่มในแต่ละเมนู "ตั้งเองได้" ในศูนย์ LINE (ชื่อ · คำอธิบาย · ลำดับ · ซ่อน) — เก็บใน line_config.company_layout
 *   ปุ่มเลือกได้จากรายการปิด COMPANY_ACTIONS เท่านั้น (ปุ่มที่ทำงานได้ต้องมีโค้ดรองรับ) · ค่าเพี้ยน = ใช้ค่าตั้งต้นของชุดนั้น
 * ส่วนที่คุยกับ LINE จริง (สร้างเมนู · ผูกเมนูให้คน · ตอบกลับ) อยู่ที่ lib/line-company-server.ts
 */

export type CompanyMenuKind = "guest" | "employee" | "customer" | "admin";
export const COMPANY_MENU_KINDS: CompanyMenuKind[] = ["guest", "employee", "customer", "admin"];

export const COMPANY_MENU_LABEL: Record<CompanyMenuKind, string> = {
  guest: "ยังไม่ผูก",
  employee: "พนักงาน",
  customer: "ลูกค้า",
  admin: "แอดมิน",
};

/** คำสั่งที่ปุ่มเมนูส่งมาได้ (รายการปิด — ค่าอื่นไม่รับ) */
export type CompanyAction =
  | "i_am_staff" | "i_am_customer" | "talk"
  | "payslip" | "warning" | "piecework" | "upload" | "attendance" | "notify" | "help"
  | "orders" | "schedule" | "products" | "designs" | "quotes"
  | "overview" | "all_staff" | "all_orders" | "chat_queue";

/** ทะเบียนปุ่มที่มีได้ — ชื่อ/คำอธิบายตั้งต้น + ใส่ได้ในเมนูชุดไหน */
export const COMPANY_ACTIONS: Record<CompanyAction, { label: string; hint: string; kinds: CompanyMenuKind[] }> = {
  i_am_staff: { label: "ฉันเป็นพนักงาน", hint: "ผูกไลน์กับรหัสพนักงาน", kinds: ["guest"] },
  i_am_customer: { label: "ฉันเป็นลูกค้า", hint: "ผูกไลน์กับร้านของคุณ", kinds: ["guest"] },
  talk: { label: "คุยกับพนักงาน", hint: "พิมพ์ถามได้เลย", kinds: ["guest", "customer"] },
  payslip: { label: "เงินเดือน", hint: "ดูสลิปของฉัน", kinds: ["employee"] },
  warning: { label: "ใบเตือน", hint: "ใบเตือนของฉัน", kinds: ["employee"] },
  piecework: { label: "งานเหมาของฉัน", hint: "งานที่รับ + ค่าแรง", kinds: ["employee"] },
  attendance: { label: "ลา/เข้างาน", hint: "ดูวันลาคงเหลือ", kinds: ["employee"] },
  notify: { label: "แจ้งเตือน", hint: "เรื่องที่ต้องรู้", kinds: ["employee"] },
  help: { label: "ติดต่อ HR", hint: "ถามเรื่องอื่น", kinds: ["employee"] },
  upload: { label: "ส่งไฟล์งาน", hint: "ส่งไฟล์เข้าระบบ", kinds: ["employee", "customer"] },
  orders: { label: "เช็คสถานะงาน", hint: "ผลิตถึงไหนแล้ว", kinds: ["customer"] },
  schedule: { label: "ตารางส่งงาน", hint: "ปฏิทินนัดส่ง", kinds: ["customer"] },
  products: { label: "สินค้าของฉัน", hint: "รูปและรหัสสินค้า", kinds: ["customer"] },
  designs: { label: "งานออกแบบ", hint: "ตัวอย่างที่กำลังทำ", kinds: ["customer"] },
  quotes: { label: "ใบเสนอราคา", hint: "ใบที่ส่งให้คุณ", kinds: ["customer"] },
  overview: { label: "ภาพรวมวันนี้", hint: "งานค้าง · เรื่องด่วน", kinds: ["admin"] },
  all_staff: { label: "พนักงานทุกคน", hint: "สลิป · ใบเตือน · งานเหมา", kinds: ["admin"] },
  all_orders: { label: "ออเดอร์ทุกร้าน", hint: "สถานะ · นัดส่ง", kinds: ["admin"] },
  chat_queue: { label: "แชตค้างตอบ", hint: "ลูกค้ารอคำตอบ", kinds: ["admin"] },
};
const ACTION_KEYS = Object.keys(COMPANY_ACTIONS) as CompanyAction[];

export type CompanyMenuButton = { act: CompanyAction; label: string; hint: string; hidden?: boolean };
export type CompanyMenuLayout = Record<CompanyMenuKind, CompanyMenuButton[]>;

export const MAX_MENU_BUTTONS = 6;
export const LABEL_MAX = 20;   // LINE รับ label ปุ่มไม่เกิน 20 ตัว
export const HINT_MAX = 30;

const btn = (act: CompanyAction): CompanyMenuButton => ({ act, label: COMPANY_ACTIONS[act].label, hint: COMPANY_ACTIONS[act].hint });

/** ค่าตั้งต้น = ตามผังที่เจ้าของเลือก (2026-11-21 · แบบ B 4 ปุ่ม) */
export const DEFAULT_COMPANY_LAYOUT: CompanyMenuLayout = {
  guest: [btn("i_am_staff"), btn("i_am_customer"), btn("talk")],
  employee: [btn("payslip"), btn("warning"), btn("piecework"), btn("help")],
  customer: [btn("orders"), btn("schedule"), btn("talk"), btn("products")],
  admin: [btn("overview"), btn("all_staff"), btn("all_orders"), btn("chat_queue")],
};

/** ปุ่มที่ใส่ในเมนูชุดนี้ได้ */
export const actionsForKind = (kind: CompanyMenuKind): CompanyAction[] => ACTION_KEYS.filter((a) => COMPANY_ACTIONS[a].kinds.includes(kind));

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** อ่านปุ่มของชุดเดียวจากค่าที่เก็บไว้ — ปุ่มซ้ำ/ใส่ชุดผิด/ค่าแปลก ตัดทิ้ง · ไม่เหลือปุ่มที่โชว์เลย = ค่าตั้งต้น */
export function normalizeMenuButtons(kind: CompanyMenuKind, raw: unknown): CompanyMenuButton[] {
  if (!Array.isArray(raw)) return DEFAULT_COMPANY_LAYOUT[kind].map((b) => ({ ...b }));
  const seen = new Set<string>();
  const out: CompanyMenuButton[] = [];
  for (const r of raw) {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const act = o.act as CompanyAction;
    if (!ACTION_KEYS.includes(act) || !COMPANY_ACTIONS[act].kinds.includes(kind) || seen.has(act)) continue;
    seen.add(act);
    out.push({
      act,
      label: clip(o.label, LABEL_MAX) || COMPANY_ACTIONS[act].label,
      hint: clip(o.hint, HINT_MAX),
      ...(o.hidden === true ? { hidden: true } : {}),
    });
  }
  // โชว์ได้ไม่เกิน 6 ปุ่ม — ที่เกินซ่อนไว้ (ไม่ลบ ให้คนตั้งค่าเลือกเองว่าจะเอาปุ่มไหน)
  let shown = 0;
  for (const b of out) if (!b.hidden && ++shown > MAX_MENU_BUTTONS) b.hidden = true;
  return shown === 0 ? DEFAULT_COMPANY_LAYOUT[kind].map((b) => ({ ...b })) : out;
}

export function normalizeCompanyLayout(raw: unknown): CompanyMenuLayout {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(COMPANY_MENU_KINDS.map((k) => [k, normalizeMenuButtons(k, o[k])])) as CompanyMenuLayout;
}

/** ปุ่มที่โชว์จริง (ไม่ซ่อน) */
export const visibleButtons = (buttons: CompanyMenuButton[]): CompanyMenuButton[] => buttons.filter((b) => !b.hidden).slice(0, MAX_MENU_BUTTONS);

// ---------------------------------------------------------------- เมนูที่สร้างใน LINE จริง

/**
 * เมนูที่สร้างใน LINE: 4 ชุดหลัก + แท็บแอดมินอีก 2 หน้า (ดูแบบพนักงาน / ดูแบบลูกค้า)
 * admin / admin_employee / admin_customer มีแถบแท็บด้านบน กดสลับกันเองในไลน์ (richmenuswitch · ไม่ต้องผ่านเซิร์ฟเวอร์)
 */
export type PublishedMenuKey = CompanyMenuKind | "admin_employee" | "admin_customer";
export const PUBLISHED_MENU_KEYS: PublishedMenuKey[] = ["guest", "employee", "customer", "admin", "admin_employee", "admin_customer"];

export const ADMIN_TABS: { key: PublishedMenuKey; label: string; buttonsOf: CompanyMenuKind; alias: string }[] = [
  { key: "admin", label: "แอดมิน", buttonsOf: "admin", alias: "cmp-admin" },
  { key: "admin_employee", label: "ดูแบบพนักงาน", buttonsOf: "employee", alias: "cmp-admin-employee" },
  { key: "admin_customer", label: "ดูแบบลูกค้า", buttonsOf: "customer", alias: "cmp-admin-customer" },
];
export const adminTabOf = (key: PublishedMenuKey) => ADMIN_TABS.find((t) => t.key === key) ?? null;

/** ชุดปุ่มของเมนูนี้มาจากเลย์เอาต์ชุดไหน */
export const buttonsKindOf = (key: PublishedMenuKey): CompanyMenuKind => adminTabOf(key)?.buttonsOf ?? (key as CompanyMenuKind);

export const MENU_CHAT_BAR: Record<PublishedMenuKey, string> = {
  guest: "เมนู", employee: "เมนูพนักงาน", customer: "เมนูลูกค้า",
  admin: "เมนูแอดมิน", admin_employee: "เมนูแอดมิน", admin_customer: "เมนูแอดมิน",
};

export const RICH_MENU_W = 2500;
export const RICH_MENU_ROW_H = 843;
export const RICH_MENU_TAB_H = 200;

export type MenuBox = { x: number; y: number; width: number; height: number };

/** ตารางปุ่มตามจำนวน: 1-3 = แถวเดียว · 4 = 2×2 · 5-6 = 3×2 */
export function menuGrid(count: number): { cols: number; rows: number } {
  const n = Math.max(1, Math.min(MAX_MENU_BUTTONS, count));
  if (n <= 3) return { cols: n, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  return { cols: 3, rows: 2 };
}

/** ขนาดรูปเมนู (LINE รับ 2500×843 หรือ 2500×1686) — แถบแท็บอยู่ในความสูงเดิม ไม่ทำให้รูปสูงขึ้น */
export function richMenuSize(count: number): { width: number; height: number; rows: number; cols: number } {
  const g = menuGrid(count);
  return { width: RICH_MENU_W, height: RICH_MENU_ROW_H * g.rows, ...g };
}

/** กรอบปุ่มที่ i — ใช้ทั้งตอนวาดรูปและตอนบอก LINE ว่าแตะตรงไหน = ปุ่มไหน (ช่องต่อกันพอดี ไม่ซ้อน ไม่เว้น) */
export function richMenuCell(i: number, count: number, withTabs = false): MenuBox {
  const { width, height, rows, cols } = richMenuSize(count);
  const top = withTabs ? RICH_MENU_TAB_H : 0;
  const col = i % cols;
  const row = Math.floor(i / cols);
  const x = Math.round((width * col) / cols);
  const nx = Math.round((width * (col + 1)) / cols);
  const y = top + Math.round(((height - top) * row) / rows);
  const ny = top + Math.round(((height - top) * (row + 1)) / rows);
  return { x, y, width: nx - x, height: ny - y };
}

/** กรอบแท็บที่ i (เมนูแอดมิน) */
export function richMenuTabCell(i: number): MenuBox {
  const n = ADMIN_TABS.length;
  const x = Math.round((RICH_MENU_W * i) / n);
  return { x, y: 0, width: Math.round((RICH_MENU_W * (i + 1)) / n) - x, height: RICH_MENU_TAB_H };
}

export const POSTBACK_PREFIX = "cmp=";
export const TAB_POSTBACK_PREFIX = "cmptab=";

/** ตัวเมนูที่ส่งให้ LINE สร้าง (POST /v2/bot/richmenu) */
export function richMenuBody(key: PublishedMenuKey, layout: CompanyMenuLayout): Record<string, unknown> {
  const buttons = visibleButtons(layout[buttonsKindOf(key)]);
  const tab = adminTabOf(key);
  const { width, height } = richMenuSize(buttons.length);
  const tabAreas = tab ? ADMIN_TABS.map((t, i) => ({
    bounds: richMenuTabCell(i),
    action: { type: "richmenuswitch", richMenuAliasId: t.alias, data: `${TAB_POSTBACK_PREFIX}${t.key}` },
  })) : [];
  return {
    size: { width, height },
    selected: true,                       // เปิดเมนูไว้ให้เห็นทันทีที่เข้าแชท
    name: `ไลน์บริษัท · ${tab ? `แอดมิน · ${tab.label}` : COMPANY_MENU_LABEL[key as CompanyMenuKind]}`.slice(0, 300),
    chatBarText: MENU_CHAT_BAR[key].slice(0, 14),
    areas: [
      ...tabAreas,
      ...buttons.map((b, i) => ({
        bounds: richMenuCell(i, buttons.length, !!tab),
        action: { type: "postback", label: b.label.slice(0, LABEL_MAX), data: `${POSTBACK_PREFIX}${b.act}`, displayText: b.label },
      })),
    ],
  };
}

/** อ่านคำสั่งจาก postback — ไม่ใช่ของไลน์บริษัท / ค่าแปลก / กดแท็บ = null */
export function parseCompanyPostback(data: unknown): CompanyAction | null {
  if (typeof data !== "string" || !data.startsWith(POSTBACK_PREFIX)) return null;
  const act = data.slice(POSTBACK_PREFIX.length).trim();
  return ACTION_KEYS.includes(act as CompanyAction) ? (act as CompanyAction) : null;
}

/** ตัวตนแบบย่อ (ตัวเต็มอยู่ lib/line-identity) */
export type CompanyWho = "admin" | "employee" | "customer" | "blocked" | "unknown";

/** คนแบบนี้ควรเห็นเมนูชุดไหน — ถูกระงับ/ยังไม่ผูก = เมนูกลาง (ไม่เห็นปุ่มข้อมูลส่วนตัว) */
export function menuKindFor(who: CompanyWho): CompanyMenuKind {
  return who === "admin" ? "admin" : who === "employee" ? "employee" : who === "customer" ? "customer" : "guest";
}

/**
 * ปุ่มนี้คนแบบนี้กดได้ไหม — กันคนกดปุ่มจากเมนูเก่าที่ค้างในเครื่อง (เช่น เพิ่งถูกถอนผูก/ถอนสิทธิ์แอดมิน)
 * ดูตาม "ชนิดปุ่ม" ไม่ใช่เลย์เอาต์ปัจจุบัน — ซ่อนปุ่มในเมนูแล้ว คนที่ยังมีเมนูเก่าค้างกดได้จนเมนูอัปเดต (ข้อมูลยังเป็นของตัวเอง)
 * แอดมินกดได้ทุกปุ่มของพนักงาน/ลูกค้า/แอดมิน (แท็บดูแบบพนักงาน/ลูกค้า)
 */
export function actionAllowed(who: CompanyWho, act: CompanyAction): boolean {
  const kinds = COMPANY_ACTIONS[act].kinds;
  if (who === "admin") return kinds.some((k) => k !== "guest");
  return kinds.includes(menuKindFor(who));
}

const SOON = "ส่วนนี้กำลังเปิดใช้ในรอบถัดไป ตอนนี้ยังดูในไลน์ไม่ได้";

/**
 * ข้อความตอบกลับเมื่อกดปุ่ม — คืน null = ไม่ต้องตอบ (ปล่อยให้พนักงานตอบเองในห้องแชทรวม)
 * ห้ามมีตัวเงินในข้อความเด็ดขาด (สลิป/ค่าแรงต้องเปิดหน้าเล็กที่เช็กตัวตน)
 */
export function companyReplyText(who: CompanyWho, act: CompanyAction, name?: string | null): string | null {
  if (!actionAllowed(who, act)) {
    return who === "blocked"
      ? "บัญชีไลน์นี้ถูกระงับการดูข้อมูล กรุณาติดต่อบริษัท"
      : "เมนูนี้ใช้ไม่ได้แล้ว ลองปิดแชตแล้วเปิดใหม่ เมนูด้านล่างจะอัปเดตเอง";
  }
  const hi = name ? `คุณ${name} ` : "";
  switch (act) {
    case "i_am_staff":
      return "ผูกไลน์กับรหัสพนักงาน: สแกน QR บนบัตรที่ฝ่ายบุคคลให้ (ใช้ได้ครั้งเดียว) ถ้ายังไม่มีบัตร ขอจากฝ่ายบุคคลได้เลย\nผูกเสร็จแล้ว เมนูด้านล่างจะเปลี่ยนเป็นเมนูพนักงานเอง";
    case "i_am_customer":
      return "ผูกไลน์กับร้านของคุณ: ขอลิงก์ผูกไลน์จากพนักงานขายที่ดูแลร้าน เมื่อผูกแล้วจะดูออเดอร์และสินค้าของร้านได้ที่นี่\nหรือพิมพ์ถามในแชตนี้ได้เลย พนักงานจะตอบกลับ";
    case "talk":
      return "พิมพ์ข้อความหรือส่งรูปในแชตนี้ได้เลย พนักงานจะตอบกลับในแชตนี้";
    case "help":
      return `${hi}เรื่องเงินเดือน วันลา หรือเรื่องอื่น ติดต่อฝ่ายบุคคลหรือหัวหน้าโดยตรงได้เลย (ระบบถามตอบในไลน์จะเปิดในรอบถัดไป)`;
    default:
      return `${hi}${SOON}`;
  }
}

/** ข้อความต้อนรับตอนเพิ่มเพื่อน */
export function companyWelcomeText(who: CompanyWho, name?: string | null): string {
  if (who === "admin") return `สวัสดีครับ${name ? ` คุณ${name}` : ""} ไลน์นี้ผูกกับบัญชีแอดมินแล้ว กดแท็บด้านบนเมนูเพื่อสลับดูแบบพนักงาน/ลูกค้าได้`;
  if (who === "employee") return `สวัสดีครับ${name ? ` คุณ${name}` : ""} ไลน์นี้ผูกกับรหัสพนักงานของคุณแล้ว กดเมนูด้านล่างได้เลย`;
  if (who === "customer") return `สวัสดีครับ${name ? ` ${name}` : ""} ไลน์นี้ผูกกับร้านของคุณแล้ว กดเมนูด้านล่างเพื่อดูออเดอร์และสินค้า หรือพิมพ์ถามได้เลย`;
  return "สวัสดีครับ ขอบคุณที่เพิ่มเพื่อน ถ้าเป็นพนักงานหรือลูกค้าของบริษัท กดเมนูด้านล่างเพื่อผูกไลน์ หรือพิมพ์ถามได้เลย";
}

/** พนักงานพิมพ์/ส่งไฟล์มาในแชต (ยังไม่มีงานรับไฟล์) */
export function employeeChatHint(messageType: string | undefined): string {
  if (messageType === "file" || messageType === "image" || messageType === "video") {
    return "ได้รับไฟล์แล้ว แต่การเก็บไฟล์ลูกค้าเข้าระบบจากแชตนี้ยังไม่เปิด (เปิดในรอบถัดไป) ตอนนี้ให้ส่งในกลุ่มงานเดิมก่อน";
  }
  return "กดเมนูด้านล่างได้เลย เรื่องอื่นติดต่อฝ่ายบุคคลหรือหัวหน้าโดยตรง";
}
