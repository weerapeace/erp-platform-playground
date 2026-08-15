"use client";
// ปุ่มสร้างตารางผ่อนอัตโนมัติ — ใช้เป็น customCreate ของหน้า /loan-schedules
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPFormField, ERPInput, ERPSelect } from "@/components/form";
import { apiFetch } from "@/lib/api";

type ContractOpt = { id: string; loan_code: string; loan_name: string };

const METHOD_OPTS = [
  { value: "equal_installment", label: "ผ่อนเท่ากันทุกงวด (Equal Installment)" },
  { value: "equal_principal", label: "ตัดเงินต้นเท่ากันทุกงวด (Equal Principal)" },
  { value: "interest_only", label: "จ่ายดอกอย่างเดียว ปิดต้นงวดสุดท้าย (Interest Only)" },
  // ตารางจริงของธนาคารหลายใบ เงินต้น/ดอกเบี้ยแต่ละงวดไม่เท่ากัน → สร้างตัวตั้งต้นแล้วพิมพ์ยอดจริงเอง
  { value: "custom", label: "กำหนดเอง (Custom) — พิมพ์ยอดจริงรายงวดเอง" },
];

const METHOD_HINT: Record<string, string> = {
  equal_installment: "จ่ายเท่ากันทุกเดือน ช่วงแรกเป็นดอกเบี้ยมากกว่า",
  equal_principal:   "ตัดเงินต้นเท่ากันทุกงวด ยอดจ่ายลดลงเรื่อย ๆ",
  interest_only:     "ระหว่างทางจ่ายแต่ดอกเบี้ย แล้วปิดเงินต้นทั้งก้อนงวดสุดท้าย",
  custom:            "ระบบสร้างตัวตั้งต้นให้ก่อน แล้วเข้าไปแก้ยอดแต่ละงวดให้ตรงกับใบของธนาคารได้ (เงินต้น/ดอกเบี้ยไม่เท่ากันก็ได้) — แก้ที่ปุ่ม “📄 ดูงวดทั้งหมด” ในหน้าสัญญา",
};

