/**
 * /api/subscriptions/chrome-profiles — ทะเบียนโปรไฟล์ Chrome (ชื่อเล่น → อีเมล/โฟลเดอร์/ลิงก์)
 *
 * GET  → { data: ChromeProfile[] }  พร้อม usage = ใช้ในกี่รายการงาน (subscriptions.view)
 * POST → เพิ่มโปรไฟล์ { nickname, account_email, chrome_profile_dir, chrome_profile_url } (subscriptions.edit)
 *        รายการงานที่ใช้ชื่อเล่นนี้อยู่แล้ว → ผูกให้เลย (เติมอีเมล/โฟลเดอร์ตามโปรไฟล์)
 * กติกา: lib/chrome-profiles.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { countChromeProfileUsage, toChromeProfileRow, validateChromeProfile, type ChromeProfile, type ChromeProfileInput } from "@/lib/chrome-profiles";
import { loadWorkSubs, propagateChromeProfile } from "@/lib/chrome-profiles-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLS = "id, nickname, account_email, chrome_profile_dir, chrome_profile_url, sort_order";

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;

  const db = supabaseAdmin();
  const [{ data, error }, subs] = await Promise.all([
    db.from("subscription_chrome_profiles").select(COLS).order("sort_order").order("nickname"),
    loadWorkSubs(db),
  ]);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const usage = countChromeProfileUsage(subs.rows);
  const list = ((data ?? []) as ChromeProfile[]).map((p) => ({ ...p, usage: usage.get(p.nickname.trim().toLowerCase()) ?? 0 }));
  return NextResponse.json({ data: list, error: null });
}

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;

  let body: Partial<ChromeProfileInput>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const err = validateChromeProfile(body, true);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const row = { account_email: "", chrome_profile_dir: "", chrome_profile_url: "", ...toChromeProfileRow(body) } as ChromeProfileInput;
  const db = supabaseAdmin();
  const { data, error } = await db.from("subscription_chrome_profiles").insert(row).select(COLS).single();
  if (error?.code === "23505") return NextResponse.json({ error: `มีโปรไฟล์ชื่อ "${row.nickname}" อยู่แล้ว` }, { status: 409 });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "บันทึกไม่สำเร็จ" }, { status: 500 });

  const sync = await propagateChromeProfile(db, row.nickname, row);
  await writeAuditFor(request, db, {
    action: "create", entityType: "subscription_chrome_profiles", entityId: data.id,
    metadata: { nickname: row.nickname, account_email: row.account_email, chrome_profile_dir: row.chrome_profile_dir, synced_subs: sync.updated, failed_subs: sync.failed },
  });
  return NextResponse.json({ data, updated: sync.updated.length, failed: sync.failed.length, error: null });
}
