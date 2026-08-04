/**
 * POST /api/skus/lookup   body: { codes: string[] }
 * ของกลาง — จับคู่ "รหัสสินค้าหลายตัวพร้อมกัน" กับ SKU จริง (ใช้ตอนนำเข้ารายการจากตาราง/Excel)
 *
 * ทำไมเป็น POST: รหัสสินค้าจริง 43% มีตัว "#" และบางตัวมีช่องว่าง —
 * ส่งผ่าน query string จะโดน apiFetch แปลง %23 → %20 แล้วรหัสเพี้ยน (บทเรียนจากระบบสแกน)
 *
 * จับคู่แบบไม่สนตัวพิมพ์ใหญ่เล็กและช่องว่างหัวท้าย · หา barcode ก่อน แล้วค่อย code
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SkuLookupHit = {
  id: string;
  code: string;
  name: string;
  uom: string | null;
  price: number | null;
};

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;

  let body: { codes?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ data: {}, error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const codes = Array.isArray(body.codes)
    ? [...new Set(body.codes.map((c) => String(c ?? "").trim()).filter(Boolean))].slice(0, 2000)
    : [];
  if (codes.length === 0) return NextResponse.json({ data: {}, error: null });

  const admin = supabaseAdmin();
  // ดึงมาทั้งชุดแล้วจับคู่ใน JS — เลี่ยง ilike ทีละตัว (2,000 รหัส = 2,000 query)
  const [{ data: skus }, { data: uoms }] = await Promise.all([
    admin.from("skus_v2").select("id, code, barcode, name_th, name_en, list_price, uom_id").limit(20000),
    admin.from("uoms").select("id, name").limit(2000),
  ]);

  const uomName = new Map<string, string>();
  for (const u of ((uoms ?? []) as Record<string, unknown>[])) uomName.set(String(u.id), String(u.name ?? ""));

  // index: รหัส/บาร์โค้ด (ตัวเล็ก) → แถว · code ชนะ barcode ถ้าซ้ำ
  const byKey = new Map<string, Record<string, unknown>>();
  for (const s of ((skus ?? []) as Record<string, unknown>[])) {
    const bc = norm(s.barcode);
    if (bc && !byKey.has(bc)) byKey.set(bc, s);
  }
  for (const s of ((skus ?? []) as Record<string, unknown>[])) {
    const cd = norm(s.code);
    if (cd) byKey.set(cd, s);
  }

  const out: Record<string, SkuLookupHit | null> = {};
  for (const c of codes) {
    const hit = byKey.get(norm(c));
    out[c] = hit
      ? {
          id: String(hit.id),
          code: String(hit.code ?? ""),
          name: String(hit.name_th ?? hit.name_en ?? hit.code ?? ""),
          uom: hit.uom_id ? (uomName.get(String(hit.uom_id)) ?? null) : null,
          price: hit.list_price == null ? null : Number(hit.list_price),
        }
      : null;
  }
  return NextResponse.json({ data: out, error: null });
}
