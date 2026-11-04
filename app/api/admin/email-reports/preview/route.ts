/**
 * 📧 ดูตัวอย่างอีเมลรายงาน (ข้อมูลจริง ณ ตอนนี้ · ไม่ส่งจริง)
 * POST /api/admin/email-reports/preview  body: ค่าฟอร์ม (ยังไม่บันทึกก็ได้) → { subject, html, total, shown, fill, error }
 * fill = จำนวนงานที่มีข้อมูลแต่ละช่องจริง (หน้าตั้งค่าโชว์ข้างชื่อช่องใน "โชว์อะไรในอีเมล")
 * ?format=png → รูปรายงานที่จะส่งเข้า Discord (image/png · กริดขายดีถ้า discord.look=grid และแหล่งมี spotlight · ไม่งั้นตาม discord.image_rows) — ดูได้แม้ยังไม่ตั้งบอท
 * ?format=popup → { data: WorkPopupPayload } ตัวอย่างป๊อปตอนเข้า ERP (lib/email-report/popup)
 * ?format=discord → { content, cards, has_image, role_name, channel_name, ready } ข้อความ Discord ที่จะส่ง (composeDiscordReport) — หน้าตั้งค่าวาดเป็นหน้าแชทจำลอง
 * ?format=line → { header, sub, rows, more, link, style, cards, stats } ข้อความ LINE ที่จะส่ง (composeLineReport) — หน้าตั้งค่าวาดเป็นกล่อง/การ์ดปัดดูจำลอง
 * ไม่ตรวจผู้รับ/สวิตช์เปิด — ดูหน้าตาได้แม้ยังไม่ใส่ผู้รับ · สิทธิ์: admin.email_reports
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { normalizeReportDiscord, normalizeReportInput, normalizeReportLine, normalizeReportOptions, normalizeReportPopup } from "@/lib/email-report/shared";
import { composeLineReport } from "@/lib/email-report/line";
import { statText } from "@/lib/email-report/render";
import { buildReportEmail } from "@/lib/email-report/sources";
import { renderGridPng, renderReportPng } from "@/lib/email-report/image";
import { buildPopupPayload } from "@/lib/email-report/popup";
import { composeDiscordReport } from "@/lib/email-report/discord";
import { discordReady } from "@/lib/discord";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.email_reports"); if (denied) return denied;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  // ตัวอย่าง: ไม่บังคับผู้รับ/สวิตช์/ห้อง Discord — ปิดก่อนตรวจ จะได้ไม่โดน "ยังไม่มีผู้รับ"
  const parsed = normalizeReportInput({ ...(body ?? {}), discord: {}, popup: {}, line: {}, is_enabled: false, name: String(body?.name ?? "").trim() || "ตัวอย่างรายงาน" });
  if ("error" in parsed) return NextResponse.json({ subject: "", html: "", total: 0, shown: 0, error: parsed.error }, { status: 400 });
  try {
    // 🔔 ตัวอย่างป๊อปตอนเข้า ERP (มุมมองคนที่เห็นทั้งป๊อป · "งานของคุณ" = ของคนที่กดดู) — ไม่สนวัน/เวลา/รับทราบ
    if (request.nextUrl.searchParams.get("format") === "popup") {
      const actor = await requestActor(supabaseFromRequest(request));
      const data = await buildPopupPayload(supabaseAdmin(), { ...parsed.value, id: "preview", popup: normalizeReportPopup(body?.popup) }, actor.id ?? "", "all", { fresh: true, force: true });
      return NextResponse.json({ data, error: null });
    }
    const { built, email } = await buildReportEmail(supabaseAdmin(), parsed.value);
    // 🟢 ตัวอย่างกล่อง LINE (ตัวประกอบเดียวกับตอนส่งจริง)
    if (request.nextUrl.searchParams.get("format") === "line") {
      const cfg = normalizeReportLine(body?.line);
      const m = composeLineReport(built, cfg, { subject: email.subject });
      return NextResponse.json({ header: m.header, sub: m.sub, rows: m.rows, more: m.more, link: m.link, link_label: m.linkLabel, alt: m.altText, group_name: cfg.group_name, empty: built.total === 0 ? built.emptyText : null, style: m.style, cards: m.cards, stats: built.stats.map((st) => ({ label: st.label, value: statText(st), hint: st.hint ?? null, good: st.tone === "good" })), total: built.total, unit: built.unit ?? "งาน", error: null });
    }
    // 💬 ตัวอย่างข้อความ Discord (ข้อความ 1 + การ์ดติ๊ก) — ตัวประกอบเดียวกับตอนส่งจริง · รูปดึงแยกที่ ?format=png
    if (request.nextUrl.searchParams.get("format") === "discord") {
      const cfg = normalizeReportDiscord(body?.discord);
      const ready = discordReady();
      const { content, cards } = await composeDiscordReport(supabaseAdmin(), cfg, built, { test: false, subject: email.subject, buttons: true });
      return NextResponse.json({
        content, cards, has_image: built.total > 0, role_name: cfg.role_name, channel_name: cfg.channel_name,
        files: cfg.attach_excel && built.export && built.total > 0 ? [built.export.filename] : [],
        ready: { bot: ready.bot, buttons: ready.buttons }, error: null,
      });
    }
    if (request.nextUrl.searchParams.get("format") === "png") {
      try {
        const dcfg = normalizeReportDiscord(body?.discord);
        const png = dcfg.look === "grid" && (built.spotlight?.length ?? 0) > 0
          ? await renderGridPng(built, { reportName: parsed.value.name, count: 9 })
          : await renderReportPng(built, { reportName: parsed.value.name, maxRows: dcfg.image_rows });
        return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
      } catch (e) {
        console.error("[email-reports/preview] png", e);
        return NextResponse.json({ error: "วาดรูปรายงานไม่สำเร็จ — ตอนส่งจริงระบบจะส่งตัวเลขสรุปแทนรูป" }, { status: 500 });
      }
    }
    const attach = normalizeReportOptions(parsed.value.source_key, parsed.value.options).attach_excel && built.export && built.total > 0 ? built.export.filename : null;
    return NextResponse.json({ subject: email.subject, html: email.html, total: built.total, shown: built.shown, fill: built.fieldFill ?? {}, attachment: attach, error: null });
  } catch (e) {
    console.error("[email-reports/preview]", e);
    return NextResponse.json({ subject: "", html: "", total: 0, shown: 0, error: "ดึงข้อมูลตัวอย่างไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}
