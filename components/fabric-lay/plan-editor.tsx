"use client";
/**
 * ✂️ กระดานวางชิ้นบนผ้า (/master/fabric-lay/plans/<id>)
 *   ผ้าจริง (รูปดัดตรง + ขนาดจริง) เป็นพื้น · หน่วยบนกระดาน = ซม. → ขนาดชิ้นเป๊ะเท่าของจริง
 *   กระเป๋าหลายใบต่อผืน (แบบตัดต่อสินค้า) · บอกใบไหนวางครบ/ขาดชิ้น · ล้นผ้า/ทับกัน/ทับส่วนที่ตัดไปแล้ว = เตือน
 *   ย้าย (ลาก/ลูกศร) · หมุน (90° / ทีละ 1° / ใส่องศา) · พลิก · ชิ้นคู่พลิกให้เอง · โน้ตต่อชิ้น
 *   ชุดกระดานกลาง board-kit (ล็อก · กล่องเครื่องมือ · เต็มจอ) · ซูม useCanvasZoom · ย้อนกลับ/ทำซ้ำ · บันทึก Ctrl+S
 *   JPEG สรุป (components/fabric-lay/summary-image) · คำสั่ง ChatGPT · พิมพ์ใบตัดผ้า · กด "ตัดแล้ว" = หักพื้นที่ออกจากผ้า (ยกเลิกได้)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { ErrorState, LoadingState } from "@/components/state-views";
import { BoardFullscreenButton, BoardLockButton, BoardLockHint, BoardToolbox, useBoardLock, type BoardToolGroup } from "@/components/board-kit";
import { FullscreenStage, useFullscreenStage } from "@/components/fullscreen-stage";
import { useCanvasZoom, zoomLabel } from "@/components/block-print/use-zoom";
import {
  BAG_COLORS, bagLetters, bagStatus, chatGptPrompt, findFreeSpot, layIssues, newId, newItem, normRot, partLabel, pieceLocal, placeAll, polyBoxOf, sizeLabel,
  type LayBag, type LayItem, type LayPiece, type LaySettings,
} from "@/lib/fabric-lay";
import { polyD, type Pt } from "@/lib/pattern-shape";
import { PieceThumb } from "./piece-thumb";
import { canvasToJpeg, downloadBlob, renderBagSummary, stackCanvases } from "./summary-image";
import { API, HOME, api, bagImgUrl, imgUrl, patternHref, printHref, sizeText, thaiDate, useLeaveGuard, type Pattern, type PatternRow, type PlanFull } from "./shared";

type Doc = { name: string; note: string; bags: LayBag[]; items: LayItem[]; settings: LaySettings };
const docKey = (d: Doc) => JSON.stringify(d);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function PlanEditor({ id }: { id: string }) {
  const toast = useToast();
  const canEdit = usePermission("fabric_lay.edit");
  const [plan, setPlan] = useState<PlanFull | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [patterns, setPatterns] = useState<Record<string, Pattern>>({});
  const [doc, setDoc] = useState<Doc | null>(null);
  const [saved, setSaved] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addBag, setAddBag] = useState(false);
  const [cutAsk, setCutAsk] = useState<"do" | "undo" | null>(null);
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);
  const past = useRef<Doc[]>([]), future = useRef<Doc[]>([]);
  const [, force] = useState(0);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const p = await api<PlanFull>(`${API}/plans/${id}`);
      const d: Doc = { name: p.name, note: p.note ?? "", bags: p.bags ?? [], items: p.items ?? [], settings: { showAllow: p.settings?.showAllow !== false, snap: p.settings?.snap ?? 0 } };
      setPlan(p); setPatterns(Object.fromEntries((p.patterns ?? []).map((x) => [x.id, x])));
      setDoc(d); setSaved(docKey(d)); past.current = []; future.current = [];
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const dirty = !!doc && docKey(doc) !== saved;
  useLeaveGuard(dirty);
  const cutDone = !!plan?.cut_done_at;
  const editable = canEdit && !cutDone;

  const apply = (fn: (d: Doc) => Doc) => {
    if (!doc || !editable) return;
    past.current.push(doc); if (past.current.length > 150) past.current.shift();
    future.current = [];
    setDoc(fn(doc));
  };
  const undo = () => { const p = past.current.pop(); if (!p || !doc) return; future.current.push(doc); setDoc(p); force((n) => n + 1); };
  const redo = () => { const f = future.current.pop(); if (!f || !doc) return; past.current.push(doc); setDoc(f); force((n) => n + 1); };

  // ── ผ้า + ชิ้นที่วาง ──
  const fabric = plan?.fabric ?? null;
  const W = Number(fabric?.width_cm) || 100, H = Number(fabric?.height_cm) || 100;
  const showAllow = doc?.settings.showAllow !== false;
  const items = useMemo(() => (doc?.items ?? []).map((it) => (live && live.id === it.id ? { ...it, x: live.x, y: live.y } : it)), [doc?.items, live]);
  const placed = useMemo(() => (doc ? placeAll(items, doc.bags, patterns, true) : []), [items, doc, patterns]);
  const cutZones = useMemo(() => (plan?.cut_plans ?? []).flatMap((cp) => placeAll(cp.items ?? [], cp.bags ?? [], patterns, true).map((p) => p.cut)), [plan?.cut_plans, patterns]);
  const issues = useMemo(() => layIssues(placed, W, H, cutZones), [placed, W, H, cutZones]);
  const bad = useMemo(() => new Set([...issues.outside, ...issues.onCut, ...issues.overlaps.flat()]), [issues]);
  const status = useMemo(() => (doc ? bagStatus(doc.bags, doc.items, patterns) : []), [doc, patterns]);
  const letters = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of doc?.bags ?? []) for (const [k, v] of bagLetters(placed, b.key, patterns[b.pattern_id]?.pieces ?? [])) m.set(k, v);
    return m;
  }, [placed, doc?.bags, patterns]);
  const usedArea = placed.reduce((s, p) => s + p.area, 0);
  const usePct = Math.round((usedArea / (W * H)) * 100);
  const selPlaced = placed.find((p) => p.item.id === sel) ?? null;

  // ── แก้ชิ้น ──
  const setItem = (iid: string, patch: Partial<LayItem>) => apply((d) => ({ ...d, items: d.items.map((i) => (i.id === iid ? { ...i, ...patch } : i)) }));
  const removeItem = (iid: string) => { apply((d) => ({ ...d, items: d.items.filter((i) => i.id !== iid) })); setSel(null); toast.undo("เอาชิ้นออกจากผ้าแล้ว", () => keyRef.current.undo()); };
  const rotate = (deg: number) => { if (selPlaced) setItem(selPlaced.item.id, { rot: normRot(selPlaced.item.rot + deg) }); };
  const flip = () => { if (selPlaced) setItem(selPlaced.item.id, { flip: !selPlaced.item.flip }); };
  const nudge = (dx: number, dy: number) => { if (selPlaced) setItem(selPlaced.item.id, { x: r2(selPlaced.item.x + dx), y: r2(selPlaced.item.y + dy) }); };

  /** วางชิ้นที่ยังขาดของใบนี้ (หรือชิ้นเดียว) ลงที่ว่างบนผ้า */
  const placeMissing = (bag: LayBag, only?: { piece: LayPiece; copy: number }) => {
    if (!doc) return;
    const st = status.find((s) => s.bag.key === bag.key); if (!st) return;
    const todo = only ? [only] : st.missing;
    if (!todo.length) return;
    const taken: Pt[][] = [...placed.map((p) => p.cut), ...cutZones];
    const add: LayItem[] = [];
    for (const m of todo) {
      const L = pieceLocal(m.piece, true);
      const at = findFreeSpot(L, W, H, taken, Math.max(1, Math.min(W, H) / 60));
      const it = newItem(bag.key, m.piece, m.copy, at);
      add.push(it);
      const one = placeAll([it], [bag], patterns, true)[0];
      if (one) taken.push(one.cut);
    }
    apply((d) => ({ ...d, items: [...d.items, ...add] }));
    setSel(add[add.length - 1]?.id ?? null);
  };

  const addBags = async (rows: PatternRow[]) => {
    if (!doc || !rows.length) return;
    try {
      const need = rows.filter((r) => !patterns[r.id]).map((r) => r.id);
      let more: Pattern[] = [];
      if (need.length) more = await api<Pattern[]>(`${API}/patterns?ids=${need.join(",")}&full=1`);
      const next = { ...patterns, ...Object.fromEntries(more.map((p) => [p.id, p])) };
      setPatterns(next);
      apply((d) => {
        const bags = [...d.bags];
        for (const r of rows) { if (bags.length >= 12) break; bags.push({ key: newId("b"), pattern_id: r.id, label: `ใบที่ ${bags.length + 1}`, color: BAG_COLORS[bags.length % BAG_COLORS.length] }); }
        return { ...d, bags };
      });
      toast.success(`เพิ่ม ${rows.length} ใบแล้ว — กด "วางชิ้นที่ขาด" ให้ระบบวางลงที่ว่าง`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
  };
  const removeBag = (b: LayBag) => {
    apply((d) => ({ ...d, bags: d.bags.filter((x) => x.key !== b.key), items: d.items.filter((i) => i.bag !== b.key) }));
    toast.undo(`เอา ${b.label} ออกจากแผนแล้ว`, () => keyRef.current.undo());
  };

  const save = async (): Promise<boolean> => {
    if (!doc || !plan || !editable) return false;
    if (!doc.name.trim()) { toast.warning("ใส่ชื่อแผน"); return false; }
    setBusy("กำลังบันทึก…");
    try {
      await api(`${API}/plans/${plan.id}`, { method: "PATCH", json: { name: doc.name.trim(), note: doc.note.trim() || null, bags: doc.bags, items: doc.items, settings: doc.settings } });
      setSaved(docKey(doc)); toast.success("บันทึกแผนแล้ว"); setBusy(null); return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); setBusy(null); return false; }
  };
  const setCut = async (done: boolean) => {
    if (!plan) return;
    if (done && dirty && !(await save())) return;
    setBusy(done ? "กำลังบันทึกว่าตัดแล้ว…" : "กำลังยกเลิก…");
    try {
      const myArea = placeAll(doc?.items ?? [], doc?.bags ?? [], patterns, true).reduce((s, p) => s + p.area, 0);
      await api(`${API}/plans/${plan.id}`, { method: "PATCH", json: done ? { cut_done: true, cut_area_cm2: Math.round(myArea * 100) / 100 } : { cut_done: false } });
      toast.success(done ? "บันทึกว่าตัดแล้ว — หักพื้นที่ออกจากผ้าแล้ว" : "ยกเลิก \"ตัดแล้ว\" แล้ว — แก้แผนได้อีกครั้ง");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); }
    setBusy(null); setCutAsk(null);
  };

  // ── JPEG / ChatGPT ──
  const fabricFull = imgUrl(fabric?.image_key) ?? "";
  const bagInfo = (b: LayBag) => { const p = patterns[b.pattern_id]; return { key: b.key, label: b.label, color: b.color, name: p?.name ?? "(แบบตัดถูกลบ)", image: bagImgUrl(p?.bag_image, 900), note: p?.note ?? null, pieces: p?.pieces ?? [] }; };
  const makeJpeg = async (bags: LayBag[]) => {
    if (!plan || !fabric || !bags.length) return;
    setBusy("กำลังสร้างภาพ…");
    try {
      const cvs = [];
      for (const b of bags) cvs.push(await renderBagSummary({ fabricUrl: fabricFull, W, H, fabricName: fabric.name, planName: doc?.name ?? plan.name, bag: bagInfo(b), placed }));
      const blob = await canvasToJpeg(cvs.length > 1 ? stackCanvases(cvs) : cvs[0]);
      downloadBlob(blob, `${plan.code}-${bags.length > 1 ? "ทุกใบ" : bags[0].label}.jpg`);
    } catch (e) { toast.error(e instanceof Error ? `สร้างภาพไม่สำเร็จ: ${e.message}` : "สร้างภาพไม่สำเร็จ"); }
    setBusy(null);
  };
  const copyPrompt = async (b: LayBag) => {
    const info = bagInfo(b);
    const lines = placed.filter((p) => p.bag.key === b.key)
      .sort((x, y) => (letters.get(x.item.id) ?? "").localeCompare(letters.get(y.item.id) ?? ""))
      .map((p) => { const s = polyBoxOf(p.local.sew); return { letter: letters.get(p.item.id) ?? "", part: partLabel(p.piece.part), name: p.piece.name, size: sizeLabel(s.w, s.h), note: [p.piece.note, p.item.note].filter(Boolean).join(" · ") || undefined }; });
    try { await navigator.clipboard.writeText(chatGptPrompt(info.name, lines, fabric?.name ?? "")); toast.success("คัดลอกคำสั่งแล้ว — วางใน ChatGPT พร้อมแนบ JPEG ของใบนี้"); }
    catch { toast.error("คัดลอกไม่ได้ — เบราว์เซอร์ไม่อนุญาต"); }
  };

  // ── ลากบนกระดาน ──
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const boardLock = useBoardLock("fabric_lay_board_lock");
  const fsStage = useFullscreenStage("fabric_lay_board_fullscreen", { phoneAlways: false });
  const { zoom, zoomTo, step: zoomStep } = useCanvasZoom(boxRef, 1, !!doc, { locked: boardLock.locked, onLockedWheel: () => boardLock.nudge("wheel") });
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const toCm = (e: React.PointerEvent): Pt | null => {
    const svg = svgRef.current; const m = svg?.getScreenCTM(); if (!svg || !m) return null;
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(m.inverse()); return [q.x, q.y];
  };
  const onPieceDown = (iid: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    setSel(iid);
    if (!editable) return;
    if (boardLock.locked) { boardLock.nudge("edit"); return; }
    const it = doc?.items.find((i) => i.id === iid); const p = toCm(e); if (!it || !p) return;
    drag.current = { id: iid, dx: p[0] - it.x, dy: p[1] - it.y, moved: false };
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* ไม่รองรับ */ }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const p = toCm(e); if (!p) return;
    const snap = doc?.settings.snap || 0;
    let x = p[0] - d.dx, y = p[1] - d.dy;
    if (snap) { x = Math.round(x / snap) * snap; y = Math.round(y / snap) * snap; }
    d.moved = true;
    setLive({ id: d.id, x: r2(x), y: r2(y) });
  };
  const onUp = () => {
    const d = drag.current; drag.current = null;
    if (d?.moved && live) setItem(d.id, { x: live.x, y: live.y });
    setLive(null);
  };

  const keyRef = useRef({ undo, redo, save, rotate, flip, nudge, removeItem, sel });
  keyRef.current = { undo, redo, save, rotate, flip, nudge, removeItem, sel };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const k = keyRef.current, c = e.code;
      if (e.ctrlKey || e.metaKey) {
        if (c === "KeyS") { e.preventDefault(); void k.save(); }
        else if (c === "KeyZ" && !e.shiftKey) { e.preventDefault(); k.undo(); }
        else if (c === "KeyY" || (c === "KeyZ" && e.shiftKey)) { e.preventDefault(); k.redo(); }
        return;
      }
      if (!k.sel) return;
      const st = e.shiftKey ? 1 : 0.1;
      if (c === "ArrowLeft") { e.preventDefault(); k.nudge(-st, 0); }
      else if (c === "ArrowRight") { e.preventDefault(); k.nudge(st, 0); }
      else if (c === "ArrowUp") { e.preventDefault(); k.nudge(0, -st); }
      else if (c === "ArrowDown") { e.preventDefault(); k.nudge(0, st); }
      // R = หมุน · F = พลิก → กล่องเครื่องมือกลาง (BoardToolbox hotkey) ผูกให้แล้ว ห้ามผูกซ้ำ
      else if (c === "Delete" || c === "Backspace") { e.preventDefault(); k.removeItem(k.sel); }
      else if (c === "Escape") setSel(null);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  if (err) return <div className="p-6"><ErrorState title={err} onRetry={() => void load()} /></div>;
  if (!plan || !doc) return <div className="p-6"><LoadingState /></div>;
  if (!fabric || !fabric.image_key) return <div className="p-6"><ErrorState title="ผ้าของแผนนี้ไม่มีรูป/ยังไม่ตั้งสเกล — แก้ผ้าในอัลบั้มก่อน" /></div>;

  const sw = Math.max(W, H) / 700 / Math.max(1, zoom);
  const toolGroups: BoardToolGroup[] = [
    { key: "piece", label: "ชิ้นที่เลือก", tools: [
      { key: "rot", icon: "i:refresh", label: "หมุน 90°", hotkey: "R", editing: true, disabled: !selPlaced, onClick: () => rotate(90) },
      { key: "flip", icon: "i:arrows-exchange", label: "พลิก", hotkey: "F", editing: true, disabled: !selPlaced, onClick: flip },
      { key: "del", icon: "i:trash", label: "เอาออก", hint: "Delete", editing: true, disabled: !selPlaced, onClick: () => selPlaced && removeItem(selPlaced.item.id) },
    ] },
    { key: "hist", label: "ประวัติ", tools: [
      { key: "undo", icon: "i:arrow-back-up", label: "ย้อนกลับ", hint: "Ctrl+Z", disabled: !past.current.length, onClick: undo },
      { key: "redo", icon: "i:arrow-forward-up", label: "ทำซ้ำ", hint: "Ctrl+Y", disabled: !future.current.length, onClick: redo },
    ] },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-3 p-3 md:p-5">
      {/* หัว */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={HOME} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100"><Icon value="i:arrow-left" /> แผนทั้งหมด</Link>
        <span className="font-mono text-xs text-slate-500">{plan.code}</span>
        <input disabled={!editable} value={doc.name} onChange={(e) => apply((d) => ({ ...d, name: e.target.value }))} className="h-9 min-w-[12rem] flex-1 rounded-lg border border-transparent px-2 text-base font-semibold text-slate-900 hover:border-slate-200 focus:border-slate-300 sm:max-w-sm" aria-label="ชื่อแผน" />
        {cutDone ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">ตัดแล้ว {thaiDate(plan.cut_done_at)}</span> : null}
        <span className="flex-1" />
        {editable && <>
          <button type="button" onClick={undo} disabled={!past.current.length} title="ย้อนกลับ (Ctrl+Z)" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"><Icon name="arrow-back-up" /></button>
          <button type="button" onClick={redo} disabled={!future.current.length} title="ทำซ้ำ (Ctrl+Y)" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"><Icon name="arrow-forward-up" /></button>
          <button type="button" onClick={() => void save()} disabled={!dirty || !!busy} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">{dirty ? "บันทึก (Ctrl+S)" : "บันทึกแล้ว"}</button>
        </>}
      </div>
      {cutDone && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">แผนนี้ตัดผ้าไปแล้ว (หักพื้นที่ออกจากผ้าแล้ว) — ดู/โหลดภาพได้ · ถ้าจะแก้ กด “ยกเลิกตัดแล้ว” ด้านขวา</div>}
      {busy && <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700">{busy}</div>}

      <div className="grid gap-3 lg:grid-cols-[270px_minmax(0,1fr)_280px]">
        {/* ซ้าย: กระเป๋าในผ้าผืนนี้ */}
        <aside className="order-2 space-y-2 lg:order-1">
          <div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">กระเป๋าในผ้าผืนนี้</span><span className="text-xs text-slate-400">{doc.bags.length}/12 ใบ</span></div>
          {!doc.bags.length && <div className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">ยังไม่มีกระเป๋า — กด “เพิ่มกระเป๋า” แล้วเลือกแบบตัดของสินค้า</div>}
          {status.map((st) => {
            const p = patterns[st.bag.pattern_id];
            const done = st.need > 0 && !st.missing.length;
            return (
              <div key={st.bag.key} className="rounded-xl border bg-white p-2 text-sm" style={{ borderColor: `${st.bag.color}66` }}>
                <div className="flex items-center gap-2">
                  <span className="h-8 w-8 shrink-0 overflow-hidden rounded" style={{ background: st.bag.color }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p?.bag_image && <img src={bagImgUrl(p.bag_image, 80) ?? ""} alt="" className="h-full w-full object-cover" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <input disabled={!editable} value={st.bag.label} onChange={(e) => apply((d) => ({ ...d, bags: d.bags.map((b) => (b.key === st.bag.key ? { ...b, label: e.target.value.slice(0, 60) } : b)) }))}
                      className="h-6 w-full rounded border border-transparent px-1 font-medium hover:border-slate-200" aria-label="ชื่อใบ" style={{ color: st.bag.color }} />
                    <Link href={p ? patternHref(p.id) : "#"} className="block truncate px-1 text-[11px] text-slate-500 hover:underline">{p ? `${p.parent_code ?? p.code} · ${p.name}` : "แบบตัดถูกลบ"}</Link>
                  </div>
                  {editable && <button type="button" onClick={() => removeBag(st.bag)} aria-label="เอาใบนี้ออก" className="h-7 w-7 rounded text-slate-400 hover:bg-red-50 hover:text-red-600"><Icon value="i:x" /></button>}
                </div>
                <div className={`mt-1 px-1 text-xs ${done ? "text-emerald-700" : st.need ? "text-amber-700" : "text-slate-500"}`}>
                  {!st.need ? "แบบตัดนี้ยังไม่มีชิ้น — เปิดแบบตัดแล้วเพิ่มชิ้น" : done ? `ครบ ${st.need} ชิ้น` : `วางแล้ว ${st.placed}/${st.need} ชิ้น`}
                </div>
                {st.missing.length > 0 && editable && (
                  <div className="mt-1 space-y-1">
                    <div className="flex flex-wrap gap-1">
                      {st.missing.slice(0, 12).map((m) => (
                        <button key={`${m.piece.id}#${m.copy}`} type="button" onClick={() => placeMissing(st.bag, m)} title="วางชิ้นนี้"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] hover:bg-slate-50">
                          <PieceThumb piece={m.piece} size={18} color={st.bag.color} /> {m.piece.name}{m.piece.count > 1 ? ` ${m.copy + 1}` : ""}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => placeMissing(st.bag)} className="h-7 w-full rounded-md text-xs font-medium hover:opacity-90" style={{ background: `${st.bag.color}1a`, color: st.bag.color }}>วางชิ้นที่ขาดทั้งหมด</button>
                  </div>
                )}
              </div>
            );
          })}
          {editable && <button type="button" onClick={() => setAddBag(true)} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 text-sm text-slate-700 hover:bg-slate-50"><Icon name="add" /> เพิ่มกระเป๋า (แบบตัด)</button>}
          <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
            <div>ผ้า: <b>{fabric.name}</b> · {sizeText(W, H)}</div>
            <div>ใช้ผ้า ~{usePct}% ({Math.round(usedArea).toLocaleString("th-TH")} ตร.ซม.)</div>
          </div>
        </aside>

        {/* กลาง: กระดาน */}
        <section className="order-1 min-w-0 space-y-1.5 lg:order-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            <label className="flex items-center gap-1"><input type="checkbox" disabled={!editable} checked={showAllow} onChange={(e) => apply((d) => ({ ...d, settings: { ...d.settings, showAllow: e.target.checked } }))} /> โชว์เส้นเผื่อเย็บ</label>
            <label className="flex items-center gap-1">ดูดตำแหน่ง
              <select disabled={!editable} value={doc.settings.snap ?? 0} onChange={(e) => apply((d) => ({ ...d, settings: { ...d.settings, snap: Number(e.target.value) } }))} className="h-7 rounded border border-slate-200 px-1">
                <option value={0}>อิสระ</option><option value={0.5}>0.5 ซม.</option><option value={1}>1 ซม.</option><option value={5}>5 ซม.</option>
              </select></label>
            <span className="ml-auto flex items-center gap-1">
              <button type="button" aria-label="ซูมออก" onClick={() => zoomStep(-1)} className="h-7 w-7 rounded-md border border-slate-200 bg-white">−</button>
              <span className="w-10 text-center tabular-nums">{zoomLabel(zoom)}</span>
              <button type="button" aria-label="ซูมเข้า" onClick={() => zoomStep(1)} className="h-7 w-7 rounded-md border border-slate-200 bg-white">+</button>
              <button type="button" onClick={() => zoomTo(1)} className="h-7 rounded-md border border-slate-200 bg-white px-2">พอดีจอ</button>
              <BoardLockButton lock={boardLock} />
              <BoardFullscreenButton on={fsStage.on} onToggle={fsStage.toggle} />
            </span>
          </div>
          {(issues.outside.length > 0 || issues.overlaps.length > 0 || issues.onCut.length > 0) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              {issues.outside.length > 0 && <div>มี {issues.outside.length} ชิ้นล้นขอบผ้า (เส้นแดง)</div>}
              {issues.overlaps.length > 0 && <div>มี {issues.overlaps.length} คู่ที่ชิ้นทับกัน (เส้นแดง) — ตัดจริงไม่ได้</div>}
              {issues.onCut.length > 0 && <div>มี {issues.onCut.length} ชิ้นทับส่วนผ้าที่ตัดไปแล้ว (ลายขีด)</div>}
            </div>
          )}
          <FullscreenStage fs={fsStage} className="">
            {fsStage.on && <div className="flex justify-end gap-1 pb-1"><BoardLockButton lock={boardLock} /><BoardFullscreenButton on={fsStage.on} onToggle={fsStage.toggle} /></div>}
            <div className="relative">
              <div ref={boxRef} className={`${fsStage.on ? "max-h-[calc(100dvh-5rem)]" : "max-h-[75vh]"} overflow-auto rounded-xl bg-slate-800 p-2`}>
                <svg ref={svgRef} viewBox={`-2 -2 ${W + 4} ${H + 4}`} className="mx-auto block select-none" style={{ width: `${zoom * 100}%`, touchAction: !editable || boardLock.locked ? "auto" : "none" }}
                  onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerDown={() => setSel(null)} role="img" aria-label={`ผ้า ${fabric.name} ${W}×${H} ซม.`}>
                  <defs>
                    <pattern id="fl-hatch" width={2} height={2} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width={2} height={2} fill="rgba(15,23,42,0.45)" /><line x1={0} y1={0} x2={0} y2={2} stroke="#fff" strokeWidth={0.5} /></pattern>
                  </defs>
                  <image href={imgUrl(fabric.image_key, 2400) ?? ""} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
                  <rect x={0} y={0} width={W} height={H} fill="none" stroke="#fff" strokeWidth={sw * 1.5} />
                  {Array.from({ length: Math.floor(W / 10) }, (_, i) => <line key={`gx${i}`} x1={(i + 1) * 10} y1={0} x2={(i + 1) * 10} y2={H} stroke="#fff" strokeOpacity={0.25} strokeWidth={sw} pointerEvents="none" />)}
                  {Array.from({ length: Math.floor(H / 10) }, (_, i) => <line key={`gy${i}`} x1={0} y1={(i + 1) * 10} x2={W} y2={(i + 1) * 10} stroke="#fff" strokeOpacity={0.25} strokeWidth={sw} pointerEvents="none" />)}
                  {cutZones.map((z, i) => <path key={`cz${i}`} d={polyD(z)} fill="url(#fl-hatch)" stroke="#fff" strokeWidth={sw} pointerEvents="none" />)}
                  {placed.map((p) => {
                    const on = p.item.id === sel, isBad = bad.has(p.item.id), c = p.bag.color;
                    const b = p.box, L = letters.get(p.item.id) ?? "";
                    const fs = Math.max(1.2, Math.min(b.w, b.h) / 5);
                    return (
                      <g key={p.item.id} onPointerDown={onPieceDown(p.item.id)} style={{ cursor: editable ? (boardLock.locked ? "pointer" : "move") : "pointer" }}>
                        <path d={polyD(p.cut) + p.holes.map((h) => polyD(h)).join("")} fillRule="evenodd" fill={`${c}${on ? "55" : "30"}`} stroke="#fff" strokeWidth={sw * (on ? 5 : 3.5)} />
                        <path d={polyD(p.cut)} fill="none" stroke={isBad ? "#ef4444" : c} strokeWidth={sw * (on ? 3 : 2)} />
                        {showAllow && p.piece.allow > 0 && <path d={polyD(p.sew)} fill="none" stroke="#fff" strokeWidth={sw * 1.2} strokeDasharray={`${sw * 4} ${sw * 3}`} pointerEvents="none" />}
                        <text x={b.x + b.w / 2} y={b.y + b.h / 2} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill="#fff" stroke={c} strokeWidth={fs / 8} paintOrder="stroke" pointerEvents="none" fontWeight={700}>{L}</text>
                        <text x={b.x + b.w / 2} y={b.y + b.h / 2 + fs * 0.95} fontSize={fs * 0.42} textAnchor="middle" dominantBaseline="middle" fill="#fff" stroke="#0f172a" strokeWidth={fs / 25} paintOrder="stroke" pointerEvents="none">{p.piece.name}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              {editable && <BoardToolbox prefKey="fabric_lay_toolbox" lock={boardLock} groups={toolGroups} />}
              <BoardLockHint lock={boardLock} />
            </div>
          </FullscreenStage>
          <p className="text-xs text-slate-500">
            <span className="hidden lg:inline">ลากชิ้นเพื่อย้าย · ลูกศร = เลื่อน 1 มม. (Shift 1 ซม.) · R = หมุน 90° · F = พลิก · Delete = เอาออก · Ctrl+ลูกกลิ้ง = ซูม · </span>
            <span className="lg:hidden">แตะชิ้นเพื่อเลือก ลากด้วยนิ้ว (ปลดล็อกกระดานก่อน) · ถ่าง 2 นิ้ว = ซูม · </span>
            เส้นตาราง = 10 ซม. · เส้นประขาว = เส้นเย็บ (ขอบนอก = เส้นตัด)
          </p>
        </section>

        {/* ขวา: ชิ้นที่เลือก + สรุป */}
        <aside className="order-3 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <div className="mb-2 text-xs font-medium text-slate-500">ชิ้นที่เลือก</div>
            {!selPlaced ? <p className="text-xs text-slate-400">คลิกชิ้นบนผ้าเพื่อหมุน/พลิก/ใส่โน้ต</p> : (
              <SelectedPanel key={selPlaced.item.id} p={selPlaced} letter={letters.get(selPlaced.item.id) ?? ""} editable={editable} W={W} H={H}
                onRotate={rotate} onSetRot={(r) => setItem(selPlaced.item.id, { rot: normRot(r) })} onFlip={flip}
                onPos={(x, y) => setItem(selPlaced.item.id, { x, y })} onNote={(n) => setItem(selPlaced.item.id, { note: n || undefined })} onRemove={() => removeItem(selPlaced.item.id)} />
            )}
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <div className="text-xs font-medium text-slate-500">ภาพสรุป / ChatGPT</div>
            {doc.bags.map((b) => (
              <div key={b.key} className="flex items-center gap-1.5">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: b.color }} />
                <span className="min-w-0 flex-1 truncate">{b.label}</span>
                <button type="button" onClick={() => void makeJpeg([b])} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50" title="โหลด JPEG สรุปของใบนี้"><Icon name="download" /> JPEG</button>
                <button type="button" onClick={() => void copyPrompt(b)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50" title="คัดลอกคำสั่งไปวางใน ChatGPT"><Icon name="copy" /> คำสั่ง</button>
              </div>
            ))}
            {doc.bags.length > 1 && <button type="button" onClick={() => void makeJpeg(doc.bags)} className="h-8 w-full rounded-lg border border-slate-200 text-xs hover:bg-slate-50">JPEG ทุกใบ (รวมเป็นภาพเดียว)</button>}
            <Link href={printHref(plan.id)} onClick={(e) => { if (dirty) { e.preventDefault(); toast.warning("บันทึกแผนก่อนพิมพ์"); } }} className="flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-slate-200 text-xs hover:bg-slate-50"><Icon name="printer" /> พิมพ์ใบตัดผ้า</Link>
            <p className="text-[11px] text-slate-500">วิธีใช้กับ ChatGPT: โหลด JPEG ของใบนั้น → กด “คำสั่ง” → เปิด ChatGPT แนบรูปแล้ววางคำสั่ง</p>
          </div>

          {canEdit && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <div className="text-xs font-medium text-slate-500">ตัดผ้าจริง</div>
              {cutDone
                ? <button type="button" onClick={() => setCutAsk("undo")} className="h-9 w-full rounded-lg border border-slate-200 text-sm hover:bg-slate-50">ยกเลิกตัดแล้ว (กลับมาแก้แผน)</button>
                : <button type="button" disabled={!placed.length} onClick={() => setCutAsk("do")} className="h-9 w-full rounded-lg bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40">ตัดผ้าตามแผนนี้แล้ว</button>}
              <p className="text-[11px] text-slate-500">กดเมื่อตัดผ้าจริงแล้ว — ระบบหักพื้นที่ออกจากผ้าในอัลบั้ม และแผนอื่นบนผ้าผืนนี้จะเห็นส่วนที่ตัดไปแล้ว</p>
            </div>
          )}
          <label className="block text-xs text-slate-500">โน้ตแผน
            <textarea disabled={!editable} value={doc.note} onChange={(e) => apply((d) => ({ ...d, note: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" /></label>
        </aside>
      </div>

      <AddBagModal open={addBag} onClose={() => setAddBag(false)} onPick={(rows) => { setAddBag(false); void addBags(rows); }} />
      <ConfirmDialog open={cutAsk === "do"} onClose={() => setCutAsk(null)} onConfirm={() => void setCut(true)}
        title="ตัดผ้าตามแผนนี้แล้ว?" message={<>บันทึกว่าตัดแล้ว {placed.length} ชิ้น ({Math.round(usedArea).toLocaleString("th-TH")} ตร.ซม.) — หักออกจากผ้า “{fabric.name}” · แผนนี้จะล็อกไม่ให้แก้ (ยกเลิกได้ภายหลัง){issues.overlaps.length || issues.outside.length ? <><br /><b className="text-red-600">ยังมีชิ้นทับกัน/ล้นผ้าอยู่</b></> : null}</>} confirmText="ตัดแล้ว" />
      <ConfirmDialog open={cutAsk === "undo"} onClose={() => setCutAsk(null)} onConfirm={() => void setCut(false)}
        title="ยกเลิก “ตัดแล้ว”?" message="คืนพื้นที่ผ้าในอัลบั้ม และเปิดให้แก้แผนได้อีกครั้ง" confirmText="ยกเลิกตัดแล้ว" />
    </div>
  );
}

function SelectedPanel({ p, letter, editable, W, H, onRotate, onSetRot, onFlip, onPos, onNote, onRemove }: {
  p: ReturnType<typeof placeAll>[number]; letter: string; editable: boolean; W: number; H: number;
  onRotate: (d: number) => void; onSetRot: (r: number) => void; onFlip: () => void; onPos: (x: number, y: number) => void; onNote: (n: string) => void; onRemove: () => void;
}) {
  const [note, setNote] = useState(p.item.note ?? "");
  const [rot, setRot] = useState(String(p.item.rot));
  useEffect(() => setRot(String(p.item.rot)), [p.item.rot]);
  const sew = polyBoxOf(p.local.sew);
  const btn = "h-8 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50 disabled:opacity-40";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: p.bag.color }}>{letter}</span>
        <div className="min-w-0"><div className="truncate font-medium">{p.piece.name}</div><div className="text-xs text-slate-500">{p.bag.label} · {partLabel(p.piece.part)}{p.piece.count > 1 ? ` · ชิ้นที่ ${p.item.copy + 1}/${p.piece.count}` : ""}</div></div>
      </div>
      <div className="text-xs text-slate-600">ขนาดสำเร็จ {sizeLabel(sew.w, sew.h)}{p.piece.allow ? ` · เผื่อเย็บ ${p.piece.allow} ซม.` : ""}</div>
      <div className="text-xs text-slate-600">อยู่ที่ แนวนอน {Math.round(p.box.x * 10) / 10}–{Math.round((p.box.x + p.box.w) * 10) / 10} · แนวตั้ง {Math.round(p.box.y * 10) / 10}–{Math.round((p.box.y + p.box.h) * 10) / 10} ซม.</div>
      {editable && <>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={btn} onClick={() => onRotate(-90)}>↺ 90°</button>
          <button type="button" className={btn} onClick={() => onRotate(90)}>↻ 90°</button>
          <button type="button" className={btn} onClick={() => onRotate(-1)}>−1°</button>
          <button type="button" className={btn} onClick={() => onRotate(1)}>+1°</button>
          <button type="button" className={`${btn} ${p.item.flip ? "border-indigo-300 bg-indigo-50 text-indigo-700" : ""}`} onClick={onFlip}>พลิก{p.item.flip ? "อยู่" : ""}</button>
        </div>
        <label className="flex items-center gap-1 text-xs text-slate-600">หมุน
          <input inputMode="decimal" value={rot} onChange={(e) => setRot(e.target.value)} onBlur={() => { const v = Number(rot); if (Number.isFinite(v)) onSetRot(v); else setRot(String(p.item.rot)); }} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="h-7 w-16 rounded border border-slate-200 px-1 text-right" /> องศา</label>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={btn} onClick={() => onPos(Math.round((p.item.x - p.box.x) * 100) / 100, p.item.y)}>ชิดซ้าย</button>
          <button type="button" className={btn} onClick={() => onPos(Math.round((W - (p.box.x + p.box.w - p.item.x)) * 100) / 100, p.item.y)}>ชิดขวา</button>
          <button type="button" className={btn} onClick={() => onPos(p.item.x, Math.round((p.item.y - p.box.y) * 100) / 100)}>ชิดบน</button>
          <button type="button" className={btn} onClick={() => onPos(p.item.x, Math.round((H - (p.box.y + p.box.h - p.item.y)) * 100) / 100)}>ชิดล่าง</button>
        </div>
      </>}
      <label className="block text-xs text-slate-500">โน้ตชิ้นนี้ (ไปอยู่ในคำอธิบาย JPEG)
        <input disabled={!editable} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (p.item.note ?? "") && onNote(note.trim())} placeholder="เช่น ให้กวางตัวใหญ่อยู่กลางหน้า" className="mt-1 h-8 w-full rounded border border-slate-200 px-2 text-sm" /></label>
      {editable && <button type="button" onClick={onRemove} className="h-8 w-full rounded-lg text-xs text-red-600 hover:bg-red-50">เอาชิ้นนี้ออกจากผ้า</button>}
    </div>
  );
}

/** เลือกแบบตัด (กระเป๋า) เข้าแผน — ติ๊กได้หลายแบบ · แบบเดียวกันเพิ่มซ้ำได้ (ตัด 2 ใบจากผ้าผืนเดียว) */
function AddBagModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (rows: PatternRow[]) => void }) {
  const [rows, setRows] = useState<PatternRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!open) return;
    setQty({}); setErr(null);
    api<PatternRow[]>(`${API}/patterns`).then(setRows).catch((e) => setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
  }, [open]);
  const shown = (rows ?? []).filter((r) => !q || `${r.code} ${r.name} ${r.parent_code ?? ""} ${r.design_sheet_code ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const total = Object.values(qty).reduce((s, n) => s + n, 0);
  const confirm = () => onPick((rows ?? []).flatMap((r) => Array.from({ length: qty[r.id] ?? 0 }, () => r)));
  return (
    <ERPModal open={open} onClose={onClose} title="เพิ่มกระเป๋าเข้าแผน" size="lg"
      footer={<div className="flex w-full items-center justify-between gap-2">
        <Link href={`${HOME}?tab=patterns`} className="text-xs text-indigo-700 hover:underline">ไม่เจอ? ไปสร้างแบบตัดใหม่</Link>
        <button type="button" disabled={!total} onClick={confirm} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">เพิ่ม {total} ใบ</button>
      </div>}>
      {err ? <ErrorState title={err} /> : rows === null ? <LoadingState /> : (
        <div className="space-y-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อ / Parent SKU" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          {!shown.length && <p className="text-sm text-slate-500">ยังไม่มีแบบตัด — สร้างที่แท็บ “แบบตัด”</p>}
          {shown.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.bag_image ? <img src={bagImgUrl(r.bag_image, 100) ?? ""} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="h-10 w-10 rounded bg-slate-100" />}
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.name}</div><div className="text-xs text-slate-500">{r.parent_code ?? (r.design_sheet_code ? `ใบงาน ${r.design_sheet_code}` : r.code)} · {r.piece_count} ชิ้น</div></div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setQty((m) => ({ ...m, [r.id]: Math.max(0, (m[r.id] ?? 0) - 1) }))} className="h-7 w-7 rounded border border-slate-200">−</button>
                <span className="w-6 text-center tabular-nums">{qty[r.id] ?? 0}</span>
                <button type="button" disabled={!r.piece_count} onClick={() => setQty((m) => ({ ...m, [r.id]: Math.min(12, (m[r.id] ?? 0) + 1) }))} className="h-7 w-7 rounded border border-slate-200 disabled:opacity-40">+</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ERPModal>
  );
}
