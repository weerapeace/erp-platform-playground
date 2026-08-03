"use client";

/**
 * รายการใบสั่งซื้อ (PO) — /purchasing/po-list
 *
 * ทำไมต้องมี: เดิมสร้าง PO แล้วพิมพ์ได้เฉพาะตอนนั้น พอซัพโทรมาขอใบย้อนหลังจะหาไม่เจอ
 * (มีตารางกลาง /m/purchase-orders-v2 อยู่ แต่ไม่มีเมนู และไม่มีปุ่มพิมพ์/ส่งไลน์)
 *
 * ใช้ของกลาง: DataTable (ค้นหา/กรอง/เรียง/export/มุมมอง) · PoDetailModal · ERPModal
 * ปุ่ม "เปิด PO ใหม่" = สร้างเองไม่ต้องผ่านใบขอซื้อ → POST /api/purchasing/po-manual
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable, type RowAction } from "@/components/data-table";
import { PoDetailModal } from "@/components/po-detail-modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import type { PoListRow } from "@/app/api/purchasing/po-list/route";
import { PoCreateModal } from "./create-modal";

const isCNY = (c: unknown) => ["RMB", "YUAN", "CNY"].includes(String(c ?? "").toUpperCase());
const curSym = (c: unknown) => (isCNY(c) ? "¥" : "฿");
const curLabel = (c: unknown) => (isCNY(c) ? "RMB" : String(c ?? "THB").toUpperCase());
const money = (n: number, c: unknown) => `${curSym(c)}${Math.round(Number(n) || 0).toLocaleString("th-TH")}`;
const thDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—";

/** เหลืออีกกี่วันถึงกำหนดจ่าย (ติดลบ = เลยกำหนด) */
const daysTo = (iso: string | null) => {
  if (!iso) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
};

const RECEIVE_TONE: Record<string, string> = {
  "ร่าง": "bg-slate-100 text-slate-600",
  "รอรับของ": "bg-blue-50 text-blue-700",
  "รับบางส่วน": "bg-amber-50 text-amber-700",
  "รับครบแล้ว": "bg-emerald-50 text-emerald-700",
  "ยกเลิก": "bg-rose-50 text-rose-700",
};

