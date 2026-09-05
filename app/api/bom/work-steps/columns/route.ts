/**
 * ค่าตั้งของแม่แบบ "ตารางติ๊ก" ขั้นตอนงาน — /api/bom/work-steps/columns
 *   GET ?product_sku=  → { data: คอลัมน์ประเภทงาน, ops: ทะเบียนประเภทงาน (@), piece_ops: ทะเบียนชิ้นส่วน (@), pieces: ชิ้นส่วนที่บันทึกไว้ของสินค้านี้ }
 *   PUT { columns?, ops?, piece_ops?, product_sku?+pieces? } → บันทึกเฉพาะส่วนที่ส่งมา   สิทธิ์ products.edit
 *       • columns → ชื่อใหม่ (แยกตาม "+") เติมเข้าทะเบียน ops ให้อัตโนมัติ
 *       • pieces (ต่อ product_sku) → ชื่อชิ้น (ก่อน "|") เติมเข้าทะเบียน piece_ops ให้อัตโนมัติ
 * เก็บ: app_settings (singleton id=1) work_step_columns / work_step_ops / work_step_piece_ops · product_piece_lists (ต่อ SKU)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const DEFAULT_WORK_STEP_COLUMNS = ["ทับ", "เย็บตรง", "เย็บโค้ง", "เย็บเข้าไป", "ทากาว", "ติดกาว", "เจาะรู"];

const clean = (v: unknown, max = 20): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, max) : [];
const pieceName = (line: string) => line.split("|")[0].replace(/\(.*?\)/g, "").trim();

async function readAll(productSku: string | null) {
  const admin = supabaseAdmin();
  const [{ data }, pl] = await Promise.all([
    admin.from("app_settings").select("work_step_columns, work_step_ops, work_step_piece_ops").eq("id", 1).maybeSingle(),
    productSku ? admin.from("product_piece_lists").select("pieces").eq("product_sku", productSku).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const row = data as { work_step_columns?: unknown; work_step_ops?: unknown; work_step_piece_ops?: unknown } | null;
  const cols = clean(row?.work_step_columns);
  return {
    columns: cols.length ? cols : DEFAULT_WORK_STEP_COLUMNS,
    ops: clean(row?.work_step_ops, 200),
    piece_ops: clean(row?.work_step_piece_ops, 300),
    pieces: clean((pl.data as { pieces?: unknown } | null)?.pieces, 100),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sku = (new URL(request.url).searchParams.get("product_sku") ?? "").trim() || null;
  const all = await readAll(sku);
  return NextResponse.json({ data: all.columns, ops: all.ops, piece_ops: all.piece_ops, pieces: all.pieces, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { columns?: unknown; ops?: unknown; piece_ops?: unknown; product_sku?: unknown; pieces?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const sku = typeof body.product_sku === "string" ? body.product_sku.trim() : "";
  const cur = await readAll(sku || null);
  const patch: Record<string, unknown> = {};
  let ops = cur.ops, pieceOps = cur.piece_ops, pieces = cur.pieces;

  if (body.ops !== undefined) { ops = clean(body.ops, 200); patch.work_step_ops = ops; }
  if (body.piece_ops !== undefined) { pieceOps = clean(body.piece_ops, 300); patch.work_step_piece_ops = pieceOps; }
  if (body.columns !== undefined) {
    const cols = clean(body.columns);
    if (cols.length === 0) return NextResponse.json({ error: "ต้องมีคอลัมน์อย่างน้อย 1 ช่อง" }, { status: 400 });
    patch.work_step_columns = cols;
    const learned = cols.flatMap((c) => c.split("+").map((x) => x.trim()).filter(Boolean));
    const merged = [...new Set([...ops, ...learned])];
    if (merged.length !== ops.length) { ops = merged; patch.work_step_ops = ops; }
  }
  if (body.pieces !== undefined) {
    if (!sku) return NextResponse.json({ error: "ต้องระบุรหัสสินค้า (product_sku) เพื่อบันทึกชิ้นส่วน" }, { status: 400 });
    pieces = clean(body.pieces, 100);
    const { error } = await admin.from("product_piece_lists").upsert({ product_sku: sku, pieces, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const learned = pieces.map(pieceName).filter(Boolean);
    const merged = [...new Set([...pieceOps, ...learned])];
    if (merged.length !== pieceOps.length) { pieceOps = merged; patch.work_step_piece_ops = pieceOps; }
  }
  if (Object.keys(patch).length) {
    const { error } = await admin.from("app_settings").update(patch).eq("id", 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (body.pieces === undefined) {
    return NextResponse.json({ error: "ไม่มีอะไรให้บันทึก" }, { status: 400 });
  }
  return NextResponse.json({ data: (patch.work_step_columns as string[] | undefined) ?? cur.columns, ops, piece_ops: pieceOps, pieces, error: null });
}
