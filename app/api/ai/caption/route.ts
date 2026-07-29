/**
 * /api/ai/caption — ให้ AI เขียนแคปชั่น "ช่องเดียว" จากรูปที่แนบ + แฮชแท็ก + ข้อมูลคอนเทนต์
 *   POST { content_id, platform, extra? } → { caption, hashtags: string[] }
 *
 * สิทธิ์: ต้องมี ai.caption (มีค่าใช้จ่ายต่อการเรียก → ไม่เปิดให้ทุกคน)
 * ต้องตั้ง env OPENAI_API_KEY (ยังไม่ตั้ง = ตอบข้อความบอกวิธีอย่างชัดเจน ไม่พังเงียบ)
 * prompt / การอ่านรูป / การเรียก OpenAI ใช้ของกลาง lib/ai-caption.ts ร่วมกับ /api/ai/caption-all
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { CAPTION_MODEL, chatJson, imageParts, imagesToDataUrls, loadPromptRows, normalizeHashtags, openAiKey, pickPrompt } from "@/lib/ai-caption";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;   // เรียก AI + อ่านรูป ใช้เวลาสักหน่อย

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── สิทธิ์: เฉพาะคนที่ได้รับอนุญาตให้ใช้ AI ──
  if (!(await apiCan(request, "ai.caption")))
    return NextResponse.json({ error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI เขียนแคปชั่น (ai.caption) — ขอสิทธิ์จากผู้ดูแลระบบ" }, { status: 401 });
  if (!openAiKey())
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel (Settings → Environment Variables) แล้ว redeploy" }, { status: 400 });

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
  const prompt = pickPrompt(await loadPromptRows(), brandId, platform);

  // ── รูปของแพลตฟอร์มนี้ → base64 ──
  const imgMap = (content.platform_images ?? {}) as Record<string, string[]>;
  const images = await imagesToDataUrls(imgMap[platform] ?? []);

  const facts = [
    content.title ? `ชื่อคอนเทนต์: ${content.title}` : "",
    brand?.name ? `แบรนด์: ${brand.name}` : "",
    content.post_type ? `ประเภทโพสต์: ${content.post_type}` : "",
    `แพลตฟอร์ม: ${platform}`,
    (cap?.hashtags ?? "").trim() ? `แฮชแท็กที่ผู้ใช้ใส่ไว้ (ใช้เป็นบริบท): ${cap!.hashtags}` : "",
    (content.note ?? "").toString().trim() ? `โน้ตเพิ่มเติม: ${content.note}` : "",
    (body.extra ?? "").trim() ? `คำสั่งเพิ่มจากผู้ใช้: ${body.extra}` : "",
  ].filter(Boolean).join("\n");

  const ask = `${facts}\n\nตอบเป็น JSON: {"caption": "...", "hashtags": ["#...", "#..."]}\n- caption = แคปชั่นภาษาไทย (ไม่ต้องมีแฮชแท็ก)\n- hashtags = แฮชแท็กที่แนะนำเพิ่ม 5-10 อัน (ภาษาไทย/อังกฤษผสมได้ ไม่ซ้ำกับที่ผู้ใช้ใส่มา)${images.length === 0 ? "\n(หมายเหตุ: ไม่มีรูปแนบ — เขียนจากข้อมูลข้อความเท่านั้น)" : ""}`;

  try {
    const parsed = await chatJson(prompt, [{ type: "text", text: ask }, ...imageParts(images)], 700);
    const caption = String(parsed.caption ?? "").trim();
    if (!caption) return NextResponse.json({ error: "AI ไม่ได้ส่งแคปชั่นกลับมา — ลองกดอีกครั้ง" }, { status: 502 });

    // บันทึกประวัติ (มีค่าใช้จ่าย → ต้องรู้ว่าใครกด)
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    await writeAudit(admin, { action: "ai_caption", entityType: "creative_content", entityId: contentId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { platform, images: images.length, model: CAPTION_MODEL } });

    return NextResponse.json({ caption, hashtags: normalizeHashtags(parsed.hashtags), images_used: images.length, model: CAPTION_MODEL, error: null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
