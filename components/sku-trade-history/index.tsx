"use client";

/**
 * SkuTradeHistory — ของกลาง: แท็บ "📜 ประวัติซื้อ-ขาย" ในหน้า SKU
 *
 * บนสุด = สรุป (ซื้อไปกี่ชิ้น/กี่ใบ · ราคาซื้อล่าสุด · ขายไปกี่ชิ้น/กี่ใบ · ราคาขายล่าสุด)
 * ตาราง 1 = ประวัติซื้อ: ใบสั่งซื้อ (PO) + ใบขอซื้อที่ยังไม่ออก PO
 * ตาราง 2 = ประวัติขาย: ใบขาย (บิล) + ใบเสนอราคา
 * กดเลขใบ = เปิดใบนั้นในแท็บใหม่ (ลิงก์กลาง openLink)
 *
 * ใช้ที่: MasterRecordDrawer (moduleKey=skus-v2) และหน้า /master/skus
 * ของกลางที่ใช้: MiniTable · apiFetch · formatAmount · soStatusLabel · openLink
 * สิทธิ์: ราคาซื้อโชว์เฉพาะคนมี products.cost.view (server ตัดให้ — ฝั่งนี้แค่ซ่อนคอลัมน์)
 */

import { useCallback, useEffect, useState } from "react";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { soStatusLabel, soStatusColor } from "@/lib/so-status";
import { openLink } from "@/lib/open-link";
import type { TradeRow, TradeSummary } from "@/app/api/sku-trade-history/route";

const KIND: Record<TradeRow["kind"], { label: string; cls: string; path: string | null }> = {
  po:    { label: "ใบสั่งซื้อ",   cls: "bg-indigo-50 text-indigo-700 border-indigo-100", path: "/purchasing/po-list" },
  pr:    { label: "ใบขอซื้อ",     cls: "bg-amber-50 text-amber-700 border-amber-100",   path: null },
  so:    { label: "ใบขาย",       cls: "bg-emerald-50 text-emerald-700 border-emerald-100", path: "/sales-orders" },
  quote: { label: "ใบเสนอราคา", cls: "bg-sky-50 text-sky-700 border-sky-100",         path: "/quotations" },
};
// สถานะฝั่งซื้อ (PO/PR) — ป้ายไทยสั้น ๆ
const BUY_STATUS: Record<string, string> = {
  draft: "ร่าง", purchase: "สั่งซื้อแล้ว", partial: "รับบางส่วน", done: "รับครบ", cancelled: "ยกเลิก",
  waiting: "รออนุมัติ", approved: "อนุมัติแล้ว", rfq_created: "ออกใบสั่งซื้อแล้ว", rejected: "ไม่อนุมัติ",
};
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—";
const fmtQty = (n: number | null) => n == null ? "—" : n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const fmtMoney = (n: number | null, cur: string | null) => n == null ? "—" : formatAmount(n, cur ?? "THB");