export default function PoListPage() {
  const toast = useToast();
  const [rows, setRows] = useState<PoListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/purchasing/po-list");
      const json = (await res.json()) as { data?: PoListRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "โหลดไม่สำเร็จ");
      setRows(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  const printPo = useCallback((r: PoListRow) => {
    window.open(`/print/purchase-order/${r.id}`, "_blank", "noopener");
  }, []);

  /** ข้อความส่งซัพทางไลน์ — ภาษาไทย ตามที่เจ้าของเลือก */
  const shareLine = useCallback((r: PoListRow) => {
    const text = [
      `🧾 ใบสั่งซื้อ ${r.po_no}`,
      `🏪 ${r.seller ?? "—"}`,
      `📅 วันที่สั่ง ${thDate(r.order_date)}`,
      `📦 ${r.line_count} รายการ`,
      `💰 ยอดรวม ${money(r.grand_total, r.currency)} ${curLabel(r.currency)}`,
      r.expected_date ? `🚚 กำหนดของเข้า ${thDate(r.expected_date)}` : "",
    ].filter(Boolean).join("\n");
    window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }, []);

  const copyText = useCallback(async (r: PoListRow) => {
    try {
      await navigator.clipboard.writeText(
        `ใบสั่งซื้อ ${r.po_no} · ${r.seller ?? "—"} · ${r.line_count} รายการ · ${money(r.grand_total, r.currency)} ${curLabel(r.currency)}`,
      );
      toast.success("คัดลอกแล้ว");
    } catch { toast.error("คัดลอกไม่ได้"); }
  }, [toast]);

  const columns = useMemo<ColumnDef<PoListRow>[]>(() => [
    {
      accessorKey: "po_no", header: "เลขที่", size: 130,
      cell: ({ getValue }) => <span className="font-mono text-sm font-semibold text-slate-800">{getValue() as string}</span>,
    },
    {
      accessorKey: "seller", header: "ร้าน / ผู้จำหน่าย", size: 200,
      cell: ({ getValue }) => <span className="text-sm text-slate-700">{(getValue() as string) || "—"}</span>,
    },
    {
      accessorKey: "order_date", header: "วันที่สั่ง", size: 100,
      cell: ({ getValue }) => <span className="text-sm text-slate-600">{thDate(getValue() as string | null)}</span>,
    },
    {
      accessorKey: "receive_label", header: "สถานะรับของ", size: 120, meta: { filterType: "select" },
      cell: ({ getValue, row }) => {
        const v = getValue() as string;
        return (
          <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${RECEIVE_TONE[v] ?? "bg-slate-100 text-slate-600"}`}>
            {v}
            {row.original.line_count > 0 && v === "รับบางส่วน" && (
              <span className="ml-1 opacity-70">{row.original.received_lines}/{row.original.line_count}</span>
            )}
          </span>
        );
      },
    },
    {
      accessorKey: "payment_status", header: "จ่ายเงิน", size: 110, meta: { filterType: "select" },
      cell: ({ getValue, row }) => (getValue() === "paid"
        ? <span className="text-xs font-medium text-emerald-700">✓ จ่ายแล้ว {row.original.paid_date ? thDate(row.original.paid_date) : ""}</span>
        : <span className="text-xs font-medium text-rose-600">● ยังไม่จ่าย</span>),
    },
    {
      accessorKey: "grand_total", header: "ยอดรวม", size: 130, meta: { filterType: "number" },
      cell: ({ getValue, row }) => (
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums text-slate-800">{money(getValue() as number, row.original.currency)}</div>
          {isCNY(row.original.currency) && (
            <div className="text-[11px] text-slate-400 tabular-nums">≈ ฿{row.original.amount_thb.toLocaleString("th-TH")}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "currency", header: "สกุล", size: 70,
      cell: ({ getValue }) => <span className="text-xs text-slate-500">{curLabel(getValue())}</span>,
    },
    {
      accessorKey: "payment_due_date", header: "ครบกำหนดจ่าย", size: 130,
      cell: ({ getValue, row }) => {
        const iso = getValue() as string | null;
        if (!iso) return <span className="text-xs text-slate-300">—</span>;
        const d = daysTo(iso);
        const paid = row.original.payment_status === "paid";
        const tone = paid ? "text-slate-400" : d != null && d < 0 ? "text-rose-600 font-medium" : d != null && d <= 3 ? "text-amber-600 font-medium" : "text-slate-600";
        return (
          <div className={`text-xs ${tone}`}>
            {thDate(iso)}
            {!paid && d != null && <span className="ml-1">{d < 0 ? `(เลย ${Math.abs(d)} วัน)` : d === 0 ? "(วันนี้)" : `(อีก ${d} วัน)`}</span>}
            {row.original.auto_due && <span className="ml-1 text-indigo-400" title="คิดจากเครดิตร้านอัตโนมัติ">🔄</span>}
          </div>
        );
      },
    },
    {
      accessorKey: "line_count", header: "รายการ", size: 80, meta: { filterType: "number" },
      cell: ({ getValue }) => <span className="text-sm tabular-nums text-slate-600">{(getValue() as number).toLocaleString("th-TH")}</span>,
    },
  ], []);

  const rowActions = useMemo<RowAction<PoListRow>[]>(() => [
    { label: "ดูรายละเอียด", icon: "👁", onClick: (r) => setDetailId(r.id) },
    { label: "พิมพ์ / บันทึก PDF", icon: "🖨", onClick: printPo },
    { label: "ส่งให้ซัพทางไลน์", icon: "📱", onClick: shareLine },
    { label: "คัดลอกข้อความ", icon: "📋", onClick: (r) => void copyText(r) },
  ], [printPo, shareLine, copyText]);

  const summary = useMemo(() => {
    const unpaid = rows.filter((r) => r.payment_status !== "paid");
    const overdue = unpaid.filter((r) => { const d = daysTo(r.payment_due_date); return d != null && d < 0; });
    return {
      total: rows.length,
      unpaid: unpaid.length,
      unpaidThb: unpaid.reduce((s, r) => s + r.amount_thb, 0),
      overdue: overdue.length,
    };
  }, [rows]);

  return (
    <PlaygroundShell>
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">🧾 รายการใบสั่งซื้อ (PO)</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              ค้นหาใบย้อนหลัง · พิมพ์ส่งซัพ · เปิดใบใหม่เองได้โดยไม่ต้องผ่านใบขอซื้อ
            </p>
          </div>
          <button onClick={() => setCreateOpen(true)}
            className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            + เปิด PO ใหม่
          </button>
        </div>

        {/* สรุปย่อ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "ใบทั้งหมด", value: summary.total.toLocaleString("th-TH"), tone: "text-slate-800" },
            { label: "ยังไม่จ่าย", value: summary.unpaid.toLocaleString("th-TH"), tone: "text-rose-600" },
            { label: "ยอดค้างจ่าย (บาท)", value: `฿${summary.unpaidThb.toLocaleString("th-TH")}`, tone: "text-rose-600" },
            { label: "เลยกำหนดจ่าย", value: summary.overdue.toLocaleString("th-TH"), tone: summary.overdue > 0 ? "text-rose-600" : "text-slate-400" },
          ].map((c) => (
            <div key={c.label} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
              <div className="text-[11px] text-slate-400">{c.label}</div>
              <div className={`text-lg font-bold tabular-nums ${c.tone}`}>{c.value}</div>
            </div>
          ))}
        </div>

        <DataTable<PoListRow>
          data={rows} columns={columns} loading={loading} error={error ?? undefined} onRetry={fetchRows}
          emptyMessage="ยังไม่มีใบสั่งซื้อ"
          searchPlaceholder="ค้นหา เลขที่ / ร้าน..."
          searchableKeys={["po_no", "seller", "note"]}
          tableId="purchasing-po-list"
          exportFilename="รายการใบสั่งซื้อ"
          onRowClick={(r) => setDetailId(r.id)}
          rowActions={rowActions}
          views={[
            { id: "all", label: "ทั้งหมด" },
            { id: "unpaid", label: "ยังไม่จ่าย", filter: (r) => (r as PoListRow).payment_status !== "paid" },
            { id: "overdue", label: "เลยกำหนดจ่าย", filter: (r) => { const x = r as PoListRow; if (x.payment_status === "paid") return false; const d = daysTo(x.payment_due_date); return d != null && d < 0; } },
            { id: "pending", label: "ยังรับของไม่ครบ", filter: (r) => (r as PoListRow).receive_label !== "รับครบแล้ว" },
            { id: "done", label: "รับครบแล้ว", filter: (r) => (r as PoListRow).receive_label === "รับครบแล้ว" },
          ]}
        />
      </div>

      {detailId && (
        <PoDetailModal
          poId={detailId}
          onClose={() => setDetailId(null)}
          footer={(() => {
            const r = rows.find((x) => x.id === detailId);
            if (!r) return null;
            return (
              <div className="flex gap-2">
                <button onClick={() => printPo(r)} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">🖨 พิมพ์</button>
                <button onClick={() => shareLine(r)} className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50">📱 ส่งไลน์</button>
              </div>
            );
          })()}
        />
      )}

      {createOpen && (
        <PoCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => { setCreateOpen(false); void fetchRows(); setDetailId(id); }}
        />
      )}
    </PlaygroundShell>
  );
}
