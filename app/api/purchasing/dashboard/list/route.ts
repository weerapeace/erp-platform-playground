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

type SkuInfo = { code: string | null; cover: string | null; link: string | null; alt_seller: string | null; alt_price: number | null; alt_currency: string | null; alt_link: string | null };
async function loadSkuMap(admin: ReturnType<typeof supabaseAdmin>, ids: unknown[]): Promise<Map<string, SkuInfo>> {
  const skuIds = [...new Set(ids.filter(Boolean).map(String))];
  const map = new Map<string, SkuInfo>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const { data: sk } = await admin.from("skus_v2").select("id, code, cover_image_r2_key, purchase_link, alt_seller, alt_price, alt_currency, alt_link").in("id", skuIds.slice(i, i + 300));
    for (const s of (sk ?? []) as Record<string, unknown>[]) map.set(String(s.id), {
      code: (s.code as string) ?? null, cover: (s.cover_image_r2_key as string) ?? null, link: (s.purchase_link as string) ?? null,
      alt_seller: (s.alt_seller as string) ?? null, alt_price: s.alt_price != null ? Number(s.alt_price) : null,
      alt_currency: (s.alt_currency as string) ?? null, alt_link: (s.alt_link as string) ?? null,
    });
  }
  return map;
}

export type DrillRow = {
  id: string; primary: string; secondary: string; right: string; mo_no?: string | null;
  // ── ข้อมูลเต็ม (waiting + pending_receive) สำหรับ view การ์ด/ตาราง + popup รายละเอียด ──
  pr_no?: string; code?: string; image_url?: string | null; reason?: string | null;
  seller?: string | null; requester?: string | null;
  qty?: number; uom?: string; unit_price?: number; currency?: string;
  unit_price_thb?: number; line_total_thb?: number;
  order_date?: string | null; purchase_url?: string | null;
  sku_id?: string | null;                                   // ไว้ save ข้อมูลกลับ SKU
  needed_date?: string | null; note?: string | null; created_at?: string | null; status?: string | null;
  missing?: string[];                                        // field ที่ยังไม่ครบ: image | price | link | seller
  // แหล่งซื้อที่ 2 (เก็บบน SKU)
  alt_seller?: string | null; alt_price?: number | null; alt_currency?: string | null; alt_link?: string | null;
  // pending_receive
  po_no?: string; received?: number; remain?: number; expected_date?: string | null;
};

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
      .select("id, pr_no, item_sku_id, item_name, seller_name, requester, qty, uom, price_est, currency, created_at, order_date, source_mo_no, reason, image_key, purchase_url, needed_date, note, status")
      .eq("status", "waiting").eq("is_active", true).order("created_at", { ascending: false }).limit(5000);
    const all = (data ?? []) as Record<string, unknown>[];
    // join skus_v2 → รหัส + รูปปก + ลิงก์ + แหล่งซื้อที่ 2 — ไว้ตรวจ "ข้อมูลไม่ครบ" + โชว์ในป๊อป
    const skuMap = await loadSkuMap(admin, all.map((r) => r.item_sku_id));
    sellers = [...new Set(all.map((r) => String(r.seller_name ?? "")).filter(Boolean))].sort();
    rows = all
      .filter((r) => (!seller || String(r.seller_name ?? "") === seller) && (!mo || String(r.source_mo_no ?? "") === mo)
        && (hit(String(r.item_name ?? "")) || hit(String(r.seller_name ?? "")) || hit(String(r.pr_no ?? ""))))
      .slice(0, limit)
      .map((r) => {
        const sk = r.item_sku_id ? skuMap.get(String(r.item_sku_id)) : null;
        const imgKey = sk?.cover ?? (r.image_key as string) ?? null;
        const qty = num(r.qty), price = num(r.price_est);
        const missing: string[] = [];
        if (!imgKey) missing.push("image");
        if (price <= 0) missing.push("price");
        if (!sk?.link && !r.purchase_url) missing.push("link");
        if (!r.seller_name) missing.push("seller");
        return {
          id: String(r.id),
          primary: String(r.item_name ?? "—"),
          secondary: `🏪 ${r.seller_name || "—"} · ${r.requester || "—"}${r.source_mo_no ? ` · 🏭 ${r.source_mo_no}` : ""}`,
          right: `${qty.toLocaleString()} ${r.uom || ""} · ${baht(toThb(price * qty, r.currency))}`,
          mo_no: (r.source_mo_no as string) ?? null,
          pr_no: String(r.pr_no ?? ""),
          code: sk?.code ?? "",
          image_url: imgKey ? `/api/r2-image?key=${encodeURIComponent(imgKey)}` : null,
          reason: (r.reason as string) ?? null,
          seller: (r.seller_name as string) ?? null,
          requester: (r.requester as string) ?? null,
          qty, uom: (r.uom as string) || "",
          unit_price: price, currency: String(r.currency ?? "THB"),
          unit_price_thb: Math.round(toThb(price, r.currency)),
          line_total_thb: Math.round(toThb(price * qty, r.currency)),
          order_date: (r.order_date as string) ?? null,
          purchase_url: (r.purchase_url as string) ?? null,
          sku_id: (r.item_sku_id as string) ?? null,
          needed_date: (r.needed_date as string) ?? null,
          note: (r.note as string) ?? null,
          created_at: (r.created_at as string) ?? null,
          status: (r.status as string) ?? null,
          missing,
          alt_seller: sk?.alt_seller ?? null, alt_price: sk?.alt_price ?? null, alt_currency: sk?.alt_currency ?? null, alt_link: sk?.alt_link ?? null,
        };
      });
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
    // join skus_v2 → รหัส + รูปปก + ลิงก์ + แหล่งซื้อที่ 2 (โชว์รูป + ตรวจ "ข้อมูลไม่ครบ")
    const skuMap = await loadSkuMap(admin, scoped.map((x) => x.l.item_sku_id));
    rows = scoped
      .filter((x) => (!seller || type === "supplier" || String(x.po!.seller_name ?? "") === seller) && (hit(String(x.l.item_name ?? "")) || hit(String(x.po!.po_no ?? ""))))
      .slice(0, limit)
      .map((x) => {
        const remain = Math.max(0, num(x.l.qty) - num(x.l.qty_received));
        const sk = x.l.item_sku_id ? skuMap.get(String(x.l.item_sku_id)) : null;
        const imgKey = sk?.cover ?? null;
        const qty = num(x.l.qty), price = num(x.l.price_est);
        const missing: string[] = [];
        if (!imgKey) missing.push("image");
        if (price <= 0) missing.push("price");
        if (!sk?.link) missing.push("link");
        return {
          id: String(x.l.id),
          primary: String(x.l.item_name ?? "—"),
          secondary: `🏪 ${x.po!.seller_name || "—"} · ${x.po!.po_no || "—"}${x.po!.order_date ? ` · ${x.po!.order_date}` : ""}`,
          right: type === "pending_receive"
            ? `รับแล้ว ${num(x.l.qty_received).toLocaleString()}/${qty.toLocaleString()} · ค้าง ${remain.toLocaleString()} ${x.l.uom || ""}`
            : `${qty.toLocaleString()} ${x.l.uom || ""} · ${baht(toThb(price * qty, x.l.currency))}`,
          code: sk?.code ?? "",
          image_url: imgKey ? `/api/r2-image?key=${encodeURIComponent(imgKey)}` : null,
          seller: (x.po!.seller_name as string) ?? null,
          po_no: String(x.po!.po_no ?? ""),
          order_date: (x.po!.order_date as string) ?? null,
          qty, uom: (x.l.uom as string) || "",
          received: num(x.l.qty_received), remain,
          unit_price: price, currency: String(x.l.currency ?? "THB"),
          unit_price_thb: Math.round(toThb(price, x.l.currency)),
          line_total_thb: Math.round(toThb(price * qty, x.l.currency)),
          sku_id: (x.l.item_sku_id as string) ?? null,
          missing,
          alt_seller: sk?.alt_seller ?? null, alt_price: sk?.alt_price ?? null, alt_currency: sk?.alt_currency ?? null, alt_link: sk?.alt_link ?? null,
        };
      });
  } else {
    return NextResponse.json({ error: "invalid type", rows: [] }, { status: 400 });
  }

  return NextResponse.json({ error: null, title, rows, sellers, link });
}
