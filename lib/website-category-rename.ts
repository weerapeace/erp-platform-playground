/**
 * ✏️ เปลี่ยนรหัสหมวด (ลิงก์หน้าหมวด /c/<รหัส>) — กติกา pure ใช้ที่ /api/website/category-rename
 *
 * รหัสหมวดถูกอ้างถึงหลายที่ — เปลี่ยนแล้วต้องตามแก้ทุกที่ในครั้งเดียว ไม่งั้นเมนู/Section ชี้ไปหมวดที่ไม่มีแล้ว:
 *   field_map (รายการหมวด · แม่ของหมวดย่อย · กฎจับคู่หมวด ERP/แท็ก · หมวดตั้งต้น) → renameKeyInFieldMap
 *   สินค้า (store_listings.web_categories / web_category) → renameKeyInList
 *   ธีม/เมนู/Section/หน้าเว็บ/โปร (JSON) → renameCategoryRefs: ลิงก์ /c/<รหัส> (+ ?also=) · ช่อง category/also ·
 *     เมนู kind "category" · รายการ cats/tabCats/categories · รูป/ชื่อแทนรายหมวด catImg/catName (รหัสเป็นชื่อช่อง)
 *   ลิงก์เก่าที่ลูกค้า/Google จำไว้ → withCategoryRedirect เพิ่ม "/c/<เก่า> -> /c/<ใหม่>" ในย้ายลิงก์เก่า
 */
import { cleanCategoryKey } from "@/lib/website-field-map";
import { cleanRedirects } from "@/lib/website-site-info";

/** ช่องที่ค่าเป็นรหัสหมวดตัวเดียว */
const VALUE_KEYS = new Set(["category", "also"]);
/** ช่องที่เป็นรายการรหัสหมวด */
const LIST_KEYS = new Set(["cats", "tabCats", "categories"]);
/** ช่องที่ชื่อข้างในเป็นรหัสหมวด (ค่า = รูป/ชื่อแทนของหมวดนั้น) */
const MAP_KEYS = new Set(["catImg", "catName"]);

