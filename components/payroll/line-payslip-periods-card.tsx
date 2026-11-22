"use client";

/**
 * การ์ด "สลิปในไลน์" (หน้า /payroll/line-members) — HR เลือกงวดที่พนักงานดูสลิปในไลน์บริษัทได้
 *   เปิด = พนักงานที่ HR ยืนยันตัวตนแล้วเห็นสลิปงวดนั้นในเมนู "เงินเดือน" · ปิด = หายจากไลน์ทันที
 *   เปิด/ปิดได้ตลอด + ย้อนกลับได้จากแจ้งผลมุมจอ · ลงประวัติทุกครั้ง · API /api/payroll/line-payslip-periods
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { askConfirm } from "@/components/modal/ask-dialog";
import { Icon } from "@/components/icon";

type Period = { id: string; period_name: string; start_date: string | null; end_date: string | null; status: string; slip_count: number; line_visible_at: string | null; line_visible_by: string | null };

const STATUS_TH: Record<string, string> = { draft: "ร่าง", review: "รอตรวจ", approved: "อนุมัติแล้ว", locked: "ล็อกแล้ว", paid: "จ่ายแล้ว" };
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "-");

export function LinePayslipPeriodsCard({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Period[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const r = await apiFetch("/api/payroll/line-payslip-periods");
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setRows(j.data as Period[]);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const send = async (p: Period, visible: boolean): Promise<boolean> => {
    setBusy(p.id);
    try {
      const r = await apiFetch("/api/payroll/line-payslip-periods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period_id: p.id, visible }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      await load();
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); return false; }
    finally { setBusy(null); }
  };

  const toggle = async (p: Period) => {
    const open = !p.line_visible_at;
    if (open) {
      const ok = await askConfirm({
        title: `เปิดให้ดูสลิป "${p.period_name}" ในไลน์?`,
        message: `พนักงานที่ผูกไลน์และ HR ยืนยันตัวตนแล้ว จะเห็นสลิปงวดนี้ (${p.slip_count} ใบ) ในเมนู "เงินเดือน" ทันที${p.status === "draft" ? " · งวดนี้ยังเป็นร่าง — ตรวจตัวเลขให้เรียบร้อยก่อน" : ""} · ปิดกลับได้ตลอด`,
        confirmText: "เปิดให้ดู",
      });
      if (!ok) return;
    }
    if (await send(p, open)) {
      toast.undo(open ? `เปิดสลิป "${p.period_name}" ในไลน์แล้ว` : `ปิดสลิป "${p.period_name}" ในไลน์แล้ว`, async () => { if (await send(p, !open)) toast.success("ย้อนกลับแล้ว"); });
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 font-semibold text-slate-900"><Icon name="money" /> สลิปในไลน์บริษัท</h2>
          <p className="mt-0.5 text-xs text-slate-500">เลือกงวดที่ให้พนักงานเปิดดูสลิปในไลน์ได้ · เห็นเฉพาะคนที่ HR กด &ldquo;ยืนยันตัวตน&rdquo; แล้ว · หน้าตาตัวเลขเหมือนสลิปกระดาษ (ไม่โชว์เงินเดือน · ยอดสุทธิเข้ารหัส)</p>
        </div>
        <button type="button" onClick={() => void load()} className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-600">รีเฟรช</button>
      </div>
      {err ? <div className="mt-3 text-sm text-rose-600">{err}</div> : rows === null ? (
        <div className="mt-3 h-24 animate-pulse rounded-xl bg-slate-100" />
      ) : rows.length === 0 ? <div className="mt-3 text-sm text-slate-500">ยังไม่มีงวดเงินเดือน</div> : (
        <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {rows.map((p) => {
            const on = !!p.line_visible_at;
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <div className="min-w-[160px] flex-1">
                  <div className="text-sm font-medium text-slate-800">{p.period_name}</div>
                  <div className="text-[11px] text-slate-400">{fmt(p.start_date)} – {fmt(p.end_date)} · {STATUS_TH[p.status] ?? p.status} · สลิป {p.slip_count} ใบ</div>
                </div>
                <div className="text-[11px] text-slate-500">{on ? `เปิดโดย ${p.line_visible_by ?? "-"} · ${fmt(p.line_visible_at)}` : "ยังไม่เปิด"}</div>
                <button type="button" disabled={!canEdit || busy === p.id || (!on && p.slip_count === 0)} onClick={() => void toggle(p)}
                  title={!on && p.slip_count === 0 ? "งวดนี้ยังไม่มีสลิป" : undefined}
                  className={`h-8 min-w-[110px] rounded-lg px-3 text-xs font-semibold disabled:opacity-40 ${on ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-emerald-600 text-white"}`}>
                  {busy === p.id ? "กำลังบันทึก…" : on ? "เปิดอยู่ · กดปิด" : "เปิดให้ดูในไลน์"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
