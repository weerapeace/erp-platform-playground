/**
 * 📨 ข้อความจากฟอร์มติดต่อของเว็บร้าน — /api/website/contact-messages (แท็บ "🏪 ข้อมูลร้าน" › 📨 ข้อความลูกค้า)
 *
 * GET    ?shop=<slug>&status=new|done|spam|all  → รายการ (ล่าสุดก่อน 500 แรก) + จำนวนแต่ละสถานะ
 * PATCH  { id, status?, staffNote? }              → ติ๊กตอบแล้ว / สแปม / กลับเป็นใหม่ · โน้ตภายใน + audit
 * DELETE ?id=<uuid>                               → ลบถาวร (ลูกค้าขอลบข้อมูล) + audit
 *
 * ของกลาง: guardApi(products.view/edit) + writeAudit · ข้อความเข้ามาทาง /api/public/storefront/contact
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { CONTACT_STATUSES, type ContactStatus } from "@/lib/website-contact";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_KEYS = new Set<string>(CONTACT_STATUSES.map((s) => s.key));

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const url = new URL(request.url);
  const shopSlug = (url.searchParams.get("shop") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "new").trim();
  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id").eq("slug", shopSlug).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const shopId = (shop as { id: string }).id;

  let q = sb
    .from("store_contact_messages")
    .select("id, first_name, last_name, email, phone, topic, message, lang, status, page, staff_note, handled_by, handled_at, created_at")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (status !== "all" && STATUS_KEYS.has(status)) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "ยังไม่ได้สร้างตาราง store_contact_messages (รัน migration ก่อน)", messages: [], counts: {} });

  const { data: all } = await sb.from("store_contact_messages").select("status").eq("shop_id", shopId);
  const counts: Record<string, number> = {};
  for (const r of (all ?? []) as { status: string }[]) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return NextResponse.json({ messages: data ?? [], counts, statuses: CONTACT_STATUSES });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { id?: string; status?: string; staffNote?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!STATUS_KEYS.has(body.status)) return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    patch.status = body.status as ContactStatus;
    patch.handled_by = body.status === "new" ? null : user?.email ?? null;
    patch.handled_at = body.status === "new" ? null : new Date().toISOString();
  }
  if (body.staffNote !== undefined) patch.staff_note = String(body.staffNote).trim().slice(0, 1000) || null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "ไม่มีอะไรให้แก้" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: before } = await sb.from("store_contact_messages").select("id, shop_id, email, status, staff_note").eq("id", body.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบข้อความ" }, { status: 404 });
  const b = before as { id: string; shop_id: string; email: string; status: string; staff_note: string | null };

  const { error } = await sb.from("store_contact_messages").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });

  await writeAudit(sb, {
    action: "update",
    entityType: "store_contact_messages",
    entityId: b.id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { shopId: b.shop_id, email: b.email, before: { status: b.status, staffNote: b.staff_note }, after: patch },
  });
  return NextResponse.json({ ok: true });
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
  const { data: row } = await sb.from("store_contact_messages").select("id, shop_id, email, topic").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบข้อความ" }, { status: 404 });
  const r = row as { id: string; shop_id: string; email: string; topic: string };

  const { error } = await sb.from("store_contact_messages").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });

  await writeAudit(sb, {
    action: "delete",
    entityType: "store_contact_messages",
    entityId: r.id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { shopId: r.shop_id, email: r.email, topic: r.topic },
  });
  return NextResponse.json({ ok: true });
}
