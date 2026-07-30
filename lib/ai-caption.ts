/**
 * ของกลางสำหรับ "AI เขียนแคปชั่น" — ใช้ร่วมกันทั้ง /api/ai/caption (ทีละช่อง) และ /api/ai/caption-all (ทั้งใบ)
 * รวมไว้ที่เดียวเพื่อไม่ให้ prompt / การอ่านรูป / การเรียก OpenAI แยกกันเขียนสองที่
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { r2GetObject } from "@/lib/r2";

export const CAPTION_MODEL = process.env.OPENAI_CAPTION_MODEL || "gpt-4o-mini";

/**
 * โมเดลที่เลือกได้ในหน้าตั้งค่า (ui_config key = "ai_product_model")
 * ราคา = บาทต่อ 1 ล้าน token (อัตรา 36 บาท/USD) — เอาไว้โชว์ให้เจ้าของเห็นก่อนเลือก
 */
export const AI_MODEL_CHOICES: { id: string; label: string; note: string; inPerM: number; outPerM: number }[] = [
  { id: "gpt-4o-mini", label: "gpt-4o-mini (ถูกสุด)", note: "เร็ว ประหยัด · งานเขียนไทยพื้น ๆ", inPerM: 5.4, outPerM: 21.6 },
  { id: "gpt-4.1-mini", label: "gpt-4.1-mini (คุ้มสุด)", note: "เขียนไทยเรียบกว่า ตามคำสั่งดีกว่า", inPerM: 14.4, outPerM: 57.6 },
  { id: "gpt-4o", label: "gpt-4o (คุณภาพสูง)", note: "งานเขียนดีสุดในสาย OpenAI", inPerM: 90, outPerM: 360 },
  { id: "gpt-4.1", label: "gpt-4.1 (คุณภาพสูง รุ่นใหม่)", note: "ตามคำสั่งเป๊ะ เขียนยาวได้ดี", inPerM: 72, outPerM: 288 },
];

/** โมเดลที่ใช้เขียนรายละเอียดสินค้า — อ่านจากหน้าตั้งค่าก่อน แล้วค่อย env/ค่าเริ่มต้น */
export async function productDetailModel(): Promise<string> {
  try {
    const { data } = await supabaseAdmin().from("ui_config").select("value").eq("key", "ai_product_model").maybeSingle();
    const picked = String(((data as { value?: Record<string, unknown> } | null)?.value ?? {}).model ?? "").trim();
    if (picked && AI_MODEL_CHOICES.some((m) => m.id === picked)) return picked;
  } catch { /* อ่านค่าไม่ได้ → ใช้ค่าเริ่มต้น */ }
  return CAPTION_MODEL;
}
export const MAX_IMAGES = 7;   // เพดานรูปต่อครั้ง — รูปคือส่วนที่กิน token มากที่สุด (~2,800 token/รูป)
export const FALLBACK_PROMPT = "เขียนแคปชั่นภาษาไทยสั้น ๆ 2-4 บรรทัดจากรูปที่ให้มา โทนเป็นมิตร ชวนซื้อแต่ไม่ hard sell · ห้ามแต่งข้อมูลที่ไม่เห็นในรูป · ไม่ต้องใส่แฮชแท็กในแคปชั่น";

export type PromptRow = { brand_id: string | null; platform: string | null; prompt: string };

// งาน AI ที่ไม่ใช่แคปชั่นโซเชียล แต่ใช้ทะเบียน prompt ชุดเดียวกัน (จึงตั้งรายแบรนด์ได้เหมือนกัน)
// เก็บค่าไว้ที่นี่เพราะไฟล์ route ห้าม export ตัวแปรอื่นนอกจาก handler
export const PRODUCT_DETAIL_KEY = "product_detail";
export const TRANSLATE_KEY = "translate";

/**
 * คำสั่ง AI "รายช่อง" ของรายละเอียดสินค้า — เก็บในทะเบียน prompt เดิมโดยใช้ platform = product_detail:<field>
 * ตั้งได้ 2 ระดับเหมือนเดิม (ค่ากลาง / เฉพาะแบรนด์) · ช่องไหนไม่ตั้ง = ใช้คำอธิบายพื้นฐานในโค้ด
 */
