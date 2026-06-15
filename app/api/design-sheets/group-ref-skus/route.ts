/**
 * Design Sheets — สินค้าตัวแทนของกลุ่มวัสดุ (เฟส 2 Group cost)
 *
 * GET   → กลุ่มวัสดุทั้งหมด + ref_sku_ids + ชื่อ/รหัส SKU ที่ผูกไว้ (ไว้โชว์ในโมดอลผูก)
 * PATCH → { code, sku_ids[] } ตั้งสินค้าตัวแทนของกลุ่ม (material_groups.ref_sku_ids)
 *
 * ใช้ดึง "ราคาซื้อจริงล่าสุด" (GR→PO) ของกลุ่มตอนตีราคา
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { friendlyDbError } from "../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type GroupRef = { code: string; name: string; ref_sku_ids: string[] };
export type SkuLite = { id: string; code: string; name: string };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("material_groups")
    .select("code, name, ref_sku_ids").eq("is_active", true).order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ data: [], skus: {}, error: friendlyDbError(error.message) }, { status: 500 });

  const groups: GroupRef[] = ((data ?? []) as Array<Record<string, unknown>>).map((g) => ({
    code: String(g.code), name: String(g.name),
    ref_sku_ids: Array.isArray(g.ref_sku_ids) ? (g.ref_sku_ids as string[]) : [],
  }));
  // resolve ชื่อ/รหัส SKU ที่ผูกไว้
  const allIds = [...new Set(groups.flatMap((g) => g.ref_sku_ids))];
  const skus: Record<string, SkuLite> = {};
  if (allIds.length) {
    const { data: rows } = await admin.from("skus_v2").select("id, code, name_th").in("id", allIds);
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      skus[String(r.id)] = { id: String(r.id), code: String(r.code ?? ""), name: String(r.name_th ?? r.code ?? "") };
    }
  }
  return NextResponse.json({ data: groups, skus, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { code?: string; sku_ids?: string[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.code) return NextResponse.json({ error: "ต้องระบุ code กลุ่ม" }, { status: 400 });
  const ids = Array.isArray(body.sku_ids) ? [...new Set(body.sku_ids.map((s) => String(s)).filter(Boolean))] : [];

  const admin = supabaseAdmin();
  const { error } = await admin.from("material_groups").update({ ref_sku_ids: ids, updated_at: new Date().toISOString() }).eq("code", body.code);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, {
    action: "update", entityType: "material_group", entityId: body.code,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { ref_sku_ids: ids.length },
  });
  return NextResponse.json({ ok: true, error: null });
}
