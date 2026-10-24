/**
 * 🔄 ตารางเทียบยอด (อ่านอย่างเดียว) — ป้อนตารางกลาง MasterCRUDPage (apiBase /api/stock-sync/, apiPath compare)
 * GET ?channel_id=<uuid>&limit= → { data, total, error }
 *
 * ยอดพร้อมขาย = คลังต้นทางของปลายทาง − จอง − กันไว้ (คิดในมุมมอง v_channel_stock_compare)
 * ⚠️ ไม่มี POST/PATCH/DELETE — จับคู่ผ่าน /api/stock-sync/match · ยอดปลายทางมาจากการนำเข้าไฟล์
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";
import { COMPARE_STATUS } from "@/lib/stock-sync/bigseller";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ลำดับในตาราง: เรื่องที่ต้องดูก่อนอยู่บน
const STATUS_ORDER = ["erp_less", "erp_more", "duplicate", "unmatched", "not_in_channel", "no_data", "match", "combo"];

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const channelId = sp.get("channel_id");
  if (!channelId) return NextResponse.json({ data: [], total: 0, error: "เลือกปลายทางซิงค์ก่อน" }, { status: 400 });

  const admin = supabaseAdmin();
  const rows = await fetchAllPages<Record<string, unknown>>((from, to) =>
    admin.from("v_channel_stock_compare")
      .select("id, channel_id, external_sku, external_name, sku_id, sku_code, sku_name, is_combo, match_method, sync_enabled, on_hand, reserved, buffer_qty, available, external_qty, external_on_hand, external_qty_at, external_warehouse, dup_count, diff, status")
      .eq("channel_id", channelId)
      .order("id", { ascending: true })
      .range(from, to));

  const num = (v: unknown) => (v == null ? null : Number(v));
  const data = rows
    .map((r): Record<string, unknown> => ({
      ...r,
      on_hand: num(r.on_hand), reserved: num(r.reserved), buffer_qty: num(r.buffer_qty),
      available: num(r.available), external_qty: num(r.external_qty), external_on_hand: num(r.external_on_hand),
      diff: num(r.diff),
      status_label: COMPARE_STATUS[String(r.status)]?.label ?? String(r.status),
      match_label: r.match_method === "code" ? "รหัสตรง" : r.match_method === "barcode" ? "บาร์โค้ด" : r.match_method === "manual" ? "จับคู่เอง" : "",
    }))
    .sort((a, b) =>
      (STATUS_ORDER.indexOf(String(a.status)) - STATUS_ORDER.indexOf(String(b.status)))
      || String(a.sku_code ?? a.external_sku ?? "").localeCompare(String(b.sku_code ?? b.external_sku ?? "")));

  return NextResponse.json({ data, total: data.length, error: null });
}
