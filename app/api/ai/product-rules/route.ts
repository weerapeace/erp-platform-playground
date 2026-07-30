/**
 * /api/ai/product-rules — กฎคำสั่ง AI ต่อ "ประเภทสินค้า"
 *   GET                  → กฎทั้งหมด (+ รายชื่อแท็กไว้ให้ dropdown)
 *   POST   { …rule }     → เพิ่ม/แก้ (มี id = แก้)
 *   DELETE ?id=          → ลบ
 *
 * 1 กฎจับสินค้าได้ 2 ทาง: ติดแท็กไว้ (tag_ids) หรือ ชื่อสินค้ามีคำที่กำหนด (name_keywords)
 * เพราะของจริงแท็กประเภทสินค้ายังติดกันน้อย ("กระเป๋าสตางค์" ติดแค่ 1 ตัว แต่ชื่อมีคำนี้ 91 ตัว)
 *
 * สิทธิ์: อ่าน = ai.caption หรือ tasks.approve · แก้/ลบ = tasks.approve (ค่ากลางกระทบทุกคน)
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RuleBody = {
  id?: string; name?: string; tag_ids?: string[]; name_keywords?: string[];
  brand_id?: string | null; instruction?: string; required_topics?: string[];
  /** หัวข้อบังคับฉบับภาษาอังกฤษ (เว้นได้ = ใช้ไทย) */
  required_topics_en?: string[];
  hint?: string | null; sort_order?: number; is_active?: boolean;
};

const arr = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))].slice(0, 50) : [];

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "ai.caption")) && !(await apiCan(request, "tasks.approve")))
    return NextResponse.json({ data: [], error: "ไม่มีสิทธิ์ดูกฎคำสั่ง AI" }, { status: 401 });
  const admin = supabaseAdmin();
  const parentId = (new URL(request.url).searchParams.get("parent_id") ?? "").trim();
  const [rules, tags] = await Promise.all([
    admin.from("erp_ai_product_rules").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    admin.from("product_families").select("id, name, name_en").eq("is_active", true).order("name", { ascending: true }),
  ]);
  const all = (rules.data ?? []) as Record<string, unknown>[];

  // ?parent_id= → บอกด้วยว่าสินค้าตัวนี้เข้ากฎไหน (ป๊อปเอาไปโชว์ช่องกรอกหัวข้อบังคับก่อนกดให้ AI คิด)
  let matched: Record<string, unknown>[] = [];
  if (parentId) {
    const [{ data: p }, { data: links }] = await Promise.all([
      admin.from("parent_skus_v2").select("name_th, brand_id").eq("id", parentId).maybeSingle(),
      admin.from("parent_skus_v2_product_family_m2m").select("tgt_id").eq("src_id", parentId),
    ]);
    const tagIds = ((links ?? []) as { tgt_id: string }[]).map((l) => l.tgt_id);
    const nameLower = String(p?.name_th ?? "").toLowerCase();
    const brandId = (p?.brand_id as string | null) ?? null;
    matched = all.filter((r) => {
      if (r.brand_id && r.brand_id !== brandId) return false;
      const byTag = ((r.tag_ids ?? []) as string[]).some((t) => tagIds.includes(t));
      const byName = ((r.name_keywords ?? []) as string[]).some((k) => k && nameLower.includes(String(k).toLowerCase()));
      return byTag || byName;
    });
  }

  return NextResponse.json({ data: all, matched, tags: tags.data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "tasks.approve")))
    return NextResponse.json({ error: "ต้องเป็นหัวหน้า/ผู้ดูแลจึงแก้กฎได้ (tasks.approve)" }, { status: 401 });
  let b: RuleBody;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const name = (b.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ตั้งชื่อกฎก่อน (เช่น กระเป๋าสตางค์)" }, { status: 400 });
  const tagIds = arr(b.tag_ids), keywords = arr(b.name_keywords);
  if (tagIds.length === 0 && keywords.length === 0)
    return NextResponse.json({ error: "ต้องระบุอย่างน้อยหนึ่งเงื่อนไข — เลือกแท็ก หรือใส่คำในชื่อสินค้า" }, { status: 400 });
  if (!(b.instruction ?? "").trim() && arr(b.required_topics).length === 0 && !(b.hint ?? "").trim())
    return NextResponse.json({ error: "กฎยังไม่มีผลอะไรเลย — ใส่คำสั่ง หัวข้อที่ต้องมี หรือใบ้อย่างน้อยหนึ่งอย่าง" }, { status: 400 });

  const row = {
    name,
    tag_ids: tagIds,
    name_keywords: keywords,
    brand_id: (b.brand_id ?? null) || null,
    instruction: (b.instruction ?? "").trim(),
    required_topics: arr(b.required_topics),
    required_topics_en: arr(b.required_topics_en),
    hint: (b.hint ?? "").trim() || null,
    sort_order: Number.isFinite(b.sort_order) ? Number(b.sort_order) : 0,
    is_active: b.is_active !== false,
    updated_at: new Date().toISOString(),
  };

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const res = b.id
    ? await admin.from("erp_ai_product_rules").update({ ...row, updated_by: user?.id ?? null }).eq("id", b.id).select("id").maybeSingle()
    : await admin.from("erp_ai_product_rules").insert({ ...row, updated_by: user?.id ?? null }).select("id").maybeSingle();
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 400 });

  await writeAudit(admin, {
    action: b.id ? "update" : "create", entityType: "ai_product_rule", entityId: res.data?.id ?? null,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { name, tags: tagIds.length, keywords: keywords.length },
  });
  return NextResponse.json({ data: res.data, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "tasks.approve")))
    return NextResponse.json({ error: "ต้องเป็นหัวหน้า/ผู้ดูแลจึงลบกฎได้ (tasks.approve)" }, { status: 401 });
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_ai_product_rules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "delete", entityType: "ai_product_rule", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null });
  return NextResponse.json({ success: true, error: null });
}
