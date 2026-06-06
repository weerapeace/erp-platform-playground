"use client";

/**
 * Payroll — ผังพนักงาน (Board) Phase 1 — อ่านอย่างเดียว
 * การ์ดพนักงานจัดกลุ่มตามแผนก · สีกรอบตามประเภทสัญญา · badge หัวหน้า/รายการประจำ/ใบเตือน
 * กดการ์ด → drawer · hover → ข้อมูลเร็ว · (ลากวางจะมาเฟส 2)
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Card = {
  id: string; employee_code: string; nickname: string; full_name: string;
  contract_type: string; contract_type_th: string; color: string; base_salary: number;
  is_supervisor: boolean; recurring_count: number; warning_count: number; photo_key: string | null;
};
type Section = { department_id: string; department_name: string; headcount: number; total_salary: number; employees: Card[] };

const baht = (v: number) => `฿${v.toLocaleString("th-TH", { minimumFractionDigits: 0 })}`;
const COLOR_CLS: Record<string, { border: string; chip: string; dot: string }> = {
  purple: { border: "border-l-purple-500", chip: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  orange: { border: "border-l-orange-500", chip: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  green:  { border: "border-l-emerald-500", chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  blue:   { border: "border-l-sky-500", chip: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  slate:  { border: "border-l-slate-300", chip: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
};
const LEGEND = [
  { c: "purple", th: "ประจำ" }, { c: "orange", th: "ประจำ(นอกระบบ)" },
  { c: "green", th: "รายวัน" }, { c: "blue", th: "ช่างเหมา" },
];
const initials = (c: Card) => (c.nickname || c.full_name || c.employee_code).slice(0, 2);

export default function PayrollBoardPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [noDept, setNoDept] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Card | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch("/api/payroll/board").then((r) => r.json());
      if (j.error) setErr(j.error);
      else { setSections(j.sections as Section[]); setNoDept(j.no_department as Card[]); setTotal(j.total_employees ?? 0); }
    } catch { setErr("โหลดไม่ได้"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const match = (c: Card) => !q.trim() || `${c.employee_code} ${c.nickname} ${c.full_name}`.toLowerCase().includes(q.trim().toLowerCase());

  return (
    <div className="p-6 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">🗂️ ผังพนักงาน (บอร์ด)</h1>
          <p className="text-sm text-slate-500">การ์ดพนักงานจัดตามแผนก · สีกรอบ = ประเภทสัญญา · <span className="text-slate-400">ลากวางจะมาในเฟสถัดไป</span></p>
        </div>
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา รหัส/ชื่อ"
            className="h-9 px-3 border border-slate-300 rounded-lg text-sm w-44" />
          <Link href="/payroll/employees" className="h-9 px-3 inline-flex items-center text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">📋 ตาราง</Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
        {LEGEND.map((l) => (
          <span key={l.c} className="inline-flex items-center gap-1.5 text-slate-600">
            <span className={`w-3 h-3 rounded ${COLOR_CLS[l.c].dot}`} /> {l.th}
          </span>
        ))}
        <span className="text-slate-300">·</span>
        <span className="text-slate-500">⭐ หัวหน้า · 🔁 รายการประจำ · ⚠️ ใบเตือน</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-500">พนักงาน {total} คน</span>
      </div>

      {err && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm mb-4">{err}</div>}
      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">กำลังโหลด...</div>
      ) : (
        <div className="space-y-4">
          {sections.map((s) => (
            <SectionBox key={s.department_id} title={s.department_name} headcount={s.headcount} total={s.total_salary}>
              {s.employees.filter(match).map((c) => <EmployeeCard key={c.id} c={c} onClick={() => setSel(c)} />)}
            </SectionBox>
          ))}
          {noDept.length > 0 && (
            <SectionBox title="ยังไม่ระบุแผนก" headcount={noDept.length} total={noDept.reduce((t, c) => t + c.base_salary, 0)} muted>
              {noDept.filter(match).map((c) => <EmployeeCard key={c.id} c={c} onClick={() => setSel(c)} />)}
            </SectionBox>
          )}
        </div>
      )}

      {sel && <CardDrawer c={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function SectionBox({ title, headcount, total, muted, children }: { title: string; headcount: number; total: number; muted?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border ${muted ? "border-dashed border-slate-300 bg-slate-50/50" : "border-slate-200 bg-white"} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-semibold text-slate-800">{title} <span className="text-sm font-normal text-slate-400">· {headcount} คน</span></h2>
        <span className="text-sm text-slate-500">ฐานเงินเดือนรวม <b className="text-slate-700 tabular-nums">{baht(total)}</b></span>
      </div>
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </div>
  );
}

function EmployeeCard({ c, onClick }: { c: Card; onClick: () => void }) {
  const col = COLOR_CLS[c.color] ?? COLOR_CLS.slate;
  return (
    <button onClick={onClick}
      className={`group relative w-[150px] text-left rounded-xl border border-slate-200 border-l-4 ${col.border} bg-white p-2.5 hover:shadow-md hover:-translate-y-0.5 transition`}>
      <div className="flex items-center gap-2">
        <span className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${col.chip} shrink-0`}>{initials(c)}</span>
        <div className="min-w-0">
          <div className="font-semibold text-sm text-slate-800 truncate">{c.nickname}</div>
          <div className="text-[11px] text-slate-400 truncate">{c.full_name || c.employee_code}</div>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
        {c.is_supervisor && <span title="หัวหน้า">⭐</span>}
        {c.recurring_count > 0 && <span className="inline-flex items-center text-[10px] text-emerald-600" title="รายการประจำ">🔁{c.recurring_count}</span>}
        {c.warning_count > 0 && <span className="inline-flex items-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1.5" title="ใบเตือน">⚠️{c.warning_count}</span>}
      </div>
      {/* hover quick info */}
      <div className="pointer-events-none absolute left-0 right-0 -bottom-1 translate-y-full z-10 opacity-0 group-hover:opacity-100 transition bg-slate-800 text-white text-[11px] rounded-lg px-2.5 py-1.5 mx-1 shadow-lg">
        <div>{c.employee_code} · {c.contract_type_th}</div>
        <div>ฐานเงินเดือน {baht(c.base_salary)}</div>
      </div>
    </button>
  );
}

