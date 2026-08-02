import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type CountSession = {
  id: string; count_no: string | null; warehouse_id: string | null;
  warehouse_code: string | null; warehouse_name: string | null;
  status: string; note: string | null; created_at: string; applied_at: string | null;
};
export type CountLine = {
  id: string; product_id: string; product_sku: string | null; product_name: string | null;
  system_qty: number; counted_qty: number | null;
};

type Admin = ReturnType<typeof supabaseAdmin>;
async function whMap(admin: Admin, ids: (string | null)[]) {
  const uniq = [...new Set(ids.filter(Boolean))] as string[];
  if (!uniq.length) return new Map<string, { code: string; name: string }>();
  const { data } = await admin.from("erp_playground_warehouses").select("id, code, name").in("id", uniq);
  return new Map((data ?? []).map((w) => [w.id as string, { code: w.code as string, name: w.name as string }]));
}

// GET ?id=  → หัว+รายการ · GET → ลิสต์รอบนับ
export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "stock.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const id = new URL(request.url).searchParams.get("id");

  if (id) {
    const { data: s } = await admin.from("erp_stock_counts").select("*").eq("id", id).maybeSingle();
    if (!s) return NextResponse.json({ error: "ไม่พบรอบนับ" }, { status: 404 });
    const wm = await whMap(admin, [s.warehouse_id as string]);
    const w = wm.get(s.warehouse_id as string);
    const { data: lines } = await admin.from("erp_stock_count_lines").select("*").eq("count_id", id).order("product_sku", { ascending: true });
    return NextResponse.json({
      session: { ...s, warehouse_code: w?.code ?? null, warehouse_name: w?.name ?? null } as CountSession,
      lines: (lines ?? []) as CountLine[], error: null,
    });
  }

  const { data: rows } = await admin.from("erp_stock_counts").select("*").order("created_at", { ascending: false }).limit(100);
  const wm = await whMap(admin, (rows ?? []).map((r) => r.warehouse_id as string));
  const sessions = (rows ?? []).map((r) => {
    const w = wm.get(r.warehouse_id as string);
    return { ...r, warehouse_code: w?.code ?? null, warehouse_name: w?.name ?? null } as CountSession;
  });
  return NextResponse.json({ sessions, error: null });
}

