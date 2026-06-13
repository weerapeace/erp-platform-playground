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

type Dept = { id: string; name: string; note?: string | null; show_note?: boolean };
type DeptFull = { id: string; name: string; status: string | null; note: string | null; show_note: boolean; display_order: number | null };
type PendingMO = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number; dispatched: number; remaining: number; due_date: string | null; status: string;
  image_url: string | null; brand: string | null; brand_color: string | null;
  prep_done: boolean; cut_done: boolean;
  // Phase 2: เช็กลิสต์วัตถุดิบจาก BOM
  has_bom: boolean; prep_total: number; prep_ready: number; cut_total: number; cut_ready: number; ready: boolean;
};
type MatRow = { id: string; component_sku: string | null; component_name: string | null; required_qty: number; uom: string | null; is_ready: boolean; cut_done: boolean; needs_cut: boolean };
// แถวรายบล็อกสำหรับ "หน้าตัด" — มาจาก mo_materials โดยตรง (1 แถว = 1 บล็อกตัด) ติ๊กตัดครบรายบล็อกได้
type CutRow = { id: string; component_sku: string | null; component_name: string | null; cut_block_code: string | null; cut_width: number | null; cut_length: number | null; pieces: number | null; required_qty: number; uom: string | null; cut_done: boolean };
type Board = { departments: Dept[]; workOrders: WorkOrder[]; pending: PendingMO[] };
type Pos = { x: number; y: number };
type Size = { w: number; h: number };
type Viewport = { x: number; y: number; scale: number };
type Inter =
  | { type: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { type: "zone"; key: string; sx: number; sy: number; ox: number; oy: number; cards: { cid: string; ox: number; oy: number }[] }
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

const ZONE_W = 220, HEADER_H = 44, NOTE_H = 26, CARD_W = 150, CARD_SLOT = 228, GAP_C = 14, PENDING_W = 3 * 150 + 2 * 14 + 24, PAD = 12, GAP = 40;
const ZONES_KEY = "erp-workboard-zones:v2", ZONESIZE_KEY = "erp-workboard-zonesizes:v2", CARDPOS_KEY = "erp-workboard-cards:v2";
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
const daysUntil = (due: string | null): number | null => {
  if (!due) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.floor((new Date(due + "T00:00:00").getTime() - today.getTime()) / 86400000);
};
// สีตามจำนวนวัน: <7 แดง · <15 เหลือง · อื่นๆ เทา
const daysLeftClass = (due: string | null): string => {
  const d = daysUntil(due);
  if (d == null) return "text-slate-400";
  if (d < 7) return "text-rose-600 font-semibold";
  if (d < 15) return "text-amber-600 font-semibold";
  return "text-slate-400";
};
const dueDateText = (due: string | null): string => (due ? new Date(due + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const stageOfDept = (name: string) => (name.includes("ตัด") || name.includes("เตรียม") ? "cut" : "assemble");

type Zone = { key: string; label: string; kind: "pending" | "dept"; dept?: Dept; accent: string; moCards: PendingMO[]; woCards: WorkOrder[] };

export default function WorkBoardPage() {
  const canView = usePermission("products.view");
  const canEdit = usePermission("products.edit");
  // สิทธิ์ "จ่ายงานเข้าแผนก" แยกต่างหาก — ตั้งค่ารายตำแหน่งได้ที่ /admin/roles-permissions
  const canDispatch = usePermission("work_board.dispatch");
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
  const [warnDispatch, setWarnDispatch] = useState<{ mo: PendingMO; dept: Dept } | null>(null);  // Phase 3: เตือนจ่ายทั้งที่ยังไม่พร้อม
  const [colorOpen, setColorOpen] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  // คลิกการ์ด = ดูรายละเอียด / รับงานคืน
  const [detailWO, setDetailWO] = useState<WorkOrder | null>(null);
  const [detailMO, setDetailMO] = useState<PendingMO | null>(null);
  const [recvQty, setRecvQty] = useState(0);
  const [recvSaving, setRecvSaving] = useState(false);
  // Phase 2: ป๊อปอัปเช็กลิสต์วัตถุดิบ (เตรียม/ตัด รายชิ้น)
  const [checklistMO, setChecklistMO] = useState<PendingMO | null>(null);
  const [clRows, setClRows] = useState<MatRow[]>([]);
  const [clCutRows, setClCutRows] = useState<CutRow[]>([]);
  const [clLoading, setClLoading] = useState(false);
  const [delArmed, setDelArmed] = useState(false);   // ยืนยันลบงานใน popup
  const [clTab, setClTab] = useState<"prep" | "cut">("prep");   // แท็บเช็กลิสต์: เตรียม/ตัด
  // popup ตั้งค่าแผนก (สร้าง/แก้/ลบ/โชว์-ซ่อน/หมายเหตุ/เรียงลำดับ)
  const [deptMgrOpen, setDeptMgrOpen] = useState(false);
  const [deptList, setDeptList] = useState<DeptFull[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);

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
    // เอาแผนก "ตัด/เตรียม" ออกจากบอร์ด — งานตัด/เตรียมย้ายไปเป็นเช็กลิสต์ในตัวการ์ดรอจ่าย
    board.departments.filter((d) => stageOfDept(d.name) !== "cut").forEach((d, i) => arr.push({ key: `dept:${d.id}`, label: d.name, kind: "dept", dept: d, accent: ACCENT[(i + 1) % ACCENT.length], moCards: [], woCards: wosByDept.get(d.id) ?? [] }));
    return arr;
  }, [board, wosByDept]);

  const countOf = (z: Zone) => (z.kind === "pending" ? z.moCards.length : z.woCards.length);
  // หมายเหตุที่จะโชว์ใต้หัวแผนก (ถ้าเปิด "โชว์หมายเหตุ")
  const noteOf = useCallback((z: Zone) => (z.kind === "dept" && z.dept?.show_note && z.dept?.note ? z.dept.note : null), []);
  // ความกว้าง: "รอจ่าย" เป็นกล่องใหญ่ (หลายคอลัมน์) · แผนกอื่นกว้างมาตรฐาน
  const defWof = useCallback((key: string) => (key === "pending" ? PENDING_W : ZONE_W), []);
  const zoneWof = useCallback((key: string) => zoneSize[key]?.w ?? defWof(key), [zoneSize, defWof]);
  const colsOf = useCallback((key: string) => Math.max(1, Math.floor((zoneWof(key) - PAD) / (CARD_W + GAP_C))), [zoneWof]);
  // ตำแหน่งเริ่มต้นของโซน — เรียงซ้าย→ขวาแบบสะสมความกว้าง (กล่องรอจ่ายใหญ่อยู่ซ้ายสุด)
  const defaultLayout = useMemo(() => {
    const m: Record<string, Pos> = {}; let x = 0;
    for (const z of zones) { m[z.key] = { x, y: 0 }; x += zoneWof(z.key) + GAP; }
    return m;
  }, [zones, zoneWof]);
  const posOfZone = useCallback((key: string): Pos => zonePos[key] ?? defaultLayout[key] ?? { x: 0, y: 0 }, [zonePos, defaultLayout]);
  const zoneH = useCallback((z: Zone) => {
    const rows = z.kind === "pending" ? Math.ceil(Math.max(1, countOf(z)) / colsOf(z.key)) : Math.max(1, countOf(z));
    const auto = HEADER_H + (noteOf(z) ? NOTE_H : 0) + rows * CARD_SLOT + PAD;
    return Math.max(auto, zoneSize[z.key]?.h ?? 0);
  }, [zoneSize, colsOf, noteOf]);

  // ตำแหน่ง "จัดเรียงสวย" อัตโนมัติ — รอจ่าย=กริดหลายคอลัมน์ · แผนก=คอลัมน์เดียว
  const autoPos = useMemo(() => {
    const map: Record<string, Pos> = {};
    for (const z of zones) {
      const p = posOfZone(z.key); const zw = zoneWof(z.key);
      if (z.kind === "pending") {
        const cols = colsOf(z.key);
        z.moCards.forEach((m, i) => {
          const col = i % cols, row = Math.floor(i / cols);
          map[`mo:${m.id}`] = { x: p.x + PAD + col * (CARD_W + GAP_C), y: p.y + HEADER_H + 10 + row * CARD_SLOT };
        });
      } else {
        const noteY = noteOf(z) ? NOTE_H : 0;
        z.woCards.forEach((w, i) => { map[`wo:${w.id}`] = { x: p.x + (zw - CARD_W) / 2, y: p.y + HEADER_H + 10 + noteY + i * CARD_SLOT }; });
      }
    }
    return map;
  }, [zones, posOfZone, zoneWof, colsOf, noteOf]);
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

  // เปิด popup จ่ายงาน (ตั้งค่าเริ่มต้นจาก MO)
  const openDispatch = useCallback((mo: PendingMO, dept: Dept) => {
    setDispMO(mo); setDispDept(dept); setDispQty(mo.remaining); setDispCraftsman(""); setDispDue(mo.due_date ?? "");
  }, []);

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
    // จับการ์ดในแผนกนี้ที่ "เคยลากเอง" (มีตำแหน่งจำไว้) เพื่อให้เลื่อนตามแผนกไปด้วย
    const z = zones.find((x) => x.key === key);
    const cids = z ? (z.kind === "pending" ? z.moCards.map((m) => `mo:${m.id}`) : z.woCards.map((w) => `wo:${w.id}`)) : [];
    const cards = cids.filter((cid) => cardPos[cid]).map((cid) => ({ cid, ox: cardPos[cid].x, oy: cardPos[cid].y }));
    interRef.current = { type: "zone", key, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, cards };
  };
  const onZoneResizeDown = (e: RPE, z: Zone) => {
    e.stopPropagation();
    boardRef.current?.setPointerCapture(e.pointerId); movedRef.current = false;
    interRef.current = { type: "resize", key: z.key, sx: e.clientX, sy: e.clientY, ow: zoneWof(z.key), oh: zoneH(z) };
  };
  const onCardDown = (e: RPE, kind: "mo" | "wo", id: string) => {
    // กดเพื่อเปิดรายละเอียด/เช็กลิสต์ได้เสมอ (อยู่หน้านี้ = ดูได้); การลากเพื่อจ่าย/ย้ายงานค่อยเช็คสิทธิ์ตอนวาง
    if (tool === "pan") return;
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
    else if (it.type === "zone") {
      setZonePos((zp) => ({ ...zp, [it.key]: { x: it.ox + dx / vp.scale, y: it.oy + dy / vp.scale } }));
      if (it.cards.length) setCardPos((cp) => { const n = { ...cp }; for (const c of it.cards) n[c.cid] = { x: c.ox + dx / vp.scale, y: c.oy + dy / vp.scale }; return n; });
    }
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
      else { const mo = board.pending.find((x) => x.id === it.id); if (mo) setChecklistMO(mo); }
      return;
    }
    const w = screenToWorld(e.clientX, e.clientY);
    const target = hitZone(w.x, w.y);
    if (it.kind === "mo") {
      // วางในโซนแผนก = จ่ายงาน (เด้ง popup) แล้วสแนปการ์ดกลับโซนรอจ่าย
      if (target && target.kind === "dept" && target.dept) {
        const mo = board.pending.find((m) => m.id === it.id);
        setCardPos((cp) => { const n = { ...cp }; delete n[it.cid]; return n; });
        if (!canDispatch) { toast.error("คุณไม่มีสิทธิ์จ่ายงาน — ให้ผู้ดูแลเปิดสิทธิ์ที่หน้าจัดการสิทธิ์ (การผลิต › จ่ายงานเข้าแผนก)"); return; }
        if (mo) {
          if (mo.ready) openDispatch(mo, target.dept);
          else setWarnDispatch({ mo, dept: target.dept });   // ยังไม่พร้อม → เตือนก่อน (แต่จ่ายต่อได้)
        }
      }
      // วางที่อื่น = คงตำแหน่งอิสระไว้
    } else {
      const wo = board.workOrders.find((x) => x.id === it.id); if (!wo) return;
      if (target && target.kind === "dept" && target.dept && wo.department_id !== target.dept.id) {
        if (!canEdit) { toast.error("คุณไม่มีสิทธิ์ย้ายงานข้ามแผนก"); await load(); return; }
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

  // โหลดเช็กลิสต์วัตถุดิบเมื่อเปิดป๊อปอัป (เตรียม=is_ready, ตัด=cut_done; needs_cut จากข้อมูลบล็อกตัด)
  useEffect(() => {
    setDelArmed(false); setClTab("prep");
    if (!checklistMO) { setClRows([]); setClCutRows([]); return; }
    let cancel = false; setClLoading(true);
    void (async () => {
      try {
        const res = await apiFetch(`/api/mo/${checklistMO.id}`); const j = await res.json();
        const summary = (j?.data?.summary ?? []) as Record<string, unknown>[];
        const materials = (j?.data?.materials ?? []) as Record<string, unknown>[];
        // ตัดครบของวัตถุดิบ = ทุกบล็อกที่ต้องตัดของมันตัดครบ (จาก mo_materials รายบล็อก)
        const cutTotal = new Map<string, number>(), cutDone = new Map<string, number>();
        for (const x of materials) {
          if (!(x.cut_block_code != null || x.cut_length != null || x.pieces != null)) continue;
          const k = String(x.component_sku);
          cutTotal.set(k, (cutTotal.get(k) ?? 0) + 1);
          if (x.cut_done) cutDone.set(k, (cutDone.get(k) ?? 0) + 1);
        }
        const rows: MatRow[] = summary.map((s) => {
          const k = String(s.component_sku); const ct = cutTotal.get(k) ?? 0;
          return { id: String(s.id), component_sku: (s.component_sku as string) ?? null, component_name: (s.component_name as string) ?? null,
            required_qty: Number(s.required_qty) || 0, uom: (s.uom as string) ?? null,
            is_ready: !!s.is_ready, needs_cut: ct > 0, cut_done: ct > 0 && (cutDone.get(k) ?? 0) >= ct };
        });
        // หน้าตัด — รายบล็อกจริงจาก mo_materials (1 แถว = 1 บล็อกตัด)
        const isCut = (x: Record<string, unknown>) => x.cut_block_code != null || x.cut_length != null || x.pieces != null;
        const num = (v: unknown) => (v == null ? null : Number(v));
        const cutRows: CutRow[] = materials.filter(isCut).map((x) => ({
          id: String(x.id), component_sku: (x.component_sku as string) ?? null, component_name: (x.component_name as string) ?? null,
          cut_block_code: (x.cut_block_code as string) ?? null, cut_width: num(x.cut_width), cut_length: num(x.cut_length), pieces: num(x.pieces),
          required_qty: Number(x.required_qty) || 0, uom: (x.uom as string) ?? null, cut_done: !!x.cut_done,
        }));
        if (!cancel) { setClRows(rows); setClCutRows(cutRows); }
      } catch { if (!cancel) { setClRows([]); setClCutRows([]); } }
      finally { if (!cancel) setClLoading(false); }
    })();
    return () => { cancel = true; };
  }, [checklistMO]);

  // ติ๊กเตรียม/ตัด รายวัตถุดิบในป๊อปอัป (optimistic + audit)
  const toggleMat = useCallback(async (rowId: string, field: "is_ready" | "cut_done") => {
    if (!canEdit) return;
    const cur = clRows.find((r) => r.id === rowId); if (!cur) return;
    const next = !cur[field];
    setClRows((rs) => rs.map((r) => r.id === rowId ? { ...r, [field]: next } : r));
    try {
      const res = await apiFetch(`/api/mo/material`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rowId, [field]: next }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
    } catch (e) {
      setClRows((rs) => rs.map((r) => r.id === rowId ? { ...r, [field]: !next } : r));
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }, [canEdit, clRows, toast]);
  // ติ๊ก "ตัดครบ" รายบล็อก (หน้าตัด) — อัปเดต mo_materials + ลิงก์สองทางมาที่เตรียมครบในหน้าเตรียม
  const toggleCut = useCallback(async (rowId: string) => {
    if (!canEdit) return;
    const cur = clCutRows.find((r) => r.id === rowId); if (!cur) return;
    const next = !cur.cut_done;
    setClCutRows((rs) => rs.map((r) => r.id === rowId ? { ...r, cut_done: next } : r));
    try {
      const res = await apiFetch(`/api/mo/material-line`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rowId, cut_done: next }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      // server คืน is_ready (เตรียมครบ) ของวัตถุดิบนั้น → sync แท็บเตรียม
      if (cur.component_sku != null && typeof j.is_ready === "boolean") {
        setClRows((rs) => rs.map((r) => r.component_sku === cur.component_sku ? { ...r, is_ready: j.is_ready, cut_done: j.is_ready } : r));
      }
    } catch (e) {
      setClCutRows((rs) => rs.map((r) => r.id === rowId ? { ...r, cut_done: !next } : r));
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }, [canEdit, clCutRows, toast]);
  const closeChecklist = useCallback(() => { setChecklistMO(null); setDelArmed(false); void load(); }, [load]);
  const deleteMO = useCallback(async (mo: PendingMO) => {
    try {
      const res = await apiFetch(`/api/mo/${mo.id}`, { method: "DELETE" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("ลบงานแล้ว"); setChecklistMO(null); setDelArmed(false); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  }, [toast, load]);

  // ---- จัดการแผนก (popup ตั้งค่าแผนก) ----
  const loadDepts = useCallback(async () => {
    setDeptLoading(true);
    try { const res = await apiFetch("/api/mo/departments"); const j = await res.json(); setDeptList((j.data ?? []) as DeptFull[]); }
    catch { /* ignore */ } finally { setDeptLoading(false); }
  }, []);
  const openDeptMgr = useCallback(() => { setConfirmDelId(null); setDeptMgrOpen(true); void loadDepts(); }, [loadDepts]);
  const closeDeptMgr = useCallback(() => { setDeptMgrOpen(false); void load(); }, [load]);
  const patchDept = useCallback(async (id: string, p: Partial<DeptFull>) => {
    setDeptList((ls) => ls.map((d) => d.id === id ? { ...d, ...p } : d));
    try { const res = await apiFetch("/api/mo/departments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...p }) }); const j = await res.json(); if (j.error) throw new Error(j.error); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); void loadDepts(); }
  }, [toast, loadDepts]);
  const addDept = useCallback(async () => {
    const name = newDeptName.trim(); if (!name) return;
    try { const res = await apiFetch("/api/mo/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); const j = await res.json(); if (j.error) throw new Error(j.error); setNewDeptName(""); await loadDepts(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
  }, [newDeptName, toast, loadDepts]);
  const delDept = useCallback(async (id: string) => {
    try { const res = await apiFetch(`/api/mo/departments?id=${encodeURIComponent(id)}`, { method: "DELETE" }); const j = await res.json(); if (j.error) throw new Error(j.error); setConfirmDelId(null); await loadDepts(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); setConfirmDelId(null); }
  }, [toast, loadDepts]);
  const moveDept = useCallback((idx: number, dir: -1 | 1) => {
    const j = idx + dir; if (j < 0 || j >= deptList.length) return;
    const arr = [...deptList]; const tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp;
    arr[idx] = { ...arr[idx], display_order: idx }; arr[j] = { ...arr[j], display_order: j };
    setDeptList(arr);
    void patchDept(arr[idx].id, { display_order: idx }); void patchDept(arr[j].id, { display_order: j });
  }, [deptList, patchDept]);

  // ติ๊ก "เตรียมครบ / ตัดครบ" บนการ์ดรอจ่าย → ไฟเขียวเมื่อครบทั้งคู่ (optimistic + audit) — ใช้กับใบที่ไม่มี BOM
  const togglePrep = useCallback(async (mo: PendingMO, field: "prep_done" | "cut_done") => {
    if (!canEdit) return;
    const next = !mo[field];
    const apply = (val: boolean) => setBoard((b) => ({ ...b, pending: b.pending.map((p) => {
      if (p.id !== mo.id) return p;
      const np = { ...p, [field]: val };
      return { ...np, ready: np.has_bom ? np.ready : (np.prep_done && np.cut_done) };
    }) }));
    apply(next);
    try {
      const res = await apiFetch(`/api/mo/${mo.id}/prep`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: next }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
    } catch (e) {
      apply(!next);
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }, [canEdit, toast]);

  // รายการการ์ดทั้งหมด (วาดแยกจากโซน เพื่อวางอิสระทับโซนได้)
  // ซ่อนใบจ่ายงานสเตจ "ตัด" (ของเดิม) — งานตัดย้ายไปเป็นเช็กลิสต์ในการ์ดรอจ่าย
  const cards = useMemo(() => {
    const arr: { cid: string; kind: "mo" | "wo"; node: React.ReactNode }[] = [];
    for (const m of board.pending) arr.push({ cid: `mo:${m.id}`, kind: "mo", node: <PendingBody mo={m} /> });
    for (const w of board.workOrders) if (w.status !== "done" && w.stage !== "cut") arr.push({ cid: `wo:${w.id}`, kind: "wo", node: <WOBody w={w} /> });
    return arr;
  }, [board, canEdit, togglePrep]);

  if (!canView) return <AccessDenied />;

  return (
    <div className={isMax ? "fixed inset-0 z-[60] bg-white flex flex-col p-3" : "max-w-[1700px] mx-auto px-5 py-5"}>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">📋 บอร์ดจ่ายงาน</h1>
          <p className="text-sm text-slate-500 mt-0.5">ติ๊ก <b>เตรียม/ตัด</b> บนการ์ด → ครบทั้งคู่ <b className="text-emerald-600">ไฟเขียว</b> = พร้อมจ่าย → ลากไปวางที่แผนกช่างเพื่อจ่ายงาน</p>
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
        <Sep />
        <ToolBtn onClick={openDeptMgr} title="ตั้งค่าแผนก (เพิ่ม/แก้/ลบ/ซ่อน/หมายเหตุ)">⚙️</ToolBtn>
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
                  {noteOf(z) && <div className="flex items-center gap-1 px-3 text-[11px] text-amber-700 bg-amber-50/70 border-b border-amber-100 truncate" style={{ height: NOTE_H }} title={noteOf(z) ?? ""}>📝 <span className="truncate">{noteOf(z)}</span></div>}
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

      {/* Phase 3: เตือนเมื่อจ่ายทั้งที่ยังเตรียม/ตัดไม่ครบ (เตือนแต่จ่ายได้) */}
      <ERPModal open={warnDispatch !== null} onClose={() => setWarnDispatch(null)} size="sm" title="⚠️ ยังไม่พร้อมจ่าย"
        footer={<>
          <button onClick={() => setWarnDispatch(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">กลับไปเตรียม/ตัด</button>
          <button onClick={() => { if (warnDispatch) openDispatch(warnDispatch.mo, warnDispatch.dept); setWarnDispatch(null); }} className="h-9 px-4 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600">จ่ายงานต่อ</button>
        </>}>
        {warnDispatch && (
          <div className="space-y-2 text-sm">
            <p className="text-slate-700">งานนี้<b className="text-amber-600"> ยังเตรียม/ตัดไม่ครบ</b></p>
            <p className="font-medium text-slate-800">{warnDispatch.mo.product_name ?? warnDispatch.mo.product_sku}</p>
            <div className="flex gap-4 text-[12px]">
              {warnDispatch.mo.has_bom ? <>
                <span className={warnDispatch.mo.prep_ready >= warnDispatch.mo.prep_total ? "text-emerald-600" : "text-amber-600"}>เตรียม {warnDispatch.mo.prep_ready}/{warnDispatch.mo.prep_total}</span>
                <span className={warnDispatch.mo.cut_ready >= warnDispatch.mo.cut_total ? "text-emerald-600" : "text-amber-600"}>ตัด {warnDispatch.mo.cut_ready}/{warnDispatch.mo.cut_total}</span>
              </> : <>
                <span className={warnDispatch.mo.prep_done ? "text-emerald-600" : "text-amber-600"}>เตรียม {warnDispatch.mo.prep_done ? "ครบ ✓" : "ยังไม่ครบ"}</span>
                <span className={warnDispatch.mo.cut_done ? "text-emerald-600" : "text-amber-600"}>ตัด {warnDispatch.mo.cut_done ? "ครบ ✓" : "ยังไม่ครบ"}</span>
              </>}
            </div>
            <p className="text-[11px] text-slate-400 pt-1">ถ้าแน่ใจ กด “จ่ายงานต่อ” เพื่อจ่ายให้ <b>{warnDispatch.dept.name}</b> เลย</p>
          </div>
        )}
      </ERPModal>

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

      {/* เช็กลิสต์วัตถุดิบ เตรียม/ตัด (Phase 2 — จาก BOM) */}
      <ERPModal open={checklistMO !== null} onClose={closeChecklist} size="md" title={`📋 เช็กลิสต์เตรียม/ตัด · ${checklistMO?.mo_no ?? ""}`}
        footer={<>
          {checklistMO && canEdit && (delArmed
            ? <span className="mr-auto flex gap-1"><button onClick={() => deleteMO(checklistMO)} className="h-9 px-3 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700">ยืนยันลบงานนี้</button><button onClick={() => setDelArmed(false)} className="h-9 px-3 text-sm border border-slate-200 rounded-lg">ยกเลิก</button></span>
            : <button onClick={() => setDelArmed(true)} className="h-9 px-4 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 mr-auto">🗑 ลบงาน</button>)}
          <button onClick={closeChecklist} className="h-9 px-4 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">เสร็จ</button>
        </>}>
        {checklistMO && (() => {
          const curMo = board.pending.find((p) => p.id === checklistMO.id) ?? checklistMO;
          const prepTotal = clRows.length, prepDone = clRows.filter((r) => r.is_ready).length;
          const cutTotal = clCutRows.length, cutDone = clCutRows.filter((r) => r.cut_done).length;
          const ready = clRows.length > 0 ? (prepDone >= prepTotal && cutDone >= cutTotal) : curMo.ready;
          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-800 truncate">{checklistMO.product_name ?? checklistMO.product_sku}</p>
                <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${ready ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{ready ? "พร้อมจ่าย ✓" : "ยังไม่พร้อม"}</span>
              </div>
              {clLoading ? <div className="text-center py-8 text-slate-400 text-sm">กำลังโหลด…</div>
                : clRows.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-slate-400 text-sm mb-3">ใบนี้ยังไม่มีรายการวัตถุดิบจาก BOM — ติ๊กรวมทั้งใบ</p>
                      <div className="grid grid-cols-2 gap-2 max-w-[280px] mx-auto">
                        <StepChip label="เตรียม" done={curMo.prep_done} disabled={!canEdit} onClick={() => togglePrep(curMo, "prep_done")} />
                        <StepChip label="ตัด" done={curMo.cut_done} disabled={!canEdit} onClick={() => togglePrep(curMo, "cut_done")} />
                      </div>
                    </div>
                  )
                  : (
                    <div className="space-y-2">
                      {/* 2 หน้า: เตรียม / ตัด (เหมือนใบสั่งผลิตจริง) */}
                      <div className="flex border border-slate-200 rounded-lg overflow-hidden text-sm w-fit">
                        <button type="button" onClick={() => setClTab("prep")} className={`h-8 px-4 ${clTab === "prep" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📋 หน้าเตรียม {prepDone}/{prepTotal}</button>
                        <button type="button" onClick={() => setClTab("cut")} className={`h-8 px-4 border-l border-slate-200 ${clTab === "cut" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>✂️ หน้าตัด {cutDone}/{cutTotal}</button>
                      </div>
                      {clTab === "prep" ? (
                        /* หน้าเตรียม — สรุปต่อวัตถุดิบ */
                        <div className="border border-slate-100 rounded-lg overflow-hidden">
                          <div className="grid grid-cols-[1fr_4rem] gap-2 px-3 py-1.5 bg-slate-50 text-[11px] font-medium text-slate-500"><span>วัตถุดิบ</span><span className="text-center">เตรียม</span></div>
                          <div className="divide-y divide-slate-50 max-h-[46vh] overflow-y-auto">
                            {clRows.map((r) => (
                              <div key={r.id} className="grid grid-cols-[1fr_4rem] gap-2 px-3 py-2 items-center">
                                <div className="min-w-0"><p className="text-sm text-slate-800 truncate">{r.component_name ?? r.component_sku}</p><p className="text-[10px] text-slate-400">ต้องใช้ {fmt(r.required_qty)} {r.uom ?? ""}</p></div>
                                <div className="flex justify-center"><CheckBtn done={r.is_ready} disabled={!canEdit} onClick={() => toggleMat(r.id, "is_ready")} /></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : clCutRows.length === 0 ? (
                        <div className="text-center py-8 text-slate-300 text-sm">ใบนี้ไม่มีงานตัด</div>
                      ) : (
                        /* หน้าตัด — รายละเอียดรายบล็อก (ติ๊กตัดครบรายบล็อกได้เลย) */
                        <div className="border border-slate-100 rounded-lg overflow-hidden">
                          <div className="grid grid-cols-[1fr_3rem] gap-2 px-3 py-1.5 bg-slate-50 text-[11px] font-medium text-slate-500"><span>บล็อก / วัตถุดิบ</span><span className="text-center">ตัด</span></div>
                          <div className="divide-y divide-slate-50 max-h-[46vh] overflow-y-auto">
                            {clCutRows.map((r) => (
                              <div key={r.id} className="grid grid-cols-[1fr_3rem] gap-2 px-3 py-2 items-center">
                                <div className="min-w-0">
                                  <p className="text-sm text-slate-800 truncate">
                                    {r.cut_block_code ? <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded mr-1.5">{r.cut_block_code}</span> : null}
                                    {r.component_name ?? r.component_sku}
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    {r.cut_width != null && r.cut_length != null ? `${fmt(r.cut_width)}×${fmt(r.cut_length)} · ` : ""}
                                    {r.pieces != null ? `${fmt(r.pieces)} ชิ้น · ` : ""}
                                    รวม {fmt(r.required_qty)} {r.uom ?? ""}
                                  </p>
                                </div>
                                <div className="flex justify-center"><CheckBtn done={r.cut_done} disabled={!canEdit} onClick={() => toggleCut(r.id)} /></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <p className="text-[11px] text-slate-400">{clTab === "prep" ? "ติ๊ก ✓ เมื่อเตรียมวัตถุดิบชิ้นนั้นครบ" : "ติ๊ก ✓ ตัดครบรายบล็อก — ตัดครบทุกบล็อกของวัตถุดิบใด ระบบติ๊กเตรียมครบให้อัตโนมัติ"} · ครบทั้ง 2 หน้า → การ์ด<b className="text-emerald-600">ไฟเขียว</b></p>
                    </div>
                  )}
            </div>
          );
        })()}
      </ERPModal>

      {/* ⚙️ ตั้งค่าแผนก — จบในที่เดียว (สร้าง/แก้/ลบ/ซ่อน/หมายเหตุ/เรียงลำดับ) */}
      <ERPModal open={deptMgrOpen} onClose={closeDeptMgr} size="md" title="⚙️ ตั้งค่าแผนก"
        footer={<>
          <a href="/admin/departments" className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center mr-auto">🏢 หน้าจัดการแผนกเต็ม</a>
          <button onClick={closeDeptMgr} className="h-9 px-4 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">เสร็จ</button>
        </>}>
        <div className="space-y-3">
          <p className="text-[11px] text-slate-400">เพิ่ม/แก้ไข/ลบแผนก · เปิด-ปิดการโชว์บนบอร์ด · ใส่หมายเหตุ · เรียงลำดับด้วย ▲▼</p>
          <div className="flex gap-2">
            <input value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addDept(); }}
              placeholder="ชื่อแผนกใหม่…" className="flex-1 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={() => void addDept()} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 whitespace-nowrap">＋ เพิ่มแผนก</button>
          </div>
          {deptLoading ? <div className="text-center py-6 text-slate-400 text-sm">กำลังโหลด…</div>
            : deptList.length === 0 ? <div className="text-center py-6 text-slate-300 text-sm">ยังไม่มีแผนก</div>
              : (
                <div className="border border-slate-100 rounded-lg divide-y divide-slate-50 max-h-[54vh] overflow-y-auto">
                  {deptList.map((d, i) => {
                    const shown = (d.status ?? "active") === "active";
                    const isCut = d.name.includes("ตัด") || d.name.includes("เตรียม");
                    return (
                      <div key={d.id} className="p-2.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col text-[10px] leading-none">
                            <button onClick={() => moveDept(i, -1)} disabled={i === 0} className="h-4 text-slate-400 hover:text-slate-700 disabled:opacity-20">▲</button>
                            <button onClick={() => moveDept(i, 1)} disabled={i === deptList.length - 1} className="h-4 text-slate-400 hover:text-slate-700 disabled:opacity-20">▼</button>
                          </div>
                          <input defaultValue={d.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== d.name) void patchDept(d.id, { name: v }); }}
                            className="flex-1 h-8 px-2 text-sm font-medium border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          {confirmDelId === d.id ? (
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => void delDept(d.id)} className="h-8 px-2 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700">ยืนยันลบ</button>
                              <button onClick={() => setConfirmDelId(null)} className="h-8 px-2 text-xs border border-slate-200 rounded-lg">ยกเลิก</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDelId(d.id)} title="ลบแผนก" className="shrink-0 h-8 w-8 flex items-center justify-center text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50">🗑</button>
                          )}
                        </div>
                        <div className="flex items-center gap-4 pl-7">
                          <Toggle label="โชว์ในบอร์ด" on={shown} onClick={() => void patchDept(d.id, { status: shown ? "inactive" : "active" })} />
                          <Toggle label="โชว์หมายเหตุ" on={d.show_note} onClick={() => void patchDept(d.id, { show_note: !d.show_note })} />
                          {isCut && <span className="text-[10px] text-amber-600">ℹ️ แผนกตัด/เตรียม จะไม่ขึ้นบอร์ด (อยู่ในตัวการ์ด)</span>}
                        </div>
                        <div className="pl-7">
                          <input defaultValue={d.note ?? ""} onBlur={(e) => { const v = e.target.value; if (v !== (d.note ?? "")) void patchDept(d.id, { note: v }); }}
                            placeholder="หมายเหตุของแผนก (เช่น เบอร์ติดต่อ, เงื่อนไข)…" className="w-full h-8 px-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          <p className="text-[11px] text-slate-400">ปิด “โชว์ในบอร์ด” = ซ่อนแผนกจากบอร์ด (ไม่ลบ) · ลบได้เฉพาะแผนกที่ไม่มีงานค้าง</p>
        </div>
      </ERPModal>
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1.5 text-[11px] text-slate-600">
      <span className={`relative inline-block h-4 w-7 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

function Sep() { return <span className="w-px h-6 bg-slate-200 mx-0.5" />; }
function ToolBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return <button onClick={onClick} title={title} className={`h-8 min-w-8 px-1.5 flex items-center justify-center rounded-md text-sm transition-colors ${active ? "bg-indigo-100 ring-1 ring-indigo-300" : "hover:bg-slate-100"}`}>{children}</button>;
}

// ---- ปุ่มติ๊กขั้นตอน (เตรียม / ตัด) ----
function StepChip({ label, done, disabled, onClick }: { label: string; done: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} title={done ? `${label}ครบแล้ว — กดเพื่อยกเลิก` : `กดเมื่อ${label}ครบ`}
      className={`h-6 rounded-md text-[10px] font-medium border flex items-center justify-center gap-0.5 transition-colors ${done ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"} ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
      <span className="text-[11px] leading-none">{done ? "✓" : "○"}</span>{label}
    </button>
  );
}

// ---- ปุ่มติ๊กกลม (ในป๊อปอัปเช็กลิสต์) ----
function CheckBtn({ done, disabled, onClick }: { done: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`h-7 w-7 rounded-md border flex items-center justify-center text-sm transition-colors ${done ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-300 border-slate-300 hover:border-emerald-400"} ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
      {done ? "✓" : ""}
    </button>
  );
}

// ---- เนื้อการ์ดใบสั่งผลิต (รอจ่าย) — กดเปิดเช็กลิสต์ · SKU หนา + วันที่ + เงาแบรนด์ ----
function PendingBody({ mo }: { mo: PendingMO }) {
  const ready = mo.ready;
  const border = mo.brand_color || prodColor(mo.product_sku);
  const showName = mo.product_name && mo.product_name !== mo.product_sku;
  return (
    <div className="bg-white rounded-lg p-2 transition select-none cursor-pointer hover:-translate-y-0.5" style={{ border: `2px solid ${ready ? "#10b981" : border}`, boxShadow: `5px 5px 0 0 ${border}` }} title="กดเพื่อเปิดเช็กลิสต์ เตรียม/ตัด">
      <div className="relative w-full aspect-[4/3] rounded-md bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center mb-1.5">
        {mo.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={mo.image_url} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" /> : <span className="text-slate-300 text-2xl">📦</span>}
        <span className={`absolute top-1 right-1 h-3 w-3 rounded-full ring-2 ring-white ${ready ? "bg-emerald-500" : "bg-rose-500"}`} title={ready ? "พร้อมจ่าย (เตรียม+ตัด ครบ)" : "ยังไม่พร้อม — เตรียม/ตัด ยังไม่ครบ"} />
      </div>
      <div className="flex items-center justify-between gap-1 mb-1">
        {mo.brand ? <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium border truncate max-w-[58%]" style={{ background: `${border}18`, color: border, borderColor: `${border}55` }}>{mo.brand}</span> : <span className="text-[9px] text-slate-400">ใบสั่งผลิต</span>}
        <span className="font-mono text-[9px] text-slate-400 truncate">{mo.mo_no}</span>
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-slate-800 leading-tight truncate">{mo.product_sku}</div>
        {showName && <div className="text-[10px] text-slate-400 line-clamp-1 leading-tight">{mo.product_name}</div>}
        <div className="text-[10px] text-slate-500 mt-0.5">📅 {dueDateText(mo.due_date)}</div>
      </div>
      <div className="flex items-center justify-between gap-1 mt-1.5 pt-1.5 border-t border-slate-100 text-[10px]">
        <span className="text-rose-600 font-semibold">เหลือ {fmt(mo.remaining)}/{fmt(mo.qty)}</span>
        <span className={daysLeftClass(mo.due_date)}>⏱ {daysLeftText(mo.due_date)}</span>
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
    <div className="bg-white rounded-lg p-2 shadow-sm hover:shadow transition select-none" style={{ border: `2px solid ${border}` }}>
      <div className="relative w-full aspect-[4/3] rounded-md bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center mb-1.5">
        {w.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={w.image_url} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" /> : <span className="text-slate-300 text-2xl">📦</span>}
        <span className={`absolute top-1 right-1 h-3 w-3 rounded-full ring-2 ring-white ${URG_DOT[urg]}`} />
        <span className={`absolute top-1 left-1 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium border ${st.cls}`}>{st.label}</span>
      </div>
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <span className="text-[10px] text-slate-500 truncate">{w.assignee_type === "department" ? "🏢 " : "👤 "}{w.assignee_name}</span>
        <span className="font-mono text-[9px] text-slate-400 truncate">{w.wo_no}</span>
      </div>
      <p className="text-xs font-medium text-slate-800 leading-snug line-clamp-2 min-h-[2.3em]">{w.product_name ?? w.product_sku}</p>
      <div className="flex items-center justify-between gap-1 mt-1.5 pt-1.5 border-t border-slate-100 text-[10px]">
        <span className="tabular-nums text-slate-600">{fmt(w.qty)} ชิ้น{w.received_qty > 0 && w.status !== "done" ? ` · รับ ${fmt(w.received_qty)}` : ""}</span>
        <span className={urg === "red" ? "text-rose-600 font-semibold" : "text-slate-400"}>⏱ {daysLeftText(w.due_date)}</span>
      </div>
    </div>
  );
}
