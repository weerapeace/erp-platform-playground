/**
 * ข้อมูลเสริมสำหรับหน้าพิมพ์ใบเสนอราคา — ช่องที่เพิ่มในการ์ด (lib/print-blocks · เจ้าของขอ 2026-11-20)
 *
 * GET /api/quotations/[id]/print-extras → { skus: { [รหัส SKU]: { materials, lining, zipper, … } }, error }
 * - อ่านบรรทัดของใบด้วยสิทธิ์ผู้ใช้ (RPC erp_playground_quote_get = เคารพสิทธิ์ดูใบเสนอราคา) แล้วดึงช่องจาก skus_v2 เฉพาะรหัสในใบ
 * - ช่องที่ส่งกลับ = SKU_FIELD_KEYS เท่านั้น (ไม่มีต้นทุน/ราคาซื้อ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { SKU_FIELD_KEYS } from "@/lib/print-blocks";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "qt.view"); if (denied) return denied;
  const { id } = await params;
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_quote_get", { p_id: id });
  if (error) return NextResponse.json({ skus: {}, error: error.message }, { status: 500 });
  const lines = ((data as { lines?: { sku?: string | null }[] } | null)?.lines ?? []);
  const codes = [...new Set(lines.map((l) => (l.sku ?? "").trim()).filter(Boolean))].slice(0, 300);
  if (!codes.length) return NextResponse.json({ skus: {}, error: null });
  const { data: rows, error: sErr } = await supabaseAdmin().from("skus_v2").select(["code", ...SKU_FIELD_KEYS].join(", ")).in("code", codes);
  if (sErr) return NextResponse.json({ skus: {}, error: sErr.message }, { status: 500 });
  const skus: Record<string, Record<string, unknown>> = {};
  for (const r of (rows ?? []) as unknown as Record<string, unknown>[]) {
    const { code, ...rest } = r;
    skus[String(code)] = rest;
  }
  return NextResponse.json({ skus, error: null }, { headers: { "Cache-Control": "no-store" } });
}
