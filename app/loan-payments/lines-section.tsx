"use client";

/**
 * แผง "รายการย่อยของใบจ่าย" ในหน้ารายละเอียดการจ่ายเงินกู้
 * รายการย่อย = ค่าธรรมเนียม/รายการเพิ่มเติมที่แยกไว้ตอนกด "+ บันทึกการจ่าย" (เดิมบันทึกแล้วไม่เคยโชว์ที่ไหน)
 * แก้ได้: ชื่อ · จำนวน · ช่อง (เงินต้น/ดอกเบี้ย/ดอกผิดนัด/ค่าธรรมเนียม/อื่น ๆ) · เอาออก
 * ยอดจ่ายรวมของใบจ่ายไม่เปลี่ยน — ถ้ายอดจ่ายจริงผิด ให้แก้ที่ใบจ่าย
 */
import { useCallback, useEffect, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { formatAmount } from "@/lib/money";
import type { LoanPaymentLine } from "@/app/api/loan-payment/lines/route";

const BUCKET_LABEL: Record<string, string> = { principal: "เงินต้น", interest: "ดอกเบี้ย", penalty: "ดอกผิดนัด", fee: "ค่าธรรมเนียม", other: "อื่น ๆ" };
const inputCls = "w-full h-8 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500";

export function LoanPaymentLinesSection({ paymentId, readonly, onChanged }: {
  paymentId: string; readonly?: boolean;
  onChanged?: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<LoanPaymentLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ed, setEd] = useState<{ id: string; label: string; amount: string; bucket: string } | null>(null);
  const [delAsk, setDelAsk] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!paymentId) return;
    setLoading(true);
    try {
      const j = await apiFetch(`/api/loan-payment/lines?payment_id=${paymentId}`).then((r) => r.json());
      setRows((j?.data ?? []) as LoanPaymentLine[]);
    } catch { /* แผงเสริม — โหลดไม่ได้ก็ไม่ขวางหน้าหลัก */ }
    finally { setLoading(false); }
  }, [paymentId]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!ed || !ed.label.trim() || !(Number(ed.amount) > 0)) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/loan-payment/lines", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ed.id, label: ed.label.trim(), amount: Number(ed.amount), bucket: ed.bucket }) });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      toast.success("แก้รายการย่อยแล้ว");
      setEd(null);
      await load(); await onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/loan-payment/lines?id=${id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || "เอาออกไม่สำเร็จ");
      toast.success("เอารายการย่อยออกแล้ว — ยอดยังอยู่ในช่องเดิมของใบจ่าย");
      setDelAsk(null);
      await load(); await onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "เอาออกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  if (loading) return <p className="py-4 text-center text-xs text-slate-400">กำลังโหลด…</p>;
  if (rows.length === 0) return <p className="py-3 text-xs text-slate-400">ใบจ่ายนี้ไม่ได้แยกรายการย่อย (ค่าธรรมเนียม/รายการเพิ่มเติม) — แยกได้ตอนกด “+ บันทึกการจ่าย”</p>;

  return (
    <div className="space-y-1.5">
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {rows.map((l) => ed?.id === l.id ? (
          <div key={l.id} className="space-y-2 bg-blue-50/40 px-3 py-2">
            <div className="grid grid-cols-[1fr_130px_130px] gap-1.5">
              <label className="text-[11px] text-slate-500">ชื่อรายการ
                <input value={ed.label} autoFocus onChange={(e) => setEd({ ...ed, label: e.target.value })} className={`mt-0.5 ${inputCls}`} /></label>
              <label className="text-[11px] text-slate-500">ช่อง
                <select value={ed.bucket} onChange={(e) => setEd({ ...ed, bucket: e.target.value })} className={`mt-0.5 ${inputCls} bg-white`}>
                  {Object.entries(BUCKET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></label>
              <label className="text-[11px] text-slate-500">จำนวน (บาท)
                <div className="mt-0.5"><MoneyInput value={ed.amount} onChange={(v) => setEd({ ...ed, amount: String(v ?? "") })} /></div></label>
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <span className="mr-auto text-[11px] text-slate-400">ยอดจ่ายรวมของใบจ่ายไม่เปลี่ยน</span>
              <button onClick={() => setEd(null)} disabled={busy} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600">ยกเลิก</button>
              <button onClick={() => void save()} disabled={busy || !ed.label.trim() || !(Number(ed.amount) > 0)} className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
            </div>
          </div>
        ) : (
          <div key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-slate-700">{l.label}</span>
            <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">{BUCKET_LABEL[l.bucket] ?? l.bucket}</span>
            <span className="w-24 shrink-0 text-right tabular-nums text-slate-700">฿{formatAmount(l.amount)}</span>
            {!readonly && (delAsk === l.id ? (
              <span className="flex shrink-0 items-center gap-1">
                <button onClick={() => void remove(l.id)} disabled={busy} className="h-6 rounded bg-rose-600 px-2 text-[11px] text-white hover:bg-rose-700 disabled:opacity-50">ยืนยัน</button>
                <button onClick={() => setDelAsk(null)} disabled={busy} className="h-6 rounded border border-slate-200 px-2 text-[11px] text-slate-500">ไม่</button>
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => { setDelAsk(null); setEd({ id: l.id, label: l.label, amount: String(l.amount), bucket: l.bucket }); }} title="แก้รายการย่อย" className="text-xs text-slate-300 hover:text-blue-600">✏️</button>
                <button onClick={() => { setEd(null); setDelAsk(l.id); }} title="เอารายการย่อยออก (ยอดยังอยู่ในช่องเดิม)" className="text-xs text-slate-300 hover:text-rose-600">🗑</button>
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400">รายการย่อยเป็นรายละเอียดของยอดในแต่ละช่อง — แก้/เอาออกแล้วยอดจ่ายรวมไม่เปลี่ยน · ย้ายช่องเป็นเงินต้น/ดอกเบี้ย ระบบจะตัดงวดใหม่ให้</p>
    </div>
  );
}
