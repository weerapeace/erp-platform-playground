/**
 * Design Sheets — บรรทัด "ตีราคาสินค้าสั่งจากร้าน" (Supplier quote)
 *
 * GET /api/design-sheets/[id]/supplier-lines → list เรียงตาม sort_order (+ ชื่อร้านล่าสุด)
 * PUT /api/design-sheets/[id]/supplier-lines → บันทึกทั้งชุด (ลบของเดิม + insert ใหม่) เหมือน cost-lines
 *
 * ค่าที่คำนวณ (ค่าส่ง/กำไร) คิดที่หน้าจอด้วย lib/supplier-quote แล้วเก็บ snapshot บางตัวไว้
 * สิทธิ์: อ่าน products.view · เขียน products.edit (ตัวเลขต้นทุน/กำไรซ่อนที่หน้าจอด้วย products.cost.view)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";
import type { SupplierLine, ProfitSplit } from "@/lib/supplier-quote";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLS = `id, sheet_id, parent_code, item_name, supplier_id, supplier_name, source_url,
  price, currency, fx_rate, price_unit, pack_qty, qty, offer_price,
  box_w_cm, box_l_cm, box_h_cm, ship_mode, ship_rate, freight_total, note, split_json, sort_order`;

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const cleanSplits = (raw: unknown): ProfitSplit[] =>
  (Array.isArray(raw) ? raw : []).slice(0, 20).map((s): ProfitSplit => {
    const x = s as ProfitSplit;
    return { name: String(x?.name ?? "").slice(0, 120), type: x?.type === "amt" ? "amt" : "pct", value: Number(x?.value) || 0, on: x?.on !== false };
  }).filter((s) => s.name || s.value);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("design_sheet_supplier_lines").select(COLS)
    .eq("sheet_id", id).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });

  // เติมชื่อร้านล่าสุดจากทะเบียนคู่ค้า (เผื่อร้านเปลี่ยนชื่อหลังตีราคา)
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = [...new Set(rows.map((r) => r.supplier_id).filter(Boolean).map(String))];
  if (ids.length) {
    const { data: ps } = await admin.from("partners_v2").select("id, name_th, name_en, code").in("id", ids);
    const nameOf = new Map((ps ?? []).map((p) => {
      const x = p as { id: string; name_th?: string; name_en?: string; code?: string };
      return [String(x.id), x.name_th || x.name_en || x.code || ""];
    }));
    for (const r of rows) if (r.supplier_id) r.supplier_name = nameOf.get(String(r.supplier_id)) || r.supplier_name;
  }
  return NextResponse.json({ data: rows as unknown as SupplierLine[], error: null });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { lines?: SupplierLine[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const lines = Array.isArray(body.lines) ? body.lines : [];

  const rows = lines.map((l, i) => ({
    sheet_id: id,
    parent_code: l.parent_code || null,
    item_name: l.item_name?.trim() || null,
    supplier_id: l.supplier_id || null,
    supplier_name: l.supplier_name?.trim() || null,
    source_url: l.source_url?.trim() || null,
    price: num(l.price), currency: l.currency === "THB" ? "THB" : "CNY",
    fx_rate: num(l.fx_rate), price_unit: l.price_unit === "pack" ? "pack" : "pcs", pack_qty: num(l.pack_qty),
    qty: num(l.qty), offer_price: num(l.offer_price),
    box_w_cm: num(l.box_w_cm), box_l_cm: num(l.box_l_cm), box_h_cm: num(l.box_h_cm),
    ship_mode: l.ship_mode === "truck" ? "truck" : "ship", ship_rate: num(l.ship_rate),
    freight_total: num(l.freight_total),
    note: l.note?.trim() || null,
    split_json: cleanSplits(l.split_json),
    sort_order: i + 1,
  }));

  const admin = supabaseAdmin();
  const { error: delErr } = await admin.from("design_sheet_supplier_lines").delete().eq("sheet_id", id);
  if (delErr) return NextResponse.json({ error: friendlyDbError(delErr.message) }, { status: 400 });
  if (rows.length > 0) {
    const { error: insErr } = await admin.from("design_sheet_supplier_lines").insert(rows);
    if (insErr) return NextResponse.json({ error: friendlyDbError(insErr.message) }, { status: 400 });
  }

  await writeAudit(admin, {
    action: "supplier_quote_update", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { lines: rows.length },
  });
  return NextResponse.json({ saved: rows.length, error: null });
}
