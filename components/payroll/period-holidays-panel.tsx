"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateInput } from "@/components/date-input";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";

export type PeriodHolidayDraft = {
  holiday_date: string;
  holiday_name?: string | null;
};

type SavedHoliday = {
  id: string;
  holiday_date: string;
  holiday_name: string | null;
  is_paid: boolean;
};

type PublicHoliday = {
  holiday_date?: string | null;
  holiday_name?: string | null;
  status?: string | null;
};

type PeriodHolidaysPanelProps = {
  periodId?: string | null;
  editable: boolean;
  value?: PeriodHolidayDraft[];
  onChange?: (items: PeriodHolidayDraft[]) => void;
  onChanged?: () => void;
  periodStart?: unknown;
  periodEnd?: unknown;
};

const isoDate = (value: unknown) => String(value ?? "").slice(0, 10);
const inRange = (date: string, start: string, end: string) => (!start || date >= start) && (!end || date <= end);

function normalizeDrafts(value: PeriodHolidayDraft[] | undefined): PeriodHolidayDraft[] {
  return Array.isArray(value)
    ? value.filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(String(h.holiday_date ?? "")))
    : [];
}

export async function savePeriodHolidayDrafts(periodId: string, drafts: PeriodHolidayDraft[], actor?: string | null) {
  const rows = normalizeDrafts(drafts);
  for (const row of rows) {
    const res = await apiFetch("/api/payroll/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period_id: periodId,
        holiday_date: row.holiday_date,
        holiday_name: row.holiday_name?.trim() || undefined,
        actor,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 409) {
      throw new Error(json.error ?? `บันทึกวันหยุดไม่สำเร็จ (HTTP ${res.status})`);
    }
  }
}

