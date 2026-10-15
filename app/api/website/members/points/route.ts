/**
 * ⭐ แต้มของสมาชิก (ERP แท็บสมาชิก) — /api/website/members/points
 * GET  ?id=<memberId> → { balance, history[] }
 * POST { id, delta, note } → ร้านปรับแต้มเอง (+ เพิ่ม / − หัก) · ต้องมีเหตุผล · หักจนติดลบไม่ได้ · audit
 * ด่าน: guardApi (พนักงาน) — ไม่ใช่เส้นของเว็บร้าน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { adjustPoints, pointsBalance, pointsHistory } from "@/lib/member-points-db";

export const dynamic = "force-dynamic";

const MAX_ADJUST = 1_000_000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const id = (request.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุสมาชิก" }, { status: 400 });
  const sb = supabaseAdmin();
  const [balance, history] = await Promise.all([pointsBalance(sb, id), pointsHistory(sb, id, 200)]);
  return NextResponse.json({ balance, history }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { id?: string; delta?: unknown; note?: unknown } | null;
  const id = String(body?.id ?? "");
  const delta = Math.trunc(Number(body?.delta));
  const note = String(body?.note ?? "").trim().slice(0, 200);
  if (!id) return NextResponse.json({ error: "ต้องระบุสมาชิก" }, { status: 400 });
  if (!Number.isFinite(delta) || delta === 0) return NextResponse.json({ error: "ใส่จำนวนแต้ม (บวก = เพิ่ม · ลบ = หัก)" }, { status: 400 });
  if (Math.abs(delta) > MAX_ADJUST) return NextResponse.json({ error: `ปรับได้ครั้งละไม่เกิน ${MAX_ADJUST.toLocaleString("th-TH")} แต้ม` }, { status: 400 });
  if (note.length < 3) return NextResponse.json({ error: "ใส่เหตุผลที่ปรับแต้ม (เช่น ชดเชยของเสีย / แก้แต้มผิด)" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: m } = await sb.from("store_customers").select("id, name, email, shop_id, status").eq("id", id).maybeSingle();
  const member = m as { id: string; name: string; email: string | null; shop_id: string; status: string } | null;
  if (!member || member.status === "deleted") return NextResponse.json({ error: "ไม่พบสมาชิก" }, { status: 404 });

  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  const before = await pointsBalance(sb, id);
  const after = await adjustPoints(sb, id, delta, note, `staff:${user?.email ?? user?.id ?? "unknown"}`);
  if (after === null) {
    return NextResponse.json({ error: delta < 0 ? `หักไม่ได้ — สมาชิกมีแต้มอยู่ ${before.toLocaleString("th-TH")} แต้ม` : "ปรับแต้มไม่สำเร็จ กรุณาลองใหม่" }, { status: 400 });
  }
  await writeAudit(sb, {
    action: "update",
    entityType: "store_customer_points",
    entityId: id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { name: member.name, email: member.email, shop_id: member.shop_id, delta, note, balance_before: before, balance_after: after },
  });
  return NextResponse.json({ ok: true, balance: after });
}
