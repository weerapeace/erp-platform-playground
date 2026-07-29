/**
 * /api/ai/caption-all — ให้ AI เขียนแคปชั่น "ทุกแพลตฟอร์มในคอนเทนต์นี้" รอบเดียว
 *   POST { content_id, platforms?: string[], overwrite?: boolean, extra?: string, apply?: boolean }
 *     → { results: [{ platform, caption, hashtags[] }], calls, skipped, images_used }
 *
 * ประหยัด token: รูปคือส่วนที่กิน token มากที่สุด → จับกลุ่มแพลตฟอร์มที่ใช้ "ชุดรูปเดียวกัน"
 * แล้วยิง 1 ครั้งต่อกลุ่ม (ปกติทุกแพลตฟอร์มใช้รูปชุดเดียวกัน = ยิงครั้งเดียว) โดยส่ง prompt
 * ของแต่ละแพลตฟอร์มไปพร้อมกัน แล้วให้ตอบเป็น JSON แยกตามแพลตฟอร์ม
 *
 * สิทธิ์: ai.caption (มีค่าใช้จ่ายต่อครั้ง)
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { CAPTION_MODEL, chatJson, imageParts, imagesToDataUrls, loadPromptRows, normalizeHashtags, openAiKey, pickPrompt, resolveImageKeys } from "@/lib/ai-caption";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;   // อ่านรูป + เขียนหลายแพลตฟอร์ม ใช้เวลาสักหน่อย

type Out = { platform: string; caption: string; hashtags: string[] };

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "ai.caption")))
    return NextResponse.json({ error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI เขียนแคปชั่น (ai.caption) — ขอสิทธิ์จากผู้ดูแลระบบ" }, { status: 401 });
  if (!openAiKey())
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel (Settings → Environment Variables) แล้ว redeploy" }, { status: 400 });

  let body: { content_id?: string; platforms?: string[]; overwrite?: boolean; extra?: string; apply?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const contentId = (body.content_id ?? "").trim();
  if (!contentId) return NextResponse.json({ error: "ต้องระบุ content_id" }, { status: 400 });
  const overwrite = body.overwrite !== false;
  const extra = (body.extra ?? "").trim();     // คำสั่งเพิ่มจากผู้ใช้ครั้งนี้ (ไม่บันทึกถาวร)
  const apply = body.apply === true;            // true = เขียนลง DB ให้เลย (ใช้ตอนสั่งรวบจากหน้ารายการ)

  const admin = supabaseAdmin();
  const { data: content } = await admin.from("erp_creative_content")
    .select("id, title, post_type, brand_id, note, platforms, platform_images, task_id").eq("id", contentId).maybeSingle();
  if (!content) return NextResponse.json({ error: "ไม่พบคอนเทนต์" }, { status: 404 });

  const brandId = (content.brand_id as string | null) ?? null;
  const { data: brand } = brandId ? await admin.from("brands").select("name").eq("id", brandId).maybeSingle() : { data: null };
  const { data: capRows } = await admin.from("erp_creative_content_captions").select("platform, caption, hashtags").eq("content_id", contentId);
  const caps = (capRows ?? []) as { platform: string; caption: string | null; hashtags: string | null }[];

  // ── แพลตฟอร์มที่จะเขียน: ตามที่ส่งมา (หรือทั้งหมดในคอนเทนต์) · ตัดตัวที่ปิดแคปชั่นไว้ · ถ้าไม่ทับ = ข้ามช่องที่มีข้อความแล้ว ──
  // ตั้งค่าต่อแพลตฟอร์มเก็บใน ui_config(key='creative_platform_settings') — ไม่ใช่ตาราง
  const { data: psCfg } = await admin.from("ui_config").select("value").eq("key", "creative_platform_settings").maybeSingle();
  const psAll = ((psCfg as { value?: Record<string, { use_caption?: boolean }> } | null)?.value ?? {});
  const capOff = new Set(Object.entries(psAll).filter(([, v]) => v?.use_caption === false).map(([k]) => k));
  const wanted = (body.platforms?.length ? body.platforms : ((content.platforms as string[] | null) ?? caps.map((c) => c.platform))).filter(Boolean);
  const skipped: { platform: string; reason: string }[] = [];
  const targets = wanted.filter((p) => {
    if (capOff.has(p)) { skipped.push({ platform: p, reason: "ปิดแคปชั่นแพลตฟอร์มนี้" }); return false; }
    if (!overwrite && (caps.find((c) => c.platform === p)?.caption ?? "").trim()) { skipped.push({ platform: p, reason: "มีแคปชั่นอยู่แล้ว" }); return false; }
    return true;
  });
  if (targets.length === 0) return NextResponse.json({ results: [], calls: 0, skipped, images_used: 0, error: null });

  // ── จับกลุ่มตามชุดรูป (คีย์เดียวกัน = ยิงรอบเดียวพอ) ──
  const groups = new Map<string, { keys: string[]; platforms: string[] }>();
  for (const p of targets) {
    const { keys } = await resolveImageKeys(content as { id: string; task_id?: string | null; platform_images?: unknown }, p);
    const sig = keys.join("|");
    const g = groups.get(sig) ?? { keys, platforms: [] };
    g.platforms.push(p);
    groups.set(sig, g);
  }

  const promptRows = await loadPromptRows();
  const facts = [
    content.title ? `ชื่อคอนเทนต์: ${content.title}` : "",
    brand?.name ? `แบรนด์: ${brand.name}` : "",
    content.post_type ? `ประเภทโพสต์: ${content.post_type}` : "",
    (content.note ?? "").toString().trim() ? `โน้ตเพิ่มเติม: ${content.note}` : "",
    extra ? `คำสั่งเพิ่มจากผู้ใช้ครั้งนี้ (สำคัญ ทำตามนี้ด้วย): ${extra}` : "",
  ].filter(Boolean).join("\n");

  const results: Out[] = [];
  let calls = 0, imagesUsed = 0;
  try {
    for (const g of groups.values()) {
      const urls = await imagesToDataUrls(g.keys);
      imagesUsed += urls.length;
      // แต่ละแพลตฟอร์มมี prompt ของตัวเอง → ใส่เป็นบล็อกแยก แล้วสั่งให้ตอบเป็น JSON ต่อแพลตฟอร์ม
      const blocks = g.platforms.map((p) => {
        const tags = (caps.find((c) => c.platform === p)?.hashtags ?? "").trim();
        return `### แพลตฟอร์ม: ${p}\nคำสั่งเฉพาะแพลตฟอร์มนี้: ${pickPrompt(promptRows, brandId, p)}${tags ? `\nแฮชแท็กที่ผู้ใช้ใส่ไว้ (ใช้เป็นบริบท ห้ามซ้ำเวลาแนะเพิ่ม): ${tags}` : ""}`;
      }).join("\n\n");
      const ask = `${facts}\n\n${blocks}\n\nเขียนแคปชั่นให้ครบทุกแพลตฟอร์มข้างต้น โดยแต่ละอันต้องทำตาม "คำสั่งเฉพาะแพลตฟอร์มนี้" ของตัวเอง และเนื้อหาไม่ควรเหมือนกันเป๊ะทุกแพลตฟอร์ม\nตอบเป็น JSON เท่านั้น รูปแบบ: {"platforms": {"<ชื่อแพลตฟอร์ม>": {"caption": "...", "hashtags": ["#...", "#..."]}}}\n- caption = ข้อความโพสต์ (ไม่ต้องมีแฮชแท็กอยู่ในนี้)\n- hashtags = แฮชแท็กที่แนะนำเพิ่ม 5-10 อัน${urls.length === 0 ? "\n(หมายเหตุ: ไม่มีรูปแนบ — เขียนจากข้อมูลข้อความเท่านั้น)" : ""}`;

      const parsed = await chatJson(
        "คุณเป็นนักเขียนแคปชั่นการตลาดมืออาชีพ เขียนตามคำสั่งของแต่ละแพลตฟอร์มอย่างเคร่งครัด ห้ามแต่งข้อมูลที่ไม่เห็นในรูปหรือไม่มีในข้อมูลที่ให้",
        [{ type: "text", text: ask }, ...imageParts(urls)],
        400 + g.platforms.length * 350,
      );
      calls++;
      const perPlat = (parsed.platforms ?? parsed) as Record<string, { caption?: string; hashtags?: unknown }>;
      for (const p of g.platforms) {
        const hit = perPlat?.[p] ?? perPlat?.[p.toLowerCase()];
        const caption = String(hit?.caption ?? "").trim();
        if (!caption) { skipped.push({ platform: p, reason: "AI ไม่ได้ส่งข้อความกลับมา" }); continue; }
        results.push({ platform: p, caption, hashtags: normalizeHashtags(hit?.hashtags) });
      }
    }
  } catch (e) {
    // ถ้าล้มกลางทาง ยังคืนอันที่สำเร็จไปให้ใช้ได้ + บอกเหตุผล
    if (results.length === 0) return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    return NextResponse.json({ results, calls, skipped, images_used: imagesUsed, warning: (e as Error).message, error: null });
  }

  // ── apply = เขียนลง DB ให้เลย (สั่งรวบจากหน้ารายการ ไม่มีฟอร์มให้กดบันทึก) ──
  let saved = 0;
  if (apply) {
    for (const res of results) {
      const cur = caps.find((c) => c.platform === res.platform);
      const old = (cur?.hashtags ?? "").trim();
      const have = new Set(old.split(/\s+/).filter(Boolean).map((x) => x.toLowerCase()));
      const add = res.hashtags.filter((h) => !have.has(h.toLowerCase()));
      const hashtags = [old, ...add].filter(Boolean).join(" ");
      const row = { caption: res.caption, hashtags, updated_at: new Date().toISOString() };
      const { error } = cur
        ? await admin.from("erp_creative_content_captions").update(row).eq("content_id", contentId).eq("platform", res.platform)
        : await admin.from("erp_creative_content_captions").insert({ content_id: contentId, platform: res.platform, ...row });
      if (!error) saved++;
    }
  }

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "ai_caption_all", entityType: "creative_content", entityId: contentId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { platforms: results.map((r) => r.platform), calls, images: imagesUsed, model: CAPTION_MODEL, applied: saved, extra: extra || null } });

  return NextResponse.json({ results, calls, skipped, images_used: imagesUsed, saved, model: CAPTION_MODEL, error: null });
}
