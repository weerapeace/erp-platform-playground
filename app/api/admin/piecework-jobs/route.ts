/**
 * ทะเบียนงานเหมารายชิ้นกลาง (piecework_jobs) — /api/admin/piecework-jobs
 * GET            → list งานเหมา (active, เรียง sort_order) — ใช้ products.view เพื่อให้ dropdown ใน BOM ใช้ได้
 * GET ?history=<job_id> → ประวัติราคาของงานนั้น (ใหม่→เก่า)
 * GET ?manage=1  → ทุกงาน (รวมที่เก็บแล้ว) + ใช้ใน BOM กี่สูตร · จ่ายไปกี่ครั้ง · แก้ราคาล่าสุด (หน้า ผลิต → จัดการงานเหมา)
 * GET ?usage=<job_id> → BOM ที่ใช้งานนี้ + จ่ายล่าสุด 30 ครั้ง
 * POST { action:"reorder", ids } → เรียงลำดับ (= ลำดับในช่อง "งานเหมา" ทุกที่)
 * POST { action:"merge", from, into } → รวมงานซ้ำ: BOM + งานที่จ่าย ย้ายไปงาน into แล้วเก็บงาน from
 * POST           → { name, code?, default_rate?, is_detail?, note? } (+ บันทึกประวัติราคาตั้งต้น)
 * PATCH          → { id, name?, code?, default_rate?, is_detail?, note?, sort_order?, is_active?, bom_rate? } (ถ้าราคาเปลี่ยน → บันทึกประวัติ · bom_rate = เปลี่ยนราคาใน BOM ที่ใช้งานนี้ด้วย)
 * DELETE ?id=    → เก็บ (soft: is_active=false — ไม่ขึ้นให้เลือกอีก ข้อมูลเดิมไม่หาย)
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
/** แถวในหน้าจัดการงานเหมา */
export type PieceworkJobManage = PieceworkJob & { is_active: boolean; bom_count: number; dispatch_count: number; last_rate_at: string | null };
export type PieceworkUsage = {
  boms: { bom_code: string; product_sku: string | null; rate: number; qty_per: number }[];
  recent: { id: string; mo_no: string; assignee_name: string | null; total_qty: number; rate: number; status: string; date: string }[];
};
export type PieceworkRate = {
  id: string; rate: number; contractor_name: string | null; note: string | null; effective_date: string; created_at: string;
};

