"use client";

/**
 * WebsitePagesPanel — แท็บ "📄 หน้าเว็บ" ในหน้า /website/<slug>
 * สร้าง/ลบหน้าใหม่ · จัดบล็อกในแต่ละหน้า (ใช้ตัวจัดบล็อกชุดเดียวกับหน้าแรก) · ตั้ง SEO · ร่าง/เผยแพร่
 * ข้อมูล: /api/website/pages
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { BlockListEditor, type Block, type BlockTypeInfo } from "@/components/website-block-editor";

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

export function WebsitePagesPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();

  const [pages, setPages] = useState<PageRow[]>([]);
  const [types, setTypes] = useState<BlockTypeInfo[]>([]);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // หน้าที่กำลังแก้
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [seo, setSeo] = useState<{ title: string; description: string }>({ title: "", description: "" });
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);

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
      setEditId(id);
      setEditTitle(p.title ?? "");
      setEditSlug(p.slug ?? "");
      setSeo({ title: p.seo?.title ?? "", description: p.seo?.description ?? "" });
      setBlocks(p.draft ?? p.published ?? []);
      setHasDraft(Boolean(p.hasDraft));
    } catch {
      toast.error("เปิดหน้าไม่สำเร็จ");
    }
  };

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
      toast.success("สร้างหน้าแล้ว — เพิ่มบล็อกได้เลย");
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
    if (mode === "publish" && !confirm("เผยแพร่หน้านี้ไปยังเว็บไซต์จริง?")) return;
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
      if (mode === "publish") {
        setHasDraft(false);
        toast.success("เผยแพร่หน้านี้แล้ว");
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

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;

  /* ── หน้าจอแก้ไขหน้าเดียว ── */
  if (editId) {
    const previewUrl = siteUrl ? `${siteUrl}/${editSlug}?preview=1` : null;
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setEditId(null)} className="text-xs text-slate-500 hover:text-blue-600">
            ← รายการหน้าทั้งหมด
          </button>
          <span className="text-xs text-slate-400">/{editSlug}</span>
          {hasDraft && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              มีร่างที่ยังไม่เผยแพร่
            </span>
          )}
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noreferrer" className="ml-auto text-xs text-blue-600 hover:underline">
              เปิดพรีวิวหน้านี้ ↗
            </a>
          )}
        </div>

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
              <input
                className={inputCls}
                value={seo.description}
                onChange={(e) => setSeo({ ...seo, description: e.target.value })}
                placeholder="สรุปเนื้อหาหน้านี้สั้น ๆ"
              />
            </div>
          </div>
        </div>

        <BlockListEditor blocks={blocks} types={types} onChange={setBlocks} />

        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
          <span className="text-xs text-slate-500">{blocks.length} บล็อกในหน้านี้</span>
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
        <p className="text-sm text-slate-700">สร้างหน้าเพิ่มเองได้ เช่น โปรโมชัน · วิธีสั่งซื้อ · นโยบายจัดส่ง</p>
        <p className="text-xs text-slate-500 mt-0.5">
          หน้าแรกจัดที่แท็บ &quot;🧱 หน้าแรก&quot; · หน้าที่เว็บมีอยู่แล้ว (ร้านวัสดุ/รับผลิต/ติดต่อ) ไม่ต้องสร้างซ้ำ
        </p>
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
          <button onClick={() => void createPage()} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-black">
            สร้าง
          </button>
          {newSlug && <p className="sm:col-span-3 text-[11px] text-slate-500">หน้านี้จะอยู่ที่ /{newSlug.toLowerCase().replace(/[^a-z0-9-]/g, "")}</p>}
        </div>
      )}

      {!pages.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center">
          <p className="text-sm text-slate-400">ยังไม่มีหน้าที่สร้างเอง</p>
          <button onClick={() => setShowNew(true)} className="mt-3 text-sm text-blue-600 hover:underline">
            + สร้างหน้าแรกของคุณ
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {pages.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <span className="text-lg">📄</span>
              <button onClick={() => void openPage(p.id)} className="flex-1 min-w-0 text-left">
                <span className="block text-sm font-medium text-slate-800 truncate">{p.title}</span>
                <span className="block text-[11px] text-slate-400">
                  /{p.slug} · {p.blocks} บล็อก
                  {p.hasDraft && " · มีร่าง"}
                </span>
              </button>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full ${
                  p.status === "published"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-slate-100 text-slate-500 border border-slate-200"
                }`}
              >
                {p.status === "published" ? "เผยแพร่แล้ว" : "ร่าง"}
              </span>
              <button onClick={() => void openPage(p.id)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">
                แก้ไข
              </button>
              <button onClick={() => void removePage(p)} className="text-xs text-red-500 hover:underline">
                ลบ
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
