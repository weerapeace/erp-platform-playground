/**
 * 👤 ประวัติลูกค้าหน้าเดียว : GET /api/website/customer-profile?shop=<slug>&customerId=<uuid> | &phone=<เบอร์>
 * → { member (สมาชิก หรือ null = แขก), summary (lib/website-customer-profile), orders, reviews, points, wishlist }
 * จับคู่: สมาชิกคนนั้น + ออเดอร์แขกที่ใช้เบอร์เดียวกัน (เทียบได้หลายรูปแบบเบอร์ · ค้น 2 ทางแล้วรวม) · สิทธิ์ products.view (เท่าแท็บสมาชิก/ออเดอร์)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardWebsite } from "@/lib/website-api-guard";
import { memberStats, readTiers } from "@/lib/member-points-db";
import { tierFor } from "@/lib/member-points";
import { phoneVariants, summarizeCustomer, type ProfileItemRow, type ProfileOrderRow } from "@/lib/website-customer-profile";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "@/lib/website-orders";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;
type Member = { id: string; name: string; email: string | null; phone: string | null; avatar_url: string | null; status: string; marketing_opt_in: boolean; created_at: string; last_login_at: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;
  const p = request.nextUrl.searchParams;
  const sb = supabaseAdmin();
  const shopRow = await shopBySlug(sb, p.get("shop"));
  if (!shopRow) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const shopId = shopRow.id;

  const MEMBER_SELECT = "id, name, email, phone, avatar_url, status, marketing_opt_in, created_at, last_login_at";
  let member: Member | null = null;
  const customerId = (p.get("customerId") ?? "").trim();
  if (customerId) {
    if (!UUID.test(customerId)) return NextResponse.json({ error: "รหัสลูกค้าไม่ถูกต้อง" }, { status: 400 });
    const { data } = await sb.from("store_customers").select(MEMBER_SELECT).eq("shop_id", shopId).eq("id", customerId).maybeSingle();
    member = (data as Member | null) ?? null;
  }
  let phones = phoneVariants(p.get("phone") ?? member?.phone);
  if (!member && phones.length) {
    const { data } = await sb.from("store_customers").select(MEMBER_SELECT).eq("shop_id", shopId).in("phone", phones).neq("status", "deleted").limit(1).maybeSingle();
    member = (data as Member | null) ?? null;
  }
  if (member?.phone) phones = [...new Set([...phones, ...phoneVariants(member.phone)])];
  if (!member && !phones.length) return NextResponse.json({ error: "ต้องระบุลูกค้า (สมาชิก หรือเบอร์โทร)" }, { status: 400 });

  // ออเดอร์: ของสมาชิกคนนี้ + ที่ใช้เบอร์เดียวกัน — ค้น 2 ทางแล้วรวม (ตัดซ้ำด้วย id)
  const ORDER_SELECT = "id, order_no, status, payment_status, grand_total, created_at, source, customer_name, ship_address_line, ship_subdistrict, ship_district, ship_province, ship_postal";
  const [byMember, byPhone] = await Promise.all([
    member ? sb.from("store_orders").select(ORDER_SELECT).eq("shop_id", shopId).eq("customer_id", member.id).order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
    phones.length ? sb.from("store_orders").select(ORDER_SELECT).eq("shop_id", shopId).in("customer_phone", phones).order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
  ]);
  if (byMember.error || byPhone.error) return NextResponse.json({ error: "โหลดออเดอร์ไม่สำเร็จ" }, { status: 500 });
  const orderMap = new Map<string, ProfileOrderRow>();
  for (const o of [...((byMember.data ?? []) as ProfileOrderRow[]), ...((byPhone.data ?? []) as ProfileOrderRow[])]) orderMap.set(o.id, o);
  const orders = [...orderMap.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 500);
  const ids = orders.map((o) => o.id);

  const items: (ProfileItemRow & { order_id: string })[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from("store_order_items").select("order_id, parent_code, name, qty").in("order_id", ids.slice(i, i + 200));
    items.push(...((data ?? []) as ProfileItemRow[]));
  }
  const itemCount = new Map<string, number>();
  for (const it of items) itemCount.set(it.order_id, (itemCount.get(it.order_id) ?? 0) + (Number(it.qty) || 0));

  // รีวิว: ของบัญชีนี้ + ที่มาจากออเดอร์ของคนนี้ (ค้น 2 ทาง แล้วรวม)
  const REVIEW_SELECT = "id, parent_code, product_name, rating, body, status, created_at";
  const [revByMember, revByOrder, wishRes, identsRes, statsMap, tiers] = await Promise.all([
    member ? sb.from("store_reviews").select(REVIEW_SELECT).eq("shop_id", shopId).eq("customer_id", member.id).order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
    ids.length ? sb.from("store_reviews").select(REVIEW_SELECT).eq("shop_id", shopId).in("order_id", ids.slice(0, 200)).order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
    member ? sb.from("store_wishlists").select("id", { count: "exact", head: true }).eq("customer_id", member.id) : Promise.resolve({ count: 0 }),
    member ? sb.from("store_customer_identities").select("provider").eq("customer_id", member.id) : Promise.resolve({ data: [] }),
    member ? memberStats(sb, [member.id]).catch(() => new Map()) : Promise.resolve(new Map()),
    member ? readTiers(sb, shopId).catch(() => []) : Promise.resolve([]),
  ]);
  type ReviewRow = { id: string; parent_code: string; product_name: string | null; rating: number; body: string; status: string; created_at: string };
  const reviewMap = new Map<string, ReviewRow>();
  for (const r of [...((revByMember.data ?? []) as ReviewRow[]), ...((revByOrder.data ?? []) as ReviewRow[])]) reviewMap.set(r.id, r);
  const reviews = [...reviewMap.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30);
  const st = member ? statsMap.get(member.id) : undefined;
  const tier = st ? tierFor(st.spend12m, tiers).tier : null;

  return NextResponse.json(
    {
      member: member
        ? {
            id: member.id,
            name: member.name,
            email: member.email,
            phone: member.phone ?? "",
            avatarUrl: member.avatar_url,
            status: member.status,
            marketingOptIn: member.marketing_opt_in,
            createdAt: member.created_at,
            lastLoginAt: member.last_login_at,
            providers: [...new Set(((identsRes.data ?? []) as { provider: string }[]).map((x) => x.provider))],
          }
        : null,
      phone: phones[0] ?? "",
      summary: summarizeCustomer(orders, items),
      orders: orders.slice(0, 100).map((o) => ({ id: o.id, orderNo: o.order_no, status: o.status, paymentStatus: o.payment_status, total: Number(o.grand_total) || 0, createdAt: o.created_at, source: o.source, qty: itemCount.get(o.id) ?? 0 })),
      reviews: reviews.map((r) => ({ id: r.id, code: r.parent_code, productName: r.product_name ?? r.parent_code, rating: r.rating, body: r.body, status: r.status, createdAt: r.created_at })),
      points: st ? { balance: st.balance, spend12m: st.spend12m, tier: tier ? { name: tier.name, color: tier.color } : null } : null,
      wishlist: (wishRes as { count?: number | null }).count ?? 0,
      // ชื่อ/สีสถานะชุดเดียวกับแท็บออเดอร์ (ไม่ให้หน้าเว็บ import lib ฝั่งเซิร์ฟเวอร์)
      statuses: ORDER_STATUSES,
      paymentStatuses: PAYMENT_STATUSES,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
