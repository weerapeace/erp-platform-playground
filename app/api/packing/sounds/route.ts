/**
 * 🔊 ชุดเสียงสถานีแพ็ค (ใช้ร่วมทุกโต๊ะ) — /api/packing/sounds   (กติกา lib/packing-sound · ตาราง packing_sounds)
 *
 * GET               (packing.pack)   → { sounds: [{ key, volume, audio_name, duration_ms, has_audio, has_prev, prev_audio_name, updated_at, updated_by_name }], can_manage }
 * GET ?key=<เสียง>  (packing.pack)   → { key, audio, updated_at }   (data URL · เครื่องเก็บแคชตาม updated_at)
 * PUT { key, volume?, audio?: dataURL|null, audio_name?, duration_ms?, restore_prev?: true }   (packing.manage)
 *        audio = null → คืนเสียงเดิมของระบบ · ไฟล์ก่อนหน้าเก็บไว้ใน prev_* (ย้อนได้ด้วย restore_prev = สลับกับเสียงปัจจุบัน)
 *        audit "packing.sound_update" (ไม่เก็บตัวไฟล์ในประวัติ เก็บแค่ชื่อไฟล์)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import { clampVolume, isPackSound, isValidSoundData, SOUND_MAX_SEC } from "@/lib/packing-sound";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  key: string; volume: number; audio_data: string | null; audio_name: string | null; duration_ms: number | null;
  prev_audio_data: string | null; prev_audio_name: string | null; prev_duration_ms: number | null; updated_at: string; updated_by_name: string | null;
};
const META = "key, volume, audio_name, duration_ms, prev_audio_name, updated_at, updated_by_name, has_audio:audio_data, has_prev:prev_audio_data";

async function whoAmI(request: Request, admin: ReturnType<typeof supabaseAdmin>): Promise<{ id: string | null; name: string | null }> {
  try {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    if (!user) return { id: null, name: null };
    const { data } = await admin.from("user_profiles").select("display_name, username, email").eq("id", user.id).maybeSingle();
    const p = data as { display_name?: string; username?: string; email?: string } | null;
    return { id: user.id, name: p?.display_name || p?.username || p?.email || user.email || null };
  } catch { return { id: null, name: null }; }
}

const noStore = { "Cache-Control": "no-store" };
const fileLabel = (name: string | null, has: boolean) => (has ? name || "ไฟล์เสียง" : "เสียงเดิม");

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "packing.pack"); if (denied) return denied;
  const admin = supabaseAdmin();
  const key = new URL(request.url).searchParams.get("key");
  if (key) {
    if (!isPackSound(key)) return NextResponse.json({ error: "ไม่รู้จักเสียงนี้" }, { status: 400 });
    const { data, error } = await admin.from("packing_sounds").select("key, audio_data, updated_at").eq("key", key).maybeSingle();
    if (error) return NextResponse.json({ error: "โหลดเสียงไม่สำเร็จ" }, { status: 500 });
    const r = data as { audio_data: string | null; updated_at: string } | null;
    return NextResponse.json({ key, audio: r?.audio_data ?? null, updated_at: r?.updated_at ?? null, error: null }, { headers: noStore });
  }
  // has_audio/has_prev: เลือกคอลัมน์ไฟล์มาด้วยชื่อแฝง แต่ส่งกลับแค่ true/false (ไม่ส่งตัวไฟล์ในรายการ)
  const { data, error } = await admin.from("packing_sounds").select(META);
  if (error) return NextResponse.json({ sounds: [], error: "โหลดชุดเสียงไม่สำเร็จ" }, { status: 500 });
  const sounds = ((data ?? []) as unknown as (Omit<Row, "audio_data" | "prev_audio_data"> & { has_audio: string | null; has_prev: string | null })[]).map((r) => ({
    key: r.key, volume: Number(r.volume), audio_name: r.audio_name, duration_ms: r.duration_ms, has_audio: !!r.has_audio,
    has_prev: !!r.has_prev, prev_audio_name: r.prev_audio_name, updated_at: r.updated_at, updated_by_name: r.updated_by_name,
  }));
  return NextResponse.json({ sounds, can_manage: await apiCan(request, "packing.manage"), error: null }, { headers: noStore });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "packing.manage"); if (denied) return denied;
  const admin = supabaseAdmin();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isPackSound(body.key)) return NextResponse.json({ error: "ไม่รู้จักเสียงนี้" }, { status: 400 });
  const key = body.key;

  const { data: cur } = await admin.from("packing_sounds").select("*").eq("key", key).maybeSingle();
  const old = (cur as Row | null) ?? { key, volume: 1, audio_data: null, audio_name: null, duration_ms: null, prev_audio_data: null, prev_audio_name: null, prev_duration_ms: null, updated_at: "", updated_by_name: null };
  const next: Omit<Row, "updated_at" | "updated_by_name"> = { ...old };

  if (body.volume !== undefined) next.volume = clampVolume(body.volume);
  if (body.restore_prev === true) {
    if (!old.prev_audio_data && !old.audio_data) return NextResponse.json({ error: "ไม่มีเสียงก่อนหน้าให้ย้อน" }, { status: 400 });
    // สลับเสียงปัจจุบันกับเสียงก่อนหน้า (กดซ้ำ = กลับมาเหมือนเดิม)
    Object.assign(next, { audio_data: old.prev_audio_data, audio_name: old.prev_audio_name, duration_ms: old.prev_duration_ms, prev_audio_data: old.audio_data, prev_audio_name: old.audio_name, prev_duration_ms: old.duration_ms });
  } else if (body.audio !== undefined) {
    if (body.audio !== null && !isValidSoundData(body.audio)) return NextResponse.json({ error: "ไฟล์เสียงไม่ถูกต้องหรือใหญ่เกิน — ลองเลือกใหม่" }, { status: 400 });
    const dur = Math.round(Number(body.duration_ms) || 0);
    if (dur > SOUND_MAX_SEC * 1000 + 50) return NextResponse.json({ error: `เสียงยาวเกิน ${SOUND_MAX_SEC} วิ` }, { status: 400 });
    // เก็บเสียงเดิม (รวมถึง "เสียงเดิมของระบบ" = null) ไว้ชั้นก่อนหน้า → restore_prev = ย้อนการเปลี่ยนครั้งล่าสุดได้พอดี
    if ((body.audio ?? null) !== old.audio_data) Object.assign(next, { prev_audio_data: old.audio_data, prev_audio_name: old.audio_name, prev_duration_ms: old.duration_ms });
    Object.assign(next, body.audio === null
      ? { audio_data: null, audio_name: null, duration_ms: null }
      : { audio_data: body.audio, audio_name: String(body.audio_name ?? "ไฟล์เสียง").slice(0, 120), duration_ms: dur || null });
  }

  const changes = auditDiff(
    { volume: old.volume, sound: fileLabel(old.audio_name, !!old.audio_data) },
    { volume: next.volume, sound: fileLabel(next.audio_name, !!next.audio_data) },
  );
  const audioChanged = next.audio_data !== old.audio_data;
  if (!changes.length && !audioChanged) return NextResponse.json({ ok: true, unchanged: true, error: null });

  const me = await whoAmI(request, admin);
  const { error } = await admin.from("packing_sounds").upsert({ ...next, key, updated_by: me.id, updated_by_name: me.name, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: "บันทึกเสียงไม่สำเร็จ" }, { status: 500 });
  await writeAudit(admin, {
    action: "packing.sound_update", entityType: "packing_sounds", entityId: key, actorId: me.id, actorName: me.name,
    metadata: { changes: changes.length ? changes : [{ field: "sound", old: fileLabel(old.audio_name, !!old.audio_data), new: `${fileLabel(next.audio_name, !!next.audio_data)} (ไฟล์ใหม่)` }], restore_prev: body.restore_prev === true || undefined },
  });
  return NextResponse.json({ ok: true, error: null });
}
