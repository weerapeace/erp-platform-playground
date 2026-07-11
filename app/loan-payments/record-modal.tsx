"use client";
// ปุ่มบันทึกการจ่าย — ใช้เป็น customCreate ของหน้า /loan-payments
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPFormField, ERPInput, ERPSelect } from "@/components/form";
import { apiFetch } from "@/lib/api";

type ContractOpt = { id: string; loan_code: string; loan_name: string; outstanding: number };

export function RecordPaymentModal({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [contracts, setContracts] = useState<ContractOpt[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ contract_id: "", payment_date: "", amount: "", paid_from: "", reference: "" });

  useEffect(() => {
    if (!open) return;
    setErr("");
    setLoadingList(true);
    apiFetch("/api/master-v2/loan-contracts?limit=500")
      .then((r) => r.json())
      .then((j) => {
        const rows = (j?.data ?? []) as Record<string, unknown>[];
        setContracts(rows.map((r) => ({
          id: String(r.id), loan_code: String(r.loan_code ?? ""), loan_name: String(r.loan_name ?? ""),
          outstanding: Number(r.outstanding_principal ?? 0),
        })));
      })
      .catch(() => setErr("โหลดรายชื่อสัญญาไม่สำเร็จ"))
      .finally(() => setLoadingList(false));
  }, [open]);

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const selected = contracts.find((c) => c.id === f.contract_id);

  const submit = async () => {
    setErr("");
    if (!f.contract_id) { setErr("กรุณาเลือกสัญญาเงินกู้"); return; }
    const amt = Number(f.amount);
    if (!amt || amt <= 0) { setErr("กรุณาระบุยอดจ่าย"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/loan-payment/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract_id: f.contract_id, payment_date: f.payment_date || null, amount: amt, paid_from: f.paid_from, reference: f.reference }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) { setErr(j?.error || "บันทึกไม่สำเร็จ"); setSaving(false); return; }
      setSaving(false);
      setF({ contract_id: "", payment_date: "", amount: "", paid_from: "", reference: "" });
      onCreated();
    } catch {
      setErr("เกิดข้อผิดพลาดในการเชื่อมต่อ");
      setSaving(false);
    }
  };

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title="บันทึกการจ่ายเงินกู้"
      description="ระบบจะตัดยอดเข้าดอกเบี้ยแล้วเงินต้น ทีละงวด (เก่าสุดก่อน) ให้อัตโนมัติ"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "บันทึก + ตัดยอด"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {err}</div>}

        <ERPFormField label="สัญญาเงินกู้" required>
          <ERPSelect
            value={f.contract_id}
            onChange={(e) => set("contract_id", e.target.value)}
            options={contracts.map((c) => ({ value: c.id, label: `${c.loan_code} — ${c.loan_name}` }))}
            placeholder={loadingList ? "กำลังโหลด..." : "— เลือกสัญญา —"}
          />
        </ERPFormField>

        {selected && (
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            เงินต้นคงเหลือปัจจุบัน: <b className="text-slate-700">฿{selected.outstanding.toLocaleString("th-TH")}</b>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <ERPFormField label="ยอดจ่าย (บาท)" required>
            <ERPInput type="number" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" />
          </ERPFormField>
          <ERPFormField label="วันที่จ่าย" hint="เว้นว่าง = วันนี้">
            <ERPInput type="date" value={f.payment_date} onChange={(e) => set("payment_date", e.target.value)} />
          </ERPFormField>
          <ERPFormField label="จ่ายจากบัญชี">
            <ERPInput value={f.paid_from} onChange={(e) => set("paid_from", e.target.value)} placeholder="เช่น KBANK 123-4-56789-0" />
          </ERPFormField>
          <ERPFormField label="เลขอ้างอิง">
            <ERPInput value={f.reference} onChange={(e) => set("reference", e.target.value)} placeholder="เลขอ้างอิงการโอน" />
          </ERPFormField>
        </div>

        <p className="text-xs text-slate-400">
          หมายเหตุ: บันทึกนี้จะเป็นสถานะ &ldquo;ยืนยันแล้ว&rdquo; และตัดยอดทันที · แก้ยอด/ลบได้ ระบบจะคำนวณใหม่จากต้นทางให้เสมอ
        </p>
      </div>
    </ERPModal>
  );
}
