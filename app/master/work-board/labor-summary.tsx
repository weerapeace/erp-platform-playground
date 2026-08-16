"use client";

/**
 * LaborSummary — สรุปค่าแรงรายเดือน แยกตามช่าง (มุมมองในบอร์ดจ่ายงาน)
 *
 * รวมจาก 2 ทาง (ดู /api/mo/labor-summary):
 *   · งานผลิต = ใบส่งงานที่ส่งในเดือนนั้น (จำนวนชิ้น + ค่าแรง)
 *   · งานเหมา = งานเหมาที่กด "เสร็จ" ในเดือนนั้น (ค่าแรง/ชิ้น × จำนวน)
 *
 * ⚠️ ใบส่งงานที่ติ๊ก "รอลงวันที่/ค่าแรง" จะยังไม่มีเงิน — โชว์เป็นตัวเลขสีส้มให้ตามเก็บ
 * ของกลาง: apiFetch · MiniTable · ระบบพิมพ์ (/print/labor-summary)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { MiniTable, type MiniColumn } from "@/components/mini-table";

type Person = {
  name: string; dept: string | null; sub_count: number; qty: number;
  prod_wage: number; piece_count: number; piece_wage: number; total: number; pending: number;
};
type Totals = { qty: number; prod_wage: number; piece_wage: number; total: number; pending: number; sub_count: number };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const money = (n: number) => `฿${fmt(n)}`;
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

export function LaborSummary() {
  const [ym, setYm] = useState(thisMonth);
  const [people, setPeople] = useState<Person[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (month: string) => {
    setLoading(true); setErr(null);
    try {
      const r = await apiFetch(`/api/mo/labor-summary?ym=${encodeURIComponent(month)}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setPeople((j.people ?? []) as Person[]);
      setTotals((j.totals ?? null) as Totals | null);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); setPeople([]); setTotals(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(ym); }, [ym, load]);

  const cols: MiniColumn<Person>[] = [
    { key: "name", header: "ช่าง", width: "minmax(10rem,1.4fr)", sortValue: (p) => p.name, sortLabel: "ชื่อช่าง",
      cell: (p) => <span className="text-[13px] font-medium text-slate-700">{p.name}{p.dept ? <span className="text-[11px] text-slate-400"> · {p.dept}</span> : null}</span> },
    { key: "subs", header: "ใบส่งงาน", width: "6rem", align: "right", sortValue: (p) => p.sub_count, sortLabel: "จำนวนใบ",
      cell: (p) => <span className="tabular-nums text-slate-500">{fmt(p.sub_count)}</span> },
    { key: "qty", header: "ชิ้นที่ส่ง", width: "6.5rem", align: "right", sortValue: (p) => p.qty, sortLabel: "จำนวนชิ้น",
      cell: (p) => <span className="tabular-nums">{fmt(p.qty)}</span> },
    { key: "prod", header: "ค่าแรงผลิต", width: "7.5rem", align: "right", sortValue: (p) => p.prod_wage, sortLabel: "ค่าแรงผลิต",
      cell: (p) => <span className="tabular-nums text-slate-600">{money(p.prod_wage)}</span> },
    { key: "piece", header: "งานเหมา", width: "7.5rem", align: "right", sortValue: (p) => p.piece_wage, sortLabel: "ค่าแรงงานเหมา",
      cell: (p) => p.piece_wage > 0 ? <span className="tabular-nums text-slate-600">{money(p.piece_wage)} <span className="text-[10px] text-slate-400">({p.piece_count})</span></span> : <span className="text-slate-300">—</span> },
    { key: "total", header: "รวม", width: "8rem", align: "right", sortValue: (p) => p.total, sortLabel: "รวมทั้งหมด",
      cell: (p) => <b className="tabular-nums text-slate-800">{money(p.total)}</b> },
    { key: "pending", header: "ยังไม่ใส่ค่าแรง", width: "8rem", align: "center", sortValue: (p) => p.pending, sortLabel: "ค้างใส่ค่าแรง",
      cell: (p) => p.pending > 0
        ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap">{fmt(p.pending)} ใบ</span>
        : <span className="text-emerald-600 text-[11px]">ครบ ✓</span> },
  ];

  const shiftMonth = (delta: number) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setYm(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => shiftMonth(-1)} className="h-9 w-9 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">‹</button>
        <input type="month" value={ym} onChange={(e) => e.target.value && setYm(e.target.value)}
          className="h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white" />
        <button onClick={() => shiftMonth(1)} className="h-9 w-9 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">›</button>
        <button onClick={() => setYm(thisMonth())} className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">เดือนนี้</button>
        <a href={`/print/labor-summary?ym=${encodeURIComponent(ym)}`} target="_blank" rel="noreferrer"
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">🖨 พิมพ์</a>
        <button onClick={() => void load(ym)} disabled={loading}
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50">{loading ? "กำลังโหลด…" : "🔄 รีเฟรช"}</button>
      </div>

      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            ["👷 ช่างที่มีงาน", `${fmt(people.length)} คน`, "border-slate-200 bg-white text-slate-600"],
            ["📦 ชิ้นที่ส่ง", `${fmt(totals.qty)} ชิ้น`, "border-slate-200 bg-white text-slate-600"],
            ["💰 ค่าแรงรวมทั้งเดือน", money(totals.total), "border-indigo-300 bg-indigo-50 text-indigo-700"],
            ["⚠️ ใบที่ยังไม่ใส่ค่าแรง", `${fmt(totals.pending)} ใบ`, totals.pending > 0 ? "border-amber-300 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"],
          ] as const).map(([label, val, cls]) => (
            <div key={label} className={`rounded-xl border px-3 py-1.5 ${cls}`}>
              <div className="text-[10px] opacity-80">{label}</div>
              <div className="text-sm font-bold tabular-nums">{val}</div>
            </div>
          ))}
        </div>
      )}

      {totals && totals.pending > 0 && (
        <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          มีใบส่งงาน <b>{fmt(totals.pending)}</b> ใบที่ติ๊กไว้ว่า “รอลงวันที่/ค่าแรง” — ยอดเงินด้านบนจึงยังไม่รวมใบพวกนี้
          ไปเติมได้ที่หน้า <a href="/master/qc-warehouse" className="underline">โกดัง QC</a> หรือตอนรับงานคืนที่บอร์ด
        </p>
      )}

      {err && <p className="text-sm text-rose-600">{err}</p>}

      <MiniTable
        rows={people} rowKey={(p) => p.name} columns={cols}
        title={`💰 ค่าแรงรายเดือน · ${ym}`} countUnit="คน"
        searchText={(p) => `${p.name} ${p.dept ?? ""}`}
        searchPlaceholder="ค้นหาชื่อช่าง"
        emptyText={loading ? "กำลังโหลด…" : "เดือนนี้ยังไม่มีใบส่งงาน"}
      />

      {totals && people.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm">
          <span className="text-slate-500">รวมทั้งเดือน</span>
          <span className="text-slate-600">ใบส่งงาน <b className="tabular-nums">{fmt(totals.sub_count)}</b></span>
          <span className="text-slate-600">ชิ้น <b className="tabular-nums">{fmt(totals.qty)}</b></span>
          <span className="text-slate-600">ผลิต <b className="tabular-nums">{money(totals.prod_wage)}</b></span>
          <span className="text-slate-600">เหมา <b className="tabular-nums">{money(totals.piece_wage)}</b></span>
          <span className="text-indigo-700 font-bold">รวม {money(totals.total)}</span>
        </div>
      )}
    </div>
  );
}
