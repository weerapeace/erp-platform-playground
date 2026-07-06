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

  // SKU ลูก (นับ + ดึงบางส่วนไปคิดสต๊อก)
  const { data: skus } = await a.from("skus_v2").select("id, code, is_active").eq("parent_sku_id", id);
  const skuRows = (skus ?? []) as { id: string; code: string; is_active: boolean }[];
  const skuIds = skuRows.map((s) => s.id);

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

  return NextResponse.json({
    skus: { total: skuRows.length, active: skuRows.filter((s) => s.is_active).length },
    stockOnHand,
    platforms: { drafts: draftsTotal, published: draftsPublished, matched: matchedTotal, chips: platformChips },
    store: { listings: storeTotal },
    creative: { tasks: tasksTotal + linkedTasks, content: contentTotal, projects: projectSkusTotal, boards: boardItemsTotal },
    error: null,
  });
}
