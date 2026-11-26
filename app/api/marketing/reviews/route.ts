/**
 * แท็บ "รีวิว" ของหน้าภาพรวมการตลาด — /api/marketing/reviews (สิทธิ์ marketing.dashboard.view)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-26 (แผนการตลาด รอบ 7 · แบบ A + ข้อ 1 รีวิว Shopee + รีวิวแย่ที่ยังไม่ตอบ)
 * GET ?from=&to=&brand_id= → kpi · lowOpen (1–3 ดาว ยังไม่ตอบ) · byItem · reviews (ตาราง) · sync (สถานะดึงล่าสุด)
 * ชื่อผู้รีวิว: เห็นเฉพาะสิทธิ์ platform_orders.view — คนอื่นได้รหัสแทน · ข้อมูล = marketing_reviews (เติมโดย /api/cron/marketing-content)
 * สูตร = lib/marketing-content-calc · อ่านอย่างเดียว (ตอบรีวิวต้องตอบในแอป Shopee)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";
import { r2ImageUrl } from "@/lib/r2-image";
import { bkkYmd, monthToDate, shiftYmd } from "@/lib/platform-dashboard-calc";
import { maskedName } from "@/lib/marketing-customers-calc";
import { reviewSummary, reviewsByItem } from "@/lib/marketing-content-calc";
import { CONTENT_SYNC_KEY } from "@/lib/marketing-content-server";
import { loadListingNames } from "@/lib/marketing-traffic-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const isYmd = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const bkkStart = (d: string) => new Date(Date.parse(`${d}T00:00:00+07:00`)).toISOString();
type Row = { comment_id: string; brand_id: string | null; item_id: string | null; order_sn: string | null; rating: number | null; comment: string | null; buyer: string | null; images: unknown; hidden: boolean; created_at_shop: string | null; reply: string | null; replied_at: string | null };

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
    const namesVisible = await apiCan(request, "platform_orders.view");
    const rows = await fetchAllPages<Row>((a, b) => {
      let q = admin.from("marketing_reviews").select("comment_id, brand_id, item_id, order_sn, rating, comment, buyer, images, hidden, created_at_shop, reply, replied_at")
        .eq("platform", "shopee").gte("created_at_shop", bkkStart(from)).lt("created_at_shop", bkkStart(shiftYmd(to, 1)));
      if (brandId) q = q.eq("brand_id", brandId);
      return q.order("created_at_shop", { ascending: false }).range(a, b);
    });
    const [{ data: sync }, { data: oldest }] = await Promise.all([
      admin.from("ui_config").select("value").eq("key", CONTENT_SYNC_KEY).maybeSingle(),
      admin.from("marketing_reviews").select("created_at_shop").eq("platform", "shopee").order("created_at_shop", { ascending: true }).limit(1).maybeSingle(),
    ]);

    // ชื่อสินค้า + รูปรุ่น
    const itemIds = [...new Set(rows.map((r) => r.item_id).filter((x): x is string => !!x))];
    const names = await loadListingNames(admin, itemIds);
    const parentIds = [...new Set([...names.values()].map((x) => x.parentId).filter((x): x is string => !!x))];
    const parentInfo = new Map<string, { code: string; image: string | null }>();
    for (let i = 0; i < parentIds.length; i += 200) {
      const { data } = await admin.from("parent_skus_v2").select("id, code, cover_image_r2_key").in("id", parentIds.slice(i, i + 200));
      for (const p of (data ?? []) as { id: string; code: string | null; cover_image_r2_key: string | null }[]) parentInfo.set(p.id, { code: p.code ?? "", image: r2ImageUrl(p.cover_image_r2_key, 120) });
    }
    const product = (id: string | null) => {
      const nm = id ? names.get(id) : undefined; const p = nm?.parentId ? parentInfo.get(nm.parentId) : undefined;
      return { title: nm?.title || (id ? `สินค้า ${id}` : "—"), code: p?.code ?? "", image: p?.image ?? null };
    };

    const out = rows.map((r) => ({
      ...r, buyer: r.buyer ? (namesVisible ? r.buyer : maskedName(`shopee|${r.buyer}`)) : null,
      ...product(r.item_id), photos: Array.isArray(r.images) ? (r.images as string[]).length : 0,
    }));
    const kpi = reviewSummary(rows);
    const lowOpen = out.filter((r) => !r.reply && r.rating != null && r.rating <= 3).slice(0, 50);
    const byItem = reviewsByItem(rows).slice(0, 50).map((b) => ({ ...b, ...product(b.item_id) }));

    const notes = [
      "Shopee ให้ดึงรีวิวล่าสุดได้สูงสุด 500 รีวิวต่อร้านต่อรอบ — ระบบดึงวันละ 2 รอบและเก็บสะสมไว้ ยิ่งนานยิ่งครบ",
      "ตอบรีวิวต้องตอบในแอป/Seller Centre ของ Shopee — หลังตอบ รอบดึงถัดไปจะขึ้นว่าตอบแล้ว",
    ];
    if (!namesVisible) notes.push("คุณไม่มีสิทธิ์ดูออเดอร์ — ชื่อผู้รีวิวแสดงเป็นรหัสแทน");

    return NextResponse.json({
      range: { from, to }, kpi, lowOpen, byItem, reviews: out, namesVisible,
      sync: (sync as { value?: unknown } | null)?.value ?? null, dataStart: (oldest as { created_at_shop?: string } | null)?.created_at_shop ?? null, notes, error: null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/marketing/reviews]", e);
    return NextResponse.json({ error: "โหลดข้อมูลรีวิวไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
  }
}
