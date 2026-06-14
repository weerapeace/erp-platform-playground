"use client";

/**
 * โกดัง QC — เฟส 1+2 (ข้อมูลจริง)
 * เฟส 1: คิวรอ QC (mo_work_orders) · รับเข้า/ย้าย/ส่งออก/เสีย/ซ่อม/คืนคิว · จัดการชั้น/สาเหตุ (API + audit + qc.*)
 * เฟส 2: 3 มุมมอง (บอร์ด/ตาราง/คิวงาน) · รูปสินค้าบนการ์ด · ปุ่มย้ายชั้นบนการ์ด · overflow เกิน 20 ใบ → "+เพิ่มเติม"
 * (สีแบรนด์จริง + งานลูกค้า + badge งานเหมา + ประวัติของเสียจริง = เฟส 3-4)
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { usePermission, AccessDenied } from "@/components/auth";
import { SkuPicker } from "@/components/pickers";
import type { SkuPickerValue } from "@/components/pickers";
import { apiFetch } from "@/lib/api";
import type { QcShelf, QcItem, QcReason, QcSource, QcQueueCard } from "@/app/api/qc-warehouse/route";
import type { DefectLog } from "@/app/api/qc-warehouse/defect-history/route";

// "ผลิต" สำหรับของจากการผลิต · โค้ดเดิม (stock/purchase…) แปลไทย · ที่เหลือ = ชื่อที่ตั้งเอง
const sourceLabel = (s?: string | null) => !s || s === "production" ? "ผลิต" : s === "stock" ? "สต็อกเดิม" : s === "purchase" ? "ซื้อมา" : s === "return" ? "รับคืน" : s === "other" ? "อื่นๆ" : s;

const WAREHOUSES = ["โกดังขายหลัก", "โกดังสาขา 1", "โกดังออนไลน์ (E-commerce)"];
const PALETTE = ["#60a5fa", "#34d399", "#f472b6", "#fb923c", "#a78bfa", "#22d3ee", "#facc15"];
const SHELF_CAP = 20;   // โชว์ไม่เกิน 20 ใบต่อชั้น ที่เหลือกด "+เพิ่มเติม"
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const num = (v: number | string) => Math.max(0, Math.floor(Number(v) || 0));
const prodColor = (sku: string | null) => { let h = 0; for (const c of sku ?? "") h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
// สีการ์ด = สีแบรนด์จริงถ้ามี, ไม่งั้นสีสุ่มตามรหัส
const cardColor = (brand?: string | null, sku?: string | null) => brand || prodColor(sku ?? null);
const dueText = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : null;
const imgUrl = (k?: string | null) => k ? `/api/r2-image?key=${encodeURIComponent(k)}` : null;
const daysLeft = (d: string | null): number | null => { if (!d) return null; const t = new Date(); t.setHours(0, 0, 0, 0); return Math.floor((new Date(d + "T00:00:00").getTime() - t.getTime()) / 86400000); };
function dueBadge(d: string | null): { t: string; c: string } | null {
  const n = daysLeft(d); if (n == null) return null;
  if (n < 0) return { t: `⏰ เลย ${-n} วัน`, c: "bg-rose-100 text-rose-700" };
  if (n <= 3) return { t: `🔴 ด่วน · ${n} วัน`, c: "bg-rose-100 text-rose-700" };
  if (n <= 7) return { t: `🟧 ${n} วัน`, c: "bg-amber-100 text-amber-700" };
  return { t: `${n} วัน`, c: "bg-slate-100 text-slate-500" };
}
function statusBadge(s: string): { t: string; c: string } {
  if (s === "defect") return { t: "ของเสีย", c: "bg-rose-100 text-rose-700" };
  if (s === "repairing") return { t: "กำลังซ่อม", c: "bg-amber-100 text-amber-700" };
  return { t: "ของดี", c: "bg-emerald-100 text-emerald-700" };
}

type ShelfWithItems = QcShelf & { items: QcItem[] };
type BadRow = { id: string; reasonId: string; qty: number };
const rid = () => Math.random().toString(36).slice(2, 9);

function Thumb({ k, color, size = 44 }: { k?: string | null; color: string; size?: number }) {
  const u = imgUrl(k);
  return u
    ? <img src={u} alt="" className="rounded-md object-cover border border-slate-200 shrink-0" style={{ width: size, height: size }} />
    : <div className="rounded-md shrink-0 border border-slate-200 flex items-center justify-center text-white text-[9px] font-medium" style={{ width: size, height: size, background: color }}>รูป</div>;
}

export default function QcWarehousePage() {
  const canView = usePermission("qc.view");
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [shelves, setShelves] = useState<ShelfWithItems[]>([]);
  const [queue, setQueue] = useState<QcQueueCard[]>([]);
  const [reasons, setReasons] = useState<QcReason[]>([]);
  const [sources, setSources] = useState<QcSource[]>([]);
  const [sourceMgr, setSourceMgr] = useState(false);
  const [newSource, setNewSource] = useState("");
  const [view, setView] = useState<"board" | "table" | "queue">("board");
  const [tableSearch, setTableSearch] = useState("");
  const [histOpen, setHistOpen] = useState(false);
  const [histSearch, setHistSearch] = useState("");
  const [histRows, setHistRows] = useState<DefectLog[]>([]);
  const [skuHist, setSkuHist] = useState<DefectLog[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/qc-warehouse"); const j = await res.json();
      if (j.error) throw new Error(j.error);
      const items = (j.items ?? []) as QcItem[];
      setShelves(((j.shelves ?? []) as QcShelf[]).map((s) => ({ ...s, items: items.filter((i) => i.shelf_id === s.id) })));
      setQueue((j.queue ?? []) as QcQueueCard[]);
      setReasons((j.reasons ?? []) as QcReason[]);
      setSources((j.sources ?? []) as QcSource[]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const defectShelf = useMemo(() => shelves.find((s) => s.kind === "defect") ?? null, [shelves]);
  const storeShelves = useMemo(() => shelves.filter((s) => s.kind === "store"), [shelves]);
  const reasonName = useCallback((id: string) => reasons.find((r) => r.id === id)?.name ?? "ไม่ระบุ", [reasons]);
  const allItems = useMemo(() => shelves.flatMap((s) => s.items.map((i) => ({ ...i, shelfName: s.name, shelfKind: s.kind }))), [shelves]);
  const loadHist = useCallback(async (search: string) => {
    try { const r = await apiFetch(`/api/qc-warehouse/defect-history?search=${encodeURIComponent(search)}`); const j = await r.json(); setHistRows(j.data ?? []); } catch { /* ignore */ }
  }, []);
  const tsText = (s: string) => { try { return new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }); } catch { return s; } };
  const sortedQueue = useMemo(() => [...queue].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")), [queue]);

  const act = useCallback(async (path: string, body: Record<string, unknown>): Promise<boolean> => {
    try { const res = await apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await res.json(); if (j.error) throw new Error(j.error); await load(); return true; }
    catch (e) { toast.error(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ"); return false; }
  }, [load, toast]);
  const reqJson = useCallback(async (path: string, method: string, body?: Record<string, unknown>): Promise<boolean> => {
    try { const res = await apiFetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const j = await res.json(); if (j.error) throw new Error(j.error); await load(); return true; }
    catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); return false; }
  }, [load, toast]);

  // drag/drop
  const [dragWo, setDragWo] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<{ shelfId: string; itemId: string } | null>(null);
  const [overShelf, setOverShelf] = useState<string | null>(null);

  // popups
  const [recv, setRecv] = useState<{ card: QcQueueCard; shelf: ShelfWithItems } | null>(null);
  const [recvGood, setRecvGood] = useState(0);
  const [recvBad, setRecvBad] = useState<BadRow[]>([]);
  const [reasonMgr, setReasonMgr] = useState(false);
  const [newReason, setNewReason] = useState("");
  const [ship, setShip] = useState<QcItem | null>(null);
  const [shipMode, setShipMode] = useState<"sell" | "sales_wh">("sales_wh");
  const [shipWh, setShipWh] = useState(WAREHOUSES[0]);
  const [toDefect, setToDefect] = useState<QcItem | null>(null);
  const [tdQty, setTdQty] = useState(0);
  const [tdReason, setTdReason] = useState("");
  const [repair, setRepair] = useState<QcItem | null>(null);
  const [repairBy, setRepairBy] = useState("");
  const [fromRepair, setFromRepair] = useState<QcItem | null>(null);
  const [frGood, setFrGood] = useState(0);
  const [frScrap, setFrScrap] = useState(0);
  const [frShelf, setFrShelf] = useState("");
  const [detail, setDetail] = useState<{ kind: "queue"; card: QcQueueCard } | { kind: "item"; shelf: ShelfWithItems; item: QcItem } | null>(null);
  const [movePick, setMovePick] = useState<QcItem | null>(null);          // ปุ่มย้ายชั้นบนการ์ด
  const [overflowShelf, setOverflowShelf] = useState<ShelfWithItems | null>(null);  // ดูของเกิน 20
  const [shelfModal, setShelfModal] = useState<{ mode: "add" } | { mode: "edit"; shelf: ShelfWithItems } | null>(null);
  const [shelfName, setShelfName] = useState("");
  const [shelfKind, setShelfKind] = useState<"store" | "defect">("store");
  const [delShelf, setDelShelf] = useState<ShelfWithItems | null>(null);
  // ใส่ของเข้าชั้นเอง (ยอดยกมา/ไม่ได้มาจากผลิต)
  const [addOpen, setAddOpen] = useState(false);
  const [addShelfId, setAddShelfId] = useState("");
  const [addPickShelf, setAddPickShelf] = useState(false);   // true = เปิดจากปุ่มกลาง (เลือกชั้นในป๊อปอัป)
  const [addMode, setAddMode] = useState<"single" | "bulk">("single");
  const [addSku, setAddSku] = useState<SkuPickerValue | null>(null);
  const [addQty, setAddQty] = useState(1);
  const [addSource, setAddSource] = useState("stock");
  const [addBulk, setAddBulk] = useState("");

  // ดึงประวัติของเสียของ SKU ที่กำลังเปิดดูรายละเอียด
  useEffect(() => {
    const sku = detail ? (detail.kind === "queue" ? detail.card.sku : detail.item.sku) : null;
    if (!sku) { setSkuHist([]); return; }
    let cancel = false;
    apiFetch(`/api/qc-warehouse/defect-history?sku=${encodeURIComponent(sku)}`).then((r) => r.json()).then((j) => { if (!cancel) setSkuHist(j.data ?? []); }).catch(() => {});
    return () => { cancel = true; };
  }, [detail]);

  const openReceive = (card: QcQueueCard, shelf: ShelfWithItems) => { setRecv({ card, shelf }); setRecvGood(card.remaining); setRecvBad([]); };
  const recvBadTotal = useMemo(() => recvBad.reduce((s, r) => s + num(r.qty), 0), [recvBad]);
  const submitReceive = async () => {
    if (!recv) return;
    const badRows = recvBad.filter((r) => num(r.qty) > 0);
    if (badRows.some((r) => !r.reasonId)) { toast.error("เลือกสาเหตุของเสียให้ครบ"); return; }
    if (await act("/api/qc-warehouse/items", { action: "receive", wo_id: recv.card.wo_id, shelf_id: recv.shelf.id, good: num(recvGood), bad: badRows.map((r) => ({ reason: reasonName(r.reasonId), qty: num(r.qty) })) })) { toast.success("รับเข้าแล้ว"); setRecv(null); }
  };
  const onDropShelf = async (shelf: ShelfWithItems) => {
    setOverShelf(null);
    if (dragItem) { const di = dragItem; setDragItem(null); if (shelf.kind === "defect") { toast.error("ย้ายเข้าชั้นของเสียโดยตรงไม่ได้"); return; } if (di.shelfId !== shelf.id) await act("/api/qc-warehouse/items", { action: "move", item_id: di.itemId, shelf_id: shelf.id }); return; }
    const card = queue.find((c) => c.wo_id === dragWo); setDragWo(null);
    if (!card) return;
    if (shelf.kind === "defect") { toast.error("ลากเข้าชั้นเก็บปกติก่อน"); return; }
    openReceive(card, shelf);
  };
  const moveItem = async (item: QcItem, shelfId: string) => { if (await act("/api/qc-warehouse/items", { action: "move", item_id: item.id, shelf_id: shelfId })) toast.success("ย้ายชั้นแล้ว"); };
  const submitShip = async () => { if (!ship) return; if (await act("/api/qc-warehouse/items", { action: "ship", item_id: ship.id, mode: shipMode, wh: shipMode === "sales_wh" ? shipWh : null })) { toast.success("ส่งออกแล้ว"); setShip(null); } };
  const openToDefect = (item: QcItem) => { if (!defectShelf) { toast.error("ยังไม่มีชั้นของเสีย"); return; } setToDefect(item); setTdQty(item.qty); setTdReason(reasons[0]?.id ?? ""); };
  const submitToDefect = async () => { if (!toDefect) return; if (await act("/api/qc-warehouse/items", { action: "to_defect", item_id: toDefect.id, qty: num(tdQty), reason: reasonName(tdReason) })) { toast.success("ย้ายไปของเสียแล้ว"); setToDefect(null); } };
  const openRepair = (item: QcItem) => { setRepair(item); setRepairBy(item.repair_by || item.worker || ""); };
  const submitRepair = async () => { if (!repair) return; if (await act("/api/qc-warehouse/items", { action: "repair_send", item_id: repair.id, repair_by: repairBy })) { toast.success("ส่งซ่อมแล้ว"); setRepair(null); } };
  const cancelRepair = (item: QcItem) => act("/api/qc-warehouse/items", { action: "repair_cancel", item_id: item.id });
  const openFromRepair = (item: QcItem) => { setFromRepair(item); setFrGood(item.qty); setFrScrap(0); setFrShelf(storeShelves[0]?.id ?? ""); };
  const submitFromRepair = async () => { if (!fromRepair) return; if (await act("/api/qc-warehouse/items", { action: "repair_receive", item_id: fromRepair.id, good: num(frGood), scrap: num(frScrap), shelf_id: frShelf })) { toast.success("รับจากซ่อมแล้ว"); setFromRepair(null); } };
  const returnQueue = async (item: QcItem) => { if (await act("/api/qc-warehouse/items", { action: "return_queue", item_id: item.id })) { toast.success("ย้ายกลับงานรอ QC แล้ว"); setDetail(null); } };

  const openAddShelf = () => { setShelfName(""); setShelfKind("store"); setShelfModal({ mode: "add" }); };
  const openEditShelf = (shelf: ShelfWithItems) => { setShelfName(shelf.name); setShelfKind(shelf.kind); setShelfModal({ mode: "edit", shelf }); };
  const submitShelf = async () => {
    if (!shelfModal) return; const name = shelfName.trim(); if (!name) { toast.error("ใส่ชื่อชั้นก่อน"); return; }
    const ok = shelfModal.mode === "add" ? await reqJson("/api/qc-warehouse/shelves", "POST", { name, kind: shelfKind }) : await reqJson("/api/qc-warehouse/shelves", "PATCH", { id: shelfModal.shelf.id, name, kind: shelfKind });
    if (ok) { toast.success("บันทึกชั้นแล้ว"); setShelfModal(null); }
  };
  const confirmDelShelf = async () => { if (!delShelf) return; if (await reqJson(`/api/qc-warehouse/shelves?id=${delShelf.id}`, "DELETE")) { toast.success("ลบชั้นแล้ว"); setDelShelf(null); } };

  // ── ใส่ของเข้าชั้นเอง ──
  const openAddManual = (shelfId: string) => { setAddPickShelf(shelfId === ""); setAddShelfId(shelfId || storeShelves[0]?.id || ""); setAddMode("single"); setAddSku(null); setAddQty(1); setAddSource(sources[0]?.name ?? ""); setAddBulk(""); setAddOpen(true); };
  // จัดการที่มา (เพิ่ม/แก้/ลบ)
  const addSourceItem = async () => { const name = newSource.trim(); if (!name) return; if (await reqJson("/api/qc-warehouse/sources", "POST", { name })) setNewSource(""); };
  const editSource = (id: string, name: string) => setSources((ss) => ss.map((s) => s.id === id ? { ...s, name } : s));
  const saveSource = (id: string, name: string) => reqJson("/api/qc-warehouse/sources", "PATCH", { id, name });
  const removeSource = (id: string) => reqJson(`/api/qc-warehouse/sources?id=${id}`, "DELETE");
  const submitAddManual = async () => {
    const shelf_id = addShelfId || storeShelves[0]?.id || "";
    if (!shelf_id) { toast.error("เลือกชั้นก่อน"); return; }
    if (addMode === "single") {
      if (!addSku) { toast.error("เลือกสินค้าก่อน"); return; }
      if (await act("/api/qc-warehouse/items", { action: "add_manual", shelf_id, sku: addSku.code, sku_name: addSku.name, qty: num(addQty), source: addSource })) { toast.success("เพิ่มของแล้ว"); setAddOpen(false); }
    } else {
      const rows = addBulk.split("\n").map((line) => { const p = line.split(/[,\t]/); return { sku: (p[0] ?? "").trim(), qty: num(p[1] ?? 0) }; }).filter((r) => r.sku && r.qty > 0);
      if (rows.length === 0) { toast.error("ใส่รายการ (SKU, จำนวน) อย่างน้อย 1 บรรทัด"); return; }
      if (await act("/api/qc-warehouse/items", { action: "add_bulk", shelf_id, source: addSource, rows })) { toast.success(`นำเข้า ${rows.length} รายการแล้ว`); setAddOpen(false); }
    }
  };
  const addReason = async () => { const name = newReason.trim(); if (!name) return; if (await reqJson("/api/qc-warehouse/reasons", "POST", { name })) setNewReason(""); };
  const editReason = (id: string, name: string) => setReasons((rs) => rs.map((r) => r.id === id ? { ...r, name } : r));
  const saveReason = (id: string, name: string) => reqJson("/api/qc-warehouse/reasons", "PATCH", { id, name });
  const removeReason = (id: string) => reqJson(`/api/qc-warehouse/reasons?id=${id}`, "DELETE");

  if (!canView) return <AccessDenied />;

  // ── การ์ดของในชั้น (ใช้ทั้งบอร์ด + overflow popup) ──
  const renderItemCard = (shelf: ShelfWithItems, i: QcItem, draggable: boolean) => {
    const isDefect = shelf.kind === "defect";
    return (
      <div key={i.id} onClick={() => setDetail({ kind: "item", shelf, item: i })}
        draggable={draggable && !isDefect}
        onDragStart={draggable && !isDefect ? (e) => { e.stopPropagation(); setDragItem({ shelfId: shelf.id, itemId: i.id }); setDragWo(null); } : undefined}
        onDragEnd={() => setDragItem(null)}
        className={`rounded-lg bg-white border border-slate-200 shadow-sm p-2 cursor-pointer hover:border-indigo-300 ${draggable && !isDefect ? "active:cursor-grabbing" : ""} ${dragItem?.itemId === i.id ? "opacity-50" : ""}`}
        style={{ borderLeft: `4px solid ${cardColor(i.brand_color, i.sku)}` }}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-slate-800 leading-snug truncate">{i.sku_name}</div>
            <div className="text-[11px] text-slate-500 font-mono">{i.sku} · {i.mo_no}</div>
            <div className="text-[11px] text-slate-500">👷 {i.worker ?? "—"}</div>
            {i.is_customer_job && <span className="inline-block text-[10px] rounded px-1.5 py-0.5 bg-violet-100 text-violet-700 mt-0.5">👤 งานลูกค้า</span>}
            {isDefect && i.reason && <div className="text-[11px] text-rose-600 mt-0.5">⚠️ {i.reason}</div>}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Thumb k={i.image_key} color={cardColor(i.brand_color, i.sku)} />
            <span className="text-xs font-bold text-slate-700">{fmt(Number(i.qty))}</span>
          </div>
        </div>
        {isDefect ? (
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
            {i.status === "repairing" ? (<>
              <span className="text-[10px] text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">🔧 ซ่อม: {i.repair_by}</span>
              <button onClick={() => openFromRepair(i)} className="text-[11px] px-2 py-1 rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50">📥 รับจากซ่อม</button>
              <button onClick={() => void cancelRepair(i)} className="text-[11px] px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50">ยกเลิกซ่อม</button>
            </>) : (
              <button onClick={() => openRepair(i)} className="text-[11px] px-2 py-1 rounded-md border border-amber-200 text-amber-700 hover:bg-amber-50">🔧 ส่งซ่อม</button>
            )}
          </div>
        ) : (
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setShip(i); setShipMode("sales_wh"); setShipWh(WAREHOUSES[0]); }} className="text-[11px] px-2 py-1 rounded-md border border-indigo-200 text-indigo-700 hover:bg-indigo-50">📤 ส่งออก</button>
            <button onClick={() => setMovePick(i)} className="text-[11px] px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">↔️ ย้ายชั้น</button>
            <button onClick={() => openToDefect(i)} className="text-[11px] px-2 py-1 rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50">⚠️ เสีย</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-[1700px] mx-auto px-5 py-5">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">🏭 โกดัง QC</h1>
          <p className="text-sm text-slate-500 mt-0.5">งานรอ QC ส่งคืนจากบอร์ดจ่ายงาน → ลากเข้าชั้น แยกดี/เสีย · คลิกการ์ดดูรายละเอียด</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            {(["board", "table", "queue"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`h-8 px-3 text-sm rounded-md ${view === v ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
                {v === "board" ? "🗄️ บอร์ด" : v === "table" ? "📋 ตาราง" : "⏱️ คิวงาน"}</button>
            ))}
          </div>
          <button onClick={() => { setHistSearch(""); setHistOpen(true); void loadHist(""); }} className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">📋 ประวัติของเสีย</button>
          <button onClick={() => void load()} className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">⟳</button>
        </div>
      </div>

      {loading ? <div className="text-center py-24 text-slate-400">กำลังโหลด…</div> : view === "board" ? (
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* คิวรอ QC */}
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-3 h-fit">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-base font-bold text-slate-700">📥 งานรอ QC</span>
            <span className="text-xs font-medium text-slate-500 bg-white rounded-full px-2 py-0.5 border border-slate-200">{queue.length}</span>
          </div>
          <div className="space-y-2.5">
            {queue.map((c) => { const db = dueBadge(c.due_date); return (
              <div key={c.wo_id} draggable onDragStart={() => setDragWo(c.wo_id)} onDragEnd={() => setDragWo(null)}
                onClick={() => setDetail({ kind: "queue", card: c })}
                className={`rounded-xl bg-white border shadow-sm p-2.5 cursor-grab active:cursor-grabbing select-none hover:border-indigo-300 ${dragWo === c.wo_id ? "opacity-50 rotate-1" : ""}`}
                style={{ borderLeft: `4px solid ${cardColor(c.brand_color, c.sku)}` }}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-slate-400 font-mono">{c.mo_no}</div>
                    <div className="text-sm font-semibold text-slate-800 leading-snug">{c.name}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{c.sku}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">👷 {c.worker ?? "—"}</div>
                  </div>
                  <Thumb k={c.image_key} color={cardColor(c.brand_color, c.sku)} />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-1 flex-wrap">
                  <div className="flex items-center gap-1 flex-wrap">
                    {c.is_customer_job && <span className="text-[10px] rounded px-1.5 py-0.5 bg-violet-100 text-violet-700">👤 งานลูกค้า</span>}
                    {c.is_subcontract && <span className="text-[10px] rounded px-1.5 py-0.5 bg-orange-100 text-orange-700">🧵 งานเหมา</span>}
                    {db && <span className={`text-[10px] rounded px-1.5 py-0.5 ${db.c}`}>{db.t}</span>}
                  </div>
                  <span className="text-xs font-bold text-indigo-600">เหลือรับ {fmt(c.remaining)}</span>
                </div>
              </div>
            ); })}
            {queue.length === 0 && <div className="text-center text-xs text-slate-400 py-10">ไม่มีงานรอ QC<br /><span className="text-[11px]">(งานเข้ามาเมื่อช่างส่งคืนจากบอร์ดจ่ายงาน)</span></div>}
          </div>
        </div>

        {/* ชั้นวาง */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between mb-3 px-1 gap-2 flex-wrap">
            <span className="text-base font-bold text-slate-700">ชั้นวางในโกดัง</span>
            <div className="flex items-center gap-2">
              <button onClick={() => openAddManual("")} className="h-9 px-3 text-sm font-medium border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50">➕ ใส่ของเข้าชั้น</button>
              <button onClick={openAddShelf} className="h-9 px-3 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">➕ เพิ่มชั้น</button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {shelves.map((shelf) => {
              const isDefect = shelf.kind === "defect";
              const total = shelf.items.reduce((s, i) => s + Number(i.qty), 0);
              const isOver = overShelf === shelf.id;
              const visible = shelf.items.slice(0, SHELF_CAP);
              const extra = shelf.items.length - visible.length;
              return (
                <div key={shelf.id}
                  onDragOver={(e) => { e.preventDefault(); if (!isDefect) setOverShelf(shelf.id); }}
                  onDragLeave={() => setOverShelf((v) => (v === shelf.id ? null : v))}
                  onDrop={(e) => { e.preventDefault(); void onDropShelf(shelf); }}
                  className={`rounded-2xl border-2 p-2.5 min-h-[180px] transition-colors ${isDefect ? "border-rose-200 bg-rose-50/40" : isOver ? "border-indigo-400 bg-indigo-50/60" : "border-slate-200 bg-slate-50/40"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 min-w-0"><span>{isDefect ? "🛠️" : "🗄️"}</span><span className="text-sm font-bold text-slate-700 truncate">{shelf.name}</span></div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[11px] text-slate-500 bg-white rounded-full px-1.5 py-0.5 border border-slate-200">{fmt(total)}</span>
                      {!isDefect && <button onClick={() => openAddManual(shelf.id)} title="ใส่ของเข้าชั้นนี้" className="text-slate-400 hover:text-indigo-600 px-1">➕</button>}
                      <button onClick={() => openEditShelf(shelf)} title="แก้" className="text-slate-400 hover:text-slate-700 px-1">✏️</button>
                      <button onClick={() => setDelShelf(shelf)} title="ลบ" className="text-slate-400 hover:text-rose-600 px-1">🗑️</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {visible.map((i) => renderItemCard(shelf, i, true))}
                    {extra > 0 && <button onClick={() => setOverflowShelf(shelf)} className="w-full text-[12px] py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:bg-white">+ อีก {extra} รายการ</button>}
                    {shelf.items.length === 0 && <div className="text-center text-[11px] text-slate-300 py-8">{isDefect ? "ไม่มีของเสีย" : "ลากการ์ดมาวางที่นี่"}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      ) : view === "table" ? (
        /* ── ตาราง ── */
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-3 border-b border-slate-100"><input value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} placeholder="ค้นหา SKU / ชื่อ / ชั้น / ช่าง…" className="w-full max-w-sm h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[12px] text-slate-500"><tr className="text-left">
              <th className="px-3 py-2 font-medium">รูป</th><th className="px-3 py-2 font-medium">SKU</th><th className="px-3 py-2 font-medium">สินค้า</th>
              <th className="px-3 py-2 font-medium">ชั้น</th><th className="px-3 py-2 font-medium text-right">จำนวน</th>
              <th className="px-3 py-2 font-medium">สถานะ</th><th className="px-3 py-2 font-medium">ช่าง</th><th className="px-3 py-2 font-medium">ใบผลิต</th>
            </tr></thead>
            <tbody>
              {allItems.filter((i) => { const q = tableSearch.trim().toLowerCase(); return !q || `${i.sku} ${i.sku_name} ${i.shelfName} ${i.worker}`.toLowerCase().includes(q); }).map((i) => {
                const sb = statusBadge(i.status);
                const shelf = shelves.find((s) => s.id === i.shelf_id);
                return (
                  <tr key={i.id} onClick={() => shelf && setDetail({ kind: "item", shelf, item: i })} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <td className="px-3 py-1.5"><Thumb k={i.image_key} color={prodColor(i.sku)} size={32} /></td>
                    <td className="px-3 py-1.5 font-mono text-[12px]">{i.sku}</td>
                    <td className="px-3 py-1.5 text-slate-700">{i.sku_name}</td>
                    <td className="px-3 py-1.5 text-slate-600">{i.shelfName}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{fmt(Number(i.qty))}</td>
                    <td className="px-3 py-1.5"><span className={`text-[10px] rounded px-1.5 py-0.5 ${sb.c}`}>{sb.t}{i.reason ? ` · ${i.reason}` : ""}</span><span className="text-[10px] text-slate-400 ml-1">· {sourceLabel(i.source)}</span></td>
                    <td className="px-3 py-1.5 text-slate-500">{i.worker ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-slate-400">{i.mo_no}</td>
                  </tr>
                );
              })}
              {allItems.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-slate-400">ยังไม่มีของในโกดัง</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── คิวงาน (สำหรับพนักงาน) เรียงตามกำหนดส่ง ── */
        <div className="max-w-[820px] mx-auto space-y-2">
          <p className="text-[12px] text-slate-500 px-1">เรียงตามกำหนดส่ง — งานด่วนอยู่บนสุด · กดเพื่อรับเข้าชั้น</p>
          {sortedQueue.map((c) => { const db = dueBadge(c.due_date); return (
            <div key={c.wo_id} onClick={() => setDetail({ kind: "queue", card: c })}
              className="flex items-center gap-3 rounded-xl bg-white border border-slate-200 shadow-sm p-2.5 cursor-pointer hover:border-indigo-300" style={{ borderLeft: `4px solid ${cardColor(c.brand_color, c.sku)}` }}>
              <Thumb k={c.image_key} color={cardColor(c.brand_color, c.sku)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-slate-800 truncate">{c.name}</span>
                  {c.is_customer_job && <span className="text-[10px] rounded px-1.5 py-0.5 bg-violet-100 text-violet-700">👤 งานลูกค้า</span>}
                  {c.is_subcontract && <span className="text-[10px] rounded px-1.5 py-0.5 bg-orange-100 text-orange-700">🧵 งานเหมา</span>}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">{c.sku} · {c.mo_no} · 👷 {c.worker ?? "—"}</div>
              </div>
              <div className="text-right shrink-0">
                {db && <div className={`text-[10px] rounded px-1.5 py-0.5 inline-block ${db.c}`}>{db.t}</div>}
                <div className="text-xs font-bold text-indigo-600 mt-0.5">เหลือรับ {fmt(c.remaining)}</div>
              </div>
            </div>
          ); })}
          {sortedQueue.length === 0 && <div className="text-center text-sm text-slate-400 py-16">ไม่มีงานรอ QC 🎉</div>}
        </div>
      )}

      {/* รับเข้า */}
      <ERPModal open={recv !== null} onClose={() => setRecv(null)} size="md" title={`📦 รับเข้า ${recv?.shelf.name ?? ""}`}
        footer={<><button onClick={() => setRecv(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={submitReceive} className="h-9 px-4 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">ยืนยันรับเข้า</button></>}>
        {recv && (
          <div className="space-y-3">
            <div className="text-[12px] text-slate-500"><b className="text-slate-700">{recv.card.name}</b> · {recv.card.sku} · {recv.card.mo_no}<br />👷 {recv.card.worker ?? "—"} · เหลือรับ <b className="text-indigo-600">{fmt(recv.card.remaining)}</b></div>
            <label className="block"><span className="text-[11px] text-emerald-600 font-medium">✅ ของดี → {recv.shelf.name}</span>
              <input type="number" min={0} max={recv.card.remaining} value={recvGood} onChange={(e) => setRecvGood(Number(e.target.value))} className="w-full h-10 mt-0.5 px-2 text-right text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" /></label>
            <div className="rounded-lg border border-rose-100 bg-rose-50/40 p-2.5">
              <div className="flex items-center justify-between mb-1.5"><span className="text-[11px] text-rose-600 font-medium">⚠️ ของเสีย → {defectShelf?.name ?? "(ยังไม่มีชั้นของเสีย)"}</span>
                <button onClick={() => setReasonMgr(true)} className="text-[10px] text-slate-500 hover:text-slate-700 border border-slate-200 bg-white rounded px-1.5 py-0.5">⚙️ จัดการสาเหตุ</button></div>
              <div className="space-y-1.5">
                {recvBad.map((r) => (
                  <div key={r.id} className="flex items-center gap-1.5">
                    <select value={r.reasonId} onChange={(e) => setRecvBad((rs) => rs.map((x) => x.id === r.id ? { ...x, reasonId: e.target.value } : x))} className="flex-1 h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-rose-400">
                      {reasons.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                    <input type="number" min={0} value={r.qty} onChange={(e) => setRecvBad((rs) => rs.map((x) => x.id === r.id ? { ...x, qty: Number(e.target.value) } : x))} className="w-20 h-9 px-2 text-right text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400" />
                    <button onClick={() => setRecvBad((rs) => rs.filter((x) => x.id !== r.id))} className="text-slate-400 hover:text-rose-600 px-1">✕</button>
                  </div>
                ))}
                <button onClick={() => setRecvBad((rs) => [...rs, { id: rid(), reasonId: reasons[0]?.id ?? "", qty: 1 }])} disabled={!defectShelf} className="text-[11px] text-rose-600 hover:text-rose-700 disabled:text-slate-300">+ เพิ่มสาเหตุของเสีย</button>
              </div>
            </div>
            <div className="text-[11px] text-slate-400">รวม {fmt(num(recvGood) + recvBadTotal)} / {fmt(recv.card.remaining)} ชิ้น</div>
          </div>
        )}
      </ERPModal>

      {/* ปุ่มย้ายชั้น (จากการ์ด) */}
      <ERPModal open={movePick !== null} onClose={() => setMovePick(null)} size="sm" title="↔️ ย้ายชั้น"
        footer={<button onClick={() => setMovePick(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>}>
        {movePick && (
          <div className="space-y-2">
            <div className="text-[12px] text-slate-500"><b className="text-slate-700">{movePick.sku_name}</b> · {fmt(Number(movePick.qty))} ชิ้น</div>
            <div className="flex flex-wrap gap-1.5">
              {storeShelves.filter((s) => s.id !== movePick.shelf_id).map((s) => (
                <button key={s.id} onClick={() => { void moveItem(movePick, s.id); setMovePick(null); }} className="text-[12px] px-2.5 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50">🗄️ {s.name}</button>))}
              {storeShelves.filter((s) => s.id !== movePick.shelf_id).length === 0 && <span className="text-[11px] text-slate-400">ไม่มีชั้นอื่นให้ย้าย</span>}
            </div>
          </div>
        )}
      </ERPModal>

      {/* ดูของเกิน 20 (overflow) */}
      <ERPModal open={overflowShelf !== null} onClose={() => setOverflowShelf(null)} size="md" title={`${overflowShelf?.name ?? ""} — ทั้งหมด ${overflowShelf?.items.length ?? 0} รายการ`}
        footer={<button onClick={() => setOverflowShelf(null)} className="h-9 px-4 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">ปิด</button>}>
        <div className="max-h-[60vh] overflow-auto space-y-1.5">
          {(overflowShelf?.items ?? []).map((i) => { const sb = statusBadge(i.status); return (
            <div key={i.id} onClick={() => { const sh = overflowShelf; setOverflowShelf(null); if (sh) setDetail({ kind: "item", shelf: sh, item: i }); }}
              className="flex items-center gap-2.5 rounded-lg border border-slate-200 p-2 cursor-pointer hover:border-indigo-300">
              <Thumb k={i.image_key} color={prodColor(i.sku)} size={36} />
              <div className="min-w-0 flex-1"><div className="text-[13px] font-medium text-slate-800 truncate">{i.sku_name}</div><div className="text-[11px] text-slate-500 font-mono">{i.sku} · {i.mo_no}</div></div>
              <span className={`text-[10px] rounded px-1.5 py-0.5 ${sb.c}`}>{sb.t}</span>
              <span className="text-xs font-bold text-slate-700">{fmt(Number(i.qty))}</span>
            </div>
          ); })}
        </div>
      </ERPModal>

      {/* ประวัติของเสีย (ตาม SKU) */}
      <ERPModal open={histOpen} onClose={() => setHistOpen(false)} size="lg" title="📋 ประวัติของเสีย (ตาม SKU)"
        footer={<button onClick={() => setHistOpen(false)} className="h-9 px-4 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">ปิด</button>}>
        <div className="space-y-2">
          <input value={histSearch} onChange={(e) => setHistSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadHist(histSearch)} placeholder="ค้นหา SKU / ช่าง / สาเหตุ… (Enter)" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <div className="max-h-[55vh] overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[11px] text-slate-500"><tr className="text-left">
                <th className="px-3 py-2 font-medium">เลขใบ</th><th className="px-3 py-2 font-medium">เวลา</th><th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium text-right">จำนวน</th><th className="px-3 py-2 font-medium">สาเหตุ</th><th className="px-3 py-2 font-medium">ช่าง</th><th className="px-3 py-2 font-medium">ประเภท</th>
              </tr></thead>
              <tbody>
                {histRows.length === 0 ? <tr><td colSpan={7} className="text-center py-10 text-slate-400">ยังไม่มีประวัติของเสีย</td></tr>
                : histRows.map((h) => (
                  <tr key={h.id} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">{h.defect_no ?? "—"}</td>
                    <td className="px-3 py-1.5 text-[11px] text-slate-400 whitespace-nowrap">{tsText(h.created_at)}</td>
                    <td className="px-3 py-1.5 font-mono text-[12px]">{h.sku ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{fmt(Number(h.qty ?? 0))}</td>
                    <td className="px-3 py-1.5 text-rose-600">{h.defect_type ?? "—"}</td>
                    <td className="px-3 py-1.5 text-slate-500">{h.worker ?? "—"}</td>
                    <td className="px-3 py-1.5">{h.kind === "scrap" ? <span className="text-[10px] bg-slate-200 text-slate-600 rounded px-1.5 py-0.5">ทิ้ง</span> : <span className="text-[10px] bg-rose-100 text-rose-700 rounded px-1.5 py-0.5">เสีย</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-slate-400">รวม {fmt(histRows.reduce((s, h) => s + Number(h.qty ?? 0), 0))} ชิ้น · {histRows.length} รายการ</div>
        </div>
      </ERPModal>

      {/* จัดการสาเหตุ */}
      <ERPModal open={reasonMgr} onClose={() => setReasonMgr(false)} size="sm" title="⚙️ จัดการสาเหตุของเสีย"
        footer={<button onClick={() => setReasonMgr(false)} className="h-9 px-4 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">เสร็จ</button>}>
        <div className="space-y-2">
          {reasons.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <input value={r.name} onChange={(e) => editReason(r.id, e.target.value)} onBlur={(e) => saveReason(r.id, e.target.value)} className="flex-1 h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button onClick={() => removeReason(r.id)} className="text-slate-400 hover:text-rose-600 px-1">🗑️</button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            <input value={newReason} onChange={(e) => setNewReason(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addReason()} placeholder="เพิ่มสาเหตุใหม่…" className="flex-1 h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={addReason} className="h-9 px-3 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">เพิ่ม</button>
          </div>
        </div>
      </ERPModal>

      {/* ส่งออก */}
      <ERPModal open={ship !== null} onClose={() => setShip(null)} size="sm" title="📤 ส่งออกจากโกดัง QC"
        footer={<><button onClick={() => setShip(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={submitShip} className="h-9 px-4 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">ยืนยันส่งออก</button></>}>
        {ship && (
          <div className="space-y-3">
            <div className="text-[12px] text-slate-500"><b className="text-slate-700">{ship.sku_name}</b> · {ship.sku} · {fmt(Number(ship.qty))} ชิ้น</div>
            <label className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer ${shipMode === "sales_wh" ? "border-indigo-400 bg-indigo-50/60" : "border-slate-200"}`}>
              <input type="radio" name="sm" checked={shipMode === "sales_wh"} onChange={() => setShipMode("sales_wh")} /><span className="text-sm text-slate-700">🏬 เข้าโกดังสำหรับขาย</span></label>
            {shipMode === "sales_wh" && (
              <div className="pl-7"><span className="text-[11px] text-slate-500">เลือกโกดังปลายทาง</span>
                <select value={shipWh} onChange={(e) => setShipWh(e.target.value)} className="w-full h-10 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {WAREHOUSES.map((w) => <option key={w} value={w}>{w}</option>)}</select></div>)}
            <label className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer ${shipMode === "sell" ? "border-indigo-400 bg-indigo-50/60" : "border-slate-200"}`}>
              <input type="radio" name="sm" checked={shipMode === "sell"} onChange={() => setShipMode("sell")} /><span className="text-sm text-slate-700">💰 ส่งออกเพื่อขายเลย</span></label>
          </div>
        )}
      </ERPModal>

      {/* ย้ายไปของเสีย */}
      <ERPModal open={toDefect !== null} onClose={() => setToDefect(null)} size="sm" title="⚠️ ย้ายไปชั้นของเสีย"
        footer={<><button onClick={() => setToDefect(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={submitToDefect} className="h-9 px-4 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700">ยืนยัน</button></>}>
        {toDefect && (
          <div className="space-y-3">
            <div className="text-[12px] text-slate-500"><b className="text-slate-700">{toDefect.sku_name}</b> · มีในชั้น {fmt(Number(toDefect.qty))} ชิ้น</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="text-[11px] text-rose-600 font-medium">จำนวนที่เสีย</span>
                <input type="number" min={0} max={Number(toDefect.qty)} value={tdQty} onChange={(e) => setTdQty(Number(e.target.value))} className="w-full h-10 mt-0.5 px-2 text-right text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" /></label>
              <label className="block"><span className="text-[11px] text-slate-500">สาเหตุ</span>
                <select value={tdReason} onChange={(e) => setTdReason(e.target.value)} className="w-full h-10 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-rose-400">
                  {reasons.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            </div>
          </div>
        )}
      </ERPModal>

      {/* ส่งซ่อม */}
      <ERPModal open={repair !== null} onClose={() => setRepair(null)} size="sm" title="🔧 ส่งซ่อม"
        footer={<><button onClick={() => setRepair(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={submitRepair} className="h-9 px-4 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600">ส่งซ่อม</button></>}>
        {repair && (
          <div className="space-y-3">
            <div className="text-[12px] text-slate-500"><b className="text-slate-700">{repair.sku_name}</b> · {fmt(Number(repair.qty))} ชิ้น{repair.reason ? ` · ⚠️ ${repair.reason}` : ""}</div>
            <label className="block"><span className="text-[11px] text-slate-500">ช่างที่ซ่อม</span>
              <input value={repairBy} onChange={(e) => setRepairBy(e.target.value)} placeholder="ชื่อช่างซ่อม" className="w-full h-10 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" /></label>
          </div>
        )}
      </ERPModal>

      {/* รับจากซ่อม */}
      <ERPModal open={fromRepair !== null} onClose={() => setFromRepair(null)} size="sm" title="📥 รับจากซ่อม"
        footer={<><button onClick={() => setFromRepair(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={submitFromRepair} className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">ยืนยัน</button></>}>
        {fromRepair && (
          <div className="space-y-3">
            <div className="text-[12px] text-slate-500"><b className="text-slate-700">{fromRepair.sku_name}</b> · กำลังซ่อม {fmt(Number(fromRepair.qty))} ชิ้น</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="text-[11px] text-emerald-600 font-medium">✅ ซ่อมได้</span>
                <input type="number" min={0} max={Number(fromRepair.qty)} value={frGood} onChange={(e) => setFrGood(Number(e.target.value))} className="w-full h-10 mt-0.5 px-2 text-right text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" /></label>
              <label className="block"><span className="text-[11px] text-rose-600 font-medium">🗑️ ซ่อมไม่ได้ (ทิ้ง)</span>
                <input type="number" min={0} max={Number(fromRepair.qty)} value={frScrap} onChange={(e) => setFrScrap(Number(e.target.value))} className="w-full h-10 mt-0.5 px-2 text-right text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" /></label>
            </div>
            <label className="block"><span className="text-[11px] text-slate-500">ของที่ซ่อมได้ → เก็บที่ชั้น</span>
              <select value={frShelf} onChange={(e) => setFrShelf(e.target.value)} className="w-full h-10 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500">
                {storeShelves.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          </div>
        )}
      </ERPModal>

      {/* รายละเอียด */}
      <ERPModal open={detail !== null} onClose={() => setDetail(null)} size="sm" title="📋 รายละเอียด"
        footer={<button onClick={() => setDetail(null)} className="h-9 px-4 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">ปิด</button>}>
        {detail && (() => {
          const d = detail.kind === "queue" ? detail.card : detail.item;
          const name = detail.kind === "queue" ? detail.card.name : detail.item.sku_name;
          const rows: [string, string][] = [["สินค้า", name ?? "—"], ["SKU", d.sku ?? "—"], ["เลขใบผลิต", d.mo_no ?? "—"], ["ช่างผลิต", d.worker ?? "—"]];
          if (detail.kind === "queue") rows.push(["เหลือรับเข้า", `${fmt(detail.card.remaining)} ชิ้น`], ["กำหนดส่ง", dueText(detail.card.due_date) ?? "—"]);
          else { rows.push(["จำนวน", `${fmt(Number(detail.item.qty))} ชิ้น`], ["อยู่ที่ชั้น", detail.shelf.name], ["ที่มา", sourceLabel(detail.item.source)]);
            if (detail.shelf.kind === "defect") rows.push(["สาเหตุ", detail.item.reason ?? "—"], ["สถานะซ่อม", detail.item.status === "repairing" ? `กำลังซ่อม (${detail.item.repair_by})` : "รอดำเนินการ"]); }
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-3"><Thumb k={d.image_key} color={prodColor(d.sku)} size={56} /><div className="text-sm font-semibold text-slate-800">{name}</div></div>
              <div className="space-y-1.5">{rows.map(([k, v]) => (<div key={k} className="flex justify-between gap-3 text-sm border-b border-slate-50 py-1 last:border-0"><span className="text-slate-400">{k}</span><span className="text-slate-700 font-medium text-right">{v}</span></div>))}</div>
              {skuHist.length > 0 && (
                <div className="pt-1 border-t border-slate-100">
                  <div className="text-[11px] text-slate-500 mb-1.5">📋 ประวัติของเสีย — SKU นี้ ({skuHist.length})</div>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {skuHist.map((h) => (
                      <div key={h.id} className="text-[12px] flex items-center justify-between gap-2 rounded-md bg-rose-50/50 border border-rose-100 px-2 py-1">
                        <span className="text-rose-700 truncate">⚠️ {h.defect_type ?? "—"}{h.kind === "scrap" ? " (ทิ้ง)" : ""}</span>
                        <span className="text-slate-500 whitespace-nowrap">👷 {h.worker ?? "—"} · {fmt(Number(h.qty ?? 0))} · {tsText(h.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detail.kind === "item" && detail.shelf.kind === "store" && (
                <div className="pt-1 border-t border-slate-100 space-y-2">
                  <div><div className="text-[11px] text-slate-500 mb-1.5">📦 ย้ายเข้าชั้น</div>
                    <div className="flex flex-wrap gap-1.5">
                      {storeShelves.filter((s) => s.id !== detail.shelf.id).map((s) => (<button key={s.id} onClick={() => { void moveItem(detail.item, s.id); setDetail(null); }} className="text-[12px] px-2.5 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50">🗄️ {s.name}</button>))}
                      {storeShelves.filter((s) => s.id !== detail.shelf.id).length === 0 && <span className="text-[11px] text-slate-400">ไม่มีชั้นอื่น</span>}
                    </div></div>
                  <button onClick={() => returnQueue(detail.item)} className="w-full text-[12px] px-2.5 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50">↩️ ย้ายกลับไปงานรอ QC (กรณีรับผิด)</button>
                </div>
              )}
              {detail.kind === "queue" && (
                <div className="pt-1 border-t border-slate-100"><div className="text-[11px] text-slate-500 mb-1.5">📦 รับเข้าชั้น</div>
                  <div className="flex flex-wrap gap-1.5">
                    {storeShelves.map((s) => (<button key={s.id} onClick={() => { const card = detail.card; setDetail(null); openReceive(card, s); }} className="text-[12px] px-2.5 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50">🗄️ {s.name}</button>))}
                    {storeShelves.length === 0 && <span className="text-[11px] text-rose-500">ยังไม่มีชั้นเก็บ</span>}
                  </div></div>
              )}
            </div>
          );
        })()}
      </ERPModal>

      {/* ใส่ของเข้าชั้นเอง (ยอดยกมา/ไม่ได้มาจากผลิต) */}
      <ERPModal open={addOpen} onClose={() => setAddOpen(false)} size="md" title="➕ ใส่ของเข้าชั้น"
        footer={<><button onClick={() => setAddOpen(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={submitAddManual} className="h-9 px-4 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{addMode === "bulk" ? "นำเข้า" : "เพิ่มของ"}</button></>}>
        <div className="space-y-3">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 w-fit">
            <button onClick={() => setAddMode("single")} className={`h-8 px-3 text-sm rounded-md ${addMode === "single" ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500"}`}>ทีละรายการ</button>
            <button onClick={() => setAddMode("bulk")} className={`h-8 px-3 text-sm rounded-md ${addMode === "bulk" ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500"}`}>นำเข้าหลายรายการ</button>
          </div>
          {addPickShelf ? (
            <label className="block"><span className="text-[11px] text-slate-500">ชั้นปลายทาง</span>
              <select value={addShelfId} onChange={(e) => setAddShelfId(e.target.value)} className="w-full h-10 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {storeShelves.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          ) : (
            <div className="text-[12px] text-slate-500">ชั้นปลายทาง: <b className="text-slate-700">{shelves.find((s) => s.id === addShelfId)?.name ?? "—"}</b></div>
          )}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] text-slate-500">ที่มา</span>
              <button onClick={() => setSourceMgr(true)} className="text-[10px] text-slate-500 hover:text-slate-700 border border-slate-200 bg-white rounded px-1.5 py-0.5">⚙️ จัดการที่มา</button>
            </div>
            <select value={addSource} onChange={(e) => setAddSource(e.target.value)} className="w-full h-10 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {sources.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
            </select>
          </div>
          {addMode === "single" ? (
            <>
              <div><span className="text-[11px] text-slate-500">สินค้า</span><div className="mt-0.5"><SkuPicker value={addSku} onChange={setAddSku} /></div></div>
              <label className="block"><span className="text-[11px] text-slate-500">จำนวน</span>
                <input type="number" min={1} value={addQty} onChange={(e) => setAddQty(Number(e.target.value))} className="w-full h-10 mt-0.5 px-2 text-right text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label>
            </>
          ) : (
            <label className="block"><span className="text-[11px] text-slate-500">วาง SKU ทีละบรรทัด (รูปแบบ: <b>SKU, จำนวน</b>)</span>
              <textarea value={addBulk} onChange={(e) => setAddBulk(e.target.value)} rows={6} placeholder={"LEA-SAF-001, 10\nFAB-N372-08, 25"} className="w-full mt-0.5 px-2 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <span className="text-[11px] text-slate-400">คั่นด้วยจุลภาคหรือ Tab · ระบบดึงชื่อสินค้าจาก SKU ให้อัตโนมัติ</span></label>
          )}
        </div>
      </ERPModal>

      {/* จัดการที่มา */}
      <ERPModal open={sourceMgr} onClose={() => setSourceMgr(false)} size="sm" title="⚙️ จัดการที่มา"
        footer={<button onClick={() => setSourceMgr(false)} className="h-9 px-4 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">เสร็จ</button>}>
        <div className="space-y-2">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <input value={s.name} onChange={(e) => editSource(s.id, e.target.value)} onBlur={(e) => saveSource(s.id, e.target.value)} className="flex-1 h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button onClick={() => removeSource(s.id)} className="text-slate-400 hover:text-rose-600 px-1">🗑️</button>
            </div>
          ))}
          {sources.length === 0 && <div className="text-center text-xs text-slate-300 py-3">ยังไม่มีที่มา</div>}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            <input value={newSource} onChange={(e) => setNewSource(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSourceItem()} placeholder="เพิ่มที่มาใหม่…" className="flex-1 h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={addSourceItem} className="h-9 px-3 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">เพิ่ม</button>
          </div>
        </div>
      </ERPModal>

      {/* เพิ่ม/แก้ชั้น */}
      <ERPModal open={shelfModal !== null} onClose={() => setShelfModal(null)} size="sm" title={shelfModal?.mode === "edit" ? "✏️ แก้ชั้น" : "➕ เพิ่มชั้นใหม่"}
        footer={<><button onClick={() => setShelfModal(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={submitShelf} className="h-9 px-4 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">บันทึก</button></>}>
        <div className="space-y-3">
          <label className="block"><span className="text-[11px] text-slate-500">ชื่อชั้น</span>
            <input value={shelfName} onChange={(e) => setShelfName(e.target.value)} autoFocus className="w-full h-10 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label>
          <div><span className="text-[11px] text-slate-500">ประเภทชั้น</span>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button onClick={() => setShelfKind("store")} className={`p-2.5 rounded-lg border text-sm ${shelfKind === "store" ? "border-indigo-400 bg-indigo-50/60 text-indigo-700" : "border-slate-200 text-slate-600"}`}>🗄️ ชั้นเก็บปกติ</button>
              <button onClick={() => setShelfKind("defect")} className={`p-2.5 rounded-lg border text-sm ${shelfKind === "defect" ? "border-rose-400 bg-rose-50/60 text-rose-700" : "border-slate-200 text-slate-600"}`}>🛠️ ชั้นของเสีย</button>
            </div></div>
        </div>
      </ERPModal>

      {/* ลบชั้น */}
      <ERPModal open={delShelf !== null} onClose={() => setDelShelf(null)} size="sm" title="🗑️ ลบชั้น"
        footer={<><button onClick={() => setDelShelf(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={confirmDelShelf} className="h-9 px-4 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700">ลบ</button></>}>
        <p className="text-sm text-slate-600">ต้องการลบ <b>{delShelf?.name}</b> ใช่ไหม (ต้องไม่มีของในชั้น)</p>
      </ERPModal>
    </div>
  );
}
