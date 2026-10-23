"use client";

/**
 * useDraftPublish (ของกลาง) — "ร่าง / เผยแพร่ / ย้อน" ของตัวจัดหน้าเว็บ
 * ใช้ร่วม: 🧱 หน้าแรก (website-layout-panel) · 📄 หน้าเว็บ (website-pages-panel) · 🆕 หน้าชุดมาใหม่ (website-drop-page-builder)
 * (หน้าดีไซน์ theme-panel ยังมีชุดของตัวเอง)
 *
 * ทำให้ทุกหน้า:
 * - ↶ ย้อน / ↷ ทำซ้ำ (เก็บ 50 ก้าว) + Ctrl+Z / Ctrl+Shift+Z (ไม่ทำงานตอนพิมพ์ในช่อง)
 * - 💾 บันทึกร่างเงียบ ๆ หลังหยุดแก้ 1.5 วิ → พรีวิวโหลดใหม่ (previewVersion)
 * - เตือนก่อนปิดเบราว์เซอร์ถ้ายังไม่บันทึก
 * - เผยแพร่ = เปิดป๊อปตรวจก่อน (checkOpen → PublishCheckDialog) แล้วค่อยยิงจริง · toast บอกผลแบบเดียวกัน
 * - กู้คืนจากประวัติเวอร์ชัน (เซิร์ฟเวอร์บันทึกเป็นร่างให้แล้ว)
 *
 * แต่ละหน้าบอกแค่ "ยิง API ยังไง" (save) — ข้อมูลอื่น (SEO, รายการหน้า, ปุ่มเฉพาะ) ดูแลเองเหมือนเดิม
 *
 *   const dp = useDraftPublish<Block>({
 *     save: async (blocks, mode, { auto }) => (await apiFetch(url, { method: "PUT", ... })).json(),
 *     what: "หน้านี้",
 *   });
 *   // โหลดเสร็จ: dp.reset(draft ?? published, published, hasDraft)
 *   // ตัวจัดหน้า: blocks={dp.blocks} onChange={dp.apply} · toolbar={{ ...dp.toolbar, ... }}
 *   // ป๊อปตรวจ: <PublishCheckDialog open={dp.checkOpen} onClose={dp.closeCheck} onConfirm={() => void dp.publish()} busy={dp.busy === "publish"} />
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import type { ChangeSummary } from "@/components/website-builder";

export type DraftMode = "draft" | "publish";

/** คำตอบของ API บันทึก (แบบมาตรฐานของ /api/website/layout · pages · new-drops/page) */
export type DraftSaveResult<B> = { ok?: boolean; error?: string; purged?: boolean; version?: number; blocks?: B[] };

type Labeled = { id: string; type: string };

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const HISTORY_MAX = 50;

/** เทียบร่างกับที่เผยแพร่ → รายชื่อ Section ที่เพิ่ม/ลบ/แก้ (ชื่ออ่านออก — โชว์ตอนกดป้าย "ยังไม่เผยแพร่") */
export function summarizeChanges<B extends Labeled>(draft: B[], live: B[], types: { type: string; label: string }[]): ChangeSummary {
  const label = (b: B) => types.find((t) => t.type === b.type)?.label ?? b.type;
  const liveMap = new Map(live.map((b) => [b.id, b]));
  const draftIds = new Set(draft.map((b) => b.id));
  return {
    added: draft.filter((b) => !liveMap.has(b.id)).map(label),
    removed: live.filter((b) => !draftIds.has(b.id)).map(label),
    changed: draft.filter((b) => liveMap.has(b.id) && !eq(b, liveMap.get(b.id))).map(label),
  };
}

/** ข้อความเผยแพร่สำเร็จ (ทุกหน้าใช้แบบเดียวกัน) */
export function publishedToast(what: string, r: { purged?: boolean; version?: number }): string {
  return `เผยแพร่${what}แล้ว${r.version ? ` (เวอร์ชัน ${r.version})` : ""}${r.purged ? " — เว็บจริงเปลี่ยนแล้ว รีเฟรชดูได้เลย" : " — เว็บจริงจะเปลี่ยนภายใน 1 นาที"}`;
}

