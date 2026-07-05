/**
 * รายการที่ "จ่ายแล้ว" (ส่งออกจากโกดัง QC) — อ่านจากประวัติ audit_logs (action='qc.ship')
 * เพราะตอน "ส่งออก" ระบบลบ item ออกจากชั้น แล้วเก็บเป็น audit เท่านั้น
 * GET /api/qc-warehouse/shipped?limit=
 * ของกลาง: guardApi (qc.view) · supabaseAdmin (อ่านข้าม RLS)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type ShippedRow = {
  id: string; sku: string | null; sku_name: string | null; mo_no: string | null; worker: string | null;
  image_key: string | null; brand_color: string | null; qty: number; mode: string | null; wh: string | null; at: string; actor: string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const limit = Math.min(500, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 150));
  const { data, error } = await admin.from("audit_logs")
    .select("id, metadata, created_at").eq("action", "qc.ship").order("created_at", { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const rows: ShippedRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id), sku: (m.sku as string) ?? null, sku_name: (m.sku_name as string) ?? null,
      mo_no: (m.mo_no as string) ?? null, worker: (m.worker as string) ?? null,
      image_key: (m.image_key as string) ?? null, brand_color: (m.brand_color as string) ?? null,
      qty: Number(m.qty) || 0, mode: (m.mode as string) ?? null, wh: (m.wh as string) ?? null,
      at: String(r.created_at), actor: (m.actor as string) ?? null,
    };
  });
  return NextResponse.json({ data: rows, error: null });
}
