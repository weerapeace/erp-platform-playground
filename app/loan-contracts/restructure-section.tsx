"use client";
/**
 * แผง "🔧 ปรับโครงสร้างหนี้" ท้ายหน้าสัญญาเงินกู้ (recordSections ของกลาง)
 *   • ปุ่มเปิดป๊อป 4 ขั้น (เฉพาะคนมีสิทธิ์ loan_contracts.restructure — ตอนนี้ admin)
 *   • เส้นเวลาประวัติทุกครั้งที่ปรับ: เปลี่ยนอะไร จากอะไร → เป็นอะไร ใครทำ หนังสือธนาคาร
 *   • ย้อนกลับครั้งล่าสุด (ConfirmDialog กลาง · ถ้ามีใบจ่ายหลังวันมีผล ต้องพิมพ์ CONFIRM)
 */
import { useCallback, useEffect, useState } from "react";
import { usePermission } from "@/components/auth";
import { ConfirmDialog } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { kindLabel } from "@/lib/loan-restructure";
import { RestructureModal } from "./restructure-modal";

type Rs = {
  id: string; seq_no: number; effective_date: string; kinds: string[]; bank_ref: string; reason: string;
  old_terms: Record<string, unknown>; new_terms: Record<string, unknown>;
  capitalized_interest: number; fee_amount: number; status: string;
  created_by_name: string; created_at: string; reverted_at: string | null;
};

const num = (v: unknown): number => { const n = Number(v); return isFinite(n) ? n : 0; };
const thDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};
const METHOD_TH: Record<string, string> = {
  equal_installment: "ผ่อนเท่ากันทุกงวด", equal_principal: "ตัดเงินต้นเท่ากัน", interest_only: "ดอกอย่างเดียว", custom: "กำหนดเอง",
};

function Diff({ label, from, to }: { label: string; from: string; to: string }) {
  if (from === to) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs mr-3">
      <span className="text-slate-500">{label}</span>
      <span className="line-through text-slate-400">{from}</span>
      <span className="text-slate-400">→</span>
      <span className="font-semibold text-teal-800">{to}</span>
    </span>
  );
}

