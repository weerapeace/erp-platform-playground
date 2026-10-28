/**
 * 🔣 ไอคอนทั้งระบบ — ค่าตั้งค่าของทะเบียนไอคอนกลาง (lib/icon-registry · หน้า /admin/icons)
 *
 * เก็บใน app_settings.icon_settings = { mode, overrides, emojiMap, custom, colors }
 *
 * GET   /api/admin/icon-settings              → ค่าปัจจุบัน (ทุกหน้าใช้วาดไอคอน · ว่าง = อีโมจิแบบเดิม)
 * PATCH /api/admin/icon-settings { settings }  → บันทึก (เฉพาะ admin.users) + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { cleanIconSettings } from "@/lib/icon-registry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<NextResponse> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("app_settings").select("icon_settings").eq("id", 1).maybeSingle();
  // ยังไม่ได้ลง migration (ไม่มีคอลัมน์) → ใช้ค่าเริ่มต้น (อีโมจิแบบเดิม) ไม่ให้หน้าไหนพัง · หน้าตั้งค่าเตือนว่ายังบันทึกไม่ได้
  if (error?.code === "42703" || /icon_settings.*does not exist/.test(error?.message ?? ""))
    return NextResponse.json({ data: cleanIconSettings(null), error: null, setup_needed: true });
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json({ data: cleanIconSettings(data?.icon_settings), error: null }, { headers: { "Cache-Control": "private, max-age=60" } });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { data: canDo, error: permErr } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: "admin.users" });
  if (permErr) return NextResponse.json({ error: permErr.message }, { status: 500 });
  if (canDo !== true) return NextResponse.json({ error: "ไม่มีสิทธิ์ตั้งค่าไอคอน (admin.users)" }, { status: 403 });

  let b: { settings?: unknown; actor?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const next = cleanIconSettings(b.settings);

  const admin = supabaseAdmin();
  const { data: prevRow } = await admin.from("app_settings").select("icon_settings").eq("id", 1).maybeSingle();
  const prev = cleanIconSettings(prevRow?.icon_settings);
  const { error } = await admin.from("app_settings").update({ icon_settings: next }).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ประวัติ: บอกเป็นภาษาคนว่าเปลี่ยนอะไร (โหมด · ความหมายที่เปลี่ยนไอคอน/สี · อีโมจิที่จับคู่ · ไอคอนของฉัน)
  const changedMeanings = [...new Set([...Object.keys(prev.overrides), ...Object.keys(next.overrides)])].filter((k) => prev.overrides[k] !== next.overrides[k]);
  const changedColors = [...new Set([...Object.keys(prev.colors), ...Object.keys(next.colors)])].filter((k) => prev.colors[k] !== next.colors[k]);
  const changedEmoji = [...new Set([...Object.keys(prev.emojiMap), ...Object.keys(next.emojiMap)])].filter((e) => prev.emojiMap[e] !== next.emojiMap[e]);
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "icon_settings.update", entityType: "app_settings",
    actorId: user?.id ?? null, actorName: b.actor ?? user?.email ?? null,
    metadata: {
      mode: prev.mode === next.mode ? next.mode : { old: prev.mode, new: next.mode },
      overrides: changedMeanings.map((k) => ({ meaning: k, old: prev.overrides[k] ?? null, new: next.overrides[k] ?? null })),
      colors: changedColors.map((k) => ({ meaning: k, old: prev.colors[k] ?? null, new: next.colors[k] ?? null })),
      emoji_map: changedEmoji.map((e) => ({ emoji: e, old: prev.emojiMap[e] ?? null, new: next.emojiMap[e] ?? null })),
      custom_count: { old: prev.custom.length, new: next.custom.length },
    },
  });
  return NextResponse.json({ ok: true, data: next });
}
