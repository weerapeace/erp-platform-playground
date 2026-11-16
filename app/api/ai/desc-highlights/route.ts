/**
 * /api/ai/desc-highlights — ✨ ให้ AI ดูรูปสินค้าแล้วเสนอ "จุดเด่น" 7 ข้อ (ไทย + อังกฤษ) สำหรับ Description
 *   ใช้ที่ ป๊อปแทรก (components/detail-insert-ai) ขั้นจุดเด่น · เจ้าของสั่ง 2026-11-15
 *
 * GET  ?check=1     → { data: { allowed } }   (ป๊อปแทรกใช้ซ่อน/โชว์แท็บ AI)
 *   ใครเข้าได้ = featureAccess: ศูนย์ AI ตั้ง "เฉพาะที่เลือก" → รายชื่อนั้นตัดสิน (ไม่ต้องมี ai.caption) · "ทุกคน" → ต้องมีสิทธิ์ ai.caption
 * GET  ?parent_id=  → { data: { allowed, can_see_cost, model?, est_thb?, images, quota: { used, limit, remaining, on } } }   (ยังไม่เรียก AI)
 *   พนักงานเห็นแค่ "ใช้ได้อีก N ครั้ง" (เจ้าของสั่ง 2026-11-16) · รุ่น/ราคาต่อครั้ง ส่งให้เฉพาะคนที่มีสิทธิ์ admin.paid_services
 * POST { parent_id, keep?: [{th,en}], shown?: string[], chosen?: string[], extra?: string }
 *   keep   = ข้อที่ติ๊กไว้ (สุ่มใหม่ก็ไม่หาย · AI คิดเพิ่มให้ครบ 7)
 *   shown  = ข้อที่เคยเสนอไปแล้ว (สุ่มใหม่ = ขอไอเดียอื่น)
 *   chosen = บรรทัดที่เลือกในขั้นอื่นแล้ว (วัตถุดิบ/ช่อง/ขนาด) — ห้ามซ้ำเรื่องเดิม
 *   → { data: { items: [{ th, en, src: seen|data|library|check, photos, note_th, note_en, fav, keep }], mismatch: {th,en}|null, images, quota } }  (403 access_denied = ผู้ดูแลไม่ได้เปิดให้)
 *   mismatch = Description เดิมพูดถึงสิ่งที่ขัดกับรูป/ข้อมูล (เช่น สินค้าเป็นกระเป๋าแต่เขียนว่าเสื้อ) — ตรวจในการเรียกครั้งเดียวกัน ไม่เสียเพิ่ม
 *
 * กันข้อมูลผิด: ห้ามตัวเลขขนาด/น้ำหนัก · ห้ามอ้างวัสดุ/คุณสมบัติที่ไม่มีในข้อมูล · ทุกข้อบอกที่มา (เห็นในรูปที่… / จากข้อมูล / จากคลัง / ต้องตรวจ)
 *   + กรองซ้ำหลัง AI ตอบ: ตัวเลขขนาด · คล้ายข้อที่ "ไม่ชอบ" · ซ้ำกับที่เลือกไว้/Description เดิม
 * ความจำ (ชอบ/ไม่ชอบ/กฎ) = lib/desc-ai-memory (ui_config) · การ์ดแบรนด์ = brandProfileBlock
 * ศูนย์ AI ที่เสียเงิน key "ai.desc_highlights" (เปิด-ปิด · เลือกรุ่น · งบ · โควตาต่อคน · ใครใช้ได้) · สิทธิ์ ai.caption หรือรายชื่อ "ใครใช้ได้" · audit ai_desc_highlights
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { imageParts, imagesToDataUrls, openAiKey, productDetailModel } from "@/lib/ai-caption";
import { AI_MODEL_CHOICES, isReasoningModel } from "@/lib/ai-caption-models";
import { aiChat, callTokensFor, featureAccess, loadServiceSettings, usageAllowance } from "@/lib/paid-services-server";
import { callCostThb } from "@/lib/paid-services";
import { brandProfileBlock } from "@/lib/marketing/brand-profile-server";
import { parentImageKeys } from "@/lib/product-image-keys";
import { cleanText, DESC_AI_MEMORY_KEY, hasMeasurement, isSimilar, memoryFor, normalizeMemory } from "@/lib/desc-ai-memory";
import { splitLines } from "@/lib/detail-snippets";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 90;

const KEY = "ai.desc_highlights";
const MAX_IMG = 6;
const COUNT = 7;
const SRC = ["seen", "data", "library", "check"] as const;
type Src = (typeof SRC)[number];
type Item = { th: string; en: string; src: Src; photos: number[]; note_th: string; note_en: string; fav?: boolean; keep?: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noAccess = () => NextResponse.json({ error: "ผู้ดูแลยังไม่ได้เปิดให้คุณใช้ AI ตัวนี้ (ตั้งที่ศูนย์ AI → ใครใช้ได้) · You don't have access to this AI yet" }, { status: 401 });
/** เข้าฟีเจอร์นี้ได้ไหม — รายชื่อ "ใครใช้ได้" ในศูนย์ AI ก่อน · ไม่ได้ตั้ง = สิทธิ์ ai.caption */
const canUse = async (request: NextRequest) => featureAccess(KEY, { request }, await apiCan(request, "ai.caption"));

