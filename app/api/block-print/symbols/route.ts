/**
 * 🧱 บล็อกพิมพ์ — คลังสัญลักษณ์
 * GET  /api/block-print/symbols            → { data: สัญลักษณ์ทั้งหมด (มีเส้นไว้วาดรูปตัวอย่าง) } · ?trash=1 = ในถังขยะ
 * POST /api/block-print/symbols            → { symbols: [...] } บันทึกหลายตัวทีเดียว (ไม่เกิน 200) · ตรวจด้วย cleanSymbolInput
 * สิทธิ์ block_print.view / block_print.edit · audit ทุกตัวที่สร้าง · ตาราง block_print_symbols (RLS service-only)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { friendlyDbError } from "@/app/api/master-v2/[entity]/route";
import { cleanSymbolInput, SYMBOL_LIMITS, type SymbolInput } from "@/lib/block-print-symbols";
import { bad, EDIT_PERM, VIEW_PERM } from "../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYMBOL_TABLE = "block_print_symbols";
const SYMBOL_ENTITY = "block_print_symbols";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, VIEW_PERM); if (denied) return denied;
  const trash = new URL(request.url).searchParams.get("trash") === "1";
  const { data, error } = await supabaseAdmin().from(SYMBOL_TABLE).select("*")
    .eq("is_active", !trash).order("category", { ascending: true, nullsFirst: false }).order("name").limit(2000);
  if (error) return bad(friendlyDbError(error.message), 500);
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const list = Array.isArray(body.symbols) ? body.symbols : [];
  if (!list.length) return bad("ไม่มีสัญลักษณ์ที่จะบันทึก");
  if (list.length > SYMBOL_LIMITS.batch) return bad(`บันทึกได้ครั้งละไม่เกิน ${SYMBOL_LIMITS.batch} ตัว`);
  const rows: SymbolInput[] = [];
  for (const raw of list) {
    const v = cleanSymbolInput(raw);
    if (!v.ok) return bad(v.error);
    rows.push(v.symbol);
  }
  const admin = supabaseAdmin();
  const { data, error } = await admin.from(SYMBOL_TABLE).insert(rows).select("*");
  if (error) return bad(friendlyDbError(error.message));
  await Promise.all((data ?? []).map((r) => writeAuditFor(request, admin, {
    action: "create", entityType: SYMBOL_ENTITY, entityId: r.id,
    metadata: { code: r.code, name: r.name, category: r.category, size: `${+Number(r.w).toFixed(2)}×${+Number(r.h).toFixed(2)} มม.`, source: r.source_file_name },
  })));
  return NextResponse.json({ data, error: null });
}
