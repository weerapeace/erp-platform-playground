/**
 * ของกลาง: แกะ "ยอดเงิน + วันที่" จากข้อความในบิล (ที่ดึงมาจาก PDF)
 * เป็น heuristic (เดาจากรูปแบบ) — ใช้เป็น "ค่าแนะนำ" ให้ผู้ใช้ยืนยัน/แก้ได้ ไม่ใช่ค่าตายตัว
 * ฟังก์ชันบริสุทธิ์ (ไม่พึ่ง DOM/ไลบรารี) → เรียกได้ทั้ง server/client
 */
export type ParsedInvoice = {
  amount: number | null;
  currency: string | null;
  dateISO: string | null; // YYYY-MM-DD
  month: string | null;   // YYYY-MM
};

const EN_MONTH: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const TH_MONTH: Record<string, number> = {
  "มกรา": 1, "กุมภา": 2, "มีนา": 3, "เมษา": 4, "พฤษภา": 5, "มิถุนา": 6,
  "กรกฎา": 7, "สิงหา": 8, "กันยา": 9, "ตุลา": 10, "พฤศจิกา": 11, "ธันวา": 12,
  "ม.ค": 1, "ก.พ": 2, "มี.ค": 3, "เม.ย": 4, "พ.ค": 5, "มิ.ย": 6, "ก.ค": 7, "ส.ค": 8, "ก.ย": 9, "ต.ค": 10, "พ.ย": 11, "ธ.ค": 12,
};

const DATE_KW = /(invoice date|bill(ing)? date|issue date|date of issue|date paid|paid on|วันที่|ลงวันที่|date)/i;
const TOTAL_KW = /(amount due|grand total|total due|total|amount paid|amount|subtotal|ยอดรวม|รวมทั้งสิ้น|จำนวนเงิน|ยอดชำระ|รวมเงิน)/i;

function normYear(y: number): number {
  if (y > 2400) return y - 543; // พ.ศ. → ค.ศ.
  if (y < 100) return 2000 + y;
  return y;
}
function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

type Cand = { iso: string; index: number };

function collectDates(text: string): Cand[] {
  const out: Cand[] = [];
  const push = (y: number, m: number, d: number, index: number) => {
    const s = iso(normYear(y), m, d);
    if (s && normYear(y) >= 2000 && normYear(y) <= 2100) out.push({ iso: s, index });
  };

  // ISO: 2026-07-01
  for (const m of text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) push(+m[1], +m[2], +m[3], m.index ?? 0);
  // DD/MM/YYYY หรือ MM/DD/YYYY (ตัวเลข > 12 ช่วยตัดสิน; ไม่งั้นเดา day-first)
  for (const m of text.matchAll(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/g)) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (a > 12 && b <= 12) push(y, b, a, m.index ?? 0);        // day-first
    else if (b > 12 && a <= 12) push(y, a, b, m.index ?? 0);   // month-first
    else push(y, b, a, m.index ?? 0);                          // เดา day-first
  }
  // English: Jul 1, 2026 / 1 July 2026
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) {
    const mo = EN_MONTH[m[1].toLowerCase().slice(0, m[1].toLowerCase().startsWith("sept") ? 4 : 3)];
    if (mo) push(+m[3], mo, +m[2], m.index ?? 0);
  }
  for (const m of text.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/g)) {
    const mo = EN_MONTH[m[2].toLowerCase().slice(0, m[2].toLowerCase().startsWith("sept") ? 4 : 3)];
    if (mo) push(+m[3], mo, +m[1], m.index ?? 0);
  }
  // Thai: 1 กรกฎาคม 2569 / 1 ก.ค. 2569 (ต้องรวมสระ/วรรณยุกต์ → ช่วง Thai เต็ม ฀-๿)
  for (const m of text.matchAll(/(\d{1,2})\s*([฀-๿.]{2,15})\s*(\d{4})/g)) {
    const name = m[2];
    const key = Object.keys(TH_MONTH).find((k) => name.startsWith(k));
    if (key) push(+m[3], TH_MONTH[key], +m[1], m.index ?? 0);
  }
  return out;
}

function findDate(text: string): string | null {
  const cands = collectDates(text);
  if (cands.length === 0) return null;
  // ให้คะแนน: อยู่ใกล้คำว่า "date/วันที่" (ภายใน 40 ตัวอักษรก่อนหน้า) = ดีกว่า
  let best: Cand | null = null, bestScore = -1;
  for (const c of cands) {
    const before = text.slice(Math.max(0, c.index - 40), c.index);
    const score = DATE_KW.test(before) ? 2 : 1;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best?.iso ?? cands[0].iso;
}

function detectCurrency(s: string): string | null {
  if (/฿|THB|บาท/i.test(s)) return "THB";
  if (/\$|USD/i.test(s)) return "USD";
  if (/€|EUR/i.test(s)) return "EUR";
  return null;
}

function findAmount(text: string): { amount: number | null; currency: string | null } {
  type A = { value: number; currency: string | null; nearTotal: boolean };
  const list: A[] = [];
  // ตัวเลขเงิน: มีสัญลักษณ์สกุลเงิน หรือ มีทศนิยม/คอมมา
  const re = /(฿|\$|€|USD|THB|EUR|บาท)?\s*([0-9][0-9,]*\.[0-9]{2}|[0-9]{1,3}(?:,[0-9]{3})+)\s*(฿|\$|€|USD|THB|EUR|บาท)?/gi;
  for (const m of text.matchAll(re)) {
    const num = parseFloat(m[2].replace(/,/g, ""));
    if (!isFinite(num) || num <= 0) continue;
    const ctx = text.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + m[0].length);
    const currency = detectCurrency(m[1] || m[3] || ctx);
    list.push({ value: num, currency, nearTotal: TOTAL_KW.test(ctx) });
  }
  if (list.length === 0) return { amount: null, currency: null };
  // เลือกตัวที่อยู่ใกล้คำว่า total; ในนั้นเอาค่ามากสุด; ถ้าไม่มีเลย เอาค่ามากสุดทั้งหมด
  const near = list.filter((a) => a.nearTotal);
  const pool = near.length ? near : list;
  const best = pool.reduce((mx, a) => (a.value > mx.value ? a : mx), pool[0]);
  return { amount: best.value, currency: best.currency };
}

export function parseInvoiceFields(raw: string): ParsedInvoice {
  const text = (raw || "").replace(/ /g, " ");
  const dateISO = findDate(text);
  const { amount, currency } = findAmount(text);
  return { amount, currency, dateISO, month: dateISO ? dateISO.slice(0, 7) : null };
}
