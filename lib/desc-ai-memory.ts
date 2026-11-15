/**
 * 🧠 ความจำ AI ของ "จุดเด่นสินค้า" (ป๊อปแทรก Description ขั้นจุดเด่น) — ของกลาง pure (ใช้ทั้ง API · หน้าจอ · เทสต์)
 *   เจ้าของสั่ง 2026-11-15: ไม่ชอบข้อไหน = AI ไม่เขียนแบบนี้อีก · ชอบ (ดาว) = ถ้าเหมาะกับสินค้าให้ใส่ · แก้ความจำได้
 *
 *   ที่เก็บ = ui_config key DESC_AI_MEMORY_KEY (ไม่มีตารางใหม่):
 *     { [scope]: { liked: Entry[], disliked: Entry[], rules: Entry[] } }   scope = brand_id ของสินค้า หรือ "*" = ทุกแบรนด์
 *   liked    = ข้อความที่ชอบ — AI ใส่เมื่อเหมาะกับรูป/ข้อมูล (ไม่ใส่ทุกครั้ง)
 *   disliked = ข้อความที่ไม่ชอบ — บอก AI ล่วงหน้า + กรองทิ้งอีกรอบหลัง AI ตอบ (similarText)
 *   rules    = กฎที่พิมพ์เอง เช่น "ห้ามใช้คำว่า ดีที่สุด"
 *   ชอบ ↔ ไม่ชอบ ข้อความเดียวกันอยู่ได้ที่เดียว (กดอีกฝั่ง = ย้าย)
 * API = /api/ai/desc-memory · ใช้ใน /api/ai/desc-highlights
 */

export const DESC_AI_MEMORY_KEY = "desc_ai_memory";
export const ALL_SCOPE = "*";
export const MEMORY_LISTS = ["liked", "disliked", "rules"] as const;
export type MemoryList = (typeof MEMORY_LISTS)[number];
export type MemoryEntry = { text: string; by?: string | null; by_name?: string | null; at?: string | null };
export type MemoryBucket = Record<MemoryList, MemoryEntry[]>;
export type MemoryStore = Record<string, MemoryBucket>;

