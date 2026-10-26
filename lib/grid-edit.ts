/**
 * ▦ ตัวช่วยตารางแก้ไขหลายแถว (ของกลาง · pure) — ใช้ที่ components/website-listings-grid-edit
 *   - parseClipboardGrid: ข้อความที่ก๊อปจาก Excel/Google Sheets → ตาราง (แถว × คอลัมน์)
 *   - coerceCell: ข้อความที่วาง → ค่าของช่องตามชนิด (ไม่เข้าใจ = undefined → ข้ามช่องนั้น)
 *   - sameCell: เทียบค่าเดิม/ใหม่ (null / "" / undefined = ว่างเหมือนกัน)
 *   - erpWriteValue: ค่าในตาราง → ค่าที่ส่งให้ PATCH /api/master-v2 ตามชนิดช่องในทะเบียน
 */

export type GridKind =
  | "text"
  | "textarea"
  | "number"
  | "money"
  | "bool"
  | "select"
  | "date"
  | "relation"
  | "categories"
  | "badge"
  | "stock"
  | "sizeGuide"
  | "codes";

export type GridValue = string | boolean | string[] | null;

/** แยกข้อความที่ก๊อปมาเป็นตาราง — แถวตามบรรทัด · คอลัมน์ตาม Tab · ช่องในเครื่องหมายคำพูด (มีขึ้นบรรทัดใหม่ข้างใน) รองรับ */
export function parseClipboardGrid(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const t = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const YES = /^(1|true|yes|y|x|✓|✔|ใช่|เปิด|on|ขึ้นเว็บ)$/i;
const NO = /^(0|false|no|n|ไม่|ไม่ใช่|ปิด|off|ซ่อน|)$/i;

/** ข้อความที่วาง → ค่าของช่อง (undefined = ใช้ไม่ได้ ข้ามช่องนี้) · choices = ตัวเลือก (ค่า → ป้าย) ของ select/สต๊อก/หมวด */
export function coerceCell(kind: GridKind, raw: string, choices?: { value: string; label: string }[]): GridValue | undefined {
  const v = raw.trim();
  const pick = (x: string) => {
    const lx = x.trim().toLowerCase();
    return choices?.find((c) => c.value.toLowerCase() === lx || c.label.toLowerCase() === lx)?.value;
  };
  switch (kind) {
    case "bool":
      return YES.test(v) ? true : NO.test(v) ? false : undefined;
    case "number":
    case "money": {
      if (v === "") return "";
      const n = Number(v.replace(/[,฿\s]/g, ""));
      return Number.isFinite(n) ? String(n) : undefined;
    }
    case "date": {
      if (v === "") return "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
      if (!m) return undefined;
      let y = Number(m[3]);
      if (y > 2400) y -= 543; // ปี พ.ศ.
      return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    case "select":
    case "stock":
    case "sizeGuide":
    case "badge":
      if (v === "") return "";
      return choices ? pick(v) : v;
    case "categories": {
      if (v === "") return [];
      const keys = v.split(/[,،;|]/).map(pick).filter((k): k is string => !!k);
      return keys.length ? [...new Set(keys)] : undefined;
    }
    case "relation":
      return undefined; // ต้องเลือกจากรายการ (วางรหัส/ชื่อไม่ได้)
    default:
      return raw;
  }
}

const norm = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return JSON.stringify(v);
  return String(v);
};
export const sameCell = (a: unknown, b: unknown) => norm(a) === norm(b);

/** ค่าในตาราง → ค่าที่ส่งให้ master-v2 PATCH (ว่าง = null · ตัวเลข = number) · คืน { error } เมื่อค่าใช้ไม่ได้ */
export function erpWriteValue(kind: GridKind, v: GridValue): { value: unknown } | { error: string } {
  if (kind === "bool") return { value: v === true };
  const s = v == null ? "" : Array.isArray(v) ? v.join(",") : String(v).trim();
  if (kind === "number" || kind === "money") {
    if (s === "") return { value: null };
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) ? { value: n } : { error: "ต้องเป็นตัวเลข" };
  }
  if (kind === "text" || kind === "textarea" || kind === "codes") return { value: s === "" ? null : String(v) };
  return { value: s === "" ? null : s };
}
