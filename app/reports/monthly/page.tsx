"use client";

// ============================================================
// รายงานสรุปรายเดือน (ของกลาง) — ผลิตต่อโต๊ะ / ขาย / ใบวางบิล / QC
// เลือกเดือน · ดึง /api/reports/monthly (RPC erp_monthly_report) · พิมพ์/บันทึก PDF ได้
// เฉพาะแอดมิน (มีข้อมูลเงิน)
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import type { MonthlyReport } from "@/app/api/reports/monthly/route";

const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const baht = (n: number) => "฿" + Math.round(n || 0).toLocaleString("th-TH");
const num = (n: number) => (n || 0).toLocaleString("th-TH");

export default function MonthlyReportPage() {
  const today = new Date();
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: today.getFullYear(), m: today.getMonth() });
  const [data, setData] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const monthParam = useMemo(() => `${ym.y}-${pad2(ym.m + 1)}-01`, [ym]);

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    apiFetch(`/api/reports/monthly?month=${monthParam}`)
      .then((r) => r.json())
      .then((j) => { if (j.error) setErr(j.error); else setData(j.data); })
      .catch(() => setErr("โหลดรายงานไม่ได้ กรุณาลองใหม่"))
      .finally(() => setLoading(false));
  }, [monthParam]);
  useEffect(() => { load(); }, [load]);

  const move = (d: number) => setYm(({ y, m }) => { const x = new Date(y, m + d, 1); return { y: x.getFullYear(), m: x.getMonth() }; });

  const p = data?.production, s = data?.sales, bl = data?.billing, qc = data?.qc;

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5 print:hidden">
        <div className="max-w-4xl mx-auto w-full flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">📄 รายงานสรุปรายเดือน</h1>
            <p className="text-sm text-slate-500 mt-1">ผลิตต่อโต๊ะ · ขาย · ใบวางบิล · QC</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <button onClick={() => move(-1)} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500">‹</button>
              <span className="px-3 text-sm font-semibold text-slate-800 min-w-[120px] text-center">{MONTHS[ym.m]} {ym.y + 543}</span>
              <button onClick={() => move(1)} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500">›</button>
            </div>
            <button onClick={() => window.print()} className="px-3 h-9 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">🖨️ พิมพ์ / PDF</button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 max-w-4xl mx-auto w-full space-y-5">
        <div className="hidden print:block text-lg font-bold text-slate-900">รายงานสรุปรายเดือน · {MONTHS[ym.m]} {ym.y + 543}</div>

        {err ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <div className="text-3xl mb-2 opacity-60">🔒</div>
            <p className="text-sm text-red-700">{err}</p>
            <button onClick={load} className="mt-3 text-xs text-red-600 underline">ลองใหม่</button>
          </div>
        ) : loading && !data ? (
          <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 bg-white rounded-xl border border-slate-200 animate-pulse" />)}</div>
        ) : (
          <>
            {/* ---- ผลิต: ต่อโต๊ะ ---- */}
            <Section title="🏭 ผลิต — ค่าแรงต่อโต๊ะ/ช่าง" summary={`${num(p?.total_jobs ?? 0)} งาน · ${num(p?.total_qty ?? 0)} ชิ้น · รวมค่าแรง ${baht(p?.total_wage ?? 0)}`}>
              {(p?.workers?.length ?? 0) === 0 ? <Empty /> : (
                <Table head={["โต๊ะ / ช่าง", "งาน", "ชิ้น", "ค่าแรง"]} align={["l", "r", "r", "r"]}
                  rows={(p!.workers).map((w) => [w.worker, num(w.jobs), num(w.qty), baht(w.wage)])}
                  foot={["รวม", num(p!.total_jobs), num(p!.total_qty), baht(p!.total_wage)]} />
              )}
            </Section>

            {/* ---- ขาย ---- */}
            <Section title="💰 ขาย" summary={`${num(s?.orders ?? 0)} ออเดอร์ · ยอดขายรวม ${baht(s?.total ?? 0)}`}>
              {(s?.by_customer?.length ?? 0) === 0 ? <Empty /> : (
                <Table head={["ลูกค้า", "ออเดอร์", "ยอดขาย"]} align={["l", "r", "r"]}
                  rows={(s!.by_customer).map((c) => [c.customer, num(c.orders), baht(c.total)])}
                  foot={["รวม", num(s!.orders), baht(s!.total)]} />
              )}
            </Section>

            {/* ---- ใบวางบิล ---- */}
            <Section title="🧾 ใบวางบิล" summary={`${num(bl?.notes ?? 0)} ใบ · ยอดรวม ${baht(bl?.total ?? 0)}`}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="จำนวนใบ" value={num(bl?.notes ?? 0)} />
                <Stat label="ยอดวางบิลรวม" value={baht(bl?.total ?? 0)} />
                <Stat label="เก็บเงินแล้ว" value={baht(bl?.paid ?? 0)} tone="emerald" />
                <Stat label="ยังค้างเก็บ" value={baht(bl?.unpaid ?? 0)} tone="amber" />
              </div>
            </Section>

            {/* ---- QC ---- */}
            <Section title="✅ QC — ของเสีย" summary={`ของเสีย ${num(qc?.defects ?? 0)} รายการ · ${num(qc?.defect_qty ?? 0)} ชิ้น`}>
              {(qc?.by_type?.length ?? 0) === 0 ? <Empty text="ไม่มีของเสียในเดือนนี้ 🎉" /> : (
                <Table head={["ประเภทตำหนิ", "ครั้ง", "ชิ้น"]} align={["l", "r", "r"]}
                  rows={(qc!.by_type).map((t) => [t.type, num(t.count), num(t.qty)])}
                  foot={["รวม", num(qc!.defects), num(qc!.defect_qty)]} />
              )}
            </Section>
          </>
        )}
      </div>
    </PlaygroundShell>
  );
}

function Section({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 break-inside-avoid">
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        <span className="text-xs text-slate-500">{summary}</span>
      </div>
      {children}
    </div>
  );
}

function Table({ head, rows, foot, align }: { head: string[]; rows: (string | number)[][]; foot?: (string | number)[]; align: ("l" | "r")[] }) {
  const cls = (i: number) => (align[i] === "r" ? "text-right tabular-nums" : "text-left");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            {head.map((h, i) => <th key={i} className={`py-2 px-2 font-medium ${cls(i)}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-slate-50">
              {r.map((c, ci) => <td key={ci} className={`py-1.5 px-2 text-slate-700 ${cls(ci)} ${ci === 0 ? "max-w-[280px] truncate" : ""}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-semibold text-slate-800">
              {foot.map((c, i) => <td key={i} className={`py-2 px-2 ${cls(i)}`}>{c}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" }) {
  const color = tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-slate-800";
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function Empty({ text = "ยังไม่มีข้อมูลในเดือนนี้" }: { text?: string }) {
  return <div className="text-center text-sm text-slate-400 py-6">{text}</div>;
}
