/**
 * 🔔 รอบเปลี่ยนของแผนคอนเทนต์ ("อะไรต้องเปลี่ยนทุกกี่วัน") — /api/marketing/content-plan/refresh-rules
 * GET ?brand_id=  → รายการกฎ (ไม่ส่ง brand_id = ทุกแบรนด์ — ใช้คิดสถานะในปฏิทิน)
 * POST { brand_id, placement_type?, platform, every_days, lead_days?, title? }
 * PATCH { id, ...ช่องที่จะแก้, is_active? }
 * DELETE ?id=     (ไม่แตะคอนเทนต์ — กฎแค่อ่านคอนเทนต์ไปเทียบ)
 * อ่าน = tasks.view · แก้ = marketing.label.manage · ทุกการแก้ลง audit
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { isUuid } from "@/lib/marketing/sku-list";

export const dynamic = "force-dynamic";

const SEL = "id, brand_id, placement_type, platform, every_days, lead_days, title, is_active, sort_order";

async function actor(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return { actorId: user?.id ?? null, actorName: user?.email ?? null };
}

function pick(b: Record<string, unknown>, requireAll: boolean): { f: Record<string, unknown>; error?: string } {
  const f: Record<string, unknown> = {};
  if (requireAll || "platform" in b) {
    const p = String(b.platform ?? "").trim();
    if (!p || p.length > 60) return { f, error: "เลือกช่องทาง" };
    f.platform = p;
  }
  if ("placement_type" in b) {
    const t = b.placement_type == null || b.placement_type === "" ? null : String(b.placement_type).trim();
    if (t && (t.length > 60 || t.includes(":"))) return { f, error: "ประเภทการลงไม่ถูกต้อง" };
    f.placement_type = t;
  }
  if (requireAll || "every_days" in b) {
    const n = Number(b.every_days);
    if (!Number.isInteger(n) || n < 1 || n > 365) return { f, error: "ใส่จำนวนวัน 1–365 (ต้องเปลี่ยนทุกกี่วัน)" };
    f.every_days = n;
  }
  if ("lead_days" in b) {
    const n = Number(b.lead_days ?? 3);
    if (!Number.isInteger(n) || n < 0 || n > 60) return { f, error: "เตือนล่วงหน้าได้ 0–60 วัน" };
    f.lead_days = n;
  }
  if ("title" in b) {
    const t = b.title == null ? "" : String(b.title).trim();
    if (t.length > 200) return { f, error: "ชื่อเรียกยาวเกิน 200 ตัวอักษร" };
    f.title = t || null;
  }
  if ("is_active" in b) f.is_active = b.is_active !== false;
  return { f };
}

const dupMsg = (msg: string) => (/uq_content_refresh_rules|duplicate key/.test(msg) ? "มีกฎของแบรนด์ × ประเภท × ช่องทางนี้อยู่แล้ว — แก้ตัวเดิมแทน" : "บันทึกไม่สำเร็จ: " + msg);

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const brandId = new URL(request.url).searchParams.get("brand_id");
  let q = supabaseAdmin().from("content_refresh_rules").select(SEL);
  if (isUuid(brandId)) q = q.eq("brand_id", brandId);
  const { data, error } = await q.order("sort_order").order("created_at");
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "marketing.label.manage"); if (denied) return denied;
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }
  if (!isUuid(b.brand_id)) return NextResponse.json({ data: null, error: "เลือกแบรนด์ก่อน" }, { status: 400 });
  const { f, error: vErr } = pick(b, true);
  if (vErr) return NextResponse.json({ data: null, error: vErr }, { status: 400 });
  const admin = supabaseAdmin();
  const { actorId, actorName } = await actor(request);
  const { data, error } = await admin.from("content_refresh_rules").insert({ brand_id: b.brand_id, ...f, created_by: actorId }).select(SEL).single();
  if (error) return NextResponse.json({ data: null, error: dupMsg(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "marketing.refresh_rule.create", entityType: "content_refresh_rules", entityId: data.id, actorId, actorName, metadata: { rule: data } });
  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "marketing.label.manage"); if (denied) return denied;
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }
  if (!isUuid(b.id)) return NextResponse.json({ data: null, error: "ไม่พบกฎ" }, { status: 400 });
  const { f, error: vErr } = pick(b, false);
  if (vErr) return NextResponse.json({ data: null, error: vErr }, { status: 400 });
  if (!Object.keys(f).length) return NextResponse.json({ data: null, error: "ไม่มีอะไรให้แก้" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("content_refresh_rules").select(SEL).eq("id", b.id).maybeSingle();
  if (!before) return NextResponse.json({ data: null, error: "ไม่พบกฎ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { data, error } = await admin.from("content_refresh_rules").update({ ...f, updated_at: new Date().toISOString() }).eq("id", b.id).select(SEL).single();
  if (error) return NextResponse.json({ data: null, error: dupMsg(error.message) }, { status: 400 });
  const { actorId, actorName } = await actor(request);
  await writeAudit(admin, { action: "marketing.refresh_rule.update", entityType: "content_refresh_rules", entityId: b.id as string, actorId, actorName, metadata: { before, after: f } });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "marketing.label.manage"); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ data: null, error: "ไม่พบกฎ" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("content_refresh_rules").select(SEL).eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ data: null, error: "ไม่พบกฎ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { error } = await admin.from("content_refresh_rules").delete().eq("id", id);
  if (error) return NextResponse.json({ data: null, error: "ลบไม่สำเร็จ: " + error.message }, { status: 500 });
  const { actorId, actorName } = await actor(request);
  await writeAudit(admin, { action: "marketing.refresh_rule.delete", entityType: "content_refresh_rules", entityId: id, actorId, actorName, metadata: { rule: before } });
  return NextResponse.json({ data: { ok: true }, error: null });
}
