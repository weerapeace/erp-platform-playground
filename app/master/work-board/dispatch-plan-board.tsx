"use client";

/**
 * กลุ่ม D — หน้าแผนจ่ายงาน (ร่าง) แบบคอลัมน์
 * - ลองจ่ายงานไปแต่ละโต๊ะแบบ "ร่าง" (เก็บใน mo_dispatch_plan_lines) ไม่กระทบของจริง
 * - ใบจ่ายงานจริงโชว์ล็อกไว้ดูเฉย ๆ (อ่านอย่างเดียว)
 * - กด "ดันเป็นของจริง" → สร้างใบจ่ายงานจริงตามร่างทั้งแผน
 * แยกจากบอร์ด canvas เดิม เพื่อไม่ให้กระทบของจริง
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { HoverImage } from "@/components/hover-image";
import type { DispatchPlanLine } from "@/app/api/mo/dispatch-plans/route";

type DeptLite = { id: string; name: string };
type PendingLite = { id: string; mo_no: string; product_sku: string | null; product_name: string | null; qty: number; remaining: number; image_url?: string | null; status?: string; ready?: boolean; prep_done?: boolean; cut_done?: boolean; brand?: string | null; due_date?: string | null; internal_due_date?: string | null };
type PieceLite = { id: string; mo_no: string; job_name: string; rate: number; qty_per: number; qty: number; product_sku: string | null; product_name: string | null; image_url?: string | null };
type WOLite = { id: string; mo_no: string; mo_id?: string | null; qty: number; department_id: string | null; stage: string; assignee_id?: string | null; assignee_name: string | null; assignees?: { id: string | null; name: string }[]; product_sku: string | null; product_name: string | null; status: string; image_url?: string | null; labor?: { prod_plan: number; prod_actual?: number }; brand?: string | null; due_date?: string | null };
type CraftLite = { id: string; name: string; department_id?: string | null; code?: string | null };
type DefectMap = Record<string, { count: number } | undefined>;

// drawer ข้อมูลใบสั่งผลิต (ของกลางตัวเดียวกับหน้า master) — โหลดตอนกดชื่อบนการ์ดเท่านั้น (ตัวนี้หนัก)

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const dayText = (d?: string | null) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : null);
const ymdKey = (d: Date) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
const TH_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const baht = (n: number) => "฿" + fmt(n);

function Thumb({ url }: { url?: string | null }) {
  return <HoverImage url={url} size={28} previewSize={224} />;
}

// OT วางแผนต่อคน (ดู /api/mo/plan-ot) — ตัวเลขบนบอร์ดอย่างเดียว ไม่เข้าระบบเงินเดือน
type OtRow = { rate_per_hour: number; hours_per_day: number; days: number; amount: number };
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const otAmount = (o: Partial<OtRow>) => (Number(o.rate_per_hour) || 0) * (Number(o.hours_per_day) || 0) * (Number(o.days) || 0);

// การ์ดงานกลาง — ใช้ทั้ง "ของจริง" / "ล็อก" / "ร่าง" ให้หน้าตาเหมือนกัน (ต่างแค่ปุ่ม + เนื้อใน)
// ยึดสไตล์ตามของจริง: พื้นเทา ขอบทึบ · ร่าง = เส้นซ้ายเขียวบาง ๆ + ป้าย "ร่าง" · ล็อก = จาง
function CardShell({ dim, accent, thumbUrl, sku, drag, actions, children }: {
  dim?: boolean;            // ล็อก/ดูอย่างเดียว → จาง
  accent?: string;          // ร่าง → เส้นซ้ายบาง ๆ (สี)
  thumbUrl?: string | null;
  sku: ReactNode;
  drag?: ReactNode;         // ปุ่มลากย้ายโต๊ะ (ร่าง)
  actions?: ReactNode;      // ปุ่มมุมขวาบน (📋 / ✕ / 🔒 / ร่าง)
  children?: ReactNode;     // เนื้อใน (ช่าง/จำนวน/ค่าแรง ฯลฯ)
}) {
  return (
    <div className={`rounded-lg px-2 py-1.5 mb-1.5 bg-slate-50 border border-slate-200 ${dim ? "opacity-70" : ""}`}
      style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
      onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <Thumb url={thumbUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="flex items-center gap-1 min-w-0">
              {drag}
              <span className="text-sm font-medium text-slate-600 truncate">{sku}</span>
            </span>
            {actions && <span className="flex items-center gap-1 shrink-0">{actions}</span>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function DispatchPlanBoard({
  planId, planName, planStatus, startDate, endDate, departments, pending, realWOs, craftsmen, defectByWorker,
  laborPerUnit, imageByMo, deptWages, canEdit, tablet, realMode, onDispatch, pendingPiece, onPieceClick,
  onApplied, onRenamed, onDates, onDeleted, onOpenWork, onReorderDepts, onManageDepts, onStaffMoved, onUpdateWO, onCancelWO, onSetCentralRate, onPickDispatch,
}: {
  planId: string; planName: string; planStatus: string; startDate: string | null; endDate: string | null;
  departments: DeptLite[]; pending: PendingLite[]; pendingPiece?: PieceLite[]; onPieceClick?: (p: PieceLite) => void; realWOs: WOLite[]; craftsmen: CraftLite[];
  defectByWorker: DefectMap; deptWages: Record<string, number>;
  laborPerUnit: Record<string, number>;   // mo_no → ค่าแรงผลิตต่อชิ้น (จากแผนกลุ่ม A)
  imageByMo: Record<string, string | null>;
  canEdit: boolean;
  tablet?: boolean;   // โหมดแท็บเล็ต → โฟกัสทีละโต๊ะ (แตะชิปเลือกโต๊ะ + เห็น 2 ช่อง รอจ่าย/โต๊ะที่เลือก)
  realMode?: boolean;   // มุมมอง "ของจริง" — คอลัมน์เหมือนหน้าแผน แต่จ่ายจริงทันที (ไม่ใช่ร่าง)
  onDispatch?: (info: { moId: string; deptId: string; qty: number }) => void;   // จ่ายจริง → เปิดหน้ายืนยัน
  onApplied: () => void; onRenamed: (name: string) => void; onDates: (start: string | null, end: string | null) => void; onDeleted: () => void;
  onOpenWork: (info: { moId: string | null; moNo: string | null; productSku: string | null; productName: string | null; qty: number }) => void;
  onReorderDepts?: (orderedIds: string[]) => void;   // ลากสลับคอลัมน์แผนก → บันทึกลำดับ
  onManageDepts?: () => void;   // เปิดป๊อปอัปตั้งค่าแผนก (ซ่อน/แสดงโต๊ะ ฯลฯ)
  onStaffMoved?: () => void;    // ย้ายพนักงานเข้า/ออกโต๊ะแล้ว → ให้หน้าแม่โหลดรายชื่อ + เงินเดือนรวมใหม่
  onUpdateWO?: (id: string, patch: { labor_cost?: number; assignees?: { id: string | null; name: string }[]; assignee_name?: string | null; assignee_id?: string | null; assignee_type?: string; department_id?: string | null; department_name?: string | null }, quiet?: boolean) => Promise<void>;   // แก้ใบงานจริง (ของจริงเท่านั้น) · quiet = ไม่เด้ง toast "บันทึกค่าแรงแล้ว"
  onCancelWO?: (id: string) => void | Promise<void>;   // ยกเลิกใบจ่ายงาน (ของจริง) → คืน qty กลับ "รอจ่าย"
  onSetCentralRate?: (info: { moNo: string; rate: number }) => void | Promise<void>;   // การ์ดร่าง: ใส่ค่าแรง → ตั้งเรตกลางสินค้า
  onPickDispatch?: (moNo: string, qty: number) => void;   // tablet: แตะการ์ดซ้ำ/กดเลือกโต๊ะ → เปิด popup จ่ายงาน (เลือกโต๊ะ+ช่าง)
}) {
  const toast = useToast();
  const [lines, setLines] = useState<DispatchPlanLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);   // mo_no ของการ์ดรอจ่ายที่เลือก
  const [dispQty, setDispQty] = useState<Record<string, string>>({});   // จำนวนที่จะจ่าย (แบ่งจ่าย) ต่อ mo_no
  const [staffPopup, setStaffPopup] = useState<DeptLite | null>(null);   // popup พนักงานในโต๊ะ (แก้คน + ตั้ง OT)
  // ⛶ ขยายดูรายการในช่อง (รอจ่าย / โต๊ะ) — คอลัมน์บนบอร์ดยาว เลื่อนหาของยาก
  const [listPopup, setListPopup] = useState<{ kind: "pending" | "dept"; dept?: DeptLite } | null>(null);
  const [listByWorker, setListByWorker] = useState(true);   // ป๊อปรายการงานในโต๊ะ: จัดกลุ่มการ์ดตามช่าง (โต๊ะช่างเหมามีหลายคน)
  const [listView, setListView] = useState<"cards" | "cal">("cards");      // ในป๊อป: การ์ด / ปฏิทิน (ตามกำหนดส่ง)
  const [calCursor, setCalCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  // ลำดับการ์ดในป๊อป (ลากจัดเองได้) — จำไว้ในเครื่องนี้ต่อโต๊ะ
  const [cardOrder, setCardOrder] = useState<Record<string, string[]>>({});
  const [dragCard, setDragCard] = useState<string | null>(null);

  /** ลำดับการ์ดที่ลากจัดไว้เอง (เก็บในเครื่อง) */
  const orderKeyOf = (kind: string, deptId?: string) => `wb:cardOrder:${kind}:${deptId ?? "-"}`;
  const applyOrder = useCallback(<T,>(rows: T[], keyOf: (r: T) => string, storeKey: string): T[] => {
    const ord = cardOrder[storeKey];
    if (!ord || ord.length === 0) return rows;
    const idx = new Map(ord.map((k, i) => [k, i]));
    return [...rows].sort((a, b) => (idx.get(keyOf(a)) ?? 9999) - (idx.get(keyOf(b)) ?? 9999));
  }, [cardOrder]);
  const moveCard = useCallback((storeKey: string, keys: string[], from: string, to: string) => {
    if (from === to) return;
    const base = (cardOrder[storeKey]?.length ? cardOrder[storeKey].filter((k) => keys.includes(k)) : keys).slice();
    for (const k of keys) if (!base.includes(k)) base.push(k);
    const fi = base.indexOf(from), ti = base.indexOf(to);
    if (fi < 0 || ti < 0) return;
    base.splice(ti, 0, base.splice(fi, 1)[0]);
    setCardOrder((p) => { const next = { ...p, [storeKey]: base }; try { localStorage.setItem(storeKey, JSON.stringify(base)); } catch { /* โหมดส่วนตัว */ } return next; });
  }, [cardOrder]);
  // อ่านลำดับที่เคยจัดไว้ตอนเปิดป๊อป
  useEffect(() => {
    if (!listPopup) return;
    const k = orderKeyOf(listPopup.kind, listPopup.dept?.id);
    try { const raw = localStorage.getItem(k); if (raw) setCardOrder((p) => ({ ...p, [k]: JSON.parse(raw) as string[] })); } catch { /* ignore */ }
  }, [listPopup]);
  const [listSearch, setListSearch] = useState("");
  const [listAddOpen, setListAddOpen] = useState(false);      // ป๊อป ⛶: โหมด "＋ เพิ่มงานจากรอจ่าย"
  const [listAddSearch, setListAddSearch] = useState("");
  const [listLaborId, setListLaborId] = useState<string | null>(null);   // ใบที่กำลังใส่ค่าแรงในป๊อป
  const [listLaborVal, setListLaborVal] = useState("");
  const [listBusy, setListBusy] = useState(false);
  // OT วางแผน ต่อคน (เก็บต่อ "แผน" — บอร์ดของจริงไม่มี) · ยอด = ฿/ชม. × ชม./วัน × วัน
  const [ot, setOt] = useState<Record<string, OtRow>>({});
  const [otBusy, setOtBusy] = useState<string | null>(null);
  const [staffAddOpen, setStaffAddOpen] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");
  const [staffBusy, setStaffBusy] = useState<string | null>(null);
  // ค่าแรง/ชั่วโมงของแต่ละคน (คิดจากค่าแรงจริงในระบบ) — ไว้เติมช่อง ฿/ชม. ให้อัตโนมัติ
  const [otRate, setOtRate] = useState<Record<string, { rate: number; basis: string }>>({});
  // ฐานคิด: ชั่วโมงงานปกติ/วัน + วันทำงาน/เดือน (จำไว้ที่เครื่อง)
  const [baseHours, setBaseHours] = useState(8);
  const [baseDays, setBaseDays] = useState(26);
  // ใส่ ชม./วัน + วัน ให้ทุกคนในโต๊ะทีเดียว
  const [bulkHours, setBulkHours] = useState("");
  const [bulkDays, setBulkDays] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  useEffect(() => {
    try {
      const h = Number(localStorage.getItem("wb:otBaseHours")); if (h > 0 && h <= 24) setBaseHours(h);
      const d = Number(localStorage.getItem("wb:otBaseDays")); if (d > 0 && d <= 31) setBaseDays(d);
    } catch { /* ignore */ }
  }, []);
  const [laborEditId, setLaborEditId] = useState<string | null>(null);   // ใบงานจริงที่กำลังใส่ค่าแรง
  const [laborEditVal, setLaborEditVal] = useState("");
  const [laborSaving, setLaborSaving] = useState(false);
  const [cancelArmId, setCancelArmId] = useState<string | null>(null);   // ใบงานจริงที่กด X แล้ว (รอยืนยันคืนรอจ่าย)
  const [cancelSaving, setCancelSaving] = useState(false);
  // ป๊อปเลือกช่าง — ใช้ร่วมกันทั้ง "ใบงานจริง" (เลือกได้หลายคน) และ "รายการร่าง" (เลือกได้คนเดียว)
  const [assignPopup, setAssignPopup] = useState<{ wo?: WOLite; line?: DispatchPlanLine; dept: DeptLite } | null>(null);
  const [assignSel, setAssignSel] = useState<Set<string>>(new Set());
  const [assignSaving, setAssignSaving] = useState(false);
  // ➕ เพิ่มช่างใหม่จากป๊อปเลือกช่าง (ช่างเหมาที่เพิ่งรับเข้ามา ไม่ต้องวิ่งไปหน้าพนักงาน)
  const [newCrafts, setNewCrafts] = useState<CraftLite[]>([]);   // คนที่เพิ่งเพิ่ม (หน้าแม่ยังโหลดรายชื่อใหม่ไม่ทัน)
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addNick, setAddNick] = useState("");
  const [addCode, setAddCode] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");   // ค้นหาช่างในป๊อปเลือกช่าง
  // เปิด/บันทึก ตัวเลือกช่างหลายคน
  // รายชื่อช่างที่ใช้จริง = ของหน้าแม่ + คนที่เพิ่งเพิ่มจากป๊อป (กันเลือกไม่ได้เพราะหน้าแม่ยังโหลดไม่เสร็จ)
  const allCrafts = useMemo(() => [...craftsmen, ...newCrafts.filter((n) => !craftsmen.some((c) => c.id === n.id))], [craftsmen, newCrafts]);
  const craftsOfDept = useCallback((dept: DeptLite) => /เหมา/.test(dept.name) ? allCrafts : allCrafts.filter((c) => c.department_id === dept.id), [allCrafts]);
  const openAssign = (w: WOLite, dept: DeptLite) => {
    const cur = new Set<string>();
    (w.assignees ?? []).forEach((a) => { if (a.id) cur.add(a.id); });
    if (cur.size === 0 && w.assignee_id) cur.add(w.assignee_id);   // ของเดิม (ช่างเดี่ยว)
    setAssignSel(cur); setAssignSearch(""); setAssignPopup({ wo: w, dept });
  };
  /** เปิดป๊อปเลือกช่างให้ "รายการร่าง" — ใช้หน้าตาเดียวกับของจริง (ค้นหา + แยกกลุ่มแผนก) แต่เลือกได้คนเดียว */
  const openAssignLine = (l: DispatchPlanLine, dept: DeptLite) => {
    setAssignSel(new Set(l.assignee_id ? [l.assignee_id] : []));
    setAssignSearch(""); setAssignPopup({ line: l, dept });
  };
  /** ➕ เพิ่มช่างใหม่เข้าแผนก/โต๊ะที่กำลังเลือกอยู่ แล้วเลือกให้เลย */
  const addCraftsman = async () => {
    if (!assignPopup) return;
    const name = addName.trim();
    if (!name) { toast.error("ใส่ชื่อช่างก่อน"); return; }
    setAddSaving(true);
    try {
      const res = await apiFetch("/api/mo/assignees", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, nickname: addNick.trim() || null, code: addCode.trim() || null, department_id: assignPopup.dept.id }) });
      const j = await res.json(); if (!res.ok || j?.error) throw new Error(j?.error || "เพิ่มช่างไม่สำเร็จ");
      const c = j.data as CraftLite;
      setNewCrafts((p) => [...p, c]);
      setAssignSel((prev) => (assignPopup.line ? new Set([c.id]) : new Set([...prev, c.id])));   // เพิ่มแล้วเลือกให้เลย
      setAddName(""); setAddNick(""); setAddCode(""); setAddOpen(false);
      toast.success(`เพิ่มช่าง ${c.name} แล้ว${c.code ? ` (${c.code})` : ""}`);
      onStaffMoved?.();                                   // ให้หน้าแม่โหลดรายชื่อใหม่
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มช่างไม่สำเร็จ"); }
    finally { setAddSaving(false); }
  };

  const saveAssign = async () => {
    if (!assignPopup) return;
    // รายการร่าง — เก็บช่างเดียว (โครงข้อมูลของแผนรองรับคนเดียว)
    if (assignPopup.line) {
      const id = [...assignSel][0] ?? null;
      const c = id ? allCrafts.find((x) => x.id === id) ?? null : null;
      setAssignSaving(true);
      try { await updateLine(assignPopup.line.id, { assignee_id: c?.id ?? null, assignee_name: c?.name ?? null }); setAssignPopup(null); }
      finally { setAssignSaving(false); }
      return;
    }
    if (!onUpdateWO) return;
    const list = [...assignSel].map((id) => { const c = allCrafts.find((x) => x.id === id); return c ? { id: c.id, name: c.name } : null; }).filter(Boolean) as { id: string; name: string }[];
    setAssignSaving(true);
    try {
      await onUpdateWO(assignPopup.wo!.id, { assignees: list, assignee_name: list.map((x) => x.name).join(", ") || null, assignee_id: list[0]?.id ?? null, assignee_type: list.length ? "craftsman" : "department" });
      setAssignPopup(null);
    } catch { /* parent toast */ } finally { setAssignSaving(false); }
  };
  const [focusDept, setFocusDept] = useState<string | null>(null);   // โหมดแท็บเล็ต: โต๊ะที่กำลังโฟกัส
  const [colW, setColW] = useState(240);   // ความกว้างคอลัมน์/โต๊ะ (px) — ปรับได้ จำที่เครื่อง
  useEffect(() => { try { const v = Number(localStorage.getItem("wb:planColW")); if (v >= 180 && v <= 480) setColW(v); } catch { /* ignore */ } }, []);
  const setColWidth = (w: number) => { const v = Math.max(180, Math.min(480, Math.round(w))); setColW(v); try { localStorage.setItem("wb:planColW", String(v)); } catch { /* ignore */ } };
  // กลุ่มใบสั่งงาน (สำหรับแท็บกรองในคอลัมน์รอจ่าย)
  const [moGroups, setMoGroups] = useState<{ name: string; mo_nos: string[] }[]>([]);
  const [groupTab, setGroupTab] = useState<string>("__all__");   // __all__ | ชื่อกลุ่ม | __none__ (ใช้ทั้งบอร์ด: รอจ่าย + การ์ดในโต๊ะ)
  const [boardSearch, setBoardSearch] = useState("");             // ค้นหาทั้งบอร์ด (รหัส/ชื่อ/เลขใบ/ช่าง)
  const [brandFilter, setBrandFilter] = useState("__all__");      // กรองตามแบรนด์ (ทั้งบอร์ด)
  useEffect(() => { void (async () => { try { const r = await apiFetch("/api/mo/groups"); const j = await r.json();
    setMoGroups(((j.data ?? []) as { name: string; mo_nos: unknown }[]).map((g) => ({ name: g.name, mo_nos: (Array.isArray(g.mo_nos) ? g.mo_nos : []) as string[] }))); } catch { /* ignore */ } })(); }, []);
  const groupsOf = (moNo: string) => moGroups.filter((g) => g.mo_nos.includes(moNo)).map((g) => g.name);
  const inGroupTab = (moNo: string) => groupTab === "__all__" ? true : groupTab === "__none__" ? groupsOf(moNo).length === 0 : groupsOf(moNo).includes(groupTab);
  const [name, setName] = useState(planName);
  const [sDate, setSDate] = useState(startDate ?? "");
  const [eDate, setEDate] = useState(endDate ?? "");
  const [applying, setApplying] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const applied = planStatus === "applied";
  const editable = canEdit && !applied;

  useEffect(() => { setName(planName); }, [planName]);
  useEffect(() => { setSDate(startDate ?? ""); setEDate(endDate ?? ""); }, [startDate, endDate]);

  const load = useCallback(async () => {
    if (realMode) { setLines([]); setLoading(false); return; }   // ของจริง: ไม่มีร่าง — โต๊ะโชว์ใบจ่ายงานจริง
    setLoading(true);
    try { const r = await apiFetch(`/api/mo/dispatch-plans/${planId}`); const j = await r.json();
      setLines((j?.data?.lines ?? []) as DispatchPlanLine[]);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [planId, realMode]);
  useEffect(() => { setSelected(null); void load(); }, [load]);

  // OT วางแผนของแผนนี้ (บอร์ด "ของจริง" ไม่มีแผน → ไม่โหลด)
  const loadOt = useCallback(async () => {
    if (!isUuid(planId)) { setOt({}); return; }
    try {
      const j = await apiFetch(`/api/mo/plan-ot?plan_id=${encodeURIComponent(planId)}`).then((r) => r.json());
      const map: Record<string, OtRow> = {};
      for (const r of ((j.data ?? []) as (OtRow & { employee_id: string })[])) map[r.employee_id] = { rate_per_hour: r.rate_per_hour, hours_per_day: r.hours_per_day, days: r.days, amount: r.amount };
      setOt(map);
    } catch { /* ไม่ critical — บอร์ดยังใช้ได้ */ }
  }, [planId]);
  useEffect(() => { void loadOt(); }, [loadOt]);

  // เปิดป๊อปโต๊ะ → ขอ "ค่าแรง/ชั่วโมง" ของคนในโต๊ะนั้น (เซิร์ฟเวอร์คำนวณให้ ไม่ส่งเงินเดือนออกมา)
  useEffect(() => {
    if (!staffPopup) return;
    const ids = craftsmen.filter((c) => c.department_id === staffPopup.id).map((c) => c.id);
    if (ids.length === 0) { setOtRate({}); return; }
    let cancel = false;
    void (async () => {
      try {
        const j = await apiFetch(`/api/mo/plan-ot/rate?ids=${ids.join(",")}&workdays=${baseDays}&hours=${baseHours}`).then((r) => r.json());
        if (!cancel) setOtRate((j.data ?? {}) as Record<string, { rate: number; basis: string }>);
      } catch { /* เติมอัตโนมัติไม่ได้ ก็ยังกรอกเองได้ */ }
    })();
    return () => { cancel = true; };
  }, [staffPopup, craftsmen, baseDays, baseHours]);

  // ยอด OT รวมต่อโต๊ะ — คิดจาก "แผนกปัจจุบันของคนนั้น" (ย้ายคนแล้ว OT ย้ายตาม)
  const otByDept = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of craftsmen) {
      const o = ot[c.id]; if (!o || !c.department_id) continue;
      m[c.department_id] = (m[c.department_id] ?? 0) + (Number(o.amount) || 0);
    }
    return m;
  }, [craftsmen, ot]);

  // ปิดป๊อปพนักงาน = รีเฟรชเบา ๆ (ยอด OT + เงินเดือนรวมต่อโต๊ะ ให้ตรงกับที่เพิ่งแก้)
  const closeStaffPopup = () => { setStaffPopup(null); setStaffAddOpen(false); setStaffSearch(""); void loadOt(); onStaffMoved?.(); };

  const defectOf = (nm: string | null | undefined) => nm ? defectByWorker[nm.trim().toLowerCase()] : undefined;
  // ค่าแรงผลิตของรายการร่าง = จำนวน × ค่าแรงต่อชิ้น (จากแผนกลุ่ม A)
  const lineLabor = (l: DispatchPlanLine) => (Number(l.qty) || 0) * (laborPerUnit[l.mo_no ?? ""] ?? 0);
  const woLabor = (w: WOLite) => (w.labor?.prod_actual || w.labor?.prod_plan || ((Number(w.qty) || 0) * (laborPerUnit[w.mo_no] ?? 0)));

  // จำนวนที่วางแผนไปแล้วต่อใบ (ในแผนนี้) → เหลือให้วางแผนได้อีกเท่าไร
  const draftedByMo = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) if (l.mo_no) m.set(l.mo_no, (m.get(l.mo_no) ?? 0) + (Number(l.qty) || 0));
    return m;
  }, [lines]);
  const availOf = (p: PendingLite) => Math.max(0, Math.round((p.remaining - (draftedByMo.get(p.mo_no) ?? 0)) * 100) / 100);
  // จำนวนที่จะจ่ายครั้งนี้ (แบ่งจ่าย) — ว่าง = จ่ายเต็มที่เหลือ · ไม่เกินที่เหลือ
  const dispQtyOf = (p: PendingLite) => {
    const raw = dispQty[p.mo_no]; const av = availOf(p);
    const n = raw === undefined || raw === "" ? av : Number(raw);
    return Math.max(0, Math.min(av, Number.isFinite(n) ? n : 0));
  };

  // ใบจ่ายงานจริง จัดกลุ่มตามแผนก (โชว์ล็อก)
  const realByDept = useMemo(() => {
    const m = new Map<string, WOLite[]>();
    for (const w of realWOs) { if (w.status === "done") continue; const k = w.department_id ?? ""; if (!k) continue; (m.get(k) ?? m.set(k, []).get(k)!).push(w); }
    return m;
  }, [realWOs]);
  const draftByDept = useMemo(() => {
    const m = new Map<string, DispatchPlanLine[]>();
    for (const l of lines) { const k = l.department_id ?? ""; (m.get(k) ?? m.set(k, []).get(k)!).push(l); }
    return m;
  }, [lines]);

  const addBusyRef = useRef(false);   // กันคลิกโต๊ะรัวๆ สร้างการ์ดร่างซ้ำระหว่างรอเน็ต
  const addLineFor = async (moNo: string, dept: DeptLite) => {
    if (!editable) return;
    const p = pending.find((x) => x.mo_no === moNo); if (!p) return;
    const qty = dispQtyOf(p);
    if (qty <= 0) { toast.info("ใส่จำนวนที่จะจ่ายก่อน (หรือใบนี้วางแผนครบแล้ว)"); return; }
    if (realMode) { onDispatch?.({ moId: p.id, deptId: dept.id, qty }); setDispQty((d) => { const n = { ...d }; delete n[moNo]; return n; }); setSelected(null); return; }   // ของจริง → เปิดหน้ายืนยันจ่าย
    try {
      const r = await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_line", line: { mo_no: p.mo_no, mo_id: p.id, product_sku: p.product_sku, product_name: p.product_name, qty, department_id: dept.id, department_name: dept.name } }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setLines((ls) => [...ls, j.data as DispatchPlanLine]);
      setDispQty((d) => { const n = { ...d }; delete n[moNo]; return n; });   // จ่ายแล้ว → รีเซ็ตช่อง (default = ที่เหลือใหม่)
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
  };
  const addLine = (dept: DeptLite) => {
    if (!selected || addBusyRef.current) return;   // addBusyRef กันแตะรัวซ้ำระหว่างรอเน็ต
    addBusyRef.current = true;
    // ไม่ล้าง selected → จ่ายแล้วการ์ดยังเลือกอยู่ จ่ายส่วนที่เหลือไปโต๊ะอื่นต่อได้ (แบ่งจ่าย)
    void addLineFor(selected, dept).finally(() => { addBusyRef.current = false; });
  };
  // ลากการ์ดร่างย้ายโต๊ะ
  const moveLine = async (lineId: string, dept: DeptLite) => {
    if (!editable) return;
    setLines((ls) => ls.map((l) => l.id === lineId ? { ...l, department_id: dept.id, department_name: dept.name, assignee_id: null, assignee_name: null } as DispatchPlanLine : l));
    try { await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_line", lineId, department_id: dept.id, department_name: dept.name }) }); }
    catch { void load(); }
  };
  // ลากการ์ด (HTML5) — เก็บข้อมูลว่ากำลังลากอะไร
  const dragRef = useRef<{ kind: "pending" | "draft" | "wo"; moNo: string; lineId?: string; woId?: string; fromDept?: string } | null>(null);
  const dropToDept = (dept: DeptLite) => {
    const d = dragRef.current; dragRef.current = null; if (!d) return;
    if (d.kind === "pending") void addLineFor(d.moNo, dept);
    else if (d.kind === "draft" && d.lineId) void moveLine(d.lineId, dept);
    else if (d.kind === "wo" && d.woId) void moveWO(d.woId, dept, null, d.fromDept);
  };

  /**
   * ลากใบจ่ายงานจริงข้ามโต๊ะ / เข้าช่างคนใดคนหนึ่ง (เดสก์ท็อปเท่านั้น)
   *  - ย้ายโต๊ะเฉย ๆ: ถ้าช่างเดิมไม่ได้อยู่โต๊ะปลายทาง → ล้างเป็น "ทั้งโต๊ะ" (กันชื่อช่างผิดโต๊ะ)
   *  - ลากทับหัวกลุ่มช่าง: ย้ายโต๊ะ + ตั้งช่างคนนั้นให้เลย
   */
  const moveWO = async (woId: string, dept: DeptLite, craft: CraftLite | null, fromDept?: string) => {
    if (!onUpdateWO) return;
    const w = realWOs.find((x) => x.id === woId);
    if (!w) return;
    if (fromDept === dept.id && !craft) return;                       // โต๊ะเดิม + ไม่ได้ระบุช่าง = ไม่ต้องทำอะไร
    const patch: Parameters<NonNullable<typeof onUpdateWO>>[1] = { department_id: dept.id, department_name: dept.name };
    if (craft) {
      patch.assignee_type = "craftsman"; patch.assignee_id = craft.id; patch.assignee_name = craft.name;
      patch.assignees = [{ id: craft.id, name: craft.name }];
    } else if (fromDept !== dept.id) {
      // ย้ายข้ามโต๊ะ: ช่างเดิมยังอยู่โต๊ะปลายทางไหม (โต๊ะช่างเหมารับได้ทุกคน)
      const keep = /เหมา/.test(dept.name) || craftsmen.some((c) => c.name === w.assignee_name && c.department_id === dept.id);
      if (!keep) { patch.assignee_type = "department"; patch.assignee_id = null; patch.assignee_name = dept.name; patch.assignees = []; }
    }
    try {
      await onUpdateWO(woId, patch, true);
      toast.success(craft ? `ย้าย ${w.product_sku ?? "งาน"} → ${dept.name} · ${craft.name}` : `ย้าย ${w.product_sku ?? "งาน"} → ${dept.name}`);
    } catch { /* parent toast */ }
  };
  // ลากสลับคอลัมน์แผนก (C4)
  const deptDragRef = useRef<string | null>(null);
  const reorderDept = (targetId: string) => {
    const src = deptDragRef.current; deptDragRef.current = null;
    if (!src || src === targetId || !onReorderDepts) return;
    const ids = departments.map((d) => d.id);
    const from = ids.indexOf(src), to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    onReorderDepts(ids);
  };
  const removeLine = async (lineId: string) => {
    if (!editable) return;
    setLines((ls) => ls.filter((l) => l.id !== lineId));
    try { await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove_line", lineId }) }); }
    catch { void load(); }
  };
  const updateLine = async (lineId: string, patch: { qty?: number; assignee_id?: string | null; assignee_name?: string | null }) => {
    setLines((ls) => ls.map((l) => l.id === lineId ? { ...l, ...patch } as DispatchPlanLine : l));
    try { await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_line", lineId, ...patch }) }); }
    catch { void load(); }
  };
  const saveName = async () => {
    const nm = name.trim() || "แผนไม่มีชื่อ";
    try { await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rename", name: nm }) }); onRenamed(nm); }
    catch { /* ignore */ }
  };
  const saveDates = async () => {
    const s = sDate || null, e = eDate || null;
    try { await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rename", start_date: s, end_date: e }) }); onDates(s, e); }
    catch { /* ignore */ }
  };
  const doApply = async () => {
    setApplying(true);
    try { const r = await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply" }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success(`ดันเป็นของจริงแล้ว: สร้างใบจ่ายงาน ${j.data?.applied ?? 0} ใบ`); setConfirmApply(false); onApplied();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ดันไม่สำเร็จ"); }
    finally { setApplying(false); }
  };
  const deletePlan = async () => {
    try { await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "DELETE" }); toast.success("ลบแผนแล้ว"); onDeleted(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  const deptCraftsmen = (dept: DeptLite) => /เหมา/.test(dept.name) ? craftsmen : craftsmen.filter((c) => c.department_id === dept.id);
  // ค้นหา/กรองกลุ่ม/กรองแบรนด์ — ใช้กับทั้งช่องรอจ่ายและการ์ดในโต๊ะ (ของจริง + ร่าง)
  const sq = boardSearch.trim().toLowerCase();
  const hitText = (...vals: (string | null | undefined)[]) => !sq || vals.some((v) => (v ?? "").toLowerCase().includes(sq));
  // แบรนด์ต่อใบสั่งผลิต (การ์ดร่างไม่มีฟิลด์แบรนด์ → ยืมจากใบรอจ่าย/ใบจ่ายงานจริงที่ mo_no เดียวกัน)
  const brandByMo = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pending) if (p.brand) m.set(p.mo_no, p.brand);
    for (const w of realWOs) if (w.brand && !m.has(w.mo_no)) m.set(w.mo_no, w.brand);
    return m;
  }, [pending, realWOs]);
  const brandOptions = useMemo(() => [...new Set([...brandByMo.values()])].sort((a, b) => a.localeCompare(b, "th")), [brandByMo]);
  const inBrand = (moNo: string | null | undefined) => brandFilter === "__all__" ? true
    : brandFilter === "__none__" ? !brandByMo.get(moNo ?? "") : brandByMo.get(moNo ?? "") === brandFilter;
  const visiblePending = pending.filter((p) => availOf(p) > 0 && inGroupTab(p.mo_no) && inBrand(p.mo_no) && hitText(p.product_sku, p.product_name, p.mo_no));
  const showWO = (w: WOLite) => inGroupTab(w.mo_no) && inBrand(w.mo_no) && hitText(w.product_sku, w.product_name, w.mo_no, w.assignee_name);
  const showLine = (l: DispatchPlanLine) => inGroupTab(l.mo_no ?? "") && inBrand(l.mo_no) && hitText(l.product_sku, l.product_name, l.mo_no, l.assignee_name);
  // โหมดแท็บเล็ต: โฟกัสทีละโต๊ะ → เห็น 2 ช่อง (รอจ่าย + โต๊ะที่เลือก) ลดการเลื่อนหาคอลัมน์
  const focusedId = tablet ? (departments.some((d) => d.id === focusDept) ? focusDept : departments[0]?.id ?? null) : null;
  const shownDepts = tablet ? departments.filter((d) => d.id === focusedId) : departments;
  const draftCountOf = (id: string) => (draftByDept.get(id) ?? []).length;

  // การ์ดร่าง 1 ใบ (แยกไว้เพื่อจัดกลุ่มตามช่างได้)
  const draftCard = (l: DispatchPlanLine, d: DeptLite) => {
    const opts = deptCraftsmen(d);
    return (
      <CardShell key={l.id} accent="#1d9e75" thumbUrl={imageByMo[l.mo_no ?? ""]} sku={l.product_sku}
        drag={editable ? <span draggable onDragStart={(e) => { e.stopPropagation(); dragRef.current = { kind: "draft", moNo: l.mo_no ?? "", lineId: l.id }; deptDragRef.current = null; }} title="ลากย้ายโต๊ะ" className="shrink-0 cursor-move text-emerald-500 hover:text-emerald-700 select-none">⠿</span> : null}
        actions={<>
          <button onClick={(e) => { e.stopPropagation(); onOpenWork({ moId: l.mo_id, moNo: l.mo_no, productSku: l.product_sku, productName: l.product_name, qty: Number(l.qty) || 0 }); }} title="ดูรายละเอียดงาน" className="-m-1 p-1 text-slate-400 hover:text-blue-600 text-xs">📋</button>
          <span className="text-[10px] px-1 rounded text-emerald-700 border border-emerald-300" title="ร่าง (ยังไม่จ่ายจริง)">ร่าง</span>
          {editable && <button onClick={(e) => { e.stopPropagation(); removeLine(l.id); }} className="-m-1 p-1 text-rose-400 hover:text-rose-600 text-xs" title="เอาออก">✕</button>}
        </>}>
        {(() => {
          const wl = lineLabor(l);
          const editing = laborEditId === l.id;
          const canRate = editable && !!onSetCentralRate;
          return <>
            {/* ค่าแรง: มีค่าแล้ว→ข้อความ · ยังไม่มี→ปุ่ม "ใส่ค่าแรง" (เหมือนการ์ดของจริง) → ตั้งเรตกลางสินค้า */}
            {wl > 0 && !editing && (
              <div className="text-[10px] mt-0.5 text-slate-400">ค่าแรงผลิต {baht(wl)} ({fmt(Number(l.qty) || 0)} × {baht(laborPerUnit[l.mo_no ?? ""] ?? 0)})</div>
            )}
            {canRate && wl <= 0 && !editing && (
              <button onClick={(e) => { e.stopPropagation(); setLaborEditId(l.id); setLaborEditVal(""); }}
                className="mt-1 text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100">💰 ใส่ค่าแรง</button>
            )}
            {canRate && editing && (
              <div className="mt-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <input type="number" min={0} step="any" autoFocus value={laborEditVal} onChange={(e) => setLaborEditVal(e.target.value)} placeholder="บาท/ชิ้น"
                  className="w-20 h-7 px-1.5 text-xs text-right border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400" />
                <span className="text-[10px] text-slate-400 shrink-0">/ชิ้น (เรตกลาง)</span>
                <button disabled={laborSaving} title="บันทึก" onClick={async () => {
                  setLaborSaving(true);
                  try { await onSetCentralRate!({ moNo: l.mo_no ?? "", rate: Number(laborEditVal) || 0 }); setLaborEditId(null); }
                  catch { /* parent toast */ } finally { setLaborSaving(false); }
                }} className="h-7 px-2 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50">✓</button>
                <button title="ยกเลิก" onClick={() => setLaborEditId(null)} className="h-7 px-1.5 text-xs text-slate-400 hover:text-slate-600">✕</button>
              </div>
            )}
          </>;
        })()}
        <div className="flex items-center gap-1.5 mt-1">
          <input type="number" min={0} step="any" value={Number(l.qty) || 0} disabled={!editable}
            onChange={(e) => updateLine(l.id, { qty: Number(e.target.value) })}
            className="w-14 h-6 px-1 text-xs text-right border border-slate-200 rounded" />
          <span className="text-[10px] text-slate-400">ชิ้น</span>
          {/* เลือกช่าง — ใช้ป๊อปตัวเดียวกับใบงานจริง (ค้นหาได้ + แยกกลุ่มตามแผนก) */}
          {opts.length > 0 && (
            editable ? (
              <button type="button" onClick={(e) => { e.stopPropagation(); openAssignLine(l, d); }}
                title="เลือกช่างของรายการนี้"
                className="flex-1 h-6 px-1.5 text-[11px] border border-slate-200 rounded min-w-0 text-left text-slate-600 bg-white hover:border-violet-300 hover:text-violet-700 truncate">
                👤 {l.assignee_name || "ทั้งโต๊ะ"} <span className="text-slate-300">✎</span>
              </button>
            ) : <span className="flex-1 text-[11px] text-slate-500 truncate">👤 {l.assignee_name || "ทั้งโต๊ะ"}</span>
          )}
        </div>
        {(() => { const df = defectOf(l.assignee_name); return df ? <div className="text-[10px] text-amber-600 mt-0.5">⚠️ ช่างนี้เคยมีงานเสีย {df.count} ครั้ง</div> : null; })()}
      </CardShell>
    );
  };

  return (
    <div className="space-y-3">
      {/* แถบเครื่องมือของแผน */}
      <div className="flex items-center gap-2 flex-wrap bg-white border border-slate-200 rounded-xl px-3 py-2">
        {realMode ? <span className="text-sm font-semibold text-slate-700">📋 จ่ายงานจริง</span> : <>
          <span className="text-[11px] text-slate-400">ชื่อแผน</span>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} disabled={!editable}
            className="h-8 px-2 text-sm border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
          <span className="text-[11px] text-slate-400 ml-1">เริ่ม</span>
          <input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} onBlur={saveDates} disabled={!editable}
            className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
          <span className="text-[11px] text-slate-400">เสร็จ</span>
          <input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} onBlur={saveDates} disabled={!editable}
            className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
          {applied && <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">ดันเป็นของจริงแล้ว</span>}
        </>}
        <div className="flex-1" />
        {!tablet && (
          <div className="flex items-center gap-1.5" title="ปรับความกว้างของโต๊ะ — กว้างขึ้นรหัสจะอยู่บรรทัดเดียว">
            <span className="text-[11px] text-slate-400">↔ กว้างโต๊ะ</span>
            <input type="range" min={180} max={480} step={10} value={colW} onChange={(e) => setColWidth(Number(e.target.value))} className="w-28 accent-indigo-600" />
          </div>
        )}
        {onManageDepts && <button onClick={onManageDepts} className="h-8 px-3 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">⚙️ จัดการโต๊ะ</button>}
        {!realMode && editable && <button onClick={() => setConfirmApply(true)} disabled={lines.length === 0}
          className="h-8 px-3 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">🚀 ดันเป็นของจริง</button>}
        {!realMode && <button onClick={deletePlan} className="h-8 px-2.5 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50">ลบแผน</button>}
      </div>

      {/* คำอธิบายสัญลักษณ์ */}
      <div className="flex gap-4 flex-wrap text-[11px] text-slate-500">
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm border border-slate-300 align-[-1px]" /> รอจ่าย</span>
        {!realMode && <span><span className="inline-block w-2.5 h-2.5 rounded-sm align-[-1px]" style={{ border: "1.5px dashed #1d9e75" }} /> ร่าง (ทดลอง)</span>}
        <span>{realMode ? "📋 จ่ายจริงแล้ว" : "🔒 จ่ายจริง (ล็อก)"}</span>
        {editable && <span className="text-indigo-500">{realMode ? "แตะการ์ดรอจ่าย → แตะที่โต๊ะ → ยืนยันจ่ายจริง" : tablet ? "แตะการ์ดรอจ่าย → แตะที่โต๊ะเพื่อจ่าย (ไม่ต้องลาก)" : "กดการ์ดรอจ่าย → กดที่โต๊ะเพื่อจ่ายแบบร่าง"}</span>}
      </div>

      {/* แท็บเล็ต: แถบชิปเลือกโต๊ะที่จะโฟกัส */}
      {tablet && departments.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <span className="text-sm text-slate-400 shrink-0">โต๊ะ:</span>
          {departments.map((d) => {
            const on = d.id === focusedId; const n = draftCountOf(d.id);
            return (
              <button key={d.id} type="button" onClick={() => setFocusDept(d.id)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium border ${on ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                {d.name}{n > 0 && <span className={`ml-1.5 text-[11px] ${on ? "text-indigo-100" : "text-slate-400"}`}>({n})</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* 🔍 ค้นหา + กรองกลุ่มงาน — มีผลทั้งช่องรอจ่ายและการ์ดในทุกโต๊ะ */}
      {!loading && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <input value={boardSearch} onChange={(e) => setBoardSearch(e.target.value)} placeholder="🔍 ค้นหา รหัสสินค้า / ชื่อ / เลขใบสั่งผลิต / ช่าง…"
            className="h-8 px-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[240px] flex-1 max-w-md" />
          {boardSearch && <button onClick={() => setBoardSearch("")} className="h-8 px-2 text-[11px] text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg bg-white">✕ ล้างคำค้น</button>}
          {moGroups.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {([["__all__", "🗂 ทุกกลุ่ม"], ...moGroups.map((g) => [g.name, g.name] as [string, string]), ["__none__", "ยังไม่จับกลุ่ม"]] as [string, string][]).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setGroupTab(key)}
                  className={`text-[11px] px-2 py-1 rounded-full border ${groupTab === key ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>{label}</button>
              ))}
            </div>
          )}
          {brandOptions.length > 0 && (
            <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} title="กรองตามแบรนด์"
              className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="__all__">🏷 ทุกแบรนด์</option>
              {brandOptions.map((b) => <option key={b} value={b}>{b}</option>)}
              <option value="__none__">— ไม่ระบุแบรนด์ —</option>
            </select>
          )}
          {(boardSearch || groupTab !== "__all__" || brandFilter !== "__all__") && (
            <span className="text-[11px] text-violet-600">กำลังกรองอยู่ — ตัวเลขบนหัวโต๊ะนับเฉพาะที่เห็น</span>
          )}
        </div>
      )}

      {loading ? <div className="text-center py-10 text-slate-400 text-sm">กำลังโหลดแผน…</div> : (
        <div className={tablet ? "grid gap-2.5" : "flex gap-2.5 overflow-x-auto items-start pb-1 board-scroll scrollbar-hide"}
          style={tablet ? { gridTemplateColumns: "1fr 1fr" } : undefined}>
          {/* คอลัมน์รอจ่าย */}
          <div className={`rounded-xl border border-slate-200 bg-slate-50/60 p-2 min-h-[140px] ${tablet ? "" : "overflow-y-auto scrollbar-hide shrink-0"}`}
            style={tablet ? undefined : { flexBasis: colW, width: colW, maxHeight: "calc(100vh - 240px)" }}
            onDragOver={(e) => { if (editable && dragRef.current?.kind === "draft") e.preventDefault(); }}
            onDrop={() => { if (!editable) return; const d = dragRef.current; dragRef.current = null; if (d?.kind === "draft" && d.lineId) void removeLine(d.lineId); }}>
            <div className="sticky top-0 z-20 flex items-center justify-between -mx-2 -mt-2 px-2 pt-2 pb-2 mb-2 bg-slate-100 rounded-t-xl border-b border-slate-200">
              <span className="text-sm font-bold text-slate-700">📥 รอจ่าย</span>
              <span className="flex items-center gap-1">
                <span className="text-[11px] text-slate-400">{visiblePending.length}</span>
                {/* ขยายดูเป็นรายการ — คอลัมน์ยาว เลื่อนหายาก */}
                <button onClick={(e) => { e.stopPropagation(); setListPopup({ kind: "pending" }); }} title="ขยายดูรายการทั้งหมดในช่องนี้"
                  className="text-slate-300 hover:text-indigo-600 text-[13px] leading-none">⛶</button>
              </span>
            </div>
            {visiblePending.map((p) => {
              const on = selected === p.mo_no;
              return (
                <div key={p.id}
                  onClick={() => { if (!editable) return; if (tablet && on && onPickDispatch) { onPickDispatch(p.mo_no, Number(dispQty[p.mo_no] ?? availOf(p)) || availOf(p)); } else { setSelected(on ? null : p.mo_no); } }}
                  className={`rounded-lg px-2 py-1.5 mb-1.5 bg-white ${on ? "ring-2 ring-indigo-400 border-indigo-300" : "border border-slate-200"} ${editable ? "cursor-pointer hover:bg-slate-50" : ""}`}>
                  <div className="flex items-center gap-1.5">
                    {editable && <span draggable onDragStart={(e) => { e.stopPropagation(); dragRef.current = { kind: "pending", moNo: p.mo_no }; }} onClick={(e) => e.stopPropagation()} title="ลากไปวางที่โต๊ะ" className="shrink-0 cursor-move text-slate-300 hover:text-slate-500 select-none">⠿</span>}
                    <Thumb url={p.image_url} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800 truncate">{p.product_sku}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 min-w-0">
                        <span className="truncate">{p.mo_no}</span>
                        {(laborPerUnit[p.mo_no] ?? 0) > 0
                          ? <span className="shrink-0">· ค่าแรง {baht(laborPerUnit[p.mo_no] ?? 0)}/ชิ้น</span>
                          : (editable && onSetCentralRate && laborEditId !== p.id)
                            ? <button onClick={(e) => { e.stopPropagation(); setLaborEditId(p.id); setLaborEditVal(""); }} className="shrink-0 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100">💰 ใส่ค่าแรง</button>
                            : <span className="shrink-0">· ค่าแรง ฿0/ชิ้น</span>}
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onOpenWork({ moId: p.id, moNo: p.mo_no, productSku: p.product_sku, productName: p.product_name, qty: p.qty }); }} title="ดูรายละเอียดงาน" className="shrink-0 -m-1 p-1 text-slate-300 hover:text-blue-600">📋</button>
                  </div>
                  {/* ใส่ค่าแรงกลาง (เมื่อยังไม่มีเรตกลาง) */}
                  {editable && onSetCentralRate && laborEditId === p.id && (
                    <div className="mt-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input type="number" min={0} step="any" autoFocus value={laborEditVal} onChange={(e) => setLaborEditVal(e.target.value)} placeholder="บาท/ชิ้น"
                        className="w-20 h-7 px-1.5 text-xs text-right border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400" />
                      <span className="text-[10px] text-slate-400 shrink-0">/ชิ้น (เรตกลาง)</span>
                      <button disabled={laborSaving} onClick={async () => { setLaborSaving(true); try { await onSetCentralRate!({ moNo: p.mo_no, rate: Number(laborEditVal) || 0 }); setLaborEditId(null); } catch { /* parent toast */ } finally { setLaborSaving(false); } }} className="h-7 px-2 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50">✓</button>
                      <button onClick={() => setLaborEditId(null)} className="h-7 px-1.5 text-xs text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                  )}
                  {/* จำนวนที่เหลือต้องจ่าย + สถานะความพร้อม */}
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700">เหลือจ่าย <b className="text-base font-bold tabular-nums">{fmt(availOf(p))}</b> ชิ้น</span>
                    {(() => { const rdy = p.ready ?? (!!p.prep_done && !!p.cut_done); return <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${rdy ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{rdy ? "✓ พร้อมจ่าย" : "⏳ รอเตรียม/ตัด"}</span>; })()}
                    {!on && editable && <span className="ml-auto text-[10px] text-slate-300">แตะเพื่อจ่าย</span>}
                  </div>
                  {/* แบ่งจ่าย — ระบุจำนวนแล้วแตะโต๊ะ (จ่ายส่วนที่เหลือไปโต๊ะอื่นต่อได้) */}
                  {on && editable && (
                    <div className="mt-1.5 flex items-center gap-1.5 bg-indigo-50/70 border border-indigo-100 rounded-lg px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[11px] font-medium text-indigo-700 shrink-0">✂️ แบ่งจ่าย</span>
                      <input type="number" min={0} max={availOf(p)} step="any"
                        value={dispQty[p.mo_no] ?? String(availOf(p))}
                        onChange={(e) => setDispQty((d) => ({ ...d, [p.mo_no]: e.target.value }))}
                        className="w-16 h-7 px-1.5 text-sm text-right border border-indigo-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                      <span className="text-[11px] text-slate-500 shrink-0">ชิ้น</span>
                      {tablet && onPickDispatch
                        ? <button onClick={(e) => { e.stopPropagation(); onPickDispatch(p.mo_no, Number(dispQty[p.mo_no] ?? availOf(p)) || availOf(p)); }}
                            className="ml-auto shrink-0 h-7 px-2.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">📋 เลือกโต๊ะจ่าย →</button>
                        : <span className="text-[10px] text-indigo-500 ml-auto shrink-0">→ แตะโต๊ะ</span>}
                    </div>
                  )}
                </div>
              );
            })}
            {visiblePending.length === 0 && <div className="text-center text-[11px] text-slate-300 py-3">— ไม่มีใบในกลุ่มนี้ —</div>}
            {/* งานเหมารายชิ้นที่ติ๊กไว้ → รอจ่ายให้ช่างเหมา (เฟส 1: แสดง · เฟส 2: ลากจ่าย) */}
            {(pendingPiece ?? []).length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-100">
                <div className="text-[11px] font-semibold text-violet-600 mb-1.5 px-0.5">🧵 งานเหมารอจ่าย ({(pendingPiece ?? []).length})</div>
                {(pendingPiece ?? []).map((p) => (
                  <div key={p.id} onClick={() => editable && onPieceClick?.(p)}
                    className={`rounded-lg px-2 py-1.5 mb-1.5 bg-violet-50/40 border border-violet-100 ${editable && onPieceClick ? "cursor-pointer hover:bg-violet-50" : ""}`} style={{ borderLeft: "3px solid #7c3aed" }}>
                    <div className="flex items-center gap-2">
                      <Thumb url={p.image_url} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-700 truncate">🧵 {p.job_name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{p.product_sku} · {p.mo_no}</div>
                        <div className="text-[11px] text-violet-700 mt-0.5">{fmt(p.qty)} ชิ้น · ฿{fmt(p.rate)}/ชิ้น · รวม <b>฿{fmt(p.qty * p.rate)}</b></div>
                      </div>
                      {editable && onPieceClick && <span className="text-[10px] text-violet-500 shrink-0">แตะจ่าย →</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* คอลัมน์แผนก (แท็บเล็ต = เฉพาะโต๊ะที่โฟกัส) */}
          {shownDepts.map((d) => {
            const reals = (realByDept.get(d.id) ?? []).filter(showWO);
            const drafts = (draftByDept.get(d.id) ?? []).filter(showLine);
            const totQty = drafts.reduce((a, l) => a + (Number(l.qty) || 0), 0) + reals.reduce((a, w) => a + (Number(w.qty) || 0), 0);
            const totLabor = drafts.reduce((a, l) => a + lineLabor(l), 0) + reals.reduce((a, w) => a + woLabor(w), 0);
            const canDrop = editable && !!selected;
            return (
              <div key={d.id} onClick={() => canDrop && addLine(d)}
                onDragOver={(e) => { if (editable) e.preventDefault(); }} onDrop={() => editable && dropToDept(d)}
                className={`rounded-xl border p-2 min-h-[140px] ${tablet ? "" : "overflow-y-auto scrollbar-hide shrink-0"} ${canDrop ? "border-dashed border-indigo-300 bg-indigo-50/30 cursor-pointer" : "border-slate-200 bg-white"}`}
                style={tablet ? undefined : { flexBasis: colW, width: colW, maxHeight: "calc(100vh - 240px)" }}>
                {/* หัวโต๊ะ: ชื่ออยู่บรรทัดบน (ไม่ตัดคำ) · ตัวเลขเงินอยู่บรรทัดล่าง */}
                <div className="sticky top-0 z-20 -mx-2 -mt-2 px-2 pt-2 pb-2 mb-1.5 bg-white rounded-t-xl border-b border-slate-100"
                  onDragOver={(e) => { if (onReorderDepts && deptDragRef.current) e.preventDefault(); }}
                  onDrop={(e) => { if (deptDragRef.current) { e.stopPropagation(); reorderDept(d.id); } }}>
                  <div className="flex items-start gap-1">
                    {onReorderDepts && <span draggable onDragStart={(e) => { e.stopPropagation(); deptDragRef.current = d.id; dragRef.current = null; }} title="ลากสลับตำแหน่งโต๊ะ" className="shrink-0 cursor-move text-slate-300 hover:text-slate-500 select-none leading-5">⠿</span>}
                    <span className={`font-bold text-slate-700 flex-1 break-words ${tablet ? "text-lg" : "text-sm"}`}>{d.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); setStaffPopup(d); }} title="พนักงานในโต๊ะนี้ (ย้ายคน + ตั้ง OT)" className={`shrink-0 text-slate-300 hover:text-violet-600 leading-5 ${tablet ? "text-sm" : "text-[11px]"}`}>👥</button>
                    {/* ขยายดูงานในโต๊ะนี้เป็นรายการ (คอลัมน์ยาว เลื่อนดูยาก) */}
                    <button onClick={(e) => { e.stopPropagation(); setListPopup({ kind: "dept", dept: d }); }} title="ขยายดูรายการงานในโต๊ะนี้"
                      className={`shrink-0 text-slate-300 hover:text-indigo-600 leading-5 ${tablet ? "text-sm" : "text-[11px]"}`}>⛶</button>
                  </div>
                  <span className={`block text-right leading-tight mt-0.5 ${tablet ? "text-[13px]" : "text-[10px]"}`}>
                    {(deptWages[d.id] ?? 0) > 0 && (
                      <span className="block text-violet-600" title={`เงินเดือนรวมพนักงานในโต๊ะ${(otByDept[d.id] ?? 0) > 0 ? ` + OT ที่วางแผนไว้ ${baht(otByDept[d.id])}` : ""}`}>
                        คน {baht((deptWages[d.id] ?? 0) + (otByDept[d.id] ?? 0))}
                        {(otByDept[d.id] ?? 0) > 0 && <span className="text-amber-600"> (รวม OT {baht(otByDept[d.id])})</span>}
                      </span>
                    )}
                    {(deptWages[d.id] ?? 0) === 0 && (otByDept[d.id] ?? 0) > 0 && <span className="block text-amber-600" title="OT ที่วางแผนไว้">OT {baht(otByDept[d.id])}</span>}
                    {totQty > 0 && <span className="block text-slate-500" title="ค่าแรงงานที่จ่ายในโต๊ะนี้">งาน {fmt(totQty)} ชิ้น · {baht(totLabor)}</span>}
                    {((deptWages[d.id] ?? 0) + (otByDept[d.id] ?? 0)) > 0 && totLabor > 0 && (() => {
                      const diff = (deptWages[d.id] ?? 0) + (otByDept[d.id] ?? 0) - totLabor;
                      return <span className={`block ${diff >= 0 ? "text-amber-600" : "text-rose-600"}`} title="(เงินเดือน + OT) − ค่าแรงงานที่จ่าย">ต่าง {baht(diff)}</span>;
                    })()}
                  </span>
                </div>
                {/* ใบจ่ายจริง — จัดกลุ่มตามช่างที่เลือก (ถ้ามี) · ในแผน "ล็อก" · ในของจริง "แก้ได้" */}
                {(() => {
                  const byWorker = new Map<string, WOLite[]>();
                  for (const x of reals) { const k = x.assignee_name || ""; (byWorker.get(k) ?? byWorker.set(k, []).get(k)!).push(x); }
                  const showHeads = byWorker.size > 1 || [...byWorker.keys()].some((k) => k);   // หลายช่าง หรือมีระบุช่าง → จับกลุ่มตามช่าง
                  return [...byWorker.entries()].map(([worker, ws]) => (
                  <div key={"rw:" + (worker || "__none__")}>
                    {showHeads && (
                      <div
                        onDragOver={(e) => { if (realMode && editable && !tablet && dragRef.current?.kind === "wo") { e.preventDefault(); e.stopPropagation(); } }}
                        onDrop={(e) => {
                          if (!(realMode && editable && !tablet)) return;
                          const dr = dragRef.current;
                          if (dr?.kind !== "wo" || !dr.woId) return;
                          e.stopPropagation(); dragRef.current = null;
                          const craft = craftsmen.find((c) => c.name === worker) ?? null;
                          void moveWO(dr.woId, d, craft, dr.fromDept);
                        }}
                        title={realMode && editable && !tablet ? "ลากการ์ดมาวางตรงนี้ = ย้ายงานเข้าช่างคนนี้" : undefined}
                        className="flex items-center justify-between text-[10px] font-medium mt-1 mb-0.5 px-0.5 text-violet-700 rounded hover:bg-violet-50">
                        <span className="truncate">👤 {worker || "ทั้งโต๊ะ (ไม่ระบุช่าง)"}</span>
                        <span className="text-slate-400 shrink-0">{fmt(ws.reduce((a, x) => a + (Number(x.qty) || 0), 0))} ชิ้น · {baht(ws.reduce((a, x) => a + woLabor(x), 0))}</span>
                      </div>
                    )}
                    {ws.map((w) => {
                  const wl = woLabor(w);
                  const wlRate = w.qty > 0 ? wl / w.qty : 0;   // เรตต่อชิ้น (ยอดรวม ÷ จำนวน) — โชว์ที่มาของยอด
                  const canEditWO = realMode && editable && !!onUpdateWO;
                  const editing = laborEditId === w.id;
                  return (
                  <CardShell key={w.id} dim={!realMode} thumbUrl={w.image_url} sku={w.product_sku}
                    drag={canEditWO && !tablet ? (
                      <span draggable
                        onDragStart={(e) => { e.stopPropagation(); dragRef.current = { kind: "wo", moNo: w.mo_no, woId: w.id, fromDept: d.id }; deptDragRef.current = null; }}
                        onClick={(e) => e.stopPropagation()}
                        title="ลากย้ายโต๊ะ · ลากไปวางที่ชื่อช่างเพื่อย้ายเข้าช่างคนนั้น"
                        className="shrink-0 cursor-move text-slate-300 hover:text-indigo-600 select-none">⠿</span>
                    ) : null}
                    actions={<>
                      <button onClick={(e) => { e.stopPropagation(); onOpenWork({ moId: w.mo_id ?? null, moNo: w.mo_no, productSku: w.product_sku, productName: w.product_name, qty: w.qty }); }} title="ดูรายละเอียดงาน" className="text-slate-400 hover:text-blue-600 text-xs">📋</button>
                      {/* X: ย้อนการ์ดกลับ "รอจ่าย" (เฉพาะของจริง + ยังไม่ส่งงานคืน) — กด 1 ครั้ง = ติดอาวุธ, ยืนยันด้านล่าง */}
                      {realMode && editable && onCancelWO && w.status !== "partial_return" && (
                        <button onClick={(e) => { e.stopPropagation(); setCancelArmId((id) => id === w.id ? null : w.id); }} title="ย้อนกลับไปรอจ่าย" className="text-slate-300 hover:text-rose-600 text-xs">✕</button>
                      )}
                      {!realMode && <span className="text-slate-400" title="จ่ายจริงแล้ว — ในแผนดูอย่างเดียว">🔒</span>}
                    </>}>
                    <div className="text-[11px] text-slate-400 truncate">
                      {/* #3: เลือกช่างหลายคน (เฉพาะของจริง) — กดที่ชื่อเพื่อเลือก */}
                      {canEditWO
                        ? <button onClick={(e) => { e.stopPropagation(); openAssign(w, d); }} className="text-violet-600 hover:underline font-medium">👤 {w.assignee_name || "เลือกช่าง"} ✎</button>
                        : <span>{w.assignee_name ?? "—"}</span>}
                      {" · "}{fmt(w.qty)} ชิ้น
                    </div>
                    {/* ค่าแรงรวม (ยอดรวม = จำนวน × เรต) — โชว์ที่สินค้าให้ชัด ไม่ใช่แค่เรตต่อชิ้น */}
                    {wl > 0 && (
                      <div className="text-[11px] text-emerald-700 font-medium truncate">💰 ค่าแรงรวม {baht(wl)} <span className="text-slate-400 font-normal">({fmt(w.qty)} × ฿{fmt(wlRate)})</span></div>
                    )}
                    {/* #2: ใส่ค่าแรง (เฉพาะของจริง + การ์ดที่ยังไม่มีค่าแรง) — กดง่าย */}
                    {canEditWO && wl <= 0 && !editing && (
                      <button onClick={(e) => { e.stopPropagation(); setLaborEditId(w.id); setLaborEditVal(""); }}
                        className="mt-1 text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100">💰 ใส่ค่าแรง</button>
                    )}
                    {canEditWO && editing && (
                      <div className="mt-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input type="number" min={0} step="any" autoFocus value={laborEditVal} onChange={(e) => setLaborEditVal(e.target.value)} placeholder="บาท/ชิ้น"
                          className="w-20 h-7 px-1.5 text-xs text-right border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400" />
                        <span className="text-[10px] text-slate-400 shrink-0">× {fmt(w.qty)} = ฿{fmt((Number(laborEditVal) || 0) * (Number(w.qty) || 0))}</span>
                        <button disabled={laborSaving} title="บันทึก" onClick={async () => {
                          setLaborSaving(true);
                          try { await onUpdateWO!(w.id, { labor_cost: (Number(laborEditVal) || 0) * (Number(w.qty) || 0) }); setLaborEditId(null); }
                          catch { /* parent toast */ } finally { setLaborSaving(false); }
                        }} className="h-7 px-2 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50">✓</button>
                        <button title="ยกเลิก" onClick={() => setLaborEditId(null)} className="h-7 px-1.5 text-xs text-slate-400 hover:text-slate-600">✕</button>
                      </div>
                    )}
                    {/* ยืนยันย้อนกลับไปรอจ่าย */}
                    {cancelArmId === w.id && (
                      <div className="mt-1 flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-1.5 py-1" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[11px] text-rose-700 flex-1">ย้อนใบนี้กลับ “รอจ่าย”?</span>
                        <button disabled={cancelSaving} onClick={async () => {
                          setCancelSaving(true);
                          try { await onCancelWO!(w.id); setCancelArmId(null); }
                          catch { /* parent toast */ } finally { setCancelSaving(false); }
                        }} className="h-7 px-2 text-xs bg-rose-600 text-white rounded hover:bg-rose-700 disabled:opacity-50">↩ ย้อนกลับ</button>
                        <button title="ไม่ย้อน" onClick={() => setCancelArmId(null)} className="h-7 px-1.5 text-xs text-slate-400 hover:text-slate-600">✕</button>
                      </div>
                    )}
                  </CardShell>
                  );
                    })}
                  </div>
                  ));
                })()}
                {/* รายการร่าง — จัดกลุ่มย่อยตามช่าง */}
                {(() => {
                  const byCraft = new Map<string, DispatchPlanLine[]>();
                  for (const l of drafts) { const k = l.assignee_name || ""; (byCraft.get(k) ?? byCraft.set(k, []).get(k)!).push(l); }
                  const showHeads = byCraft.size > 1 || [...byCraft.keys()].some((k) => k);   // มีหลายช่าง หรือมีระบุช่าง → โชว์หัวกลุ่มช่าง
                  return [...byCraft.entries()].map(([craft, ls]) => (
                    <div key={craft || "__none__"}>
                      {showHeads && (
                        <div className="flex items-center justify-between text-[10px] font-medium mt-1 mb-0.5 px-0.5" style={{ color: "#0f6e56" }}>
                          <span className="truncate">👤 {craft || "ทั้งโต๊ะ (ไม่ระบุช่าง)"}</span>
                          <span className="text-slate-400 shrink-0">{fmt(ls.reduce((a, l) => a + (Number(l.qty) || 0), 0))} ชิ้น · {baht(ls.reduce((a, l) => a + lineLabor(l), 0))}</span>
                        </div>
                      )}
                      {ls.map((l) => draftCard(l, d))}
                    </div>
                  ));
                })()}
                {reals.length === 0 && drafts.length === 0 && <div className="text-center text-[11px] text-slate-300 py-3">{canDrop ? "กดเพื่อจ่าย (ร่าง)" : "—"}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* #3: เลือกช่างหลายคน (multi-pick) ให้ใบงานจริง */}
      {assignPopup && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" onClick={() => setAssignPopup(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-xs w-full p-4 max-h-[75vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-slate-800 truncate">👤 เลือกช่าง{assignPopup.line ? "" : " (เลือกได้หลายคน)"}</h3>
              <button onClick={() => setAssignPopup(null)} className="text-slate-400 hover:text-slate-600 shrink-0">✕</button>
            </div>
            <div className="text-[11px] text-slate-400 mb-1.5">{assignPopup.dept.name} · {assignPopup.line ? "รายการร่าง — เลือกได้ 1 คน" : `เลือกแล้ว ${assignSel.size} คน`}</div>
            {/* ค้นหาช่าง — ช่างเหมามีหลายสิบคน เลื่อนหายาก */}
            <input autoFocus value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} placeholder="ค้นหา ชื่อ / รหัสพนักงาน…"
              className="h-8 px-2 mb-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
            {/* ➕ ไม่มีชื่อในลิสต์ → เพิ่มช่างใหม่เข้าโต๊ะนี้ได้เลย (ช่างเหมารับเข้ามาใหม่บ่อย) */}
            {editable && (addOpen ? (
              <div className="mb-2 rounded-lg border border-violet-200 bg-violet-50/50 p-2 space-y-1.5">
                <div className="text-[11px] font-semibold text-violet-700">➕ ช่างใหม่เข้า {assignPopup.dept.name}</div>
                <input autoFocus value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="ชื่อ-นามสกุล *"
                  onKeyDown={(e) => { if (e.key === "Enter" && !addSaving) void addCraftsman(); }}
                  className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
                <div className="flex gap-1.5">
                  <input value={addNick} onChange={(e) => setAddNick(e.target.value)} placeholder="ชื่อเล่น"
                    className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
                  <input value={addCode} onChange={(e) => setAddCode(e.target.value)} placeholder="รหัส (ว่าง = ออกให้)"
                    className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
                </div>
                <div className="flex items-center gap-1.5">
                  <button disabled={addSaving || !addName.trim()} onClick={() => void addCraftsman()}
                    className="h-7 px-3 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">{addSaving ? "กำลังเพิ่ม…" : "เพิ่ม + เลือกเลย"}</button>
                  <button onClick={() => { setAddOpen(false); setAddName(""); setAddNick(""); setAddCode(""); }} className="h-7 px-2 text-xs text-slate-500 hover:text-slate-700">ยกเลิก</button>
                  <span className="text-[10px] text-slate-400 ml-auto">{/เหมา/.test(assignPopup.dept.name) ? "ติ๊กเป็นช่างเหมาให้อัตโนมัติ" : ""}</span>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddOpen(true)} className="mb-2 h-7 px-2 text-xs text-violet-600 border border-dashed border-violet-300 rounded-lg hover:bg-violet-50">➕ เพิ่มช่างใหม่เข้า {assignPopup.dept.name}</button>
            ))}
            <div className="flex-1 overflow-auto -mx-1 px-1 space-y-0.5">
              {(() => {
                const q = assignSearch.trim().toLowerCase();
                const crafts = craftsOfDept(assignPopup.dept)
                  .filter((c) => !q || `${c.code ?? ""} ${c.name}`.toLowerCase().includes(q));
                if (crafts.length === 0) return <div className="text-[12px] text-slate-300 py-4 text-center">{assignSearch ? "ไม่พบช่างที่ค้นหา" : "แผนกนี้ยังไม่มีช่าง"}</div>;

                // แยกกลุ่มตามแผนก (โต๊ะช่างเหมาจะเห็นทุกคน → จัดกลุ่มให้หาง่าย) · แผนกที่กำลังจ่ายอยู่ขึ้นก่อน
                const nameOfDept = (id?: string | null) => departments.find((x) => x.id === id)?.name ?? "— ไม่ระบุแผนก —";
                const byDept = new Map<string, CraftLite[]>();
                for (const c of crafts) { const k = nameOfDept(c.department_id); (byDept.get(k) ?? byDept.set(k, []).get(k)!).push(c); }
                const groups = [...byDept.entries()].sort((a, b) =>
                  a[0] === assignPopup.dept.name ? -1 : b[0] === assignPopup.dept.name ? 1 : a[0].localeCompare(b[0], "th"));

                const line = (c: CraftLite) => (
                  <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-sm">
                    <input type={assignPopup.line ? "radio" : "checkbox"} checked={assignSel.has(c.id)}
                      onChange={() => setAssignSel((prev) => {
                        if (assignPopup.line) return new Set(prev.has(c.id) ? [] : [c.id]);   // ร่าง = คนเดียว
                        const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n;
                      })} className="w-4 h-4 accent-violet-600" />
                    <span className="flex-1 truncate text-slate-700">{c.code ? `[${c.code}] ` : ""}{c.name}</span>
                    {(() => { const df = defectOf(c.name); return df ? <span className="text-[10px] text-amber-600 shrink-0" title={`เคยมีงานเสีย ${df.count} ครั้ง`}>⚠️ {df.count}</span> : null; })()}
                  </label>
                );
                // แผนกเดียว (โต๊ะปกติ) → ไม่ต้องมีหัวกลุ่มให้รก
                if (groups.length <= 1) return groups[0]?.[1].map(line) ?? null;
                return groups.map(([dname, list]) => (
                  <div key={dname}>
                    <div className="sticky top-0 bg-white/95 backdrop-blur text-[11px] font-semibold text-violet-700 px-2 py-1 border-b border-slate-100">
                      🪑 {dname} <span className="text-slate-400 font-normal">({list.length})</span>
                    </div>
                    {list.map(line)}
                  </div>
                ));
              })()}
            </div>
            <div className="flex items-center justify-between gap-2 mt-3">
              <button onClick={() => setAssignSel(new Set())} className="h-8 px-2 text-xs text-slate-500 hover:text-slate-700">ล้าง (ทั้งโต๊ะ)</button>
              <button disabled={assignSaving} onClick={saveAssign} className="h-8 px-4 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">{assignSaving ? "บันทึก…" : "บันทึก"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ยืนยันดันเป็นของจริง */}
      {/* ⛶ ขยายดูรายการในช่อง (รอจ่าย / โต๊ะ) — อ่านง่ายกว่าเลื่อนในคอลัมน์แคบ ๆ */}
      {listPopup && (() => {
        const isPending = listPopup.kind === "pending";
        const d = listPopup.dept;
        const q = listSearch.trim().toLowerCase();
        const hit = (...vals: (string | null | undefined)[]) => !q || vals.some((v) => (v ?? "").toLowerCase().includes(q));
        const close = () => { setListPopup(null); setListSearch(""); };

        const orderKey = `wb:cardOrder:${listPopup.kind}:${d?.id ?? "-"}`;
        const pendRows = applyOrder(isPending ? visiblePending.filter((p) => hit(p.product_sku, p.product_name, p.mo_no)) : [], (p) => `p:${p.id}`, orderKey);
        const drafts = applyOrder(!isPending && d ? (draftByDept.get(d.id) ?? []).filter((l) => hit(l.product_sku, l.product_name, l.mo_no, l.assignee_name)) : [], (l) => `d:${l.id}`, orderKey);
        const reals = applyOrder(!isPending && d ? (realByDept.get(d.id) ?? []).filter((w) => hit(w.product_sku, w.product_name, w.mo_no, w.assignee_name)) : [], (w) => `w:${w.id}`, orderKey);
        const storeKey = `wb:cardOrder:${listPopup.kind}:${d?.id ?? "-"}`;
        // วันกำหนดส่งต่อใบสั่งผลิต (ใช้กับการ์ดร่าง/รอจ่ายที่ไม่มีวันของตัวเอง)
        const dueByMo = new Map<string, string | null>();
        for (const p of pending) dueByMo.set(p.mo_no, p.internal_due_date ?? p.due_date ?? null);
        const dueOf = (kind: "w" | "d" | "p", row: { mo_no?: string | null; due_date?: string | null }) =>
          (kind === "w" ? (row.due_date ?? dueByMo.get(String(row.mo_no)) ?? null) : (dueByMo.get(String(row.mo_no)) ?? null));

        const sumQty = isPending ? pendRows.reduce((n, p) => n + availOf(p), 0)
          : drafts.reduce((n, l) => n + (Number(l.qty) || 0), 0) + reals.reduce((n, w) => n + (Number(w.qty) || 0), 0);
        const sumLabor = isPending ? 0 : drafts.reduce((n, l) => n + lineLabor(l), 0) + reals.reduce((n, w) => n + woLabor(w), 0);
        const total = isPending ? pendRows.length : drafts.length + reals.length;

        // การ์ด 1 ใบ — รูปใหญ่ด้านบน ข้อมูลใต้รูป (หน้าตาแนวเดียวกับการ์ดในช้อปจ่ายงาน)
        const cardKeys = [
          ...pendRows.map((p) => `p:${p.id}`),
          ...reals.map((w) => `w:${w.id}`),
          ...drafts.map((l) => `d:${l.id}`),
        ];
        const card = (key: string, img: string | null | undefined, sku: string | null, name: string | null, moNo: string | null,
                      qty: number, right: ReactNode, badge?: ReactNode, onClick?: () => void, due?: string | null, moId?: string | null) => (
          <div key={key} onClick={onClick}
            draggable onDragStart={(e) => { setDragCard(key); e.stopPropagation(); }} onDragEnd={() => setDragCard(null)}
            onDragOver={(e) => { if (dragCard && dragCard !== key) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (dragCard) { moveCard(storeKey, cardKeys, dragCard, key); setDragCard(null); } }}
            className={`rounded-xl border bg-white overflow-hidden transition ${dragCard === key ? "opacity-40" : "border-slate-200"} ${onClick ? "cursor-pointer hover:border-indigo-300 hover:shadow-sm" : ""}`}>
            <div className="relative h-24 bg-slate-50 flex items-center justify-center">
              {img
                ? <img src={img} alt={sku ?? ""} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
                : <span className="text-3xl text-slate-200">📦</span>}
              {badge && <span className="absolute top-1 left-1">{badge}</span>}
            </div>
            <div className="p-2">
              {/* กดชื่อ/รหัส = เปิดป๊อปรายละเอียดงานเต็ม (เช็คลิสต์เตรียม/ตัด · วัตถุดิบ · ค่าแรง) — ไม่ไปโดนคลิกการ์ด */}
              <button type="button" onClick={(e) => { e.stopPropagation(); onOpenWork({ moId: moId ?? null, moNo, productSku: sku, productName: name, qty }); }} title="กดเพื่อเปิดรายละเอียดงาน"
                className="block w-full text-left text-sm font-semibold text-slate-800 truncate hover:text-indigo-600 hover:underline">{sku ?? "—"}</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onOpenWork({ moId: moId ?? null, moNo, productSku: sku, productName: name, qty }); }} title="กดเพื่อเปิดรายละเอียดงาน"
                className="block w-full text-left text-[11px] text-slate-500 truncate hover:text-indigo-600">{name}</button>
              <div className="text-[10px] text-slate-400 font-mono truncate">{moNo}</div>
              {due && <div className="text-[10px] text-slate-500">📅 {dayText(due)}</div>}
              <div className="flex items-center justify-between gap-1 mt-1.5">
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 whitespace-nowrap"><b className="text-sm">{fmt(qty)}</b> ชิ้น</span>
                <span className="text-right leading-tight">{right}</span>
              </div>
            </div>
          </div>
        );

        /** การ์ด "ใบจ่ายงานจริง" 1 ใบ — แยกเป็นฟังก์ชันเพื่อใช้ได้ทั้งแบบเรียงรวมและแบบแยกกลุ่มตามช่าง */
        const renderReal = (w: WOLite) => {
        const wl = woLabor(w);
        const editingLabor = listLaborId === w.id;
        return (
          <div key={`w:${w.id}`}
            draggable onDragStart={(e) => { setDragCard(`w:${w.id}`); e.stopPropagation(); }} onDragEnd={() => setDragCard(null)}
            onDragOver={(e) => { if (dragCard && dragCard !== `w:${w.id}`) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (dragCard) { moveCard(storeKey, cardKeys, dragCard, `w:${w.id}`); setDragCard(null); } }}
            className={`rounded-xl border bg-white overflow-hidden ${dragCard === `w:${w.id}` ? "opacity-40 border-indigo-300" : "border-slate-200"}`}>
            <div onClick={() => onOpenWork({ moId: w.mo_id ?? null, moNo: w.mo_no, productSku: w.product_sku, productName: w.product_name, qty: Number(w.qty) || 0 })}
              title="กดเพื่อเปิดรายละเอียดงาน (ปิดแล้วกลับมาหน้านี้)" className="cursor-pointer hover:bg-slate-50/60">
              <div className="relative h-24 bg-slate-50 flex items-center justify-center">
                {(w.image_url ?? imageByMo[w.mo_no])
                  ? <img src={(w.image_url ?? imageByMo[w.mo_no]) as string} alt={w.product_sku ?? ""} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
                  : <span className="text-3xl text-slate-200">📦</span>}
                <span className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-600 text-white max-w-[110px] truncate">{w.assignee_name || "ทั้งโต๊ะ"}</span>
              </div>
              <div className="px-2 pt-2">
                <button type="button" onClick={(e) => { e.stopPropagation(); onOpenWork({ moId: w.mo_id ?? null, moNo: w.mo_no, productSku: w.product_sku, productName: w.product_name, qty: Number(w.qty) || 0 }); }} title="กดเพื่อเปิดรายละเอียดงาน"
                  className="block w-full text-left text-sm font-semibold text-slate-800 truncate hover:text-indigo-600 hover:underline">{w.product_sku ?? "—"}</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onOpenWork({ moId: w.mo_id ?? null, moNo: w.mo_no, productSku: w.product_sku, productName: w.product_name, qty: Number(w.qty) || 0 }); }} title="กดเพื่อเปิดรายละเอียดงาน"
                  className="block w-full text-left text-[11px] text-slate-500 truncate hover:text-indigo-600">{w.product_name}</button>
                <div className="text-[10px] text-slate-400 font-mono truncate">{w.mo_no}</div>
                {dueOf("w", w) && <div className="text-[10px] text-slate-500">📅 {dayText(dueOf("w", w))}</div>}
              </div>
            </div>
            <div className="px-2 pb-2">
              <div className="flex items-center justify-between gap-1 mt-1.5">
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 whitespace-nowrap"><b className="text-sm">{fmt(Number(w.qty) || 0)}</b> ชิ้น</span>
                {wl > 0 ? <span className="text-[10px] text-amber-600 font-medium">{baht(wl)}</span> : <span className="text-[10px] text-slate-300">ยังไม่ใส่ค่าแรง</span>}
              </div>
              {realMode && editable && onUpdateWO && (
                editingLabor ? (
                  <div className="flex items-center gap-1 mt-1.5" onClick={(e) => e.stopPropagation()}>
                    <input type="number" min={0} step="any" autoFocus value={listLaborVal} onChange={(e) => setListLaborVal(e.target.value)} placeholder="฿/ชิ้น"
                      className="w-16 h-7 px-1.5 text-xs text-right border border-amber-300 rounded" />
                    <span className="text-[10px] text-slate-400">= ฿{fmt((Number(listLaborVal) || 0) * (Number(w.qty) || 0))}</span>
                    <button disabled={listBusy} onClick={async () => {
                      setListBusy(true);
                      try { await onUpdateWO(w.id, { labor_cost: (Number(listLaborVal) || 0) * (Number(w.qty) || 0) }, true); setListLaborId(null); toast.success("ใส่ค่าแรงแล้ว"); }
                      catch { /* parent toast */ } finally { setListBusy(false); }
                    }} className="ml-auto h-7 px-2 text-[11px] bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50">บันทึก</button>
                    <button onClick={() => setListLaborId(null)} className="h-7 px-1.5 text-[11px] text-slate-400">✕</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 mt-1.5">
                    <button onClick={(e) => { e.stopPropagation(); setListLaborId(w.id); setListLaborVal(wl > 0 && (Number(w.qty) || 0) > 0 ? String(Math.round((wl / (Number(w.qty) || 1)) * 100) / 100) : ""); }}
                      className="h-6 px-1.5 text-[10px] rounded border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100">💰 {wl > 0 ? "แก้ค่าแรง" : "ใส่ค่าแรง"}</button>
                    {onCancelWO && w.status !== "partial_return" && (
                      <button onClick={async (e) => {
                        e.stopPropagation();
                        if (!window.confirm(`ย้อน "${w.product_sku ?? "งานนี้"}" (${fmt(Number(w.qty) || 0)} ชิ้น) กลับไปรอจ่าย?`)) return;
                        setListBusy(true);
                        try { await onCancelWO(w.id); } finally { setListBusy(false); }
                      }} disabled={listBusy}
                        className="h-6 px-1.5 text-[10px] rounded border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-300 disabled:opacity-50">↩ คืนรอจ่าย</button>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        );
        };

        return (
          <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4" onClick={close}>
            <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-bold text-slate-800 truncate">
                  {isPending ? "📥 รอจ่าย" : `🪑 ${d?.name ?? ""}`} <span className="text-slate-400 font-normal">({total} รายการ)</span>
                </h3>
                <div className="ml-auto inline-flex rounded-lg border border-slate-200 overflow-hidden text-[11px] shrink-0">
                  <button onClick={() => setListView("cards")} className={`h-8 px-2.5 font-medium ${listView === "cards" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>🗂 การ์ด</button>
                  {!isPending && (
                  <button onClick={() => setListByWorker((v) => !v)} title="แยกการ์ดเป็นกลุ่มตามช่างที่ถืองาน"
                    className={`h-8 px-2.5 text-xs rounded-lg border ${listByWorker ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>👤 แยกตามช่าง</button>
                )}
                <button onClick={() => setListView("cal")} className={`h-8 px-2.5 font-medium border-l border-slate-200 ${listView === "cal" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📅 ปฏิทิน</button>
                </div>
                {!isPending && d && editable && (
                  <button onClick={() => { setListAddOpen((v) => !v); setListAddSearch(""); }}
                    className={`h-8 px-3 text-xs font-medium rounded-lg border ${listAddOpen ? "bg-indigo-600 text-white border-indigo-600" : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"}`}>
                    {listAddOpen ? "✕ ปิดรายการรอจ่าย" : "＋ เพิ่มงานเข้าโต๊ะนี้"}
                  </button>
                )}
                <button onClick={close} className="text-slate-400 hover:text-slate-600 shrink-0">✕</button>
              </div>
              <input value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="ค้นหา รหัส / ชื่อ / เลขใบ / ช่าง…"
                className="h-8 px-2 mb-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />

              {/* ＋ เพิ่มงานเข้าโต๊ะนี้ — เลือกจากใบที่ยังไม่ได้จ่าย */}
              {listAddOpen && !isPending && d && (
                <div className="mb-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-2">
                  <input autoFocus value={listAddSearch} onChange={(e) => setListAddSearch(e.target.value)} placeholder="ค้นหางานที่ยังไม่ได้จ่าย…"
                    className="w-full h-8 px-2 mb-1.5 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  {/* การ์ดแนวตั้ง เรียงเป็นตาราง — เห็นทีเดียวราว 10 ใบ (เลื่อนดูต่อได้) */}
                  <div className="max-h-[300px] overflow-y-auto scrollbar-hide">
                    {(() => {
                      const aq = listAddSearch.trim().toLowerCase();
                      const opts = visiblePending.filter((p) => !aq || `${p.product_sku ?? ""} ${p.product_name ?? ""} ${p.mo_no}`.toLowerCase().includes(aq));
                      if (opts.length === 0) return <div className="py-3 text-center text-[11px] text-slate-400">ไม่มีงานรอจ่ายที่ตรงกับที่ค้น</div>;
                      return (
                        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))" }}>
                          {opts.slice(0, 60).map((p) => (
                            <button key={p.id} disabled={listBusy}
                              onClick={async () => {
                                setListBusy(true);
                                try {
                                  if (realMode) { onDispatch?.({ moId: p.id, deptId: d.id, qty: availOf(p) }); close(); }
                                  else { await addLineFor(p.mo_no, d); }
                                } finally { setListBusy(false); }
                              }}
                              title={`${p.product_sku ?? ""} · ${p.product_name ?? ""}\n${p.mo_no} · เหลือ ${fmt(availOf(p))}`}
                              className="bg-white border border-slate-200 rounded-lg overflow-hidden hover:border-indigo-400 hover:shadow-sm text-left disabled:opacity-50">
                              <span className="block h-16 bg-slate-50 flex items-center justify-center">
                                {imageByMo[p.mo_no]
                                  ? <img src={imageByMo[p.mo_no] as string} alt={p.product_sku ?? ""} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
                                  : <span className="text-2xl text-slate-200">📦</span>}
                              </span>
                              <span className="block px-1.5 py-1">
                                <span className="block text-[12px] font-semibold text-slate-800 truncate">{p.product_sku}</span>
                                <span className="block text-[9px] text-slate-400 font-mono truncate">{p.mo_no}</span>
                                <span className="mt-0.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">เหลือ <b>{fmt(availOf(p))}</b></span>
                              </span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{realMode ? "กดแล้วจ่ายจริงทันที (จำนวนที่เหลือทั้งหมด)" : "กดแล้วเพิ่มเป็นรายการร่างในโต๊ะนี้"}</p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto -mx-1 px-1">
                {total === 0 && <div className="py-10 text-center text-slate-300 text-sm">— ไม่มีรายการ —</div>}

                {/* 📅 ปฏิทิน — วางงานตามวันกำหนดส่ง (ดูอย่างเดียว กดการ์ดเปิดงานได้) */}
                {listView === "cal" && total > 0 && (() => {
                  type CalIt = { key: string; sku: string | null; name: string | null; moNo: string | null; qty: number; due: string | null; img?: string | null; open?: () => void };
                  const items: CalIt[] = [
                    ...pendRows.map((p) => ({ key: `p:${p.id}`, sku: p.product_sku, name: p.product_name, moNo: p.mo_no, qty: availOf(p), due: dueOf("p", p), img: p.image_url ?? imageByMo[p.mo_no],
                      open: () => onOpenWork({ moId: p.id, moNo: p.mo_no, productSku: p.product_sku, productName: p.product_name, qty: p.qty }) })),
                    ...reals.map((w) => ({ key: `w:${w.id}`, sku: w.product_sku, name: w.product_name, moNo: w.mo_no, qty: Number(w.qty) || 0, due: dueOf("w", w), img: w.image_url ?? imageByMo[w.mo_no],
                      open: () => onOpenWork({ moId: w.mo_id ?? null, moNo: w.mo_no, productSku: w.product_sku, productName: w.product_name, qty: Number(w.qty) || 0 }) })),
                    ...drafts.map((l) => ({ key: `d:${l.id}`, sku: l.product_sku, name: l.product_name, moNo: l.mo_no, qty: Number(l.qty) || 0, due: dueOf("d", l), img: imageByMo[l.mo_no ?? ""] })),
                  ];
                  const byDay = new Map<string, CalIt[]>();
                  const noDay: CalIt[] = [];
                  for (const it of items) {
                    const k = it.due ? String(it.due).slice(0, 10) : "";
                    if (!k) { noDay.push(it); continue; }
                    byDay.set(k, [...(byDay.get(k) ?? []), it]);
                  }
                  const first = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1);
                  const start = new Date(first); start.setDate(1 - first.getDay());
                  const cells = Array.from({ length: 42 }, (_, i) => { const dt = new Date(start); dt.setDate(start.getDate() + i); return dt; });
                  const today = ymdKey(new Date());
                  const chip = (it: CalIt) => (
                    <div key={it.key} onClick={it.open} title={`${it.sku ?? ""} ${it.name ?? ""}\n${it.moNo ?? ""} · ${fmt(it.qty)} ชิ้น`}
                      className={`flex items-center gap-1 rounded border border-slate-200 bg-white px-1 py-0.5 ${it.open ? "cursor-pointer hover:border-indigo-300" : ""}`}>
                      <HoverImage url={it.img} size={18} previewSize={220} />
                      <span className="min-w-0 flex-1 text-[10px] font-semibold text-slate-700 truncate">{it.sku ?? "—"}</span>
                      <span className="text-[9px] text-indigo-700 font-semibold shrink-0">{fmt(it.qty)}</span>
                    </div>
                  );
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setCalCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))} className="h-7 w-7 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">‹</button>
                        <span className="min-w-[130px] text-center text-[12px] font-semibold text-slate-700">{calCursor.toLocaleDateString("th-TH", { month: "long", year: "numeric" })}</span>
                        <button onClick={() => setCalCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))} className="h-7 w-7 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">›</button>
                        <button onClick={() => { const dt = new Date(); setCalCursor(new Date(dt.getFullYear(), dt.getMonth(), 1)); }} className="h-7 px-2 text-[11px] border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">วันนี้</button>
                        <span className="ml-auto text-[10px] text-slate-400">วางตามกำหนดส่ง · ไม่กำหนดวัน {noDay.length} ใบ</span>
                      </div>
                      {noDay.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-1.5">
                          <div className="text-[10px] font-semibold text-amber-800 mb-1">⏳ ยังไม่กำหนดวันส่ง ({noDay.length})</div>
                          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>{noDay.slice(0, 60).map(chip)}</div>
                        </div>
                      )}
                      <div className="rounded-lg border border-slate-200 overflow-hidden">
                        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
                          {TH_DOW.map((x, i) => <div key={x} className={`px-1 py-1 text-[10px] font-semibold text-center ${i === 0 || i === 6 ? "text-rose-500" : "text-slate-500"}`}>{x}</div>)}
                        </div>
                        <div className="grid grid-cols-7">
                          {cells.map((dt) => {
                            const k = ymdKey(dt);
                            const list = byDay.get(k) ?? [];
                            const inMonth = dt.getMonth() === calCursor.getMonth();
                            const qty = list.reduce((n, x) => n + x.qty, 0);
                            return (
                              <div key={k} className={`min-h-[92px] border-b border-r border-slate-100 p-1 ${inMonth ? "bg-white" : "bg-slate-50/60"} ${k === today ? "ring-2 ring-inset ring-indigo-400" : ""}`}>
                                <div className="flex items-center justify-between">
                                  <span className={`text-[10px] font-semibold ${k === today ? "text-indigo-700" : inMonth ? "text-slate-600" : "text-slate-300"}`}>{dt.getDate()}</span>
                                  {list.length > 0 && <span className={`text-[9px] px-1 rounded ${k < today ? "bg-rose-100 text-rose-700" : "bg-indigo-50 text-indigo-700"}`}>{list.length} · {fmt(qty)}</span>}
                                </div>
                                <div className="space-y-0.5 max-h-[86px] overflow-y-auto scrollbar-hide">{list.map(chip)}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className={`grid gap-2 ${listView === "cal" ? "hidden" : ""}`} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                  {/* รอจ่าย */}
                  {pendRows.map((p) => card(`p:${p.id}`, imageByMo[p.mo_no], p.product_sku, p.product_name, p.mo_no, availOf(p),
                    <span className="text-[10px] text-slate-400">จ่ายแล้ว {fmt((p.qty || 0) - p.remaining)}/{fmt(p.qty)}</span>,
                    (p.ready ?? (!!p.prep_done && !!p.cut_done))
                      ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">พร้อม ✓</span>
                      : <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">รอเตรียม/ตัด</span>,
                    () => onOpenWork({ moId: p.id, moNo: p.mo_no, productSku: p.product_sku, productName: p.product_name, qty: p.qty }), dueOf("p", p), p.id))}

                  {/* ในโต๊ะ: ใบจ่ายงานจริง */}
                  {(() => {
                    // 👤 แยกตามช่าง — โต๊ะช่างเหมามีหลายคนปนกัน ดูรวม ๆ แล้วไม่รู้ว่าใครถืออะไรอยู่
                    const nameOf = (w: WOLite) => w.assignee_name || "— ทั้งโต๊ะ (ไม่ระบุช่าง) —";
                    if (!listByWorker || new Set(reals.map(nameOf)).size < 2) return reals.map(renderReal);
                    const byWorker = new Map<string, WOLite[]>();
                    for (const w of reals) { const k = nameOf(w); (byWorker.get(k) ?? byWorker.set(k, []).get(k)!).push(w); }
                    const sumOf = (ws: WOLite[]) => ws.reduce((a, w) => a + (Number(w.qty) || 0), 0);
                    // ใครถืองานเยอะสุดขึ้นก่อน (เห็นภาระงานทันที)
                    const groups = [...byWorker.entries()].sort((a, b) => sumOf(b[1]) - sumOf(a[1]));
                    return groups.map(([wname, ws]) => (
                      <Fragment key={`gw:${wname}`}>
                        <div className="col-span-full flex items-center gap-2 mt-1 px-1 py-1 border-b border-violet-100">
                          <span className="text-[12px] font-semibold text-violet-700 truncate">👤 {wname}</span>
                          <span className="text-[11px] text-slate-400 shrink-0">{ws.length} ใบ · {fmt(sumOf(ws))} ชิ้น</span>
                          {(() => { const lb = ws.reduce((a, w) => a + woLabor(w), 0); return lb > 0 ? <span className="text-[11px] text-amber-700 shrink-0 ml-auto">{baht(lb)}</span> : null; })()}
                        </div>
                        {ws.map(renderReal)}
                      </Fragment>
                    ));
                  })()}

                  {/* ในโต๊ะ: ร่าง (ยังไม่ดันเป็นของจริง) */}
                  {drafts.map((l) => card(`d:${l.id}`, imageByMo[l.mo_no ?? ""], l.product_sku, l.product_name, l.mo_no, Number(l.qty) || 0,
                    <span className="text-[10px] text-amber-600 font-medium">{baht(lineLabor(l))}</span>,
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-600 text-white max-w-[110px] truncate inline-block">ร่าง{l.assignee_name ? ` · ${l.assignee_name}` : ""}</span>,
                    undefined, dueOf("d", l), l.mo_id))}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-slate-500">รวม <b className="text-slate-700">{fmt(sumQty)}</b> ชิ้น</span>
                {!isPending && sumLabor > 0 && <span className="text-amber-700">ค่าแรงรวม <b>{baht(sumLabor)}</b></span>}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {isPending ? "กดการ์ด = เปิดเช็กลิสต์ใบนั้น" : "กดการ์ด = เปิดรายละเอียดงาน · 💰 ใส่ค่าแรง · ↩ คืนรอจ่าย"}
                {" · กดชื่อ/รหัสบนการ์ด = เปิดข้อมูลใบสั่งผลิต · ลากการ์ดสลับตำแหน่งได้ (จำเฉพาะเครื่องนี้)"}
              </p>
            </div>
          </div>
        );
      })()}

      {/* 👥 พนักงานในโต๊ะ — ย้ายคนเข้า/ออก + ตั้ง OT วางแผนรายคน (฿/ชม. × ชม./วัน × วัน) */}
      {staffPopup && (() => {
        const dept = staffPopup;
        const list = craftsmen.filter((c) => c.department_id === dept.id);
        const others = craftsmen.filter((c) => c.department_id !== dept.id);
        const q = staffSearch.trim().toLowerCase();
        const addable = q ? others.filter((c) => `${c.code ?? ""} ${c.name}`.toLowerCase().includes(q)) : others.slice(0, 30);
        const planOt = isUuid(planId);   // ตั้ง OT ได้เฉพาะในหน้าแผน
        // ค่าแรง/ชม. ที่ใช้จริง = ที่กรอกเอง ถ้ายังไม่กรอก ใช้ค่าแรงจริงของคนนั้นเป็นค่าตั้งต้น (ไม่ต้องกดปุ่ม)
        const rateOf = (empId: string) => (ot[empId]?.rate_per_hour ?? 0) > 0 ? ot[empId].rate_per_hour : (otRate[empId]?.rate ?? 0);
        const amountOf = (empId: string) => otAmount({ ...(ot[empId] ?? {}), rate_per_hour: rateOf(empId) });
        const otTotal = list.reduce((n, c) => n + amountOf(c.id), 0);

        const saveOt = async (empId: string, patch: Partial<OtRow>) => {
          const cur = ot[empId] ?? { rate_per_hour: 0, hours_per_day: 0, days: 0, amount: 0 };
          const next = { ...cur, ...patch };
          // ยังไม่ได้กรอกเรตเอง → บันทึกด้วยค่าแรงจริงที่ระบบคิดให้ (ค่าที่โชว์ในช่องอยู่แล้ว)
          if (!(next.rate_per_hour > 0)) next.rate_per_hour = otRate[empId]?.rate ?? 0;
          next.amount = otAmount(next);
          setOt((s) => ({ ...s, [empId]: next }));   // เห็นผลทันที
          setOtBusy(empId);
          try {
            const res = await apiFetch("/api/mo/plan-ot", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ plan_id: planId, employee_id: empId, department_id: dept.id, rate_per_hour: next.rate_per_hour, hours_per_day: next.hours_per_day, days: next.days }) });
            const j = await res.json();
            if (j.error) throw new Error(j.error);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "บันทึก OT ไม่สำเร็จ");
            void loadOt();   // ดึงค่าจริงกลับมา กันหน้าจอโชว์ค่าที่ยังไม่ได้บันทึก
          } finally { setOtBusy(null); }
        };
        // ใส่ ชม./วัน + วัน ให้ "ทุกคนในโต๊ะนี้" ทีเดียว (ค่าแรง/ชม. ใช้ของแต่ละคนตามเดิม)
        const applyBulk = async () => {
          const h = Number(bulkHours) || 0, d = Number(bulkDays) || 0;
          if (h <= 0 && d <= 0) { toast.error("ใส่ ชม./วัน หรือ จำนวนวัน อย่างน้อย 1 ช่อง"); return; }
          if (list.length === 0) return;
          const rows = list.map((c) => ({
            employee_id: c.id, rate_per_hour: rateOf(c.id),
            hours_per_day: h > 0 ? h : (ot[c.id]?.hours_per_day ?? 0),
            days: d > 0 ? d : (ot[c.id]?.days ?? 0),
          }));
          setBulkBusy(true);
          // อัปเดตหน้าจอก่อน (เห็นผลทันที) แล้วค่อยยิงบันทึกทีเดียว
          setOt((s) => {
            const n = { ...s };
            for (const r of rows) n[r.employee_id] = { rate_per_hour: r.rate_per_hour, hours_per_day: r.hours_per_day, days: r.days, amount: otAmount(r) };
            return n;
          });
          try {
            const res = await apiFetch("/api/mo/plan-ot", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ plan_id: planId, department_id: dept.id, rows }) });
            const j = await res.json();
            if (j.error) throw new Error(j.error);
            toast.success(`ใส่ OT ให้ ${rows.length} คนในโต๊ะ ${dept.name} แล้ว`);
            setBulkHours(""); setBulkDays("");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "ใส่ OT ให้ทุกคนไม่สำเร็จ");
            void loadOt();
          } finally { setBulkBusy(false); }
        };

        const moveStaff = async (empId: string, toDept: string | null, label: string) => {
          setStaffBusy(empId);
          try {
            const res = await apiFetch("/api/mo/dept-staff", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ employee_id: empId, department_id: toDept }) });
            const j = await res.json();
            if (j.error) throw new Error(j.error);
            toast.success(label);
            onStaffMoved?.();   // ให้หน้าแม่โหลดรายชื่อ/เงินเดือนรวมใหม่
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "ย้ายพนักงานไม่สำเร็จ");
          } finally { setStaffBusy(null); }
        };
        const numCls = "w-14 h-7 px-1 text-xs text-right border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:bg-slate-50";

        return (
          <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" onClick={() => closeStaffPopup()}>
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-800 truncate">👥 พนักงาน — {dept.name} <span className="text-slate-400 font-normal">({list.length} คน)</span></h3>
                <button onClick={() => closeStaffPopup()} className="text-slate-400 hover:text-slate-600 shrink-0">✕</button>
              </div>

              {planOt
                ? <p className="text-[11px] text-slate-400 mb-1.5">OT ที่ใส่ = <b>฿/ชม. × ชม./วัน × วัน</b> · เป็นตัวเลข<b>วางแผนของแผนนี้</b>เท่านั้น ไม่ส่งเข้าระบบเงินเดือน</p>
                : <p className="text-[11px] text-amber-600 mb-1.5">ตั้ง OT ได้ในหน้า “แผน” (บอร์ดของจริงไม่ใช่แผน) — ที่นี่ย้ายคนเข้า/ออกโต๊ะได้</p>}

              {/* ฐานคิดค่าแรง/ชั่วโมง — ระบบเอาค่าแรงจริงของแต่ละคนมาหารให้ (รายวัน ÷ ชม. · รายเดือน ÷ วัน ÷ ชม.) */}
              {planOt && canEdit && (
                <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 mb-2">
                  <span>ฐานคิดค่าแรง:</span>
                  <input type="number" min={1} max={24} step="any" value={baseHours}
                    onChange={(e) => { const v = Number(e.target.value) || 0; setBaseHours(v); try { localStorage.setItem("wb:otBaseHours", String(v)); } catch { /* ignore */ } }}
                    className="w-12 h-6 px-1 text-right border border-slate-200 rounded" title="ชั่วโมงงานปกติต่อวัน" />
                  <span>ชม./วัน</span>
                  <input type="number" min={1} max={31} step="any" value={baseDays}
                    onChange={(e) => { const v = Number(e.target.value) || 0; setBaseDays(v); try { localStorage.setItem("wb:otBaseDays", String(v)); } catch { /* ignore */ } }}
                    className="w-12 h-6 px-1 text-right border border-slate-200 rounded" title="วันทำงานต่อเดือน (ใช้กับลูกจ้างรายเดือน)" />
                  <span>วัน/เดือน</span>
                  <span className="ml-auto text-[10px] text-slate-400">ช่อง ฿/ชม. เติมค่าแรงจริงของแต่ละคนให้แล้ว — พิมพ์ทับได้</span>
                </div>
              )}

              {/* ใส่ ชม./วัน + วัน ให้ทุกคนในโต๊ะทีเดียว (ค่าแรง/ชม. ใช้ของแต่ละคน) */}
              {planOt && canEdit && list.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-2 py-1.5 mb-2">
                  <span className="font-medium">ใส่ให้ทุกคน:</span>
                  <input type="number" min={0} step="any" value={bulkHours} onChange={(e) => setBulkHours(e.target.value)} placeholder="ชม./วัน"
                    className="w-16 h-6 px-1 text-right border border-violet-200 rounded" title="ชั่วโมง OT ต่อวัน (ว่าง = ไม่เปลี่ยนของเดิม)" />
                  <span className="text-violet-300">×</span>
                  <input type="number" min={0} step="any" value={bulkDays} onChange={(e) => setBulkDays(e.target.value)} placeholder="วัน"
                    className="w-16 h-6 px-1 text-right border border-violet-200 rounded" title="จำนวนวันที่ทำ OT (ว่าง = ไม่เปลี่ยนของเดิม)" />
                  <button onClick={() => void applyBulk()} disabled={bulkBusy || (!(Number(bulkHours) > 0) && !(Number(bulkDays) > 0))}
                    className="h-6 px-2 text-[11px] font-medium bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-40">
                    {bulkBusy ? "กำลังใส่…" : `ใช้กับทั้งโต๊ะ (${list.length} คน)`}
                  </button>
                  <span className="ml-auto text-[10px] text-violet-400">ค่าแรง/ชม. ใช้ของแต่ละคน · ช่องที่เว้นว่าง = ไม่เปลี่ยน</span>
                </div>
              )}

              {list.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">โต๊ะนี้ยังไม่มีพนักงาน — กด “＋ เพิ่มคนเข้าโต๊ะ” ด้านล่าง</p>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[46vh] overflow-y-auto -mx-1 px-1">
                  {list.map((c) => {
                    const o = ot[c.id] ?? { rate_per_hour: 0, hours_per_day: 0, days: 0, amount: 0 };
                    return (
                      <div key={c.id} className="py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">
                            {c.code ? <code className="text-[10px] text-slate-400 mr-1">[{c.code}]</code> : null}{c.name}
                          </span>
                          {canEdit && (
                            <button onClick={() => void moveStaff(c.id, null, `ย้าย ${c.name} ออกจาก ${dept.name} แล้ว`)} disabled={staffBusy === c.id}
                              title="ย้ายออกจากโต๊ะนี้ (ไม่ได้ลบพนักงาน — แค่ไม่สังกัดโต๊ะ)"
                              className="shrink-0 h-6 px-1.5 text-[11px] text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded disabled:opacity-40">ย้ายออก</button>
                          )}
                        </div>
                        {planOt && (() => {
                          const auto = otRate[c.id];
                          const basisTxt = auto?.basis === "daily" ? "ค่าแรงรายวัน ÷ ชม./วัน" : auto?.basis === "monthly" ? "เงินเดือน ÷ วัน/เดือน ÷ ชม./วัน" : auto?.basis === "hourly" ? "ค่าแรงรายชั่วโมง" : "";
                          const effRate = rateOf(c.id);                       // ค่าที่โชว์ = กรอกเอง หรือค่าแรงจริง (ค่าตั้งต้น)
                          const custom = (o.rate_per_hour ?? 0) > 0 && Math.abs(o.rate_per_hour - (auto?.rate ?? 0)) > 0.005;
                          return (
                          <div className="flex items-center gap-1 mt-0.5 pl-1 text-[11px] text-slate-500 flex-wrap">
                            <span className="text-amber-600">OT</span>
                            {/* ค่าแรง/ชม. — ขึ้นค่าแรงจริงของคนนั้นให้เลย ไม่ต้องกดปุ่ม (พิมพ์ทับได้) */}
                            <input type="number" min={0} step="any" disabled={!canEdit || otBusy === c.id} value={effRate || ""} placeholder="฿/ชม."
                              title={basisTxt ? `ค่าตั้งต้นจากค่าแรงจริงของคนนี้ (${basisTxt}) — พิมพ์ทับได้` : "ค่า OT ต่อชั่วโมง (บาท)"}
                              onChange={(e) => setOt((s) => ({ ...s, [c.id]: { ...o, rate_per_hour: Number(e.target.value) || 0, amount: otAmount({ ...o, rate_per_hour: Number(e.target.value) || 0 }) } }))}
                              onBlur={(e) => void saveOt(c.id, { rate_per_hour: Number(e.target.value) || 0 })} className={`${numCls} ${custom ? "border-violet-300 text-violet-700" : ""}`} />
                            <span className="text-slate-300">×</span>
                            <input type="number" min={0} step="any" disabled={!canEdit || otBusy === c.id} value={o.hours_per_day || ""} placeholder="ชม./วัน"
                              onChange={(e) => setOt((s) => ({ ...s, [c.id]: { ...o, hours_per_day: Number(e.target.value) || 0, amount: otAmount({ ...o, hours_per_day: Number(e.target.value) || 0 }) } }))}
                              onBlur={(e) => void saveOt(c.id, { hours_per_day: Number(e.target.value) || 0 })} className={numCls} title="ชั่วโมง OT ต่อวัน" />
                            <span className="text-slate-300">×</span>
                            <input type="number" min={0} step="any" disabled={!canEdit || otBusy === c.id} value={o.days || ""} placeholder="วัน"
                              onChange={(e) => setOt((s) => ({ ...s, [c.id]: { ...o, days: Number(e.target.value) || 0, amount: otAmount({ ...o, days: Number(e.target.value) || 0 }) } }))}
                              onBlur={(e) => void saveOt(c.id, { days: Number(e.target.value) || 0 })} className={numCls} title="จำนวนวันที่ทำ OT" />
                            {/* แก้เรตเองแล้ว → ปุ่มกลับไปใช้ค่าแรงจริง */}
                            {canEdit && custom && (auto?.rate ?? 0) > 0 && (
                              <button onClick={() => void saveOt(c.id, { rate_per_hour: auto.rate })} disabled={otBusy === c.id}
                                title={`กลับไปใช้ค่าแรงจริง ฿${auto.rate}/ชม. (${basisTxt})`}
                                className="h-6 px-1.5 text-[10px] text-slate-400 border border-slate-200 rounded hover:text-violet-600 hover:border-violet-300 disabled:opacity-40">↺ ฿{auto.rate}</button>
                            )}
                            {(auto?.basis === "none") && <span className="text-[10px] text-slate-300">ไม่มีค่าแรงในระบบ</span>}
                            <span className="ml-auto font-semibold text-amber-700 tabular-nums">= {baht(amountOf(c.id))}</span>
                          </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* เพิ่มคนเข้าโต๊ะ */}
              {canEdit && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  {!staffAddOpen ? (
                    <button onClick={() => setStaffAddOpen(true)} className="w-full h-8 text-sm text-violet-600 border border-dashed border-violet-200 rounded-lg hover:bg-violet-50">＋ เพิ่มคนเข้าโต๊ะนี้</button>
                  ) : (
                    <div>
                      <input autoFocus value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} placeholder="พิมพ์ชื่อ/รหัสพนักงาน…"
                        className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
                      <div className="max-h-40 overflow-y-auto mt-1 border border-slate-100 rounded-lg divide-y divide-slate-50">
                        {addable.map((c) => (
                          <button key={c.id} disabled={staffBusy === c.id}
                            onClick={() => void moveStaff(c.id, dept.id, `ย้าย ${c.name} เข้า ${dept.name} แล้ว`)}
                            className="w-full text-left px-2 py-1.5 text-sm text-slate-700 hover:bg-violet-50 disabled:opacity-40">
                            {c.code ? <code className="text-[10px] text-slate-400 mr-1">[{c.code}]</code> : null}{c.name}
                            <span className="text-[10px] text-slate-400 ml-1">{c.department_id ? "· ย้ายมาจากโต๊ะอื่น" : "· ยังไม่มีโต๊ะ"}</span>
                          </button>
                        ))}
                        {addable.length === 0 && <div className="px-2 py-3 text-center text-[11px] text-slate-300">ไม่พบพนักงาน</div>}
                      </div>
                      <button onClick={() => { setStaffAddOpen(false); setStaffSearch(""); }} className="mt-1 text-[11px] text-slate-400 hover:text-slate-600">ปิด</button>
                    </div>
                  )}
                </div>
              )}

              {/* สรุปค่าแรงโต๊ะ */}
              <div className="mt-2 pt-2 border-t border-slate-100 text-xs space-y-0.5">
                {(deptWages[dept.id] ?? 0) > 0 && <div className="text-violet-700">เงินเดือนรวมในโต๊ะ {baht(deptWages[dept.id])}</div>}
                {otTotal > 0 && <div className="text-amber-700">OT ที่วางแผนไว้ {baht(otTotal)}</div>}
                {((deptWages[dept.id] ?? 0) > 0 || otTotal > 0) && <div className="font-bold text-slate-700">รวมค่าแรงโต๊ะ {baht((deptWages[dept.id] ?? 0) + otTotal)}</div>}
              </div>
            </div>
          </div>
        );
      })()}

      {confirmApply && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" onClick={() => setConfirmApply(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-800 mb-1">ดันแผนนี้เป็นของจริง?</h3>
            <p className="text-sm text-slate-500 mb-4">ระบบจะสร้างใบจ่ายงานจริงตามร่างทั้งหมด ({lines.length} รายการ) — หลังจากนี้แผนนี้จะล็อกแก้ไม่ได้</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmApply(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
              <button onClick={doApply} disabled={applying} className="h-9 px-4 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{applying ? "กำลังดัน…" : "ยืนยัน ดันเป็นของจริง"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
