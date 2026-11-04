/**
 * 🔔 เตือนอัลบั้ม Contents ที่ค้าง — /api/cron/content-album-reminders
 *
 * ทุกวัน 09:30 เวลาไทย (vercel.json) · กติกา lib/content-album-status albumReminder:
 *   เลยวันที่ต้องลง · ต้องลงพรุ่งนี้ · "รอจัดการ" เกิน 3 วัน (ลงแล้ว/ปิดแล้ว ไม่เตือน)
 * ส่งกระดิ่งในระบบ (erp_notify ของกลาง) "คนละ 1 ข้อความ/วัน" สรุปทุกอัลบั้มของคนนั้น (กันสแปม)
 *   ผู้รับ = ผู้รับผิดชอบอัลบั้ม · อัลบั้มที่ไม่มีผู้รับผิดชอบ = ผู้จัดการ + แอดมิน
 * ?dry=1 = ดูว่าจะเตือนใคร ไม่ส่งจริง · เรียกได้ 2 ทาง: Vercel Cron (lib/cron-auth) หรือคนที่มีสิทธิ์ assets.manage
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { loadContentAlbums } from "@/lib/content-albums-server";
import { albumReminder, bangkokToday, ALBUM_REMINDER_META, type AlbumReminder } from "@/lib/content-album-status";
import { recordWorkerRun } from "@/lib/ai-office-runs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const LINK = "/master/assets?source=contents";
const ORDER: AlbumReminder[] = ["overdue", "due_soon", "stale"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isTrustedCron(request)) {
    const denied = await guardApi(request, "assets.manage");
    if (denied) return denied;
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const admin = supabaseAdmin();
  const today = bangkokToday();
  const albums = await loadContentAlbums(admin);
  const hits = albums
    .map((a) => ({ a, why: albumReminder({ stage: a.status.stage, created_at: a.created_at, due_date: a.due_date, phase: a.phase }, today) }))
    .filter((h): h is { a: typeof h.a; why: AlbumReminder } => !!h.why)
    .sort((x, y) => ORDER.indexOf(x.why) - ORDER.indexOf(y.why));
  if (!hits.length) {
    if (!dry) await recordWorkerRun(admin, "album-reminders", { ok: true, summary: "ไม่มีอัลบั้มค้าง ไม่ต้องเตือน" });
    return NextResponse.json({ data: { today, albums: 0, users: 0, sent: 0 }, error: null });
  }

  // อัลบั้มไม่มีผู้รับผิดชอบ → ผู้จัดการ + แอดมินที่ยังใช้งานอยู่
  let leads: string[] = [];
  if (hits.some((h) => !h.a.assignee_ids.length)) {
    const { data } = await admin.from("user_profiles").select("id").in("role", ["admin", "manager"]).eq("active", true);
    leads = ((data ?? []) as { id: string }[]).map((u) => u.id);
  }
  const byUser = new Map<string, typeof hits>();
  for (const h of hits) for (const uid of (h.a.assignee_ids.length ? h.a.assignee_ids : leads))
    (byUser.get(uid) ?? byUser.set(uid, []).get(uid)!).push(h);

  const plan = [...byUser.entries()].map(([uid, list]) => {
    const first = list[0];
    const title = list.length === 1
      ? `อัลบั้ม “${first.a.name}” ${ALBUM_REMINDER_META[first.why].th}`
      : `อัลบั้ม Contents รอคุณ ${list.length} อัลบั้ม`;
    const body = list.slice(0, 5).map((h) => `• ${h.a.name} — ${ALBUM_REMINDER_META[h.why].th}`).join("\n") + (list.length > 5 ? `\n… อีก ${list.length - 5} อัลบั้ม` : "");
    return { uid, title: title.slice(0, 200), body, link: list.length === 1 ? `${LINK}&album=${first.a.id}` : LINK, entityId: list.length === 1 ? first.a.id : null, high: list.some((h) => h.why === "overdue") };
  });
  if (dry) return NextResponse.json({ data: { today, albums: hits.length, users: plan.length, sent: 0, plan }, error: null });

  let sent = 0;
  for (const n of plan) {
    const { error } = await admin.rpc("erp_notify", {
      p_user_ids: [n.uid], p_event_type: "content_album.reminder", p_title: n.title, p_body: n.body,
      p_link_url: n.link, p_entity_type: "content_album", p_entity_id: n.entityId, p_priority: n.high ? "high" : "normal",
    });
    if (!error) sent++; else console.error("[content-album-reminders] notify", error.message);
  }
  await recordWorkerRun(admin, "album-reminders", sent < plan.length
    ? { ok: false, error: `ส่งเตือนได้ ${sent}/${plan.length} คน` }
    : { ok: true, summary: `เตือน ${sent} คน เรื่องอัลบั้มค้าง ${hits.length} อัลบั้ม` });
  return NextResponse.json({ data: { today, albums: hits.length, users: plan.length, sent }, error: null });
}
