"use client";
/**
 * 📋 ปุ่ม "แตกเช็กลิสต์ / พับเช็กลิสต์" บนกระดาน (ของกลาง · ใช้คู่ CanvasSketch) — เจ้าของเลือกแบบ B 2026-11-16
 *   - เลือกการ์ดที่มีเช็กลิสต์ (งานในแผน · ใบงานออกแบบ · งาน) → toggle() = วาง/เก็บกล่องรายการข้างการ์ด
 *   - ดับเบิลคลิกข้อในกล่อง = ติ๊กเสร็จ/เอาติ๊กออก ในเช็กลิสต์จริง (PATCH /api/record-tasks/[id] — สิทธิ์ตามกฎเดิม)
 *     งานย่อยของ Task = เปิดงาน (onOpenTask) · "+ เพิ่มข้อ" = ป๊อปพิมพ์ข้อใหม่ (POST /api/record-tasks)
 *   - syncBoxes() = ดึงเช็กลิสต์ล่าสุดของทุกกล่องบนกระดาน → สร้างกล่องใหม่เฉพาะกล่องที่ข้อมูลเปลี่ยน (ตำแหน่งเดิม)
 *   ตรรกะหน้าตา/การหาเจอ = ./checklist-box (ฟังก์ชันล้วน มีเทสต์) · doc: docs/team-plan.md
 * ใช้: const cl = useChecklistExplode({ sketchRef, canEdit, onOpenTask, onChanged })
 *      <CanvasSketch onSelectionChange={cl.onSelectionChange} …/> · onCardOpen: if (cl.onCardOpen(data)) return · {cl.button} · {cl.ui}
 */
import { useCallback, useRef, useState, type MutableRefObject } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import { listSubtasks } from "@/app/tasks/data";
import {
  boxPlacement, boxSig, CHECKLIST_ADD_KIND, CHECKLIST_BOX_KIND, CHECKLIST_ITEM_KIND, checklistBoxSkeleton, findChecklistBoxes,
  linkBindingPatches, linkSkeleton, ownerFrame, parseSource, rowsFromRecordTasks, rowsFromSubtasks, selectedChecklistOwner,
  type ChecklistRow, type ChecklistSource,
} from "./checklist-box";

type El = Record<string, unknown>;
const cdOf = (el: El) => (el.customData ?? null) as Record<string, unknown> | null;

