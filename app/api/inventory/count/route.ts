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

  return NextResponse.json({ error: "ไม่รู้จัก action" }, { status: 400 });
}
