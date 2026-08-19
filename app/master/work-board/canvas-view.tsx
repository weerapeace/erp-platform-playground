"use client";

/**
 * มุมมอง "แคนวาส" ของบอร์ดจ่ายงาน — 1 section = 1 โต๊ะ
 *  • การ์ด "แผน" (mo_dispatch_plan_lines) → ลากข้ามโต๊ะได้ บันทึกลงแผนทันที (optimistic + คืนที่เดิมถ้าพลาด)
 *  • การ์ด "ของจริง" (ใบจ่ายงานที่จ่ายไปแล้ว) → สีเทา 🔒 ลากไม่ได้ ดูอย่างเดียว
 * ของกลาง: CanvasBoard (components/canvas-board) · HoverImage · apiFetch · useToast
 * ห้ามเขียนบอร์ดลาก-วางเองซ้ำในโมดูล — ต่อยอดที่ CanvasBoard
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CanvasBoard, type CanvasZone } from "@/components/canvas-board";
import { HoverImage } from "@/components/hover-image";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import type { DispatchPlan, DispatchPlanLine } from "@/app/api/mo/dispatch-plans/route";

type DeptLite = { id: string; name: string };
type WOLite = {
  id: string; wo_no?: string; mo_no: string; mo_id?: string | null;
  product_sku: string | null; product_name: string | null;
  department_id: string | null; department_name: string | null; assignee_name: string | null;
  qty: number; received_qty: number; status: string; image_url?: string | null;
};

// โซนปลายทางของงานที่ยังไม่ระบุโต๊ะ (หรือโต๊ะที่ไม่ได้โชว์บนบอร์ด เช่น เตรียม/ตัด)
const NO_DESK = "__no_desk__";
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const baht = (n: number) => "฿" + fmt(n);

type Card =
  | { kind: "plan"; id: string; zone: string; line: DispatchPlanLine }
  | { kind: "real"; id: string; zone: string; wo: WOLite };

export function CanvasView({
  departments, realWOs, plans, canEdit, imageByMo, laborPerUnit, onOpenWO, onOpenWork,
}: {
  departments: DeptLite[];
  realWOs: WOLite[];
  plans: DispatchPlan[];
  canEdit: boolean;
  imageByMo: Record<string, string | null>;
  laborPerUnit: Record<string, number>;   // mo_no → ค่าแรง/ชิ้น
  onOpenWO?: (id: string) => void;
  onOpenWork?: (info: { moId: string | null; moNo: string | null; productSku: string | null; productName: string | null; qty: number }) => void;
}) {
  const toast = useToast();
  const [planId, setPlanId] = useState<string>("");
  const [lines, setLines] = useState<DispatchPlanLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [showReal, setShowReal] = useState(true);

  // แผนที่เลือก — ค่าเริ่มต้นคือแผนแรกที่ยังแก้ได้ (ไม่มีก็แผนแรกสุด)
  useEffect(() => {
    if (planId && plans.some((p) => p.id === planId)) return;
    const first = plans.find((p) => p.status !== "applied") ?? plans[0];
    setPlanId(first?.id ?? "");
  }, [plans, planId]);

  const plan = plans.find((p) => p.id === planId) ?? null;
  const editable = canEdit && !!plan && plan.status !== "applied";

  const load = useCallback(async () => {
    if (!planId) { setLines([]); return; }
    setLoading(true);
    try {
      const r = await apiFetch(`/api/mo/dispatch-plans/${planId}`);
      const j = await r.json();
      setLines((j?.data?.lines ?? []) as DispatchPlanLine[]);
    } catch { setLines([]); }
    finally { setLoading(false); }
  }, [planId]);
  useEffect(() => { void load(); }, [load]);

  // โซน = โต๊ะ (+ ช่องท้ายสำหรับงานที่ยังไม่ระบุโต๊ะ)
  const deptIds = useMemo(() => new Set(departments.map((d) => d.id)), [departments]);
  const zoneOf = useCallback((id: string | null) => (id && deptIds.has(id) ? id : NO_DESK), [deptIds]);

  const cards = useMemo<Card[]>(() => {
    const out: Card[] = [];
    for (const l of lines) out.push({ kind: "plan", id: `plan:${l.id}`, zone: zoneOf(l.department_id), line: l });
    if (showReal) {
      for (const w of realWOs) {
        if (w.status === "done") continue;               // ส่งครบแล้ว = ออกจากโต๊ะไปแล้ว
        out.push({ kind: "real", id: `real:${w.id}`, zone: zoneOf(w.department_id), wo: w });
      }
    }
    return out;
  }, [lines, realWOs, showReal, zoneOf]);

  const zones = useMemo<CanvasZone[]>(() => {
    const sum = new Map<string, { plan: number; real: number }>();
    for (const c of cards) {
      const s = sum.get(c.zone) ?? { plan: 0, real: 0 };
      if (c.kind === "plan") s.plan += Number(c.line.qty) || 0; else s.real += Number(c.wo.qty) || 0;
      sum.set(c.zone, s);
    }
    const hintOf = (id: string) => {
      const s = sum.get(id); if (!s || (s.plan === 0 && s.real === 0)) return undefined;
      return `แผน ${fmt(s.plan)} ชิ้น · ของจริง ${fmt(s.real)} ชิ้น`;
    };
    return [
      ...departments.map((d) => ({ id: d.id, title: d.name, color: "#6366f1", hint: hintOf(d.id) })),
      { id: NO_DESK, title: "ยังไม่ระบุโต๊ะ", color: "#94a3b8", hint: hintOf(NO_DESK) },
    ];
  }, [departments, cards]);

  // ลากการ์ดแผนข้ามโต๊ะ → บันทึกลงแผน (optimistic; พลาดแล้วคืนที่เดิม)
  const move = useCallback(async (card: Card, toZone: string) => {
    if (card.kind !== "plan" || !planId) return;
    const dept = departments.find((d) => d.id === toZone) ?? null;
    const before = card.line;
    setLines((ls) => ls.map((l) => l.id === before.id
      ? { ...l, department_id: dept?.id ?? null, department_name: dept?.name ?? null, assignee_id: null, assignee_name: null }
      : l));
    try {
      const res = await apiFetch(`/api/mo/dispatch-plans/${planId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_line", lineId: before.id, department_id: dept?.id ?? null, department_name: dept?.name ?? null }),
      });
      const j = await res.json(); if (j?.error) throw new Error(j.error);
      toast.success(`ย้ายไป ${dept?.name ?? "ยังไม่ระบุโต๊ะ"} แล้ว`);
    } catch (e) {
      setLines((ls) => ls.map((l) => l.id === before.id ? before : l));
      toast.error(e instanceof Error ? e.message : "ย้ายโต๊ะไม่สำเร็จ");
    }
  }, [planId, departments, toast]);

  if (plans.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-4xl mb-3">🗂</div>
        <p className="text-slate-700 font-medium">ยังไม่มีแผนงาน</p>
        <p className="text-slate-400 text-sm mt-1">ไปที่มุมมอง <b>บอร์ด</b> แล้วกด “＋ สร้างแผน” ก่อน แล้วค่อยกลับมาที่แคนวาส</p>
      </div>
    );
  }

  return (
    <div>
      {/* แถบเครื่องมือ — เลือกแผน · ซ่อน/แสดงของจริง · โหลดใหม่ */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} title="เลือกแผนงานที่จะวางบนแคนวาส"
          className="h-9 px-2 text-sm font-medium border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          {plans.map((p) => <option key={p.id} value={p.id}>📅 {p.name}{p.status === "applied" ? " (ดันเป็นของจริงแล้ว)" : ""}</option>)}
        </select>
        <label className="h-9 px-3 inline-flex items-center gap-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 cursor-pointer">
          <input type="checkbox" checked={showReal} onChange={(e) => setShowReal(e.target.checked)} className="accent-slate-500" />
          แสดงของจริง (สีเทา)
        </label>
        <button onClick={() => void load()} title="โหลดใหม่" className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">⟳</button>
        <span className="text-[11px] text-slate-400">
          {editable
            ? "ลากการ์ด “แผน” ข้ามโต๊ะได้ · การ์ดสีเทา = ของจริงที่จ่ายไปแล้ว ล็อกไว้ ย้ายไม่ได้"
            : "แผนนี้แก้ไม่ได้ (ดันเป็นของจริงแล้ว หรือไม่มีสิทธิ์จ่ายงาน) — ดูได้อย่างเดียว"}
        </span>
      </div>

      {loading ? <div className="text-center py-16 text-slate-400 text-sm">กำลังโหลดแผน…</div> : (
        <CanvasBoard<Card>
          zones={zones}
          items={cards}
          getItemId={(c) => c.id}
          getZoneId={(c) => c.zone}
          canDrag={editable}
          canDragItem={(c) => c.kind === "plan"}   // ของจริงล็อกไว้ ลากไม่ได้
          cardWidth={210}
          emptyText="ยังไม่มีงานในโต๊ะนี้ — ลากการ์ดแผนมาวางได้"
          onMove={(c, to) => void move(c, to)}
          onCardClick={(c) => {
            if (c.kind === "real") { onOpenWO?.(c.wo.id); return; }
            onOpenWork?.({ moId: c.line.mo_id, moNo: c.line.mo_no, productSku: c.line.product_sku, productName: c.line.product_name, qty: Number(c.line.qty) || 0 });
          }}
          renderCard={(c, dragging) => <BoardCard card={c} dragging={dragging} imageByMo={imageByMo} laborPerUnit={laborPerUnit} />}
        />
      )}
    </div>
  );
}

