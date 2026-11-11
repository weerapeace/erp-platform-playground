/**
 * แยก "ชื่อบริษัท" กับ "สาขา" ออกจากชื่อคู่ค้าที่พิมพ์รวมกันมา (ไฟล์ pure ไม่แตะฐานข้อมูล)
 *
 * ทำไมต้องมี: ทะเบียนคู่ค้าเก็บแต่ละสาขาเป็นคนละราย และพิมพ์ชื่อรวมสาขาไว้ในช่องเดียว เช่น
 *   "บริษัท ตัวอย่าง จำกัด ( สาขา 1 ) สาขาที่ 00001" · "บริษัท ตัวอย่าง จำกัด สำนักงานใหญ่"
 *   → เวลาโชว์หลายสาขาพร้อมกัน (เช่น ลูกค้าประจำแบรนด์) อยากจัดกลุ่มตามบริษัท แล้วโชว์แค่ "สาขา 1"
 *
 * ต่างจาก customerRoot (lib/so-bill-match) ที่ทำ "คีย์ไว้เทียบ" (ตัวพิมพ์เล็ก ไม่สนหน้าตา) —
 * ตัวนี้ทำ "ข้อความไว้โชว์" ให้คนอ่าน
 * ใช้ที่: หน้าแบรนด์ (ลูกค้าประจำแบรนด์ กางดูทั้งหมดแล้วจัดกลุ่มตามบริษัท)
 */

export type CompanyBranch = {
  /** ชื่อบริษัท (ตัดส่วนสาขาออกแล้ว) */
  company: string;
  /** ชื่อสาขาแบบสั้น เช่น "สาขา 1" · "สำนักงานใหญ่" · ว่าง = ไม่ได้ระบุสาขา */
  branch: string;
};

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** แยกชื่อเต็มเป็น บริษัท + สาขา · หาจุดตัดไม่เจอ = ทั้งชื่อเป็นบริษัท สาขาว่าง */
export function splitCompanyBranch(raw: string | null | undefined): CompanyBranch {
  const s = squash(String(raw ?? ""));
  // จุดตัด = คำว่า "สาขา…" หรือ "สำนักงานใหญ่" ที่ตามหลังช่องว่างหรือวงเล็บ (ไม่ใช่ต้นชื่อ)
  const m = /[\s(](สาขา|สำนักงานใหญ่)/u.exec(s);
  if (!m || m.index <= 0) return { company: s, branch: "" };
  const company = s.slice(0, m.index).replace(/[\s(]+$/u, "").trim();
  if (!company) return { company: s, branch: "" };
  return { company, branch: cleanBranch(s.slice(m.index)) };
}

/** ทำชื่อสาขาให้สั้น: ตัดวงเล็บ · ตัด "สาขาที่ 00001" ที่ซ้ำกับชื่อสาขา (ถ้ามีแค่เลขสาขา ก็เก็บไว้) */
export function cleanBranch(raw: string): string {
  const b = squash(raw.replace(/[()]/g, " "));
  const withoutNo = squash(b.replace(/สาขาที่\s*\d+/gu, ""));
  return withoutNo || b;
}

/** ลำดับสาขา: สำนักงานใหญ่ก่อน → สาขาเลขน้อยไปมาก → ชื่อสาขาอื่น ๆ ตามตัวอักษร */
export function compareBranch(a: string, b: string): number {
  const rank = (x: string): [number, number, string] => {
    if (!x || /สำนักงานใหญ่/u.test(x)) return [0, 0, x];
    const n = /สาขา(?:ที่)?\s*(\d+)/u.exec(x);
    return n ? [1, Number(n[1]), x] : [2, 0, x];
  };
  const [ra, na, ta] = rank(a);
  const [rb, nb, tb] = rank(b);
  return ra - rb || na - nb || ta.localeCompare(tb, "th");
}

export type CompanyGroup<T> = { company: string; items: { item: T; branch: string }[] };

/** จัดกลุ่มตามบริษัท — กลุ่มเรียงตามที่เจอก่อน (คงลำดับที่ผู้ใช้ตั้ง) · ในกลุ่มเรียงตามสาขา */
export function groupByCompany<T>(items: T[], nameOf: (t: T) => string | null | undefined): CompanyGroup<T>[] {
  const groups = new Map<string, CompanyGroup<T>>();
  for (const item of items) {
    const { company, branch } = splitCompanyBranch(nameOf(item));
    const key = company.toLowerCase();
    let g = groups.get(key);
    if (!g) { g = { company, items: [] }; groups.set(key, g); }
    g.items.push({ item, branch });
  }
  const out = [...groups.values()];
  for (const g of out) g.items.sort((x, y) => compareBranch(x.branch, y.branch));
  return out;
}
