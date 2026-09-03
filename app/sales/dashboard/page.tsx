"use client";

/**
 * แดชบอร์ดงานขาย — สรุปยอดขาย + กราฟ + ยอดที่ยังไม่ได้จ่าย (หน้าแรกของแอปขาย)
 * ข้อมูลรวมจาก /api/sales/dashboard (คำขอเดียว → RPC สรุปที่ DB) · วาดกราฟเอง (CSS bar + SVG donut)
 * "ยังไม่ได้จ่าย" แยก 2 กลุ่มตามสถานะจริง: ยังไม่ได้วางบิล (SO ยืนยันแล้ว) · วางบิลแล้วรอชำระ (+เกินกำหนด)
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { soStatusLabel, soStatusColor } from "@/lib/so-status";
import type { SalesDashboard } from "@/app/api/sales/dashboard/route";

const baht = (n: number) => "฿" + Math.round(n || 0).toLocaleString("th-TH");
const bahtShort = (n: number) => {
  const v = Math.round(n || 0);
  if (v >= 1_000_000) return "฿" + (v / 1_000_000).toFixed(2) + "M";
  if (v >= 100_000) return "฿" + Math.round(v / 1000) + "k";
  return baht(v);
};
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][m - 1] ?? m} ${String((y + 543) % 100).padStart(2, "0")}`;
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-slate-200 rounded-xl p-4 ${className}`}>{children}</div>;
}

/** การ์ด KPI — กดแล้วไปหน้าที่เกี่ยวข้อง */
function Kpi({ label, value, sub, tone = "slate", href, icon }: {
  label: string; value: string; sub?: React.ReactNode; tone?: "slate" | "blue" | "amber" | "red" | "green"; href?: string; icon: string;
}) {
  const tones: Record<string, string> = {
    slate: "from-slate-50 to-white border-slate-200 text-slate-800",
    blue:  "from-blue-50 to-white border-blue-200 text-blue-700",
    amber: "from-amber-50 to-white border-amber-200 text-amber-700",
    red:   "from-red-50 to-white border-red-200 text-red-700",
    green: "from-emerald-50 to-white border-emerald-200 text-emerald-700",
  };
  const inner = (
    <div className={`h-full bg-gradient-to-br ${tones[tone]} border rounded-xl p-4 ${href ? "hover:shadow-md transition" : ""}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-80">{icon} {label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums font-mono leading-tight">{value}</div>
      {sub && <div className="mt-1 text-[11px] opacity-70">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}

function Donut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const C = 2 * Math.PI * 50;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" style={{ width: 104, height: 104 }} role="img" aria-label="สัดส่วนสถานะใบขาย">
        <g transform="rotate(-90 60 60)" fill="none" strokeWidth={16}>
          {total === 0
            ? <circle cx={60} cy={60} r={50} stroke="#E5E7EB" strokeDasharray={`${C} ${C}`} />
            : data.filter(d => d.value > 0).map((d, i) => {
                const len = (d.value / total) * C; const off = -acc; acc += len;
                return <circle key={i} cx={60} cy={60} r={50} stroke={d.color} strokeDasharray={`${len} ${C}`} strokeDashoffset={off} />;
              })}
        </g>
        <text x={60} y={56} textAnchor="middle" fontSize={20} fontWeight={500} fill="#334155">{total}</text>
        <text x={60} y={73} textAnchor="middle" fontSize={10} fill="#94a3b8">ใบ</text>
      </svg>
      <div className="text-xs space-y-1.5">
        {data.filter(d => d.value > 0).map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
            <span className="text-slate-600">{d.label}</span>
            <span className="text-slate-400 tabular-nums">{d.value} · {total ? Math.round((d.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SalesDashboardPage() {
  const canView = usePermission("so.view");
  const [d, setD] = useState<SalesDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<"amt" | "n">("amt");

  useEffect(() => {
    if (!canView) return;
    apiFetch("/api/sales/dashboard?months=6").then(r => r.json())
      .then(j => { if (j.error) throw new Error(j.error); setD(j.data as SalesDashboard); })
      .catch(e => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [canView]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  const growth = d && d.prev_month.amt > 0
    ? Math.round(((d.this_month.amt - d.prev_month.amt) / d.prev_month.amt) * 100) : null;
  const maxMonthly = d ? Math.max(1, ...d.monthly.map(m => (metric === "amt" ? m.amt : m.n))) : 1;
  const maxCust = d ? Math.max(1, ...d.top_customers.map(c => c.amt)) : 1;

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">📊 แดชบอร์ดงานขาย</h1>
            <p className="text-sm text-slate-500">สรุปยอดขาย · สถานะเอกสาร · ยอดที่ยังไม่ได้จ่าย</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href="/sales/monthly" className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">📈 สรุปรายเดือน</Link>
            <Link href="/sales-orders" className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">🧾 ใบขาย</Link>
            <Link href="/master/sales-orders-plan" title="ใบสั่งขายแบบตาราง/ปฏิทิน — ดูกำหนดส่งรายวัน" className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">📅 ใบสั่งขาย (ตาราง/ปฏิทิน)</Link>
            <Link href="/billing-notes" className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">📑 ใบวางบิล</Link>
            <Link href="/delivery-notes" className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">📦 ใบส่งสินค้า</Link>
          </div>
        </div>

        {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        {loading || !d ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* ===== KPI ===== */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icon="💰" tone="blue" label="ยอดขายเดือนนี้" value={bahtShort(d.this_month.amt)}
                sub={<>{d.this_month.n} ใบ {growth !== null && (
                  <span className={growth >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                    · {growth >= 0 ? "▲" : "▼"} {Math.abs(growth)}% จากเดือนก่อน
                  </span>)}</>} />
              <Kpi icon="⏳" tone="amber" label="ยังไม่ได้วางบิล" value={bahtShort(d.unbilled.amt)}
                sub={`${d.unbilled.n} ใบ — ยืนยันแล้วยังไม่เรียกเก็บ`} href="/billing-notes" />
              <Kpi icon="🧾" tone={d.overdue.n > 0 ? "red" : "slate"} label="วางบิลแล้วรอชำระ" value={bahtShort(d.awaiting.amt)}
                sub={d.overdue.n > 0
                  ? <span className="text-red-600 font-medium">{d.awaiting.n} ใบ · เกินกำหนด {d.overdue.n} ใบ ({bahtShort(d.overdue.amt)})</span>
                  : `${d.awaiting.n} ใบ`} href="/billing-notes" />
              <Kpi icon="📝" tone="slate" label="ใบขายที่ยังเป็นร่าง" value={bahtShort(d.draft.amt)}
                sub={`${d.draft.n} ใบ — รอยืนยัน`} href="/sales-orders" />
            </div>

            {/* ===== กราฟ ===== */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* แท่ง: ยอดขายรายเดือน */}
              <Card className="lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-700">ยอดขายรายเดือน (6 เดือนล่าสุด)</h2>
                  <div className="flex border border-slate-200 rounded-lg overflow-hidden text-xs">
                    {([["amt", "ยอดเงิน"], ["n", "จำนวนใบ"]] as const).map(([k, label]) => (
                      <button key={k} onClick={() => setMetric(k)}
                        className={`h-7 px-3 ${metric === k ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>
                    ))}
                  </div>
                </div>
                {d.monthly.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-400">ยังไม่มีข้อมูลยอดขาย</div>
                ) : (
                  <div className="flex items-end justify-around gap-2 h-48 px-1">
                    {d.monthly.map(m => {
                      const v = metric === "amt" ? m.amt : m.n;
                      const h = Math.max(4, (v / maxMonthly) * 100);
                      return (
                        <div key={m.ym} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                          <div className="text-[10px] font-medium text-slate-600 tabular-nums whitespace-nowrap">
                            {metric === "amt" ? bahtShort(m.amt) : m.n}
                          </div>
                          <div className="w-full flex items-end justify-center" style={{ height: 130 }}>
                            <div className="w-full max-w-[46px] rounded-t-md bg-gradient-to-t from-blue-600 to-blue-400 transition-all"
                              style={{ height: `${h}%` }} title={`${monthLabel(m.ym)} · ${baht(m.amt)} · ${m.n} ใบ`} />
                          </div>
                          <div className="text-[10px] text-slate-400 whitespace-nowrap">{monthLabel(m.ym)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* โดนัท: สถานะใบขาย */}
              <Card>
                <h2 className="text-sm font-semibold text-slate-700 mb-4">สถานะใบขาย</h2>
                <Donut data={d.status_mix.map(s => ({
                  label: soStatusLabel(s.status), value: s.n, color: soStatusColor(s.status),
                }))} />
              </Card>
            </div>

            {/* ลูกค้า Top 5 */}
            <Card>
              <h2 className="text-sm font-semibold text-slate-700 mb-3">ลูกค้ายอดสูงสุด (6 เดือน)</h2>
              {d.top_customers.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-400">ยังไม่มีข้อมูล</div>
              ) : (
                <div className="space-y-2.5">
                  {d.top_customers.map((c, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-52 shrink-0 truncate text-xs text-slate-600" title={c.name}>{c.name}</div>
                      <div className="flex-1 h-6 bg-slate-100 rounded-md overflow-hidden">
                        <div className="h-full rounded-md bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${(c.amt / maxCust) * 100}%` }} />
                      </div>
                      <div className="w-28 shrink-0 text-right text-xs font-mono tabular-nums text-slate-700">{bahtShort(c.amt)}</div>
                      <div className="w-12 shrink-0 text-right text-[11px] text-slate-400">{c.n} ใบ</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* ===== ยอดที่ยังไม่ได้จ่าย (2 กลุ่ม) ===== */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 1) ยังไม่ได้วางบิล */}
              <Card>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-700">⏳ ยังไม่ได้วางบิล</h2>
                  <span className="text-xs text-slate-400">{d.unbilled.n} ใบ · <span className="font-mono text-amber-700 font-semibold">{baht(d.unbilled.amt)}</span></span>
                </div>
                {d.unbilled_rows.length === 0 ? (
                  <div className="py-8 text-center text-sm text-emerald-600">✅ เรียกเก็บครบทุกใบแล้ว</div>
                ) : (
                  <div className="overflow-auto max-h-72">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 sticky top-0">
                        <tr className="border-b border-slate-200">
                          <th className="px-2 py-2 text-left font-semibold">เลขที่</th>
                          <th className="px-2 py-2 text-left font-semibold">ลูกค้า</th>
                          <th className="px-2 py-2 text-left font-semibold">วันที่</th>
                          <th className="px-2 py-2 text-right font-semibold">ยอด</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {d.unbilled_rows.map(r => (
                          <tr key={r.id} className="hover:bg-amber-50/50">
                            <td className="px-2 py-1.5"><code className="font-mono text-[11px] text-slate-600">{r.so_number ?? "(ร่าง)"}</code></td>
                            <td className="px-2 py-1.5 max-w-[180px] truncate text-slate-700" title={r.customer_name ?? ""}>{r.customer_name}</td>
                            <td className="px-2 py-1.5 text-xs text-slate-500">{formatDate(r.order_date)}</td>
                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-800">{baht(r.amt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <Link href="/billing-notes" className="mt-3 inline-flex h-8 items-center px-3 text-xs font-medium border border-amber-200 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100">
                  + สร้างใบวางบิล
                </Link>
              </Card>

              {/* 2) วางบิลแล้วรอชำระ */}
              <Card>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-700">🧾 วางบิลแล้วรอชำระ</h2>
                  <span className="text-xs text-slate-400">{d.awaiting.n} ใบ · <span className="font-mono text-blue-700 font-semibold">{baht(d.awaiting.amt)}</span></span>
                </div>
                {d.awaiting_rows.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400">
                    ยังไม่มีใบวางบิลที่รอชำระ
                    <div className="text-[11px] text-slate-400 mt-1">(ใบวางบิลต้องกด &ldquo;วางบิล&rdquo; ก่อน จึงจะนับเป็นรอชำระ)</div>
                  </div>
                ) : (
                  <div className="overflow-auto max-h-72">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 sticky top-0">
                        <tr className="border-b border-slate-200">
                          <th className="px-2 py-2 text-left font-semibold">เลขที่</th>
                          <th className="px-2 py-2 text-left font-semibold">ลูกค้า</th>
                          <th className="px-2 py-2 text-left font-semibold">ครบกำหนด</th>
                          <th className="px-2 py-2 text-right font-semibold">ยอด</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {d.awaiting_rows.map(r => (
                          <tr key={r.id} className={r.overdue ? "bg-red-50/60 hover:bg-red-50" : "hover:bg-slate-50"}>
                            <td className="px-2 py-1.5"><code className="font-mono text-[11px] text-slate-600">{r.bill_number ?? "(ร่าง)"}</code></td>
                            <td className="px-2 py-1.5 max-w-[180px] truncate text-slate-700" title={r.customer_name ?? ""}>{r.customer_name}</td>
                            <td className={`px-2 py-1.5 text-xs ${r.overdue ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                              {r.due_date ? formatDate(r.due_date) : "—"}{r.overdue && " ⚠"}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-800">{baht(r.amt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </PlaygroundShell>
  );
}
