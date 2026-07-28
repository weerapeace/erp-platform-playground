/**
 * จับคู่ "ชื่อร้าน" กับทะเบียนร้าน (partners_v2) — ของกลาง
 *
 * ปัญหาที่แก้: เอกสารจัดซื้อเก็บร้านเป็น "ตัวหนังสือ" (purchase_orders_v2.seller_name)
 * ไม่ได้ผูก id ร้าน → ถ้าพิมพ์สลับคำ/เว้นวรรคต่าง/มีวงเล็บ ระบบจะจับคู่ไม่ติด
 * เช่น บนใบเขียน "B131 ร้านโซ่" แต่ในทะเบียนชื่อ "ร้านโซ่ B131" → เดิมหาไม่เจอ
 *
 * กติกาการจับคู่ (ปลอดภัยก่อน — ไม่เดา):
 *   1. ชื่อตรงเป๊ะ
 *   2. ชื่อตรงหลังตัดวรรค/เครื่องหมาย  ("ร้าน โซ่" = "ร้านโซ่")
 *   3. ชื่อตรงเมื่อเรียงคำใหม่          ("B131 ร้านโซ่" = "ร้านโซ่ B131")
 * ถ้ายังไม่ตรง = ไม่จับคู่ (ไม่เดาแบบใกล้เคียง เพราะผูกร้านผิดอันตรายกว่าไม่ผูก)
 *
 * ส่วน "ใกล้เคียง" (shopNameSimilarity / findDuplicateShops) ใช้เฉพาะงานเตือนร้านซ้ำ
 * ซึ่งคนเป็นคนตัดสินใจอีกที ไม่ได้เอาไปผูกข้อมูลอัตโนมัติ
 */

export type PartnerLike = {
  id: string;
  display_name?: string | null;
  name_th?: string | null;
  name_en?: string | null;
  is_supplier?: boolean | null;
  is_active?: boolean | null;
};

