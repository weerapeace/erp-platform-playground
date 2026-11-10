"use client";

/**
 * 📅 หน้า "วันนี้" ของ Design Dashboard มือถือ (ปุ่มแถบล่าง) — รวมงานที่ต้องสนใจ แยกกลุ่ม
 *   เกินกำหนด · ส่งใน 2 วัน · รอลูกค้าตอบราคา · ส่งใน 7 วัน · ยังไม่ตั้งวันส่ง (พับไว้)
 *   กฎกลุ่ม = passPhoneFilter ตัวเดียวกับตัวเลขสรุปบนบอร์ด (./dashboard-helpers) · นับตามแบรนด์ที่เลือกอยู่
 */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import type { StatusMeta } from "@/lib/design-sheets-meta";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { daysUntil, passPhoneFilter, type PhoneFilter } from "./dashboard-helpers";

const byDeadline = (a: DesignSheetListItem, b: DesignSheetListItem) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
const byQuoteDate = (a: DesignSheetListItem, b: DesignSheetListItem) => (a.quote_latest?.date ?? "").localeCompare(b.quote_latest?.date ?? "");
const byUpdated = (a: DesignSheetListItem, b: DesignSheetListItem) => b.updated_at.localeCompare(a.updated_at);

export function PhoneTodayView({ sheets, statusMeta, renderRow, scopeLabel }: {
  sheets: DesignSheetListItem[];
  statusMeta: StatusMeta;
  /** การ์ดแบบแถวย่อ (ตัวเดียวกับบอร์ด) */
  renderRow: (sheet: DesignSheetListItem) => ReactNode;
  scopeLabel: string;
}) {
  const t = useT();
  const [showNoDl, setShowNoDl] = useState(false);
  const groups = useMemo(() => {
    const pick = (f: PhoneFilter, sort: (a: DesignSheetListItem, b: DesignSheetListItem) => number) => sheets.filter((s) => passPhoneFilter(s, f, statusMeta)).sort(sort);
    return [
      { key: "overdue" as const, label: t("เกินกำหนด", "Overdue"), tone: "text-rose-700", dot: "bg-rose-500", rows: pick("overdue", byDeadline) },
      { key: "due2" as const, label: t("ส่งวันนี้ – อีก 2 วัน", "Due today – in 2 days"), tone: "text-amber-800", dot: "bg-amber-500", rows: pick("due2", byDeadline) },
      { key: "await_quote" as const, label: t("เสนอราคาแล้ว รอลูกค้าตอบ", "Quoted — awaiting reply"), tone: "text-slate-800", dot: "bg-blue-500", rows: pick("await_quote", byQuoteDate) },
      { key: "soon7" as const, label: t("ส่งใน 3–7 วัน", "Due in 3–7 days"), tone: "text-slate-800", dot: "bg-slate-400", rows: pick("soon7", byDeadline) },
    ];
  }, [sheets, statusMeta, t]);
  const noDl = useMemo(() => sheets.filter((s) => passPhoneFilter(s, "nodl", statusMeta)).sort(byUpdated), [sheets, statusMeta]);
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const overdueDays = (s: DesignSheetListItem) => { const d = daysUntil(s.deadline); return d != null && d < 0 ? -d : 0; };

  return (
    <div className="space-y-4">
      <div className="text-[11px] text-slate-400">{scopeLabel} · {t(`ต้องสนใจ ${total} งาน`, `${total} jobs need attention`)}</div>
      {total === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <Icon name="done" className="text-2xl text-emerald-500" />
          <div className="mt-1 text-sm text-slate-700">{t("ไม่มีงานเร่งตอนนี้", "Nothing urgent right now")}</div>
          {noDl.length > 0 && <div className="mt-1 text-xs text-slate-400">{t("ตั้ง Deadline ในใบงาน ระบบถึงจะเตือนงานใกล้ส่งได้", "Set a deadline on each sheet so the system can warn you")}</div>}
        </div>
      )}
      {groups.filter((g) => g.rows.length > 0).map((g) => (
        <section key={g.key}>
          <div className={`mb-1.5 flex items-center gap-1.5 px-0.5 text-xs font-semibold ${g.tone}`}>
            <span className={`h-2 w-2 rounded-full ${g.dot}`} />{g.label}<span className="font-normal text-slate-400">{g.rows.length}</span>
            {g.key === "overdue" && <span className="ml-auto font-normal text-rose-500">{t(`ช้าสุด ${Math.max(...g.rows.map(overdueDays))} วัน`, `up to ${Math.max(...g.rows.map(overdueDays))}d late`)}</span>}
          </div>
          <div className="space-y-1.5">{g.rows.map(renderRow)}</div>
        </section>
      ))}
      {noDl.length > 0 && (
        <section>
          <button type="button" onClick={() => setShowNoDl((v) => !v)} aria-expanded={showNoDl}
            className="flex w-full items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2.5 text-left text-xs text-slate-600">
            <Icon name="calendar" className="text-slate-400" />
            <span className="min-w-0 flex-1">{t(`ยังไม่ตั้งวันส่ง ${noDl.length} ใบ`, `${noDl.length} without a deadline`)}<span className="block text-[11px] text-slate-400">{t("เปิดใบงาน → ใส่ Deadline ส่งงาน แล้วจะขึ้นในกลุ่มข้างบนเอง", "Open a sheet → set its deadline and it moves into the groups above")}</span></span>
            <span className={`text-slate-300 transition ${showNoDl ? "rotate-90" : ""}`}>›</span>
          </button>
          {showNoDl && <div className="mt-1.5 space-y-1.5">{noDl.map(renderRow)}</div>}
        </section>
      )}
    </div>
  );
}
