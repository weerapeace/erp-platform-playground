"use client";

/**
 * Dashboard โอนเงินจีน (desktop) — /m/china-dashboard
 * สรุปภาพรวม: ยอดคงเหลือบัญชีจีน, บิลรอโอน, โอนแล้วเดือนนี้, CTW ค้าง, เรทวันนี้,
 * รายการโอนล่าสุด, กราฟยอดโอนรายวัน(เดือนนี้)/รายเดือน(ย้อนหลัง 6 เดือน)
 * ดึงข้อมูลฝั่ง client (กัน Worker 1102) ผ่าน /api/master-v2/*
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : 0; };
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Row = Record<string, unknown>;

export default function ChinaDashboardPage() {
  const [transfers, setTransfers] = useState<Row[]>([]);
  const [pending, setPending] = useState<Row[]>([]);
  const [ctw, setCtw] = useState<Row[]>([]);
  const [rateToday, setRateToday] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = ymd(new Date());
    const fPending = encodeURIComponent(JSON.stringify({ status: { type: "text", value: "รอโอน" } }));
    Promise.all([
      apiFetch("/api/master-v2/china-transfers?limit=1000&sort_by=transfer_date&sort_dir=desc").then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`/api/master-v2/china-bills?limit=500&filters=${fPending}`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch("/api/master-v2/ctw-bills?limit=500").then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch("/api/master-v2/daily-rates?limit=90&sort_by=rate_date&sort_dir=desc").then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([t, p, c, rt]) => {
      setTransfers(t.data ?? []);
      setPending(p.data ?? []);
      setCtw((c.data ?? []).filter((r: Row) => !r.cleared_at));
      const row = (rt.data ?? []).find((x: Row) => String(x.rate_date) === today);
      setRateToday(row ? num(row.rate) : null);
    }).finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const balThb = transfers.reduce((a, r) => a + num(r.leftover_thb), 0);
    const balRmb = transfers.reduce((a, r) => a + num(r.leftover_rmb), 0);
    const pendThb = pending.reduce((a, r) => a + (num(r.amount_rmb) + num(r.fee_rmb)), 0);
    const pendRmbRemain = pending.reduce((a, r) => a + Math.max(0, num(r.amount_rmb) + num(r.fee_rmb) - num(r.paid_rmb)), 0);
    const ym = ymd(new Date()).slice(0, 7);
    const monthTransfers = transfers.filter(r => String(r.transfer_date ?? "").slice(0, 7) === ym);
    const monthThb = monthTransfers.reduce((a, r) => a + num(r.amount_transferred_thb), 0);
    const ctwRemain = ctw.reduce((a, r) => a + Math.max(0, num(r.net_amount) - num(r.cleared_amount)), 0);
    return { balThb, balRmb, pendThb, pendRmbRemain, monthCount: monthTransfers.length, monthThb, ctwRemain };
  }, [transfers, pending, ctw]);

  // กราฟรายวัน (เดือนนี้) — ยอดโอนจริงต่อวัน
  const daily = useMemo(() => {
    const ym = ymd(new Date()).slice(0, 7);
    const map: Record<string, number> = {};
    transfers.forEach(r => { const d = String(r.transfer_date ?? ""); if (d.slice(0, 7) === ym) map[d] = (map[d] ?? 0) + num(r.amount_transferred_thb); });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => ({ label: d.slice(8), v }));
  }, [transfers]);

  // กราฟรายเดือน (ย้อนหลัง 6 เดือน)
  const monthly = useMemo(() => {
    const out: { label: string; v: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const v = transfers.filter(r => String(r.transfer_date ?? "").slice(0, 7) === key).reduce((a, r) => a + num(r.amount_transferred_thb), 0);
      out.push({ label: `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear() + 543).slice(2)}`, v });
    }
    return out;
  }, [transfers]);

  if (loading) return <div className="p-10 text-center text-slate-400">กำลังโหลด Dashboard…</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">📊 Dashboard โอนเงินจีน</h1>
        <p className="text-sm text-slate-500">ภาพรวมการโอนเงิน · บิล · ยอดคงเหลือ</p>
      </div>

      {/* การ์ดสรุป */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="💰 ยอดคงเหลือบัญชีจีน" main={`฿${fmt(stats.balThb)}`} sub={`≈ ¥${fmt(stats.balRmb)}`} tone="emerald" />
        <StatCard title="⏳ บิลรอโอน" main={`${pending.length} บิล`} sub={`ค้าง ¥${fmt(stats.pendRmbRemain)}`} tone="amber" />
        <StatCard title="✅ โอนแล้วเดือนนี้" main={`${stats.monthCount} ครั้ง`} sub={`฿${fmt(stats.monthThb)}`} tone="sky" />
        <StatCard title="📑 CTW ค้าง" main={`฿${fmt(stats.ctwRemain)}`} sub={`${ctw.length} บิล`} tone="orange" />
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-4 flex items-center justify-between">
        <span className="text-sm text-slate-500">💱 เรทวันนี้ (R1)</span>
        <span className="text-2xl font-bold text-slate-800">{rateToday != null ? fmt(rateToday) : "— ยังไม่ตั้ง —"}</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="ยอดโอนรายวัน (เดือนนี้)" data={daily} color="#10b981" empty="ยังไม่มีการโอนเดือนนี้" />
        <ChartCard title="ยอดโอนรายเดือน (6 เดือน)" data={monthly} color="#6366f1" empty="ยังไม่มีข้อมูล" />
      </div>

      {/* รายการโอนล่าสุด */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4">
        <div className="font-semibold text-slate-800 mb-3">🧾 รายการโอนล่าสุด</div>
        {transfers.length === 0 ? <div className="text-center text-slate-300 py-6">— ยังไม่มีรายการ —</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-3">เลขโอน</th><th className="py-2 pr-3">วันที่</th><th className="py-2 pr-3 text-right">โอนจริง (฿)</th><th className="py-2 text-right">เข้าบัญชีจีน (¥)</th>
              </tr></thead>
              <tbody>
                {transfers.slice(0, 8).map((r, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-2 pr-3 font-medium text-slate-700">{String(r.transfer_no ?? "—")}</td>
                    <td className="py-2 pr-3 text-slate-500">{String(r.transfer_date ?? "—")}</td>
                    <td className="py-2 pr-3 text-right text-slate-700">฿{fmt(num(r.amount_transferred_thb))}</td>
                    <td className="py-2 text-right text-emerald-700">¥{fmt(Math.max(0, num(r.leftover_rmb)))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, main, sub, tone }: { title: string; main: string; sub: string; tone: "emerald" | "amber" | "sky" | "orange" }) {
  const c = { emerald: "from-emerald-500 to-teal-600", amber: "from-amber-400 to-orange-500", sky: "from-sky-500 to-blue-600", orange: "from-orange-500 to-rose-500" }[tone];
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${c} text-white p-4 shadow-sm`}>
      <div className="text-xs opacity-90">{title}</div>
      <div className="text-2xl font-bold mt-1 leading-tight">{main}</div>
      <div className="text-xs opacity-90 mt-0.5">{sub}</div>
    </div>
  );
}

function ChartCard({ title, data, color, empty }: { title: string; data: { label: string; v: number }[]; color: string; empty: string }) {
  const max = Math.max(1, ...data.map(d => d.v));
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4">
      <div className="font-semibold text-slate-800 mb-3">{title}</div>
      {data.length === 0 || max <= 1 ? <div className="text-center text-slate-300 py-8 text-sm">{empty}</div> : (
        <div className="flex items-end gap-1.5 h-40">
          {data.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full rounded-t" style={{ height: `${Math.max(4, (d.v / max) * 130)}px`, background: color }} title={fmt(d.v)} />
              <span className="text-[9px] text-slate-400 truncate w-full text-center">{d.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