export function LoanRestructureSection({
  contractId, row, onChanged,
}: { contractId: string; row: Record<string, unknown>; onChanged: () => Promise<void> | void }) {
  const canDo = usePermission("loan_contracts.restructure");
  const [items, setItems] = useState<Rs[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [revert, setRevert] = useState<{ id: string; force: boolean; count: number } | null>(null);
  const [reverting, setReverting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await apiFetch(`/api/loan-restructure?contract_id=${contractId}`);
      const j = await r.json();
      if (j?.error) setErr(String(j.error)); else setItems((j.data ?? []) as Rs[]);
    } catch { setErr("โหลดประวัติปรับโครงสร้างไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [contractId]);

  useEffect(() => { void load(); }, [load]);

  const refreshAll = async () => { await load(); await onChanged(); };

  const doRevert = async () => {
    if (!revert) return;
    setReverting(true);
    try {
      const r = await apiFetch("/api/loan-restructure/revert", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: revert.id, force: revert.force }),
      });
      const j = await r.json();
      if (r.status === 409 && j?.error === "payments_after") {
        // มีใบจ่ายหลังวันมีผล → เปิดกล่องยืนยันอีกชั้นแบบต้องพิมพ์ CONFIRM
        setRevert({ id: revert.id, force: true, count: Number(j.payments_after ?? 0) });
        return;
      }
      if (!r.ok || j?.error) { setErr(String(j?.error ?? "ย้อนกลับไม่สำเร็จ")); setRevert(null); return; }
      setRevert(null);
      await refreshAll();
    } catch { setErr("ย้อนกลับไม่สำเร็จ กรุณาลองใหม่"); setRevert(null); }
    finally { setReverting(false); }
  };

  const latestApplied = items.find((x) => x.status === "applied");
  const count = num(row.restructure_count);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-slate-500">
          {count > 0
            ? <>ปรับโครงสร้างแล้ว <b className="text-slate-700">{count} ครั้ง</b> · ล่าสุดมีผล {thDate(String(row.last_restructure_date ?? ""))}</>
            : "ยังไม่เคยปรับโครงสร้างหนี้กับธนาคาร"}
        </p>
        {canDo ? (
          <button type="button" onClick={() => setOpen(true)}
            className="ml-auto h-8 px-3 text-xs font-medium rounded-lg border border-orange-500 bg-orange-500 text-white hover:bg-orange-600 transition-colors">
            🔧 ปรับโครงสร้างหนี้
          </button>
        ) : (
          <span className="ml-auto text-[11px] text-slate-400">เฉพาะผู้ดูแลระบบ</span>
        )}
      </div>

      {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}

      {loading ? (
        <p className="text-xs text-slate-400">กำลังโหลดประวัติ...</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-slate-400">
          เมื่อธนาคารเปลี่ยนเงื่อนไข (ลดดอก ยืดเวลา พักเงินต้น) ให้กดปุ่มด้านบน — ระบบจะสร้างตารางผ่อนใหม่และเก็บเงื่อนไขเดิมไว้ให้ดูย้อนหลัง
        </p>
      ) : (
        <ol className="relative border-l border-slate-200 ml-2 space-y-4">
          {items.map((it) => {
            const o = it.old_terms ?? {}, n = it.new_terms ?? {};
            const reverted = it.status !== "applied";
            return (
              <li key={it.id} className={`ml-4 ${reverted ? "opacity-60" : ""}`}>
                <span className={`absolute -left-[9px] mt-1 w-4 h-4 rounded-full border-2 ${reverted ? "bg-slate-100 border-slate-300" : "bg-orange-100 border-orange-500"}`} />
                <div className="text-[11px] text-slate-500">
                  มีผล {thDate(it.effective_date)} · โดย {it.created_by_name || "—"} · บันทึก {thDate(it.created_at)}
                  {it.bank_ref && <> · หนังสือ <span className="font-mono">{it.bank_ref}</span></>}
                  {reverted && <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">ย้อนกลับแล้ว {thDate(it.reverted_at)}</span>}
                </div>
                <div className="text-sm font-semibold text-slate-800">
                  ครั้งที่ {it.seq_no} — {(it.kinds ?? []).map(kindLabel).join(" + ") || "ปรับโครงสร้างหนี้"}
                </div>
                <div className="mt-1 flex flex-wrap">
                  <Diff label="ดอกเบี้ย" from={`${num(o.interest_rate)}%`} to={`${num(n.interest_rate)}%`} />
                  <Diff label="วิธีผ่อน" from={METHOD_TH[String(o.repayment_method)] ?? String(o.repayment_method ?? "—")} to={METHOD_TH[String(n.repayment_method)] ?? String(n.repayment_method ?? "—")} />
                  <Diff label="งวดทั้งหมด" from={`${num(o.total_installment_count)} งวด`} to={`${num(n.total_installment_count)} งวด`} />
                  <Diff label="สิ้นสุด" from={thDate(String(o.end_date ?? ""))} to={thDate(String(n.last_due_date ?? ""))} />
                  <Diff label="ค่างวด" from={formatAmount(num(o.estimated_monthly_payment))} to={formatAmount(num(n.installment_amount))} />
                  {num(n.holiday_periods) > 0 && <span className="text-xs text-amber-700 mr-3">พักเงินต้น {num(n.holiday_periods)} งวด</span>}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  เงินต้นตั้งต้นใหม่ {formatAmount(num(n.opening_principal))}
                  {num(it.capitalized_interest) > 0 && <> · ดอกค้างทบเข้าต้น {formatAmount(num(it.capitalized_interest))}</>}
                  {num(it.fee_amount) > 0 && <> · ค่าธรรมเนียม {formatAmount(num(it.fee_amount))} (จ่ายแยก)</>}
                  {num(n.total_interest) > 0 && <> · ดอกเบี้ยรวมที่เหลือ {formatAmount(num(n.total_interest))}</>}
                </div>
                {it.reason && <div className="text-xs text-slate-500 mt-1 whitespace-pre-line">💬 {it.reason}</div>}
                {canDo && !reverted && latestApplied?.id === it.id && (
                  <button type="button" onClick={() => setRevert({ id: it.id, force: false, count: 0 })}
                    className="mt-1.5 h-7 px-2.5 text-[11px] font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200">
                    ↩ ย้อนกลับครั้งนี้
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <RestructureModal open={open} onClose={() => setOpen(false)} contract={row} onDone={refreshAll} />

      <ConfirmDialog
        open={!!revert}
        onClose={() => { if (!reverting) setRevert(null); }}
        onConfirm={doRevert}
        loading={reverting}
        variant="danger"
        title="ย้อนกลับการปรับโครงสร้างหนี้"
        confirmText="ย้อนกลับ"
        requireTyped={revert?.force ? "CONFIRM" : undefined}
        message={revert?.force
          ? `มีใบจ่ายที่ยืนยันแล้ว ${revert.count} ใบ หลังวันมีผล — ถ้าย้อนกลับ ใบจ่ายเหล่านั้นจะถูกตัดยอดใหม่ตามตารางเดิม กรุณาตรวจก่อน แล้วพิมพ์ CONFIRM เพื่อยืนยัน`
          : "ระบบจะคืนเงื่อนไขเดิม กลับไปใช้ตารางผ่อนเวอร์ชันก่อนหน้า และยกเลิกค่าธรรมเนียม/ดอกทบที่บันทึกไว้จากครั้งนี้"}
      />
    </div>
  );
}
