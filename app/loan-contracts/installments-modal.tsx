"use client";

/**
 * ป๊อปอัป "ดูงวดทั้งหมด" ของสัญญาเงินกู้
 * --------------------------------------------------------------------------
 * เดิมปุ่มนี้เปิดแท็บใหม่ไปหน้า /loan-installments — เจ้าของขอให้เป็นป๊อปอัป
 * (ดูแล้วปิด กลับมาที่สัญญาเดิมได้ทันที ไม่หลุดออกจากหน้า)
 *
 * ในป๊อปยังแก้ยอดรายงวดได้ด้วย — เพราะตารางผ่อนจริงของธนาคาร
 * "บางงวดเงินต้นกับดอกเบี้ยไม่เท่ากัน" สูตรอัตโนมัติคิดไม่ตรง
 * กด "✏️ แก้ยอดรายงวด" → พิมพ์ยอดจริง → บันทึก
 * ระบบจะคิดเงินต้นคงเหลือต่อเนื่องใหม่ทั้งตาราง + ตัดยอดการจ่ายใหม่ให้เอง
 *
 * ใช้ของกลาง: ERPModal (ป๊อป) · MiniTable (ตารางเล็ก: ค้นหา/เรียง/จัดกลุ่มมาในตัว)
 *             MoneyInput (ช่องเงินมีลูกน้ำ) · DateInput (วันที่)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { MoneyInput } from "@/components/money-input";
import { DateInput } from "@/components/date-input";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { formatDate } from "@/lib/date";

type Inst = {
  id: string;
  installment_no: number;
  due_date: string | null;
  principal_due: number;
  interest_due: number;
  fee_due: number;
  penalty_due: number;
  total_due: number;
  total_paid: number;
  closing_principal: number;
  payment_status: string;
};

/** ค่าที่ผู้ใช้กำลังพิมพ์ (เก็บเป็น string ก่อน ค่อยแปลงตอนบันทึก) */
type Draft = Partial<Record<"due_date" | "principal_due" | "interest_due", string>>;

