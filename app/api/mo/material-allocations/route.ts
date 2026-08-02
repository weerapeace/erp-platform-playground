/**
 * แบ่งวัตถุดิบเข้าใบสั่งผลิต (เฟส 2) — /api/mo/material-allocations
 *   GET    ?code=<รหัสวัตถุดิบ>  → ประวัติการแบ่งล่าสุดของวัตถุดิบตัวนี้
 *          ?mo_no=<เลขใบ>        → ประวัติของใบงานนั้น
 *   POST   { items:[{summary_id, qty}], source?, ref_type?, ref_id?, ref_label?, note? }
 *          → บันทึกการแบ่ง + บวกเข้า mo_material_summary.on_hand_qty + คำนวณ "ต้องซื้อ" ใหม่
 *   DELETE { id }                → ยกเลิกการแบ่ง 1 รายการ (คืนยอดกลับ, เก็บประวัติไว้)
 *
 * ⚠️ ยอดจริงอยู่ที่ mo_material_summary.on_hand_qty (ช่องเดิมที่ทั้งระบบใช้คิดความพร้อม)
 *    ตารางนี้เป็นสมุดบัญชีไว้ย้อนดู/ยกเลิก — ไม่ได้ทำ reserve หักจากคลัง (รอเฟส 0 สต๊อกจริง)
 * ของกลาง: guardApi + supabaseAdmin + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type Allocation = {
  id: string; summary_id: string; mo_no: string; component_sku: string | null;
  qty: number; source: string; ref_label: string | null; note: string | null;
  actor_name: string | null; created_at: string;
};

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const num = (v: unknown) => Number(v ?? 0) || 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const code = (sp.get("code") ?? "").trim();
  const moNo = (sp.get("mo_no") ?? "").trim();
  if (!code && !moNo) return NextResponse.json({ data: [], error: null });

  let q = supabaseAdmin().from("mo_material_allocations")
    .select("id, summary_id, mo_no, component_sku, qty, source, ref_label, note, actor_name, created_at")
    .eq("is_active", true).order("created_at", { ascending: false }).limit(100);
  if (code) q = q.eq("component_sku", code);
  if (moNo) q = q.eq("mo_no", moNo);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as Allocation[], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: {
    items?: { summary_id?: string; qty?: number }[];
    source?: string; ref_type?: string; ref_id?: string; ref_label?: string; note?: string;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const items = (body.items ?? []).filter((i) => i?.summary_id && num(i.qty) > 0);
  if (items.length === 0) return NextResponse.json({ error: "ไม่มีรายการที่จะแบ่ง (จำนวนต้องมากกว่า 0)" }, { status: 400 });
  if (items.length > 200) return NextResponse.json({ error: "แบ่งได้ครั้งละไม่เกิน 200 ใบงาน" }, { status: 400 });

  const admin = supabaseAdmin();
  const ids = items.map((i) => String(i.summary_id));
  const { data: rows, error: readErr } = await admin.from("mo_material_summary")
    .select("id, mo_no, component_sku, qty_per, required_qty, on_hand_qty")
    .in("id", ids).eq("is_active", true);
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  const byId = new Map(((rows ?? []) as Record<string, unknown>[]).map((r) => [String(r.id), r]));
  if (byId.size === 0) return NextResponse.json({ error: "ไม่พบรายการวัตถุดิบที่จะแบ่ง" }, { status: 404 });

  // จำนวนสั่งผลิตของแต่ละใบ (ไว้คิด "ต้องใช้" กรณีไม่มี required_qty)
  const moNos = [...new Set([...byId.values()].map((r) => String(r.mo_no)))];
  const { data: mos } = await admin.from("manufacturing_orders").select("mo_no, qty").in("mo_no", moNos);
  const moQty = new Map(((mos ?? []) as Record<string, unknown>[]).map((m) => [String(m.mo_no), num(m.qty)]));

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actorName = user?.email ?? null;
  const source = (body.source ?? "receive").slice(0, 20);

  const allocRows: Record<string, unknown>[] = [];
  const results: { summary_id: string; mo_no: string; qty: number; on_hand: number; required: number; covered: boolean }[] = [];
  const fails: string[] = [];

  for (const it of items) {
    const r = byId.get(String(it.summary_id));
    if (!r) { fails.push(String(it.summary_id)); continue; }
    const qty = r4(num(it.qty));
    const required = num(r.required_qty) > 0 ? num(r.required_qty) : r4(num(r.qty_per) * (moQty.get(String(r.mo_no)) ?? 0));
    const nextOnHand = r4(num(r.on_hand_qty) + qty);
    const toPurchase = Math.max(0, r4(required - nextOnHand));

    const { error: upErr } = await admin.from("mo_material_summary")
      .update({ on_hand_qty: nextOnHand, to_purchase_qty: toPurchase })
      .eq("id", String(r.id));
    if (upErr) { fails.push(String(r.mo_no)); continue; }

    allocRows.push({
      summary_id: String(r.id), mo_no: String(r.mo_no), component_sku: (r.component_sku as string) ?? null,
      qty, source, ref_type: body.ref_type ?? null, ref_id: body.ref_id ?? null, ref_label: body.ref_label ?? null,
      note: body.note ?? null, actor_user_id: user?.id ?? null, actor_name: actorName,
    });
    results.push({ summary_id: String(r.id), mo_no: String(r.mo_no), qty, on_hand: nextOnHand, required, covered: required > 0 && nextOnHand >= required });
  }

  if (allocRows.length > 0) await admin.from("mo_material_allocations").insert(allocRows);

  await writeAudit(admin, {
    action: "allocate", entityType: "mo_material_allocations", entityId: null,
    actorId: user?.id ?? null, actorName,
    metadata: {
      component_sku: allocRows[0]?.component_sku ?? null, source, ref_label: body.ref_label ?? null,
      count: allocRows.length, total_qty: r4(results.reduce((n, x) => n + x.qty, 0)),
      mo_nos: results.map((x) => x.mo_no).slice(0, 20),
    },
  }).catch(() => { /* audit ห้ามบล็อกงานหลัก */ });

  return NextResponse.json({
    ok: allocRows.length > 0, allocated: allocRows.length, results,
    covered: results.filter((x) => x.covered).length,
    failed: fails,
    error: allocRows.length === 0 ? "แบ่งไม่สำเร็จ" : null,
  }, { status: allocRows.length === 0 ? 400 : 200 });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: a } = await admin.from("mo_material_allocations")
    .select("id, summary_id, mo_no, component_sku, qty, is_active").eq("id", id).maybeSingle();
  const alloc = a as Record<string, unknown> | null;
  if (!alloc) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  if (alloc.is_active === false) return NextResponse.json({ error: "รายการนี้ถูกยกเลิกไปแล้ว" }, { status: 400 });

  const { data: s } = await admin.from("mo_material_summary")
    .select("id, qty_per, required_qty, on_hand_qty, mo_no").eq("id", String(alloc.summary_id)).maybeSingle();
  const row = s as Record<string, unknown> | null;
  if (row) {
    const { data: mo } = await admin.from("manufacturing_orders").select("qty").eq("mo_no", String(row.mo_no)).maybeSingle();
    const required = num(row.required_qty) > 0 ? num(row.required_qty) : r4(num(row.qty_per) * num((mo as Record<string, unknown> | null)?.qty));
    const nextOnHand = Math.max(0, r4(num(row.on_hand_qty) - num(alloc.qty)));   // กันติดลบ
    await admin.from("mo_material_summary")
      .update({ on_hand_qty: nextOnHand, to_purchase_qty: Math.max(0, r4(required - nextOnHand)) })
      .eq("id", String(row.id));
  }
  await admin.from("mo_material_allocations").update({ is_active: false }).eq("id", id);

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "unallocate", entityType: "mo_material_allocations", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { mo_no: alloc.mo_no, component_sku: alloc.component_sku, qty: alloc.qty },
  }).catch(() => { /* ignore */ });

  return NextResponse.json({ ok: true, error: null });
}
