"use client";

/**
 * มุมมอง "แคนวาส" ของบอร์ดจ่ายงาน — กระดานวาดแบบเดียวกับกระดานแคมเปญ (Excalidraw)
 *  • 1 กระดาน = 1 แผนจ่ายงาน (entity_type = "work_board", entity_id = <plan id>)
 *  • เปิดครั้งแรก ระบบวางโครงให้เอง: กรอบ (Section) 1 กรอบ = 1 โต๊ะ · ในกรอบมีการ์ดงานตามแผน + การ์ดของจริง
 *  • การ์ดของจริง (ใบจ่ายงานที่จ่ายไปแล้ว) = สีเทา 🔒 ล็อกไว้ ลาก/แก้ไม่ได้
 *  • ลากการ์ด "แผน" ข้ามไปกรอบโต๊ะอื่น → หลังกระดานบันทึกอัตโนมัติ ระบบเขียนกลับเข้าแผนจ่ายงานให้เอง
 *  • ดับเบิลคลิกการ์ด = เปิดรายละเอียดงาน (แผน) / ป๊อปรับงาน (ของจริง)
 * ของกลาง: CanvasSketch (components/canvas-sketch) · apiFetch · useToast
 * ห้ามเขียนกระดานวาดเองซ้ำในโมดูล — ต่อยอดที่ CanvasSketch
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamicImport from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { withImageWidth } from "@/lib/r2-image";
import { deskOfPlanCards, diffDeskMoves, type CanvasEl } from "@/lib/work-board-canvas";
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import type { DispatchPlan, DispatchPlanLine } from "@/app/api/mo/dispatch-plans/route";

// Excalidraw ก้อนใหญ่ — โหลดเฉพาะตอนเปิดแท็บนี้ (ไม่ถ่วงมุมมองอื่นของบอร์ด)
const CanvasSketch = dynamicImport(() => import("@/components/canvas-sketch").then((m) => m.CanvasSketch), {
  ssr: false,
  loading: () => <div className="h-[60vh] flex items-center justify-center text-slate-400 text-sm border border-slate-200 rounded-xl">กำลังเปิดกระดาน…</div>,
});

type DeptLite = { id: string; name: string };
type WOLite = {
  id: string; wo_no?: string; mo_no: string; mo_id?: string | null;
  product_sku: string | null; product_name: string | null;
  department_id: string | null; department_name: string | null; assignee_name: string | null;
  qty: number; received_qty: number; status: string; image_url?: string | null;
};

// ---- ขนาด/สีของโครงกระดาน ----
const CARD_W = 250, CARD_H = 78, IMG = 56, GAPX = 16, GAPY = 14, COLS = 2;
const FRAME_HEAD = 46, FRAME_W = COLS * CARD_W + (COLS + 1) * GAPX, FRAME_GAP = 56;
const PLAN_STROKE = "#6366f1", PLAN_BG = "#ffffff";
const REAL_STROKE = "#94a3b8", REAL_BG = "#e2e8f0";
const NO_DESK = "__no_desk__";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
// ตัดชื่อยาวให้พอดีการ์ด (Excalidraw ไม่ตัดบรรทัดเอง · ไทยไม่มีเว้นวรรค → ตัดตามตัวอักษร)
const clip = (s: string | null | undefined, max = 24) => {
  const v = (s ?? "").trim(); if (!v) return "";
  return v.length <= max ? v : v.slice(0, max - 1) + "…";
};

type CardSpec = {
  key: string;                       // ไอดีที่ใช้ผูก element ในชุดเดียวกัน
  kind: "wb_plan" | "wb_real";
  id: string;
  title: string; name: string; meta: string;
  img: string | null;
  data: Record<string, unknown>;
};

// การ์ด 1 ใบ = กรอบ + รูปย่อ + ข้อความ (จัดกลุ่มเดียวกัน) — คืน skeleton + id ของ element ทั้งหมด (ให้ frame ใช้เป็น children)
function cardSkeleton(c: CardSpec, x: number, y: number): { els: Record<string, unknown>[]; ids: string[] } {
  const gid = `g-${c.key}`;
  const locked = c.kind === "wb_real";
  const stroke = locked ? REAL_STROKE : PLAN_STROKE;
  const rectId = `${c.key}-r`, imgId = `${c.key}-i`, textId = `${c.key}-t`;
  const text = [c.title, c.name, c.meta].filter(Boolean).join("\n");
  const els: Record<string, unknown>[] = [
    { type: "rectangle", id: rectId, x, y, width: CARD_W, height: CARD_H, backgroundColor: locked ? REAL_BG : PLAN_BG,
      strokeColor: stroke, fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], locked, customData: c.data },
  ];
  const ids = [rectId];
  if (c.img) {
    els.push({ type: "image", id: imgId, _imageUrl: c.img, x: x + 8, y: y + (CARD_H - IMG) / 2, width: IMG, height: IMG, groupIds: [gid], locked, customData: c.data });
    ids.push(imgId);
  }
  const tx = x + (c.img ? IMG + 18 : 12);
  els.push({ type: "text", id: textId, x: tx, y: y + 11, width: x + CARD_W - 12 - tx, text, fontSize: 12,
    strokeColor: locked ? "#475569" : "#1e293b", groupIds: [gid], locked, customData: c.data });
  ids.push(textId);
  return { els, ids };
}

export function CanvasView({
  departments, realWOs, plans, canEdit, imageByMo, onOpenWO, onOpenWork,
}: {
  departments: DeptLite[];
  realWOs: WOLite[];
  plans: DispatchPlan[];
  canEdit: boolean;
  imageByMo: Record<string, string | null>;
  onOpenWO?: (id: string) => void;
  onOpenWork?: (info: { moId: string | null; moNo: string | null; productSku: string | null; productName: string | null; qty: number }) => void;
}) {
  const toast = useToast();
  const ref = useRef<CanvasSketchControls | null>(null);
  const [planId, setPlanId] = useState<string>("");
  const [lines, setLines] = useState<DispatchPlanLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  // โต๊ะล่าสุดของการ์ดแผนแต่ละใบ "ตามที่เห็นบนกระดาน" — ใช้จับว่าผู้ใช้ลากย้ายโต๊ะ (ไม่ใช่ค่าจาก DB)
  const deskSeen = useRef<Map<string, string | null>>(new Map());

  // แผนที่เลือก — ค่าเริ่มต้นคือแผนแรกที่ยังแก้ได้
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
  useEffect(() => { deskSeen.current = new Map(); void load(); }, [load]);

  // ---- ข้อมูลที่จะกลายเป็นการ์ด ----
  const deptIds = useMemo(() => new Set(departments.map((d) => d.id)), [departments]);
  const activeWOs = useMemo(() => realWOs.filter((w) => w.status !== "done"), [realWOs]);   // ส่งครบแล้ว = ออกจากโต๊ะ

  const planCard = useCallback((l: DispatchPlanLine): CardSpec => ({
    key: `plan-${l.id}`, kind: "wb_plan", id: l.id,
    title: `📋 ${l.product_sku ?? l.mo_no ?? "—"}`,
    name: clip(l.product_name),
    meta: [`${fmt(Number(l.qty) || 0)} ชิ้น`, l.assignee_name ? `👤 ${clip(l.assignee_name, 12)}` : null].filter(Boolean).join("  ·  "),
    img: withImageWidth(imageByMo[String(l.mo_no ?? "")] ?? null, 160),
    data: { kind: "wb_plan", id: l.id, mo_id: l.mo_id, mo_no: l.mo_no, product_sku: l.product_sku, product_name: l.product_name, qty: Number(l.qty) || 0 },
  }), [imageByMo]);

  const realCard = useCallback((w: WOLite): CardSpec => {
    const recv = Number(w.received_qty) || 0;
    return {
      key: `real-${w.id}`, kind: "wb_real", id: w.id,
      title: `🔒 ${w.product_sku ?? w.mo_no}`,
      name: clip(w.product_name),
      meta: [`${fmt(Number(w.qty) || 0)} ชิ้น`, recv > 0 ? `ส่งแล้ว ${fmt(recv)}` : null, w.assignee_name ? `👤 ${clip(w.assignee_name, 12)}` : null].filter(Boolean).join("  ·  "),
      img: withImageWidth(w.image_url ?? imageByMo[String(w.mo_no)] ?? null, 160),
      data: { kind: "wb_real", id: w.id, wo_no: w.wo_no ?? null, mo_no: w.mo_no, product_sku: w.product_sku, product_name: w.product_name, qty: Number(w.qty) || 0 },
    };
  }, [imageByMo]);

  // งานของแต่ละโต๊ะ (แผนก่อน แล้วค่อยของจริง) + กองท้ายสำหรับงานที่ยังไม่ระบุโต๊ะ
  const byDesk = useMemo(() => {
    const m = new Map<string, CardSpec[]>();
    const put = (k: string, c: CardSpec) => { const a = m.get(k) ?? []; a.push(c); m.set(k, a); };
    for (const l of lines) put(l.department_id && deptIds.has(l.department_id) ? l.department_id : NO_DESK, planCard(l));
    for (const w of activeWOs) put(w.department_id && deptIds.has(w.department_id) ? w.department_id : NO_DESK, realCard(w));
    return m;
  }, [lines, activeWOs, deptIds, planCard, realCard]);

  // ---- วางโครงทั้งกระดาน (กรอบโต๊ะ + การ์ดในกรอบ) ----
  const seedSkeletons = useCallback((): Record<string, unknown>[] => {
    const out: Record<string, unknown>[] = [];
    const desks: { id: string; name: string }[] = [
      ...departments.map((d) => ({ id: d.id, name: d.name })),
      ...((byDesk.get(NO_DESK)?.length ?? 0) > 0 ? [{ id: NO_DESK, name: "🆕 ยังไม่ระบุโต๊ะ" }] : []),
    ];
    desks.forEach((d, i) => {
      const cards = byDesk.get(d.id) ?? [];
      const rows = Math.max(1, Math.ceil(cards.length / COLS));
      const fx = i * (FRAME_W + FRAME_GAP), fy = 0;
      const fh = FRAME_HEAD + rows * (CARD_H + GAPY) + GAPY;
      const children: string[] = [];
      cards.forEach((c, j) => {
        const cx = fx + GAPX + (j % COLS) * (CARD_W + GAPX);
        const cy = fy + FRAME_HEAD + Math.floor(j / COLS) * (CARD_H + GAPY);
        const { els, ids } = cardSkeleton(c, cx, cy);
        out.push(...els); children.push(...ids);
      });
      out.push({ type: "frame", id: `frame-${d.id}`, children, name: d.name, x: fx, y: fy, width: FRAME_W, height: fh,
        customData: { kind: "wb_desk", id: d.id === NO_DESK ? "" : d.id } });
    });
    return out;
  }, [departments, byDesk]);

  // ---- ซิงค์: มีอะไรใหม่เพิ่มเข้ามา / อันไหนหายไป / ข้อความเปลี่ยน ----
  const syncBoard = useCallback(async (silent = false) => {
    const c = ref.current; if (!c) return;
    const cards = c.listCards();
    const already = cards.some((x) => x.kind === "wb_plan" || x.kind === "wb_real" || x.kind === "wb_desk");
    if (!already) {                                     // กระดานเปล่า → วางโครงให้ทั้งชุด
      const sk = seedSkeletons();
      if (sk.length) { await c.insert(sk); if (!silent) toast.success("วางโครงกระดานตามแผนให้แล้ว"); }
      return;
    }
    const planIds = new Set(lines.map((l) => l.id));
    const woIds = new Set(activeWOs.map((w) => w.id));
    // 1) การ์ดที่ไม่มีในข้อมูลแล้ว (ลบออกจากแผน / รับงานครบ) → เอาออกจากกระดาน
    c.removeCards((card) => (card.kind === "wb_plan" && !planIds.has(card.id)) || (card.kind === "wb_real" && !woIds.has(card.id)));
    // 2) การ์ดเดิม → อัปเดตข้อความให้ตรงข้อมูลล่าสุด (จำนวน/ช่าง/ส่งแล้ว)
    const specOf = new Map<string, CardSpec>();
    for (const l of lines) specOf.set(`wb_plan:${l.id}`, planCard(l));
    for (const w of activeWOs) specOf.set(`wb_real:${w.id}`, realCard(w));
    await c.refreshCards(async (card) => {
      const s = specOf.get(`${card.kind}:${card.id}`); if (!s) return null;
      return { text: [s.title, s.name, s.meta].filter(Boolean).join("\n"), data: s.data };
    });
    // 3) งานใหม่ที่ยังไม่มีการ์ด → วางไว้กลางจอให้ลากเข้าโต๊ะ
    const on = new Set(cards.map((x) => `${x.kind}:${String(x.data.id ?? "")}`));
    const missing = [...specOf.entries()].filter(([k]) => !on.has(k)).map(([, s]) => s);
    if (missing.length) {
      const sk: Record<string, unknown>[] = [];
      missing.forEach((s, i) => { sk.push(...cardSkeleton(s, (i % COLS) * (CARD_W + GAPX), Math.floor(i / COLS) * (CARD_H + GAPY)).els); });
      await c.insert(sk);
      toast.info(`มีงานใหม่ ${missing.length} ใบ — วางไว้กลางจอ ลากเข้ากรอบโต๊ะได้เลย`);
    } else if (!silent) toast.success("กระดานตรงกับข้อมูลล่าสุดแล้ว");
  }, [lines, activeWOs, seedSkeletons, planCard, realCard, toast]);

  // ---- เขียนกลับ: ลากการ์ดแผนข้ามกรอบโต๊ะ = ย้ายโต๊ะในแผนจริง ----
  const moveLine = useCallback(async (lineId: string, deptId: string | null) => {
    const dept = departments.find((d) => d.id === deptId) ?? null;
    const before = lines.find((l) => l.id === lineId) ?? null;
    setLines((ls) => ls.map((l) => l.id === lineId ? { ...l, department_id: dept?.id ?? null, department_name: dept?.name ?? null, assignee_id: null, assignee_name: null } : l));
    try {
      const res = await apiFetch(`/api/mo/dispatch-plans/${planId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_line", lineId, department_id: dept?.id ?? null, department_name: dept?.name ?? null }),
      });
      const j = await res.json(); if (j?.error) throw new Error(j.error);
      toast.success(`ย้ายเข้า ${dept?.name ?? "ยังไม่ระบุโต๊ะ"} แล้ว`);
    } catch (e) {
      if (before) setLines((ls) => ls.map((l) => l.id === lineId ? before : l));
      toast.error(e instanceof Error ? e.message : "ย้ายโต๊ะไม่สำเร็จ (กระดานยังแสดงตำแหน่งใหม่ ลองกดซิงค์)");
    }
  }, [departments, lines, planId, toast]);

  // อ่านกระดาน → การ์ดแผนใบไหนอยู่กรอบโต๊ะไหน · write=false = แค่จำไว้เป็นจุดตั้งต้น (ไม่บันทึกอะไร)
  const observeDesks = useCallback((write: boolean) => {
    const c = ref.current; if (!c) return;
    const now = deskOfPlanCards(c.getElements() as CanvasEl[], departments);
    const moves = write ? diffDeskMoves(now, deskSeen.current) : [];
    for (const [lineId, desk] of now) deskSeen.current.set(lineId, desk);
    for (const m of moves) void moveLine(m.lineId, m.deptId);
  }, [departments, moveLine]);

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
      {/* แถบเครื่องมือ — เลือกแผน · ซิงค์งานเข้ากระดาน */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} title="เลือกแผนงาน — 1 แผน = 1 กระดาน"
          className="h-9 px-2 text-sm font-medium border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          {plans.map((p) => <option key={p.id} value={p.id}>📅 {p.name}{p.status === "applied" ? " (ดันเป็นของจริงแล้ว)" : ""}</option>)}
        </select>
        <button onClick={() => { setBusy(true); void load().then(() => syncBoard()).finally(() => setBusy(false)); }} disabled={busy || loading}
          title="ดึงงานล่าสุดจากแผน + ใบจ่ายงานจริง มาลงกระดาน (ของที่วาดเองไม่หาย)"
          className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          {busy ? "⏳ กำลังซิงค์…" : "🔄 ซิงค์งานเข้ากระดาน"}
        </button>
        <span className="text-[11px] text-slate-400">
          1 กรอบ = 1 โต๊ะ · การ์ด <b className="text-indigo-500">แผน</b> ลากข้ามโต๊ะได้ (ระบบบันทึกเข้าแผนให้เอง) · การ์ด <b>สีเทา 🔒</b> = ของจริง ย้ายไม่ได้ · ดับเบิลคลิกการ์ด = ดูรายละเอียด
        </span>
      </div>

      {loading ? <div className="text-center py-16 text-slate-400 text-sm">กำลังโหลดแผน…</div> : (
        <CanvasSketch
          key={planId}
          entityType="work_board"
          entityId={planId}
          editable={editable}
          collab
          height="calc(100vh - 250px)"
          controlsRef={ref}
          onReady={() => { void (async () => { await syncBoard(true); observeDesks(false); })(); }}
          onSaved={() => observeDesks(editable)}
          onCardOpen={(d) => {
            if (d?.kind === "wb_real") { onOpenWO?.(String(d.id ?? "")); return; }
            if (d?.kind === "wb_plan") {
              onOpenWork?.({
                moId: d.mo_id ? String(d.mo_id) : null, moNo: d.mo_no ? String(d.mo_no) : null,
                productSku: d.product_sku ? String(d.product_sku) : null, productName: d.product_name ? String(d.product_name) : null,
                qty: Number(d.qty) || 0,
              });
            }
          }}
        />
      )}
    </div>
  );
}
