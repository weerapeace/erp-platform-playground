/**
 * แท็บ "ร้านค้าในไลน์" หน้าจัดการ LINE (ข้อ 2.2 เจ้าของเลือก 2026-11-23)
 * GET → { shops[], pending[] }
 *   shops   = ร้านที่มีใบสั่งขาย 180 วันล่าสุด (ไม่ยกเลิก) + ร้านที่เคยมีคนผูกไลน์ · ต่อร้าน: คนที่ผูก · งานค้าง · ยังไม่ใส่วันนัดส่ง
 *   pending = คำขอผูกร้านจาก QR ลูกค้ารวม (รอยืนยัน)
 * การแก้ (ถอนผูก/ระงับ/ชื่อเรียก/ยืนยันคำขอ/QR รายร้าน) ใช้ POST /api/admin/line-company เดิม — ไม่ทำซ้ำ
 * ไม่มีราคา/ยอดเงิน · สิทธิ์ admin.users
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const t = (v: unknown) => String(v ?? "").trim();
const one = (v: unknown): Row | null => (Array.isArray(v) ? ((v[0] as Row) ?? null) : v && typeof v === "object" ? (v as Row) : null);

export type LineShopPerson = { id: string; status: string; contact_name: string; line_name: string; linked_at: string | null; unlinked_at: string | null };
export type LineShopRow = { id: string; name: string; code: string; people: LineShopPerson[]; open_orders: number; missing_due: number; last_order: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const admin = supabaseAdmin();
  const since = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [so, links] = await Promise.all([
    admin.from("so_orders").select("customer_id,order_date,status,due_date,partners_v2(display_name,code,is_active)")
      .neq("status", "cancelled").is("merged_into_id", null).gte("order_date", since).order("order_date", { ascending: false }).limit(3000),
    admin.from("line_customer_links")
      .select("id,status,partner_id,contact_name,line_display_name,linked_at,unlinked_at,requested_shop,requested_at,partners_v2(display_name,code,is_active)")
      .neq("status", "rejected").order("linked_at", { ascending: false }).limit(2000),
  ]);
  if (so.error || links.error) return NextResponse.json({ error: "โหลดรายชื่อร้านไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });

  const shops = new Map<string, LineShopRow>();
  const shopOf = (id: string, p: Row | null): LineShopRow | null => {
    if (!id || p?.is_active === false) return null;
    let s = shops.get(id);
    if (!s) { s = { id, name: t(p?.display_name) || t(p?.code) || "ร้านไม่มีชื่อ", code: t(p?.code), people: [], open_orders: 0, missing_due: 0, last_order: null }; shops.set(id, s); }
    return s;
  };
  for (const r of (so.data ?? []) as Row[]) {
    const s = shopOf(t(r.customer_id), one(r.partners_v2)); if (!s) continue;
    if (!s.last_order) s.last_order = t(r.order_date) || null;
    if (t(r.status) !== "shipped") s.open_orders++;
    if (t(r.status) === "confirmed" && !r.due_date) s.missing_due++;
  }
  const pending: { id: string; requested_shop: string; contact_name: string; line_name: string; requested_at: string | null }[] = [];
  for (const r of (links.data ?? []) as Row[]) {
    if (t(r.status) === "pending") { pending.push({ id: t(r.id), requested_shop: t(r.requested_shop), contact_name: t(r.contact_name), line_name: t(r.line_display_name), requested_at: (r.requested_at as string) ?? null }); continue; }
    const s = shopOf(t(r.partner_id), one(r.partners_v2)); if (!s) continue;
    s.people.push({ id: t(r.id), status: t(r.status), contact_name: t(r.contact_name), line_name: t(r.line_display_name), linked_at: (r.linked_at as string) ?? null, unlinked_at: (r.unlinked_at as string) ?? null });
  }
  const live = (s: LineShopRow) => s.people.filter((p) => p.status === "linked" || p.status === "blocked").length;
  const list = [...shops.values()].sort((a, b) => live(b) - live(a) || (b.last_order ?? "").localeCompare(a.last_order ?? ""));
  return NextResponse.json({ shops: list, pending, error: null });
}
