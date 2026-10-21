/**
 * ↩️ คำขอคืน/เปลี่ยนสินค้า (ERP แท็บ ↩️ คืน/เปลี่ยน) — /api/website/returns
 * GET   ?shop=<slug>&status=<pending|approved|received|closed|rejected|all> → { returns, counts } (products.view)
 * PATCH { id, status, note? } → เปลี่ยนสถานะตามลำดับที่อนุญาต (RETURN_MOVES) + หมายเหตุถึงลูกค้า + audit (products.edit)
 * กฎ: lib/website-returns · บันทึก: lib/website-returns-server · ระบบไม่คืนเงิน/ไม่ตัดสต็อกเอง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { decideReturn } from "@/lib/website-returns-server";
import { RETURN_STATUSES, type ReturnStatus } from "@/lib/website-returns";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const p = request.nextUrl.searchParams;
  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id").eq("slug", (p.get("shop") ?? "").trim()).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const shopId = (shop as { id: string }).id;
  const status = p.get("status") ?? "pending";
  let q = sb
    .from("store_return_requests")
    .select("id, order_id, kind, reason, detail, items, images, status, staff_note, decided_by_name, decided_at, lang, created_at, store_orders(order_no, customer_name, customer_phone, status, grand_total)")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (status !== "all" && RETURN_STATUSES.some((s) => s.key === status)) q = q.eq("status", status);
  const [{ data, error }, { data: all }] = await Promise.all([q, sb.from("store_return_requests").select("status").eq("shop_id", shopId).limit(5000)]);
  if (error) return NextResponse.json({ error: "โหลดคำขอไม่สำเร็จ" }, { status: 500 });
  const counts: Record<string, number> = {};
  for (const r of (all ?? []) as { status: string }[]) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return NextResponse.json({ returns: data ?? [], counts }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { id?: string; status?: string; note?: string } | null;
  const id = String(body?.id ?? "");
  const status = String(body?.status ?? "") as ReturnStatus;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !RETURN_STATUSES.some((s) => s.key === status)) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  const r = await decideReturn(supabaseAdmin(), id, status, String(body?.note ?? ""), { id: user?.id ?? null, name: user?.email ?? null });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
