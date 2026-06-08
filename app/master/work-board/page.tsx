"use client";

/**
 * บอร์ดจ่ายงาน (Canvas / Whiteboard แบบ Miro) — เฟส D
 * เลื่อน(pan)/ซูม · ลากย้าย+ขยายโซนแผนกได้ · วางการ์ดอิสระ (จำตำแหน่ง) · ปุ่มจัดเรียงสวย
 * โซน "📥 รอจ่าย" (การ์ดใบสั่งผลิตยังจ่ายไม่ครบ) + โซนแผนก (การ์ดใบจ่ายงาน)
 * ลากการ์ด MO ปล่อยในโซนแผนก = popup จ่ายงาน · ลากใบจ่ายงานข้ามแผนก = ย้ายแผนก
 * ซ่อน MO เมื่อจ่ายครบ · ซ่อนใบจ่ายงานเมื่อรับครบ · กรอบสีแบรนด์ + ปุ่มตั้งสี
 */
import { useState, useEffect, useCallback, useMemo, useRef, type PointerEvent as RPE } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { WorkOrder } from "@/app/api/mo/work-orders/route";
import type { Assignee } from "@/app/api/mo/assignees/route";
import type { Brand } from "@/app/api/brands/route";

type Dept = { id: string; name: string };
type PendingMO = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number; dispatched: number; remaining: number; due_date: string | null; status: string;
  image_url: string | null; brand: string | null; brand_color: string | null;
};
type Board = { departments: Dept[]; workOrders: WorkOrder[]; pending: PendingMO[] };
type Pos = { x: number; y: number };
type Size = { w: number; h: number };
type Viewport = { x: number; y: number; scale: number };
type Inter =
  | { type: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { type: "zone"; key: string; sx: number; sy: number; ox: number; oy: number }
  | { type: "resize"; key: string; sx: number; sy: number; ow: number; oh: number }
  | { type: "card"; cid: string; kind: "mo" | "wo"; id: string; sx: number; sy: number; ox: number; oy: number }
  | null;

const WO_STATUS: Record<string, { label: string; cls: string }> = {
  dispatched:     { label: "จ่ายแล้ว",       cls: "bg-blue-50 text-blue-700 border-blue-200" },
  in_progress:    { label: "กำลังทำ",        cls: "bg-amber-50 text-amber-700 border-amber-200" },
  partial_return: { label: "รับคืนบางส่วน",  cls: "bg-orange-50 text-orange-700 border-orange-200" },
  done:           { label: "รับครบ",         cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");

const ZONE_W = 240, HEADER_H = 48, CARD_W = 200, CARD_SLOT = 300, PAD = 12, GAP = 40;
const ZONES_KEY = "erp-workboard-zones:v1", ZONESIZE_KEY = "erp-workboard-zonesizes:v1", CARDPOS_KEY = "erp-workboard-cards:v1";
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const PALETTE = ["#94a3b8", "#60a5fa", "#34d399", "#f472b6", "#fb923c", "#a78bfa", "#22d3ee", "#facc15"];
const prodColor = (sku: string | null) => { let h = 0; for (const c of sku ?? "") h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
const ACCENT = ["#fbbf24", "#818cf8", "#60a5fa", "#34d399", "#fb7185", "#a78bfa", "#22d3ee"];

type Urg = "green" | "orange" | "red";
function urgencyByDate(due: string | null, done: boolean): Urg {
  if (done) return "green";
  if (due) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(due + "T00:00:00");
    const days = Math.floor((d.getTime() - today.getTime()) / 86400000);
    if (days < 0) return "red";
    if (days <= 2) return "orange";
  }
  return "green";
}
const URG_DOT: Record<Urg, string> = { green: "bg-emerald-500", orange: "bg-amber-500", red: "bg-rose-500" };
const daysLeftText = (due: string | null) => {
  if (!due) return "—";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due + "T00:00:00");
  const days = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `เลย ${-days} วัน`;
  if (days === 0) return "วันนี้";
  return `เหลือ ${days} วัน`;
};
const stageOfDept = (name: string) => (name.includes("ตัด") || name.includes("เตรียม") ? "cut" : "assemble");

type Zone = { key: string; label: string; kind: "pending" | "dept"; dept?: Dept; accent: string; moCards: PendingMO[]; woCards: WorkOrder[] };

export default function WorkBoardPage() {
  const canView = usePermission("products.view");
  const canEdit = usePermission("products.edit");
  const { user } = useAuth(); void user;
  const toast = useToast();

  const [board, setBoard] = useState<Board>({ departments: [], workOrders: [], pending: [] });
  const [loading, setLoading] = useState(true);
  const [craftsmen, setCraftsmen] = useState<Assignee[]>([]);

  const boardRef = useRef<HTMLDivElement>(null);
  const interRef = useRef<Inter>(null);
  const movedRef = useRef(false);
  const [vp, setVp] = useState<Viewport>({ x: 24, y: 16, scale: 0.85 });
  const [zonePos, setZonePos] = useState<Record<string, Pos>>({});
  const [zoneSize, setZoneSize] = useState<Record<string, Size>>({});
  const [cardPos, setCardPos] = useState<Record<string, Pos>>({});
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [isMax, setIsMax] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const [dispMO, setDispMO] = useState<PendingMO | null>(null);
  const [dispDept, setDispDept] = useState<Dept | null>(null);
  const [dispQty, setDispQty] = useState(0);
  const [dispCraftsman, setDispCraftsman] = useState("");
  const [dispDue, setDispDue] = useState("");
  const [dispSaving, setDispSaving] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  // คลิกการ์ด = ดูรายละเอียด / รับงานคืน
  const [detailWO, setDetailWO] = useState<WorkOrder | null>(null);
  const [detailMO, setDetailMO] = useState<PendingMO | null>(null);
  const [recvQty, setRecvQty] = useState(0);
  const [recvSaving, setRecvSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await apiFetch("/api/mo/work-board"); const j = await res.json();
      if (!j.error) setBoard({ departments: j.departments ?? [], workOrders: j.workOrders ?? [], pending: j.pending ?? [] });
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void (async () => { try { const r = await apiFetch("/api/mo/assignees"); const j = await r.json(); setCraftsmen(j.craftsmen ?? []); } catch { /* ignore */ } })(); }, []);
  useEffect(() => { try {
    const r = localStorage.getItem(ZONES_KEY); if (r) setZonePos(JSON.parse(r));
    const s = localStorage.getItem(ZONESIZE_KEY); if (s) setZoneSize(JSON.parse(s));
    const c = localStorage.getItem(CARDPOS_KEY); if (c) setCardPos(JSON.parse(c));
  } catch { /* ignore */ } }, []);
  useEffect(() => { try { localStorage.setItem(ZONES_KEY, JSON.stringify(zonePos)); } catch { /* ignore */ } }, [zonePos]);
  useEffect(() => { try { localStorage.setItem(ZONESIZE_KEY, JSON.stringify(zoneSize)); } catch { /* ignore */ } }, [zoneSize]);
  useEffect(() => { try { localStorage.setItem(CARDPOS_KEY, JSON.stringify(cardPos)); } catch { /* ignore */ } }, [cardPos]);

  const wosByDept = useMemo(() => {
    const m = new Map<string, WorkOrder[]>();
    for (const w of board.workOrders) {
      if (w.status === "done") continue;
      let key = w.department_id ?? "";
      if (!key) { const d = board.departments.find((x) => stageOfDept(x.name) === w.stage); key = d?.id ?? ""; }
      if (!key) continue;
      (m.get(key) ?? m.set(key, []).get(key)!).push(w);
    }
    return m;
  }, [board]);

  const zones: Zone[] = useMemo(() => {
    const arr: Zone[] = [{ key: "pending", label: "📥 รอจ่าย", kind: "pending", accent: ACCENT[0], moCards: board.pending, woCards: [] }];
    board.departments.forEach((d, i) => arr.push({ key: `dept:${d.id}`, label: d.name, kind: "dept", dept: d, accent: ACCENT[(i + 1) % ACCENT.length], moCards: [], woCards: wosByDept.get(d.id) ?? [] }));
    return arr;
  }, [board, wosByDept]);

  const zoneIndex = useMemo(() => { const m: Record<string, number> = {}; zones.forEach((z, i) => { m[z.key] = i; }); return m; }, [zones]);
  const posOfZone = useCallback((key: string): Pos => zonePos[key] ?? { x: (zoneIndex[key] ?? 0) * (ZONE_W + GAP), y: 0 }, [zonePos, zoneIndex]);
  const countOf = (z: Zone) => (z.kind === "pending" ? z.moCards.length : z.woCards.length);
  const zoneWof = useCallback((key: string) => zoneSize[key]?.w ?? ZONE_W, [zoneSize]);
  const zoneH = useCallback((z: Zone) => {
    const auto = HEADER_H + Math.max(1, countOf(z)) * CARD_SLOT + PAD;
    return Math.max(auto, zoneSize[z.key]?.h ?? 0);
  }, [zoneSize]);

  // ตำแหน่ง "จัดเรียงสวย" อัตโนมัติ (ถ้าการ์ดยังไม่ถูกวางอิสระ) — เกาะตามตำแหน่งโซน
  const autoPos = useMemo(() => {
    const map: Record<string, Pos> = {};
    for (const z of zones) {
      const p = posOfZone(z.key);
      const cids = z.kind === "pending" ? z.moCards.map((m) => `mo:${m.id}`) : z.woCards.map((w) => `wo:${w.id}`);
      cids.forEach((cid, i) => { map[cid] = { x: p.x + (zoneWof(z.key) - CARD_W) / 2, y: p.y + HEADER_H + 10 + i * CARD_SLOT }; });
    }
    return map;
  }, [zones, posOfZone, zoneWof]);
  const posOfCard = useCallback((cid: string): Pos => cardPos[cid] ?? autoPos[cid] ?? { x: 0, y: 0 }, [cardPos, autoPos]);

  const screenToWorld = (cx: number, cy: number): Pos => {
    const r = boardRef.current!.getBoundingClientRect();
    return { x: (cx - r.left - vp.x) / vp.scale, y: (cy - r.top - vp.y) / vp.scale };
  };
  const hitZone = (wx: number, wy: number): Zone | null => {
    for (const z of zones) { const p = posOfZone(z.key); if (wx >= p.x && wx <= p.x + zoneWof(z.key) && wy >= p.y && wy <= p.y + zoneH(z)) return z; }
    return null;
  };

  // ---- zoom ----
  useEffect(() => {
    const el = boardRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top;
      const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setVp((v) => { const ns = clamp(v.scale * f, 0.3, 1.8); return { scale: ns, x: sx - ((sx - v.x) / v.scale) * ns, y: sy - ((sy - v.y) / v.scale) * ns }; });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [loading]);
  const zoomBtn = (f: number) => { const el = boardRef.current; if (!el) return; const r = el.getBoundingClientRect(); const sx = r.width / 2, sy = r.height / 2;
    setVp((v) => { const ns = clamp(v.scale * f, 0.3, 1.8); return { scale: ns, x: sx - ((sx - v.x) / v.scale) * ns, y: sy - ((sy - v.y) / v.scale) * ns }; }); };
  const resetView = () => setVp({ x: 24, y: 16, scale: 0.85 });
  const tidy = () => setCardPos({});   // จัดเรียงการ์ดกลับเข้าโซนสวยๆ
  const resetZones = () => { setZonePos({}); setZoneSize({}); };

  // ---- pointer ----
  const onBoardDown = (e: RPE) => {
    boardRef.current?.setPointerCapture(e.pointerId);
    interRef.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: vp.x, oy: vp.y };
  };
  const onZoneDown = (e: RPE, key: string) => {
    if (tool === "pan") return;
    e.stopPropagation();
    boardRef.current?.setPointerCapture(e.pointerId); movedRef.current = false;
    const p = posOfZone(key);
    interRef.current = { type: "zone", key, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y };
  };
  const onZoneResizeDown = (e: RPE, z: Zone) => {
    e.stopPropagation();
    boardRef.current?.setPointerCapture(e.pointerId); movedRef.current = false;
    interRef.current = { type: "resize", key: z.key, sx: e.clientX, sy: e.clientY, ow: zoneWof(z.key), oh: zoneH(z) };
  };
  const onCardDown = (e: RPE, kind: "mo" | "wo", id: string) => {
    if (tool === "pan" || !canEdit) return;
    e.stopPropagation();
    const cid = `${kind}:${id}`; const p = posOfCard(cid);
    boardRef.current?.setPointerCapture(e.pointerId); movedRef.current = false; setDragId(cid);
    interRef.current = { type: "card", cid, kind, id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y };
  };
  const onMove = (e: RPE) => {
    const it = interRef.current; if (!it) return;
    const dx = e.clientX - it.sx, dy = e.clientY - it.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
    if (it.type === "pan") setVp((v) => ({ ...v, x: it.ox + dx, y: it.oy + dy }));
    else if (it.type === "zone") setZonePos((zp) => ({ ...zp, [it.key]: { x: it.ox + dx / vp.scale, y: it.oy + dy / vp.scale } }));
    else if (it.type === "resize") setZoneSize((zs) => ({ ...zs, [it.key]: { w: clamp(it.ow + dx / vp.scale, 180, 640), h: Math.max(160, it.oh + dy / vp.scale) } }));
    else if (it.type === "card") setCardPos((cp) => ({ ...cp, [it.cid]: { x: it.ox + dx / vp.scale, y: it.oy + dy / vp.scale } }));
  };
  const onUp = async (e: RPE) => {
    const it = interRef.current; interRef.current = null; setDragId(null);
    try { boardRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!it || it.type !== "card") return;
    if (!movedRef.current) {
      // คลิก (ไม่ลาก) = เปิดรายละเอียด
      if (it.kind === "wo") { const wo = board.workOrders.find((x) => x.id === it.id); if (wo) { setDetailWO(wo); setRecvQty(Math.max(0, (wo.qty || 0) - (wo.received_qty || 0))); } }
      else { const mo = board.pending.find((x) => x.id === it.id); if (mo) setDetailMO(mo); }
      return;
    }
    const w = screenToWorld(e.clientX, e.clientY);
    const target = hitZone(w.x, w.y);
    if (it.kind === "mo") {
      // วางในโซนแผนก = จ่ายงาน (เด้ง popup) แล้วสแนปการ์ดกลับโซนรอจ่าย
      if (target && target.kind === "dept" && target.dept) {
        const mo = board.pending.find((m) => m.id === it.id);
        setCardPos((cp) => { const n = { ...cp }; delete n[it.cid]; return n; });
        if (mo) { setDispMO(mo); setDispDept(target.dept); setDispQty(mo.remaining); setDispCraftsman(""); setDispDue(mo.due_date ?? ""); }
      }
      // วางที่อื่น = คงตำแหน่งอิสระไว้
    } else {
      const wo = board.workOrders.find((x) => x.id === it.id); if (!wo) return;
      if (target && target.kind === "dept" && target.dept && wo.department_id !== target.dept.id) {
        const d = target.dept;
        setBoard((b) => ({ ...b, workOrders: b.workOrders.map((x) => x.id === it.id ? { ...x, department_id: d.id, department_name: d.name } : x) }));
        try { const res = await apiFetch(`/api/mo/work-orders/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ department_id: d.id, department_name: d.name, stage: stageOfDept(d.name) }) });
          const j = await res.json(); if (j.error) throw new Error(j.error);
        } catch (err) { toast.error(err instanceof Error ? err.message : "ย้ายไม่สำเร็จ"); await load(); }
      }
      // คงตำแหน่งที่วางไว้ (อิสระ)
    }
  };

  const openColor = async () => { setColorOpen(true); try { const r = await apiFetch("/api/brands"); const j = await r.json(); setBrands(j.data ?? []); } catch { /* ignore */ } };
  const saveColor = async (id: string, color: string) => {
    setBrands((bs) => bs.map((b) => b.id === id ? { ...b, color } : b));
    try { await apiFetch("/api/brands", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, color }) }); await load(); }
    catch { toast.error("บันทึกสีไม่สำเร็จ"); }
  };

  const submitDispatch = async () => {
    if (!dispMO || !dispDept) return;
    if (!(dispQty > 0)) { toast.error("จำนวนต้องมากกว่า 0"); return; }
    const craft = craftsmen.find((c) => c.id === dispCraftsman);
    setDispSaving(true);
    try {
      const res = await apiFetch("/api/mo/work-orders", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mo_no: dispMO.mo_no, product_sku: dispMO.product_sku, product_name: dispMO.product_name,
          stage: stageOfDept(dispDept.name), department_id: dispDept.id, department_name: dispDept.name,
          assignee_type: craft ? "craftsman" : "department", assignee_id: craft?.id ?? null, assignee_name: craft?.name ?? dispDept.name,
          qty: dispQty, uom: "ชิ้น", dispatch_date: new Date().toISOString().slice(0, 10), due_date: dispDue || null, note: `จากใบสั่งผลิต ${dispMO.mo_no}` }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`จ่ายงานเข้า ${dispDept.name} แล้ว: ${j.wo_no ?? ""}`);
      setDispMO(null); setDispDept(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "จ่ายงานไม่สำเร็จ"); }
    finally { setDispSaving(false); }
  };
  const deptCraftsmen = useMemo(() => dispDept ? craftsmen.filter((c) => c.department_id === dispDept.id) : [], [dispDept, craftsmen]);

  // รับงานคืน (จากการ์ดบนบอร์ด) — รองรับรับคืนบางส่วน
  const submitReceive = async () => {
    if (!detailWO) return;
    const total = (detailWO.received_qty || 0) + recvQty;
    setRecvSaving(true);
    try {
      const res = await apiFetch(`/api/mo/work-orders/${detailWO.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ received_qty: total }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("บันทึกรับงานคืนแล้ว"); setDetailWO(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setRecvSaving(false); }
  };
  const cancelWO = async (wo: WorkOrder) => {
    try { const res = await apiFetch(`/api/mo/work-orders/${wo.id}`, { method: "DELETE" }); const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("ยกเลิกใบจ่ายงานแล้ว"); setDetailWO(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ"); }
  };

  // รายการการ์ดทั้งหมด (วาดแยกจากโซน เพื่อวางอิสระทับโซนได้)
  const cards = useMemo(() => {
    const arr: { cid: string; kind: "mo" | "wo"; node: React.ReactNode }[] = [];
    for (const m of board.pending) arr.push({ cid: `mo:${m.id}`, kind: "mo", node: <PendingBody mo={m} /> });
    for (const w of board.workOrders) if (w.status !== "done") arr.push({ cid: `wo:${w.id}`, kind: "wo", node: <WOBody w={w} /> });
    return arr;
  }, [board]);

  if (!canView) return <AccessDenied />;

  return (
    <div className={isMax ? "fixed inset-0 z-[60] bg-white flex flex-col p-3" : "max-w-[1700px] mx-auto px-5 py-5"}>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">📋 บอร์ดจ่ายงาน</h1>
          <p className="text-sm text-slate-500 mt-0.5">ลากการ์ดวางได้อิสระ · ปล่อยในโซนแผนก = จ่าย/ย้าย · ลากหัวโซน = ย้าย · ลากมุมโซน = ขยาย · ปุ่ม ▦ จัดเรียง</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openColor} className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">🎨 ตั้งสีแบรนด์</button>
          <a href="/master/manufacturing-orders" className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">🏭 ใบสั่งผลิต</a>
        </div>
      </div>

      {/* Toolbar */}
      <div className="z-20 flex items-center gap-1 bg-white rounded-lg border border-slate-200 shadow-sm p-1 w-fit mb-2">
        <ToolBtn active={tool === "select"} onClick={() => setTool("select")} title="เลือก/ลาก">🖱️</ToolBtn>
        <ToolBtn active={tool === "pan"} onClick={() => setTool("pan")} title="เลื่อนกระดาน">✋</ToolBtn>
        <Sep />
        <ToolBtn onClick={() => zoomBtn(1 / 1.2)} title="ซูมออก">➖</ToolBtn>
        <span className="text-xs text-slate-500 tabular-nums w-10 text-center">{Math.round(vp.scale * 100)}%</span>
        <ToolBtn onClick={() => zoomBtn(1.2)} title="ซูมเข้า">➕</ToolBtn>
        <Sep />
        <ToolBtn onClick={tidy} title="จัดเรียงการ์ดให้สวย">▦</ToolBtn>
        <ToolBtn onClick={resetView} title="จัดมุมมองกลับ">🎯</ToolBtn>
        <ToolBtn onClick={resetZones} title="รีเซ็ตตำแหน่ง/ขนาดโซน">↺</ToolBtn>
        <ToolBtn onClick={() => void load()} title="โหลดใหม่">⟳</ToolBtn>
        <ToolBtn onClick={() => setIsMax((m) => !m)} title={isMax ? "ย่อกลับ" : "ขยายเต็มจอ"}>{isMax ? "🗗" : "⛶"}</ToolBtn>
      </div>

      {loading ? <div className="text-center py-20 text-slate-400">กำลังโหลด…</div> : (
        <div ref={boardRef} onPointerDown={onBoardDown} onPointerMove={onMove} onPointerUp={onUp}
          className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white ${isMax ? "flex-1" : "h-[calc(100vh-230px)] min-h-[520px]"} ${tool === "pan" ? "cursor-grab" : "cursor-default"}`}
          style={{ backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)", backgroundSize: `${24 * vp.scale}px ${24 * vp.scale}px`, backgroundPosition: `${vp.x}px ${vp.y}px`, touchAction: "none" }}>
          <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${vp.x}px,${vp.y}px) scale(${vp.scale})` }}>
            {/* โซน (กล่องพื้นหลัง + drop target) */}
            {zones.map((z) => {
              const p = posOfZone(z.key); const count = countOf(z); const zw = zoneWof(z.key);
              return (
                <div key={z.key} className="absolute rounded-2xl border-2 border-dashed bg-white/40" style={{ left: p.x, top: p.y, width: zw, height: zoneH(z), borderColor: `${z.accent}88` }}>
                  <div onPointerDown={(e) => onZoneDown(e, z.key)} title="ลากเพื่อย้ายตำแหน่งแผนก"
                    className="flex items-center justify-between px-3 rounded-t-2xl cursor-move select-none" style={{ height: HEADER_H, background: `${z.accent}1f`, borderBottom: `2px solid ${z.accent}55` }}>
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: z.accent }} /><span className="text-base font-bold text-slate-700 truncate">{z.label}</span></div>
                    <span className="text-xs font-medium text-slate-500 bg-white/70 rounded-full px-2 py-0.5">{count}</span>
                  </div>
                  {count === 0 && <div className="flex items-center justify-center text-xs text-slate-300 mt-6">{z.kind === "pending" ? "ไม่มีงานรอจ่าย" : "ลากงานมาที่นี่"}</div>}
                  <div onPointerDown={(e) => onZoneResizeDown(e, z)} title="ลากเพื่อขยาย/ย่อโซน"
                    className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize rounded-br-2xl" style={{ background: `linear-gradient(135deg, transparent 50%, ${z.accent}99 50%)` }} />
                </div>
              );
            })}

            {/* การ์ด (วางอิสระทับโซน) */}
            {cards.map((c) => {
              const p = posOfCard(c.cid);
              return (
                <div key={c.cid} onPointerDown={(e) => onCardDown(e, c.kind, c.cid.slice(3))}
                  className={`absolute ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${dragId === c.cid ? "z-50 rotate-1" : "z-10"}`}
                  style={{ left: p.x, top: p.y, width: CARD_W }}>
                  {c.node}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* popup จ่ายงาน */}
      <ERPModal open={dispMO !== null} onClose={() => !dispSaving && setDispMO(null)} size="md" title={`🧰 จ่ายงาน → ${dispDept?.name ?? ""}`}
        footer={<>
          <button onClick={() => setDispMO(null)} disabled={dispSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={submitDispatch} disabled={dispSaving} className="h-9 px-4 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{dispSaving ? "กำลังจ่าย..." : "ยืนยันจ่ายงาน"}</button>
        </>}>
        {dispMO && (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-400">ใบสั่งผลิต <b>{dispMO.mo_no}</b> · {dispMO.product_name ?? dispMO.product_sku} · เหลือจ่าย {fmt(dispMO.remaining)} ชิ้น</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="text-[11px] text-slate-500">จำนวนที่จ่าย</span>
                <input type="number" min={0} step="any" max={dispMO.remaining} value={dispQty} onChange={(e) => setDispQty(Number(e.target.value))}
                  className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label>
              <label className="block"><span className="text-[11px] text-slate-500">กำหนดเสร็จ</span>
                <input type="date" value={dispDue} onChange={(e) => setDispDue(e.target.value)} className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label>
            </div>
            <label className="block"><span className="text-[11px] text-slate-500">ช่างในแผนก {dispDept?.name}</span>
              <select value={dispCraftsman} onChange={(e) => setDispCraftsman(e.target.value)}
                className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">— ทั้งแผนก (ไม่ระบุช่าง) —</option>
                {deptCraftsmen.map((c) => <option key={c.id} value={c.id}>{c.code ? `[${c.code}] ` : ""}{c.name}</option>)}
              </select>
              {deptCraftsmen.length === 0 && <span className="text-[10px] text-slate-400">แผนกนี้ยังไม่มีช่าง — จ่ายเป็นทั้งแผนกได้</span>}
            </label>
          </div>
        )}
      </ERPModal>

      {/* popup ตั้งสีแบรนด์ */}
      <ERPModal open={colorOpen} onClose={() => setColorOpen(false)} size="sm" title="🎨 ตั้งสีประจำแบรนด์"
        footer={<button onClick={() => setColorOpen(false)} className="h-9 px-4 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">เสร็จ</button>}>
        <div className="space-y-2">
          <p className="text-[11px] text-slate-400">สีจะใช้เป็นกรอบการ์ดบนบอร์ด — กดที่ช่องสีเพื่อเปลี่ยน</p>
          {brands.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 py-1 border-b border-slate-50 last:border-0">
              <span className="text-sm text-slate-700">{b.name}</span>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded border border-slate-200" style={{ background: b.color ?? "transparent" }} />
                <input type="color" value={b.color ?? "#94a3b8"} onChange={(e) => saveColor(b.id, e.target.value)} className="h-7 w-10 cursor-pointer rounded" />
              </div>
            </div>
          ))}
          {brands.length === 0 && <div className="text-center text-xs text-slate-300 py-6">ไม่มีแบรนด์</div>}
        </div>
      </ERPModal>

      {/* รายละเอียดใบจ่ายงาน + รับงานคืน (คลิกการ์ด) */}
      <ERPModal open={detailWO !== null} onClose={() => !recvSaving && setDetailWO(null)} size="sm" title={`📄 ${detailWO?.wo_no ?? ""}`}
        footer={detailWO && (detailWO.status === "done" ? <button onClick={() => setDetailWO(null)} className="h-9 px-4 text-sm bg-slate-800 text-white rounded-lg">ปิด</button> : <>
          <button onClick={() => detailWO && cancelWO(detailWO)} disabled={recvSaving} className="h-9 px-4 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 disabled:opacity-50 mr-auto">ยกเลิกใบ</button>
          <button onClick={() => setDetailWO(null)} disabled={recvSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ปิด</button>
          <button onClick={submitReceive} disabled={recvSaving || recvQty <= 0} className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">{recvSaving ? "กำลังบันทึก..." : "รับงานคืน"}</button>
        </>)}>
        {detailWO && (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-slate-800">{detailWO.product_name ?? detailWO.product_sku}</p>
            <div className="grid grid-cols-2 gap-y-1 text-xs text-slate-500">
              <span>ใบสั่งผลิต</span><span className="text-slate-700">{detailWO.mo_no}</span>
              <span>แผนก/ผู้รับ</span><span className="text-slate-700">{detailWO.department_name ?? "—"} · {detailWO.assignee_name ?? "—"}</span>
              <span>จ่าย</span><span className="text-slate-700">{fmt(detailWO.qty)} ชิ้น</span>
              <span>รับคืนแล้ว</span><span className="text-slate-700">{fmt(detailWO.received_qty)} · เหลือ {fmt(detailWO.qty - detailWO.received_qty)}</span>
              <span>กำหนดเสร็จ</span><span className="text-slate-700">{detailWO.due_date ?? "—"}</span>
              <span>สถานะ</span><span><span className={`text-[11px] px-2 py-0.5 rounded border ${(WO_STATUS[detailWO.status] ?? WO_STATUS.dispatched).cls}`}>{(WO_STATUS[detailWO.status] ?? WO_STATUS.dispatched).label}</span></span>
            </div>
            {detailWO.status !== "done" && (
              <label className="block pt-1"><span className="text-[11px] text-slate-500">รับคืนรอบนี้ (ชิ้น)</span>
                <input type="number" min={0} step="any" max={detailWO.qty - detailWO.received_qty} value={recvQty} onChange={(e) => setRecvQty(Number(e.target.value))}
                  className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" /></label>
            )}
          </div>
        )}
      </ERPModal>

      {/* รายละเอียดใบสั่งผลิต (คลิกการ์ดรอจ่าย) */}
      <ERPModal open={detailMO !== null} onClose={() => setDetailMO(null)} size="sm" title={`🏭 ${detailMO?.mo_no ?? ""}`}
        footer={<>
          <button onClick={() => setDetailMO(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
          <a href="/master/manufacturing-orders" className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center">เปิดหน้าใบสั่งผลิต</a>
        </>}>
        {detailMO && (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-slate-800">{detailMO.product_name ?? detailMO.product_sku}</p>
            <div className="grid grid-cols-2 gap-y-1 text-xs text-slate-500">
              {detailMO.brand && <><span>แบรนด์</span><span className="text-slate-700">{detailMO.brand}</span></>}
              <span>ผลิตทั้งหมด</span><span className="text-slate-700">{fmt(detailMO.qty)} ชิ้น</span>
              <span>จ่ายแล้ว</span><span className="text-slate-700">{fmt(detailMO.dispatched)}</span>
              <span>เหลือจ่าย</span><span className="text-rose-600 font-semibold">{fmt(detailMO.remaining)}</span>
              <span>กำหนดเสร็จ</span><span className="text-slate-700">{detailMO.due_date ?? "—"}</span>
            </div>
            <p className="text-[11px] text-slate-400 pt-1">ลากการ์ดนี้ไปวางที่โซนแผนก เพื่อจ่ายงาน</p>
          </div>
        )}
      </ERPModal>
    </div>
  );
}

function Sep() { return <span className="w-px h-6 bg-slate-200 mx-0.5" />; }
function ToolBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return <button onClick={onClick} title={title} className={`h-8 min-w-8 px-1.5 flex items-center justify-center rounded-md text-sm transition-colors ${active ? "bg-indigo-100 ring-1 ring-indigo-300" : "hover:bg-slate-100"}`}>{children}</button>;
}

// ---- เนื้อการ์ดใบสั่งผลิต (รอจ่าย) ----
function PendingBody({ mo }: { mo: PendingMO }) {
  const urg = urgencyByDate(mo.due_date, false);
  const border = mo.brand_color || prodColor(mo.product_sku);
  return (
    <div className="bg-white rounded-lg p-2.5 shadow-sm hover:shadow transition select-none" style={{ border: `2px solid ${border}` }}>
      <div className="relative w-full aspect-square rounded-md bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center mb-2">
        {mo.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={mo.image_url} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" /> : <span className="text-slate-300 text-3xl">📦</span>}
        <span className={`absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${URG_DOT[urg]}`} />
      </div>
      <div className="flex items-center justify-between gap-2 mb-1">
        {mo.brand ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border truncate max-w-[60%]" style={{ background: `${border}18`, color: border, borderColor: `${border}55` }}>{mo.brand}</span> : <span className="text-[10px] text-slate-400">ใบสั่งผลิต</span>}
        <span className="font-mono text-[10px] text-slate-400">{mo.mo_no}</span>
      </div>
      <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2 min-h-[2.4em]">{mo.product_name ?? mo.product_sku}</p>
      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px]">
        <span className="text-rose-600 font-semibold">เหลือ {fmt(mo.remaining)}/{fmt(mo.qty)}</span>
        <span className={urg === "red" ? "text-rose-600 font-semibold" : "text-slate-400"}>⏱ {daysLeftText(mo.due_date)}</span>
      </div>
    </div>
  );
}

// ---- เนื้อการ์ดใบจ่ายงาน (ในแผนก) ----
function WOBody({ w }: { w: WorkOrder }) {
  const urg = urgencyByDate(w.due_date, w.status === "done");
  const st = WO_STATUS[w.status] ?? WO_STATUS.dispatched;
  const border = w.brand_color || prodColor(w.product_sku);
  return (
    <div className="bg-white rounded-lg p-2.5 shadow-sm hover:shadow transition select-none" style={{ border: `2px solid ${border}` }}>
      <div className="relative w-full aspect-square rounded-md bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center mb-2">
        {w.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={w.image_url} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" /> : <span className="text-slate-300 text-3xl">📦</span>}
        <span className={`absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${URG_DOT[urg]}`} />
        <span className={`absolute top-1.5 left-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${st.cls}`}>{st.label}</span>
      </div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[11px] text-slate-500 truncate">{w.assignee_type === "department" ? "🏢 " : "👤 "}{w.assignee_name}</span>
        <span className="font-mono text-[10px] text-slate-400">{w.wo_no}</span>
      </div>
      <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2 min-h-[2.4em]">{w.product_name ?? w.product_sku}</p>
      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px]">
        <span className="tabular-nums text-slate-600">{fmt(w.qty)} ชิ้น{w.received_qty > 0 && w.status !== "done" ? ` · รับ ${fmt(w.received_qty)}` : ""}</span>
        <span className={urg === "red" ? "text-rose-600 font-semibold" : "text-slate-400"}>⏱ {daysLeftText(w.due_date)}</span>
      </div>
    </div>
  );
}
