/**
 * /api/ai/brand-profile-draft — ให้ AI ร่างการ์ดรู้จักแบรนด์จากข้อมูลที่ระบบมีอยู่แล้ว (ยังไม่บันทึก · ผู้ใช้ตรวจแก้แล้วกดบันทึกเอง)
 *   POST { brand_id } → { draft: { about, customers, usps, tone, competitors, donts }, examples: string[] (แคปชั่นเก่าที่ AI เลือก), model }
 *   ข้อมูลที่ส่งให้ AI: ชื่อแบรนด์ · ช่องทางร้าน · โทนแคปชั่นที่ตั้งไว้ · prompt AI ของแบรนด์ · ชื่อสินค้าเด่น/สินค้าตัวอย่าง · แคปชั่นเก่า
 *   ไม่รู้ = เขียนเป็นช่องให้เติมในวงเล็บเหลี่ยม [ ] — ห้ามแต่งข้อเท็จจริง · ไม่ส่งรูป ≈ 0.2 บาท/ครั้ง
 * สิทธิ์: ai.caption + tasks.approve (คนแก้การ์ดได้เท่านั้น) · audit ai_brand_profile_draft
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { chatJson, loadPromptRows, openAiKey, productDetailModel } from "@/lib/ai-caption";
import { isUuid } from "@/lib/marketing/sku-list";
import { BRAND_PROFILE_FIELDS, BRAND_PROFILE_MAX_EXAMPLES } from "@/lib/marketing/brand-profile";
import { brandHighlights, recentBrandCaptions } from "@/lib/marketing/brand-profile-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const str = (v: unknown, n = 1500) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  if (!(await apiCan(request, "ai.caption")))
    return NextResponse.json({ error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI (ai.caption)" }, { status: 401 });
  if (!(await apiCan(request, "tasks.approve")))
    return NextResponse.json({ error: "ต้องเป็นหัวหน้า/ผู้ดูแลจึงแก้การ์ดรู้จักแบรนด์ได้ (tasks.approve)" }, { status: 401 });
  if (!openAiKey()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel แล้ว redeploy" }, { status: 400 });
  let body: { brand_id?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!isUuid(body.brand_id)) return NextResponse.json({ error: "เลือกแบรนด์ก่อน" }, { status: 400 });
  const brandId = body.brand_id as string;

  const admin = supabaseAdmin();
  const [{ data: brand }, { data: capCfg }, promptRows, highlights, { data: products }, captions] = await Promise.all([
    admin.from("brands").select("name, shop_channels").eq("id", brandId).maybeSingle(),
    admin.from("ui_config").select("value").eq("key", "creative_caption_config").maybeSingle(),
    loadPromptRows(),
    brandHighlights(admin, brandId),
    admin.from("marketing_sku_overview").select("name_th").eq("brand_id", brandId).order("marketing_updated_at", { ascending: false, nullsFirst: false }).limit(40),
    recentBrandCaptions(admin, brandId, 12),
  ]);
  const brandName = (brand as { name?: string } | null)?.name ?? "แบรนด์";
  const shops = (((brand as { shop_channels?: { label?: string; value?: string }[] } | null)?.shop_channels) ?? [])
    .map((s) => [s.label, s.value].filter(Boolean).join(": ")).filter(Boolean).slice(0, 8);
  const tone = str(((capCfg as { value?: { prompt_by_brand?: Record<string, string> } } | null)?.value?.prompt_by_brand ?? {})[brandId], 1500);
  const brandPrompts = promptRows.filter((r) => r.brand_id === brandId && r.prompt.trim())
    .map((r) => `[${r.platform ?? "ทุกงาน"}] ${str(r.prompt, 700)}`).slice(0, 6);
  const productNames = [...new Set(((products ?? []) as { name_th: string | null }[]).map((p) => (p.name_th ?? "").trim()).filter(Boolean))].slice(0, 30);

  const facts = [
    `แบรนด์: ${brandName}`,
    shops.length ? `ช่องทางร้าน: ${shops.join(" · ")}` : "",
    highlights.length ? `สินค้าเด่นตอนนี้ (ป้าย NEW IN / Hero): ${highlights.join(", ")}` : "",
    productNames.length ? `ชื่อสินค้าตัวอย่างของแบรนด์: ${productNames.join(", ")}` : "",
    tone ? `โทนแคปชั่นที่ทีมตั้งไว้:\n${tone}` : "",
    brandPrompts.length ? `คำสั่ง AI ที่ทีมตั้งไว้ให้แบรนด์นี้:\n${brandPrompts.join("\n")}` : "",
    captions.length ? `แคปชั่นเก่าของแบรนด์ (i = ลำดับ):\n${captions.map((c, i) => `${i}) [${c.platform}] ${c.caption.replace(/\s*\n\s*/g, " / ").slice(0, 400)}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  const fields = BRAND_PROFILE_FIELDS.map((f) => `"${f.key}": "${f.label} — ${f.hint}"`).join(", ");

  const model = await productDetailModel();
  let out: Record<string, unknown>;
  try {
    out = await chatJson(
      "คุณคือนักวางกลยุทธ์แบรนด์ ช่วยสรุปข้อมูลแบรนด์จากข้อมูลที่ให้เท่านั้น ตอบเป็น JSON ตามรูปแบบที่ขอ",
      [{ type: "text", text: [
        facts, "",
        "ร่าง \"การ์ดรู้จักแบรนด์\" เป็นภาษาไทย สั้น กระชับ ใช้เป็นบริบทให้ AI ตัวอื่นเขียนคอนเทนต์",
        `ตอบ JSON: {${fields}, "example_idx": [ลำดับแคปชั่นเก่าที่โทนดีที่สุด ไม่เกิน ${BRAND_PROFILE_MAX_EXAMPLES} อัน]}`,
        "- สรุปจากข้อมูลข้างบนเท่านั้น ห้ามแต่งข้อเท็จจริงเอง (ปีก่อตั้ง ตัวเลข การรับประกัน วัสดุ รางวัล ชื่อคู่แข่ง)",
        "- ส่วนที่ข้อมูลไม่พอ ให้เขียนเป็นช่องให้ทีมเติมในวงเล็บเหลี่ยม เช่น [ใส่ชื่อคู่แข่ง 2–3 ราย] หรือ [ยืนยัน: รับประกันกี่ปี?]",
        "- จุดขาย/ข้อห้าม เขียนเป็นข้อสั้น ๆ คั่นด้วย \" · \"",
      ].join("\n") }],
      1500, model,
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  const draft = Object.fromEntries(BRAND_PROFILE_FIELDS.map((f) => [f.key, str(out[f.key])]));
  const exampleIdx = (Array.isArray(out.example_idx) ? out.example_idx : []).map(Number)
    .filter((i) => Number.isInteger(i) && i >= 0 && i < captions.length).slice(0, BRAND_PROFILE_MAX_EXAMPLES);

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "ai_brand_profile_draft", entityType: "brands", entityId: brandId, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { model, captions: captions.length, products: productNames.length },
  });
  return NextResponse.json({ draft, examples: exampleIdx.map((i) => captions[i].caption), model, error: null });
}
