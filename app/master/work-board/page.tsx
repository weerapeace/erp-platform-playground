"use client";

/**
 * บอร์ดจ่ายงาน (Work Board / Kanban) — เฟส D
 * รวมใบจ่ายงานทั้งโรงงาน · ลากการ์ดได้ · สลับคอลัมน์ (ตามสถานะ / ตามช่าง-แผนก)
 * สี: ผสมกำหนดเสร็จ+สถานะ (รับครบ=เขียว · เลยกำหนดยังไม่เสร็จ=แดง · ใกล้กำหนด=ส้ม · อื่น=เขียว)
 * กรอบซ้าย = สีประจำสินค้า (สินค้าตัวเดียวกัน=สีเดียวกัน) · tooltip รายละเอียด · ซ่อนตามสถานะ
 * ของกลาง: useAuth / useToast / apiFetch / @dnd-kit
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from "@dnd-kit/core";
import { useToast } from "@/components/toast";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { WorkOrder } from "@/app/api/mo/work-orders/route";

const STAGES: Record<string, string> = { cut: "ตัด / เตรียม", assemble: "ประกอบ (เย็บ)" };
const stageLabel = (s: string) => STAGES[s] ?? s;
const WO_STATUS: Record<string, { label: string; cls: string }> = {
  dispatched:     { label: "จ่ายแล้ว",       cls: "bg-blue-50 text-blue-700 border-blue-200" },
  in_progress:    { label: "กำลังทำ",        cls: "bg-amber-50 text-amber-700 border-amber-200" },
  partial_return: { label: "รับคืนบางส่วน",  cls: "bg-orange-50 text-orange-700 border-orange-200" },
  done:           { label: "รับครบ",         cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};
const STATUS_ORDER = ["dispatched", "in_progress", "partial_return", "done"];
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");

// สีประจำสินค้า (hash sku → palette คงที่)
const PALETTE = ["#2563eb", "#16a34a", "#db2777", "#ea580c", "#7c3aed", "#0891b2", "#ca8a04", "#dc2626", "#4f46e5", "#0d9488"];
const prodColor = (sku: string | null) => { let h = 0; for (const c of sku ?? "") h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };

// สีความเร่งด่วน (ผสมกำหนดเสร็จ+สถานะ)
type Urg = "green" | "orange" | "red";
function urgencyOf(w: WorkOrder): Urg {
  if (w.status === "done") return "green";
  if (w.due_date) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(w.due_date + "T00:00:00");
    const days = Math.floor((due.getTime() - today.getTime()) / 86400000);
    if (days < 0) return "red";
    if (days <= 2) return "orange";
  }
  return "green";
}
const URG_DOT: Record<Urg, string> = { green: "bg-emerald-500", orange: "bg-amber-500", red: "bg-rose-500" };
const URG_TEXT: Record<Urg, string> = { green: "text-slate-500", orange: "text-amber-600 font-medium", red: "text-rose-600 font-semibold" };

const assigneeKey = (w: WorkOrder) => w.assignee_id || `name:${w.assignee_name ?? "—"}`;

export default function WorkBoardPage() {
  const canView = usePermission("products.view");
  const canEdit = usePermission("products.edit");
  const { } = useAuth();
  const toast = useToast();

  const [items, setItems] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupMode, setGroupMode] = useState<"status" | "assignee">("status");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await apiFetch("/api/mo/work-orders"); const j = await res.json();
      if (!j.error) setItems((j.data ?? []) as WorkOrder[]);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // นับตามสถานะ (ก่อนกรอง) สำหรับชิปซ่อน
  const statusCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const w of items) m[w.status] = (m[w.status] ?? 0) + 1;
    return m;
  }, [items]);

  const visible = useMemo(() => items.filter((w) => !hidden.has(w.status)), [items, hidden]);

  // คอลัมน์
  type Col = { key: string; label: string; assignee?: { id: string | null; name: string; type: string } };
  const columns: Col[] = useMemo(() => {
    if (groupMode === "status") {
      return STATUS_ORDER.filter((s) => !hidden.has(s)).map((s) => ({ key: s, label: WO_STATUS[s]?.label ?? s }));
    }
    const m = new Map<string, Col>();
    for (const w of visible) {
      const k = assigneeKey(w);
      if (!m.has(k)) m.set(k, { key: k, label: w.assignee_name ?? "—", assignee: { id: w.assignee_id, name: w.assignee_name ?? "—", type: w.assignee_type } });
    }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "th"));
  }, [groupMode, visible, hidden]);

  const cardsOf = (col: Col): WorkOrder[] =>
    visible.filter((w) => groupMode === "status" ? w.status === col.key : assigneeKey(w) === col.key);

  // ลากวาง → เปลี่ยนสถานะ (โหมดสถานะ) / ย้ายผู้รับ (โหมดช่าง-แผนก)
  const onDragEnd = async (e: DragEndEvent) => {
    const id = String(e.active.id); const overKey = e.over ? String(e.over.id) : null;
    if (!overKey) return;
    const w = items.find((x) => x.id === id); if (!w) return;

    let patch: Record<string, unknown> | null = null;
    let optimistic: Partial<WorkOrder> = {};
    if (groupMode === "status") {
      if (w.status === overKey) return;
      patch = { status: overKey }; optimistic = { status: overKey };
    } else {
      const col = columns.find((c) => c.key === overKey);
      if (!col?.assignee || assigneeKey(w) === overKey) return;
      patch = { assignee_id: col.assignee.id, assignee_name: col.assignee.name, assignee_type: col.assignee.type };
      optimistic = { assignee_id: col.assignee.id, assignee_name: col.assignee.name, assignee_type: col.assignee.type };
    }
    if (!canEdit) { toast.error("คุณไม่มีสิทธิ์แก้ไข"); return; }

    setItems((arr) => arr.map((x) => x.id === id ? { ...x, ...optimistic } : x));   // อัปเดตทันที
    try {
      const res = await apiFetch(`/api/mo/work-orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      await load();   // ดึงสถานะจริง (เช่น received_qty/สถานะที่ระบบคำนวณ)
    } catch (err) { toast.error(err instanceof Error ? err.message : "ย้ายไม่สำเร็จ"); await load(); }
  };

  if (!canView) return <AccessDenied />;

  return (
    <div className="max-w-[1600px] mx-auto px-5 py-5">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">📋 บอร์ดจ่ายงาน</h1>
          <p className="text-sm text-slate-500 mt-0.5">ลากการ์ดเพื่อ{groupMode === "status" ? "เปลี่ยนสถานะ" : "ย้ายให้ช่าง/แผนกอื่น"} · รวมงานทั้งโรงงาน</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            <button onClick={() => setGroupMode("status")} className={`h-9 px-3 ${groupMode === "status" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>ตามสถานะ</button>
            <button onClick={() => setGroupMode("assignee")} className={`h-9 px-3 border-l border-slate-200 ${groupMode === "assignee" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>ตามช่าง/แผนก</button>
          </div>
          <a href="/master/manufacturing-orders" className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">🏭 ใบสั่งผลิต</a>
          <button onClick={() => void load()} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">↻</button>
        </div>
      </div>

      {/* ชิปซ่อนตามสถานะ */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap text-xs">
        <span className="text-slate-400">ซ่อนสถานะ:</span>
        {STATUS_ORDER.map((s) => {
          const off = hidden.has(s); const st = WO_STATUS[s];
          return (
            <button key={s} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(s)) n.delete(s); else n.add(s); return n; })}
              className={`px-2 py-1 rounded-full border ${off ? "bg-slate-100 text-slate-400 border-slate-200 line-through" : `${st.cls}`}`}>
              {st.label} ({statusCount[s] ?? 0})
            </button>
          );
        })}
      </div>

      {loading ? <div className="text-center py-20 text-slate-400">กำลังโหลด…</div>
      : items.length === 0 ? <div className="text-center py-20 text-slate-300">ยังไม่มีใบจ่ายงาน — ไปจ่ายงานที่หน้าใบสั่งผลิตก่อน</div>
      : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: "60vh" }}>
            {columns.map((col) => <Column key={col.key} col={col} cards={cardsOf(col)} groupMode={groupMode} canEdit={canEdit} />)}
            {columns.length === 0 && <div className="text-slate-300 text-sm py-10">ไม่มีคอลัมน์ (ลองเลิกซ่อนสถานะ)</div>}
          </div>
        </DndContext>
      )}
    </div>
  );
}

