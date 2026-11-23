/**
 * หน้าที่ "ไม่ใช่จอทำงาน ERP" (ของกลาง) — ของลอยทั้งระบบ (ป๊อปเตือนงาน · การ์ดแจ้งเตือนลอย) ต้องไม่โผล่ที่นี่
 * ล็อกอิน · หน้าพิมพ์ · ลิงก์สาธารณะ/แชร์ (/a/ /s/ /offer/) · หน้าพนักงานผ่าน LINE
 */
export const CHROMELESS_PREFIXES = ["/login", "/auth", "/print/", "/a/", "/s/", "/offer/", "/employee-line"] as const;

export function isChromelessPath(pathname: string, extra: readonly string[] = []): boolean {
  // "/a/" ต้องจับ "/a" เฉย ๆ ด้วย (หน้าเล็กในไลน์ LIFF = /a?me=… — เคยหลุด ตัว Pet เด้งทับหน้าในไลน์ 2026-11-23)
  return [...CHROMELESS_PREFIXES, ...extra].some((p) => pathname.startsWith(p) || (p.endsWith("/") && pathname === p.slice(0, -1)));
}
