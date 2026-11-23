"use client";

/**
 * เส้นบนกระดาน (ของกลางของ CanvasSketch) — เจ้าของเลือก 2026-11-23
 *  1) แถบปรับเส้นลอย ตอนเลือกเส้น/ลูกศร: หักฉาก / ตรง / โค้ง · 7 สี · เส้นประ · ✎ ข้อความบนเส้น · 🗑 ลบ (Ctrl+Z ย้อนได้)
 *  2) จุดเชื่อมรอบการ์ด/กล่อง: ชี้แล้วมีจุด 4 ด้าน → ลากไปปล่อยบนการ์ด/กล่องอื่น = ลูกศรหักฉากติดทั้งสองฝั่ง (ย้ายการ์ด เส้นตาม)
 *  (เส้นใหม่จากเครื่องมือลูกศรเป็นแบบหักฉากเป็นค่าเริ่ม — ตั้งที่ initialData ของ CanvasSketch)
 * ทำงานเองทั้งหมดผ่าน excalidraw API (subscribe onChange) — CanvasSketch แค่วาง <LineTools> ไว้ในกรอบกระดาน
 */
import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { useT } from "@/components/i18n";

/* eslint-disable @typescript-eslint/no-explicit-any */
type El = any;
const COLORS = ["#64748b", "#7c3aed", "#059669", "#2563eb", "#d97706", "#e11d48", "#0891b2"];
const SHAPES = new Set(["rectangle", "ellipse", "diamond"]);
type Side = "top" | "right" | "bottom" | "left";
const SIDE_FP: Record<Side, [number, number]> = { top: [0.5, 0], right: [1, 0.5], bottom: [0.5, 1], left: [0, 0.5] };

const isLine = (e: El) => e && !e.isDeleted && (e.type === "arrow" || e.type === "line");
const lineKind = (e: El): "elbow" | "straight" | "curve" => (e.elbowed ? "elbow" : e.roundness ? "curve" : "straight");
/** จุดบนกระดาน (scene) → พิกัดในกรอบกระดาน (px) */
const toView = (x: number, y: number, st: any) => ({ x: (x + st.scrollX) * st.zoom.value, y: (y + st.scrollY) * st.zoom.value });

/** เส้นทางหักฉากจาก a → b (ออกตามด้านเริ่มต้น) — จุดสัมพัทธ์กับ a */
function elbowPoints(a: { x: number; y: number }, b: { x: number; y: number }, startSide: Side): [number, number][] {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) return [[0, 0], [dx, dy]];
  if (startSide === "left" || startSide === "right") return [[0, 0], [dx / 2, 0], [dx / 2, dy], [dx, dy]];
  return [[0, 0], [0, dy / 2], [dx, dy / 2], [dx, dy]];
}
function sidePoint(el: El, side: Side) {
  const [fx, fy] = SIDE_FP[side];
  return { x: el.x + el.width * fx, y: el.y + el.height * fy };
}
function fixedPointOf(el: El, p: { x: number; y: number }): [number, number] {
  const c = (v: number) => Math.min(1, Math.max(0, v));
  return [c((p.x - el.x) / (el.width || 1)), c((p.y - el.y) / (el.height || 1))];
}

