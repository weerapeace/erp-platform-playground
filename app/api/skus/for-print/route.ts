/**
 * POST /api/skus/for-print  body { ids: string[], entity?: "skus" | "parent-skus" }
 *   → { data: [{ id, code, barcode, name, price }] } เรียงตามลำดับ ids ที่ส่งมา
 *
 * ใช้กับระบบพิมพ์บาร์โค้ด/QR แบบ batch — ดึงเฉพาะฟิลด์ที่ต้องพิมพ์
 * (Parent SKU ไม่มีช่อง barcode/ราคา → ใช้ code เป็นบาร์โค้ด, ราคา = null)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type PrintSku = { id: string; code: string; barcode: string; name: string; price: number | null };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;

  let body: { ids?: string[]; entity?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const ids = (body.ids ?? []).filter(Boolean).slice(0, 5000);
  if (ids.length === 0) return NextResponse.json({ data: [], error: null });

  const isParent = body.entity === "parent-skus";
  const admin = supabaseAdmin();
  const table = isParent ? "parent_skus_v2" : "skus_v2";
  const sel = isParent ? "id, code, name_th" : "id, code, name_th, barcode, list_price";

  const found = new Map<string, PrintSku>();
  for (let i = 0; i < ids.length; i += 1000) {
    const { data } = await admin.from(table).select(sel).in("id", ids.slice(i, i + 1000));
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      const code = String(r.code ?? "");
      found.set(String(r.id), {
        id: String(r.id), code,
        barcode: isParent ? code : ((r.barcode as string | null)?.trim() || code),
        name: (r.name_th as string | null) ?? "",
        price: isParent ? null : ((r.list_price as number | null) ?? null),
      });
    }
  }
  // เรียงตามลำดับที่เลือกมา
  const data = ids.map((id) => found.get(id)).filter(Boolean) as PrintSku[];
  return NextResponse.json({ data, error: null });
}
