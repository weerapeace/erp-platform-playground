/**
 * /api/ai/product-detail — ให้ AI "คิดรายละเอียดสินค้า" จากรูป + ข้อมูลที่มีอยู่
 *   POST { parent_id, extra? } → { data: { name_th, introduction, description, name_en, introduction_en, english_description, image_count } }
 *
 * เขียนให้ 6 ช่อง (ไทย+อังกฤษพร้อมกัน)
 * ขนาด/น้ำหนัก: อ่านได้เฉพาะตัวเลขที่ "เขียนอยู่ในรูป" (รูปสเปค/อินโฟกราฟิก) — ห้ามกะจากสายตาเด็ดขาด
 * ขนาดที่กรอกไว้แล้วจะส่งไปเป็นข้อมูลประกอบ ให้ AI เขียนถึงได้ถูกต้อง
 *
 * สิทธิ์: ai.caption (สิทธิ์ "ใช้ AI ที่มีค่าใช้จ่าย" ตัวเดียวกับเขียนแคปชั่น)
 * prompt: ใช้ทะเบียน prompt 4 ระดับตัวเดิม โดยใช้ platform = "product_detail"
 *         → ตั้งคำสั่งแยกรายแบรนด์ได้ที่หน้า งาน → ตั้งค่า → คำสั่ง AI
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { CAPTION_MODEL, chatJson, imageParts, imagesToDataUrls, loadPromptRows, openAiKey, pickPrompt } from "@/lib/ai-caption";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

/** งานชนิดนี้ในทะเบียน prompt (ใช้ช่อง platform ร่วมกับแคปชั่น) */
export const PRODUCT_DETAIL_KEY = "product_detail";

const MAX_IMG = 10;   // เจ้าของขอ 10 รูป — รูปสเปค/อินโฟกราฟิกมักอยู่รูปท้าย ๆ ถ้าตัดที่ 4 จะไม่เห็นตัวเลขขนาด

const FALLBACK = [
  "คุณคือนักเขียนรายละเอียดสินค้าสำหรับร้านค้าออนไลน์ไทย (Shopee/Lazada/TikTok)",
  "เขียนจากสิ่งที่เห็นในรูปและข้อมูลที่ให้มาเท่านั้น ห้ามแต่งคุณสมบัติที่ไม่เห็น เช่น วัสดุแท้/กันน้ำ/มาตรฐาน ถ้าไม่มีข้อมูล",
  "ห้ามใส่ราคา",
  "โทนสุภาพ อ่านง่าย ชวนซื้อแต่ไม่โฆษณาเกินจริง",
].join(" · ");