export function SkuTradeHistory({ skuId }: { skuId: string }) {
  const [purchases, setPurchases] = useState<TradeRow[]>([]);
  const [sales, setSales] = useState<TradeRow[]>([]);
  const [summary, setSummary] = useState<TradeSummary | null>(null);
  const [costAllowed, setCostAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch(`/api/sku-trade-history?sku_id=${encodeURIComponent(skuId)}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setPurchases(j.purchases ?? []); setSales(j.sales ?? []); setSummary(j.summary ?? null); setCostAllowed(j.cost_allowed === true);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดประวัติไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [skuId]);
  useEffect(() => { void load(); }, [load]);

  const docCell = (r: TradeRow) => {
    const k = KIND[r.kind];
    const href = k.path && r.doc_id ? openLink(k.path, r.doc_id) : null;
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${k.cls}`}>{k.label}</span>
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-medium text-blue-600 hover:underline truncate" title="เปิดใบนี้ (แท็บใหม่)">{r.doc_no ?? "—"} ↗</a>
          : <span className="text-[12.5px] font-medium text-slate-700 truncate">{r.doc_no ?? "—"}</span>}
      </div>
    );
  };
  const statusCell = (r: TradeRow, side: "buy" | "sell") => {
    if (!r.status) return <span className="text-slate-400">—</span>;
    if (side === "sell") return <span className="text-[11px] px-1.5 py-0.5 rounded text-white" style={{ background: soStatusColor(r.status) }}>{soStatusLabel(r.status)}</span>;
    return <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{BUY_STATUS[r.status] ?? r.status}</span>;
  };
  const baseCols = (side: "buy" | "sell", showPrice: boolean): MiniColumn<TradeRow>[] => [
    { key: "doc", header: "เอกสาร", width: "1.6fr", sortValue: (r) => r.doc_no ?? "", sortLabel: "เลขที่", cell: docCell },
    { key: "date", header: "วันที่", width: "6.5rem", sortValue: (r) => r.date ?? "", sortLabel: "วันที่", cell: (r) => <span className="text-[12px] text-slate-600 tabular-nums">{fmtDate(r.date)}</span> },
    { key: "partner", header: side === "buy" ? "ร้าน" : "ลูกค้า", width: "1.4fr", sortValue: (r) => r.partner ?? "", cell: (r) => <span className="text-[12px] text-slate-700 truncate block" title={r.partner ?? ""}>{r.partner ?? "—"}</span> },
    { key: "qty", header: "จำนวน", align: "right", width: "6rem", sortValue: (r) => r.qty ?? 0, sortLabel: "จำนวน", cell: (r) => <span className="tabular-nums text-[12.5px]">{fmtQty(r.qty)} <span className="text-[11px] text-slate-400">{r.uom ?? ""}</span></span> },
    ...(showPrice ? [
      { key: "price", header: "ราคา/หน่วย", align: "right", width: "7rem", sortValue: (r) => r.price ?? 0, sortLabel: "ราคา", cell: (r) => <span className="tabular-nums text-[12.5px]">{fmtMoney(r.price, r.currency)}</span> } as MiniColumn<TradeRow>,
      { key: "total", header: "รวม", align: "right", width: "7rem", sortValue: (r) => r.total ?? 0, sortLabel: "รวม", cell: (r) => <span className="tabular-nums text-[12.5px] text-slate-700">{fmtMoney(r.total, r.currency)}</span> } as MiniColumn<TradeRow>,
    ] : []),
    { key: "status", header: "สถานะ", width: "7rem", sortValue: (r) => r.status ?? "", cell: (r) => statusCell(r, side) },
    { key: "extra", header: "", width: "8rem", cell: (r) => <span className="text-[11px] text-slate-400 truncate block" title={r.extra ?? ""}>{r.extra ?? ""}</span> },
  ];

  if (loading) return <div className="text-xs text-slate-400 py-2">กำลังโหลดประวัติซื้อ-ขาย…</div>;
  if (err) return <div className="text-xs text-rose-600 py-2">⚠ {err} <button onClick={() => void load()} className="underline ml-1">ลองใหม่</button></div>;

  return (
    <div className="space-y-4">
      {/* สรุป */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="ซื้อแล้ว" value={`${fmtQty(summary.buy_qty)} ชิ้น`} sub={`${summary.buy_docs} ใบสั่งซื้อ`} tone="indigo" />
          <Stat label="ราคาซื้อล่าสุด" value={costAllowed ? (summary.last_buy ? formatAmount(summary.last_buy.price, summary.last_buy.currency) : "—") : "🔒"} sub={costAllowed ? (summary.last_buy?.date ? fmtDate(summary.last_buy.date) : "ยังไม่มี PO") : "ไม่มีสิทธิ์ดูต้นทุน"} tone="indigo" />
          <Stat label="ขายแล้ว" value={`${fmtQty(summary.sell_qty)} ชิ้น`} sub={`${summary.sell_docs} ใบขาย`} tone="emerald" />
          <Stat label="ราคาขายล่าสุด" value={summary.last_sell ? formatAmount(summary.last_sell.price, "THB") : "—"} sub={summary.last_sell?.date ? fmtDate(summary.last_sell.date) : "ยังไม่มีใบขาย"} tone="emerald" />
        </div>
      )}

      {/* ซื้อ */}
      {purchases.length === 0
        ? <p className="text-[12.5px] text-slate-500 rounded-lg border border-slate-150 bg-slate-50/60 px-3 py-2.5">🛒 <span className="font-medium">ประวัติซื้อ</span> — ยังไม่เคยมีใบสั่งซื้อ/ใบขอซื้อของสินค้าตัวนี้</p>
        : <MiniTable rows={purchases} rowKey={(r) => r.id} columns={baseCols("buy", costAllowed)}
            title={<span className="text-[13px] font-medium text-slate-700">🛒 ประวัติซื้อ</span>} countUnit="รายการ"
            searchText={(r) => `${r.doc_no ?? ""} ${r.partner ?? ""} ${r.status ?? ""}`} searchPlaceholder="ค้นหาเลขใบ / ร้าน…"
            dense maxHeightClass="max-h-[320px]"
            footnote={costAllowed ? "ใบสั่งซื้อ (PO) ทุกสถานะ + ใบขอซื้อที่ยังไม่ออก PO · ราคาเป็นสกุลเงินตามใบ" : "ราคาซื้อซ่อนไว้ — ต้องมีสิทธิ์ดูต้นทุน (products.cost.view)"} />}

      {/* ขาย */}
      {sales.length === 0
        ? <p className="text-[12.5px] text-slate-500 rounded-lg border border-slate-150 bg-slate-50/60 px-3 py-2.5">🧾 <span className="font-medium">ประวัติขาย</span> — ยังไม่เคยมีใบขาย/ใบเสนอราคาของสินค้าตัวนี้</p>
        : <MiniTable rows={sales} rowKey={(r) => r.id} columns={baseCols("sell", true)}
            title={<span className="text-[13px] font-medium text-slate-700">🧾 ประวัติขาย</span>} countUnit="รายการ"
            searchText={(r) => `${r.doc_no ?? ""} ${r.partner ?? ""} ${r.status ?? ""} ${r.extra ?? ""}`} searchPlaceholder="ค้นหาเลขใบ / ลูกค้า…"
            dense maxHeightClass="max-h-[320px]"
            footnote="ใบขาย (บิล) ทุกสถานะ + ใบเสนอราคา · ยอดสรุปด้านบนนับเฉพาะใบขายที่ไม่ใช่ร่าง/ยกเลิก" />}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "indigo" | "emerald" }) {
  const cls = tone === "indigo" ? "border-indigo-100 bg-indigo-50/60" : "border-emerald-100 bg-emerald-50/60";
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-[15px] font-semibold text-slate-800 tabular-nums truncate" title={value}>{value}</div>
      <div className="text-[11px] text-slate-400 truncate">{sub}</div>
    </div>
  );
}
