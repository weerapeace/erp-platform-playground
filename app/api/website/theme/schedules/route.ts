/**
 * ⏰ ตั้งเวลาเผยแพร่ธีม + 🎪 ธีมแคมเปญ (แท็บดีไซน์ ชุด 5) — /api/website/theme/schedules
 *
 * GET    ?shop=<slug>                                            → { schedules } (งานตั้งเวลา + แคมเปญ · ใหม่สุดก่อน)
 * POST   { shopId, kind:"publish", theme, at, includeHome, note } → เก็บธีม (รวมกับที่เผยแพร่อยู่) + หน้าแรกร่าง (ถ้าติ๊ก) ไว้เผยแพร่ตอน at
 *                                                                  · บันทึกเป็นร่างด้วย · งานเดิมที่ค้างของร้านนี้ถูกยกเลิก (ตั้งได้ทีละงาน)
 * POST   { shopId, kind:"campaign", name, startsAt, endsAt, savedThemeId?, festive?, note } → แคมเปญใหม่
 * PATCH  { id, name, startsAt, endsAt, savedThemeId?, festive?, note }                       → แก้แคมเปญ
 * DELETE ?id=                                                     → งานตั้งเวลา = ยกเลิก · แคมเปญ = ลบ
 *
 * ตัวทำงานจริง = lib/website-theme-schedule-db.ts (site API ของเว็บร้าน) · ตรวจค่า = lib/website-theme-schedule.ts · ทุกการกระทำลง audit log
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardWebsite } from "@/lib/website-api-guard";
import { writeAudit } from "@/lib/audit";
import { mergeTheme } from "@/lib/website-theme";
import { normalizeBlocks } from "@/lib/website-blocks";
import { cleanSavedThemeScope } from "@/lib/website-saved-themes";
import { SCHEDULE_LIST_SELECT, SCHEDULE_TABLE, sanitizeCampaignInput, sanitizePublishInput, scheduleFromRow, type CampaignInput, type CampaignLook } from "@/lib/website-theme-schedule";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;

async function actor(request: NextRequest) {
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  return { id: user?.id ?? null, name: user?.email ?? null };
}

/** สำเนาธีมที่บันทึกไว้ (website_saved_themes) ณ ตอนตั้งแคมเปญ */
async function lookOf(sb: Admin, savedThemeId: string | null): Promise<CampaignLook | null | "missing"> {
  if (!savedThemeId) return null;
  const { data } = await sb.from("website_saved_themes").select("id, name, scope, theme").eq("id", savedThemeId).maybeSingle();
  const r = data as { id: string; name: string; scope: unknown; theme: unknown } | null;
  const scope = r ? cleanSavedThemeScope(r.scope) : null;
  if (!r || !scope) return "missing";
  return { savedThemeId: r.id, name: r.name, scope, theme: (r.theme ?? {}) as Record<string, unknown> };
}

