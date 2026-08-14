/**
 * paste-table — ของกลาง "อ่านตารางที่ผู้ใช้คัดลอกมาจาก Excel/Google Sheet"
 * --------------------------------------------------------------------------
 * ทุกหน้าที่มีช่อง "วางจาก Excel" ต้องใช้ตัวนี้ ห้ามเขียน split("\t") เองซ้ำอีก
 * (ก่อนหน้านี้เขียนซ้ำอยู่ 2 ที่: ลงรายการสินค้า + นำเข้า Statement OD)
 *
 * รวมเรื่องน่าปวดหัวไว้ให้แล้ว:
 *   - Excel คัดลอกมาเป็น TAB · บางที่ export เป็นจุลภาค → รองรับทั้งคู่
 *   - ตัวเลขมีลูกน้ำ / มี ฿ / วงเล็บแปลว่าติดลบ (1,234) → -1234
 *   - วันที่คนไทยพิมพ์หลายแบบ: 2026-09-05 · 05/09/2026 · 5/9/2569 (พ.ศ.) · 5 ก.ย. 2569
 *
 * ใช้:
 *   const grid = parsePastedTable(text);          // string[][]
 *   const body = dropHeaderRow(grid, /งวด|วันที่/i);
 *   const amount = parseNumberCell(body[0][2]);   // number
 *   const iso    = parseDateCell(body[0][1]);     // "YYYY-MM-DD" หรือ ""
 */

/** แยกข้อความที่วางมาเป็นตาราง 2 มิติ (ตัดบรรทัดว่างทิ้ง) */
export function parsePastedTable(text: string): string[][] {
  return String(text ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => (line.includes("\t") ? line.split("\t") : line.split(",")))
    .map((cells) => cells.map((c) => c.trim()))
    .filter((cells) => cells.some((c) => c !== ""));
}

/** แถวแรกเป็นหัวตารางไหม (ผู้ใช้มักคัดลอกหัวมาด้วย) — ส่ง regex ที่คาดว่าจะเจอในหัว */
export function looksLikeHeaderRow(cells: string[] | undefined, pattern: RegExp): boolean {
  if (!cells) return false;
  return cells.some((c) => pattern.test(c));
}

/** ตัดแถวหัวตารางออกถ้ามี */
export function dropHeaderRow(grid: string[][], pattern: RegExp): string[][] {
  return grid.length > 0 && looksLikeHeaderRow(grid[0], pattern) ? grid.slice(1) : grid;
}

/**
 * อ่านช่องตัวเลข — ลูกน้ำ / ช่องว่าง / ฿ / ,- ท้ายแบบบัญชี / วงเล็บ = ติดลบ
 * ช่องว่างหรืออ่านไม่ออก → คืน 0 (ใช้ `isNumericCell` ถ้าต้องแยก "ว่าง" ออกจาก "ศูนย์")
 */
export function parseNumberCell(v: unknown): number {
  let s = String(v ?? "").trim();
  if (s === "" || s === "-") return 0;
  const neg = /^\(.*\)$/.test(s);          // (1,234) = ติดลบ ตามรูปแบบบัญชี
  s = s.replace(/[()]/g, "");
  s = s.replace(/[,\s฿$€¥]/g, "").replace(/บาท/g, "").replace(/-$/, "");
  const n = Number(s);
  if (!isFinite(n)) return 0;
  return neg ? -n : n;
}

/** ช่องนี้เป็นตัวเลขจริง ๆ ไหม (ไม่ใช่ว่าง / ไม่ใช่ข้อความ) */
export function isNumericCell(v: unknown): boolean {
  const s = String(v ?? "").trim().replace(/[(),\s฿$€¥]/g, "").replace(/บาท/g, "");
  return s !== "" && isFinite(Number(s));
}

const TH_MONTHS = [
  ["ม.ค", "มค", "jan"], ["ก.พ", "กพ", "feb"], ["มี.ค", "มีค", "mar"], ["เม.ย", "เมย", "apr"],
  ["พ.ค", "พค", "may"], ["มิ.ย", "มิย", "jun"], ["ก.ค", "กค", "jul"], ["ส.ค", "สค", "aug"],
  ["ก.ย", "กย", "sep"], ["ต.ค", "ตค", "oct"], ["พ.ย", "พย", "nov"], ["ธ.ค", "ธค", "dec"],
];

/** ปี พ.ศ. → ค.ศ. (ปีเกิน 2400 ถือว่าเป็น พ.ศ.) · ปี 2 หลัก → เดา 20xx */
function normalizeYear(y: number): number {
  if (y > 2400) return y - 543;
  if (y < 100) return y + 2000;
  return y;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : "";

/**
 * อ่านช่องวันที่ → ISO "YYYY-MM-DD" (อ่านไม่ออก → "")
 * รองรับ: 2026-09-05 · 05/09/2026 · 5-9-2569 · 5 ก.ย. 2569 · 5 Sep 2026 · เลขซีเรียลของ Excel
 */
export function parseDateCell(v: unknown): string {
  const s = String(v ?? "").trim();
  if (s === "") return "";

  // 2026-09-05 (ISO) — ตัดเวลาทิ้งถ้ามี
  const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) return iso(normalizeYear(+m1[1]), +m1[2], +m1[3]);

  // 05/09/2026 · 5-9-2569 · 5.9.69  (วัน/เดือน/ปี แบบที่คนไทยใช้)
  const m2 = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m2) return iso(normalizeYear(+m2[3]), +m2[2], +m2[1]);

  // 5 ก.ย. 2569 · 5 Sep 2026
  const m3 = s.match(/^(\d{1,2})\s*([^\d\s]+)\.?\s*(\d{2,4})/);
  if (m3) {
    const key = m3[2].toLowerCase().replace(/\./g, "");
    const idx = TH_MONTHS.findIndex((names) => names.some((n) => key.startsWith(n.replace(/\./g, ""))));
    if (idx >= 0) return iso(normalizeYear(+m3[3]), idx + 1, +m3[1]);
  }

  // เลขซีเรียลของ Excel (จำนวนวันนับจาก 1899-12-30) — เกิดตอนอ่านไฟล์ .xlsx ดิบ
  if (/^\d{5}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  return "";
}

/** ช่องนี้อ่านเป็นวันที่ได้ไหม */
export const isDateCell = (v: unknown): boolean => parseDateCell(v) !== "";