export function PeriodHolidaysPanel({
  periodId,
  editable,
  value,
  onChange,
  onChanged,
  periodStart,
  periodEnd,
}: PeriodHolidaysPanelProps) {
  const [items, setItems] = useState<SavedHoliday[]>([]);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const start = isoDate(periodStart);
  const end = isoDate(periodEnd);
  const drafts = useMemo(() => normalizeDrafts(value), [value]);
  const draftMode = !periodId;
  const shown = draftMode
    ? drafts.map((h, idx) => ({ id: `draft-${idx}-${h.holiday_date}`, holiday_date: h.holiday_date, holiday_name: h.holiday_name ?? null, is_paid: true }))
    : items;

  const reload = useCallback(async () => {
    if (!periodId) return;
    try {
      const j = await apiFetch(`/api/payroll/holidays?period_id=${encodeURIComponent(periodId)}`).then((r) => r.json());
      setItems((j.data ?? []) as SavedHoliday[]);
    } catch {
      setErr("โหลดวันหยุดไม่สำเร็จ");
    }
  }, [periodId]);

  useEffect(() => { void reload(); }, [reload]);

  const updateDrafts = (next: PeriodHolidayDraft[]) => {
    onChange?.([...next].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)));
  };

  const validateDate = (targetDate: string) => {
    if (!targetDate) return "เลือกวันที่";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return "รูปแบบวันที่ไม่ถูกต้อง";
    if (!inRange(targetDate, start, end)) return "วันหยุดต้องอยู่ในช่วงของงวด";
    return null;
  };

  async function add() {
    setErr(null);
    setMessage(null);
    const problem = validateDate(date);
    if (problem) { setErr(problem); return; }

    if (draftMode) {
      if (drafts.some((h) => h.holiday_date === date)) { setErr("มีวันหยุดนี้อยู่แล้ว"); return; }
      updateDrafts([...drafts, { holiday_date: date, holiday_name: name.trim() || null }]);
      setDate("");
      setName("");
      return;
    }

    setBusy(true);
    try {
      const j = await apiFetch("/api/payroll/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, holiday_date: date, holiday_name: name.trim() || undefined }),
      }).then((r) => r.json());
      if (j.error) setErr(j.error);
      else {
        setDate("");
        setName("");
        await reload();
        onChanged?.();
      }
    } catch {
      setErr("บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string, dateToRemove: string) {
    setErr(null);
    setMessage(null);
    if (draftMode) {
      updateDrafts(drafts.filter((h) => h.holiday_date !== dateToRemove));
      return;
    }
    setBusy(true);
    try {
      const j = await apiFetch(`/api/payroll/holidays/${id}`, { method: "DELETE" }).then((r) => r.json());
      if (j.error) setErr(j.error);
      else {
        await reload();
        onChanged?.();
      }
    } catch {
      setErr("ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function applyStandard() {
    setBusy(true);
    setErr(null);
    setMessage(null);
    try {
      if (draftMode) {
        if (!start || !end) { setErr("เลือกเริ่มงวดและสิ้นงวดก่อนดึงวันหยุดมาตรฐาน"); return; }
        const j = await apiFetch("/api/payroll/master/public-holidays?include_inactive=true&limit=500").then((r) => r.json());
        const std = ((j.data ?? j.rows ?? []) as PublicHoliday[])
          .filter((h) => String(h.status ?? "active") === "active")
          .filter((h) => h.holiday_date && inRange(String(h.holiday_date).slice(0, 10), start, end))
          .map((h) => ({ holiday_date: String(h.holiday_date).slice(0, 10), holiday_name: h.holiday_name ?? null }));
        const existing = new Set(drafts.map((h) => h.holiday_date));
        const toAdd = std.filter((h) => !existing.has(h.holiday_date));
        if (toAdd.length === 0) {
          setMessage(std.length === 0 ? "ไม่มีวันหยุดในคลังที่อยู่ในช่วงงวดนี้" : "วันหยุดในคลังถูกใส่ครบแล้ว");
          return;
        }
        updateDrafts([...drafts, ...toAdd]);
        setMessage(`ดึงวันหยุดมาตรฐานแล้ว ${toAdd.length} วัน`);
        return;
      }

      const j = await apiFetch("/api/payroll/holidays/apply-standard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId }),
      }).then((r) => r.json());
      if (j.error) setErr(j.error);
      else {
        setMessage(j.message ?? `ดึงวันหยุดมาตรฐานแล้ว ${j.data?.added ?? 0} วัน`);
        await reload();
        onChanged?.();
      }
    } catch {
      setErr("ดึงไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-rose-100 bg-rose-50/35 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-800">
            วันหยุดพิเศษประจำงวด <span className="text-xs font-normal text-slate-400">({shown.length} วัน)</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            ใช้คำนวณเงินเดือนให้ถูกต้อง: พนักงานประจำยังได้เงินวันหยุด ส่วนรายวันไม่ถูกนับเป็นวันทำงาน
          </div>
        </div>
        {editable && (
          <button type="button" onClick={applyStandard} disabled={busy}
            className="h-8 shrink-0 rounded-lg border border-rose-200 bg-white px-3 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50">
            ดึงจากคลังวันหยุด
          </button>
        )}
      </div>

      {err && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-100">{err}</div>}
      {message && <div className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-rose-100">{message}</div>}

      <div className="mt-3 flex flex-wrap gap-2">
        {shown.length === 0 && <span className="py-1 text-xs text-slate-400">ยังไม่มีวันหยุดในงวดนี้</span>}
        {shown.map((h) => (
          <span key={h.id} className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1 text-xs text-rose-700">
            <span className="font-medium">{formatDate(h.holiday_date)}</span>
            {h.holiday_name ? <span className="max-w-[180px] truncate">· {h.holiday_name}</span> : null}
            {editable && (
              <button type="button" onClick={() => void del(h.id, h.holiday_date)} disabled={busy}
                className="text-rose-300 hover:text-rose-600" title="ลบวันหยุด">
                x
              </button>
            )}
          </span>
        ))}
      </div>

      {editable && (
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="w-[150px]"><DateInput value={date} onChange={setDate} /></div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อวันหยุด เช่น ปีใหม่"
            className="h-9 min-w-[180px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          />
          <button type="button" onClick={() => void add()} disabled={busy}
            className="h-9 rounded-lg bg-rose-600 px-4 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
            + เพิ่มวันหยุด
          </button>
        </div>
      )}
    </div>
  );
}
