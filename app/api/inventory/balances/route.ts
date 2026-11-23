import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { r2ImageUrl } from "@/lib/r2-image";

export type StockBalance = {
  product_id:       string;
  product_sku:      string | null;
  product_name:     string;
  warehouse_id:     string;
  warehouse_code:   string | null;
  warehouse_name:   string;
  qty_on_hand:      number;
  qty_reserved:     number;
  qty_available:    number;
  avg_cost:         number;
  total_value:      number;
  location_code:    string | null;
  last_movement_at: string | null;
  uom:              string | null;   // หน่วยจริงของสินค้า (จาก skus_v2.uom_id → uoms.name)
  image_url:        string | null;   // รูปย่อ (รูปปก SKU → ถ้าไม่มีใช้รูป Parent)
  parent_id:        string | null;
  parent_code:      string | null;   // รุ่น (Parent SKU)
  parent_name:      string | null;
};

export type BalancesResponse = { data: StockBalance[]; error: string | null };

type Raw = Omit<StockBalance, "image_url" | "parent_id" | "parent_code" | "parent_name">;
const CHUNK = 150;   // id ยาว → แบ่งก้อนกัน URL ยาวเกิน

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sb = supabaseFromRequest(request);
  const { data, error } = await sb.rpc("erp_playground_stock_balances_list", {
    p_warehouse_id:   searchParams.get("warehouse_id") || null,
    p_low_stock_only: searchParams.get("low_stock") === "true",
    p_limit:          Math.min(1000, parseInt(searchParams.get("limit") ?? "500")),
  });
  if (error) return NextResponse.json({ data: [], error: error.message } satisfies BalancesResponse, { status: 500 });
  const rows = (data as Raw[]) ?? [];

  // เติมรูป + รุ่น (Parent) — ถ้าดึงไม่ได้ก็ยังคืนยอดได้ตามเดิม
  const skuInfo = new Map<string, { key: string | null; parent: string | null }>();
  const parentInfo = new Map<string, { code: string; name: string | null; key: string | null }>();
  try {
    const ids = [...new Set(rows.map((r) => r.product_id))];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data: s } = await sb.from("skus_v2").select("id, cover_image_r2_key, parent_sku_id").in("id", ids.slice(i, i + CHUNK));
      for (const x of (s ?? []) as { id: string; cover_image_r2_key: string | null; parent_sku_id: string | null }[])
        skuInfo.set(x.id, { key: x.cover_image_r2_key, parent: x.parent_sku_id });
    }
    const pids = [...new Set([...skuInfo.values()].map((v) => v.parent).filter((v): v is string => !!v))];
    for (let i = 0; i < pids.length; i += CHUNK) {
      const { data: p } = await sb.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key").in("id", pids.slice(i, i + CHUNK));
      for (const x of (p ?? []) as { id: string; code: string; name_th: string | null; cover_image_r2_key: string | null }[])
        parentInfo.set(x.id, { code: x.code, name: x.name_th, key: x.cover_image_r2_key });
    }
  } catch { /* รูป/รุ่นไม่ใช่ข้อมูลหลัก */ }

  const out: StockBalance[] = rows.map((r) => {
    const s = skuInfo.get(r.product_id);
    const p = s?.parent ? parentInfo.get(s.parent) : undefined;
    return {
      ...r,
      image_url: r2ImageUrl(s?.key ?? p?.key ?? null, 96),
      parent_id: s?.parent ?? null, parent_code: p?.code ?? null, parent_name: p?.name ?? null,
    };
  });
  return NextResponse.json({ data: out, error: null } satisfies BalancesResponse);
}
