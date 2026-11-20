/**
 * /api/ai/caption-options — ✨ AI เขียนแคปชั่น "หลายแบบให้เลือก" (ป๊อป ให้ AI เขียนแคปชั่น ใน drawer โพสต์ · เจ้าของสั่ง 2026-11-20)
 *
 * GET  ?content_id=&platforms=a,b
 *   → { data: { allowed, can_see_cost, images: [{ key }], quota, configured, models?: [{ id, label, note, est_thb }], model?, est_thb? } }
 *     models/model/est_thb = เฉพาะผู้มี admin.paid_services (พนักงานเห็นแค่ "ใช้ได้อีก N ครั้ง" — ศูนย์ AI)
 * POST { content_id, platforms[], extra?, variants: 1|3, image_keys?: string[], detail_high?: boolean, model?: string }
 *   → { data: { results: [{ platform, variants: [{ paragraphs: string[], hashtags: string[] }] }], images, quota } }
 *   ไม่บันทึกลงคอนเทนต์ — ผู้ใช้เลือกแบบ/ย่อหน้าในป๊อปแล้วค่อยใส่ช่อง (กดบันทึกโพสต์ตามปกติ)
 *   model = ใช้ได้เฉพาะผู้ดูแล (รุ่นต้องอยู่ใน AI_MODEL_CHOICES) · คนอื่นใช้รุ่นที่ตั้งในศูนย์ AI
 *   ความจำ AI (ชอบ/ไม่ชอบ/กฎ ต่อแบรนด์) = ui_config CAPTION_AI_MEMORY_KEY (ชุดเดียวกับ /api/ai/desc-memory?kind=caption)
 *   ย่อหน้าที่คล้าย "ไม่ชอบ" ถูกกรองทิ้งอีกรอบหลัง AI ตอบ
 * ของกลาง: aiChat (ศูนย์ AI · key ai.caption · place options) · usageAllowance · resolveImageKeys/imagesToDataUrls · pickPrompt · brandProfileBlock
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { CAPTION_MODEL, imageParts, imagesToDataUrls, loadPromptRows, MAX_IMAGES, normalizeHashtags, openAiKey, pickPrompt, resolveImageKeys } from "@/lib/ai-caption";
import { AI_MODEL_CHOICES, isReasoningModel } from "@/lib/ai-caption-models";
import { aiChat, featureAccess, loadServiceSettings, usageAllowance } from "@/lib/paid-services-server";
import { placeKey } from "@/lib/paid-services";
import { brandProfileBlock } from "@/lib/marketing/brand-profile-server";
import { CAPTION_AI_MEMORY_KEY, isSimilar, memoryFor, normalizeMemory } from "@/lib/desc-ai-memory";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const KEY = "ai.caption";
const PLACE = "options";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noAccess = () => NextResponse.json({ error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI เขียนแคปชั่น — ขอสิทธิ์จากผู้ดูแล (ศูนย์ AI → ใครใช้ได้)" }, { status: 401 });
const canUse = async (request: NextRequest) => featureAccess(KEY, { request }, await apiCan(request, "ai.caption"));

type ContentRow = { id: string; title: string | null; post_type: string | null; brand_id: string | null; note: string | null; platform_images: unknown; task_id: string | null };

async function defaultModel(): Promise<string> {
  const s = await loadServiceSettings();
  return s.get(placeKey(KEY, PLACE))?.model || s.get(KEY)?.model || CAPTION_MODEL;
}
/** ค่าใช้จ่ายประมาณต่อ "1 แพลตฟอร์ม" (บาท) — รูปละ ~2,800 token (ดูละเอียด ×3) + ข้อความ ~1,800 · ตอบ ~350/แบบ */
function estThb(model: string, images: number, variants: number, high: boolean): number {
  const m = AI_MODEL_CHOICES.find((x) => x.id === model) ?? AI_MODEL_CHOICES[0];
  const tin = 2800 * images * (high ? 3 : 1) + 1800, tout = 350 * variants + 150 + (isReasoningModel(m.id) ? 600 : 0);
  return Math.round(((tin * m.inPerM + tout * m.outPerM) / 1e6) * 100) / 100;
}
async function loadContent(contentId: string): Promise<ContentRow | null> {
  const { data } = await supabaseAdmin().from("erp_creative_content")
    .select("id, title, post_type, brand_id, note, platform_images, task_id").eq("id", contentId).maybeSingle();
  return (data as ContentRow | null) ?? null;
}
/** รูปที่ AI อ่านได้ของคอนเทนต์นี้ (รวมทุกแพลตฟอร์มที่ขอ · ตามลำดับ · ไม่ซ้ำ) */
async function allowedKeys(content: ContentRow, platforms: string[]): Promise<string[]> {
  const seen = new Set<string>(); const out: string[] = [];
  for (const p of platforms.length ? platforms : ["_"]) {
    const { keys } = await resolveImageKeys(content, p);
    for (const k of keys) if (!seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out.slice(0, MAX_IMAGES);
}
const cleanPlatforms = (v: unknown): string[] => [...new Set((Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => String(x).trim()).filter((x) => /^[a-z0-9_]{2,30}$/.test(x)))].slice(0, 8);

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await canUse(request))) return noAccess();
  const sp = new URL(request.url).searchParams;
  const contentId = (sp.get("content_id") ?? "").trim();
  if (!UUID_RE.test(contentId)) return NextResponse.json({ error: "ต้องระบุ content_id" }, { status: 400 });
  const content = await loadContent(contentId);
  if (!content) return NextResponse.json({ error: "ไม่พบคอนเทนต์" }, { status: 404 });
  const platforms = cleanPlatforms(sp.get("platforms"));
  const [keys, canSeeCost, model] = await Promise.all([allowedKeys(content, platforms), apiCan(request, "admin.paid_services"), defaultModel()]);
  const perCall = estThb(model, Math.max(1, keys.length), 3, false);
  const quota = await usageAllowance(KEY, { request, place: "options" }, perCall);
  return NextResponse.json({ data: {
    allowed: true, can_see_cost: canSeeCost, images: keys.map((key) => ({ key })), quota, configured: !!openAiKey(),
    ...(canSeeCost ? { model, est_thb: perCall, models: AI_MODEL_CHOICES.map((m) => ({ id: m.id, label: m.label, note: m.note, est_thb: estThb(m.id, Math.max(1, keys.length), 3, false) })) } : {}),
  }, error: null });
}

