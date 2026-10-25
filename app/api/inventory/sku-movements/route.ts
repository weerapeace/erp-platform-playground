/**
 * ความเคลื่อนไหวสต๊อกของสินค้า 1 ตัว ในคลัง 1 คลัง — GET /api/inventory/sku-movements?code=<รหัส>&warehouse_code=WH-RAW
 *   → ยอดตอนนี้ + สรุป (รับเข้า / จ่ายออก / จ่ายงานกี่ใบ / นับ-ปรับยอดกี่ครั้ง) + รายการทั้งหมด (ใหม่สุดก่อน)
 *   รายการจ่ายงาน (mo_issue_wip) แนบเลขใบ/รุ่น/จำนวนผลิต → หน้าจอรวมตามใบงาน + จับใบที่ใช้ต่อชิ้นผิดปกติได้
 *   นับได้ 0 ที่ไม่มี movement (ไม่เคยมียอด) ดึงจาก audit stock_count มาแสดงด้วย ไม่ให้หายจากประวัติ
 * ใช้ที่: ป้ายสต๊อกบนการ์ดวัตถุดิบ (ของกลาง components/stock-movement-history)
 * สิทธิ์: stock.view
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** in = เข้าคลังนี้ · out = ออกจากคลังนี้ · set = นับ/ตั้งยอด */
export type SkuMoveDir = "in" | "out" | "set";
export type SkuMoveKind = "receive" | "issue" | "count" | "other";
export type SkuMovement = {
  id: string; number: string | null; date: string | null; created_at: string;
  type: string; dir: SkuMoveDir; kind: SkuMoveKind; qty: number;
  from: string | null; to: string | null; ref_type: string | null; ref_label: string | null;
  mo_no: string | null; product_sku: string | null; mo_qty: number | null; by: string | null; note: string | null;
};
export type SkuMovementsResult = {
  code: string; name: string | null; uom: string | null; warehouse: string; on_hand: number | null;
  summary: { in_qty: number; out_qty: number; issue_qty: number; issue_mos: number; count_n: number };
  rows: SkuMovement[];
};