// POST { action: open | save | apply }
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const action = String(body.action ?? "");
  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = user?.email ?? null;

  if (action === "open") {
    const denied = await guardApi(request, "stock.view"); if (denied) return denied;
    if (!body.warehouse_id) return NextResponse.json({ error: "เลือกคลังก่อน" }, { status: 400 });
    const { data, error } = await admin.rpc("erp_stock_count_open", { p_warehouse_id: body.warehouse_id, p_actor: actor });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data, error: null });
  }

  if (action === "save") {
    const denied = await guardApi(request, "stock.view"); if (denied) return denied;
    if (!body.line_id) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 400 });
    const val = body.counted_qty === null || body.counted_qty === "" ? null : Number(body.counted_qty);
    const { error } = await admin.from("erp_stock_count_lines").update({ counted_qty: val }).eq("id", body.line_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ error: null });
  }

  if (action === "apply") {
    const denied = await guardApi(request, "stock.adjust"); if (denied) return denied;
    if (!body.count_id) return NextResponse.json({ error: "ไม่พบรอบนับ" }, { status: 400 });
    const { data, error } = await admin.rpc("erp_stock_count_apply", { p_count_id: body.count_id, p_actor: actor });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ adjusted: data, error: null });
  }

  // สแกนบาร์โค้ด → หา SKU + นับ +1 (เพิ่ม line ถ้ายังไม่มี)
  if (action === "scan") {
    const denied = await guardApi(request, "stock.view"); if (denied) return denied;
    if (!body.count_id || !body.code) return NextResponse.json({ error: "ต้องมี count_id + code" }, { status: 400 });
    const { data, error } = await admin.rpc("erp_stock_count_scan", { p_count_id: body.count_id, p_code: String(body.code).trim() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (!row?.found) return NextResponse.json({ found: false, error: null });
    return NextResponse.json({ found: true, line: { id: row.line_id, product_sku: row.product_sku, product_name: row.product_name, system_qty: Number(row.sys_qty), counted_qty: Number(row.cnt_qty) }, error: null });
  }

  // เพิ่มสินค้าเข้ารอบนับด้วยมือ (เลือกจาก picker)
  if (action === "add_line") {
    const denied = await guardApi(request, "stock.view"); if (denied) return denied;
    const count_id = body.count_id as string | undefined, product_id = body.product_id as string | undefined;
    if (!count_id || !product_id) return NextResponse.json({ error: "ต้องมี count_id + product_id" }, { status: 400 });
    const { data: exist } = await admin.from("erp_stock_count_lines").select("id, product_sku, product_name, system_qty, counted_qty").eq("count_id", count_id).eq("product_id", product_id).maybeSingle();
    if (exist) return NextResponse.json({ line: exist, error: null });
    const { data: sku } = await admin.from("skus_v2").select("code, name_th").eq("id", product_id).maybeSingle();
    const { data: c } = await admin.from("erp_stock_counts").select("warehouse_id").eq("id", count_id).maybeSingle();
    const whId = (c as { warehouse_id?: string } | null)?.warehouse_id;
    let sysQty = 0;
    if (whId) { const { data: bal } = await admin.from("erp_playground_stock_balances").select("qty_on_hand").eq("product_id", product_id).eq("warehouse_id", whId).maybeSingle(); sysQty = Number((bal as { qty_on_hand?: number } | null)?.qty_on_hand ?? 0); }
    const skuRow = sku as { code?: string; name_th?: string } | null;
    const { data: inserted, error } = await admin.from("erp_stock_count_lines")
      .insert({ count_id, product_id, product_sku: skuRow?.code ?? null, product_name: skuRow?.name_th ?? skuRow?.code ?? null, system_qty: sysQty, counted_qty: null })
      .select("id, product_sku, product_name, system_qty, counted_qty").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ line: inserted, error: null });
  }

  // เติม "วัตถุดิบที่ใบสั่งผลิตต้องใช้" เข้ารอบนับทีเดียว (เฟส 0 — ตั้งยอดตั้งต้น)
  // เปิดรอบนับปกติจะได้เฉพาะของที่เคยมียอดในระบบ (ซึ่งยังว่าง) → ไม่งั้นต้องไล่เพิ่มเองทีละตัว 200+ รายการ
  if (action === "add_needed") {
    const denied = await guardApi(request, "stock.view"); if (denied) return denied;
    const count_id = body.count_id as string | undefined;
    if (!count_id) return NextResponse.json({ error: "ไม่พบรอบนับ" }, { status: 400 });

    const { data: c } = await admin.from("erp_stock_counts").select("warehouse_id, status").eq("id", count_id).maybeSingle();
    const cnt = c as { warehouse_id?: string; status?: string } | null;
    if (!cnt) return NextResponse.json({ error: "ไม่พบรอบนับ" }, { status: 404 });
    if (cnt.status && cnt.status !== "open") return NextResponse.json({ error: "รอบนับนี้ปิดแล้ว" }, { status: 400 });

    // รหัสวัตถุดิบที่ใบสั่งผลิต (ยังไม่จบ) ต้องใช้
    const { data: mos } = await admin.from("manufacturing_orders").select("mo_no")
      .eq("is_active", true).not("status", "in", "(cancelled,done)").limit(2000);
    const moNos = ((mos ?? []) as { mo_no: string }[]).map((m) => String(m.mo_no));
    if (moNos.length === 0) return NextResponse.json({ added: 0, skipped: 0, not_in_sku: 0, error: null });

    const { data: sums } = await admin.from("mo_material_summary").select("component_sku")
      .in("mo_no", moNos).eq("is_active", true).limit(5000);
    const codes = [...new Set(((sums ?? []) as { component_sku: string | null }[])
      .map((s) => String(s.component_sku ?? "").trim()).filter(Boolean))];
    if (codes.length === 0) return NextResponse.json({ added: 0, skipped: 0, not_in_sku: 0, error: null });

    const { data: skus } = await admin.from("skus_v2").select("id, code, name_th").in("code", codes.slice(0, 2000));
    const skuList = (skus ?? []) as { id: string; code: string; name_th: string | null }[];

    // ตัดตัวที่อยู่ในรอบนับแล้วออก (กดซ้ำได้ ไม่เพิ่มซ้ำ)
    const { data: exist } = await admin.from("erp_stock_count_lines").select("product_id").eq("count_id", count_id).limit(5000);
    const has = new Set(((exist ?? []) as { product_id: string }[]).map((x) => String(x.product_id)));
    const fresh = skuList.filter((s) => !has.has(String(s.id)));
    if (fresh.length === 0) return NextResponse.json({ added: 0, skipped: skuList.length, not_in_sku: codes.length - skuList.length, error: null });

    // ยอดในระบบตอนนี้ (ส่วนใหญ่ = 0 เพราะยังไม่เคยตั้งต้น)
    const balByProduct = new Map<string, number>();
    if (cnt.warehouse_id) {
      const { data: bals } = await admin.from("erp_playground_stock_balances")
        .select("product_id, qty_on_hand").eq("warehouse_id", cnt.warehouse_id)
        .in("product_id", fresh.map((s) => s.id)).limit(5000);
      for (const b of (bals ?? []) as { product_id: string; qty_on_hand: number }[]) balByProduct.set(String(b.product_id), Number(b.qty_on_hand) || 0);
    }

    const rows = fresh.map((s) => ({
      count_id, product_id: s.id, product_sku: s.code, product_name: s.name_th ?? s.code,
      system_qty: balByProduct.get(String(s.id)) ?? 0, counted_qty: null,
    }));
    const { error } = await admin.from("erp_stock_count_lines").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from("audit_logs").insert({
      actor_user_id: user?.id ?? null, action: "count_add_needed", entity_type: "erp_stock_counts", entity_id: count_id,
      metadata: { actor, added: rows.length, skipped: skuList.length - rows.length, from: "mo_material_summary" },
    }).then(() => {}, () => {});

    return NextResponse.json({ added: rows.length, skipped: skuList.length - rows.length, not_in_sku: codes.length - skuList.length, error: null });
  }

  // ลบรายการออกจากรอบนับ (เช่นสแกน/เพิ่มผิด)
  if (action === "delete_line") {
    const denied = await guardApi(request, "stock.view"); if (denied) return denied;
    if (!body.line_id) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 400 });
    const { error } = await admin.from("erp_stock_count_lines").delete().eq("id", body.line_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ error: null });
  }

  return NextResponse.json({ error: "ไม่รู้จัก action" }, { status: 400 });
}
