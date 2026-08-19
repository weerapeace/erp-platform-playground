"use client";

/**
 * มุมมอง "แคนวาส" ของบอร์ดจ่ายงาน — กระดานวาดแบบเดียวกับกระดานแคมเปญ (Excalidraw)
 *  • 1 กระดาน = 1 แผนจ่ายงาน (entity_type = "work_board", entity_id = <plan id>)
 *  • เปิดครั้งแรก ระบบวางโครงให้เอง: กรอบ (Section) 1 กรอบ = 1 โต๊ะ · ในกรอบมีการ์ดงานตามแผน + การ์ดของจริง
 *  • การ์ด = รูปสินค้า + รหัส/ชื่อ + จำนวน × ค่าแรง/ชิ้น = ค่าแรงรวมของใบนั้น
 *  • หัวกรอบสรุปให้อัตโนมัติ: "โต๊ะขาล · แผน 320 ชิ้น ฿12,340 · จริง 120 ชิ้น ฿5,600" (อัปเดตทุกครั้งที่โยนการ์ดเข้า/ออก)
 *  • โยนการ์ดเข้ากรอบ → snap เข้าช่องกริดให้เอง + กรอบยืดสูงตามจำนวนการ์ด
 *  • การ์ดของจริง (ใบจ่ายงานที่จ่ายไปแล้ว) = สีเทา 🔒 ล็อกไว้ ลาก/แก้ไม่ได้
 *  • ลากการ์ด "แผน" ข้ามกรอบ → หลังกระดานบันทึกอัตโนมัติ ระบบเขียนกลับเข้าแผนจ่ายงานให้เอง
 *  • ดับเบิลคลิกการ์ด = เปิดรายละเอียดงาน (แผน) / ป๊อปรับงาน (ของจริง)
 * ของกลาง: CanvasSketch (components/canvas-sketch) · ConfirmDialog · apiFetch · useToast
 * ตรรกะ snap/ค่าแรง/ย้ายโต๊ะ อยู่ที่ lib/work-board-canvas.ts (มีเทสต์)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamicImport from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { withImageWidth } from "@/lib/r2-image";
import {
  deskOfPlanCards, diffDeskMoves, layoutDesks, slotPos, frameHeight,
  CARD_W, CARD_H, FRAME_W, FRAME_GAP, type CanvasEl,
} from "@/lib/work-board-canvas";
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
  labor?: { prod_plan: number; prod_actual: number };
};

const NO_DESK = "__no_desk__";
const IMG = 52;
const PLAN_STROKE = "#6366f1", PLAN_BG = "#ffffff";
const REAL_STROKE = "#94a3b8", REAL_BG = "#e2e8f0";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const baht = (n: number) => "฿" + fmt(Math.round(n));
// ตัดชื่อยาวให้พอดีการ์ด (Excalidraw ไม่ตัดบรรทัดเอง · ไทยไม่มีเว้นวรรค → ตัดตามตัวอักษร)
const clip = (s: string | null | undefined, max = 22) => {
  const v = (s ?? "").trim(); if (!v) return "";
  return v.length <= max ? v : v.slice(0, max - 1) + "…";
};

type CardSpec = {
  key: string;                       // ไอดีที่ใช้ผูก element ในชุดเดียวกัน
  kind: "wb_plan" | "wb_real";
  id: string;
  lines: string[];                   // ข้อความในการ์ด (บรรทัดละอย่าง)
  img: string | null;
  data: Record<string, unknown>;     // snapshot ของการ์ด (มี qty/labor ให้หัวกรอบเอาไปรวม)
};

// วัดสัดส่วนรูปทุกใบพร้อมกัน (ขนาน) — ทำเองแทนที่จะให้ insert วัดทีละใบ (100+ ใบจะรอนาน)
// รูปที่โหลดไม่ได้/ช้าเกิน 5 วิ → ถือว่าจัตุรัส (1:1) การ์ดยังขึ้นครบ ไม่ค้าง
async function measureRatios(urls: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const list = [...new Set(urls.filter(Boolean))];
  await Promise.all(list.map((u) => new Promise<void>((done) => {
    const im = new Image();
    const finish = (r: number) => { out.set(u, r > 0 ? r : 1); done(); };
    const timer = setTimeout(() => finish(1), 5000);
    im.onload = () => { clearTimeout(timer); finish((im.naturalWidth || 1) / (im.naturalHeight || 1)); };
    im.onerror = () => { clearTimeout(timer); finish(1); };
    im.src = u;
  })));
  return out;
}

// การ์ด 1 ใบ = กรอบ + รูปย่อ + ข้อความ (จัดกลุ่มเดียวกัน) — คืน skeleton + id ของ element ทั้งหมด (ให้ frame ใช้เป็น children)
function cardSkeleton(c: CardSpec, x: number, y: number, ratio = 1): { els: Record<string, unknown>[]; ids: string[] } {
  const gid = `g-${c.key}`;
  const locked = c.kind === "wb_real";                 // ของจริง = ล็อก ลาก/แก้ไม่ได้
  const rectId = `${c.key}-r`, imgId = `${c.key}-i`, textId = `${c.key}-t`;
  const els: Record<string, unknown>[] = [
    { type: "rectangle", id: rectId, x, y, width: CARD_W, height: CARD_H, backgroundColor: locked ? REAL_BG : PLAN_BG,
      strokeColor: locked ? REAL_STROKE : PLAN_STROKE, fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], locked, customData: c.data },
  ];
  const ids = [rectId];
  if (c.img) {
    // จัดรูปให้พอดีกรอบสี่เหลี่ยม IMG×IMG แบบคงสัดส่วน (ไม่ยืดเบี้ยว) + จัดกึ่งกลาง
    let iw = IMG, ih = IMG / (ratio || 1);
    if (ih > IMG) { ih = IMG; iw = IMG * (ratio || 1); }
    els.push({ type: "image", id: imgId, _imageUrl: c.img, x: x + 12 + (IMG - iw) / 2, y: y + 18 + (IMG - ih) / 2,
      width: iw, height: ih, groupIds: [gid], locked, customData: c.data });
    ids.push(imgId);
  }
  const tx = x + (c.img ? IMG + 22 : 14);
  els.push({ type: "text", id: textId, x: tx, y: y + 12, width: x + CARD_W - 12 - tx, text: c.lines.filter(Boolean).join("\n"),
    fontSize: 12, strokeColor: locked ? "#475569" : "#1e293b", groupIds: [gid], locked, customData: c.data });
  ids.push(textId);
  return { els, ids };
}

export function CanvasView({
  departments, realWOs, plans, canEdit, imageByMo, laborPerUnit, onOpenWO, onOpenWork,
}: {
  departments: DeptLite[];
  realWOs: WOLite[];
  plans: DispatchPlan[];
  canEdit: boolean;
  imageByMo: Record<string, string | null>;
  laborPerUnit: Record<string, number>;   // mo_no → ค่าแรงผลิต/ชิ้น (ราคากลางจาก BOM ก่อน)
  onOpenWO?: (id: string) => void;
  onOpenWork?: (info: { moId: string | null; moNo: string | null; productSku: string | null; productName: string | null; qty: number }) => void;
}) {
  const toast = useToast();
  const ref = useRef<CanvasSketchControls | null>(null);
  const [planId, setPlanId] = useState<string>("");
  const [lines, setLines] = useState<DispatchPlanLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [askRebuild, setAskRebuild] = useState(false);
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

  const planCard = useCallback((l: DispatchPlanLine): CardSpec => {
    const qty = Number(l.qty) || 0;
    const rate = laborPerUnit[String(l.mo_no ?? "")] ?? 0;
    const labor = qty * rate;
    return {
      key: `plan-${l.id}`, kind: "wb_plan", id: l.id,
      lines: [
        `📋 ${l.product_sku ?? l.mo_no ?? "—"}`,
        clip(l.product_name),
        rate > 0 ? `${fmt(qty)} ชิ้น × ${baht(rate)} = ${baht(labor)}` : `${fmt(qty)} ชิ้น · ยังไม่ตั้งค่าแรง`,
        l.assignee_name ? `👤 ${clip(l.assignee_name, 16)}` : "",
      ],
      img: withImageWidth(imageByMo[String(l.mo_no ?? "")] ?? null, 160),
      data: { kind: "wb_plan", id: l.id, mo_id: l.mo_id, mo_no: l.mo_no, product_sku: l.product_sku, product_name: l.product_name, qty, labor },
    };
  }, [imageByMo, laborPerUnit]);

  const realCard = useCallback((w: WOLite): CardSpec => {
    const qty = Number(w.qty) || 0, recv = Number(w.received_qty) || 0;
    const rate = laborPerUnit[String(w.mo_no)] ?? 0;
    // ค่าแรงใบจ่ายงานจริง — ยึดสูตรเดียวกับหน้าแผน (จริง → แผน → จำนวน × เรตกลาง) ตัวเลขจะได้ตรงกันทุกมุมมอง
    const labor = w.labor?.prod_actual || w.labor?.prod_plan || qty * rate;
    return {
      key: `real-${w.id}`, kind: "wb_real", id: w.id,
      lines: [
        `🔒 ${w.product_sku ?? w.mo_no}`,
        clip(w.product_name),
        labor > 0 ? `${fmt(qty)} ชิ้น · ค่าแรง ${baht(labor)}` : `${fmt(qty)} ชิ้น`,
        [recv > 0 ? `ส่งแล้ว ${fmt(recv)}` : "", w.assignee_name ? `👤 ${clip(w.assignee_name, 14)}` : ""].filter(Boolean).join("  ·  "),
      ],
      img: withImageWidth(w.image_url ?? imageByMo[String(w.mo_no)] ?? null, 160),
      data: { kind: "wb_real", id: w.id, wo_no: w.wo_no ?? null, mo_no: w.mo_no, product_sku: w.product_sku, product_name: w.product_name, qty, labor },
    };
  }, [imageByMo, laborPerUnit]);

  // งานของแต่ละโต๊ะ (แผนก่อน แล้วค่อยของจริง) + กองท้ายสำหรับงานที่ยังไม่ระบุโต๊ะ
  const byDesk = useMemo(() => {
    const m = new Map<string, CardSpec[]>();
    const put = (k: string, c: CardSpec) => { const a = m.get(k) ?? []; a.push(c); m.set(k, a); };
    for (const l of lines) put(l.department_id && deptIds.has(l.department_id) ? l.department_id : NO_DESK, planCard(l));
    for (const w of activeWOs) put(w.department_id && deptIds.has(w.department_id) ? w.department_id : NO_DESK, realCard(w));
    return m;
  }, [lines, activeWOs, deptIds, planCard, realCard]);

  // ชื่อหัวกรอบ = ชื่อโต๊ะ + สรุปจำนวน/ค่าแรง (ส่วนหลัง " · " ระบบเขียนเอง)
  const frameLabel = useCallback((f: { deptId: string | null; planQty: number; planLabor: number; realQty: number; realLabor: number }) => {
    const base = f.deptId ? (departments.find((d) => d.id === f.deptId)?.name ?? "โต๊ะ") : "🆕 ยังไม่ระบุโต๊ะ";
    const parts = [base];
    // ค่าแรงยังไม่ได้ตั้ง (฿0) → ไม่ต้องขึ้นเลขศูนย์ให้รก โชว์แค่จำนวนชิ้น
    if (f.planQty > 0) parts.push(`แผน ${fmt(f.planQty)} ชิ้น${f.planLabor > 0 ? " " + baht(f.planLabor) : ""}`);
    if (f.realQty > 0) parts.push(`จริง ${fmt(f.realQty)} ชิ้น${f.realLabor > 0 ? " " + baht(f.realLabor) : ""}`);
    return parts.join(" · ");
  }, [departments]);

  // ---- วางโครงทั้งกระดาน (กรอบโต๊ะ + การ์ดในกรอบ) ----
  const seedSkeletons = useCallback((ratios?: Map<string, number>): Record<string, unknown>[] => {
    const out: Record<string, unknown>[] = [];
    const desks: { id: string; name: string }[] = [
      ...departments.map((d) => ({ id: d.id, name: d.name })),
      ...((byDesk.get(NO_DESK)?.length ?? 0) > 0 ? [{ id: NO_DESK, name: "🆕 ยังไม่ระบุโต๊ะ" }] : []),
    ];
    desks.forEach((d, i) => {
      const cards = byDesk.get(d.id) ?? [];
      const fx = i * (FRAME_W + FRAME_GAP), fy = 0;
      const children: string[] = [];
      cards.forEach((c, j) => {
        const slot = slotPos(fx, fy, j);
        const { els, ids } = cardSkeleton(c, slot.x, slot.y, c.img ? (ratios?.get(c.img) ?? 1) : 1);
        out.push(...els); children.push(...ids);
      });
      out.push({ type: "frame", id: `frame-${d.id}`, children, name: d.name, x: fx, y: fy, width: FRAME_W, height: frameHeight(cards.length),
        customData: { kind: "wb_desk", id: d.id === NO_DESK ? "" : d.id } });
    });
    return out;
  }, [departments, byDesk]);

  // ---- snap การ์ดเข้าช่อง + เขียนหัวกรอบ (จำนวน/ค่าแรง) ----
  const applyLayout = useCallback(() => {
    const c = ref.current; if (!c || !editable) return;
    const { moves, frames } = layoutDesks(c.getElements() as CanvasEl[], departments);
    if (!moves.length && !frames.length) return;
    const moveMap = new Map(moves.map((m) => [m.id, m]));
    const frameMap = new Map(frames.map((f) => [f.id, f]));
    c.patchElements((el) => {
      const id = String(el.id ?? "");
      const m = moveMap.get(id); if (m) return { x: m.x, y: m.y };
      const f = frameMap.get(id);
      if (!f) return null;
      const p: Record<string, unknown> = { name: frameLabel(f) };
      if (f.height != null) p.height = f.height;
      // กรอบที่รู้จักจาก "ชื่อ" เฉย ๆ (ผู้ใช้วาดเอง) → ประทับให้ถาวร จะได้ไม่หลุดตอนหัวกรอบมีตัวเลขต่อท้าย
      if (f.stampDesk) p.customData = { kind: "wb_desk", id: f.deptId ?? "" };
      return p;
    });
  }, [departments, editable, frameLabel]);

  // ---- ซิงค์: มีอะไรใหม่เพิ่มเข้ามา / อันไหนหายไป / ข้อความเปลี่ยน ----
  const syncBoard = useCallback(async (silent = false) => {
    const c = ref.current; if (!c) return;
    const cards = c.listCards();
    const already = cards.some((x) => x.kind === "wb_plan" || x.kind === "wb_real" || x.kind === "wb_desk");
    if (!already) {                                     // กระดานเปล่า → วางโครงให้ทั้งชุด
      const ratios = await measureRatios([...byDesk.values()].flat().map((c) => c.img ?? ""));
      const sk = seedSkeletons(ratios);
      if (sk.length) { await c.insert(sk, { fitImages: false }); if (!silent) toast.success("วางโครงกระดานตามแผนให้แล้ว"); }
      return;
    }
    const planIds = new Set(lines.map((l) => l.id));
    const woIds = new Set(activeWOs.map((w) => w.id));
    // 1) การ์ดที่ไม่มีในข้อมูลแล้ว (ลบออกจากแผน / รับงานครบ) → เอาออกจากกระดาน
    c.removeCards((card) => (card.kind === "wb_plan" && !planIds.has(card.id)) || (card.kind === "wb_real" && !woIds.has(card.id)));
    // 2) การ์ดเดิม → อัปเดตข้อความ/ค่าแรงให้ตรงข้อมูลล่าสุด
    const specOf = new Map<string, CardSpec>();
    for (const l of lines) specOf.set(`wb_plan:${l.id}`, planCard(l));
    for (const w of activeWOs) specOf.set(`wb_real:${w.id}`, realCard(w));
    await c.refreshCards(async (card) => {
      const s = specOf.get(`${card.kind}:${card.id}`); if (!s) return null;
      return { text: s.lines.filter(Boolean).join("\n"), data: s.data };
    });
    // 3) งานใหม่ที่ยังไม่มีการ์ด → วางไว้กลางจอให้ลากเข้าโต๊ะ
    const on = new Set(cards.map((x) => `${x.kind}:${String(x.data.id ?? "")}`));
    const missing = [...specOf.entries()].filter(([k]) => !on.has(k)).map(([, s]) => s);
    if (missing.length) {
      const sk: Record<string, unknown>[] = [];
      const ratios = await measureRatios(missing.map((s) => s.img ?? ""));
      missing.forEach((s, i) => { sk.push(...cardSkeleton(s, (i % 2) * (CARD_W + 16), Math.floor(i / 2) * (CARD_H + 12), s.img ? (ratios.get(s.img) ?? 1) : 1).els); });
      await c.insert(sk, { fitImages: false });
      toast.info(`มีงานใหม่ ${missing.length} ใบ — วางไว้กลางจอ ลากเข้ากรอบโต๊ะได้เลย`);
    } else if (!silent) toast.success("กระดานตรงกับข้อมูลล่าสุดแล้ว");
  }, [lines, activeWOs, byDesk, seedSkeletons, planCard, realCard, toast]);

  // ---- วางโครงใหม่ทั้งกระดาน (เก็บของที่วาดเอง ลบเฉพาะการ์ด/กรอบของระบบ) ----
  const rebuild = useCallback(async () => {
    const c = ref.current; if (!c) return;
    setAskRebuild(false); setBusy(true);
    try {
      c.removeCards((card) => card.kind === "wb_plan" || card.kind === "wb_real");
      c.patchElements((el) => {
        const d = el.customData as { kind?: string } | undefined | null;
        return d?.kind === "wb_desk" ? { isDeleted: true } : null;
      });
      deskSeen.current = new Map();
      const ratios = await measureRatios([...byDesk.values()].flat().map((x) => x.img ?? ""));
      const sk = seedSkeletons(ratios);
      if (sk.length) await c.insert(sk, { fitImages: false });
      toast.success("วางโครงกระดานใหม่แล้ว");
    } finally { setBusy(false); }
  }, [byDesk, seedSkeletons, toast]);

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

  // กระดานพร้อม → วางโครง/ซิงค์ แล้วจำตำแหน่งตั้งต้น
  // ⚠️ onReady อาจมาถึงก่อน controlsRef ถูกผูก (คนละ effect) — ถ้าไม่รอ จะกลายเป็น "เปิดมาแล้วกระดานว่าง ไม่วางโครงให้"
  const onBoardReady = useCallback(async () => {
    for (let i = 0; i < 40 && !ref.current; i++) await new Promise((r) => setTimeout(r, 50));
    if (!ref.current) return;
    await syncBoard(true);
    observeDesks(false);
    applyLayout();
  }, [syncBoard, observeDesks, applyLayout]);

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
      {/* แถบเครื่องมือ — เลือกแผน · ซิงค์ · วางโครงใหม่ */}
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
        {editable && (
          <button onClick={() => setAskRebuild(true)} disabled={busy || loading} title="ล้างการ์ด/กรอบของระบบแล้ววางใหม่ตามข้อมูลล่าสุด (โน้ต/รูปที่วาดเองไม่หาย)"
            className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50">🧱 วางโครงใหม่</button>
        )}
        <span className="text-[11px] text-slate-400">
          1 กรอบ = 1 โต๊ะ · ลากการ์ด <b className="text-indigo-500">แผน</b> เข้ากรอบ = เข้าช่องให้เอง + บันทึกเข้าแผน + หัวกรอบรวมค่าแรงใหม่ · การ์ด <b>สีเทา 🔒</b> = ของจริง ย้ายไม่ได้ · ดับเบิลคลิก = ดูรายละเอียด
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
          onReady={() => { void onBoardReady(); }}
          onSaved={() => { observeDesks(editable); applyLayout(); }}
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

      <ConfirmDialog open={askRebuild} onClose={() => setAskRebuild(false)} onConfirm={() => void rebuild()}
        title="วางโครงกระดานใหม่?"
        message="ระบบจะลบการ์ดงานและกรอบโต๊ะทั้งหมดบนกระดานนี้ แล้ววางใหม่ตามข้อมูลล่าสุด (โน้ต/รูป/เส้นที่วาดเองไม่หาย) — ข้อมูลในแผนจ่ายงานไม่ถูกแตะต้อง"
        confirmText="วางโครงใหม่" />
    </div>
  );
}
