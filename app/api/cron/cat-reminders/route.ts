/**
 * /api/cron/cat-reminders — 🐾 เตือนเรื่องแมวเข้ากลุ่ม LINE ทุกเช้า 08:00 (vercel.json "0 1 * * *")
 *
 * เรียกได้ 2 ทาง:
 *   1. Vercel Cron (lib/cron-auth) — ส่งเฉพาะเมื่อเปิดแจ้งเตือนในแอป + วันนี้มีเรื่องถึงจุดเตือน (lib/cats-notify)
 *   2. ปุ่ม "ส่งทดสอบตอนนี้" ในแอป (?test=1 · guardApi cats.edit) — ส่งทุกเรื่องที่อยู่ในช่วงเตือน แม้ยังไม่เปิดแจ้งเตือน
 * ปลายทาง: กลุ่ม slot "cats" ที่ตั้งในศูนย์ LINE (/admin/line) — ไม่ตั้ง = ไม่ส่ง (ไม่ตกไปกลุ่มบริษัท)
 * สวิตช์ปิด/เปิดจากศูนย์ LINE = เหตุการณ์ "cat_reminder" · ส่งผ่านตัวส่งกลาง lib/line-send · 1 ข้อความ/วัน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { writeAuditFor } from "@/lib/audit";
import { todayBangkok } from "@/lib/date";
import { CAT_KINDS, CATS_EDIT, type CatKind, type CatsData } from "@/lib/cats";
import { asNotify } from "@/lib/cats-supplies";
import { digestLines, digestText } from "@/lib/cats-notify";
import { lineEventEnabled } from "@/lib/line-registry";
import { lineErrorText, linePush, lineText, loadLineConfig } from "@/lib/line-send";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://erp-platform-playground.vercel.app").replace(/\/$/, "");

export async function GET(request: NextRequest) {
  const test = new URL(request.url).searchParams.get("test") === "1";
  const fromCron = isTrustedCron(request);
  if (!fromCron || test) {
    const denied = await guardApi(request, CATS_EDIT); if (denied) return denied;
  }
  const admin = supabaseAdmin();
  try {
    const { data: rows } = await admin.from("cat_settings").select("key, value");
    const settings = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]));
    const notify = asNotify(settings.notify);
    if (!test && !notify.enabled) return NextResponse.json({ ok: true, sent: false, reason: "ยังไม่เปิดแจ้งเตือน", error: null });

    const kinds = Object.keys(CAT_KINDS) as CatKind[];
    const res = await Promise.all(kinds.map((k) => admin.from(CAT_KINDS[k].table).select("*").eq("is_active", true).limit(5000)));
    const bad = res.find((r) => r.error);
    if (bad?.error) throw new Error(bad.error.message);
    const data = Object.fromEntries(kinds.map((k, i) => [k, res[i].data ?? []])) as unknown as CatsData;

    const today = todayBangkok();
    const lines = digestLines(data, settings.meal_plan, notify, today, test);
    const text = digestText(lines, today, APP_URL);
    if (!text) return NextResponse.json({ ok: true, sent: false, lines: 0, reason: test ? "ตอนนี้ไม่มีเรื่องที่อยู่ในช่วงเตือน" : "วันนี้ไม่มีเรื่องต้องเตือน", error: null });

    const cfg = await loadLineConfig(admin);
    const group = cfg.groups?.cats;
    if (!group) return NextResponse.json({ ok: false, sent: false, lines: lines.length, error: "ยังไม่ได้ตั้งกลุ่ม LINE ของแมว — ตั้งที่ ศูนย์ LINE → กลุ่มแมว" }, { status: fromCron ? 200 : 400 });
    if (!lineEventEnabled(cfg.disabled_events, "cat_reminder")) return NextResponse.json({ ok: true, sent: false, lines: lines.length, reason: "ปิดแจ้งเตือนแมวไว้ที่ศูนย์ LINE", error: null });

    const r = await linePush(cfg, { to: group, slot: "cats", messages: [lineText(text)] });
    if (test) await writeAuditFor(request, admin, { action: "notify_test", entityType: "cat_settings", entityId: null, metadata: { lines: lines.length, ok: r.ok, status: r.status } });
    if (!r.ok) return NextResponse.json({ ok: false, sent: false, lines: lines.length, error: r.error || lineErrorText(r.status) }, { status: fromCron ? 200 : 502 });
    return NextResponse.json({ ok: true, sent: true, lines: lines.length, error: null });
  } catch (e) {
    return NextResponse.json({ ok: false, sent: false, error: e instanceof Error ? e.message : "ส่งไม่สำเร็จ" }, { status: 500 });
  }
}