/** เครื่องหมายที่ไม่ถือเป็นส่วนของชื่อร้าน (รวมวงเล็บเต็มความกว้าง + จุดไข่ปลาจีน) */
const PUNCT = /[[\](){}.,;:!?_/|*#&+=<>~`'"\\（）【】「」·、。–—-]+/g;

/** ชื่อร้านแบบมาตรฐาน: ตัวพิมพ์เล็ก + เครื่องหมายกลายเป็นช่องว่าง + ยุบช่องว่างซ้ำ */
export function normShopName(raw: string | null | undefined): string {
  return String(raw ?? "").toLowerCase().replace(PUNCT, " ").replace(/\s+/g, " ").trim();
}

/** ชื่อร้านแบบไม่มีช่องว่างเลย — กันเคสพิมพ์เว้นวรรคไม่เหมือนกัน */
export function compactShopName(raw: string | null | undefined): string {
  return normShopName(raw).replace(/\s+/g, "");
}

/** คีย์แบบเรียงคำ — กันเคสพิมพ์สลับคำ ("B131 ร้านโซ่" ↔ "ร้านโซ่ B131") */
export function shopTokenKey(raw: string | null | undefined): string {
  const parts = normShopName(raw).split(" ").filter(Boolean);
  return parts.length ? [...parts].sort().join("|") : "";
}

/** ชื่อทั้งหมดที่ใช้เรียกร้านนี้ได้ (ชื่อไทย/ชื่อแสดง/ชื่ออังกฤษ) */
function namesOf(p: PartnerLike): string[] {
  return [p.display_name, p.name_th, p.name_en].map((s) => String(s ?? "").trim()).filter(Boolean);
}

export type PartnerMatcher<T extends PartnerLike> = {
  /** หาร้านจากชื่อบนเอกสาร — ไม่เจอคืน undefined */
  match(name: string | null | undefined): T | undefined;
  /** จำนวนร้านในทะเบียนที่ใช้จับคู่ */
  size: number;
};

/**
 * สร้างตัวจับคู่ร้านจากรายชื่อร้านทั้งทะเบียน
 * ร้านที่ติ๊ก "เป็นผู้จำหน่าย" จะชนะเมื่อชื่อชนกัน (เรียงให้เองในนี้ ไม่ต้องพึ่งลำดับจาก query)
 */
export function buildPartnerMatcher<T extends PartnerLike>(partners: readonly T[]): PartnerMatcher<T> {
  const exact = new Map<string, T>();
  const compact = new Map<string, T>();
  const token = new Map<string, T>();
  // ร้านที่ติ๊กผู้จำหน่าย + ยังเปิดใช้ ใส่ก่อน → ชนะเมื่อชื่อซ้ำ (first wins)
  const rank = (p: T) => (p.is_supplier === true ? 0 : 1) + (p.is_active === false ? 2 : 0);
  const sorted = [...partners].sort((a, b) => rank(a) - rank(b));
  for (const p of sorted) {
    for (const nm of namesOf(p)) {
      if (!exact.has(nm)) exact.set(nm, p);
      const c = compactShopName(nm);
      if (c && !compact.has(c)) compact.set(c, p);
      const t = shopTokenKey(nm);
      if (t && !token.has(t)) token.set(t, p);
    }
  }
  return {
    size: partners.length,
    match(name) {
      const raw = String(name ?? "").trim();
      if (!raw) return undefined;
      return exact.get(raw) ?? compact.get(compactShopName(raw)) ?? token.get(shopTokenKey(raw));
    },
  };
}

/** ระยะห่างของข้อความแบบ Levenshtein (ใช้ในคะแนนความคล้าย) */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * คะแนนความคล้ายของชื่อร้าน 0..1 (1 = ถือว่าร้านเดียวกัน)
 * ใช้เตือน "ร้านนี้อาจซ้ำกับร้านเดิม" — ไม่ใช้ผูกข้อมูลอัตโนมัติ
 */
export function shopNameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ca = compactShopName(a), cb = compactShopName(b);
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;
  if (shopTokenKey(a) === shopTokenKey(b)) return 1;             // แค่สลับคำ = ร้านเดียวกัน
  const [short, long] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
  // ชื่อหนึ่งอยู่ในอีกชื่อ ("ติง" ⊂ "kติง", "ร้านด้าย" ⊂ "ร้านด้ายเมืองจีน")
  // ชื่อสั้นมาก (1-2 ตัว) ไม่นับ เพราะบังเอิญตรงกันได้ง่าย
  if (short.length >= 3 && long.includes(short)) return Math.max(0.85, short.length / long.length);
  const dist = editDistance(ca, cb);
  return Math.max(0, 1 - dist / Math.max(ca.length, cb.length));
}

export type DuplicateGroup<T extends PartnerLike> = {
  /** คะแนนสูงสุดในกลุ่ม */
  score: number;
  members: T[];
};

/**
 * สแกนหาร้านที่น่าจะซ้ำกันทั้งทะเบียน
 * จับกลุ่มแบบ "ต่อกันเป็นสาย" (A คล้าย B, B คล้าย C → อยู่กลุ่มเดียวกัน)
 */
export function findDuplicateShops<T extends PartnerLike>(
  partners: readonly T[],
  minScore = 0.82,
): DuplicateGroup<T>[] {
  const list = partners.filter((p) => namesOf(p).length > 0);
  const parent = list.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const best = new Map<number, number>();

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      let score = 0;
      for (const na of namesOf(list[i])) {
        for (const nb of namesOf(list[j])) score = Math.max(score, shopNameSimilarity(na, nb));
      }
      if (score < minScore) continue;
      const ra = find(i), rb = find(j);
      if (ra !== rb) parent[rb] = ra;
      const root = find(i);
      best.set(root, Math.max(best.get(root) ?? 0, score));
    }
  }

  const groups = new Map<number, T[]>();
  for (let i = 0; i < list.length; i++) {
    const root = find(i);
    if (!best.has(root)) continue;                                // ไม่มีคู่คล้าย = ไม่ต้องรายงาน
    const arr = groups.get(root) ?? [];
    arr.push(list[i]);
    groups.set(root, arr);
  }
  return [...groups.entries()]
    .map(([root, members]) => ({ score: best.get(root) ?? 0, members }))
    .filter((g) => g.members.length > 1)
    .sort((a, b) => b.score - a.score);
}
