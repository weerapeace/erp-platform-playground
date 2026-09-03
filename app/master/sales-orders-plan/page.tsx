"use client";

/**
 * 🧾 ใบสั่งขาย (มุมของฝ่ายผลิต) — /master/sales-orders-plan
 *
 * ฝ่ายผลิตต้องรู้ว่า "ขายอะไรไปแล้วบ้าง ต้องส่งวันไหน" แต่ไม่ต้องแก้ใบขาย
 * หน้านี้จึงเป็น "ดูอย่างเดียว" 2 มุมมอง — กดใบไหนก็เด้งไปเปิดใบนั้นในหน้าใบขายจริง (ไม่ทำป๊อปซ้ำ)
 *   ▦ ตาราง  — ค้นหา/เรียง/จัดกลุ่มตามสถานะ (ของกลาง MiniTable)
 *   📅 ปฏิทิน — วางใบตามกำหนดส่ง (ไม่มีกำหนดส่ง = ใช้วันที่สั่ง) เห็นภาระงานรายวัน
 *
 * ของกลาง: MiniTable · useViewPref (จำมุมมองต่อคน) · lib/so-status · openLink (?open=<id>) · usePermission
 * ข้อมูล: /api/sales-orders (ตัวเดียวกับหน้าใบขาย — ไม่ได้ทำ API ใหม่)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { usePermission, AccessDenied } from "@/components/auth";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { useViewPref } from "@/lib/use-view-pref";
import { openLink } from "@/lib/open-param";
import { soStatusLabel, soStatusColor, SO_STATUS_ORDER } from "@/lib/so-status";
import { SoCalendar } from "./so-calendar";
import type { SOListItem } from "@/app/api/sales-orders/route";

const money = (n: number) => "฿" + (Math.round(n) || 0).toLocaleString("th-TH");
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const dayText = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "—");

export default function SalesOrdersPlanPage() {
  const canView = usePermission("so.view");
  const [rows, setRows] = useState<SOListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("");          // "" = ทุกสถานะ
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const { view, setView, defaultView, saveDefault } = useViewPref("so_plan_view", ["table", "calendar"] as const, "table");

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await apiFetch("/api/sales-orders?limit=500");
      const j = await r.json();
      if (j?.error) throw new Error(j.error);
      setRows((j.data ?? []) as SOListItem[]);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดใบสั่งขายไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) void load(); }, [canView, load]);

  const list = useMemo(() => rows.filter((o) => !status || o.status === status), [rows, status]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? list.filter((o) => `${o.so_number ?? ""} ${o.customer_name ?? ""} ${o.customer_code ?? ""}`.toLowerCase().includes(q)) : list;
  }, [list, search]);

  // จำนวนใบต่อสถานะ (ปุ่มกรองด้านบน)
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of rows) m.set(o.status, (m.get(o.status) ?? 0) + 1);
    return m;
  }, [rows]);
  const noShipDate = useMemo(() => rows.filter((o) => !o.expected_ship_date).length, [rows]);

  const cols: MiniColumn<SOListItem>[] = [
    { key: "so", header: "เลขที่ใบขาย", width: "10rem", sortValue: (o) => o.so_number ?? "", sortLabel: "เลขที่ใบขาย",
      cell: (o) => <span className="font-mono text-[12px] font-semibold text-slate-700">{o.so_number ?? "—"}</span> },
    { key: "cust", header: "ลูกค้า", width: "minmax(12rem,1.6fr)", sortValue: (o) => o.customer_name ?? "", sortLabel: "ลูกค้า",
      cell: (o) => <div className="min-w-0"><div className="text-sm text-slate-700 truncate">{o.customer_name ?? "—"}</div>
        {o.sale_person_name && <div className="text-[10px] text-slate-400 truncate">ผู้ขาย {o.sale_person_name}</div>}</div> },
    { key: "order", header: "วันที่สั่ง", width: "7rem", align: "center", sortValue: (o) => o.order_date ?? "", sortLabel: "วันที่สั่ง",
      cell: (o) => <span className="text-[12px] text-slate-500">{dayText(o.order_date)}</span> },
    { key: "ship", header: "กำหนดส่ง", width: "7rem", align: "center", sortValue: (o) => o.expected_ship_date ?? "9999", sortLabel: "กำหนดส่ง",
      cell: (o) => o.expected_ship_date
        ? <span className="text-[12px] font-medium text-indigo-700">{dayText(o.expected_ship_date)}</span>
        : <span className="text-[10px] text-amber-600">ยังไม่ระบุ</span> },
    { key: "lines", header: "รายการ", width: "5rem", align: "right", sortValue: (o) => o.line_count, sortLabel: "จำนวนรายการ",
      cell: (o) => <span className="tabular-nums text-slate-600">{fmt(o.line_count)}</span> },
    { key: "total", header: "ยอดรวม", width: "8rem", align: "right", sortValue: (o) => o.grand_total, sortLabel: "ยอดรวม",
      cell: (o) => <span className="tabular-nums text-slate-700">{money(o.grand_total)}</span> },
    { key: "status", header: "สถานะ", width: "7rem", align: "center", sortValue: (o) => soStatusLabel(o.status), sortLabel: "สถานะ",
      cell: (o) => <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap text-white" style={{ backgroundColor: soStatusColor(o.status) }}>{soStatusLabel(o.status)}</span> },
  ];

  if (!canView) return <AccessDenied message="คุณยังไม่มีสิทธิ์ดูใบสั่งขาย (so.view) — ให้แอดมินเปิดสิทธิ์ให้ที่หน้าจัดการสิทธิ์" />;

  return (
    <div className="max-w-[1500px] mx-auto px-5 py-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">🧾 ใบสั่งขาย</h1>
          <p className="text-sm text-slate-500 mt-0.5">ดูว่าขายอะไรไปแล้ว ต้องส่งวันไหน — กดใบไหนก็เปิดใบขายใบนั้นได้เลย (หน้านี้ดูอย่างเดียว ไม่แก้ใบขาย)</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setView("table")} className={`px-3 py-1.5 rounded-md text-sm font-medium ${view === "table" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>▦ ตาราง</button>
            <button onClick={() => setView("calendar")} className={`px-3 py-1.5 rounded-md text-sm font-medium ${view === "calendar" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>📅 ปฏิทิน</button>
          </div>
          <button onClick={() => void saveDefault(view)} title={defaultView === view ? "มุมมองนี้เป็นค่าเริ่มต้นของคุณแล้ว" : "ตั้งมุมมองนี้เป็นค่าเริ่มต้นเมื่อเปิดหน้า (เฉพาะคุณ)"}
            className={`h-9 px-2.5 text-sm rounded-lg border ${defaultView === view ? "border-amber-300 bg-amber-50 text-amber-600" : "border-slate-200 text-slate-400 hover:bg-slate-50"}`}>{defaultView === view ? "⭐" : "☆"}</button>
          <button onClick={() => void load()} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">⟳</button>
          <a href="/sales-orders" className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">เปิดหน้าใบขาย ↗</a>
        </div>
      </div>

      {/* กรองตามสถานะ — กดปุ่มเดียว ไม่ต้องเปิด dropdown */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setStatus("")} className={`h-8 px-3 text-sm rounded-lg border ${status === "" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>ทั้งหมด ({rows.length})</button>
        {SO_STATUS_ORDER.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => (
          <button key={s} onClick={() => setStatus(status === s ? "" : s)}
            className={`h-8 px-3 text-sm rounded-lg border ${status === s ? "text-white border-transparent" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            style={status === s ? { backgroundColor: soStatusColor(s) } : undefined}>
            {soStatusLabel(s)} ({counts.get(s)})
          </button>
        ))}
        {noShipDate > 0 && (
          <span className="ml-auto text-[11px] text-amber-600" title="ใบที่ยังไม่ใส่กำหนดส่ง ปฏิทินจะวางไว้ตามวันที่สั่งแทน">
            ⚠️ {noShipDate} ใบยังไม่ได้ใส่กำหนดส่ง — ปฏิทินวางตามวันที่สั่งให้ก่อน
          </span>
        )}
      </div>

      {loading ? <div className="text-center py-20 text-slate-400 text-sm">กำลังโหลด…</div>
        : err ? (
        <div className="text-center py-16">
          <div className="text-3xl mb-2">⚠️</div>
          <p className="text-slate-700 font-medium">โหลดใบสั่งขายไม่สำเร็จ</p>
          <p className="text-slate-400 text-sm mt-1">{err}</p>
          <button onClick={() => void load()} className="mt-4 h-9 px-4 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700">↻ ลองใหม่</button>
        </div>
      ) : view === "table" ? (
        <MiniTable
          rows={shown} rowKey={(o) => o.id} columns={cols}
          title="🧾 ใบสั่งขาย" countUnit="ใบ"
          onRowClick={(o) => { window.location.href = openLink("/sales-orders", o.id); }}
          searchText={(o) => `${o.so_number ?? ""} ${o.customer_name ?? ""} ${o.customer_code ?? ""} ${o.sale_person_name ?? ""}`}
          searchPlaceholder="ค้นหา เลขที่ใบขาย / ลูกค้า"
          searchValue={search} onSearchChange={setSearch}
          groupBy={(o) => soStatusLabel(o.status)} groupLabel="จัดกลุ่มตามสถานะ" defaultGrouped={false}
          emptyText="ยังไม่มีใบสั่งขาย"
          footnote="กดแถวเพื่อเปิดใบขายใบนั้น"
        />
      ) : (
        <SoCalendar rows={shown} cursor={cursor} onCursor={setCursor} />
      )}
    </div>
  );
}
