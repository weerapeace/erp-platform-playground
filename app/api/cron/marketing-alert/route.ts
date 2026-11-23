/**
 * /api/cron/marketing-alert — เตือนเรื่องการตลาดทุกเช้า (vercel.json 02:20 UTC = 09:20 เวลาไทย)
 * เจ้าของเลือก 2026-11-23 (หน้าภาพรวมการตลาด รอบ 1 · ข้อเสนอ "แจ้งเตือนในระบบ")
 *
 * คิดด้วยกติกาเดียวกับกล่อง "ต้องจัดการ" บนหน้า /marketing/dashboard (lib/marketing-alerts-server → buildMarketingAlerts):
 *   ยอดช้ากว่าเป้า · ยอดเมื่อวานตกผิดปกติ · ยกเลิกเพราะฝั่งร้าน 7 วัน · สินค้าขายดีกำลังตก (เรื่องนี้แค่แนบ ไม่ทำให้ส่ง)
 * มีเรื่องระดับเตือน/ด่วน → กระดิ่ง 1 ข้อความรวม ถึงคนรับตามกฎ "marketing.alert" (ไม่มีกฎ = แอดมิน · ปิดกฎ = ไม่ส่ง — lib/notify-recipients)
 * ส่งวันละครั้ง · ไม่ส่ง LINE (มีตัวเลขยอดขาย)
 * เรียกได้ 2 ทาง: Vercel Cron (lib/cron-auth) · คนมีสิทธิ์ marketing.dashboard.view เรียกเอง = ดูผลอย่างเดียว ไม่ส่ง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { ruleRecipients } from "@/lib/notify-recipients";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { computeMarketingAlerts } from "@/lib/marketing-alerts-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const EVENT = "marketing.alert";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cron = isTrustedCron(request);
  if (!cron) { const denied = await guardApi(request, "marketing.dashboard.view"); if (denied) return denied; }
  const admin = supabaseAdmin();
  const note = (r: { ok: boolean; summary?: string; error?: string; warn?: boolean }) => (cron ? recordWorkerRun(admin, "marketing-alert", r) : Promise.resolve());
  try {
    const alerts = await computeMarketingAlerts(admin);
    const urgent = alerts.filter((a) => a.level !== "info");
    if (!cron) return NextResponse.json({ ok: true, dry: true, alerts, wouldSend: urgent.length > 0, error: null });
    if (!urgent.length) { await note({ ok: true, summary: "ไม่มีเรื่องต้องเตือน" }); return NextResponse.json({ ok: true, sent: 0, error: null }); }

    // วันละครั้งพอ
    const thStart = new Date(Date.parse(`${new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)}T00:00:00+07:00`)).toISOString();
    const { count } = await admin.from("erp_notifications").select("id", { count: "exact", head: true }).eq("event_type", EVENT).gte("created_at", thStart);
    if ((count ?? 0) > 0) { await note({ ok: true, summary: `มี ${urgent.length} เรื่อง (เตือนไปแล้ววันนี้)` }); return NextResponse.json({ ok: true, sent: 0, already: true, error: null }); }

    const { ids } = await ruleRecipients(admin, EVENT);
    let sent = 0;
    if (ids.length) {
      const title = urgent.length === 1 ? `การตลาด: ${urgent[0].title}` : `การตลาด: ${urgent.length} เรื่องต้องดู — ${urgent[0].title}`;
      const body = alerts.map((a) => `• ${a.title} — ${a.body}`).join("\n");
      const { error } = await admin.rpc("erp_notify", {
        p_user_ids: ids, p_event_type: EVENT, p_title: title, p_body: body,
        p_link_url: `/marketing/dashboard?tab=${urgent[0].tab}`, p_entity_type: "marketing", p_entity_id: null,
        p_priority: urgent.some((a) => a.level === "danger") ? "high" : "normal",
      });
      if (error) { console.error("[cron/marketing-alert] erp_notify:", error.message); await note({ ok: false, error: "ส่งกระดิ่งไม่สำเร็จ" }); return NextResponse.json({ ok: false, error: "ส่งกระดิ่งไม่สำเร็จ" }, { status: 500 }); }
      sent = ids.length;
    }
    await note({ ok: true, summary: `เตือน ${urgent.length} เรื่อง ถึง ${sent} คน` });
    return NextResponse.json({ ok: true, sent, error: null });
  } catch (e) {
    console.error("[cron/marketing-alert]", e);
    await note({ ok: false, error: "คิดแจ้งเตือนไม่สำเร็จ" });
    return NextResponse.json({ ok: false, error: "คิดแจ้งเตือนไม่สำเร็จ" }, { status: 500 });
  }
}
