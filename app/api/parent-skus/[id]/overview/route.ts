/**
 * /api/parent-skus/[id]/overview — "ภาพรวม 360°" ของ Parent SKU
 *   รวมทุกด้านของสินค้า: SKU ลูก · ลงขายแพลตฟอร์ม · เว็บร้าน · คอนเทนต์/งาน · สต๊อก · ถูกใช้ที่ไหน
 *   ใช้ในแท็บ "📊 ภาพรวม" ของ Parent SKU · guardApi products.view
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const cnt = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ต้องมี id" }, { status: 400 });
  const a = supabaseAdmin();

  // SKU ลูก (นับ + ดึงบางส่วนไปคิดสต๊อก) + รหัส parent (ไว้ match ยอดขาย)
  const [{ data: skus }, { data: pRow }] = await Promise.all([
    a.from("skus_v2").select("id, code, is_active").eq("parent_sku_id", id),
    a.from("parent_skus_v2").select("code").eq("id", id).maybeSingle(),
  ]);
  const skuRows = (skus ?? []) as { id: string; code: string; is_active: boolean }[];
  const skuIds = skuRows.map((s) => s.id);
  const parentCode = (pRow as { code?: string } | null)?.code ?? "";
  const allCodes = [...new Set([parentCode, ...skuRows.map((s) => s.code)].filter(Boolean))];

  const [
    draftsTotal, draftsPublished, matchedTotal, storeTotal,
    tasksTotal, contentTotal, projectSkusTotal, boardItemsTotal,
  ] = await Promise.all([
    cnt(a.from("platform_listing_drafts").select("id", { count: "exact", head: true }).eq("parent_sku_id", id)),
    cnt(a.from("platform_listing_drafts").select("id", { count: "exact", head: true }).eq("parent_sku_id", id).eq("status", "published")),
    cnt(a.from("platform_catalog_listings").select("id", { count: "exact", head: true }).eq("matched_parent_sku_id", id)),
    cnt(a.from("store_listings").select("id", { count: "exact", head: true }).eq("parent_sku_id", id)),
    cnt(a.from("erp_creative_tasks").select("id", { count: "exact", head: true }).eq("parent_sku_id", id)),
    cnt(a.from("erp_creative_content").select("id", { count: "exact", head: true }).eq("parent_sku_id", id)),
    cnt(a.from("erp_creative_project_skus").select("id", { count: "exact", head: true }).eq("parent_sku_id", id)),
    cnt(a.from("erp_creative_board_items").select("id", { count: "exact", head: true }).eq("parent_sku_id", id)),
  ]);

  // งานที่ผูกผ่านตารางเชื่อม (erp_creative_task_parent_skus) — งานที่แท็ก parent นี้
  const linkedTasks = await cnt(a.from("erp_creative_task_parent_skus").select("task_id", { count: "exact", head: true }).eq("parent_sku_id", id));

  // สต๊อกรวมของ SKU ลูก (จาก sku_stock_balances ถ้ามี)
  let stockOnHand = 0;
  if (skuIds.length) {
    const { data: bal } = await a.from("sku_stock_balances").select("qty_on_hand").in("sku_id", skuIds);
    for (const b of ((bal ?? []) as { qty_on_hand: number | null }[])) stockOnHand += Number(b.qty_on_hand ?? 0);
  }

  // แพลตฟอร์มที่ลงขายจริง (ชื่อร้าน) — เอาไปโชว์ชิป
  const { data: activeDrafts } = await a.from("platform_listing_drafts")
    .select("platform_id, status, last_sync_status").eq("parent_sku_id", id);
  const platformIds = [...new Set(((activeDrafts ?? []) as { platform_id: string }[]).map((d) => d.platform_id))];
  let platformChips: { id: string; name_th: string; code: string; icon_key: string | null; live: boolean }[] = [];
  if (platformIds.length) {
    const { data: pf } = await a.from("erp_platforms").select("id, name_th, code, icon_key").in("id", platformIds);
    const liveSet = new Set(((activeDrafts ?? []) as { platform_id: string; status: string | null; last_sync_status: string | null }[])
      .filter((d) => d.status === "published" || d.last_sync_status === "success").map((d) => d.platform_id));
    platformChips = ((pf ?? []) as { id: string; name_th: string; code: string; icon_key: string | null }[])
      .map((p) => ({ ...p, live: liveSet.has(p.id) }));
  }

  // ยอดขายรายวัน — รวม 2 แหล่ง: (1) ออเดอร์จริงที่นำเข้า (platform_order_items) (2) ยอดนำเข้า Marketing
  const salesByDay: Record<string, { sales: number; units: number }> = {};
  let salesTotal = 0, unitsTotal = 0;
  const addSale = (date: string, sales: number, units: number) => {
    const d = String(date).slice(0, 10); if (!d) return;
    if (!salesByDay[d]) salesByDay[d] = { sales: 0, units: 0 };
    salesByDay[d].sales += sales; salesByDay[d].units += units;
    salesTotal += sales; unitsTotal += units;
  };
  // (1) ออเดอร์จริง — order item ที่จับคู่ SKU ลูกนี้ → join วันที่สั่งซื้อ (platform_orders.ordered_at)
  if (skuIds.length) {
    const { data: oi } = await a.from("platform_order_items").select("order_id, qty, price").in("matched_sku_id", skuIds);
    const items = (oi ?? []) as { order_id: string; qty: number | null; price: number | null }[];
    if (items.length) {
      const orderIds = [...new Set(items.map((x) => x.order_id))];
      const dateById = new Map<string, string>();
      for (let i = 0; i < orderIds.length; i += 300) {
        const { data: ord } = await a.from("platform_orders").select("id, ordered_at").in("id", orderIds.slice(i, i + 300));
        for (const o of ((ord ?? []) as { id: string; ordered_at: string | null }[])) if (o.ordered_at) dateById.set(o.id, o.ordered_at);
      }
      for (const it of items) { const d = dateById.get(it.order_id); if (d) addSale(d, Number(it.qty ?? 0) * Number(it.price ?? 0), Number(it.qty ?? 0)); }
    }
  }
  // (2) ยอดนำเข้า Marketing (marketing_product_daily) match ด้วยรหัสสินค้า
  if (allCodes.length) {
    const { data: md } = await a.from("marketing_product_daily").select("date, sales, units, internal_sku").in("internal_sku", allCodes);
    for (const r of ((md ?? []) as { date: string; sales: number | null; units: number | null }[])) addSale(r.date, Number(r.sales ?? 0), Number(r.units ?? 0));
  }
  const salesDays = Object.entries(salesByDay).map(([date, v]) => ({ date, ...v })).sort((x, y) => x.date.localeCompare(y.date)).slice(-30);

  return NextResponse.json({
    skus: { total: skuRows.length, active: skuRows.filter((s) => s.is_active).length },
    stockOnHand,
    sales: { hasData: salesDays.length > 0, total: salesTotal, units: unitsTotal, days: salesDays },
    parentCode,
    platforms: { drafts: draftsTotal, published: draftsPublished, matched: matchedTotal, chips: platformChips },
    store: { listings: storeTotal },
    creative: { tasks: tasksTotal + linkedTasks, content: contentTotal, projects: projectSkusTotal, boards: boardItemsTotal },
    error: null,
  });
}
