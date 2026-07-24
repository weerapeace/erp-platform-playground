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

function DrillPanel({ drill, onClose }: { drill: { type: string; seller?: string } | null; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<{ title: string; rows: DrillRow[]; sellers: string[]; link: { href: string; label: string } | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [seller, setSeller] = useState("");
  const [groupMo, setGroupMo] = useState(false);
  const [view, setView] = useState<DrillView>("card");      // มุมมองรายการรอซื้อ
  const [reloadKey, setReloadKey] = useState(0);            // กดปุ่มแล้วรีโหลดลิสต์
  const [busy, setBusy] = useState<Set<string>>(new Set());  // แถวที่กำลังทำรายการ
  const [err, setErr] = useState<string | null>(null);
  const [openOrder, setOpenOrder] = useState<string | null>(null);  // แถวที่กำลังกรอก "สั่ง"
  const [orderQty, setOrderQty] = useState("");
  const [openLink, setOpenLink] = useState<string | null>(null);    // แถวที่กำลังใส่ลิงก์
  const [linkUrl, setLinkUrl] = useState("");
  const open = drill !== null;
  const isWaiting = drill?.type === "waiting";
  const fixedSeller = drill?.type === "supplier" ? (drill.seller ?? "") : "";

  useEffect(() => { if (open) { setQ(""); setSeller(""); setGroupMo(false); setView("card"); setData(null); setOpenOrder(null); setOpenLink(null); } }, [open, drill?.type, drill?.seller]);
  // เลื่อนหน้าจอมาที่แผงเมื่อเปิด/สลับการ์ด (โดยเฉพาะเวลากดจากการ์ดด้านล่าง)
  useEffect(() => { if (open) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [open, drill?.type, drill?.seller]);

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

  const startOrder = (r: DrillRow) => { setOpenLink(null); setOpenOrder(r.id); setOrderQty(String(r.qty ?? "")); };
  const confirmOrder = async (r: DrillRow) => {
    await act(r.id, () => apiFetch("/api/purchasing/pr-quick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, mark_ordered: true, qty: orderQty === "" ? null : Number(orderQty) }) }));
    setOpenOrder(null);
  };
  const startLink = (r: DrillRow) => { setOpenOrder(null); setOpenLink(r.id); setLinkUrl(r.purchase_url ?? ""); };
  const confirmLink = async (r: DrillRow, url: string) => {
    await act(r.id, () => apiFetch("/api/purchasing/pr-quick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, purchase_url: url.trim() }) }));
    setOpenLink(null);
  };

  const canGroupMo = isWaiting;
  const rows = data?.rows ?? [];
  const groups = groupMo
    ? Object.entries(rows.reduce((m: Record<string, DrillRow[]>, r) => { const k = r.mo_no || "— ไม่มีใบสั่งงาน —"; (m[k] ??= []).push(r); return m; }, {}))
    : [["", rows] as [string, DrillRow[]]];

  // ---- รูปย่อ + ป้ายรหัส/สั่งแล้ว (ใช้ซ้ำในการ์ด/ตาราง) ----
  const Thumb = ({ url, size }: { url?: string | null; size: string }) => url
    ? <img src={url} alt="" className={`${size} rounded-lg object-cover border border-slate-100 shrink-0 bg-slate-50`} />
    : <div className={`${size} rounded-lg bg-slate-100 flex items-center justify-center text-slate-300 shrink-0`}>📦</div>;

  // ---- ปุ่มจัดการ (อนุมัติ / สั่ง / ลิงก์) ----
  const Actions = ({ r }: { r: DrillRow }) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button disabled={busy.has(r.id)} onClick={() => approve(r.id)}
        className="h-7 px-2.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">{busy.has(r.id) ? "..." : "✓ อนุมัติ"}</button>
      <button disabled={busy.has(r.id)} onClick={() => startOrder(r)}
        className={`h-7 px-2.5 text-xs rounded-lg border ${r.order_date ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-amber-200 text-amber-700 hover:bg-amber-50"}`}>
        {r.order_date ? `✓ สั่งแล้ว ${r.order_date}` : "🛒 สั่ง"}</button>
      {r.purchase_url && <a href={r.purchase_url} target="_blank" rel="noopener" className="h-7 px-2.5 leading-7 text-xs rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50">🔗 เปิดลิงก์ ↗</a>}
      <button disabled={busy.has(r.id)} onClick={() => startLink(r)}
        className="h-7 px-2.5 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">{r.purchase_url ? "แก้ลิงก์" : "🔗 ใส่ลิงก์"}</button>
    </div>
  );

  // ---- แผงกรอก "สั่ง" / "ลิงก์" (โผล่ใต้แถวที่เปิด) ----
  const Editors = ({ r }: { r: DrillRow }) => (<>
    {openOrder === r.id && (
      <div className="mt-2 flex items-center gap-2 flex-wrap bg-amber-50 border border-amber-200 rounded-lg p-2">
        <span className="text-xs text-amber-800">จำนวนที่สั่ง</span>
        <input type="number" min={0} value={orderQty} onChange={(e) => setOrderQty(e.target.value)}
          className="h-7 w-24 px-2 text-xs border border-amber-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400" />
        <span className="text-xs text-slate-500">{r.uom}</span>
        <span className="text-[11px] text-slate-400">· วันสั่ง = วันนี้</span>
        <button disabled={busy.has(r.id)} onClick={() => confirmOrder(r)} className="h-7 px-3 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">ยืนยันสั่ง</button>
        <button onClick={() => setOpenOrder(null)} className="h-7 px-2.5 text-xs text-slate-500 hover:underline">ยกเลิก</button>
      </div>
    )}
    {openLink === r.id && (
      <div className="mt-2 flex items-center gap-2 flex-wrap bg-blue-50 border border-blue-200 rounded-lg p-2">
        <input type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="วางลิงก์ Taobao / 1688 / ฯลฯ"
          className="h-7 flex-1 min-w-[160px] px-2 text-xs border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
        <button disabled={busy.has(r.id)} onClick={() => confirmLink(r, linkUrl)} className="h-7 px-3 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">บันทึก</button>
        {r.purchase_url && <button disabled={busy.has(r.id)} onClick={() => confirmLink(r, "")} className="h-7 px-2.5 text-xs text-rose-600 hover:underline">ล้าง</button>}
        <button onClick={() => setOpenLink(null)} className="h-7 px-2.5 text-xs text-slate-500 hover:underline">ยกเลิก</button>
      </div>
    )}
  </>);

  // ---- การ์ด (รูป + รหัส + เหตุผล + MO + ราคา/หน่วย + วันสั่ง + ปุ่ม) ----
  const Cards = ({ grows }: { grows: DrillRow[] }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {grows.map((r) => (
        <div key={r.id} className={`rounded-xl border p-3 ${r.order_date ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"}`}>
          <div className="flex gap-3">
            <Thumb url={r.image_url} size="w-14 h-14" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium text-slate-800 leading-snug break-words">{r.primary}</div>
                {r.order_date && <span className="shrink-0 text-[10px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">✓ สั่งแล้ว</span>}
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {r.code && <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{r.code}</span>}
                {r.mo_no && <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">🏭 {r.mo_no}</span>}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 truncate">🏪 {r.seller || "—"} · {r.requester || "—"}</div>
              {r.reason && <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">📝 {r.reason}</div>}
              <div className="text-xs text-slate-700 mt-1 tabular-nums">
                {unitStr(r)}<span className="text-slate-400">/{r.uom || "หน่วย"}</span> × {(r.qty ?? 0).toLocaleString()} = <span className="font-medium">{baht(r.line_total_thb ?? 0)}</span>
                {isYuan(r.currency) && <span className="text-slate-400"> (แปลงบาท)</span>}
              </div>
            </div>
          </div>
          <div className="mt-2"><Actions r={r} /></div>
          <Editors r={r} />
        </div>
      ))}
    </div>
  );

  // ---- ตาราง (โชว์รูป + รหัส) ----
  const Table = ({ grows }: { grows: DrillRow[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-[11px] text-slate-400 border-b border-slate-100 text-left">
            <th className="py-1.5 pr-2 font-medium">รูป</th>
            <th className="py-1.5 pr-2 font-medium">ชื่อ / รหัส</th>
            <th className="py-1.5 pr-2 font-medium">ร้าน · MO</th>
            <th className="py-1.5 pr-2 font-medium text-right">จำนวน</th>
            <th className="py-1.5 pr-2 font-medium text-right">ราคา/หน่วย</th>
            <th className="py-1.5 pr-2 font-medium">สั่งเมื่อ</th>
            <th className="py-1.5 font-medium">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {grows.map((r) => (
            <Fragment key={r.id}>
              <tr className="border-b border-slate-50 hover:bg-slate-50 align-top">
                <td className="py-1.5 pr-2"><Thumb url={r.image_url} size="w-10 h-10" /></td>
                <td className="py-1.5 pr-2 min-w-[140px]">
                  <div className="text-slate-700 break-words">{r.primary}</div>
                  {r.code && <div className="text-[10px] font-mono text-slate-400">{r.code}</div>}
                </td>
                <td className="py-1.5 pr-2 text-slate-500">{r.seller || "—"}{r.mo_no && <div className="text-[10px] text-indigo-500">🏭 {r.mo_no}</div>}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap">{(r.qty ?? 0).toLocaleString()} {r.uom}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap">{unitStr(r)}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap">{r.order_date ? <span className="text-emerald-600">✓ {r.order_date}</span> : <span className="text-slate-300">—</span>}</td>
                <td className="py-1.5"><Actions r={r} /></td>
              </tr>
              {(openOrder === r.id || openLink === r.id) && (
                <tr><td colSpan={7} className="pb-2"><Editors r={r} /></td></tr>
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
          {canGroupMo && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
              <input type="checkbox" checked={groupMo} onChange={(e) => setGroupMo(e.target.checked)} className="rounded border-slate-300" /> 🏭 ตามใบสั่งงาน
            </label>
          )}
        </div>

        {/* สลับมุมมอง (เฉพาะรายการรอซื้อ) */}
        {isWaiting && (
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
                  {isWaiting && view === "card" ? <Cards grows={grows} />
                    : isWaiting && view === "table" ? <Table grows={grows} />
                    : (
                      <div className="space-y-1">
                        {grows.map((r) => (
                          <div key={r.id}>
                            <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg border border-slate-100 hover:bg-slate-50">
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-slate-700 truncate">{r.primary}{isWaiting && r.code && <span className="text-[10px] font-mono text-slate-400 ml-1.5">{r.code}</span>}</div>
                                <div className="text-[11px] text-slate-400 truncate">{r.secondary}{isWaiting && r.order_date && <span className="text-emerald-600"> · ✓ สั่งแล้ว {r.order_date}</span>}</div>
                              </div>
                              <div className="text-xs text-slate-600 text-right shrink-0 tabular-nums">{r.right}</div>
                              {isWaiting && <Actions r={r} />}
                              {drill?.type === "pending_receive" && (
                                <Link href="/purchasing/receive" className="shrink-0 h-7 px-2.5 leading-7 text-xs rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50">รับของ →</Link>
                              )}
                              {drill?.type === "unpaid" && (
                                <button disabled={busy.has(r.id)} onClick={() => markPaid(r.id)}
                                  className="shrink-0 h-7 px-2.5 text-xs rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">{busy.has(r.id) ? "..." : "💰 จ่ายแล้ว"}</button>
                              )}
                            </div>
                            {isWaiting && <Editors r={r} />}
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}

        {data?.link && (
          <div className="pt-1 text-right border-t border-slate-100">
            <Link href={data.link.href} className="text-sm text-blue-600 hover:underline">{data.link.label} →</Link>
          </div>
        )}
      </div>
    </div>
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
