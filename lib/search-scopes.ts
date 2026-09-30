/**
 * search-scopes — ทะเบียน "ขอบเขตค้นหา" ของ Global Search (ของกลาง)
 *
 * ปกติ Global Search (Ctrl+K) ค้นข้ามทุกโมดูล · แอปเดี่ยว (เช่น Payroll) อยากได้ตัวเดียวกันแต่
 * "ค้นเฉพาะของแอปนี้" + มีคำแนะนำวิธีค้นเฉพาะทาง → ประกาศ scope ที่นี่ 1 แถว แล้วส่ง
 * `<GlobalSearch scope="payroll" />` ฝั่ง UI และ `?scope=payroll` ที่ API
 *
 * ไฟล์นี้ pure (ไม่มี React / ไม่แตะ DB) ใช้ได้ทั้ง client/server
 * เพิ่มแอปใหม่ = เพิ่ม 1 แถวใน SEARCH_SCOPES (ไม่ต้องแก้ component/API)
 */

export type SearchScope = {
  key: string;
  /** ชื่อที่โชว์ท้ายป๊อปอัป เช่น "ค้นเฉพาะ Payroll" */
  label: string;
  /** app key ใน erp_app_groups — เมนูที่สังกัดแอปนี้เท่านั้นที่ค้นเจอ */
  appKey: string;
  /** สำรอง: เมนูที่ href ขึ้นต้นด้วยนี้ก็นับเป็นของแอป (กันเมนูที่ยังไม่ผูก app_keys) */
  hrefPrefix: string;
  /** ชนิดข้อมูลที่ค้น (entity ใน SOURCES ของ API) */
  entities: string[];
  /** คู่มือ (erp_help_guides) ที่จะโชว์: ชื่อ/หมวด/คำอธิบายต้องมีคำใดคำหนึ่ง */
  guideKeywords: string[];
  /** ข้อความในช่องพิมพ์ */
  placeholder: string;
  /** วิธีค้นหา — โชว์ในกล่อง "❓ วิธีค้นหา" (1 แถว = 1 ตัวอย่าง) */
  tips: { icon: string; what: string; example: string }[];
  /** ปุ่มตัวอย่างคำค้นให้กดลอง */
  examples: string[];
};

export const SEARCH_SCOPES: Record<string, SearchScope> = {
  payroll: {
    key: "payroll",
    label: "ค้นเฉพาะ Payroll",
    appKey: "payroll",
    hrefPrefix: "/payroll",
    entities: ["employee", "contract", "period"],
    guideKeywords: ["เงินเดือน", "payroll", "พนักงาน", "สัญญา", "สลิป", "ลาออก", "เข้าออก", "งวด"],
    placeholder: "ค้นพนักงาน (รหัส/ชื่อ/ชื่อเล่น/เบอร์), เลขสัญญา, ชื่องวด, เมนู · หรือสั่ง “เพิ่มพนักงาน”",
    tips: [
      { icon: "🧑‍💼", what: "พนักงาน — รหัส ชื่อ ชื่อเล่น หรือเบอร์โทร (รวมคนที่ลาออกแล้ว มีป้ายบอก)", example: "ISG-131 หรือ ซีทู หรือ 081" },
      { icon: "📄", what: "สัญญาจ้าง — เลขที่สัญญา (พิมพ์แค่เลขท้ายก็เจอ)", example: "CON-2026-0005 หรือ 0005" },
      { icon: "📅", what: "งวดเงินเดือน — ชื่องวด/เดือน/บริษัท (เปิดหน้าข้อมูลคำนวณของงวดนั้นให้เลย)", example: "กันยายน หรือ ไอเอสจี" },
      { icon: "📋", what: "หน้า/เมนูของ Payroll — พิมพ์ชื่อเมนูหรือคำที่นึกออก", example: "สลิป · ลาออก · วันหยุด · ใบเตือน" },
      { icon: "⚡", what: "สั่งงานลัด — พิมพ์ “เพิ่ม/สร้าง” + สิ่งที่ต้องการ แล้วกด ↵ ฟอร์มเปิดให้ทันที", example: "เพิ่มพนักงาน · เพิ่มสัญญา · คำนวณงวด" },
      { icon: "💡", what: "พิมพ์หลายคำเว้นวรรค = ต้องเจอทุกคำ (ช่วยกรองให้แคบลง)", example: "สัญญา รายวัน" },
    ],
    examples: ["ISG-131", "CON-2026", "กันยายน", "สลิป", "เพิ่มพนักงาน", "แจ้งลาออก"],
  },
};

export const getSearchScope = (key?: string | null): SearchScope | null => (key ? SEARCH_SCOPES[key] ?? null : null);
