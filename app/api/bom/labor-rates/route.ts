/**
 * ค่าแรงผลิตต่อสินค้า (bom_labor_rates) — /api/bom/labor-rates
 * GET ?bom_code=            → ราคาปัจจุบัน (is_current) ของแต่ละช่าง
 * GET ?bom_code=&history=1  → ประวัติทั้งหมด (ใหม่→เก่า)
 * PUT { bom_code, rates:[{craftsman_id?, craftsman_name, rate, note?}] }
 *     → ตั้งราคาปัจจุบันทั้งชุด (ราคาที่เปลี่ยน/ถูกลบ → เก็บเป็นประวัติ is_current=false)
 * POST { bom_code, craftsman_id?, craftsman_name, rate, note? } → เพิ่ม/อัปเดตราคาช่างคนเดียว (จากใบจ่ายงาน)
 * ของกลาง: guardApi(products.view/edit) + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type LaborRate = {
  id: string; craftsman_id: string | null; craftsman_name: string | null;
  rate: number; note: string | null; is_current: boolean; created_at: string;
};

const num = (v: unknown, d = 0) => { const n = Number(v); return isFinite(n) ? n : d; };
const keyOf = (id: string | null, name: string | null) => id ? `id:${id}` : `nm:${(name ?? "").trim().toLowerCase()}`;
const mapRow = (r: Record<string, unknown>): LaborRate => ({
  id: String(r.id), craftsman_id: (r.craftsman_id as string) ?? null, craftsman_name: (r.craftsman_name as string) ?? null,
  rate: num(r.rate), note: (r.note as string) ?? null, is_current: !!r.is_current, created_at: String(r.created_at ?? ""),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const bomCode = (sp.get("bom_code") ?? "").trim();
  if (!bomCode) return NextResponse.json({ data: [], error: null });
  const admin = supabaseAdmin();
  let q = admin.from("bom_labor_rates").select("id, craftsman_id, craftsman_name, rate, note, is_current, created_at").eq("bom_code", bomCode).eq("is_active", true);
  q = sp.get("history") ? q.order("created_at", { ascending: false }) : q.eq("is_current", true).order("created_at", { ascending: true });
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []).map(mapRow), error: null });
}

type PutBody = { bom_code?: string; rates?: Array<{ craftsman_id?: string | null; craftsman_name?: string; rate?: unknown; note?: string | null }> };

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: PutBody; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const bomCode = (b.bom_code ?? "").trim();
  if (!bomCode) return NextResponse.json({ error: "ต้องระบุ bom_code" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: curRows } = await admin.from("bom_labor_rates").select("id, craftsman_id, craftsman_name, rate").eq("bom_code", bomCode).eq("is_active", true).eq("is_current", true);
  const cur = new Map((curRows ?? []).map((r: Record<string, unknown>) => [keyOf((r.craftsman_id as string) ?? null, (r.craftsman_name as string) ?? null), r]));

  const incoming = (b.rates ?? []).filter((r) => (r.craftsman_name ?? "").trim() || r.craftsman_id);
  const seen = new Set<string>();
  const archiveIds: string[] = [];
  const insertRows: Record<string, unknown>[] = [];
  for (const r of incoming) {
    const k = keyOf(r.craftsman_id ?? null, r.craftsman_name ?? null);
    seen.add(k);
    const ex = cur.get(k) as { id: string; rate: number } | undefined;
    const rate = num(r.rate);
    if (ex && num(ex.rate) === rate) continue;                 // ไม่เปลี่ยน → คงเดิม
    if (ex) archiveIds.push(String(ex.id));                    // เปลี่ยนราคา → เก็บเก่าเป็นประวัติ
    insertRows.push({ bom_code: bomCode, craftsman_id: r.craftsman_id ?? null, craftsman_name: (r.craftsman_name ?? "").trim() || null, rate, note: (r.note ?? "")?.toString().trim() || null, is_current: true, created_by: user?.id ?? null });
  }
  // ราคาที่ถูกลบออกจากชุด → เก็บเป็นประวัติ
  for (const [k, r] of cur) if (!seen.has(k)) archiveIds.push(String((r as { id: string }).id));

  if (archiveIds.length) await admin.from("bom_labor_rates").update({ is_current: false }).in("id", archiveIds);
  if (insertRows.length) { const { error } = await admin.from("bom_labor_rates").insert(insertRows); if (error) return NextResponse.json({ error: error.message }, { status: 400 }); }

  await writeAudit(admin, { action: "update", entityType: "bom_labor_rate", entityId: bomCode, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { bom_code: bomCode, changed: insertRows.length, archived: archiveIds.length } });
  return NextResponse.json({ data: { changed: insertRows.length }, error: null });
}

type PostBody = { bom_code?: string; product_sku?: string; craftsman_id?: string | null; craftsman_name?: string; rate?: unknown; note?: string | null };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: PostBody; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  let bomCode = (b.bom_code ?? "").trim();
  // ไม่ระบุ bom_code → หา BOM ที่ใช้งานของสินค้า (จากใบจ่ายงาน)
  if (!bomCode && (b.product_sku ?? "").trim()) {
    const { data: bom } = await admin.from("bom_headers").select("bom_code").eq("product_sku", (b.product_sku ?? "").trim()).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    bomCode = (bom as { bom_code?: string } | null)?.bom_code ?? "";
  }
  if (!bomCode) return NextResponse.json({ error: "ไม่พบ BOM ที่ใช้งานของสินค้านี้" }, { status: 400 });
  const k = keyOf(b.craftsman_id ?? null, b.craftsman_name ?? null);
  // หาแถวปัจจุบันของช่างคนนี้ → เก็บเป็นประวัติก่อน
  const { data: curRows } = await admin.from("bom_labor_rates").select("id, craftsman_id, craftsman_name").eq("bom_code", bomCode).eq("is_active", true).eq("is_current", true);
  const ex = (curRows ?? []).find((r: Record<string, unknown>) => keyOf((r.craftsman_id as string) ?? null, (r.craftsman_name as string) ?? null) === k) as { id: string } | undefined;
  if (ex) await admin.from("bom_labor_rates").update({ is_current: false }).eq("id", ex.id);
  const { data, error } = await admin.from("bom_labor_rates").insert({
    bom_code: bomCode, craftsman_id: b.craftsman_id ?? null, craftsman_name: (b.craftsman_name ?? "").trim() || null, rate: num(b.rate), note: (b.note ?? "")?.toString().trim() || null, is_current: true, created_by: user?.id ?? null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "bom_labor_rate", entityId: (data as { id: string }).id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { bom_code: bomCode, rate: num(b.rate), craftsman: b.craftsman_name } });
  return NextResponse.json({ id: (data as { id: string }).id, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const { error } = await supabaseAdmin().from("bom_labor_rates").update({ is_active: false, is_current: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: { deleted: true }, error: null });
}
