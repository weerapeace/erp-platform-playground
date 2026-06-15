/**
 * /api/offer-sheets/public/[token] — เปิดดูสาธารณะด้วย share_token (ไม่ต้องล็อกอิน)
 *
 * คืนเฉพาะข้อมูลที่จำเป็นต่อการแสดงใบเสนอ (ไม่มีข้อมูลภายใน)
 * ใช้โดยหน้า /offer/[token] (ลิงก์ส่งให้ลูกค้า)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveOfferLayoutConfig } from "@/lib/offer-layout";
import { normalizeOfferTemplateKey } from "@/lib/offer-templates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ data: null, error: "no token" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: sheet, error } = await db.from("offer_sheets")
    .select("id, offer_no, title, customer_name, offer_date, note, status, column_config, template_key")
    .eq("share_token", token).single();
  if (error || !sheet) return NextResponse.json({ data: null, error: "ไม่พบเอกสาร" }, { status: 404 });

  const { data: items } = await db.from("offer_sheet_items")
    .select("sku_code, name, image_r2_key, uom_name, color, category, unit_price, qty, note, sort_order")
    .eq("offer_id", sheet.id).order("sort_order", { ascending: true });

  return NextResponse.json({
    data: {
      ...sheet,
      template_key: normalizeOfferTemplateKey(sheet.template_key),
      items: items ?? [],
      columns: resolveOfferLayoutConfig(sheet.column_config),
    },
    error: null,
  });
}