function CardDrawer({ c, onClose }: { c: Card; onClose: () => void }) {
  const col = COLOR_CLS[c.color] ?? COLOR_CLS.slate;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-sm bg-white h-full shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold ${col.chip}`}>{initials(c)}</span>
            <div>
              <div className="font-semibold text-slate-800">{c.nickname}</div>
              <div className="text-xs text-slate-400">{c.full_name} · {c.employee_code}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <Info label="ประเภทสัญญา" value={<span className={`px-2 py-0.5 rounded-full text-xs ${col.chip}`}>{c.contract_type_th}</span>} />
          <Info label="ฐานเงินเดือน" value={<b className="tabular-nums">{baht(c.base_salary)}</b>} />
          <Info label="หัวหน้า" value={c.is_supervisor ? "⭐ ใช่" : "—"} />
          <Info label="รายการประจำ" value={`${c.recurring_count} รายการ`} />
          <Info label="ใบเตือน (active)" value={c.warning_count > 0 ? <span className="text-red-600 font-medium">⚠️ {c.warning_count} ใบ</span> : "—"} />
          <div className="pt-3 flex gap-2">
            <Link href="/payroll/employees" className="flex-1 h-10 inline-flex items-center justify-center text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800">📋 แก้ในตาราง</Link>
            <Link href="/payroll/warnings" className="flex-1 h-10 inline-flex items-center justify-center text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">⚠️ ใบเตือน</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2"><span className="text-slate-400">{label}</span><span className="text-slate-700">{value}</span></div>;
}
