/**
 * 🧪 สมาชิกทดลอง (ERP แท็บ 👥 สมาชิก › ปุ่ม 🧪) — /api/website/members/test
 * POST { action, shop, ... }
 *   create     { name, points? } → สร้างบัญชีทดลอง (is_test · ไม่มีอีเมล/ช่องทางเข้าสู่ระบบ) + แต้มเริ่มต้น (ลงสมุดแต้มตามปกติ)
 *   open       { id }            → ตั๋วเข้าเว็บร้านในฐานะคนนี้ (ใช้ครั้งเดียว 10 นาที) → { url } เปิดแท็บใหม่
 *   delete     { id }            → ลบบัญชีทดลองทิ้งถาวร (ที่อยู่/แต้ม/รายการโปรด/ตะกร้าลบตาม)
 *   delete_all {}                → ลบบัญชีทดลองทั้งหมดของร้าน
 * ทุกคำสั่งบันทึก audit (entity store_customer) · ลบได้เฉพาะ is_test — บัญชีลูกค้าจริงแตะไม่ได้จากทางนี้
 * สมาชิกทดลองสั่งซื้อจริงไม่ได้ (lib/storefront-internal denyTestMember) จึงไม่มีออเดอร์ค้าง ลบได้เสมอ
 * ด่าน: guardApi products.edit (พนักงาน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardWebsite } from "@/lib/website-api-guard";
import { writeAudit } from "@/lib/audit";
import { shopBySlug } from "@/lib/website-shop";
import { adjustPoints } from "@/lib/member-points-db";
import { newLinkToken } from "@/lib/member-password";
import { issuePreviewKey } from "@/lib/storefront-preview-key";

export const dynamic = "force-dynamic";

const MAX_TEST_MEMBERS = 20;
const TICKET_MIN = 10;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const sb = supabaseAdmin();
  const shop = await shopBySlug<{ id: string; slug: string; name: string }>(sb, body.shop, "id, slug, name");
  if (!shop) return NextResponse.json({ ok: false, error: "ไม่พบร้าน" }, { status: 404 });
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  const audit = (act: string, id: string | null, metadata: Record<string, unknown>) =>
    writeAudit(sb, { action: act, entityType: "store_customer", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { shop: shop.slug, test_member: true, ...metadata } });

  // สมาชิกทดลองของร้านนี้ (ใช้ตรวจก่อนเปิด/ลบ — แตะบัญชีจริงไม่ได้)
  const testMember = async (id: unknown) => {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data } = await sb.from("store_customers").select("id, name, is_test, status").eq("id", id).eq("shop_id", shop.id).maybeSingle();
    const m = data as { id: string; name: string; is_test: boolean; status: string } | null;
    return m && m.is_test ? m : null;
  };

  if (action === "create") {
    const name = String(body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "ทดลอง · ลูกค้าใหม่";
    const points = Math.max(0, Math.min(1_000_000, Math.floor(Number(body.points) || 0)));
    const { count } = await sb.from("store_customers").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).eq("is_test", true);
    if ((count ?? 0) >= MAX_TEST_MEMBERS) return NextResponse.json({ ok: false, error: `มีสมาชิกทดลองครบ ${MAX_TEST_MEMBERS} คนแล้ว — ลบคนเก่าก่อน` }, { status: 400 });
    const now = new Date().toISOString();
    const { data, error } = await sb.from("store_customers").insert({ shop_id: shop.id, name, is_test: true, email: null, email_verified: false, terms_accepted_at: now }).select("id").maybeSingle();
    if (error || !data) return NextResponse.json({ ok: false, error: "สร้างไม่สำเร็จ" }, { status: 500 });
    const id = (data as { id: string }).id;
    if (points > 0) await adjustPoints(sb, id, points, "แต้มเริ่มต้นของสมาชิกทดลอง", `staff:${user?.email ?? user?.id ?? "unknown"}`);
    await audit("create", id, { name, points });
    return NextResponse.json({ ok: true, id });
  }

  if (action === "open") {
    const m = await testMember(body.id);
    if (!m) return NextResponse.json({ ok: false, error: "ไม่พบสมาชิกทดลองนี้" }, { status: 404 });
    if (m.status !== "active") return NextResponse.json({ ok: false, error: "บัญชีนี้ถูกระงับอยู่ — เปิดบัญชีก่อน" }, { status: 400 });
    const { data: dom } = await sb.from("shop_domains").select("domain").eq("shop_id", shop.id).order("created_at").limit(1).maybeSingle();
    const raw = (dom as { domain: string } | null)?.domain;
    if (!raw) return NextResponse.json({ ok: false, error: "ร้านนี้ยังไม่มีโดเมนเว็บ — เพิ่มโดเมนในแท็บข้อมูลร้านก่อน" }, { status: 400 });
    const t = newLinkToken();
    const { error } = await sb.from("store_customer_tokens").insert({ customer_id: m.id, kind: "trial_login", token_hash: t.hash, expires_at: new Date(Date.now() + TICKET_MIN * 60_000).toISOString() });
    if (error) return NextResponse.json({ ok: false, error: "สร้างลิงก์ไม่สำเร็จ" }, { status: 500 });
    const base = (raw.startsWith("http") ? raw : `https://${raw}`).replace(/\/+$/, "");
    // แนบรหัสพรีวิว (pk) — ร้านที่ปิดเว็บอยู่ก็เปิดดูหน้าบัญชีได้
    const pk = issuePreviewKey(shop.slug);
    const url = `${base}/api/auth/trial?t=${encodeURIComponent(t.token)}${pk ? `&pk=${encodeURIComponent(pk)}` : ""}`;
    await audit("trial_login", m.id, { name: m.name });
    return NextResponse.json({ ok: true, url });
  }

  if (action === "delete") {
    const m = await testMember(body.id);
    if (!m) return NextResponse.json({ ok: false, error: "ไม่พบสมาชิกทดลองนี้" }, { status: 404 });
    const { error } = await sb.from("store_customers").delete().eq("id", m.id).eq("is_test", true);
    if (error) return NextResponse.json({ ok: false, error: "ลบไม่สำเร็จ" }, { status: 500 });
    await audit("delete", m.id, { name: m.name });
    return NextResponse.json({ ok: true, deleted: 1 });
  }

  if (action === "delete_all") {
    const { data, error } = await sb.from("store_customers").delete().eq("shop_id", shop.id).eq("is_test", true).select("id, name");
    if (error) return NextResponse.json({ ok: false, error: "ลบไม่สำเร็จ" }, { status: 500 });
    const rows = (data ?? []) as { id: string; name: string }[];
    await audit("delete", null, { bulk: true, count: rows.length, names: rows.map((r) => r.name).slice(0, 20) });
    return NextResponse.json({ ok: true, deleted: rows.length });
  }

  return NextResponse.json({ ok: false, error: "ไม่รู้จักคำสั่ง" }, { status: 400 });
}