const PAY_STATUS: Record<string, [string, string]> = {
  unpaid:  ["ยังไม่จ่าย", "bg-slate-100 text-slate-500 border-slate-200"],
  partial: ["จ่ายบางส่วน", "bg-amber-50 text-amber-700 border-amber-200"],
  paid:    ["จ่ายครบ", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  overdue: ["เกินกำหนด", "bg-red-50 text-red-700 border-red-200"],
};

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const money = (v: number) => v ? <span className="tabular-nums">{formatAmount(v)}</span> : <span className="text-slate-300">—</span>;
const inputCls = "w-full h-8 px-2 text-sm text-right tabular-nums border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500";

export function InstallmentsModal({
  open, onClose, contractId, contractLabel, canEdit = true, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  contractId: string;
  contractLabel?: string;
  /** ให้แก้ยอดรายงวดได้ไหม (สิทธิ์ loan_schedules.edit ตรวจซ้ำที่ API เสมอ) */
  canEdit?: boolean;
  /** บันทึกยอดแล้ว → ให้หน้าสัญญาโหลดตัวเลขความคืบหน้าใหม่ */
  onSaved?: () => Promise<void> | void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<Inst[]>([]);
  const [versionId, setVersionId] = useState<string>("");
  const [versionNo, setVersionNo] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      // 1) ตารางผ่อนเวอร์ชันที่ใช้อยู่ (active) ของสัญญานี้
      const vFilter = encodeURIComponent(JSON.stringify({
        loan_contract_id: { type: "text", value: contractId },
        status: { type: "select", selected: ["active"] },
      }));
      const vr = await apiFetch(`/api/master-v2/loan-schedule-versions?filters=${vFilter}&sort_by=version_no&sort_dir=desc&limit=5`);
      const vj = await vr.json();
      const ver = ((vj?.data ?? []) as Record<string, unknown>[])[0];
      if (!ver) { setRows([]); setVersionId(""); setVersionNo(null); setLoading(false); return; }
      setVersionId(String(ver.id));
      setVersionNo(Number(ver.version_no) || null);

      // 2) งวดของเวอร์ชันนั้น (ไม่เอาของเวอร์ชันเก่าที่ถูกแทนที่ไปแล้ว)
      const iFilter = encodeURIComponent(JSON.stringify({
        schedule_version_id: { type: "text", value: String(ver.id) },
      }));
      const ir = await apiFetch(`/api/master-v2/loan-installments?filters=${iFilter}&sort_by=installment_no&sort_dir=asc&limit=2000`);
      const ij = await ir.json();
      setRows(((ij?.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        installment_no: num(r.installment_no),
        due_date: (r.due_date as string) ?? null,
        principal_due: num(r.principal_due),
        interest_due: num(r.interest_due),
        fee_due: num(r.fee_due),
        penalty_due: num(r.penalty_due),
        total_due: num(r.total_due),
        total_paid: num(r.total_paid),
        closing_principal: num(r.closing_principal),
        payment_status: String(r.payment_status ?? "unpaid"),
      })).sort((a, b) => a.installment_no - b.installment_no));
    } catch {
      setErr("โหลดงวดผ่อนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => { if (open) { setEditing(false); setDraft({}); load(); } }, [open, load]);

  const dirty = Object.keys(draft).length > 0;

  const setCell = (id: string, key: keyof Draft, val: string) =>
    setDraft((p) => ({ ...p, [id]: { ...p[id], [key]: val } }));

  /** ค่าที่จะแสดงในช่องแก้ไข = ค่าที่พิมพ์ค้างไว้ ถ้ายังไม่แตะก็ใช้ค่าจริง */
  const cellVal = (r: Inst, key: keyof Draft): string => {
    const d = draft[r.id]?.[key];
    if (d !== undefined) return d;
    if (key === "due_date") return r.due_date ?? "";
    return String(r[key as "principal_due" | "interest_due"] ?? "");
  };

  const save = async () => {
    if (!versionId || !dirty) return;
    setSaving(true); setErr("");
    try {
      const payload = Object.entries(draft).map(([id, d]) => {
        const row: Record<string, unknown> = { id };
        if (d.due_date !== undefined) row.due_date = d.due_date;
        if (d.principal_due !== undefined) row.principal_due = Number(d.principal_due || 0);
        if (d.interest_due !== undefined) row.interest_due = Number(d.interest_due || 0);
        return row;
      });
      const res = await apiFetch("/api/loan-schedule/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: versionId, rows: payload }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) { setErr(j?.error || "บันทึกไม่สำเร็จ"); setSaving(false); return; }
      setDraft({});
      setEditing(false);
      await load();
      await onSaved?.();
    } catch {
      setErr("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setSaving(false);
    }
  };

  const sum = useMemo(() => rows.reduce((a, r) => ({
    principal: a.principal + r.principal_due,
    interest:  a.interest + r.interest_due,
    due:       a.due + r.total_due,
    paid:      a.paid + r.total_paid,
  }), { principal: 0, interest: 0, due: 0, paid: 0 }), [rows]);

  const columns: MiniColumn<Inst>[] = useMemo(() => [
    {
      key: "no", header: "งวดที่", width: "4.5rem", align: "center",
      sortValue: (r) => r.installment_no, sortLabel: "งวดที่",
      cell: (r) => <span className="text-sm font-medium text-slate-600 tabular-nums">{r.installment_no}</span>,
    },
    {
      key: "due_date", header: "ครบกำหนด", width: "9rem",
      sortValue: (r) => r.due_date ?? "", sortLabel: "วันครบกำหนด",
      cell: (r) => editing
        ? <DateInput value={cellVal(r, "due_date")} onChange={(iso) => setCell(r.id, "due_date", iso)} />
        : <span className="text-sm tabular-nums text-slate-700">{r.due_date ? formatDate(r.due_date) : "—"}</span>,
    },
    {
      key: "principal_due", header: "เงินต้น", width: "9rem", align: "right",
      sortValue: (r) => r.principal_due, sortLabel: "เงินต้น",
      cell: (r) => editing
        ? <MoneyInput value={cellVal(r, "principal_due")} onChange={(raw) => setCell(r.id, "principal_due", raw)} className={inputCls} />
        : money(r.principal_due),
    },
    {
      key: "interest_due", header: "ดอกเบี้ย", width: "9rem", align: "right",
      sortValue: (r) => r.interest_due, sortLabel: "ดอกเบี้ย",
      cell: (r) => editing
        ? <MoneyInput value={cellVal(r, "interest_due")} onChange={(raw) => setCell(r.id, "interest_due", raw)} className={inputCls} />
        : money(r.interest_due),
    },
    {
      key: "total_due", header: "รวมต้องจ่าย", width: "9rem", align: "right",
      sortValue: (r) => r.total_due, sortLabel: "รวมต้องจ่าย",
      cell: (r) => {
        if (!editing) return <span className="text-sm font-medium text-slate-800">{money(r.total_due)}</span>;
        const p = Number(cellVal(r, "principal_due") || 0) + Number(cellVal(r, "interest_due") || 0) + r.fee_due + r.penalty_due;
        return <span className="text-sm font-medium text-blue-600">{money(Math.round(p * 100) / 100)}</span>;
      },
    },
    {
      key: "total_paid", header: "จ่ายแล้ว", width: "9rem", align: "right",
      sortValue: (r) => r.total_paid, sortLabel: "จ่ายแล้ว",
      cell: (r) => money(r.total_paid),
    },
    {
      key: "closing", header: "เงินต้นคงเหลือ", width: "9.5rem", align: "right",
      sortValue: (r) => r.closing_principal, sortLabel: "เงินต้นคงเหลือ",
      cell: (r) => <span className="text-sm text-slate-500">{money(r.closing_principal)}</span>,
    },
    {
      key: "payment_status", header: "สถานะ", width: "7.5rem", align: "center",
      sortValue: (r) => r.payment_status, sortLabel: "สถานะ",
      cell: (r) => {
        const m = PAY_STATUS[r.payment_status];
        return m
          ? <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${m[1]}`}>{m[0]}</span>
          : <span className="text-xs text-slate-300">{r.payment_status || "—"}</span>;
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [editing, draft, rows]);

  return (
    <>
      {/* hasUnsavedChanges: ERPModal กลางจะถามเอง ถ้ายังแก้ยอดค้างแล้วกดปิด/Escape */}
      <ERPModal
        open={open}
        onClose={onClose}
        hasUnsavedChanges={dirty}
        title={`งวดผ่อนทั้งหมด${contractLabel ? ` — ${contractLabel}` : ""}`}
        description={
          versionNo
            ? `ตารางผ่อนที่ใช้อยู่ (เวอร์ชัน ${versionNo}) · ${rows.length} งวด${editing ? " · กำลังแก้ยอด — กด “บันทึกยอดที่แก้” เมื่อเสร็จ" : ""}`
            : "ยังไม่มีตารางผ่อนที่ใช้อยู่ — กดปุ่ม 🧾 สร้างตารางผ่อน ในหน้าสัญญาก่อน"
        }
        size="xl"
        resizable
        storageKey="loan-installments-modal"
        footer={
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[11px] text-slate-500 tabular-nums">
              รวมเงินต้น <b className="text-slate-700">{formatAmount(sum.principal)}</b>
              <span className="mx-1.5 text-slate-300">·</span>
              รวมดอกเบี้ย <b className="text-slate-700">{formatAmount(sum.interest)}</b>
              <span className="mx-1.5 text-slate-300">·</span>
              รวมต้องจ่าย <b className="text-slate-700">{formatAmount(sum.due)}</b>
              <span className="mx-1.5 text-slate-300">·</span>
              จ่ายแล้ว <b className="text-emerald-600">{formatAmount(sum.paid)}</b>
            </div>
            <div className="flex items-center gap-2">
              {editing && (
                <button onClick={() => { setDraft({}); setEditing(false); }} disabled={saving}
                  className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                  ยกเลิกการแก้
                </button>
              )}
              {editing ? (
                <button onClick={save} disabled={saving || !dirty}
                  className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "กำลังบันทึก..." : `บันทึกยอดที่แก้${dirty ? ` (${Object.keys(draft).length} งวด)` : ""}`}
                </button>
              ) : (
                <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {err}</div>}

          {editing && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              พิมพ์ยอดจริงตามใบของธนาคารได้เลย — แต่ละงวดเงินต้นกับดอกเบี้ยไม่เท่ากันก็ได้ ·
              เมื่อบันทึก ระบบจะคิด “เงินต้นคงเหลือ” ต่อเนื่องใหม่ทั้งตาราง และตัดยอดการจ่ายที่บันทึกไว้แล้วใหม่ให้อัตโนมัติ
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">กำลังโหลดงวดผ่อน...</div>
          ) : (
            <MiniTable
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              searchText={(r) => `${r.installment_no} ${r.due_date ?? ""} ${PAY_STATUS[r.payment_status]?.[0] ?? r.payment_status}`}
              searchPlaceholder="ค้นหางวด / วันที่…"
              countUnit="งวด"
              dense
              resizable
              storageKey="loan-installments-mini"
              maxHeightClass="max-h-[55vh]"
              emptyText="ยังไม่มีงวดผ่อน — สร้างตารางผ่อนก่อน"
              actions={
                <div className="flex items-center gap-2">
                  {canEdit && rows.length > 0 && !editing && (
                    <button onClick={() => setEditing(true)}
                      className="h-8 px-3 text-xs font-medium rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100">
                      ✏️ แก้ยอดรายงวด
                    </button>
                  )}
                  <a href={`/loan-installments?flt=${encodeURIComponent(JSON.stringify({ loan_contract_id: contractId }))}`}
                    target="_blank" rel="noopener noreferrer"
                    className="h-8 px-3 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 inline-flex items-center">
                    เปิดหน้าเต็ม ↗
                  </a>
                </div>
              }
              footnote="เงินต้นคงเหลือของแต่ละงวด = ยอดหลังหักเงินต้นงวดนั้น · ยอด “จ่ายแล้ว” มาจากใบบันทึกการจ่าย ระบบตัดให้เอง"
            />
          )}
        </div>
      </ERPModal>
    </>
  );
}