const numOr = (v: unknown, d = 0) => { const n = Number(v); return isFinite(n) ? n : d; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const historyJob = new URL(request.url).searchParams.get("history");

  const sp = new URL(request.url).searchParams;
  if (sp.get("manage") === "1") return manageList(admin);
  const usageJob = sp.get("usage");
  if (usageJob) return usageOf(admin, usageJob);

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
  let b: { name?: string; code?: string; default_rate?: unknown; is_detail?: boolean; note?: string; action?: string; ids?: string[]; from?: string; into?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (b.action === "reorder") return reorder(b.ids ?? [], user?.id ?? null, user?.email ?? null);
  if (b.action === "merge") return merge(String(b.from ?? ""), String(b.into ?? ""), user?.id ?? null, user?.email ?? null);
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
  let b: { id?: string; name?: string; code?: string; default_rate?: unknown; is_detail?: boolean; note?: string; sort_order?: number; rate_note?: string; is_active?: boolean; bom_rate?: boolean };
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
  if (typeof b.is_active === "boolean") patch.is_active = b.is_active;   // คืนกลับมาใช้ / เก็บ
  if (typeof patch.name === "string" && !patch.name) return NextResponse.json({ error: "ชื่องานห้ามว่าง" }, { status: 400 });

  const { error } = await admin.from("piecework_jobs").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // ราคาเปลี่ยน → บันทึกประวัติ
  const oldRate = numOr((cur as { default_rate?: number }).default_rate);
  if (patch.default_rate !== undefined && Number(patch.default_rate) !== oldRate) {
    await admin.from("piecework_rate_history").insert({
      job_id: b.id, rate: Number(patch.default_rate), note: (b.rate_note ?? "แก้ราคา"), created_by: user?.id ?? null,
    }).then(() => {}, () => {});
  }
  // เปลี่ยนชื่อ → ชื่อใน BOM ตามด้วย (BOM เก็บชื่อไว้แสดง) · ติ๊ก "เปลี่ยนราคาใน BOM ด้วย" → ราคาใน BOM ที่ใช้งานนี้ = ราคาใหม่
  let bomUpdated = 0;
  if (typeof patch.name === "string" && patch.name !== (cur as { name?: string }).name)
    await admin.from("bom_piecework_lines").update({ job_name: patch.name, updated_at: new Date().toISOString() }).eq("job_id", b.id).eq("is_active", true);
  if (b.bom_rate && patch.default_rate !== undefined) {
    const { data: upd } = await admin.from("bom_piecework_lines").update({ rate: Number(patch.default_rate), updated_at: new Date().toISOString() }).eq("job_id", b.id).eq("is_active", true).select("id");
    bomUpdated = (upd ?? []).length;
  }
  await writeAudit(admin, { action: "update", entityType: "piecework_job", entityId: b.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { ...patch, ...(b.bom_rate ? { bom_rate: true, bom_updated: bomUpdated } : {}) } });
  return NextResponse.json({ id: b.id, bom_updated: bomUpdated, error: null });
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

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;

async function manageList(admin: Admin): Promise<NextResponse> {
  const [{ data: jobs, error }, { data: boms }, { data: mos }, { data: hist }] = await Promise.all([
    admin.from("piecework_jobs").select("id, name, code, default_rate, is_detail, note, sort_order, is_active").order("sort_order", { ascending: true }).order("name", { ascending: true }),
    admin.from("bom_piecework_lines").select("job_id, bom_code").eq("is_active", true).not("job_id", "is", null).limit(20000),
    admin.from("mo_piecework").select("job_id").eq("is_active", true).not("job_id", "is", null).limit(50000),
    admin.from("piecework_rate_history").select("job_id, created_at").order("created_at", { ascending: false }).limit(20000),
  ]);
  if (error) return NextResponse.json({ data: [], error: "โหลดงานเหมาไม่สำเร็จ" }, { status: 500 });
  const bomSet = new Map<string, Set<string>>();
  for (const r of (boms ?? []) as Row[]) { const k = String(r.job_id); const set = bomSet.get(k) ?? new Set<string>(); set.add(String(r.bom_code)); bomSet.set(k, set); }
  const disp = new Map<string, number>();
  for (const r of (mos ?? []) as Row[]) disp.set(String(r.job_id), (disp.get(String(r.job_id)) ?? 0) + 1);
  const lastRate = new Map<string, string>();
  for (const r of (hist ?? []) as Row[]) if (!lastRate.has(String(r.job_id))) lastRate.set(String(r.job_id), String(r.created_at));
  const out: PieceworkJobManage[] = ((jobs ?? []) as Row[]).map((r) => ({
    id: String(r.id), name: String(r.name ?? ""), code: (r.code as string) ?? null, default_rate: numOr(r.default_rate), is_detail: !!r.is_detail,
    note: (r.note as string) ?? null, sort_order: numOr(r.sort_order), is_active: r.is_active !== false,
    bom_count: bomSet.get(String(r.id))?.size ?? 0, dispatch_count: disp.get(String(r.id)) ?? 0, last_rate_at: lastRate.get(String(r.id)) ?? null,
  }));
  return NextResponse.json({ data: out, error: null });
}

async function usageOf(admin: Admin, jobId: string): Promise<NextResponse> {
  const [{ data: lines }, { data: mos }] = await Promise.all([
    admin.from("bom_piecework_lines").select("bom_code, rate, qty_per").eq("job_id", jobId).eq("is_active", true).order("bom_code").limit(500),
    admin.from("mo_piecework").select("id, mo_no, assignee_name, total_qty, rate, status, dispatched_at, created_at").eq("job_id", jobId).eq("is_active", true).order("created_at", { ascending: false }).limit(30),
  ]);
  const codes = [...new Set(((lines ?? []) as Row[]).map((l) => String(l.bom_code)))];
  const { data: heads } = codes.length ? await admin.from("bom_headers").select("bom_code, product_sku").in("bom_code", codes) : { data: [] as Row[] };
  const skuOf = new Map(((heads ?? []) as Row[]).map((h) => [String(h.bom_code), (h.product_sku as string) ?? null]));
  const out: PieceworkUsage = {
    boms: ((lines ?? []) as Row[]).map((l) => ({ bom_code: String(l.bom_code), product_sku: skuOf.get(String(l.bom_code)) ?? null, rate: numOr(l.rate), qty_per: numOr(l.qty_per, 1) })),
    recent: ((mos ?? []) as Row[]).map((m) => ({ id: String(m.id), mo_no: String(m.mo_no), assignee_name: (m.assignee_name as string) ?? null, total_qty: numOr(m.total_qty), rate: numOr(m.rate),
      status: String(m.status ?? "pending"), date: String(m.dispatched_at ?? m.created_at ?? "").slice(0, 10) })),
  };
  return NextResponse.json({ data: out, error: null });
}

async function reorder(ids: string[], actorId: string | null, actorName: string | null): Promise<NextResponse> {
  const list = ids.filter((x) => typeof x === "string" && x).slice(0, 500);
  if (!list.length) return NextResponse.json({ error: "ไม่มีรายการให้เรียง" }, { status: 400 });
  const admin = supabaseAdmin();
  for (let i = 0; i < list.length; i++) {
    const { error } = await admin.from("piecework_jobs").update({ sort_order: i + 1, updated_at: new Date().toISOString() }).eq("id", list[i]);
    if (error) return NextResponse.json({ error: "บันทึกลำดับไม่สำเร็จ" }, { status: 400 });
  }
  await writeAudit(admin, { action: "piecework_job.reorder", entityType: "piecework_job", entityId: null, actorId, actorName, metadata: { ids: list } });
  return NextResponse.json({ data: { count: list.length }, error: null });
}

/** รวมงานซ้ำ: BOM + งานที่จ่าย (from) → into · BOM ที่มีงาน into อยู่แล้ว = เก็บแถว from ทิ้ง (ไม่ให้ซ้ำในสูตรเดียว) · แล้วเก็บงาน from */
async function merge(from: string, into: string, actorId: string | null, actorName: string | null): Promise<NextResponse> {
  if (!from || !into || from === into) return NextResponse.json({ error: "เลือกงานที่จะรวมให้ถูก" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: jobs } = await admin.from("piecework_jobs").select("id, name").in("id", [from, into]);
  const src = ((jobs ?? []) as Row[]).find((j) => j.id === from), dst = ((jobs ?? []) as Row[]).find((j) => j.id === into);
  if (!src || !dst) return NextResponse.json({ error: "ไม่พบงานเหมา" }, { status: 404 });
  const now = new Date().toISOString();
  const { data: fromLines } = await admin.from("bom_piecework_lines").select("id, bom_code").eq("job_id", from).eq("is_active", true);
  const { data: intoLines } = await admin.from("bom_piecework_lines").select("bom_code").eq("job_id", into).eq("is_active", true);
  const has = new Set(((intoLines ?? []) as Row[]).map((l) => String(l.bom_code)));
  let moved = 0, dropped = 0;
  for (const l of (fromLines ?? []) as Row[]) {
    const patch = has.has(String(l.bom_code)) ? { is_active: false, updated_at: now } : { job_id: into, job_name: dst.name, updated_at: now };
    const { error } = await admin.from("bom_piecework_lines").update(patch).eq("id", String(l.id));
    if (!error) { if (has.has(String(l.bom_code))) dropped++; else { moved++; has.add(String(l.bom_code)); } }
  }
  const { data: mos } = await admin.from("mo_piecework").update({ job_id: into, job_name: dst.name, updated_at: now }).eq("job_id", from).select("id");
  await admin.from("piecework_jobs").update({ is_active: false, note: `รวมเข้า "${dst.name}"`, updated_at: now }).eq("id", from);
  await writeAudit(admin, { action: "piecework_job.merge", entityType: "piecework_job", entityId: into, actorId, actorName,
    metadata: { from, from_name: src.name, into, into_name: dst.name, bom_moved: moved, bom_dropped: dropped, dispatch_moved: (mos ?? []).length } });
  return NextResponse.json({ data: { bom_moved: moved, bom_dropped: dropped, dispatch_moved: (mos ?? []).length }, error: null });
}
