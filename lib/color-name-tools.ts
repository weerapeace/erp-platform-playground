/**
 * 🧹 ตัวช่วยจัดระเบียบ "ชื่อสี" ของ SKU (ทะเบียนสี · เจ้าของขอ 2026-11-11 ข้อ 1/2/4/5) — pure ไม่มี import ฝั่งหน้าจอ
 *   ① เลขท้ายชื่อ "Soft Rose (05)" / "ครีม 02" → ชื่อที่ตัดเลข (trailingNumberFix)
 *   ② ชื่อสะกดต่างกันนิดเดียว "เเทน"/"แทน" · "ฟ้า พาสเทล"/"ฟ้าพาสเทล" → กลุ่มชื่อคล้าย (similarGroups) + แก้คำสะกด (typoFix)
 *   ④ ชื่อสีเป็นรหัส SKU "WK21-02,WK18-02" (เซ็ตของขวัญ) → สีของชิ้นในเซ็ต (skuCodeColors)
 *   ⑤ ส่วนที่เป็นวัสดุ/ลายหนัง "ซาเฟียโน่" · "หนังเรียบ" · "Crocodile Print" (looksLikeMaterial) — แนะนำตั้งเป็น "ไม่ใช่สี"
 *   ทุกอย่างเป็น "คำแนะนำ" — การเปลี่ยนชื่อใน SKU จริงต้องพรีวิวแล้วให้เจ้าของกดยืนยันเอง (/api/color-swatches/skus)
 */


