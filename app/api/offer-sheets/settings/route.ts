/**
 * /api/offer-sheets/settings — ค่าตั้งคอลัมน์ตารางสินค้า (รวมทั้งโมดูล ทุกคนเหมือนกัน)
 *
 * เก็บใน app_settings.offer_columns (singleton id=1)
 * GET → { order: string[], hidden: string[], groupBy: string|null } | null
 * PUT → บันทึก (ต้องมีสิทธิ์ offers.edit)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type OfferColumnConfig = {
  order:   string[];
  hidden:  string[];
  groupBy: string | null;
};

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "offers.view");
  if (guard) return guard;
  const db = supabaseAdmin();
  const { data } = await db.from("app_settings").select("offer_columns").eq("id", 1).single();
  return NextResponse.json({ data: data?.offer_columns ?? null, error: null });
}

export async function PUT(request: NextRequest) {
  const guard = await guardApi(request, "offers.edit");
  if (guard) return guard;
  let body: OfferColumnConfig;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const db = supabaseAdmin();
  const config: OfferColumnConfig = {
    order:   Array.isArray(body.order) ? body.order : [],
    hidden:  Array.isArray(body.hidden) ? body.hidden : [],
    groupBy: body.groupBy ?? null,
  };
  const { error } = await db.from("app_settings").update({ offer_columns: config }).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: config, error: null });
}
