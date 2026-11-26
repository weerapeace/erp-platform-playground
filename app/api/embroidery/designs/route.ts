/**
 * 🧵 ไฟล์ปัก — รายการงาน / สร้างงานใหม่
 * GET  /api/embroidery/designs?trash=1&parent=<uuid>   → { data: rows[] } (ไม่มีเส้นของชิ้น · trash=1 = ถังขยะ · parent = เฉพาะงานของสินค้านี้)
 * POST /api/embroidery/designs                         → { data: row }   body {name, source_file_name?, parent_sku_id?, pieces, settings?, stitch_count?…}
 * สิทธิ์ embroidery.view / embroidery.edit · audit create
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { friendlyDbError } from "@/app/api/master-v2/[entity]/route";
import { bad, cleanDesignBody, EDIT_PERM, ENTITY, isUuid, LIST_COLS, TABLE, VIEW_PERM } from "../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, VIEW_PERM); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  let q = supabaseAdmin().from(TABLE).select(LIST_COLS).eq("is_active", sp.get("trash") !== "1");
  const parent = sp.get("parent");
  if (parent) { if (!isUuid(parent)) return bad("สินค้าไม่ถูกต้อง"); q = q.eq("parent_sku_id", parent); }
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(2000);
  if (error) return bad(friendlyDbError(error.message), 500);
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const v = cleanDesignBody(body, false);
  if (!v.ok) return bad(v.error);
  let createdBy: string | null = null;
  try { createdBy = (await supabaseFromRequest(request).auth.getUser()).data.user?.id ?? null; } catch { /* ไม่มีตัวตน */ }
  const admin = supabaseAdmin();
  const { data, error } = await admin.from(TABLE).insert({ ...v.patch, is_active: true, created_by: createdBy }).select("*").single();
  if (error) return bad(friendlyDbError(error.message));
  await writeAuditFor(request, admin, {
    action: "create", entityType: ENTITY, entityId: data.id,
    metadata: { code: data.code, name: data.name, file: data.source_file_name, pieces: v.patch.pieces?.length ?? 0, parent_sku_id: data.parent_sku_id, shop_file: data.shop_file_name ?? null },
  });
  return NextResponse.json({ data, error: null });
}
