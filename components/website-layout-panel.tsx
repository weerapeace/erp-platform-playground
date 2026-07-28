"use client";

/**
 * WebsiteLayoutPanel — แท็บ "🧱 หน้าแรก" ในหน้า /website/<slug>
 *
 * จัดโครงหน้าแรกเป็นบล็อก: เพิ่ม/ลบ/ทำสำเนา/ลากเรียง/เปิด-ปิด/ซ่อนตามอุปกรณ์
 * พรีวิว = เว็บจริง (iframe) — คลิกบล็อกในพรีวิวแล้วเปิดฟอร์มทางซ้ายได้
 * ปลอดภัย: บันทึกร่างอัตโนมัติ · ประวัติเวอร์ชัน · ตรวจก่อนเผยแพร่
 *
 * ข้อมูล: /api/website/layout · /api/website/layout/versions
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { BlockListEditor, type Block, type BlockTypeInfo } from "@/components/website-block-editor";
import { validateBlocks, type ValidationIssue } from "@/lib/website-blocks";

type Device = "desktop" | "tablet" | "mobile";
type Zoom = "fit" | 0.5 | 0.75 | 1;

const DEVICES: { k: Device; w: number; h: number; icon: string; label: string }[] = [
  { k: "desktop", w: 1440, h: 900, icon: "🖥️", label: "คอมพิวเตอร์" },
  { k: "tablet", w: 768, h: 1024, icon: "📱", label: "แท็บเล็ต" },
  { k: "mobile", w: 390, h: 844, icon: "📲", label: "มือถือ" },
];

const AUTOSAVE_MS = 20000;
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const timeStr = (d: Date) => d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

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
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<{ versionNo: number; createdAt: string; actor: string | null; blocks: number }[]>([]);

  // auto-save
  const [autoSave, setAutoSave] = useState(true);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  const undoStack = useRef<Block[][]>([]);
  const redoStack = useRef<Block[][]>([]);
  const [, tick] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(420);

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

  // วัดความกว้างกล่องพรีวิวเพื่อคำนวณ "พอดีจอ"
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, [fullscreen, loading]);

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
      if (e.key === "Escape" && fullscreen) setFullscreen(false);
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, fullscreen]);

  const isDirty = !eq(blocks, published) || hadDraft;
  const issues: ValidationIssue[] = useMemo(() => validateBlocks(blocks as never), [blocks]);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

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

  // บันทึกร่างอัตโนมัติเมื่อมีการเปลี่ยนแปลง
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
      setNeverSet(false);
      setHadDraft(false);
      toast.success(`เผยแพร่แล้ว (เวอร์ชัน ${j.version}) — เว็บอัปเดตใน ~1 นาที`);
      setTimeout(() => iframeRef.current?.contentWindow?.location.reload(), 400);
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

  // คลิกบล็อกในพรีวิว → เปิดฟอร์มทางซ้าย
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; blockId?: string } | null;
      if (d?.type !== "storefront-block-click" || !d.blockId) return;
      setSelectedId(d.blockId);
      document.getElementById(`blk-${d.blockId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // เลือกบล็อกทางซ้าย → ไฮไลต์ในพรีวิว
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: "storefront-select-block", blockId: selectedId }, "*");
  }, [selectedId]);

  const dev = DEVICES.find((d) => d.k === device)!;
  const previewSrc = siteUrl ? `${siteUrl}/?preview=1` : null;
  const scale = zoom === "fit" ? Math.min(1, (boxW - 16) / dev.w) : zoom;

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;

  /* ── กล่องพรีวิว (ใช้ซ้ำทั้งปกติและเต็มจอ) ── */
  const previewToolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {DEVICES.map((d) => (
        <button
          key={d.k}
          onClick={() => setDevice(d.k)}
          title={`${d.label} ${d.w}×${d.h}`}
          className={`px-2.5 py-1 rounded-lg border text-xs ${device === d.k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
        >
          {d.icon}
        </button>
      ))}
      <select
        value={String(zoom)}
        onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : (Number(e.target.value) as Zoom))}
        className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700"
      >
        <option value="fit">พอดีจอ</option>
        <option value="0.5">50%</option>
        <option value="0.75">75%</option>
        <option value="1">100%</option>
      </select>
      <button onClick={() => setFullscreen((v) => !v)} title="เต็มจอ (Esc เพื่อออก)" className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">
        {fullscreen ? "⤡" : "⤢"}
      </button>
      <button onClick={() => iframeRef.current?.contentWindow?.location.reload()} title="โหลดใหม่" className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">
        ↻
      </button>
      {previewSrc && (
        <a href={previewSrc} target="_blank" rel="noreferrer" title="เปิดแท็บใหม่" className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">
          ↗
        </a>
      )}
      <span className="text-[10px] text-slate-400 ml-auto">
        {dev.w}×{dev.h} · {Math.round(scale * 100)}%
      </span>
    </div>
  );

  const previewFrame = (heightCss: string) => (
    <div ref={previewBoxRef} className="rounded-xl border border-slate-200 bg-slate-100 overflow-hidden" style={{ height: heightCss }}>
      {previewSrc ? (
        <div className="w-full h-full overflow-auto flex justify-center py-2">
          <iframe
            ref={iframeRef}
            src={previewSrc}
            title="พรีวิวหน้าแรก"
            className="bg-white border-0 shadow-sm"
            style={{
              width: dev.w,
              height: dev.h,
              transform: `scale(${scale})`,
              transformOrigin: "top center",
              flexShrink: 0,
            }}
          />
        </div>
      ) : (
        <div className="h-full flex items-center justify-center text-sm text-slate-400 px-6 text-center">
          ยังไม่ได้ผูกโดเมนเว็บกับร้านนี้
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* แถบสถานะ */}
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
          {neverSet && " · ยังไม่เคยจัดหน้า (โครงเริ่มต้น)"}
        </span>

        {/* สถานะบันทึกอัตโนมัติ */}
        <span className="text-[11px] text-slate-400">
          {saving ? "กำลังบันทึกร่าง…" : savedAt ? `บันทึกร่างล่าสุด ${timeStr(savedAt)}` : ""}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 mr-2 cursor-pointer" title="บันทึกร่างให้อัตโนมัติทุก 20 วินาที">
            <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
            บันทึกอัตโนมัติ
          </label>
          <button onClick={() => void loadVersions()} title="ประวัติเวอร์ชัน" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">
            🕘
          </button>
          <button onClick={undo} disabled={!undoStack.current.length} title="ย้อนกลับ (Ctrl+Z)" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:border-slate-400">↶</button>
          <button onClick={redo} disabled={!redoStack.current.length} title="ทำซ้ำ" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:border-slate-400">↷</button>
        </div>
      </div>

      {/* ผลตรวจ */}
      {(errors.length > 0 || warnings.length > 0) && (
        <div className={`rounded-xl border px-4 py-2.5 ${errors.length ? "bg-red-50/60 border-red-200" : "bg-amber-50/60 border-amber-200"}`}>
          <button onClick={() => setShowIssues((v) => !v)} className="w-full flex items-center gap-2 text-left">
            <span className="text-sm text-slate-700">
              {errors.length > 0 ? `⚠️ ควรแก้ก่อนเผยแพร่ ${errors.length} จุด` : `💡 มีข้อแนะนำ ${warnings.length} จุด`}
              {errors.length > 0 && warnings.length > 0 && ` · คำเตือนอีก ${warnings.length}`}
            </span>
            <span className="ml-auto text-xs text-slate-500">{showIssues ? "ซ่อน" : "ดูรายละเอียด"}</span>
          </button>
          {showIssues && (
            <ul className="mt-2 space-y-1">
              {issues.map((it, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className={it.level === "error" ? "text-red-600" : "text-amber-600"}>{it.level === "error" ? "✕" : "!"}</span>
                  <span className="flex-1 text-slate-700">{it.message}</span>
                  {it.blockId && (
                    <button
                      onClick={() => {
                        setSelectedId(it.blockId);
                        document.getElementById(`blk-${it.blockId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      className="text-blue-600 hover:underline whitespace-nowrap"
                    >
                      ไปที่บล็อก
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(380px,42%)] items-start">
        <div className="min-w-0">
          <BlockListEditor blocks={blocks} types={types} onChange={apply} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        {/* พรีวิว */}
        <div className="lg:sticky lg:top-4 min-w-0 space-y-2">
          {previewToolbar}
          {previewFrame("74vh")}
          <p className="text-[10px] text-slate-400 text-center">
            คลิกบล็อกในพรีวิวเพื่อเปิดฟอร์มทางซ้าย · บันทึกร่างแล้วกด ↻ เพื่อดูผลเต็ม
          </p>
        </div>
      </div>

      {/* แถบปุ่มล่าง */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
        <span className="text-xs text-slate-500">
          {isDirty ? "มีการเปลี่ยนแปลงที่ยังไม่เผยแพร่" : "ไม่มีการเปลี่ยนแปลง"}
          {errors.length > 0 && <span className="text-red-600"> · ควรแก้ {errors.length} จุด</span>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void discard()} disabled={!isDirty} className="px-3.5 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-800 disabled:opacity-40">
            ละทิ้งการเปลี่ยนแปลง
          </button>
          <button onClick={() => void saveDraft(false)} disabled={saving || busy !== null} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:border-slate-500 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : "บันทึกร่าง"}
          </button>
          <button onClick={() => void publish()} disabled={busy !== null} className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {busy === "publish" ? "กำลังเผยแพร่…" : "เผยแพร่"}
          </button>
        </div>
      </div>

      {/* เต็มจอ */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm p-4 flex flex-col gap-3">
          <div className="bg-white rounded-xl px-4 py-2.5">{previewToolbar}</div>
          <div className="flex-1 min-h-0">{previewFrame("100%")}</div>
        </div>
      )}

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
                        <p className="text-sm text-slate-700">{v.blocks} บล็อก</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {new Date(v.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                          {v.actor && ` · ${v.actor}`}
                        </p>
                      </div>
                      <button onClick={() => void restore(v.versionNo)} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                        กู้คืนเป็นร่าง
                      </button>
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
