/**
 * 👥 สมาชิกเว็บร้าน (ERP แท็บสมาชิก) — /api/website/members
 * GET   ?shop=<slug> → { members: [...สรุป + วิธีเข้าสู่ระบบ + จำนวนออเดอร์ + ยอดซื้อ (ไม่นับยกเลิก)] }
 * PATCH { id, status: "active" | "blocked" } → ระงับ/เปิดบัญชี (ระงับ = เข้าสู่ระบบไม่ได้ · ออเดอร์เดิมไม่หาย) + audit
 * ด่าน: guardApi (พนักงาน) — ไม่ใช่เส้นของเว็บร้าน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import type { MemberProvider } from "@/lib/website-members";

export const dynamic = "force-dynamic";

type Row = { id: string; email: string | null; email_verified: boolean; name: string; phone: string | null; avatar_url: string | null; marketing_opt_in: boolean; status: string; created_at: string; last_login_at: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const slug = (request.nextUrl.searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id").eq("slug", slug).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const shopId = (shop as { id: string }).id;
  const { data, error } = await sb
    .from("store_customers")
    .select("id, email, email_verified, name, phone, avatar_url, marketing_opt_in, status, created_at, last_login_at")
    .eq("shop_id", shopId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) return NextResponse.json({ error: "โหลดสมาชิกไม่สำเร็จ" }, { status: 500 });
  const rows = (data ?? []) as Row[];
  const ids = rows.map((r) => r.id);
  const [{ data: idents }, { data: orders }] = ids.length
    ? await Promise.all([
        sb.from("store_customer_identities").select("customer_id, provider").in("customer_id", ids),
        sb.from("store_orders").select("customer_id, grand_total, status").in("customer_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const prov = new Map<string, Set<MemberProvider>>();
  for (const i of (idents ?? []) as { customer_id: string; provider: MemberProvider }[]) prov.set(i.customer_id, (prov.get(i.customer_id) ?? new Set()).add(i.provider));
  const stats = new Map<string, { count: number; total: number }>();
  for (const o of (orders ?? []) as { customer_id: string; grand_total: number | string; status: string }[]) {
    if (o.status === "cancelled") continue;
    const s = stats.get(o.customer_id) ?? { count: 0, total: 0 };
    s.count += 1;
    s.total += Number(o.grand_total) || 0;
    stats.set(o.customer_id, s);
  }
  return NextResponse.json(
    {
      members: rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        emailVerified: r.email_verified,
        phone: r.phone ?? "",
        avatarUrl: r.avatar_url,
        marketingOptIn: r.marketing_opt_in,
        status: r.status,
        createdAt: r.created_at,
        lastLoginAt: r.last_login_at,
        providers: [...(prov.get(r.id) ?? [])],
        orderCount: stats.get(r.id)?.count ?? 0,
        orderTotal: Math.round((stats.get(r.id)?.total ?? 0) * 100) / 100,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { id?: string; status?: string } | null;
  const id = String(body?.id ?? "");
  const status = body?.status === "blocked" ? "blocked" : body?.status === "active" ? "active" : "";
  if (!id || !status) return NextResponse.json({ error: "ต้องระบุสมาชิกและสถานะ" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: before } = await sb.from("store_customers").select("id, name, email, status, shop_id").eq("id", id).maybeSingle();
  if (!before || (before as { status: string }).status === "deleted") return NextResponse.json({ error: "ไม่พบสมาชิก" }, { status: 404 });
  const { error } = await sb.from("store_customers").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  const b = before as { name: string; email: string | null; status: string; shop_id: string };
  await writeAudit(sb, {
    action: "update",
    entityType: "store_customer",
    entityId: id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { name: b.name, email: b.email, shop_id: b.shop_id, status_before: b.status, status_after: status },
  });
  return NextResponse.json({ ok: true });
}