/**
 * ตั้งคำสั่งได้เฉพาะ "ฝั่งไทย" — ฝั่งอังกฤษถือเป็นการแปลจากฝั่งไทยให้ตรงกัน
 * (เจ้าของร้านสั่งไว้: ภาษาอีกภาษา = แปลกันเอง ไม่ต้องเขียน prompt ซ้ำสองรอบ)
 */
export const PRODUCT_FIELD_KEYS = [
  { field: "name_th",      label: "ชื่อสินค้า",   en: "name_en" },
  { field: "introduction", label: "Introduction", en: "introduction_en" },
  { field: "description",  label: "Description",  en: "english_description" },
] as const;

/** ช่องอังกฤษ → ช่องไทยที่เป็นต้นฉบับ (ใช้คำสั่งของฝั่งไทยตัวเดียวกัน) */
export const EN_SOURCE_FIELD: Record<string, string> = {
  name_en: "name_th",
  introduction_en: "introduction",
  english_description: "description",
};

export const productFieldPromptKey = (field: string) => `${PRODUCT_DETAIL_KEY}:${field}`;

/** ยังไม่ตั้ง OPENAI_API_KEY = คืนค่าว่าง (ให้ route ตอบข้อความบอกวิธี ไม่พังเงียบ) */
export function openAiKey(): string {
  return (process.env.OPENAI_API_KEY ?? "").trim();
}

export async function loadPromptRows(): Promise<PromptRow[]> {
  const { data } = await supabaseAdmin().from("erp_caption_prompts").select("brand_id, platform, prompt");
  return (data ?? []) as PromptRow[];
}

/** เลือก prompt ที่เจาะจงที่สุด: แบรนด์+แพลตฟอร์ม → แบรนด์ → แพลตฟอร์ม → ค่ากลาง → ค่าในโค้ด */
export function pickPrompt(rows: PromptRow[], brandId: string | null, platform: string): string {
  const at = (b: string | null, p: string | null) => rows.find((r) => r.brand_id === b && r.platform === p)?.prompt;
  return (brandId ? (at(brandId, platform) ?? at(brandId, null)) : undefined) ?? at(null, platform) ?? at(null, null) ?? FALLBACK_PROMPT;
}

/**
 * เลือก prompt ของ "งานที่ไม่ใช่แคปชั่น" (รายละเอียดสินค้า / แปลภาษา)
 * ต่างจาก pickPrompt ตรงที่ **ห้ามตกไปใช้ค่ากลางของแคปชั่น** — ไม่งั้นสั่งให้ AI
 * "เขียนแคปชั่นสั้น ๆ" ตอนที่เราขอให้แปลภาษา · ไม่มีตั้งไว้ = คืนค่าว่าง ให้ route ใช้ค่าในโค้ดของงานนั้น
 */
export function pickJobPrompt(rows: PromptRow[], brandId: string | null, jobKey: string): string {
  const at = (b: string | null) => rows.find((r) => r.brand_id === b && r.platform === jobKey)?.prompt;
  return (brandId ? at(brandId) : undefined) ?? at(null) ?? "";
}

/** อ่านรูปจาก R2 → data URL (ไม่พึ่งให้ OpenAI ยิงกลับเข้าเว็บเรา) · รูปไหนอ่านไม่ได้ก็ข้าม */
export async function imagesToDataUrls(keys: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const k of keys.filter(Boolean).slice(0, MAX_IMAGES)) {
    try {
      const obj = await r2GetObject(k);
      if (!obj) continue;
      const buf = Buffer.from(await new Response(obj.body as ReadableStream).arrayBuffer());
      out.push(`data:${obj.httpMetadata?.contentType || "image/jpeg"};base64,${buf.toString("base64")}`);
    } catch { /* ข้ามรูปที่อ่านไม่ได้ */ }
  }
  return out;
}

