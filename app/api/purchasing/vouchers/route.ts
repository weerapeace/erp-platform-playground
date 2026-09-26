/**
 * ใบสำคัญรับ (ใบซื้อ) — purchase_vouchers_v2
 *   GET  /api/purchasing/vouchers?pending=1        → ใบรับ GR ที่ยังไม่ออกใบสำคัญ (คิวงานของจัดซื้อ)
 *   GET  /api/purchasing/vouchers?status=draft|confirmed|cancelled|all → รายการใบสำคัญ
 *   POST /api/purchasing/vouchers { gr_ids: [] }   → สร้างใบร่างจาก GR (ดึงราคา/คิว/กก./เรทให้)
 * สิทธิ์: อ่าน = products.cost.view (มีราคาซื้อ) · เขียน = products.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { prefillFromGrs } from "@/lib/purchase-voucher-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.cost.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const sp = request.nextUrl.searchParams;

  if (sp.get("pending") === "1") {
    // ใบรับที่ยังไม่ผูกใบสำคัญ — ล่าสุดก่อน
    const { data: grs, error } = await admin.from("goods_receipts_v2")
      .select("id, gr_no, po_id, po_no, seller_name, receive_date, receiver, status, receipt_doc_r2_key, bill_doc_r2_key, created_at")
      .is("voucher_id", null).not("is_active", "is", false).order("receive_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
    if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
    const rows = (grs ?? []) as Row[];
    const ids = rows.map((g) => String(g.id));
    const cnt = new Map<string, number>();
    const poIds = [...new Set(rows.map((g) => String(g.po_id ?? "")).filter(Boolean))];
    const curMap = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data: ls } = await admin.from("goods_receipt_lines_v2").select("gr_id, qty_received").in("gr_id", ids.slice(i, i + 300));
      for (const l of (ls ?? []) as Row[]) if (num(l.qty_received) > 0) { const k = String(l.gr_id); cnt.set(k, (cnt.get(k) ?? 0) + 1); }
    }
    for (let i = 0; i < poIds.length; i += 300) {
      const { data: ps } = await admin.from("purchase_orders_v2").select("id, currency").in("id", poIds.slice(i, i + 300));
      for (const p of (ps ?? []) as Row[]) curMap.set(String(p.id), String(p.currency ?? "THB").toUpperCase());
    }
    const data = rows.map((g) => ({
      id: String(g.id), gr_no: g.gr_no ?? "", po_id: g.po_id ?? null, po_no: g.po_no ?? "", seller_name: g.seller_name ?? "",
      receive_date: g.receive_date ?? null, receiver: g.receiver ?? "", line_count: cnt.get(String(g.id)) ?? 0,
      currency: curMap.get(String(g.po_id ?? "")) ?? "THB",
      receipt_doc_r2_key: g.receipt_doc_r2_key ?? null, bill_doc_r2_key: g.bill_doc_r2_key ?? null,
    })).filter((g) => g.line_count > 0);
    return NextResponse.json({ data, error: null });
  }

  const status = sp.get("status") ?? "all";
  let q = admin.from("purchase_vouchers_v2").select("*").not("is_active", "is", false).order("created_at", { ascending: false }).limit(500);
  if (status !== "all") q = q.eq("status", status);
  const { data: vs, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const rows = (vs ?? []) as Row[];
  const ids = rows.map((v) => String(v.id));
  const cnt = new Map<string, number>(); const grNos = new Map<string, Set<string>>(); const poNos = new Map<string, Set<string>>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data: ls } = await admin.from("purchase_voucher_lines_v2").select("voucher_id, gr_no, po_no").in("voucher_id", ids.slice(i, i + 300)).not("is_active", "is", false);
    for (const l of (ls ?? []) as Row[]) {
      const k = String(l.voucher_id); cnt.set(k, (cnt.get(k) ?? 0) + 1);
      if (l.gr_no) (grNos.get(k) ?? grNos.set(k, new Set()).get(k)!).add(String(l.gr_no));
      if (l.po_no) (poNos.get(k) ?? poNos.set(k, new Set()).get(k)!).add(String(l.po_no));
    }
  }
  const data = rows.map((v) => ({
    ...v, line_count: cnt.get(String(v.id)) ?? 0,
    gr_nos: [...(grNos.get(String(v.id)) ?? [])], po_nos: [...(poNos.get(String(v.id)) ?? [])],
  }));
  return NextResponse.json({ data, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { gr_ids?: unknown; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const grIds = Array.isArray(body.gr_ids) ? body.gr_ids.map(String) : [];
  const actor = String(body.actor ?? "") || (user?.user_metadata?.name as string) || user?.email || null;
  const admin = supabaseAdmin();
  try {
    const id = await prefillFromGrs(admin, grIds, actor);
    await writeAudit(admin, { action: "create", entityType: "purchase_vouchers_v2", entityId: id, actorId: user?.id ?? null, actorName: actor, metadata: { gr_ids: grIds } });
    return NextResponse.json({ ok: true, id, error: null });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 });
  }
}
