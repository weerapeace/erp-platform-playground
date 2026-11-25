/**
 * แท็บ "ลูกค้า" ของหน้าภาพรวมการตลาด — /api/marketing/customers (สิทธิ์ marketing.dashboard.view)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-25 (แผนการตลาด รอบ 5 · แบบ A + ข้อ 1 กลุ่มลูกค้า · 2 ซื้อคู่กัน · 3 สินค้าที่ทำให้กลับมาซื้อ · 4 ตาราง+ส่งออกรายชื่อ)
 * GET ?from=&to=&platform_id=&brand_id=
 *   → kpi (ลูกค้าในช่วง · ใหม่/กลับมา · ซื้อซ้ำ · ยอดต่อคน · ยอดจากลูกค้าเก่า) · weekly (ใหม่ vs กลับมา) · segments · customers (ตาราง)
 *     · pairs (ซื้อคู่กัน · ใช้ทุกออเดอร์ในช่วง รวมใบจากอีเมล) · firstProducts · dataStart · namesVisible
 * ชื่อลูกค้า: เห็นเฉพาะคนมีสิทธิ์ platform_orders.view — คนอื่นได้รหัสลูกค้าแทน (ส่งออก Excel ก็เป็นรหัส)
 * ตัวตน = ช่องทาง + แบรนด์ + ชื่อบัญชีผู้ซื้อ (ออเดอร์ที่ดึงผ่าน API) · ยอด = มูลค่าสินค้า (lib/platform-dashboard-calc) · สูตร = lib/marketing-customers-calc
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";
import { r2ImageUrl } from "@/lib/r2-image";
import { countsAsSale } from "@/lib/platform-order-status";
import { loadPlatformOrders, type SalesOrderLite } from "@/lib/platform-sales-load";
import { bkkYmd, monthToDate, shiftYmd } from "@/lib/platform-dashboard-calc";
import { SEGMENTS, buildCustomers, customerKey, firstProductRepeat, maskedName, productPairs, rangeStats, segmentOf, type CustOrder, type Segment } from "@/lib/marketing-customers-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const isYmd = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
type Admin = ReturnType<typeof supabaseAdmin>;
type Item = { order_id: string; qty: number | null; price: number | null; matched_parent_sku_id: string | null; sku_code: string | null; name: string | null };
type NamedOrder = SalesOrderLite & { brand_id: string | null; customer_name: string | null };

async function loadItems(admin: Admin, ids: readonly string[]): Promise<Item[]> {
  const out: Item[] = [];
  const uniq = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += 200) chunks.push(uniq.slice(i, i + 200));
  for (let i = 0; i < chunks.length; i += 4) {
    const got = await Promise.all(chunks.slice(i, i + 4).map((part) => fetchAllPages<Item>((a, b) =>
      admin.from("platform_order_items").select("order_id, qty, price, matched_parent_sku_id, sku_code, name").in("order_id", part).order("id", { ascending: true }).range(a, b))));
    for (const g of got) out.push(...g);
  }
  return out;
}
/** รหัสสินค้าที่ยังไม่จับคู่รุ่น → ตัดรหัสสีท้าย (-01) แล้วหารุ่นจากรหัส (กันคู่เดียวกันโผล่ 2 แถว) */
const baseCode = (code: string) => code.trim().toUpperCase().replace(/-\d{1,3}$/, "");
async function parentByCode(admin: Admin, items: readonly Item[]): Promise<Map<string, string>> {
  const codes = [...new Set(items.filter((it) => !it.matched_parent_sku_id && it.sku_code).map((it) => baseCode(it.sku_code as string)))];
  const out = new Map<string, string>();
  for (let i = 0; i < codes.length; i += 200) {
    const { data } = await admin.from("parent_skus_v2").select("id, code").in("code", codes.slice(i, i + 200));
    for (const p of (data ?? []) as { id: string; code: string }[]) out.set(String(p.code).toUpperCase(), p.id);
  }
  return out;
}
const productKeyFn = (byCode: Map<string, string>) => (it: Item) =>
  it.matched_parent_sku_id || (it.sku_code ? byCode.get(baseCode(it.sku_code)) ?? `code:${baseCode(it.sku_code)}` : `name:${it.name ?? "?"}`);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "marketing.dashboard.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();
  const today = bkkYmd(Date.now()) as string;
  const platformId = (sp.get("platform_id") ?? "").trim() || null;
  const brandId = (sp.get("brand_id") ?? "").trim() || null;
  let from = (sp.get("from") ?? "").trim(); let to = (sp.get("to") ?? "").trim();
  if (!isYmd(from)) from = monthToDate(today).from;
  if (!isYmd(to) || to > today) to = today;
  if (from > to) from = to;

  try {
    const namesVisible = await apiCan(request, "platform_orders.view");
    const [{ data: pf }, { data: br }] = await Promise.all([
      admin.from("erp_platforms").select("id, code, name_th"),
      admin.from("brands").select("id, name"),
    ]);
    const pfById = new Map(((pf ?? []) as { id: string; code: string; name_th: string | null }[]).map((p) => [p.id, p]));
    const brandName = new Map(((br ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));

    // ── ออเดอร์ที่มีชื่อผู้ซื้อ (ทั้งหมด · ต้องรู้ "ซื้อครั้งแรก" ของแต่ละคน) ──
    const named = (await fetchAllPages<NamedOrder>((a, b) => {
      let q = admin.from("platform_orders").select("id, platform_id, brand_id, customer_name, status, platform_status, source, total, ordered_at").not("customer_name", "is", null).lte("ordered_at", new Date(Date.parse(`${shiftYmd(to, 1)}T00:00:00+07:00`)).toISOString());
      if (platformId) q = q.eq("platform_id", platformId);
      if (brandId) q = q.eq("brand_id", brandId);
      return q.order("id", { ascending: true }).range(a, b);
    })).filter((o) => countsAsSale(o) && (o.customer_name ?? "").trim());
    const namedItems = await loadItems(admin, named.map((o) => o.id));
    const valByOrder = new Map<string, number>();
    for (const it of namedItems) valByOrder.set(it.order_id, (valByOrder.get(it.order_id) ?? 0) + (Number(it.qty) || 0) * (Number(it.price) || 0));
    const custOrders: CustOrder[] = named.map((o) => {
      const code = pfById.get(o.platform_id ?? "")?.code ?? "other";
      const name = (o.customer_name as string).trim();
      return { id: o.id, key: customerKey(code, o.brand_id, name), platform: code, brand_id: o.brand_id, name, date: bkkYmd(o.ordered_at ?? null) ?? "", value: valByOrder.has(o.id) ? (valByOrder.get(o.id) as number) : Number(o.total) || 0 };
    }).filter((o) => o.date);
    const customers = buildCustomers(custOrders);
    // วันเริ่มข้อมูล = วันแรกที่มีออเดอร์ที่มีชื่อผู้ซื้อ ≥ 5 ใบ (กันออเดอร์เก่าโดด ๆ ใบเดียว)
    const perDay = new Map<string, number>(); for (const o of custOrders) perDay.set(o.date, (perDay.get(o.date) ?? 0) + 1);
    const dataStart = [...perDay.entries()].filter(([, n]) => n >= 5).map(([d]) => d).sort()[0] ?? custOrders.reduce((m, o) => (!m || o.date < m ? o.date : m), "");
    const stats = rangeStats(custOrders, customers, from, to);

    // ── รายสัปดาห์: ลูกค้าใหม่ vs กลับมา (ในช่วง) ──
    const firstOf = new Map(customers.map((c) => [c.key, c.first]));
    const weekOf = (d: string) => { const t = new Date(`${d}T00:00:00Z`); const dow = (t.getUTCDay() + 6) % 7; return shiftYmd(d, -dow); };
    const wk = new Map<string, { week: string; newC: Set<string>; retC: Set<string> }>();
    for (const o of custOrders) {
      if (o.date < from || o.date > to) continue;
      const w = weekOf(o.date);
      const g = wk.get(w) ?? { week: w, newC: new Set(), retC: new Set() };
      ((firstOf.get(o.key) ?? o.date) >= w ? g.newC : g.retC).add(o.key);
      wk.set(w, g);
    }
    const weekly = [...wk.values()].sort((a, b) => a.week.localeCompare(b.week)).map((g) => ({ week: g.week, newCustomers: g.newC.size, returning: g.retC.size }));

    // ── กลุ่มลูกค้า (ณ วันนี้ · ลูกค้าทั้งหมดที่รู้จัก) ──
    const segOf = new Map(customers.map((c) => [c.key, segmentOf(c, today)]));
    const segments = (Object.keys(SEGMENTS) as Segment[]).map((s) => {
      const cs = customers.filter((c) => segOf.get(c.key) === s);
      return { key: s, ...SEGMENTS[s], customers: cs.length, spend: cs.reduce((a, c) => a + c.spend, 0) };
    });

    // ── ซื้อคู่กัน: ทุกออเดอร์ในช่วง (รวมใบจากอีเมล) — โหลดก่อนเพื่อใช้ตัวแปลงรหัสร่วมกัน ──
    const rangeOrders = (await loadPlatformOrders(admin, { platformId, brandId, fromYmd: from, toYmd: to })).filter(countsAsSale);
    const rangeItems = await loadItems(admin, rangeOrders.map((o) => o.id));
    const productOf = productKeyFn(await parentByCode(admin, [...namedItems, ...rangeItems]));

    // ── สินค้าชิ้นแรก → กลับมาซื้อ ──
    const orderDate = new Map(custOrders.map((o) => [o.id, o.date]));
    const itemsByOrder = new Map<string, Item[]>();
    for (const it of namedItems) { const a = itemsByOrder.get(it.order_id) ?? []; a.push(it); itemsByOrder.set(it.order_id, a); }
    const firstProducts = new Map<string, string[]>();
    for (const c of customers) {
      const firstOrder = c.orderIds.filter((id) => orderDate.get(id) === c.first)[0];
      firstProducts.set(c.key, (itemsByOrder.get(firstOrder) ?? []).map(productOf));
    }
    const fpr = firstProductRepeat(customers, firstProducts, today).slice(0, 30);

    const pairs = productPairs(rangeItems.map((it) => ({ order_id: it.order_id, product: productOf(it) })));
    const multiOrders = (() => { const m = new Map<string, Set<string>>(); for (const it of rangeItems) { const s = m.get(it.order_id) ?? new Set(); s.add(productOf(it)); m.set(it.order_id, s); } return [...m.values()].filter((s) => s.size >= 2).length; })();

    // ── ชื่อรุ่น / รูป ──
    const parentIds = [...new Set([...pairs.flatMap((p) => [p.a, p.b]), ...fpr.map((f) => f.product)].filter((k) => !k.includes(":")))];
    const parentInfo = new Map<string, { code: string; name: string; image: string | null }>();
    for (let i = 0; i < parentIds.length; i += 200) {
      const { data } = await admin.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key").in("id", parentIds.slice(i, i + 200));
      for (const p of (data ?? []) as { id: string; code: string | null; name_th: string | null; cover_image_r2_key: string | null }[]) parentInfo.set(p.id, { code: p.code ?? "", name: p.name_th ?? "", image: r2ImageUrl(p.cover_image_r2_key, 120) });
    }
    const label = (k: string) => { const p = parentInfo.get(k); if (p) return { code: p.code, name: p.name, image: p.image }; const raw = k.replace(/^(code|name):/, ""); return { code: k.startsWith("code:") ? raw : "", name: raw, image: null }; };

    const rows = customers.map((c) => ({
      key: c.key, name: namesVisible ? c.name : maskedName(c.key), platform: c.platform, platform_name: [...pfById.values()].find((p) => p.code === c.platform)?.name_th ?? c.platform,
      brand_name: c.brand_id ? brandName.get(c.brand_id) ?? "" : "", orders: c.orders, visits: c.visits, spend: c.spend, aov: c.orders ? c.spend / c.orders : 0,
      first: c.first, last: c.last, daysSince: Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${c.last}T00:00:00Z`)) / 86_400_000), segment: segOf.get(c.key) as Segment,
    })).sort((a, b) => b.spend - a.spend);

    const notes = [
      `ข้อมูลลูกค้าเริ่ม ${dataStart || "—"} (ออเดอร์ที่ดึงผ่านระบบ) · ใบที่มาทางอีเมลไม่มีชื่อผู้ซื้อ จึงไม่นับเรื่องลูกค้า แต่นับใน "ซื้อคู่กัน"`,
      "ลูกค้าคนเดียวกันที่ซื้อคนละช่องทาง/คนละร้าน นับเป็นคนละคน (ไม่มีเบอร์/อีเมลให้จับคู่)",
      "กลุ่มลูกค้าคิด ณ วันนี้ จากประวัติทั้งหมด (ไม่ขึ้นกับช่วงวันที่ที่เลือก)",
    ];
    if (!namesVisible) notes.push("คุณไม่มีสิทธิ์ดูออเดอร์ — ชื่อลูกค้าแสดงเป็นรหัสแทน");

    return NextResponse.json({
      range: { from, to }, dataStart, namesVisible,
      kpi: stats, weekly, segments, customers: rows,
      pairs: pairs.map((p) => ({ ...p, aInfo: label(p.a), bInfo: label(p.b) })), multiOrders, rangeOrders: rangeOrders.length,
      firstProducts: fpr.map((f) => ({ ...f, info: label(f.product) })), notes, error: null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/marketing/customers]", e);
    return NextResponse.json({ error: "โหลดข้อมูลลูกค้าไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
  }
}
