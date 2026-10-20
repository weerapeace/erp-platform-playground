/**
 * 📧 แหล่งข้อมูลของอีเมลรายงาน (ของกลาง · ฝั่งเซิร์ฟเวอร์เท่านั้น)
 * แต่ละแหล่ง = ฟังก์ชันที่ดึงข้อมูลจริงแล้วประกอบเป็น BuiltReport (หน้าตาอีเมลกลางเดียวกัน: lib/email-report/render)
 * เพิ่มรายงานแบบใหม่ = เพิ่มฟังก์ชันที่นี่ + ชื่อใน EMAIL_REPORT_SOURCES (lib/email-report/shared)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { buildStatusMeta, isOwnBrandJob, type WfStatusRow } from "@/lib/design-sheets-meta";
import { designSheetCoverMap } from "@/lib/design-sheet-covers";
import { withImageWidth } from "@/lib/r2-image";
import { absoluteUrl } from "@/lib/app-url";
import { describeDays, type EmailReportFilters, type EmailReportInput, type EmailReportOptions } from "@/lib/email-report/shared";
import { renderReportEmail, type BuiltReport, type ReportRow, type ReportSection, type ReportTone } from "@/lib/email-report/render";

type Admin = ReturnType<typeof supabaseAdmin>;
type SourceFn = (admin: Admin, filters: EmailReportFilters, options: EmailReportOptions) => Promise<BuiltReport>;

// ---- วันที่ตามเวลาไทย (เซิร์ฟเวอร์เป็น UTC — ห้ามใช้ toISOString ตรง ๆ จะร่นไป 1 วัน) ----
const todayTH = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const dateTH = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000);
const thShort = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });

// ============================================================
// ใบงานออกแบบที่ค้าง — สถานะที่ยังไม่ "ปิดงาน" (Workflow กลาง) · แยกตามสถานะ · เรียงเกินกำหนด → ใกล้กำหนด → ไม่ขยับนานสุด
// ============================================================
const designSheetsPending: SourceFn = async (admin, filters, options) => {
  const maxRows = options.max_rows ?? 50;
  const staleDays = options.stale_days ?? 7;
  const today = todayTH();

  const { data: stRows } = await admin.from("erp_workflow_states")
    .select("state_key, label, color, is_terminal, customer_only")
    .eq("entity_type", "design_sheet").order("sort_order", { ascending: true });
  const meta = buildStatusMeta((stRows ?? []) as WfStatusRow[]);
  const pending = meta.opts.filter(([k]) => !meta.finished.has(k));
  const wanted = filters.statuses?.length ? pending.filter(([k]) => filters.statuses!.includes(k)) : pending;

  const groupLabel = filters.brand_group === "customer" ? " (งานลูกค้า)" : filters.brand_group === "own" ? " (แบรนด์เรา)" : "";
  const base: Omit<BuiltReport, "total" | "shown" | "stats" | "sections"> = {
    heading: `งานออกแบบที่ค้างอยู่${groupLabel}`,
    subjectCore: "",
    viewAllLink: absoluteUrl("/master/design-dashboard"),
    viewAllLabel: "ดูทั้งหมดในแผนที่ภารกิจงานออกแบบ",
    emptyText: "ไม่มีงานออกแบบค้าง เยี่ยมมาก 🎉",
  };

  type Sheet = { id: string; code: string; name: string; status: string; deadline: string | null; note: string | null; updated_at: string; brand_id: string | null; brand: { name?: string | null; is_customer_job?: boolean | null } | null };
  let sheets: Sheet[] = [];
  if (wanted.length > 0) {
    let q = admin.from("design_sheets")
      .select("id, code, name, status, deadline, note, updated_at, brand_id, brand:brands!brand_id(name, is_customer_job)")
      .not("is_active", "is", false)          // ห้ามใช้ .neq(false) — ตัดแถว null ทิ้ง
      .in("status", wanted.map(([k]) => k))
      .limit(2000);
    if (filters.brand_ids?.length) q = q.in("brand_id", filters.brand_ids);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    sheets = ((data ?? []) as unknown as Array<Sheet & { brand: Sheet["brand"] | Sheet["brand"][] }>)
      .map((s) => ({ ...s, brand: Array.isArray(s.brand) ? s.brand[0] ?? null : s.brand }));
  }
  // กลุ่มแบรนด์: กฎกลางเดียวกับบอร์ด (ไม่ระบุแบรนด์ = งานลูกค้า)
  if (filters.brand_group === "own" || filters.brand_group === "customer") {
    const wantOwn = filters.brand_group === "own";
    sheets = sheets.filter((s) => isOwnBrandJob(s.brand_id ? s.brand : null) === wantOwn);
  }

  // คำนวณป้าย + ลำดับ
  const enriched = sheets.map((s) => {
    const daysLeft = s.deadline ? dayDiff(s.deadline, today) : null;
    const stale = Math.max(0, dayDiff(today, dateTH(s.updated_at)));
    let flag: { text: string; tone: ReportTone };
    if (daysLeft !== null && daysLeft < 0) flag = { text: `เกินกำหนด ${-daysLeft} วัน`, tone: "danger" };
    else if (daysLeft === 0) flag = { text: "ครบกำหนดวันนี้", tone: "warn" };
    else if (daysLeft !== null && daysLeft <= 3) flag = { text: `อีก ${daysLeft} วันถึงกำหนด`, tone: "warn" };
    else if (stale === 0) flag = { text: "อัปเดตวันนี้", tone: "good" };
    else flag = { text: `ไม่ขยับ ${stale} วัน`, tone: stale >= staleDays ? "warn" : "muted" };
    // เกินกำหนดก่อน (เกินมากสุดก่อน) → ใกล้กำหนด → ไม่ขยับนานสุด
    const rank = daysLeft !== null && daysLeft <= 3 ? -100000 + daysLeft : -stale;
    return { s, daysLeft, stale, flag, rank };
  });

  const total = enriched.length;
  const overdue = enriched.filter((e) => e.daysLeft !== null && e.daysLeft < 0).length;
  const staleCount = enriched.filter((e) => e.stale >= staleDays).length;

  // ตัดตามโควตา max_rows ตามลำดับสถานะ แล้วค่อยดึงรูปเฉพาะที่จะโชว์
  let quota = maxRows;
  const picked: { key: string; label: string; total: number; items: typeof enriched }[] = [];
  for (const [key, label] of wanted) {
    const all = enriched.filter((e) => e.s.status === key).sort((a, b) => a.rank - b.rank);
    if (all.length === 0) continue;
    const items = all.slice(0, Math.max(0, quota));
    quota -= items.length;
    picked.push({ key, label, total: all.length, items });
  }
  const covers = await designSheetCoverMap(admin, picked.flatMap((p) => p.items.map((e) => e.s.id)));

  const sections: ReportSection[] = picked.map((p) => ({
    key: p.key, label: p.label, color: meta.colorHex[p.key] ?? "#94a3b8", total: p.total,
    rows: p.items.map(({ s, flag }): ReportRow => {
      const cover = covers.get(s.id) ?? null;
      const note = (s.note ?? "").replace(/\s+/g, " ").trim();
      return {
        id: s.id,
        imageUrl: cover ? absoluteUrl(withImageWidth(cover, 160)) : null,
        title: s.name,
        code: s.code,
        meta: `${s.brand?.name ?? "ไม่ระบุแบรนด์"} · ${s.deadline ? `กำหนดส่ง ${thShort(s.deadline)}` : "ไม่มีกำหนดส่ง"}`,
        note: note ? (note.length > 90 ? `${note.slice(0, 90)}…` : note) : null,
        flag,
        link: absoluteUrl(`/master/design-dashboard?open=${encodeURIComponent(s.id)}`),
      };
    }),
  }));
  const shown = sections.reduce((n, s) => n + s.rows.length, 0);

  return {
    ...base,
    subjectCore: total === 0 ? "ไม่มีงานออกแบบค้าง" : `งานออกแบบที่ค้าง ${total.toLocaleString("th-TH")} งาน`,
    total, shown, sections,
    stats: [
      { label: "ค้างทั้งหมด", value: total },
      { label: "เกินกำหนด", value: overdue, tone: overdue > 0 ? "danger" : undefined },
      { label: `ไม่ขยับเกิน ${staleDays} วัน`, value: staleCount, tone: staleCount > 0 ? "warn" : undefined },
    ],
  };
};

const SOURCES: Record<string, SourceFn> = {
  design_sheets_pending: designSheetsPending,
};

/** ประกอบรายงาน + แปลงเป็นอีเมล (ใช้ทั้ง "ดูตัวอย่าง" และการส่งจริงรอบถัดไป) */
export async function buildReportEmail(admin: Admin, report: Pick<EmailReportInput, "name" | "source_key" | "filters" | "options" | "days" | "send_time">, now = new Date()) {
  const fn = SOURCES[report.source_key];
  if (!fn) throw new Error(`ไม่รู้จักแหล่งข้อมูล ${report.source_key}`);
  const built = await fn(admin, report.filters ?? {}, report.options ?? {});
  const email = renderReportEmail(built, {
    reportName: report.name,
    scheduleLabel: `${describeDays(report.days)} · ${report.send_time} น.`,
    manageUrl: absoluteUrl("/admin/email-reports"),
    now,
  });
  return { built, email };
}
