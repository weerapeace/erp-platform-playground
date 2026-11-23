"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { SkuPicker, WarehousePicker } from "@/components/pickers";
import type { SkuPickerValue, WarehousePickerValue } from "@/components/pickers";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import type { StockMovement, MovementsResponse } from "@/app/api/inventory/movements/route";
import type { StockBalance, BalancesResponse } from "@/app/api/inventory/balances/route";
import type { ReorderItem, ReorderResponse } from "@/app/api/inventory/reorder/route";
import type { InventoryHealth, ZoneSummary } from "@/app/api/inventory/health/route";
import { Icon } from "@/components/icon";
import { HoverImage } from "@/components/hover-image";

// ---- Movement type config ----
const MOVE_TYPE: Record<string, { icon: string; label: string; color: string }> = {
  in:       { icon: "📥", label: "รับเข้า",     color: "bg-emerald-50 text-emerald-700" },
  out:      { icon: "📤", label: "เบิกออก",     color: "bg-rose-50 text-rose-700" },
  transfer: { icon: "🔄", label: "โอนระหว่างคลัง", color: "bg-blue-50 text-blue-700" },
  adjust:   { icon: "⚖️", label: "ปรับ stock", color: "bg-amber-50 text-amber-700" },
};

// โซนคลัง — อีโมจิ + ลำดับ ตามประเภท (kind) สำหรับแท็บกรองคลัง
const KIND_EMOJI: Record<string, string> = { raw: "🟠", wip: "🔵", fg: "🟢", scrap: "🔴", sales: "🏬", general: "📦" };
const KIND_ORDER: Record<string, number> = { raw: 1, wip: 2, fg: 3, scrap: 4, sales: 5, general: 6 };
type WhTab = { id: string; code: string; name: string; kind: string };
// ชื่อโซน + สีแถบ (แถบโซนในภาพรวม)
const KIND_LABEL: Record<string, string> = { raw: "วัตถุดิบ", wip: "ระหว่างผลิต", fg: "สินค้าสำเร็จ", scrap: "ของเสีย", sales: "คลังขาย", general: "ทั่วไป" };
const KIND_BAR: Record<string, string> = { raw: "bg-amber-500", wip: "bg-blue-500", fg: "bg-emerald-500", scrap: "bg-red-500", sales: "bg-violet-500", general: "bg-slate-400" };

// drawer ดูรายละเอียดสินค้า (ของกลาง MasterRecordDrawer) — dynamic กัน import วน
const SkuDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

type RefWorker = { assignee_name: string | null; stage: string | null; qty: number };
type RefDetail = { kind: string; mo_no?: string | null; workers?: RefWorker[]; wo?: Record<string, unknown> | null; gr?: Record<string, unknown> | null };

const fmtQty   = (n: number) => Number(n).toLocaleString("th-TH");
const COST_COLS = new Set(["unit_cost", "total_cost", "avg_cost", "total_value"]);   // คอลัมน์ที่ต้องมีสิทธิ์ดูราคาทุน
const fmtMoney = (n: number) => "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
const MOVES_PAGE = 500;   // โหลดประวัติทีละ 500 (เพดาน API)
/** "3 วันก่อน" / "วันนี้" — ใช้ในป้ายเตือนการไหลอัตโนมัติ */
const agoText = (iso: string | null) => {
  if (!iso) return "ยังไม่เคย";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "วันนี้" : `${d} วันก่อน`;
};

// ============================================================
// Page
// ============================================================

type Tab = "overview" | "movements" | "stock" | "reorder";

