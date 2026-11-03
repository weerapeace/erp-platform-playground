/**
 * /api/cron/cashflow-alert — เตือน "เงินจะต่ำกว่าเงินกันขั้นต่ำ" ทุกเช้า (vercel.json 01:05 UTC = 08:05 เวลาไทย)
 *
 * คิดกระแสเงินสดชุดเดียวกับหน้า /cashflow (lib/cashflow-server loadCashflow) ล่วงหน้า alertDays วัน แล้วหาวันแรกที่ต่ำกว่า safetyBuffer (lib/cashflow findLowCash)
 * ต่ำกว่า → กระดิ่งถึงแอดมินทุกคน (erp_notify · ถ้าเปิดแอปแจ้งเตือนบนมือถือไว้ เด้งที่มือถือด้วย) · ไม่ต่ำ = ไม่ส่งอะไร
 * ไม่ส่ง LINE: ข้อมูลเงินห้ามเข้ากลุ่มที่มีพนักงาน + โควตา LINE ฟรีมีแค่ 300/เดือน
 * ยังไม่กรอกยอดเงินในบัญชี = ข้าม (เส้นเริ่มจากศูนย์ จะเตือนมั่วทุกวัน)
 *
 * เรียกได้ 2 ทาง: Vercel Cron (lib/cron-auth) · คนมีสิทธิ์ cashflow.manage กดทดสอบ ?dry=1 = ดูผลอย่างเดียว ไม่ส่ง (ปุ่มในแท็บตั้งค่า)
 * ค่าตั้ง: /api/cashflow/settings (lib/cashflow-settings)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { loadCashflow } from "@/lib/cashflow-server";
import { THB, addDaysISO, buildDailySeries, findLowCash, formatDayMonthTH, todayISO } from "@/lib/cashflow";
import { CASHFLOW_SETTINGS_KEY, cleanCashflowSettings } from "@/lib/cashflow-settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** วันเครดิตตั้งต้นที่ใช้เดา (เอกสารที่ยังไม่ตั้งเครดิต) — ค่าเดียวกับหน้า /cashflow */
const GUESS_DAYS = 30;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cron = isTrustedCron(request);
  if (!cron) { const denied = await guardApi(request, "cashflow.manage"); if (denied) return denied; }
  const dry = !cron || new URL(request.url).searchParams.get("dry") === "1";   // คนกดเอง = ดูผลอย่างเดียวเสมอ

  try {
    const admin = supabaseAdmin();
    const { data: st } = await admin.from("china_app_settings").select("sval").eq("skey", CASHFLOW_SETTINGS_KEY).maybeSingle();
    const settings = cleanCashflowSettings((st as { sval?: unknown } | null)?.sval);
    if (!settings.alertEnabled) return NextResponse.json({ ok: true, dry, skipped: "ปิดการแจ้งเตือนไว้", settings, error: null });

    const from = todayISO(), to = addDaysISO(from, settings.alertDays);
    const cf = await loadCashflow(admin, { from, to, incomeBasis: "both", customerDefaultDays: GUESS_DAYS, supplierDefaultDays: GUESS_DAYS, rmbRateParam: 0 });
    if (!cf.meta.openingAccounts.length) {
      return NextResponse.json({ ok: true, dry, skipped: "ยังไม่ได้กรอกยอดเงินในบัญชี — เตือนไม่ได้ (เส้นเริ่มจากศูนย์)", settings, error: null });
    }
    const series = buildDailySeries(cf.events, cf.meta.openingBalance, from, to);
    const check = findLowCash(series, settings.safetyBuffer, from);

    // วงเงิน OD ที่ยังเบิกได้ — บอกในข้อความว่าพอรับไหม
    const { data: ods } = await admin.from("od_facilities").select("limit_amount, current_used_amount").not("is_active", "is", false);
    const odHeadroom = ((ods ?? []) as Record<string, unknown>[]).reduce((s, o) => s + Math.max(0, num(o.limit_amount) - num(o.current_used_amount)), 0);

    let sent = 0;
    if (check.first && !dry) {
      const { data: admins } = await admin.from("user_profiles").select("id").eq("role", "admin").eq("active", true);
      const ids = ((admins ?? []) as { id: string }[]).map((a) => a.id);
      const days = Math.max(0, Math.round((Date.parse(check.first.date) - Date.parse(from)) / 86400000));
      const title = days === 0 ? "เงินต่ำกว่าเงินกันขั้นต่ำแล้ววันนี้" : `อีก ${days} วันเงินจะต่ำกว่าเงินกันขั้นต่ำ`;
      const body = `วันที่ ${formatDayMonthTH(check.first.date)} คงเหลือ ${THB(check.first.balance)} (ขั้นต่ำ ${THB(settings.safetyBuffer)})`
        + ` · ต่ำสุด ${THB(check.low.balance)} วันที่ ${formatDayMonthTH(check.low.date)} · ต้องหาเงินเพิ่ม ${THB(check.shortfall)}`
        + (odHeadroom > 0 ? ` · OD ยังเบิกได้ ${THB(odHeadroom)}` : "");
      if (ids.length) {
        const { error } = await admin.rpc("erp_notify", {
          p_user_ids: ids, p_event_type: "cashflow.low_cash", p_title: title, p_body: body,
          p_link_url: "/cashflow", p_entity_type: "cashflow", p_entity_id: null, p_priority: "high",
        });
        if (!error) sent = ids.length;
        else console.error("[cron/cashflow-alert] erp_notify:", error.message);
      }
    }
    return NextResponse.json({
      ok: true, dry, from, to, settings, opening: cf.meta.openingBalance, startBalance: series.startBalance,
      first: check.first, low: check.low, shortfall: check.shortfall, odHeadroom, sent, error: null,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
