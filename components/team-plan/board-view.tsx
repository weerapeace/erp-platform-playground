"use client";
/**
 * 🧲 มุมมอง "กระดาน" ของแผนงานทีม (เจ้าของขอ 2026-11-15) — กระดานทีม 1 อัน วางงานในแผนคู่กับการ์ดจากระบบอื่น
 *   - ตัวกระดาน = ของกลาง CanvasSketch (Excalidraw · แก้พร้อมกันหลายคน · โน้ตคอมเมนต์) entity team_plan_board/main
 *   - การ์ดจากระบบอื่น = ของกลาง useCardKit (ชุดเดียวกับกระดานแคมเปญ): ใบงานออกแบบ · SKU/Parent · งาน · คอนเทนต์ · เทรนด์ · รูป · โฟลเดอร์ · ตาราง
 *     + การ์ดเฉพาะกระดานนี้: งานในแผน (team_plan) · หน้าใน ERP · โน้ตแปะ
 *   - การ์ดงานในแผน: ข้อมูลสดทุกครั้งที่เปิด + ปุ่ม "อัปเดตการ์ด" · ดับเบิลคลิก = ป๊อปงานเดิม (ติ๊กเสร็จ → ทุกมุมมองเปลี่ยน + แจ้งคนติดตาม)
 *   - ถาด "งานที่ยังไม่ได้วาง" ด้านล่าง: กด = วางกลางจอ · ลากลงกระดาน = วางตรงที่ปล่อย
 *   - 🔗 ลากเส้นจากการ์ดงาน → การ์ดอื่น = ผูกจริง (หลังกระดานบันทึก ระบบเขียน metadata.plan.linked ให้ · ลบเส้น = เลิกผูก) — ตรรกะ lib/team-plan-board
 *   - กรอบโปรเจกต์ = Section (frame) ตั้งชื่อตามแท็กที่ใช้อยู่ได้
 * โหลดเฉพาะตอนกดแท็บ "กระดาน" (dynamic import จาก components/team-plan/index.tsx) · doc: docs/team-plan.md
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MutableRefObject } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import { ToolMenu, type ToolMenuItem } from "@/components/canvas-cards/drawers";
import { useCardKit } from "@/components/canvas-cards/use-card-kit";
import { MenuPagePickerModal } from "@/components/menu-page-picker";
import { dueLabel, isOverdue, planCoverSource, PRIORITY_META, type PlanItem } from "@/lib/team-plan";
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

// Excalidraw ก้อนใหญ่ — โหลดเฉพาะตอนเปิดมุมมองนี้
const CanvasSketch = dynamic(() => import("@/components/canvas-sketch").then((m) => m.CanvasSketch), {
  ssr: false,
  loading: () => <div className="flex h-[60vh] items-center justify-center rounded-xl border border-slate-200 text-sm text-slate-400">กำลังเปิดกระดาน…</div>,
});

/** ให้หน้าแผนงานสั่งกระดานได้ (เช่น ลบงานในป๊อป → เอาการ์ดออกจากกระดาน) */
export type PlanBoardHandle = { removePlanCard: (id: string) => void };

