"use client";

/**
 * WebsiteLayoutPanel — แท็บ "🧱 หน้าแรก" ในหน้า /website/<slug>
 * จัดโครงหน้าแรก: เพิ่ม/ลบ/ลากเรียง/เปิด-ปิดบล็อก + แก้ข้อความ (ใช้ตัวจัดบล็อกกลาง)
 * ร่าง/เผยแพร่ + undo/redo + พรีวิวเว็บจริง
 * ข้อมูล: /api/website/layout
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { BlockListEditor, type Block, type BlockTypeInfo } from "@/components/website-block-editor";

type Device = "desktop" | "tablet" | "mobile";

const DEVICES: { k: Device; w: number; icon: string }[] = [
  { k: "desktop", w: 1440, icon: "🖥️" },
  { k: "tablet", w: 768, icon: "📱" },
  { k: "mobile", w: 390, icon: "📲" },
];

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function WebsiteLayoutPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [published, setPublished] = useState<Block[]>([]);
  const [types, setTypes] = useState<BlockTypeInfo[]>([]);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [neverSet, setNeverSet] = useState(false);
  const [hadDraft, setHadDraft] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [device, setDevice] = useState<Device>("desktop");

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
      setSiteUrl(j.shop?.siteUrl ?? null);
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
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const isDirty = !eq(blocks, published) || hadDraft;

  useEffect(() => {
    if (!isDirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isDirty]);

  const save = async (mode: "draft" | "publish") => {
    if (mode === "publish" && !confirm("ยืนยันเผยแพร่โครงหน้าแรกนี้ไปยังเว็บไซต์จริง?")) return;
    setBusy(mode);
    try {
      const r = await apiFetch("/api/website/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, blocks, mode }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      if (mode === "publish") {
        setPublished(j.blocks);
        setNeverSet(false);
        setHadDraft(false);
        toast.success("เผยแพร่หน้าแรกแล้ว — เว็บจะอัปเดตภายใน ~1 นาที");
      } else {
        setHadDraft(true);
        toast.success("บันทึกร่างแล้ว — กด ↻ ที่พรีวิวเพื่อดูผล");
      }
      // โหลดพรีวิวใหม่ให้เห็นผลทันที
      setTimeout(() => iframeRef.current?.contentWindow?.location.reload(), 300);
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

  const dev = DEVICES.find((d) => d.k === device)!;
  const previewSrc = siteUrl ? `${siteUrl}/?preview=1` : null;
  const scale = useMemo(() => Math.min(1, 400 / dev.w), [dev.w]);

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;

  return (
    <div className="space-y-3">
      {/* สถานะ */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            isDirty ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
          }`}
        >
          {isDirty ? "● ยังไม่เผยแพร่" : "✓ เผยแพร่แล้ว"}
        </span>
        <span className="text-[11px] text-slate-400">
          {blocks.length} บล็อก · เปิดใช้ {blocks.filter((b) => b.enabled).length}
          {neverSet && " · ยังไม่เคยจัดหน้า (นี่คือโครงเริ่มต้น)"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={undo} disabled={!undoStack.current.length} title="ย้อนกลับ (Ctrl+Z)" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:border-slate-400">↶</button>
          <button onClick={redo} disabled={!redoStack.current.length} title="ทำซ้ำ" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:border-slate-400">↷</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,38%)] items-start">
        <div className="min-w-0">
          <BlockListEditor blocks={blocks} types={types} onChange={apply} />
        </div>

        {/* พรีวิว */}
        <div className="lg:sticky lg:top-4 min-w-0">
          <div className="flex items-center gap-1.5 mb-2">
            {DEVICES.map((d) => (
              <button
                key={d.k}
                onClick={() => setDevice(d.k)}
                className={`px-2.5 py-1 rounded-lg border text-xs ${device === d.k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
              >
                {d.icon}
              </button>
            ))}
            {previewSrc && (
              <a href={previewSrc} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">↗</a>
            )}
            <button
              onClick={() => iframeRef.current?.contentWindow?.location.reload()}
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400"
              title="โหลดพรีวิวใหม่"
            >
              ↻
            </button>
            <span className="text-[10px] text-slate-400 ml-auto">{dev.w}px</span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-100 overflow-hidden" style={{ height: "72vh", minHeight: 420 }}>
            {previewSrc ? (
              <div className="w-full h-full overflow-auto flex justify-center">
                <iframe
                  ref={iframeRef}
                  src={previewSrc}
                  title="พรีวิวหน้าแรก"
                  className="bg-white border-0"
                  style={{ width: dev.w, height: `${72 / scale}vh`, transform: `scale(${scale})`, transformOrigin: "top center", minHeight: 600 }}
                />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400 px-6 text-center">
                ยังไม่ได้ผูกโดเมนเว็บกับร้านนี้
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 text-center">พรีวิวใช้ร่างล่าสุด — บันทึกร่างแล้วจะรีเฟรชให้อัตโนมัติ</p>
        </div>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
        <span className="text-xs text-slate-500">{isDirty ? "มีการเปลี่ยนแปลงที่ยังไม่เผยแพร่" : "ไม่มีการเปลี่ยนแปลง"}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void discard()} disabled={!isDirty} className="px-3.5 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-800 disabled:opacity-40">
            ละทิ้งการเปลี่ยนแปลง
          </button>
          <button onClick={() => void save("draft")} disabled={busy !== null} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:border-slate-500 disabled:opacity-50">
            {busy === "draft" ? "กำลังบันทึก…" : "บันทึกร่าง"}
          </button>
          <button onClick={() => void save("publish")} disabled={busy !== null} className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {busy === "publish" ? "กำลังเผยแพร่…" : "เผยแพร่"}
          </button>
        </div>
      </div>
    </div>
  );
}
