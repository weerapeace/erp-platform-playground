/**
 * ตั้งเครดิตลูกค้า / ร้านค้า แบบหลายรายพร้อมกัน
 *
 *   GET   ?side=customer|supplier   → รายชื่อที่ "มีเอกสารค้างอยู่จริง" + เครดิตปัจจุบัน + ยอดค้าง
 *   PATCH { side, items: [{id, value}] } → ตั้งค่าทีละหลายราย
 *
 * ทำไมต้องมี: หน้ากระแสเงินสดต้องรู้ว่าเงินจะเข้า/ออกวันไหน แต่ข้อมูลจริงตั้งเครดิตไว้แค่
 * ลูกค้า 1/125 ราย และร้านค้า 2/80 ราย → ระบบต้องเดาวันเกือบทั้งหมด
 * ถ้าให้ไปตั้งทีละรายในทะเบียนคู่ค้าคงไม่มีใครทำ จึงทำหน้ารวมที่เรียงตาม "ยอดค้างมากสุด" ให้ตั้งรวดเดียว
 *
 * เก็บที่เดิมทั้งคู่ (ไม่สร้างช่องใหม่):
 *   ลูกค้า  → partners_v2.payment_terms_days   (จำนวนวัน)
 *   ร้านค้า → partners_v2.purchase_credit_term (ข้อความรูปแบบของ lib/credit-term)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { parseCreditTerm } from "@/lib/credit-term";
import { SO_ACTIVE_STATUSES } from "@/lib/so-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CreditTermRow = {
  id: string;
  name: string;
  code: string | null;
  /** เครดิตที่ตั้งไว้ตอนนี้ — ลูกค้าเป็นจำนวนวัน (number) · ร้านค้าเป็นข้อความรูปแบบ credit-term */
  current: string | null;
  /** จำนวนเอกสารที่ยังค้าง */
  openDocs: number;
  /** ยอดค้างรวม (บาท) */
  openAmount: number;
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.view");
  if (denied) return denied;

  const side = request.nextUrl.searchParams.get("side") === "supplier" ? "supplier" : "customer";
  const db = supabaseAdmin();

  const { data: partners } = await db
    .from("partners_v2")
    .select("id, display_name, name_th, code, payment_terms_days, purchase_credit_term")
    .limit(5000);
  const pMap = new Map((partners ?? []).map((p) => [String(p.id), p]));

  const agg = new Map<string, { openDocs: number; openAmount: number }>();
  const bump = (id: string | null, amount: number) => {
    if (!id) return;
    const cur = agg.get(id) ?? { openDocs: 0, openAmount: 0 };
    cur.openDocs += 1;
    cur.openAmount += amount;
    agg.set(id, cur);
  };

  if (side === "customer") {
    const { data: sos } = await db
      .from("erp_playground_sales_orders")
      .select("customer_id, amount_due, grand_total")
      .in("status", SO_ACTIVE_STATUSES).limit(5000);
    for (const s of sos ?? []) {
      const left = num(s.amount_due) || num(s.grand_total);
      if (left > 0) bump(s.customer_id as string | null, left);
    }
  } else {
    const { data: pos } = await db
      .from("purchase_orders_v2")
      .select("seller_partner_id, grand_total, currency, paid_amount_thb")
      .eq("is_active", true).neq("payment_status", "paid").limit(5000);
    for (const p of pos ?? []) {
      // ยอดหยวนไม่ต้องแปลงเรตตรงนี้ — ใช้แค่จัดอันดับว่าร้านไหนค้างเยอะ
      const left = num(p.grand_total) - num(p.paid_amount_thb);
      if (left > 0) bump(p.seller_partner_id as string | null, left);
    }
  }

  const rows: CreditTermRow[] = [...agg.entries()].map(([id, v]) => {
    const p = pMap.get(id);
    const current = side === "customer"
      ? (num(p?.payment_terms_days) > 0 ? String(num(p?.payment_terms_days)) : null)
      : (p?.purchase_credit_term ? String(p.purchase_credit_term) : null);
    return {
      id,
      name: String(p?.display_name || p?.name_th || "(ไม่พบชื่อ)"),
      code: (p?.code as string | null) ?? null,
      current,
      openDocs: v.openDocs,
      openAmount: Math.round(v.openAmount * 100) / 100,
    };
  });

  // ยังไม่ได้ตั้งขึ้นก่อน แล้วเรียงตามยอดค้างมากสุด — ตั้งไล่จากบนลงล่างได้ผลเร็วสุด
  rows.sort((a, b) => {
    if (!a.current && b.current) return -1;
    if (a.current && !b.current) return 1;
    return b.openAmount - a.openAmount;
  });

  return NextResponse.json({ data: rows, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.manage");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { side?: string; items?: { id?: string; value?: string | number | null }[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const side = body.side === "supplier" ? "supplier" : "customer";
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 500);
  if (!items.length) return NextResponse.json({ error: "ไม่มีรายการที่จะตั้งค่า" }, { status: 400 });

  const admin = supabaseAdmin();
  let updated = 0;
  const failed: string[] = [];

  for (const it of items) {
    const id = typeof it.id === "string" && UUID_RE.test(it.id) ? it.id : null;
    if (!id) { failed.push(String(it.id ?? "(ไม่มี id)")); continue; }

    let patch: Record<string, unknown>;
    if (side === "customer") {
      const days = it.value === null || it.value === "" ? null : Math.round(Number(it.value));
      if (days !== null && (!Number.isFinite(days) || days < 0 || days > 365)) { failed.push(id); continue; }
      patch = { payment_terms_days: days };
    } else {
      const term = it.value === null || it.value === "" ? null : String(it.value);
      // ต้องเป็นรูปแบบที่ lib/credit-term อ่านออก ไม่งั้นหน้ากระแสเงินสดจะคำนวณวันไม่ได้
      if (term !== null && !parseCreditTerm(term)) { failed.push(id); continue; }
      patch = { purchase_credit_term: term };
    }

    const { error } = await admin.from("partners_v2").update(patch).eq("id", id);
    if (error) { failed.push(id); continue; }
    updated += 1;
  }

  await writeAudit(admin, {
    action: "update", entityType: "partners_v2", entityId: null,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { what: side === "customer" ? "ตั้งเครดิตลูกค้า" : "ตั้งเครดิตร้านค้า", updated, failed: failed.length },
  });

  return NextResponse.json({ data: { updated, failed: failed.length }, error: null });
}
