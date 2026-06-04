"use client";

/**
 * Payroll module — เทียบยอดเครื่องคำนวณ (Phase 3) — อ่านอย่างเดียว
 * รันสูตรใหม่ (lib/payroll-calc) บน payroll_lines จริง เทียบกับที่แอปเก่าคำนวณไว้
 * ใช้ของกลาง: Universal DataTable (master-crud) + แถบสรุป
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? <span className="tabular-nums text-slate-700">฿{n.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span> : <span className="text-slate-300">—</span>;
};

function VerifySummary() {
  const [s, setS] = useState<{ total: number; match: number; mismatch: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    apiFetch("/api/payroll/calc-verify?summary_only=1").then((r) => r.json())
      .then((j) => { if (j.error) setErr(j.error); else setS(j.summary); }).catch(() => setErr("เทียบไม่ได้"));
  }, []);
  return (
    <div className="px-6 pt-5">
      <h1 className="text-xl font-bold text-slate-800">🧮 เทียบยอดเครื่องคำนวณ (เหมือนเดิม)</h1>
      <p className="text-sm text-slate-500 mb-3">รันสูตรใหม่บนข้อมูลจริงทุกบรรทัด เทียบกับที่แอปเก่าคำนวณ — อ่านอย่างเดียว ไม่เขียนทับ</p>
      {err && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm mb-3">{err}</div>}
      {!s && !err && <div className="text-slate-400 text-sm mb-3">กำลังเทียบ...</div>}
      {s && (
        <div className="flex flex-wrap gap-3 mb-2">
          <Card label="ทั้งหมด" value={s.total} cls="bg-slate-50 text-slate-700 border-slate-200" />
          <Card label="✅ ตรงกัน" value={s.match} cls="bg-emerald-50 text-emerald-700 border-emerald-200" />
          <Card label="❌ ต่างกัน" value={s.mismatch} cls={s.mismatch > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-50 text-slate-400 border-slate-200"} />
          {s.total > 0 && (
            <Card label="ความตรง" value={`${((s.match / s.total) * 100).toFixed(1)}%`} cls="bg-blue-50 text-blue-700 border-blue-200" />
          )}
        </div>
      )}
      {s && s.mismatch === 0 && s.total > 0 && (
        <div className="rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm mb-3 inline-block">
          🎉 เครื่องคำนวณใหม่ตรงกับแอปเก่า <b>100%</b> ทุกบรรทัด — สูตรถูกต้อง พร้อมใช้จริง
        </div>
      )}
    </div>
  );
}
function Card({ label, value, cls }: { label: string; value: React.ReactNode; cls: string }) {
  return (
    <div className={`rounded-xl border px-5 py-3 ${cls}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
}

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/", apiPath: "calc-verify", tableId: "payroll-calc-verify",
  title: "เทียบยอดเครื่องคำนวณ", icon: "🧮",
  description: "เทียบสูตรใหม่ vs แอปเก่า (อ่านอย่างเดียว)",
  readOnly: true, hideActiveStatus: true, pageLimit: 5000, uniqueKey: "id",
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  searchKeys: ["employee_name", "period_name"],
  defaultShowAllColumns: true,
  fields: [
    { key: "employee_name", label: "พนักงาน", type: "text", colSize: 190 },
    { key: "period_name",   label: "งวด",     type: "text", colSize: 160 },
    { key: "gross_old", label: "รายได้ (เก่า)", type: "number", colSize: 120, cellRender: money },
    { key: "gross_new", label: "รายได้ (ใหม่)", type: "number", colSize: 120, cellRender: money },
    { key: "net_old",   label: "สุทธิ (เก่า)",  type: "number", colSize: 120, cellRender: money },
    { key: "net_new",   label: "สุทธิ (ใหม่)",  type: "number", colSize: 120, cellRender: money },
    { key: "diff_net",  label: "ส่วนต่างสุทธิ", type: "number", colSize: 110,
      cellRender: (v) => Number(v) === 0
        ? <span className="text-slate-300">0</span>
        : <span className="font-semibold text-red-600 tabular-nums">{Number(v).toLocaleString("th-TH")}</span> },
    { key: "match", label: "ผล", type: "boolean", colSize: 90, filterable: true, filterType: "boolean",
      cellRender: (v) => v === true
        ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">✅ ตรง</span>
        : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">❌ ต่าง</span> },
  ],
};

export default function PayrollCalcVerifyPage() {
  return (
    <div>
      <VerifySummary />
      <MasterCRUDPage config={CONFIG} />
    </div>
  );
}
