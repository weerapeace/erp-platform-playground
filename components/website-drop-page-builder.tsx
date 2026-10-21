"use client";

/**
 * 🧱 จัดหน้าของชุดมาใหม่ (/new/<ชุด>) — เปิดจากแท็บ 🆕 มาใหม่ (ปุ่ม "จัดหน้าชุดนี้")
 * ตัวจัดหน้า 3 แผงตัวเดียวกับแท็บ "หน้าเว็บ" (components/website-builder): โครงหน้า · พรีวิวเว็บจริง (/new/<ชุด>?preview=1) · ตั้งค่า Section
 * ยังไม่เคยจัด = เริ่มจากโครงตั้งต้น (Section 🆕 ชุดมาใหม่) · บันทึกร่างเองหลังหยุดแก้ 1.5 วิ · เผยแพร่ = เว็บจริงเปลี่ยน
 * "กลับไปใช้หน้าตาเดิม" = ล้างหน้าที่จัด (เว็บวาดแบบเดิม: แบนเนอร์ + สินค้า / นับถอยหลัง)
 * ข้อมูล: /api/website/new-drops/page (lib/website-drop-page)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { withPreviewKey } from "@/lib/storefront-preview-link";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { WebsiteBuilder, type Selection } from "@/components/website-builder";
import { summarizeChanges } from "@/components/website-layout-panel";
import type { Block, BlockTypeInfo } from "@/components/website-block-editor";
import { validateBlocks } from "@/lib/website-blocks";
import { useShopPublishIssues, PublishCheckDialog } from "@/components/website-publish-check";

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const AUTOSAVE_MS = 1500;

export function DropPageBuilder({ shopSlug, shopId, dropId, onClose }: { shopSlug: string; shopId: string; dropId: string; onClose: (changed: boolean) => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null); // 🔑 รหัสพรีวิว (ผ่านหน้าปิดเว็บ)
  const [shopName, setShopName] = useState("");
  const [types, setTypes] = useState<BlockTypeInfo[]>([]);
  const [categories, setCategories] = useState<{ key: string; label: string }[]>([]);
  const [themeCard, setThemeCard] = useState<Record<string, unknown> | undefined>(undefined);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [savedBlocks, setSavedBlocks] = useState<Block[]>([]);
  const [publishedBlocks, setPublishedBlocks] = useState<Block[]>([]);
  /** เคยเผยแพร่หน้าที่จัดแล้ว (false = เว็บยังใช้หน้าตาเดิม) */
  const [custom, setCustom] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [askReset, setAskReset] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [changed, setChanged] = useState(false);
  const dataIssues = useShopPublishIssues(shopSlug);
  const undoStack = useRef<Block[][]>([]);
  const redoStack = useRef<Block[][]>([]);
  const [, tick] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/website/new-drops/page?shop=${encodeURIComponent(shopSlug)}&id=${encodeURIComponent(dropId)}`);
      const j = await r.json();
      if (j.error) {
        toast.error(j.error);
        onClose(false);
        return;
      }
      const d = j.drop;
      const initial: Block[] = d.draft ?? d.published ?? [];
      setTitle(d.title ?? "");
      setSiteUrl(j.shop?.siteUrl ?? null);
      setPreviewKey(j.shop?.previewKey ?? null);
      setShopName(j.shop?.name ?? "");
      setTypes(j.blockTypes ?? []);
      setCategories(j.categories ?? []);
      setThemeCard(j.themeCard);
      setBlocks(initial);
      // ยังไม่จัด = โครงตั้งต้น (ไม่นับว่าแก้ · ไม่บันทึกร่างเองจนกว่าจะแก้จริง — เว็บพรีวิววาดโครงเดียวกันเอง)
      setSavedBlocks(initial);
      setPublishedBlocks(d.custom ? d.published : []);
      setCustom(Boolean(d.custom));
      setHasDraft(Boolean(d.hasDraft));
      undoStack.current = [];
      redoStack.current = [];
    } catch {
      toast.error("เปิดหน้าชุดไม่สำเร็จ");
      onClose(false);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopSlug, dropId]);
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
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const dirty = !loading && !eq(blocks, savedBlocks);

  // 💾 บันทึกร่างเงียบ ๆ หลังหยุดแก้ → พรีวิวโหลดใหม่เอง (เหมือนแท็บหน้าเว็บ)
  useEffect(() => {
    if (!dirty || busy) return;
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch("/api/website/new-drops/page", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: dropId, blocks, mode: "draft" }),
        });
        const j = await r.json();
        if (j.ok) {
          setSavedBlocks(blocks);
          setHasDraft(true);
          setSavedAt(new Date());
          setChanged(true);
          setPreviewVersion((v) => v + 1);
        }
      } catch {
        /* เงียบ — กดบันทึกร่างเองได้ */
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, dirty, busy]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = async (mode: "draft" | "publish", confirmed = false) => {
    if (mode === "publish" && !confirmed) {
      setCheckOpen(true);
      return;
    }
    setCheckOpen(false);
    setBusy(mode);
    try {
      const r = await apiFetch("/api/website/new-drops/page", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dropId, blocks, mode }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setSavedBlocks(blocks);
      setSavedAt(new Date());
      setChanged(true);
      if (mode === "publish") {
        setPublishedBlocks(blocks);
        setCustom(true);
        setHasDraft(false);
        toast.success(j.purged ? "เผยแพร่หน้าชุดนี้แล้ว — เว็บจริงเปลี่ยนแล้ว" : "เผยแพร่หน้าชุดนี้แล้ว — เว็บจริงจะเปลี่ยนภายใน 1 นาที");
        setPreviewVersion((v) => v + 1);
      } else {
        setHasDraft(true);
        toast.success("บันทึกร่างแล้ว — เว็บจริงยังไม่เปลี่ยน");
      }
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    setAskReset(false);
    try {
      const r = await apiFetch(`/api/website/new-drops/page?id=${encodeURIComponent(dropId)}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "ทำไม่สำเร็จ");
        return;
      }
      toast.success("กลับไปใช้หน้าตาเดิมแล้ว");
      setChanged(true);
      await load();
      setPreviewVersion((v) => v + 1);
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    }
  };

  const ctx = useMemo(() => ({ shopSlug, shopId, shopName, categories, themeCard }), [shopSlug, shopId, shopName, categories, themeCard]);

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">กำลังเปิดหน้าชุด…</div>;

  const previewSrc = siteUrl ? withPreviewKey(`${siteUrl}/new/${encodeURIComponent(dropId)}?preview=1`, previewKey) : null;
  const issues = [...validateBlocks(blocks as never), ...dataIssues];
  const unpublished = !custom || hasDraft || dirty || !eq(blocks, publishedBlocks);
  return (
    <div className="space-y-3">
      {!custom && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-800">
          🧱 ชุดนี้ยังใช้หน้าตาเดิม — เริ่มจากโครงตั้งต้น (Section 🆕 ชุดมาใหม่) แล้วเพิ่ม Section อื่นได้เลย · กด &quot;เผยแพร่หน้าชุดนี้&quot; เมื่อพร้อม (ก่อนนั้นลูกค้ายังเห็นหน้าเดิม)
        </p>
      )}
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
          leading: (
            <>
              <button
                onClick={() => {
                  if (dirty && !confirm("มีการแก้ที่ยังไม่บันทึก ออกโดยไม่บันทึก?")) return;
                  onClose(changed);
                }}
                className="text-xs text-slate-500 hover:text-blue-600 mr-1"
                title="กลับไปรายการชุดมาใหม่"
              >
                ← ชุดทั้งหมด
              </button>
              <span className="text-sm font-medium text-slate-800 truncate max-w-[180px]" title={`/new/${dropId}`}>
                🆕 {title}
              </span>
              {(custom || hasDraft) && (
                <button onClick={() => setAskReset(true)} className="h-7 px-2 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:border-red-300 hover:text-red-600" title="ล้างหน้าที่จัดไว้ กลับไปใช้หน้าตาเดิม">
                  ↺ หน้าตาเดิม
                </button>
              )}
            </>
          ),
          dirty: unpublished,
          statusNote: `${blocks.length} Section`,
          savedText: savedAt ? `บันทึกร่าง ${savedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}` : "",
          saving: busy === "draft",
          issues,
          changes: summarizeChanges(blocks, publishedBlocks, types),
          canUndo: undoStack.current.length > 0,
          canRedo: redoStack.current.length > 0,
          onUndo: undo,
          onRedo: redo,
          onSaveDraft: () => void save("draft"),
          onPublish: () => void save("publish"),
          publishLabel: "เผยแพร่หน้าชุดนี้",
          busy: busy === "publish",
        }}
      />
      <PublishCheckDialog
        open={checkOpen}
        onClose={() => setCheckOpen(false)}
        onConfirm={() => void save("publish", true)}
        issues={issues}
        what={` หน้าชุด "${title}"`}
        busy={busy === "publish"}
        onGoBlock={(id) => setSelection({ blockId: id })}
      />
      <ConfirmDialog
        open={askReset}
        onClose={() => setAskReset(false)}
        onConfirm={() => void reset()}
        title="กลับไปใช้หน้าตาเดิม?"
        message="ล้าง Section ที่จัดไว้ทั้งที่เผยแพร่และร่าง — หน้า /new/<ชุด> กลับเป็นแบบเดิม (แบนเนอร์ชุด + สินค้า / นับถอยหลัง) · ตัวชุดและสินค้าในชุดไม่หาย"
        confirmText="กลับไปหน้าตาเดิม"
        variant="danger"
      />
    </div>
  );
}