export function GenerateScheduleModal({
  open, onClose, onCreated, contractId,
}: {
  open: boolean; onClose: () => void; onCreated: () => void;
  /** ล็อกสัญญาไว้ล่วงหน้า (เปิดจากในหน้าสัญญา) — ไม่ต้องให้ผู้ใช้เลือกซ้ำ */
  contractId?: string | null;
}) {
  const [contracts, setContracts] = useState<ContractOpt[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ contract_id: "", method: "equal_installment", start_date: "", num: "", reason: "" });

  useEffect(() => {
    if (!open) return;
    setErr("");
    setLoadingList(true);
    apiFetch("/api/master-v2/loan-contracts?limit=500")
      .then((r) => r.json())
      .then((j) => {
        const rows = (j?.data ?? []) as Record<string, unknown>[];
        setContracts(rows.map((r) => ({ id: String(r.id), loan_code: String(r.loan_code ?? ""), loan_name: String(r.loan_name ?? "") })));
      })
      .catch(() => setErr("โหลดรายชื่อสัญญาไม่สำเร็จ"))
      .finally(() => setLoadingList(false));
  }, [open]);

  // เปิดจากหน้าสัญญา → ตั้งสัญญาให้เลย
  useEffect(() => {
    if (open && contractId) setF((p) => ({ ...p, contract_id: contractId }));
  }, [open, contractId]);

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const picked = contracts.find((c) => c.id === f.contract_id);

  const isCustom = f.method === "custom";

  const submit = async () => {
    setErr("");
    if (!f.contract_id) { setErr("กรุณาเลือกสัญญาเงินกู้"); return; }
    // วิธี "กำหนดเอง" เว้นจำนวนงวดว่างได้ = สร้างตารางเปล่า ไว้เติมงวดทีหลัง
    const n = f.num.trim() === "" ? 0 : Math.floor(Number(f.num));
    if (!isFinite(n) || n < 0) { setErr("จำนวนงวดต้องเป็นตัวเลข"); return; }
    if (n < 1 && !isCustom) { setErr("กรุณาระบุจำนวนงวด"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/loan-schedule/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract_id: f.contract_id, method: f.method, start_date: f.start_date || null, num: n, reason: f.reason }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) { setErr(j?.error || "สร้างตารางไม่สำเร็จ"); setSaving(false); return; }
      setSaving(false);
      setF({ contract_id: contractId ?? "", method: "equal_installment", start_date: "", num: "", reason: "" });
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
      title="สร้างตารางผ่อนอัตโนมัติ"
      description="เลือกสัญญา + วิธีคิด แล้วระบบจะสร้างตารางงวดให้ · เวอร์ชันเดิมจะกลายเป็น 'เก่า (superseded)' ไม่ถูกลบ"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "กำลังสร้าง..." : (isCustom && f.num.trim() === "" ? "สร้างตารางเปล่า" : "สร้างตารางผ่อน")}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {err}</div>}

        {contractId ? (
          <ERPFormField label="สัญญาเงินกู้" hint="เงินต้น + อัตราดอกเบี้ย + วันที่ต้องชำระ ดึงจากสัญญานี้">
            <div className="h-9 flex items-center px-3 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg">
              {picked ? `${picked.loan_code} — ${picked.loan_name}` : "กำลังโหลด..."}
            </div>
          </ERPFormField>
        ) : (
          <ERPFormField label="สัญญาเงินกู้" required hint="เงินต้น + อัตราดอกเบี้ยจะดึงจากสัญญาที่เลือก">
            <ERPSelect
              value={f.contract_id}
              onChange={(e) => set("contract_id", e.target.value)}
              options={contracts.map((c) => ({ value: c.id, label: `${c.loan_code} — ${c.loan_name}` }))}
              placeholder={loadingList ? "กำลังโหลด..." : "— เลือกสัญญา —"}
            />
          </ERPFormField>
        )}

        <ERPFormField label="วิธีคิดตารางผ่อน" required hint={METHOD_HINT[f.method]}>
          <ERPSelect value={f.method} onChange={(e) => set("method", e.target.value)} options={METHOD_OPTS} />
        </ERPFormField>

        <div className="grid grid-cols-2 gap-4">
          <ERPFormField
            label="จำนวนงวด"
            required={!isCustom}
            hint={isCustom
              ? "ยังไม่รู้ว่ากี่งวด → เว้นว่างไว้ได้ ระบบจะสร้างตารางเปล่า แล้วค่อยไปเพิ่มงวด/วางจาก Excel ทีหลัง"
              : "จำนวนงวดที่ต้องผ่อนทั้งหมด"}
          >
            <ERPInput type="number" value={f.num} onChange={(e) => set("num", e.target.value)}
              placeholder={isCustom ? "ไม่รู้ก็เว้นว่างได้" : "เช่น 60"} />
          </ERPFormField>
          <ERPFormField label="งวดแรกเริ่ม (วันที่)" hint="เว้นว่าง = วันนี้">
            <ERPInput type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} />
          </ERPFormField>
        </div>

        <ERPFormField label="เหตุผล / หมายเหตุ" hint="เช่น เปิดสัญญา / ปรับดอกเบี้ยใหม่">
          <ERPInput value={f.reason} onChange={(e) => set("reason", e.target.value)} placeholder="ระบุเหตุผลของตารางเวอร์ชันนี้" />
        </ERPFormField>

        <p className="text-xs text-slate-400">
          หมายเหตุ: งวดที่งวดสุดท้ายระบบจะปัดเศษให้เงินต้นคงเหลือเป็น 0 พอดี · ตารางเก่าจะถูกเก็บเป็นประวัติ (ไม่ทับ)
        </p>
      </div>
    </ERPModal>
  );
}
