"use client";

/**
 * บอร์ดจ่ายงาน (Whiteboard) — เฟส D (รื้อใหม่)
 * โซน "📥 รอจ่าย" (การ์ดใบสั่งผลิตที่ยังจ่ายไม่ครบ) + โซนแผนก (การ์ดใบจ่ายงาน)
 * ลาก MO → แผนก = popup จ่ายงาน (จำนวน/ช่าง/กำหนดเสร็จ) · ลากใบจ่ายงานข้ามแผนก = ย้ายแผนก
 * ซ่อน MO เมื่อจ่ายครบ · ซ่อนใบจ่ายงานเมื่อรับครบ · กรอบสีตามแบรนด์ + ปุ่มตั้งสี
 * ของกลาง: useAuth / useToast / apiFetch / ERPModal / @dnd-kit
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from "@dnd-kit/core";
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

const WO_STATUS: Record<string, { label: string; cls: string }> = {
  dispatched:     { label: "จ่ายแล้ว",       cls: "bg-blue-50 text-blue-700 border-blue-200" },
  in_progress:    { label: "กำลังทำ",        cls: "bg-amber-50 text-amber-700 border-amber-200" },
  partial_return: { label: "รับคืนบางส่วน",  cls: "bg-orange-50 text-orange-700 border-orange-200" },
  done:           { label: "รับครบ",         cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");

// สีสำรองต่อสินค้า (ถ้าแบรนด์ยังไม่ตั้งสี)
const PALETTE = ["#94a3b8", "#60a5fa", "#34d399", "#f472b6", "#fb923c", "#a78bfa", "#22d3ee", "#facc15"];
const prodColor = (sku: string | null) => { let h = 0; for (const c of sku ?? "") h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };

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

export default function WorkBoardPage() {
  const canView = usePermission("products.view");
  const canEdit = usePermission("products.edit");
  const { user } = useAuth();
  const toast = useToast();

  const [board, setBoard] = useState<Board>({ departments: [], workOrders: [], pending: [] });
  const [loading, setLoading] = useState(true);
  const [craftsmen, setCraftsmen] = useState<Assignee[]>([]);

  // popup จ่ายงาน
  const [dispMO, setDispMO] = useState<PendingMO | null>(null);
  const [dispDept, setDispDept] = useState<Dept | null>(null);
  const [dispQty, setDispQty] = useState(0);
  const [dispCraftsman, setDispCraftsman] = useState("");
  const [dispDue, setDispDue] = useState("");
  const [dispSaving, setDispSaving] = useState(false);
  // popup ตั้งสีแบรนด์
  const [colorOpen, setColorOpen] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await apiFetch("/api/mo/work-board"); const j = await res.json();
      if (!j.error) setBoard({ departments: j.departments ?? [], workOrders: j.workOrders ?? [], pending: j.pending ?? [] });
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void (async () => {
    try { const r = await apiFetch("/api/mo/assignees"); const j = await r.json(); setCraftsmen(j.craftsmen ?? []); } catch { /* ignore */ }
  })(); }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // ใบจ่ายงานต่อแผนก (ซ่อน done) — map ตาม department_id, ถ้าไม่มีก็เดาจาก stage
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

  const openColor = async () => { setColorOpen(true); try { const r = await apiFetch("/api/brands"); const j = await r.json(); setBrands(j.data ?? []); } catch { /* ignore */ } };
  const saveColor = async (id: string, color: string) => {
    setBrands((bs) => bs.map((b) => b.id === id ? { ...b, color } : b));
    try { await apiFetch("/api/brands", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, color }) }); }
    catch { toast.error("บันทึกสีไม่สำเร็จ"); }
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const a = String(e.active.id); const over = e.over ? String(e.over.id) : null;
    if (!over || !over.startsWith("dept:")) return;
    const deptId = over.slice(5);
    const dept = board.departments.find((d) => d.id === deptId); if (!dept) return;
    if (!canEdit) { toast.error("คุณไม่มีสิทธิ์แก้ไข"); return; }

    if (a.startsWith("mo:")) {
      // ลากใบสั่งผลิต → เปิด popup จ่ายงาน
      const mo = board.pending.find((m) => m.id === a.slice(3)); if (!mo) return;
      setDispMO(mo); setDispDept(dept); setDispQty(mo.remaining); setDispCraftsman(""); setDispDue(mo.due_date ?? "");
    } else if (a.startsWith("wo:")) {
      // ลากใบจ่ายงานข้ามแผนก → ย้ายแผนก
      const id = a.slice(3); const w = board.workOrders.find((x) => x.id === id); if (!w || w.department_id === deptId) return;
      setBoard((b) => ({ ...b, workOrders: b.workOrders.map((x) => x.id === id ? { ...x, department_id: deptId, department_name: dept.name } : x) }));
      try {
        const res = await apiFetch(`/api/mo/work-orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ department_id: deptId, department_name: dept.name, stage: stageOfDept(dept.name) }) });
        const j = await res.json(); if (j.error) throw new Error(j.error);
      } catch (err) { toast.error(err instanceof Error ? err.message : "ย้ายไม่สำเร็จ"); await load(); }
    }
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
          qty: dispQty, uom: "ชิ้น", dispatch_date: new Date().toISOString().slice(0, 10), due_date: dispDue || null,
          note: `จากใบสั่งผลิต ${dispMO.mo_no}` }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`จ่ายงานเข้า ${dispDept.name} แล้ว: ${j.wo_no ?? ""}`);
      setDispMO(null); setDispDept(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "จ่ายงานไม่สำเร็จ"); }
    finally { setDispSaving(false); }
  };

  const deptCraftsmen = useMemo(() => dispDept ? craftsmen.filter((c) => c.department_id === dispDept.id) : [], [dispDept, craftsmen]);

  if (!canView) return <AccessDenied />;

  return (
    <div className="max-w-[1700px] mx-auto px-5 py-5">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">📋 บอร์ดจ่ายงาน</h1>
          <p className="text-sm text-slate-500 mt-0.5">ลากใบสั่งผลิตจาก “รอจ่าย” ไปวางที่แผนก = จ่ายงาน · ลากการ์ดข้ามแผนก = ย้ายแผนก</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openColor} className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">🎨 ตั้งสีแบรนด์</button>
          <a href="/master/manufacturing-orders" className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">🏭 ใบสั่งผลิต</a>
          <button onClick={() => void load()} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">↻</button>
        </div>
      </div>

      {loading ? <div className="text-center py-20 text-slate-400">กำลังโหลด…</div> : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: "62vh" }}>
            {/* โซนรอจ่าย */}
            <div className="w-72 shrink-0">
              <div className="px-2 py-1.5 mb-2 rounded-lg bg-amber-100 text-amber-800 text-sm font-semibold flex items-center justify-between">
                <span>📥 รอจ่าย</span><span className="text-xs font-normal text-amber-600">{board.pending.length} ใบ</span>
              </div>
              <div className="space-y-2 rounded-lg p-1.5 bg-amber-50/40 min-h-[120px]">
                {board.pending.map((m) => <PendingCard key={m.id} mo={m} canEdit={canEdit} />)}
                {board.pending.length === 0 && <div className="text-center text-[11px] text-slate-300 py-8">ไม่มีงานรอจ่าย</div>}
              </div>
            </div>

            {/* โซนแผนก */}
            {board.departments.map((d) => <DeptZone key={d.id} dept={d} cards={wosByDept.get(d.id) ?? []} canEdit={canEdit} />)}
            {board.departments.length === 0 && <div className="text-slate-300 text-sm py-10">ยังไม่มีแผนก (ตั้งที่ Master Data → แผนก)</div>}
          </div>
        </DndContext>
      )}

      {/* popup จ่ายงาน */}
      <ERPModal open={dispMO !== null} onClose={() => !dispSaving && setDispMO(null)} size="md"
        title={`🧰 จ่ายงาน → ${dispDept?.name ?? ""}`}
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
    </div>
  );
}

// ---- โซนแผนก (droppable) ----
function DeptZone({ dept, cards, canEdit }: { dept: Dept; cards: WorkOrder[]; canEdit: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `dept:${dept.id}` });
  const total = cards.reduce((s, c) => s + (c.qty || 0), 0);
  return (
    <div className="w-72 shrink-0">
      <div className="px-2 py-1.5 mb-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold flex items-center justify-between">
        <span className="truncate">🏭 {dept.name}</span><span className="text-xs font-normal text-slate-400">{cards.length} ใบ · {fmt(total)} ชิ้น</span>
      </div>
      <div ref={setNodeRef} className={`space-y-2 rounded-lg p-1.5 min-h-[120px] border-2 border-dashed transition-colors ${isOver ? "bg-indigo-50 border-indigo-300" : "bg-slate-50/50 border-transparent"}`}>
        {cards.map((w) => <WOCard key={w.id} w={w} canEdit={canEdit} />)}
        {cards.length === 0 && <div className="text-center text-[11px] text-slate-300 py-8">ลากงานมาที่นี่</div>}
      </div>
    </div>
  );
}

// ---- การ์ดใบสั่งผลิต (รอจ่าย) ----
function PendingCard({ mo, canEdit }: { mo: PendingMO; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `mo:${mo.id}`, disabled: !canEdit });
  const urg = urgencyByDate(mo.due_date, false);
  const border = mo.brand_color || prodColor(mo.product_sku);
  const style: React.CSSProperties = { borderLeft: `5px solid ${border}`, transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined, opacity: isDragging ? 0.5 : 1, cursor: canEdit ? "grab" : "default" };
  const tip = `${mo.mo_no}\nสินค้า: ${mo.product_name ?? mo.product_sku ?? "—"}${mo.brand ? `\nแบรนด์: ${mo.brand}` : ""}\nผลิต ${fmt(mo.qty)} · จ่ายแล้ว ${fmt(mo.dispatched)} · เหลือ ${fmt(mo.remaining)}\nกำหนดเสร็จ: ${mo.due_date ?? "—"}`;
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={style} title={tip} className="bg-white border border-slate-200 rounded-lg p-2 shadow-sm hover:shadow select-none">
      <div className="flex items-center justify-between gap-1">
        <code className="text-[10px] text-slate-400">{mo.mo_no}</code>
        <span className={`w-2 h-2 rounded-full ${URG_DOT[urg]}`} />
      </div>
      <div className="flex gap-2 mt-1">
        <div className="w-11 h-11 rounded bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center shrink-0">
          {mo.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={mo.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-sm">📦</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-slate-800 font-medium leading-snug line-clamp-2">{mo.product_name ?? mo.product_sku}</div>
          {mo.brand && <span className="text-[10px] px-1 rounded" style={{ background: `${border}22`, color: border }}>{mo.brand}</span>}
        </div>
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[11px]">
        <span className="text-rose-600 font-medium">เหลือจ่าย {fmt(mo.remaining)}/{fmt(mo.qty)}</span>
        <span className="text-slate-500">⏱ {daysLeftText(mo.due_date)}</span>
      </div>
    </div>
  );
}

// ---- การ์ดใบจ่ายงาน (ในแผนก) ----
function WOCard({ w, canEdit }: { w: WorkOrder; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `wo:${w.id}`, disabled: !canEdit });
  const urg = urgencyByDate(w.due_date, w.status === "done");
  const st = WO_STATUS[w.status] ?? WO_STATUS.dispatched;
  const border = w.brand_color || prodColor(w.product_sku);
  const style: React.CSSProperties = { borderLeft: `5px solid ${border}`, transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined, opacity: isDragging ? 0.5 : 1, cursor: canEdit ? "grab" : "default" };
  const tip = `${w.wo_no} · ${w.mo_no}\nสินค้า: ${w.product_name ?? w.product_sku ?? "—"}${w.brand ? `\nแบรนด์: ${w.brand}` : ""}\nผู้รับ: ${w.assignee_name ?? "—"}\nจ่าย ${fmt(w.qty)} · รับคืน ${fmt(w.received_qty)}\nกำหนดเสร็จ: ${w.due_date ?? "—"}\nสถานะ: ${st.label}`;
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={style} title={tip} className="bg-white border border-slate-200 rounded-lg p-2 shadow-sm hover:shadow select-none">
      <div className="flex items-center justify-between gap-1">
        <code className="text-[10px] text-slate-400">{w.wo_no}</code>
        <span className={`w-2 h-2 rounded-full ${URG_DOT[urg]}`} />
      </div>
      <div className="flex gap-2 mt-1">
        <div className="w-11 h-11 rounded bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center shrink-0">
          {w.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={w.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-sm">📦</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-slate-800 font-medium leading-snug line-clamp-2">{w.product_name ?? w.product_sku}</div>
          <span className="text-[11px] text-slate-500">{w.assignee_type === "department" ? "🏢 " : "👤 "}{w.assignee_name}</span>
        </div>
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[11px]">
        <span className={`px-1.5 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
        <span className="tabular-nums text-slate-600">{fmt(w.qty)} ชิ้น</span>
      </div>
      <div className="flex items-center justify-between mt-1 text-[11px]">
        <span className="text-slate-500">⏱ {daysLeftText(w.due_date)}</span>
        {w.received_qty > 0 && w.status !== "done" && <span className="text-orange-600">รับคืน {fmt(w.received_qty)}/{fmt(w.qty)}</span>}
      </div>
    </div>
  );
}
