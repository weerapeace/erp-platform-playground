/**
 * 🤖 ร่างค่าแม่แบบทรงกระเป๋าจากรูปกระเป๋าสำเร็จ (รอบ 5 · 2026-11-10) — ส่วนสูตร ไม่มีหน้าจอ ไม่เรียก AI เอง
 *   AI ดูรูปแล้วตอบ "สัดส่วน" (สูง/กว้าง · หนา/กว้าง …) เพราะรูปไม่มีมาตราส่วน → ผู้ใช้บอกความกว้างจริง 1 ค่า → ได้ค่าแม่แบบ (BagParams)
 *   ค่าที่ได้ผ่านตัวปรับขอบเขตเดียวกับตัวสร้างจากแม่แบบ (bagGeometry) เสมอ — AI ตอบเพี้ยน/ไม่ครบ = ใช้ค่าเริ่มต้นของช่องนั้น
 *
 *   BAG_DRAFT_SYSTEM / BAG_DRAFT_ASK = คำสั่งที่ส่งให้ AI (ใช้ที่ app/api/pattern-projects/ai-draft)
 *   bagParamsFromAiDraft = คำตอบของ AI + ความกว้างจริง → { params, fits, confidence, style, notes }
 *
 * ข้อจำกัด: เป็น "ร่างแรก" เท่านั้น — ทรงที่แม่แบบยังไม่รองรับ (เป้ กระเป๋าทรงกระบอก มีฝา มีจีบ) จะถูกบีบให้เป็นทรง Tote · ยังไม่เคยลองกับรูปจริง
 * เทสต์ lib/__tests__/bag-ai-draft.test.ts
 */
import { BAG_DEFAULT, bagGeometry, type BagParams } from "@/lib/bag-templates";

export const BAG_DRAFT_SYSTEM = [
  "You help a bag pattern maker. You get ONE photo of a finished bag. Estimate its proportions for a parametric tote template",
  "(front panel + back panel + a gusset strip that forms the sides and base + two handles).",
  "The photo has no scale, so answer with RATIOS relative to the bag's base width (width = 1). Estimate honestly; if a part is not visible, use null.",
  "Reply with JSON only:",
  "{",
  '  "is_bag": boolean,',
  '  "fits_template": boolean,            // true if a tote-like bag (flat front/back + gusset + two top handles) describes it reasonably',
  '  "style_th": string,                  // short Thai description of the bag style, max 60 chars',
  '  "height": number|null,               // body height / base width',
  '  "depth": number|null,                // gusset depth / base width',
  '  "flare": number|null,                // how much wider the top is than the base, per side / base width (0 = straight sides)',
  '  "corner_radius": number|null,        // rounding of the bottom corners of the front panel / base width (0 = square)',
  '  "separate_base": boolean|null,       // true if sides and base look like separate pieces with square corners',
  '  "handle_drop": number|null,          // height of the handle loop above the top edge / base width',
  '  "handle_gap": number|null,           // distance between the two ends of one handle / base width',
  '  "handle_width": number|null,         // handle strap width / base width',
  '  "opening": "none"|"window"|"zip"|"slot",   // a clear window, a zip opening or a slot on the FRONT panel',
  '  "window_shape": "rect"|"heart"|"circle"|"cloud"|"cat"|"bear"|null,',
  '  "opening_width": number|null,        // opening width / base width',
  '  "opening_center_height": number|null,// height of the opening centre above the base / body height (0..1)',
  '  "seen": string[],                    // keys above you could actually measure in the photo (e.g. ["height","handle_drop"]); every other number is an estimate',
  '  "confidence": number,                // 0..1',
  '  "notes_th": string                   // Thai, max 200 chars: what you could not see or what does not fit the template',
  "}",
].join("\n");
export const BAG_DRAFT_ASK = "ดูรูปกระเป๋าใบนี้ แล้วประมาณสัดส่วนตามโครง JSON ที่กำหนด";

