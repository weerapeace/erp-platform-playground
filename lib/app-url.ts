/**
 * ที่อยู่เว็บ ERP แบบเต็ม (https://…) — ใช้ตอนสร้างลิงก์ที่ออกไปนอกระบบ (อีเมล / LINE) ซึ่งลิงก์แบบ "/path" ใช้ไม่ได้
 * ตั้งได้ด้วย env NEXT_PUBLIC_APP_URL หรือ APP_BASE_URL · ไม่ตั้ง = เว็บจริงบน Vercel
 * (ไฟล์อื่นที่ยังเขียนสูตรนี้ซ้ำเอง ค่อยย้ายมาใช้ตัวนี้ทีละจุด)
 */
export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://erp-platform-playground.vercel.app").replace(/\/$/, "");
}

/** แปลงลิงก์ในระบบ ("/api/…", "/master/…") เป็นลิงก์เต็ม · ลิงก์เต็มอยู่แล้ว = คืนเดิม */
export function absoluteUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${appBaseUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
}
