/**
 * 📋 แหล่งข้อมูลอีเมลรายงาน "สรุปแผนงานทีม (รายสัปดาห์)" — ฝั่งเซิร์ฟเวอร์เท่านั้น
 * เสร็จกี่งานใน 7 วัน · ค้างกี่งาน · เกินกำหนด / รอคนอื่น / ใกล้กำหนด อะไรบ้าง — เหมาะตั้งส่งทุกวันศุกร์เย็น
 * ลงทะเบียนใน SOURCES (lib/email-report/sources) + ประกาศตัวเลือกใน EMAIL_REPORT_SOURCES (lib/email-report/shared)
 * ข้อมูล: erp_record_tasks module_key = team_plan (docs/team-plan.md)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { absoluteUrl } from "@/lib/app-url";
import { userNames } from "@/lib/record-tasks-server";
import { dueLabel, isOverdue, isPlanDone, PRIORITIES, PRIORITY_META, TEAM_PLAN_MODULE, waitingDays, WAITING_FOLLOW_DAYS, type PlanItem } from "@/lib/team-plan";
import { PLAN_COLS, planLink, toPlanItem, type PlanRow } from "@/lib/team-plan-server";
import type { EmailReportFilters, ResolvedReportOptions } from "@/lib/email-report/shared";
import type { BuiltReport, ReportPart, ReportRow, ReportSection, ReportStat, ReportTone } from "@/lib/email-report/render";

type Admin = ReturnType<typeof supabaseAdmin>;
const DAY = 86400e3;
const thShort = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

type Entry = { t: PlanItem; done: boolean; overdue: boolean; waiting: boolean; dueSoon: boolean; stale: boolean };

export async function teamPlanWeekly(admin: Admin, _filters: EmailReportFilters, opts: ResolvedReportOptions): Promise<BuiltReport> {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * DAY).toISOString();
  const { data, error } = await admin.from("erp_record_tasks").select(PLAN_COLS)
    .eq("module_key", TEAM_PLAN_MODULE).eq("record_id", "")
    .or(`status.in.(open,in_progress),and(status.eq.resolved,resolved_at.gte.${since})`)
    .limit(3000);
  if (error) throw new Error("โหลดแผนงานทีมไม่สำเร็จ");
  const rows = (data ?? []) as PlanRow[];
  const names = await userNames(admin, rows.map((r) => r.assigned_to));
  const items = rows.map((r) => toPlanItem(r, names));

  const { due_soon_days: dueSoonDays, stale_days: staleDays, max_rows: maxRows } = opts;
  const entries: Entry[] = items.map((t) => {
    const done = isPlanDone(t);
    const due = t.due_at ? Date.parse(t.due_at) : null;
    return {
      t, done,
      overdue: !done && isOverdue(t.due_at, now),
      waiting: !done && !!t.plan.waiting,
      dueSoon: !done && due !== null && due >= now.getTime() && due - now.getTime() <= dueSoonDays * DAY,
      stale: !done && now.getTime() - Date.parse(t.updated_at) > staleDays * DAY,
    };
  });
  const openAll = entries.filter((e) => !e.done);
  const doneList = entries.filter((e) => e.done).sort((a, b) => Date.parse(b.t.resolved_at ?? b.t.updated_at) - Date.parse(a.t.resolved_at ?? a.t.updated_at));
  const flagged = (e: Entry) => e.overdue || e.dueSoon || e.stale || (e.waiting && waitingDays(e.t.plan.waiting!.since, now) >= WAITING_FOLLOW_DAYS);
  const openList = opts.only_flagged ? openAll.filter(flagged) : openAll;

  // ── เรียง ──
  const pRank = (e: Entry) => PRIORITIES.indexOf(e.t.priority);
  const dueOf = (e: Entry) => (e.t.due_at ? Date.parse(e.t.due_at) : Number.MAX_SAFE_INTEGER);
  const sorters: Record<string, (a: Entry, b: Entry) => number> = {
    urgent: (a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.dueSoon) - Number(a.dueSoon) || pRank(a) - pRank(b) || dueOf(a) - dueOf(b),
    due: (a, b) => dueOf(a) - dueOf(b) || pRank(a) - pRank(b),
    newest: (a, b) => Date.parse(b.t.created_at) - Date.parse(a.t.created_at),
  };
  openList.sort(sorters[opts.sort_by] ?? sorters.urgent);

  // ── จัดกลุ่ม (งานเสร็จอยู่กลุ่มท้ายเสมอ) ──
  const who = (e: Entry) => e.t.assigned_name ?? "ยังไม่มีคนรับ";
  type Group = { key: string; label: string; color: string | null; list: Entry[] };
  let groups: Group[];
  if (opts.group_by === "person") {
    const m = new Map<string, Group>();
    for (const e of openList) { const k = who(e); (m.get(k) ?? m.set(k, { key: `p:${k}`, label: k, color: null, list: [] }).get(k)!).list.push(e); }
    groups = [...m.values()].sort((a, b) => b.list.length - a.list.length);
  } else if (opts.group_by === "priority") {
    groups = PRIORITIES.map((p) => ({ key: p, label: PRIORITY_META[p].label, color: PRIORITY_META[p].color, list: openList.filter((e) => e.t.priority === p) }));
  } else if (opts.group_by === "none") {
    groups = [{ key: "open", label: "งานค้าง", color: null, list: openList }];
  } else {
    groups = [
      { key: "overdue", label: "เกินกำหนด", color: "#dc2626", list: openList.filter((e) => e.overdue) },
      { key: "waiting", label: "รอคนอื่น", color: "#d97706", list: openList.filter((e) => !e.overdue && e.waiting) },
      { key: "open", label: "ค้างอยู่", color: "#7c3aed", list: openList.filter((e) => !e.overdue && !e.waiting) },
    ];
  }
  groups = groups.filter((g) => g.list.length > 0);
  if (doneList.length) groups.push({ key: "done", label: "เสร็จใน 7 วันที่ผ่านมา", color: "#059669", list: doneList });

  // ── แถว ──
  const show = new Set(opts.row_fields);
  const flagOf = (e: Entry): { text: string; tone: ReportTone } | null => {
    if (e.done) return { text: `เสร็จ ${thShort(e.t.resolved_at ?? e.t.updated_at)}`, tone: "good" };
    if (e.overdue) return { text: dueLabel(e.t.due_at, now), tone: "danger" };
    if (e.waiting) { const d = waitingDays(e.t.plan.waiting!.since, now); if (d >= WAITING_FOLLOW_DAYS) return { text: `รอ ${d} วัน`, tone: "warn" }; }
    if (e.dueSoon) return { text: dueLabel(e.t.due_at, now), tone: "warn" };
    if (e.stale) return { text: `ไม่ขยับ ${Math.floor((now.getTime() - Date.parse(e.t.updated_at)) / DAY)} วัน`, tone: "muted" };
    return null;
  };
  const toRow = (e: Entry): ReportRow => {
    const parts: ReportPart[] = [];
    for (const k of opts.row_fields) {
      if (k === "who") parts.push({ kind: "meta", text: `ให้ ${who(e)}` });
      else if (k === "priority" && !e.done) parts.push({ kind: "meta", text: PRIORITY_META[e.t.priority].label });
      else if (k === "due" && e.t.due_at && !e.done) parts.push({ kind: "meta", text: `กำหนด ${dueLabel(e.t.due_at, now)}` });
      else if (k === "waiting" && e.waiting) parts.push({ kind: "tag", text: `รอ${e.t.plan.waiting!.note ? `: ${e.t.plan.waiting!.note}` : "คนอื่น"} · ${waitingDays(e.t.plan.waiting!.since, now)} วัน` });
      else if (k === "note" && e.t.note) parts.push({ kind: "note", text: e.t.note.length > 140 ? `${e.t.note.slice(0, 140)}…` : e.t.note });
      else if (k === "source" && e.t.plan.source) parts.push({ kind: "small", text: `มาจาก ${e.t.plan.source.label}` });
    }
    return {
      id: e.t.id, imageUrl: null, title: e.t.title, code: null, parts,
      flag: show.has("flag") ? flagOf(e) : null,
      link: absoluteUrl(planLink(e.t.id)),
      linkLabel: show.has("open") ? "เปิดงาน" : null,
    };
  };
  let budget = maxRows;
  const sections: ReportSection[] = groups.map((g) => {
    const take = Math.max(0, Math.min(g.list.length, budget));
    budget -= take;
    return { key: g.key, label: g.label, color: g.color, total: g.list.length, rows: g.list.slice(0, take).map(toRow) };
  });
  const shown = sections.reduce((n, s) => n + s.rows.length, 0);
  const total = openList.length + doneList.length;

  // ── ตัวเลขสรุป ──
  const overdue = openAll.filter((e) => e.overdue).length;
  const waiting = openAll.filter((e) => e.waiting).length;
  const dueSoon = openAll.filter((e) => e.dueSoon).length;
  const stale = openAll.filter((e) => e.stale).length;
  const statOf: Record<string, ReportStat> = {
    done_week: { label: "เสร็จใน 7 วัน", value: doneList.length, tone: doneList.length > 0 ? "good" : undefined },
    open: { label: "ค้างทั้งหมด", value: openAll.length },
    overdue: { label: "เกินกำหนด", value: overdue, tone: overdue > 0 ? "danger" : undefined },
    waiting: { label: "รอคนอื่น", value: waiting, tone: waiting > 0 ? "warn" : undefined },
    due_soon: { label: `ใกล้กำหนด (≤ ${dueSoonDays} วัน)`, value: dueSoon, tone: dueSoon > 0 ? "warn" : undefined },
    stale: { label: `ไม่ขยับเกิน ${staleDays} วัน`, value: stale, tone: stale > 0 ? "warn" : undefined },
  };
  const stats = opts.stats.filter((k) => statOf[k]).map((k) => statOf[k]);
  let breakdown: BuiltReport["breakdown"];
  if (opts.stats.includes("by_person")) {
    const m = new Map<string, number>();
    for (const e of openAll) m.set(who(e), (m.get(who(e)) ?? 0) + 1);
    breakdown = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label: `${label} ค้าง`, color: "#7c3aed", count }));
  }

  const count = (fn: (e: Entry) => unknown) => entries.filter((e) => !!fn(e)).length;
  return {
    heading: "สรุปแผนงานทีมประจำสัปดาห์",
    subjectCore: `แผนงานทีม · เสร็จ ${doneList.length} · ค้าง ${openAll.length}${overdue ? ` · เกินกำหนด ${overdue}` : ""}`,
    viewAllLink: absoluteUrl("/tasks/plan"),
    viewAllLabel: "เปิดแผนงานทีม",
    emptyText: "สัปดาห์นี้ยังไม่มีงานในแผนงานทีม — เพิ่มงานได้ที่เมนู แผนงาน ในแอปจัดการงาน",
    total, shown, sections, stats, breakdown,
    showImages: false,
    tokens: { "จำนวน": openAll.length, "เสร็จ": doneList.length, "เกินกำหนด": overdue, "รอ": waiting },
    fieldFill: {
      who: count((e) => e.t.assigned_to), priority: entries.length, due: count((e) => e.t.due_at), waiting: count((e) => e.t.plan.waiting),
      note: count((e) => e.t.note), source: count((e) => e.t.plan.source),
    },
    overdue,
  };
}