// การ์ดบนแคนวาส — แผน = พื้นขาว เส้นซ้ายม่วง · ของจริง = พื้นเทา จาง + 🔒
function BoardCard({ card, dragging, imageByMo, laborPerUnit }: {
  card: Card; dragging: boolean; imageByMo: Record<string, string | null>; laborPerUnit: Record<string, number>;
}) {
  const isPlan = card.kind === "plan";
  const moNo = isPlan ? (card.line.mo_no ?? "") : card.wo.mo_no;
  const sku = isPlan ? card.line.product_sku : card.wo.product_sku;
  const name = isPlan ? card.line.product_name : card.wo.product_name;
  const qty = Number(isPlan ? card.line.qty : card.wo.qty) || 0;
  const worker = isPlan ? card.line.assignee_name : card.wo.assignee_name;
  const recv = isPlan ? 0 : Number(card.wo.received_qty) || 0;
  const img = (isPlan ? null : card.wo.image_url) ?? imageByMo[moNo] ?? null;
  const rate = laborPerUnit[moNo] ?? 0;
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${dragging ? "shadow-lg" : ""} ${isPlan ? "bg-white border-slate-200" : "bg-slate-100 border-slate-200 opacity-80"}`}
      style={isPlan ? { borderLeft: "3px solid #6366f1" } : undefined}>
      <div className="flex items-center gap-2">
        <HoverImage url={img} size={28} previewSize={224} />
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-semibold truncate ${isPlan ? "text-slate-800" : "text-slate-500"}`}>{sku || name || moNo}</div>
          <div className="text-[10px] text-slate-400 truncate">{moNo}{rate > 0 ? ` · ${baht(rate)}/ชิ้น` : ""}</div>
        </div>
        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-md ${isPlan ? "bg-indigo-50 text-indigo-700" : "bg-slate-200 text-slate-500"}`}>
          {isPlan ? "แผน" : "🔒 ของจริง"}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
        <span className={`text-[11px] px-1.5 py-0.5 rounded-md ${isPlan ? "bg-slate-50 text-slate-600" : "bg-white/70 text-slate-500"}`}>
          {fmt(qty)} ชิ้น{recv > 0 ? ` · ส่งแล้ว ${fmt(recv)}` : ""}
        </span>
        {worker && <span className="text-[10px] text-violet-600 truncate">👤 {worker}</span>}
        {rate > 0 && qty > 0 && <span className="text-[10px] text-slate-400 ml-auto">รวม {baht(rate * qty)}</span>}
      </div>
    </div>
  );
}
