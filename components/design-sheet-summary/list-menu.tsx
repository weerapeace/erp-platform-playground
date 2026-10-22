"use client";

// ============================================================
// 📋 รายการ "สรุปงานที่บันทึกไว้" (ของกลาง · ตัวเล็ก ไม่โหลดป๊อปใหญ่) — ใช้ในดรอปดาวน์ปุ่มสรุปงานบนบอร์ด
// ============================================================

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { tr } from "@/lib/lang";
import { useT } from "@/components/i18n";
import { usePermission } from "@/components/auth";
import { AUDIENCE_LABEL, type SummaryListItem } from "@/lib/design-sheet-summary";

const fmt = (iso: string) => new Date(iso).toLocaleDateString(tr("th-TH", "en-US"), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });

export function SummaryListMenu({ onNew, onOpen, reloadKey = 0 }: {
  /** กด "＋ สรุปใหม่" (เข้าโหมดติ๊กเลือกใบงาน) */
  onNew: () => void;
  onOpen: (id: string) => void;
  /** เปลี่ยนค่า = โหลดรายการใหม่ (เช่น หลังบันทึก/ลบ) */
  reloadKey?: number;
}) {
  const t = useT();
  const canEmailReports = usePermission("admin.email_reports");   // ทางลัดไปหน้าตั้งค่า ส่งอีเมลรายงานอัตโนมัติ
  const [list, setList] = useState<SummaryListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setError(null);
    apiFetch("/api/design-sheet-summaries").then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.error) setError(j.error); else setList(j.data as SummaryListItem[]); })
      .catch(() => { if (alive) setError(tr("โหลดสรุปที่บันทึกไว้ไม่สำเร็จ", "Couldn't load saved summaries")); });
    return () => { alive = false; };
  }, [reloadKey]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-2xl">
      <button type="button" onClick={onNew}
        className="flex w-full items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-left text-sm font-medium text-white hover:bg-slate-800">
        ＋ {t("สรุปใหม่", "New summary")} <span className="text-xs font-normal opacity-70">— {t("ติ๊กเลือกใบงานที่ยังไม่ปิดบนบอร์ด", "pick open sheets on the board")}</span>
      </button>
      <div className="px-2 pb-1 pt-2 text-[11px] font-medium text-slate-500">{t("สรุปที่บันทึกไว้", "Saved summaries")}</div>
      <div className="max-h-72 overflow-auto">
        {error ? (
          <div className="px-2 py-3 text-center text-xs text-rose-600">⚠ {error}</div>
        ) : list === null ? (
          <div className="space-y-1 p-1">{[0, 1].map((i) => <div key={i} className="h-9 animate-pulse rounded bg-slate-100" />)}</div>
        ) : list.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-slate-400">{t("ยังไม่มีสรุปที่บันทึกไว้", "No saved summaries yet")}</div>
        ) : list.map((s) => (
          <button key={s.id} type="button" onClick={() => onOpen(s.id)}
            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50">
            <span className="mt-0.5 text-sm">{s.audience === "customer" ? "👤" : "🏠"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-slate-800">{s.title}</span>
              <span className="block truncate text-[11px] text-slate-400">{AUDIENCE_LABEL[s.audience]} · {s.item_count} {t("ใบงาน", "sheets")} · {fmt(s.updated_at)}{s.created_by_name ? ` · ${s.created_by_name}` : ""}</span>
            </span>
          </button>
        ))}
      </div>
      {canEmailReports && (
        <a href="/admin/email-reports"
          className="mt-1 flex w-full items-start gap-2 rounded-md border-t border-slate-100 px-2 pb-1 pt-2 text-left hover:bg-slate-50">
          <span className="mt-0.5 text-sm">📧</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-slate-800">{t("ส่งอีเมลรายงานงานค้างอัตโนมัติ", "Automatic pending-jobs email report")} →</span>
            <span className="block text-[11px] text-slate-400">{t("ตั้งผู้รับ วัน เวลา · ส่งทดสอบ · ส่งเดี๋ยวนี้ (ตั้งค่า → ส่งอีเมลรายงาน)", "Recipients, days, time · test · send now (Settings → Email reports)")}</span>
          </span>
        </a>
      )}
    </div>
  );
}
