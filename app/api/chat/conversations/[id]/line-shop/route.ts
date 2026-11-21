/**
 * ห้องแชทรวม — ไลน์ลูกค้าคนนี้ผูกร้านไหน / ขอผูกร้านอะไร (ไลน์บริษัท · QR ลูกค้ารวม)
 * GET  → { link: null | { status: pending|linked|blocked, requested_shop, partner_name, ... } } (เฉพาะห้อง LINE ของบอทไลน์บริษัท)
 * POST { action: "approve", link_id, partner_id } · { action: "reject", link_id } · { action: "undo", link_id } (ย้อนกลับเป็นรอยืนยัน)
 * สิทธิ์: ดู = chat.view · ตัดสิน = chat.reply · ทุกการตัดสินลง audit (lib/line-company-qr-server)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { loadLineConfig } from "@/lib/line-send";
import { companyBotKeyOf } from "@/lib/line-company-server";
import { customerLinkOf, decideCustomerRequest } from "@/lib/line-company-qr-server";
import { isLineUserId } from "@/lib/chat/line";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;

/** ห้องนี้เป็นห้อง LINE ของบอทไลน์บริษัทไหม → คืน userId ไลน์ของลูกค้า */
async function companyLineUser(admin: Admin, convId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(convId)) return null;
  const { data } = await admin.from("chat_conversations").select("channel,account_ref,external_id").eq("id", convId).maybeSingle();
  const c = data as { channel?: string; account_ref?: string; external_id?: string } | null;
  if (!c || c.channel !== "line" || !isLineUserId(c.external_id)) return null;
  const key = companyBotKeyOf(await loadLineConfig(admin));
  return key && c.account_ref === key ? (c.external_id as string) : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "chat.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const uid = await companyLineUser(admin, (await params).id);
  if (!uid) return NextResponse.json({ company: false, link: null, error: null });
  try { return NextResponse.json({ company: true, link: await customerLinkOf(admin, uid), error: null }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }, { status: 503 }); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "chat.reply"); if (denied) return denied;
  const admin = supabaseAdmin();
  const uid = await companyLineUser(admin, (await params).id);
  if (!uid) return NextResponse.json({ error: "ห้องนี้ไม่ใช่ไลน์บริษัท" }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; link_id?: string; partner_id?: string };
  const action = body.action === "approve" || body.action === "reject" || body.action === "undo" ? body.action : null;
  if (!action || !body.link_id) return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  // กันส่ง link_id ของไลน์คนอื่นมา — ต้องเป็นของลูกค้าในห้องนี้
  const { data: own } = await admin.from("line_customer_links").select("line_user_id").eq("id", body.link_id).maybeSingle();
  if ((own as { line_user_id?: string } | null)?.line_user_id !== uid) return NextResponse.json({ error: "คำขอนี้ไม่ใช่ของห้องนี้" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  try {
    await decideCustomerRequest(admin, { link_id: body.link_id, action, partner_id: body.partner_id ?? null, actor: user?.email ?? null, actorId: user?.id ?? null });
    return NextResponse.json({ ok: true, link: await customerLinkOf(admin, uid), error: null });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 400 }); }
}
