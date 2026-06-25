/**
 * GET /api/purchasing/dashboard/list?type=...&seller=&q=&mo=&limit=
 * เจาะรายการเบื้องหลังตัวเลขบนแดชบอร์ดจัดซื้อ (กดการ์ด/ร้าน → ดูรายการ)
 *
 * type: waiting | pending_receive | unpaid | spend_month | supplier
 * filter (ของกลุ่ม C): seller (ชื่อร้าน), q (ค้นหาสินค้า/เลขเอกสาร), mo (เลขใบสั่งผลิต — เฉพาะ waiting)
 *
 * คืน { error, title, rows: Row[], sellers: string[], link }  · มูลค่าแปลงเป็นบาท (หยวน×เรตล่าสุด)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const isCNY = (c: unknown) => { const s = String(c ?? "").toUpperCase(); return s === "RMB" || s === "YUAN" || s === "CNY"; };
const baht = (n: number) => "฿" + Math.round(n || 0).toLocaleString("th-TH");
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export type DrillRow = { id: string; primary: string; secondary: string; right: string; mo_no?: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const type = sp.get("type") ?? "";
  const seller = (sp.get("seller") ?? "").trim();
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const mo = (sp.get("mo") ?? "").trim();
  const limit = Math.min(500, Math.max(1, parseInt(sp.get("limit") ?? "200", 10)));
  const admin = supabaseAdmin();

  const rateRes = await admin.from("daily_rates").select("rate").order("rate_date", { ascending: false }).limit(1).maybeSingle();
  const rmbRate = num((rateRes.data as { rate?: number } | null)?.rate) || 5;
  const toThb = (amount: number, currency: unknown) => amount * (isCNY(currency) ? rmbRate : 1);
  const hit = (s: string) => !q || s.toLowerCase().includes(q);

  let title = "รายการ";
  let rows: DrillRow[] = [];
  let sellers: string[] = [];
  let link: { href: string; label: string } | null = null;

  if (type === "waiting") {
    title = "รายการรอซื้อ (รออนุมัติ)";
    link = { href: "/purchasing/orders", label: "ไปหน้าอนุมัติ" };
    const { data } = await admin.from("purchase_requests_v2")
      .select("id, pr_no, item_name, seller_name, requester, qty, uom, price_est, currency, created_at, source_mo_no")
      .eq("status", "waiting").eq("is_active", true).order("created_at", { ascending: false }).limit(5000);
    const all = (data ?? []) as Record<string, unknown>[];
    sellers = [...new Set(all.map((r) => String(r.seller_name ?? "")).filter(Boolean))].sort();
    rows = all
      .filter((r) => (!seller || String(r.seller_name ?? "") === seller) && (!mo || String(r.source_mo_no ?? "") === mo)
        && (hit(String(r.item_name ?? "")) || hit(String(r.seller_name ?? "")) || hit(String(r.pr_no ?? ""))))
      .slice(0, limit)
      .map((r) => ({
        id: String(r.id),
        primary: String(r.item_name ?? "—"),
        secondary: `🏪 ${r.seller_name || "—"} · ${r.requester || "—"}${r.source_mo_no ? ` · 🏭 ${r.source_mo_no}` : ""}`,
        right: `${num(r.qty).toLocaleString()} ${r.uom || ""} · ${baht(toThb(num(r.price_est) * num(r.qty), r.currency))}`,
        mo_no: (r.source_mo_no as string) ?? null,
      }));
  } else if (type === "unpaid" || type === "spend_month") {
    const thisMonth = monthKey(new Date());
    title = type === "unpaid" ? "ใบสั่งซื้อรอจ่ายเงิน" : "ใบสั่งซื้อเดือนนี้";
    link = { href: "/purchasing/orders", label: "ไปหน้าใบสั่งซื้อ" };
    const { data } = await admin.from("purchase_orders_v2")
      .select("id, po_no, seller_name, grand_total, currency, order_date, payment_status, status")
      .order("order_date", { ascending: false }).limit(5000);
    const all = ((data ?? []) as Record<string, unknown>[]).filter((p) => p.status !== "draft" && p.status !== "cancelled");
    const filtered = all.filter((p) => {
      if (type === "unpaid" && p.payment_status !== "unpaid") return false;
      if (type === "spend_month") {
        const od = p.order_date ? new Date(String(p.order_date) + "T00:00:00Z") : null;
        if (!od || isNaN(od.getTime()) || monthKey(od) !== thisMonth) return false;
      }
      return true;
    });
    sellers = [...new Set(filtered.map((r) => String(r.seller_name ?? "")).filter(Boolean))].sort();
    rows = filtered
      .filter((p) => (!seller || String(p.seller_name ?? "") === seller) && (hit(String(p.po_no ?? "")) || hit(String(p.seller_name ?? ""))))
      .slice(0, limit)
      .map((p) => ({
        id: String(p.id),
        primary: String(p.po_no ?? "—"),
        secondary: `🏪 ${p.seller_name || "—"}${p.order_date ? ` · ${p.order_date}` : ""}`,
        right: baht(toThb(num(p.grand_total), p.currency)),
      }));
  } else if (type === "pending_receive" || type === "supplier") {
    title = type === "supplier" ? `ซื้อจาก ${seller || "ร้าน"}` : "รายการค้างรับเข้า";
    link = type === "pending_receive" ? { href: "/purchasing/receive", label: "ไปหน้ารับของ" } : { href: "/purchasing/orders", label: "ไปหน้าใบสั่งซื้อ" };
    // lines + join PO (สองคำขอ แล้วต่อใน JS — เลี่ยงพึ่ง FK ของ PostgREST)
    const [lineRes, poRes] = await Promise.all([
      admin.from("purchase_order_lines_v2").select("id, po_id, item_sku_id, item_name, qty, qty_received, uom, line_status, price_est, currency").eq("is_active", true).limit(20000),
      admin.from("purchase_orders_v2").select("id, po_no, seller_name, order_date, status").limit(5000),
    ]);
    const poById = new Map<string, Record<string, unknown>>();
    for (const p of (poRes.data ?? []) as Record<string, unknown>[]) poById.set(String(p.id), p);
    let lines = (lineRes.data ?? []) as Record<string, unknown>[];
    if (type === "pending_receive") {
      lines = lines.filter((l) => l.line_status !== "received" && l.line_status !== "short_closed" && Math.max(0, num(l.qty) - num(l.qty_received)) > 0);
    }
    // ผูกข้อมูลร้านจาก PO + กรองร้านที่ปิด/ยกเลิก
    const enriched = lines.map((l) => ({ l, po: poById.get(String(l.po_id)) })).filter((x) => x.po && x.po.status !== "draft" && x.po.status !== "cancelled");
    const scoped = type === "supplier" ? enriched.filter((x) => String(x.po!.seller_name ?? "") === seller) : enriched;
    sellers = [...new Set(scoped.map((x) => String(x.po!.seller_name ?? "")).filter(Boolean))].sort();
    rows = scoped
      .filter((x) => (!seller || type === "supplier" || String(x.po!.seller_name ?? "") === seller) && (hit(String(x.l.item_name ?? "")) || hit(String(x.po!.po_no ?? ""))))
      .slice(0, limit)
      .map((x) => {
        const remain = Math.max(0, num(x.l.qty) - num(x.l.qty_received));
        return {
          id: String(x.l.id),
          primary: String(x.l.item_name ?? "—"),
          secondary: `🏪 ${x.po!.seller_name || "—"} · ${x.po!.po_no || "—"}${x.po!.order_date ? ` · ${x.po!.order_date}` : ""}`,
          right: type === "pending_receive"
            ? `รับแล้ว ${num(x.l.qty_received).toLocaleString()}/${num(x.l.qty).toLocaleString()} · ค้าง ${remain.toLocaleString()} ${x.l.uom || ""}`
            : `${num(x.l.qty).toLocaleString()} ${x.l.uom || ""} · ${baht(toThb(num(x.l.price_est) * num(x.l.qty), x.l.currency))}`,
        };
      });
  } else {
    return NextResponse.json({ error: "invalid type", rows: [] }, { status: 400 });
  }

  return NextResponse.json({ error: null, title, rows, sellers, link });
}
