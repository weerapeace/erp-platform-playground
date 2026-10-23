/**
 * ⭐ ตรวจรีวิวสินค้า (ERP แท็บ ⭐ รีวิว) : /api/website/reviews
 * GET   ?shop=<slug>&status=pending|approved|hidden|all  → { reviews, counts }
 * PATCH { id, shopId, action: "approve"|"hide"|"pending"|"reply"|"delete", text? } → { ok, review, points }
 * สิทธิ์: ดู = products.view · ตรวจ/ตอบ/ลบ = products.edit · ทุกการเปลี่ยนลง audit (lib/website-reviews-server moderateReview)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { readSiteInfo } from "@/lib/website-site-info";
import { moderateReview, type ModerateAction, type ReviewRow } from "@/lib/website-reviews-server";
import type { ReviewStatus } from "@/lib/website-reviews";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUSES: ReviewStatus[] = ["pending", "approved", "hidden"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const slug = (request.nextUrl.searchParams.get("shop") ?? "").trim();
  const status = request.nextUrl.searchParams.get("status") ?? "pending";
  const sb = supabaseAdmin();
  const shop = await shopBySlug(sb, slug);
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const shopId = (shop as { id: string }).id;
  let q = sb.from("store_reviews").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(300);
  if ((STATUSES as string[]).includes(status)) q = q.eq("status", status);
  const [{ data, error }, { data: all }] = await Promise.all([q, sb.from("store_reviews").select("status").eq("shop_id", shopId).limit(20000)]);
  if (error) return NextResponse.json({ error: "โหลดรีวิวไม่สำเร็จ" }, { status: 500 });
  const rows = (data ?? []) as ReviewRow[];
  const counts: Record<string, number> = { pending: 0, approved: 0, hidden: 0 };
  for (const r of (all ?? []) as { status: string }[]) counts[r.status] = (counts[r.status] ?? 0) + 1;
  // เลขออเดอร์ (ให้พนักงานเปิดดูได้) — ไม่ส่งเบอร์/ที่อยู่
  const orderIds = [...new Set(rows.map((r) => r.order_id).filter(Boolean))] as string[];
  const orderNo = new Map<string, string>();
  if (orderIds.length) {
    const { data: os } = await sb.from("store_orders").select("id, order_no").in("id", orderIds);
    for (const o of (os ?? []) as { id: string; order_no: string }[]) orderNo.set(o.id, o.order_no);
  }
  return NextResponse.json(
    { reviews: rows.map((r) => ({ ...r, order_no: r.order_id ? orderNo.get(r.order_id) ?? null : null })), counts },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const id = String(body.id ?? "");
  const shopId = String(body.shopId ?? "");
  const kind = String(body.action ?? "");
  if (!id || !shopId) return NextResponse.json({ error: "ต้องระบุรีวิวและร้าน" }, { status: 400 });
  let action: ModerateAction;
  if (kind === "reply") action = { kind: "reply", text: String(body.text ?? "") };
  else if (kind === "approve" || kind === "hide" || kind === "pending" || kind === "delete") action = { kind };
  else return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });

  const sb = supabaseAdmin();
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  const info = await readSiteInfo(sb, shopId);
  const r = await moderateReview(sb, { id, shopId, action, info, actorId: user?.id ?? null, actorName: user?.email ?? null });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, review: r.review, points: r.points });
}
