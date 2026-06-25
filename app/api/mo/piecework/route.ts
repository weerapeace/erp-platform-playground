/**
 * งานเหมารายชิ้นต่อใบสั่งผลิต (mo_piecework) — /api/mo/piecework
 * GET ?mo_id=   → รวมงานเหมาใน BOM ของสินค้านั้น (จำนวน = qty_per × จำนวนสั่ง) + บอกว่าเลือกจ่ายแล้วหรือยัง
 * POST { mo_id, job_id?, job_name, rate?, qty_per?, is_detail?, note? } → เลือกจ่ายงานนี้ (สร้างแถว mo_piecework)
 * DELETE ?id=   → ยกเลิกงานที่เลือก (soft: is_active=false)
 * ของกลาง: guardApi(products.view/edit) + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MoPieceRow = {
  key: string; selected_id: string | null;
  job_id: string | null; job_name: string; rate: number;
  qty_per: number; total_qty: number; is_detail: boolean; note: string | null;
  in_bom: boolean; status: string;   // pending | done (กด "งานเหมาเสร็จ")
};

const num = (v: unknown, d = 0) => { const n = Number(v); return isFinite(n) ? n : d; };
const keyOf = (jobId: string | null, name: string) => jobId ? `id:${jobId}` : `nm:${name.trim().toLowerCase()}`;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const moId = (new URL(request.url).searchParams.get("mo_id") ?? "").trim();
  if (!moId) return NextResponse.json({ data: [], mo_qty: 0, error: null });

  const admin = supabaseAdmin();
  const { data: mo } = await admin.from("manufacturing_orders").select("mo_no, qty, bom_code").eq("id", moId).maybeSingle();
  if (!mo) return NextResponse.json({ data: [], mo_qty: 0, error: "ไม่พบใบสั่งผลิต" }, { status: 404 });
  const moNo = (mo as { mo_no: string }).mo_no;
  const moQty = num((mo as { qty: number }).qty, 0);
  const bomCode = (mo as { bom_code: string | null }).bom_code;

  const [{ data: tmpl }, { data: chosen }] = await Promise.all([
    bomCode
      ? admin.from("bom_piecework_lines").select("job_id, job_name, rate, is_detail, qty_per, note").eq("bom_code", bomCode).eq("is_active", true).order("sequence", { ascending: true })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin.from("mo_piecework").select("id, job_id, job_name, rate, qty_per, total_qty, is_detail, note, status").eq("mo_no", moNo).eq("is_active", true),
  ]);

  const map = new Map<string, MoPieceRow>();
  for (const t of (tmpl ?? []) as Record<string, unknown>[]) {
    const jobId = (t.job_id as string) ?? null; const name = String(t.job_name ?? "");
    const qtyPer = num(t.qty_per, 1);
    map.set(keyOf(jobId, name), { key: keyOf(jobId, name), selected_id: null, job_id: jobId, job_name: name,
      rate: num(t.rate), qty_per: qtyPer, total_qty: qtyPer * moQty, is_detail: !!t.is_detail, note: (t.note as string) ?? null, in_bom: true, status: "pending" });
  }
  for (const c of (chosen ?? []) as Record<string, unknown>[]) {
    const jobId = (c.job_id as string) ?? null; const name = String(c.job_name ?? "");
    const k = keyOf(jobId, name); const existing = map.get(k);
    if (existing) { existing.selected_id = String(c.id); existing.status = String(c.status ?? "pending"); }
    else map.set(k, { key: k, selected_id: String(c.id), job_id: jobId, job_name: name,
      rate: num(c.rate), qty_per: num(c.qty_per, 1), total_qty: num(c.total_qty), is_detail: !!c.is_detail, note: (c.note as string) ?? null, in_bom: false, status: String(c.status ?? "pending") });
  }
  return NextResponse.json({ data: Array.from(map.values()), mo_qty: moQty, error: null });
}

type PostBody = { mo_id?: string; job_id?: string | null; job_name?: string; rate?: unknown; qty_per?: unknown; is_detail?: boolean; note?: string | null };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: PostBody; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const moId = (b.mo_id ?? "").trim();
  const name = (b.job_name ?? "").trim();
  if (!moId || !name) return NextResponse.json({ error: "ต้องระบุ mo_id และ job_name" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: mo } = await admin.from("manufacturing_orders").select("mo_no, qty").eq("id", moId).maybeSingle();
  if (!mo) return NextResponse.json({ error: "ไม่พบใบสั่งผลิต" }, { status: 404 });
  const moNo = (mo as { mo_no: string }).mo_no;
  const moQty = num((mo as { qty: number }).qty, 0);
  const qtyPer = num(b.qty_per, 1);

  const { data, error } = await admin.from("mo_piecework").insert({
    mo_no: moNo, job_id: b.job_id ?? null, job_name: name, rate: num(b.rate), qty_per: qtyPer, total_qty: qtyPer * moQty,
    is_detail: !!b.is_detail, note: (b.note ?? "")?.toString().trim() || null, status: "pending", created_by: user?.id ?? null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "mo_piecework", entityId: (data as { id: string }).id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { mo_no: moNo, job_name: name, total_qty: qtyPer * moQty } });
  return NextResponse.json({ id: (data as { id: string }).id, total_qty: qtyPer * moQty, error: null });
}

// ---- PATCH: กด "งานเหมาเสร็จ" / ยกเลิกเสร็จ · หรือ จ่ายให้ช่างเหมา (assignee_name) ----
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: { id?: string; done?: boolean; assignee_name?: string | null }; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = (b.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  // จ่าย/คืน งานเหมาให้ช่างเหมา (assignee_name) — ส่ง null = คืนเข้ารอจ่าย
  if (b.assignee_name !== undefined) patch.assignee_name = (b.assignee_name ?? "").toString().trim() || null;
  // กดเสร็จ/ยกเลิกเสร็จ
  if (b.done !== undefined) { patch.status = b.done ? "done" : "pending"; patch.done_at = b.done ? new Date().toISOString() : null; }
  const { error } = await admin.from("mo_piecework").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "mo_piecework", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: patch });
  return NextResponse.json({ data: { id }, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("mo_piecework").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "mo_piecework", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ data: { deleted: true }, error: null });
}