/** เรียก OpenAI แบบบังคับตอบ JSON · error เป็นข้อความไทยพร้อมโชว์ให้ผู้ใช้ */
export async function chatJson(system: string, userContent: unknown[], maxTokens: number, model?: string): Promise<Record<string, unknown>> {
  const key = openAiKey();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model || CAPTION_MODEL,
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, { role: "user", content: userContent }],
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`AI ตอบกลับไม่สำเร็จ: ${(j?.error?.message as string) || `HTTP ${res.status}`}`);
  try { return JSON.parse(j.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>; }
  catch { throw new Error("AI ตอบกลับไม่เป็นรูปแบบที่อ่านได้ — ลองกดอีกครั้ง"); }
}

export function normalizeHashtags(x: unknown, max = 12): string[] {
  if (!Array.isArray(x)) return [];
  const cleaned = x.map((v) => String(v).trim()).filter(Boolean).map((v) => (v.startsWith("#") ? v : `#${v}`));
  return [...new Set(cleaned)].slice(0, max);
}

/**
 * หา "รูปที่จะให้ AI ดู" ของแพลตฟอร์มหนึ่ง — ไล่ตามลำดับ เจอที่ไหนหยุดที่นั่น
 *   1) รูปที่เลือกไว้เฉพาะแพลตฟอร์มนี้ (platform_images)
 *   2) รูปที่แนบไว้ในคอนเทนต์เอง (erp_creative_attachments.content_id)
 *   3) รูปจากงานย่อยของงานที่ผูกไว้ (อนุมัติแล้วมาก่อน)
 * เพราะของจริงแทบไม่มีใครเลือกรูปรายแพลตฟอร์ม ถ้าไม่ fallback AI จะเขียนโดยไม่เห็นรูป
 */
export async function resolveImageKeys(
  content: { id: string; task_id?: string | null; platform_images?: unknown },
  platform: string,
): Promise<{ keys: string[]; source: "platform" | "content" | "task" | "none" }> {
  const admin = supabaseAdmin();
  const map = (content.platform_images ?? {}) as Record<string, string[]>;
  const own = (map[platform] ?? []).filter(Boolean);
  if (own.length) return { keys: own.slice(0, MAX_IMAGES), source: "platform" };

  const { data: atts } = await admin.from("erp_creative_attachments")
    .select("r2_key, created_at").eq("content_id", content.id).eq("kind", "image").order("created_at", { ascending: true });
  const fromContent = ((atts ?? []) as { r2_key: string | null }[]).map((a) => a.r2_key).filter((k): k is string => !!k);
  if (fromContent.length) return { keys: fromContent.slice(0, MAX_IMAGES), source: "content" };

  if (content.task_id) {
    const { data: subs } = await admin.from("erp_creative_subtasks").select("id, status, image_sync_targets").eq("task_id", content.task_id);
    const subRows = ((subs ?? []) as { id: string; status: string | null; image_sync_targets: { sku_images?: Record<string, string[]> } | null }[])
      .sort((a, b) => (a.status === "approved" ? 0 : 1) - (b.status === "approved" ? 0 : 1));
    const ids = subRows.map((s) => s.id);
    if (ids.length) {
      const { data: sa } = await admin.from("erp_creative_attachments").select("r2_key, subtask_id").in("subtask_id", ids).eq("kind", "image");
      const rows = ((sa ?? []) as { r2_key: string | null; subtask_id: string | null }[]);
      const ordered = subRows.flatMap((s) => [
        ...rows.filter((r) => r.subtask_id === s.id).map((r) => r.r2_key),
        // รูปที่ sync เข้า SKU แล้ว (แหล่งเดียวกับที่หน้าเว็บโชว์ใน "รูปจากงาน")
        ...Object.values(s.image_sync_targets?.sku_images ?? {}).flat(),
      ]).filter((k): k is string => !!k);
      if (ordered.length) return { keys: [...new Set(ordered)].slice(0, MAX_IMAGES), source: "task" };
    }
  }
  return { keys: [], source: "none" };
}

/** ต่อรูปเป็น content ของ OpenAI (detail low = ถูกที่สุด) */
export function imageParts(urls: string[]): Record<string, unknown>[] {
  return urls.map((url) => ({ type: "image_url", image_url: { url, detail: "low" } }));
}
