"use client";

/**
 * WebsitePagesPanel — แท็บ "📄 หน้าเว็บ" ในหน้า /website/<slug>
 * สร้าง/ลบหน้าใหม่ · จัด Section/Block ในแต่ละหน้าด้วยตัวจัดหน้า 3 แผงตัวเดียวกับหน้าแรก · ตั้ง SEO · ร่าง/เผยแพร่ · undo/redo
 * ร่าง/เผยแพร่/บันทึกอัตโนมัติ/ย้อน = ของกลาง useDraftPublish (components/website-draft-publish)
 * ข้อมูล: /api/website/pages
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { askConfirm, askLeaveUnsaved } from "@/components/modal/ask-dialog";
import { withPreviewKey } from "@/lib/storefront-preview-link";
import { WebsiteBuilder, type Selection } from "@/components/website-builder";
import { useDraftPublish, summarizeChanges } from "@/components/website-draft-publish";
import type { Block, BlockTypeInfo } from "@/components/website-block-editor";
import { validateBlocks } from "@/lib/website-blocks";
import { useShopPublishIssues, PublishCheckDialog } from "@/components/website-publish-check";
import { VersionHistoryDrawer } from "@/components/website-version-history";
import { useDesignTabAccess } from "@/components/website-tab-review";
import { ERPDateTime24 } from "@/components/form";
import { ImageUploadField } from "@/components/website-theme-media";
import { webForm } from "@/lib/website-form-styles";

type PageRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  blocks: number;
  hasDraft: boolean;
  updatedAt: string;
  /** 🧭 กลุ่มศูนย์ช่วยเหลือ ("" = หน้าธรรมดา) */
  help?: string;
  sortOrder?: number;
  /** static = หน้าเว็บ · post = 📝 บทความ (/blog/<slug>) */
  pageType?: "static" | "post";
  /** ⏰ ตั้งเวลาเผยแพร่ (ISO · "" = ทันที) */
  publishAt?: string;
};

/** ข้อมูลเสริมของหน้า (store_pages.seo) — ตรงกับ lib/website-help-center.ts PageMeta */
type Meta = {
  title: string;
  description: string;
  title_en: string;
  description_en: string;
  name_en: string;
  help: string;
  help_en: string;
  publishAt: string;
  bare: boolean;
  cover: string;
  excerpt: string;
  excerpt_en: string;
  tags: string[];
  author: string;
};
const EMPTY_META: Meta = { title: "", description: "", title_en: "", description_en: "", name_en: "", help: "", help_en: "", publishAt: "", bare: false, cover: "", excerpt: "", excerpt_en: "", tags: [], author: "" };
/** ISO ↔ "YYYY-MM-DDTHH:mm" เวลาไทย (ช่อง ERPDateTime24) */
const isoToLocal = (iso: string) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 16) : "");
const localToIso = (v: string) => (v ? new Date(`${v}:00+07:00`).toISOString() : "");
const thWhen = (iso: string) => new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

const inputCls = webForm.input;
const labelCls = webForm.label;
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** แบ่งรายการหน้า: หน้าทั่วไปก่อน แล้วตามด้วยกลุ่มศูนย์ช่วยเหลือ (ลำดับในกลุ่ม = sort_order ที่ API เรียงมาแล้ว) */
function groupPages(pages: PageRow[]): { name: string; kind: "plain" | "posts" | "help"; pages: PageRow[] }[] {
  const plain = pages.filter((p) => !p.help && p.pageType !== "post");
  // 📝 บทความ: ใหม่สุดก่อน (เวลาเผยแพร่ / ตั้งเวลา)
  const posts = pages.filter((p) => p.pageType === "post").sort((a, b) => (b.publishAt || b.updatedAt).localeCompare(a.publishAt || a.updatedAt));
  const groups = new Map<string, PageRow[]>();
  for (const p of pages) if (p.help && p.pageType !== "post") groups.set(p.help, [...(groups.get(p.help) ?? []), p]);
  return [
    ...(plain.length ? [{ name: "", kind: "plain" as const, pages: plain }] : []),
    ...(posts.length ? [{ name: "", kind: "posts" as const, pages: posts }] : []),
    ...[...groups.entries()].map(([name, list]) => ({ name, kind: "help" as const, pages: list })),
  ];
}

