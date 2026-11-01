/**
 * การ์ดรู้จักแบรนด์ (ข้อมูลแบรนด์สำหรับ AI) — ของกลาง: ทุกปุ่ม AI หยิบไปใส่ prompt
 *   วางแผนแบบ Mass · AI เขียนแคปชั่น (ทีละช่อง/ทั้งหมด) · AI รายละเอียดสินค้า
 * เก็บใน ui_config key "brand_ai_profiles" = { [brand_id]: BrandProfile } (ไม่มีตารางใหม่) · API /api/brand-ai-profile
 * "สินค้าเด่นตอนนี้" ไม่ได้เก็บในการ์ด — ฝั่งเซิร์ฟเวอร์ดึงสดจากป้าย NEW IN / Hero ของ SKU การตลาด (brand-profile-server)
 */

export type BrandProfileField = "about" | "customers" | "usps" | "tone" | "competitors" | "donts";
export type BrandProfile = Record<BrandProfileField, string> & {
  /** แคปชั่นตัวอย่างที่แบรนด์ชอบ (ไม่เกิน 3) — ให้ AI เลียนสไตล์ ไม่ใช่ลอกคำ */
  examples: string[];
  updated_at?: string | null;
  updated_by?: string | null;
};

export const BRAND_PROFILE_KEY = "brand_ai_profiles";
export const BRAND_PROFILE_MAX_EXAMPLES = 3;
const FIELD_MAX = 1500;
const EXAMPLE_MAX = 1200;

export const BRAND_PROFILE_FIELDS: { key: BrandProfileField; label: string; labelEn: string; prompt: string; hint: string; hintEn: string; rows: number }[] = [
  { key: "about", label: "แบรนด์คือใคร", labelEn: "Who we are", prompt: "แบรนด์คือใคร", rows: 2,
    hint: "1–2 บรรทัด ขายอะไร จุดยืนของแบรนด์", hintEn: "1–2 lines: what we sell, what we stand for" },
  { key: "customers", label: "ลูกค้าหลัก", labelEn: "Main customers", prompt: "ลูกค้าหลัก", rows: 2,
    hint: "อายุ ไลฟ์สไตล์ ซื้อเพราะอะไร ซื้อไปใช้ทำอะไร", hintEn: "Age, lifestyle, why they buy, how they use it" },
  { key: "usps", label: "จุดขายที่พูดบ่อย", labelEn: "Key selling points", prompt: "จุดขายของแบรนด์", rows: 3,
    hint: "3–5 ข้อ เช่น วัสดุ งานผลิต การรับประกัน บริการ", hintEn: "3–5 points: material, craftsmanship, warranty, service" },
  { key: "tone", label: "โทนภาษา", labelEn: "Tone of voice", prompt: "โทนภาษา (คำที่ใช้ / คำที่ห้ามใช้)", rows: 3,
    hint: "เขียนแบบไหน คำที่ชอบใช้ / คำที่ห้ามใช้", hintEn: "How we write, words we use / never use" },
  { key: "competitors", label: "ต่างจากคู่แข่งยังไง", labelEn: "vs competitors", prompt: "ต่างจากคู่แข่ง", rows: 2,
    hint: "ชื่อคู่แข่ง + เราเด่นกว่าตรงไหน", hintEn: "Competitor names + where we're better" },
  { key: "donts", label: "ข้อห้าม", labelEn: "Don'ts", prompt: "ข้อห้าม", rows: 2,
    hint: "เคลมเกินจริง เรื่องที่ไม่พูด คำที่เสี่ยงโดนแพลตฟอร์มแบน", hintEn: "Over-claims, topics we avoid, risky words" },
];

export const EMPTY_BRAND_PROFILE: BrandProfile = { about: "", customers: "", usps: "", tone: "", competitors: "", donts: "", examples: [] };

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, n) : "");

/** ค่าดิบ (จาก DB / หน้าเว็บ) → การ์ดที่สะอาด (ตัดช่องว่าง · จำกัดความยาว · ตัวอย่างไม่เกิน 3) */
export function cleanBrandProfile(v: unknown): BrandProfile {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: BrandProfile = { ...EMPTY_BRAND_PROFILE, examples: [] };
  for (const f of BRAND_PROFILE_FIELDS) out[f.key] = clip(o[f.key], FIELD_MAX);
  out.examples = (Array.isArray(o.examples) ? o.examples : []).map((x) => clip(x, EXAMPLE_MAX)).filter(Boolean).slice(0, BRAND_PROFILE_MAX_EXAMPLES);
  if (typeof o.updated_at === "string") out.updated_at = o.updated_at;
  if (typeof o.updated_by === "string") out.updated_by = o.updated_by;
  return out;
}

/** กรอกไปกี่ช่องแล้ว (6 ช่องข้อความ + แคปชั่นตัวอย่าง นับเป็น 1) */
export function brandProfileFilled(p: BrandProfile | null | undefined): { done: number; total: number } {
  const total = BRAND_PROFILE_FIELDS.length + 1;
  if (!p) return { done: 0, total };
  return { done: BRAND_PROFILE_FIELDS.filter((f) => p[f.key].trim()).length + (p.examples.length ? 1 : 0), total };
}

/**
 * การ์ด → บรรทัดใน prompt · ไม่มีอะไรเลย = []
 *   forProduct = งานเขียนรายละเอียดสินค้า: ไม่ใส่แคปชั่นตัวอย่าง + กันไม่ให้ AI เอาจุดขายของแบรนด์ไปอ้างเป็นคุณสมบัติของสินค้าชิ้นนั้น
 *   highlights = ชื่อสินค้าเด่นตอนนี้ (ระบบเติม) — ใช้กับงานวางแผน
 */
export function brandProfileLines(p: BrandProfile | null | undefined, opts: { highlights?: string[]; forProduct?: boolean } = {}): string[] {
  const facts = p ? BRAND_PROFILE_FIELDS.filter((f) => p[f.key].trim()).map((f) => `- ${f.prompt}: ${p[f.key].trim().replace(/\s*\n\s*/g, " / ")}`) : [];
  const highlights = (opts.highlights ?? []).filter(Boolean);
  if (highlights.length) facts.push(`- สินค้าเด่นตอนนี้ (ของใหม่/ขายหลัก): ${highlights.join(", ")}`);
  const examples = !opts.forProduct && p ? p.examples.filter(Boolean) : [];
  if (!facts.length && !examples.length) return [];
  const lines = ["ข้อมูลแบรนด์ (จากการ์ดรู้จักแบรนด์ — ใช้เป็นบริบท ห้ามแต่งข้อเท็จจริงเกินจากนี้):", ...facts];
  if (opts.forProduct && p?.usps.trim()) lines.push("- หมายเหตุ: จุดขายของแบรนด์เป็นภาพรวม ห้ามอ้างเป็นคุณสมบัติของสินค้าชิ้นนี้ถ้าไม่เห็นในรูปหรือข้อมูลสินค้า");
  if (examples.length) {
    lines.push("ตัวอย่างแคปชั่นที่แบรนด์ชอบ (เลียนโทนและจังหวะ ห้ามลอกประโยค):");
    examples.forEach((e, i) => lines.push(`${i + 1}) ${e.replace(/\s*\n\s*/g, " / ")}`));
  }
  return lines;
}
