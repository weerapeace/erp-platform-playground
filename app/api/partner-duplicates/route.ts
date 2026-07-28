/**
 * GET /api/partner-duplicates — สแกนหา "ร้าน/คู่ค้าที่น่าจะซ้ำกัน" ในทะเบียน (partners_v2)
 *
 * ใช้ของกลาง lib/partner-match (findDuplicateShops) จับชื่อที่ต่างกันแค่
 * สลับคำ / วงเล็บ / เว้นวรรค / สะกดเพี้ยนเล็กน้อย / ชื่อหนึ่งอยู่ในอีกชื่อ
 * แล้วแนบ "จำนวนการใช้งาน" ของแต่ละร้าน เพื่อให้ตัดสินใจได้ว่าจะเก็บตัวไหน
 *
 * ⚠️ อ่านอย่างเดียว — ไม่รวมร้านให้อัตโนมัติ (การรวมต้องย้าย FK หลายตาราง คนตัดสินใจเอง)
 * query: ?min=0.82 (คะแนนความคล้ายขั้นต่ำ 0-1)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { findDuplicateShops } from "@/lib/partner-match";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PartnerRow = {
  id: string; code: string | null; display_name: string | null; name_th: string | null; name_en: string | null;
  is_supplier: boolean | null; is_customer: boolean | null; is_active: boolean | null; shop_country: string | null;
};
export type DupMember = PartnerRow & {
  usage: { supplier_items: number; purchase_orders: number; skus: number; china_bills: number; total: number };
};
export type DupGroupOut = { score: number; members: DupMember[] };
export type PartnerDuplicatesResponse = { groups: DupGroupOut[]; scanned: number; error: string | null };

/** นับจำนวนแถวที่อ้างถึงร้านแต่ละตัว (ดึงเฉพาะคอลัมน์ id แล้วนับใน JS — ids มีไม่กี่ตัว) */
async function tally(
  admin: ReturnType<typeof supabaseAdmin>, table: string, col: string, ids: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const { data } = await admin.from(table).select(col).in(col, ids).limit(20000);
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    const k = String(r[col] ?? "");
    if (k) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const minRaw = Number(new URL(request.url).searchParams.get("min"));
  const min = isFinite(minRaw) && minRaw > 0 && minRaw <= 1 ? minRaw : 0.82;
  const admin = supabaseAdmin();

  const { data, error } = await admin.from("partners_v2")
    .select("id, code, display_name, name_th, name_en, is_supplier, is_customer, is_active, shop_country")
    .limit(5000);
  if (error) return NextResponse.json({ groups: [], scanned: 0, error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as PartnerRow[];
  const groups = findDuplicateShops(rows, min);
  const ids = groups.flatMap((g) => g.members.map((m) => m.id));

  const [si, po, sk, cb] = await Promise.all([
    tally(admin, "supplier_items", "supplier_partner_id", ids),
    tally(admin, "purchase_orders_v2", "seller_partner_id", ids),
    tally(admin, "skus_v2", "seller_partner_id", ids),
    tally(admin, "china_bills", "supplier_id", ids),
  ]);

  const out: DupGroupOut[] = groups.map((g) => ({
    score: Math.round(g.score * 100) / 100,
    members: g.members.map((m) => {
      const usage = {
        supplier_items: si.get(m.id) ?? 0,
        purchase_orders: po.get(m.id) ?? 0,
        skus: sk.get(m.id) ?? 0,
        china_bills: cb.get(m.id) ?? 0,
        total: 0,
      };
      usage.total = usage.supplier_items + usage.purchase_orders + usage.skus + usage.china_bills;
      return { ...m, usage };
    }).sort((a, b) => b.usage.total - a.usage.total),   // ตัวที่ใช้งานเยอะสุดขึ้นก่อน = ตัวที่ควรเก็บ
  }));

  return NextResponse.json({ groups: out, scanned: rows.length, error: null });
}
