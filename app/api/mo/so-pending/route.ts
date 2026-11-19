/**
 * รายการใบสั่งขายที่ยัง "เปิดผลิตไม่ครบ" — ให้ป๊อปสร้างใบสั่งผลิต (components/mo-create) หยิบมาสร้าง (เจ้าของสั่ง 2026-11-19)
 *   GET   → { data: SoPendingLine[] }  รายการของใบสั่งขายที่ยืนยันแล้ว (ไม่นับยกเลิก/ส่งแล้ว) ที่ สั่ง > เปิดผลิตแล้ว
 *           เปิดผลิตแล้ว = ใบผลิตที่ยังใช้งาน (is_active) — คิดแบบเดียวกับหน้าใบสั่งขาย (soLineProgress ใน lib/mo-so-rule)
 *           รายการที่ยังไม่มีรหัสสินค้า (มาจากใบเสนอราคา) ก็ส่งมาด้วย — ป๊อปให้เลือกรหัสก่อน
 *   PATCH { line_id, sku } → ใส่/เปลี่ยนรหัสสินค้าให้รายการใบสั่งขายที่ยังไม่มีใบผลิต (audit so_order.line_set_sku + changes)
 *           แก้ซ้ำได้ (เปลี่ยนรหัสใหม่) · ล้างรหัสได้ที่หน้าใบสั่งขาย
 * สิทธิ์: GET products.view (คนเปิดป๊อปสร้างใบผลิต) · PATCH so.create (สิทธิ์แก้ใบสั่งขาย)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit, auditDiff } from "@/lib/audit";
import { soLineProgress, type SoPendingLine } from "@/lib/mo-so-rule";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const EPS = 0.0001;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const { data: os, error } = await admin.from("so_orders")
    .select("id, order_no, order_date, due_date, customer_name, customer_po_no, status")
    .eq("status", "confirmed").order("order_date", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ data: [], error: "โหลดใบสั่งขายไม่สำเร็จ" }, { status: 500 });
  const orders = (os ?? []) as Row[];
  const ids = orders.map((o) => String(o.id));
  const lines: Row[] = [], mos: Row[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const [l, m] = await Promise.all([
      admin.from("so_order_lines").select("id, order_id, line_no, sku, product_name, qty, unit, due_date, mo_id, note").in("order_id", part),
      admin.from("manufacturing_orders").select("id, mo_no, product_sku, qty, status, so_order_id").in("so_order_id", part).eq("is_active", true),
    ]);
    if (l.error || m.error) return NextResponse.json({ data: [], error: "โหลดรายการใบสั่งขายไม่สำเร็จ" }, { status: 500 });
    lines.push(...((l.data ?? []) as Row[])); mos.push(...((m.data ?? []) as Row[]));
  }
  const group = (rows: Row[], key: string) => {
    const g = new Map<string, Row[]>();
    for (const r of rows) { const k = String(r[key]); (g.get(k) ?? g.set(k, []).get(k)!).push(r); }
    return g;
  };
  const linesOf = group(lines, "order_id"), mosOf = group(mos, "so_order_id");

  const out: SoPendingLine[] = [];
  for (const o of orders) {
    const ls = (linesOf.get(String(o.id)) ?? []).sort((a, b) => (Number(a.line_no) || 0) - (Number(b.line_no) || 0));
    const prog = soLineProgress(
      ls.map((l) => ({ id: String(l.id), sku: (l.sku as string) ?? null, qty: Number(l.qty) || 0, mo_id: (l.mo_id as string) ?? null })),
      (mosOf.get(String(o.id)) ?? []).map((m) => ({ id: String(m.id), mo_no: String(m.mo_no), product_sku: (m.product_sku as string) ?? null, qty: Number(m.qty) || 0, status: (m.status as string) ?? null })),
    ).byLine;
    for (const l of ls) {
      const qty = Number(l.qty) || 0;
      if (qty <= 0) continue;
      if (!l.sku && !String(l.product_name ?? "").trim()) continue;   // บรรทัดว่าง/ค่าบริการที่ไม่มีชื่อ
      const opened = prog[String(l.id)]?.opened ?? 0;
      if (opened + EPS >= qty) continue;
      out.push({
        line_id: String(l.id), order_id: String(o.id), order_no: (o.order_no as string) ?? null, order_date: (o.order_date as string) ?? null,
        customer_name: (o.customer_name as string) ?? null, customer_po_no: (o.customer_po_no as string) ?? null,
        sku: (l.sku as string) || null, product_name: String(l.product_name ?? ""), note: (l.note as string) ?? null, unit: (l.unit as string) ?? null,
        qty, opened, remaining: Math.round((qty - opened) * 100) / 100,
        due_date: ((l.due_date as string) || (o.due_date as string) || null),
        image_key: null,
      });
    }
  }
  // รูปปกของรหัสสินค้า (ไว้โชว์ในรายการ)
  const codes = [...new Set(out.map((x) => x.sku).filter((s): s is string => !!s))];
  if (codes.length) {
    const img = new Map<string, string | null>();
    for (let i = 0; i < codes.length; i += 200) {
      const { data } = await admin.from("skus_v2").select("code, cover_image_r2_key").in("code", codes.slice(i, i + 200));
      for (const r of (data ?? []) as Row[]) img.set(String(r.code), (r.cover_image_r2_key as string) ?? null);
    }
    for (const x of out) if (x.sku) x.image_key = img.get(x.sku) ?? null;
  }
  return NextResponse.json({ data: out, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "so.create"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: { line_id?: string; sku?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const lineId = String(b.line_id ?? ""), sku = String(b.sku ?? "").trim();
  if (!lineId || !sku) return NextResponse.json({ error: "ระบุรายการและรหัสสินค้า" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: ln } = await admin.from("so_order_lines").select("id, order_id, sku, mo_id, mo_no").eq("id", lineId).maybeSingle();
  const line = ln as Row | null;
  if (!line) return NextResponse.json({ error: "ไม่พบรายการนี้ — ลองเปิดป๊อปใหม่" }, { status: 400 });
  if (line.mo_id) return NextResponse.json({ error: `รายการนี้ผูก ${line.mo_no ?? "ใบสั่งผลิต"} แล้ว — เปลี่ยนรหัสที่หน้าใบสั่งขาย` }, { status: 400 });
  const { data: so } = await admin.from("so_orders").select("id, order_no, status").eq("id", String(line.order_id)).maybeSingle();
  const order = so as Row | null;
  if (!order || order.status === "cancelled") return NextResponse.json({ error: "ใบสั่งขายนี้ถูกยกเลิกแล้ว" }, { status: 400 });
  const { data: sk } = await admin.from("skus_v2").select("code").eq("code", sku).eq("is_active", true).maybeSingle();
  if (!sk) return NextResponse.json({ error: `ไม่พบรหัสสินค้า ${sku}` }, { status: 400 });
  const { error } = await admin.from("so_order_lines").update({ sku }).eq("id", lineId);
  if (error) return NextResponse.json({ error: "บันทึกรหัสไม่สำเร็จ" }, { status: 400 });
  await writeAudit(admin, { action: "so_order.line_set_sku", entityType: "so_order", entityId: String(order.id), actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { order_no: order.order_no, line_id: lineId, from: "mo_create", changes: auditDiff({ sku: line.sku ?? null }, { sku }) } });
  return NextResponse.json({ ok: true, error: null });
}