// ---- คอลัมน์ (droppable) ----
function Column({ col, cards, groupMode, canEdit }: { col: { key: string; label: string }; cards: WorkOrder[]; groupMode: "status" | "assignee"; canEdit: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  const total = cards.reduce((s, c) => s + (c.qty || 0), 0);
  return (
    <div className="w-72 shrink-0">
      <div className="flex items-center justify-between px-2 py-1.5 mb-2 rounded-lg bg-slate-100">
        <span className="text-sm font-semibold text-slate-700 truncate">{groupMode === "assignee" ? "👤 " : ""}{col.label}</span>
        <span className="text-xs text-slate-400">{cards.length} ใบ · {fmt(total)} ชิ้น</span>
      </div>
      <div ref={setNodeRef} className={`space-y-2 rounded-lg p-1.5 min-h-[120px] transition-colors ${isOver ? "bg-indigo-50 ring-2 ring-indigo-300" : "bg-slate-50/50"}`}>
        {cards.map((w) => <Card key={w.id} w={w} groupMode={groupMode} canEdit={canEdit} />)}
        {cards.length === 0 && <div className="text-center text-[11px] text-slate-300 py-6">ลากการ์ดมาที่นี่</div>}
      </div>
    </div>
  );
}

// ---- การ์ด (draggable) ----
function Card({ w, groupMode, canEdit }: { w: WorkOrder; groupMode: "status" | "assignee"; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: w.id, disabled: !canEdit });
  const urg = urgencyOf(w);
  const st = WO_STATUS[w.status] ?? WO_STATUS.dispatched;
  const tip = `${w.wo_no} · ${w.mo_no}\nสินค้า: ${w.product_name ?? w.product_sku ?? "—"}\nขั้นตอน: ${stageLabel(w.stage)}\nผู้รับ: ${w.assignee_name ?? "—"}\nจ่าย ${fmt(w.qty)} · รับคืน ${fmt(w.received_qty)}\nกำหนดเสร็จ: ${w.due_date ?? "—"}\nสถานะ: ${st.label}${w.note ? `\nหมายเหตุ: ${w.note}` : ""}`;
  const style: React.CSSProperties = {
    borderLeft: `4px solid ${prodColor(w.product_sku)}`,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    cursor: canEdit ? "grab" : "default",
  };
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={style} title={tip}
      className="bg-white border border-slate-200 rounded-lg p-2 shadow-sm hover:shadow select-none">
      <div className="flex items-center justify-between gap-1">
        <code className="text-[10px] text-slate-400">{w.wo_no}</code>
        <span className={`w-2 h-2 rounded-full ${URG_DOT[urg]}`} title={urg === "red" ? "เลยกำหนด" : urg === "orange" ? "ใกล้กำหนด" : "ปกติ"} />
      </div>
      <div className="text-sm text-slate-800 font-medium leading-snug line-clamp-2 mt-0.5">{w.product_name ?? w.product_sku}</div>
      {w.product_name && <code className="text-[10px] text-slate-400">{w.product_sku}</code>}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{stageLabel(w.stage)}</span>
        <span className="text-xs tabular-nums text-slate-600">{fmt(w.qty)} ชิ้น</span>
      </div>
      <div className="flex items-center justify-between mt-1 text-[11px]">
        {groupMode === "status"
          ? <span className="text-slate-500 truncate">{w.assignee_type === "department" ? "🏢 " : "👤 "}{w.assignee_name}</span>
          : <span className={`px-1.5 py-0.5 rounded border ${st.cls}`}>{st.label}</span>}
        <span className={URG_TEXT[urg]}>{w.due_date ? `⏱ ${w.due_date}` : "—"}</span>
      </div>
      {w.received_qty > 0 && w.status !== "done" && <div className="text-[10px] text-orange-600 mt-0.5">รับคืนแล้ว {fmt(w.received_qty)}/{fmt(w.qty)}</div>}
    </div>
  );
}
