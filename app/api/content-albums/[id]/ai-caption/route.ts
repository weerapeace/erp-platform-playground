/**
 * POST /api/content-albums/[id]/ai-caption  body = { extra? } → { caption, hashtags[], images_used }
 *
 * ให้ AI ร่าง "แคปชั่นร่าง" ของอัลบั้ม Contents จากรูปที่เลือกใช้ (ไม่เลือก = รูปแรก ๆ ของอัลบั้ม) + การ์ดรู้จักแบรนด์ + สินค้าที่แท็ก
 * ไม่บันทึกเอง — หน้าจอเอาไปใส่ช่องแคปชั่นร่างให้ตรวจแล้วกดบันทึก
 * ของกลาง: lib/ai-caption (prompt 4 ระดับ · อ่านรูป R2 · chatJson) + brandProfileBlock (ปุ่ม AI ใหม่ต้องใส่การ์ดแบรนด์)
 * สิทธิ์ ai.caption (มีค่าใช้จ่าย) · audit ai_caption (นับเข้าการ์ดค่าใช้จ่าย AI เดิม)
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { CAPTION_MODEL, chatJson, imageParts, imagesToDataUrls, loadPromptRows, normalizeHashtags, openAiKey, pickPrompt } from "@/lib/ai-caption";
import { brandProfileBlock } from "@/lib/marketing/brand-profile-server";
import { loadContentAlbums, loadAlbumFiles } from "@/lib/content-albums-server";
import { isUuid } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const ALBUM_AI_IMAGES = 4;   // รูปคือส่วนที่กิน token มากสุด — อัลบั้มส่ง 4 รูปพอเห็นภาพรวม

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await apiCan(request, "ai.caption")))
    return NextResponse.json({ error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI เขียนแคปชั่น (ai.caption) — ขอสิทธิ์จากผู้ดูแลระบบ" }, { status: 401 });
  if (!openAiKey())
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel แล้ว redeploy" }, { status: 400 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
  let body: { extra?: string };
  try { body = await request.json(); } catch { body = {}; }

  const admin = supabaseAdmin();
  const [album] = await loadContentAlbums(admin, { ids: [id] });
  if (!album) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
  const files = await loadAlbumFiles(admin, id, album.picked_asset_ids, album.file_order);
  // อ่านได้เฉพาะรูปย่อ/ภาพปกใน R2 (ไฟล์ที่ไม่มีรูปย่อ = drive:<id> ข้าม)
  const pool = (album.picked_asset_ids.length ? files.filter((f) => f.picked) : files).filter((f) => !f.r2_key.startsWith("drive:"));
  const images = await imagesToDataUrls(pool.slice(0, ALBUM_AI_IMAGES).map((f) => f.r2_key));

  const platform = album.planned_platforms.length === 1 ? album.planned_platforms[0] : "";
  const [prompt, brandCard] = await Promise.all([loadPromptRows().then((rows) => pickPrompt(rows, album.brand_id, platform)), brandProfileBlock(admin, album.brand_id)]);
  const facts = [
    `ชื่ออัลบั้ม (ชุดถ่าย): ${album.name}`,
    album.brand_name ? `แบรนด์: ${album.brand_name}` : "",
    brandCard,
    album.products.length ? `สินค้าในรูป: ${album.products.map((p) => `${p.code} ${p.name}`.trim()).join(", ")}` : "",
    album.planned_platforms.length ? `จะลงที่: ${album.planned_platforms.join(", ")} (เขียนแคปชั่นกลางที่ใช้ได้ทุกแพลตฟอร์ม)` : "",
    files.some((f) => f.asset_type === "video") ? "อัลบั้มนี้มีวิดีโอด้วย" : "",
    (album.description ?? "").trim() ? `โน้ตของทีม: ${album.description}` : "",
    (body.extra ?? "").trim() ? `คำสั่งเพิ่มจากผู้ใช้: ${body.extra}` : "",
  ].filter(Boolean).join("\n");
  const ask = `${facts}\n\nตอบเป็น JSON: {"caption": "...", "hashtags": ["#...", "#..."]}\n- caption = แคปชั่นภาษาไทย (ไม่ต้องมีแฮชแท็ก)\n- hashtags = แฮชแท็กที่แนะนำ 5-10 อัน${images.length === 0 ? "\n(หมายเหตุ: ไม่มีรูปที่อ่านได้ — เขียนจากข้อมูลข้อความเท่านั้น)" : ""}`;
  try {
    const parsed = await chatJson(prompt, [{ type: "text", text: ask }, ...imageParts(images)], 700);
    const caption = String(parsed.caption ?? "").trim();
    if (!caption) return NextResponse.json({ error: "AI ไม่ได้ส่งแคปชั่นกลับมา — ลองกดอีกครั้ง" }, { status: 502 });
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    await writeAudit(admin, { action: "ai_caption", entityType: "content_album", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { album: album.name, images: images.length, model: CAPTION_MODEL } });
    return NextResponse.json({ caption, hashtags: normalizeHashtags(parsed.hashtags), images_used: images.length, error: null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