/** ① ตัดเลขท้ายชื่อ: "Soft Rose (05)" → "Soft Rose" · "ครีม 02" → "ครีม" · ไม่มีเลข/ตัดแล้วว่าง/เป็นไซส์ (10 รู) = null */
export function trailingNumberFix(name: string): string | null {
  const n = name.trim();
  const m = /^(.*\S)\s*\(\s*\d{1,3}\s*\)$/.exec(n) ?? /^(.*[^\d\s(])\s+\d{1,3}$/.exec(n);
  if (!m) return null;
  const base = m[1].trim();
  // "10 รู" · "2.5 cm" ไม่ใช่เลขท้ายชื่อสี · ฐานต้องมีตัวอักษร
  if (!/[A-Za-z฀-๿]/.test(base)) return null;
  return base;
}

/** ② แก้คำสะกดที่พิมพ์ผิดบ่อย: เ+เ → แ · ํ+า → ำ · ช่องว่างซ้อน — ไม่ต่าง = null */
export function typoFix(name: string): string | null {
  const fixed = name.replace(/เเ/g, "แ").replace(/ํา/g, "ำ").replace(/\s+/g, " ").trim();
  return fixed !== name.trim() ? fixed : null;
}

/** กุญแจเทียบ "ชื่อเดียวกัน" — ตัวเล็ก · ไม่สนช่องว่าง/จุด · แก้คำสะกด */
export function similarKey(name: string): string {
  return (typoFix(name) ?? name).toLowerCase().replace(/[\s.]+/g, "");
}

/** ระยะห่างแบบแก้ทีละตัวอักษร (Levenshtein) — หยุดเร็วเมื่อเกิน max */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export interface NameCount { name: string; skus: number }
export interface SimilarGroup {
  /** ชื่อที่แนะนำให้ใช้ (SKU มากสุด · เท่ากัน = ไม่มีคำผิด) */
  main: string;
  members: NameCount[];
  /** exact = ต่างแค่ช่องว่าง/คำสะกด · near = ต่างกัน 1 ตัวอักษร (ต้องดูเองก่อนรวม) */
  kind: "exact" | "near";
}

/**
 * ② จับกลุ่มชื่อคล้ายกัน (ภาษาเดียวกัน) — ชื่อคนละภาษา (ดำ/Black) ไม่รวม เพราะทะเบียนจับคู่จุดสีให้แล้ว และบางร้านตั้งใจใช้ชื่ออังกฤษ
 * near: ชื่อยาว ≥ 5 ตัว ต่างกัน 1 ตัวอักษร (โรสโกล/โรสโกลด์) · ไม่จับคู่ชื่อที่ต่างแค่เลขท้าย (นั่นคือข้อ ①)
 */
export function similarGroups(list: NameCount[]): SimilarGroup[] {
  const items = list.filter((x) => x.name.trim());
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const keys = items.map((x) => similarKey(x.name));
  const thai = items.map((x) => /[฀-๿]/.test(x.name));
  const byKey = new Map<string, number>();
  const exactPair = new Set<string>();
  keys.forEach((k, i) => {
    const j = byKey.get(k);
    if (j === undefined) byKey.set(k, i);
    else { join(j, i); exactPair.add(`${find(i)}`); }
  });
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (keys[i] === keys[j] || thai[i] !== thai[j]) continue;
      if (Math.min(keys[i].length, keys[j].length) < 5) continue;
      if (/\d/.test(keys[i]) || /\d/.test(keys[j])) continue;
      if (editDistance(keys[i], keys[j], 1) <= 1) join(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  items.forEach((_, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(i); });
  const out: SimilarGroup[] = [];
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const members = idx.map((i) => items[i]).sort((a, b) => b.skus - a.skus || Number(!!typoFix(a.name)) - Number(!!typoFix(b.name)));
    const ks = new Set(idx.map((i) => keys[i]));
    const main = typoFix(members[0].name) ? members.find((m) => !typoFix(m.name))?.name ?? typoFix(members[0].name)! : members[0].name;
    out.push({ main, members, kind: ks.size === 1 ? "exact" : "near" });
  }
  return out.sort((a, b) => b.members.reduce((s, m) => s + m.skus, 0) - a.members.reduce((s, m) => s + m.skus, 0));
}

/** ④ รหัส SKU ในชื่อสี (เช่น "WK21-02,WK18-02") — ไม่ใช่รูปแบบนี้ = [] */
const SKU_CODE_RE = /^[A-Za-z]{1,6}\d{1,4}[A-Za-z]?-\d{1,3}[A-Za-z]?$/;
export function skuCodesIn(name: string): string[] {
  // รหัสมีขีดอยู่ในตัว (WK21-02) → แยกรายการด้วย , + & / เท่านั้น
  const parts = name.split(/\s*[,+&/]\s*/).map((p) => p.trim()).filter(Boolean);
  return parts.length && parts.every((p) => SKU_CODE_RE.test(p)) ? parts.map((p) => p.toUpperCase()) : [];
}

/**
 * ④ แปลงรหัสชิ้นในเซ็ตเป็นชื่อสี — colorOf = รหัส SKU (ตัวใหญ่) → ชื่อสีของ SKU นั้น
 * suggestion = "น้ำตาล-เขียว" (ขีดคั่นแบบชื่อผสมเดิม) · มีรหัสที่หาไม่เจอ = suggestion null + missing
 */
export function skuCodeColors(name: string, colorOf: Map<string, string>): { codes: { code: string; color: string | null }[]; suggestion: string | null; missing: string[] } | null {
  const codes = skuCodesIn(name);
  if (!codes.length) return null;
  const rows = codes.map((code) => ({ code, color: colorOf.get(code)?.trim() || null }));
  const missing = rows.filter((r) => !r.color).map((r) => r.code);
  return { codes: rows, suggestion: missing.length ? null : rows.map((r) => r.color!).join("-"), missing };
}

/** ⑤ ส่วนของชื่อที่เป็นวัสดุ/ลายหนัง (ไม่ใช่สี) — ใช้แนะนำเท่านั้น */
const MATERIAL_RE = /^(หนัง\S*|ลาย\S+|ซาเฟียโน่|ซาฟิอาโน่|saffiano|smooth leather|crocodile( print| embossed( leather)?)?|croc( print)?|python( print)?|ostrich( print)?|pu|pu leather|patent( leather)?|nubuck|suede|canvas|nylon|ผ้า\S*|กลิตเตอร์|glitter)$/i;
export function looksLikeMaterial(part: string): boolean {
  return MATERIAL_RE.test(part.trim().replace(/\s+/g, " "));
}

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * 🔁 ค่าช่องสีของ SKU หลังเปลี่ยนชื่อ (ใช้ใน /api/color-swatches/skus)
 *   ตรงกับ from ทั้งช่อง → to · from + "/ ไซส์ของ SKU" (ข้อมูลเก่า เช่น "แดง/ซาเฟียโน่ / S") → to + ท้ายเดิม · ไม่ตรง = null (ไม่แตะช่องนี้)
 */
export function renamedField(value: string | null | undefined, from: string, to: string, variant = ""): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (normName(v) === normName(from)) return to;
  if (variant) {
    const m = new RegExp(`^(.*?)(\\s*/\\s*${variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})$`, "i").exec(v);
    if (m && normName(m[1]) === normName(from)) return to + m[2];
  }
  return null;
}