export function PlanCanvasBoard({ items, trayItems, canEdit, tagNames, onOpen, onUpsert, onReload, handleRef }: {
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
  const onOpenRef = useRef(onOpen); onOpenRef.current = onOpen;
  const onUpsertRef = useRef(onUpsert); onUpsertRef.current = onUpsert;
  const canEditRef = useRef(canEdit); canEditRef.current = canEdit;
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [onBoard, setOnBoard] = useState<Set<string>>(new Set());
  const [trayOpen, setTrayOpen] = useState(true);
  const [planNew, setPlanNew] = useState(false);
  const [pagePick, setPagePick] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const placeCount = useRef(0);

  // งานแก้การ์ดบนกระดาน (ซิงค์ข้อความ) ทำทีละงาน — กันสองงานเขียนทับกัน
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const serial = useCallback(<T,>(fn: () => Promise<T>) => { const p = queueRef.current.then(fn, fn); queueRef.current = p.catch(() => undefined); return p; }, []);

  const readOnBoard = useCallback(() => {
    const ctrl = sketchRef.current; if (!ctrl) return;
    const ids = boardPlanLinks(ctrl.getElements()).onBoard;
    setOnBoard((cur) => (cur.size === ids.size && [...ids].every((x) => cur.has(x)) ? cur : ids));
  }, []);

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
  useEffect(() => { if (ready) void serial(refreshPlanCards); }, [items, ready, serial, refreshPlanCards]);

  // 🔗 หลังกระดานบันทึก → อ่านเส้น → บันทึกรายการผูกของงานที่เปลี่ยน (เฉพาะคนที่แก้แผนงานได้)
  const inflight = useRef(new Set<string>());
  const syncLinks = useCallback(async () => {
    const ctrl = sketchRef.current; if (!ctrl) return;
    const board = boardPlanLinks(ctrl.getElements());
    setOnBoard((cur) => (cur.size === board.onBoard.size && [...board.onBoard].every((x) => cur.has(x)) ? cur : board.onBoard));
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
  }, [toast]);
  const linkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaved = useCallback(() => {
    if (linkTimer.current) clearTimeout(linkTimer.current);
    linkTimer.current = setTimeout(() => { void syncLinks(); }, 600);
  }, [syncLinks]);
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
    try { await onReload(); await serial(kit.syncAll); toast.success("อัปเดตการ์ดแล้ว"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "อัปเดตการ์ดไม่สำเร็จ"); }
    finally { setRefreshing(false); }
  };

  // วางการ์ดงานในแผน — กด = กลางจอ (เลื่อนทีละนิดกันซ้อน) · ลากมาวาง = ตรงที่ปล่อย
  const placePlan = useCallback((t: PlanItem, at?: { clientX: number; clientY: number }) => {
    const ctrl = sketchRef.current;
    if (!ctrl) { toast.info("กระดานยังโหลดไม่เสร็จ ลองอีกครั้ง"); return; }
    const k = at ? 0 : (placeCount.current++ % 6) * 28;
    const els = planCardSkeleton(t, new Date(), planCoverUrl(t)).map((el) => ({ ...el, x: (Number(el.x) || 0) + k, y: (Number(el.y) || 0) + k }));
    void ctrl.insert(els, at ? { at } : undefined);
    setOnBoard((cur) => new Set(cur).add(t.id));
  }, [toast]);
  const onDrop = (e: DragEvent) => {
    const id = e.dataTransfer.getData("text/plan-id");
    setDragOver(false);
    if (!id) return;
    e.preventDefault();
    const t = itemsRef.current.find((x) => x.id === id);
    if (t) placePlan(t, { clientX: e.clientX, clientY: e.clientY });
  };

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = { removePlanCard: (id) => { sketchRef.current?.removeCards((c) => c.kind === PLAN_CARD_KIND && c.id === id); setOnBoard((cur) => { const n = new Set(cur); n.delete(id); return n; }); } };
    return () => { handleRef.current = null; };
  }, [handleRef]);

  const onCardOpen = useCallback((data: Record<string, unknown>) => {
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
  }, [kit, toast]);

  const tray = useMemo(() => trayItems.filter((t) => !onBoard.has(t.id)), [trayItems, onBoard]);
  const k = kit.items;
  const ic = (name: string) => <Icon name={name} />;
  const addItems: ToolMenuItem[] = [
    { icon: ic("add"), label: "งานในแผน (สร้างใหม่)", hint: "สร้างงานใหม่ในแผน แล้ววางการ์ดเลย — โผล่ในทุกมุมมอง", onClick: () => setPlanNew(true) },
    { icon: ic("list"), label: "งานในแผนที่มีอยู่", hint: "เปิดถาดงานที่ยังไม่ได้วาง (กด/ลากลงกระดาน)", onClick: () => setTrayOpen(true) },
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && <ToolMenu label="เพิ่มการ์ด" icon={ic("add")} tone="violet" items={addItems} />}
        {canEdit && <ToolMenu label="เครื่องมือ" icon={ic("tool")} tone="teal" items={toolItems} />}
        <button type="button" onClick={() => void updateCards()} disabled={refreshing || !ready}
          title="ดึงข้อมูลล่าสุดของทุกการ์ด (งานในแผน ใบงาน งาน คอนเทนต์ เทรนด์)"
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <Icon name="refresh" /> {refreshing ? "กำลังอัปเดต…" : "อัปเดตการ์ด"}
        </button>
        <span className="text-[11px] text-slate-400">ดับเบิลคลิกการ์ด = เปิดดู/แก้ · ลากเส้นจากการ์ดงานไปการ์ดอื่น = ผูกงาน (ลบเส้น = เลิกผูก) · ล้อเมาส์ = ซูม</span>
      </div>

      <div className={`relative rounded-xl ${dragOver ? "ring-2 ring-violet-300" : ""}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("text/plan-id")) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
        <CanvasSketch entityType={TEAM_PLAN_BOARD.entityType} entityId={TEAM_PLAN_BOARD.entityId} editable={canEdit} height="calc(100vh - 260px)"
          controlsRef={sketchRef} onCardOpen={onCardOpen} onReady={onReady} onSaved={onSaved} collab stickyTop={56} />

        {/* ถาด "งานที่ยังไม่ได้วาง" — ลอยด้านล่างกระดาน */}
        {canEdit && ready && (
          <div className="absolute inset-x-3 bottom-3 z-10 rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
            <button type="button" onClick={() => setTrayOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-slate-600">
              <span>{trayOpen ? "▾" : "▸"}</span> งานที่ยังไม่ได้วาง <span className="font-normal text-slate-400">{tray.length}</span>
              {trayOpen && tray.length > 0 && <span className="ml-auto font-normal text-slate-400">กด = วางกลางจอ · ลากลงกระดาน = วางตรงนั้น</span>}
            </button>
            {trayOpen && (
              <div className="flex gap-2 overflow-x-auto px-3 pb-2">
                {tray.length === 0
                  ? <p className="py-1 text-xs text-slate-400">ทุกงานในแผน (ตามตัวกรองตอนนี้) อยู่บนกระดานแล้ว</p>
                  : tray.map((t) => (
                    <button key={t.id} type="button" draggable onClick={() => placePlan(t)}
                      onDragStart={(e) => { e.dataTransfer.setData("text/plan-id", t.id); e.dataTransfer.effectAllowed = "copy"; }}
                      title={`${t.title}${t.assigned_name ? ` — ${t.assigned_name}` : ""}`}
                      className="w-52 shrink-0 cursor-grab rounded-lg border border-l-4 border-slate-200 bg-white px-2 py-1.5 text-left hover:border-violet-300 active:cursor-grabbing"
                      style={{ borderLeftColor: PRIORITY_META[t.priority].color }}>
                      <span className="line-clamp-1 text-xs text-slate-800">{t.title}</span>
                      <span className={`block text-[11px] ${isOverdue(t.due_at) ? "text-rose-600" : "text-slate-400"}`}>
                        {t.due_at ? dueLabel(t.due_at) : "ไม่มีกำหนด"}{t.assigned_name ? ` · ${t.assigned_name}` : ""}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ป๊อปของชุดการ์ดกลาง (เลือก/สร้าง/เปิดดูการ์ดจากระบบอื่น) */}
      {kit.ui}
      {planNew && <AddToPlanModal open defaultTitle="" onClose={() => setPlanNew(false)}
        onCreated={(item) => { onUpsertRef.current([item]); placePlan(item); }} />}
      <MenuPagePickerModal open={pagePick} onClose={() => setPagePick(false)} title="เลือกหน้าใน ERP มาวางบนกระดาน"
        onPick={(p) => { setPagePick(false); void sketchRef.current?.insert(erpPageCardSkeleton({ href: p.href, label: p.label, appName: p.appName })); }} />
    </div>
  );
}
