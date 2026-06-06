/**
 * POST /api/purchasing/create-po
 * สร้างใบสั่งซื้อ (PO) จากใบขอซื้อ (PR) ที่เลือก
 *
 * body: { pr_ids: string[], actor?: string }
 * - โหลด PR ที่ status='waiting' และยังไม่ถูกผูก PO
 * - จัดกลุ่มตาม (ร้าน + สกุลเงิน) → สร้าง PO แยกใบละกลุ่ม
 * - คัดลอกแต่ละ PR เป็นรายการใน PO + คิดยอดรวม + ออกเลขที่อัตโนมัติ
 * - อัปเดต PR: status='rfq_created' + po_id
 *
 * หมายเหตุ: เขียนผ่าน service role (supabaseAdmin) — bypass RLS
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PR = {
  id: string;
  item_sku_id: string | null;
  item_name: string | null;
  qty: number | null;
  uom: string | null;
  seller_name: string | null;
  price_est: number | null;
  currency: string | null;
  note: string | null;
  order_date: string | null;
  requester: string | null;
  status: string | null;
  po_id: string | null;
};

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ตรวจ login
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { pr_ids?: unknown; actor?: string; order_date?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const prIds = Array.isArray(body.pr_ids) ? body.pr_ids.filter((x): x is string => typeof x === "string") : [];
  if (prIds.length === 0) return NextResponse.json({ error: "ไม่ได้เลือกรายการ" }, { status: 400 });

  const admin = supabaseAdmin();

  // โหลด PR ที่เลือก (เฉพาะที่ยังไม่ถูกแปลงเป็น PO)
  const { data: prs, error: prErr } = await admin
    .from("purchase_requests_v2")
    .select("id, item_sku_id, item_name, qty, uom, seller_name, price_est, currency, note, order_date, requester, status, po_id")
    .in("id", prIds);
  if (prErr) return NextResponse.json({ error: prErr.message }, { status: 500 });

  // หน้าสั่งซื้อ: สั่งได้ทุกใบที่ "ยังไม่ถูกสั่ง (po_id ว่าง) + ไม่ถูกปฏิเสธ/ยกเลิก"
  // ใบที่ยังไม่อนุมัติ → จะบันทึกอนุมัติให้อัตโนมัติตอนสั่ง (เก็บร่องรอยผู้อนุมัติ)
  const usable = (prs ?? []).filter((p) => !(p as PR).po_id && !["rejected", "cancelled"].includes(String((p as PR).status ?? ""))) as PR[];
  if (usable.length === 0) return NextResponse.json({ error: "ไม่มีรายการที่สั่งได้ (ต้องยังไม่ถูกสั่งซื้อ และไม่ถูกปฏิเสธ)" }, { status: 400 });

  // จัดกลุ่มตามร้าน + สกุลเงิน
  const groups = new Map<string, PR[]>();
  for (const p of usable) {
    const key = `${p.seller_name ?? "ไม่ระบุร้าน"}|||${p.currency ?? "THB"}`;
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }

  // เลขที่ PO: ใช้ระบบเลขเอกสารกลาง erp_next_number('po') — atomic กันเลขซ้ำ
  // ตั้งค่ารูปแบบได้ที่หน้า /admin/numbering (ไม่ต้องแก้โค้ด)
  const now = new Date();
  const actor = body.actor ?? user.email ?? "system";
  const created: Array<{ po_no: string; seller_name: string; currency: string; grand_total: number; line_count: number }> = [];

  for (const [key, items] of groups) {
    const [seller, currency] = key.split("|||");
    const { data: poNo, error: numErr } = await admin.rpc("erp_next_number", { p_key: "po" });
    if (numErr || !poNo) return NextResponse.json({ error: "ออกเลข PO ไม่สำเร็จ: " + (numErr?.message ?? "") }, { status: 500 });
    const grandTotal = items.reduce((a, p) => a + num(p.qty) * num(p.price_est), 0);
    const orderDate = (typeof body.order_date === "string" && body.order_date)
      ? body.order_date
      : (items.find((p) => p.order_date)?.order_date ?? now.toISOString().slice(0, 10));
    const requester = items.find((p) => p.requester)?.requester ?? actor;

    // header
    const { data: po, error: poErr } = await admin
      .from("purchase_orders_v2")
      .insert({ po_no: poNo, seller_name: seller, currency, order_date: orderDate, status: "draft", grand_total: grandTotal, requester })
      .select("id")
      .single();
    if (poErr || !po) return NextResponse.json({ error: "สร้าง PO ไม่สำเร็จ: " + (poErr?.message ?? "") }, { status: 500 });

    // lines
    const lines = items.map((p, i) => ({
      po_id: po.id,
      pr_id: p.id,
      item_sku_id: p.item_sku_id,
      item_name: p.item_name,
      qty: num(p.qty),
      uom: p.uom,
      price_est: num(p.price_est),
      line_total: num(p.qty) * num(p.price_est),
      currency,
      note: p.note,
      sort_order: i,
    }));
    const { error: lineErr } = await admin.from("purchase_order_lines_v2").insert(lines);
    if (lineErr) return NextResponse.json({ error: "สร้างรายการ PO ไม่สำเร็จ: " + lineErr.message }, { status: 500 });

    // อัปเดต PR → rfq_created + ผูก po
    const { error: updErr } = await admin
      .from("purchase_requests_v2")
      .update({ status: "rfq_created", po_id: po.id })
      .in("id", items.map((p) => p.id));
    if (updErr) return NextResponse.json({ error: "อัปเดตสถานะ PR ไม่สำเร็จ: " + updErr.message }, { status: 500 });

    // บันทึก "อนุมัติแล้วสั่งเลย" เฉพาะใบที่ยังไม่เคยอนุมัติ (เก็บผู้อนุมัติ+เวลา)
    await admin.from("purchase_requests_v2")
      .update({ approved_by: actor, approved_at: now.toISOString() })
      .in("id", items.map((p) => p.id)).is("approved_at", null);

    // audit — 1 แถวต่อ 1 ใบสั่งซื้อ (ของกลาง, เขียนลงตาราง audit_logs จริง)
    await writeAudit(admin, {
      action:     "create",
      entityType: "purchase_orders_v2",
      entityId:   po.id,
      actorId:    user.id,
      actorName:  actor,
      metadata:   { po_no: poNo, seller, currency, grand_total: grandTotal, line_count: items.length },
    });

    created.push({ po_no: poNo, seller_name: seller, currency, grand_total: grandTotal, line_count: items.length });
  }

  return NextResponse.json({ ok: true, created, error: null });
}
