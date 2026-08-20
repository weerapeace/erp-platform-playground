"use client";

/**
 * 💵 รับชำระเงิน (Customer Receipts)
 * URL: /receipts
 *
 * บันทึกว่า "ลูกค้าจ่ายเงินมาแล้ว" → ตัดยอดค้างรับของใบขาย/ใบวางบิลให้ลดลงจริง
 * นี่คือสิ่งที่ทำให้หน้ากระแสเงินสด (/cashflow) เปลี่ยนจาก "ประมาณการ" เป็นตัวเลขจริง
 *
 * ใช้ของกลาง: ตารางกลาง DataTable · ERPModal/ConfirmDialog · CustomerPicker · MoneyInput · DateInput
 * สูตรยอดค้างรับ/ตรวจยอด อยู่ที่ lib/receipts.ts — ห้ามเขียนซ้ำในไฟล์นี้
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { CustomerPicker, type CustomerPickerValue } from "@/components/pickers";
import { MoneyInput } from "@/components/money-input";
import { DateInput } from "@/components/date-input";
import { InfoHint } from "@/components/info-hint";
import { usePermission, AccessDenied, useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { THB, todayISO } from "@/lib/cashflow";
import {
  RECEIPT_METHOD, receiptMethodLabel, receiptStatusBadge, receiptStatusLabel,
  settledAmount, validateAllocation, type ReceiptMethod,
} from "@/lib/receipts";
import type { OpenDoc, Receipt } from "@/app/api/receipts/route";

/** บรรทัดที่กำลังกรอกในฟอร์ม (ยังไม่บันทึก) */
type DraftLine = OpenDoc & { pay: string };