export function LineTools({ apiRef, wrapRef, enabled }: { apiRef: MutableRefObject<any>; wrapRef: RefObject<HTMLDivElement | null>; enabled: boolean }) {
  const t = useT();
  const [api, setApi] = useState<any>(null);
  const [, setTick] = useState(0);
  const libRef = useRef<any>(null);
  const [hover, setHover] = useState<El | null>(null);
  const [drag, setDrag] = useState<{ from: El; side: Side; x: number; y: number } | null>(null);
  const [labelEdit, setLabelEdit] = useState<string | null>(null);

  // รอ excalidraw API พร้อม แล้วฟังการเปลี่ยนแปลง (เลือก/เลื่อนจอ/ย่อขยาย) เพื่อขยับแถบตาม
  useEffect(() => {
    if (!enabled) return;
    let unsub: (() => void) | undefined;
    const iv = setInterval(() => {
      const a = apiRef.current;
      if (!a) return;
      clearInterval(iv); setApi(a);
      import("@excalidraw/excalidraw").then((m) => { libRef.current = m; });
      let last = "";
      unsub = a.onChange?.((els: El[], st: any) => {
        const sel = st.selectedElementIds || {};
        let ver = 0; for (const e of els) if (sel[e.id]) ver += e.version ?? 0;   // แก้เส้นที่เลือก (สี/ชนิด) → แถบอัปเดตปุ่มที่เลือก
        const sig = `${Object.keys(sel).filter((k) => sel[k]).join(",")}|${ver}|${st.scrollX}|${st.scrollY}|${st.zoom?.value}|${els.length}|${st.editingTextElement ? 1 : 0}`;
        if (sig !== last) { last = sig; setTick((n) => n + 1); }
      });
    }, 200);
    return () => { clearInterval(iv); unsub?.(); };
  }, [apiRef, enabled]);

  // จุดเชื่อม: ชี้การ์ด/กล่อง → โชว์จุด 4 ด้าน (ฟัง pointermove ของกรอบกระดาน)
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!enabled || !api || !wrap) return;
    const onMove = (ev: PointerEvent) => {
      if (drag) return;
      const lib = libRef.current; if (!lib) return;
      const st = api.getAppState();
      if (st.activeTool?.type && st.activeTool.type !== "selection") { setHover(null); return; }
      if ((ev.target as HTMLElement)?.closest?.("[data-line-tools]")) return;
      const p = lib.viewportCoordsToSceneCoords({ clientX: ev.clientX, clientY: ev.clientY }, st);
      setHover(shapeAt(api.getSceneElements(), p.x, p.y, 14 / (st.zoom?.value || 1)));
    };
    const onLeave = () => { if (!drag) setHover(null); };
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);
    return () => { wrap.removeEventListener("pointermove", onMove); wrap.removeEventListener("pointerleave", onLeave); };
  }, [api, enabled, wrapRef, drag]);

  if (!enabled || !api) return null;
  const st = api.getAppState();
  const els: El[] = api.getSceneElements();
  const sel = st.selectedElementIds || {};
  const lines = els.filter((e) => sel[e.id] && isLine(e));
  const onlyLines = lines.length > 0 && Object.keys(sel).filter((k) => sel[k]).every((id) => lines.some((l) => l.id === id) || els.find((e) => e.id === id)?.containerId);
  const wrapRect = wrapRef.current?.getBoundingClientRect();

  // ── บันทึกการแก้เข้า history (Ctrl+Z ย้อนได้) ──
  const commit = (next: El[]) => {
    const lib = libRef.current;
    api.updateScene({ elements: next, ...(lib?.CaptureUpdateAction ? { captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY } : {}) });
  };
  // อ่านกระดาน/ที่เลือก "ตอนกด" เสมอ (กดหลายปุ่มติดกันเร็ว ๆ จะไม่ทับกันด้วยค่าเก่า)
  const fresh = () => { const all: El[] = api.getSceneElements(); const s = api.getAppState().selectedElementIds || {}; return { all, sel: all.filter((e) => s[e.id] && isLine(e)) }; };
  const patchLines = (fn: (l: El, all: El[]) => El) => {
    const { all, sel: cur } = fresh();
    const ids = new Set(cur.map((l) => l.id));
    commit(all.map((e) => (ids.has(e.id) ? { ...fn(e, all), version: (e.version ?? 1) + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() } : e)));
  };
  const setKind = (k: "elbow" | "straight" | "curve") => patchLines((l, all) => {
    const pts: [number, number][] = l.points ?? [[0, 0], [0, 0]];
    const first = pts[0], last = pts[pts.length - 1];
    const a = { x: l.x + first[0], y: l.y + first[1] }, b = { x: l.x + last[0], y: l.y + last[1] };
    const rel = (p: { x: number; y: number }) => [p.x - a.x, p.y - a.y] as [number, number];
    if (k === "elbow" && l.type === "arrow") {
      const side: Side = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? (b.x >= a.x ? "right" : "left") : (b.y >= a.y ? "bottom" : "top");
      const bind = (bd: El, p: { x: number; y: number }) => {
        if (!bd) return bd;
        const target = all.find((e) => e.id === bd.elementId);
        return target ? { ...bd, fixedPoint: bd.fixedPoint ?? fixedPointOf(target, p) } : null;
      };
      return { ...l, x: a.x, y: a.y, elbowed: true, roundness: null, points: elbowPoints(a, b, side), startBinding: bind(l.startBinding, a), endBinding: bind(l.endBinding, b) };
    }
    if (k === "curve") {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const off = len * 0.18, nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
      return { ...l, x: a.x, y: a.y, elbowed: false, roundness: { type: 2 }, points: [[0, 0], rel({ x: mx + nx * off, y: my + ny * off }), rel(b)] };
    }
    return { ...l, x: a.x, y: a.y, elbowed: false, roundness: null, points: [[0, 0], rel(b)] };
  });
  const setColor = (c: string) => patchLines((l) => ({ ...l, strokeColor: c }));
  const toggleDash = () => { const dashed = fresh().sel.every((l) => l.strokeStyle === "dashed"); patchLines((l) => ({ ...l, strokeStyle: dashed ? "solid" : "dashed" })); };
  const remove = () => {
    const { all, sel: cur } = fresh();
    const ids = new Set(cur.map((l) => l.id));
    commit(all.map((e) => (ids.has(e.id) || (e.containerId && ids.has(e.containerId)) ? { ...e, isDeleted: true, version: (e.version ?? 1) + 1, versionNonce: Math.floor(Math.random() * 2 ** 31) } : e)));
    api.updateScene({ appState: { selectedElementIds: {} } });
  };
  const labelOf = (l: El) => els.find((e) => !e.isDeleted && e.type === "text" && e.containerId === l.id);
  const saveLabel = (text: string) => {
    const lib = libRef.current; const { all } = fresh(); const l = fresh().sel[0];
    setLabelEdit(null);
    if (!lib || !l) return;
    const old = all.find((e) => !e.isDeleted && e.type === "text" && e.containerId === l.id);
    let next = all.map((e) => (old && e.id === old.id ? { ...e, isDeleted: true, version: (e.version ?? 1) + 1 } : e));
    if (text.trim()) {
      // สร้างป้ายด้วยตัวแปลงของกระดาน (ได้ขนาด/ตำแหน่งกลางเส้นถูกต้อง) แล้วผูกเข้ากับเส้นเดิม
      const gen = lib.convertToExcalidrawElements([{ type: "arrow", x: l.x, y: l.y, points: l.points, label: { text: text.trim(), strokeColor: l.strokeColor } }]);
      const tx = gen.find((e: El) => e.type === "text");
      if (tx) {
        tx.containerId = l.id;
        next = next.map((e) => (e.id === l.id ? { ...e, boundElements: [...(e.boundElements ?? []).filter((b: El) => b.id !== old?.id), { type: "text", id: tx.id }], version: (e.version ?? 1) + 1 } : e));
        next.push(tx);
      }
    }
    commit(next);
  };

  // ── ลากจากจุดเชื่อม → ปล่อยบนการ์ด/กล่องอื่น = ลูกศรหักฉากติดสองฝั่ง ──
  const startDrag = (ev: React.PointerEvent, side: Side) => {
    if (!hover) return;
    ev.preventDefault(); ev.stopPropagation();
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    setDrag({ from: hover, side, x: ev.clientX, y: ev.clientY });
  };
  const moveDrag = (ev: React.PointerEvent) => { if (drag) setDrag({ ...drag, x: ev.clientX, y: ev.clientY }); };
  const endDrag = (ev: React.PointerEvent) => {
    const d = drag; setDrag(null);
    const lib = libRef.current; if (!d || !lib) return;
    const st2 = api.getAppState();
    const p = lib.viewportCoordsToSceneCoords({ clientX: ev.clientX, clientY: ev.clientY }, st2);
    const all: El[] = api.getSceneElements();
    const target = shapeAt(all, p.x, p.y, 0);
    if (!target || target.id === d.from.id) return;
    const a = sidePoint(d.from, d.side);
    const cx = target.x + target.width / 2, cy = target.y + target.height / 2;
    const endSide: Side = d.side === "left" || d.side === "right" ? (cx >= a.x ? "left" : "right") : (cy >= a.y ? "top" : "bottom");
    const b = sidePoint(target, endSide);
    const gen = lib.convertToExcalidrawElements([{ type: "arrow", x: a.x, y: a.y, points: elbowPoints(a, b, d.side), strokeColor: "#64748b", strokeWidth: 2, endArrowhead: "arrow" }]);
    const arrow = gen[0];
    if (!arrow) return;
    Object.assign(arrow, {
      elbowed: true, roundness: null,
      startBinding: { elementId: d.from.id, focus: 0, gap: 4, fixedPoint: SIDE_FP[d.side] },
      endBinding: { elementId: target.id, focus: 0, gap: 4, fixedPoint: SIDE_FP[endSide] },
    });
    const next = all.map((e) => (e.id === d.from.id || e.id === target.id
      ? { ...e, boundElements: [...(e.boundElements ?? []), { type: "arrow", id: arrow.id }], version: (e.version ?? 1) + 1 }
      : e));
    commit([...next, arrow]);
    api.updateScene({ appState: { selectedElementIds: { [arrow.id]: true } } });
  };

  const bar = onlyLines && !st.editingTextElement && !drag ? (() => {
    const xs = lines.flatMap((l) => (l.points ?? [[0, 0]]).map((p: number[]) => l.x + p[0]));
    const ys = lines.flatMap((l) => (l.points ?? [[0, 0]]).map((p: number[]) => l.y + p[1]));
    const tl = toView(Math.min(...xs), Math.min(...ys), st), br = toView(Math.max(...xs), Math.max(...ys), st);
    const w = wrapRect?.width ?? 800;
    const left = Math.min(Math.max(8, (tl.x + br.x) / 2 - 190), w - 388);
    const top = tl.y > 70 ? tl.y - 58 : br.y + 16;
    const kind = lineKind(lines[0]);
    const arrowsOnly = lines.every((l) => l.type === "arrow");
    const dashed = lines.every((l) => l.strokeStyle === "dashed");
    const btn = (on: boolean) => `h-7 min-w-7 px-1 rounded-lg text-sm ${on ? "bg-violet-100 text-violet-700" : "text-slate-600 hover:bg-slate-100"}`;
    return (
      <div data-line-tools className="absolute z-30 flex max-w-[calc(100%-16px)] flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-lg" style={{ left, top: Math.max(8, top) }}
        onPointerDown={(e) => e.stopPropagation()}>
        {arrowsOnly && <button type="button" title={t("เส้นหักฉาก", "Elbow")} onClick={() => setKind("elbow")} className={btn(kind === "elbow")}>⌐</button>}
        <button type="button" title={t("เส้นตรง", "Straight")} onClick={() => setKind("straight")} className={btn(kind === "straight")}>↗</button>
        <button type="button" title={t("เส้นโค้ง", "Curved")} onClick={() => setKind("curve")} className={btn(kind === "curve")}>⤴</button>
        <span className="mx-0.5 h-5 w-px bg-slate-200" />
        {COLORS.map((c) => (
          <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} className="h-5 w-5 rounded-full border-2 border-white" style={{ background: c, boxShadow: `0 0 0 ${lines.every((l) => l.strokeColor === c) ? 2 : 1}px ${lines.every((l) => l.strokeColor === c) ? "#7c3aed" : "#cbd5e1"}` }} />
        ))}
        <span className="mx-0.5 h-5 w-px bg-slate-200" />
        <button type="button" title={t("เส้นประ", "Dashed")} onClick={toggleDash} className={btn(dashed)}>┄</button>
        {lines.length === 1 && lines[0].type === "arrow" && (
          <button type="button" title={t("ข้อความบนเส้น", "Label")} onClick={() => setLabelEdit(String(labelOf(lines[0])?.originalText ?? labelOf(lines[0])?.text ?? ""))} className={btn(false)}>✎</button>
        )}
        <button type="button" title={t("ลบเส้น (Ctrl+Z ย้อนได้)", "Delete line (Ctrl+Z to undo)")} onClick={remove} className={`${btn(false)} hover:text-rose-600`}>🗑</button>
        {labelEdit != null && (
          <form className="flex w-full items-center gap-1 pt-1" onSubmit={(e) => { e.preventDefault(); saveLabel(labelEdit); }}>
            <input autoFocus value={labelEdit} onChange={(e) => setLabelEdit(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") setLabelEdit(null); }}
              placeholder={t("ข้อความบนเส้น (ว่าง = เอาออก)", "Line label (empty = remove)")} className="h-7 flex-1 rounded-md border border-slate-200 px-2 text-xs" />
            <button type="submit" className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white">{t("ตกลง", "OK")}</button>
          </form>
        )}
      </div>
    );
  })() : null;

  const dots = hover && !onlyLines ? (["top", "right", "bottom", "left"] as Side[]).map((s) => {
    const p = sidePoint(hover, s); const v = toView(p.x, p.y, st);
    return (
      <span key={s} data-line-tools onPointerDown={(e) => startDrag(e, s)} onPointerMove={moveDrag} onPointerUp={endDrag}
        title={t("ลากไปการ์ดอื่นเพื่อเชื่อมเส้น", "Drag to another card to connect")}
        className="absolute z-30 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-white bg-violet-500 shadow hover:scale-125"
        style={{ left: v.x, top: v.y, touchAction: "none" }} />
    );
  }) : null;

  const ghost = drag && wrapRect ? (() => {
    const p = sidePoint(drag.from, drag.side); const v = toView(p.x, p.y, st);
    return (
      <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full">
        <line x1={v.x} y1={v.y} x2={drag.x - wrapRect.left} y2={drag.y - wrapRect.top} stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 4" />
      </svg>
    );
  })() : null;

  return <>{bar}{dots}{ghost}</>;
}

/** การ์ด/กล่องที่อยู่ใต้จุด (เลือกอันเล็กสุด = อันบนสุดโดยประมาณ) · ไม่นับกรอบโซน/รูป/ข้อความ */
function shapeAt(els: El[], x: number, y: number, pad: number): El | null {
  let best: El | null = null;
  for (const e of els) {
    if (e.isDeleted || !SHAPES.has(e.type) || e.locked) continue;
    if (x < e.x - pad || x > e.x + e.width + pad || y < e.y - pad || y > e.y + e.height + pad) continue;
    if (!best || e.width * e.height < best.width * best.height) best = e;
  }
  return best;
}