const MAX_PER_LIST = 200;
const MAX_TEXT = 200;
const SCOPE_RE = /^(\*|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export const emptyBucket = (): MemoryBucket => ({ liked: [], disliked: [], rules: [] });
export const cleanText = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").replace(/^[-•·\s]+/, "").trim().slice(0, MAX_TEXT);
/** กุญแจเทียบข้อความ (ไม่สนช่องว่าง/เครื่องหมาย/ตัวพิมพ์) */
export const textKey = (v: unknown): string => cleanText(v).toLowerCase().replace(/[\s.,!?'"“”‘’()\-–—:;·•*]/g, "");

/** ค่าจาก DB → ถูกรูปเสมอ (scope ที่ไม่ใช่ uuid/"*" = ทิ้ง · ข้อความว่าง/ซ้ำ = ทิ้ง) */
export function normalizeMemory(raw: unknown): MemoryStore {
  const out: MemoryStore = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [scope, b] of Object.entries(raw as Record<string, unknown>)) {
    if (!SCOPE_RE.test(scope) || !b || typeof b !== "object") continue;
    const bucket = emptyBucket();
    for (const list of MEMORY_LISTS) {
      const arr = (b as Record<string, unknown>)[list];
      if (!Array.isArray(arr)) continue;
      const seen = new Set<string>();
      for (const x of arr) {
        const e = (typeof x === "string" ? { text: x } : x && typeof x === "object" ? x : null) as Record<string, unknown> | null;
        const text = cleanText(e?.text);
        const k = textKey(text);
        if (!text || !k || seen.has(k)) continue;
        seen.add(k);
        bucket[list].push({ text, by: typeof e?.by === "string" ? e.by : null, by_name: typeof e?.by_name === "string" ? e.by_name.slice(0, 80) : null, at: typeof e?.at === "string" ? e.at : null });
        if (bucket[list].length >= MAX_PER_LIST) break;
      }
    }
    if (MEMORY_LISTS.some((l) => bucket[l].length)) out[scope.toLowerCase() === ALL_SCOPE ? ALL_SCOPE : scope.toLowerCase()] = bucket;
  }
  return out;
}

/** ความจำที่ใช้กับสินค้าแบรนด์นี้ = ของแบรนด์ + ของทุกแบรนด์ (ติดป้าย scope ไว้ให้หน้าจอรู้ว่ามาจากไหน) */
export function memoryFor(store: MemoryStore, brandId: string | null | undefined): Record<MemoryList, (MemoryEntry & { scope: string })[]> {
  const out = { liked: [], disliked: [], rules: [] } as Record<MemoryList, (MemoryEntry & { scope: string })[]>;
  const scopes = [brandId ? brandId.toLowerCase() : null, ALL_SCOPE].filter((x): x is string => !!x);
  for (const sc of scopes) {
    const b = store[sc];
    if (!b) continue;
    for (const l of MEMORY_LISTS) for (const e of b[l]) if (!out[l].some((x) => textKey(x.text) === textKey(e.text))) out[l].push({ ...e, scope: sc });
  }
  return out;
}

/** เพิ่มข้อความเข้ารายการ (ซ้ำ = ไม่เพิ่ม) · ชอบ/ไม่ชอบ = เอาออกจากอีกฝั่งในขอบเขตเดียวกัน · คืน store ใหม่ */
export function addMemory(store: MemoryStore, scope: string, list: MemoryList, entry: MemoryEntry): MemoryStore {
  const text = cleanText(entry.text);
  if (!text || !SCOPE_RE.test(scope)) return store;
  const sc = scope === ALL_SCOPE ? ALL_SCOPE : scope.toLowerCase();
  const next: MemoryStore = { ...store, [sc]: { ...(store[sc] ?? emptyBucket()) } };
  const b = next[sc];
  const k = textKey(text);
  if (list === "liked") b.disliked = b.disliked.filter((e) => textKey(e.text) !== k);
  if (list === "disliked") b.liked = b.liked.filter((e) => textKey(e.text) !== k);
  if (!b[list].some((e) => textKey(e.text) === k)) b[list] = [...b[list], { ...entry, text }].slice(-MAX_PER_LIST);
  return next;
}

/** เอาข้อความออกจากรายการ · คืน { store, removed } (removed = รายการที่ถูกเอาออก ใช้เช็กสิทธิ์ "ลบของตัวเอง") */
export function removeMemory(store: MemoryStore, scope: string, list: MemoryList, text: string): { store: MemoryStore; removed: MemoryEntry | null } {
  const sc = scope === ALL_SCOPE ? ALL_SCOPE : scope.toLowerCase();
  const b = store[sc];
  const k = textKey(text);
  const hit = b?.[list].find((e) => textKey(e.text) === k) ?? null;
  if (!b || !hit) return { store, removed: null };
  return { store: { ...store, [sc]: { ...b, [list]: b[list].filter((e) => e !== hit) } }, removed: hit };
}

/** ชุดตัวอักษรคู่ (bigram) ของข้อความ — ใช้เทียบความคล้าย (ภาษาไทยไม่มีเว้นวรรคระหว่างคำ) */
function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}
/**
 * ความคล้ายของ 2 ข้อความ 0–1 (Dice ของ bigram หลังตัดช่องว่าง/เครื่องหมาย) · ข้อความหนึ่งอยู่ในอีกข้อความ (≥ 6 ตัว) = 1
 * ใช้กรองข้อที่ "ไม่ชอบ" / ซ้ำกับที่เลือกไว้แล้ว หลัง AI ตอบ
 */
export function similarity(a: unknown, b: unknown): number {
  const x = textKey(a), y = textKey(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  if (s.length >= 6 && l.includes(s)) return 1;
  const A = bigrams(x), B = bigrams(y);
  let inter = 0, total = 0;
  for (const [g, n] of A) { inter += Math.min(n, B.get(g) ?? 0); total += n; }
  for (const n of B.values()) total += n;
  return total ? (2 * inter) / total : 0;
}
export const SIMILAR_AT = 0.72;
export const isSimilar = (a: unknown, b: unknown) => similarity(a, b) >= SIMILAR_AT;

/** ตัวเลขขนาด/น้ำหนักในข้อความ (AI ห้ามเขียน — เจ้าของสั่งตั้งแต่ 2026-07: ผิดแล้วกระทบค่าส่ง) */
export const hasMeasurement = (v: unknown): boolean => /\d+(?:[.,]\d+)?\s*(?:ซม|เซน|cm\b|มม|mm\b|ม\.|นิ้ว|inch|in\b|"|กรัม|กก|kg\b|g\b|ลิตร|ml\b|l\b)/i.test(String(v ?? ""));
