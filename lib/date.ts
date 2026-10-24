// ============================================================
// ค่ากลาง: รูปแบบวันที่ของทั้งระบบ = DD/MM/YYYY (ปี ค.ศ.)
// ใช้ที่เดียว เปลี่ยนที่นี่ = เปลี่ยนทั้งระบบ
// ห้ามจัดรูปแบบวันที่เองในแต่ละหน้า — ให้เรียก formatDate / formatDateTime จากที่นี่
// ============================================================

/** แปลงค่าวันที่ (ISO string / Date / null) → "DD/MM/YYYY". คืน "" ถ้าว่าง */
export function formatDate(value: unknown): string {
  if (value == null || value === "") return "";

  const s = value instanceof Date ? value.toISOString() : String(value);

  // ดึงส่วนวันที่ YYYY-MM-DD จากต้นสตริง (timezone-safe สำหรับ ISO)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;

  // fallback: ลอง parse ด้วย Date
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  }
  return s; // แปลงไม่ได้ → คืนค่าเดิม
}

/** แปลงค่าวันที่+เวลา → "DD/MM/YYYY HH:mm" (เวลาเครื่องผู้ใช้) */
export function formatDateTime(value: unknown): string {
  if (value == null || value === "") return "";
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return formatDate(value);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}

/**
 * "วันนี้" แบบ YYYY-MM-DD ตามเวลาไทย (+07:00) — ใช้ได้ทั้งหน้าเว็บและ server (Vercel เป็นเวลาสากล)
 * ห้ามใช้ new Date().toISOString().slice(0, 10) หาวันนี้ — ช่วงเที่ยงคืนถึง 7 โมงเช้าจะได้ "เมื่อวาน"
 */
export function todayBangkok(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/** วันที่ "YYYY-MM-DD" บวก/ลบ n วัน (นับทุกวันตามปฏิทิน) — คิดแบบ UTC ล้วน จึงไม่เพี้ยนตามเขตเวลาเครื่อง */
export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
