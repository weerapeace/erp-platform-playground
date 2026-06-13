/**
 * ทะเบียนงานเหมารายชิ้นกลาง (piecework_jobs) — /api/admin/piecework-jobs
 * GET            → list งานเหมา (active, เรียง sort_order) — ใช้ products.view เพื่อให้ dropdown ใน BOM ใช้ได้
 * GET ?history=<job_id> → ประวัติราคาของงานนั้น (ใหม่→เก่า)
 * POST           → { name, code?, default_rate?, is_detail?, note? } (+ บันทึกประวัติราคาตั้งต้น)
 * PATCH          → { id, name?, code?, default_rate?, is_detail?, note?, sort_order? } (ถ้าราคาเปลี่ยน → บันทึกประวัติ)
 * DELETE ?id=    → ลบ (soft: is_active=false)
 * ของกลาง: guardApi (GET=products.view, เขียน=production.piecework) + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type PieceworkJob = {
  id: string; name: string; code: string | null; default_rate: number;
  is_detail: boolean; note: string | null; sort_order: number;
};
export type PieceworkRate = {
  id: string; rate: number; contractor_name: string | null; note: string | null; effective_date: string; created_at: string;
};

const numOr = (v: unknown, d = 0) => { const n = Number(v); return isFinite(n) ? n : d; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const historyJob = new URL(request.url).searchParams.get("history");

  if (historyJob) {
    const { data, error } = await admin.from("piecework_rate_history")
      .select("id, rate, contractor_name, note, effective_date, created_at")
      .eq("job_id", historyJob).order("created_at", { ascending: false });
    if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
    const out: PieceworkRate[] = (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id), rate: numOr(r.rate), contractor_name: (r.contractor_name as string) ?? null,
      note: (r.note as string) ?? null, effective_date: String(r.effective_date ?? ""), created_at: String(r.created_at ?? ""),
    }));
    return NextResponse.json({ data: out, error: null });
  }

  const { data, error } = await admin.from("piecework_jobs")
    .select("id, name, code, default_rate, is_detail, note, sort_order").eq("is_active", true)
    .order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const out: PieceworkJob[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id), name: String(r.name ?? ""), code: (r.code as string) ?? null,
    default_rate: numOr(r.default_rate), is_detail: !!r.is_detail, note: (r.note as string) ?? null, sort_order: numOr(r.sort_order),
  }));
  return NextResponse.json({ data: out, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "production.piecework"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: { name?: string; code?: string; default_rate?: unknown; is_detail?: boolean; note?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (b.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ต้องระบุชื่องาน" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: maxRow } = await admin.from("piecework_jobs").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (numOr((maxRow as { sort_order?: number } | null)?.sort_order) || 0) + 1;
  const rate = numOr(b.default_rate);
  const { data, error } = await admin.from("piecework_jobs").insert({
    name, code: (b.code ?? "").trim() || null, default_rate: rate, is_detail: !!b.is_detail, note: (b.note ?? "").trim() || null, sort_order: nextOrder,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const id = (data as { id: string }).id;
  if (rate > 0) await admin.from("piecework_rate_history").insert({ job_id: id, rate, note: "ตั้งต้น", created_by: user?.id ?? null }).then(() => {}, () => {});
  await writeAudit(admin, { action: "create", entityType: "piecework_job", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name, rate } });
  return NextResponse.json({ id, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "production.piecework"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: { id?: string; name?: string; code?: string; default_rate?: unknown; is_detail?: boolean; note?: string; sort_order?: number; rate_note?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("piecework_jobs").select("default_rate, name").eq("id", b.id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบงานเหมานี้" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.name === "string") patch.name = b.name.trim();
  if (typeof b.code === "string") patch.code = b.code.trim() || null;
  if (b.default_rate !== undefined) patch.default_rate = numOr(b.default_rate);
  if (typeof b.is_detail === "boolean") patch.is_detail = b.is_detail;
  if (typeof b.note === "string") patch.note = b.note.trim() || null;
  if (typeof b.sort_order === "number") patch.sort_order = b.sort_order;

  const { error } = await admin.from("piecework_jobs").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // ราคาเปลี่ยน → บันทึกประวัติ
  const oldRate = numOr((cur as { default_rate?: number }).default_rate);
  if (patch.default_rate !== undefined && Number(patch.default_rate) !== oldRate) {
    await admin.from("piecework_rate_history").insert({
      job_id: b.id, rate: Number(patch.default_rate), note: (b.rate_note ?? "แก้ราคา"), created_by: user?.id ?? null,
    }).then(() => {}, () => {});
  }
  await writeAudit(admin, { action: "update", entityType: "piecework_job", entityId: b.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: patch });
  return NextResponse.json({ id: b.id, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "production.piecework"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("piecework_jobs").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "piecework_job", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ data: { deleted: true }, error: null });
}
