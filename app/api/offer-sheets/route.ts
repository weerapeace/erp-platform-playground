/**
 * /api/offer-sheets — ใบเสนอสินค้าให้ลูกค้า B2B (App "งานอื่นๆ")
 *
 * GET            → รายการใบเสนอ (?search= ?status=)
 * POST {sheet}   → สร้างใบใหม่ (gen offer_no + share_token) พร้อมรายการสินค้า
 *
 * เข้าผ่าน service-role หลังตรวจสิทธิ์ (ตาราง offer_sheets เปิด RLS ปิดการเข้าตรง)
 *  - ดู:   offers.view
 *  - แก้:  offers.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---- Types (ใช้ร่วมฝั่ง client) ----

export type OfferItem = {
  id?:           string;
  sku_id:        string | null;
  sku_code:      string | null;
  name:          string | null;
  image_r2_key:  string | null;
  uom_name:      string | null;
  color:         string | null;
  category:      string | null;
  unit_price:    number;
  qty:           number;
  note:          string | null;
  sort_order:    number;
};

export type OfferListItem = {
  id:            string;
  offer_no:      string | null;
  title:         string;
  customer_id:   string | null;
  customer_name: string | null;
  offer_date:    string;
  status:        string;
  share_token:   string | null;
  item_count:    number;
  grand_total:   number;
  created_at:    string;
  updated_at:    string;
};

export type OfferSaveBody = {
  title?:         string;
  customer_id?:   string | null;
  customer_name?: string | null;
  offer_date?:    string;
  note?:          string | null;
  status?:        string;
  items?:         OfferItem[];
  actorName?:     string | null;
};

// แปลงรายการ → แถวสำหรับ insert (ใช้ทั้ง POST นี้ และ PUT ใน [id])
export function itemsToRows(offerId: string, items: OfferItem[]): Record<string, unknown>[] {
  return items.map((it, i) => ({
    offer_id:     offerId,
    sku_id:       it.sku_id ?? null,
    sku_code:     it.sku_code ?? null,
    name:         it.name ?? null,
    image_r2_key: it.image_r2_key ?? null,
    uom_name:     it.uom_name ?? null,
    color:        it.color ?? null,
    category:     it.category ?? null,
    unit_price:   Number(it.unit_price || 0),
    qty:          Number(it.qty || 0),
    note:         it.note ?? null,
    sort_order:   it.sort_order ?? i,
  }));
}

// ---- GET — list ----

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "offers.view");
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const status = searchParams.get("status") ?? "";

  const db = supabaseAdmin();
  let q = db.from("offer_sheets").select("*").order("created_at", { ascending: false }).limit(500);
  if (search) q = q.or(`title.ilike.%${search}%,offer_no.ilike.%${search}%,customer_name.ilike.%${search}%`);
  if (status) q = q.eq("status", status);

  const { data: sheets, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const ids = (sheets ?? []).map((s) => s.id as string);
  const totals: Record<string, { count: number; total: number }> = {};
  if (ids.length) {
    const { data: items } = await db.from("offer_sheet_items").select("offer_id, unit_price, qty").in("offer_id", ids);
    for (const it of items ?? []) {
      const oid = it.offer_id as string;
      const t = totals[oid] ?? (totals[oid] = { count: 0, total: 0 });
      t.count += 1;
      t.total += Number(it.unit_price || 0) * Number(it.qty || 0);
    }
  }

  const rows: OfferListItem[] = (sheets ?? []).map((s) => ({
    id: s.id, offer_no: s.offer_no, title: s.title, customer_id: s.customer_id,
    customer_name: s.customer_name, offer_date: s.offer_date, status: s.status,
    share_token: s.share_token, created_at: s.created_at, updated_at: s.updated_at,
    item_count: totals[s.id]?.count ?? 0,
    grand_total: totals[s.id]?.total ?? 0,
  }));
  return NextResponse.json({ data: rows, error: null });
}

// ---- POST — create ----

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "offers.edit");
  if (guard) return guard;

  let body: OfferSaveBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const db = supabaseAdmin();
  const { data: auth } = await supabaseFromRequest(request).auth.getUser();
  const actorId = auth?.user?.id ?? null;

  // เลขที่เอกสาร OF-YYYYMM-####
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `OF-${ym}-`;
  const { count } = await db.from("offer_sheets").select("id", { count: "exact", head: true }).like("offer_no", `${prefix}%`);
  const offer_no = `${prefix}${String((count ?? 0) + 1).padStart(4, "0")}`;
  const share_token = crypto.randomUUID().replace(/-/g, "");

  const { data: sheet, error } = await db.from("offer_sheets").insert({
    offer_no,
    title:         body.title ?? "",
    customer_id:   body.customer_id ?? null,
    customer_name: body.customer_name ?? null,
    offer_date:    body.offer_date || now.toISOString().slice(0, 10),
    note:          body.note ?? null,
    status:        body.status ?? "draft",
    share_token,
    created_by:    actorId,
  }).select("*").single();
  if (error || !sheet) return NextResponse.json({ error: error?.message ?? "create failed" }, { status: 500 });

  const items = body.items ?? [];
  if (items.length) {
    const { error: ie } = await db.from("offer_sheet_items").insert(itemsToRows(sheet.id, items));
    if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });
  }

  await writeAudit(db, {
    action: "create", entityType: "offer_sheets", entityId: sheet.id,
    actorId, actorName: body.actorName ?? null,
    metadata: { offer_no, items: items.length },
  });
  return NextResponse.json({ id: sheet.id, offer_no, error: null });
}
