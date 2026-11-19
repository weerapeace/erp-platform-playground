"use client";
/**
 * 🧲 มุมมอง "กระดาน" ของแผนงานทีม (เจ้าของขอ 2026-11-15) — กระดานทีม 1 อัน วางงานในแผนคู่กับการ์ดจากระบบอื่น
 *   - ตัวกระดาน = ของกลาง CanvasSketch (Excalidraw · แก้พร้อมกันหลายคน · โน้ตคอมเมนต์) entity team_plan_board/main
 *   - การ์ดจากระบบอื่น = ของกลาง useCardKit (ชุดเดียวกับกระดานแคมเปญ): ใบงานออกแบบ · SKU/Parent · งาน · คอนเทนต์ · เทรนด์ · รูป · โฟลเดอร์ · ตาราง
 *     + การ์ดเฉพาะกระดานนี้: งานในแผน (team_plan) · หน้าใน ERP · โน้ตแปะ
 *   - การ์ดงานในแผน: ข้อมูลสดทุกครั้งที่เปิด + ปุ่ม "อัปเดตการ์ด" · ดับเบิลคลิก = ป๊อปงานเดิม (ติ๊กเสร็จ → ทุกมุมมองเปลี่ยน + แจ้งคนติดตาม)
 *   - ถาดงานด้านขวา (PlanTray · 2026-11-19 ย้ายจากด้านล่าง): กด = วางกลางจอ · ลากลงกระดาน = วางตรงที่ปล่อย · มือถือ = ลิ้นชัก
 *   - 🔗 ลากเส้นจากการ์ดงาน → การ์ดอื่น = ผูกจริง (หลังกระดานบันทึก ระบบเขียน metadata.plan.linked ให้ · ลบเส้น = เลิกผูก) — ตรรกะ lib/team-plan-board
 *   - กรอบโปรเจกต์ = Section (frame) ตั้งชื่อตามแท็กที่ใช้อยู่ได้
 *   - 🗂️ "งานทั้งหมด" (เจ้าของเลือก 2026-11-19 · แบ่งกรอบตามชนิดงาน + ข้อ 1-5): ถาดขวา = งานค้าง 3 ชนิด (แผน · งาน Task · ใบงาน) + ของฉัน/เกินกำหนด
 *     ปุ่ม "จัดงานลงกรอบ" = สร้างกรอบ แผนทีม · งาน Task · ใบงานออกแบบ แล้ววางงานที่ยังไม่อยู่บนกระดานเข้ากรอบ (การ์ดเดิมไม่ขยับ · ย้อนกลับได้)
 *     หัวกรอบ = "ค้าง N · เกิน M" สด · งานที่ปิดแล้วการ์ดจาง + ปุ่ม "เก็บการ์ดที่เสร็จ" (ย้อนกลับได้) — ตรรกะ lib/work-board-frames
 *   - 📋 เลือกการ์ดที่มีเช็กลิสต์ → ปุ่ม "แตกเช็กลิสต์" = กล่องรายการข้างการ์ด (ของกลาง useChecklistExplode · ติ๊ก/เพิ่มข้อได้ · ซิงค์ตอนเปิด/อัปเดตการ์ด)
 * โหลดเฉพาะตอนกดแท็บ "กระดาน" (dynamic import จาก components/team-plan/index.tsx) · doc: docs/team-plan.md
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MutableRefObject } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { designSheetCardSkeleton, taskCardSkeleton } from "@/components/canvas-cards/skeletons";
import { isTerminal } from "@/app/tasks/use-statuses";
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import { ToolMenu, type ToolMenuItem } from "@/components/canvas-cards/drawers";
import { useCardKit } from "@/components/canvas-cards/use-card-kit";
import { useChecklistExplode } from "@/components/canvas-cards/use-checklist-explode";
import { MenuPagePickerModal } from "@/components/menu-page-picker";
import { dueLabel, isPlanDone, planCoverSource, type PlanItem } from "@/lib/team-plan";
import { matchWork, planToWork, workKey, WORK_KIND_META, type WorkItem } from "@/lib/work-canvas";
import {
  doneCards, fadePatches, frameName, planPlacement, readWorkBoard, skelSize, WORK_FRAME_KIND, WORK_FRAME_ORDER, type WorkFrameKey, type WorkState,
} from "@/lib/work-board-frames";
import { patchPlanItem } from "@/lib/team-plan-client";
import { boardPlanLinks, planLinkPatches, PLAN_CARD_KIND, TEAM_PLAN_BOARD } from "@/lib/team-plan-board";
import { r2ImageUrl, withImageWidth } from "@/lib/r2-image";
import { erpPageCardSkeleton, isEmptySync, planCardSkeleton, planCardSync, stickyNoteSkeleton } from "./board-cards";

/** URL รูปเล็กหน้าการ์ดงาน (รูปปกที่แนบเอง → รูปของสิ่งที่ผูก → ไม่มี) · ขอรูปย่อ 160px กันกระดานหนัก */
const planCoverUrl = (t: PlanItem): string | null => {
  const s = planCoverSource(t.plan);
  if (!s) return null;
  return "key" in s ? r2ImageUrl(s.key, 160) : withImageWidth(s.url, 160) ?? s.url;
};
import { AddToPlanModal } from "./add-to-plan";
import { PlanTray, type TrayTab } from "./plan-tray";
import { useWorkSources } from "./use-work-sources";
const dueText = (t: PlanItem) => (t.due_at ? dueLabel(t.due_at) : "");

