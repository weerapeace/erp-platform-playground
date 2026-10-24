/**
 * 📧 แหล่งข้อมูลของอีเมลรายงาน (ของกลาง · ฝั่งเซิร์ฟเวอร์เท่านั้น)
 * แต่ละแหล่ง = ฟังก์ชันที่ดึงข้อมูลจริงแล้วประกอบเป็น BuiltReport (หน้าตาอีเมลกลางเดียวกัน: lib/email-report/render)
 * เพิ่มรายงานแบบใหม่ = เพิ่มฟังก์ชันที่นี่ + ประกาศใน EMAIL_REPORT_SOURCES (lib/email-report/shared) ว่าเลือกโชว์อะไรได้บ้าง
 * ตัวเลือก (โชว์ช่องไหน/จัดกลุ่ม/เรียง/ตัวเลขสรุป) มาจาก normalizeReportOptions — ห้ามตั้งค่าตายตัวในฟังก์ชัน
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { buildStatusMeta, isOwnBrandJob, type WfStatusRow } from "@/lib/design-sheets-meta";
import { designSheetCoverMap } from "@/lib/design-sheet-covers";
import { excerpt } from "@/lib/design-sheet-summary-server";
import { withImageWidth } from "@/lib/r2-image";
import { absoluteUrl } from "@/lib/app-url";
import { loadChecklistSummaries } from "@/lib/record-tasks-server";
import { DESIGN_WAITING } from "@/lib/design-sheet-waiting";
import { linkLabel, taskTitleWithLinks, taskWithWho } from "@/lib/record-tasks";
import { describeDays, normalizeReportOptions, type EmailReportFilters, type EmailReportInput, type ResolvedReportOptions } from "@/lib/email-report/shared";
import { renderReportEmail, type BuiltReport, type ReportPart, type ReportRow, type ReportSection, type ReportStat, type ReportTone } from "@/lib/email-report/render";

type Admin = ReturnType<typeof supabaseAdmin>;
type SourceFn = (admin: Admin, filters: EmailReportFilters, options: ResolvedReportOptions) => Promise<BuiltReport>;

// ---- วันที่ตามเวลาไทย (เซิร์ฟเวอร์เป็น UTC — ห้ามใช้ toISOString ตรง ๆ จะร่นไป 1 วัน) ----
const todayTH = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const dateTH = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000);
const thShort = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
const oneLine = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? (t.length > max ? `${t.slice(0, max)}…` : t) : null;
};

// ============================================================
// ใบงานออกแบบที่ค้าง — สถานะที่ยังไม่ "ปิดงาน" (Workflow กลาง)
// ค่าเริ่มต้น: แยกตามสถานะ · เรียงเกินกำหนด → ใกล้กำหนด → ไม่ขยับนานสุด · โชว์ รูป/รหัส/แบรนด์/กำหนดส่ง/โน้ต/ป้าย/ปุ่มเปิด
// ============================================================
const designSheetsPending: SourceFn = async (admin, filters, opts) => {
  const { max_rows: maxRows, stale_days: staleDays, due_soon_days: dueSoon } = opts;
  const show = new Set(opts.row_fields);
  const today = todayTH();

  const { data: stRows } = await admin.from("erp_workflow_states")
    .select("state_key, label, color, is_terminal, customer_only")
    .eq("entity_type", "design_sheet").order("sort_order", { ascending: true });
  const meta = buildStatusMeta((stRows ?? []) as WfStatusRow[]);
  const pending = meta.opts.filter(([k]) => !meta.finished.has(k));
  const wanted = filters.statuses?.length ? pending.filter(([k]) => filters.statuses!.includes(k)) : pending;
  const statusLabel = new Map(pending);

  const groupLabel = filters.brand_group === "customer" ? " (งานลูกค้า)" : filters.brand_group === "own" ? " (แบรนด์เรา)" : "";

  type Brand = { name?: string | null; color?: string | null; is_customer_job?: boolean | null };
  type Sheet = {
    id: string; code: string; name: string; status: string; deadline: string | null; order_date: string | null; note: string | null;
    detail: string | null; created_by: string | null; created_at: string; updated_at: string;
    brand_id: string | null; brand: Brand | null;
  };
  let sheets: Sheet[] = [];
  if (wanted.length > 0) {
    let q = admin.from("design_sheets")
      .select("id, code, name, status, deadline, order_date, note, detail, created_by, created_at, updated_at, brand_id, brand:brands!brand_id(name, color, is_customer_job)")
      .not("is_active", "is", false)          // ห้ามใช้ .neq(false) — ตัดแถว null ทิ้ง
      .in("status", wanted.map(([k]) => k))
      .limit(2000);
    if (filters.brand_ids?.length) q = q.in("brand_id", filters.brand_ids);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    sheets = ((data ?? []) as unknown as Array<Sheet & { brand: Brand | Brand[] | null }>)
      .map((s) => ({ ...s, brand: Array.isArray(s.brand) ? s.brand[0] ?? null : s.brand }));
  }
  // กลุ่มแบรนด์: กฎกลางเดียวกับบอร์ด (ไม่ระบุแบรนด์ = งานลูกค้า)
  if (filters.brand_group === "own" || filters.brand_group === "customer") {
    const wantOwn = filters.brand_group === "own";
    sheets = sheets.filter((s) => isOwnBrandJob(s.brand_id ? s.brand : null) === wantOwn);
  }
  // ⏳ รออะไรอยู่ = เช็กลิสต์กลาง (ข้อที่ยังไม่เสร็จ) — ดึงครั้งเดียวทุกใบ
  const waiting = await loadChecklistSummaries(admin, DESIGN_WAITING.moduleKey, sheets.map((s) => s.id));
  const waitingOf = (s: Sheet) => waiting.get(s.id)?.open ?? [];

  // คำนวณป้าย + ค่าที่ใช้เรียง
  const enriched = sheets.map((s) => {
    const daysLeft = s.deadline ? dayDiff(s.deadline, today) : null;
    const stale = Math.max(0, dayDiff(today, dateTH(s.updated_at)));
    let flag: { text: string; tone: ReportTone };
    if (daysLeft !== null && daysLeft < 0) flag = { text: `เกินกำหนด ${-daysLeft} วัน`, tone: "danger" };
    else if (daysLeft === 0) flag = { text: "ครบกำหนดวันนี้", tone: "warn" };
    else if (daysLeft !== null && daysLeft <= dueSoon) flag = { text: `อีก ${daysLeft} วันถึงกำหนด`, tone: "warn" };
    else if (stale === 0) flag = { text: "อัปเดตวันนี้", tone: "good" };
    else flag = { text: `ไม่ขยับ ${stale} วัน`, tone: stale >= staleDays ? "warn" : "muted" };
    // [ลำดับหลัก, ลำดับรอง] น้อยมาก่อน
    const rank: [number, number] =
      opts.sort_by === "stale" ? [-stale, daysLeft ?? 100000]
      : opts.sort_by === "deadline" ? [daysLeft ?? 100000, -stale]
      : opts.sort_by === "newest" ? [-new Date(s.created_at).getTime(), 0]
      : [daysLeft !== null && daysLeft <= dueSoon ? -100000 + daysLeft : -stale, 0];   // urgent: เกินกำหนดก่อน (เกินมากสุดก่อน) → ใกล้กำหนด → ไม่ขยับนานสุด
    return { s, daysLeft, stale, flag, rank };
  });
  type Item = (typeof enriched)[number];
  const byRank = (a: Item, b: Item) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1];

  // ส่งเฉพาะงานที่มีป้ายเตือน (แดง/ส้ม)
  const list = opts.only_flagged ? enriched.filter((e) => e.flag.tone === "danger" || e.flag.tone === "warn") : enriched;

  const total = list.length;
  const overdue = list.filter((e) => e.daysLeft !== null && e.daysLeft < 0).length;
  const dueSoonCount = list.filter((e) => e.daysLeft !== null && e.daysLeft >= 0 && e.daysLeft <= dueSoon).length;
  const staleCount = list.filter((e) => e.stale >= staleDays).length;
  const freshCount = list.filter((e) => e.stale === 0).length;

  // จัดกลุ่ม (ตามลำดับสถานะของ Workflow / ชื่อแบรนด์ / กลุ่มเดียว)
  type Group = { key: string; label: string; color: string | null; items: Item[] };
  let groups: Group[];
  if (opts.group_by === "brand") {
    const m = new Map<string, Group>();
    for (const e of list) {
      const key = e.s.brand_id ?? "";
      const g = m.get(key) ?? { key: key || "none", label: e.s.brand?.name ?? "ไม่ระบุแบรนด์", color: e.s.brand?.color ?? null, items: [] };
      g.items.push(e); m.set(key, g);
    }
    // แบรนด์ที่งานค้างเยอะสุดขึ้นก่อน · ไม่ระบุแบรนด์ไว้ท้าย
    groups = [...m.values()].sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : b.items.length - a.items.length || a.label.localeCompare(b.label, "th")));
  } else if (opts.group_by === "none") {
    groups = [{ key: "all", label: "", color: null, items: list }];
  } else {
    groups = wanted.map(([key, label]) => ({ key, label, color: meta.colorHex[key] ?? "#94a3b8", items: list.filter((e) => e.s.status === key) }));
  }

  // ตัดตามโควตา max_rows ตามลำดับกลุ่ม แล้วค่อยดึงรูป/ชื่อคน เฉพาะที่จะโชว์
  let quota = maxRows;
  const picked: { g: Group; items: Item[] }[] = [];
  for (const g of groups) {
    if (g.items.length === 0) continue;
    const items = [...g.items].sort(byRank).slice(0, Math.max(0, quota));
    quota -= items.length;
    picked.push({ g, items });
  }
  const shownIds = picked.flatMap((p) => p.items.map((e) => e.s.id));
  // ใบที่มีเช็กลิสต์ค้าง (ทั้งรายงาน ไม่ใช่แค่ที่โชว์) เรียงตามความด่วน → การ์ดพร้อมปุ่มติ๊กใน Discord
  const checklistItems = list.filter((e) => waitingOf(e.s).length > 0).sort(byRank).slice(0, 25);
  // 🔔 ป๊อปตอนเข้า ERP: เรียงตามความด่วนเสมอ (ไม่ขึ้นกับ "เรียงงานตาม" ของอีเมล) เกิน/ใกล้กำหนด → มีของรอ → ไม่ขยับนานสุด
  const isUrgent = (e: Item) => e.daysLeft !== null && e.daysLeft <= dueSoon;
  const urgency = (e: Item): [number, number] => (isUrgent(e) ? [0, e.daysLeft!] : waitingOf(e.s).length ? [1, -e.stale] : [2, -e.stale]);
  const popupList = [...list].sort((a, b) => { const x = urgency(a), y = urgency(b); return x[0] - y[0] || x[1] - y[1]; }).slice(0, 300);
  const coverIds = [...new Set([...(show.has("cover") ? shownIds : []), ...checklistItems.map((e) => e.s.id), ...popupList.slice(0, 10).map((e) => e.s.id)])];
  const covers = coverIds.length ? await designSheetCoverMap(admin, coverIds) : new Map<string, string>();
  const creatorIds = show.has("creator") ? [...new Set(picked.flatMap((p) => p.items.map((e) => e.s.created_by)).filter((x): x is string => !!x))] : [];
  const creators = new Map<string, string>();
  if (creatorIds.length) {
    const { data } = await admin.from("user_profiles").select("id, display_name, username").in("id", creatorIds);
    for (const u of (data ?? []) as { id: string; display_name: string | null; username: string | null }[]) creators.set(u.id, u.display_name || u.username || "");
  }

  // ข้อมูลรองของแถว เรียงตามที่ผู้ตั้งค่าเลือก
  const partsOf = (s: Sheet): ReportPart[] => {
    const parts: ReportPart[] = [];
    for (const k of opts.row_fields) {
      if (k === "brand") parts.push({ kind: "meta", text: s.brand?.name ?? "ไม่ระบุแบรนด์" });
      else if (k === "status") parts.push({ kind: "meta", text: statusLabel.get(s.status) ?? s.status });
      else if (k === "deadline") parts.push({ kind: "meta", text: s.deadline ? `กำหนดส่ง ${thShort(s.deadline)}` : "ไม่มีกำหนดส่ง" });
      else if (k === "order_date" && s.order_date) parts.push({ kind: "meta", text: `สั่ง ${thShort(s.order_date)}` });
      else if (k === "creator" && s.created_by && creators.get(s.created_by)) parts.push({ kind: "meta", text: `โดย ${creators.get(s.created_by)}` });
      else if (k === "waiting_for") {
        const who = waiting.get(s.id)?.who ?? [];
        const lk = waiting.get(s.id)?.links ?? [];
        // "ซื้อของ - ของเล่น" = ข้อความ + ชื่อกำกับลิงก์ (taskTitleWithLinks)
        const w = waitingOf(s).map((x, i) => { const t = oneLine(taskTitleWithLinks(x, lk[i]), 60); return t ? taskWithWho(t, who[i], " — ") : null; }).filter((x): x is string => !!x);
        if (w.length) parts.push({ kind: "tag", text: `รอ: ${w.slice(0, 3).join(" · ")}${w.length > 3 ? ` +${w.length - 3}` : ""}` });
        // ลิงก์ของข้อที่รอ (เช่น ร้านที่จะซื้อของ) — กดเปิดจากอีเมลได้เลย
        const groups = waitingOf(s).map((t, i) => ({ title: oneLine(t, 40) ?? t, links: lk[i] ?? [] })).filter((g) => g.links.length);
        if (groups.length) parts.push({ kind: "links", links: groups, text: groups.map((g) => `${g.title}: ${g.links.map((l) => `${linkLabel(l)} ${l.url}`).join(", ")}`).join(" | ") });
      }
      else if (k === "note") { const t = oneLine(s.note, 90); if (t) parts.push({ kind: "note", text: t }); }
      else if (k === "detail") { const t = excerpt(s.detail, 120); if (t) parts.push({ kind: "small", text: t }); }
    }
    return parts;
  };

  const sections: ReportSection[] = picked.map(({ g, items }) => ({
    key: g.key, label: g.label, color: g.color, total: g.items.length,
    rows: items.map(({ s, flag }): ReportRow => {
      const cover = covers.get(s.id) ?? null;
      return {
        id: s.id,
        imageUrl: cover ? absoluteUrl(withImageWidth(cover, 160)) : null,
        title: s.name,
        code: show.has("code") ? s.code : null,
        parts: partsOf(s),
        flag: show.has("flag") ? flag : null,
        link: absoluteUrl(`/master/design-dashboard?open=${encodeURIComponent(s.id)}`),
        linkLabel: show.has("open") ? "เปิดใบงาน" : null,
      };
    }),
  }));
  const shown = sections.reduce((n, s) => n + s.rows.length, 0);

  // ตัวเลขสรุป — เฉพาะที่เลือก ตามลำดับรายการของแหล่งข้อมูล
  const statOf: Record<string, ReportStat> = {
    total: { label: opts.only_flagged ? "ต้องตามทั้งหมด" : "ค้างทั้งหมด", value: total },
    overdue: { label: "เกินกำหนด", value: overdue, tone: overdue > 0 ? "danger" : undefined },
    due_soon: { label: `ใกล้กำหนด (≤ ${dueSoon} วัน)`, value: dueSoonCount, tone: dueSoonCount > 0 ? "warn" : undefined },
    stale: { label: `ไม่ขยับเกิน ${staleDays} วัน`, value: staleCount, tone: staleCount > 0 ? "warn" : undefined },
    fresh: { label: "อัปเดตวันนี้", value: freshCount, tone: freshCount > 0 ? "good" : undefined },
  };
  const stats = opts.stats.filter((k) => statOf[k]).map((k) => statOf[k]);
  const breakdown = opts.stats.includes("by_status")
    ? wanted.map(([key, label]) => ({ label, color: meta.colorHex[key] ?? "#94a3b8", count: list.filter((e) => e.s.status === key).length }))
    : undefined;

  // จำนวนงานที่มีข้อมูลแต่ละช่องจริง (หน้าตั้งค่าโชว์ข้าง ๆ ชื่อช่อง)
  const count = (fn: (s: Sheet) => unknown) => list.filter((e) => !!fn(e.s)).length;
  const fieldFill: Record<string, number> = {
    brand: count((s) => s.brand_id), deadline: count((s) => s.deadline), order_date: count((s) => s.order_date),
    creator: count((s) => s.created_by), waiting_for: count((s) => waitingOf(s).length), note: count((s) => oneLine(s.note, 1)),
    detail: count((s) => excerpt(s.detail, 1)),
  };

  const what = opts.only_flagged ? "งานออกแบบที่ต้องตาม" : "งานออกแบบที่ค้าง";
  return {
    heading: opts.only_flagged ? `งานออกแบบที่ต้องตาม${groupLabel}` : `งานออกแบบที่ค้างอยู่${groupLabel}`,
    subjectCore: total === 0 ? `ไม่มี${what}` : `${what} ${total.toLocaleString("th-TH")} งาน`,
    viewAllLink: absoluteUrl("/master/design-dashboard"),
    viewAllLabel: "ดูทั้งหมดในแผนที่ภารกิจงานออกแบบ",
    emptyText: opts.only_flagged ? "ไม่มีงานที่ต้องเตือน เยี่ยมมาก 🎉" : "ไม่มีงานออกแบบค้าง เยี่ยมมาก 🎉",
    total, shown, sections, stats, breakdown,
    showImages: show.has("cover"),
    tokens: { "จำนวน": total, "เกินกำหนด": overdue, "ใกล้กำหนด": dueSoonCount, "ไม่ขยับ": staleCount },
    fieldFill,
    overdue,
    checklist: {
      moduleKey: DESIGN_WAITING.moduleKey,
      records: checklistItems.map(({ s, flag }) => {
        const cover = covers.get(s.id) ?? null;
        return {
          id: s.id,
          title: `${s.code} ${s.name}`,
          description: `${s.brand?.name ?? "ไม่ระบุแบรนด์"} · ${statusLabel.get(s.status) ?? s.status} · ${flag.text}`,
          imageUrl: cover ? absoluteUrl(withImageWidth(cover, 160)) : null,
          link: absoluteUrl(`/master/design-dashboard?open=${encodeURIComponent(s.id)}`),
        };
      }),
    },
    popup: {
      viewAllPath: "/master/design-dashboard",
      items: popupList.map((e) => {
        const cover = covers.get(e.s.id) ?? null;
        const who = waiting.get(e.s.id)?.who ?? [];
        const lk = waiting.get(e.s.id)?.links ?? [];
        return {
          id: e.s.id, title: e.s.name, code: e.s.code, path: `/master/design-dashboard?open=${encodeURIComponent(e.s.id)}`,
          imageUrl: cover ? withImageWidth(cover, 160) : null, flag: e.flag, urgent: isUrgent(e), overdue: e.daysLeft !== null && e.daysLeft < 0,
          waiting: waitingOf(e.s).map((t, i) => { const x = taskTitleWithLinks(t, lk[i]); return taskWithWho(oneLine(x, 60) ?? x, who[i], " — "); }),
          brand: e.s.brand?.name ?? (e.s.brand_id ? null : "ไม่ระบุแบรนด์"), status: statusLabel.get(e.s.status) ?? e.s.status,
          due: e.s.deadline ? `กำหนดส่ง ${thShort(e.s.deadline)}` : "ไม่มีกำหนดส่ง", note: oneLine(e.s.note, 90),
        };
      }),
    },
  };
};

/** แหล่งข้อมูลไหนมีเช็กลิสต์ "รออะไรอยู่" (ป๊อปเช็กก่อนว่าคนนี้มีงานค้างไหม ก่อนประกอบรายงานทั้งก้อน) */
export const SOURCE_CHECKLIST_MODULE: Record<string, string> = { design_sheets_pending: DESIGN_WAITING.moduleKey };

