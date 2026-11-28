"use client";
/**
 * 🧵 ไฟล์ปัก — หน้าทำงาน (/master/embroidery/<id>)
 *   ซ้าย: ตัวอย่างฝีเข็ม + เล่นลำดับการปัก · ขวา: ขนาดจริง · ความแน่นตามผ้า · ชนิดฝีเข็ม/รหัสด้าย/ลำดับ ตามสี · คำเตือนส่วนที่บาง/เล็ก
 *   ทุกการแก้คำนวณฝีเข็มใหม่ทันทีในเบราว์เซอร์ (lib/embroidery) · ย้อนกลับได้ (ปุ่ม/Ctrl+Z) · ทำซ้ำ (Ctrl+Y) · บันทึกด้วย SaveBar กลาง
 *   กระดาน = ชุดกระดานกลาง (components/board-kit): ล็อก (ค่าเริ่มต้น · ลูกกลิ้ง = เลื่อนหน้า · ล็อกเข้ม = ห้ามแก้บนกระดาน) · กล่องเครื่องมือลอย · ปุ่มลัด ? · ขยายเต็มจอ (F)
 *   ดาวน์โหลด .DST = สร้างจากที่เห็นบนจอ · ใบสั่งปัก = /print/embroidery/<id> (ใช้ค่าที่บันทึกแล้ว)
 *   จอแคบ: ภาพอยู่บน แผงตั้งค่าเรียงลงมา
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { SaveBar } from "@/components/save-bar";
import { BoardFullscreenButton, BoardToolbox, type BoardToolGroup } from "@/components/board-kit";
import { FullscreenStage, useFullscreenStage } from "@/components/fullscreen-stage";
import { ConfirmDialog } from "@/components/modal";
import { ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import { ART_ACCEPT } from "@/lib/block-print-ai";
import { skippedNote } from "@/components/block-print/shared";
import { opsToSvgPath, pieceShapes, type BlockPiece } from "@/lib/block-print";
import { buildPlan, cleanSettings, colorsOf, designBox, FABRICS, isActive, LIMITS, startWidth, STITCH_TYPES, warningGroups, withSelection, type BoxMm, type EmbSettings, type PieceOpt, type StitchType } from "@/lib/embroidery";
import { moveHandle, pieceHandles, planFrame, reorderSequence, textPiece, type Handle } from "@/lib/embroidery-edit";
import type { DirLine } from "@/lib/embroidery-satin";
import { StitchPreview, type PreviewView } from "./stitch-preview";
import { SequenceList } from "./sequence-list";
import { PiecePanel, type EditTool } from "./piece-panel";
import { TextPieceModal, type TextResult } from "./text-modal";
import { ThreadPalette } from "./thread-palette";
import { readLogoFile, SKIPPED_KEY } from "./list";
import { SelectStep, type PickResult } from "./select-step";
import { ShopFilePanel, useShopPlan } from "./shop-file";
import { API, api, DENSITY, downloadDst, downloadPes, fmtNum, LIST_HREF, planStats, sheetHref, type Design } from "./shared";

/** rev = นับการแก้ชิ้น (แก้จุด/เพิ่มตัวหนังสือ) ไว้รู้ว่ามีอะไรเปลี่ยนต้องบันทึก */
type Snap = { pieces: BlockPiece[]; settings: EmbSettings; rev?: number };
/** ชิ้นใหม่ทำให้กรอบงานเปลี่ยน → ปรับกว้างที่ปักให้ "ขนาดจริงของลายเดิม" เท่าเดิม */
/** หัวลูกศรที่ปลายเส้นทิศ (จุดบนจอ) */
const arrow = (x1: number, y1: number, x2: number, y2: number) => {
  const a = Math.atan2(y2 - y1, x2 - x1), L = 9, w = 0.45;
  return [[x2, y2], [x2 - L * Math.cos(a - w), y2 - L * Math.sin(a - w)], [x2 - L * Math.cos(a + w), y2 - L * Math.sin(a + w)]].map((p) => p.join(",")).join(" ");
};
const keepScale = (oldPieces: BlockPiece[], newPieces: BlockPiece[], st: EmbSettings): number => {
  const ob = designBox(oldPieces.filter(isActive)), nb = designBox(newPieces.filter(isActive));
  return ob.w > 0 && nb.w > 0 ? Math.min(LIMITS.width_max, Math.max(LIMITS.width_min, Math.round(nb.w * (st.width_mm / ob.w) * 10) / 10)) : st.width_mm;
};
type Meta = { name: string; note: string; parent: ParentSkuPickerValue | null };

const inputCls = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-indigo-400 focus:outline-none disabled:bg-slate-50";

