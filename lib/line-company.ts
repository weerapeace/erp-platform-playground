/**
 * ไลน์บริษัท — กติกาล้วน (ไม่มี I/O · เทสต์ lib/__tests__/line-company.test.ts)
 *
 * ไลน์บริษัท = LINE OA ตัวเดียวที่ทั้งพนักงานและลูกค้าทักแชท 1:1 ได้ (เจ้าของเลือก 2026-11-21 · docs/line-company-oa.md)
 *   - คนที่ทักเข้ามาแยกเป็น 3 แบบ (ตัวแยกคน lib/line-identity): ยังไม่ผูก / พนักงาน / ลูกค้า
 *   - แต่ละแบบเห็น "เมนูล่างจอ" (Rich Menu) คนละชุด — ระบบสลับเมนูให้เองตอนผูก/ถอนผูก
 *   - ปุ่มเมนูส่ง postback "cmp=<คำสั่ง>" กลับมาที่ตัวรับไลน์กลาง → บอทตอบกลับ (reply = ฟรี ไม่กินโควตา)
 *   - ตัวเงิน (สลิป/ค่าแรง) ห้ามพิมพ์ในแชต — ต้องเปิดหน้าเล็ก (LIFF) ที่เช็กตัวตนใหม่ทุกครั้ง (เฟส 1-2)
 * ส่วนที่คุยกับ LINE จริง (สร้างเมนู · ผูกเมนูให้คน · ตอบกลับ) อยู่ที่ lib/line-company-server.ts
 */

export type CompanyMenuKind = "guest" | "employee" | "customer";
export const COMPANY_MENU_KINDS: CompanyMenuKind[] = ["guest", "employee", "customer"];

export const COMPANY_MENU_LABEL: Record<CompanyMenuKind, string> = {
  guest: "ยังไม่ผูก",
  employee: "พนักงาน",
  customer: "ลูกค้า",
};

/** คำสั่งที่ปุ่มเมนูส่งมาได้ (รายการปิด — ค่าอื่นไม่รับ) */
export type CompanyAction =
  | "i_am_staff" | "i_am_customer" | "talk"
  | "payslip" | "piecework" | "upload" | "attendance" | "notify" | "help"
  | "orders" | "products" | "designs" | "quotes";

export type CompanyMenuButton = { act: CompanyAction; label: string; hint: string };
export type CompanyMenuDef = { kind: CompanyMenuKind; name: string; chatBarText: string; buttons: CompanyMenuButton[] };

/** เมนูล่างจอ 3 ชุด · 3 ปุ่ม = 1 แถว · 6 ปุ่ม = 2 แถว (ปุ่มละ 1/3 ความกว้าง) */
export const COMPANY_MENUS: Record<CompanyMenuKind, CompanyMenuDef> = {
  guest: {
    kind: "guest", name: "ไลน์บริษัท · ยังไม่ผูก", chatBarText: "เมนู",
    buttons: [
      { act: "i_am_staff", label: "ฉันเป็นพนักงาน", hint: "ผูกไลน์กับรหัสพนักงาน" },
      { act: "i_am_customer", label: "ฉันเป็นลูกค้า", hint: "ผูกไลน์กับร้านของคุณ" },
      { act: "talk", label: "คุยกับพนักงาน", hint: "พิมพ์ถามได้เลย" },
    ],
  },
  employee: {
    kind: "employee", name: "ไลน์บริษัท · พนักงาน", chatBarText: "เมนูพนักงาน",
    buttons: [
      { act: "payslip", label: "สลิปเงินเดือน", hint: "ดูสลิปของฉัน" },
      { act: "piecework", label: "งานเหมาของฉัน", hint: "งานที่รับ + ค่าแรง" },
      { act: "upload", label: "ส่งไฟล์ลูกค้า", hint: "ส่งไฟล์เข้าระบบ" },
      { act: "attendance", label: "ลา/เข้างาน", hint: "ดูวันลาคงเหลือ" },
      { act: "notify", label: "แจ้งเตือน", hint: "เรื่องที่ต้องรู้" },
      { act: "help", label: "ถามเรื่องอื่น", hint: "ติดต่อ HR" },
    ],
  },
  customer: {
    kind: "customer", name: "ไลน์บริษัท · ลูกค้า", chatBarText: "เมนูลูกค้า",
    buttons: [
      { act: "orders", label: "ออเดอร์ของฉัน", hint: "สถานะการผลิต/ส่ง" },
      { act: "products", label: "สินค้าของฉัน", hint: "รูปและรหัสสินค้า" },
      { act: "upload", label: "ส่งไฟล์งาน", hint: "ส่งไฟล์ให้ทีม" },
      { act: "designs", label: "งานออกแบบ", hint: "ตัวอย่างที่กำลังทำ" },
      { act: "quotes", label: "ใบเสนอราคา", hint: "ใบที่ส่งให้คุณ" },
      { act: "talk", label: "คุยกับพนักงาน", hint: "พิมพ์ถามได้เลย" },
    ],
  },
};