export default function ReceiptsPage() {
  const canView = usePermission("receipts.view");
  const canCreate = usePermission("receipts.create");
  const canCancel = usePermission("receipts.cancel");
  const { permsReady } = useAuth();

  const [rows, setRows] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Receipt | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [openTotal, setOpenTotal] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    apiFetch("/api/receipts")
      .then((r) => r.json())
      .then((j) => { if (j?.error) setError(j.error); else setRows((j.data ?? []) as Receipt[]); })
      .catch(() => setError("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"))
      .finally(() => setLoading(false));
    // ยอดค้างรับรวมทั้งระบบ — ใช้โชว์บนการ์ด
    apiFetch("/api/receipts?open_docs=1")
      .then((r) => r.json())
      .then((j) => {
        const docs = (j?.data ?? []) as OpenDoc[];
        setOpenTotal(docs.reduce((s, d) => s + d.outstanding, 0));
      })
      .catch(() => setOpenTotal(null));
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const cancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await apiFetch("/api/receipts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cancelTarget.id, status: "cancelled" }),
      });
      const j = await res.json();
      if (j?.error) { setError(j.error); return; }
      setCancelTarget(null);
      load();
    } catch { setError("ยกเลิกไม่สำเร็จ"); }
    finally { setCancelling(false); }
  };

  const thisMonth = todayISO().slice(0, 7);
  const receivedThisMonth = rows
    .filter((r) => r.status === "confirmed" && r.receipt_date.startsWith(thisMonth))
    .reduce((s, r) => s + r.amount, 0);
  const settledThisMonth = rows
    .filter((r) => r.status === "confirmed" && r.receipt_date.startsWith(thisMonth))
    .reduce((s, r) => s + settledAmount(r.amount, r.wht_amount), 0);

  const columns = useMemo<ColumnDef<Receipt>[]>(() => [
    { id: "receipt_no", accessorKey: "receipt_no", header: "เลขที่", size: 150 },
    {
      id: "receipt_date", accessorKey: "receipt_date", header: "วันที่รับ", size: 110,
      cell: ({ row }) => formatDate(row.original.receipt_date),
    },
    { id: "customer_name", accessorKey: "customer_name", header: "ลูกค้า", size: 240 },
    {
      id: "amount", accessorKey: "amount", header: "เงินเข้าบัญชี", size: 130,
      cell: ({ row }) => <span className="tabular-nums font-medium text-emerald-600">{THB(row.original.amount)}</span>,
    },
    {
      id: "wht_amount", accessorKey: "wht_amount", header: "หัก ณ ที่จ่าย", size: 120,
      cell: ({ row }) => row.original.wht_amount > 0
        ? <span className="tabular-nums text-slate-600">{THB(row.original.wht_amount)}</span>
        : <span className="text-slate-300">—</span>,
    },
    {
      id: "settled", header: "ตัดหนี้รวม", size: 130,
      accessorFn: (r) => settledAmount(r.amount, r.wht_amount),
      cell: ({ row }) => (
        <span className="tabular-nums font-semibold text-slate-800">
          {THB(settledAmount(row.original.amount, row.original.wht_amount))}
        </span>
      ),
    },
    {
      id: "method", accessorKey: "method", header: "วิธีรับเงิน", size: 120,
      cell: ({ row }) => <span className="text-sm">{RECEIPT_METHOD[row.original.method as ReceiptMethod]?.icon ?? "•"} {receiptMethodLabel(row.original.method)}</span>,
    },
    {
      id: "docs", header: "ตัดใบไหน", size: 240,
      accessorFn: (r) => r.lines.map((l) => l.so_number ?? l.bill_number).join(", "),
      cell: ({ row }) => (
        <span className="text-xs text-slate-500">
          {row.original.lines.map((l) => l.so_number ?? l.bill_number).join(", ") || "—"}
        </span>
      ),
    },
    {
      id: "status", accessorKey: "status", header: "สถานะ", size: 110,
      cell: ({ row }) => (
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${receiptStatusBadge(row.original.status)}`}>
          {receiptStatusLabel(row.original.status)}
        </span>
      ),
    },
    { id: "reference_no", accessorKey: "reference_no", header: "อ้างอิง", size: 140 },
  ], []);

  if (permsReady && !canView) {
    return <PlaygroundShell><AccessDenied message="หน้ารับชำระเงินเปิดให้เฉพาะผู้ที่มีสิทธิ์ดูงานขาย" /></PlaygroundShell>;
  }

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">💵 รับชำระเงิน</h1>
          <p className="text-slate-500 mt-1 text-sm">
            บันทึกเงินที่ลูกค้าจ่ายเข้ามา — ยอดค้างรับของใบขาย/ใบวางบิลจะลดลงตามทันที
          </p>
        </div>
        {canCreate && (
          <button onClick={() => setFormOpen(true)}
                  className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            + บันทึกรับชำระ
          </button>
        )}
      </div>

      <div className="px-4 md:px-8 py-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 flex items-center justify-between gap-3">
            <span>⚠️ {error}</span>
            <button onClick={load} className="h-8 px-3 text-white bg-red-600 rounded-lg">ลองใหม่</button>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-xs text-slate-500">เงินเข้าบัญชีเดือนนี้</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-emerald-600">{THB(receivedThisMonth)}</p>
            <p className="text-xs text-slate-400 mt-1">ตัดหนี้รวม {THB(settledThisMonth)} (รวมหัก ณ ที่จ่าย)</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-xs text-slate-500">ยอดค้างรับทั้งหมด</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-amber-600">
              {openTotal === null ? "…" : THB(openTotal)}
            </p>
            <p className="text-xs text-slate-400 mt-1">ใบขาย + ใบวางบิลที่ยังเก็บเงินไม่ครบ</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-xs text-slate-500">ใบรับชำระทั้งหมด</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">{rows.length}</p>
            <p className="text-xs text-slate-400 mt-1">
              ยกเลิก {rows.filter((r) => r.status === "cancelled").length} ใบ
            </p>
          </div>
        </div>

        <DataTable<Receipt>
          data={rows}
          columns={columns}
          tableId="customer-receipts"
          title="ใบรับชำระทั้งหมด"
          description="เรียงจากใหม่ไปเก่า"
          loading={loading}
          emptyMessage="ยังไม่มีใบรับชำระ — กด “+ บันทึกรับชำระ” เมื่อลูกค้าโอนเงินเข้ามา"
          searchPlaceholder="ค้นหาเลขที่ / ชื่อลูกค้า / เลขอ้างอิง…"
          searchableKeys={["receipt_no", "customer_name", "reference_no"]}
          exportFilename="customer-receipts"
          exportEntityType="customer_receipts"
          selectable
          pageSize={50}
          onRetry={load}
          rowActions={canCancel ? [{
            label: "ยกเลิกใบนี้",
            onClick: (row) => setCancelTarget(row),
            variant: "danger",
            show: (row) => row.status !== "cancelled",
          }] : undefined}
        />
      </div>

      <ReceiptFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); load(); }} />

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={cancel}
        loading={cancelling}
        title="ยกเลิกใบรับชำระ?"
        message={cancelTarget
          ? `ใบ ${cancelTarget.receipt_no} (${THB(cancelTarget.amount)}) จะถูกยกเลิก และยอดค้างรับของใบที่เคยตัดไว้จะกลับคืนมาเต็มจำนวน`
          : ""}
        confirmText="ยกเลิกใบนี้"
        variant="danger"
      />
    </PlaygroundShell>
  );
}

// ============================================================
// ฟอร์มบันทึกรับชำระ
// ============================================================
function ReceiptFormModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [customer, setCustomer] = useState<CustomerPickerValue | null>(null);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [wht, setWht] = useState("");
  const [fee, setFee] = useState("");
  const [method, setMethod] = useState<ReceiptMethod>("transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [docs, setDocs] = useState<DraftLine[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // เปิดฟอร์มใหม่ = ล้างของเก่าทิ้ง
  useEffect(() => {
    if (!open) return;
    setCustomer(null); setDate(todayISO()); setAmount(""); setWht(""); setFee("");
    setMethod("transfer"); setReference(""); setNote(""); setDocs([]); setErr(null);
  }, [open]);

  // เลือกลูกค้า → ดึงใบที่ยังค้างรับของลูกค้ารายนั้น
  useEffect(() => {
    if (!open || !customer?.id) { setDocs([]); return; }
    setLoadingDocs(true); setErr(null);
    apiFetch(`/api/receipts?open_docs=1&customer_id=${customer.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.error) { setErr(j.error); return; }
        setDocs(((j.data ?? []) as OpenDoc[]).map((d) => ({ ...d, pay: "" })));
      })
      .catch(() => setErr("โหลดใบค้างรับไม่สำเร็จ"))
      .finally(() => setLoadingDocs(false));
  }, [open, customer?.id]);

  const settled = settledAmount(Number(amount || 0), Number(wht || 0));
  const allocated = docs.reduce((s, d) => s + Number(d.pay || 0), 0);
  const remaining = Math.round((settled - allocated) * 100) / 100;

  const setPay = (id: string, value: string) =>
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, pay: value } : d)));

  /** ตัดใบเก่าสุดก่อนจนกว่ายอดจะหมด — ปุ่มลัดที่ใช้บ่อยสุดเวลาโอนมาก้อนเดียว */
  const autoAllocate = () => {
    let left = settled;
    setDocs((prev) => prev.map((d) => {
      if (left <= 0) return { ...d, pay: "" };
      const take = Math.min(left, d.outstanding);
      left = Math.round((left - take) * 100) / 100;
      return { ...d, pay: take > 0 ? String(take) : "" };
    }));
  };

  const save = async () => {
    const lines = docs
      .filter((d) => Number(d.pay || 0) > 0)
      .map((d) => ({
        so_id: d.kind === "so" ? d.id : null,
        so_number: d.kind === "so" ? d.number : null,
        billing_note_id: d.kind === "bn" ? d.id : null,
        bill_number: d.kind === "bn" ? d.number : null,
        amount: Number(d.pay),
      }));

    const invalid = validateAllocation(Number(amount || 0), Number(wht || 0), lines);
    if (invalid) { setErr(invalid); return; }

    const over = docs.find((d) => Number(d.pay || 0) > d.outstanding + 0.01);
    if (over) { setErr(`ใบ ${over.number} ใส่ยอดเกินที่ค้างอยู่ (${THB(over.outstanding)})`); return; }

    setSaving(true); setErr(null);
    try {
      const res = await apiFetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receipt_date: date,
          customer_id: customer?.id ?? null,
          customer_name: customer?.name ?? null,
          amount: Number(amount || 0),
          wht_amount: Number(wht || 0),
          fee_amount: Number(fee || 0),
          method, reference_no: reference, note, lines,
        }),
      });
      const j = await res.json();
      if (j?.error) { setErr(j.error); return; }
      onSaved();
    } catch { setErr("บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const dirty = !!customer || !!amount || docs.some((d) => d.pay);

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title="💵 บันทึกรับชำระจากลูกค้า"
      description="เลือกลูกค้า → ใส่ยอดที่ได้รับ → เลือกว่าจะตัดใบไหนบ้าง"
      size="xl"
      storageKey="receipt-form"
      hasUnsavedChanges={dirty && !saving}
      footer={
        <div className="flex items-center justify-between gap-3 flex-wrap w-full">
          <div className="text-sm">
            {remaining === 0 && allocated > 0
              ? <span className="text-emerald-600 font-medium">✓ กระจายยอดครบแล้ว</span>
              : <span className={remaining > 0 ? "text-amber-600" : "text-red-600"}>
                  {remaining > 0 ? `ยังต้องกระจายอีก ${THB(remaining)}` : `กระจายเกินไป ${THB(Math.abs(remaining))}`}
                </span>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
              ยกเลิก
            </button>
            <button onClick={save} disabled={saving || settled <= 0}
                    className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก…" : "บันทึกรับชำระ"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{err}</div>}

        {/* ---- หัวใบ ---- */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">ลูกค้า <span className="text-red-500">*</span></label>
            <CustomerPicker value={customer} onChange={setCustomer} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">วันที่รับเงิน</label>
            <DateInput value={date} onChange={setDate} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">วิธีรับเงิน</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as ReceiptMethod)}
                    className="w-full h-9 px-2.5 text-sm border border-slate-200 rounded-lg bg-white">
              {(Object.keys(RECEIPT_METHOD) as ReceiptMethod[]).map((m) => (
                <option key={m} value={m}>{RECEIPT_METHOD[m].icon} {RECEIPT_METHOD[m].label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              เงินเข้าบัญชี <span className="text-red-500">*</span>
            </label>
            <MoneyInput value={amount} onChange={setAmount}
                        className="w-full h-9 px-2.5 text-sm text-right border border-slate-200 rounded-lg" />
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label className="block text-xs text-slate-500">หัก ณ ที่จ่าย</label>
              <InfoHint>ลูกค้าหักภาษีไว้ เงินไม่เข้าบัญชีเรา แต่ถือว่าลูกค้าจ่ายหนี้แล้ว — ใส่ตรงนี้ยอดค้างถึงจะลดครบ</InfoHint>
            </div>
            <MoneyInput value={wht} onChange={setWht}
                        className="w-full h-9 px-2.5 text-sm text-right border border-slate-200 rounded-lg" />
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label className="block text-xs text-slate-500">ค่าธรรมเนียมธนาคาร</label>
              <InfoHint>ค่าธรรมเนียมที่ถูกหักจากยอดโอน — เป็นต้นทุนของเรา ไม่ได้ลดหนี้ลูกค้า</InfoHint>
            </div>
            <MoneyInput value={fee} onChange={setFee}
                        className="w-full h-9 px-2.5 text-sm text-right border border-slate-200 rounded-lg" />
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm flex items-center justify-between flex-wrap gap-2">
          <span className="text-slate-500">ยอดที่จะใช้ตัดหนี้ (เงินเข้า + หัก ณ ที่จ่าย)</span>
          <span className="font-bold tabular-nums text-slate-800">{THB(settled)}</span>
        </div>

        {/* ---- เลือกใบที่จะตัด ---- */}
        <section>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="font-semibold text-slate-800 text-sm">ตัดยอดใบไหนบ้าง</h3>
            {docs.length > 0 && (
              <button onClick={autoAllocate} disabled={settled <= 0}
                      className="h-8 px-3 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50">
                ⚡ กระจายอัตโนมัติ (ใบเก่าก่อน)
              </button>
            )}
          </div>

          {!customer && <p className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg py-6 text-center">เลือกลูกค้าก่อน แล้วใบที่ค้างรับจะขึ้นมาให้เลือก</p>}
          {customer && loadingDocs && <p className="text-sm text-slate-400 py-4 text-center">กำลังโหลดใบค้างรับ…</p>}
          {customer && !loadingDocs && docs.length === 0 && (
            <p className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg py-6 text-center">
              ลูกค้ารายนี้ไม่มีใบค้างรับ — เก็บเงินครบหมดแล้ว 🎉
            </p>
          )}

          {docs.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-slate-50">
                  <tr className="text-[11px] text-slate-500">
                    <th className="text-left font-medium px-3 py-2">เอกสาร</th>
                    <th className="text-left font-medium px-3 py-2">วันที่</th>
                    <th className="text-right font-medium px-3 py-2">ยอดเต็ม</th>
                    <th className="text-right font-medium px-3 py-2">ค้างอยู่</th>
                    <th className="text-right font-medium px-3 py-2 w-40">ตัดครั้งนี้</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {docs.map((d) => (
                    <tr key={d.id} className={Number(d.pay || 0) > 0 ? "bg-emerald-50/40" : ""}>
                      <td className="px-3 py-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 mr-1.5">
                          {d.kind === "bn" ? "ใบวางบิล" : "ใบขาย"}
                        </span>
                        <span className="font-medium text-slate-700">{d.number}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{formatDate(d.date)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{THB(d.grand_total)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-amber-600">{THB(d.outstanding)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <MoneyInput value={d.pay} onChange={(v) => setPay(d.id, v)}
                                      className="w-full h-8 px-2 text-sm text-right border border-slate-200 rounded" />
                          <button onClick={() => setPay(d.id, String(d.outstanding))}
                                  className="h-8 px-2 text-[11px] text-slate-500 border border-slate-200 rounded hover:bg-slate-50 whitespace-nowrap"
                                  title="ใส่ยอดที่ค้างทั้งหมด">
                            เต็ม
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-medium">
                    <td colSpan={4} className="px-3 py-2 text-right text-slate-500">รวมที่ตัดครั้งนี้</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">{THB(allocated)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">เลขอ้างอิง / เลขที่เช็ค</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)}
                   className="w-full h-9 px-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">หมายเหตุ</label>
            <input value={note} onChange={(e) => setNote(e.target.value)}
                   className="w-full h-9 px-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400" />
          </div>
        </div>
      </div>
    </ERPModal>
  );
}