export function useDraftPublish<B>({
  save,
  active = true,
  autosave = true,
  autosaveMs = 1500,
  what = "",
  warnOnLeave = "unsaved",
  onSaved,
}: {
  /** ยิง API บันทึก · auto = บันทึกร่างอัตโนมัติ (ไม่ใช่ผู้ใช้กด) */
  save: (blocks: B[], mode: DraftMode, opts: { auto: boolean }) => Promise<DraftSaveResult<B>>;
  /** false = ยังไม่ได้เปิดหน้าไหน (ปิดคีย์ลัด/บันทึกอัตโนมัติ) */
  active?: boolean;
  /** เปิดบันทึกร่างอัตโนมัติ */
  autosave?: boolean;
  autosaveMs?: number;
  /** ชื่อสิ่งที่เผยแพร่ในข้อความแจ้ง เช่น "หน้านี้" → "เผยแพร่หน้านี้แล้ว" · "" → "เผยแพร่แล้ว" */
  what?: string;
  /** เตือนก่อนปิดเบราว์เซอร์เมื่อ: unsaved = ยังไม่บันทึก · unpublished = มีร่างที่ยังไม่เผยแพร่ด้วย */
  warnOnLeave?: "unsaved" | "unpublished";
  /** หลังบันทึกสำเร็จ (เช่น โหลดรายการใหม่ · จำว่ามีการแก้) */
  onSaved?: (mode: DraftMode, opts: { auto: boolean; result: DraftSaveResult<B> }) => void;
}) {
  const toast = useToast();
  const [blocks, setBlocks] = useState<B[]>([]);
  /** ค่าที่บันทึกล่าสุด (ร่างหรือเผยแพร่) — ต่างจากนี้ = ยังไม่บันทึก */
  const [savedBlocks, setSavedBlocks] = useState<B[]>([]);
  const [published, setPublished] = useState<B[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [autosaving, setAutosaving] = useState(false);
  const [busy, setBusy] = useState<DraftMode | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const undoStack = useRef<B[][]>([]);
  const redoStack = useRef<B[][]>([]);
  const [, tick] = useState(0);
  const saveRef = useRef(save);
  saveRef.current = save;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const bumpPreview = useCallback(() => setPreviewVersion((v) => v + 1), []);

  // ค่าปัจจุบันแบบอ่านได้ทันที — ย้อน/ทำซ้ำจัดกองประวัตินอกตัวอัปเดต state
  // (ตัวอัปเดตถูก React รันซ้ำได้ในโหมดพัฒนา → เดิมกองประวัติเบิ้ล ปุ่มทำซ้ำค้างว่ากดได้)
  const current = useRef<B[]>(blocks);
  current.current = blocks;
  const show = useCallback((next: B[]) => {
    current.current = next;
    setBlocks(next);
    tick((n) => n + 1);
  }, []);

  /** ตั้งต้นใหม่ (โหลดเสร็จ / เปิดหน้าอื่น) — ล้างประวัติย้อน */
  const reset = useCallback(
    (initial: B[], live: B[], draft: boolean) => {
      undoStack.current = [];
      redoStack.current = [];
      setSavedBlocks(initial);
      setPublished(live);
      setHasDraft(draft);
      setSavedAt(null);
      show(initial);
    },
    [show]
  );

  const apply = useCallback(
    (next: B[]) => {
      undoStack.current = [...undoStack.current.slice(-(HISTORY_MAX - 1)), current.current];
      redoStack.current = [];
      show(next);
    },
    [show]
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current = [...redoStack.current, current.current];
    show(prev);
  }, [show]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current = [...undoStack.current, current.current];
    show(next);
  }, [show]);

  // ⌨️ Ctrl+Z ย้อน · Ctrl+Shift+Z ทำซ้ำ (พิมพ์อยู่ในช่อง = ปล่อยให้ช่องย้อนข้อความเอง)
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const el = e.target as HTMLElement | null;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, undo, redo]);

  const dirty = active && !eq(blocks, savedBlocks);
  const unpublished = hasDraft || dirty || !eq(blocks, published);

  // 💾 บันทึกร่างเงียบ ๆ หลังหยุดแก้ → พรีวิวโหลดใหม่เอง · พลาด = เงียบ (กดบันทึกร่างเองได้)
  useEffect(() => {
    if (!active || !autosave || !dirty || busy) return;
    const t = setTimeout(async () => {
      setAutosaving(true);
      try {
        const r = await saveRef.current(blocks, "draft", { auto: true });
        if (r?.ok) {
          setSavedBlocks(blocks);
          setHasDraft(true);
          setSavedAt(new Date());
          bumpPreview();
          onSavedRef.current?.("draft", { auto: true, result: r });
        }
      } catch {
        /* เงียบ */
      } finally {
        setAutosaving(false);
      }
    }, autosaveMs);
    return () => clearTimeout(t);
  }, [blocks, active, autosave, autosaveMs, dirty, busy, bumpPreview]);

  // เตือนก่อนปิดเบราว์เซอร์
  const warn = warnOnLeave === "unpublished" ? active && unpublished : dirty;
  useEffect(() => {
    if (!warn) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [warn]);

  /** บันทึกเอง (ปุ่ม 💾 บันทึกร่าง / เผยแพร่ในป๊อปตรวจ) */
  const run = useCallback(
    async (mode: DraftMode) => {
      setCheckOpen(false);
      setBusy(mode);
      try {
        const r = await saveRef.current(blocks, mode, { auto: false });
        if (!r?.ok) {
          toast.error(r?.error ?? (mode === "publish" ? "เผยแพร่ไม่สำเร็จ" : "บันทึกไม่สำเร็จ"));
          return false;
        }
        // เผยแพร่: เซิร์ฟเวอร์อาจคืนบล็อกที่จัดรูปแล้ว (blocks) → ใช้ตัวนั้นเป็นค่าปัจจุบัน
        const next = mode === "publish" && Array.isArray(r.blocks) ? r.blocks : blocks;
        if (next !== blocks) show(next);
        setSavedBlocks(next);
        setSavedAt(new Date());
        if (mode === "publish") {
          setPublished(next);
          setHasDraft(false);
          toast.success(publishedToast(what, r));
        } else {
          setHasDraft(true);
          toast.success("บันทึกร่างแล้ว — เว็บจริงยังไม่เปลี่ยน");
        }
        bumpPreview();
        onSavedRef.current?.(mode, { auto: false, result: r });
        return true;
      } catch {
        toast.error("เชื่อมต่อไม่ได้");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [blocks, toast, what, bumpPreview, show]
  );

  /** 🕘 กู้คืนเวอร์ชันเก่า — เซิร์ฟเวอร์บันทึกเป็นร่างแล้ว จึงนับว่าบันทึกแล้ว · ใส่ผ่าน apply() ให้กด ↶ ย้อนได้ */
  const restored = useCallback(
    (list: B[]) => {
      apply(list);
      setSavedBlocks(list);
      setHasDraft(true);
      bumpPreview();
    },
    [apply, bumpPreview]
  );

  return {
    blocks,
    apply,
    undo,
    redo,
    reset,
    restored,
    published,
    hasDraft,
    savedAt,
    autosaving,
    busy,
    dirty,
    unpublished,
    previewVersion,
    bumpPreview,
    checkOpen,
    closeCheck: () => setCheckOpen(false),
    saveDraft: () => run("draft"),
    /** เปิดป๊อปตรวจก่อนเผยแพร่ */
    requestPublish: () => setCheckOpen(true),
    /** เผยแพร่จริง (กดยืนยันในป๊อปตรวจแล้ว) */
    publish: () => run("publish"),
    /** ค่ากลางของแถบเครื่องมือตัวจัดหน้า — หน้าใส่ statusNote/leading/publishLabel/onHistory เพิ่มเอง */
    toolbar: {
      dirty: unpublished,
      savedText: savedAt ? `บันทึกร่าง ${savedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}` : "",
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
      onUndo: undo,
      onRedo: redo,
      onSaveDraft: () => void run("draft"),
      onPublish: () => setCheckOpen(true),
      busy: busy === "publish",
    },
  };
}
