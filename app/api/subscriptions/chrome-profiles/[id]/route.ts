/**
 * /api/subscriptions/chrome-profiles/[id] — แก้ / ลบ โปรไฟล์ในทะเบียน (subscriptions.edit)
 * PATCH  → แก้เฉพาะช่องที่ส่งมา แล้วไล่อัปเดตทุกรายการงานที่ใช้โปรไฟล์นี้ (เปลี่ยนชื่อเล่นก็ตามไปด้วย)
 * DELETE → ลบออกจากทะเบียน · รายการที่เคยใช้ยังเก็บอีเมล/โฟลเดอร์เดิมไว้ (แค่ไม่ผูกกับทะเบียนแล้ว)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { toChromeProfileRow, validateChromeProfile, type ChromeProfileInput } from "@/lib/chrome-profiles";
import { propagateChromeProfile } from "@/lib/chrome-profiles-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLS = "id, nickname, account_email, chrome_profile_dir, chrome_profile_url, sort_order";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;
  const { id } = await params;

  let body: Partial<ChromeProfileInput>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const err = validateChromeProfile(body, false);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  const patch = toChromeProfileRow(body);
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้ไข" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: cur } = await db.from("subscription_chrome_profiles").select(COLS).eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบโปรไฟล์นี้" }, { status: 404 });

  const { data, error } = await db.from("subscription_chrome_profiles")
    .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select(COLS).single();
  if (error?.code === "23505") return NextResponse.json({ error: `มีโปรไฟล์ชื่อ "${patch.nickname}" อยู่แล้ว` }, { status: 409 });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "บันทึกไม่สำเร็จ" }, { status: 500 });

  // ทุกรายการที่ใช้ชื่อเล่นเดิม → ค่าใหม่ตามโปรไฟล์
  const sync = await propagateChromeProfile(db, cur.nickname, data);
  const changed = (Object.keys(patch) as (keyof ChromeProfileInput)[]).filter((k) => patch[k] !== cur[k]);
  await writeAuditFor(request, db, {
    action: "update", entityType: "subscription_chrome_profiles", entityId: id,
    metadata: {
      nickname: data.nickname, changed,
      old: Object.fromEntries(changed.map((k) => [k, cur[k]])), new: Object.fromEntries(changed.map((k) => [k, data[k]])),
      synced_subs: sync.updated, failed_subs: sync.failed,
    },
  });
  return NextResponse.json({ data, updated: sync.updated.length, failed: sync.failed.length, error: sync.error });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;
  const { id } = await params;

  const db = supabaseAdmin();
  const { data: cur } = await db.from("subscription_chrome_profiles").select(COLS).eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบโปรไฟล์นี้" }, { status: 404 });

  const { error } = await db.from("subscription_chrome_profiles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditFor(request, db, {
    action: "delete", entityType: "subscription_chrome_profiles", entityId: id,
    metadata: { nickname: cur.nickname, account_email: cur.account_email, chrome_profile_dir: cur.chrome_profile_dir },
  });
  return NextResponse.json({ ok: true, error: null });
}
