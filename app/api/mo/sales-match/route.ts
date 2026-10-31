/**
 * 🧾 จับคู่ใบสั่งผลิต ↔ ใบขาย (บิลที่ส่งลูกค้าแล้ว) — กติกา lib/mo-sales-match.ts · ตาราง mo_sales_links
 *   GET    ?mo_nos=MO-…,MO-…        → ต่อใบ: ผูกแล้ว / ที่ระบบเสนอ (ใบเก่าได้ก่อน — คิดจากทุกใบที่รหัสสินค้าเดียวกัน ไม่ใช่แค่ที่ส่งมา)
 *   POST   { mo_no, parts: [{ sale_line_id, qty }] } → ผูก (ตรวจยอดคงเหลือของบรรทัดใบขายซ้ำที่เซิร์ฟเวอร์)
 *   DELETE ?mo_no=MO-…               → ยกเลิกผูก (เก็บประวัติ is_active=false)
 * ใบขาย = erp_playground_sales_orders + so_lines (ไม่นับร่าง/ยกเลิก) · ผูก/ยกเลิก = audit mo.sales_link / mo.sales_unlink
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { matchSales, type MatchMo, type SaleLine, type SalesLinkRow } from "@/lib/mo-sales-match";

export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const n = (v: unknown) => Number(v) || 0;
const EPS = 0.0001;

async function who(request: NextRequest, admin: Admin) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return null;
  const { data: p } = await admin.from("user_profiles").select("display_name, email").eq("id", user.id).maybeSingle();
  const prof = p as { display_name: string | null; email: string | null } | null;
  return { id: user.id, name: prof?.display_name?.trim() || prof?.email || user.email || "ผู้ใช้" };
}

/** ข้อมูลสำหรับจับคู่ของรหัสสินค้าชุดนี้: ใบสั่งผลิตทุกใบ (ไม่นับยกเลิก) · บรรทัดใบขาย · ที่ผูกไว้แล้ว */
async function loadFor(admin: Admin, skus: string[]) {
  const list = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  if (!list.length) return { mos: [] as MatchMo[], lines: [] as SaleLine[], links: [] as SalesLinkRow[] };
  const variants = [...new Set(list.flatMap((s) => [s, `${s} `]))];   // บางแถวเก็บรหัสติดช่องว่างท้าย
  const [moRes, lineRes, linkRes] = await Promise.all([
    admin.from("manufacturing_orders").select("id, mo_no, product_sku, qty, created_at, status").in("product_sku", variants).neq("status", "cancelled").limit(2000),
    admin.from("erp_playground_so_lines").select("id, so_id, sku, qty, erp_playground_sales_orders!inner(id, so_number, status, order_date, customer_name)").in("sku", variants).limit(5000),
    admin.from("mo_sales_links").select("id, mo_id, sale_line_id, qty, so_number, sale_date").in("sku", list).eq("is_active", true).limit(5000),
  ]);
  const mos: MatchMo[] = ((moRes.data ?? []) as Row[]).filter((m) => m.status !== "cancel")
    .map((m) => ({ id: String(m.id), mo_no: String(m.mo_no), sku: String(m.product_sku ?? "").trim(), qty: n(m.qty), created_at: String(m.created_at ?? "") }));
  const lines: SaleLine[] = [];
  for (const l of (lineRes.data ?? []) as Row[]) {
    const h = (Array.isArray(l.erp_playground_sales_orders) ? l.erp_playground_sales_orders[0] : l.erp_playground_sales_orders) as Row | undefined;
    if (!h || h.status === "cancelled" || h.status === "draft" || !(n(l.qty) > 0)) continue;
    lines.push({ id: String(l.id), sale_id: String(h.id), so_number: String(h.so_number ?? "—"), date: String(h.order_date ?? "").slice(0, 10), customer: (h.customer_name as string | null) ?? null, sku: String(l.sku ?? "").trim(), qty: n(l.qty) });
  }
  const links: SalesLinkRow[] = ((linkRes.data ?? []) as Row[]).map((k) => ({ id: String(k.id), mo_id: String(k.mo_id), sale_line_id: String(k.sale_line_id), qty: n(k.qty), so_number: (k.so_number as string | null) ?? null, sale_date: (k.sale_date as string | null) ?? null }));
  return { mos, lines, links };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const moNos = [...new Set((new URL(request.url).searchParams.get("mo_nos") ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 300);
  if (!moNos.length) return NextResponse.json({ data: {} });
  const admin = supabaseAdmin();
  const { data: picked } = await admin.from("manufacturing_orders").select("mo_no, product_sku").in("mo_no", moNos);
  const ctx = await loadFor(admin, ((picked ?? []) as Row[]).map((m) => String(m.product_sku ?? "")));
  const res = matchSales(ctx.mos, ctx.lines, ctx.links);
  const data: Record<string, unknown> = {};
  for (const no of moNos) { const m = res.get(no); if (m) data[no] = m; }
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const body = await request.json().catch(() => null) as { mo_no?: unknown; parts?: unknown } | null;
  const moNo = typeof body?.mo_no === "string" ? body.mo_no.trim() : "";
  const parts = (Array.isArray(body?.parts) ? body!.parts : []) as { sale_line_id?: unknown; qty?: unknown }[];
  if (!moNo || !parts.length) return bad("ระบุใบสั่งผลิตและบรรทัดใบขาย");
  const admin = supabaseAdmin();
  const { data: mo } = await admin.from("manufacturing_orders").select("id, mo_no, product_sku, qty").eq("mo_no", moNo).limit(1).maybeSingle();
  if (!mo) return bad("ไม่พบใบสั่งผลิต", 404);
  const m = mo as Row;
  const ctx = await loadFor(admin, [String(m.product_sku ?? "")]);
  if (ctx.links.some((k) => k.mo_id === String(m.id))) return bad("ใบนี้ผูกใบขายไว้แล้ว — ยกเลิกก่อนถ้าจะเปลี่ยน");
  // ยอดคงเหลือของแต่ละบรรทัด = จำนวนในบรรทัด − ที่ผูกไว้แล้ว
  const used = new Map<string, number>();
  for (const k of ctx.links) used.set(k.sale_line_id, (used.get(k.sale_line_id) ?? 0) + k.qty);
  const rows: Row[] = [];
  for (const p of parts) {
    const lineId = typeof p.sale_line_id === "string" ? p.sale_line_id : "", qty = n(p.qty);
    const line = ctx.lines.find((l) => l.id === lineId);
    if (!line) return bad("ไม่พบบรรทัดใบขาย (หรือใบขายเป็นร่าง/ยกเลิก)");
    if (line.sku.toUpperCase() !== String(m.product_sku ?? "").trim().toUpperCase()) return bad("รหัสสินค้าในใบขายไม่ตรงกับใบสั่งผลิต");
    const left = line.qty - (used.get(line.id) ?? 0);
    if (!(qty > 0) || qty > left + EPS) return bad(`${line.so_number} เหลือให้ผูกได้ ${left} ชิ้น`);
    used.set(line.id, (used.get(line.id) ?? 0) + qty);
    rows.push({ mo_id: m.id, mo_no: m.mo_no, sale_id: line.sale_id, sale_line_id: line.id, so_number: line.so_number, sku: line.sku, qty, sale_date: line.date || null });
  }
  const me = await who(request, admin);
  const { error } = await admin.from("mo_sales_links").insert(rows.map((r) => ({ ...r, linked_by: me?.id ?? null, linked_by_name: me?.name ?? null })));
  if (error) return bad("ผูกใบขายไม่สำเร็จ", 500);
  await writeAudit(admin, { action: "mo.sales_link", entityType: "mo", entityId: String(m.id), actorId: me?.id ?? null, actorName: me?.name ?? null,
    metadata: { mo_no: m.mo_no, parts: rows.map((r) => ({ so_number: r.so_number, qty: r.qty, sale_date: r.sale_date })) } });
  return NextResponse.json({ ok: true, n: rows.length });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const moNo = (new URL(request.url).searchParams.get("mo_no") ?? "").trim();
  if (!moNo) return bad("ระบุใบสั่งผลิต");
  const admin = supabaseAdmin();
  const me = await who(request, admin);
  const { data, error } = await admin.from("mo_sales_links").update({ is_active: false, unlinked_at: new Date().toISOString(), unlinked_by_name: me?.name ?? null })
    .eq("mo_no", moNo).eq("is_active", true).select("mo_id, so_number, qty");
  if (error) return bad("ยกเลิกผูกไม่สำเร็จ", 500);
  const rows = (data ?? []) as Row[];
  if (rows.length) await writeAudit(admin, { action: "mo.sales_unlink", entityType: "mo", entityId: String(rows[0].mo_id), actorId: me?.id ?? null, actorName: me?.name ?? null,
    metadata: { mo_no: moNo, parts: rows.map((r) => ({ so_number: r.so_number, qty: r.qty })) } });
  return NextResponse.json({ ok: true, n: rows.length });
}
