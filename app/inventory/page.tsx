"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { ERPModal } from "@/components/modal";
import { ProductPicker, WarehousePicker } from "@/components/pickers";
import type { ProductPickerValue, WarehousePickerValue } from "@/components/pickers";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import type { StockMovement, MovementsResponse } from "@/app/api/inventory/movements/route";
import type { StockBalance, BalancesResponse } from "@/app/api/inventory/balances/route";

// ---- Movement type config ----
const MOVE_TYPE: Record<string, { icon: string; label: string; color: string }> = {
  in:       { icon: "📥", label: "รับเข้า",     color: "bg-emerald-50 text-emerald-700" },
  out:      { icon: "📤", label: "เบิกออก",     color: "bg-rose-50 text-rose-700" },
  transfer: { icon: "🔄", label: "โอนระหว่างคลัง", color: "bg-blue-50 text-blue-700" },
  adjust:   { icon: "⚖️", label: "ปรับ stock", color: "bg-amber-50 text-amber-700" },
};

const fmtQty   = (n: number) => Number(n).toLocaleString("th-TH");
const fmtMoney = (n: number) => "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });

// ============================================================
// Page
// ============================================================

type Tab = "movements" | "stock";

export default function InventoryPage() {
  const canView   = usePermission("stock.view");
  const canCreate = usePermission("stock.create");
  const canAdjust = usePermission("stock.adjust");
  const { user, can } = useAuth();

  const [tab, setTab] = useState<Tab>("movements");
  const [moves, setMoves]       = useState<StockMovement[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);

  // create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [movType, setMovType] = useState<"in"|"out"|"transfer"|"adjust">("in");
  const [product, setProduct] = useState<ProductPickerValue | null>(null);
  const [fromWh, setFromWh]   = useState<WarehousePickerValue | null>(null);
  const [toWh,   setToWh]     = useState<WarehousePickerValue | null>(null);
  const [qty, setQty]         = useState<string>("0");
  const [unitCost, setUnitCost] = useState<string>("0");
  const [note, setNote]       = useState<string>("");
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  // filter
  const [filterWh, setFilterWh] = useState<WarehousePickerValue | null>(null);
  const [showLowOnly, setShowLowOnly] = useState(false);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (tab === "movements") {
        const qs = filterWh ? `?warehouse_id=${filterWh.id}` : "";
        const res = await apiFetch(`/api/inventory/movements${qs}`);
        const json: MovementsResponse = await res.json();
        if (json.error) throw new Error(json.error);
        setMoves(json.data);
      } else {
        const params = new URLSearchParams();
        if (filterWh) params.set("warehouse_id", filterWh.id);
        if (showLowOnly) params.set("low_stock", "true");
        const res = await apiFetch(`/api/inventory/balances?${params}`);
        const json: BalancesResponse = await res.json();
        if (json.error) throw new Error(json.error);
        setBalances(json.data);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, [tab, filterWh, showLowOnly]);

  useEffect(() => { if (canView) fetchData(); }, [canView, fetchData]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  const openCreate = (type: "in"|"out"|"transfer"|"adjust") => {
    setMovType(type); setProduct(null); setFromWh(null); setToWh(null);
    setQty("0"); setUnitCost("0"); setNote(""); setFormErr(null);
    setModalOpen(true);
  };

  const save = async () => {
    if (!product) { setFormErr("กรุณาเลือกสินค้า"); return; }
    const qtyNum = parseFloat(qty);
    if (!qtyNum || qtyNum <= 0) { setFormErr("qty ต้อง > 0"); return; }
    if (movType === "in" && !toWh) { setFormErr("ต้องระบุคลังปลายทาง"); return; }
    if (movType === "out" && !fromWh) { setFormErr("ต้องระบุคลังต้นทาง"); return; }
    if (movType === "transfer" && (!fromWh || !toWh)) { setFormErr("ต้องระบุทั้งต้นทางและปลายทาง"); return; }
    if (movType === "transfer" && fromWh?.id === toWh?.id) { setFormErr("คลังต้นทาง = ปลายทาง ไม่ได้"); return; }
    if (movType === "adjust" && !toWh) { setFormErr("ต้องระบุคลังที่จะปรับ"); return; }

    setSaving(true); setFormErr(null);
    try {
      const res = await apiFetch("/api/inventory/movements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movement_type: movType,
          product_id: product.id,
          from_warehouse_id: fromWh?.id ?? null,
          to_warehouse_id:   toWh?.id ?? null,
          qty: qtyNum,
          unit_cost: parseFloat(unitCost) || 0,
          note,
          actor: user?.name,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("บันทึก movement แล้ว");
      setModalOpen(false);
      await fetchData();
    } catch (err) { setFormErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  // ---- Columns: movements ----
  const moveColumns: ColumnDef<StockMovement>[] = useMemo(() => [
    {
      id: "movement_number", accessorKey: "movement_number", header: "เลข SM", size: 130,
      cell: ({ getValue }) => <code className="font-mono text-xs">{getValue() as string}</code>,
    },
    { id: "movement_date", accessorKey: "movement_date", header: "วันที่", size: 100 },
    {
      id: "movement_type", accessorKey: "movement_type", header: "ประเภท", size: 130,
      cell: ({ getValue }) => {
        const t = getValue() as string;
        const cfg = MOVE_TYPE[t];
        return <span className={`text-xs px-2 py-0.5 rounded ${cfg?.color}`}>{cfg?.icon} {cfg?.label}</span>;
      },
    },
    {
      id: "product_name", accessorKey: "product_name", header: "สินค้า", size: 240,
      cell: ({ row }) => (
        <div>
          {row.original.product_sku && <code className="text-[10px] text-slate-400 font-mono">{row.original.product_sku}</code>}
          <div className="text-sm">{row.original.product_name}</div>
        </div>
      ),
    },
    {
      id: "warehouses", header: "คลัง", size: 200,
      cell: ({ row }) => {
        const f = row.original.from_warehouse_code, t = row.original.to_warehouse_code;
        if (f && t) return <span className="text-xs">{f} → {t}</span>;
        if (t)      return <span className="text-xs">→ {t}</span>;
        if (f)      return <span className="text-xs">{f} →</span>;
        return <span className="text-slate-300">—</span>;
      },
    },
    {
      id: "qty", accessorKey: "qty", header: "จำนวน", size: 90,
      cell: ({ getValue, row }) => (
        <span className="tabular-nums font-mono">{fmtQty(getValue() as number)} {row.original.unit}</span>
      ),
    },
    {
      id: "total_cost", accessorKey: "total_cost", header: "มูลค่า", size: 110,
      cell: ({ getValue }) => <span className="tabular-nums font-mono text-xs">{fmtMoney(getValue() as number)}</span>,
    },
    { id: "reference_label", accessorKey: "reference_label", header: "อ้างอิง", size: 140 },
    { id: "performed_by", accessorKey: "performed_by", header: "ผู้ทำ", size: 120 },
  ], []);

  // ---- Columns: balances ----
  const balanceColumns: ColumnDef<StockBalance>[] = useMemo(() => [
    {
      id: "warehouse_name", accessorKey: "warehouse_name", header: "คลัง", size: 160,
      cell: ({ row }) => (
        <div>
          <code className="text-[10px] text-slate-400">{row.original.warehouse_code}</code>
          <div className="text-sm">{row.original.warehouse_name}</div>
        </div>
      ),
    },
    {
      id: "product_name", accessorKey: "product_name", header: "สินค้า", size: 260,
      cell: ({ row }) => (
        <div>
          <code className="text-[10px] text-slate-400 font-mono">{row.original.product_sku}</code>
          <div className="text-sm">{row.original.product_name}</div>
        </div>
      ),
    },
    {
      id: "qty_on_hand", accessorKey: "qty_on_hand", header: "คงเหลือ", size: 100,
      cell: ({ getValue, row }) => {
        const n = getValue() as number;
        const cls = n <= 0 ? "text-red-700" : n < 10 ? "text-amber-700" : "text-slate-800";
        return <span className={`tabular-nums font-mono ${cls}`}>{fmtQty(n)}</span>;
      },
    },
    {
      id: "qty_reserved", accessorKey: "qty_reserved", header: "จองไว้", size: 90,
      cell: ({ getValue }) => <span className="tabular-nums font-mono text-xs text-slate-500">{fmtQty(getValue() as number)}</span>,
    },
    {
      id: "qty_available", accessorKey: "qty_available", header: "ใช้ได้", size: 100,
      cell: ({ getValue }) => {
        const n = getValue() as number;
        return <span className={`tabular-nums font-mono font-semibold ${n <= 0 ? "text-red-700" : "text-emerald-700"}`}>{fmtQty(n)}</span>;
      },
    },
    {
      id: "avg_cost", accessorKey: "avg_cost", header: "ทุน/หน่วย", size: 110,
      cell: ({ getValue }) => <span className="tabular-nums font-mono text-xs">{fmtMoney(getValue() as number)}</span>,
    },
    {
      id: "total_value", accessorKey: "total_value", header: "มูลค่ารวม", size: 130,
      cell: ({ getValue }) => <span className="tabular-nums font-mono text-xs font-semibold">{fmtMoney(getValue() as number)}</span>,
    },
  ], []);

  // summary
  const summary = useMemo(() => {
    const totalValue = balances.reduce((s, b) => s + b.total_value, 0);
    const outOfStock = balances.filter(b => b.qty_available <= 0).length;
    return { totalValue, outOfStock };
  }, [balances]);

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">📦 Inventory</h1>
            <p className="text-sm text-slate-500 mt-0.5">stock movement + balance ต่อคลัง — moving average cost</p>
          </div>
          {canCreate && (
            <div className="flex gap-2">
              <button onClick={() => openCreate("in")}
                className="h-9 px-3 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">📥 รับเข้า</button>
              <button onClick={() => openCreate("out")}
                className="h-9 px-3 text-sm font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700">📤 เบิกออก</button>
              <button onClick={() => openCreate("transfer")}
                className="h-9 px-3 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">🔄 โอน</button>
              {canAdjust && (
                <button onClick={() => openCreate("adjust")}
                  className="h-9 px-3 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700">⚖️ ปรับ</button>
              )}
            </div>
          )}
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        {/* Tabs + filter bar */}
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <div className="flex border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => setTab("movements")}
              className={`h-9 px-4 text-sm font-medium ${tab === "movements" ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
              📜 Movements ({moves.length})
            </button>
            <button onClick={() => setTab("stock")}
              className={`h-9 px-4 text-sm font-medium border-l border-slate-200 ${tab === "stock" ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
              📊 Stock Balance ({balances.length})
            </button>
          </div>

          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">กรองคลัง:</span>
            <div className="w-48">
              <WarehousePicker value={filterWh} onChange={setFilterWh} placeholder="ทุกคลัง" />
            </div>
          </div>
          {tab === "stock" && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={showLowOnly} onChange={e => setShowLowOnly(e.target.checked)} className="rounded border-slate-300" />
              เฉพาะ Out of Stock
            </label>
          )}
        </div>

        {/* Summary cards (stock tab) */}
        {tab === "stock" && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-blue-50 to-white border border-blue-200 rounded-xl">
              <p className="text-[10px] text-blue-600 uppercase">SKU ที่มี stock</p>
              <p className="text-xl font-bold text-blue-700 tabular-nums">{balances.length}</p>
            </div>
            <div className="p-3 bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-xl">
              <p className="text-[10px] text-emerald-600 uppercase">มูลค่ารวม</p>
              <p className="text-xl font-bold text-emerald-700 tabular-nums font-mono">{fmtMoney(summary.totalValue)}</p>
            </div>
            <div className="p-3 bg-gradient-to-br from-red-50 to-white border border-red-200 rounded-xl">
              <p className="text-[10px] text-red-600 uppercase">Out of Stock</p>
              <p className="text-xl font-bold text-red-700 tabular-nums">{summary.outOfStock}</p>
            </div>
          </div>
        )}

        {tab === "movements" ? (
          <DataTable
            tableId="inventory-movements"
            data={moves}
            columns={moveColumns}
            loading={loading}
            searchableKeys={["movement_number", "product_sku", "product_name", "reference_label"]}
            searchPlaceholder="ค้นหา SM / SKU / สินค้า / อ้างอิง..."
            exportFilename="stock-movements"
            exportEntityType="erp_playground_stock_movement"
            canCheck={(p) => can(p as Parameters<typeof can>[0])}
            pageSize={20}
          />
        ) : (
          <DataTable
            tableId="inventory-balances"
            data={balances}
            columns={balanceColumns}
            loading={loading}
            searchableKeys={["product_sku", "product_name", "warehouse_name"]}
            searchPlaceholder="ค้นหา SKU / สินค้า / คลัง..."
            exportFilename="stock-balances"
            exportEntityType="erp_playground_stock_balance"
            canCheck={(p) => can(p as Parameters<typeof can>[0])}
            pageSize={30}
          />
        )}

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      {/* Create modal */}
      <ERPModal open={modalOpen} onClose={() => !saving && setModalOpen(false)} size="md"
        title={`${MOVE_TYPE[movType].icon} ${MOVE_TYPE[movType].label}`}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} disabled={saving}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
            <button onClick={save} disabled={saving}
              className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "..." : "บันทึก"}
            </button>
          </>
        }>
        <div className="space-y-3">
          {formErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}

          <div>
            <span className="text-xs font-medium text-slate-600">สินค้า *</span>
            <div className="mt-0.5">
              <ProductPicker value={product} onChange={setProduct} />
            </div>
          </div>

          {(movType === "out" || movType === "transfer") && (
            <div>
              <span className="text-xs font-medium text-slate-600">คลังต้นทาง *</span>
              <div className="mt-0.5"><WarehousePicker value={fromWh} onChange={setFromWh} /></div>
            </div>
          )}
          {(movType === "in" || movType === "transfer" || movType === "adjust") && (
            <div>
              <span className="text-xs font-medium text-slate-600">{movType === "adjust" ? "คลัง *" : "คลังปลายทาง *"}</span>
              <div className="mt-0.5"><WarehousePicker value={toWh} onChange={setToWh} /></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">
                {movType === "adjust" ? "จำนวนใหม่ที่จะ set" : "จำนวน"} *
              </span>
              <input type="number" value={qty} onChange={e => setQty(e.target.value)} step="any"
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">ทุน/หน่วย</span>
              <input type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} step="any"
                disabled={movType === "transfer"}
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded disabled:bg-slate-50" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">หมายเหตุ</span>
            <input value={note} onChange={e => setNote(e.target.value)}
              className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
          </label>

          <div className="text-[10px] text-slate-400 bg-slate-50 p-2 rounded">
            💡 {movType === "in" && "เพิ่ม stock + คำนวณ moving avg cost"}
            {movType === "out" && "ลด stock จากคลังต้นทาง"}
            {movType === "transfer" && "ย้าย stock ระหว่างคลัง — ทุนใช้ค่าจาก source"}
            {movType === "adjust" && "ปรับให้ qty = ค่าใหม่ (ใช้หลังนับ stock)"}
          </div>
        </div>
      </ERPModal>
    </PlaygroundShell>
  );
}