type Body = { parent_id?: string; extra?: string };

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "ai.caption")))
    return NextResponse.json({ error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI (ai.caption) — ขอสิทธิ์จากผู้ดูแลระบบ" }, { status: 401 });
  if (!openAiKey())
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel (Settings → Environment Variables) แล้ว redeploy" }, { status: 400 });

  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const parentId = (body.parent_id ?? "").trim();
  const extra = (body.extra ?? "").trim().slice(0, 500);
  if (!parentId) return NextResponse.json({ error: "ต้องระบุ parent_id" }, { status: 400 });

  const admin = supabaseAdmin();

  // ── ข้อมูลสินค้าที่มีอยู่ (ใช้เป็นบริบท ไม่ใช่ให้ AI ลอก) ──
  const { data: p } = await admin.from("parent_skus_v2")
    .select("id, code, name_th, name_en, introduction, description, english_description, brand_id, platform_category_id, cover_image_r2_key, size_length_cm, size_height_cm, size_thickness_cm, custom_size, weight_g, warranty")
    .eq("id", parentId).maybeSingle();
  if (!p) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });

  const brandId = (p.brand_id as string | null) ?? null;
  const [{ data: brand }, { data: cat }] = await Promise.all([
    brandId ? admin.from("brands").select("name").eq("id", brandId).maybeSingle() : Promise.resolve({ data: null }),
    p.platform_category_id ? admin.from("platform_categories").select("name").eq("id", p.platform_category_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  // ── รูปให้ AI ดู — ไล่ 4 ชั้นจนครบเพดาน (ของจริงแกลเลอรี Parent มักมีแค่ 1 รูป
  //    ถ้าดึงชั้นเดียว AI จะไม่มีวันเห็นรูปสเปคที่เขียนขนาดไว้) ──
  //    ① รูปปก ② แกลเลอรี Parent ③ รูป Description (มักเป็นรูปสเปค/อินโฟกราฟิก) ④ รูปของ SKU ลูก
  const assetIdsInOrder: string[] = [];
  const pushUsages = (rows: { asset_id: string | null }[] | null) => {
    for (const r of rows ?? []) if (r.asset_id && !assetIdsInOrder.includes(r.asset_id)) assetIdsInOrder.push(r.asset_id);
  };
  const [uParent, uDesc] = await Promise.all([
    admin.from("asset_usages").select("asset_id, sort_order").eq("module", "parent_sku").eq("record_id", parentId)
      .order("sort_order", { ascending: true }).limit(MAX_IMG),
    admin.from("asset_usages").select("asset_id, sort_order").eq("module", "parent_sku_description").eq("record_id", parentId)
      .order("sort_order", { ascending: true }).limit(MAX_IMG),
  ]);
  pushUsages(uParent.data);
  pushUsages(uDesc.data);

  if (assetIdsInOrder.length < MAX_IMG) {
    const { data: kids } = await admin.from("skus_v2").select("id").eq("parent_sku_id", parentId).limit(MAX_IMG);
    const kidIds = ((kids ?? []) as { id: string }[]).map((k) => k.id);
    if (kidIds.length) {
      const { data: uKids } = await admin.from("asset_usages").select("asset_id, sort_order")
        .eq("module", "product_sku").in("record_id", kidIds)
        .order("sort_order", { ascending: true }).limit(MAX_IMG);
      pushUsages(uKids);
    }
  }

  let keys: string[] = [];
  if (assetIdsInOrder.length) {
    const { data: assets } = await admin.from("assets").select("id, r2_key").in("id", assetIdsInOrder.slice(0, MAX_IMG * 2));
    const byId = new Map(((assets ?? []) as { id: string; r2_key: string | null }[]).map((a) => [a.id, a.r2_key]));
    keys = assetIdsInOrder.map((id) => byId.get(id)).filter((k): k is string => !!k);
  }
  const cover = (p.cover_image_r2_key as string | null) ?? null;
  if (cover) keys = [cover, ...keys.filter((k) => k !== cover)];
  keys = [...new Set(keys)].slice(0, MAX_IMG);
  const images = keys.length ? await imagesToDataUrls(keys) : [];

  // ── คำสั่ง (prompt) — เจาะจงรายแบรนด์ชนะค่ากลาง ──
  const custom = pickPrompt(await loadPromptRows(), brandId, PRODUCT_DETAIL_KEY);
  const system = [
    custom || FALLBACK,
    "",
    "ตอบเป็น JSON เท่านั้น ตามรูปแบบนี้ (ทุกช่องเป็นข้อความ):",
    `{"name_th":"ชื่อสินค้าภาษาไทย สั้น กระชับ ไม่เกิน 80 ตัวอักษร ไม่ต้องใส่รหัสสินค้า",`,
    `"introduction":"โปรยเปิด 1-3 บรรทัด บอกว่าสินค้านี้คืออะไร เหมาะกับใคร",`,
    `"description":"รายละเอียด 3-6 บรรทัด ขึ้นต้นแต่ละบรรทัดด้วย '- ' บอกวัสดุที่เห็น ช่องเก็บของ จุดเด่น การใช้งาน",`,
    `"name_en":"ชื่อสินค้าภาษาอังกฤษ (เขียนใหม่ให้เป็นธรรมชาติ ไม่ใช่แปลตรงตัว)",`,
    `"introduction_en":"โปรยเปิดภาษาอังกฤษ ความหมายตรงกับภาษาไทย",`,
    `"english_description":"รายละเอียดภาษาอังกฤษ ขึ้นต้นแต่ละบรรทัดด้วย '- ' ความหมายตรงกับภาษาไทย",`,
    `"sizes":{"size_length_cm":ตัวเลขหรือ null,"size_height_cm":ตัวเลขหรือ null,"size_thickness_cm":ตัวเลขหรือ null,"weight_g":ตัวเลขหรือ null,"warranty":"ข้อความหรือ null","source":"บอกสั้น ๆ ว่าอ่านตัวเลขมาจากไหน เช่น 'รูปที่ 3 เขียนว่า 34*22*12 cm'"}}`,
    "",
    "กติกาเรื่องขนาด (สำคัญมาก):",
    "- ใส่ตัวเลขใน sizes ได้เฉพาะเมื่อ 'มีตัวเลขเขียนอยู่ในรูป' เช่น รูปสเปค อินโฟกราฟิก ป้ายวัดขนาด ตารางไซซ์ หรือมีให้ในข้อมูลด้านล่าง",
    "- ห้ามกะ/ประมาณ/เดาขนาดหรือน้ำหนักจากสายตาเด็ดขาด — ถ้าไม่มีตัวเลขเขียนไว้ ให้ใส่ null ทุกช่อง และ source ว่า 'ไม่พบตัวเลขในรูป'",
    "- หน่วยต้องแปลงเป็น: เซนติเมตร (cm) สำหรับขนาด และ กรัม (g) สำหรับน้ำหนัก · ถ้าในรูปเป็นนิ้ว/มม./กก. ให้แปลงก่อน",
    "- ในข้อความ Description ห้ามใส่ตัวเลขขนาดที่ไม่ได้มาจากรูปหรือข้อมูลที่ให้ไว้",
    "",
    "ห้ามใส่คีย์อื่นนอกจากนี้",
  ].join("\n");

  const sizeTxt = [
    p.size_length_cm && `กว้าง ${p.size_length_cm} ซม.`,
    p.size_height_cm && `สูง ${p.size_height_cm} ซม.`,
    p.size_thickness_cm && `หนา ${p.size_thickness_cm} ซม.`,
    p.custom_size && `ขนาดพิเศษ: ${p.custom_size}`,
    p.weight_g && `น้ำหนัก ${p.weight_g} กรัม`,
    p.warranty && `ประกัน ${p.warranty}`,
  ].filter(Boolean).join(" · ");

  const facts = [
    `รหัสสินค้า: ${p.code ?? "-"}`,
    brand?.name ? `แบรนด์: ${brand.name}` : "",
    cat?.name ? `หมวดสินค้า: ${cat.name}` : "",
    p.name_th ? `ชื่อเดิม (ไทย): ${p.name_th}` : "",
    p.introduction ? `Introduction เดิม: ${String(p.introduction).slice(0, 600)}` : "",
    p.description ? `Description เดิม: ${String(p.description).slice(0, 900)}` : "",
    sizeTxt ? `ขนาดที่วัดไว้แล้วในระบบ: ${sizeTxt}` : "ระบบยังไม่มีข้อมูลขนาด — ถ้ารูปไหนมีตัวเลขขนาดเขียนไว้ ให้อ่านมาใส่ใน sizes",
    extra ? `ข้อมูลเพิ่มเติมจากผู้ใช้ (เชื่อถือได้ ให้ใช้): ${extra}` : "",
    images.length ? `มีรูปสินค้าให้ดู ${images.length} รูป` : "ไม่มีรูปให้ดู — เขียนจากข้อมูลข้อความเท่านั้น และเขียนแบบไม่ระบุรายละเอียดที่มองไม่เห็น",
  ].filter(Boolean).join("\n");

  let out: Record<string, unknown>;
  try {
    out = await chatJson(system, [{ type: "text", text: facts }, ...imageParts(images)], 1700);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI ตอบกลับไม่สำเร็จ" }, { status: 502 });
  }

  const str = (k: string, max: number) => String(out[k] ?? "").trim().slice(0, max);

  // ── ขนาดที่ AI "อ่านจากรูป" — กรองค่าเพี้ยนทิ้ง (AI อาจส่งข้อความหรือค่าที่เป็นไปไม่ได้มา) ──
  const rawSizes = (out.sizes ?? {}) as Record<string, unknown>;
  const num = (k: string, max: number): number | null => {
    const v = Number(String(rawSizes[k] ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(v) && v > 0 && v <= max ? Math.round(v * 100) / 100 : null;
  };
  const sizes = {
    size_length_cm:    num("size_length_cm", 500),      // เกิน 5 เมตร = อ่านผิดแน่
    size_height_cm:    num("size_height_cm", 500),
    size_thickness_cm: num("size_thickness_cm", 500),
    weight_g:          num("weight_g", 200000),         // เกิน 200 กก. = อ่านผิด
    warranty:          String(rawSizes.warranty ?? "").trim().slice(0, 80) || null,
  };
  const hasSize = Object.values(sizes).some((v) => v !== null);

  const data = {
    name_th: str("name_th", 200),
    introduction: str("introduction", 1500),
    description: str("description", 4000),
    name_en: str("name_en", 200),
    introduction_en: str("introduction_en", 1500),
    english_description: str("english_description", 4000),
    sizes: hasSize ? sizes : null,
    size_source: hasSize ? String(rawSizes.source ?? "").trim().slice(0, 200) : "",
    image_count: images.length,
  };
  if (!data.name_th && !data.description && !data.introduction)
    return NextResponse.json({ error: "AI ไม่ได้ส่งข้อความกลับมา — ลองกดอีกครั้ง" }, { status: 502 });

  // audit: บันทึกว่าใครสั่ง AI คิดให้ (ค่าที่เขียนจริงจะถูก audit ตอนกดบันทึกฟอร์มอีกที)
  try {
    const sb = supabaseFromRequest(request);
    const { data: u } = await sb.auth.getUser();
    await writeAudit(admin, {
      action: "ai_product_detail", entityType: "parent_skus_v2", entityId: parentId,
      actorId: u?.user?.id ?? null, actorName: u?.user?.email ?? null,
      metadata: { code: p.code ?? null, images: images.length, brand: brand?.name ?? null, has_extra: !!extra, model: CAPTION_MODEL },
    });
  } catch { /* audit ล้มไม่ควรทำให้ผู้ใช้เสียงาน */ }

  return NextResponse.json({ data, error: null });
}