const SOURCES: Record<string, SourceFn> = {
  design_sheets_pending: designSheetsPending,
};

/** ประกอบรายงาน (ข้อมูลล้วน ไม่ทำอีเมล) — ป๊อปตอนเข้า ERP ใช้ตัวนี้ */
export async function buildReport(admin: Admin, report: Pick<EmailReportInput, "source_key" | "filters" | "options">): Promise<BuiltReport> {
  const fn = SOURCES[report.source_key];
  if (!fn) throw new Error(`ไม่รู้จักแหล่งข้อมูล ${report.source_key}`);
  return fn(admin, report.filters ?? {}, normalizeReportOptions(report.source_key, report.options));
}

/** ประกอบรายงาน + แปลงเป็นอีเมล (ใช้ทั้ง "ดูตัวอย่าง" และการส่งจริง) · options จาก DB ผ่านการเติมค่าเริ่มต้นก่อนเสมอ */
export async function buildReportEmail(admin: Admin, report: Pick<EmailReportInput, "name" | "source_key" | "filters" | "options" | "days" | "send_time">, now = new Date()) {
  const options = normalizeReportOptions(report.source_key, report.options);
  const built = await buildReport(admin, report);
  const email = renderReportEmail(built, {
    reportName: report.name,
    scheduleLabel: `${describeDays(report.days)} · ${report.send_time} น.`,
    manageUrl: absoluteUrl("/admin/email-reports"),
    subjectTemplate: options.subject_template,
    intro: options.intro,
    now,
  });
  return { built, email };
}