const campaignRow = (v: CampaignInput, look: CampaignLook | null) => ({
  name: v.name,
  starts_at: v.startsAt,
  ends_at: v.endsAt,
  look,
  festive: v.festive,
  note: v.note,
  updated_at: new Date().toISOString(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;
  const slug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();
  const shop = await shopBySlug(sb, slug);
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const { data, error } = await sb
    .from(SCHEDULE_TABLE)
    .select(SCHEDULE_LIST_SELECT)
    .eq("shop_id", (shop as { id: string }).id)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: false })
    .limit(60);
  if (error) return NextResponse.json({ error: "โหลดรายการตั้งเวลาไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ schedules: ((data ?? []) as unknown as Record<string, unknown>[]).map(scheduleFromRow), now: new Date().toISOString() });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const shopId = typeof body.shopId === "string" ? body.shopId : "";
  if (!shopId) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });
  const sb = supabaseAdmin();
  const who = await actor(request);
  const { data: shop } = await sb.from("shops").select("id, theme, home_layout_draft").eq("id", shopId).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const cur = shop as { id: string; theme: unknown; home_layout_draft: unknown };

  if (body.kind === "campaign") {
    const v = sanitizeCampaignInput(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    const look = await lookOf(sb, v.value.savedThemeId);
    if (look === "missing") return NextResponse.json({ error: "ไม่พบธีมที่บันทึกไว้ (อาจถูกลบไปแล้ว)" }, { status: 400 });
    const { data, error } = await sb
      .from(SCHEDULE_TABLE)
      .insert({ shop_id: shopId, kind: "campaign", ...campaignRow(v.value, look), created_by: who.id, created_by_name: who.name })
      .select(SCHEDULE_LIST_SELECT)
      .single();
    if (error) return NextResponse.json({ error: "บันทึกแคมเปญไม่สำเร็จ" }, { status: 500 });
    await writeAudit(sb, { action: "create", entityType: "shop_theme_campaign", entityId: shopId, actorId: who.id, actorName: who.name, metadata: { name: v.value.name, startsAt: v.value.startsAt, endsAt: v.value.endsAt, look: look?.name ?? null, festive: v.value.festive?.kind ?? null } });
    return NextResponse.json({ ok: true, schedule: scheduleFromRow(data as unknown as Record<string, unknown>) });
  }

  // ⏰ ตั้งเวลาเผยแพร่
  const v = sanitizePublishInput(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const theme = mergeTheme(cur.theme, body.theme);
  let layout: unknown[] | null = null;
  if (v.value.includeHome) {
    if (cur.home_layout_draft == null) return NextResponse.json({ error: "หน้าแรกยังไม่มีร่าง — ไปจัดหน้าแรกแล้วบันทึกร่างก่อน หรือเอาติ๊ก \"รวมหน้าแรก\" ออก" }, { status: 400 });
    layout = normalizeBlocks(cur.home_layout_draft);
  }
  // ตั้งได้ทีละงาน: งานเดิมที่ยังค้างของร้านนี้ = ยกเลิก
  const { data: replaced } = await sb
    .from(SCHEDULE_TABLE)
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("shop_id", shopId)
    .eq("kind", "publish")
    .eq("status", "pending")
    .select("id");
  // บันทึกเป็นร่างด้วย (ปิดหน้า/เปิดใหม่ยังเห็นชุดที่ตั้งเวลาไว้)
  await sb.from("shops").update({ theme_draft: theme }).eq("id", shopId);
  const { data, error } = await sb
    .from(SCHEDULE_TABLE)
    .insert({ shop_id: shopId, kind: "publish", name: layout ? "ธีม + หน้าแรก" : "ธีม", starts_at: v.value.at, theme, layout, note: v.value.note, created_by: who.id, created_by_name: who.name })
    .select(SCHEDULE_LIST_SELECT)
    .single();
  if (error) return NextResponse.json({ error: "ตั้งเวลาไม่สำเร็จ" }, { status: 500 });
  await writeAudit(sb, { action: "create", entityType: "shop_theme_schedule", entityId: shopId, actorId: who.id, actorName: who.name, metadata: { at: v.value.at, includeHome: !!layout, note: v.value.note || null, replaced: replaced?.length ?? 0 } });
  return NextResponse.json({ ok: true, schedule: scheduleFromRow(data as unknown as Record<string, unknown>), replaced: replaced?.length ?? 0 });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const sb = supabaseAdmin();
  const { data: row } = await sb.from(SCHEDULE_TABLE).select("id, shop_id, kind, status, look").eq("id", id).maybeSingle();
  const r = row as { id: string; shop_id: string; kind: string; status: string; look: CampaignLook | null } | null;
  if (!r || r.kind !== "campaign" || r.status !== "pending") return NextResponse.json({ error: "ไม่พบแคมเปญ" }, { status: 404 });
  const v = sanitizeCampaignInput(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  // ธีมเดิม = คงสำเนาเดิม (ไม่ดึงใหม่) · เปลี่ยนธีม = สำเนาใหม่
  const look = v.value.savedThemeId && v.value.savedThemeId === r.look?.savedThemeId ? r.look : await lookOf(sb, v.value.savedThemeId);
  if (look === "missing") return NextResponse.json({ error: "ไม่พบธีมที่บันทึกไว้ (อาจถูกลบไปแล้ว)" }, { status: 400 });
  const { data, error } = await sb.from(SCHEDULE_TABLE).update(campaignRow(v.value, look)).eq("id", id).select(SCHEDULE_LIST_SELECT).single();
  if (error) return NextResponse.json({ error: "แก้แคมเปญไม่สำเร็จ" }, { status: 500 });
  const who = await actor(request);
  await writeAudit(sb, { action: "update", entityType: "shop_theme_campaign", entityId: r.shop_id, actorId: who.id, actorName: who.name, metadata: { id, name: v.value.name, startsAt: v.value.startsAt, endsAt: v.value.endsAt, look: look?.name ?? null, festive: v.value.festive?.kind ?? null } });
  return NextResponse.json({ ok: true, schedule: scheduleFromRow(data as unknown as Record<string, unknown>) });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  const sb = supabaseAdmin();
  const { data: row } = await sb.from(SCHEDULE_TABLE).select("id, shop_id, kind, status, name, starts_at").eq("id", id).maybeSingle();
  const r = row as { id: string; shop_id: string; kind: string; status: string; name: string; starts_at: string } | null;
  if (!r) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
  const who = await actor(request);
  if (r.kind === "publish") {
    if (r.status !== "pending") return NextResponse.json({ error: "งานนี้เผยแพร่ไปแล้ว ยกเลิกไม่ได้ (ย้อนเวอร์ชันได้ที่แท็บประวัติ)" }, { status: 400 });
    const { data: done } = await sb.from(SCHEDULE_TABLE).update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "pending").select("id");
    if (!done?.length) return NextResponse.json({ error: "งานนี้เผยแพร่ไปแล้ว" }, { status: 400 });
    await writeAudit(sb, { action: "cancel", entityType: "shop_theme_schedule", entityId: r.shop_id, actorId: who.id, actorName: who.name, metadata: { id, at: r.starts_at } });
    return NextResponse.json({ ok: true });
  }
  const { error } = await sb.from(SCHEDULE_TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: "ลบแคมเปญไม่สำเร็จ" }, { status: 500 });
  await writeAudit(sb, { action: "delete", entityType: "shop_theme_campaign", entityId: r.shop_id, actorId: who.id, actorName: who.name, metadata: { id, name: r.name } });
  return NextResponse.json({ ok: true });
}
