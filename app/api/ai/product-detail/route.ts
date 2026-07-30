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
import { CAPTION_MODEL, productDetailModel, chatJson, imageParts, imagesToDataUrls, loadPromptRows, openAiKey, pickJobPrompt, PRODUCT_DETAIL_KEY } from "@/lib/ai-caption";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const MAX_IMG = 10;   // เจ้าของขอ 10 รูป — รูปสเปค/อินโฟกราฟิกมักอยู่รูปท้าย ๆ ถ้าตัดที่ 4 จะไม่เห็นตัวเลขขนาด

const FALLBACK = [
  "คุณคือนักเขียนรายละเอียดสินค้าสำหรับร้านค้าออนไลน์ไทย (Shopee/Lazada/TikTok)",
  "เขียนจากสิ่งที่เห็นในรูปและข้อมูลที่ให้มาเท่านั้น ห้ามแต่งคุณสมบัติที่ไม่เห็น เช่น วัสดุแท้/กันน้ำ/มาตรฐาน ถ้าไม่มีข้อมูล",
  "ห้ามใส่ราคา",
  "โทนสุภาพ อ่านง่าย ชวนซื้อแต่ไม่โฆษณาเกินจริง",
].join(" · ");

type Body = {
  parent_id?: string;
  extra?: string;
  /** คำตอบของผู้ใช้ต่อคำถามที่ AI ถามกลับรอบก่อน (ถามครั้งเดียว ตอบแล้วห้ามถามซ้ำ) */
  answers?: { q?: string; a?: string }[];
  /**
   * ให้เขียนแค่บางกลุ่มช่อง — "name" | "intro" | "desc"
   * แต่ละกลุ่มพ่วงคู่อังกฤษให้เสมอ (name → name_th + name_en)
   * ไม่ส่ง = เขียนทุกกลุ่มเหมือนเดิม
   */
  fields?: string[];
};

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

  // กลุ่มช่องที่สั่งให้เขียนรอบนี้ (ไม่ส่ง = ทุกกลุ่ม) — แต่ละกลุ่มพ่วงคู่อังกฤษเสมอ
  const ALL_FIELDS = ["name", "intro", "desc"];
  const asked = Array.isArray(body.fields) ? body.fields.map((f) => String(f).trim()).filter((f) => ALL_FIELDS.includes(f)) : [];
  const pickFields = asked.length ? [...new Set(asked)] : ALL_FIELDS;

  const admin = supabaseAdmin();

  // ── ข้อมูลสินค้าที่มีอยู่ (ใช้เป็นบริบท ไม่ใช่ให้ AI ลอก) ──
  const { data: p } = await admin.from("parent_skus_v2")
    .select("id, code, name_th, name_en, introduction, description, english_description, brand_id, platform_category_id, cover_image_r2_key, size_length_cm, size_height_cm, size_thickness_cm, custom_size, weight_g, warranty")
    .eq("id", parentId).maybeSingle();
  if (!p) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });

  const brandId = (p.brand_id as string | null) ?? null;
  const [{ data: brand }, { data: cat }, { data: tagLinks }, { data: allRules }] = await Promise.all([
    brandId ? admin.from("brands").select("name").eq("id", brandId).maybeSingle() : Promise.resolve({ data: null }),
    p.platform_category_id ? admin.from("platform_categories").select("name").eq("id", p.platform_category_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("parent_skus_v2_product_family_m2m").select("tgt_id, product_families!inner(id, name, name_en)").eq("src_id", parentId),
    admin.from("erp_ai_product_rules").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
  ]);

  // ── กฎตามประเภทสินค้า — เข้าเงื่อนไขเมื่อ "ติดแท็กไว้" หรือ "ชื่อสินค้ามีคำที่กำหนด" ──
  //    (จับ 2 ทางเพราะของจริงแท็กประเภทสินค้ายังติดกันน้อยมาก) · กฎที่เข้าเงื่อนไขใช้ได้พร้อมกันหลายกฎ
  const tagIds = ((tagLinks ?? []) as { tgt_id: string }[]).map((t) => t.tgt_id);
  // ชื่อแท็ก 2 ภาษา — ส่งคำอังกฤษไปด้วย เพื่อให้ข้อความฝั่ง EN ใช้ศัพท์เดียวกับที่เราตั้งไว้ (Wallet/Belt)
  const tagNames = ((tagLinks ?? []) as { product_families?: { name?: string; name_en?: string | null } }[])
    .map((t) => {
      const th = t.product_families?.name; if (!th) return null;
      const en = (t.product_families?.name_en ?? "").trim();
      return en ? `${th} (EN: ${en})` : th;
    })
    .filter((n): n is string => !!n);
  const nameLower = String(p.name_th ?? "").toLowerCase();
  type Rule = {
    id: string; name: string; tag_ids: string[]; name_keywords: string[]; brand_id: string | null;
    instruction: string; required_topics: string[]; hint: string | null;
  };
  const rules = ((allRules ?? []) as Rule[]).filter((r) => {
    if (r.brand_id && r.brand_id !== brandId) return false;
    const byTag = (r.tag_ids ?? []).some((t) => tagIds.includes(t));
    const byName = (r.name_keywords ?? []).some((k) => k && nameLower.includes(k.toLowerCase()));
    return byTag || byName;
  });
  const ruleInstruction = rules.map((r) => r.instruction).filter(Boolean).join("\n");
  const ruleTopics = [...new Set(rules.flatMap((r) => r.required_topics ?? []).filter(Boolean))];
  const ruleHints = rules.map((r) => r.hint).filter(Boolean).join(" · ");

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
  const custom = pickJobPrompt(await loadPromptRows(), brandId, PRODUCT_DETAIL_KEY);
  const hasCustom = !!custom.trim();
  const system = [
    // ไม่มีคำสั่งของเจ้าของ → ใช้ persona ในโค้ด · มีคำสั่งเอง → persona มาจากคำสั่งนั้น (ปิดท้าย)
    ...(hasCustom ? [] : [FALLBACK, ""]),
    // โครงสร้าง JSON + กติกาความปลอดภัย มาก่อน · คำสั่งของผู้ใช้ไปปิดท้าย (ตัวท้ายมีน้ำหนักสุด)
    "ตอบเป็น JSON เท่านั้น ตามรูปแบบนี้ (ทุกช่องเป็นข้อความ):",
    // ⚠️ คำอธิบายฟิลด์ต้องเป็น "กลาง" ห้ามใส่ข้อจำกัดสไตล์ (เช่น ห้ามใส่รหัส / ไม่เกิน 80 ตัวอักษร)
    //    เพราะจะไปขัดกับคำสั่งที่เจ้าของตั้งไว้เอง (เคสจริง: ตั้งให้ใส่ Collection + SEO + รหัส แต่ AI ไม่ทำตาม)
    `{"name_th":"ชื่อสินค้าภาษาไทย",`,
    `"introduction":"ข้อความโปรยเปิดภาษาไทย",`,
    `"description":"รายละเอียดภาษาไทย",`,
    `"name_en":"ชื่อสินค้าภาษาอังกฤษ",`,
    `"introduction_en":"ข้อความโปรยเปิดภาษาอังกฤษ",`,
    `"english_description":"รายละเอียดภาษาอังกฤษ",`,
    `"sizes":{"size_length_cm":ตัวเลขหรือ null,"size_height_cm":ตัวเลขหรือ null,"size_thickness_cm":ตัวเลขหรือ null,"weight_g":ตัวเลขหรือ null,"warranty":"ข้อความหรือ null","source":"บอกสั้น ๆ ว่าอ่านตัวเลขมาจากไหน เช่น 'รูปที่ 3 เขียนว่า 34*22*12 cm'"},`,
    `"questions":["คำถามภาษาไทยที่อยากถามผู้ใช้ ถ้ามีอะไรไม่แน่ใจหรือดูจากรูปไม่ออก (สูงสุด 5 ข้อ สั้น ตรงประเด็น)"],`,
    `"questions_en":["คำถามชุดเดียวกันฉบับภาษาอังกฤษ เรียงลำดับตรงกับ questions"],`,
    `"suggestions":["สิ่งที่ควรเติมข้อมูลในระบบเพื่อให้รายละเอียดสมบูรณ์ขึ้น (สูงสุด 5 ข้อ)"]}`,
    ...(pickFields.length < 3 ? ["",
      `⚠️ รอบนี้ให้เขียนแค่: ${pickFields.map((f) => ({ name: "ชื่อสินค้า (name_th + name_en)", intro: "Introduction (ไทย + อังกฤษ)", desc: "Description (ไทย + อังกฤษ)" }[f] ?? f)).join(" · ")}`,
      "ช่องที่ไม่ได้สั่ง ให้ตอบเป็นข้อความว่าง \"\" (ห้ามเขียนอะไรลงไป) — ของเดิมในระบบจะไม่ถูกแตะ",
    ] : []),
    "",
    // กติกาคุณภาพ/ตัวอย่าง = ใช้เฉพาะตอน "ไม่มีคำสั่งของเจ้าของ" — ถ้ามีคำสั่งเองแล้ว
    // ตัวอย่างของเราจะไปแข่งกับสไตล์ที่เจ้าของกำหนด (AI เลียนตัวอย่างเราแทนคำสั่งจริง)
    ...(hasCustom ? [
      "กติกาพื้นฐาน (คำสั่งของผู้ใช้ด้านล่างสำคัญกว่า ถ้าขัดกันให้ทำตามผู้ใช้):",
      "- ห้ามเขียนหัวข้อที่ไม่มีข้อมูล — ถ้าไม่มีข้อมูล ให้ตัดบรรทัดนั้นทิ้ง",
      "- ต้องใช้ข้อมูลจริงที่ให้ไว้ด้านล่างให้หมด (น้ำหนัก ประกัน ไซซ์ที่มี สี ฯลฯ) อย่าปล่อยทิ้ง",
    ] : [
      "กติกาการเขียนให้ได้คุณภาพ (สำคัญ — ปัญหาที่เจอบ่อย):",
      "- ห้ามเขียนหัวข้อที่ไม่มีข้อมูล เช่น 'อุปกรณ์เสริม: ไม่มี' — ถ้าไม่มีข้อมูล ให้ตัดบรรทัดนั้นทิ้งเลย",
      "- ห้ามใช้ชื่อหัวข้อผิดรูป เช่น 'ช่องการใช้งาน' · ใช้คำที่คนไทยเขียนจริง: วัสดุ / ขนาด / การใช้งาน / จุดเด่น / ในกล่อง",
      "- ต้องใช้ข้อมูลจริงที่ให้ไว้ด้านล่างให้หมด (น้ำหนัก ประกัน ไซซ์ที่มี ราคา ฯลฯ) อย่าปล่อยทิ้ง",
      "- ห้ามเขียนคำซ้ำซ้อนแบบ 'ขนาดสินค้า: ขนาด L ...' → เขียน 'ขนาด: L 37-41 นิ้ว · M 33-37 นิ้ว'",
      "- ชื่อสินค้า: สั้น กระชับ ไม่เกิน 80 ตัวอักษร",
      "- Introduction ต้องเป็นประโยคขายที่อ่านลื่น 2-3 บรรทัด ไม่ใช่การไล่คุณสมบัติ",
      "- Description ให้ขึ้นต้นด้วย '- ' เรียงจากสิ่งที่ลูกค้าสนใจก่อน (วัสดุ → ขนาด/ไซซ์ → การใช้งาน → จุดเด่น → ประกัน)",
      "",
      "ตัวอย่างบรรทัด Description ที่ดี (เลียนแบบสไตล์นี้ ไม่ใช่ลอกเนื้อหา):",
      "- วัสดุ: หนังวัวแท้ผิวเรียบ เย็บขอบเก็บงานเรียบร้อย ยิ่งใช้ยิ่งขึ้นเงา",
      "- ไซซ์: S (29-33 นิ้ว) · M (33-37 นิ้ว) · L (37-41 นิ้ว) — วัดรอบเอวจริงแล้วเลือกไซซ์ที่ครอบ",
      "- งานสลักชื่อ: สลักชื่อบนสายได้ตามต้องการ เหมาะเป็นของขวัญให้คนสำคัญ",
    ]),
    "",
    "กติกาเรื่องคำถาม:",
    "- ต้องเขียนข้อความให้ครบทุกช่องก่อนเสมอ ห้ามรอคำตอบ — ส่วนที่ไม่แน่ใจให้เขียนแบบกลาง ๆ ไม่ระบุตัวเลข/ข้อเท็จจริงที่ยังไม่รู้",
    "- ถ้ามีหัวข้อที่ 'ต้องมีเสมอ' แต่มองจากรูปไม่ออก ให้ถามใน questions ทุกครั้ง (เช่น จำนวนช่องใส่บัตร)",
    "- ไม่มีอะไรต้องถาม ให้ questions เป็น []",
    "",
    "กติกาเรื่องขนาด (สำคัญมาก):",
    "- ใส่ตัวเลขใน sizes ได้เฉพาะเมื่อ 'มีตัวเลขเขียนอยู่ในรูป' เช่น รูปสเปค อินโฟกราฟิก ป้ายวัดขนาด ตารางไซซ์ หรือมีให้ในข้อมูลด้านล่าง",
    "- ห้ามกะ/ประมาณ/เดาขนาดหรือน้ำหนักจากสายตาเด็ดขาด — ถ้าไม่มีตัวเลขเขียนไว้ ให้ใส่ null ทุกช่อง และ source ว่า 'ไม่พบตัวเลขในรูป'",
    "- หน่วยต้องแปลงเป็น: เซนติเมตร (cm) สำหรับขนาด และ กรัม (g) สำหรับน้ำหนัก · ถ้าในรูปเป็นนิ้ว/มม./กก. ให้แปลงก่อน",
    "- ในข้อความ Description ห้ามใส่ตัวเลขขนาดที่ไม่ได้มาจากรูปหรือข้อมูลที่ให้ไว้",
    "",
    "ห้ามใส่คีย์อื่นนอกจากนี้",

    // ── คำสั่งของเจ้าของร้าน ปิดท้าย = มีน้ำหนักสูงสุด ──
    // (ยกเว้นกติกาความปลอดภัย: ห้ามแต่งข้อมูลที่ไม่เห็น / ห้ามเดาขนาด / ต้องเป็น JSON ตามคีย์ที่กำหนด)
    ...(hasCustom ? [
      "",
      "════════ คำสั่งของเจ้าของร้าน (สำคัญที่สุด — ทำตามนี้เป็นหลัก) ════════",
      custom.trim(),
      "════════════════════════════════════════════════",
      "ถ้าคำสั่งด้านบนนี้ขัดกับคำอธิบายฟิลด์หรือกติกาการเขียนก่อนหน้า ให้ทำตามคำสั่งของเจ้าของร้าน",
      "(ยังคงห้าม: แต่งข้อมูลที่มองไม่เห็น · เดาตัวเลขขนาด/น้ำหนัก · ตอบไม่เป็น JSON ตามคีย์ที่กำหนด)",
    ] : []),
    ...(ruleInstruction ? ["", "คำสั่งเพิ่มสำหรับสินค้าประเภทนี้ (ทำร่วมกับคำสั่งเจ้าของร้าน):", ruleInstruction] : []),
    ...(ruleTopics.length ? ["", "หัวข้อที่ต้องมีใน Description เสมอ (ถ้าดูจากรูปไม่ออก ให้ถามใน questions):",
      ...ruleTopics.map((t) => `- ${t}`)] : []),
  ].join("\n");

  const pos = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
  const sizeTxt = [
    pos(p.size_length_cm) && `กว้าง ${pos(p.size_length_cm)} ซม.`,
    pos(p.size_height_cm) && `สูง ${pos(p.size_height_cm)} ซม.`,
    pos(p.size_thickness_cm) && `หนา ${pos(p.size_thickness_cm)} ซม.`,
    p.custom_size && `ขนาดพิเศษ: ${p.custom_size}`,
    pos(p.weight_g) && `น้ำหนัก ${pos(p.weight_g)} กรัม`,
    p.warranty && `ประกัน ${p.warranty}`,
  ].filter(Boolean).join(" · ");

  // ── ข้อมูลจาก SKU ลูก: สี/ลาย + ไซซ์ที่มีจริง + ช่วงราคา ──
  //    AI เขียนได้แม่นขึ้นมาก (เดิมไม่รู้ว่าสินค้ามีสีอะไร ไซซ์อะไร ราคาเท่าไร → เขียนกว้าง ๆ)
  const { data: kids } = await admin.from("skus_v2")
    .select("color_th, list_price, attribute_values").eq("parent_sku_id", parentId).limit(200);
  const kidRows = (kids ?? []) as { color_th: string | null; list_price: number | string | null; attribute_values: Record<string, unknown> | null }[];
  const colorSet = [...new Set(kidRows.map((k) => String(k.color_th ?? "").split("/")[0].trim()).filter(Boolean))].slice(0, 20);
  const variantSet = [...new Set(kidRows
    .map((k) => (k.attribute_values?.variant_option as { value?: string } | undefined)?.value)
    .filter((v): v is string => !!v))].slice(0, 20);
  const prices = kidRows.map((k) => Number(k.list_price)).filter((n) => Number.isFinite(n) && n > 0);
  const priceTxt = prices.length
    ? (Math.min(...prices) === Math.max(...prices) ? `${Math.min(...prices).toLocaleString("th-TH")} บาท` : `${Math.min(...prices).toLocaleString("th-TH")}-${Math.max(...prices).toLocaleString("th-TH")} บาท`)
    : "";

  // คำตอบที่ผู้ใช้ตอบคำถามของ AI รอบก่อน — เชื่อถือได้เท่าข้อมูลในระบบ
  const answerTxt = (body.answers ?? [])
    .filter((a) => a && a.q && a.a).slice(0, 8)
    .map((a) => `- ${String(a.q).slice(0, 200)} → ${String(a.a).slice(0, 300)}`).join("\n");

  const facts = [
    `รหัสสินค้า: ${p.code ?? "-"}`,
    brand?.name ? `แบรนด์: ${brand.name}` : "",
    cat?.name ? `หมวดสินค้า: ${cat.name}` : "",
    tagNames.length ? `แท็ก: ${tagNames.join(", ")}` : "",
    colorSet.length ? `สี/ลายที่มีขาย (${colorSet.length} แบบ): ${colorSet.join(", ")}` : "",
    variantSet.length ? `ไซซ์/แบบย่อยที่มีจริง: ${variantSet.join(", ")}` : "",
    priceTxt ? `ราคาขาย: ${priceTxt} (ใช้เป็นบริบทได้ แต่ห้ามเขียนราคาลงในข้อความ)` : "",
    p.name_th ? `ชื่อเดิม (ไทย): ${p.name_th}` : "",
    p.introduction ? `Introduction เดิม: ${String(p.introduction).slice(0, 600)}` : "",
    p.description ? `Description เดิม: ${String(p.description).slice(0, 900)}` : "",
    sizeTxt ? `ขนาดที่วัดไว้แล้วในระบบ: ${sizeTxt}` : "ระบบยังไม่มีข้อมูลขนาด — ถ้ารูปไหนมีตัวเลขขนาดเขียนไว้ ให้อ่านมาใส่ใน sizes",
    ruleHints ? `ข้อมูลประจำสินค้าประเภทนี้ (ตั้งไว้ล่วงหน้า เชื่อถือได้): ${ruleHints}` : "",
    extra ? `ข้อมูลเพิ่มเติมจากผู้ใช้ (เชื่อถือได้ ให้ใช้): ${extra}` : "",
    answerTxt ? `ผู้ใช้ตอบคำถามที่ถามไปรอบก่อนแล้ว (เชื่อถือได้ ให้ใช้และห้ามถามซ้ำ):\n${answerTxt}` : "",
    images.length ? `มีรูปสินค้าให้ดู ${images.length} รูป` : "ไม่มีรูปให้ดู — เขียนจากข้อมูลข้อความเท่านั้น และเขียนแบบไม่ระบุรายละเอียดที่มองไม่เห็น",
  ].filter(Boolean).join("\n");

  // โมเดลที่ผู้ดูแลเลือกไว้ในหน้าตั้งค่า (ไม่ตั้ง = ค่าเริ่มต้น gpt-4o-mini)
  const model = await productDetailModel();
  let out: Record<string, unknown>;
  try {
    out = await chatJson(system, [{ type: "text", text: facts }, ...imageParts(images)], 1700, model);
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

  const list = (k: string) => (Array.isArray(out[k]) ? (out[k] as unknown[]) : [])
    .map((v) => String(v).trim()).filter(Boolean).slice(0, 5);

  const data = {
    // กันเหนียว: ช่องที่ไม่ได้สั่งให้เขียนรอบนี้ → บังคับเป็นค่าว่าง (เผื่อ AI เขียนมาให้เอง)
    name_th: pickFields.includes("name") ? str("name_th", 200) : "",
    introduction: pickFields.includes("intro") ? str("introduction", 1500) : "",
    description: pickFields.includes("desc") ? str("description", 4000) : "",
    name_en: pickFields.includes("name") ? str("name_en", 200) : "",
    introduction_en: pickFields.includes("intro") ? str("introduction_en", 1500) : "",
    english_description: pickFields.includes("desc") ? str("english_description", 4000) : "",
    sizes: hasSize ? sizes : null,
    size_source: hasSize ? String(rawSizes.source ?? "").trim().slice(0, 200) : "",
    image_count: images.length,
    model,
    // ถามกลับ + แนะนำให้เติมข้อมูล (เขียนเสร็จก่อนแล้วค่อยถาม — ไม่บล็อกผู้ใช้)
    questions: list("questions"),
    questions_en: list("questions_en"),      // คำถามชุดเดียวกันฉบับอังกฤษ (โหมด EN ใช้ตัวนี้)
    suggestions: list("suggestions"),
    rules_used: rules.map((r) => r.name),
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
      metadata: { code: p.code ?? null, images: images.length, brand: brand?.name ?? null, has_extra: !!extra, model },
    });
  } catch { /* audit ล้มไม่ควรทำให้ผู้ใช้เสียงาน */ }

  return NextResponse.json({ data, error: null });
}