export function useChecklistExplode({ sketchRef, canEdit, onOpenTask, onChanged }: {
  sketchRef: MutableRefObject<CanvasSketchControls | null>;
  /** แก้กระดานได้ (วาง/เก็บกล่อง · เพิ่มข้อ) */
  canEdit: boolean;
  /** ดับเบิลคลิกงานย่อยของการ์ดงาน → เปิดงานนั้น */
  onOpenTask: (taskId: string) => void;
  /** ติ๊ก/เพิ่มข้อสำเร็จ → หน้าแม่อัปเดตการ์ดเจ้าของ (เช่น "เช็กลิสต์ 2/4" บนการ์ดงานในแผน) */
  onChanged?: (src: ChecklistSource) => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const [sel, setSel] = useState<ReturnType<typeof selectedChecklistOwner>>(null);
  const [adding, setAdding] = useState<ChecklistSource | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const selIds = useRef<string[]>([]);
  const canEditRef = useRef(canEdit); canEditRef.current = canEdit;
  const onChangedRef = useRef(onChanged); onChangedRef.current = onChanged;
  const onOpenTaskRef = useRef(onOpenTask); onOpenTaskRef.current = onOpenTask;
  // งานแก้กล่องทำทีละงาน (ซิงค์ · วาง · ติ๊ก) — กันสองงานสร้างกล่องซ้อนกัน
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const serial = useCallback(<T,>(fn: () => Promise<T>) => { const p = queue.current.then(fn, fn); queue.current = p.catch(() => undefined); return p; }, []);

  const recompute = useCallback(() => {
    const ctrl = sketchRef.current; if (!ctrl) return;
    setSel(selectedChecklistOwner(ctrl.getElements(), new Set(selIds.current)));
  }, [sketchRef]);
  const onSelectionChange = useCallback((ids: string[]) => { selIds.current = ids; recompute(); }, [recompute]);

  const canAddFor = (src: ChecklistSource) => canEditRef.current && src.type === "record";

  const loadRows = useCallback(async (src: ChecklistSource): Promise<ChecklistRow[]> => {
    if (src.type === "subtask") return rowsFromSubtasks(await listSubtasks(src.ownerId));
    const qs = new URLSearchParams({ module_key: src.moduleKey, record_id: src.ownerId });
    const j = await apiFetch(`/api/record-tasks?${qs}`).then((r) => r.json());
    if (j.error) throw new Error(j.error);
    return rowsFromRecordTasks(j.data ?? []);
  }, []);

  /** เอากล่อง (+ เส้น) ของการ์ด ownerGid ออก · ล้างรายการเส้นที่เกาะกรอบการ์ดด้วย */
  const removeBox = useCallback((ownerGid: string) => {
    const ctrl = sketchRef.current; if (!ctrl) return;
    const boxes = findChecklistBoxes(ctrl.getElements()).filter((b) => b.ownerGid === ownerGid);
    if (!boxes.length) return;
    const ids = new Set(boxes.flatMap((b) => [...b.elementIds, ...b.linkIds]));
    const links = new Set(boxes.flatMap((b) => b.linkIds));
    ctrl.patchElements((el) => {
      if (ids.has(String(el.id))) return { isDeleted: true };
      const bound = el.boundElements as { id: string }[] | null | undefined;
      if (bound?.some((b) => links.has(b.id))) return { boundElements: bound.filter((b) => !links.has(b.id)) };
      return null;
    });
  }, [sketchRef]);

  /** วางกล่องข้างการ์ด (at = ตำแหน่งเดิมตอนซิงค์) + เส้นเกาะการ์ด→กล่อง */
  const placeBox = useCallback(async (ownerGid: string, src: ChecklistSource, rows: ChecklistRow[], at?: { x: number; y: number }) => {
    const ctrl = sketchRef.current; if (!ctrl) return;
    const frame = ownerFrame(ctrl.getElements(), ownerGid); if (!frame) return;
    const pos = at ?? boxPlacement(frame);
    await ctrl.insert([...checklistBoxSkeleton(src, rows, pos, ownerGid, canAddFor(src)), linkSkeleton(ownerGid, frame, pos)], { scene: true });
    const after = ctrl.getElements();
    const box = findChecklistBoxes(after).find((b) => b.ownerGid === ownerGid && b.frame);
    const arrow = after.find((e) => !e.isDeleted && e.type === "arrow" && cdOf(e)?.checklist_link === ownerGid);
    const card = ownerFrame(after, ownerGid);
    if (box?.frame && arrow && card) { const p = linkBindingPatches(arrow, card, box.frame); ctrl.patchElements((el) => p.get(String(el.id)) ?? null); }
  }, [sketchRef]);

  /** สร้างกล่องของการ์ดใหม่จากข้อมูลล่าสุด (ตำแหน่งเดิม) — ใช้หลังติ๊ก/เพิ่มข้อ */
  const rebuild = useCallback(async (ownerGid: string, src: ChecklistSource, force = false) => {
    const ctrl = sketchRef.current; if (!ctrl) return;
    const box = findChecklistBoxes(ctrl.getElements()).find((b) => b.ownerGid === ownerGid && b.frame);
    if (!box?.frame) return;
    const rows = await loadRows(src);
    if (!force && boxSig(src, rows, canAddFor(src)) === box.sig) return;
    const at = { x: Number(box.frame.x) || 0, y: Number(box.frame.y) || 0 };
    removeBox(ownerGid);
    await placeBox(ownerGid, { ...src, label: box.source?.label ?? src.label }, rows, at);
  }, [sketchRef, loadRows, removeBox, placeBox]);

  /** ปุ่ม แตก/พับ เช็กลิสต์ ของการ์ดที่เลือก */
  const toggle = useCallback(() => serial(async () => {
    const ctrl = sketchRef.current; if (!ctrl) return;
    const cur = selectedChecklistOwner(ctrl.getElements(), new Set(selIds.current));
    if (!cur) { toast.info("เลือกการ์ดที่มีเช็กลิสต์ก่อน (งานในแผน · ใบงานออกแบบ · งาน) แล้วกดอีกครั้ง"); return; }
    if (!canEditRef.current) { toast.info("ต้องมีสิทธิ์แก้กระดานจึงจะแตก/พับเช็กลิสต์ได้"); return; }
    try {
      if (cur.open) removeBox(cur.gid);
      else {
        const rows = await loadRows(cur.source);
        await placeBox(cur.gid, cur.source, rows);
        if (!rows.length) toast.info(cur.source.type === "record" ? "การ์ดนี้ยังไม่มีเช็กลิสต์ — ดับเบิลคลิก \"+ เพิ่มข้อ\" ในกล่องเพื่อเพิ่มได้" : "งานนี้ยังไม่มีงานย่อย");
      }
    } catch (e) { toast.error(e instanceof Error ? `แตกเช็กลิสต์ไม่สำเร็จ: ${e.message}` : "แตกเช็กลิสต์ไม่สำเร็จ"); }
    recompute();
  }), [serial, sketchRef, toast, removeBox, loadRows, placeBox, recompute]);

  /** ดึงเช็กลิสต์ล่าสุดของทุกกล่องบนกระดาน (เปิดกระดาน · ปุ่มอัปเดตการ์ด · ข้อมูลงานเปลี่ยน) · กล่องที่การ์ดเจ้าของหายไปแล้ว = เอาออก */
  const syncBoxes = useCallback(() => serial(async () => {
    const ctrl = sketchRef.current; if (!ctrl) return;
    const els = ctrl.getElements();
    const boxes = findChecklistBoxes(els);
    if (!boxes.length) return;
    for (const b of boxes) {
      if (!b.source || !b.frame || !ownerFrame(els, b.ownerGid)) { if (canEditRef.current) removeBox(b.ownerGid); continue; }
      try { await rebuild(b.ownerGid, b.source); } catch { /* ดึงไม่ได้ = คงกล่องเดิมไว้ */ }
    }
    recompute();
  }), [serial, sketchRef, removeBox, rebuild, recompute]);

  const tickItem = useCallback((src: ChecklistSource, ownerGid: string, itemId: string, done: boolean) => serial(async () => {
    const ctrl = sketchRef.current; if (!ctrl) return;
    // เห็นผลทันที (แก้ข้อความ/สีของข้อนั้นก่อน) แล้วค่อยสร้างกล่องใหม่จากข้อมูลจริง
    ctrl.patchElements((el) => {
      const d = cdOf(el);
      if (d?.kind !== CHECKLIST_ITEM_KIND || d.id !== itemId || d.owner_gid !== ownerGid) return null;
      const p: El = { customData: { ...d, done } };
      if (el.type === "text") { const t = String(el.text ?? ""); p.text = (done ? "☑" : "☐") + t.slice(1); p.originalText = p.text; p.strokeColor = done ? "#a8a29e" : "#713f12"; }
      return p;
    });
    try {
      const r = await apiFetch(`/api/record-tasks/${encodeURIComponent(itemId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: done ? "resolved" : "open", actor: user?.name }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error((j as { error?: string }).error || "ติ๊กไม่สำเร็จ"); }
      onChangedRef.current?.(src);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ติ๊กไม่สำเร็จ"); }
    try { await rebuild(ownerGid, src, true); } catch { /* คงหน้าตาเดิม */ }
  }), [serial, sketchRef, user, toast, rebuild]);

  /** ดับเบิลคลิกชิ้นในกล่อง → true = จัดการแล้ว (หน้าแม่ไม่ต้องทำต่อ) */
  const onCardOpen = useCallback((data: Record<string, unknown>): boolean => {
    const kind = data.kind;
    if (kind !== CHECKLIST_ITEM_KIND && kind !== CHECKLIST_ADD_KIND && kind !== CHECKLIST_BOX_KIND) return false;
    const src = parseSource(data.src);
    const ownerGid = String(data.owner_gid ?? "");
    if (!src || !ownerGid) return true;
    if (kind === CHECKLIST_ITEM_KIND) {
      if (src.type === "subtask") onOpenTaskRef.current(src.ownerId);
      else void tickItem(src, ownerGid, String(data.id ?? ""), data.done !== true);
    } else if (kind === CHECKLIST_ADD_KIND) {
      if (!canEditRef.current) toast.info("ต้องมีสิทธิ์แก้กระดานจึงจะเพิ่มข้อได้");
      else { setNewTitle(""); setAdding({ ...src, ownerGid } as ChecklistSource & { ownerGid: string }); }
    } else toast.info("ดับเบิลคลิกแต่ละข้อ = ติ๊กเสร็จ · กดปุ่ม \"พับเช็กลิสต์\" เพื่อเก็บกล่อง");
    return true;
  }, [tickItem, toast]);

  const submitAdd = async () => {
    const src = adding; const title = newTitle.trim();
    if (!src || src.type !== "record") return;
    if (!title) { toast.error("พิมพ์ข้อความก่อน"); return; }
    setBusy(true);
    try {
      const j = await apiFetch("/api/record-tasks", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_key: src.moduleKey, record_id: src.ownerId, record_type: src.recordType, title, actor: user?.name }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setAdding(null);
      onChangedRef.current?.(src);
      const ownerGid = (src as ChecklistSource & { ownerGid?: string }).ownerGid ?? "";
      if (ownerGid) await serial(() => rebuild(ownerGid, src, true));
    } catch (e) { toast.error(e instanceof Error ? `เพิ่มข้อไม่สำเร็จ: ${e.message}` : "เพิ่มข้อไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const button = (
    <button type="button" onClick={() => void toggle()}
      title={sel ? (sel.open ? "เก็บกล่องเช็กลิสต์ของการ์ดที่เลือก" : `แตกเช็กลิสต์ของ "${sel.source.label}" ออกมาข้างการ์ด`) : "เลือกการ์ดที่มีเช็กลิสต์ก่อน (งานในแผน · ใบงานออกแบบ · งาน)"}
      className={`inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-sm ${sel ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50"}`}>
      <Icon name="list" /> {sel?.open ? "พับเช็กลิสต์" : "แตกเช็กลิสต์"}
    </button>
  );

  const ui = (
    <ERPModal open={!!adding} onClose={() => setAdding(null)} title="เพิ่มข้อในเช็กลิสต์" description={adding?.label} size="sm" hasUnsavedChanges={!!newTitle.trim()}
      footer={<>
        <button type="button" onClick={() => setAdding(null)} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ยกเลิก</button>
        <button type="button" onClick={() => void submitAdd()} disabled={busy} className="h-9 rounded-lg bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
          {busy ? "กำลังเพิ่ม…" : <><Icon name="add" /> เพิ่มข้อ</>}
        </button>
      </>}>
      <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={300} autoFocus placeholder="เช่น ส่งแบบให้ช่างแพทเทิร์น"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submitAdd(); } }}
        className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
    </ERPModal>
  );

  return { onSelectionChange, onCardOpen, toggle, syncBoxes, selected: sel, button, ui };
}