type Body = { content_id?: string; platforms?: unknown; extra?: string; variants?: number; image_keys?: unknown; detail_high?: boolean; model?: string };

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await canUse(request))) return noAccess();
  if (!openAiKey()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel แล้ว redeploy" }, { status: 400 });
  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const contentId = String(body.content_id ?? "").trim();
  if (!UUID_RE.test(contentId)) return NextResponse.json({ error: "ต้องระบุ content_id" }, { status: 400 });
  const platforms = cleanPlatforms(body.platforms);
  if (!platforms.length) return NextResponse.json({ error: "เลือกแพลตฟอร์มก่อน" }, { status: 400 });
  const variants = body.variants === 1 ? 1 : 3;
  const extra = String(body.extra ?? "").trim().slice(0, 1200);
  const high = body.detail_high === true;

  const admin = supabaseAdmin();
  const content = await loadContent(contentId);
  if (!content) return NextResponse.json({ error: "ไม่พบคอนเทนต์" }, { status: 404 });
  const brandId = content.brand_id;

  // รุ่น: ผู้ดูแลเลือกเองได้ (ต้องอยู่ในรายการกลาง) · คนอื่น = ตามศูนย์ AI
  const canPick = await apiCan(request, "admin.paid_services");
  const forceModel = canPick && body.model && AI_MODEL_CHOICES.some((m) => m.id === body.model) ? body.model : null;

  // รูป: ที่ผู้ใช้เหลือไว้ในป๊อป (ต้องเป็นรูปของคอนเทนต์นี้เท่านั้น) · ไม่ส่ง = ตามแพลตฟอร์ม
  const allowed = await allowedKeys(content, platforms);
  const picked = Array.isArray(body.image_keys) ? (body.image_keys as unknown[]).map(String).filter((k) => allowed.includes(k)) : null;

  const [{ data: brand }, promptRows, brandCard, { data: memRow }, { data: capRows }] = await Promise.all([
    brandId ? admin.from("brands").select("name").eq("id", brandId).maybeSingle() : Promise.resolve({ data: null }),
    loadPromptRows(),
    brandProfileBlock(admin, brandId),
    admin.from("ui_config").select("value").eq("key", CAPTION_AI_MEMORY_KEY).maybeSingle(),
    admin.from("erp_creative_content_captions").select("platform, hashtags").eq("content_id", contentId),
  ]);
  const memory = memoryFor(normalizeMemory((memRow as { value?: unknown } | null)?.value ?? null), brandId);
  const tagsOf = new Map(((capRows ?? []) as { platform: string; hashtags: string | null }[]).map((r) => [r.platform, (r.hashtags ?? "").trim()]));

  // อ่านรูปครั้งเดียวต่อชุดรูป (แพลตฟอร์มที่ใช้รูปชุดเดียวกันไม่อ่านซ้ำ)
  const imgCache = new Map<string, string[]>();
  const imagesFor = async (p: string): Promise<string[]> => {
    const keys = picked ?? (await resolveImageKeys(content, p)).keys;
    const ck = keys.join("|");
    if (!imgCache.has(ck)) imgCache.set(ck, keys.length ? await imagesToDataUrls(keys) : []);
    return imgCache.get(ck)!;
  };

  const memoryLines = [
    memory.liked.length ? `ประโยค/สไตล์ที่ผู้ใช้ "ชอบ" (ใช้เป็นแนวทางเมื่อเหมาะ ไม่ต้องลอกทุกครั้ง):\n${memory.liked.slice(0, 25).map((e) => `- ${e.text}`).join("\n")}` : "",
    memory.disliked.length ? `ประโยค/สไตล์ที่ผู้ใช้ "ไม่ชอบ" (ห้ามเขียนประโยคนี้หรือความหมาย/โทนคล้ายกันเด็ดขาด):\n${memory.disliked.slice(0, 30).map((e) => `- ${e.text}`).join("\n")}` : "",
    memory.rules.length ? `กฎที่ผู้ใช้ตั้งไว้ (ต้องทำตาม):\n${memory.rules.slice(0, 20).map((e) => `- ${e.text}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const results: { platform: string; variants: { paragraphs: string[]; hashtags: string[] }[] }[] = [];
  const errors: string[] = [];
  let imagesUsed = 0;
  await Promise.all(platforms.map(async (p) => {
    const images = await imagesFor(p);
    imagesUsed = Math.max(imagesUsed, images.length);
    const facts = [
      content.title ? `ชื่อคอนเทนต์: ${content.title}` : "",
      brand?.name ? `แบรนด์: ${(brand as { name: string }).name}` : "",
      brandCard,
      content.post_type ? `ประเภทโพสต์: ${content.post_type}` : "",
      `แพลตฟอร์ม: ${p}`,
      tagsOf.get(p) ? `แฮชแท็กที่ผู้ใช้ใส่ไว้ (ใช้เป็นบริบท): ${tagsOf.get(p)}` : "",
      String(content.note ?? "").trim() ? `โน้ตเพิ่มเติม: ${content.note}` : "",
      memoryLines,
      extra ? `คำสั่งเพิ่มจากผู้ใช้ครั้งนี้ (สำคัญ ต้องทำตาม): ${extra}` : "",
      images.length ? `มีรูปให้ดู ${images.length} รูป — เขียนจากสิ่งที่เห็นในรูปจริง` : "ไม่มีรูปแนบ — เขียนจากข้อมูลข้อความเท่านั้น",
    ].filter(Boolean).join("\n\n");
    const ask = `${facts}

ตอบเป็น JSON เท่านั้น: {"variants":[{"paragraphs":["ย่อหน้า 1","ย่อหน้า 2","ย่อหน้า 3"],"hashtags":["#...","#..."]}]}
- เขียน ${variants} แบบ${variants > 1 ? " ที่ต่างกันชัดเจน (มุมเปิด/โทน/การเล่าไม่ซ้ำกัน)" : ""}
- แต่ละแบบแบ่งเป็น 2-4 ย่อหน้า เรียงหน้าที่ตรงกันทุกแบบ: ย่อหน้าแรก = เปิดเรื่อง/ดึงความสนใจ · กลาง = รายละเอียด/จุดเด่น · สุดท้าย = ปิดท้าย/ชวนซื้อ (ถ้าเหมาะ) — ผู้ใช้จะเลือกย่อหน้าจากต่างแบบมาประกอบกันได้
- ไม่ต้องใส่แฮชแท็กในย่อหน้า · hashtags = แนะนำเพิ่ม 5-10 อันต่อแบบ ไม่ซ้ำกับที่ผู้ใช้ใส่ไว้`;
    try {
      const out = await aiChat(KEY, pickPrompt(promptRows, brandId, p), [{ type: "text", text: ask }, ...imageParts(images, high ? "high" : "low")],
        420 * variants + 300, undefined, { request, place: "options", forceModel });
      const vs: { paragraphs: string[]; hashtags: string[] }[] = [];
      for (const v of Array.isArray(out.variants) ? (out.variants as Record<string, unknown>[]) : []) {
        const paragraphs = (Array.isArray(v?.paragraphs) ? v.paragraphs : []).map((x) => String(x ?? "").trim()).filter(Boolean)
          .filter((x) => !memory.disliked.some((d) => isSimilar(d.text, x))).slice(0, 5);
        if (paragraphs.length) vs.push({ paragraphs, hashtags: normalizeHashtags(v?.hashtags) });
      }
      if (vs.length) results.push({ platform: p, variants: vs.slice(0, variants) });
      else errors.push(`${p}: AI ไม่ได้ส่งแคปชั่นกลับมา`);
    } catch (e) {
      errors.push(`${p}: ${(e as Error).message}`);
    }
  }));
  results.sort((a, b) => platforms.indexOf(a.platform) - platforms.indexOf(b.platform));

  try {
    const { data: u } = await supabaseFromRequest(request).auth.getUser();
    await writeAudit(admin, { action: "ai_caption_options", entityType: "creative_content", entityId: contentId, actorId: u?.user?.id ?? null, actorName: u?.user?.email ?? null,
      metadata: { platforms, variants, images: imagesUsed, detail_high: high, model: forceModel ?? (await defaultModel()), model_forced: !!forceModel, extra: extra || null, failed: errors.length } });
  } catch { /* audit ล้มไม่ควรทำให้ผู้ใช้เสียงาน */ }

  const quota = await usageAllowance(KEY, { request, place: "options" }, estThb(forceModel ?? (await defaultModel()), Math.max(1, imagesUsed), variants, high));
  if (!results.length) return NextResponse.json({ error: errors[0] ?? "AI เขียนไม่สำเร็จ ลองใหม่อีกครั้ง", quota }, { status: 502 });
  return NextResponse.json({ data: { results, images: imagesUsed, quota, warning: errors.length ? errors.join(" · ") : null }, error: null });
}
