/**
 * ทะเบียน "ตัวสร้างสินค้าบนร้าน" (ของกลาง · pure) — ร้านไหนลงสินค้าจริงได้ / ดูก่อนส่งได้ / ใช้ปลายทางไหน
 * --------------------------------------------------------------------------
 * ตัวช่วยลงสินค้า (components/platform-listing/add-to-platform-wizard) อ่านจากที่นี่ที่เดียว
 * เพิ่มร้านใหม่ (Shopee / TikTok / Amaze …) = ทำตัวประกอบข้อมูล + API create-product ของร้านนั้น (GET ดูก่อนส่ง · POST ลงจริง)
 *   แล้วเพิ่ม 1 แถวที่นี่ — หน้าจอ ด่านกันลงซ้ำ ประวัติ ใช้ของเดิมทั้งหมด
 * live = เปิดลงจริงแล้ว (false = ดูก่อนส่ง + บันทึกร่างได้ · ปุ่มลงจริงปิด)
 * ห้าม import "@/..." (ใช้ได้ทั้งหน้าเว็บ/หลังบ้าน/เทสต์)
 */

export type PlatformCreator = {
  code: string;
  label: string;
  /** POST { parent_sku_id, display? } = ลงจริง · GET ?parent_sku_id= = ดูก่อนส่ง */
  endpoint: string;
  live: boolean;
  /** ทำไมยังไม่เปิดลงจริง (โชว์ในตัวช่วย) */
  notLiveReason?: string;
};

/**
 * Lazada: ตัวสร้างพร้อมแล้ว (lib/lazada-create-plan + /api/lazada/create-product) แต่ Lazada ปิดการสร้างสินค้าผ่าน API ช่วงแคมเปญ
 * (เจอ 2026-11-10 "sellers will be blocked from creating products … Only Stock and Price updates") → เปิดเมื่อพ้นแคมเปญ + ทดสอบ 1 ตัว
 */
export const LAZADA_CREATE_LIVE = false;

export const PLATFORM_CREATORS: Record<string, PlatformCreator> = {
  line_shopping: { code: "line_shopping", label: "LINE SHOPPING", endpoint: "/api/line-shopping/create-product", live: true },
  lazada: {
    code: "lazada", label: "Lazada", endpoint: "/api/lazada/create-product", live: LAZADA_CREATE_LIVE,
    notLiveReason: "ดูก่อนส่ง + บันทึกร่างได้ · ลงจริงเปิดเมื่อ Lazada ให้สร้างสินค้าอีกครั้ง (ปิดช่วงแคมเปญ)",
  },
};

export const creatorOf = (code: string | null | undefined): PlatformCreator | null => PLATFORM_CREATORS[String(code ?? "")] ?? null;
/** ปลายทางลงจริง (null = ร้านนี้ยังลงจริงไม่ได้) */
export const liveCreateEndpoint = (code: string | null | undefined): string | null => { const c = creatorOf(code); return c?.live ? c.endpoint : null; };
/** ร้านที่มีหน้าดูก่อนส่ง (ลงจริงได้ หรือเตรียมไว้แล้ว) */
export const hasCreatePreview = (code: string | null | undefined): boolean => !!creatorOf(code);
/** ร้านที่ "ลงทุกร้าน" ติ๊กให้ (มีตัวสร้าง) */
export const CREATOR_CODES = Object.keys(PLATFORM_CREATORS);
