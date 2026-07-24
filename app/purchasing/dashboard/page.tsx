"use client";

/**
 * แดชบอร์ดจัดซื้อ — สรุปภาพรวม PR/PO/รับของ/จ่ายเงิน (หน้าแรกของแอปจัดซื้อ)
 * ข้อมูลรวมจาก /api/purchasing/dashboard (คำขอเดียว) + ของใกล้เข้าจาก /api/purchasing/receivable (ของเดิม)
 * วาดกราฟเอง (CSS bar + SVG donut) ไม่พึ่งไลบรารีหนัก · responsive (มือถือเรียงลงเป็นแถวเดียว)
 */
import { useEffect, useState, useRef, Fragment } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { ERPModal } from "@/components/modal";
import { Pager } from "@/components/pager";
import { SortTh, sortRows, type SortState } from "@/components/sort-th";
import { SearchableSelect } from "@/components/searchable-select";
import { apiFetch } from "@/lib/api";
import type { DrillRow } from "@/app/api/purchasing/dashboard/list/route";

type Dash = {
  rmb_rate: number;
  kpi: { waiting: number; pending_receive: number; unpaid_thb: number; spend_this_month_thb: number };
  pr_status: Record<string, number>;
  monthly: { key: string; label: string; thb: number; po_count: number; pr_count: number }[];
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

function Card({ children, className = "", onClick, active }: { children: React.ReactNode; className?: string; onClick?: () => void; active?: boolean }) {
  return (
    <div onClick={onClick} className={`relative bg-white border rounded-xl p-4 ${active ? "border-blue-400 ring-2 ring-blue-200" : "border-slate-200"} ${onClick ? "cursor-pointer hover:border-blue-300 hover:shadow-sm transition" : ""} ${className}`}>
      {children}
      {active && <div className="absolute left-1/2 -bottom-[7px] -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-blue-400 rotate-45 z-10" />}
    </div>
  );
}

export default function PurchasingDashboardPage() {
  const [d, setD] = useState<Dash | null>(null);
  const [drill, setDrill] = useState<{ type: string; seller?: string } | null>(null);   // แผงเจาะรายการ (กดการ์ด/ร้าน) — กางในหน้า
  // กดการ์ดเดิมซ้ำ = พับเก็บ · กดอันใหม่ = สลับเนื้อหา
  const toggleDrill = (next: { type: string; seller?: string }) =>
    setDrill((cur) => (cur && cur.type === next.type && (cur.seller ?? "") === (next.seller ?? "") ? null : next));
  const [metric, setMetric] = useState<"thb" | "po_count" | "pr_count">("thb");   // เลือกสิ่งที่กราฟรายเดือนโชว์
  const [lineOpen, setLineOpen] = useState(false);   // โมดอลตั้งค่ากลุ่ม LINE แจ้งเตือนขอซื้อ
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/purchasing/dashboard").then(r => r.json())
      .then(j => { if (!j.error) setD(j as Dash); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);
  // ของใกล้เข้า/เลยกำหนด — API รับของเป็นตัวหนัก → โหลด "หลัง" แดชบอร์ดเสร็จ (ไม่แย่ง resource, เนื้อหาหลักขึ้นก่อน)
  useEffect(() => {
    if (!d) return;
    apiFetch("/api/purchasing/receivable").then(r => r.json())
      .then(j => setIncoming(((j.data ?? []) as Incoming[])
        .filter(r => r.expected_date != null)
        .sort((a, b) => (a.days_remaining ?? 9999) - (b.days_remaining ?? 9999))
        .slice(0, 6)))
      .catch(() => {});
  }, [d]);

  const METRICS = { thb: "ยอดซื้อ (บาท)", po_count: "จำนวนใบสั่งซื้อ", pr_count: "จำนวนใบขอซื้อ" } as const;
  const mVal = (m: { thb: number; po_count: number; pr_count: number }) => m[metric];
  const mLabel = (v: number) => metric === "thb" ? bahtShort(v) : v.toLocaleString("th-TH");
  const maxMonth = Math.max(1, ...(d?.monthly.map(mVal) ?? [1]));
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
          <div className="flex items-center gap-2">
            <Link href="/purchasing/calendar" className="h-9 px-3 leading-9 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50" title="ปฏิทินของเข้า / จ่ายเงิน">📅 ปฏิทิน</Link>
            <button onClick={() => setLineOpen(true)} className="h-9 px-3 leading-9 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50" title="ตั้งค่ากลุ่ม LINE แจ้งเตือนขอซื้อ">💬 ตั้งค่า LINE</button>
            <Link href="/purchasing" className="h-9 px-4 leading-9 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ ขอซื้อสินค้า →</Link>
          </div>
        </div>

        {loading && <div className="text-center text-slate-300 py-16 text-sm">กำลังโหลด...</div>}

        {!loading && d && (
          <div className="space-y-3">
            {/* KPI */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card active={drill?.type === "waiting"} onClick={() => toggleDrill({ type: "waiting" })}>
                <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="text-amber-600">⏳</span> รออนุมัติ <span className="ml-auto text-[10px] text-slate-300">กดดู</span></div>
                <div className="text-2xl font-semibold mt-1">{d.kpi.waiting} <span className="text-xs text-slate-400 font-normal">ใบ</span></div>
              </Card>
              <Card active={drill?.type === "pending_receive"} onClick={() => toggleDrill({ type: "pending_receive" })}>
                <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="text-blue-600">🚚</span> ค้างรับเข้า <span className="ml-auto text-[10px] text-slate-300">กดดู</span></div>
                <div className="text-2xl font-semibold mt-1">{d.kpi.pending_receive} <span className="text-xs text-slate-400 font-normal">รายการ</span></div>
              </Card>
              <Card active={drill?.type === "unpaid"} onClick={() => toggleDrill({ type: "unpaid" })}>
                <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="text-rose-600">💰</span> รอจ่ายเงิน <span className="ml-auto text-[10px] text-slate-300">กดดู</span></div>
                <div className="text-2xl font-semibold mt-1">{baht(d.kpi.unpaid_thb)}</div>
              </Card>
              <Card active={drill?.type === "spend_month"} onClick={() => toggleDrill({ type: "spend_month" })}>
                <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="text-emerald-600">🛒</span> ยอดซื้อเดือนนี้ <span className="ml-auto text-[10px] text-slate-300">กดดู</span></div>
                <div className="text-2xl font-semibold mt-1">{bahtShort(d.kpi.spend_this_month_thb)}</div>
              </Card>
            </div>

            {/* แผงเจาะรายการ (กางในหน้า แทน popup) — โผล่ใต้การ์ด KPI ทันทีที่กด */}
            {drill && <DrillPanel drill={drill} onClose={() => setDrill(null)} />}

            {/* Monthly chart — เลือก metric + โชว์ตัวเลขบนแท่ง */}
            <Card>
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="text-sm font-medium">รายเดือน {metric === "thb" && <span className="text-xs text-slate-400 font-normal">(แปลงหยวนที่เรต {d.rmb_rate})</span>}</div>
                <select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}
                  className="h-8 px-2 text-xs border border-slate-200 rounded-lg bg-white">
                  {(Object.keys(METRICS) as (keyof typeof METRICS)[]).map((k) => <option key={k} value={k}>{METRICS[k]}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-3 h-32 px-1">
                {d.monthly.map((m, i) => {
                  const v = mVal(m);
                  const h = Math.round((v / maxMonth) * 92);
                  const last = i === d.monthly.length - 1;
                  return (
                    <div key={m.key} className="flex-1 flex flex-col items-center gap-1 justify-end" title={mLabel(v)}>
                      <span className={`text-[10px] tabular-nums ${last ? "text-indigo-600 font-semibold" : "text-slate-400"}`}>{v > 0 ? mLabel(v) : ""}</span>
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
                <div className="text-sm font-medium mb-3">ร้านค้าที่ซื้อมากสุด <span className="text-[11px] text-slate-400 font-normal">· กดร้านดูว่าซื้ออะไร</span></div>
                <div className="space-y-2.5 text-xs">
                  {d.top_suppliers.length === 0 && <div className="text-slate-300 py-4 text-center">ยังไม่มีข้อมูล</div>}
                  {d.top_suppliers.map((s, i) => (
                    <button key={i} type="button" onClick={() => setDrill({ type: "supplier", seller: s.name })} className="w-full text-left block group">
                      <div className="flex justify-between mb-0.5"><span className="truncate pr-2 text-slate-600 group-hover:text-blue-600">{s.name}</span><span className="text-slate-500 flex-shrink-0">{bahtShort(s.thb)}</span></div>
                      <div className="h-[7px] bg-slate-100 rounded"><div className="h-[7px] rounded" style={{ width: `${Math.max(4, (s.thb / maxSup) * 100)}%`, background: "#D85A30" }} /></div>
                    </button>
                  ))}
                </div>
              </Card>
            </div>

            {/* Incoming + Waiting */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-sm font-medium">ของใกล้เข้า / เลยกำหนด</div>
                  <button type="button" onClick={() => setDrill({ type: "pending_receive" })} className="text-xs text-blue-600 hover:underline">รอของเข้าทั้งหมด →</button>
                </div>
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
                  <Link href="/purchasing" className="block text-center text-blue-600 hover:underline pt-1">+ เพิ่มรายการตามใบสั่งงาน →</Link>
                </div>
              </Card>
              <Card>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-sm font-medium">รายการรอซื้อ <span className="text-xs text-slate-400 font-normal">({d.kpi.waiting})</span></div>
                  <button type="button" onClick={() => setDrill({ type: "waiting" })} className="text-xs text-blue-600 hover:underline">เลือกร้าน/ค้นหา/ตามใบสั่งงาน →</button>
                </div>
                <div className="space-y-2 text-xs">
                  {d.waiting_list.length === 0 && <div className="text-slate-300 py-4 text-center">ไม่มีรายการรอซื้อ</div>}
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
      <LineGroupModal open={lineOpen} onClose={() => setLineOpen(false)} />
    </PlaygroundShell>
  );
}

// แผงเจาะรายการเบื้องหลังตัวเลข/ร้าน (กางในหน้า) — ค้นหา + เลือกร้าน + จัดกลุ่มตามใบสั่งงาน + view การ์ด/ตาราง + ปุ่มสั่ง/ลิงก์
const isYuan = (c?: string | null) => ["RMB", "YUAN", "CNY"].includes(String(c ?? "").toUpperCase());
const unitStr = (r: DrillRow) => isYuan(r.currency) ? `¥${(r.unit_price ?? 0).toLocaleString()}` : baht(r.unit_price ?? 0);
type DrillView = "card" | "table" | "list";
// คีย์ที่ใช้เรียงในตาราง (ของกลาง sortRows)
const sortVal = (r: DrillRow, k: string): string | number | null | undefined => {
  switch (k) {
    case "name": return r.primary;
    case "code": return r.code;
    case "seller": return r.seller ?? undefined;
    case "qty": return r.qty;
    case "price": return r.unit_price_thb;
    case "order": return r.order_date ?? undefined;
    case "remain": return r.remain;
    default: return undefined;
  }
};

function DrillPanel({ drill, onClose }: { drill: { type: string; seller?: string } | null; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<{ title: string; rows: DrillRow[]; sellers: string[]; link: { href: string; label: string } | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [seller, setSeller] = useState("");
  const [grouped, setGrouped] = useState(false);
  const [view, setView] = useState<DrillView>("card");      // มุมมอง (การ์ด/ตาราง/รายการ)
  const [sort, setSort] = useState<SortState>(null);         // เรียงในตาราง
  const [page, setPage] = useState(0);                       // เลื่อนหน้า (0-based)
  const [pageSize, setPageSize] = useState(20);
  const [reloadKey, setReloadKey] = useState(0);            // กดปุ่มแล้วรีโหลดลิสต์
  const [busy, setBusy] = useState<Set<string>>(new Set());  // แถวที่กำลังทำรายการ
  const [err, setErr] = useState<string | null>(null);
  const [openOrder, setOpenOrder] = useState<string | null>(null);  // แถวที่กำลังกรอก "สั่ง"
  const [orderQty, setOrderQty] = useState("");
  const [detail, setDetail] = useState<DrillRow | null>(null);      // popup รายละเอียด
  const [uploading, setUploading] = useState(false);                // กำลังอัปรูปเข้า SKU
  const [stores, setStores] = useState<string[]>([]);               // รายชื่อร้าน (pickup)
  const open = drill !== null;
  const isWaiting = drill?.type === "waiting";
  const isReceive = drill?.type === "pending_receive";
  const isRich = isWaiting || isReceive;
  const fixedSeller = drill?.type === "supplier" ? (drill.seller ?? "") : "";

  useEffect(() => { if (open) { setQ(""); setSeller(""); setGrouped(false); setView("card"); setSort(null); setPage(0); setData(null); setOpenOrder(null); setDetail(null); } }, [open, drill?.type, drill?.seller]);
  // เลื่อนหน้าจอมาที่แผงเมื่อเปิด/สลับการ์ด (โดยเฉพาะเวลากดจากการ์ดด้านล่าง)
  useEffect(() => { if (open) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [open, drill?.type, drill?.seller]);
  // รายชื่อร้าน (pickup) — ดึงครั้งเดียวตอนเปิดแผง
  useEffect(() => { if (open) apiFetch("/api/purchasing/stores").then((r) => r.json()).then((j) => setStores((j.stores ?? []) as string[])).catch(() => {}); }, [open]);
  // กลับหน้าแรกเมื่อเปลี่ยนตัวกรอง/เรียง/มุมมอง
  useEffect(() => { setPage(0); }, [q, seller, grouped, view, sort?.key, sort?.dir, pageSize]);

  useEffect(() => {
    if (!open || !drill) return;
    setLoading(true);
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ type: drill.type });
      if (fixedSeller) qs.set("seller", fixedSeller);
      else if (seller) qs.set("seller", seller);
      if (q) qs.set("q", q);
      apiFetch(`/api/purchasing/dashboard/list?${qs}`).then((r) => r.json())
        .then((j) => { if (!j.error) setData(j); }).catch(() => {}).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [open, drill, fixedSeller, seller, q, reloadKey]);

  // ปุ่มทำงานในลิสต์ (อนุมัติ / จ่ายแล้ว / สั่ง / ลิงก์) → ยิง API แล้วรีโหลด
  const act = async (id: string, fn: () => Promise<Response>) => {
    setErr(null); setBusy((b) => new Set(b).add(id));
    try {
      const r = await fn(); const j = await r.json();
      if (j.error) throw new Error(j.error);
      setReloadKey((k) => k + 1);
    } catch (e) { setErr(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ"); }
    finally { setBusy((b) => { const n = new Set(b); n.delete(id); return n; }); }
  };
  const approve = (id: string) => act(id, () => apiFetch("/api/purchasing/pr-approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pr_ids: [id], action: "approve" }) }));
  const markPaid = (id: string) => act(id, () => apiFetch("/api/purchasing/mark-paid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }));

  const startOrder = (r: DrillRow) => { setOpenOrder(r.id); setOrderQty(String(r.qty ?? "")); };
  const confirmOrder = async (r: DrillRow) => {
    await act(r.id, () => apiFetch("/api/purchasing/pr-quick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, mark_ordered: true, qty: orderQty === "" ? null : Number(orderQty) }) }));
    setOpenOrder(null);
  };
  const openDetail = (r: DrillRow) => setDetail(r);
  const entityOf = () => (drill?.type === "waiting" ? "pr" : "po_line");
  // เติมข้อมูลที่ขาด → save กลับ SKU + เอกสาร แล้วอัปเดตป๊อป (เอา field ออกจาก "ที่ขาด")
  const enrich = async (r: DrillRow, field: string, value: string | number, currency?: string) => {
    await act(r.id, () => apiFetch("/api/purchasing/pr-enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity: entityOf(), id: r.id, sku_id: r.sku_id ?? null, field, value, currency }) }));
    setDetail((d) => {
      if (!d || d.id !== r.id) return d;
      const missing = (d.missing ?? []).filter((m) => m !== field);
      const patch: Partial<DrillRow> = { missing };
      if (field === "image") patch.image_url = `/api/r2-image?key=${encodeURIComponent(String(value))}`;
      if (field === "price") { patch.unit_price = Number(value); if (currency) patch.currency = isYuan(currency) ? "YUAN" : "THB"; }
      if (field === "link") patch.purchase_url = String(value) || null;
      if (field === "seller") patch.seller = String(value) || null;
      return { ...d, ...patch };
    });
  };
  const uploadCover = async (r: DrillRow, file: File) => {
    setUploading(true); setErr(null);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "skus");
      const up = await apiFetch("/api/admin/upload", { method: "POST", body: fd }).then((x) => x.json());
      if (up.error || !up.r2_key) throw new Error(up.error || "อัปโหลดไม่สำเร็จ");
      await enrich(r, "image", up.r2_key);
    } catch (e) { setErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"); }
    finally { setUploading(false); }
  };
  // แหล่งซื้อที่ 2 (เก็บบน SKU)
  const saveSource2 = async (r: DrillRow, s: { seller: string; price: string; currency: string; link: string }) => {
    await act(r.id, () => apiFetch("/api/purchasing/pr-enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity: entityOf(), id: r.id, sku_id: r.sku_id ?? null, field: "source2", source2: s }) }));
    setDetail((d) => (d && d.id === r.id ? { ...d, alt_seller: s.seller.trim() || null, alt_price: s.price === "" ? null : Number(s.price), alt_currency: s.currency, alt_link: s.link.trim() || null } : d));
  };

  // ---- เรียง + แบ่งหน้า + จัดกลุ่ม ----
  const rows = data?.rows ?? [];
  const sorted = sortRows(rows, sort, sortVal);
  const total = sorted.length;
  const curPage = Math.min(page, Math.max(0, Math.ceil(total / pageSize) - 1));   // กันหน้าเกินช่วงหลังรายการลด
  const pageRows = sorted.slice(curPage * pageSize, (curPage + 1) * pageSize);
  const groupKey = (r: DrillRow) => isReceive ? (r.seller || "— ไม่ระบุร้าน —") : (r.mo_no || "— ไม่มีใบสั่งงาน —");
  const groups: [string, DrillRow[]][] = grouped
    ? Object.entries(pageRows.reduce((m: Record<string, DrillRow[]>, r) => { (m[groupKey(r)] ??= []).push(r); return m; }, {}))
    : [["", pageRows]];

  // ---- รูปย่อ ----
  const Thumb = ({ url, size }: { url?: string | null; size: string }) => url
    ? <img src={url} alt="" className={`${size} rounded-lg object-cover border border-slate-100 shrink-0 bg-slate-50`} />
    : <div className={`${size} rounded-lg bg-slate-100 flex items-center justify-center text-slate-300 shrink-0`}>📦</div>;

  // ---- ปุ่มด่วน: waiting = อนุมัติ + สั่ง · pending = รับของ (ลิงก์/รายละเอียด อยู่ใน popup) ----
  const Actions = ({ r }: { r: DrillRow }) => {
    if (isReceive) return (
      <Link href="/purchasing/receive" onClick={(e) => e.stopPropagation()} className="h-7 px-2.5 leading-7 text-xs rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 shrink-0">รับของ →</Link>
    );
    return (
      <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
        <button disabled={busy.has(r.id)} onClick={() => approve(r.id)}
          className="h-7 px-2.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">{busy.has(r.id) ? "..." : "✓ อนุมัติ"}</button>
        <button disabled={busy.has(r.id)} onClick={() => startOrder(r)}
          className={`h-7 px-2.5 text-xs rounded-lg border ${r.order_date ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-amber-200 text-amber-700 hover:bg-amber-50"}`}>
          {r.order_date ? `✓ สั่งแล้ว ${r.order_date}` : "🛒 สั่ง"}</button>
      </div>
    );
  };

  // ---- แผงกรอก "สั่ง" (โผล่ใต้แถว) ----
  const OrderEditor = ({ r }: { r: DrillRow }) => openOrder === r.id ? (
    <div className="mt-2 flex items-center gap-2 flex-wrap bg-amber-50 border border-amber-200 rounded-lg p-2" onClick={(e) => e.stopPropagation()}>
      <span className="text-xs text-amber-800">จำนวนที่สั่ง</span>
      <input type="number" min={0} value={orderQty} onChange={(e) => setOrderQty(e.target.value)}
        className="h-7 w-24 px-2 text-xs border border-amber-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400" />
      <span className="text-xs text-slate-500">{r.uom}</span>
      <span className="text-[11px] text-slate-400">· วันสั่ง = วันนี้</span>
      <button disabled={busy.has(r.id)} onClick={() => confirmOrder(r)} className="h-7 px-3 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">ยืนยันสั่ง</button>
      <button onClick={() => setOpenOrder(null)} className="h-7 px-2.5 text-xs text-slate-500 hover:underline">ยกเลิก</button>
    </div>
  ) : null;

  // ---- การ์ดกระชับ (กดที่การ์ด = เปิดรายละเอียด · ปุ่มด่วนอยู่ล่าง) ----
  const Cards = ({ grows }: { grows: DrillRow[] }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {grows.map((r) => (
        <div key={r.id} className={`rounded-xl border p-2.5 ${r.order_date ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"}`}>
          <button type="button" onClick={() => openDetail(r)} className="w-full flex gap-2.5 text-left group">
            <Thumb url={r.image_url} size="w-12 h-12" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium text-slate-800 leading-snug break-words group-hover:text-blue-700">{r.primary}</div>
                {r.order_date && <span className="shrink-0 text-[10px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">✓ สั่งแล้ว</span>}
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {r.code && <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{r.code}</span>}
                {isReceive ? (r.po_no && <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">📄 {r.po_no}</span>)
                  : (r.mo_no && <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">🏭 {r.mo_no}</span>)}
                {(r.missing?.length ?? 0) > 0 && <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">⚠️ ข้อมูลไม่ครบ</span>}
              </div>
              <div className="text-xs text-slate-700 mt-1 tabular-nums">
                {isReceive
                  ? <>ค้าง <span className="font-medium text-blue-700">{(r.remain ?? 0).toLocaleString()}</span>/{(r.qty ?? 0).toLocaleString()} {r.uom} <span className="text-slate-400">· {r.seller || "—"}</span></>
                  : <>{unitStr(r)}<span className="text-slate-400">/{r.uom || "หน่วย"}</span> × {(r.qty ?? 0).toLocaleString()} = <span className="font-medium">{baht(r.line_total_thb ?? 0)}</span></>}
              </div>
            </div>
          </button>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Actions r={r} />
            <span className="text-[10px] text-slate-300 group-hover:text-slate-400 shrink-0">กดดูรายละเอียด</span>
          </div>
          <OrderEditor r={r} />
        </div>
      ))}
    </div>
  );

  // ---- ตาราง (คลิกหัวคอลัมน์ = เรียง · คลิกชื่อ = รายละเอียด) ----
  const Table = ({ grows }: { grows: DrillRow[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-[11px] text-slate-400 border-b border-slate-100">
            <th className="py-1.5 pr-2 font-medium text-left">รูป</th>
            <SortTh label="ชื่อ / รหัส" k="name" sort={sort} onSort={setSort} />
            <SortTh label={isReceive ? "ร้าน · PO" : "ร้าน · MO"} k="seller" sort={sort} onSort={setSort} />
            <SortTh label="จำนวน" k="qty" sort={sort} onSort={setSort} align="right" />
            {isReceive
              ? <SortTh label="ค้างรับ" k="remain" sort={sort} onSort={setSort} align="right" />
              : <SortTh label="ราคา/หน่วย" k="price" sort={sort} onSort={setSort} align="right" />}
            {!isReceive && <SortTh label="สั่งเมื่อ" k="order" sort={sort} onSort={setSort} />}
            <th className="py-1.5 font-medium text-left">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {grows.map((r) => (
            <Fragment key={r.id}>
              <tr className="border-b border-slate-50 hover:bg-slate-50 align-top">
                <td className="py-1.5 pr-2"><Thumb url={r.image_url} size="w-10 h-10" /></td>
                <td className="py-1.5 pr-2 min-w-[140px]">
                  <button type="button" onClick={() => openDetail(r)} className="text-left text-slate-700 hover:text-blue-700 break-words">{r.primary}</button>
                  <div className="flex items-center gap-1.5">
                    {r.code && <span className="text-[10px] font-mono text-slate-400">{r.code}</span>}
                    {(r.missing?.length ?? 0) > 0 && <span className="text-[10px] text-amber-600" title="ข้อมูลไม่ครบ">⚠️</span>}
                  </div>
                </td>
                <td className="py-1.5 pr-2 text-slate-500">{r.seller || "—"}{isReceive ? (r.po_no && <div className="text-[10px] text-slate-400">📄 {r.po_no}</div>) : (r.mo_no && <div className="text-[10px] text-indigo-500">🏭 {r.mo_no}</div>)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap">{(r.qty ?? 0).toLocaleString()} {r.uom}</td>
                {isReceive
                  ? <td className="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap text-blue-700">{(r.remain ?? 0).toLocaleString()}</td>
                  : <td className="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap">{unitStr(r)}</td>}
                {!isReceive && <td className="py-1.5 pr-2 whitespace-nowrap">{r.order_date ? <span className="text-emerald-600">✓ {r.order_date}</span> : <span className="text-slate-300">—</span>}</td>}
                <td className="py-1.5"><Actions r={r} /></td>
              </tr>
              {openOrder === r.id && (
                <tr><td colSpan={isReceive ? 6 : 7} className="pb-2"><OrderEditor r={r} /></td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div ref={panelRef} className="scroll-mt-4 bg-white border border-blue-200 rounded-xl ring-1 ring-blue-100 shadow-sm overflow-hidden">
      {/* หัวแผง: ชื่อ + ปิด */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/70">
        <span className="text-sm font-medium text-slate-800">{data?.title ?? "รายการ"}</span>
        {loading && <span className="text-[11px] text-slate-400">· กำลังโหลด…</span>}
        {!loading && data && <span className="text-[11px] text-slate-400">· {data.rows.length} รายการ</span>}
        <button onClick={onClose} title="ปิดแผง" className="ml-auto w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-200/70 hover:text-slate-600 flex items-center justify-center">✕</button>
      </div>
      <div className="p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาสินค้า / เลขเอกสาร..."
            className="flex-1 min-w-[160px] h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {!fixedSeller && (data?.sellers.length ?? 0) > 1 && (
            <select value={seller} onChange={(e) => setSeller(e.target.value)} className="h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white max-w-[180px]">
              <option value="">ทุกร้าน</option>
              {data?.sellers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {isRich && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
              <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} className="rounded border-slate-300" /> {isReceive ? "🏪 ตามร้านค้า" : "🏭 ตามใบสั่งงาน"}
            </label>
          )}
        </div>

        {/* สลับมุมมอง */}
        {isRich && (
          <div className="inline-flex bg-slate-100 rounded-lg p-0.5 text-xs">
            {([["card", "🗂️ การ์ด"], ["table", "📊 ตาราง"], ["list", "📋 รายการ"]] as [DrillView, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 rounded-md font-medium ${view === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>{l}</button>
            ))}
          </div>
        )}

        {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">{err}</div>}

        {loading && rows.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด...</div>
          : rows.length === 0 ? <div className="py-10 text-center text-sm text-slate-300">— ไม่มีรายการ —</div>
          : (
            <div className="space-y-3 max-h-[55vh] overflow-y-auto">
              {groups.map(([gk, grows]) => (
                <div key={gk || "_"}>
                  {gk && <div className="text-[11px] font-medium text-slate-400 px-1 pb-1 sticky top-0 bg-white z-10">{gk} <span className="text-slate-300">({grows.length})</span></div>}
                  {isRich && view === "card" ? <Cards grows={grows} />
                    : isRich && view === "table" ? <Table grows={grows} />
                    : (
                      <div className="space-y-1">
                        {grows.map((r) => (
                          <div key={r.id}>
                            <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg border border-slate-100 hover:bg-slate-50">
                              <button type="button" onClick={() => isRich ? openDetail(r) : undefined} className={`min-w-0 flex-1 text-left ${isRich ? "hover:text-blue-700" : ""}`}>
                                <div className="text-sm text-slate-700 truncate">{r.primary}{isRich && r.code && <span className="text-[10px] font-mono text-slate-400 ml-1.5">{r.code}</span>}{isRich && (r.missing?.length ?? 0) > 0 && <span className="text-[10px] text-amber-600 ml-1" title="ข้อมูลไม่ครบ">⚠️</span>}</div>
                                <div className="text-[11px] text-slate-400 truncate">{r.secondary}{isWaiting && r.order_date && <span className="text-emerald-600"> · ✓ สั่งแล้ว {r.order_date}</span>}</div>
                              </button>
                              <div className="text-xs text-slate-600 text-right shrink-0 tabular-nums">{r.right}</div>
                              {isRich ? <Actions r={r} />
                                : drill?.type === "unpaid" ? (
                                  <button disabled={busy.has(r.id)} onClick={() => markPaid(r.id)}
                                    className="shrink-0 h-7 px-2.5 text-xs rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">{busy.has(r.id) ? "..." : "💰 จ่ายแล้ว"}</button>
                                ) : null}
                            </div>
                            {isWaiting && <OrderEditor r={r} />}
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}

        {/* เลื่อนหน้า (ของกลาง) */}
        {total > 0 && (
          <div className="pt-1 border-t border-slate-100">
            <Pager page={curPage} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} pageSizes={[10, 20, 50]} unitLabel="รายการ" />
          </div>
        )}

        {data?.link && (
          <div className="text-right">
            <Link href={data.link.href} className="text-sm text-blue-600 hover:underline">{data.link.label} →</Link>
          </div>
        )}
      </div>

      {/* popup รายละเอียด + เติมข้อมูลที่ขาด (กดจากการ์ด/แถว) */}
      {detail && (
        <DetailModal key={detail.id} r={detail} type={drill?.type ?? ""} onClose={() => setDetail(null)}
          onEnrich={enrich} onUpload={uploadCover} onSaveSource2={saveSource2} stores={stores} uploading={uploading} busy={busy.has(detail.id)} />
      )}
    </div>
  );
}

// ---- popup รายละเอียด + เติม/แก้ข้อมูล (readonly+แก้ไข · save กลับ SKU + เอกสาร) ----
const MISS_LABEL: Record<string, string> = { image: "รูป", price: "ราคา", link: "ลิงก์", seller: "ร้านค้า" };
const curTh = (c?: string | null) => isYuan(c) ? "YUAN" : "THB";
const priceStr = (p?: number | null, c?: string | null) => p == null ? "—" : (isYuan(c) ? `¥${p.toLocaleString()}` : `฿${p.toLocaleString()}`);

function DetailModal({ r, type, onClose, onEnrich, onUpload, onSaveSource2, stores, uploading, busy }: {
  r: DrillRow; type: string; onClose: () => void;
  onEnrich: (r: DrillRow, field: string, value: string | number, currency?: string) => Promise<void>;
  onUpload: (r: DrillRow, file: File) => Promise<void>;
  onSaveSource2: (r: DrillRow, s: { seller: string; price: string; currency: string; link: string }) => Promise<void>;
  stores: string[]; uploading: boolean; busy: boolean;
}) {
  const isReceive = type === "pending_receive";
  const storeOpts = stores.map((s) => ({ value: s, label: s }));
  const missing = r.missing ?? [];
  const miss = (f: string) => missing.includes(f);
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [priceDraft, setPriceDraft] = useState(r.unit_price ? String(r.unit_price) : "");
  const [priceCur, setPriceCur] = useState(curTh(r.currency));
  const [linkDraft, setLinkDraft] = useState(r.purchase_url ?? "");
  const [sellerDraft, setSellerDraft] = useState(r.seller ?? "");
  const [s2, setS2] = useState({ seller: r.alt_seller ?? "", price: r.alt_price != null ? String(r.alt_price) : "", currency: curTh(r.alt_currency), link: r.alt_link ?? "" });
  // ลิงก์โชว์เฉพาะของออนไลน์ (Taobao/1688) — เดาจากชื่อร้าน/มีลิงก์อยู่แล้ว
  const looksTaobao = /taobao|tao ?bao|1688/i.test(r.seller ?? "") || !!r.purchase_url;
  const [showLink, setShowLink] = useState(looksTaobao);
  const [showLink2, setShowLink2] = useState(/taobao|tao ?bao|1688/i.test(r.alt_seller ?? "") || !!r.alt_link);
  const fileRef = useRef<HTMLInputElement>(null);
  const box = (on: boolean) => `rounded-lg border p-2.5 ${on ? "border-amber-300 bg-amber-50/60" : "border-slate-100"}`;
  const saveBtn = "h-8 px-3 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50";
  const inEdit = (f: string) => miss(f) || editing.has(f);
  const openEdit = (f: string) => setEditing((s) => new Set(s).add(f));
  const closeEdit = (f: string) => setEditing((s) => { const n = new Set(s); n.delete(f); return n; });
  const hasAlt = !!(r.alt_seller || r.alt_price != null || r.alt_link);
  const EditBtn = ({ f }: { f: string }) => <button onClick={() => openEdit(f)} className="text-xs text-blue-600 hover:underline shrink-0">แก้ไข</button>;
  const Cancel = ({ f }: { f: string }) => !miss(f) ? <button onClick={() => closeEdit(f)} className="text-xs text-slate-500 hover:underline shrink-0">ยกเลิก</button> : null;
  const CurToggle = ({ val, onChange }: { val: string; onChange: (c: string) => void }) => (
    <div className="inline-flex bg-slate-100 rounded-lg p-0.5 text-[11px]">
      {([["THB", "฿ บาท"], ["YUAN", "¥ หยวน"]] as [string, string][]).map(([c, l]) => (
        <button key={c} onClick={() => onChange(c)} className={`px-2 py-0.5 rounded-md ${val === c ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>{l}</button>
      ))}
    </div>
  );
  const savePrice = async () => { await onEnrich(r, "price", Number(priceDraft), priceCur); closeEdit("price"); };
  const saveLink = async () => { await onEnrich(r, "link", linkDraft); closeEdit("link"); };
  const saveSeller = async () => { await onEnrich(r, "seller", sellerDraft); closeEdit("seller"); };
  const pickStore = async (name: string) => { setSellerDraft(name); await onEnrich(r, "seller", name); closeEdit("seller"); setShowLink(true); openEdit("link"); };
  const saveS2 = async () => { await onSaveSource2(r, s2); closeEdit("source2"); };
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-start gap-2 py-1 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 w-24 shrink-0">{label}</span>
      <span className="text-xs text-slate-700 flex-1 min-w-0 break-words">{children}</span>
    </div>
  );
  return (
    <ERPModal open onClose={onClose} size="md" title="รายละเอียด">
      <div className="space-y-3">
        <div className="flex gap-3">
          {r.image_url
            ? <img src={r.image_url} alt="" className="w-24 h-24 rounded-xl object-cover border border-slate-100 shrink-0 bg-slate-50" />
            : <div className="w-24 h-24 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300 shrink-0 text-3xl">📦</div>}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-800 break-words">{r.primary}</div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {r.code && <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{r.code}</span>}
              {r.order_date && !isReceive && <span className="text-[11px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">✓ สั่งแล้ว {r.order_date}</span>}
            </div>
            <div className="text-sm text-slate-800 mt-1.5 tabular-nums">
              {isReceive
                ? <>รับแล้ว {(r.received ?? 0).toLocaleString()}/{(r.qty ?? 0).toLocaleString()} · <span className="text-blue-700 font-medium">ค้าง {(r.remain ?? 0).toLocaleString()} {r.uom}</span></>
                : <>{unitStr(r)}<span className="text-slate-400">/{r.uom || "หน่วย"}</span> × {(r.qty ?? 0).toLocaleString()} = <span className="font-semibold">{baht(r.line_total_thb ?? 0)}</span></>}
            </div>
          </div>
        </div>

        {missing.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            ⚠️ ข้อมูลไม่ครบ: <b>{missing.map((m) => MISS_LABEL[m] ?? m).join(" · ")}</b> — เติมด้านล่าง บันทึกกลับ SKU + เอกสารให้เลย
          </div>
        )}

        {/* ข้อมูลอ่านอย่างเดียว */}
        <div className="rounded-lg border border-slate-100 px-3 py-1.5">
          {isReceive ? <>
            <Row label="ร้านค้า">{r.seller || "—"}</Row>
            <Row label="ใบสั่งซื้อ">{r.po_no || "—"}</Row>
            <Row label="วันสั่ง">{r.order_date || "—"}</Row>
          </> : <>
            <Row label="ผู้ขอ">{r.requester || "—"}</Row>
            {r.mo_no && <Row label="ใบสั่งงาน">🏭 {r.mo_no}</Row>}
            {r.reason && <Row label="เหตุผล">{r.reason}</Row>}
            {r.needed_date && <Row label="ต้องใช้ก่อน">{r.needed_date}</Row>}
            {r.note && <Row label="หมายเหตุ">{r.note}</Row>}
            {r.created_at && <Row label="สร้างเมื่อ">{new Date(r.created_at).toLocaleDateString("th-TH")}</Row>}
          </>}
        </div>

        {/* เติม / แก้ข้อมูล */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-500">เติม / แก้ข้อมูล <span className="font-normal text-slate-400">· บันทึกกลับ SKU {isReceive ? "" : "+ ใบขอซื้อ"}</span></div>

          {/* รูป */}
          <div className={box(miss("image"))}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-600 w-16 shrink-0">🖼 รูป</span>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(r, f); e.target.value = ""; }} />
              <button disabled={uploading} onClick={() => fileRef.current?.click()}
                className="h-8 px-3 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50">{uploading ? "กำลังอัป…" : miss("image") ? "📤 อัปโหลดรูป" : "เปลี่ยนรูป"}</button>
              {miss("image") && <span className="text-[11px] text-amber-600">ยังไม่มีรูป</span>}
            </div>
          </div>

          {/* แหล่งซื้อที่ 1 (หลัก) — การ์ดตาราง ร้าน/ราคา/ลิงก์ */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[11px] font-medium text-slate-500 flex items-center justify-between">
              <span>🛒 แหล่งซื้อที่ 1 (หลัก)</span>
              {(r.missing?.length ?? 0) > 0 && <span className="text-amber-600">⚠️ ยังไม่ครบ</span>}
            </div>
            <div className="divide-y divide-slate-50 text-xs">
              {/* ร้าน */}
              <div className={`flex items-center gap-2 flex-wrap px-3 py-2 ${miss("seller") ? "bg-amber-50/60" : ""}`}>
                <span className="text-slate-500 w-14 shrink-0">🏪 ร้าน</span>
                {isReceive ? <span className="text-slate-700 flex-1 min-w-0 truncate">{r.seller || "—"}</span>
                  : inEdit("seller") ? <>
                    <div className="flex-1 min-w-[120px]"><SearchableSelect value={sellerDraft} options={storeOpts} onChange={setSellerDraft} onCreate={setSellerDraft} placeholder="เลือก / พิมพ์ชื่อร้าน" createLabel="ใช้ร้าน" /></div>
                    <button disabled={busy} onClick={saveSeller} className={saveBtn}>บันทึก</button>
                    <Cancel f="seller" />
                    <div className="w-full flex items-center gap-1.5 mt-1">
                      <span className="text-[11px] text-slate-400">ลัด:</span>
                      <button disabled={busy} onClick={() => pickStore("Tao Bao")} className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 hover:bg-slate-50 disabled:opacity-50">🛒 Taobao</button>
                      <button disabled={busy} onClick={() => pickStore("1688")} className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 hover:bg-slate-50 disabled:opacity-50">1688</button>
                    </div>
                  </> : <>
                    <span className="text-slate-700 flex-1 min-w-0 truncate">{r.seller || "—"}</span>
                    <EditBtn f="seller" />
                  </>}
              </div>
              {/* ราคา */}
              <div className={`flex items-center gap-2 flex-wrap px-3 py-2 ${miss("price") ? "bg-amber-50/60" : ""}`}>
                <span className="text-slate-500 w-14 shrink-0">💰 ราคา</span>
                {inEdit("price") ? <>
                  <input type="number" min={0} value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)}
                    className="h-8 w-24 px-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  <CurToggle val={priceCur} onChange={setPriceCur} />
                  <button disabled={busy || priceDraft === ""} onClick={savePrice} className={saveBtn}>บันทึก</button>
                  <Cancel f="price" />
                </> : <>
                  <span className="text-slate-700 flex-1 tabular-nums">{unitStr(r)} <span className="text-slate-400">/{r.uom || "หน่วย"}</span></span>
                  <EditBtn f="price" />
                </>}
              </div>
              {/* ลิงก์ — ปุ่ม Taobao คุมว่าจะโชว์ช่องลิงก์ไหม */}
              <div className={`flex items-center gap-2 flex-wrap px-3 py-2 ${miss("link") && showLink ? "bg-amber-50/60" : ""}`}>
                <span className="text-slate-500 w-14 shrink-0">🔗 ลิงก์</span>
                <button onClick={() => setShowLink((v) => !v)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border ${showLink ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>🛒 Taobao</button>
                {showLink ? (
                  inEdit("link") ? <>
                    <input type="url" value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} placeholder="Taobao / 1688 / ฯลฯ"
                      className="h-8 flex-1 min-w-[140px] px-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    <button disabled={busy} onClick={saveLink} className={saveBtn}>บันทึก</button>
                    <Cancel f="link" />
                  </> : <>
                    <span className="text-slate-600 flex-1 min-w-0 truncate">{r.purchase_url || "ตั้งไว้ที่ SKU"}</span>
                    {r.purchase_url && <a href={r.purchase_url} target="_blank" rel="noopener" className="text-blue-600 hover:underline shrink-0">เปิด ↗</a>}
                    <EditBtn f="link" />
                  </>
                ) : <span className="text-[11px] text-slate-400">ไม่ใช่ของออนไลน์ — ซ่อนลิงก์ไว้</span>}
              </div>
            </div>
          </div>

          {/* แหล่งซื้อที่ 2 — การ์ด (เก็บบน SKU) */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[11px] font-medium text-slate-500">🛒 แหล่งซื้อที่ 2</div>
            <div className="px-3 py-2">
              {editing.has("source2") ? (
                <div className="space-y-1.5">
                  <SearchableSelect value={s2.seller} options={storeOpts} onChange={(v) => setS2((s) => ({ ...s, seller: v }))} onCreate={(v) => setS2((s) => ({ ...s, seller: v }))} placeholder="เลือก / พิมพ์ชื่อร้านที่ 2" createLabel="ใช้ร้าน" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="number" min={0} value={s2.price} onChange={(e) => setS2((v) => ({ ...v, price: e.target.value }))} placeholder="ราคา"
                      className="h-8 w-24 px-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    <CurToggle val={s2.currency} onChange={(c) => setS2((v) => ({ ...v, currency: c }))} />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setShowLink2((v) => !v)}
                      className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${showLink2 ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>🛒 Taobao</button>
                    {showLink2
                      ? <input type="url" value={s2.link} onChange={(e) => setS2((v) => ({ ...v, link: e.target.value }))} placeholder="ลิงก์ร้านที่ 2"
                          className="h-8 flex-1 min-w-[140px] px-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      : <span className="text-[11px] text-slate-400">ไม่ใช่ของออนไลน์ — ซ่อนลิงก์ไว้</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button disabled={busy} onClick={saveS2} className={saveBtn}>บันทึก</button>
                    <button onClick={() => closeEdit("source2")} className="text-xs text-slate-500 hover:underline">ยกเลิก</button>
                  </div>
                </div>
              ) : hasAlt ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-700 flex-1 min-w-0 truncate">
                    🏪 {r.alt_seller || "—"} · 💰 {priceStr(r.alt_price, r.alt_currency)}
                    {r.alt_link && <a href={r.alt_link} target="_blank" rel="noopener" className="text-blue-600 hover:underline ml-1">🔗 เปิด ↗</a>}
                  </span>
                  <EditBtn f="source2" />
                </div>
              ) : (
                <button onClick={() => openEdit("source2")} className="text-xs text-blue-600 hover:underline">+ เพิ่มแหล่งซื้อที่ 2</button>
              )}
            </div>
          </div>
        </div>

        {isReceive && (
          <div className="text-right">
            <Link href="/purchasing/receive" className="text-sm text-blue-600 hover:underline">ไปหน้ารับของ →</Link>
          </div>
        )}
      </div>
    </ERPModal>
  );
}

// โมดอลตั้งค่ากลุ่ม LINE แจ้งเตือนขอซื้อ — จับ group id (เหมือน china-pay) + บันทึก + ทดสอบ
function LineGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [captured, setCaptured] = useState("");      // group id ล่าสุดที่บอทจับได้
  const [current, setCurrent] = useState("");        // กลุ่มขอซื้อที่ตั้งไว้
  const [input, setInput] = useState("");            // ช่องกรอก/แก้ group id
  const [hasToken, setHasToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    apiFetch("/api/purchasing/line-group").then(r => r.json()).then(j => {
      if (j.error) return;
      setCaptured(j.captured ?? ""); setCurrent(j.current ?? ""); setHasToken(!!j.has_token);
      setInput(j.current || "");
    }).catch(() => {});
  };
  useEffect(() => { if (open) { setMsg(null); load(); } }, [open]);

  const pull = async () => {
    setBusy(true); setMsg(null);
    try {
      const j = await apiFetch("/api/purchasing/line-group").then(r => r.json());
      setCaptured(j.captured ?? "");
      if (j.captured) { setInput(j.captured); setMsg({ ok: true, text: `ได้ Group ID ล่าสุด: ${j.captured}` }); }
      else setMsg({ ok: false, text: "ยังไม่พบ group id — เพิ่มบอทเข้ากลุ่มแล้วพิมพ์อะไรก็ได้ในกลุ่ม 1 ครั้ง แล้วกดดึงอีกที" });
    } finally { setBusy(false); }
  };
  const save = async () => {
    const gid = input.trim(); if (!gid) { setMsg({ ok: false, text: "ยังไม่มี group id" }); return; }
    setBusy(true); setMsg(null);
    try {
      const j = await apiFetch("/api/purchasing/line-group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group_id: gid }) }).then(r => r.json());
      if (j.error) setMsg({ ok: false, text: j.error });
      else { setCurrent(gid); setMsg({ ok: true, text: "บันทึกกลุ่มขอซื้อแล้ว ✅ ทุกใบขอซื้อจะเด้งเข้ากลุ่มนี้" }); }
    } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setMsg(null);
    try {
      const j = await apiFetch("/api/purchasing/line-group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test: true }) }).then(r => r.json());
      setMsg(j.error ? { ok: false, text: j.error } : { ok: true, text: "ส่งข้อความทดสอบเข้ากลุ่มแล้ว ✅ ไปเช็คใน LINE" });
    } finally { setBusy(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} size="md" title="💬 ตั้งค่ากลุ่ม LINE แจ้งเตือนขอซื้อ">
      <div className="space-y-3 text-sm">
        {!hasToken && <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">⚠ ยังไม่ได้ตั้งค่าบอท LINE (โทเคน) — ตั้งที่แอปโอนเงินจีนก่อน</div>}
        <ol className="list-decimal pl-5 space-y-1 text-xs text-slate-600">
          <li>สร้างกลุ่ม LINE (เช่น "แจ้งขอซื้อ") แล้ว<b>เพิ่มบอท</b>เข้ากลุ่ม</li>
          <li>พิมพ์อะไรก็ได้ในกลุ่ม 1 ครั้ง → กดปุ่ม <b>"ดึง Group ID ล่าสุด"</b></li>
          <li>กด <b>บันทึก</b> → เสร็จ! (กด <b>ทดสอบส่ง</b> เพื่อเช็ก)</li>
        </ol>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-slate-600">Group ID กลุ่มขอซื้อ</label>
            {current && <span className="text-[11px] text-emerald-600">● ตั้งไว้แล้ว</span>}
          </div>
          <div className="flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="กดดึง group id ล่าสุด หรือวางเอง"
              className="flex-1 h-9 px-2 text-xs font-mono border border-slate-200 rounded-md" />
            <button onClick={pull} disabled={busy} className="h-9 px-3 text-xs font-medium border border-blue-200 text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap">↻ ดึง Group ID ล่าสุด</button>
          </div>
          {captured && captured !== input && <p className="text-[11px] text-slate-400 mt-1">ล่าสุดที่จับได้: <button onClick={() => setInput(captured)} className="font-mono text-blue-600 underline">{captured}</button></p>}
        </div>
        {msg && <div className={`text-xs p-2 rounded-lg ${msg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>{msg.text}</div>}
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={busy || !input.trim()} className="flex-1 h-10 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">บันทึกกลุ่มขอซื้อ</button>
          <button onClick={test} disabled={busy || !current} className="h-10 px-4 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40">ทดสอบส่ง</button>
        </div>
      </div>
    </ERPModal>
  );
}