// Excalidraw ก้อนใหญ่ — โหลดเฉพาะตอนเปิดมุมมองนี้
const CanvasSketch = dynamic(() => import("@/components/canvas-sketch").then((m) => m.CanvasSketch), {
  ssr: false,
  loading: () => <div className="flex h-[60vh] items-center justify-center rounded-xl border border-slate-200 text-sm text-slate-400">กำลังเปิดกระดาน…</div>,
});

/** ให้หน้าแผนงานสั่งกระดานได้ (เช่น ลบงานในป๊อป → เอาการ์ดออกจากกระดาน) */
export type PlanBoardHandle = { removePlanCard: (id: string) => void };

export function PlanCanvasBoard({ items, trayItems, canEdit, tagNames, onOpen, onUpsert, onReload, handleRef, fill = false }: {
  /** โหมดเต็มจอ (FullscreenStage) — กระดาน+ถาดยืดเต็มพื้นที่ที่เหลือ */
  fill?: boolean;
  /** งานทั้งหมดที่หน้าแผนงานโหลดไว้ (ยังไม่เสร็จ + เสร็จใน 7 วัน) — ใช้เติมข้อมูลบนการ์ด */
  items: PlanItem[];
  /** งานที่โชว์ในถาด (ยังไม่เสร็จ ตามตัวกรองทั้งทีม/ของฉัน/แท็ก) — ตัดตัวที่อยู่บนกระดานแล้วออกเอง */
  trayItems: PlanItem[];
  canEdit: boolean;
  /** แท็กที่ทีมใช้อยู่ → ชื่อกรอบโปรเจกต์สำเร็จรูป */
  tagNames: string[];
  onOpen: (t: PlanItem) => void;
  onUpsert: (list: PlanItem[]) => void;
  /** โหลดรายการงานใหม่จากเซิร์ฟเวอร์ */
  onReload: () => Promise<void>;
  handleRef?: MutableRefObject<PlanBoardHandle | null>;
}) {
  const toast = useToast();
  const sketchRef = useRef<CanvasSketchControls | null>(null);
  const kit = useCardKit({ sketchRef, sectionPresets: tagNames.slice(0, 12).map((g) => `โปรเจกต์: ${g}`), contextLabel: "กระดานแผนงาน" });
  const itemsRef = useRef(items); itemsRef.current = items;
  const { user } = useAuth();
  const me = user?.id ?? null;
  const src = useWorkSources(true);   // งาน Task + ใบงาน (สิทธิ์ตามระบบนั้น)
  const srcRef = useRef(src); srcRef.current = src;
  // 📋 แตกเช็กลิสต์ของการ์ดที่เลือกออกมาเป็นกล่องข้างการ์ด (ของกลาง) — ติ๊กในกล่อง = เช็กลิสต์จริงเปลี่ยน → โหลดงานใหม่ให้ป้าย x/y บนการ์ดตาม
  const checklist = useChecklistExplode({
    sketchRef, canEdit,
    onOpenTask: (id) => { kit.onCardOpen({ kind: "task", id }); },
    onChanged: (src) => { if (src.ownerKind === PLAN_CARD_KIND) void onReload().catch(() => {}); },
  });
  const onOpenRef = useRef(onOpen); onOpenRef.current = onOpen;
  const onUpsertRef = useRef(onUpsert); onUpsertRef.current = onUpsert;
  const canEditRef = useRef(canEdit); canEditRef.current = canEdit;
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [onBoard, setOnBoard] = useState<Set<string>>(new Set());
  const [trayOpen, setTrayOpen] = useState(false);   // มือถือ: ลิ้นชักถาดงาน (PC โชว์คอลัมน์ขวาเสมอ)
  const [planNew, setPlanNew] = useState(false);
  const [pagePick, setPagePick] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [doneOnBoard, setDoneOnBoard] = useState(0);
  const placeCount = useRef(0);

  // งานแก้การ์ดบนกระดาน (ซิงค์ข้อความ) ทำทีละงาน — กันสองงานเขียนทับกัน
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const serial = useCallback(<T,>(fn: () => Promise<T>) => { const p = queueRef.current.then(fn, fn); queueRef.current = p.catch(() => undefined); return p; }, []);

  const readOnBoard = useCallback(() => {
    const ctrl = sketchRef.current; if (!ctrl) return;
    const ids = new Set(readWorkBoard(ctrl.getElements()).cards.map((c) => c.key));
    setOnBoard((cur) => (cur.size === ids.size && [...ids].every((x) => cur.has(x)) ? cur : ids));
  }, []);

  /** สถานะงานของการ์ดบนกระดาน — ยังไม่โหลด/ไม่มีสิทธิ์/หาไม่เจอ = ไม่รู้ (ไม่ยุ่งกับการ์ด) */
  const workStateNow = useCallback((): WorkState => {
    const s = srcRef.current;
    const plans = new Map(itemsRef.current.map((t) => [t.id, t]));
    return (wk, id) => {
      if (wk === "plan") { const t = plans.get(id); return t ? (isPlanDone(t) ? "done" : "open") : "unknown"; }
      if (s.loading || !s.loaded) return "unknown";
      if (wk === "task") { const r = s.taskRows.get(id); return r ? (r.is_active === false || isTerminal(r.status) ? "done" : "open") : "unknown"; }
      const r = s.sheetRows.get(id); return r ? (s.sheetClosed(r.status) ? "done" : "open") : "unknown";
    };
  }, []);
  /** ตัวเลขหัวกรอบ (ค้าง · เกิน) — ระบบที่ยังโหลดไม่เสร็จ/ไม่มีสิทธิ์ = ไม่แตะชื่อกรอบนั้น */
  const frameStats = useCallback((): Partial<Record<WorkFrameKey, { total: number; overdue: number }>> => {
    const s = srcRef.current, now = new Date();
    const plans = itemsRef.current.filter((t) => !isPlanDone(t)).map((t) => planToWork(t, "", now));
    const out: Partial<Record<WorkFrameKey, { total: number; overdue: number }>> = { plan: { total: plans.length, overdue: plans.filter((w) => w.overdue).length } };
    if (s.loaded && !s.loading && s.canTasks) out.task = { total: s.tasks.length, overdue: s.tasks.filter((w) => w.overdue).length };
    if (s.loaded && !s.loading && s.canSheets) out.sheet = { total: s.sheets.length, overdue: s.sheets.filter((w) => w.overdue).length };
    return out;
  }, []);
  /** หัวกรอบ = ตัวเลขสด · งานที่ปิดแล้ว = การ์ดจาง · นับการ์ดที่เสร็จ (ปุ่มเก็บ) */
  const applyBoardMeta = useCallback(async () => {
    const ctrl = sketchRef.current; if (!ctrl || !readyRef.current) return;
    const els = ctrl.getElements();
    const board = readWorkBoard(els);
    const state = workStateNow();
    const fade = fadePatches(els, board, state);
    const stats = frameStats();
    const names = new Map<string, string>();
    for (const fr of board.frames.values()) { const st = stats[fr.wk]; if (!st) continue; const n = frameName(fr.wk, st); if (n !== fr.name) names.set(fr.id, n); }
    if (fade.size || names.size) ctrl.patchElements((el) => { const id = String(el.id); const fp = fade.get(id), n = names.get(id); return fp || n ? { ...(fp ?? {}), ...(n ? { name: n } : {}) } : null; });
    setDoneOnBoard(doneCards(board, state).take.length);
  }, [workStateNow, frameStats]);

  /** การ์ดงานในแผน → หน้าตา/ข้อมูล/รูปล่าสุด ทีละชิ้น (board-cards planCardSync) — การ์ดแบบเก่าแปลงเป็นแบบใหม่ให้เอง
   *  ไม่เปลี่ยน id กรอบการ์ด (เส้นผูกงานไม่หลุด) · ไม่มีอะไรต่าง = ไม่บันทึก */
  const refreshPlanCards = useCallback(async () => {
    const ctrl = sketchRef.current; if (!ctrl || !readyRef.current) return;
    const map = new Map(itemsRef.current.map((t) => [t.id, t]));
    const now = new Date();
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const el of ctrl.getElements()) {
      if (el.isDeleted) continue;
      const d = el.customData as Record<string, unknown> | undefined;
      const gid = (el.groupIds as string[] | undefined)?.[0];
      if (d?.kind !== PLAN_CARD_KIND || !gid) continue;
      const arr = groups.get(gid) ?? []; arr.push(el); groups.set(gid, arr);
    }
    const patches = new Map<string, Record<string, unknown>>();
    const remove = new Set<string>();
    const insert: Record<string, unknown>[] = [];
    for (const els of groups.values()) {
      const t = map.get(String((els[0].customData as Record<string, unknown>).id ?? "")); if (!t) continue;
      const s = planCardSync(els, t, now, planCoverUrl(t));
      if (isEmptySync(s)) continue;
      for (const [id, p] of s.patches) patches.set(id, p);
      for (const id of s.remove) remove.add(id);
      insert.push(...s.insert);
    }
    if (patches.size || remove.size) ctrl.patchElements((el) => { const id = String(el.id); return remove.has(id) ? { isDeleted: true } : patches.get(id) ?? null; });
    if (insert.length) await ctrl.insert(insert, { scene: true });
  }, []);
  // ข้อมูลงานเปลี่ยน (แก้ในป๊อป · ติ๊กเสร็จ · โหลดใหม่) → การ์ดบนกระดานเปลี่ยนตาม
  useEffect(() => { if (ready) void serial(refreshPlanCards).then(() => checklist.syncBoxes()).then(() => serial(applyBoardMeta)); }, [items, ready, serial, refreshPlanCards]); // eslint-disable-line react-hooks/exhaustive-deps
  // งาน Task / ใบงานโหลดเสร็จ หรือเปลี่ยน → หัวกรอบ + การ์ดจางตาม
  useEffect(() => { if (ready) void serial(applyBoardMeta); }, [ready, src.taskRows, src.sheetRows, src.loading, src.loaded, serial, applyBoardMeta]);

  // 🔗 หลังกระดานบันทึก → อ่านเส้น → บันทึกรายการผูกของงานที่เปลี่ยน (เฉพาะคนที่แก้แผนงานได้)
  const inflight = useRef(new Set<string>());
  const syncLinks = useCallback(async () => {
    const ctrl = sketchRef.current; if (!ctrl) return;
    const board = boardPlanLinks(ctrl.getElements());
    readOnBoard();
    if (!canEditRef.current) return;
    const patches = planLinkPatches(itemsRef.current, board).filter((p) => !inflight.current.has(p.id));
    let ok = 0, last: PlanItem | null = null;
    for (const p of patches) {
      inflight.current.add(p.id);
      try { const { item } = await patchPlanItem(p.id, { linked: p.linked }); onUpsertRef.current([item]); ok++; last = item; }
      catch (e) { toast.error(e instanceof Error ? `บันทึกการผูกงานไม่สำเร็จ: ${e.message}` : "บันทึกการผูกงานไม่สำเร็จ"); }
      finally { inflight.current.delete(p.id); }
    }
    if (ok === 1 && last) toast.success(last.plan.linked.length ? `งาน "${last.title}" ผูกไว้ ${last.plan.linked.length} อย่างแล้ว` : `งาน "${last.title}" เลิกผูกทั้งหมดแล้ว`);
    else if (ok > 1) toast.success(`อัปเดตการผูกงาน ${ok} งานแล้ว`);
  }, [toast, readOnBoard]);
  const linkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaved = useCallback(() => {
    if (linkTimer.current) clearTimeout(linkTimer.current);
    linkTimer.current = setTimeout(() => { void syncLinks(); void serial(applyBoardMeta); }, 600);
  }, [syncLinks, serial, applyBoardMeta]);
  useEffect(() => () => { if (linkTimer.current) clearTimeout(linkTimer.current); }, []);

  const onReady = useCallback(() => {
    readyRef.current = true;
    setReady(true);
    readOnBoard();
    kit.onBoardReady();                 // ซิงค์การ์ดจากระบบอื่น (ใบงาน/งาน/คอนเทนต์/เทรนด์)
    void onReload().catch(() => {});    // ดึงข้อมูลงานล่าสุดทุกครั้งที่เปิดกระดาน → การ์ดงานอัปเดตเอง (effect ด้านบน)
  }, [kit, onReload, readOnBoard]);

  const updateCards = async () => {
    setRefreshing(true);
    try { await onReload(); await serial(kit.syncAll); await checklist.syncBoxes(); toast.success("อัปเดตการ์ดแล้ว"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "อัปเดตการ์ดไม่สำเร็จ"); }
    finally { setRefreshing(false); }
  };

  /** การ์ดของงาน 1 ชิ้น (ยังไม่วาง · x,y นับจาก 0) — งาน Task เริ่มแบบไม่มีงานย่อย แล้วซิงค์เติมให้ (kit.syncAll) */
  const skelOf = useCallback((w: WorkItem): Record<string, unknown>[] | null => {
    if (w.kind === "plan") { const t = itemsRef.current.find((x) => x.id === w.id) ?? w.plan; return t ? planCardSkeleton(t, new Date(), planCoverUrl(t)) : null; }
    const s = srcRef.current;
    if (w.kind === "task") { const r = s.taskRows.get(w.id); return taskCardSkeleton({ id: w.id, task_no: r?.task_no ?? w.code ?? "", title: r?.title ?? w.title, subtasks: [] }); }
    const r = s.sheetRows.get(w.id);
    return designSheetCardSkeleton({ id: w.id, code: r?.code ?? w.code ?? "", name: r?.name ?? w.title, status: r?.status ?? w.status, deadline: r?.deadline ?? null, cover_url: r?.cover_url ?? null }, w.status_label);
  }, []);

  // วางการ์ดงาน — กด = กลางจอ (เลื่อนทีละนิดกันซ้อน) · ลากมาวาง = ตรงที่ปล่อย
  const placeCenter = useCallback((w: WorkItem, at?: { clientX: number; clientY: number }) => {
    const ctrl = sketchRef.current;
    if (!ctrl) { toast.info("กระดานยังโหลดไม่เสร็จ ลองอีกครั้ง"); return; }
    const skels = skelOf(w); if (!skels) return;
    const k = at ? 0 : (placeCount.current++ % 6) * 28;
    void ctrl.insert(skels.map((el) => ({ ...el, x: (Number(el.x) || 0) + k, y: (Number(el.y) || 0) + k })), at ? { at } : undefined);
    setOnBoard((cur) => new Set(cur).add(workKey(w)));
  }, [toast, skelOf]);
  const placePlan = useCallback((t: PlanItem, at?: { clientX: number; clientY: number }) => placeCenter(planToWork(t, ""), at), [placeCenter]);

  /** วางงานเข้ากรอบหมวด (lib/work-board-frames) — ensureAll = สร้างกรอบให้ครบ 3 หมวด · คืนจำนวนที่วาง + ตัวย้อนกลับ */
  const placeWork = useCallback(async (list: WorkItem[], opts: { ensureAll?: boolean } = {}): Promise<{ n: number; frames: number; undo: () => void } | null> => {
    const ctrl = sketchRef.current;
    if (!ctrl) { toast.info("กระดานยังโหลดไม่เสร็จ ลองอีกครั้ง"); return null; }
    const built = list.map((w) => ({ w, skels: skelOf(w) })).filter((x): x is { w: WorkItem; skels: Record<string, unknown>[] } => !!x.skels?.length);
    const board = readWorkBoard(ctrl.getElements());
    const stats = frameStats();
    const rnd = Math.random().toString(36).slice(2, 7);
    const p = planPlacement(board, built.map(({ w, skels }) => ({ wk: w.kind, key: workKey(w), ...skelSize(skels) })), {
      ensureAll: opts.ensureAll, newId: (wk) => `work-frame-${wk}-${rnd}`,
      names: Object.fromEntries(WORK_FRAME_ORDER.map((k) => [k, frameName(k, stats[k])])),
    });
    const prevH = new Map(p.grow.map((g) => [g.id, [...board.frames.values()].find((fr) => fr.id === g.id)?.h ?? 0]));
    if (p.grow.length) { const g = new Map(p.grow.map((x) => [x.id, x.h])); ctrl.patchElements((el) => (g.has(String(el.id)) ? { height: g.get(String(el.id)) } : null)); }
    const out: Record<string, unknown>[] = [];
    const adopt = new Map<string, string>();   // กลุ่มการ์ด → กรอบที่ต้องผูก
    for (const { w, skels } of built) {
      const a = p.at.get(workKey(w)); if (!a) continue;
      for (const el of skels) out.push({ ...el, x: (Number(el.x) || 0) + a.x, y: (Number(el.y) || 0) + a.y });
      const gid = (skels[0].groupIds as string[] | undefined)?.[0]; if (gid) adopt.set(gid, a.frameId);
    }
    for (const fr of p.newFrames) out.push({ type: "frame", id: fr.id, children: [], name: fr.name, x: fr.x, y: fr.y, width: fr.w, height: fr.h, customData: { kind: WORK_FRAME_KIND, wk: fr.wk } });
    if (out.length) await ctrl.insert(out, { scene: true, fitImages: false });
    if (adopt.size) ctrl.patchElements((el) => { const fid = adopt.get((el.groupIds as string[] | undefined)?.[0] ?? ""); return fid && el.frameId !== fid ? { frameId: fid } : null; });
    readOnBoard();
    const fids = new Set(p.newFrames.map((fr) => fr.id));
    const undo = () => {
      ctrl.patchElements((el) => {
        const id = String(el.id), gid = (el.groupIds as string[] | undefined)?.[0] ?? "";
        if (fids.has(id) || adopt.has(gid)) return { isDeleted: true };
        return prevH.has(id) ? { height: prevH.get(id) } : null;
      });
      readOnBoard();
    };
    return { n: adopt.size, frames: p.newFrames.length, undo };
  }, [toast, skelOf, frameStats, readOnBoard]);

  const onDrop = (e: DragEvent) => {
    const key = e.dataTransfer.getData("text/plan-id");
    setDragOver(false);
    if (!key) return;
    e.preventDefault();
    const w = allWork.find((x) => workKey(x) === key) ?? allWork.find((x) => x.kind === "plan" && x.id === key);
    if (!w) return;
    placeCenter(w, { clientX: e.clientX, clientY: e.clientY });
    if (w.kind !== "plan") void serial(kit.syncAll);
  };

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = { removePlanCard: (id) => { sketchRef.current?.removeCards((c) => c.kind === PLAN_CARD_KIND && c.id === id); setOnBoard((cur) => { const n = new Set(cur); n.delete(`plan:${id}`); return n; }); } };
    return () => { handleRef.current = null; };
  }, [handleRef]);

  const onCardOpen = useCallback((data: Record<string, unknown>) => {
    if (checklist.onCardOpen(data)) return;
    if (data.kind === PLAN_CARD_KIND) {
      const t = itemsRef.current.find((x) => x.id === String(data.id ?? ""));
      if (t) onOpenRef.current(t);
      else toast.info("งานนี้เสร็จเกิน 7 วันแล้วหรือถูกลบ — ไม่อยู่ในรายการแผนงานตอนนี้");
      return;
    }
    if (data.kind === "erp_page") {
      const href = String(data.href ?? data.id ?? "");
      if (href.startsWith("/") && !href.startsWith("//")) window.open(href, "_blank", "noopener");
      return;
    }
    kit.onCardOpen(data);
  }, [kit, toast, checklist]);

  const allWork = useMemo(() => [...trayItems.map((t) => planToWork(t, t.due_at ? dueText(t) : "")), ...src.tasks, ...src.sheets], [trayItems, src.tasks, src.sheets]);
  const free = useMemo(() => allWork.filter((w) => !onBoard.has(workKey(w))), [allWork, onBoard]);
  const trayTabs: TrayTab<WorkItem>[] = useMemo(() => {
    const off = (w: WorkItem) => !onBoard.has(workKey(w));
    const t: TrayTab<WorkItem>[] = [
      { key: "free", label: "ยังไม่ได้วาง", filter: off },
      { key: "plan", label: "แผน", filter: (w) => off(w) && w.kind === "plan" },
    ];
    if (src.canTasks) t.push({ key: "task", label: "งาน Task", filter: (w) => off(w) && w.kind === "task" });
    if (src.canSheets) t.push({ key: "sheet", label: "ใบงาน", filter: (w) => off(w) && w.kind === "sheet" });
    t.push({ key: "me", label: "ของฉัน", filter: (w) => off(w) && matchWork(w, "me", me) });
    t.push({ key: "over", label: "เกินกำหนด", filter: (w) => off(w) && w.overdue });
    t.push({ key: "all", label: "ทั้งหมด", filter: () => true });
    return t;
  }, [onBoard, src.canTasks, src.canSheets, me]);

  /** กดงานในถาด — มีกรอบหมวดแล้ว = วางต่อท้ายในกรอบ · ยังไม่มี = กลางจอ */
  const pickWork = (w: WorkItem) => {
    if (onBoard.has(workKey(w))) { toast.info("งานนี้อยู่บนกระดานแล้ว"); return; }
    const ctrl = sketchRef.current; if (!ctrl) return;
    setTrayOpen(false);
    if (readWorkBoard(ctrl.getElements()).frames.has(w.kind)) void serial(() => placeWork([w])).then(() => (w.kind !== "plan" ? serial(kit.syncAll) : undefined));
    else { placeCenter(w); if (w.kind !== "plan") void serial(kit.syncAll); }
  };

  /** ปุ่ม "จัดงานลงกรอบ" — กรอบครบ 3 หมวด + งานค้างที่ยังไม่อยู่บนกระดานเข้ากรอบ (การ์ดเดิมไม่ขยับ) · ย้อนกลับได้ */
  const arrangeAll = async () => {
    setArranging(true);
    try {
      const r = await serial(() => placeWork(free, { ensureAll: true }));
      if (!r) return;
      if (r.n) await serial(kit.syncAll);   // งานย่อย/รูป/สีสถานะของการ์ดใหม่
      if (!r.n && !r.frames) { toast.info("งานค้างทุกชิ้นอยู่บนกระดานแล้ว"); return; }
      toast.undo(r.n ? `จัดงาน ${r.n} ชิ้นลงกรอบแล้ว` : "สร้างกรอบหมวดให้ครบแล้ว", () => { r.undo(); void serial(applyBoardMeta); });
    } catch (e) { toast.error(e instanceof Error ? `จัดงานลงกรอบไม่สำเร็จ: ${e.message}` : "จัดงานลงกรอบไม่สำเร็จ"); }
    finally { setArranging(false); }
  };

  /** ปุ่ม "เก็บการ์ดที่เสร็จ" — เอาการ์ดงานที่ปิดแล้วออก (ข้ามใบที่ผูกกับงานแผนที่ยังไม่เสร็จ กันการผูกหลุด) · ย้อนกลับได้ */
  const clearDone = () => {
    const ctrl = sketchRef.current; if (!ctrl) return;
    const els = ctrl.getElements();
    const plans = new Map(itemsRef.current.map((t) => [t.id, t]));
    const skip = new Set<string>();
    for (const [pid, refs] of boardPlanLinks(els).links) { const t = plans.get(pid); if (t && !isPlanDone(t)) for (const r of refs) skip.add(`${r.kind}:${r.id}`); }
    const { take, skipped } = doneCards(readWorkBoard(els), workStateNow(), skip);
    if (!take.length) { toast.info(skipped ? `การ์ดที่เสร็จ ${skipped} ใบผูกกับงานแผนที่ยังไม่เสร็จ — ไม่ได้เก็บ` : "ไม่มีการ์ดของงานที่เสร็จบนกระดาน"); return; }
    const gids = new Set(take.map((c) => c.gid));
    const gidOf = (el: Record<string, unknown>) => (el.groupIds as string[] | undefined)?.[0] ?? "";
    const ids = els.filter((el) => !el.isDeleted && gids.has(gidOf(el))).map((el) => String(el.id));
    ctrl.patchElements((el) => (gids.has(gidOf(el)) ? { isDeleted: true } : null));
    readOnBoard(); setDoneOnBoard(0);
    toast.undo(`เก็บการ์ดที่เสร็จ ${take.length} ใบแล้ว${skipped ? ` (ข้าม ${skipped} ใบที่ผูกกับงานแผนที่ยังไม่เสร็จ)` : ""}`, () => { ctrl.restoreElements(ids); readOnBoard(); void serial(applyBoardMeta); });
  };
  const k = kit.items;
  const ic = (name: string) => <Icon name={name} />;
  const addItems: ToolMenuItem[] = [
    { icon: ic("add"), label: "งานในแผน (สร้างใหม่)", hint: "สร้างงานใหม่ในแผน แล้ววางการ์ดเลย — โผล่ในทุกมุมมอง", onClick: () => setPlanNew(true) },
    { icon: ic("list"), label: "งานที่มีอยู่ (แผน · งาน Task · ใบงาน)", hint: "ถาดงานด้านขวา (กด = เข้ากรอบหมวด · ลากลงกระดาน) · มือถือ = เปิดลิ้นชักถาด", onClick: () => setTrayOpen(true) },
    ...(kit.canDesign ? [{ ...k.designSheet, icon: ic("design") }] : []),
    { ...k.sku, icon: ic("package") },
    { ...k.parent, icon: ic("dna") },
    { ...k.marketing, icon: ic("target") },
    { ...k.task, icon: ic("done") },
    { ...k.content, icon: ic("campaign") },
    { ...k.trend, icon: ic("hot") },
    { icon: ic("web"), label: "หน้าใน ERP", hint: "การ์ดลัดไปหน้าในระบบ (ดับเบิลคลิกเปิด)", onClick: () => setPagePick(true) },
  ];
  const toolItems: ToolMenuItem[] = [
    { ...k.section, icon: ic("folders"), label: "กรอบโปรเจกต์", hint: "ตีกรอบจัดกลุ่มการ์ด (ตั้งชื่อตามแท็ก/โปรเจกต์ได้)" },
    { icon: ic("note"), label: "โน้ตแปะ", hint: "กระดาษโน้ตสีเหลือง ดับเบิลคลิกพิมพ์", onClick: () => { void sketchRef.current?.insert(stickyNoteSkeleton()); } },
    { ...k.table, icon: ic("table-view") },
    { ...k.folder, icon: ic("folder") },
    { ...k.asset, icon: ic("image") },
    { ...k.cards, icon: ic("list") },
  ];

  const H = fill ? "100%" : "calc(100vh - 260px)";
  return (
    <div className={fill ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-2"}>
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && <ToolMenu label="เพิ่มการ์ด" icon={ic("add")} tone="violet" items={addItems} />}
        {canEdit && <ToolMenu label="เครื่องมือ" icon={ic("tool")} tone="teal" items={toolItems} />}
        <button type="button" onClick={() => void updateCards()} disabled={refreshing || !ready}
          title="ดึงข้อมูลล่าสุดของทุกการ์ด (งานในแผน ใบงาน งาน คอนเทนต์ เทรนด์)"
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <Icon name="refresh" /> {refreshing ? "กำลังอัปเดต…" : "อัปเดตการ์ด"}
        </button>
        {canEdit && ready && (
          <button type="button" onClick={() => void arrangeAll()} disabled={arranging}
            title="สร้างกรอบ แผนทีม · งาน Task · ใบงานออกแบบ แล้ววางงานค้างที่ยังไม่อยู่บนกระดานเข้ากรอบของมัน (การ์ดที่วางไว้แล้วไม่ขยับ · ย้อนกลับได้)"
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 text-sm text-violet-700 hover:bg-violet-100 disabled:opacity-50">
            <Icon name="folders" /> {arranging ? "กำลังจัด…" : `จัดงานลงกรอบ${free.length ? ` (${free.length})` : ""}`}
          </button>
        )}
        {canEdit && ready && doneOnBoard > 0 && (
          <button type="button" onClick={clearDone} title="เอาการ์ดของงานที่ปิดแล้วออกจากกระดาน (ย้อนกลับได้)"
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50">
            <Icon name="done" /> เก็บการ์ดที่เสร็จ {doneOnBoard}
          </button>
        )}
        {canEdit && ready && checklist.button}
        {src.error && <span className="text-[11px] text-rose-600" title={src.error}>โหลดงาน Task / ใบงานบางส่วนไม่สำเร็จ</span>}
        {canEdit && ready && (
          <button type="button" onClick={() => setTrayOpen(true)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 md:hidden">
            <Icon name="list" /> งาน {free.length}
          </button>
        )}
        <span className={`text-[11px] text-slate-400${fill ? " hidden xl:inline" : ""}`}>ดับเบิลคลิกการ์ด = เปิดดู/แก้ · ลากเส้นจากการ์ดงานไปการ์ดอื่น = ผูกงาน (ลบเส้น = เลิกผูก) · เลือกการ์ดแล้วกด "แตกเช็กลิสต์" = กล่องรายการข้างการ์ด · ล้อเมาส์ = ซูม</span>
      </div>

      <div className={fill ? "flex min-h-0 flex-1 gap-2" : "flex gap-2"}>
      <div className={`relative min-w-0 flex-1 rounded-xl ${dragOver ? "ring-2 ring-violet-300" : ""}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("text/plan-id")) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
        <CanvasSketch entityType={TEAM_PLAN_BOARD.entityType} entityId={TEAM_PLAN_BOARD.entityId} editable={canEdit} height={H} fill={fill}
          controlsRef={sketchRef} onCardOpen={onCardOpen} onReady={onReady} onSaved={onSaved} onSelectionChange={checklist.onSelectionChange} collab stickyTop={fill ? undefined : 56} />
      </div>
      {/* ถาดงานด้านขวา (ของกลางในโมดูล PlanTray · ใช้ร่วมกับโหมดผังระบบ) — กด = วางกลางจอ · ลากลงกระดาน = วางตรงที่ปล่อย */}
      {canEdit && ready && (
        <PlanTray<WorkItem> items={allWork} tabs={trayTabs} title="งานค้าง" keyOf={workKey} dragData={workKey} onPick={pickWork}
          renderLead={(w) => <span className={`shrink-0 rounded px-1 text-[10px] leading-4 ${WORK_KIND_META[w.kind].chip}`}>{WORK_KIND_META[w.kind].short}</span>}
          emptyText="งานค้างในแท็บนี้อยู่บนกระดานครบแล้ว" footer="กด = วางเข้ากรอบหมวด (ยังไม่มีกรอบ = กลางจอ) · ลากลงกระดาน = วางตรงนั้น"
          mobileOpen={trayOpen} onMobileClose={() => setTrayOpen(false)} height={H} />
      )}
      </div>

      {/* ป๊อปของชุดการ์ดกลาง (เลือก/สร้าง/เปิดดูการ์ดจากระบบอื่น) */}
      {kit.ui}
      {checklist.ui}
      {planNew && <AddToPlanModal open defaultTitle="" onClose={() => setPlanNew(false)}
        onCreated={(item) => { onUpsertRef.current([item]); placePlan(item); }} />}
      <MenuPagePickerModal open={pagePick} onClose={() => setPagePick(false)} title="เลือกหน้าใน ERP มาวางบนกระดาน"
        onPick={(p) => { setPagePick(false); void sketchRef.current?.insert(erpPageCardSkeleton({ href: p.href, label: p.label, appName: p.appName })); }} />
    </div>
  );
}
