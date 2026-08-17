"use client";

/**
 * แผง "ค่าธรรมเนียมของสัญญา" ในหน้าสัญญาเงินกู้
 * --------------------------------------------------------------------------
 * เจ้าของขอ: "เพิ่มรายการค่าธรรมเนียมด้วย จะได้รู้ว่ากู้แล้วได้เงินจริงเท่าไหร่"
 *
 * ค่าธรรมเนียมที่จ่ายตอนทำสัญญา (ค่าอากรแสตมป์ ค่าประเมิน ค่าจัดการ ฯลฯ)
 * ใส่ที่นี่ → ระบบคิด "ค่าธรรมเนียมรวม" และ "ได้รับเงินจริง (สุทธิ)" ให้อัตโนมัติ
 * (ค่าธรรมเนียมที่ผูกกับใบเบิกเงิน ระบบนับรวมให้อยู่แล้ว ไม่ต้องกรอกซ้ำ)
 *
 * เพิ่ม/แก้/ลบ ได้จากหน้านี้เลย — บันทึกผ่าน API กลาง master-v2
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { DateInput } from "@/components/date-input";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/money";

type Fee = { id: string; label: string; amount: number; fee_date: string | null; note: string };
type ChargeType = { id: string; name: string; bucket: string; lender_name: string; sort_order: number };

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const inputCls = "w-full h-8 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500";

export function LoanFeesSection({ contractId }: { contractId: string }) {
  const [rows, setRows] = useState<Fee[]>([]);
  const [types, setTypes] = useState<ChargeType[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<{ label: string; amount: string; fee_date: string }>({ label: "", amount: "", fee_date: "" });

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const flt = encodeURIComponent(JSON.stringify({ loan_contract_id: { type: "text", value: contractId } }));
      const r = await apiFetch(`/api/master-v2/loan-contract-fees?filters=${flt}&limit=200`);
      const j = await r.json();
      setRows(((j?.data ?? []) as Record<string, unknown>[]).map((f) => ({
        id: String(f.id), label: String(f.label ?? ""), amount: num(f.amount),
        fee_date: (f.fee_date as string) ?? null, note: String(f.note ?? ""),
      })));
    } catch { setErr("โหลดรายการค่าธรรมเนียมไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [contractId]);

  useEffect(() => { void load(); }, [load]);

  // ชื่อรายการที่ตั้งไว้แล้ว — กดเลือกได้เร็ว (ตั้งค่าเพิ่มที่ /loan-charge-types)
  useEffect(() => {
    apiFetch("/api/master-v2/loan-charge-types?limit=200&sort_by=sort_order&sort_dir=asc")
      .then((r) => r.json())
      .then((j) => setTypes(((j?.data ?? []) as Record<string, unknown>[]).map((t) => ({
        id: String(t.id), name: String(t.name ?? ""), bucket: String(t.bucket ?? "fee"),
        lender_name: String(t.lender_name ?? ""), sort_order: num(t.sort_order),
      }))))
      .catch(() => { /* ไม่มีก็พิมพ์ชื่อเองได้ */ });
  }, []);

  const total = useMemo(() => rows.reduce((a, r) => a + r.amount, 0), [rows]);

  const add = async () => {
    const label = draft.label.trim();
    const amount = num(draft.amount);
    if (!label) { setErr("ใส่ชื่อรายการก่อน"); return; }
    if (amount <= 0) { setErr("ใส่จำนวนเงินก่อน"); return; }
    setBusy(true); setErr("");
    try {
      const res = await apiFetch("/api/master-v2/loan-contract-fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loan_contract_id: contractId, label, amount, fee_date: draft.fee_date || null }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) { setErr(j?.error || "เพิ่มรายการไม่สำเร็จ"); setBusy(false); return; }
      setDraft({ label: "", amount: "", fee_date: "" });
      await load();
    } catch { setErr("เกิดข้อผิดพลาดในการเชื่อมต่อ"); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true); setErr("");
    try {
      const res = await apiFetch(`/api/master-v2/loan-contract-fees/${id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) { setErr(j?.error || "ลบไม่สำเร็จ"); setBusy(false); return; }
      await load();
    } catch { setErr("เกิดข้อผิดพลาดในการเชื่อมต่อ"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-2">
      {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {err}</div>}

      {loading && rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</div>
      ) : rows.length === 0 ? (
        <div className="py-4 text-center text-sm text-slate-400">ยังไม่มีรายการค่าธรรมเนียมของสัญญานี้</div>
      ) : (
        <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
          {rows.map((f) => (
            <div key={f.id} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 text-sm text-slate-700 truncate">{f.label}</span>
              {f.fee_date && <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{f.fee_date}</span>}
              <span className="text-sm font-medium tabular-nums text-slate-800 shrink-0">{formatAmount(f.amount)}</span>
              <button type="button" onClick={() => remove(f.id)} disabled={busy} title="ลบรายการนี้"
                className="w-6 h-6 rounded text-slate-300 hover:text-red-600 hover:bg-red-50 shrink-0 disabled:opacity-40">🗑</button>
            </div>
          ))}
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50">
            <span className="flex-1 text-xs font-semibold text-slate-600">รวมค่าธรรมเนียมของสัญญา</span>
            <span className="text-sm font-bold tabular-nums text-slate-800">{formatAmount(total)}</span>
            <span className="w-6 shrink-0" />
          </div>
        </div>
      )}

      {/* เพิ่มรายการใหม่ */}
      <div className="rounded-lg border border-dashed border-slate-300 p-3 space-y-2">
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-5">
            <input value={draft.label} onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
              placeholder="ชื่อรายการ เช่น ค่าอากรแสตมป์" className={inputCls} />
          </div>
          <div className="col-span-3">
            <MoneyInput value={draft.amount} onChange={(raw) => setDraft((p) => ({ ...p, amount: raw }))}
              placeholder="0.00" className={`${inputCls} text-right tabular-nums`} />
          </div>
          <div className="col-span-3">
            <DateInput value={draft.fee_date} onChange={(iso) => setDraft((p) => ({ ...p, fee_date: iso }))} />
          </div>
          <div className="col-span-1">
            <button type="button" onClick={add} disabled={busy}
              className="w-full h-8 text-xs font-medium rounded-md border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              เพิ่ม
            </button>
          </div>
        </div>

        {types.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400">เลือกเร็ว:</span>
            {types.slice(0, 8).map((t) => (
              <button key={t.id} type="button" onClick={() => setDraft((p) => ({ ...p, label: t.name }))}
                className="h-6 px-2 text-[11px] rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">
                {t.name}
              </button>
            ))}
            <a href="/loan-charge-types" target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-blue-600 hover:underline ml-auto">ตั้งค่ารายการ ↗</a>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400">
        ใส่แล้วระบบคิด “ค่าธรรมเนียมรวม” และ “ได้รับเงินจริง (สุทธิ)” ในหมวดเงินต้น &amp; ดอกเบี้ยให้อัตโนมัติ ·
        ค่าธรรมเนียมที่กรอกไว้ในใบเบิกเงิน ระบบนับรวมให้แล้ว ไม่ต้องกรอกซ้ำ
      </p>
    </div>
  );
}
