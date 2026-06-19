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
import type { MoPieceRow } from "@/app/api/mo/piecework/route";
import type { PurchaseStatusRow } from "@/app/api/mo/purchase-status/route";
import type { MoIssue } from "@/app/api/mo/issues/route";
import type { DispatchHistRow } from "@/app/api/mo/dispatch-history/route";
import { AddPieceworkModal } from "./add-piecework-modal";
import { WorkInstructionPanel } from "@/components/work-instruction";
import { MoMaterialsTable, type MoMatSummary, type MoMatPreview } from "@/components/mo-materials";
import { PurchaseNeeds } from "./purchase-needs";
import { DispatchPlanBoard } from "./dispatch-plan-board";
import type { DispatchPlan } from "@/app/api/mo/dispatch-plans/route";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { AssignToGroupModal } from "@/app/master/manufacturing-orders/mo-groups-modal";
import type { Assignee } from "@/app/api/mo/assignees/route";
import type { Brand } from "@/app/api/brands/route";

type Dept = { id: string; name: string; note?: string | null; show_note?: boolean };
type DeptFull = { id: string; name: string; status: string | null; note: string | null; show_note: boolean; display_order: number | null };
// สรุปค่าแรง (กลุ่ม A) — ผลิต/งานเหมา × แผน/จริง
type Labor = { prod_plan: number; prod_actual: number; piece_plan: number; piece_actual: number };
type PendingMO = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number; dispatched: number; remaining: number; due_date: string | null; status: string;
  image_url: string | null; brand: string | null; brand_color: string | null;
  prep_done: boolean; cut_done: boolean;
  // Phase 2: เช็กลิสต์วัตถุดิบจาก BOM
  has_bom: boolean; prep_total: number; prep_ready: number; cut_total: number; cut_ready: number; ready: boolean;
  labor?: Labor;
};
type MatRow = { id: string; component_sku: string | null; component_name: string | null; required_qty: number; uom: string | null; is_ready: boolean; cut_done: boolean; needs_cut: boolean };
// แถวรายบล็อกสำหรับ "หน้าตัด" — มาจาก mo_materials โดยตรง (1 แถว = 1 บล็อกตัด) ติ๊กตัดครบรายบล็อกได้
type CutRow = { id: string; component_sku: string | null; component_name: string | null; material_type: string | null; cut_block_code: string | null; cut_width: number | null; cut_length: number | null; pieces: number | null; required_qty: number; uom: string | null; cut_done: boolean };
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
  const [viewMode, setViewMode] = useState<"board" | "table" | "purchase">("board");   // สลับ บอร์ด/ตาราง/ขอซื้อ
  const [pendingCols, setPendingCols] = useState<number | null>(null);     // คอลัมน์โซนรอจ่าย (null=อัตโนมัติ)
  useEffect(() => { try { const v = localStorage.getItem("wb:pendingCols"); if (v) setPendingCols(Number(v) || null); } catch { /* ignore */ } }, []);
  const setPendCols = useCallback((n: number | null) => { setPendingCols(n); try { if (n) localStorage.setItem("wb:pendingCols", String(n)); else localStorage.removeItem("wb:pendingCols"); } catch { /* ignore */ } }, []);
  const [craftsmen, setCraftsmen] = useState<Assignee[]>([]);
  // กลุ่ม B: ประวัติงานเสียต่อช่าง (จับด้วยชื่อ) → เตือนตอนจ่ายงาน
  const [defectByWorker, setDefectByWorker] = useState<Record<string, { worker: string; count: number; last_at: string | null; types: string[] }>>({});
  // กลุ่ม D: แผนจ่ายงาน (ร่าง) — แท็บบนบอร์ด ("real" = บอร์ดจริง · id = แผนร่าง)
  const [plans, setPlans] = useState<DispatchPlan[]>([]);
  const [activePlan, setActivePlan] = useState<string>("real");

  const boardRef = useRef<HTMLDivElement>(null);
  const interRef = useRef<Inter>(null);
  const matSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedSumRef = useRef<Map<string, { on: number; rd: boolean; po: number | null }>>(new Map());
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
  const [clTab, setClTab] = useState<"recv" | "prep" | "cut" | "piece" | "purch" | "issue" | "hist">("prep");
  const [clWO, setClWO] = useState<WorkOrder | null>(null);   // เปิดเช็กลิสต์จากใบจ่ายงาน → มีแท็บ "รับงานคืน"
  const [recvLabor, setRecvLabor] = useState("");             // ค่าแรงผลิตของใบจ่ายงานนี้
  const [saveLaborBom, setSaveLaborBom] = useState(false);    // บันทึกค่าแรงกลับเข้า BOM
  const [estLabor, setEstLabor] = useState("");               // ค่าแรงผลิตที่วางแผน (ต่อใบสั่งผลิต)
  const [estSaving, setEstSaving] = useState(false);
  const [clPieceRows, setClPieceRows] = useState<MoPieceRow[]>([]);
  const [clCutGroup, setClCutGroup] = useState<"none" | "type" | "material">("none");   // จัดกลุ่มหน้าตัด
  const [clSummary, setClSummary] = useState<MoMatSummary[]>([]);   // ตารางวัตถุดิบกลาง (สรุป)
  const [clMaterials, setClMaterials] = useState<MoMatPreview[]>([]); // ตารางวัตถุดิบกลาง (รายบล็อก)
  const [clRequested, setClRequested] = useState<Record<string, number>>({});
  const [clPurch, setClPurch] = useState<PurchaseStatusRow[] | null>(null);   // ของที่ซื้อ/ETA
  const [clIssues, setClIssues] = useState<MoIssue[] | null>(null);           // ปัญหา QC
  const [clHist, setClHist] = useState<DispatchHistRow[] | null>(null);       // ประวัติการจ่าย
  const [issType, setIssType] = useState(""); const [issSev, setIssSev] = useState("medium"); const [issQty, setIssQty] = useState("");
  const [addPieceOpen, setAddPieceOpen] = useState(false);   // popup เพิ่มงานเหมาเข้า BOM
  // popup ตั้งค่าแผนก (สร้าง/แก้/ลบ/โชว์-ซ่อน/หมายเหตุ/เรียงลำดับ)
  const [deptMgrOpen, setDeptMgrOpen] = useState(false);
  const [deptList, setDeptList] = useState<DeptFull[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);

  // silent=true → refresh เบื้องหลัง ไม่โชว์สปินเนอร์เต็มจอ (ใช้หลังปิดป๊อปอัป/ทำ action เพื่อให้ลื่น)
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { const res = await apiFetch("/api/mo/work-board"); const j = await res.json();
      if (!j.error) setBoard({ departments: j.departments ?? [], workOrders: j.workOrders ?? [], pending: j.pending ?? [] });
    } catch { /* ignore */ } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void (async () => { try { const r = await apiFetch("/api/mo/assignees"); const j = await r.json(); setCraftsmen(j.craftsmen ?? []); } catch { /* ignore */ } })(); }, []);
  useEffect(() => { void (async () => { try { const r = await apiFetch("/api/mo/craftsman-defects"); const j = await r.json();
    const m: Record<string, { worker: string; count: number; last_at: string | null; types: string[] }> = {};
    for (const d of (j.data ?? []) as { worker: string; count: number; last_at: string | null; types: string[] }[]) m[(d.worker ?? "").trim().toLowerCase()] = d;
    setDefectByWorker(m); } catch { /* ignore */ } })(); }, []);
  // กลุ่ม D: โหลดรายการแผนจ่ายงาน
  const loadPlans = useCallback(async () => {
    try { const r = await apiFetch("/api/mo/dispatch-plans"); const j = await r.json(); setPlans((j.data ?? []) as DispatchPlan[]); } catch { /* ignore */ }
  }, []);
  useEffect(() => { void loadPlans(); }, [loadPlans]);
  const createPlan = useCallback(async () => {
    try {
      const r = await apiFetch("/api/mo/dispatch-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `แผน ${plans.length + 1}` }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setPlans((ps) => [...ps, j.data as DispatchPlan]); setActivePlan((j.data as DispatchPlan).id);
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างแผนไม่สำเร็จ"); }
  }, [plans.length, toast]);
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
  const zoneByKey = useMemo(() => new Map(zones.map((z) => [z.key, z] as const)), [zones]);
  // ความกว้าง: "รอจ่าย" กล่องใหญ่ · แผนก = พอดีจำนวนการ์ด (สูงสุด 4 ใบต่อแถว)
  const defWof = useCallback((key: string) => {
    const z = zoneByKey.get(key);
    if (z?.kind !== "dept") {
      // โซนรอจ่าย: ถ้าตั้งจำนวนคอลัมน์ → กว้างพอดี ไม่งั้นใช้ค่ามาตรฐาน
      if (pendingCols) return pendingCols * CARD_W + (pendingCols - 1) * GAP_C + 2 * PAD;
      return PENDING_W;
    }
    const cols = Math.min(4, Math.max(1, z.woCards.length));
    return cols * CARD_W + (cols - 1) * GAP_C + 2 * PAD;
  }, [zoneByKey, pendingCols]);
  const zoneWof = useCallback((key: string) => zoneSize[key]?.w ?? defWof(key), [zoneSize, defWof]);
  const colsOf = useCallback((key: string) => Math.max(1, Math.floor((zoneWof(key) - PAD) / (CARD_W + GAP_C))), [zoneWof]);
  // คอลัมน์จริงที่ใช้วางการ์ด — แผนก = min(4, จำนวนการ์ด) · รอจ่าย = ตามความกว้าง
  const gridCols = useCallback((z: Zone) => z.kind === "pending" ? (pendingCols ?? colsOf(z.key)) : Math.min(4, Math.max(1, z.woCards.length)), [colsOf, pendingCols]);
  // ตำแหน่งเริ่มต้นของโซน — เรียงซ้าย→ขวาแบบสะสมความกว้าง (กล่องรอจ่ายใหญ่อยู่ซ้ายสุด)
  const defaultLayout = useMemo(() => {
    const m: Record<string, Pos> = {}; let x = 0;
    for (const z of zones) { m[z.key] = { x, y: 0 }; x += zoneWof(z.key) + GAP; }
    return m;
  }, [zones, zoneWof]);
  const posOfZone = useCallback((key: string): Pos => zonePos[key] ?? defaultLayout[key] ?? { x: 0, y: 0 }, [zonePos, defaultLayout]);
  const zoneH = useCallback((z: Zone) => {
    const rows = Math.ceil(Math.max(1, countOf(z)) / gridCols(z));
    const auto = HEADER_H + (noteOf(z) ? NOTE_H : 0) + rows * CARD_SLOT + PAD;
    return Math.max(auto, zoneSize[z.key]?.h ?? 0);
  }, [zoneSize, gridCols, noteOf]);

  // ตำแหน่ง "จัดเรียงสวย" อัตโนมัติ — รอจ่าย=กริดหลายคอลัมน์ · แผนก=คอลัมน์เดียว
  const autoPos = useMemo(() => {
    const map: Record<string, Pos> = {};
    for (const z of zones) {
      const p = posOfZone(z.key); const cols = gridCols(z); const noteY = noteOf(z) ? NOTE_H : 0;
      if (z.kind === "pending") {
        z.moCards.forEach((m, i) => {
          const col = i % cols, row = Math.floor(i / cols);
          map[`mo:${m.id}`] = { x: p.x + PAD + col * (CARD_W + GAP_C), y: p.y + HEADER_H + 10 + row * CARD_SLOT };
        });
      } else {
        z.woCards.forEach((w, i) => {
          const col = i % cols, row = Math.floor(i / cols);
          map[`wo:${w.id}`] = { x: p.x + PAD + col * (CARD_W + GAP_C), y: p.y + HEADER_H + 10 + noteY + row * CARD_SLOT };
        });
      }
    }
    return map;
  }, [zones, posOfZone, gridCols, noteOf]);
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
  }, [loading, viewMode]);   // re-attach หลังสลับ บอร์ด/ตาราง (element ใหม่)
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
      if (it.kind === "wo") {
        const wo = board.workOrders.find((x) => x.id === it.id);
        if (wo) { setRecvQty(Math.max(0, (wo.qty || 0) - (wo.received_qty || 0))); openWO(wo); }
      } else { const mo = board.pending.find((x) => x.id === it.id); if (mo) { setClWO(null); setChecklistMO(mo); } }
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
        if (!canEdit) { toast.error("คุณไม่มีสิทธิ์ย้ายงานข้ามแผนก"); await load(true); return; }
        const d = target.dept;
        setBoard((b) => ({ ...b, workOrders: b.workOrders.map((x) => x.id === it.id ? { ...x, department_id: d.id, department_name: d.name } : x) }));
        try { const res = await apiFetch(`/api/mo/work-orders/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ department_id: d.id, department_name: d.name, stage: stageOfDept(d.name) }) });
          const j = await res.json(); if (j.error) throw new Error(j.error);
        } catch (err) { toast.error(err instanceof Error ? err.message : "ย้ายไม่สำเร็จ"); await load(true); }
      }
      // คงตำแหน่งที่วางไว้ (อิสระ)
    }
  };

  const openColor = async () => { setColorOpen(true); try { const r = await apiFetch("/api/brands"); const j = await r.json(); setBrands(j.data ?? []); } catch { /* ignore */ } };
  const saveColor = async (id: string, color: string) => {
    setBrands((bs) => bs.map((b) => b.id === id ? { ...b, color } : b));
    try { await apiFetch("/api/brands", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, color }) }); await load(true); }
    catch { toast.error("บันทึกสีไม่สำเร็จ"); }
  };

  // เปิดป๊อปอัปเช็กลิสต์จากใบจ่ายงาน (มีแท็บ "รับงานคืน" เป็นแท็บแรก) — ถ้าไม่รู้ MO id ใช้ป๊อปอัปเดิม
  const openWO = (wo: WorkOrder) => {
    if (!wo.mo_id) { setDetailWO(wo); setRecvLabor(wo.labor_cost != null ? String(wo.labor_cost) : ""); setSaveLaborBom(false); return; }
    setClWO(wo); setClTab("recv");
    setRecvLabor(wo.labor_cost != null ? String(wo.labor_cost) : ""); setSaveLaborBom(false);
    setChecklistMO({
      id: wo.mo_id, mo_no: wo.mo_no, product_sku: wo.product_sku, product_name: wo.product_name,
      qty: wo.qty || 0, dispatched: 0, remaining: 0, due_date: wo.due_date, status: wo.status,
      image_url: wo.image_url ?? null, brand: wo.brand ?? null, brand_color: wo.brand_color ?? null,
      prep_done: false, cut_done: false, has_bom: false, prep_total: 0, prep_ready: 0, cut_total: 0, cut_ready: 0, ready: false,
    });
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
      setDispMO(null); setDispDept(null); await load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "จ่ายงานไม่สำเร็จ"); }
    finally { setDispSaving(false); }
  };
  // ช่างในแผนก — ยกเว้นแผนก "ช่างเหมา" (ชื่อมีคำว่า เหมา) ให้เลือกพนักงานได้ทุกคน
  const dispIsHire = useMemo(() => !!dispDept && /เหมา/.test(dispDept.name), [dispDept]);
  const deptCraftsmen = useMemo(() => {
    if (!dispDept) return [];
    return dispIsHire ? craftsmen : craftsmen.filter((c) => c.department_id === dispDept.id);
  }, [dispDept, dispIsHire, craftsmen]);
  // กลุ่ม B: หาประวัติงานเสียจากชื่อผู้รับงาน (ช่าง หรือชื่อแผนกถ้าไม่ระบุช่าง)
  const defectOf = useCallback((name: string | null | undefined) => name ? defectByWorker[name.trim().toLowerCase()] : undefined, [defectByWorker]);

  // รับงานคืน (จากการ์ดบนบอร์ด) — รองรับรับคืนบางส่วน
  const submitReceive = async () => {
    if (!detailWO) return;
    if (recvLabor.trim() === "") { toast.error("กรุณาใส่ค่าแรงก่อนส่งงาน"); return; }
    setRecvSaving(true);
    try {
      const res = await apiFetch("/api/mo/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wo_id: detailWO.id, qty: recvQty, wage: Number(recvLabor) || 0 }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("บันทึกส่งงานแล้ว"); setDetailWO(null); await load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setRecvSaving(false); }
  };
  const cancelWO = async (wo: WorkOrder) => {
    try { const res = await apiFetch(`/api/mo/work-orders/${wo.id}`, { method: "DELETE" }); const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("ยกเลิกใบจ่ายงานแล้ว"); setDetailWO(null); await load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ"); }
  };
  // รับงานคืน/ยกเลิก จากแท็บ "รับงานคืน" ในป๊อปอัปเช็กลิสต์ (clWO)
  // บันทึกค่าแรงผลิตของใบจ่ายงาน (+ เลือกบันทึกกลับเข้า BOM) — ใช้ร่วมตอนรับงานคืน
  const persistLabor = async (wo: WorkOrder) => {
    const labor = recvLabor.trim() === "" ? null : Number(recvLabor) || 0;
    if (recvLabor.trim() !== "") {
      await apiFetch(`/api/mo/work-orders/${wo.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ labor_cost: labor }) }).catch(() => {});
      if (saveLaborBom && labor != null) {
        await apiFetch("/api/bom/labor-rates", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_sku: wo.product_sku, craftsman_id: wo.assignee_type === "craftsman" ? wo.assignee_id : null, craftsman_name: wo.assignee_name, rate: labor }) }).catch(() => {});
      }
    }
  };
  const saveLabor = async () => {
    if (!clWO) return;
    try { await persistLabor(clWO); toast.success(`บันทึกค่าแรงแล้ว${saveLaborBom ? " + เข้า BOM" : ""}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };
  const submitReceiveTab = async () => {
    if (!clWO) return;
    if (recvLabor.trim() === "") { toast.error("กรุณาใส่ค่าแรงก่อนส่งงาน"); return; }
    setRecvSaving(true);
    try {
      if (saveLaborBom) await persistLabor(clWO);   // บันทึกค่าแรงกลับเข้า BOM (ถ้าติ๊ก)
      const res = await apiFetch("/api/mo/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wo_id: clWO.id, qty: recvQty, wage: Number(recvLabor) || 0 }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("บันทึกส่งงานแล้ว"); closeChecklist();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setRecvSaving(false); }
  };
  const cancelWOTab = async () => {
    if (!clWO) return;
    try { const res = await apiFetch(`/api/mo/work-orders/${clWO.id}`, { method: "DELETE" }); const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("ยกเลิกใบจ่ายงานแล้ว"); closeChecklist();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ"); }
  };
  // กลุ่ม A: บันทึกค่าแรงผลิตที่วางแผน (ต่อใบสั่งผลิต) → โชว์เป็น "ผลิต-แผน" บนการ์ด/หัวแผนก
  const saveEstLabor = async () => {
    if (!checklistMO) return;
    setEstSaving(true);
    try {
      const res = await apiFetch("/api/mo/est-labor", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mo_id: checklistMO.id, est_labor_cost: estLabor.trim() === "" ? null : Number(estLabor) || 0 }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("บันทึกค่าแรงผลิต (วางแผน) แล้ว"); await load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setEstSaving(false); }
  };
  // กลุ่ม A: กด "งานเหมาเสร็จ" → นับเป็นค่าแรงงานเหมา-จริง
  const togglePieceDone = async (r: MoPieceRow) => {
    if (!canEdit || !r.selected_id) return;
    const done = r.status !== "done";
    setClPieceRows((rs) => rs.map((x) => x.key === r.key ? { ...x, status: done ? "done" : "pending" } : x));
    try {
      const res = await apiFetch("/api/mo/piecework", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.selected_id, done }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      void load(true);
    } catch (e) {
      setClPieceRows((rs) => rs.map((x) => x.key === r.key ? { ...x, status: done ? "pending" : "done" } : x));
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  };

  // โหลดเช็กลิสต์วัตถุดิบเมื่อเปิดป๊อปอัป (เตรียม=is_ready, ตัด=cut_done; needs_cut จากข้อมูลบล็อกตัด)
  useEffect(() => {
    setDelArmed(false); setClTab(clWO ? "recv" : "prep");
    setClPurch(null); setClIssues(null); setClHist(null); setIssType(""); setIssSev("medium"); setIssQty("");
    if (!checklistMO) { setClRows([]); setClCutRows([]); setClPieceRows([]); setEstLabor(""); return; }
    // ค่าแรงผลิตที่วางแผนไว้ (จาก board) — กรอก/แก้ในป๊อปอัปได้
    setEstLabor(checklistMO.labor?.prod_plan ? String(checklistMO.labor.prod_plan) : "");
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
          material_type: (x.material_type as string) ?? null,
          cut_block_code: (x.cut_block_code as string) ?? null, cut_width: num(x.cut_width), cut_length: num(x.cut_length), pieces: num(x.pieces),
          required_qty: Number(x.required_qty) || 0, uom: (x.uom as string) ?? null, cut_done: !!x.cut_done,
        }));
        // ตารางวัตถุดิบกลาง (MoMaterialsTable) — ใช้ข้อมูลดิบชุดเดียวกับหน้าแก้ใบสั่งผลิต
        const n2 = (v: unknown) => Number(v) || 0;
        const moSummary: MoMatSummary[] = summary.map((s) => ({
          key: String(s.id), id: String(s.id), component_sku: (s.component_sku as string) ?? null, component_name: (s.component_name as string) ?? null,
          material_type: (s.material_type as string) ?? null, uom: (s.uom as string) ?? null, qty_per: n2(s.qty_per),
          on_hand_qty: n2(s.on_hand_qty), is_ready: !!s.is_ready, purchase_override: s.to_purchase_qty != null ? Number(s.to_purchase_qty) : null,
        }));
        const moMaterials: MoMatPreview[] = materials.map((m) => ({
          key: String(m.id), id: String(m.id), component_sku: (m.component_sku as string) ?? null, component_name: (m.component_name as string) ?? null,
          material_type: (m.material_type as string) ?? null, qty_per: n2(m.qty_per), uom: (m.uom as string) ?? null,
          cut_block_code: (m.cut_block_code as string) ?? null, cut_width: num(m.cut_width), cut_length: num(m.cut_length), pieces: num(m.pieces),
          on_hand_qty: n2(m.on_hand_qty), is_ready: !!m.is_ready, purchase_override: null, cut_done: !!m.cut_done,
        }));
        const requested = (j?.data?.requested ?? {}) as Record<string, number>;
        savedSumRef.current = new Map(moSummary.filter((s) => s.id).map((s) => [s.id as string, { on: s.on_hand_qty, rd: s.is_ready, po: s.purchase_override }]));
        if (!cancel) { setClRows(rows); setClCutRows(cutRows); setClSummary(moSummary); setClMaterials(moMaterials); setClRequested(requested); }
      } catch { if (!cancel) { setClRows([]); setClCutRows([]); setClSummary([]); setClMaterials([]); } }
      finally { if (!cancel) setClLoading(false); }
    })();
    // งานเหมารายชิ้นของใบนี้ (โหลดแยก ไม่บล็อกเช็กลิสต์หลัก)
    void (async () => {
      try {
        const pr = await apiFetch(`/api/mo/piecework?mo_id=${encodeURIComponent(checklistMO.id)}`);
        const pj = await pr.json();
        if (!cancel) setClPieceRows((pj?.data ?? []) as MoPieceRow[]);
      } catch { if (!cancel) setClPieceRows([]); }
    })();
    // ปัญหา (โหลดเลย — ใช้เลขบนแท็บ) · ของซื้อ/ประวัติ เลื่อนไปโหลดตอนกดแท็บนั้น (ลดของที่ยิงตอนเปิด = เร็วขึ้น)
    const moNo = checklistMO.mo_no;
    void (async () => { try { const r = await apiFetch(`/api/mo/issues?mo_no=${encodeURIComponent(moNo)}`); const j = await r.json(); if (!cancel) setClIssues((j?.data ?? []) as MoIssue[]); } catch { if (!cancel) setClIssues([]); } })();
    return () => { cancel = true; };
  }, [checklistMO]);

  // เลื่อนโหลด: ของซื้อ/ประวัติ ดึงเฉพาะตอนกดเข้าแท็บนั้น (ยังไม่เคยโหลด = null)
  useEffect(() => {
    if (!checklistMO) return;
    const moNo = checklistMO.mo_no; let cancel = false;
    if (clTab === "purch" && clPurch === null) void (async () => { try { const r = await apiFetch(`/api/mo/purchase-status?mo_no=${encodeURIComponent(moNo)}`); const j = await r.json(); if (!cancel) setClPurch((j?.data ?? []) as PurchaseStatusRow[]); } catch { if (!cancel) setClPurch([]); } })();
    if (clTab === "hist" && clHist === null) void (async () => { try { const r = await apiFetch(`/api/mo/dispatch-history?mo_no=${encodeURIComponent(moNo)}`); const j = await r.json(); if (!cancel) setClHist((j?.data ?? []) as DispatchHistRow[]); } catch { if (!cancel) setClHist([]); } })();
    return () => { cancel = true; };
  }, [clTab, checklistMO, clPurch, clHist]);

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
  // โหลดงานเหมาของใบนี้ใหม่ (หลังเพิ่มจาก popup)
  const reloadPiece = useCallback(async () => {
    if (!checklistMO) return;
    try { const pr = await apiFetch(`/api/mo/piecework?mo_id=${encodeURIComponent(checklistMO.id)}`); const pj = await pr.json(); setClPieceRows((pj?.data ?? []) as MoPieceRow[]); } catch { /* ignore */ }
  }, [checklistMO]);
  // เลือก/ยกเลิก งานเหมารายชิ้นที่จะจ่าย (จากงานเหมาใน BOM ของสินค้า)
  const togglePiece = useCallback(async (key: string) => {
    if (!canEdit || !checklistMO) return;
    const cur = clPieceRows.find((r) => r.key === key); if (!cur) return;
    try {
      if (cur.selected_id) {
        const res = await apiFetch(`/api/mo/piecework?id=${encodeURIComponent(cur.selected_id)}`, { method: "DELETE" });
        const j = await res.json(); if (j.error) throw new Error(j.error);
        setClPieceRows((rs) => rs.filter((r) => r.in_bom || r.key !== key).map((r) => r.key === key ? { ...r, selected_id: null } : r));
      } else {
        const res = await apiFetch(`/api/mo/piecework`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mo_id: checklistMO.id, job_id: cur.job_id, job_name: cur.job_name, rate: cur.rate, qty_per: cur.qty_per, is_detail: cur.is_detail, note: cur.note }) });
        const j = await res.json(); if (j.error) throw new Error(j.error);
        setClPieceRows((rs) => rs.map((r) => r.key === key ? { ...r, selected_id: String(j.id), total_qty: Number(j.total_qty) || r.total_qty } : r));
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  }, [canEdit, checklistMO, clPieceRows, toast]);
  // ลงปัญหา (QC) ผูกกับใบสั่งผลิตนี้
  const addIssue = useCallback(async () => {
    if (!canEdit || !checklistMO) return;
    const dtype = issType.trim(); if (!dtype) { toast.error("กรุณาระบุปัญหาที่เจอ"); return; }
    try {
      const res = await apiFetch(`/api/mo/issues`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mo_no: checklistMO.mo_no, defect_type: dtype, severity: issSev, qty: issQty || null }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setClIssues((rs) => [{ id: String(j.id), defect_no: j.defect_no ?? null, defect_type: dtype, severity: issSev, qty: issQty ? Number(issQty) : null, cause: null, created_at: new Date().toISOString() }, ...(rs ?? [])]);
      setIssType(""); setIssQty(""); toast.success("ลงปัญหาแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  }, [canEdit, checklistMO, issType, issSev, issQty, toast]);
  const delIssue = useCallback(async (id: string) => {
    try { const res = await apiFetch(`/api/mo/issues?id=${encodeURIComponent(id)}`, { method: "DELETE" }); const j = await res.json(); if (j.error) throw new Error(j.error); setClIssues((rs) => (rs ?? []).filter((x) => x.id !== id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  }, [toast]);
  // ตารางวัตถุดิบกลาง — แก้ (จำนวนที่มี/ขอซื้อ/เตรียมครบ) → อัปเดตทันที + บันทึกแบบ debounce (กันยิง API ถี่ตอนพิมพ์)
  const onMatSummaryChange = useCallback((rows: MoMatSummary[]) => {
    setClSummary(rows);
    if (matSaveTimer.current) clearTimeout(matSaveTimer.current);
    matSaveTimer.current = setTimeout(() => {
      for (const r of rows) {
        if (!r.id) continue;
        const p = savedSumRef.current.get(r.id);
        const body: Record<string, unknown> = {};
        if (!p || p.rd !== r.is_ready) body.is_ready = r.is_ready;
        if (!p || p.on !== r.on_hand_qty) body.on_hand_qty = r.on_hand_qty;
        if (!p || p.po !== r.purchase_override) body.purchase_override = r.purchase_override;
        if (Object.keys(body).length === 0) continue;
        savedSumRef.current.set(r.id, { on: r.on_hand_qty, rd: r.is_ready, po: r.purchase_override });
        void apiFetch(`/api/mo/material`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, ...body }) })
          .then((res) => res.json()).then((j) => { if (j.error) toast.error(j.error); }).catch(() => toast.error("บันทึกไม่สำเร็จ"));
      }
    }, 600);
  }, [toast]);
  const onMatToggleCut = useCallback(async (line: MoMatPreview, next: boolean) => {
    if (!canEdit || !line.id) return;
    setClMaterials((ms) => ms.map((m) => m.id === line.id ? { ...m, cut_done: next } : m));
    try {
      const res = await apiFetch(`/api/mo/material-line`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: line.id, cut_done: next }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      if (line.component_sku != null && typeof j.is_ready === "boolean") setClSummary((ss) => ss.map((s) => s.component_sku === line.component_sku ? { ...s, is_ready: j.is_ready } : s));
    } catch (e) {
      setClMaterials((ms) => ms.map((m) => m.id === line.id ? { ...m, cut_done: !next } : m));
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }, [canEdit, toast]);
  const closeChecklist = useCallback(() => { setChecklistMO(null); setClWO(null); setDelArmed(false); void load(true); }, [load]);
  const deleteMO = useCallback(async (mo: PendingMO) => {
    try {
      const res = await apiFetch(`/api/mo/${mo.id}`, { method: "DELETE" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("ลบงานแล้ว"); setChecklistMO(null); setDelArmed(false); await load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  }, [toast, load]);

  // ---- จัดการแผนก (popup ตั้งค่าแผนก) ----
  const loadDepts = useCallback(async () => {
    setDeptLoading(true);
    try { const res = await apiFetch("/api/mo/departments"); const j = await res.json(); setDeptList((j.data ?? []) as DeptFull[]); }
    catch { /* ignore */ } finally { setDeptLoading(false); }
  }, []);
  const openDeptMgr = useCallback(() => { setConfirmDelId(null); setDeptMgrOpen(true); void loadDepts(); }, [loadDepts]);
  const closeDeptMgr = useCallback(() => { setDeptMgrOpen(false); void load(true); }, [load]);
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
          <div className="flex border border-slate-200 rounded-lg overflow-hidden text-sm">
            <button onClick={() => setViewMode("board")} className={`h-9 px-3 font-medium ${viewMode === "board" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📋 บอร์ด</button>
            <button onClick={() => setViewMode("table")} className={`h-9 px-3 font-medium border-l border-slate-200 ${viewMode === "table" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>▦ ตาราง</button>
            <button onClick={() => setViewMode("purchase")} className={`h-9 px-3 font-medium border-l border-slate-200 ${viewMode === "purchase" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📦 ขอซื้อ/เตรียม</button>
          </div>
          <button onClick={openColor} className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">🎨 ตั้งสีแบรนด์</button>
          <a href="/master/work-submissions" className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">📤 ตารางส่งงาน</a>
          <a href="/master/manufacturing-orders" className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">🏭 ใบสั่งผลิต</a>
        </div>
      </div>

      {/* Toolbar — เฉพาะมุมมองบอร์ด */}
      {/* กลุ่ม D: แท็บแผนจ่ายงาน (ของจริง / แผนร่าง) */}
      {viewMode === "board" && (
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <button onClick={() => setActivePlan("real")} className={`h-8 px-3 text-sm rounded-lg border ${activePlan === "real" ? "bg-blue-600 text-white border-blue-600 font-medium" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>✅ ของจริง</button>
          {plans.map((p) => (
            <button key={p.id} onClick={() => setActivePlan(p.id)} className={`h-8 px-3 text-sm rounded-lg border ${activePlan === p.id ? "bg-indigo-600 text-white border-indigo-600 font-medium" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>📅 {p.name}{p.status === "applied" ? " ✓" : p.line_count ? ` (${p.line_count})` : ""}</button>
          ))}
          {canDispatch && <button onClick={() => void createPlan()} className="h-8 px-2.5 text-sm rounded-lg border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50">＋ สร้างแผน</button>}
        </div>
      )}

      {viewMode === "board" && activePlan === "real" && (
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
        {/* จำนวนคอลัมน์โซนรอจ่าย */}
        <span className="text-[11px] text-slate-400 pl-1" title="จำนวนคอลัมน์การ์ดในโซนรอจ่าย">รอจ่าย:</span>
        {([["auto", null], ["1", 1], ["2", 2], ["3", 3], ["4", 4]] as const).map(([lbl, n]) => (
          <button key={lbl} type="button" onClick={() => setPendCols(n)} title={`โชว์ ${lbl} คอลัมน์`}
            className={`h-7 px-2 text-xs rounded ${pendingCols === n ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{lbl}</button>
        ))}
        <Sep />
        <ToolBtn onClick={openDeptMgr} title="ตั้งค่าแผนก (เพิ่ม/แก้/ลบ/ซ่อน/หมายเหตุ)">⚙️</ToolBtn>
        <ToolBtn onClick={() => setIsMax((m) => !m)} title={isMax ? "ย่อกลับ" : "ขยายเต็มจอ"}>{isMax ? "🗗" : "⛶"}</ToolBtn>
      </div>
      )}

      {loading ? <div className="text-center py-20 text-slate-400">กำลังโหลด…</div>
        : viewMode === "purchase" ? (
        <PurchaseNeeds canEdit={canEdit} onOpenMo={(moId) => { const mo = board.pending.find((x) => x.id === moId); if (mo) { setClWO(null); setChecklistMO(mo); } }} />
      ) : viewMode === "table" ? (
        <BoardTable pending={board.pending} workOrders={board.workOrders} onReload={() => void load(true)} onOpenMO={(mo) => { setClWO(null); setChecklistMO(mo); }} onOpenWO={(wo) => { setRecvQty(Math.max(0, (wo.qty || 0) - (wo.received_qty || 0))); openWO(wo); }} />
      ) : activePlan !== "real" ? (
        (() => {
          const p = plans.find((x) => x.id === activePlan);
          if (!p) return <div className="text-center py-20 text-slate-400 text-sm">ไม่พบแผน</div>;
          // ค่าแรงผลิตต่อชิ้น (จากแผนกลุ่ม A) + รูป ต่อใบสั่งผลิต — ส่งให้หน้าแผนคิดค่าแรง/โชว์รูป
          const laborPerUnit: Record<string, number> = {};
          const imageByMo: Record<string, string | null> = {};
          for (const m of board.pending) { if (m.qty > 0 && m.labor) laborPerUnit[m.mo_no] = m.labor.prod_plan / m.qty; if (m.image_url) imageByMo[m.mo_no] = m.image_url; }
          for (const w of board.workOrders) { const k = String(w.mo_no); if (laborPerUnit[k] == null && (w.qty || 0) > 0 && w.labor) laborPerUnit[k] = w.labor.prod_plan / (w.qty || 1); if (imageByMo[k] == null && w.image_url) imageByMo[k] = w.image_url; }
          return <DispatchPlanBoard
            planId={p.id} planName={p.name} planStatus={p.status} startDate={p.start_date} endDate={p.end_date}
            departments={board.departments.filter((d) => stageOfDept(d.name) !== "cut")}
            pending={board.pending} realWOs={board.workOrders} craftsmen={craftsmen} defectByWorker={defectByWorker}
            laborPerUnit={laborPerUnit} imageByMo={imageByMo}
            canEdit={canDispatch}
            onApplied={() => { void load(true); void loadPlans(); setActivePlan("real"); }}
            onRenamed={(name) => setPlans((ps) => ps.map((x) => x.id === p.id ? { ...x, name } : x))}
            onDates={(start_date, end_date) => setPlans((ps) => ps.map((x) => x.id === p.id ? { ...x, start_date, end_date } : x))}
            onDeleted={() => { setActivePlan("real"); void loadPlans(); }}
          />;
        })()
      ) : (
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
                    <div className="flex items-center gap-2 min-w-0"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: z.accent }} /><span className="text-base font-bold text-slate-700 truncate">{z.label}</span></div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {z.kind === "dept" && z.dept && (() => {
                        const staff = craftsmen.filter((c) => c.department_id === z.dept!.id);
                        // ยอดรวมค่าแรงในแผนก (กลุ่ม A) — รวมจากการ์ดในแผนก: ผลิต/เหมา × แผน/จริง
                        const L = z.woCards.reduce((a, w) => { const l = w.labor; if (l) { a.pp += l.prod_plan; a.pa += l.prod_actual; a.qp += l.piece_plan; a.qa += l.piece_actual; } return a; }, { pp: 0, pa: 0, qp: 0, qa: 0 });
                        const hasLabor = !!(L.pp || L.pa || L.qp || L.qa);
                        return <>
                          <StaffAvatars staff={staff} />
                          {hasLabor && (
                            <div className="flex flex-col items-end leading-tight text-[9px] tabular-nums" title="ยอดรวมค่าแรงในแผนก — แผน/จริง (จริง = สีเขียว)">
                              <span className="text-slate-500">ผลิต ฿{fmt(L.pp)}/<span className="text-emerald-600 font-medium">{fmt(L.pa)}</span></span>
                              <span className="text-slate-500">เหมา ฿{fmt(L.qp)}/<span className="text-emerald-600 font-medium">{fmt(L.qa)}</span></span>
                            </div>
                          )}
                        </>;
                      })()}
                      <span className="text-xs font-medium text-slate-500 bg-white/70 rounded-full px-2 py-0.5">{count}</span>
                    </div>
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
            <label className="block"><span className="text-[11px] text-slate-500">{dispIsHire ? "เลือกช่าง (งานเหมา — เลือกได้ทุกคน)" : `ช่างในแผนก ${dispDept?.name}`}</span>
              <select value={dispCraftsman} onChange={(e) => setDispCraftsman(e.target.value)}
                className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">— ทั้งแผนก (ไม่ระบุช่าง) —</option>
                {deptCraftsmen.map((c) => { const d = defectOf(c.name); return <option key={c.id} value={c.id}>{d ? "⚠️ " : ""}{c.code ? `[${c.code}] ` : ""}{c.name}{d ? ` — งานเสีย ${d.count}` : ""}</option>; })}
              </select>
              {dispIsHire ? <span className="text-[10px] text-indigo-500">งานเหมาเลือกพนักงานได้ทุกคน</span>
                : deptCraftsmen.length === 0 && <span className="text-[10px] text-slate-400">แผนกนี้ยังไม่มีช่าง — จ่ายเป็นทั้งแผนกได้</span>}
            </label>
            {/* กลุ่ม B: เตือนถ้าผู้รับงาน (ช่างที่เลือก หรือชื่อแผนก) เคยมีประวัติงานเสีย */}
            {(() => {
              const craftName = deptCraftsmen.find((c) => c.id === dispCraftsman)?.name ?? null;
              const targetName = craftName ?? dispDept?.name ?? "";
              const d = defectOf(targetName);
              if (!d) return null;
              return (
                <div className={`rounded-lg border px-3 py-2 text-xs ${dispIsHire ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                  ⚠️ <b>{targetName}</b> เคยมีประวัติงานเสีย <b>{d.count}</b> ครั้ง
                  {d.types.length > 0 && <span className="opacity-70"> ({d.types.slice(0, 3).join(", ")}{d.types.length > 3 ? "…" : ""})</span>}
                  {d.last_at && <span className="opacity-60"> · ล่าสุด {new Date(d.last_at).toLocaleDateString("th-TH")}</span>}
                  {dispIsHire && <div className="mt-0.5 text-[11px] font-medium">เป็นช่างเหมา — โปรดพิจารณาก่อนจ่ายงาน</div>}
                </div>
              );
            })()}
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
          <button onClick={submitReceive} disabled={recvSaving || recvQty <= 0 || recvLabor.trim() === ""} title={recvLabor.trim() === "" ? "ใส่ค่าแรงก่อน" : ""} className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">{recvSaving ? "กำลังบันทึก..." : "✓ ส่งงาน"}</button>
        </>)}>
        {detailWO && (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-slate-800">{detailWO.product_name ?? detailWO.product_sku}</p>
            <div className="grid grid-cols-2 gap-y-1 text-xs text-slate-500">
              <span>ใบสั่งผลิต</span><span className="text-slate-700">{detailWO.mo_no}</span>
              <span>แผนก/ผู้รับ</span><span className="text-slate-700">{detailWO.department_name ?? "—"} · {detailWO.assignee_name ?? "—"}</span>
              <span>จ่าย</span><span className="text-slate-700">{fmt(detailWO.qty)} ชิ้น</span>
              <span>ส่งแล้ว</span><span className="text-slate-700">{fmt(detailWO.received_qty)} · เหลือ {fmt(detailWO.qty - detailWO.received_qty)}</span>
              <span>กำหนดเสร็จ</span><span className="text-slate-700">{detailWO.due_date ?? "—"}</span>
              <span>สถานะ</span><span><span className={`text-[11px] px-2 py-0.5 rounded border ${(WO_STATUS[detailWO.status] ?? WO_STATUS.dispatched).cls}`}>{(WO_STATUS[detailWO.status] ?? WO_STATUS.dispatched).label}</span></span>
            </div>
            {detailWO.status !== "done" && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="block"><span className="text-[11px] text-slate-500">ส่งรอบนี้ (ชิ้น)</span>
                  <input type="number" min={0} step="any" max={detailWO.qty - detailWO.received_qty} value={recvQty} onChange={(e) => setRecvQty(Number(e.target.value))}
                    className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" /></label>
                <label className="block"><span className="text-[11px] text-slate-500">💰 ค่าแรง (บาท)</span>
                  <input type="number" min={0} step="any" value={recvLabor} onChange={(e) => setRecvLabor(e.target.value)} placeholder="—"
                    className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label>
              </div>
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
      <ERPModal open={checklistMO !== null} onClose={closeChecklist} size="lg" title={clWO ? `🔄 ใบจ่ายงาน · ${clWO.wo_no}` : `📋 เช็กลิสต์เตรียม/ตัด · ${checklistMO?.mo_no ?? ""}`}
        footer={<>
          {checklistMO && !clWO && canEdit && (delArmed
            ? <span className="mr-auto flex gap-1"><button onClick={() => deleteMO(checklistMO)} className="h-9 px-3 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700">ยืนยันลบงานนี้</button><button onClick={() => setDelArmed(false)} className="h-9 px-3 text-sm border border-slate-200 rounded-lg">ยกเลิก</button></span>
            : <button onClick={() => setDelArmed(true)} className="h-9 px-4 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 mr-auto">🗑 ลบงาน</button>)}
          {checklistMO && <a href={`/print/work-order/${checklistMO.id}`} target="_blank" rel="noreferrer" className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">🖨 พิมพ์ใบสั่งงาน</a>}
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
              {/* รายละเอียดสั่งงาน (เหมือนหน้าแก้ใบสั่งผลิต) — ดูสเปก/วัตถุดิบจาก BOM ได้เลย */}
              {checklistMO.product_sku && <WorkInstructionPanel sku={checklistMO.product_sku} editable={false} />}
              {/* แท็บรวม 6 หน้า — ใช้ได้ทั้งมี/ไม่มี BOM */}
              {(() => {
                const tabBtn = (id: typeof clTab, label: string) => (
                  <button type="button" onClick={() => setClTab(id)}
                    className={`h-8 px-3 rounded-lg border ${clTab === id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{label}</button>
                );
                const issN = clIssues?.length ?? 0;
                // map สถานะซื้อ ตามชื่อวัตถุดิบ (โชว์ในหน้าเตรียม)
                const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
                const purchByName = new Map((clPurch ?? []).map((p) => [norm(p.item_name), p]));
                return (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1 text-[12px]">
                      {clWO && tabBtn("recv", "📤 ส่งงาน")}
                      {tabBtn("prep", `📋 วัตถุดิบ · เตรียม ${prepDone}/${prepTotal} · ตัด ${cutDone}/${cutTotal}`)}
                      {tabBtn("piece", `🧵 งานเหมา ${clPieceRows.filter((r) => r.selected_id).length}/${clPieceRows.length}`)}
                      {tabBtn("purch", "📦 ของซื้อ")}
                      {tabBtn("issue", `⚠️ ปัญหา${issN ? ` ${issN}` : ""}`)}
                      {tabBtn("hist", "🕑 ประวัติ")}
                    </div>
                    {/* แถบค่าแรงใบนี้ (กลุ่ม A) — สรุป แผน/จริง + กรอกค่าแรงผลิตที่วางแผน */}
                    {clTab !== "recv" && (
                      <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-[11px] flex-wrap">
                          <span className="font-medium text-slate-600">💰 ค่าแรงใบนี้ — แผน/<span className="text-emerald-600">จริง</span></span>
                          <span className="text-slate-500 tabular-nums">
                            ผลิต ฿{fmt(checklistMO.labor?.prod_plan ?? 0)}/<span className="text-emerald-600">฿{fmt(checklistMO.labor?.prod_actual ?? 0)}</span>
                            {" · "}เหมา ฿{fmt(checklistMO.labor?.piece_plan ?? 0)}/<span className="text-emerald-600">฿{fmt(checklistMO.labor?.piece_actual ?? 0)}</span>
                          </span>
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-2">
                            <label className="text-[11px] text-slate-500 whitespace-nowrap">ค่าแรงผลิต (วางแผน)</label>
                            <input type="number" min={0} step="any" value={estLabor} onChange={(e) => setEstLabor(e.target.value)} placeholder="—"
                              className="w-28 h-8 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            <button onClick={() => void saveEstLabor()} disabled={estSaving} className="h-8 px-3 text-sm border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 disabled:opacity-50">{estSaving ? "บันทึก…" : "💾 บันทึก"}</button>
                            <span className="text-[10px] text-slate-400 ml-auto">เหมา-จริง = กด “เสร็จ” ในแท็บ 🧵</span>
                          </div>
                        )}
                      </div>
                    )}
                    {clTab === "recv" && clWO ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-xs">
                          <span className="text-slate-400">แผนก/ผู้รับ</span><span className="text-slate-700">{clWO.department_name ?? "—"} · {clWO.assignee_name ?? "—"}</span>
                          <span className="text-slate-400">จ่าย</span><span className="text-slate-700">{fmt(clWO.qty)} ชิ้น</span>
                          <span className="text-slate-400">ส่งแล้ว</span><span className="text-slate-700">{fmt(clWO.received_qty)} · เหลือ {fmt(Math.max(0, (clWO.qty || 0) - (clWO.received_qty || 0)))}</span>
                          <span className="text-slate-400">กำหนดเสร็จ</span><span className="text-slate-700">{clWO.due_date ?? "—"}</span>
                          <span className="text-slate-400">สถานะ</span><span><span className={`text-[11px] px-2 py-0.5 rounded border ${(WO_STATUS[clWO.status] ?? WO_STATUS.dispatched).cls}`}>{(WO_STATUS[clWO.status] ?? WO_STATUS.dispatched).label}</span></span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block"><span className="text-[11px] text-slate-500">ส่งรอบนี้ (ชิ้น)</span>
                            <input type="number" min={0} step="any" value={recvQty} onChange={(e) => setRecvQty(Number(e.target.value))} disabled={!canEdit}
                              className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50" /></label>
                          <label className="block"><span className="text-[11px] text-slate-500">💰 ค่าแรงผลิต (บาท)</span>
                            <input type="number" min={0} step="any" value={recvLabor} onChange={(e) => setRecvLabor(e.target.value)} disabled={!canEdit} placeholder="—"
                              className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" /></label>
                        </div>
                        {canEdit && (
                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            <input type="checkbox" checked={saveLaborBom} onChange={(e) => setSaveLaborBom(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                            บันทึกค่าแรงนี้กลับเข้า BOM (ราคาของช่าง {clWO.assignee_name ?? "—"})
                          </label>
                        )}
                        {canEdit && (
                          <div className="flex items-center gap-2">
                            <button onClick={() => void cancelWOTab()} className="h-9 px-4 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50">ยกเลิกใบจ่ายงาน</button>
                            <button onClick={() => void saveLabor()} className="h-9 px-3 text-sm border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 ml-auto">💾 บันทึกค่าแรง</button>
                            <button onClick={() => void submitReceiveTab()} disabled={recvSaving || recvQty <= 0 || recvLabor.trim() === ""} title={recvLabor.trim() === "" ? "ใส่ค่าแรงก่อน" : ""} className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">{recvSaving ? "กำลังบันทึก…" : "✓ ส่งงาน"}</button>
                          </div>
                        )}
                        <p className="text-[11px] text-slate-400">แท็บอื่นด้านบนดูข้อมูลใบสั่งผลิตเดียวกัน (เตรียม/ตัด/งานเหมา/ของซื้อ/ปัญหา/ประวัติ)</p>
                      </div>
                    ) : (clTab === "prep" || clTab === "cut" || clTab === "piece") && clLoading ? (
                      <div className="text-center py-8 text-slate-400 text-sm">กำลังโหลด…</div>
                    ) : clTab === "prep" ? (
                      clSummary.length === 0 && clMaterials.length === 0 ? (
                        <div className="text-center py-6">
                          <p className="text-slate-400 text-sm mb-3">ใบนี้ไม่มีรายการวัตถุดิบจาก BOM — ติ๊กรวมทั้งใบ</p>
                          <div className="grid grid-cols-2 gap-2 max-w-[280px] mx-auto">
                            <StepChip label="เตรียม" done={curMo.prep_done} disabled={!canEdit} onClick={() => togglePrep(curMo, "prep_done")} />
                            <StepChip label="ตัด" done={curMo.cut_done} disabled={!canEdit} onClick={() => togglePrep(curMo, "cut_done")} />
                          </div>
                        </div>
                      ) : (
                        <MoMaterialsTable
                          summary={clSummary} materials={clMaterials} qty={checklistMO.qty || 0} requested={clRequested}
                          editable={canEdit} canEdit={canEdit}
                          onChangeSummary={(rows) => void onMatSummaryChange(rows)}
                          onToggleCut={(line, next) => void onMatToggleCut(line, next)}
                        />
                      )
                    ) : clTab === "cut" ? (
                      clCutRows.length === 0 ? (
                        <div className="text-center py-8 text-slate-300 text-sm">ใบนี้ไม่มีงานตัด</div>
                      ) : (() => {
                        const moQty = checklistMO.qty || 0;
                        const rowTotal = (r: CutRow) => (r.pieces ?? 0) * moQty;   // ยอดรวมชิ้น = ชิ้น/บล็อก × จำนวนสั่ง
                        const totalPieces = clCutRows.reduce((s, r) => s + rowTotal(r), 0);
                        const sorted = [...clCutRows].sort((a, b) => (a.component_name ?? "").localeCompare(b.component_name ?? "", "th") || (a.cut_block_code ?? "").localeCompare(b.cut_block_code ?? ""));
                        const gkey = (r: CutRow) => clCutGroup === "type" ? (r.material_type ?? "ไม่ระบุประเภท") : clCutGroup === "material" ? (r.component_name ?? r.component_sku ?? "—") : "";
                        const groups: { key: string; rows: CutRow[] }[] = [];
                        if (clCutGroup === "none") groups.push({ key: "", rows: sorted });
                        else { const m = new Map<string, CutRow[]>(); for (const r of sorted) { const k = gkey(r); (m.get(k) ?? m.set(k, []).get(k)!).push(r); } for (const [key, rows] of m) groups.push({ key, rows }); }
                        const GRID = "grid grid-cols-[3rem_1fr_3.6rem_2.2rem_3.4rem_2.4rem] gap-1";
                        return (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="text-slate-400">จัดกลุ่ม:</span>
                              {([["none", "ไม่จัด"], ["type", "ประเภท"], ["material", "วัตถุดิบ"]] as const).map(([v, l]) => (
                                <button key={v} type="button" onClick={() => setClCutGroup(v)} className={`px-2 py-0.5 rounded-full border ${clCutGroup === v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>{l}</button>
                              ))}
                            </div>
                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                              <div className={`${GRID} px-2.5 py-1.5 bg-slate-100 text-[10px] font-semibold text-slate-600`}>
                                <span>บล็อก</span><span>วัตถุดิบ / ประเภท</span><span className="text-center">ก×ย</span><span className="text-center">ชิ้น</span><span className="text-right">ยอดรวม</span><span className="text-center">ตัด</span>
                              </div>
                              <div className="max-h-[42vh] overflow-y-auto">
                                {groups.map((g) => (
                                  <div key={g.key || "all"}>
                                    {g.key && <div className="px-2.5 py-1 bg-slate-50 text-[11px] font-medium text-slate-500 border-t border-slate-100">{g.key} <span className="text-slate-400">({g.rows.length})</span></div>}
                                    {g.rows.map((r, idx) => (
                                      <div key={r.id} className={`${GRID} px-2.5 py-2 items-center border-t border-slate-100 ${r.cut_done ? "bg-emerald-50/60" : idx % 2 ? "bg-slate-50/30" : "bg-white"}`}>
                                        <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 px-1 py-0.5 rounded text-center truncate" title={r.cut_block_code ?? ""}>{r.cut_block_code ?? "—"}</span>
                                        <span className="min-w-0">
                                          <span className="block text-[12px] text-slate-800 truncate" title={r.component_name ?? ""}>{r.component_name ?? r.component_sku}</span>
                                          {r.material_type && <span className="block text-[9px] text-slate-400">{r.material_type}</span>}
                                        </span>
                                        <span className="text-center text-[10px] text-slate-500">{r.cut_width != null && r.cut_length != null ? `${fmt(r.cut_width)}×${fmt(r.cut_length)}` : "—"}</span>
                                        <span className="text-center text-[11px] text-slate-600">{r.pieces != null ? fmt(r.pieces) : "—"}</span>
                                        <span className="text-right text-[12px] font-semibold text-slate-700">{fmt(rowTotal(r))}</span>
                                        <span className="flex justify-center"><CheckBtn done={r.cut_done} disabled={!canEdit} onClick={() => toggleCut(r.id)} /></span>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-between px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
                                <span>ทั้งหมด <b className="text-slate-700">{clCutRows.length}</b> บล็อก · ยอดรวม <b className="text-slate-700">{fmt(totalPieces)}</b> ชิ้น</span>
                                <span>ตัดแล้ว <b className="text-emerald-600">{cutDone}/{cutTotal}</b></span>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : clTab === "piece" ? (
                      clPieceRows.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-slate-300 text-sm mb-3">สินค้านี้ยังไม่มีงานเหมาใน BOM</p>
                          {canEdit && <button onClick={() => setAddPieceOpen(true)} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">➕ เพิ่มงานเหมาเข้า BOM</button>}
                        </div>
                      ) : (
                        <div className="border border-slate-100 rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50">
                            <span className="text-[11px] font-medium text-slate-500">เลือกงานเหมาที่จะจ่าย</span>
                            {canEdit && <button onClick={() => setAddPieceOpen(true)} className="text-[11px] text-blue-600 hover:underline">➕ เพิ่มงานเข้า BOM</button>}
                          </div>
                          <div className="grid grid-cols-[2rem_1fr_4.5rem_3.6rem] gap-2 px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-[11px] font-medium text-slate-500"><span className="text-center">จ่าย</span><span>งาน</span><span className="text-right">จำนวนรวม</span><span className="text-center">เสร็จ</span></div>
                          <div className="divide-y divide-slate-50 max-h-[46vh] overflow-y-auto">
                            {clPieceRows.map((r) => {
                              const done = r.status === "done";
                              return (
                              <div key={r.key} className="grid grid-cols-[2rem_1fr_4.5rem_3.6rem] gap-2 px-3 py-2 items-center hover:bg-slate-50/60">
                                <span className="flex justify-center"><input type="checkbox" checked={!!r.selected_id} disabled={!canEdit} onChange={() => togglePiece(r.key)} className="w-4 h-4 accent-blue-600" title="เลือกจ่ายงานนี้" /></span>
                                <div className="min-w-0">
                                  <p className="text-sm text-slate-800 truncate">{r.job_name} {r.is_detail && <span className="text-[10px] text-amber-600">★ละเอียด</span>}{!r.in_bom && <span className="text-[10px] text-slate-400">(เพิ่มเอง)</span>}</p>
                                  <p className="text-[10px] text-slate-400">{fmt(r.qty_per)} × จำนวนสั่ง{r.rate ? ` · ${fmt(r.rate)} ฿/ชิ้น · รวม ฿${fmt(r.total_qty * r.rate)}` : ""}</p>
                                </div>
                                <span className="text-right text-sm font-semibold text-slate-700">{fmt(r.total_qty)}</span>
                                <span className="flex justify-center">
                                  {r.selected_id ? (
                                    <button type="button" disabled={!canEdit} onClick={() => void togglePieceDone(r)}
                                      className={`text-[10px] px-2 py-1 rounded-full border whitespace-nowrap ${done ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"}`}
                                      title={done ? "งานเหมาเสร็จแล้ว — กดเพื่อยกเลิก" : "กดเมื่อทำงานเหมานี้เสร็จ (นับเป็นค่าแรงจริง)"}>
                                      {done ? "✓ เสร็จ" : "ทำเสร็จ"}
                                    </button>
                                  ) : <span className="text-[10px] text-slate-300">—</span>}
                                </span>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      )
                    ) : clTab === "purch" ? (
                      <PurchTab rows={clPurch} />
                    ) : clTab === "issue" ? (
                      <IssueTab issues={clIssues} canEdit={canEdit} issType={issType} setIssType={setIssType} issSev={issSev} setIssSev={setIssSev} issQty={issQty} setIssQty={setIssQty} onAdd={addIssue} onDel={delIssue} />
                    ) : (
                      <HistTab rows={clHist} />
                    )}
                    {clTab !== "recv" && <p className="text-[11px] text-slate-400">{clTab === "prep" ? "ติ๊ก ✓ เมื่อเตรียมวัตถุดิบชิ้นนั้นครบ · ครบทั้ง 2 หน้า → การ์ดไฟเขียว"
                      : clTab === "cut" ? "ติ๊ก ✓ ตัดครบรายบล็อก — ตัดครบทุกบล็อกของวัตถุดิบใด ระบบติ๊กเตรียมครบให้อัตโนมัติ"
                      : clTab === "piece" ? "ติ๊กเลือกงานเหมาที่จะจ่ายในใบนี้ · จำนวนรวม = จำนวนต่อใบ × จำนวนที่สั่ง"
                      : clTab === "purch" ? "สถานะและวันของจะถึง ดึงจากใบขอซื้อ/ใบสั่งซื้อที่ผูกกับงานนี้"
                      : clTab === "issue" ? "ลงปัญหาที่เจอ (เชื่อมระบบ QC) — ใช้ติดตามของเสีย/แก้ไข"
                      : "ใบจ่ายงานทั้งหมดของงานนี้ (รวมที่ยกเลิกแล้ว)"}</p>}
                  </div>
                );
              })()}
            </div>
          );
        })()}
      </ERPModal>

      {/* popup เพิ่มงานเหมาเข้า BOM (จากแท็บงานเหมา) */}
      <AddPieceworkModal open={addPieceOpen} productSku={checklistMO?.product_sku ?? null} productName={checklistMO?.product_name ?? null}
        onClose={() => setAddPieceOpen(false)} onAdded={() => void reloadPiece()} />

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

// ---- ไอคอนพนักงานในแผนก (วงกลมรูป/อักษรย่อ) ----
function StaffAvatars({ staff }: { staff: Assignee[] }) {
  if (!staff.length) return null;
  const show = staff.slice(0, 4);
  return (
    <div className="flex -space-x-1.5" title={staff.map((s) => s.name).join(", ")}>
      {show.map((s) => (
        <span key={s.id} title={s.name} className="h-5 w-5 rounded-full ring-2 ring-white bg-slate-200 overflow-hidden flex items-center justify-center text-[9px] font-medium text-slate-600">
          {s.photo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.photo} alt="" className="h-full w-full object-cover" /> : (s.name?.trim()?.[0] ?? "?")}
        </span>
      ))}
      {staff.length > 4 && <span className="h-5 w-5 rounded-full ring-2 ring-white bg-slate-100 flex items-center justify-center text-[8px] text-slate-500">+{staff.length - 4}</span>}
    </div>
  );
}

// ---- เฟส 4: ของที่ซื้อ / ETA ----
const _dt = (s: string | null) => { if (!s) return "—"; try { return new Date(s).toLocaleDateString("th-TH", { day: "2-digit", month: "short" }); } catch { return s; } };
const PO_BADGE: Record<string, { t: string; c: string }> = {
  draft: { t: "ร่าง", c: "bg-slate-100 text-slate-600" }, confirmed: { t: "สั่งแล้ว", c: "bg-blue-50 text-blue-700" },
  partially_received: { t: "รับบางส่วน", c: "bg-amber-50 text-amber-700" }, received: { t: "รับครบ", c: "bg-emerald-50 text-emerald-700" }, closed: { t: "ปิดแล้ว", c: "bg-slate-100 text-slate-500" },
};
function PurchTab({ rows }: { rows: PurchaseStatusRow[] | null }) {
  if (rows === null) return <div className="text-center py-8 text-slate-400 text-sm">กำลังโหลด…</div>;
  if (rows.length === 0) return <div className="text-center py-8 text-slate-300 text-sm">ยังไม่มีรายการสั่งซื้อสำหรับงานนี้</div>;
  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_5rem_3.5rem] gap-2 px-3 py-1.5 bg-slate-50 text-[11px] font-medium text-slate-500"><span>ของที่ซื้อ</span><span className="text-center">สถานะ</span><span className="text-right">ของถึง</span></div>
      <div className="divide-y divide-slate-50 max-h-[46vh] overflow-y-auto">
        {rows.map((r) => {
          const po = r.po_status ? (PO_BADGE[r.po_status] ?? { t: r.po_status, c: "bg-slate-100 text-slate-600" }) : null;
          return (
            <div key={r.id} className="grid grid-cols-[1fr_5rem_3.5rem] gap-2 px-3 py-2 items-center">
              <div className="min-w-0">
                <p className="text-sm text-slate-800 truncate">{r.is_urgent && <span className="text-rose-500">⚡</span>} {r.item_name}</p>
                <p className="text-[10px] text-slate-400">{r.po_no ? `PO ${r.po_no}${r.seller_name ? ` · ${r.seller_name}` : ""}` : "ยังไม่ออกใบสั่งซื้อ"}</p>
              </div>
              <span className="flex justify-center">
                {po ? <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${po.c}`}>{po.t}</span>
                  : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">รอสั่งซื้อ</span>}
              </span>
              <span className="text-right text-[11px] text-slate-600">{_dt(r.expected_date ?? r.needed_date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- เฟส 4: ปัญหา QC (ลง/ดู/ลบ) ----
const SEV_OPT: [string, string][] = [["low", "เล็กน้อย"], ["medium", "ปานกลาง"], ["high", "รุนแรง"]];
const SEV_BADGE: Record<string, string> = { low: "bg-slate-100 text-slate-600", medium: "bg-amber-50 text-amber-700", high: "bg-rose-50 text-rose-700" };
function IssueTab({ issues, canEdit, issType, setIssType, issSev, setIssSev, issQty, setIssQty, onAdd, onDel }: {
  issues: MoIssue[] | null; canEdit: boolean; issType: string; setIssType: (v: string) => void; issSev: string; setIssSev: (v: string) => void; issQty: string; setIssQty: (v: string) => void; onAdd: () => void; onDel: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {canEdit && (
        <div className="flex gap-1.5 items-center">
          <input value={issType} onChange={(e) => setIssType(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
            placeholder="ปัญหาที่เจอ เช่น เย็บเบี้ยว" className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400" />
          <select value={issSev} onChange={(e) => setIssSev(e.target.value)} className="h-8 px-1.5 text-xs border border-slate-200 rounded-lg bg-white">
            {SEV_OPT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input value={issQty} onChange={(e) => setIssQty(e.target.value)} type="number" inputMode="numeric" placeholder="จำนวน" className="w-16 h-8 px-2 text-sm text-center border border-slate-200 rounded-lg" />
          <button onClick={onAdd} className="h-8 px-3 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700">＋</button>
        </div>
      )}
      {issues === null ? <div className="text-center py-8 text-slate-400 text-sm">กำลังโหลด…</div>
        : issues.length === 0 ? <div className="text-center py-6 text-slate-300 text-sm">ยังไม่มีปัญหาในงานนี้</div>
          : (
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <div className="divide-y divide-slate-50 max-h-[40vh] overflow-y-auto">
                {issues.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800 truncate">{i.defect_type}</p>
                      <p className="text-[10px] text-slate-400">{i.qty != null ? `${fmt(i.qty)} ชิ้น · ` : ""}{_dt(i.created_at)}{i.cause ? ` · ${i.cause}` : ""}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${SEV_BADGE[i.severity ?? "medium"] ?? SEV_BADGE.medium}`}>{(SEV_OPT.find(([v]) => v === i.severity)?.[1]) ?? i.severity}</span>
                    {canEdit && <button onClick={() => onDel(i.id)} className="shrink-0 text-slate-300 hover:text-rose-600 text-xs">🗑</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
    </div>
  );
}

// ---- เฟส 4: ประวัติการจ่ายงาน ----
const HIST_BADGE: Record<string, { t: string; c: string }> = {
  dispatched: { t: "จ่ายแล้ว", c: "bg-blue-50 text-blue-700" }, in_progress: { t: "กำลังทำ", c: "bg-indigo-50 text-indigo-700" },
  partial_return: { t: "คืนบางส่วน", c: "bg-amber-50 text-amber-700" }, done: { t: "เสร็จ", c: "bg-emerald-50 text-emerald-700" },
};
function HistTab({ rows }: { rows: DispatchHistRow[] | null }) {
  if (rows === null) return <div className="text-center py-8 text-slate-400 text-sm">กำลังโหลด…</div>;
  if (rows.length === 0) return <div className="text-center py-8 text-slate-300 text-sm">ยังไม่เคยจ่ายงานนี้</div>;
  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <div className="divide-y divide-slate-50 max-h-[46vh] overflow-y-auto">
        {rows.map((r) => {
          const b = HIST_BADGE[r.status] ?? { t: r.status, c: "bg-slate-100 text-slate-600" };
          return (
            <div key={r.id} className={`flex items-center gap-2 px-3 py-2 ${r.is_active ? "" : "opacity-50"}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800 truncate">{r.assignee_name ?? r.department_name ?? "—"}{!r.is_active && <span className="text-[10px] text-rose-500"> · ยกเลิก</span>}</p>
                <p className="text-[10px] text-slate-400">{r.wo_no} · {_dt(r.dispatch_date)} · จ่าย {fmt(r.qty)}{r.received_qty ? ` · คืน ${fmt(r.received_qty)}` : ""}</p>
              </div>
              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${b.c}`}>{b.t}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- ค่าแรงย่อบนการ์ด (กลุ่ม A): ผลิต/เหมา = แผน/จริง (จริงเป็นสีเขียว) ----
function LaborMini({ labor }: { labor?: Labor }) {
  if (!labor) return null;
  if (!(labor.prod_plan || labor.prod_actual || labor.piece_plan || labor.piece_actual)) return null;
  const cell = (plan: number, actual: number) => (
    <span className="tabular-nums text-slate-600">฿{fmt(plan)}<span className="text-slate-300">/</span><span className="text-emerald-600 font-medium">฿{fmt(actual)}</span></span>
  );
  return (
    <div className="mt-1 pt-1 border-t border-slate-100 text-[9px] leading-tight space-y-0.5" title="ค่าแรง แผน / จริง (จริง = สีเขียว)">
      <div className="flex items-center justify-between"><span className="text-slate-400">ผลิต</span>{cell(labor.prod_plan, labor.prod_actual)}</div>
      <div className="flex items-center justify-between"><span className="text-slate-400">เหมา</span>{cell(labor.piece_plan, labor.piece_actual)}</div>
    </div>
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
      <LaborMini labor={mo.labor} />
    </div>
  );
}

// ---- เนื้อการ์ดใบจ่ายงาน (ในแผนก) — ดีไซน์เดียวกับการ์ดรอจ่าย ----
function WOBody({ w }: { w: WorkOrder }) {
  const urg = urgencyByDate(w.due_date, w.status === "done");
  const st = WO_STATUS[w.status] ?? WO_STATUS.dispatched;
  const border = w.brand_color || prodColor(w.product_sku);
  const showName = w.product_name && w.product_name !== w.product_sku;
  return (
    <div className="relative bg-white rounded-lg p-2 transition select-none cursor-pointer hover:-translate-y-0.5" style={{ border: `2px solid ${border}`, boxShadow: `5px 5px 0 0 ${border}` }} title="กดเพื่อดูรายละเอียด/รับงานคืน">
      {/* ช่างที่จ่าย — badge มุมซ้ายบน */}
      {w.assignee_name && (
        <span className="absolute -top-2.5 left-2 z-20 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white shadow-sm truncate max-w-[85%]" style={{ border: `2px solid ${border}`, color: border }} title={w.assignee_name}>
          {w.assignee_type === "department" ? "🏢" : "👤"} {w.assignee_name}
        </span>
      )}
      <div className="relative w-full aspect-[4/3] rounded-md bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center mb-1.5 mt-1.5">
        {w.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={w.image_url} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" /> : <span className="text-slate-300 text-2xl">📦</span>}
        <span className={`absolute top-1 right-1 h-3 w-3 rounded-full ring-2 ring-white ${URG_DOT[urg]}`} />
        <span className={`absolute top-1 left-1 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium border ${st.cls}`}>{st.label}</span>
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-slate-800 leading-tight truncate">{w.product_sku}</div>
        {showName && <div className="text-[10px] text-slate-400 line-clamp-1 leading-tight">{w.product_name}</div>}
        <div className="text-[10px] text-slate-500 mt-0.5">📅 {dueDateText(w.due_date)}</div>
      </div>
      {/* จำนวน — แถบล่างตัวหนาเด่น */}
      <div className="flex items-center justify-between gap-1 mt-2">
        <span className="px-2.5 py-1 rounded-lg text-sm font-bold text-white shadow-sm tabular-nums" style={{ background: border }}>{fmt(w.qty)} ชิ้น{w.received_qty > 0 && w.status !== "done" ? ` · รับ ${fmt(w.received_qty)}` : ""}</span>
        <span className={`text-[10px] ${daysLeftClass(w.due_date)}`}>⏱ {daysLeftText(w.due_date)}</span>
      </div>
      <LaborMini labor={w.labor} />
      <div className="text-center font-mono text-[8px] text-slate-300 mt-1">{w.wo_no}</div>
    </div>
  );
}

// ---- รูปย่อในตาราง ----
function BoardImg({ url }: { url: string | null | undefined }) {
  if (!url) return <span className="w-9 h-9 shrink-0 rounded bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300">📦</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="w-9 h-9 shrink-0 rounded object-contain bg-slate-50 border border-slate-100" />;
}

// ---- มุมมองตาราง (สลับจากบอร์ด) — รอจ่าย + จ่ายแล้ว ----
const ProdCell = ({ url, sku, name }: { url: string | null | undefined; sku: string | null; name: string | null }) => (
  <div className="flex items-center gap-2">
    <BoardImg url={url} />
    <div className="min-w-0"><div className="font-semibold text-slate-800 truncate">{sku}</div>{name && name !== sku && <div className="text-[11px] text-slate-400 truncate">{name}</div>}</div>
  </div>
);
const DueCell = ({ d }: { d: string | null }) => (
  <span className="text-[12px] whitespace-nowrap">📅 {dueDateText(d)} <span className={daysLeftClass(d)}>· {daysLeftText(d)}</span></span>
);

function BoardTable({ pending, workOrders, onOpenMO, onOpenWO, onReload }: {
  pending: PendingMO[]; workOrders: WorkOrder[]; onOpenMO: (mo: PendingMO) => void; onOpenWO: (wo: WorkOrder) => void; onReload?: () => void;
}) {
  const wos = workOrders.filter((w) => w.status !== "done" && w.stage !== "cut");
  const [sel, setSel] = useState<Set<string>>(new Set());   // เลือกใบรอจ่าย (by id) → จัดกลุ่ม
  const [assignOpen, setAssignOpen] = useState(false);
  const selMoNos = pending.filter((m) => sel.has(m.id)).map((m) => m.mo_no);

  const pendCols: MiniColumn<PendingMO>[] = [
    { key: "prod", header: "สินค้า", width: "minmax(12rem,1.6fr)", sortValue: (m) => m.product_sku ?? "", sortLabel: "ชื่อสินค้า", cell: (m) => <ProdCell url={m.image_url} sku={m.product_sku} name={m.product_name} /> },
    { key: "mo", header: "ใบสั่งผลิต", width: "9rem", sortValue: (m) => m.mo_no, sortLabel: "เลขใบสั่งผลิต", cell: (m) => <span className="font-mono text-[11px] text-slate-500">{m.mo_no}</span> },
    { key: "qty", header: "จำนวน", width: "5rem", align: "right", sortValue: (m) => m.qty, sortLabel: "จำนวน", cell: (m) => <span className="tabular-nums">{fmt(m.qty)}</span> },
    { key: "disp", header: "จ่ายแล้ว", width: "5rem", align: "right", cell: (m) => <span className="tabular-nums text-slate-500">{fmt(m.dispatched)}</span> },
    { key: "rem", header: "เหลือ", width: "4.5rem", align: "right", sortValue: (m) => m.remaining, sortLabel: "เหลือ", cell: (m) => <span className="tabular-nums font-semibold text-rose-600">{fmt(m.remaining)}</span> },
    { key: "due", header: "กำหนดเสร็จ", width: "minmax(9rem,1fr)", sortValue: (m) => m.due_date ?? "9999", sortLabel: "กำหนดเสร็จ", cell: (m) => <DueCell d={m.due_date} /> },
    { key: "ready", header: "พร้อม", width: "6.5rem", align: "center", sortValue: (m) => (m.ready ? 0 : 1), sortLabel: "ความพร้อม", cell: (m) => m.ready ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 whitespace-nowrap">พร้อม ✓</span> : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap">ยังไม่พร้อม</span> },
  ];

  const woCols: MiniColumn<WorkOrder>[] = [
    { key: "prod", header: "สินค้า", width: "minmax(12rem,1.6fr)", sortValue: (w) => w.product_sku ?? "", sortLabel: "ชื่อสินค้า", cell: (w) => <ProdCell url={w.image_url} sku={w.product_sku} name={w.product_name} /> },
    { key: "wo", header: "ใบจ่ายงาน", width: "9rem", sortValue: (w) => w.wo_no, sortLabel: "เลขใบจ่ายงาน", cell: (w) => <span className="font-mono text-[11px] text-slate-500">{w.wo_no}</span> },
    { key: "dept", header: "แผนก/ช่าง", width: "minmax(8rem,1fr)", sortValue: (w) => w.department_name ?? "", sortLabel: "แผนก", cell: (w) => <span className="text-[12px] text-slate-600">{w.department_name ?? "—"}{w.assignee_name ? ` · ${w.assignee_name}` : ""}</span> },
    { key: "qty", header: "จำนวน", width: "5rem", align: "right", sortValue: (w) => w.qty, sortLabel: "จำนวน", cell: (w) => <span className="tabular-nums">{fmt(w.qty)}</span> },
    { key: "recv", header: "รับคืน", width: "5rem", align: "right", cell: (w) => <span className="tabular-nums text-slate-500">{fmt(w.received_qty)}</span> },
    { key: "due", header: "กำหนดเสร็จ", width: "minmax(9rem,1fr)", sortValue: (w) => w.due_date ?? "9999", sortLabel: "กำหนดเสร็จ", cell: (w) => <DueCell d={w.due_date} /> },
    { key: "status", header: "สถานะ", width: "7rem", align: "center", sortValue: (w) => (WO_STATUS[w.status]?.label ?? w.status), sortLabel: "สถานะ", cell: (w) => { const st = WO_STATUS[w.status] ?? WO_STATUS.dispatched; return <span className={`text-[10px] px-2 py-0.5 rounded border whitespace-nowrap ${st.cls}`}>{st.label}</span>; } },
  ];

  return (
    <div className="space-y-5 max-h-[calc(100vh-210px)] overflow-y-auto pr-1">
      <MiniTable
        rows={pending} rowKey={(m) => m.id} columns={pendCols} onRowClick={onOpenMO}
        title="📥 รอจ่าย" countUnit="ใบ"
        selectable selected={sel} onSelectedChange={setSel}
        actions={selMoNos.length > 0 ? <button onClick={() => setAssignOpen(true)} className="h-8 px-3 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700">🗂 จัดกลุ่ม ({selMoNos.length})</button> : undefined}
        searchText={(m) => `${m.product_sku ?? ""} ${m.product_name ?? ""} ${m.mo_no}`}
        searchPlaceholder="ค้นหา สินค้า / เลขใบสั่งผลิต"
        groupBy={(m) => (m.ready ? "✅ พร้อมจ่าย" : "⏳ ยังไม่พร้อม")} groupLabel="จัดกลุ่มตามความพร้อม" defaultGrouped={false}
        emptyText="ไม่มีงานรอจ่าย"
      />
      {assignOpen && <AssignToGroupModal moNos={selMoNos} onClose={() => setAssignOpen(false)} onDone={() => { setSel(new Set()); onReload?.(); }} />}
      <MiniTable
        rows={wos} rowKey={(w) => w.id} columns={woCols} onRowClick={onOpenWO}
        title="🛠 จ่ายแล้ว — กำลังผลิต" countUnit="ใบ"
        searchText={(w) => `${w.product_sku ?? ""} ${w.product_name ?? ""} ${w.wo_no} ${w.department_name ?? ""} ${w.assignee_name ?? ""}`}
        searchPlaceholder="ค้นหา สินค้า / ใบจ่ายงาน / แผนก"
        groupBy={(w) => (WO_STATUS[w.status]?.label ?? w.status)} groupLabel="จัดกลุ่มตามสถานะ" defaultGrouped={false}
        emptyText="ยังไม่มีงานที่จ่าย"
      />
    </div>
  );
}