export default function InventoryPage() {
  const canView   = usePermission("stock.view");
  const canCreate = usePermission("stock.create");
  const canAdjust = usePermission("stock.adjust");
  const canCost   = usePermission("products.cost.view");   // ดูราคาทุน (ของกลาง lib/cost-access) — ไม่มี = ซ่อนทุน/มูลค่า (server ตัดเป็น 0 แล้วด้วย)
  const { user, can } = useAuth();

  const [tab, setTab] = useState<Tab>("overview");
  const [recent, setRecent] = useState<StockMovement[]>([]);   // ภาพรวม: เคลื่อนไหวล่าสุด
  const [moves, setMoves]       = useState<StockMovement[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [reorder, setReorder]   = useState<ReorderItem[]>([]);
  const [loading, setLoading]   = useState(true);
  // ยอดจริงทั้งระบบ (เดิมเลขบนแท็บ = แค่จำนวนที่โหลดมา → แท็บที่ยังไม่เปิดขึ้น 0)
  const [health, setHealth]     = useState<InventoryHealth | null>(null);
  const [movesTotal, setMovesTotal] = useState<number | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [balLoaded, setBalLoaded] = useState(false);
  const [negOnly, setNegOnly]   = useState(false);   // ดูเฉพาะยอดติดลบ (จากป้ายเตือน)
  const [error,   setError]     = useState<string | null>(null);

  // ตั้งจุดสั่งซื้อ (min stock) modal
  const [minModal, setMinModal]   = useState<ReorderItem | { product_id: string; sku: string | null; name: string; min_stock: number; reorder_qty: number } | null>(null);
  const [minVal, setMinVal]       = useState("0");
  const [reorderVal, setReorderVal] = useState("0");
  const [minSaving, setMinSaving] = useState(false);

  // ตั้งชั้นวาง modal
  const [locModal, setLocModal] = useState<StockBalance | null>(null);
  const [locVal, setLocVal]     = useState("");
  const [locSaving, setLocSaving] = useState(false);

  // create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [movType, setMovType] = useState<"in"|"out"|"transfer"|"adjust">("in");
  const [product, setProduct] = useState<SkuPickerValue | null>(null);
  const [fromWh, setFromWh]   = useState<WarehousePickerValue | null>(null);
  const [toWh,   setToWh]     = useState<WarehousePickerValue | null>(null);
  const [qty, setQty]         = useState<string>("0");
  const [unitCost, setUnitCost] = useState<string>("0");
  const [note, setNote]       = useState<string>("");
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  // filter
  const [filterWh, setFilterWh] = useState<string | null>(null);   // warehouse id (null = ทั้งหมด)
  const [whTabs, setWhTabs] = useState<WhTab[]>([]);
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [peekSku, setPeekSku] = useState<string | null>(null);   // คลิกสินค้า → เปิด drawer
  const [adjustCurrent, setAdjustCurrent] = useState<number | null>(null);   // โมดัลปรับ: ยอดปัจจุบัน
  const [moveDetail, setMoveDetail] = useState<StockMovement | null>(null);  // คลิก movement → popup ที่มา
  const [refDetail, setRefDetail] = useState<RefDetail | null>(null);
  const [balHist, setBalHist] = useState<StockBalance | null>(null);         // คลิก balance → ประวัติ
  const [balMoves, setBalMoves] = useState<StockMovement[]>([]);

  // ↩ กลับรายการที่ลงผิด (สต๊อกห้ามแก้/ลบประวัติ → ลงรายการตรงข้ามแทน)
  const [revTarget, setRevTarget] = useState<StockMovement | null>(null);
  const [revBusy, setRevBusy] = useState(false);
  const reversedIds = useMemo(
    () => new Set(moves.filter((m) => m.reference_type === "reversal" && m.reference_id).map((m) => m.reference_id as string)),
    [moves],
  );
  /** กลับได้เฉพาะรายการที่ลงมือเอง (ไม่มีเอกสารอ้างอิง) · ไม่ใช่ปรับยอด · ยังไม่เคยถูกกลับ */
  const canReverse = (m: StockMovement) =>
    canCreate && !m.reference_type && m.movement_type !== "adjust" && !reversedIds.has(m.id);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const loadHealth = useCallback(() => {
    apiFetch("/api/inventory/health").then((r) => r.json())
      .then((j: InventoryHealth) => { if (!j.error) setHealth(j); }).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    loadHealth();
    try {
      if (tab === "overview") {
        // ภาพรวม: เคลื่อนไหวล่าสุด 8 รายการ + จำนวนถึงจุดสั่งซื้อ (ตัวเลขอื่นมาจาก health)
        const [mv, ro] = await Promise.all([
          apiFetch(`/api/inventory/movements?limit=8`).then((r) => r.json() as Promise<MovementsResponse>),
          apiFetch(`/api/inventory/reorder`).then((r) => r.json() as Promise<ReorderResponse>),
        ]);
        if (!mv.error) { setRecent(mv.data); setMovesTotal((t) => t ?? mv.total); }
        if (!ro.error) setReorder(ro.data);
      } else if (tab === "movements") {
        const qs = new URLSearchParams({ limit: String(MOVES_PAGE) });
        if (filterWh) qs.set("warehouse_id", filterWh);
        const res = await apiFetch(`/api/inventory/movements?${qs}`);
        const json: MovementsResponse = await res.json();
        if (json.error) throw new Error(json.error);
        setMoves(json.data);
        setMovesTotal(json.total);
      } else if (tab === "stock") {
        const params = new URLSearchParams();
        if (filterWh) params.set("warehouse_id", filterWh);
        if (showLowOnly) params.set("low_stock", "true");
        params.set("limit", "1000");
        const res = await apiFetch(`/api/inventory/balances?${params}`);
        const json: BalancesResponse = await res.json();
        if (json.error) throw new Error(json.error);
        setBalances(json.data);
        setBalLoaded(true);
      } else {
        const res = await apiFetch(`/api/inventory/reorder`);
        const json: ReorderResponse = await res.json();
        if (json.error) throw new Error(json.error);
        setReorder(json.data);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, [tab, filterWh, showLowOnly, loadHealth]);

  // โหลดประวัติเพิ่ม (ต่อท้าย) — เดิมเห็นแค่ 200 รายการล่าสุด
  const loadMoreMoves = async () => {
    setMoreBusy(true);
    try {
      const qs = new URLSearchParams({ limit: String(MOVES_PAGE), offset: String(moves.length) });
      if (filterWh) qs.set("warehouse_id", filterWh);
      const res = await apiFetch(`/api/inventory/movements?${qs}`);
      const json: MovementsResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setMoves((prev) => [...prev, ...json.data]);
      setMovesTotal(json.total);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดเพิ่มไม่ได้"); }
    finally { setMoreBusy(false); }
  };

  // ตั้งจุดสั่งซื้อ
  const openMinModal = (r: ReorderItem) => {
    setMinModal(r); setMinVal(String(r.min_stock)); setReorderVal(String(r.reorder_qty));
  };
  // เริ่มเฝ้าระวังจากแท็บ Stock Balance (ยังไม่รู้ค่าปัจจุบัน → เริ่มที่ 0)
  const openMinFromBalance = (b: StockBalance) => {
    setMinModal({ product_id: b.product_id, sku: b.product_sku, name: b.product_name, min_stock: 0, reorder_qty: 0 });
    setMinVal("0"); setReorderVal("0");
  };
  const saveMin = async () => {
    if (!minModal) return;
    setMinSaving(true);
    try {
      const res = await apiFetch("/api/inventory/reorder", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: minModal.product_id,
          min_stock: parseFloat(minVal) || 0,
          reorder_qty: parseFloat(reorderVal) || 0,
          actor: user?.name,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("บันทึกจุดสั่งซื้อแล้ว");
      setMinModal(null);
      await fetchData();
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setMinSaving(false); }
  };

  // ตั้งชั้นวาง
  const openLocModal = (b: StockBalance) => { setLocModal(b); setLocVal(b.location_code ?? ""); };
  const saveLoc = async () => {
    if (!locModal) return;
    setLocSaving(true);
    try {
      const res = await apiFetch("/api/inventory/location", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: locModal.product_id,
          warehouse_id: locModal.warehouse_id,
          location_code: locVal,
          actor: user?.name,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("บันทึกชั้นวางแล้ว");
      setLocModal(null);
      await fetchData();
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setLocSaving(false); }
  };

  useEffect(() => { if (canView) fetchData(); }, [canView, fetchData]);

  // โหลดรายชื่อคลังไว้ทำแท็บกรอง (ครั้งเดียว) — เรียงตามประเภทโซน RAW→WIP→FG→SCRAP→ขาย
  useEffect(() => {
    apiFetch("/api/master/warehouses?limit=100").then((r) => r.json())
      .then((j) => {
        const rows = ((j.data ?? []) as Array<Record<string, unknown>>)
          .filter((w) => w.active !== false)
          .map((w) => ({ id: String(w.id), code: String(w.code ?? ""), name: String(w.name ?? w.code ?? ""), kind: String(w.kind ?? "general") }));
        rows.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.code.localeCompare(b.code));
        setWhTabs(rows);
      }).catch(() => {});
  }, []);

  // โมดัลปรับ: โชว์ยอดปัจจุบันของสินค้า+คลังที่เลือก (ดึงจากยอดคงเหลือจริง)
  useEffect(() => {
    if (movType !== "adjust" || !modalOpen || !product || !toWh) { setAdjustCurrent(null); return; }
    let active = true;
    apiFetch(`/api/inventory/balances?warehouse_id=${toWh.id}`).then((r) => r.json())
      .then((j) => { if (!active) return; const b = ((j.data ?? []) as StockBalance[]).find((x) => x.product_id === product.id); setAdjustCurrent(b ? b.qty_on_hand : 0); })
      .catch(() => {});
    return () => { active = false; };
  }, [movType, modalOpen, product, toWh]);

  // คลิก movement → โหลด "ที่มา" (จ่ายงานให้โต๊ะ/ช่าง / ใบรับของ)
  useEffect(() => {
    if (!moveDetail) { setRefDetail(null); return; }
    let active = true;
    apiFetch(`/api/inventory/ref-detail?ref_type=${encodeURIComponent(moveDetail.reference_type ?? "")}&ref_id=${moveDetail.reference_id ?? ""}`)
      .then((r) => r.json()).then((j) => { if (active) setRefDetail(j); }).catch(() => {});
    return () => { active = false; };
  }, [moveDetail]);

  // คลิก balance → โหลดประวัติการเคลื่อนไหวของ SKU ในคลังนั้น
  const openBalHist = useCallback(async (b: StockBalance) => {
    setBalHist(b); setBalMoves([]);
    try {
      const res = await apiFetch(`/api/inventory/movements?product_id=${b.product_id}&warehouse_id=${b.warehouse_id}`);
      const j = await res.json();
      setBalMoves(j.error ? [] : (j.data as StockMovement[]));
    } catch { setBalMoves([]); }
  }, []);

  // (การเช็คสิทธิ์ย้ายไปหลัง hooks ทั้งหมด บรรทัดล่าง — กัน React #310 hooks ไม่เท่ากัน)

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

  const doReverse = async () => {
    const m = revTarget;
    if (!m) return;
    setRevBusy(true);
    try {
      const res = await apiFetch("/api/inventory/movements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reverse", id: m.id, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(`กลับรายการ ${m.movement_number ?? ""} แล้ว`);
      setRevTarget(null); setMoveDetail(null);
      await fetchData();
    } catch (err) {
      setRevTarget(null);
      setError(err instanceof Error ? err.message : "กลับรายการไม่สำเร็จ");
    } finally { setRevBusy(false); }
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
        <button onClick={() => setPeekSku(row.original.product_id)} className="text-left group">
          {row.original.product_sku && <code className="text-[10px] text-slate-400 font-mono group-hover:text-blue-500">{row.original.product_sku}</code>}
          <div className="text-sm text-slate-700 group-hover:text-blue-600 underline decoration-dotted decoration-slate-300 group-hover:decoration-blue-400">{row.original.product_name}</div>
        </button>
      ),
    },
    {
      id: "warehouses", header: "คลัง", size: 200,
      cell: ({ row }) => {
        const f = row.original.from_warehouse_code, t = row.original.to_warehouse_code;
        const label = f && t ? `${f} → ${t}` : t ? `→ ${t}` : f ? `${f} →` : null;
        if (!label) return <span className="text-slate-300">—</span>;
        return <button onClick={() => setMoveDetail(row.original)} className="text-xs text-slate-600 hover:text-blue-600 underline decoration-dotted decoration-slate-300 hover:decoration-blue-400">{label}</button>;
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

  const moveCols = useMemo(() => canCost ? moveColumns : moveColumns.filter((c) => !COST_COLS.has(String(c.id))), [canCost, moveColumns]);

  // ---- Columns: balances ----
  const balanceColumns: ColumnDef<StockBalance>[] = useMemo(() => [
    {
      id: "image_url", accessorKey: "image_url", header: "รูป", size: 56, enableSorting: false,
      meta: { type: "image" },
      cell: ({ row }) => <HoverImage url={row.original.image_url} size={36} previewSize={240} />,
    },
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
        <button onClick={() => setPeekSku(row.original.product_id)} className="text-left group">
          <code className="text-[10px] text-slate-400 font-mono group-hover:text-blue-500">{row.original.product_sku}</code>
          <div className="text-sm text-slate-700 group-hover:text-blue-600 underline decoration-dotted decoration-slate-300 group-hover:decoration-blue-400">{row.original.product_name}</div>
        </button>
      ),
    },
    {
      id: "parent_code", accessorKey: "parent_code", header: "รุ่น (Parent)", size: 120,
      cell: ({ getValue }) => <span className="font-mono text-xs text-slate-600">{(getValue() as string | null) ?? "—"}</span>,
    },
    {
      id: "qty_on_hand", accessorKey: "qty_on_hand", header: "คงเหลือ", size: 110,
      cell: ({ getValue, row }) => {
        const n = getValue() as number;
        const cls = n <= 0 ? "text-red-700" : n < 10 ? "text-amber-700" : "text-slate-800";
        return <span className={`tabular-nums font-mono ${cls}`}>{fmtQty(n)}{row.original.uom && <span className="text-[10px] text-slate-400 ml-1 font-sans">{row.original.uom}</span>}</span>;
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
    {
      id: "location_code", accessorKey: "location_code", header: "ชั้นวาง", size: 110,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v
          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-mono">📍 {v}</span>
          : <span className="text-slate-300 text-xs">—</span>;
      },
    },
  ], []);

  const balanceCols = useMemo(() => canCost ? balanceColumns : balanceColumns.filter((c) => !COST_COLS.has(String(c.id))), [canCost, balanceColumns]);

  // ---- Columns: reorder (จุดสั่งซื้อ) ----
  const reorderColumns = useMemo<ColumnDef<ReorderItem>[]>(() => [
    { id: "sku", accessorKey: "sku", header: "SKU", size: 110,
      cell: ({ getValue }) => <span className="font-mono text-xs text-slate-600">{String(getValue() ?? "")}</span> },
    { id: "name", accessorKey: "name", header: "สินค้า", size: 220 },
    { id: "total_available", accessorKey: "total_available", header: "คงเหลือ", size: 100,
      cell: ({ getValue }) => {
        const n = getValue() as number;
        return <span className={`tabular-nums font-mono font-semibold ${n <= 0 ? "text-red-700" : "text-amber-700"}`}>{fmtQty(n)}</span>;
      } },
    { id: "min_stock", accessorKey: "min_stock", header: "จุดสั่งซื้อ", size: 100,
      cell: ({ getValue }) => <span className="tabular-nums font-mono text-xs text-slate-500">{fmtQty(getValue() as number)}</span> },
    { id: "suggested_qty", accessorKey: "suggested_qty", header: "แนะนำสั่ง", size: 110,
      cell: ({ getValue, row }) => (
        <span className="tabular-nums font-mono font-semibold text-blue-700">
          {fmtQty(getValue() as number)} <span className="text-[10px] text-slate-400">{row.original.uom_name}</span>
        </span>
      ) },
    { id: "avg_cost", accessorKey: "avg_cost", header: "ทุน/หน่วย", size: 100,
      cell: ({ getValue }) => <span className="tabular-nums font-mono text-xs">{fmtMoney(getValue() as number)}</span> },
  ], []);

  const reorderCols = useMemo(() => canCost ? reorderColumns : reorderColumns.filter((c) => !COST_COLS.has(String(c.id))), [canCost, reorderColumns]);

  // summary
  const summary = useMemo(() => {
    const totalValue = balances.reduce((s, b) => s + b.total_value, 0);
    const outOfStock = balances.filter(b => b.qty_available <= 0).length;
    return { totalValue, outOfStock };
  }, [balances]);

  // ภาพรวม: รวมตามโซน (kind) สำหรับแถบ + การ์ดคลัง
  const overview = useMemo(() => {
    const zones = health?.zones ?? [];
    const byKind = new Map<string, { kind: string; value: number; in_stock: number; negative: number; whs: ZoneSummary[] }>();
    for (const z of zones) {
      const k = byKind.get(z.kind) ?? { kind: z.kind, value: 0, in_stock: 0, negative: 0, whs: [] };
      k.value += z.value; k.in_stock += z.in_stock; k.negative += z.negative; k.whs.push(z);
      byKind.set(z.kind, k);
    }
    const kinds = [...byKind.values()].sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
    const totalValue = kinds.reduce((s, k) => s + k.value, 0);
    const inStock = kinds.reduce((s, k) => s + k.in_stock, 0);
    const noLoc = zones.reduce((s, z) => s + z.no_location, 0);
    return { kinds, totalValue, inStock, noLoc };
  }, [health]);
  const stalledFlows = health?.flows.filter((f) => f.stalled) ?? [];
  const goStock = (whId: string | null, neg = false) => { setTab("stock"); setFilterWh(whId); setNegOnly(neg); };

  // F14 fix: early return หลัง hooks ทั้งหมด (กัน React #310)
  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-6">
        <div className="flex items-start md:items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-slate-800">📦 คลังสินค้า</h1>
            <p className="text-sm text-slate-500 mt-0.5">ยอดคงเหลือต่อคลัง · ประวัติเข้า-ออก · ต้นทุนเฉลี่ย</p>
          </div>
          {canCreate && (
            <div className="flex gap-2 flex-wrap">
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

        {/* 🩺 ป้ายเตือน: ยอดติดลบ + การไหลอัตโนมัติที่หยุด (อ่านอย่างเดียว) */}
        {tab !== "overview" && health && (health.negative_total > 0 || stalledFlows.length > 0) && (
          <button onClick={() => setTab("overview")}
            className="mb-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900 text-left hover:bg-amber-100">
            <Icon name="warning" size={14} />
            <span className="flex-1">
              {health.negative_total > 0 && <>ยอดติดลบ {fmtQty(health.negative_total)} รายการ</>}
              {health.negative_total > 0 && stalledFlows.length > 0 && " · "}
              {stalledFlows.length > 0 && <>ระบบยังไม่ลงสต็อกเอง {stalledFlows.length} จุด</>}
              {" — ตัวเลขยังไม่ตรงของจริง"}
            </span>
            <span className="text-amber-700 shrink-0">ดูภาพรวม →</span>
          </button>
        )}

        {tab === "overview" && (
          <div className="space-y-4 mb-4">
            {/* การ์ดตัวเลข */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <p className="text-[11px] text-slate-500">มูลค่าคลัง (ยอดบวก)</p>
                {canCost
                  ? <p className="text-lg md:text-xl font-semibold text-slate-800 tabular-nums">{health ? fmtMoney(overview.totalValue) : "…"}</p>
                  : <p className="mt-1 text-xs text-slate-400 flex items-center gap-1"><Icon name="lock" size={12} /> เห็นเฉพาะคนมีสิทธิ์ดูราคาทุน</p>}
              </div>
              <button onClick={() => goStock(null)} className="p-3 rounded-xl border border-slate-200 bg-white text-left hover:border-blue-300">
                <p className="text-[11px] text-slate-500">รายการที่มีของ</p>
                <p className="text-lg md:text-xl font-semibold text-slate-800 tabular-nums">{health ? fmtQty(overview.inStock) : "…"}</p>
              </button>
              <button onClick={() => goStock(null, true)} className={`p-3 rounded-xl border text-left ${(health?.negative_total ?? 0) > 0 ? "border-red-200 bg-red-50 hover:bg-red-100" : "border-slate-200 bg-white"}`}>
                <p className="text-[11px] text-red-700">ยอดติดลบ</p>
                <p className="text-lg md:text-xl font-semibold text-red-700 tabular-nums">{health ? fmtQty(health.negative_total) : "…"}</p>
              </button>
              <button onClick={() => setTab("reorder")} className={`p-3 rounded-xl border text-left ${reorder.length > 0 ? "border-amber-200 bg-amber-50 hover:bg-amber-100" : "border-slate-200 bg-white"}`}>
                <p className="text-[11px] text-amber-700">ถึงจุดสั่งซื้อ</p>
                <p className="text-lg md:text-xl font-semibold text-amber-700 tabular-nums">{fmtQty(reorder.length)}</p>
              </button>
            </div>

            {/* แถบโซน: สัดส่วนมูลค่าแต่ละโซน + การ์ดคลัง (กด = ดูยอดของคลังนั้น) */}
            {health && overview.kinds.length > 0 && (
              <div className="p-3 md:p-4 rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-slate-700">แต่ละโซน</p>
                  <p className="text-[11px] text-slate-400">{canCost ? "แถบ = สัดส่วนมูลค่า" : "แถบ = สัดส่วนจำนวนรายการ"} · กดคลังเพื่อดูยอด</p>
                </div>
                <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                  {overview.kinds.filter((k) => (canCost ? k.value : k.in_stock) > 0).map((k) => (
                    <div key={k.kind} className={KIND_BAR[k.kind] ?? "bg-slate-400"}
                      style={{ width: `${((canCost ? k.value : k.in_stock) / ((canCost ? overview.totalValue : overview.inStock) || 1)) * 100}%` }}
                      title={`${KIND_LABEL[k.kind] ?? k.kind} ${canCost ? fmtMoney(k.value) : `${fmtQty(k.in_stock)} รายการ`}`} />
                  ))}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {overview.kinds.flatMap((k) => k.whs.filter((z) => z.rows > 0).map((z) => (
                    <button key={z.warehouse_id} onClick={() => goStock(z.warehouse_id)}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-slate-50 text-left">
                      <span className={`w-2 self-stretch rounded-full ${KIND_BAR[z.kind] ?? "bg-slate-400"}`} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-slate-800 truncate">{z.name || z.code}</span>
                        <span className="block text-[11px] text-slate-500">{KIND_LABEL[z.kind] ?? z.kind} · มีของ {fmtQty(z.in_stock)} รายการ</span>
                      </span>
                      <span className="text-right shrink-0">
                        {canCost && <span className="block text-sm font-medium tabular-nums text-slate-800">{fmtMoney(z.value)}</span>}
                        {z.negative > 0 && <span className="block text-[11px] text-red-600">ติดลบ {fmtQty(z.negative)}</span>}
                      </span>
                    </button>
                  )))}
                </div>
              </div>
            )}

            <div className="grid gap-3 lg:grid-cols-2">
              {/* กล่อง "ต้องจัดการ" */}
              <div className="p-3 md:p-4 rounded-xl border border-slate-200 bg-white">
                <p className="text-sm font-medium text-slate-700 mb-2">ต้องจัดการ</p>
                {!health ? <p className="text-xs text-slate-400">กำลังโหลด…</p> : (
                  <ul className="space-y-2">
                    {health.negative_total > 0 && (
                      <li className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                        <div className="flex items-center gap-1.5 font-medium"><Icon name="warning" size={16} /> ยอดติดลบ {fmtQty(health.negative_total)} รายการ</div>
                        <p className="text-xs text-red-700 mt-0.5">เบิกของออกไปแล้วแต่ไม่มีรับเข้า/ยอดยกมา → ต้องตั้งยอดยกมาหรือนับใหม่ก่อน</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {health.negative_by_wh.map((w) => (
                            <button key={w.warehouse_id} onClick={() => goStock(w.warehouse_id, true)}
                              className="h-7 px-2.5 text-xs rounded-lg bg-white border border-red-200 hover:bg-red-100">
                              {w.name || w.code} · {fmtQty(w.count)} →
                            </button>
                          ))}
                        </div>
                      </li>
                    )}
                    {stalledFlows.map((f) => (
                      <li key={f.key} className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
                        <div className="flex items-center gap-1.5 font-medium"><Icon name="waiting" size={16} /> {f.label}</div>
                        <p className="text-xs text-amber-800 mt-0.5">ลงสต็อกล่าสุด {agoText(f.last_at)} · {f.pending_label} {fmtQty(f.pending)}</p>
                      </li>
                    ))}
                    {reorder.length > 0 && (
                      <li>
                        <button onClick={() => setTab("reorder")} className="w-full p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900 text-left hover:bg-amber-100">
                          <span className="flex items-center gap-1.5 font-medium"><Icon name="cart" size={16} /> ถึงจุดสั่งซื้อ {fmtQty(reorder.length)} รายการ →</span>
                        </button>
                      </li>
                    )}
                    {overview.noLoc > 0 && (
                      <li className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700">
                        <div className="flex items-center gap-1.5"><Icon name="pin" size={16} /> มีของแต่ยังไม่ระบุชั้นวาง {fmtQty(overview.noLoc)} รายการ</div>
                        <p className="text-xs text-slate-500 mt-0.5">ตั้งได้ที่แท็บยอดคงเหลือ → เมนูแถว &ldquo;ตั้งชั้นวาง&rdquo;</p>
                      </li>
                    )}
                    {health.negative_total === 0 && stalledFlows.length === 0 && reorder.length === 0 && overview.noLoc === 0 && (
                      <li className="flex items-center gap-1.5 text-sm text-emerald-700"><Icon name="done" size={16} /> ไม่มีเรื่องค้าง</li>
                    )}
                  </ul>
                )}
              </div>

              {/* เคลื่อนไหวล่าสุด */}
              <div className="p-3 md:p-4 rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-slate-700">เคลื่อนไหวล่าสุด</p>
                  <button onClick={() => setTab("movements")} className="text-xs text-blue-600 hover:underline">ดูทั้งหมด →</button>
                </div>
                {loading && recent.length === 0 ? <p className="text-xs text-slate-400">กำลังโหลด…</p>
                  : recent.length === 0 ? <p className="text-xs text-slate-400">ยังไม่มีรายการ</p> : (
                  <ul className="divide-y divide-slate-100">
                    {recent.map((m) => {
                      const t = MOVE_TYPE[m.movement_type] ?? MOVE_TYPE.adjust;
                      return (
                        <li key={m.id}>
                          <button onClick={() => setMoveDetail(m)} className="w-full flex items-center gap-2 py-2 text-left hover:bg-slate-50">
                            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${t.color}`}>{t.label}</span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm text-slate-700 truncate">{m.product_name}</span>
                              <span className="block text-[11px] text-slate-400 truncate">{m.reference_label || m.movement_number} · {agoText(m.created_at)}</span>
                            </span>
                            <span className="shrink-0 text-sm tabular-nums font-mono text-slate-700">{fmtQty(m.qty)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tabs + filter bar */}
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <div className="flex border border-slate-200 rounded-lg overflow-x-auto max-w-full">
            <button onClick={() => setTab("overview")}
              className={`h-9 px-4 text-sm font-medium whitespace-nowrap ${tab === "overview" ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
              ภาพรวม
            </button>
            <button onClick={() => setTab("movements")}
              className={`h-9 px-4 text-sm font-medium whitespace-nowrap border-l border-slate-200 ${tab === "movements" ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
              📜 ประวัติเคลื่อนไหว ({fmtQty(movesTotal ?? health?.movements_total ?? moves.length)})
            </button>
            <button onClick={() => setTab("stock")}
              className={`h-9 px-4 text-sm font-medium whitespace-nowrap border-l border-slate-200 ${tab === "stock" ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
              📊 ยอดคงเหลือ ({fmtQty(balLoaded ? balances.length : (health?.balances_total ?? 0))})
            </button>
            <button onClick={() => setTab("reorder")}
              className={`h-9 px-4 text-sm font-medium whitespace-nowrap border-l border-slate-200 ${tab === "reorder" ? "bg-amber-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
              ⚠️ จุดสั่งซื้อ {reorder.length > 0 && <span className={`ml-1 px-1.5 rounded-full text-[10px] ${tab === "reorder" ? "bg-white/25" : "bg-amber-100 text-amber-700"}`}>{reorder.length}</span>}
            </button>
          </div>

          <div className="flex-1" />
          {tab === "stock" && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={showLowOnly} onChange={e => setShowLowOnly(e.target.checked)} className="rounded border-slate-300" />
              เฉพาะ Out of Stock
            </label>
          )}
          {tab === "stock" && (
            <label className="flex items-center gap-2 text-xs text-red-700">
              <input type="checkbox" checked={negOnly} onChange={e => setNegOnly(e.target.checked)} className="rounded border-slate-300" />
              เฉพาะยอดติดลบ
            </label>
          )}
        </div>

        {/* แท็บกรองคลัง (โซน) — คลิกง่ายกว่า dropdown */}
        {tab !== "overview" && <div className="mb-4 flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-400 mr-0.5">คลัง:</span>
          <button onClick={() => setFilterWh(null)}
            className={`h-8 px-3 text-xs font-medium rounded-lg border transition-colors ${filterWh === null ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            ทั้งหมด
          </button>
          {whTabs.map((w) => (
            <button key={w.id} onClick={() => setFilterWh(w.id)} title={w.code}
              className={`h-8 px-3 text-xs font-medium rounded-lg border transition-colors ${filterWh === w.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
              {KIND_EMOJI[w.kind] ?? "📦"} {w.name}
            </button>
          ))}
        </div>}

        {/* Summary cards (stock tab) */}
        {tab === "stock" && (
          <div className={`grid ${canCost ? "grid-cols-3" : "grid-cols-2"} gap-2 md:gap-3 mb-4`}>
            <div className="p-3 bg-gradient-to-br from-blue-50 to-white border border-blue-200 rounded-xl">
              <p className="text-[10px] text-blue-600 uppercase">SKU ที่มี stock</p>
              <p className="text-xl font-bold text-blue-700 tabular-nums">{balances.length}</p>
            </div>
            {canCost && <div className="p-3 bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-xl">
              <p className="text-[10px] text-emerald-600 uppercase">มูลค่ารวม</p>
              <p className="text-base md:text-xl font-bold text-emerald-700 tabular-nums font-mono truncate">{fmtMoney(summary.totalValue)}</p>
            </div>}
            <div className="p-3 bg-gradient-to-br from-red-50 to-white border border-red-200 rounded-xl">
              <p className="text-[10px] text-red-600 uppercase">Out of Stock</p>
              <p className="text-xl font-bold text-red-700 tabular-nums">{summary.outOfStock}</p>
            </div>
          </div>
        )}

        {tab === "overview" ? null : tab === "movements" ? (
          <>
          {movesTotal !== null && movesTotal > moves.length && (
            <div className="mb-2 flex items-center gap-2 flex-wrap text-xs text-slate-600">
              <span>โหลดมาแล้ว {fmtQty(moves.length)} จาก {fmtQty(movesTotal)} รายการ (ล่าสุดก่อน) · ช่องค้นหาค้นเฉพาะที่โหลดแล้ว</span>
              <button onClick={() => void loadMoreMoves()} disabled={moreBusy}
                className="h-7 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50">
                {moreBusy ? "กำลังโหลด…" : `โหลดเพิ่มอีก ${fmtQty(Math.min(MOVES_PAGE, movesTotal - moves.length))}`}
              </button>
            </div>
          )}
          <DataTable
            tableId="inventory-movements"
            data={moves}
            columns={moveCols}
            loading={loading}
            searchableKeys={["movement_number", "product_sku", "product_name", "reference_label"]}
            searchPlaceholder="ค้นหา SM / SKU / สินค้า / อ้างอิง..."
            exportFilename="stock-movements"
            exportEntityType="erp_playground_stock_movement"
            canCheck={(p) => can(p as Parameters<typeof can>[0])}
            rowActions={[
              { label: "ดูรายละเอียด", icon: "📜", onClick: (m: StockMovement) => setMoveDetail(m) },
              ...(canCreate ? [
                { label: "กลับรายการ (ลงผิด)", icon: "↩", onClick: (m: StockMovement) => setRevTarget(m), show: (m: StockMovement) => canReverse(m) },
              ] : []),
            ]}
            pageSize={20}
          />
          </>
        ) : tab === "stock" ? (
          <>
          {!filterWh && !showLowOnly && health && health.balances_total > balances.length && balLoaded && (
            <p className="mb-2 text-xs text-slate-500">แสดง {fmtQty(balances.length)} จาก {fmtQty(health.balances_total)} รายการ — เลือกคลังด้านบนเพื่อดูครบ</p>
          )}
          <DataTable
            tableId="inventory-balances"
            enableCards
            cardConfig={{ primary: "product_name", subtitle: "product_sku", image: "image_url", metrics: ["qty_on_hand", "qty_available"], lines: ["warehouse_name", "parent_code", "location_code"], layout: "horizontal", imageHeight: "sm", imageAspect: "square", columns: "1" }}
            data={negOnly ? balances.filter((b) => b.qty_on_hand < 0) : balances}
            columns={balanceCols}
            loading={loading}
            searchableKeys={["product_sku", "product_name", "parent_code", "warehouse_name"]}
            searchPlaceholder="ค้นหา SKU / สินค้า / รุ่น / คลัง..."
            exportFilename="stock-balances"
            exportEntityType="erp_playground_stock_balance"
            canCheck={(p) => can(p as Parameters<typeof can>[0])}
            rowActions={[
              { label: "ดูที่มา/ประวัติ", icon: "📜", onClick: (b: StockBalance) => openBalHist(b) },
              ...(canAdjust ? [
                { label: "ตั้งชั้นวาง", icon: "📍", onClick: (b: StockBalance) => openLocModal(b) },
                { label: "ตั้งจุดสั่งซื้อ", icon: "⚙", onClick: (b: StockBalance) => openMinFromBalance(b) },
              ] : []),
            ]}
            pageSize={30}
          />
          </>
        ) : (
          <>
            {!loading && reorder.length === 0 && (
              <div className="px-4 py-12 bg-white border border-dashed border-emerald-300 rounded-xl text-center">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-sm text-emerald-700 font-medium">ไม่มีสินค้าที่ถึงจุดสั่งซื้อ</p>
                <p className="text-xs text-slate-400 mt-1">ตั้งค่า &ldquo;จุดสั่งซื้อ&rdquo; ในแท็บ Stock Balance หรือกดปุ่ม ⚙ ในรายการเพื่อเริ่มเฝ้าระวัง</p>
              </div>
            )}
            {(loading || reorder.length > 0) && (
              <DataTable
                tableId="inventory-reorder"
                data={reorder}
                columns={reorderCols}
                loading={loading}
                searchableKeys={["sku", "name"]}
                searchPlaceholder="ค้นหา SKU / สินค้า..."
                exportFilename="reorder-list"
                exportEntityType="erp_playground_reorder"
                canCheck={(p) => can(p as Parameters<typeof can>[0])}
                rowActions={canAdjust ? [
                  { label: "ตั้งจุดสั่งซื้อ", icon: "⚙", onClick: (r) => openMinModal(r) },
                ] : []}
                pageSize={30}
              />
            )}
          </>
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
              <SkuPicker value={product} onChange={setProduct} />
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

          {movType === "adjust" && adjustCurrent != null && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              ยอดปัจจุบันในคลังนี้: <span className="font-mono font-semibold">{fmtQty(adjustCurrent)}</span> — กรอกจำนวนใหม่ที่นับได้ด้านล่าง
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

      {/* Set min stock modal (จุดสั่งซื้อ) */}
      <ERPModal open={minModal !== null} onClose={() => !minSaving && setMinModal(null)} size="sm"
        title="⚙ ตั้งจุดสั่งซื้อ"
        footer={
          <>
            <button onClick={() => setMinModal(null)} disabled={minSaving}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
            <button onClick={saveMin} disabled={minSaving}
              className="h-9 px-4 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {minSaving ? "..." : "บันทึก"}
            </button>
          </>
        }>
        {minModal && (
          <div className="space-y-3">
            <div className="text-sm text-slate-700">
              <span className="font-mono text-xs text-slate-400">{minModal.sku}</span> {minModal.name}
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">จุดสั่งซื้อ (min stock) — เตือนเมื่อคงเหลือ ≤ ค่านี้</span>
              <input type="number" value={minVal} onChange={e => setMinVal(e.target.value)} step="any" min="0"
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">จำนวนสั่งเติม (reorder qty) — เว้น 0 = แนะนำ 2 เท่าของจุดสั่งซื้อ</span>
              <input type="number" value={reorderVal} onChange={e => setReorderVal(e.target.value)} step="any" min="0"
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>
            <div className="text-[10px] text-slate-400 bg-amber-50 p-2 rounded">
              💡 ตั้ง min stock = 0 เพื่อหยุดเฝ้าระวังสินค้านี้
            </div>
          </div>
        )}
      </ERPModal>

      {/* Set location modal (ตั้งชั้นวาง) */}
      <ERPModal open={locModal !== null} onClose={() => !locSaving && setLocModal(null)} size="sm"
        title="📍 ตั้งชั้นวาง / ตำแหน่ง"
        footer={
          <>
            <button onClick={() => setLocModal(null)} disabled={locSaving}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
            <button onClick={saveLoc} disabled={locSaving}
              className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {locSaving ? "..." : "บันทึก"}
            </button>
          </>
        }>
        {locModal && (
          <div className="space-y-3">
            <div className="text-sm text-slate-700">
              <span className="font-mono text-xs text-slate-400">{locModal.product_sku}</span> {locModal.product_name}
              <div className="text-xs text-slate-400 mt-0.5">คลัง: {locModal.warehouse_name}</div>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">รหัสชั้นวาง / ตำแหน่ง</span>
              <input value={locVal} onChange={e => setLocVal(e.target.value)} autoFocus
                placeholder="เช่น A-01-03, ชั้น 2 โซน B"
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>
            <div className="text-[10px] text-slate-400 bg-slate-50 p-2 rounded">
              💡 ตำแหน่งหลักของสินค้านี้ในคลังนี้ — เว้นว่างเพื่อลบชั้นวาง
            </div>
          </div>
        )}
      </ERPModal>
      {/* ที่มาของ movement (คลิกคลัง A→B) — จ่ายงานให้โต๊ะ/ช่างไหน / ใบรับของ */}
      <ERPModal open={moveDetail !== null} onClose={() => setMoveDetail(null)} size="md" title="📜 รายละเอียดการเคลื่อนไหว">
        {moveDetail && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-slate-400">ประเภท</span><div className="text-sm">{MOVE_TYPE[moveDetail.movement_type]?.icon} {MOVE_TYPE[moveDetail.movement_type]?.label}</div></div>
              <div><span className="text-slate-400">วันที่</span><div className="text-sm">{moveDetail.movement_date}</div></div>
              <div className="col-span-2"><span className="text-slate-400">สินค้า</span><div className="text-sm"><code className="text-[11px] text-slate-500">{moveDetail.product_sku}</code> {moveDetail.product_name}</div></div>
              <div><span className="text-slate-400">จำนวน</span><div className="text-sm font-mono">{fmtQty(moveDetail.qty)} {moveDetail.unit}</div></div>
              <div><span className="text-slate-400">คลัง</span><div className="text-sm">{moveDetail.from_warehouse_code ?? ""}{moveDetail.from_warehouse_code && moveDetail.to_warehouse_code ? " → " : ""}{moveDetail.to_warehouse_code ?? ""}</div></div>
              <div><span className="text-slate-400">อ้างอิง</span><div className="text-sm">{moveDetail.reference_label ?? "—"}</div></div>
              <div><span className="text-slate-400">ผู้ทำ</span><div className="text-sm">{moveDetail.performed_by ?? "—"}</div></div>
            </div>
            {refDetail?.kind === "dispatch" && (
              <div className="border-t border-slate-100 pt-3">
                <div className="text-xs font-medium text-slate-600 mb-1.5">👷 จ่ายงานให้ {refDetail.mo_no && <span className="text-slate-400">(MO {refDetail.mo_no})</span>}</div>
                {(refDetail.workers ?? []).length === 0 ? <div className="text-xs text-slate-400">— ไม่มีข้อมูลใบจ่ายงาน —</div> : (
                  <div className="space-y-1">{(refDetail.workers ?? []).map((w, i) => (
                    <div key={i} className="flex justify-between items-center text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                      <span>🪑 {w.assignee_name ?? "—"}{w.stage && <span className="text-slate-400"> · {w.stage}</span>}</span>
                      <span className="font-mono text-slate-500">{fmtQty(w.qty)} ชิ้น</span>
                    </div>))}</div>
                )}
              </div>
            )}
            {refDetail?.kind === "qc" && refDetail.wo && (
              <div className="border-t border-slate-100 pt-3 text-xs">
                <div className="font-medium text-slate-600 mb-1">👷 จากใบจ่ายงาน</div>
                <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">🪑 {String((refDetail.wo).assignee_name ?? "—")} · MO {String((refDetail.wo).mo_no ?? "")}</div>
              </div>
            )}
            {refDetail?.kind === "receipt" && refDetail.gr && (
              <div className="border-t border-slate-100 pt-3 text-xs">
                <div className="font-medium text-slate-600 mb-1">📥 จากใบรับของ</div>
                <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">{String((refDetail.gr).gr_no ?? "")} · PO {String((refDetail.gr).po_no ?? "")} · {String((refDetail.gr).seller_name ?? "")}</div>
              </div>
            )}
            {/* ↩ ลงผิด → กลับรายการ (สต๊อกไม่ให้แก้/ลบประวัติ) */}
            {canCreate && (
              <div className="border-t border-slate-100 pt-3">
                {canReverse(moveDetail) ? (
                  <button onClick={() => setRevTarget(moveDetail)}
                    className="h-8 px-3 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50">↩ กลับรายการนี้ (ลงผิด)</button>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    {moveDetail.reference_type === "reversal" ? "รายการนี้คือรายการกลับของรายการที่ลงผิด"
                      : reversedIds.has(moveDetail.id) ? "รายการนี้ถูกกลับไปแล้ว"
                      : moveDetail.movement_type === "adjust" && !moveDetail.reference_type ? "รายการปรับยอดกลับอัตโนมัติไม่ได้ — ถ้าปรับผิด ให้กด “ปรับยอด” อีกครั้งแล้วใส่ยอดที่ถูก"
                      : "รายการนี้มาจากเอกสารอื่น — ถ้าผิดต้องแก้ที่เอกสารต้นทาง (ใบรับของ / ใบสั่งผลิต / ใบนับสต๊อก)"}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </ERPModal>

      <ConfirmDialog open={revTarget !== null} onClose={() => { if (!revBusy) setRevTarget(null); }} onConfirm={() => void doReverse()} loading={revBusy}
        variant="danger" title="กลับรายการนี้?" confirmText="↩ กลับรายการ" cancelText="ไม่กลับ"
        message={revTarget ? `${revTarget.movement_number ?? ""} · ${MOVE_TYPE[revTarget.movement_type]?.label ?? ""} ${revTarget.product_sku ?? ""} จำนวน ${fmtQty(revTarget.qty)} — ระบบจะลงรายการตรงข้ามให้ยอดสต๊อกกลับเท่าเดิม รายการเดิมยังอยู่ในประวัติ (ไม่ถูกลบ)` : ""} />

      {/* ประวัติ/ที่มาของยอดคงเหลือ (คลิก balance) */}
      <ERPModal open={balHist !== null} onClose={() => setBalHist(null)} size="lg"
        title={balHist ? `📜 ที่มา/ประวัติ — ${balHist.product_sku}` : ""}
        description={balHist ? `${balHist.warehouse_name} · คงเหลือ ${fmtQty(balHist.qty_on_hand)} ${balHist.uom ?? ""}` : undefined}>
        {balMoves.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">ยังไม่มีการเคลื่อนไหวในคลังนี้</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-400 border-b border-slate-100">
                <th className="text-left px-2 py-1.5">วันที่</th><th className="text-left px-2 py-1.5">ประเภท</th><th className="text-left px-2 py-1.5">คลัง</th><th className="text-right px-2 py-1.5">จำนวน</th><th className="text-left px-2 py-1.5">อ้างอิง</th>
              </tr></thead>
              <tbody>{balMoves.map((m) => (
                <tr key={m.id} className="border-b border-slate-50">
                  <td className="px-2 py-1.5">{m.movement_date}</td>
                  <td className="px-2 py-1.5">{MOVE_TYPE[m.movement_type]?.icon} {MOVE_TYPE[m.movement_type]?.label}</td>
                  <td className="px-2 py-1.5">{m.from_warehouse_code ?? ""}{m.from_warehouse_code && m.to_warehouse_code ? "→" : ""}{m.to_warehouse_code ?? ""}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmtQty(m.qty)} {m.unit}</td>
                  <td className="px-2 py-1.5 text-slate-500">{m.reference_label ?? "—"}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </ERPModal>

      {peekSku && <SkuDrawer moduleKey="skus-v2" recordId={peekSku} onClose={() => setPeekSku(null)} />}
    </PlaygroundShell>
  );
}