export function EmbroideryEditor({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const canEdit = usePermission("embroidery.edit");
  const fileRef = useRef<HTMLInputElement>(null);
  const [design, setDesign] = useState<Design | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [meta, setMeta] = useState<Meta>({ name: "", note: "", parent: null });
  const [saved, setSaved] = useState<string>("");
  const [history, setHistory] = useState<Snap[]>([]);
  /** ทำซ้ำ (Ctrl+Y) — ล้างทุกครั้งที่แก้ใหม่ */
  const [future, setFuture] = useState<Snap[]>([]);
  const [saving, setSaving] = useState(false);
  const [upto, setUpto] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showJumps, setShowJumps] = useState(false);
  const [real, setReal] = useState(true);
  const [showShop, setShowShop] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [askTrash, setAskTrash] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ key: string; box: BoxMm } | null>(null);
  const [tool, setTool] = useState<EditTool>("select");
  const [compare, setCompare] = useState(false);
  const [grid, setGrid] = useState(true);
  const [colorEdit, setColorEdit] = useState<string | null>(null);
  const [textOpen, setTextOpen] = useState(false);
  /** เส้นทิศที่กำลังลาก (พิกัดงาน) · จุดที่กำลังลากแก้ (ชิ้นตัวอย่างระหว่างลาก) */
  const [draft, setDraft] = useState<DirLine | null>(null);
  const [nodeDrag, setNodeDrag] = useState<{ h: Handle; start: [number, number]; orig: BlockPiece; piece: BlockPiece } | null>(null);
  /** ขั้นเลือกส่วน: pieces = ชิ้นที่จะให้เลือก (ของเดิม หรือจากไฟล์ใหม่) */
  const [picking, setPicking] = useState<{ pieces: BlockPiece[]; fileName?: string; initialOn?: string[] } | null>(null);
  // กระดาน: เต็มจอ (มือถือไม่บังคับ เพราะมีแผงตั้งค่า) · ไม่มีระบบล็อกกระดานแล้ว (เจ้าของสั่ง 2026-11-28)
  const fs = useFullscreenStage("embroidery_board_fullscreen", { phoneAlways: false });
  const [winH, setWinH] = useState(900);
  useEffect(() => {
    const on = () => setWinH(window.innerHeight);
    on(); window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  const keyOf = (s: Snap | null, m: Meta) => JSON.stringify([s?.settings, s?.rev ?? 0, s?.pieces.length, s?.pieces[0]?.d.length, s?.pieces.map((p) => (p.on === false ? 0 : 1)).join(""), m.name, m.note, m.parent?.id ?? null]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const d = await api<Design>(`${API}/${id}`);
      const s: Snap = { pieces: d.pieces, settings: cleanSettings(d.settings, d.pieces) };
      const m: Meta = { name: d.name, note: d.note ?? "", parent: d.parent ? { id: d.parent.id, code: d.parent.code, name: d.parent.name } : null };
      setDesign(d); setSnap(s); setMeta(m); setHistory([]); setFuture([]); setSaved(keyOf(s, m));
      try {
        const raw = sessionStorage.getItem(SKIPPED_KEY(id));
        if (raw) { setSkipped(skippedNote(JSON.parse(raw)).filter((t) => !t.startsWith("พื้นหลัง"))); sessionStorage.removeItem(SKIPPED_KEY(id)); }
      } catch { /* ไม่มีที่จำ */ }
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const deferred = useDeferredValue(snap);
  const plan = useMemo(() => (deferred ? buildPlan(deferred.pieces, deferred.settings) : null), [deferred]);
  const box = useMemo(() => (snap ? designBox(snap.pieces) : null), [snap]);
  // ไฟล์จากร้าน: ดูภาพแทนฝีเข็มที่ระบบแปลง · งานที่มีแต่ไฟล์ร้าน (ไม่มีลาย) ดูไฟล์ร้านเสมอ
  const shopPlan = useShopPlan(design, plan?.colors.map((c) => c.color) ?? []);
  const shopOnly = !!snap && snap.pieces.length === 0;
  const viewing = !!shopPlan && (showShop || shopOnly);
  const vplan = viewing ? shopPlan : plan;
  const dirty = !!snap && keyOf(snap, meta) !== saved;

  /** แก้ค่าตั้ง (จดประวัติไว้ย้อนกลับ) */
  const edit = useCallback((fn: (s: EmbSettings) => EmbSettings) => {
    setSnap((cur) => {
      if (!cur) return cur;
      setHistory((h) => [...h.slice(-49), cur]);
      // ผ่านตัวตรวจทุกครั้ง (กันค่า 0/ติดลบทำให้คำนวณค้าง)
      return { ...cur, settings: cleanSettings(fn(cur.settings), cur.pieces) };
    });
    setFuture([]);
    setUpto(null);
  }, []);
  /** แก้ชิ้น (แก้จุด/เพิ่มตัวหนังสือ) + ค่าตั้งที่ต้องเปลี่ยนตาม · จดประวัติไว้ย้อนกลับ */
  const editPieces = useCallback((fn: (p: BlockPiece[]) => BlockPiece[], stFn?: (s: EmbSettings, oldP: BlockPiece[], newP: BlockPiece[]) => EmbSettings) => {
    setSnap((cur) => {
      if (!cur) return cur;
      setHistory((h) => [...h.slice(-49), cur]);
      const pieces = fn(cur.pieces);
      const settings = cleanSettings(stFn ? stFn(cur.settings, cur.pieces, pieces) : cur.settings, pieces);
      return { pieces, settings, rev: (cur.rev ?? 0) + 1 };
    });
    setFuture([]);
    setUpto(null);
  }, []);
  const snapRef = useRef(snap); snapRef.current = snap;
  const histRef = useRef(history); histRef.current = history;
  const futRef = useRef(future); futRef.current = future;
  const undo = useCallback(() => {
    const h = histRef.current, cur = snapRef.current;
    if (!h.length) return;
    setHistory(h.slice(0, -1));
    if (cur) setFuture((f) => [...f.slice(-49), cur]);
    setSnap(h[h.length - 1]);
    setUpto(null);
  }, []);
  const redo = useCallback(() => {
    const f = futRef.current, cur = snapRef.current;
    if (!f.length) return;
    setFuture(f.slice(0, -1));
    if (cur) setHistory((h) => [...h.slice(-49), cur]);
    setSnap(f[f.length - 1]);
    setUpto(null);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // เล่นลำดับการปัก
  useEffect(() => {
    if (!playing || !vplan) return;
    let raf = 0;
    const total = vplan.cmds.length;
    const step = Math.max(1, Math.round(total / 600));
    const tick = () => {
      setUpto((u) => {
        const n = (u ?? 0) + step;
        if (n >= total) { setPlaying(false); return null; }
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, vplan]);

  const save = async (): Promise<boolean> => {
    if (!snap || !plan) return false;
    if (!meta.name.trim()) { toast.error("ต้องใส่ชื่องาน"); return false; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name: meta.name, note: meta.note, parent_sku_id: meta.parent?.id ?? null, settings: snap.settings, ...planStats(shopOnly && shopPlan ? shopPlan : buildPlan(snap.pieces, snap.settings)) };
      if (design && snap.pieces !== design.pieces) { body.pieces = snap.pieces; body.source_file_name = design.source_file_name; }
      const d = await api<Design>(`${API}/${id}`, { method: "PATCH", json: body });
      setDesign({ ...d, pieces: snap.pieces });
      setSaved(keyOf(snap, meta));
      toast.success("บันทึกแล้ว");
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); return false; }
    finally { setSaving(false); }
  };
  const discard = () => { void load(); };

  const replaceFile = async (file: File) => {
    try {
      const r = await readLogoFile(file);
      setPicking({ pieces: r.pieces, fileName: file.name });
      setSkipped(skippedNote(r.skipped).filter((t) => !t.startsWith("พื้นหลัง")));
    } catch (e) { toast.error(e instanceof Error ? e.message : "เปิดไฟล์ไม่สำเร็จ"); }
  };
  /** ผลขั้นเลือกส่วน → ใช้กับงานนี้ (ย้อนกลับได้) · แยกหลายงาน: กลุ่มแรกอยู่งานนี้ กลุ่มอื่นสร้างงานใหม่ */
  const applyPick = async (r: PickResult) => {
    const pk = picking; if (!pk || !snap) return;
    setPicking(null);
    const sets = r.mode === "one" ? [{ ids: r.on, label: "" }] : r.sets;
    const mine = withSelection(pk.pieces, sets[0].ids);
    const isNewFile = !!pk.fileName;
    setHistory((h) => [...h.slice(-49), snap]);
    setSnap({ pieces: mine, settings: cleanSettings({ ...snap.settings, width_mm: r.mode === "one" && r.widthMm ? r.widthMm : isNewFile || r.mode === "split" || shopOnly ? startWidth(mine) : snap.settings.width_mm, piece_types: isNewFile ? {} : snap.settings.piece_types }, mine) });
    if (isNewFile && design) setDesign({ ...design, source_file_name: pk.fileName ?? design.source_file_name });
    setSelectedId(null); setUpto(null);
    if (sets.length > 1) {
      try {
        for (const set of sets.slice(1)) {
          const pieces = withSelection(pk.pieces, set.ids);
          const settings = cleanSettings({ ...snap.settings, width_mm: startWidth(pieces), piece_types: {} }, pieces);
          await api<Design>(API, { json: { name: `${meta.name} – ${set.label}`, source_file_name: pk.fileName ?? design?.source_file_name ?? null, parent_sku_id: meta.parent?.id ?? null, pieces, settings, ...planStats(buildPlan(pieces, settings)) } });
        }
        toast.success(`สร้างงานใหม่อีก ${sets.length - 1} งานจากกลุ่มที่เหลือแล้ว (ดูที่หน้ารายการ) · งานนี้ใช้ ${sets[0].label} — กดบันทึก`);
      } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างงานไม่สำเร็จ"); }
    } else toast.success("เปลี่ยนส่วนที่ปักแล้ว — กดบันทึกเพื่อใช้ (ย้อนกลับได้)");
  };

  const toTrash = async () => {
    try {
      await api(`${API}/${id}`, { method: "DELETE" });
      toast.success("ย้ายเข้าถังขยะแล้ว — กู้คืนได้ที่ถังขยะหน้ารายการ");
      router.push(LIST_HREF);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  const openSheet = async () => {
    if (dirty && !(await save())) return;
    window.open(sheetHref(id), "_blank");
  };

  if (err) return <div className="mx-auto max-w-3xl p-6"><div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">{err} <button className="ml-2 underline" onClick={() => void load()}>ลองใหม่</button></div></div>;
  if (!design || !snap || !plan || !vplan || !box) return <div className="mx-auto max-w-6xl p-6 text-sm text-slate-500">กำลังโหลด…</div>;

  const st = snap.settings;
  const ratio = box.w > 0 ? box.h / box.w : 1;
  const setWidth = (mm: number) => edit((s) => ({ ...s, width_mm: Math.min(LIMITS.width_max, Math.max(LIMITS.width_min, Math.round(mm * 10) / 10)) }));
  const density = DENSITY.find((d) => Math.abs(d.fill - st.fill_spacing) < 0.001 && Math.abs(d.satin - st.satin_spacing) < 0.001)?.key ?? "custom";
  const wgroups = warningGroups(plan, st.width_mm);
  const sel = selectedId ? plan.pieces.find((p) => p.id === selectedId) ?? null : null;
  const activeColors = colorsOf(snap.pieces, true);
  const setTypeMany = (ids: string[], t: StitchType | null) => edit((s) => { const pt = { ...s.piece_types }; for (const i of ids) { if (t) pt[i] = t; else delete pt[i]; } return { ...s, piece_types: pt }; });
  const piecesOfColor = (c: string) => snap.pieces.filter((p) => (p.color ?? "#000000") === c).length;
  const moveColor = (c: string, dir: -1 | 1) => edit((s) => {
    const o = [...s.color_order];
    const vis = o.filter((x) => activeColors.includes(x));
    const other = vis[vis.indexOf(c) + dir];
    if (!other) return s;
    const i = o.indexOf(c), j = o.indexOf(other);
    [o[i], o[j]] = [o[j], o[i]];
    return { ...s, color_order: o };
  });
  const setColor = (c: string, patch: Partial<EmbSettings["colors"][string]>) => edit((s) => ({ ...s, colors: { ...s.colors, [c]: { ...s.colors[c], ...patch } } }));
  const setPieceType = (pid: string, t: StitchType | null) => edit((s) => {
    const pt = { ...s.piece_types };
    if (t) pt[pid] = t; else delete pt[pid];
    return { ...s, piece_types: pt };
  });
  // ───── หน้าจอแก้ลาย (รอบ 4) ─────
  const frame = planFrame(snap.pieces, st);
  const selPiece = sel ? snap.pieces.find((p) => p.id === sel.id) ?? null : null;
  const selOpt: PieceOpt = sel ? st.piece_opts[sel.id] ?? {} : {};
  const setPieceOpt = (pid: string, patch: Partial<Record<keyof PieceOpt, unknown>>) => edit((s) => {
    const po: Record<string, unknown> = { ...(s.piece_opts[pid] ?? {}) };
    for (const [k, v] of Object.entries(patch)) { if (v == null || (typeof v === "number" && !Number.isFinite(v))) delete po[k]; else po[k] = v; }
    return { ...s, piece_opts: { ...s.piece_opts, [pid]: po as PieceOpt } };
  });
  const resetPiece = (pid: string) => edit((s) => {
    const po = { ...s.piece_opts }, pt = { ...s.piece_types };
    delete po[pid]; delete pt[pid];
    return { ...s, piece_opts: po, piece_types: pt };
  });
  /**
   * เปลี่ยนสีด้ายของชิ้น (ids) → สีใหม่ · ค่าตั้งของสีเดิม (ชนิดฝี/มุม/ปัก) ตามไปด้วย · เลือกจากจานด้าย = ใส่รหัสด้ายให้
   *   ย้ายทั้งกลุ่ม = สีใหม่อยู่ลำดับเดิมของสีเก่า · ย้ายบางชิ้น = สีใหม่ต่อท้ายสีเก่า (ถ้ายังไม่มีสีนั้น)
   */
  const recolor = (ids: string[], hex: string, label: string | null) => {
    const to = hex.toLowerCase();
    const idSet = new Set(ids);
    editPieces((ps) => ps.map((p) => (idSet.has(p.id) ? { ...p, color: to } : p)), (s0, oldP) => {
      const from = oldP.find((p) => idSet.has(p.id))?.color ?? "#000000";
      if (from === to) return s0;
      const wholeGroup = !oldP.some((p) => !idSet.has(p.id) && (p.color ?? "#000000") === from);
      const colors = { ...s0.colors };
      const base = colors[from] ?? { type: "auto" as const, angle: 45, thread: "", on: true };
      const keepThread = (t: string) => (label && (!t || t.startsWith("Brother ")) ? label : t);
      if (!colors[to]) colors[to] = { ...base, thread: keepThread(wholeGroup ? base.thread : "") };
      else if (label) colors[to] = { ...colors[to], thread: keepThread(colors[to].thread) };
      let order = s0.color_order.filter((c) => c !== to);
      const at = order.indexOf(from);
      order = wholeGroup ? order.map((c) => (c === from ? to : c)) : [...order.slice(0, at + 1), to, ...order.slice(at + 1)];
      if (wholeGroup) delete colors[from];
      return { ...s0, colors, color_order: order };
    });
    toast.success(`เปลี่ยนสีด้าย ${ids.length} ชิ้นแล้ว${label ? ` (${label})` : ""} — ย้อนกลับได้`);
  };
  const pickTool = (t: EditTool) => { if (t !== "select" && !sel) { toast.error("คลิกเลือกชิ้นในภาพ หรือในรายการลำดับปักก่อน"); return; } setTool(t); setDraft(null); };
  /** ลากเส้นทิศฝีเข็มบนชิ้นที่เลือก (พิกัดงาน → เก็บเป็นพิกัดไฟล์) */
  const onDraw = (e: { phase: "down" | "move" | "up"; x: number; y: number }) => {
    if (!sel) return;
    if (e.phase === "down") setDraft([e.x, e.y, e.x, e.y]);
    else if (e.phase === "move") setDraft((d) => (d ? [d[0], d[1], e.x, e.y] : d));
    else {
      const d = draft;
      setDraft(null);
      if (!d || Math.hypot(e.x - d[0], e.y - d[1]) < 0.8) return;
      const a = frame.toFile(d[0], d[1]), b = frame.toFile(e.x, e.y);
      const lines = [...(selOpt.lines ?? []), [a[0], a[1], b[0], b[1]]];
      // ชิ้นถมเต็มที่แคบ (≤ 8 มม.) ลากเส้นทิศ = อยากให้ฝีโค้งตามตัวอักษร → เปลี่ยนเป็นซิกแซกให้เลย
      if (sel.type === "fill" && sel.width <= 8) {
        const pid = sel.id;
        edit((s) => ({ ...s, piece_types: { ...s.piece_types, [pid]: "satin" }, piece_opts: { ...s.piece_opts, [pid]: { ...(s.piece_opts[pid] ?? {}), lines: lines as DirLine[] } } }));
        toast.success("ชิ้นนี้แคบ — เปลี่ยนเป็นซิกแซกให้แล้ว ฝีจะโค้งตามเส้นที่ลาก (ย้อนกลับได้)");
      } else setPieceOpt(sel.id, { lines });
    }
  };
  const fileAt = (v: PreviewView, cx: number, cy: number) => { const [px, py] = v.toPlan(cx, cy); return frame.toFile(px, py); };
  const overlay = (v: PreviewView) => {
    const S = (fx: number, fy: number) => { const [px, py] = frame.toPlan(fx, fy); return v.toScreen(px, py); };
    const out: React.ReactNode[] = [];
    // เส้นทิศของชิ้นที่เลือก
    if (sel && !viewing) (selOpt.lines ?? []).forEach((l, i) => {
      const [x1, y1] = S(l[0], l[1]), [x2, y2] = S(l[2], l[3]);
      out.push(<g key={`l${i}`}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ea580c" strokeWidth={2.5} /><circle cx={x1} cy={y1} r={3.5} fill="#ea580c" /><polygon points={arrow(x1, y1, x2, y2)} fill="#ea580c" /></g>);
    });
    if (draft) { const [x1, y1] = v.toScreen(draft[0], draft[1]), [x2, y2] = v.toScreen(draft[2], draft[3]); out.push(<line key="draft" x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ea580c" strokeWidth={2.5} strokeDasharray="6 4" />); }
    // แก้จุด: เส้นขอบ (ชิ้นตัวอย่างระหว่างลาก) + จุดลากได้
    if (tool === "node" && selPiece && !viewing) {
      const p = nodeDrag?.piece ?? selPiece;
      const a = frame.scale * v.k, [ox, oy] = S(p.ax, p.ay);
      out.push(<path key="outline" d={pieceShapes(p).map((sh) => opsToSvgPath(sh.d, a, a, ox, oy)).join(" ")} fill="rgba(79,70,229,0.08)" stroke="#4f46e5" strokeWidth={1.2} />);
      const hs = pieceHandles(p);
      hs.forEach((h, i) => {
        const [x, y] = S(h.x, h.y);
        out.push(<circle key={`h${i}`} cx={x} cy={y} r={nodeDrag?.h.i === h.i && nodeDrag.h.s === h.s ? 6 : 4.5} fill="#fff" stroke="#4f46e5" strokeWidth={1.5} style={{ pointerEvents: "auto", cursor: "move", touchAction: "none" }}
          onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); setNodeDrag({ h, start: fileAt(v, e.clientX, e.clientY), orig: p, piece: p }); }}
          onPointerMove={(e) => { if (!nodeDrag) return; const [fx, fy] = fileAt(v, e.clientX, e.clientY); setNodeDrag({ ...nodeDrag, piece: moveHandle(nodeDrag.orig, nodeDrag.h, fx - nodeDrag.start[0], fy - nodeDrag.start[1]) }); }}
          onPointerUp={() => {
            const nd = nodeDrag; setNodeDrag(null);
            if (!nd || nd.piece === nd.orig) return;
            editPieces((ps) => ps.map((q) => (q.id === nd.piece.id ? nd.piece : q)), (s0, oldP, newP) => ({ ...s0, width_mm: keepScale(oldP, newP, s0) }));
          }} />);
      });
      if (hs.length >= 600) out.push(<text key="many" x={8} y={v.h - 10} fontSize={11} fill="#b45309">ชิ้นนี้มีจุดเยอะ แสดงแค่ 600 จุดแรก</text>);
    }
    return out.length ? <>{out}</> : null;
  };
  /** พิมพ์ตัวหนังสือ → ชิ้นใหม่ วางใต้ลายเดิม (ขนาดจริงตามที่ตั้ง · ลายเดิมขนาดเท่าเดิม) */
  const addText = (r: TextResult) => {
    setTextOpen(false);
    const active = snap.pieces.filter(isActive);
    const b = designBox(active);
    const sc = active.length && b.w > 0 ? frame.scale : 1;
    const hf = r.heightMm / sc;
    const piece = textPiece(r.ops, { id: `t${Date.now().toString(36)}`, name: r.text.slice(0, 40), color: r.color, heightFile: hf, at: active.length ? [b.x, b.y + b.h + hf * 0.5] : [0, 0] });
    editPieces((ps) => [...ps, piece], (s0, oldP, newP) => ({ ...s0, width_mm: active.length ? keepScale(oldP, newP, s0) : Math.max(LIMITS.width_min, Math.round(piece.ow * sc * 10) / 10) }));
    setSelectedId(piece.id);
    toast.success("เพิ่มตัวหนังสือแล้ว — ลากทิศฝี/ตั้งค่าได้ที่แผงชิ้น · กดบันทึกเพื่อใช้");
  };
  /** ความสูงกระดาน: เต็มจอ = เกือบทั้งจอ (เหลือแถบเล่นลำดับ) · มือถือ 300 */
  const phoneW = typeof window !== "undefined" && window.innerWidth < 768;
  const boardH = (desk: number) => (fs.on ? Math.max(260, winH - (phoneW ? 150 : 110)) : phoneW ? 300 : desk);
  /** กล่องเครื่องมือ (ของกลาง BoardToolbox) */
  const toolGroups: BoardToolGroup[] = [
    { key: "edit", label: "แก้งาน", tools: [
      { key: "select", icon: "i:pointer", label: "เลือกชิ้น", hotkey: "V", active: tool === "select", onClick: () => pickTool("select") },
      { key: "dir", icon: "i:line", label: "ลากทิศฝีเข็ม", hotkey: "D", active: tool === "dir", onClick: () => pickTool("dir") },
      { key: "node", icon: "i:vector-bezier", label: "แก้จุดรูปทรง", hotkey: "N", active: tool === "node", onClick: () => pickTool("node") },
      { key: "text", icon: "i:typography", label: "ตัวหนังสือ", hotkey: "T", onClick: () => setTextOpen(true) },
    ] },
    { key: "hist", label: "ประวัติ", tools: [
      { key: "undo", icon: "i:arrow-back-up", label: "ย้อนกลับ", hint: "Ctrl+Z", disabled: !history.length, onClick: undo },
      { key: "redo", icon: "i:arrow-forward-up", label: "ทำซ้ำ", hint: "Ctrl+Y", disabled: !future.length, onClick: redo },
    ] },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-3 pb-24 md:p-6 md:pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={LIST_HREF} className="text-sm text-slate-500 hover:text-slate-800">← ไฟล์ปัก</Link>
        <span className="font-mono text-xs text-slate-400">{design.code}</span>
        <input value={meta.name} disabled={!canEdit} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-slate-900 hover:border-slate-200 focus:border-indigo-400 focus:outline-none" />
        <span className="hidden text-xs text-slate-400 md:inline">{design.source_file_name}</span>
      </div>

      {skipped.length > 0 && (
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ตอนเปิดไฟล์ข้ามบางส่วน: {skipped.join(" · ")}
        </div>
      )}

      <FullscreenStage fs={fs} className="space-y-4">
      <div className={`grid gap-4 ${fs.on ? "min-h-0 flex-1 overflow-y-auto" : ""} ${shopOnly ? "lg:grid-cols-[minmax(0,1fr)_340px]" : "lg:grid-cols-[220px_minmax(0,1fr)_340px]"}`}>
        {/* ───── รายการชิ้นตามลำดับปัก (แถบซ้าย · จอแคบอยู่ใต้ภาพ) ───── */}
        {!shopOnly && (
          <div className="order-2 lg:order-none">
            <SequenceList plan={plan} custom={st.sequence.length > 0} selectedId={selectedId} canEdit={canEdit}
              onSelect={(pid) => { setSelectedId(pid); const p = plan.pieces.find((x) => x.id === pid); if (p) setFocus({ key: `${pid}:${Date.now()}`, box: p.box }); }}
              onReorder={(from, to) => edit((s) => ({ ...s, sequence: reorderSequence(s.sequence, plan.pieces.map((p) => p.id), from, to) }))}
              onAuto={() => edit((s) => ({ ...s, sequence: [] }))} />
          </div>
        )}
        {/* ───── ภาพตัวอย่าง ───── */}
        <div className="order-1 space-y-3 lg:order-none">
          {!shopOnly && shopPlan && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {shopPlan && (
                <button type="button" onClick={() => { setCompare((c) => !c); setShowShop(false); }}
                  className={`ml-auto h-8 rounded-lg border px-3 ${compare ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>เทียบ 2 ฝั่ง (ระบบ / ร้าน)</button>
              )}
            </div>
          )}
          {viewing && !shopOnly && (
            <div className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-800">
              กำลังดูไฟล์จากร้าน ({design.shop_file_name}) <button type="button" onClick={() => setShowShop(false)} className="ml-auto underline">กลับไปดูที่ระบบแปลง</button>
            </div>
          )}
          {compare && shopPlan && !shopOnly ? (
            <div className="grid gap-2 md:grid-cols-2">
              <div><div className="mb-1 text-xs font-medium text-slate-500">ระบบแปลง · {fmtNum(plan.stitches)} ฝี · {(plan.width / 10).toFixed(1)} × {(plan.height / 10).toFixed(1)} ซม.</div>
                <StitchPreview plan={plan} showJumps={showJumps} real={real} grid={grid} fabric={st.fabric} height={boardH(420)} /></div>
              <div><div className="mb-1 text-xs font-medium text-slate-500">ไฟล์จากร้าน · {fmtNum(shopPlan.stitches)} ฝี · {(shopPlan.width / 10).toFixed(1)} × {(shopPlan.height / 10).toFixed(1)} ซม.</div>
                <StitchPreview plan={shopPlan} showJumps={showJumps} real={real} grid={grid} fabric={st.fabric} height={boardH(420)} /></div>
            </div>
          ) : (
            <StitchPreview plan={vplan} upto={upto ?? undefined} showJumps={showJumps} real={real} grid={grid} fabric={st.fabric} selectedId={viewing ? null : selectedId} focus={viewing ? null : focus}
              onPick={canEdit && !viewing ? setSelectedId : undefined} height={boardH(480)}
              drawMode={tool === "dir" && !!sel && !viewing} onDraw={onDraw} overlay={overlay}
              controls={<BoardFullscreenButton on={fs.on} onToggle={fs.toggle} />}>
              {canEdit && !shopOnly && <BoardToolbox prefKey="embroidery_toolbox" groups={toolGroups} />}
            </StitchPreview>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <button type="button" onClick={() => { if (playing) setPlaying(false); else { setUpto(0); setPlaying(true); } }}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 hover:bg-slate-50">
              <Icon name="play" /> {playing ? "หยุด" : "เล่นลำดับการปัก"}
            </button>
            <input type="range" min={0} max={vplan.cmds.length} value={upto ?? vplan.cmds.length} onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setUpto(v >= vplan.cmds.length ? null : v); }} className="min-w-[120px] flex-1" aria-label="ปักถึงฝีที่" />
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={real} onChange={(e) => setReal(e.target.checked)} /> เหมือนด้ายจริง</label>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> ตาราง มม.</label>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={showJumps} onChange={(e) => setShowJumps(e.target.checked)} /> เส้นกระโดด</label>
          </div>

          {sel && !viewing && (
            <PiecePanel info={sel} opt={selOpt} typeSet={st.piece_types[sel.id]} canEdit={canEdit} tool={tool} setTool={pickTool}
              sameCount={snap.pieces.filter((p) => isActive(p) && (p.color ?? "#000000") === sel.color).length}
              onColor={(h, label, all) => recolor(all ? snap.pieces.filter((p) => (p.color ?? "#000000") === sel.color).map((p) => p.id) : [sel.id], h, label)}
              onType={(t) => setPieceType(sel.id, t)} onOpt={(patch) => setPieceOpt(sel.id, patch)} onReset={() => resetPiece(sel.id)}
              onClose={() => { setSelectedId(null); setTool("select"); }} />
          )}
          {!sel && canEdit && !shopOnly && <p className="text-[11px] text-slate-400">คลิกชิ้นในภาพ (หรือในรายการลำดับปัก) เพื่อตั้งค่ารายชิ้น · ลากทิศฝีเข็ม · แก้จุด</p>}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="ฝีเข็ม" value={fmtNum(vplan.stitches)} />
            <Stat label="สีด้าย / เปลี่ยนด้าย" value={`${vplan.colors.length} / ${vplan.colorChanges}`} />
            <Stat label={viewing ? "ขนาด (ซม.)" : "ตัดด้าย"} value={viewing ? `${(vplan.width / 10).toFixed(1)} × ${(vplan.height / 10).toFixed(1)}` : fmtNum(vplan.trims)} />
            <Stat label="เวลาปักโดยประมาณ" value={`~${Math.max(1, Math.round(vplan.minutes))} นาที`} />
          </div>

          {wgroups.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-900"><Icon name="warning" /> ส่วนที่อาจปักไม่สวย ({wgroups.length} จุด · {wgroups.reduce((n, g) => n + g.ids.length, 0)} ชิ้น)</div>
              <ul className="space-y-2">
                {wgroups.slice(0, 20).map((g) => (
                  <li key={g.key} className="rounded-md bg-white/70 p-2 text-xs">
                    <div className={g.level === "danger" ? "text-red-700" : "text-amber-800"}>{g.text}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <button type="button" onClick={() => setFocus({ key: `${g.key}:${Date.now()}`, box: g.box })} className="rounded border border-amber-300 bg-white px-1.5 py-0.5 hover:bg-amber-100">ดูในภาพ</button>
                      {canEdit && g.kind !== "wide" && <button type="button" onClick={() => setTypeMany(g.ids, "run")} className="rounded border border-amber-300 bg-white px-1.5 py-0.5 hover:bg-amber-100">เดินเส้นทั้งกลุ่ม</button>}
                      {canEdit && g.kind === "wide" && <button type="button" onClick={() => setTypeMany(g.ids, "fill")} className="rounded border border-amber-300 bg-white px-1.5 py-0.5 hover:bg-amber-100">ถมเต็มทั้งกลุ่ม</button>}
                      {canEdit && <button type="button" onClick={() => setTypeMany(g.ids, "skip")} className="rounded border border-amber-300 bg-white px-1.5 py-0.5 hover:bg-amber-100">ไม่ปักทั้งกลุ่ม</button>}
                      {canEdit && g.fixWidthMm && g.fixWidthMm > st.width_mm && (
                        <button type="button" onClick={() => setWidth(g.fixWidthMm!)} className="rounded border border-amber-300 bg-white px-1.5 py-0.5 hover:bg-amber-100">ขยายงานเป็น {(g.fixWidthMm / 10).toFixed(1)} ซม.</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-amber-700">ทางแก้ที่ดีที่สุด = ขยายขนาดงาน หรือทำเส้น/ตัวหนังสือให้หนาขึ้นในไฟล์ต้นฉบับ</p>
            </div>
          )}
          {Object.keys(st.piece_types).length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
              <div className="mb-1.5 flex items-center font-medium text-slate-700">ชิ้นที่ตั้งฝีเข็มเอง ({Object.keys(st.piece_types).length})
                {canEdit && <button type="button" onClick={() => edit((s) => ({ ...s, piece_types: {} }))} className="ml-auto font-normal text-slate-500 underline">ล้างทั้งหมด</button>}
              </div>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto">
                {Object.entries(st.piece_types).map(([pid, t]) => (
                  <span key={pid} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5">
                    <button type="button" onClick={() => setSelectedId(pid)} className="hover:underline">{snap.pieces.find((p) => p.id === pid)?.name ?? pid}</button>: {STITCH_TYPES.find((x) => x.key === t)?.th}
                    {canEdit && <button type="button" onClick={() => setPieceType(pid, null)} className="text-slate-400 hover:text-red-600" aria-label="ใช้ตามสี">×</button>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ───── แผงตั้งค่า ───── */}
        <div className="order-3 space-y-4 lg:order-none">
          <ShopFilePanel design={design} canEdit={canEdit} showing={viewing} onShow={setShowShop} onChange={(d) => { setDesign(d); setUpto(null); }} />
          {!shopOnly && (<>
          <section className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium text-slate-500">ขนาดจริงที่ปัก (ซม.)</div>
            <div className="flex items-center gap-2">
              <input type="number" step={0.1} min={LIMITS.width_min / 10} max={LIMITS.width_max / 10} disabled={!canEdit} className={inputCls}
                value={Math.round(st.width_mm) / 10} onChange={(e) => { const v = Number(e.target.value); if (v > 0) setWidth(v * 10); }} aria-label="กว้าง ซม." />
              <span className="text-slate-400">×</span>
              <input type="number" step={0.1} disabled={!canEdit} className={inputCls}
                value={Math.round(st.width_mm * ratio) / 10} onChange={(e) => { const v = Number(e.target.value); if (v > 0 && ratio > 0) setWidth((v * 10) / ratio); }} aria-label="สูง ซม." />
              <Icon name="lock" title="ล็อกสัดส่วน" className="shrink-0 text-slate-400" />
            </div>
            <div className="mt-3 mb-1.5 text-xs font-medium text-slate-500">ความแน่นตามผ้า</div>
            <div className="flex flex-wrap gap-1.5">
              {DENSITY.map((d) => (
                <button key={d.key} type="button" disabled={!canEdit} onClick={() => edit((s) => ({ ...s, fill_spacing: d.fill, satin_spacing: d.satin }))}
                  className={`rounded-lg border px-2.5 py-1 text-xs ${density === d.key ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{d.th}</button>
              ))}
              <button type="button" onClick={() => setAdvanced((a) => !a)} className="ml-auto text-xs text-slate-500 underline">{advanced ? "ซ่อนค่าละเอียด" : "ค่าละเอียด"}</button>
            </div>
            {advanced && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <NumField label="ระยะแถวถมเต็ม (มม.)" value={st.fill_spacing} step={0.05} disabled={!canEdit} onChange={(v) => edit((s) => ({ ...s, fill_spacing: v }))} />
                <NumField label="ระยะฝีซิกแซก (มม.)" value={st.satin_spacing} step={0.05} disabled={!canEdit} onChange={(v) => edit((s) => ({ ...s, satin_spacing: v }))} />
                <NumField label="ความยาวฝีถม (มม.)" value={st.fill_len} step={0.5} disabled={!canEdit} onChange={(v) => edit((s) => ({ ...s, fill_len: v }))} />
                <NumField label="ความยาวฝีเดินเส้น (มม.)" value={st.run_len} step={0.5} disabled={!canEdit} onChange={(v) => edit((s) => ({ ...s, run_len: v }))} />
                <NumField label="ชดเชยผ้าหด (มม.)" value={st.pull_comp} step={0.05} disabled={!canEdit} onChange={(v) => edit((s) => ({ ...s, pull_comp: v }))} />
                <NumField label="ตัดด้ายเมื่อย้ายไกลเกิน (มม.)" value={st.trim_at} step={0.5} disabled={!canEdit} onChange={(v) => edit((s) => ({ ...s, trim_at: v }))} />
              </div>
            )}
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" disabled={!canEdit} checked={st.underlay} onChange={(e) => edit((s) => ({ ...s, underlay: e.target.checked }))} />
              ฝีรองพื้นอัตโนมัติ <span className="text-slate-400">(ผ้าเรียบขึ้น ตัวหนังสือนูนชัด · เพิ่มฝีเข็ม)</span>
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" disabled={!canEdit} checked={st.satin_follow} onChange={(e) => edit((s) => ({ ...s, satin_follow: e.target.checked }))} />
              ซิกแซกเลี้ยวตามเส้น <span className="text-slate-400">(ตัวหนังสือ/เส้นโค้งเนียนขึ้น · ปิด = ทิศเดียวทั้งชิ้น)</span>
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" disabled={!canEdit} checked={st.fill_auto_angle} onChange={(e) => edit((s) => ({ ...s, fill_auto_angle: e.target.checked }))} />
              มุมถมเต็มตามรูปทรง <span className="text-slate-400">(ชิ้นยาวเอียงแถวตามชิ้นเอง · ปิด = ใช้มุมของสี)</span>
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <label className="flex items-center gap-2">
                <input type="checkbox" disabled={!canEdit} checked={st.border_mm > 0} onChange={(e) => edit((s) => ({ ...s, border_mm: e.target.checked ? 1.2 : 0 }))} />
                ขอบซิกแซกรอบพื้นถม
              </label>
              {st.border_mm > 0 && (
                <span className="flex items-center gap-1">
                  กว้าง
                  <input type="number" min={0.5} max={LIMITS.border_max} step={0.1} disabled={!canEdit} value={st.border_mm}
                    onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) edit((s) => ({ ...s, border_mm: Math.min(LIMITS.border_max, Math.max(0.5, v)) })); }}
                    className="h-7 w-16 rounded border border-slate-200 px-1.5 tabular-nums" /> มม.
                </span>
              )}
              <span className="w-full text-slate-400">ขอบคมแบบอาร์มติดเสื้อ · ใส่เฉพาะชิ้นถมเต็มที่กว้างพอ</span>
            </div>
            <div className="mt-3 mb-1.5 text-xs font-medium text-slate-500">สีพื้นผ้า (ภาพตัวอย่าง + ใบสั่งปัก)</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {FABRICS.map((fb) => (
                <button key={fb.hex} type="button" disabled={!canEdit} title={fb.th} aria-label={`ผ้าสี${fb.th}`} onClick={() => edit((s) => ({ ...s, fabric: fb.hex }))}
                  className={`h-7 w-7 rounded-full border ${st.fabric === fb.hex ? "ring-2 ring-indigo-500 ring-offset-1" : "border-slate-300"}`} style={{ background: fb.hex }} />
              ))}
              <input type="color" disabled={!canEdit} value={st.fabric} onChange={(e) => edit((s) => ({ ...s, fabric: e.target.value }))} className="h-7 w-9 cursor-pointer rounded border border-slate-200" aria-label="สีผ้าอื่น" />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium text-slate-500">สีด้าย → ชนิดฝีเข็ม (เรียงตามลำดับที่ปัก)</div>
            <ul className="divide-y divide-slate-100">
              {st.color_order.filter((c) => activeColors.includes(c)).map((c, i, vis) => {
                const cs = st.colors[c];
                if (!cs) return null;
                const cb = plan.colors.find((x) => x.color === c);
                return (
                  <li key={c} className={`space-y-1.5 py-2 ${cs.on ? "" : "opacity-50"}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-4 text-center text-xs text-slate-400">{i + 1}</span>
                      <button type="button" disabled={!canEdit} onClick={() => setColorEdit((x) => (x === c ? null : c))} title="เปลี่ยนสีด้ายทั้งกลุ่มนี้"
                        className={`h-6 w-6 shrink-0 rounded border ${colorEdit === c ? "ring-2 ring-indigo-500 ring-offset-1" : "border-black/10"}`} style={{ background: c }} aria-label={`เปลี่ยนสี ${c}`} />
                      <select disabled={!canEdit || !cs.on} value={cs.type} onChange={(e) => setColor(c, { type: e.target.value as StitchType })} className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-1.5 text-sm">
                        {STITCH_TYPES.filter((t) => t.key !== "skip").map((t) => <option key={t.key} value={t.key}>{t.th}</option>)}
                      </select>
                      {canEdit && (
                        <span className="flex shrink-0">
                          <button type="button" disabled={i === 0} onClick={() => moveColor(c, -1)} className="px-1 text-slate-400 hover:text-slate-800 disabled:opacity-30" aria-label="ปักก่อน">▲</button>
                          <button type="button" disabled={i === vis.length - 1} onClick={() => moveColor(c, 1)} className="px-1 text-slate-400 hover:text-slate-800 disabled:opacity-30" aria-label="ปักทีหลัง">▼</button>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pl-6 text-xs text-slate-500">
                      <input disabled={!canEdit} value={cs.thread} placeholder="รหัสด้าย เช่น Madeira 1000" onChange={(e) => setColor(c, { thread: e.target.value })}
                        className="h-7 min-w-0 flex-1 rounded border border-slate-200 px-1.5 text-xs" />
                      {(cs.type === "fill" || cs.type === "auto") && (
                        <label className="inline-flex items-center gap-1" title="มุมแถวถมเต็ม">มุม
                          <input type="number" disabled={!canEdit} value={cs.angle} step={15} onChange={(e) => setColor(c, { angle: ((Math.round(Number(e.target.value) || 0) % 180) + 180) % 180 })}
                            className="h-7 w-14 rounded border border-slate-200 px-1 text-xs" />°</label>
                      )}
                      <label className="inline-flex items-center gap-1"><input type="checkbox" disabled={!canEdit} checked={cs.on} onChange={(e) => setColor(c, { on: e.target.checked })} /> ปัก</label>
                    </div>
                    {colorEdit === c && canEdit && (
                      <div className="ml-6 rounded-lg border border-slate-200 bg-slate-50 p-2">
                        <ThreadPalette value={c} onPick={(h, label) => { recolor(snap.pieces.filter((p) => (p.color ?? "#000000") === c).map((p) => p.id), h, label); setColorEdit(null); }} />
                      </div>
                    )}
                    <div className="pl-6 text-[11px] text-slate-400">{piecesOfColor(c)} ชิ้น · {fmtNum(cb?.stitches ?? 0)} ฝี</div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-[11px] text-slate-400">อัตโนมัติ = ส่วนแคบ (≤ 6 มม.) ใช้ซิกแซก ส่วนกว้างถมเต็ม · สีที่ปักทีหลังจะทับสีก่อน</p>
          </section>
          </>)}

          <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium text-slate-500">ผูกกับสินค้า (Parent SKU)</div>
            <ParentSkuPicker value={meta.parent} onChange={(v) => setMeta((m) => ({ ...m, parent: v }))} disabled={!canEdit} disableCreate />
            <div className="text-xs font-medium text-slate-500">หมายเหตุถึงร้านปัก</div>
            <textarea disabled={!canEdit} rows={2} value={meta.note} onChange={(e) => setMeta((m) => ({ ...m, note: e.target.value }))} placeholder="เช่น ปักบนผ้าแคนวาส ตำแหน่งหน้ากระเป๋า"
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none" />
          </section>

          <section className="flex flex-wrap gap-2">
            {!shopOnly && (<>
            <button type="button" onClick={() => downloadDst(plan, design.code, meta.name)}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700">
              <Icon name="download" /> ดาวน์โหลด .DST
            </button>
            <button type="button" onClick={() => downloadPes(plan, design.code, meta.name)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50" title="Brother">
              <Icon name="download" /> .PES
            </button>
            <button type="button" onClick={() => void openSheet()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
              <Icon name="printer" /> ใบสั่งปัก
            </button>
            </>)}
            {canEdit && (
              <>
                {!shopOnly && <button type="button" disabled={!history.length} onClick={undo} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40" title="Ctrl+Z">
                  <Icon name="history" /> ย้อนกลับ
                </button>}
                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
                  <Icon name="refresh" /> {shopOnly ? "เพิ่มลายโลโก้ (ให้ระบบแปลง)" : "เปิดไฟล์ใหม่"}
                </button>
                {!shopOnly && <button type="button" onClick={() => setPicking({ pieces: snap.pieces, initialOn: snap.pieces.filter(isActive).map((p) => p.id) })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
                  <Icon name="link" /> เลือกส่วนที่ปัก
                </button>}
                <button type="button" onClick={() => setAskTrash(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-sm text-red-600 hover:bg-red-50">
                  <Icon name="trash" /> ลบ
                </button>
              </>
            )}
            <input ref={fileRef} type="file" accept={ART_ACCEPT} className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void replaceFile(f); }} />
          </section>
          <p className="text-[11px] leading-relaxed text-slate-400">
            ไฟล์ .DST ไม่มีข้อมูลสี — ร้านดูลำดับสีจากใบสั่งปัก · ไฟล์ที่ระบบแปลงอัตโนมัติควรให้ร้านปักทดสอบ 1 ชิ้นก่อนสั่งจริง · งานที่ต้องสวยแน่นอน ให้ร้านตีบล็อกแล้วเก็บไฟล์ไว้ที่ "ไฟล์จากร้าน"
          </p>
        </div>
      </div>
      {canEdit && <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onDiscard={discard} />}
      </FullscreenStage>

      {picking && <SelectStep key={(picking.fileName ?? "") + picking.pieces.length} open pieces={picking.pieces} initialOn={picking.initialOn ?? null}
        onCancel={() => setPicking(null)} onDone={(r) => void applyPick(r)} title={picking.fileName ? `เลือกส่วนที่จะปัก — ${picking.fileName}` : "เลือกส่วนที่จะปัก"} />}
      {textOpen && <TextPieceModal open onClose={() => setTextOpen(false)} onAdd={addText} colors={activeColors} />}
      <ConfirmDialog open={askTrash} onClose={() => setAskTrash(false)} onConfirm={() => void toTrash()} variant="danger"
        title="ย้ายงานนี้เข้าถังขยะ?" message={<>ย้าย <b>{design.code} {meta.name}</b> เข้าถังขยะ — กู้คืนได้ที่ถังขยะหน้ารายการ</>} confirmText="ย้ายเข้าถังขยะ" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-base font-semibold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

function NumField({ label, value, step, disabled, onChange }: { label: string; value: number; step: number; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <label className="space-y-0.5">
      <span className="block">{label}</span>
      <input type="number" step={step} value={value} disabled={disabled} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) onChange(v); }}
        className="h-8 w-full rounded border border-slate-200 px-1.5 text-sm" />
    </label>
  );
}