async function modelFor(): Promise<string> {
  const s = await loadServiceSettings();
  return s.get(KEY)?.model || (await productDetailModel());
}
/** ราคาต่อครั้ง (บาท) — มีประวัติใช้จริง = เฉลี่ยจริง (ตรงกับศูนย์ AI) · ยังไม่เคยใช้ = ประมาณจากจำนวนรูป */
async function perCallThb(model: string, images: number): Promise<number> {
  const t = await callTokensFor(KEY);
  return t.source === "history" ? callCostThb(model, t) : estThb(model, images);
}
/** ค่าใช้จ่ายประมาณต่อครั้ง (บาท) — รูปละ ~2,800 token (คิดเผื่อ) + ข้อความ ~2,500 · ตอบ ~900 (+เวลาคิดรุ่น 5.x) */
function estThb(model: string, images: number): number {
  const m = AI_MODEL_CHOICES.find((x) => x.id === model) ?? AI_MODEL_CHOICES[0];
  const tin = 2800 * images + 2500, tout = 900 + (isReasoningModel(m.id) ? 600 : 0);
  return Math.round(((tin * m.inPerM + tout * m.outPerM) / 1e6) * 100) / 100;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = new URL(request.url).searchParams;
  const ok = await canUse(request);
  if (sp.get("check") === "1") return NextResponse.json({ data: { allowed: ok }, error: null });
  if (!ok) return noAccess();
  const parentId = (sp.get("parent_id") ?? "").trim();
  if (!UUID_RE.test(parentId)) return NextResponse.json({ error: "ต้องระบุ parent_id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: p } = await admin.from("parent_skus_v2").select("id, cover_image_r2_key").eq("id", parentId).maybeSingle();
  if (!p) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  const [model, keys, canSeeCost] = await Promise.all([
    modelFor(),
    parentImageKeys(admin, parentId, (p.cover_image_r2_key as string | null) ?? null, MAX_IMG),
    apiCan(request, "admin.paid_services"),
  ]);
  const allowed = true;
  const perCall = await perCallThb(model, Math.max(1, keys.length));
  const quota = await usageAllowance(KEY, { request }, perCall);
  return NextResponse.json({ data: {
    allowed, can_see_cost: canSeeCost, images: keys.length, quota, configured: !!openAiKey(),
    ...(canSeeCost ? { model, est_thb: perCall } : {}),
  }, error: null });
}

type Body = { parent_id?: string; keep?: { th?: string; en?: string }[]; shown?: string[]; chosen?: string[]; extra?: string };

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await canUse(request))) return noAccess();
  if (!openAiKey()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel แล้ว redeploy" }, { status: 400 });
  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const parentId = String(body.parent_id ?? "").trim();
  if (!UUID_RE.test(parentId)) return NextResponse.json({ error: "ต้องระบุ parent_id" }, { status: 400 });
  const keep = (Array.isArray(body.keep) ? body.keep : []).map((k) => ({ th: cleanText(k?.th), en: cleanText(k?.en) })).filter((k) => k.th).slice(0, COUNT);
  const shown = (Array.isArray(body.shown) ? body.shown : []).map(cleanText).filter(Boolean).slice(0, 40);
  const chosen = (Array.isArray(body.chosen) ? body.chosen : []).map(cleanText).filter(Boolean).slice(0, 30);
  const extra = cleanText(body.extra).slice(0, 300);
  const need = Math.max(3, COUNT - keep.length);

  const admin = supabaseAdmin();
  const { data: p } = await admin.from("parent_skus_v2")
    .select("id, code, name_th, name_en, brand_id, category_id, materials, description, english_description, cover_image_r2_key, warranty")
    .eq("id", parentId).maybeSingle();
  if (!p) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  const brandId = (p.brand_id as string | null) ?? null;

  const [{ data: brand }, { data: cat }, { data: kids }, { data: phrases }, { data: memRow }, keys, model] = await Promise.all([
    brandId ? admin.from("brands").select("name").eq("id", brandId).maybeSingle() : Promise.resolve({ data: null }),
    p.category_id ? admin.from("product_categories").select("name").eq("id", p.category_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("skus_v2").select("color_th").eq("parent_sku_id", parentId).limit(200),
    admin.from("product_highlight_items").select("name, name_en, kind").or("kind.is.null,kind.eq.phrase").eq("is_active", true).limit(60),
    admin.from("ui_config").select("value").eq("key", DESC_AI_MEMORY_KEY).maybeSingle(),
    parentImageKeys(admin, parentId, (p.cover_image_r2_key as string | null) ?? null, MAX_IMG),
    modelFor(),
  ]);
  const colors = [...new Set(((kids ?? []) as { color_th: string | null }[]).map((k) => String(k.color_th ?? "").split("/")[0].trim()).filter(Boolean))].slice(0, 20);
  const memory = memoryFor(normalizeMemory((memRow as { value?: unknown } | null)?.value ?? null), brandId);
  const library = ((phrases ?? []) as { name: string; name_en: string | null }[]).map((x) => cleanText(x.name)).filter(Boolean).slice(0, 40);
  const existing = splitLines(String(p.description ?? "")).map((l) => cleanText(l)).filter(Boolean);
  const images = keys.length ? await imagesToDataUrls(keys) : [];
  const brandCard = await brandProfileBlock(admin, brandId, { forProduct: true });

  const facts = [
    `รหัสสินค้า: ${p.code ?? "-"} · ชื่อ: ${p.name_th ?? "-"}`,
    brand?.name ? `แบรนด์: ${brand.name}` : "",
    brandCard,
    cat?.name ? `หมวดสินค้า: ${cat.name}` : "",
    colors.length ? `สีที่มีขาย (${colors.length} สี): ${colors.join(", ")}` : "ไม่มีข้อมูลจำนวนสี",
    p.materials ? `ข้อมูลวัสดุจากฝ่ายผลิต (ภายใน · อ้างชื่อวัสดุได้ แต่ห้ามเขียนรหัสวัสดุ): ${String(p.materials).slice(0, 200)}` : "ไม่มีข้อมูลวัสดุ — ห้ามอ้างชนิดวัสดุ",
    p.warranty ? `การรับประกัน: ${p.warranty}` : "",
    existing.length ? `Description เดิม (${existing.length} บรรทัด):\n${existing.slice(0, 15).map((l) => `- ${l}`).join("\n")}` : "Description เดิม: ว่าง",
    chosen.length ? `บรรทัดที่ผู้ใช้เลือกไว้แล้วในขั้นอื่น (ห้ามเขียนเรื่องเดียวกันซ้ำ):\n${chosen.map((l) => `- ${l}`).join("\n")}` : "",
    keep.length ? `ข้อที่ผู้ใช้เก็บไว้แล้ว (ห้ามซ้ำ):\n${keep.map((k) => `- ${k.th}`).join("\n")}` : "",
    shown.length ? `ข้อที่เคยเสนอไปแล้ว (รอบนี้ให้คิดข้อใหม่ที่ต่างออกไป):\n${shown.slice(0, 20).map((l) => `- ${l}`).join("\n")}` : "",
    library.length ? `คลังข้อความสำเร็จรูปของบริษัท (ใช้ถ้าตรงกับสินค้านี้จริง · source = library):\n${library.map((l) => `- ${l}`).join("\n")}` : "",
    memory.liked.length ? `ข้อความที่ผู้ใช้ "ชอบ" (ใส่เมื่อเหมาะกับสินค้านี้เท่านั้น ไม่ต้องใส่ทุกข้อ):\n${memory.liked.slice(0, 30).map((e) => `- ${e.text}`).join("\n")}` : "",
    memory.disliked.length ? `ข้อความที่ผู้ใช้ "ไม่ชอบ" (ห้ามเขียนข้อความนี้หรือความหมายคล้ายกันเด็ดขาด):\n${memory.disliked.slice(0, 40).map((e) => `- ${e.text}`).join("\n")}` : "",
    memory.rules.length ? `กฎที่ผู้ใช้ตั้งไว้ (ต้องทำตาม):\n${memory.rules.slice(0, 20).map((e) => `- ${e.text}`).join("\n")}` : "",
    extra ? `คำสั่งเพิ่มจากผู้ใช้ครั้งนี้: ${extra}` : "",
    images.length ? `มีรูปสินค้าให้ดู ${images.length} รูป (เรียงตามลำดับ รูปที่ 1 = รูปแรก)` : "ไม่มีรูปให้ดู — เขียนจากข้อมูลข้อความเท่านั้น และตั้ง source = check ทุกข้อ",
  ].filter(Boolean).join("\n\n");

  const system = [
    "คุณคือนักเขียนจุดเด่นสินค้าสำหรับร้านค้าออนไลน์ไทย (Shopee/Lazada/TikTok/เว็บร้าน) ดูรูปสินค้าและข้อมูลที่ให้มา แล้วเสนอ \"จุดเด่น\" สั้น ๆ สำหรับใส่ใน Description แบบรายการขีด",
    "ตอบเป็น JSON เท่านั้น ตามรูปแบบนี้:",
    `{"items":[{"th":"จุดเด่นภาษาไทย 1 บรรทัด","en":"ฉบับภาษาอังกฤษที่แปลให้ตรงกัน เป็นธรรมชาติ","source":"seen|data|library|guess","photos":[เลขรูปที่เห็น],"why_th":"ที่มาสั้น ๆ เช่น เห็นหัวเข็มขัดปรับสายในรูป 2","why_en":"same reason in English"}],`,
    `"mismatch":null หรือ {"th":"สรุปสั้น ๆ ว่า Description เดิมเขียนอะไรที่ขัดกับรูป/ข้อมูล","en":"same in English"}}`,
    "",
    `กติกา (สำคัญมาก):`,
    `- เขียน ${need} ข้อ ไม่ซ้ำกัน · แต่ละข้อสั้น อ่านง่าย (ไม่เกิน ~70 ตัวอักษร) · ไม่ต้องขึ้นต้นด้วย "-"`,
    "- เขียนเฉพาะสิ่งที่เห็นในรูปจริง หรือมีในข้อมูลที่ให้ · source: seen = เห็นในรูป (ระบุเลขรูปใน photos) · data = จากข้อมูลที่ให้ · library = ตรงกับคลังข้อความ/ข้อที่ผู้ใช้ชอบ · guess = คาดเดา ต้องให้คนตรวจ",
    "- ห้ามเขียนตัวเลขขนาด ความยาว น้ำหนัก ความจุ เด็ดขาด (ระบบใส่จากข้อมูลจริงเอง)",
    "- ห้ามอ้างคุณสมบัติที่พิสูจน์จากรูปไม่ได้และไม่มีในข้อมูล เช่น กันน้ำ หนังแท้ แท้ 100% ทนทาน x ปี ไม่เป็นสนิม — ถ้าจะเขียนต้องเป็น source = guess",
    "- ห้ามใส่ราคา โปรโมชัน คำว่า ดีที่สุด / อันดับ 1",
    "- ห้ามเขียนเรื่องวัสดุ จำนวนช่อง ขนาด/สาย ซ้ำกับบรรทัดที่ผู้ใช้เลือกไว้แล้ว",
    "- ข้อความที่ผู้ใช้ไม่ชอบ ห้ามเขียนหรือเขียนความหมายคล้ายกัน · กฎที่ผู้ใช้ตั้งต้องทำตาม",
    "- mismatch: ตั้งค่าเฉพาะเมื่อ Description เดิมพูดถึงสิ่งที่ขัดกับรูป/ข้อมูลชัดเจน (เช่น เป็นสินค้าคนละประเภท วัสดุคนละอย่าง) · ไม่แน่ใจ = null",
  ].join("\n");

  let out: Record<string, unknown>;
  try {
    out = await aiChat(KEY, system, [{ type: "text", text: facts }, ...imageParts(images)], 1400, model, { request });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI ตอบกลับไม่สำเร็จ";
    const code = (e as { code?: string } | null)?.code;
    return NextResponse.json({ error: msg, code: code ?? null }, { status: code === "budget_exceeded" ? 429 : code === "service_off" || code === "access_denied" ? 403 : 502 });
  }

  // ── กรองหลัง AI ตอบ (กันข้อมูลผิด/ซ้ำ แม้ AI ไม่ทำตามคำสั่ง) ──
  const avoid = [...keep.map((k) => k.th), ...chosen, ...existing];
  const fresh: Item[] = [];
  for (const raw of Array.isArray(out.items) ? (out.items as Record<string, unknown>[]) : []) {
    const th = cleanText(raw?.th).replace(/^[-•]\s*/, "");
    const en = cleanText(raw?.en).replace(/^[-•]\s*/, "");
    if (!th || hasMeasurement(th) || hasMeasurement(en)) continue;
    if (memory.disliked.some((d) => isSimilar(d.text, th))) continue;
    if (avoid.some((a) => isSimilar(a, th)) || fresh.some((f) => isSimilar(f.th, th))) continue;
    const s = String(raw?.source ?? "");
    const src: Src = s === "seen" ? "seen" : s === "data" ? "data" : s === "library" ? "library" : "check";
    const photos = (Array.isArray(raw?.photos) ? raw.photos : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= images.length).slice(0, 4);
    fresh.push({
      th, en, src: src === "seen" && !photos.length ? "check" : src, photos,
      note_th: cleanText(raw?.why_th).slice(0, 80), note_en: cleanText(raw?.why_en).slice(0, 80),
      fav: memory.liked.some((l) => isSimilar(l.text, th)),
    });
    if (fresh.length >= need) break;
  }
  const items: Item[] = [...keep.map((k) => ({ th: k.th, en: k.en, src: "data" as Src, photos: [], note_th: "", note_en: "", keep: true })), ...fresh];
  const mm = out.mismatch && typeof out.mismatch === "object" ? (out.mismatch as Record<string, unknown>) : null;
  const mismatch = mm && cleanText(mm.th) ? { th: cleanText(mm.th), en: cleanText(mm.en) } : null;

  try {
    const { data: u } = await supabaseFromRequest(request).auth.getUser();
    await writeAudit(admin, {
      action: "ai_desc_highlights", entityType: "parent_skus_v2", entityId: parentId,
      actorId: u?.user?.id ?? null, actorName: u?.user?.email ?? null,
      metadata: { code: p.code ?? null, images: images.length, model, kept: keep.length, got: fresh.length, mismatch: !!mismatch },
    });
  } catch { /* audit ล้มไม่ควรทำให้ผู้ใช้เสียงาน */ }

  const quota = await usageAllowance(KEY, { request }, await perCallThb(model, Math.max(1, images.length)));
  return NextResponse.json({ data: { items, mismatch, images: images.length, quota }, error: null });
}
