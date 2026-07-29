/**
 * /api/ai/caption — ให้ AI เขียนแคปชั่นจาก "รูปที่แนบ + แฮชแท็ก + ข้อมูลคอนเทนต์"
 *   POST { content_id, platform } → { caption, hashtags: string[] }
 *
 * สิทธิ์: ต้องมี ai.caption (มีค่าใช้จ่ายต่อการเรียก → ไม่เปิดให้ทุกคน)
 * ต้องตั้ง env OPENAI_API_KEY (ยังไม่ตั้ง = ตอบข้อความบอกวิธีอย่างชัดเจน ไม่พังเงียบ)
 * prompt: อ่านจาก erp_caption_prompts ตามลำดับ (แบรนด์+แพลตฟอร์ม → แบรนด์ → แพลตฟอร์ม → ทั่วไป → ค่าในโค้ด)
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { r2GetObject } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;   // เรียก AI + อ่านรูป ใช้เวลาสักหน่อย

const MODEL = process.env.OPENAI_CAPTION_MODEL || "gpt-4o-mini";
const MAX_IMAGES = 3;             // คุมค่าใช้จ่าย — ส่งรูปไม่เกิน 3 รูปต่อครั้ง
const FALLBACK_PROMPT = "เขียนแคปชั่นภาษาไทยสั้น ๆ 2-4 บรรทัดจากรูปที่ให้มา โทนเป็นมิตร ชวนซื้อแต่ไม่ hard sell · ห้ามแต่งข้อมูลที่ไม่เห็นในรูป · ไม่ต้องใส่แฮชแท็กในแคปชั่น";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── สิทธิ์: เฉพาะคนที่ได้รับอนุญาตให้ใช้ AI ──
  if (!(await apiCan(request, "ai.caption")))
    return NextResponse.json({ error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI เขียนแคปชั่น (ai.caption) — ขอสิทธิ์จากผู้ดูแลระบบ" }, { status: 401 });

  const key = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!key) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel (Settings → Environment Variables) แล้ว redeploy" }, { status: 400 });

  let body: { content_id?: string; platform?: string; extra?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const contentId = (body.content_id ?? "").trim();
  const platform = (body.platform ?? "").trim();
  if (!contentId || !platform) return NextResponse.json({ error: "ต้องระบุ content_id + platform" }, { status: 400 });

  const admin = supabaseAdmin();

  // ── ข้อมูลคอนเทนต์ + แคปชั่นเดิม/แฮชแท็กของแพลตฟอร์มนี้ ──
  const { data: content } = await admin.from("erp_creative_content")
    .select("id, title, post_type, brand_id, note, platform_images").eq("id", contentId).maybeSingle();
  if (!content) return NextResponse.json({ error: "ไม่พบคอนเทนต์" }, { status: 404 });

  const { data: cap } = await admin.from("erp_creative_content_captions")
    .select("hashtags, caption").eq("content_id", contentId).eq("platform", platform).maybeSingle();

  const brandId = (content.brand_id as string | null) ?? null;
  const { data: brand } = brandId ? await admin.from("brands").select("name").eq("id", brandId).maybeSingle() : { data: null };

  // ── prompt: เลือกตัวที่เจาะจงที่สุด ──
  const { data: prompts } = await admin.from("erp_caption_prompts").select("brand_id, platform, prompt");
  const rows = (prompts ?? []) as { brand_id: string | null; platform: string | null; prompt: string }[];
  const pick = (b: string | null, p: string | null) => rows.find((r) => r.brand_id === b && r.platform === p)?.prompt;
  const prompt = (brandId ? (pick(brandId, platform) ?? pick(brandId, null)) : undefined)
    ?? pick(null, platform) ?? pick(null, null) ?? FALLBACK_PROMPT;

  // ── รูปของแพลตฟอร์มนี้ → base64 (ไม่พึ่งให้ OpenAI ยิงเข้าเว็บเรา) ──
  const imgMap = (content.platform_images ?? {}) as Record<string, string[]>;
  const keys = (imgMap[platform] ?? []).filter(Boolean).slice(0, MAX_IMAGES);
  const images: string[] = [];
  for (const k of keys) {
    try {
      const obj = await r2GetObject(k);
      if (!obj) continue;
      const buf = Buffer.from(await new Response(obj.body as ReadableStream).arrayBuffer());
      const mime = obj.httpMetadata?.contentType || "image/jpeg";
      images.push(`data:${mime};base64,${buf.toString("base64")}`);
    } catch { /* รูปไหนอ่านไม่ได้ก็ข้าม */ }
  }

  // ── ประกอบคำสั่ง ──
  const facts = [
    content.title ? `ชื่อคอนเทนต์: ${content.title}` : "",
    brand?.name ? `แบรนด์: ${brand.name}` : "",
    content.post_type ? `ประเภทโพสต์: ${content.post_type}` : "",
    `แพลตฟอร์ม: ${platform}`,
    (cap?.hashtags ?? "").trim() ? `แฮชแท็กที่ผู้ใช้ใส่ไว้ (ใช้เป็นบริบท): ${cap!.hashtags}` : "",
    (content.note ?? "").trim() ? `โน้ตเพิ่มเติม: ${content.note}` : "",
    (body.extra ?? "").trim() ? `คำสั่งเพิ่มจากผู้ใช้: ${body.extra}` : "",
  ].filter(Boolean).join("\n");

  const userContent: Record<string, unknown>[] = [
    { type: "text", text: `${facts}\n\nตอบเป็น JSON: {"caption": "...", "hashtags": ["#...", "#..."]}\n- caption = แคปชั่นภาษาไทย (ไม่ต้องมีแฮชแท็ก)\n- hashtags = แฮชแท็กที่แนะนำเพิ่ม 5-10 อัน (ภาษาไทย/อังกฤษผสมได้ ไม่ซ้ำกับที่ผู้ใช้ใส่มา)${images.length === 0 ? "\n(หมายเหตุ: ไม่มีรูปแนบ — เขียนจากข้อมูลข้อความเท่านั้น)" : ""}` },
    ...images.map((url) => ({ type: "image_url", image_url: { url, detail: "low" } })),
  ];

  // ── เรียก OpenAI ──
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        max_tokens: 700,
        messages: [{ role: "system", content: prompt }, { role: "user", content: userContent }],
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (j?.error?.message as string) || `HTTP ${res.status}`;
      return NextResponse.json({ error: `AI ตอบกลับไม่สำเร็จ: ${msg}` }, { status: 502 });
    }
    let parsed: { caption?: string; hashtags?: unknown } = {};
    try { parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}"); } catch { /* ตอบไม่เป็น JSON */ }
    const caption = String(parsed.caption ?? "").trim();
    if (!caption) return NextResponse.json({ error: "AI ไม่ได้ส่งแคปชั่นกลับมา — ลองกดอีกครั้ง" }, { status: 502 });
    const tags = Array.isArray(parsed.hashtags)
      ? [...new Set((parsed.hashtags as unknown[]).map((x) => String(x).trim()).filter(Boolean).map((x) => (x.startsWith("#") ? x : `#${x}`)))].slice(0, 12)
      : [];

    // บันทึกประวัติ (มีค่าใช้จ่าย → ต้องรู้ว่าใครกด)
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    await writeAudit(admin, { action: "ai_caption", entityType: "creative_content", entityId: contentId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { platform, images: images.length, model: MODEL } });

    return NextResponse.json({ caption, hashtags: tags, images_used: images.length, model: MODEL, error: null });
  } catch (e) {
    return NextResponse.json({ error: `เรียก AI ไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 });
  }
}
