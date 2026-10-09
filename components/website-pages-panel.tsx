"use client";

/**
 * WebsitePagesPanel — แท็บ "📄 หน้าเว็บ" ในหน้า /website/<slug>
 * สร้าง/ลบหน้าใหม่ · จัด Section/Block ในแต่ละหน้าด้วยตัวจัดหน้า 3 แผงตัวเดียวกับหน้าแรก · ตั้ง SEO · ร่าง/เผยแพร่ · undo/redo
 * ข้อมูล: /api/website/pages
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { WebsiteBuilder, type Selection } from "@/components/website-builder";
import type { Block, BlockTypeInfo } from "@/components/website-block-editor";
import { validateBlocks } from "@/lib/website-blocks";

type PageRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  blocks: number;
  hasDraft: boolean;
  updatedAt: string;
};

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function WebsitePagesPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();

  const [pages, setPages] = useState<PageRow[]>([]);
  const [types, setTypes] = useState<BlockTypeInfo[]>([]);
  const [categories, setCategories] = useState<{ key: string; label: string }[]>([]);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // หน้าที่กำลังแก้
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [seo, setSeo] = useState<{ title: string; description: string }>({ title: "", description: "" });
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [savedBlocks, setSavedBlocks] = useState<Block[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [showSeo, setShowSeo] = useState(false);
  const undoStack = useRef<Block[][]>([]);
  const redoStack = useRef<Block[][]>([]);
  const [, tick] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // สร้างหน้าใหม่
  const [showNew, setShowNew] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/website/pages?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json();
      if (j.error) {
        toast.error(j.error);
        return;
      }
      setPages(j.pages ?? []);
      setTypes(j.blockTypes ?? []);
      setCategories(j.categories ?? []);
      setSiteUrl(j.shop?.siteUrl ?? null);
    } catch {
      toast.error("โหลดรายการหน้าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [shopSlug, toast]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openPage = async (id: string) => {
    try {
      const r = await apiFetch(`/api/website/pages?shop=${encodeURIComponent(shopSlug)}&pageId=${encodeURIComponent(id)}`);
      const j = await r.json();
      if (j.error) {
        toast.error(j.error);
        return;
      }
      const p = j.page;
      const initial = p.draft ?? p.published ?? [];
      setEditId(id);
      setEditTitle(p.title ?? "");
      setEditSlug(p.slug ?? "");
      setSeo({ title: p.seo?.title ?? "", description: p.seo?.description ?? "" });
      setBlocks(initial);
      setSavedBlocks(initial);
      setHasDraft(Boolean(p.hasDraft));
      setSelection(null);
      undoStack.current = [];
      redoStack.current = [];
      if (j.categories) setCategories(j.categories);
    } catch {
      toast.error("เปิดหน้าไม่สำเร็จ");
    }
  };

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
    if (!editId) return;
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
  }, [editId, undo, redo]);

  const dirty = editId !== null && !eq(blocks, savedBlocks);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const createPage = async () => {
    if (!newSlug.trim()) return;
    try {
      const r = await apiFetch("/api/website/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, slug: newSlug, title: newTitle || newSlug }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "สร้างหน้าไม่สำเร็จ");
        return;
      }
      toast.success("สร้างหน้าแล้ว — เพิ่ม Section ได้เลย");
      setShowNew(false);
      setNewSlug("");
      setNewTitle("");
      await loadList();
      await openPage(j.pageId);
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    }
  };

  const removePage = async (p: PageRow) => {
    if (!confirm(`ลบหน้า "${p.title}" (/${p.slug}) ถาวร?`)) return;
    try {
      const r = await apiFetch(`/api/website/pages?pageId=${encodeURIComponent(p.id)}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "ลบไม่สำเร็จ");
        return;
      }
      toast.success("ลบหน้าแล้ว");
      if (editId === p.id) setEditId(null);
      await loadList();
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    }
  };

  const save = async (mode: "draft" | "publish") => {
    if (!editId) return;
    const errs = validateBlocks(blocks as never).filter((i) => i.level === "error");
    if (mode === "publish" && errs.length && !confirm(`พบ ${errs.length} จุดที่ควรแก้ก่อน\nยืนยันเผยแพร่ทั้งที่ยังมีปัญหา?`)) return;
    if (mode === "publish" && !errs.length && !confirm("เผยแพร่หน้านี้ไปยังเว็บไซต์จริง?")) return;
    setBusy(mode);
    try {
      const r = await apiFetch("/api/website/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: editId, blocks, seo, title: editTitle, mode }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setSavedBlocks(blocks);
      if (mode === "publish") {
        setHasDraft(false);
        toast.success("เผยแพร่หน้านี้แล้ว — เว็บอัปเดตใน ~1 นาที");
        setTimeout(() => iframeRef.current?.contentWindow?.location.reload(), 400);
      } else {
        setHasDraft(true);
        toast.success("บันทึกร่างแล้ว — เว็บจริงยังไม่เปลี่ยน");
      }
      await loadList();
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(null);
    }
  };

  const ctx = useMemo(() => ({ shopSlug, shopId, categories }), [shopSlug, shopId, categories]);

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;

  /* ── หน้าจอแก้ไขหน้าเดียว ── */
  if (editId) {
    const previewSrc = siteUrl ? `${siteUrl}/${editSlug}?preview=1` : null;
    const issues = validateBlocks(blocks as never);
    const errors = issues.filter((i) => i.level === "error");
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
          <button
            onClick={() => {
              if (dirty && !confirm("มีการแก้ที่ยังไม่บันทึก ออกโดยไม่บันทึก?")) return;
              setEditId(null);
            }}
            className="text-xs text-slate-500 hover:text-blue-600"
          >
            ← รายการหน้าทั้งหมด
          </button>
          <span className="text-sm font-medium text-slate-800">{editTitle}</span>
          <span className="text-xs text-slate-400">/{editSlug}</span>
          {hasDraft && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">มีร่างที่ยังไม่เผยแพร่</span>}
          {dirty && <span className="text-[11px] text-amber-600">● ยังไม่บันทึก</span>}
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setShowSeo((v) => !v)} className={`px-2.5 py-1.5 rounded-lg border text-xs ${showSeo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
              🔎 ชื่อหน้า & SEO
            </button>
            <button onClick={undo} disabled={!undoStack.current.length} title="ย้อนกลับ (Ctrl+Z)" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:border-slate-400">↶</button>
            <button onClick={redo} disabled={!redoStack.current.length} title="ทำซ้ำ" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:border-slate-400">↷</button>
          </div>
        </div>

        {showSeo && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>ชื่อหน้า (แสดงในเมนู)</label>
                <input className={inputCls} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>ที่อยู่หน้า (แก้ไม่ได้หลังสร้าง)</label>
                <input className={inputCls} value={`/${editSlug}`} disabled />
              </div>
              <div>
                <label className={labelCls}>ชื่อหน้าใน Google (SEO title)</label>
                <input className={inputCls} value={seo.title} onChange={(e) => setSeo({ ...seo, title: e.target.value })} placeholder={editTitle} />
              </div>
              <div>
                <label className={labelCls}>คำอธิบายใน Google (SEO description)</label>
                <input className={inputCls} value={seo.description} onChange={(e) => setSeo({ ...seo, description: e.target.value })} placeholder="สรุปเนื้อหาหน้านี้สั้น ๆ" />
              </div>
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50/60 px-4 py-2 text-xs text-slate-700">
            ⚠️ ควรแก้ก่อนเผยแพร่ {errors.length} จุด: {errors.map((e) => e.message).join(" · ")}
          </div>
        )}

        <WebsiteBuilder blocks={blocks} onChange={apply} types={types} ctx={ctx} previewSrc={previewSrc} iframeRef={iframeRef} selection={selection} onSelect={setSelection} />

        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
          <span className="text-xs text-slate-500">{blocks.length} Section ในหน้านี้{dirty ? " · มีการแก้ที่ยังไม่บันทึก" : ""}</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => void save("draft")} disabled={busy !== null} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:border-slate-500 disabled:opacity-50">
              {busy === "draft" ? "กำลังบันทึก…" : "บันทึกร่าง"}
            </button>
            <button onClick={() => void save("publish")} disabled={busy !== null} className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {busy === "publish" ? "กำลังเผยแพร่…" : "เผยแพร่หน้านี้"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── รายการหน้า ── */
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-blue-50/60 border border-blue-200 px-4 py-2.5">
        <p className="text-sm text-slate-700">สร้างหน้าเพิ่มเองได้ เช่น โปรโมชัน · วิธีสั่งซื้อ · นโยบายจัดส่ง · เกี่ยวกับเรา</p>
        <p className="text-xs text-slate-500 mt-0.5">หน้าแรกจัดที่แท็บ &quot;🧱 หน้าแรก&quot; · หน้าที่สร้างจะขึ้นเป็นเมนูบนเว็บอัตโนมัติเมื่อเผยแพร่</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate-500">{pages.length} หน้า</span>
        <button onClick={() => setShowNew((v) => !v)} className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
          {showNew ? "ปิด" : "+ สร้างหน้าใหม่"}
        </button>
      </div>

      {showNew && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
          <div>
            <label className={labelCls}>ชื่อหน้า</label>
            <input className={inputCls} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="เช่น โปรโมชันเดือนนี้" />
          </div>
          <div>
            <label className={labelCls}>ที่อยู่หน้า (ภาษาอังกฤษ)</label>
            <input className={inputCls} value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="promotion" />
          </div>
          <button onClick={() => void createPage()} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-black">สร้าง</button>
          {newSlug && <p className="sm:col-span-3 text-[11px] text-slate-500">หน้านี้จะอยู่ที่ /{newSlug.toLowerCase().replace(/[^a-z0-9-]/g, "")}</p>}
        </div>
      )}

      {!pages.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center">
          <p className="text-sm text-slate-400">ยังไม่มีหน้าที่สร้างเอง</p>
          <button onClick={() => setShowNew(true)} className="mt-3 text-sm text-blue-600 hover:underline">+ สร้างหน้าแรกของคุณ</button>
        </div>
      ) : (
        <ul className="space-y-2">
          {pages.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <span className="text-lg">📄</span>
              <button onClick={() => void openPage(p.id)} className="flex-1 min-w-0 text-left">
                <span className="block text-sm font-medium text-slate-800 truncate">{p.title}</span>
                <span className="block text-[11px] text-slate-400">
                  /{p.slug} · {p.blocks} Section
                  {p.hasDraft && " · มีร่าง"}
                </span>
              </button>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${p.status === "published" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
                {p.status === "published" ? "เผยแพร่แล้ว" : "ร่าง"}
              </span>
              {siteUrl && p.status === "published" && (
                <a href={`${siteUrl}/${p.slug}`} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-blue-600" title="เปิดหน้าจริง">↗</a>
              )}
              <button onClick={() => void openPage(p.id)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">แก้ไข</button>
              <button onClick={() => void removePage(p)} className="text-xs text-red-500 hover:underline">ลบ</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
