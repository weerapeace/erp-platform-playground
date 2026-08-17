"use client";

/**
 * แผง "รายการการจ่ายเงินกู้" ในหน้าสัญญา
 * --------------------------------------------------------------------------
 * เจ้าของขอ: "หน้านี้ต้องมีรายการการจ่ายเงินกู้มาลงด้วย · ลงด้วยว่าเงินต้นเท่าไหร่
 *            ดอกเบี้ยเท่าไหร่ · มีค่าธรรมเนียมที่ต้องเสียอะไรบ้าง เท่าไหร่ · มี List ให้ดูด้วย"
 *
 * โชว์ใบจ่ายทุกใบของสัญญานี้ พร้อมยอดแยกครบทุกช่อง + แถวรวมท้ายตาราง
 * ใช้ของกลาง MiniTable (ค้นหา/เรียง/ปรับความกว้างมาในตัว)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { RecordPaymentModal } from "@/app/loan-payments/record-modal";
import { paymentSplitCheck } from "@/app/loan-payments/split-check";
import { InlineCreateButton } from "@/components/master-crud/inline-create";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { formatDate } from "@/lib/date";

type Pay = {
  id: string;
  payment_no: string;
  payment_date: string | null;
  receipt_no: string;
  total: number;
  principal: number;
  interest: number;
  penalty: number;
  fee: number;
  other: number;
  status: string;
};

const STATUS: Record<string, [string, string]> = {
  draft:     ["ร่าง", "bg-slate-100 text-slate-600 border-slate-200"],
  submitted: ["ส่งตรวจสอบ", "bg-amber-50 text-amber-700 border-amber-200"],
  verified:  ["ยืนยันแล้ว", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  cancelled: ["ยกเลิก", "bg-slate-50 text-slate-400 border-slate-200"],
  reversed:  ["กลับรายการ", "bg-purple-50 text-purple-700 border-purple-200"],
};

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const money = (v: number) => v ? <span className="tabular-nums">{formatAmount(v)}</span> : <span className="text-slate-300">—</span>;

export function LoanPaymentsSection({ contractId }: { contractId: string }) {
  const [rows, setRows] = useState<Pay[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [payOpen, setPayOpen] = useState(false);   // บันทึกการจ่ายจากตรงนี้ได้เลย

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const flt = encodeURIComponent(JSON.stringify({ loan_contract_id: { type: "text", value: contractId } }));
      const r = await apiFetch(`/api/master-v2/loan-payments?filters=${flt}&sort_by=payment_date&sort_dir=desc&limit=500`);
      const j = await r.json();
      setRows(((j?.data ?? []) as Record<string, unknown>[]).map((p) => ({
        id: String(p.id),
        payment_no: String(p.payment_no ?? ""),
        payment_date: (p.payment_date as string) ?? null,
        receipt_no: String(p.receipt_no ?? ""),
        total: num(p.total_paid),
        principal: num(p.principal_amount),
        interest: num(p.interest_amount),
        penalty: num(p.penalty_amount),
        fee: num(p.fee_amount),
        other: num(p.other_amount),
        status: String(p.status ?? ""),
      })));
    } catch {
      setErr("โหลดรายการจ่ายไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => { void load(); }, [load]);

  // รวมเฉพาะใบที่ "ยืนยันแล้ว" (ใบร่าง/ยกเลิก ไม่ถูกนับเข้ายอดสัญญาอยู่แล้ว)
  const sum = useMemo(() => rows.filter((r) => r.status === "verified").reduce((a, r) => ({
    total: a.total + r.total, principal: a.principal + r.principal, interest: a.interest + r.interest,
    penalty: a.penalty + r.penalty, fee: a.fee + r.fee, other: a.other + r.other,
  }), { total: 0, principal: 0, interest: 0, penalty: 0, fee: 0, other: 0 }), [rows]);

  const columns: MiniColumn<Pay>[] = useMemo(() => [
    { key: "no", header: "เลขที่จ่าย", width: "9rem", sortValue: (r) => r.payment_no, sortLabel: "เลขที่จ่าย",
      cell: (r) => <span className="text-sm font-medium text-slate-700">{r.payment_no || "—"}</span> },
    { key: "date", header: "วันที่จ่าย", width: "7.5rem", sortValue: (r) => r.payment_date ?? "", sortLabel: "วันที่จ่าย",
      cell: (r) => <span className="text-sm tabular-nums text-slate-600">{r.payment_date ? formatDate(r.payment_date) : "—"}</span> },
    { key: "receipt", header: "เลขที่ใบเสร็จ", width: "1fr", sortValue: (r) => r.receipt_no, sortLabel: "เลขที่ใบเสร็จ",
      cell: (r) => <span className="text-xs text-slate-500 truncate">{r.receipt_no || "—"}</span> },
    { key: "total", header: "ยอดจ่าย", width: "1fr", align: "right", sortValue: (r) => r.total, sortLabel: "ยอดจ่าย",
      cell: (r) => <span className="text-sm font-medium text-slate-800">{money(r.total)}</span> },
    { key: "principal", header: "เงินต้น", width: "1fr", align: "right", sortValue: (r) => r.principal, sortLabel: "เงินต้น",
      cell: (r) => money(r.principal) },
    { key: "interest", header: "ดอกเบี้ย", width: "1fr", align: "right", sortValue: (r) => r.interest, sortLabel: "ดอกเบี้ย",
      cell: (r) => money(r.interest) },
    { key: "penalty", header: "ดอกผิดนัด", width: "1fr", align: "right", sortValue: (r) => r.penalty, sortLabel: "ดอกผิดนัด",
      cell: (r) => money(r.penalty) },
    { key: "fee", header: "ค่าธรรมเนียม", width: "1fr", align: "right", sortValue: (r) => r.fee, sortLabel: "ค่าธรรมเนียม",
      cell: (r) => money(r.fee) },
    { key: "other", header: "อื่น ๆ", width: "1fr", align: "right", sortValue: (r) => r.other, sortLabel: "อื่น ๆ",
      cell: (r) => money(r.other) },
    { key: "status", header: "สถานะ", width: "7rem", align: "center", sortValue: (r) => r.status, sortLabel: "สถานะ",
      cell: (r) => {
        const m = STATUS[r.status];
        return m ? <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${m[1]}`}>{m[0]}</span>
          : <span className="text-xs text-slate-300">{r.status || "—"}</span>;
      } },
  ], []);

  if (loading && rows.length === 0) return <div className="py-8 text-center text-sm text-slate-400">กำลังโหลดรายการจ่าย...</div>;

  return (
    <div className="space-y-2">
      {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {err}</div>}
      {/* สรุปยอดรวมของใบที่ยืนยันแล้ว */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          ["จ่ายไปแล้วรวม", sum.total, "text-slate-800"],
          ["เงินต้น", sum.principal, "text-blue-700"],
          ["ดอกเบี้ย", sum.interest, "text-amber-700"],
          ["ดอกผิดนัด", sum.penalty, "text-red-700"],
          ["ค่าธรรมเนียม", sum.fee, "text-violet-700"],
          ["อื่น ๆ", sum.other, "text-slate-500"],
        ].map(([label, val, cls]) => (
          <div key={String(label)} className="rounded-lg border border-slate-200 px-2.5 py-2">
            <div className="text-[10px] text-slate-400">{String(label)}</div>
            <div className={`text-sm font-semibold tabular-nums ${String(cls)}`}>{formatAmount(Number(val))}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[70rem]">
          <MiniTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            searchText={(r) => `${r.payment_no} ${r.receipt_no} ${r.payment_date ?? ""}`}
            searchPlaceholder="ค้นหาเลขที่จ่าย / ใบเสร็จ / วันที่…"
            countUnit="ใบ"
            dense
            maxHeightClass="max-h-[26rem]"
            emptyText="ยังไม่มีการจ่ายของสัญญานี้ — กดปุ่ม 💵 บันทึกการจ่าย ด้านบนได้เลย"
            footnote="ยอดรวมด้านบนนับเฉพาะใบที่สถานะ “ยืนยันแล้ว” · ยอด “อื่น ๆ” เช่น ค่าอากรแสตมป์ จ่ายจริงแต่ไม่ตัดเข้างวดผ่อน"
            actions={
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPayOpen(true)}
                  className="h-8 px-3 text-xs font-medium rounded-lg border border-blue-600 bg-blue-600 text-white hover:bg-blue-700">
                  💵 บันทึกการจ่าย
                </button>
                {/* ลงหลายใบรวดเดียว (ของกลาง) — ล็อกสัญญานี้ไว้ให้ทุกแถว ไม่ต้องเลือกซ้ำ */}
                <InlineCreateButton
                  moduleKey="loan-payments"
                  title="การจ่ายเงินกู้"
                  fixedValues={{ loan_contract_id: contractId }}
                  rowCheck={paymentSplitCheck}
                  onSaved={load}
                  label="➕ เพิ่มหลายรายการ"
                />
                <a href={`/loan-payments?flt=${encodeURIComponent(JSON.stringify({ loan_contract_id: contractId }))}`}
                  target="_blank" rel="noopener noreferrer"
                  className="h-8 px-3 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 inline-flex items-center">
                  เปิดหน้าเต็ม ↗
                </a>
              </div>
            }
          />
        </div>
      </div>

      {/* บันทึกการจ่ายจากในหน้าสัญญาได้เลย — ป๊อปกลางตัวเดียวกับหน้า /loan-payments */}
      <RecordPaymentModal
        open={payOpen} contractId={contractId}
        onClose={() => setPayOpen(false)}
        onCreated={() => { setPayOpen(false); void load(); }}
      />
    </div>
  );
}
