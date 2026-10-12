/**
 * สล็อตประจำสัปดาห์ของแผนคอนเทนต์ — /api/marketing/content-plan/slots
 * GET ?brand_id=  → รายการสล็อต
 * POST { brand_id, weekday(0=จันทร์), post_time "HH:MM", platform, post_type?, pillar_id?, title }
 * PATCH { id, ...ช่องที่จะแก้, is_active? }
 * DELETE ?id=     (คอนเทนต์ที่เคยสร้างจากสล็อตนี้ยังอยู่ — แค่หลุดการผูกสล็อต)
 * อ่าน = tasks.view · แก้ = marketing.label.manage · ทุกการแก้ลง audit
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { isUuid } from "@/lib/marketing/sku-list";

export const dynamic = "force-dynamic";

const SEL = "id, brand_id, weekday, post_time, platform, post_type, pillar_id, title, is_active, sort_order";
const POST_TYPES = new Set(["image", "album", "video", "reel", "story", "live"]);

async function actor(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return { actorId: user?.id ?? null, actorName: user?.email ?? null };
}

function pick(b: Record<string, unknown>, requireAll: boolean): { f: Record<string, unknown>; error?: string } {
  const f: Record<string, unknown> = {};
  if (requireAll || "weekday" in b) {
    const w = Number(b.weekday);
    if (!Number.isInteger(w) || w < 0 || w > 6) return { f, error: "เลือกวันในสัปดาห์" };
    f.weekday = w;
  }
  if (requireAll || "post_time" in b) {
    const t = String(b.post_time ?? "10:00").trim();
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(t)) return { f, error: "เวลาต้องเป็นแบบ 24 ชม. เช่น 19:00" };
    f.post_time = t;
  }
  if (requireAll || "platform" in b) {
    const p = String(b.platform ?? "").trim();
    if (!p || p.length > 60) return { f, error: "เลือกช่องทาง" };
    f.platform = p;
  }
  if ("post_type" in b) {
    const t = b.post_type == null || b.post_type === "" ? null : String(b.post_type);
    if (t && !POST_TYPES.has(t)) return { f, error: "รูปแบบไม่ถูกต้อง" };
    f.post_type = t;
  }
  if ("pillar_id" in b) {
    if (b.pillar_id != null && b.pillar_id !== "" && !isUuid(b.pillar_id)) return { f, error: "แนวคอนเทนต์ไม่ถูกต้อง" };
    f.pillar_id = b.pillar_id || null;
  }
  if (requireAll || "title" in b) {
    const t = String(b.title ?? "").trim();
    if (!t || t.length > 200) return { f, error: "ใส่หัวข้อสล็อต (ไม่เกิน 200 ตัวอักษร)" };
    f.title = t;
  }
  if ("is_active" in b) f.is_active = b.is_active !== false;
  return { f };
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const brandId = new URL(request.url).searchParams.get("brand_id");
  let q = supabaseAdmin().from("content_plan_slots").select(SEL);
  if (isUuid(brandId)) q = q.eq("brand_id", brandId);
  const { data, error } = await q.order("weekday").order("post_time").order("sort_order");
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
  const { data, error } = await admin.from("content_plan_slots").insert({ brand_id: b.brand_id, ...f, created_by: actorId }).select(SEL).single();
  if (error) return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ: " + error.message }, { status: 400 });
  await writeAudit(admin, { action: "marketing.plan_slot.create", entityType: "content_plan_slots", entityId: data.id, actorId, actorName, metadata: { slot: data } });
  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "marketing.label.manage"); if (denied) return denied;
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }
  if (!isUuid(b.id)) return NextResponse.json({ data: null, error: "ไม่พบสล็อต" }, { status: 400 });
  const { f, error: vErr } = pick(b, false);
  if (vErr) return NextResponse.json({ data: null, error: vErr }, { status: 400 });
  if (!Object.keys(f).length) return NextResponse.json({ data: null, error: "ไม่มีอะไรให้แก้" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("content_plan_slots").select(SEL).eq("id", b.id).maybeSingle();
  if (!before) return NextResponse.json({ data: null, error: "ไม่พบสล็อต (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { data, error } = await admin.from("content_plan_slots").update({ ...f, updated_at: new Date().toISOString() }).eq("id", b.id).select(SEL).single();
  if (error) return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ: " + error.message }, { status: 400 });
  const { actorId, actorName } = await actor(request);
  await writeAudit(admin, { action: "marketing.plan_slot.update", entityType: "content_plan_slots", entityId: b.id as string, actorId, actorName, metadata: { before, after: f } });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "marketing.label.manage"); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ data: null, error: "ไม่พบสล็อต" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("content_plan_slots").select(SEL).eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ data: null, error: "ไม่พบสล็อต (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { error } = await admin.from("content_plan_slots").delete().eq("id", id);
  if (error) return NextResponse.json({ data: null, error: "ลบไม่สำเร็จ: " + error.message }, { status: 500 });
  const { actorId, actorName } = await actor(request);
  await writeAudit(admin, { action: "marketing.plan_slot.delete", entityType: "content_plan_slots", entityId: id, actorId, actorName, metadata: { slot: before } });
  return NextResponse.json({ data: { ok: true }, error: null });
}
