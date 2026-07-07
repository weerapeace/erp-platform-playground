/**
 * /api/cron/subscriptions-renewals — เช็ค subscription ที่ใกล้ต่ออายุ แล้วแจ้งเตือน
 *
 * เรียกได้ 3 ทาง:
 *   1. Vercel Cron (header x-vercel-cron) — ตั้งใน vercel.json (รายวัน)
 *   2. CRON_SECRET (Authorization: Bearer <CRON_SECRET>) ถ้าตั้ง env ไว้
 *   3. แอดมินกดปุ่ม "ทดสอบแจ้งเตือน" (guardApi subscriptions.edit)
 *
 * ช่องทางแจ้ง: กระดิ่ง (erp_notify → admin) + LINE (กลุ่มหลัก line_config.group_id)
 * ไม่ต้อง dedupe — ยึดเกณฑ์วัน RENEWAL_THRESHOLDS (cron วันละครั้ง → แต่ละเกณฑ์เด้งครั้งเดียว)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import {
  nextRenewal, daysUntil, fmtCost, RENEWAL_THRESHOLDS, type Subscription,
} from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://erp-platform-playground.vercel.app").replace(/\/$/, "");

type Due = { id: string; name: string; days: number; date: string; cost: string };

async function pushLineGroup(admin: ReturnType<typeof supabaseAdmin>, text: string): Promise<boolean> {
  try {
    const { data } = await admin.from("china_app_settings").select("sval").eq("skey", "line_config").maybeSingle();
    const cfg = ((data as { sval?: { token?: string; group_id?: string } } | null)?.sval ?? {});
    if (!cfg.token || !cfg.group_id) return false;
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ to: cfg.group_id, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
    });
    return res.ok;
  } catch { return false; }
}

async function runCheck(): Promise<{ checked: number; due: Due[]; lineSent: boolean; bellSent: boolean }> {
  const db = supabaseAdmin();

  const { data: subs } = await db.from("subscriptions").select("*").eq("active", true);
  const rows = (subs ?? []) as Subscription[];

  const due: Due[] = [];
  for (const s of rows) {
    if (!s.billing_date) continue;
    const nr = nextRenewal(s);
    const d = daysUntil(nr);
    if (d === null || !RENEWAL_THRESHOLDS.includes(d)) continue;
    due.push({ id: s.id, name: s.name, days: d, date: nr ?? "", cost: fmtCost(Number(s.cost), s.currency) });
  }

  let bellSent = false, lineSent = false;
  if (due.length > 0) {
    // กระดิ่ง — ส่งหา admin ทุกคน (1 การ์ด/รายการ)
    const { data: admins } = await db.from("user_profiles").select("id").eq("role", "admin").eq("active", true);
    const ids = (admins ?? []).map((a) => a.id as string);
    if (ids.length > 0) {
      for (const x of due) {
        const when = x.days < 0 ? `เลยกำหนด ${-x.days} วัน` : x.days === 0 ? "ครบกำหนดวันนี้" : `อีก ${x.days} วัน`;
        try {
          await db.rpc("erp_notify", {
            p_user_ids: ids,
            p_event_type: "subscription.renewal_soon",
            p_title: `⏰ ใกล้ต่ออายุ: ${x.name}`,
            p_body: `${x.name} · ${x.cost} · ต่ออายุ ${x.date} (${when})`,
            p_link_url: "/subscriptions",
            p_entity_type: "subscriptions",
            p_entity_id: null,
            p_priority: x.days <= 1 ? "high" : "normal",
          });
          bellSent = true;
        } catch { /* เงียบ */ }
      }
    }

    // LINE — รวมเป็นข้อความเดียว (ประหยัดโควตา)
    const lines = due
      .sort((a, b) => a.days - b.days)
      .map((x) => {
        const when = x.days < 0 ? `เลย ${-x.days} วัน` : x.days === 0 ? "วันนี้" : `อีก ${x.days} วัน`;
        return `• ${x.name} — ${x.cost}\n  📅 ${x.date} (${when})`;
      })
      .join("\n");
    const msg = `⏰ Subscription ใกล้ต่ออายุ (${due.length} รายการ)\n${lines}\n🔗 ${APP_URL}/subscriptions`;
    lineSent = await pushLineGroup(db, msg);
  }

  return { checked: rows.length, due, lineSent, bellSent };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const isVercelCron = request.headers.get("x-vercel-cron") != null;
  const secretOk = !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!isVercelCron && !secretOk) {
    const guard = await guardApi(request, "subscriptions.edit"); // แอดมินกดทดสอบเองได้
    if (guard) return guard;
  }

  try {
    const result = await runCheck();
    return NextResponse.json({ ok: true, ...result, error: null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
