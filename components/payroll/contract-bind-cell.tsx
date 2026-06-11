"use client";

/**
 * Payroll module — เซลล์ "ผูกสัญญา" สำหรับหน้าเงินประจำ
 * เลือกสัญญาของพนักงานคนนั้น → เขียน contract_id ผ่าน /api/payroll/recurring-bind
 * (หน้าเงินประจำเป็น read-only แต่ field "สัญญา" นี้แก้ได้เฉพาะ — เป็น metadata ไม่กระทบยอดเงิน)
 */
import { useCallback, useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";

type Opt = { id: string; contract_no: string; status: string; wage_type: string };
type MenuPosition = { top: number; left: number };

export function ContractBindCell(props: {
  recurringId: string;
  employeeId: string;
  contractId: string | null;
  contractNo: string | null;
}) {
  const { user } = useAuth();
  const [no, setNo]   = useState<string | null>(props.contractNo);
  const [cid, setCid] = useState<string | null>(props.contractId);
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Opt[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const updateMenuPosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 224;
    setMenuPosition({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    document.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      document.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    updateMenuPosition();
    setOpen(true); setErr(null);
    if (!opts) {
      try {
        const j = await apiFetch(`/api/payroll/recurring-bind?employee_id=${encodeURIComponent(props.employeeId)}`).then((r) => r.json());
        if (j.error) setErr(j.error); else setOpts((j.data ?? []) as Opt[]);
      } catch { setErr("โหลดสัญญาไม่ได้"); }
    }
  }

  async function pick(e: React.MouseEvent, contractId: string | null) {
    e.stopPropagation();
    setSaving(true); setErr(null);
    try {
      const j = await apiFetch(`/api/payroll/recurring-bind`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recurring_id: props.recurringId, contract_id: contractId, actor: user?.name }),
      }).then((r) => r.json());
      if (j.error) { setErr(j.error); }
      else { setNo(j.data.contract_no); setCid(j.data.contract_id); setOpen(false); }
    } catch { setErr("ผูกสัญญาไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button ref={buttonRef} type="button" onClick={toggle} disabled={saving}
        className={`text-xs px-2 py-0.5 rounded border ${cid ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}>
        {saving ? "..." : cid ? `📄 ${no ?? "ผูกแล้ว"}` : "🔗 ผูกสัญญา"}
      </button>
      {open && (
        <div
          className="fixed z-[80] w-56 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl py-1 text-sm"
          style={{ top: menuPosition?.top ?? 0, left: menuPosition?.left ?? 0 }}
        >
          {err && <div className="px-3 py-2 text-xs text-red-600">{err}</div>}
          {!opts && !err && <div className="px-3 py-2 text-xs text-slate-400">กำลังโหลด...</div>}
          {opts && opts.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">พนักงานนี้ไม่มีสัญญา</div>}
          {cid && (
            <button onClick={(e) => pick(e, null)} className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">✕ ยกเลิกผูก</button>
          )}
          {opts?.map((o) => (
            <button key={o.id} onClick={(e) => pick(e, o.id)}
              className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${o.id === cid ? "bg-emerald-50" : ""}`}>
              <span className="font-mono text-xs">{o.contract_no}</span>
              <span className="ml-1 text-[10px] text-slate-400">{o.status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