const r4 = (n: number) => Math.round(n * 10000) / 10000;
type Row = Record<string, unknown>;
const COUNT_REFS = ["quick_count", "stock_count"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "stock.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const code = (sp.get("code") ?? "").trim();
  const whCode = (sp.get("warehouse_code") ?? "WH-RAW").trim() || "WH-RAW";
  if (!code) return NextResponse.json({ data: null, error: "ต้องระบุรหัสสินค้า" }, { status: 400 });

  const admin = supabaseAdmin();
  const [{ data: sku }, { data: wh }] = await Promise.all([
    // ⚠️ ห้าม embed uoms ( name ) ตรง ๆ — skus_v2 ผูก uoms มากกว่า 1 FK → PostgREST ตอบ 300 (กำกวม) ทั้ง endpoint พัง
    admin.from("skus_v2").select("id, code, name_th, uom_id").eq("code", code).eq("is_active", true).limit(1).maybeSingle(),
    admin.from("erp_playground_warehouses").select("id, code").eq("code", whCode).maybeSingle(),
  ]);
  if (!sku) return NextResponse.json({ data: null, error: `ไม่พบสินค้า ${code}` }, { status: 404 });
  if (!wh) return NextResponse.json({ data: null, error: `ไม่พบคลัง ${whCode}` }, { status: 404 });
  const skuRow = sku as Row;
  const skuId = String(skuRow.id), whId = String((wh as Row).id);
  const { data: uomRow } = skuRow.uom_id ? await admin.from("uoms").select("name").eq("id", String(skuRow.uom_id)).maybeSingle() : { data: null };
  const uom = ((uomRow as { name?: string | null } | null)?.name) ?? null;

  const [moves, { data: bal }, { data: audits }] = await Promise.all([
    fetchAllPages<Row>((from, to) => admin.from("erp_playground_stock_movements")
      .select("id, movement_number, movement_type, movement_date, created_at, qty, from_warehouse_id, from_warehouse_code, to_warehouse_id, to_warehouse_code, reference_type, reference_id, reference_label, performed_by, note")
      .eq("product_id", skuId).or(`from_warehouse_id.eq.${whId},to_warehouse_id.eq.${whId}`)
      .order("created_at", { ascending: false }).range(from, to)),
    admin.from("erp_playground_stock_balances").select("qty_on_hand").eq("product_id", skuId).eq("warehouse_id", whId).maybeSingle(),
    admin.from("audit_logs").select("id, metadata, created_at").eq("action", "stock_count").eq("entity_type", "skus_v2").eq("entity_id", skuId)
      .order("created_at", { ascending: false }).limit(200),
  ]);

  // ใบงานของรายการจ่ายงาน (reference_id = manufacturing_orders.id)
  const moIds = [...new Set(moves.filter((m) => m.reference_type === "mo_issue_wip" && m.reference_id).map((m) => String(m.reference_id)))];
  const moById = new Map<string, Row>();
  for (let i = 0; i < moIds.length; i += 300) {
    const { data } = await admin.from("manufacturing_orders").select("id, mo_no, product_sku, qty").in("id", moIds.slice(i, i + 300));
    for (const m of (data ?? []) as Row[]) moById.set(String(m.id), m);
  }

  const rows: SkuMovement[] = moves.map((m) => {
    const type = String(m.movement_type ?? "");
    const isCount = type === "adjust" || COUNT_REFS.includes(String(m.reference_type ?? ""));
    const dir: SkuMoveDir = type === "adjust" ? "set" : String(m.to_warehouse_id ?? "") === whId ? "in" : "out";
    const kind: SkuMoveKind = isCount ? "count" : m.reference_type === "mo_issue_wip" ? "issue" : dir === "in" ? "receive" : "other";
    const mo = m.reference_id ? moById.get(String(m.reference_id)) : undefined;
    return {
      id: String(m.id), number: (m.movement_number as string) ?? null, date: (m.movement_date as string) ?? null, created_at: String(m.created_at),
      type, dir, kind, qty: r4(Number(m.qty) || 0),
      from: (m.from_warehouse_code as string) ?? null, to: (m.to_warehouse_code as string) ?? null,
      ref_type: (m.reference_type as string) ?? null, ref_label: (m.reference_label as string) ?? null,
      mo_no: mo ? String(mo.mo_no) : null, product_sku: mo ? ((mo.product_sku as string) ?? null) : null, mo_qty: mo ? Number(mo.qty) || 0 : null,
      by: (m.performed_by as string) ?? null, note: (m.note as string) ?? null,
    };
  });
  // นับได้ 0 ตอนยังไม่มียอดเลย = ไม่มี movement → เติมจาก audit ให้เห็นในประวัติ
  for (const a of (audits ?? []) as Row[]) {
    const md = (a.metadata ?? {}) as Record<string, unknown>;
    if (Number(md.counted) === 0 && md.before == null && String(md.warehouse ?? whCode) === whCode) {
      rows.push({
        id: `audit:${String(a.id)}`, number: null, date: String(a.created_at).slice(0, 10), created_at: String(a.created_at),
        type: "count", dir: "set", kind: "count", qty: 0, from: null, to: whCode, ref_type: "quick_count",
        ref_label: (md.ref_label as string) ?? "นับสต๊อก", mo_no: null, product_sku: null, mo_qty: null, by: (md.actor as string) ?? null, note: "นับได้ 0",
      });
    }
  }
  rows.sort((x, y) => y.created_at.localeCompare(x.created_at));

  const issue = rows.filter((r) => r.kind === "issue");
  const data: SkuMovementsResult = {
    code, name: (skuRow.name_th as string) ?? null, uom, warehouse: whCode,
    on_hand: bal ? r4(Number((bal as Row).qty_on_hand) || 0) : null,
    summary: {
      in_qty: r4(rows.filter((r) => r.dir === "in" && r.kind !== "count").reduce((n, r) => n + r.qty, 0)),
      out_qty: r4(rows.filter((r) => r.dir === "out" && r.kind !== "count").reduce((n, r) => n + r.qty, 0)),
      issue_qty: r4(issue.reduce((n, r) => n + r.qty, 0)),
      issue_mos: new Set(issue.map((r) => r.mo_no ?? r.ref_label)).size,
      count_n: rows.filter((r) => r.kind === "count").length,
    },
    rows,
  };
  return NextResponse.json({ data, error: null });
}