export type DraftSource = "seen" | "estimated";
export type BagDraft = { params: BagParams; isBag: boolean; fits: boolean; confidence: number; style: string; notes: string; /** ค่าไหน AI เห็นจากภาพ / ประมาณ (รอบ I3) — คีย์ = ชื่อค่าแม่แบบ (H D flare r wh g Lh ws wy) */ sources: Record<string, DraftSource> };
/** ชื่อในคำตอบ AI → ชื่อค่าแม่แบบ */
export const AI_DRAFT_KEYS: Record<string, string> = { height: "H", depth: "D", flare: "flare", corner_radius: "r", handle_width: "wh", handle_gap: "g", handle_drop: "Lh", opening_width: "ws", opening_center_height: "wy" };

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null;
};
const half = (x: number) => Math.round(x * 2) / 2;

/** คำตอบของ AI (สัดส่วน) + ความกว้างก้นจริง (ซม.) → ค่าแม่แบบที่อยู่ในขอบเขตแล้ว */
export function bagParamsFromAiDraft(raw: unknown, widthCm: number): BagDraft {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const W = Number.isFinite(widthCm) && widthCm > 0 ? widthCm : BAG_DEFAULT.W;
  const by = (key: string, lo: number, hi: number): number | undefined => { const r = num(o[key], lo, hi); return r == null ? undefined : half(r * W); };
  const p: Partial<BagParams> = { W: half(W) };
  const seen = new Set(Array.isArray(o.seen) ? o.seen.filter((x): x is string => typeof x === "string") : []);
  const set = <K extends keyof BagParams>(k: K, v: BagParams[K] | undefined) => { if (v !== undefined) p[k] = v; };
  set("H", by("height", 0.2, 3));
  set("D", by("depth", 0.05, 1.2));
  set("flare", by("flare", 0, 0.5));
  set("r", by("corner_radius", 0, 0.5));
  set("wh", by("handle_width", 0.02, 0.3));
  set("g", by("handle_gap", 0.1, 1.2));
  const drop = num(o.handle_drop, 0.1, 4), gap = num(o.handle_gap, 0.1, 1.2);
  // ยาวหูส่วนที่โผล่ ≈ ตั้งตรง 2 ข้าง + ครึ่งวงกลมกว้างเท่าระยะโคน: 2 × สูงพ้นปาก + (π − 2) × ครึ่งระยะโคน
  if (drop != null) set("Lh", Math.round(2 * drop * W + (Math.PI - 2) * ((gap ?? 0.45) * W) / 2));
  if (o.separate_base === true && !(p.r && p.r > 0)) { p.strip = false; p.r = 0; }
  const opening = o.opening === "window" || o.opening === "zip" || o.opening === "slot" ? o.opening : "none";
  if (opening !== "none") {
    p.winType = opening;
    p.win = opening === "window" && (o.window_shape === "heart" || o.window_shape === "circle" || o.window_shape === "cloud" || o.window_shape === "cat" || o.window_shape === "bear") ? o.window_shape : "rect";
    set("ws", by("opening_width", 0.1, 0.9));
    const cy = num(o.opening_center_height, 0, 1);
    if (cy != null) p.wy = half(cy * (p.H ?? BAG_DEFAULT.H));
  } else p.win = "none";
  return {
    params: bagGeometry({ ...BAG_DEFAULT, ...p }).p,
    isBag: o.is_bag !== false,
    fits: o.fits_template !== false,
    confidence: num(o.confidence, 0, 1) ?? 0,
    style: String(o.style_th ?? "").trim().slice(0, 80),
    notes: String(o.notes_th ?? "").trim().slice(0, 300),
    sources: Object.fromEntries(Object.entries(AI_DRAFT_KEYS).filter(([ai]) => ai !== "opening_width" && ai !== "opening_center_height" ? true : opening !== "none").map(([ai, k]) => [k, seen.has(ai) && o[ai] != null ? "seen" : "estimated"])) as Record<string, DraftSource>,
  };
}
