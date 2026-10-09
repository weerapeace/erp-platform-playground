/**
 * รายชื่อสมัครรับข่าวสารจากเว็บร้าน — /api/website/subscribers (แท็บ "🏪 ข้อมูลร้าน")
 *
 * GET    ?shop=<slug>   → รายชื่อ (ล่าสุดก่อน, 500 แรก) + จำนวนรวม
 * DELETE ?id=<uuid>     → ลบ 1 รายชื่อ (ลูกค้าขอยกเลิก) + audit
 *
 * ของกลาง: guardApi(products.view/edit) + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const shopSlug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id").eq("slug", shopSlug).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const shopId = (shop as { id: string }).id;

  const { data, error, count } = await sb
    .from("store_subscribers")
    .select("id, email, source, created_at", { count: "exact" })
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    // ตารางยังไม่ถูกสร้าง (migration ยังไม่รัน) — บอกให้ชัด ไม่ใช่ error เงียบ
    return NextResponse.json({ error: "ยังไม่ได้สร้างตาราง store_subscribers (รัน migration ก่อน)", subscribers: [], total: 0 });
  }
  return NextResponse.json({ subscribers: data ?? [], total: count ?? 0 });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: row } = await sb.from("store_subscribers").select("id, shop_id, email").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบรายชื่อ" }, { status: 404 });
  const r = row as { id: string; shop_id: string; email: string };

  const { error } = await sb.from("store_subscribers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });

  await writeAudit(sb, {
    action: "delete",
    entityType: "store_subscribers",
    entityId: r.id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { shopId: r.shop_id, email: r.email },
  });
  return NextResponse.json({ ok: true });
}
