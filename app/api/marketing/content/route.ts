/**
 * แท็บ "คอนเทนต์" ของหน้าภาพรวมการตลาด — /api/marketing/content (สิทธิ์ marketing.dashboard.view)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-26 (แผนการตลาด รอบ 7 · แบบ A + ข้อ 2 โพสต์ FB/IG · 3 แอฟฟิลิเอต · 5 คู่แข่ง · 6 วิดีโอ Shopee)
 * GET ?from=&to=&brand_id=
 *   → posts (ช่วงที่เลือก · ถูกใจ/คอมเมนต์/แชร์) + postSummary · affiliate (สินค้าที่ขายผ่านแอฟฟิลิเอต · ค่าคอม) · competitors (คู่แข่ง + ราคาเรา) · sync
 * ข้อมูล: marketing_social_posts (เติมโดย /api/cron/marketing-content) · ค่าคอมแอฟฟิลิเอต = บรรทัด ams ใน raw.shopee_income (รอบ 2)
 *   · คู่แข่ง = marketing_competitors (แก้/ลบ/ย้อน ที่ /api/marketing/competitors) · สูตร = lib/marketing-content-calc
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";
import { r2ImageUrl } from "@/lib/r2-image";
import { countsAsSale } from "@/lib/platform-order-status";
import { loadOrderItems, loadPlatformOrders } from "@/lib/platform-sales-load";
import { bkkYmd, monthToDate, orderValue, shiftYmd, itemValueByOrder } from "@/lib/platform-dashboard-calc";
import { loadOrderIncome } from "@/lib/marketing-fees-server";
import { affiliateByProduct, engagementOf, postSummary, priceGap } from "@/lib/marketing-content-calc";
import { CONTENT_SYNC_KEY } from "@/lib/marketing-content-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const isYmd = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const bkkStart = (d: string) => new Date(Date.parse(`${d}T00:00:00+07:00`)).toISOString();
type Post = { platform: string; brand_id: string | null; post_id: string; message: string | null; permalink: string | null; media_type: string | null; image_url: string | null; posted_at: string | null; likes: number; comments: number; shares: number; views: number | null };
type Item = { order_id: string; qty: number | null; price: number | null; matched_parent_sku_id: string | null; sku_code: string | null; name: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "marketing.dashboard.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();
  const today = bkkYmd(Date.now()) as string;
  const brandId = (sp.get("brand_id") ?? "").trim() || null;
  let from = (sp.get("from") ?? "").trim(); let to = (sp.get("to") ?? "").trim();
  if (!isYmd(from)) from = monthToDate(today).from;
  if (!isYmd(to) || to > today) to = today;
  if (from > to) from = to;

  try {
    const [{ data: pf }, { data: br }, { data: sync }] = await Promise.all([
      admin.from("erp_platforms").select("id").eq("code", "shopee").maybeSingle(),
      admin.from("brands").select("id, name"),
      admin.from("ui_config").select("value").eq("key", CONTENT_SYNC_KEY).maybeSingle(),
    ]);
    const spId = (pf as { id?: string } | null)?.id ?? null;
    const brandName = new Map(((br ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));

    // ── โพสต์ ──
    const posts = (await fetchAllPages<Post>((a, b) => {
      let q = admin.from("marketing_social_posts").select("platform, brand_id, post_id, message, permalink, media_type, image_url, posted_at, likes, comments, shares, views")
        .gte("posted_at", bkkStart(from)).lt("posted_at", bkkStart(shiftYmd(to, 1)));
      if (brandId) q = q.or(`brand_id.eq.${brandId},brand_id.is.null`);
      return q.order("posted_at", { ascending: false }).range(a, b);
    })).map((p) => ({ ...p, likes: Number(p.likes) || 0, comments: Number(p.comments) || 0, shares: Number(p.shares) || 0, engagement: engagementOf(p), brand_name: p.brand_id ? brandName.get(p.brand_id) ?? "" : "" }));
    const summary = postSummary(posts);

    // ── แอฟฟิลิเอต (Shopee: ออเดอร์ที่มีค่าคอม ams) ──
    const orders = spId ? (await loadPlatformOrders(admin, { platformId: spId, brandId, fromYmd: from, toYmd: to })).filter(countsAsSale) : [];
    const incomes = await loadOrderIncome(admin, orders.map((o) => o.id));
    const amsByOrder = new Map<string, number>();
    for (const [id, inc] of incomes) { const a = -(inc.lines?.find((l) => l.key === "ams")?.amount ?? 0); if (a > 0) amsByOrder.set(id, a); }
    const affIds = [...amsByOrder.keys()];
    const items: Item[] = [];
    for (let i = 0; i < affIds.length; i += 200) {
      items.push(...await fetchAllPages<Item>((a, b) => admin.from("platform_order_items").select("order_id, qty, price, matched_parent_sku_id, sku_code, name").in("order_id", affIds.slice(i, i + 200)).order("id", { ascending: true }).range(a, b)));
    }
    const productKey = (it: Item) => it.matched_parent_sku_id || (it.sku_code ? `code:${it.sku_code.replace(/-\d{1,3}$/, "")}` : `name:${it.name ?? "?"}`);
    const aff = affiliateByProduct(items.map((it) => ({ order_id: it.order_id, product: productKey(it), value: (Number(it.qty) || 0) * (Number(it.price) || 0) })), amsByOrder).slice(0, 50);
    const parentIds = aff.map((a) => a.product).filter((k) => !k.includes(":"));
    const parentInfo = new Map<string, { code: string; name: string; image: string | null }>();
    for (let i = 0; i < parentIds.length; i += 200) {
      const { data } = await admin.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key").in("id", parentIds.slice(i, i + 200));
      for (const p of (data ?? []) as { id: string; code: string | null; name_th: string | null; cover_image_r2_key: string | null }[]) parentInfo.set(p.id, { code: p.code ?? "", name: p.name_th ?? "", image: r2ImageUrl(p.cover_image_r2_key, 120) });
    }
    const label = (k: string) => parentInfo.get(k) ?? { code: k.startsWith("code:") ? k.slice(5) : "", name: k.replace(/^(code|name):/, ""), image: null };
    const valBy = itemValueByOrder(items.map((it) => ({ ...it, matched_sku_id: null })));
    const allVal = itemValueByOrder(await loadOrderItems(admin, orders.map((o) => o.id)));
    const shopSales = orders.reduce((s, o) => s + orderValue(o, allVal), 0);
    const affSales = affIds.reduce((s, id) => s + (valBy.get(id) ?? 0), 0);
    const affCommission = [...amsByOrder.values()].reduce((s, a) => s + a, 0);
    const affiliate = {
      orders: affIds.length, sales: affSales, commission: affCommission, rate: affSales > 0 ? affCommission / affSales : null,
      incomeOrders: incomes.size, totalOrders: orders.length, shopTotal: shopSales,
      products: aff.map((a) => ({ ...a, info: label(a.product) })),
    };

    // ── คู่แข่ง ──
    type Comp = { id: string; brand_id: string | null; platform: string | null; shop_name: string | null; product_name: string; url: string | null; price: number | null; rating: number | null; sold: number | null; our_parent_sku_id: string | null; note: string | null; history: unknown; is_active: boolean; updated_at: string };
    let cq = admin.from("marketing_competitors").select("id, brand_id, platform, shop_name, product_name, url, price, rating, sold, our_parent_sku_id, note, history, is_active, updated_at").order("updated_at", { ascending: false }).limit(300);
    if (brandId) cq = cq.or(`brand_id.eq.${brandId},brand_id.is.null`);
    const { data: comps } = await cq;
    const compRows = (comps ?? []) as Comp[];
    const ourIds = [...new Set(compRows.map((c) => c.our_parent_sku_id).filter((x): x is string => !!x))];
    const ours = new Map<string, { code: string; name: string; price: number | null; image: string | null }>();
    for (let i = 0; i < ourIds.length; i += 200) {
      const { data } = await admin.from("parent_skus_v2").select("id, code, name_th, sale_price, final_price, cover_image_r2_key").in("id", ourIds.slice(i, i + 200));
      for (const p of (data ?? []) as { id: string; code: string | null; name_th: string | null; sale_price: number | null; final_price: number | null; cover_image_r2_key: string | null }[]) {
        const price = Number(p.sale_price) || Number(p.final_price) || null;
        ours.set(p.id, { code: p.code ?? "", name: p.name_th ?? "", price, image: r2ImageUrl(p.cover_image_r2_key, 120) });
      }
    }
    const competitors = compRows.map((c) => {
      const o = c.our_parent_sku_id ? ours.get(c.our_parent_sku_id) ?? null : null;
      return { ...c, price: c.price == null ? null : Number(c.price), rating: c.rating == null ? null : Number(c.rating), sold: c.sold == null ? null : Number(c.sold), brand_name: c.brand_id ? brandName.get(c.brand_id) ?? "" : "", ours: o, gap: priceGap(o?.price ?? null, c.price == null ? null : Number(c.price)) };
    });

    const notes = [
      "โพสต์ Facebook/Instagram ใช้การเชื่อมเพจเดิม — ได้ถูกใจ/คอมเมนต์/แชร์ · ยอดคนเห็น (reach) ต้องขอสิทธิ์ Meta เพิ่ม",
      `แอฟฟิลิเอต = ออเดอร์ Shopee ที่มีค่าคอมแอฟฟิลิเอต (คิดจาก ${incomes.size.toLocaleString("th-TH")}/${orders.length.toLocaleString("th-TH")} ใบที่ดึงรายได้แล้ว)`,
    ];
    return NextResponse.json({ range: { from, to }, posts, summary, affiliate, competitors, brands: [...brandName.entries()].map(([id, name]) => ({ id, name })), sync: (sync as { value?: unknown } | null)?.value ?? null, notes, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/marketing/content]", e);
    return NextResponse.json({ error: "โหลดข้อมูลคอนเทนต์ไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
  }
}
