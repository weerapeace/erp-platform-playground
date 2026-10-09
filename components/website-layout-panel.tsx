"use client";

/**
 * WebsiteLayoutPanel — แท็บ "🧱 หน้าแรก" ในหน้า /website/<slug>
 *
 * ตัวจัดหน้า 3 แผง (components/website-builder.tsx): โครงหน้า · พรีวิวเว็บจริง · คุณสมบัติจาก Schema
 * ไฟล์นี้ดูแล "ข้อมูล": โหลด/บันทึกร่างอัตโนมัติ/เผยแพร่/ละทิ้ง/ประวัติเวอร์ชัน/undo-redo/ตรวจก่อนเผยแพร่
 *
 * ข้อมูล: /api/website/layout · /api/website/layout/versions
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { WebsiteBuilder, type Selection, type ChangeSummary } from "@/components/website-builder";
import type { Block, BlockTypeInfo } from "@/components/website-block-editor";
import { validateBlocks, type ValidationIssue } from "@/lib/website-blocks";

/** บันทึกร่างเงียบ ๆ หลังหยุดแก้ 1.5 วิ → พรีวิวโหลดใหม่เอง */
const AUTOSAVE_MS = 1500;
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const timeStr = (d: Date) => d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

/** เทียบร่างกับที่เผยแพร่ → รายชื่อ Section ที่เพิ่ม/ลบ/แก้ (ใช้ร่วมแท็บหน้าเว็บ) */
export function summarizeChanges(draft: Block[], live: Block[], types: BlockTypeInfo[]): ChangeSummary {
  const label = (b: Block) => types.find((t) => t.type === b.type)?.label ?? b.type;
  const liveMap = new Map(live.map((b) => [b.id, b]));
  const draftIds = new Set(draft.map((b) => b.id));
  return {
    added: draft.filter((b) => !liveMap.has(b.id)).map(label),
    removed: live.filter((b) => !draftIds.has(b.id)).map(label),
    changed: draft.filter((b) => liveMap.has(b.id) && !eq(b, liveMap.get(b.id))).map(label),
  };
}

