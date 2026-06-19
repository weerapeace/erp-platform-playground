"use client";

/**
 * แดชบอร์ดจัดซื้อ — สรุปภาพรวม PR/PO/รับของ/จ่ายเงิน (หน้าแรกของแอปจัดซื้อ)
 * ข้อมูลรวมจาก /api/purchasing/dashboard (คำขอเดียว) + ของใกล้เข้าจาก /api/purchasing/receivable (ของเดิม)
 * วาดกราฟเอง (CSS bar + SVG donut) ไม่พึ่งไลบรารีหนัก · responsive (มือถือเรียงลงเป็นแถวเดียว)
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";

type Dash = {
  rmb_rate: number;
  kpi: { waiting: number; pending_receive: number; unpaid_thb: number; spend_this_month_thb: number };
  pr_status: Record<string, number>;
  monthly: { key: string; label: string; thb: number }[];
  top_suppliers: { name: string; thb: number }[];
  waiting_list: { id: string; requester: string; seller_name: string | null; amount_thb: number; created_at: string | null }[];
};
type Incoming = { id: string; item_name: string; code: string; expected_date: string | null; days_remaining: number | null; seller_name: string };

const baht = (n: number) => "฿" + Math.round(n || 0).toLocaleString("th-TH");
// แสดงยอดใหญ่ให้สั้น (เช่น 1.24M)
const bahtShort = (n: number) => {
  const v = Math.round(n || 0);
  if (v >= 1_000_000) return "฿" + (v / 1_000_000).toFixed(2) + "M";
  if (v >= 100_000) return "฿" + Math.round(v / 1000) + "k";
  return baht(v);
};

// ป้าย + สีของแต่ละสถานะ PR (ใช้ทั้ง donut + legend)
const PR_STATUS: Record<string, { label: string; color: string }> = {
  received:    { label: "รับครบแล้ว",  color: "#639922" },
  rfq_created: { label: "ออก PO แล้ว", color: "#1D9E75" },
  approved:    { label: "อนุมัติแล้ว", color: "#378ADD" },
  waiting:     { label: "รออนุมัติ",   color: "#EF9F27" },
  draft:       { label: "ร่าง",        color: "#888780" },
  rejected:    { label: "ไม่อนุมัติ",  color: "#E24B4A" },
  cancelled:   { label: "ยกเลิก",      color: "#B4B2A9" },
};

function Donut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const C = 2 * Math.PI * 50;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="w-26 h-26" style={{ width: 104, height: 104 }} role="img" aria-label="สัดส่วนสถานะใบขอซื้อ">
        <g transform="rotate(-90 60 60)" fill="none" strokeWidth={16}>
          {total === 0
            ? <circle cx={60} cy={60} r={50} stroke="#E5E7EB" strokeDasharray={`${C} ${C}`} />
            : data.filter(d => d.value > 0).map((d, i) => {
                const len = (d.value / total) * C;
                const off = -acc; acc += len;
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
            <span className="text-slate-400">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-slate-200 rounded-xl p-4 ${className}`}>{children}</div>;
}

export default function PurchasingDashboardPage() {
  const [d, setD] = useState<Dash | null>(null);
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/purchasing/dashboard").then(r => r.json())
      .then(j => { if (!j.error) setD(j as Dash); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);
  // ของใกล้เข้า/เลยกำหนด — ใช้ API รับของเดิม (มีวันคาดเข้าแล้ว) แล้วเรียงตามใกล้สุด
  useEffect(() => {
    apiFetch("/api/purchasing/receivable").then(r => r.json())
      .then(j => setIncoming(((j.data ?? []) as Incoming[])
        .filter(r => r.expected_date != null)
        .sort((a, b) => (a.days_remaining ?? 9999) - (b.days_remaining ?? 9999))
        .slice(0, 6)))
      .catch(() => {});
  }, []);

  const maxMonth = Math.max(1, ...(d?.monthly.map(m => m.thb) ?? [1]));
  const maxSup = Math.max(1, ...(d?.top_suppliers.map(s => s.thb) ?? [1]));
  const statusData = Object.entries(d?.pr_status ?? {})
    .map(([k, v]) => ({ label: PR_STATUS[k]?.label ?? k, value: v, color: PR_STATUS[k]?.color ?? "#888780" }))
    .sort((a, b) => b.value - a.value);

  return (
    <PlaygroundShell>
      <div className="p-4 sm:p-5 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">📊 แดชบอร์ดจัดซื้อ</h1>
          <Link href="/purchasing" className="h-9 px-4 leading-9 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ ขอซื้อสินค้า →</Link>
        </div>

        {loading && <div className="text-center text-slate-300 py-16 text-sm">กำลังโหลด...</div>}

        {!loading && d && (
          <div className="space-y-3">
            {/* KPI */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card>
                <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="text-amber-600">⏳</span> รออนุมัติ</div>
                <div className="text-2xl font-semibold mt-1">{d.kpi.waiting} <span className="text-xs text-slate-400 font-normal">ใบ</span></div>
              </Card>
              <Card>
                <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="text-blue-600">🚚</span> ค้างรับเข้า</div>
                <div className="text-2xl font-semibold mt-1">{d.kpi.pending_receive} <span className="text-xs text-slate-400 font-normal">รายการ</span></div>
              </Card>
              <Card>
                <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="text-rose-600">💰</span> รอจ่ายเงิน</div>
                <div className="text-2xl font-semibold mt-1">{baht(d.kpi.unpaid_thb)}</div>
              </Card>
              <Card>
                <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="text-emerald-600">🛒</span> ยอดซื้อเดือนนี้</div>
                <div className="text-2xl font-semibold mt-1">{bahtShort(d.kpi.spend_this_month_thb)}</div>
              </Card>
            </div>

            {/* Monthly spend */}
            <Card>
              <div className="text-sm font-medium mb-3">ยอดซื้อรายเดือน <span className="text-xs text-slate-400 font-normal">(บาท · แปลงหยวนที่เรต {d.rmb_rate})</span></div>
              <div className="flex items-end gap-3 h-28 px-1">
                {d.monthly.map((m, i) => {
                  const h = Math.round((m.thb / maxMonth) * 96);
                  const last = i === d.monthly.length - 1;
                  return (
                    <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5" title={baht(m.thb)}>
                      <div className="w-full max-w-[44px] rounded-t" style={{ height: Math.max(2, h), background: last ? "#534AB7" : "#AFA9EC" }} />
                      <span className={`text-[11px] ${last ? "text-indigo-600 font-medium" : "text-slate-400"}`}>{m.label}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Donut + Suppliers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card>
                <div className="text-sm font-medium mb-3">สถานะใบขอซื้อ</div>
                <Donut data={statusData} />
              </Card>
              <Card>
                <div className="text-sm font-medium mb-3">ร้านค้าที่ซื้อมากสุด</div>
                <div className="space-y-2.5 text-xs">
                  {d.top_suppliers.length === 0 && <div className="text-slate-300 py-4 text-center">ยังไม่มีข้อมูล</div>}
                  {d.top_suppliers.map((s, i) => (
                    <div key={i}>
                      <div className="flex justify-between mb-0.5"><span className="truncate pr-2 text-slate-600">{s.name}</span><span className="text-slate-500 flex-shrink-0">{bahtShort(s.thb)}</span></div>
                      <div className="h-[7px] bg-slate-100 rounded"><div className="h-[7px] rounded" style={{ width: `${Math.max(4, (s.thb / maxSup) * 100)}%`, background: "#D85A30" }} /></div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Incoming + Waiting */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card>
                <div className="text-sm font-medium mb-3">ของใกล้เข้า / เลยกำหนด</div>
                <div className="space-y-2 text-xs">
                  {incoming.length === 0 && <div className="text-slate-300 py-4 text-center">ไม่มีรายการคาดเข้า</div>}
                  {incoming.map((r) => {
                    const dr = r.days_remaining;
                    const badge = dr == null ? { t: "—", c: "bg-slate-100 text-slate-500" }
                      : dr < 0 ? { t: `เลย ${Math.abs(dr)} วัน`, c: "bg-red-50 text-red-700" }
                      : dr === 0 ? { t: "วันนี้", c: "bg-amber-50 text-amber-700" }
                      : dr === 1 ? { t: "พรุ่งนี้", c: "bg-amber-50 text-amber-700" }
                      : { t: `อีก ${dr} วัน`, c: "bg-slate-100 text-slate-500" };
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{r.item_name || r.code} <span className="text-slate-400">{r.code}</span></span>
                        <span className={`px-2 py-0.5 rounded-full flex-shrink-0 ${badge.c}`}>{badge.t}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
              <Card>
                <div className="text-sm font-medium mb-3">รออนุมัติ <span className="text-xs text-slate-400 font-normal">({d.kpi.waiting})</span></div>
                <div className="space-y-2 text-xs">
                  {d.waiting_list.length === 0 && <div className="text-slate-300 py-4 text-center">ไม่มีรายการรออนุมัติ</div>}
                  {d.waiting_list.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-600">{p.seller_name || "—"} <span className="text-slate-400">· {p.requester}</span></span>
                      <span className="text-slate-500 flex-shrink-0">{baht(p.amount_thb)}</span>
                    </div>
                  ))}
                  {d.waiting_list.length > 0 && (
                    <Link href="/purchasing/orders" className="block text-center text-blue-600 hover:underline pt-1">ไปหน้าอนุมัติ →</Link>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </PlaygroundShell>
  );
}
