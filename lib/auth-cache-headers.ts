/**
 * authCacheHeaders (ของกลาง) — หัว Cache-Control ของ API ที่ "คำตอบขึ้นกับว่าใคร login"
 *
 * ปัญหาที่แก้ (2026-11-06 · Nee ผู้จัดการเปิดแอป "ผลิต" บน iPad แล้วขึ้น "ยังไม่มีรายการใน App นี้"):
 *   หน้าเปิดก่อน login → ยิง /api/menu แบบไม่มี token → ได้รายการว่าง (RLS ให้เฉพาะคนที่ login)
 *   คำตอบตั้ง `private, max-age=30` ไว้ → เบราว์เซอร์จำค่าว่างนั้น (ไม่แยกตาม token)
 *   login เสร็จภายใน 30 วิ → ขอใหม่ได้ค่าว่างเดิมจากแคช → จอว่างค้าง
 *
 * กติกา: login แล้ว (มี Bearer) = แคชสั้น ๆ ได้ + Vary: Authorization (คนละ token = คนละแคช)
 *        ยังไม่ login = ห้ามแคช (no-store) — คำตอบตอนยังไม่ login ห้ามค้างไปถึงหลัง login
 */
export function authCacheHeaders(request: Request, maxAge = 30): Record<string, string> {
  const authed = /^bearer\s+\S/i.test(request.headers.get("authorization") ?? "");
  return authed
    ? { "Cache-Control": `private, max-age=${maxAge}`, Vary: "Authorization" }
    : { "Cache-Control": "no-store" };
}