export function WebsitePagesPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  // 👷 ติ๊กหัวข้อแท็บ "หน้าเว็บ": สร้าง/แก้ร่างได้ · เผยแพร่ไม่ได้ = ส่งหัวหน้า (ชื่อหน้า/SEO ขึ้นเว็บทันที จึงล็อก) · ลบ/สลับลำดับ/ประวัติ = แก้ได้ทั้งหมด
  const tabAcc = useDesignTabAccess("webpages", shopId);

  const [pages, setPages] = useState<PageRow[]>([]);
  const [types, setTypes] = useState<BlockTypeInfo[]>([]);
  const [categories, setCategories] = useState<{ key: string; label: string }[]>([]);
  /** 🃏 การ์ดสินค้าของร้าน — Section ตารางสินค้าปิด "ใช้การ์ดตามค่ากลาง" แล้วก๊อปเป็นค่าเริ่ม */
  const [themeCard, setThemeCard] = useState<Record<string, unknown> | undefined>(undefined);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null); // 🔑 รหัสพรีวิว (ผ่านหน้าปิดเว็บ)
  const [shopName, setShopName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // หน้าที่กำลังแก้
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editType, setEditType] = useState<"static" | "post">("static");
  const [seo, setSeo] = useState<Meta>(EMPTY_META);
  // ค่าที่บันทึกแล้วของชื่อหน้า/ข้อมูลเสริม — เทียบเพื่อรู้ว่า "แก้ตั้งค่าหน้าแล้วยังไม่บันทึก"
  const [savedMeta, setSavedMeta] = useState<{ title: string; seo: Meta }>({ title: "", seo: EMPTY_META });
  const [selection, setSelection] = useState<Selection | null>(null);
  // ✅ ตรวจก่อนเผยแพร่: ข้อมูลสินค้าของร้าน (ไม่มีราคา/รูป/หมวด)
  const dataIssues = useShopPublishIssues(shopSlug);
  const [showSeo, setShowSeo] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // สร้างหน้าใหม่
  const [showNew, setShowNew] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"static" | "post">("static");

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
      setPreviewKey(j.shop?.previewKey ?? null);
      setShopName(j.shop?.name ?? "");
    } catch {
      toast.error("โหลดรายการหน้าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [shopSlug, toast]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // 🧰 ร่าง/เผยแพร่/บันทึกอัตโนมัติ/ย้อน = ของกลาง · บันทึกอัตโนมัติส่งแค่ Section · กดเอง = ส่งชื่อหน้า + SEO ไปด้วย
  const dp = useDraftPublish<Block>({
    active: editId !== null,
    what: "หน้านี้",
    save: async (blocks, mode, { auto }) => {
      const body = auto ? { pageId: editId, blocks, mode } : { pageId: editId, blocks, seo, title: editTitle, mode };
      const r = await apiFetch("/api/website/pages", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.ok && !auto) {
        setSavedMeta({ title: editTitle, seo });
        await loadList();
      }
      return j;
    },
  });

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
      setEditType(p.pageType === "post" ? "post" : "static");
      const meta = { ...EMPTY_META, ...(p.seo ?? {}) };
      setSeo(meta);
      setSavedMeta({ title: p.title ?? "", seo: meta });
      dp.reset(initial, p.published ?? [], Boolean(p.hasDraft));
      setSelection(null);
      if (j.categories) setCategories(j.categories);
      if (j.themeCard) setThemeCard(j.themeCard);
    } catch {
      toast.error("เปิดหน้าไม่สำเร็จ");
    }
  };

  // 🔗 ลิงก์ ?tab=pages&page=<slug> (เช่น ปุ่ม ✎ แก้ ในคอลัมน์ท้ายเว็บ "ศูนย์ช่วยเหลือ") → เปิดหน้านั้นให้เลย (ครั้งแรกครั้งเดียว)
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || loading || !pages.length) return;
    autoOpened.current = true;
    const want = new URLSearchParams(window.location.search).get("page");
    const p = want ? pages.find((x) => x.slug === want) : null;
    if (p) void openPage(p.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pages]);

  const createPage = async () => {
    if (!newSlug.trim()) return;
    try {
      const r = await apiFetch("/api/website/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, slug: newSlug, title: newTitle || newSlug, pageType: newType }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "สร้างหน้าไม่สำเร็จ");
        return;
      }
      toast.success(newType === "post" ? "สร้างบทความแล้ว — ใส่รูปปก/สรุปที่ ⚙ ตั้งค่าหน้า แล้วเพิ่มเนื้อหาเป็น Section" : "สร้างหน้าแล้ว — เพิ่ม Section ได้เลย");
      setShowNew(false);
      setNewSlug("");
      setNewTitle("");
      await loadList();
      await openPage(j.pageId);
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    }
  };

  // 🧭 สร้างชุดศูนย์ช่วยเหลือ (หน้าที่ยังไม่มี · เป็นร่าง)
  const [creatingHelp, setCreatingHelp] = useState(false);
  const createHelpCenter = async () => {
    const ok = await askConfirm({
      title: "สร้างชุดศูนย์ช่วยเหลือ?",
      message: (
        <div className="space-y-1">
          <p>จะสร้างหน้า: นโยบายความเป็นส่วนตัว · ข้อกำหนดและเงื่อนไข · คำถามที่พบบ่อย · ติดตามคำสั่งซื้อ · ติดต่อเรา · การจัดส่งและการคืนสินค้า (ไทย + อังกฤษ)</p>
          <p>หน้าที่มีอยู่แล้วจะไม่ถูกแตะ · ทุกหน้าเป็นร่าง ตรวจแล้วกดเผยแพร่เอง</p>
        </div>
      ),
      confirmText: "สร้าง",
    });
    if (!ok) return;
    setCreatingHelp(true);
    try {
      const r = await apiFetch("/api/website/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId, template: "help-center" }) });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "สร้างไม่สำเร็จ");
        return;
      }
      toast.success(j.created?.length ? `สร้าง ${j.created.length} หน้าแล้ว (ร่าง) — เปิดตรวจแล้วกดเผยแพร่ได้เลย` : "มีครบทุกหน้าอยู่แล้ว ไม่ได้สร้างเพิ่ม");
      await loadList();
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setCreatingHelp(false);
    }
  };

  // ↑↓ ย้ายลำดับในกลุ่ม (เมนูซ้ายของศูนย์ช่วยเหลือเรียงตามนี้) — สลับ sort_order กับหน้าข้างเคียง
  const movePage = async (list: PageRow[], i: number, dir: -1 | 1) => {
    const a = list[i];
    const b = list[i + dir];
    if (!a || !b) return;
    const base = Math.min(...list.map((p) => p.sortOrder ?? 0));
    const order = list.map((p) => p.id);
    [order[i], order[i + dir]] = [order[i + dir], order[i]];
    try {
      await Promise.all(
        order.map((id, k) =>
          apiFetch("/api/website/pages", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId: id, sortOrder: base + k }) })
        )
      );
      await loadList();
    } catch {
      toast.error("ย้ายลำดับไม่สำเร็จ");
    }
  };

  const removePage = async (p: PageRow) => {
    if (!(await askConfirm({ title: `ลบหน้า "${p.title}" (/${p.slug}) ถาวร?`, message: "ลบแล้วกู้คืนไม่ได้", variant: "danger", confirmText: "ลบถาวร" }))) return;
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

  const ctx = useMemo(() => ({ shopSlug, shopId, shopName, categories, themeCard }), [shopSlug, shopId, shopName, categories, themeCard]);

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;

  /* ── หน้าจอแก้ไขหน้าเดียว ── */
  if (editId) {
    const previewSrc = siteUrl ? withPreviewKey(`${siteUrl}/${editType === "post" ? "blog/" : ""}${editSlug}?preview=1`, previewKey) : null;
    const issues = [...validateBlocks(dp.blocks as never, { helpPage: !!seo.help.trim() }), ...dataIssues];
    const metaDirty = editTitle !== savedMeta.title || !eq(seo, savedMeta.seo);
    const unpublished = dp.unpublished || metaDirty;
    return (
      <div className="space-y-3">
        {showSeo && (
          <fieldset disabled={!tabAcc.canPublish} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            {!tabAcc.canPublish && <p className="text-[11px] rounded-lg bg-amber-50 text-amber-800 px-3 py-2">ชื่อหน้า / กลุ่ม / SEO ขึ้นเว็บทันทีเมื่อบันทึก (ไม่มีร่าง) — คุณยังเผยแพร่เองไม่ได้ จึงแก้ช่องเหล่านี้ไม่ได้ · ฝากหัวหน้าแก้ตอนส่งให้ตรวจ</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>ชื่อหน้า (ไทย)</label>
                <input className={inputCls} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>ชื่อหน้า (อังกฤษ · หน้า /en)</label>
                <input className={inputCls} value={seo.name_en} maxLength={120} onChange={(e) => setSeo({ ...seo, name_en: e.target.value })} placeholder="เช่น Privacy Policy" />
              </div>
              <div>
                <label className={labelCls}>ที่อยู่หน้า (แก้ไม่ได้หลังสร้าง)</label>
                <input className={inputCls} value={`/${editType === "post" ? "blog/" : ""}${editSlug}`} disabled />
              </div>
            </div>

            {/* ⏰ ตั้งเวลาเผยแพร่ (ทุกหน้า) + 🎯 Landing (หน้าเว็บ) */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>⏰ เผยแพร่เมื่อ (เวลาไทย · ว่าง = ทันทีที่กดเผยแพร่)</label>
                <ERPDateTime24 value={isoToLocal(seo.publishAt)} onChange={(v) => setSeo({ ...seo, publishAt: localToIso(v) })} defaultTime="09:00" />
                <p className="text-[11px] text-slate-500 mt-1">กด &quot;เผยแพร่&quot; ไว้ก่อนได้เลย — เว็บจะซ่อนหน้านี้จนถึงเวลา (พรีวิวยังเห็น)</p>
              </div>
              {editType === "static" && (
                <label className="flex items-start gap-2 text-sm text-slate-700 pt-5">
                  <input type="checkbox" checked={seo.bare} onChange={(e) => setSeo({ ...seo, bare: e.target.checked })} className="mt-1" />
                  <span>
                    🎯 หน้า Landing (ซ่อนหัวเว็บ/ท้ายเว็บ)
                    <span className="block text-[11px] text-slate-500">สำหรับหน้าแคมเปญ/โฆษณา ให้ลูกค้าโฟกัสที่โปร · ไม่ขึ้นเมนูก็เข้าได้ด้วยลิงก์</span>
                  </span>
                </label>
              )}
            </div>

            {/* 📝 บทความ: รูปปก · สรุป · แท็ก · ผู้เขียน (การ์ดในหน้า /blog + แชร์โซเชียล) */}
            {editType === "post" && (
              <div className="rounded-lg bg-amber-50/60 border border-amber-200 p-3 space-y-3">
                <p className="text-xs font-medium text-amber-900">📝 ข้อมูลบทความ (การ์ดในหน้า /blog · รูปตอนแชร์)</p>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
                  <ImageUploadField label="รูปปก" hint="แนะนำแนวนอน 1200×630" value={seo.cover || null} onChange={(k) => setSeo({ ...seo, cover: k ?? "" })} height={110} />
                  <div className="space-y-3">
                    <div>
                      <label className={labelCls}>สรุปสั้น (โชว์ใต้หัวข้อในการ์ด · ว่าง = ใช้คำอธิบาย SEO)</label>
                      <textarea className={inputCls} rows={2} maxLength={400} value={seo.excerpt} onChange={(e) => setSeo({ ...seo, excerpt: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>สรุปสั้น (อังกฤษ)</label>
                      <textarea className={inputCls} rows={2} maxLength={400} value={seo.excerpt_en} onChange={(e) => setSeo({ ...seo, excerpt_en: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>แท็ก (คั่นด้วย , · ลูกค้ากดดูบทความแท็กเดียวกันได้)</label>
                    <input className={inputCls} value={seo.tags.join(", ")} onChange={(e) => setSeo({ ...seo, tags: e.target.value.split(",").map((t) => t.trimStart()).slice(0, 10) })} placeholder="วิธีดูแลหนัง, ไอเดียของขวัญ" />
                  </div>
                  <div>
                    <label className={labelCls}>ผู้เขียน (ไม่ใส่ก็ได้)</label>
                    <input className={inputCls} value={seo.author} maxLength={60} onChange={(e) => setSeo({ ...seo, author: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            {/* 🧭 ศูนย์ช่วยเหลือ: อยู่ในกลุ่ม = เว็บวาดเมนูซ้าย (หน้าอื่นในกลุ่ม) + เนื้อหาขวา · ไม่ขึ้นเมนูหลักอัตโนมัติ */}
            {editType === "static" && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-700">🧭 ศูนย์ช่วยเหลือ</p>
              <p className="text-[11px] text-slate-500 mt-0.5">ใส่กลุ่ม = หน้านี้โชว์แบบเมนูซ้าย (หน้าอื่นในกลุ่มเดียวกัน) + เนื้อหาขวา และไม่ขึ้นเมนูหลักเอง · ท้ายเว็บใช้คอลัมน์ “ศูนย์ช่วยเหลือ (อัตโนมัติ)” ดึงทั้งกลุ่ม</p>
              <div className="grid gap-3 sm:grid-cols-2 mt-2">
                <div>
                  <label className={labelCls}>กลุ่ม (ไทย) — ว่าง = หน้าธรรมดา</label>
                  <input className={inputCls} list="help-groups" value={seo.help} maxLength={40} onChange={(e) => setSeo({ ...seo, help: e.target.value })} placeholder="เช่น ข้อกฎหมาย · ช่วยเหลือ" />
                  <datalist id="help-groups">
                    {[...new Set(pages.map((p) => p.help).filter(Boolean))].map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className={labelCls}>กลุ่ม (อังกฤษ)</label>
                  <input className={inputCls} value={seo.help_en} maxLength={40} disabled={!seo.help.trim()} onChange={(e) => setSeo({ ...seo, help_en: e.target.value })} placeholder="เช่น Legal · Support" />
                </div>
              </div>
            </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>ชื่อหน้าใน Google (SEO title)</label>
                <input className={inputCls} value={seo.title} onChange={(e) => setSeo({ ...seo, title: e.target.value })} placeholder={editTitle} />
              </div>
              <div>
                <label className={labelCls}>คำอธิบายใน Google (SEO description)</label>
                <input className={inputCls} value={seo.description} onChange={(e) => setSeo({ ...seo, description: e.target.value })} placeholder="สรุปเนื้อหาหน้านี้สั้น ๆ" />
              </div>
              <div>
                <label className={labelCls}>SEO title (อังกฤษ)</label>
                <input className={inputCls} value={seo.title_en} onChange={(e) => setSeo({ ...seo, title_en: e.target.value })} placeholder={seo.name_en || "English title"} />
              </div>
              <div>
                <label className={labelCls}>SEO description (อังกฤษ)</label>
                <input className={inputCls} value={seo.description_en} onChange={(e) => setSeo({ ...seo, description_en: e.target.value })} placeholder="Short English summary" />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">ชื่อหน้า / กลุ่ม / SEO บันทึกพร้อมปุ่ม “บันทึกร่าง” หรือ “เผยแพร่”</p>
          </fieldset>
        )}

        <WebsiteBuilder
          blocks={dp.blocks}
          onChange={dp.apply}
          types={types}
          ctx={ctx}
          previewSrc={previewSrc}
          iframeRef={iframeRef}
          selection={selection}
          onSelect={setSelection}
          previewVersion={dp.previewVersion}
          toolbar={{
            leading: (
              <>
                <button
                  onClick={async () => {
                    if ((dp.dirty || metaDirty) && !(await askLeaveUnsaved())) return;
                    setEditId(null);
                  }}
                  className="text-xs text-slate-500 hover:text-blue-600 mr-1"
                  title="กลับไปรายการหน้าทั้งหมด"
                >
                  ← หน้าทั้งหมด
                </button>
                <span className="text-sm font-medium text-slate-800 truncate max-w-[180px]" title={`/${editSlug}`}>{editTitle}</span>
                <button onClick={() => setShowSeo((v) => !v)} className={`h-7 px-2 rounded-lg border text-[11px] ${showSeo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`} title="ชื่อหน้า 2 ภาษา · กลุ่มศูนย์ช่วยเหลือ · SEO">
                  ⚙ ตั้งค่าหน้า
                </button>
                {seo.help && <span className="text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200" title="อยู่ในศูนย์ช่วยเหลือ">🧭 {seo.help}</span>}
              </>
            ),
            ...dp.toolbar,
            dirty: unpublished,
            statusNote: `${dp.blocks.length} Section`,
            saving: dp.busy === "draft",
            issues,
            changes: summarizeChanges(dp.blocks, dp.published, types),
            onHistory: tabAcc.full ? () => setShowVersions(true) : undefined,
            publishLabel: "เผยแพร่หน้านี้",
            // 👷 เผยแพร่เองไม่ได้ → บันทึกร่างแล้วส่งให้หัวหน้าตรวจ
            ...(tabAcc.canPublish ? {} : { publishLabel: tabAcc.reviewing ? "กำลังส่ง…" : "ส่งให้หัวหน้าตรวจ", onPublish: () => void tabAcc.requestReview(dp.saveDraft, editTitle || editSlug) }),
          }}
        />
        <PublishCheckDialog
          open={dp.checkOpen}
          onClose={dp.closeCheck}
          onConfirm={() => void dp.publish()}
          issues={issues}
          what={` "${editTitle || "หน้านี้"}"`}
          busy={dp.busy === "publish"}
          onGoBlock={(id) => setSelection({ blockId: id })}
        />
        <VersionHistoryDrawer<Block>
          open={showVersions}
          onClose={() => setShowVersions(false)}
          what={` "${editTitle || "หน้านี้"}"`}
          listUrl={`/api/website/pages/versions?pageId=${encodeURIComponent(editId)}`}
          restoreUrl="/api/website/pages/versions"
          restoreBody={(versionNo) => ({ pageId: editId, versionNo })}
          onRestored={dp.restored}
        />
      </div>
    );
  }

  /* ── รายการหน้า ── */
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-blue-50/60 border border-blue-200 px-4 py-2.5">
        <p className="text-sm text-slate-700">สร้างหน้าเพิ่มเองได้ เช่น โปรโมชัน · วิธีสั่งซื้อ · นโยบายจัดส่ง · เกี่ยวกับเรา</p>
        <p className="text-xs text-slate-500 mt-0.5">หน้าแรกจัดที่แท็บ &quot;🧱 หน้าแรก&quot; · หน้าที่สร้างจะขึ้นเป็นเมนูบนเว็บอัตโนมัติเมื่อเผยแพร่ (ยกเว้นหน้าในศูนย์ช่วยเหลือ — ใช้คอลัมน์ท้ายเว็บ “ศูนย์ช่วยเหลือ” แทน)</p>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm text-slate-500">{pages.length} หน้า</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void createHelpCenter()}
            disabled={creatingHelp}
            className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm hover:bg-indigo-100 disabled:opacity-50"
            title="สร้างหน้า Privacy / Terms / FAQ / ติดตามคำสั่งซื้อ / ติดต่อเรา / จัดส่ง-คืนสินค้า (ไทย+อังกฤษ) เป็นร่าง"
          >
            {creatingHelp ? "กำลังสร้าง…" : "🧭 สร้างชุดศูนย์ช่วยเหลือ"}
          </button>
          <button onClick={() => setShowNew((v) => !v)} className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            {showNew ? "ปิด" : "+ สร้างหน้าใหม่"}
          </button>
        </div>
      </div>

      {showNew && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
          <div className="sm:col-span-3 flex flex-wrap gap-1.5">
            {([["static", "📄 หน้าเว็บ", "เช่น โปรโมชัน · วิธีสั่งซื้อ · เกี่ยวกับเรา (ขึ้นเมนูอัตโนมัติ)"], ["post", "📝 บทความ (บล็อก)", "อยู่ที่ /blog · มีรูปปก/สรุป/แท็ก · ช่วย SEO ดึงคนจาก Google"]] as const).map(([k, l, h]) => (
              <button key={k} type="button" onClick={() => setNewType(k)} className={`text-left rounded-lg border px-3 py-2 ${newType === k ? "border-blue-500 bg-white" : "border-slate-200 bg-white/60 hover:border-slate-400"}`}>
                <span className="block text-sm font-medium text-slate-800">{l}</span>
                <span className="block text-[11px] text-slate-500">{h}</span>
              </button>
            ))}
          </div>
          <div>
            <label className={labelCls}>{newType === "post" ? "หัวข้อบทความ" : "ชื่อหน้า"}</label>
            <input className={inputCls} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={newType === "post" ? "เช่น 5 วิธีดูแลกระเป๋าหนังให้อยู่นาน" : "เช่น โปรโมชันเดือนนี้"} />
          </div>
          <div>
            <label className={labelCls}>ที่อยู่หน้า (ภาษาอังกฤษ)</label>
            <input className={inputCls} value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="promotion" />
          </div>
          <button onClick={() => void createPage()} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-black">สร้าง</button>
          {newSlug && <p className="sm:col-span-3 text-[11px] text-slate-500">หน้านี้จะอยู่ที่ /{newType === "post" ? "blog/" : ""}{newSlug.toLowerCase().replace(/[^a-z0-9-]/g, "")}</p>}
        </div>
      )}

      {!pages.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center">
          <p className="text-sm text-slate-400">ยังไม่มีหน้าที่สร้างเอง</p>
          <button onClick={() => setShowNew(true)} className="mt-3 text-sm text-blue-600 hover:underline">+ สร้างหน้าแรกของคุณ</button>
        </div>
      ) : (
        groupPages(pages).map((g) => (
        <div key={g.kind + (g.name || "")} className="space-y-2">
          {g.kind === "help" ? (
            <p className="pt-2 text-xs font-medium text-indigo-700">🧭 ศูนย์ช่วยเหลือ · {g.name} <span className="font-normal text-slate-400">— ลำดับนี้ = เมนูซ้ายบนเว็บ (กด ↑↓ ย้าย)</span></p>
          ) : g.kind === "posts" ? (
            <p className="pt-2 text-xs font-medium text-amber-800">📝 บทความ (บล็อก) <span className="font-normal text-slate-400">— อยู่ที่ /blog · ใหม่สุดก่อน · ไม่ขึ้นเมนูเอง (ใส่ลิงก์ /blog ในเมนูได้)</span></p>
          ) : (
            <p className="pt-2 text-xs font-medium text-slate-500">📄 หน้าทั่วไป</p>
          )}
        <ul className="space-y-2">
          {g.pages.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
              {g.kind === "help" && tabAcc.full ? (
                <span className="flex flex-col -my-1">
                  <button type="button" disabled={i === 0} onClick={() => void movePage(g.pages, i, -1)} className="text-[10px] leading-none text-slate-400 hover:text-blue-600 disabled:opacity-20" title="ย้ายขึ้น">▲</button>
                  <button type="button" disabled={i === g.pages.length - 1} onClick={() => void movePage(g.pages, i, 1)} className="text-[10px] leading-none text-slate-400 hover:text-blue-600 disabled:opacity-20" title="ย้ายลง">▼</button>
                </span>
              ) : (
                <span className="text-lg">{p.pageType === "post" ? "📝" : "📄"}</span>
              )}
              <button onClick={() => void openPage(p.id)} className="flex-1 min-w-0 text-left">
                <span className="block text-sm font-medium text-slate-800 truncate">{p.title}</span>
                <span className="block text-[11px] text-slate-400">
                  /{p.pageType === "post" ? "blog/" : ""}{p.slug} · {p.blocks} Section
                  {p.hasDraft && " · มีร่าง"}
                </span>
              </button>
              {p.publishAt && new Date(p.publishAt).getTime() > Date.now() && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200" title="เว็บจะโชว์เมื่อถึงเวลานี้ (ต้องกดเผยแพร่ไว้แล้ว)">⏰ {thWhen(p.publishAt)}</span>
              )}
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${p.status === "published" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
                {p.status === "published" ? "เผยแพร่แล้ว" : "ร่าง"}
              </span>
              {siteUrl && p.status === "published" && (
                <a href={`${siteUrl}/${p.pageType === "post" ? "blog/" : ""}${p.slug}`} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-blue-600" title="เปิดหน้าจริง">↗</a>
              )}
              <button onClick={() => void openPage(p.id)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">แก้ไข</button>
              {tabAcc.full && <button onClick={() => void removePage(p)} className="text-xs text-red-500 hover:underline">ลบ</button>}
            </li>
          ))}
        </ul>
        </div>
        ))
      )}
    </div>
  );
}