export function WebsiteLayoutPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [published, setPublished] = useState<Block[]>([]);
  const [types, setTypes] = useState<BlockTypeInfo[]>([]);
  const [categories, setCategories] = useState<{ key: string; label: string }[]>([]);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string>("");
  const [neverSet, setNeverSet] = useState(false);
  const [hadDraft, setHadDraft] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<{ versionNo: number; createdAt: string; actor: string | null; blocks: number }[]>([]);

  const [autoSave, setAutoSave] = useState(true);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);

  const undoStack = useRef<Block[][]>([]);
  const redoStack = useRef<Block[][]>([]);
  const [, tick] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/website/layout?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json();
      if (j.error) {
        toast.error(j.error);
        return;
      }
      setBlocks(j.draft ?? j.published ?? []);
      setPublished(j.published ?? []);
      setTypes(j.blockTypes ?? []);
      setCategories(j.categories ?? []);
      setSiteUrl(j.shop?.siteUrl ?? null);
      setShopName(j.shop?.name ?? "");
      setNeverSet(Boolean(j.neverSet));
      setHadDraft(Boolean(j.hasDraft));
      undoStack.current = [];
      redoStack.current = [];
    } catch {
      toast.error("โหลดโครงหน้าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [shopSlug, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = useCallback((next: Block[]) => {
    setBlocks((prev) => {
      undoStack.current = [...undoStack.current.slice(-49), prev];
      redoStack.current = [];
      return next;
    });
    tick((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setBlocks((cur) => {
      redoStack.current = [...redoStack.current, cur];
      return prev;
    });
    tick((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    setBlocks((cur) => {
      undoStack.current = [...undoStack.current, cur];
      return next;
    });
    tick((n) => n + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const isDirty = !eq(blocks, published) || hadDraft;
  const issues: ValidationIssue[] = useMemo(() => validateBlocks(blocks as never), [blocks]);
  const errors = issues.filter((i) => i.level === "error");

  // สรุปว่าร่างต่างจากที่เผยแพร่ตรงไหน (ชื่อ Section อ่านออก) — โชว์ตอนกดป้าย "ยังไม่เผยแพร่"
  const changes: ChangeSummary = useMemo(() => summarizeChanges(blocks, published, types), [blocks, published, types]);

  useEffect(() => {
    if (!isDirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isDirty]);

  const saveDraft = useCallback(
    async (silent = false) => {
      setSaving(true);
      try {
        const r = await apiFetch("/api/website/layout", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId, blocks, mode: "draft" }),
        });
        const j = await r.json();
        if (j.ok) {
          setHadDraft(true);
          setSavedAt(new Date());
          setPreviewVersion((v) => v + 1);
          if (!silent) toast.success("บันทึกร่างแล้ว — เว็บจริงยังไม่เปลี่ยน");
        } else if (!silent) toast.error(j.error ?? "บันทึกไม่สำเร็จ");
      } catch {
        if (!silent) toast.error("เชื่อมต่อไม่ได้");
      } finally {
        setSaving(false);
      }
    },
    [blocks, shopId, toast]
  );

  // บันทึกร่างอัตโนมัติเมื่อมีการเปลี่ยนแปลง (กันข้อมูลหายระหว่างแก้)
  useEffect(() => {
    if (!autoSave || loading || !blocks.length) return;
    if (eq(blocks, published) && !hadDraft) return;
    const t = setTimeout(() => void saveDraft(true), AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, autoSave, loading]);

  const publish = async () => {
    if (errors.length && !confirm(`พบ ${errors.length} จุดที่ควรแก้ก่อน\nยืนยันเผยแพร่ทั้งที่ยังมีปัญหา?`)) return;
    if (!errors.length && !confirm("ยืนยันเผยแพร่โครงหน้าแรกนี้ไปยังเว็บไซต์จริง?")) return;
    setBusy("publish");
    try {
      const r = await apiFetch("/api/website/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, blocks, mode: "publish" }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "เผยแพร่ไม่สำเร็จ");
        return;
      }
      setPublished(j.blocks);
      setBlocks(j.blocks);
      setNeverSet(false);
      setHadDraft(false);
      toast.success(`เผยแพร่แล้ว (เวอร์ชัน ${j.version}) — เว็บอัปเดตใน ~1 นาที`);
      setPreviewVersion((v) => v + 1);
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    if (!confirm("ละทิ้งการเปลี่ยนแปลงทั้งหมด?")) return;
    try {
      await apiFetch(`/api/website/layout?shopId=${encodeURIComponent(shopId)}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
    await load();
    toast.info("ละทิ้งการเปลี่ยนแปลงแล้ว");
  };

  const loadVersions = async () => {
    try {
      const r = await apiFetch(`/api/website/layout/versions?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json();
      setVersions(j.versions ?? []);
      setShowVersions(true);
    } catch {
      toast.error("โหลดประวัติไม่สำเร็จ");
    }
  };

  const restore = async (versionNo: number) => {
    if (!confirm(`ดึงเวอร์ชัน ${versionNo} กลับมาเป็นร่าง?`)) return;
    try {
      const r = await apiFetch("/api/website/layout/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, versionNo }),
      });
      const j = await r.json();
      if (j.ok) {
        apply(j.blocks);
        setHadDraft(true);
        setShowVersions(false);
        toast.success(`กู้คืนเวอร์ชัน ${versionNo} เป็นร่างแล้ว`);
      } else toast.error(j.error ?? "กู้คืนไม่สำเร็จ");
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    }
  };

  const previewSrc = siteUrl ? `${siteUrl}/?preview=1` : null;
  const ctx = useMemo(() => ({ shopSlug, shopId, shopName, categories }), [shopSlug, shopId, shopName, categories]);

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;

  return (
    <div className="space-y-3">
      <WebsiteBuilder
        blocks={blocks}
        onChange={apply}
        types={types}
        ctx={ctx}
        previewSrc={previewSrc}
        iframeRef={iframeRef}
        selection={selection}
        onSelect={setSelection}
        previewVersion={previewVersion}
        toolbar={{
          dirty: isDirty,
          statusNote: `${blocks.length} Section · เปิดใช้ ${blocks.filter((b) => b.enabled).length}${neverSet ? " · ยังไม่เคยจัดหน้า (โครงเริ่มต้น)" : ""}`,
          savedText: savedAt ? `บันทึกร่าง ${timeStr(savedAt)}` : "",
          saving,
          issues,
          changes,
          canUndo: undoStack.current.length > 0,
          canRedo: redoStack.current.length > 0,
          onUndo: undo,
          onRedo: redo,
          autoSave,
          onAutoSave: setAutoSave,
          onHistory: () => void loadVersions(),
          onDiscard: () => void discard(),
          onSaveDraft: () => void saveDraft(false),
          onPublish: () => void publish(),
          busy: busy === "publish",
        }}
      />

      {/* ประวัติเวอร์ชัน */}
      {showVersions && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={() => setShowVersions(false)} />
          <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 h-14 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-800">ประวัติหน้าแรกที่เผยแพร่</h3>
              <button onClick={() => setShowVersions(false)} className="text-slate-400 hover:text-slate-800">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {!versions.length ? (
                <p className="py-10 text-center text-sm text-slate-400">ยังไม่มีประวัติ — จะบันทึกทุกครั้งที่กดเผยแพร่</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {versions.map((v) => (
                    <li key={v.versionNo} className="flex items-center gap-3 py-3">
                      <span className="text-xs text-slate-400 w-10">#{v.versionNo}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700">{v.blocks} Section</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {new Date(v.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                          {v.actor && ` · ${v.actor}`}
                        </p>
                      </div>
                      <button onClick={() => void restore(v.versionNo)} className="text-xs text-blue-600 hover:underline whitespace-nowrap">กู้คืนเป็นร่าง</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