export const RICH_MENU_W = 2500;
export const RICH_MENU_ROW_H = 843;

/** ขนาดรูปเมนูตามจำนวนแถว */
export function richMenuSize(kind: CompanyMenuKind): { width: number; height: number; rows: number } {
  const rows = Math.ceil(COMPANY_MENUS[kind].buttons.length / 3);
  return { width: RICH_MENU_W, height: RICH_MENU_ROW_H * rows, rows };
}

/** กรอบปุ่มที่ i (ตาราง 3 คอลัมน์) — ใช้ทั้งตอนวาดรูปและตอนบอก LINE ว่าแตะตรงไหน = ปุ่มไหน */
export function richMenuCell(i: number): { x: number; y: number; width: number; height: number } {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const x = Math.round((RICH_MENU_W * col) / 3);
  const next = Math.round((RICH_MENU_W * (col + 1)) / 3);
  return { x, y: row * RICH_MENU_ROW_H, width: next - x, height: RICH_MENU_ROW_H };
}

export const POSTBACK_PREFIX = "cmp=";

/** ตัวเมนูที่ส่งให้ LINE สร้าง (POST /v2/bot/richmenu) */
export function richMenuBody(kind: CompanyMenuKind): Record<string, unknown> {
  const def = COMPANY_MENUS[kind];
  const { width, height } = richMenuSize(kind);
  return {
    size: { width, height },
    selected: true,                       // เปิดเมนูไว้ให้เห็นทันทีที่เข้าแชท
    name: def.name.slice(0, 300),
    chatBarText: def.chatBarText.slice(0, 14),
    areas: def.buttons.map((b, i) => ({
      bounds: richMenuCell(i),
      action: { type: "postback", label: b.label.slice(0, 20), data: `${POSTBACK_PREFIX}${b.act}`, displayText: b.label },
    })),
  };
}

const ALL_ACTIONS = new Set<string>(COMPANY_MENU_KINDS.flatMap((k) => COMPANY_MENUS[k].buttons.map((b) => b.act)));

/** อ่านคำสั่งจาก postback — ไม่ใช่ของไลน์บริษัท / ค่าแปลก = null */
export function parseCompanyPostback(data: unknown): CompanyAction | null {
  if (typeof data !== "string" || !data.startsWith(POSTBACK_PREFIX)) return null;
  const act = data.slice(POSTBACK_PREFIX.length).trim();
  return ALL_ACTIONS.has(act) ? (act as CompanyAction) : null;
}

/** ตัวตนแบบย่อ (ตัวเต็มอยู่ lib/line-identity) */
export type CompanyWho = "employee" | "customer" | "blocked" | "unknown";

/** คนแบบนี้ควรเห็นเมนูชุดไหน — ถูกระงับ/ยังไม่ผูก = เมนูกลาง (ไม่เห็นปุ่มข้อมูลส่วนตัว) */
export function menuKindFor(who: CompanyWho): CompanyMenuKind {
  return who === "employee" ? "employee" : who === "customer" ? "customer" : "guest";
}

/** ปุ่มนี้คนแบบนี้กดได้ไหม — กันคนกดปุ่มจากเมนูเก่าที่ค้างในเครื่อง (เช่น เพิ่งถูกถอนผูก) */
export function actionAllowed(who: CompanyWho, act: CompanyAction): boolean {
  return COMPANY_MENUS[menuKindFor(who)].buttons.some((b) => b.act === act);
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
  if (who === "employee") return `สวัสดีครับ${name ? ` คุณ${name}` : ""} ไลน์นี้ผูกกับรหัสพนักงานของคุณแล้ว กดเมนูด้านล่างได้เลย`;
  if (who === "customer") return `สวัสดีครับ${name ? ` ${name}` : ""} ไลน์นี้ผูกกับร้านของคุณแล้ว กดเมนูด้านล่างเพื่อดูออเดอร์และสินค้า หรือพิมพ์ถามได้เลย`;
  return "สวัสดีครับ ขอบคุณที่เพิ่มเพื่อน ถ้าเป็นพนักงานหรือลูกค้าของบริษัท กดเมนูด้านล่างเพื่อผูกไลน์ หรือพิมพ์ถามได้เลย";
}

/** พนักงานพิมพ์/ส่งไฟล์มาในแชต (ยังไม่มีงานรับไฟล์ในเฟส 0) */
export function employeeChatHint(messageType: string | undefined): string {
  if (messageType === "file" || messageType === "image" || messageType === "video") {
    return "ได้รับไฟล์แล้ว แต่การเก็บไฟล์ลูกค้าเข้าระบบจากแชตนี้ยังไม่เปิด (เปิดในรอบถัดไป) ตอนนี้ให้ส่งในกลุ่มงานเดิมก่อน";
  }
  return "กดเมนูด้านล่างได้เลย เรื่องอื่นติดต่อฝ่ายบุคคลหรือหัวหน้าโดยตรง";
}
