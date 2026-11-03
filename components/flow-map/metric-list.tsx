"use client";

/**
 * แผนผังการทำงาน — กดตัวเลขสดแล้วเห็นรายการเบื้องหลัง (ป๊อปกลาง ERPModal + ตารางกลาง MiniTable)
 * ข้อมูลจาก /api/flow-map/list (เงื่อนไขชุดเดียวกับตัวนับ) · ปุ่ม "เปิด" ไปหน้าเอกสาร (?open= ถ้าหน้านั้นรองรับ)
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { ERPModal } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { FLOW_METRICS, type FlowMetricKey } from "@/lib/flow-map";
import type { FlowMetricRow } from "@/app/api/flow-map/metrics";

const STOCK_METRICS: FlowMetricKey[] = ["stock_raw", "stock_wip", "stock_fg", "fg_reserved"];
const fmtNum = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

export function FlowMetricListModal({ metric, onClose }: { metric: FlowMetricKey | null; onClose: () => void }) {
  const t = useT();
  const [rows, setRows] = useState<FlowMetricRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async (key: FlowMetricKey) => {
    setRows(null); setErr(null);
    try {
      const r = await apiFetch(`/api/flow-map/list?metric=${encodeURIComponent(key)}`);
      const j = await r.json();
      if (!r.ok || j?.error) throw new Error(j?.error || "โหลดรายการไม่สำเร็จ");
      setRows((j.rows ?? []) as FlowMetricRow[]); setTotal(Number(j.total) || 0);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดรายการไม่สำเร็จ"); setRows([]); }
  }, []);
  useEffect(() => { if (metric) void load(metric); }, [metric, load]);
  if (!metric) return null;
  const m = FLOW_METRICS[metric];
  const isStock = STOCK_METRICS.includes(metric);
  const cols: MiniColumn<FlowMetricRow>[] = [
    { key: "no", header: isStock ? t("รหัสสินค้า", "SKU") : t("เลขที่", "No."), width: "9rem", sortValue: (r) => r.no, cell: (r) => <span className="font-mono text-[12px] text-slate-700">{r.no}</span> },
    { key: "sub", header: t("รายละเอียด", "Detail"), width: "1fr", cell: (r) => <span className="text-[12px] text-slate-700">{r.sub}</span> },
    ...(isStock ? [] : [{ key: "date", header: t("วันที่", "Date"), width: "6.5rem", sortValue: (r: FlowMetricRow) => r.date ?? "", cell: (r: FlowMetricRow) => <span className="text-[12px] text-slate-500 tabular-nums">{r.date ? new Date(`${r.date}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—"}</span> } as MiniColumn<FlowMetricRow>]),
    { key: "status", header: t("สถานะ", "Status"), width: "6rem", cell: (r) => <span className={`text-[11px] ${r.status === "ติดลบ" ? "text-red-600" : "text-slate-500"}`}>{r.status || "—"}</span> },
    { key: "open", header: "", width: "4.5rem", cell: (r) => <Link href={r.href} target="_blank" className="text-[12px] text-indigo-600 hover:underline">{t("เปิด", "Open")} ↗</Link> },
  ];
  return (
    <ERPModal open onClose={onClose} size="lg" title={m.label}
      description={rows == null ? undefined : isStock
        ? t(`ยอดรวม ${fmtNum(total)} ${m.unit} · แสดงสินค้าที่ยอดมาก/ติดลบมากสุด ${rows.length} ตัว`, `Total ${fmtNum(total)} · top ${rows.length} SKUs`)
        : t(`ทั้งหมด ${fmtNum(total)} ${m.unit}${rows.length < total ? ` · แสดง ${rows.length} รายการล่าสุด` : ""}`, `${fmtNum(total)} total`)}>
      {rows == null ? <LoadingState />
        : err ? <ErrorState title={err} onRetry={() => void load(metric)} />
        : rows.length === 0 ? <EmptyState title={t("ไม่มีรายการ — ตัวเลขนี้เป็น 0 แล้ว", "Nothing here")} />
        : <MiniTable rows={rows} columns={cols} rowKey={(r) => r.id} searchText={(r) => `${r.no} ${r.sub}`} dense />}
    </ERPModal>
  );
}
