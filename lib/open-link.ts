/**
 * ของกลาง — สร้าง "ลิงก์ตรงถึงใบ" (`/path?open=<id>`)
 *
 * แยกออกมาจาก lib/open-param.ts เพราะไฟล์นั้นเป็น "use client" (มี hook)
 * → import จาก API route (ฝั่ง server) แล้ว Next จะโยน error
 *   "Attempted to call openLink() from the server but openLink is on the client"
 *   ทำให้ /api/cashflow ตอบ 500 ทั้งเส้น (กระดานเงินสดโหลดไม่ขึ้น)
 *
 * ไฟล์นี้ไม่มี "use client" → ใช้ได้ทั้งหน้าจอและ API route
 * ฝั่งหน้าจอยัง import จาก lib/open-param ได้เหมือนเดิม (re-export ให้)
 */
export function openLink(path: string, id: string | null | undefined): string {
  return id ? `${path}?open=${encodeURIComponent(id)}` : path;
}