/** ปัญหาของรหัสใหม่ (null = ใช้ได้) */
export function renameProblem(cats: { key: string }[], from: string, toRaw: string): string | null {
  const to = cleanCategoryKey(toRaw);
  if (!cats.some((c) => c.key === from)) return "ไม่พบหมวดนี้ — ลองโหลดหน้าใหม่";
  if (!to) return "ตั้งรหัสใหม่ (ภาษาอังกฤษตัวเล็ก ตัวเลข ขีดกลาง)";
  if (to === from) return "รหัสเหมือนเดิม";
  if (cats.some((c) => c.key === to)) return "รหัสนี้มีหมวดอื่นใช้อยู่ — ตั้งใหม่ (หรือเปลี่ยนหมวดนั้นก่อน)";
  return null;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** แก้ลิงก์หน้าหมวดในข้อความ: /c/<เก่า> · /en/c/<เก่า> · /shop?cat=<เก่า> · ?also=<เก่า> (ลิงก์เว็บอื่นแบบ https://… ไม่แตะ) */
export function rewriteCategoryLinks(s: string, from: string, to: string): { value: string; hits: number } {
  if (!s.includes(from)) return { value: s, hits: 0 };
  let hits = 0;
  const f = esc(from);
  const end = `(?=$|[?#/&"'\\s)<])`;
  const count = (_m: string, ...g: string[]) => {
    hits++;
    return `${g[0]}${g[1]}${to}`;
  };
  let v = s.replace(new RegExp(`(^|["'(\\s=])((?:/en)?/c/)${f}${end}`, "g"), count);
  v = v.replace(new RegExp(`(^|["'(\\s=])(/shop\\?(?:[^"'\\s#]*&)?cat=)${f}(?=$|[&#"'\\s)<])`, "g"), count);
  // ?also= อยู่ได้เฉพาะลิงก์หน้าหมวด
  if (v.includes("/c/")) v = v.replace(new RegExp(`(/c/[a-z0-9-]+\\?(?:[^"'\\s#]*?&(?:amp;)?)?)(also=)${f}(?=$|[&#"'\\s)<])`, "g"), count);
  return { value: v, hits };
}

/** แทนรหัสในรายการ (ไม่ซ้ำ · ลำดับเดิม) */
export function renameKeyInList<T extends string[] | null | undefined>(list: T, from: string, to: string): T {
  if (!Array.isArray(list) || !list.includes(from)) return list;
  return [...new Set(list.map((k) => (k === from ? to : k)))] as T;
}

/** ไล่แก้รหัสหมวดใน JSON ทั้งก้อน (ธีม/เลย์เอาต์/โปร ฯลฯ) → ค่าใหม่ + จำนวนจุดที่แก้ (0 = ไม่ต้องบันทึก) */
export function renameCategoryRefs<T>(value: T, from: string, to: string): { value: T; hits: number } {
  let hits = 0;
  const walk = (v: unknown, key: string | null): unknown => {
    if (typeof v === "string") {
      const r = rewriteCategoryLinks(v, from, to);
      hits += r.hits;
      return r.value;
    }
    if (Array.isArray(v)) {
      if (key && LIST_KEYS.has(key) && v.includes(from)) {
        hits++;
        return [...new Set(v.map((x) => (x === from ? to : x)))];
      }
      return v.map((x) => walk(x, null));
    }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      const isMap = key !== null && MAP_KEYS.has(key);
      for (const [k, x] of Object.entries(o)) {
        if (isMap && k === from) {
          hits++;
          if (!(to in o)) out[to] = x;
          continue;
        }
        if (x === from && (VALUE_KEYS.has(k) || (k === "value" && o.kind === "category"))) {
          hits++;
          out[k] = to;
          continue;
        }
        out[k] = walk(x, k);
      }
      return out;
    }
    return v;
  };
  const next = walk(value, null) as T;
  return { value: hits ? next : value, hits };
}

/** field_map ของร้าน: รหัสหมวด · แม่ของหมวดย่อย · กฎจับคู่หมวด ERP/แท็ก · หมวดตั้งต้น (ช่องอื่นคงเดิม) */
export function renameKeyInFieldMap(raw: Record<string, unknown>, cats: { key: string; parent?: string | null }[], from: string, to: string): Record<string, unknown> {
  const list = (Array.isArray(raw.categories) ? raw.categories : cats) as Record<string, unknown>[];
  const categories = list.map((c) => {
    if (!c || typeof c !== "object") return c;
    const n = { ...c };
    if (n.key === from) n.key = to;
    if (n.parent === from) n.parent = to;
    return n;
  });
  const cat = (raw.category && typeof raw.category === "object" ? raw.category : {}) as Record<string, unknown>;
  const swapValues = (m: unknown) =>
    m && typeof m === "object" && !Array.isArray(m) ? Object.fromEntries(Object.entries(m as Record<string, unknown>).map(([k, v]) => [k, v === from ? to : v])) : m;
  const category = { ...cat, rules: swapValues(cat.rules), tagRules: swapValues(cat.tagRules), ...(cat.default === from ? { default: to } : {}) };
  return { ...raw, categories, category };
}

/**
 * ย้ายลิงก์เก่า: เพิ่ม "/c/<เก่า> -> /c/<ใหม่>" · บรรทัดเดิมที่ชี้ไป /c/<เก่า> → ชี้ /c/<ใหม่> (ไม่ต่อทอด)
 * · บรรทัดที่ย้าย /c/<ใหม่> ออกไปที่อื่น = ลบทิ้ง (ตอนนี้เป็นหมวดจริงแล้ว เช่น สลับรหัส 2 หมวด)
 */
export function withCategoryRedirect(text: string, from: string, to: string): string {
  const oldPath = `/c/${from}`;
  const newPath = `/c/${to}`;
  const lines = cleanRedirects(text)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [src, dest] = line.split(" -> ");
      return { src, dest: rewriteCategoryLinks(dest, from, to).value };
    })
    .filter(({ src }) => src.toLowerCase() !== newPath && src.toLowerCase() !== oldPath);
  // บรรทัดใหม่ขึ้นก่อน — รายการเต็ม 300 คู่แล้วก็ยังได้อยู่
  return cleanRedirects([`${oldPath} -> ${newPath}`, ...lines.map((l) => `${l.src} -> ${l.dest}`)].join("\n"));
}
