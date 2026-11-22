"use client";

/**
 * FxRateQuickModal (ของกลาง) — "ตัวตั้งเรทเงินวันนี้" (★ 2026-11-22 · เจ้าของเลือกแบบ B + ข้อเสนอ 1, 2, 3)
 *   เปลี่ยนเรทของเอกสารนี้ · ติ๊ก "ตั้งเป็นเรทกลางวันนี้ด้วย" = อัปเดตเรทหยวนกลาง (daily_rates) ให้ใบอื่นที่ออกตั้งแต่วันนี้ได้เรทนี้เป็นค่าเริ่มต้น
 *   - บอกเรทกลางล่าสุด + เตือน "เรทกลางเก่า n วัน" (เกิน 3 วัน · lib/daily-rate)
 *   - ตั้งเรทกลางแล้ว: แจ้งเตือนมุมจอมีปุ่ม "ย้อนกลับ" (คืนเรทกลางเดิม + คืนเรทเอกสารเดิม) · ประวัติลงที่ API กลาง /api/master-v2/daily-rates
 * ใช้: <FxRateQuickModal open currency value onApply onClose refDate? />
 *   onApply(rate) = ใส่เรทลงเอกสาร (หน้าเอกสารเป็นคนบันทึกตามปกติ) · เรทกลางเฉพาะสกุลหยวน (daily_rates เป็นเรทหยวนอย่างเดียว)
 * ห้ามใช้เมื่อ: เอกสารล็อกแล้ว (ยืนยัน/ไม่มีสิทธิ์แก้) — หน้าเอกสารต้องไม่เปิดตัวนี้
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { formatDate, todayBangkok } from "@/lib/date";
import { isCNY } from "@/lib/landed-cost";
import { latestActiveRate, planSetDailyRate, staleRateDays, daysBetween, validRate, type DailyRateRow } from "@/lib/daily-rate";

/** ป้าย "เรทกลางเก่า n วัน" (ไม่เก่า = ไม่โชว์) */
export function RateStaleChip({ rateDate, refDate, className = "" }: { rateDate: string | null | undefined; refDate: string | null | undefined; className?: string }) {
  const d = staleRateDays(rateDate, refDate);
  if (d == null) return null;
  return <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300 whitespace-nowrap ${className}`} title={`เรทกลางล่าสุดตั้งเมื่อ ${formatDate(rateDate)} — อัปเดตเรทกลางของวันนี้ได้ (แตะที่เรท)`}>เรทกลางเก่า {d} วัน</span>;
}

export function FxRateQuickModal({ open, onClose, currency, value, onApply, refDate, onDailyChanged }: {
  open: boolean; onClose: () => void; currency: string; value: string | number | null;
  onApply: (rate: number) => void;
  /** ตั้งเรทกลางแล้ว (วันที่ของเรท) / ย้อนกลับ (null) — หน้าเอกสารใช้ซ่อนป้าย "เรทกลางเก่า" ทันที */
  onDailyChanged?: (rateDate: string | null) => void;
  /** วันที่อ้างอิงของเอกสาร (ไว้บอกว่าเรทกลางเก่าแค่ไหน) — ไม่ใส่ = วันนี้ */
  refDate?: string | null;
}) {
  const toast = useToast();
  const cny = isCNY(currency);
  const today = todayBangkok();
  const [rows, setRows] = useState<DailyRateRow[] | null>(null);
  const [txt, setTxt] = useState("");
  const [setDaily, setSetDaily] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTxt(value == null || value === "" ? "" : String(value)); setSetDaily(false); setErr(null);
    if (!cny) { setRows([]); return; }
    let alive = true;
    setRows(null);
    apiFetch("/api/master-v2/daily-rates?limit=15&sort_by=rate_date&sort_dir=desc&include_inactive=true").then((r) => r.json())
      .then((j) => { if (alive) setRows(((j.data ?? []) as DailyRateRow[])); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [open, value, cny]);

  const latest = latestActiveRate(rows ?? []);
  const latestRate = latest ? Number(latest.rate) : null;
  const age = latest ? daysBetween(latest.rate_date, today) : null;
  const check = validRate(txt, latestRate);
  const prevValue = Number(value) || null;

  const saveDaily = async (rate: number): Promise<(() => Promise<void>) | null> => {
    const plan = planSetDailyRate(rows ?? [], today, rate);
    if (plan.mode === "same") return null;
    if (plan.mode === "create") {
      const res = await apiFetch("/api/master-v2/daily-rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rate_date: today, rate, actor: "voucher-fx-quick" }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(res.status === 403 ? "ไม่มีสิทธิ์ตั้งเรทกลาง — ให้หัวหน้าตั้งในแอปโอนเงินจีน" : (j.error ?? `HTTP ${res.status}`));
      const id = String(j.data?.id ?? "");
      return async () => { if (id) await apiFetch(`/api/master-v2/daily-rates/${id}`, { method: "DELETE" }); };
    }
    const res = await apiFetch(`/api/master-v2/daily-rates/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rate, is_active: true, actor: "voucher-fx-quick" }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new Error(res.status === 403 ? "ไม่มีสิทธิ์ตั้งเรทกลาง — ให้หัวหน้าตั้งในแอปโอนเงินจีน" : (j.error ?? `HTTP ${res.status}`));
    const before = plan.before;
    return async () => { await apiFetch(`/api/master-v2/daily-rates/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rate: before.rate, is_active: before.is_active, actor: "voucher-fx-quick-undo" }) }); };
  };

  const apply = async () => {
    if (!check.ok) { setErr(check.warn); return; }
    const rate = check.rate;
    setBusy(true); setErr(null);
    try {
      let undoDaily: (() => Promise<void>) | null = null;
      if (cny && setDaily) undoDaily = await saveDaily(rate);
      onApply(rate);
      onClose();
      if (cny && setDaily) onDailyChanged?.(today);
      if (undoDaily) {
        const undo = undoDaily;
        toast.undo(`ตั้งเรทกลางวันนี้ (${formatDate(today)}) = ${rate} แล้ว · ใบนี้ใช้ ${rate} — กดบันทึกร่างเพื่อเก็บ`, async () => {
          try { await undo(); if (prevValue) onApply(prevValue); onDailyChanged?.(null); toast.success("ย้อนเรทกลางกลับแล้ว"); }
          catch { toast.error("ย้อนเรทกลางไม่สำเร็จ — แก้ที่แอปโอนเงินจีน แท็บเรท"); }
        }, { ms: 10000 });
      } else {
        toast.success(`เปลี่ยนเรทใบนี้เป็น ${rate} แล้ว — กดบันทึกร่างเพื่อเก็บ`);
      }
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  if (!open) return null;
  return (
    <ERPModal open onClose={() => !busy && onClose()} size="sm" storageKey="fx-rate-quick" title="เปลี่ยนเรท"
      description={`฿ ต่อ 1 ${cny ? "¥" : currency}`}
      footer={<>
        <button onClick={onClose} disabled={busy} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
        <button onClick={() => void apply()} disabled={busy} className="px-5 h-9 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40">{busy ? "กำลังบันทึก…" : "ใช้เรทนี้"}</button>
      </>}>
      <input autoFocus type="number" inputMode="decimal" step="any" min={0} value={txt} onChange={(e) => { setTxt(e.target.value); setErr(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") void apply(); }}
        className="w-full h-10 px-3 text-lg tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300" placeholder="เช่น 5.21" />
      {err && <div className="mt-1.5 text-[12px] text-red-600">{err}</div>}
      {!err && check.ok && check.warn && <div className="mt-1.5 text-[12px] text-amber-700">⚠ {check.warn}</div>}
      <div className="mt-3 space-y-1.5 text-sm">
        <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={!setDaily} onChange={() => setSetDaily(false)} /> เฉพาะใบนี้</label>
        {cny && (
          <label className="flex items-start gap-2 cursor-pointer"><input type="radio" className="mt-1" checked={setDaily} onChange={() => setSetDaily(true)} />
            <span>ตั้งเป็นเรทกลางวันนี้ด้วย <span className="block text-[11px] text-slate-400">ใบอื่นที่ออกตั้งแต่วันนี้ ({formatDate(today)}) จะได้เรทนี้เป็นค่าเริ่มต้น · ย้อนกลับได้จากแจ้งเตือน</span></span></label>
        )}
      </div>
      {cny && (
        <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] text-slate-600">
          {rows == null ? "กำลังโหลดเรทกลาง…" : latest ? <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>เรทกลางล่าสุด {formatDate(latest.rate_date)} = <b className="tabular-nums text-slate-800">{latestRate}</b></span>
              <RateStaleChip rateDate={latest.rate_date} refDate={refDate || today} />
              {latestRate && String(latestRate) !== txt && <button type="button" onClick={() => setTxt(String(latestRate))} className="ml-auto text-sky-700 hover:underline whitespace-nowrap">ใช้ {latestRate}</button>}
            </div>
            {age != null && age > 0 && <div className="text-[11px] text-slate-400 mt-0.5">ยังไม่มีเรทของวันนี้ — ติ๊ก &ldquo;ตั้งเป็นเรทกลางวันนี้ด้วย&rdquo; ถ้าเรทเปลี่ยน</div>}
          </> : "ยังไม่มีเรทกลาง — ติ๊ก “ตั้งเป็นเรทกลางวันนี้ด้วย” เพื่อเริ่มใช้"}
        </div>
      )}
    </ERPModal>
  );
}
