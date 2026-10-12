/**
 * เป้ารายเดือนของแผนคอนเทนต์ — /api/marketing/content-plan/targets
 * GET ?brand_id=      → รายการเป้า (ไม่ส่ง brand_id = ทุกแบรนด์)
 * POST { brand_id, platform, post_type?, monthly_count }
 * PATCH { id, platform?, post_type?, monthly_count? }
 * DELETE ?id=
 * อ่าน = tasks.view · แก้ = marketing.label.manage · ทุกการแก้ลง audit
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { isUuid } from "@/lib/marketing/sku-list";

export const dynamic = "force-dynamic";

const SEL = "id, brand_id, platform, post_type, monthly_count, sort_order";
const POST_TYPES = new Set(["image", "album", "video", "reel", "story", "live"]);
const dupMsg = (e: { code?: string; message: string }) => (e.code === "23505" ? "มีเป้าของแบรนด์ + ช่องทาง + รูปแบบนี้อยู่แล้ว — แก้จำนวนที่แถวเดิมได้เลย" : "บันทึกไม่สำเร็จ: " + e.message);

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
  if ("post_type" in b) {
    const t = b.post_type == null || b.post_type === "" ? null : String(b.post_type);
    if (t && !POST_TYPES.has(t)) return { f, error: "รูปแบบไม่ถูกต้อง" };
    f.post_type = t;
  }
  if (requireAll || "monthly_count" in b) {
    const n = Number(b.monthly_count);
    if (!Number.isInteger(n) || n < 1 || n > 500) return { f, error: "จำนวนต่อเดือนต้องเป็นเลข 1–500" };
    f.monthly_count = n;
  }
  return { f };
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const brandId = new URL(request.url).searchParams.get("brand_id");
  let q = supabaseAdmin().from("content_plan_targets").select(SEL);
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
  const { data, error } = await admin.from("content_plan_targets").insert({ brand_id: b.brand_id, ...f, created_by: actorId }).select(SEL).single();
  if (error) return NextResponse.json({ data: null, error: dupMsg(error) }, { status: 400 });
  await writeAudit(admin, { action: "marketing.plan_target.create", entityType: "content_plan_targets", entityId: data.id, actorId, actorName, metadata: { target: data } });
  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "marketing.label.manage"); if (denied) return denied;
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }
  if (!isUuid(b.id)) return NextResponse.json({ data: null, error: "ไม่พบเป้า" }, { status: 400 });
  const { f, error: vErr } = pick(b, false);
  if (vErr) return NextResponse.json({ data: null, error: vErr }, { status: 400 });
  if (!Object.keys(f).length) return NextResponse.json({ data: null, error: "ไม่มีอะไรให้แก้" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("content_plan_targets").select(SEL).eq("id", b.id).maybeSingle();
  if (!before) return NextResponse.json({ data: null, error: "ไม่พบเป้า (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { data, error } = await admin.from("content_plan_targets").update({ ...f, updated_at: new Date().toISOString() }).eq("id", b.id).select(SEL).single();
  if (error) return NextResponse.json({ data: null, error: dupMsg(error) }, { status: 400 });
  const { actorId, actorName } = await actor(request);
  await writeAudit(admin, { action: "marketing.plan_target.update", entityType: "content_plan_targets", entityId: b.id as string, actorId, actorName, metadata: { before, after: f } });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "marketing.label.manage"); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ data: null, error: "ไม่พบเป้า" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("content_plan_targets").select(SEL).eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ data: null, error: "ไม่พบเป้า (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { error } = await admin.from("content_plan_targets").delete().eq("id", id);
  if (error) return NextResponse.json({ data: null, error: "ลบไม่สำเร็จ: " + error.message }, { status: 500 });
  const { actorId, actorName } = await actor(request);
  await writeAudit(admin, { action: "marketing.plan_target.delete", entityType: "content_plan_targets", entityId: id, actorId, actorName, metadata: { target: before } });
  return NextResponse.json({ data: { ok: true }, error: null });
}
