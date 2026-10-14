"use client";

/**
 * WebsiteListingsPanel — แท็บ "สินค้าบนเว็บ" ของหน้าจัดการเว็บร้าน (/website/<slug>)
 * --------------------------------------------------------------------------
 * - ตัวกรองบน: ทั้งหมด · ขึ้นเว็บ · ซ่อนอยู่ · แนะนำ · ⚠️ ต้องแก้ (นับจากกฎกลาง lib/website-listing-health)
 * - ค้นหา (ชื่อ/รหัส) + เลือกหมวด + สลับมุมมอง รายการ/การ์ด (จำต่อคนด้วย useViewPref)
 * - แถว: ชื่อ/ราคา/รูป/จุดสี "ที่ลูกค้าเห็นจริง" (API ส่ง display) · ป้ายรูปเปิด · ป้ายเตือนข้อมูลไม่ครบ
 * - ติ๊กหลายรายการ → แถบล่าง (BulkActionBar) ขึ้นเว็บ/ซ่อน/แนะนำ · ลาก ⠿ เรียงลำดับบนเว็บ (useDragReorder)
 * - ✏️ แก้ด่วน (ชื่อ ราคา หน่วย หมวด ป้าย ฯลฯ) · 🖼 รูป สี และรูปเปิด = เปิดแท็บ 🛍 ของ Parent SKU ตัวจริงใน drawer (ไม่ทำฟอร์มซ้ำ)
 * - 📦 เปิด Parent SKU = MasterRecordDrawer ตัวจริง (ทุกแท็บ · ◀ ▶ เลื่อนตามรายการที่เห็น)
 * ของกลาง: BulkActionBar · useDragReorder/DragHandle · CopyButton · Drawer/ConfirmDialog · footer-save · ParentWebListings
 * ข้อมูล: /api/website/listings (guardApi products.view/edit + audit) — โหลดที่ manager-client แล้วส่งเข้ามา
 */
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Drawer, ConfirmDialog } from "@/components/modal";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { CopyButton } from "@/components/copy-button";
import { FooterSaveProvider, FooterSaveButton, useFooterSaveHost } from "@/components/footer-save";
import { useViewPref } from "@/lib/use-view-pref";
import { listingIssues, type ListingIssue } from "@/lib/website-listing-health";

const ParentWebListings = dynamic(() => import("@/components/parent-web-listings").then((m) => m.ParentWebListings), { ssr: false });
// ⚠️ ต้อง dynamic — master-crud import relation-multi อยู่ (import ตรงจะวนกัน) ดู memory unify_drawer
const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

export type ShopInfo = { id: string; name: string; slug: string; isDefault: boolean; siteUrl?: string | null };

/** ค่าที่เว็บจะใช้อัตโนมัติถ้าไม่กรอกทับ (มาจากการจับคู่ฟิลด์) */
type Mapped = {
  name: string;
  price: number;
  description: string;
  unit: string;
  category: string;
  images: string[];
  options: { label: string; items: { id: string; label: string }[] } | null;
} | null;
type OptionItem = { id: string; label: string; swatch?: string | null };
type WebOptions = { label: string; items: OptionItem[] } | null;

/** ค่าที่ "ลูกค้าเห็นจริง" (รวมที่กรอกทับ) — API คำนวณด้วย resolveProduct ตัวเดียวกับเว็บ */
type Display = {
  name: string;
  price: number;
  priceVaries: boolean;
  imageKey: string | null;
  imageCount: number;
  colors: { label: string; swatch: string | null; hasImage: boolean }[];
  hero: boolean;
  productUrl: string | null;
} | null;

export type Listing = {
  display: Display;
  mapped: Mapped;
  id: string;
  parentId: string;
  code: string;
  erpName: string;
  erpPrice: number;
  erpDescription: string;
  erpImageKey: string | null;
  published: boolean;
  featured: boolean;
  sortOrder: number;
  webName: string;
  webPrice: number | null;
  webDescription: string;
  webImages: string[];
  webUnit: string;
  webCategory: string;
  /** 📂 หลายหมวด — null = ยังไม่เคยจัด (ใช้หมวดแบบเดิม) */
  webCategories: string[] | null;
  /** หมวดที่เว็บใช้จริงตอนนี้ */
  categories: string[];
  webBadge: string;
  webStockStatus: string;
  webSwatch: string;
  webOptions: WebOptions;
};

type SearchHit = { id: string; code: string; name: string; price: number; imageKey: string | null };
/** หมวดของร้าน — มาจาก API (ตั้งได้เองในแท็บ ⚙️ จับคู่ฟิลด์) */
export type CategoryDef = { key: string; label: string; icon: string };

const STOCKS = [
  { value: "in", label: "พร้อมส่ง" },
  { value: "low", label: "เหลือน้อย" },
  { value: "preorder", label: "สั่งจอง" },
];
type Filter = "all" | "pub" | "hide" | "feat" | "fix";
const VIEWS = ["list", "grid"] as const;

const baht = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH")}`;
const keyUrl = (key: string, w = 120) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
/** "1.5 มม., 2.0 มม." → [{id,label}] (id สร้างอัตโนมัติ) */
const parseItems = (raw: string): OptionItem[] =>
  raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 24).map((label, i) => ({ id: `opt-${i + 1}`, label }));
const itemsToText = (o: WebOptions) => (o?.items ?? []).map((i) => i.label).join(", ");

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";

/** ชื่อ/ราคาที่โชว์ในรายการ = ที่ลูกค้าเห็นจริง (เดิมโชว์ชื่อดิบ ERP + ราคา Parent ซึ่งเป็น ฿0) */
const shownName = (l: Listing) => l.display?.name || l.webName || l.mapped?.name || l.erpName;
const shownPrice = (l: Listing) => l.display?.price ?? l.webPrice ?? l.mapped?.price ?? l.erpPrice;
const issuesOf = (l: Listing): ListingIssue[] =>
  l.display
    ? listingIssues({ price: l.display.price, imageCount: l.display.imageCount, categories: l.categories ?? [], colors: l.display.colors })
    : [];

function ColorDots({ colors, max = 5 }: { colors: { label: string; swatch: string | null }[]; max?: number }) {
  if (!colors.length) return <span className="text-[11px] text-slate-300">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5" title={colors.map((c) => c.label).join(", ")}>
      {colors.slice(0, max).map((c, i) => (
        <span
          key={`${c.label}-${i}`}
          className={`inline-block w-3 h-3 rounded-full ${c.swatch ? "ring-1 ring-black/10" : "border border-dashed border-slate-400"}`}
          style={c.swatch ? { background: c.swatch, backgroundSize: "cover" } : undefined}
        />
      ))}
      {colors.length > max && <span className="text-[11px] text-slate-400 ml-0.5">+{colors.length - max}</span>}
    </span>
  );
}

function Thumb({ l, size = 48 }: { l: Listing; size?: number }) {
  const key = l.display?.imageKey ?? l.erpImageKey;
  const n = l.display?.imageCount ?? 0;
  return (
    <div className="relative shrink-0 rounded-lg overflow-hidden bg-slate-100" style={{ width: size, height: size, ...(key ? {} : l.webSwatch ? { background: l.webSwatch } : {}) }}>
      {key && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={keyUrl(key, size * 2)} alt="" className="w-full h-full object-cover" loading="lazy" />
      )}
      {n > 0 && <span className="absolute bottom-0.5 right-0.5 rounded bg-black/55 px-1 text-[10px] leading-4 text-white">{n}</span>}
    </div>
  );
}

export function WebsiteListingsPanel({
  shop,
  listings,
  setListings,
  categories,
  loading,
  reload,
}: {
  shop: ShopInfo;
  listings: Listing[];
  setListings: Dispatch<SetStateAction<Listing[]>>;
  categories: CategoryDef[];
  loading: boolean;
  reload: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  // ?filter=fix (จากป๊อปตรวจก่อนเผยแพร่ → "ไปแก้") = เปิดตัวกรอง "⚠️ ต้องแก้"
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("filter") === "fix") setFilter("fix" as Filter);
  }, []);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const { view, setView, saveDefault } = useViewPref("website_listings_view", VIEWS, "list");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [removing, setRemoving] = useState<Listing | null>(null);
  // 🖼 รูป สี และรูปเปิด → แท็บ 🛍 ของ Parent SKU ตัวจริงใน drawer · ปุ่มบันทึกอยู่แถบล่าง (footer-save)
  const [media, setMedia] = useState<Listing | null>(null);
  const mediaSave = useFooterSaveHost();
  // 📦 เปิด Parent SKU — drawer ตัวจริงของหน้า Parent SKU (ทุกแท็บ) · ◀ ▶ เลื่อนตามรายการที่เห็นอยู่
  const [parentOpen, setParentOpen] = useState<string | null>(null);

  // แผงเพิ่มสินค้า
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const patch = (parentId: string, p: Partial<Listing>) =>
    setListings((ls) => ls.map((l) => (l.parentId === parentId ? { ...l, ...p } : l)));

  const post = async (body: Record<string, unknown>) => {
    const r = await apiFetch("/api/website/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
  };

  const issuesById = useMemo(() => new Map(listings.map((l) => [l.parentId, issuesOf(l)])), [listings]);
  const counts = useMemo(
    () => ({
      all: listings.length,
      pub: listings.filter((l) => l.published).length,
      hide: listings.filter((l) => !l.published).length,
      feat: listings.filter((l) => l.featured).length,
      fix: listings.filter((l) => (issuesById.get(l.parentId) ?? []).length > 0).length,
    }),
    [listings, issuesById]
  );
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return listings.filter((l) => {
      if (filter === "pub" && !l.published) return false;
      if (filter === "hide" && l.published) return false;
      if (filter === "feat" && !l.featured) return false;
      if (filter === "fix" && !(issuesById.get(l.parentId) ?? []).length) return false;
      if (cat === "__none" ? (l.categories ?? []).length > 0 : cat && !(l.categories ?? []).includes(cat)) return false;
      if (term && !`${shownName(l)} ${l.erpName} ${l.code}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [listings, filter, q, cat, issuesById]);
  const filtered = filter !== "all" || !!q.trim() || !!cat;
  const catLabel = (k: string) => categories.find((c) => c.key === k)?.label ?? k;

  // ⠿ ลากเรียงลำดับ (เฉพาะตอนเห็นครบทุกตัว ไม่มีตัวกรอง — ลำดับจะได้ตรงกับเว็บ)
  const reorder = async (from: number, to: number) => {
    const next = moveItem(listings, from, to).map((l, i) => ({ ...l, sortOrder: i }));
    setListings(next);
    try {
      const j = await post({ shopId: shop.id, action: "reorder", order: next.map((l) => l.parentId) });
      if (!j.ok) throw new Error(j.error);
    } catch {
      toast.error("เรียงลำดับไม่สำเร็จ — โหลดลำดับเดิมคืน");
      await reload();
    }
  };
  const drag = useDragReorder((from, to) => void reorder(from, to));

  const toggleSel = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allShownSelected = shown.length > 0 && shown.every((l) => sel.has(l.parentId));
  const toggleAllShown = () =>
    setSel((s) => {
      const n = new Set(s);
      if (allShownSelected) shown.forEach((l) => n.delete(l.parentId));
      else shown.forEach((l) => n.add(l.parentId));
      return n;
    });

  const bulk = async (p: { isPublished?: boolean; featured?: boolean }, msg: string) => {
    const ids = [...sel];
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      const j = await post({ shopId: shop.id, action: "bulk", parentIds: ids, patch: p });
      if (!j.ok) throw new Error(j.error);
      setListings((ls) =>
        ls.map((l) =>
          sel.has(l.parentId)
            ? { ...l, ...(p.isPublished !== undefined ? { published: p.isPublished } : {}), ...(p.featured !== undefined ? { featured: p.featured } : {}) }
            : l
        )
      );
      toast.success(`${msg} ${ids.length} รายการแล้ว`);
      setSel(new Set());
    } catch {
      toast.error("ทำรายการไม่สำเร็จ");
    } finally {
      setBulkBusy(false);
    }
  };

  const doSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const r = await apiFetch(`/api/website/listings?shop=${encodeURIComponent(shop.slug)}&search=${encodeURIComponent(search.trim())}`);
      const j = await r.json();
      setResults(j.results ?? []);
      if (!(j.results ?? []).length) toast.info("ไม่พบสินค้าที่ยังไม่อยู่ในร้านนี้");
    } catch {
      toast.error("ค้นหาไม่สำเร็จ");
    } finally {
      setSearching(false);
    }
  };

  const addProduct = async (hit: SearchHit) => {
    setSaving(hit.id);
    try {
      const j = await post({ shopId: shop.id, parentId: hit.id, action: "add" });
      if (j.ok) {
        toast.success(`เพิ่ม "${hit.name}" แล้ว (ยังไม่เผยแพร่)`);
        setResults((rs) => rs.filter((r) => r.id !== hit.id));
        await reload();
      } else toast.error(j.error ?? "เพิ่มไม่สำเร็จ");
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(null);
    }
  };

  const removeProduct = async (l: Listing) => {
    setSaving(l.parentId);
    try {
      const j = await post({ shopId: shop.id, parentId: l.parentId, action: "remove" });
      if (j.ok) {
        toast.success("เอาออกแล้ว");
        setListings((ls) => ls.filter((x) => x.parentId !== l.parentId));
        setOpen(null);
      } else toast.error(j.error ?? "เอาออกไม่สำเร็จ");
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(null);
      setRemoving(null);
    }
  };

  const save = async (l: Listing) => {
    setSaving(l.parentId);
    try {
      const j = await post({
        shopId: shop.id,
        parentId: l.parentId,
        patch: {
          isPublished: l.published,
          featured: l.featured,
          sortOrder: l.sortOrder,
          webName: l.webName,
          webPrice: l.webPrice,
          webDescription: l.webDescription,
          webUnit: l.webUnit,
          webCategory: l.webCategory,
          webCategories: l.webCategories,
          webBadge: l.webBadge,
          webStockStatus: l.webStockStatus || "in",
          webSwatch: l.webSwatch,
          webOptions: l.webOptions,
        },
      });
      if (j.ok) {
        toast.success("บันทึกแล้ว");
        await reload(); // ชื่อ/ราคาที่โชว์ในรายการ = ค่าจริงหลังบันทึก
      } else toast.error(j.error ?? "บันทึกไม่สำเร็จ");
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(null);
    }
  };

  const togglePublish = async (l: Listing) => {
    const next = !l.published;
    patch(l.parentId, { published: next });
    const j = await post({ shopId: shop.id, parentId: l.parentId, patch: { isPublished: next } }).catch(() => ({ ok: false }));
    if (j.ok) toast.success(next ? "ขึ้นเว็บแล้ว" : "ซ่อนจากเว็บแล้ว");
    else {
      patch(l.parentId, { published: !next });
      toast.error("เปลี่ยนสถานะไม่สำเร็จ");
    }
  };
  const toggleFeatured = async (l: Listing) => {
    const next = !l.featured;
    patch(l.parentId, { featured: next });
    const j = await post({ shopId: shop.id, parentId: l.parentId, patch: { featured: next } }).catch(() => ({ ok: false }));
    if (!j.ok) {
      patch(l.parentId, { featured: !next });
      toast.error("บันทึกไม่สำเร็จ");
    }
  };

  const closeMedia = () => {
    setMedia(null);
    void reload(); // รูป/สี/รูปเปิด อาจเปลี่ยน → ดึงค่าจริงใหม่
  };

  const FILTERS: { k: Filter; label: string; warn?: boolean }[] = [
    { k: "all", label: "ทั้งหมด" },
    { k: "pub", label: "ขึ้นเว็บ" },
    { k: "hide", label: "ซ่อนอยู่" },
    { k: "feat", label: "⭐ แนะนำ" },
    { k: "fix", label: "⚠️ ต้องแก้", warn: true },
  ];

  const priceText = (l: Listing) => (shownPrice(l) > 0 ? `${l.display?.priceVaries ? "เริ่ม " : ""}${baht(shownPrice(l))}` : "—");

  return (
    <div>
      {/* แถบสรุป + ปุ่มเพิ่ม */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const on = filter === f.k;
            const n = counts[f.k];
            return (
              <button
                key={f.k}
                type="button"
                onClick={() => setFilter(f.k)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                  on
                    ? "border-slate-900 bg-slate-900 text-white"
                    : f.warn && n > 0
                      ? "border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                }`}
              >
                {f.label} <span className="font-semibold">{n}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          {showAdd ? "ปิดการเพิ่ม" : "+ เพิ่มสินค้าเข้าเว็บ"}
        </button>
      </div>

      {/* แผงเพิ่มสินค้า */}
      {showAdd && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <p className="text-xs text-slate-500 mb-2">ค้นหาสินค้าจาก ERP (รหัส หรือ ชื่อ) แล้วกดเพิ่มเข้าเว็บร้านนี้</p>
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void doSearch()}
              placeholder="เช่น หนัง, ซิป, IG001"
              className={inputCls}
            />
            <button
              onClick={() => void doSearch()}
              disabled={searching}
              className="shrink-0 px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm hover:bg-black disabled:opacity-50"
            >
              {searching ? "ค้นหา…" : "ค้นหา"}
            </button>
          </div>
          {results.length > 0 && (
            <ul className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
              {results.map((r) => (
                <li key={r.id} className="flex items-center gap-3 bg-white rounded-lg border border-slate-200 px-3 py-2">
                  {r.imageKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={keyUrl(r.imageKey, 80)} alt="" className="w-9 h-9 rounded object-cover bg-slate-100" />
                  ) : (
                    <div className="w-9 h-9 rounded bg-slate-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 truncate">{r.name}</p>
                    <p className="text-xs text-slate-400">{r.code}</p>
                  </div>
                  <button
                    onClick={() => void addProduct(r)}
                    disabled={saving === r.id}
                    className="shrink-0 px-3 py-1 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving === r.id ? "…" : "+ เพิ่ม"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ค้นหา + หมวด + มุมมอง */}
      {listings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ หรือ รหัส เช่น BBP10" className={`${inputCls} flex-1 min-w-[180px]`} />
          <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${inputCls} w-auto`}>
            <option value="">ทุกหมวด</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
            <option value="__none">ไม่อยู่หมวดไหน</option>
          </select>
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setView(v);
                  void saveDefault(v);
                }}
                title={v === "list" ? "มุมมองรายการ" : "มุมมองการ์ด (แบบหน้าเว็บ)"}
                className={`px-3 py-1.5 text-xs ${view === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {v === "list" ? "☰ รายการ" : "▦ การ์ด"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* รายการสินค้าบนเว็บ */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !listings.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center">
          <p className="text-slate-400 text-sm">ยังไม่มีสินค้าบนเว็บร้านนี้</p>
          <button onClick={() => setShowAdd(true)} className="mt-3 text-sm text-blue-600 hover:underline">
            + เพิ่มสินค้าเข้าเว็บ
          </button>
        </div>
      ) : !shown.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center">
          <p className="text-slate-400 text-sm">ไม่พบสินค้า ลองเปลี่ยนคำค้นหรือตัวกรอง</p>
          <button
            onClick={() => {
              setFilter("all");
              setQ("");
              setCat("");
            }}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            ล้างตัวกรอง
          </button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {shown.map((l) => {
            const key = l.display?.imageKey ?? l.erpImageKey;
            const iss = issuesById.get(l.parentId) ?? [];
            return (
              <button
                key={l.parentId}
                type="button"
                onClick={() => {
                  setView("list");
                  setOpen(l.parentId);
                }}
                className={`text-left rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-slate-400 transition ${l.published ? "" : "opacity-60"}`}
              >
                <div className="relative aspect-square bg-slate-100" style={!key && l.webSwatch ? { background: l.webSwatch } : undefined}>
                  {key && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={keyUrl(key, 360)} alt="" className="w-full h-full object-cover" loading="lazy" />
                  )}
                  <div className="absolute top-1.5 left-1.5 flex flex-wrap gap-1">
                    {!l.published && <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] text-white">ซ่อนอยู่</span>}
                    {l.display?.hero && <span className="rounded-full bg-violet-600/90 px-2 py-0.5 text-[10px] text-white">🎬 รูปเปิด</span>}
                    {l.featured && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] text-amber-950">⭐</span>}
                  </div>
                  {iss.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800" title={iss.map((x) => x.label).join(" · ")}>
                      ⚠️ {iss.length}
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-xs text-slate-800 line-clamp-2 min-h-[2rem]">{shownName(l)}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-1">
                    <span className="text-sm font-semibold text-slate-900">{priceText(l)}</span>
                    <ColorDots colors={l.display?.colors ?? []} max={4} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {/* หัวตาราง */}
          <div className="hidden md:flex items-center gap-3 px-3 py-2 border-b border-slate-100 bg-slate-50/70 text-[11px] text-slate-500">
            <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown} className="w-4 h-4 accent-blue-600" aria-label="เลือกทั้งหมดที่เห็น" />
            <span className="w-3" />
            <span className="w-12" />
            <span className="flex-1">สินค้า (ชื่อที่ลูกค้าเห็นจริง)</span>
            <span className="w-24">สี</span>
            <span className="w-24 text-right">ราคา</span>
            <span className="w-28 text-center">ขึ้นเว็บ / แนะนำ</span>
            <span className="w-16" />
          </div>
          <ul>
            {shown.map((l) => {
              const isOpen = open === l.parentId;
              const iss = issuesById.get(l.parentId) ?? [];
              const idx = listings.indexOf(l);
              return (
                <li
                  key={l.parentId}
                  {...(!filtered ? drag.rowProps(idx) : {})}
                  className={`border-b border-slate-100 last:border-b-0 ${!filtered ? drag.rowCls(idx) : ""}`}
                >
                  <div className={`flex flex-wrap md:flex-nowrap items-center gap-3 px-3 py-2.5 hover:bg-slate-50/70 ${l.published ? "" : "bg-slate-50/60"}`}>
                    <input
                      type="checkbox"
                      checked={sel.has(l.parentId)}
                      onChange={() => toggleSel(l.parentId)}
                      className="w-4 h-4 accent-blue-600"
                      aria-label={`เลือก ${l.code}`}
                    />
                    {filtered ? (
                      <span className="w-3 text-slate-200 select-none" title="ล้างตัวกรองก่อน จึงจะลากเรียงลำดับได้">⠿</span>
                    ) : (
                      <DragHandle {...drag.handleProps(idx)} title="ลากเพื่อเรียงลำดับบนเว็บ" className="w-3" />
                    )}
                    <div className={l.published ? "" : "opacity-50"}>
                      <Thumb l={l} />
                    </div>

                    {/* มือถือ: ชื่อเต็มบรรทัดแรก ราคา/ปุ่มขึ้นบรรทัดสอง · จอคอม: แถวเดียว */}
                    <div className="flex-1 min-w-0 basis-[calc(100%-7.5rem)] md:basis-0">
                      <p className={`text-sm font-medium truncate ${l.published ? "text-slate-800" : "text-slate-500"}`} title={shownName(l)}>
                        {shownName(l)}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {l.code}
                        {(l.categories ?? []).length > 0 ? ` · ${l.categories.map(catLabel).join(", ")}` : ""}
                        {l.webBadge ? ` · ป้าย "${l.webBadge}"` : ""}
                      </p>
                      {(l.display?.hero || iss.length > 0) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {l.display?.hero && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700">🎬 รูปเปิด</span>}
                          {iss.map((x) => (
                            <span key={x.key} title={x.detail} className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] text-amber-800">
                              ⚠️ {x.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <span className="w-24 hidden md:block">
                      <ColorDots colors={l.display?.colors ?? []} />
                    </span>
                    <span className={`ml-auto md:ml-0 md:w-24 text-right text-sm font-semibold ${shownPrice(l) > 0 ? "text-slate-800" : "text-rose-500"}`}>{priceText(l)}</span>

                    <span className="w-28 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => void togglePublish(l)}
                        title={l.published ? "กำลังแสดงบนเว็บ — กดเพื่อซ่อน" : "ซ่อนอยู่ — กดเพื่อขึ้นเว็บ"}
                        className={`shrink-0 w-10 h-[22px] rounded-full transition relative ${l.published ? "bg-emerald-500" : "bg-slate-300"}`}
                      >
                        <span className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full transition-all ${l.published ? "left-5" : "left-0.5"}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleFeatured(l)}
                        title={l.featured ? "สินค้าแนะนำ — กดเพื่อยกเลิก" : "ตั้งเป็นสินค้าแนะนำ"}
                        className={`text-lg leading-none ${l.featured ? "text-amber-400" : "text-slate-300 hover:text-amber-300"}`}
                      >
                        ★
                      </button>
                    </span>

                    <button
                      onClick={() => setOpen(isOpen ? null : l.parentId)}
                      className={`w-16 shrink-0 px-2 py-1.5 rounded-lg border text-xs ${isOpen ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                    >
                      {isOpen ? "ปิด" : "✏️ แก้"}
                    </button>
                  </div>

                  {/* แผงแก้ไขด่วน */}
                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <button
                          type="button"
                          onClick={() => setMedia(l)}
                          className="px-3 py-1.5 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 text-xs font-medium hover:bg-violet-100"
                        >
                          🖼 รูป สี และรูปเปิด
                        </button>
                        <button
                          type="button"
                          onClick={() => setParentOpen(l.parentId)}
                          title="เปิดข้อมูลสินค้าเต็ม (หน้าต่างเดียวกับหน้า Parent SKU — ทุกแท็บ)"
                          className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:border-slate-500"
                        >
                          📦 เปิด Parent SKU
                        </button>
                        {l.display?.productUrl && (
                          <>
                            <a href={l.display.productUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:border-slate-400">
                              ดูหน้าเว็บ ↗
                            </a>
                            <CopyButton value={l.display.productUrl} label="คัดลอกลิงก์" title="คัดลอกลิงก์หน้าสินค้านี้" className="!py-1.5" />
                          </>
                        )}
                        {!l.published && <span className="text-[11px] text-slate-400">ซ่อนอยู่ — ลูกค้าเปิดหน้านี้ไม่ได้จนกว่าจะขึ้นเว็บ</span>}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="sm:col-span-2">
                          <label className={labelCls}>ชื่อบนเว็บ (เว้นว่าง = ใช้อัตโนมัติ: {l.mapped?.name || l.erpName})</label>
                          <input value={l.webName} onChange={(e) => patch(l.parentId, { webName: e.target.value })} placeholder={l.mapped?.name || l.erpName} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>ราคาบนเว็บ (บาท) — อัตโนมัติ: {baht(l.mapped?.price ?? l.erpPrice)}</label>
                          <input
                            type="number"
                            value={l.webPrice ?? ""}
                            onChange={(e) => patch(l.parentId, { webPrice: e.target.value === "" ? null : Number(e.target.value) })}
                            placeholder={String(l.mapped?.price ?? l.erpPrice)}
                            className={inputCls}
                          />
                        </div>

                        <div className="sm:col-span-2 lg:col-span-3">
                          <label className={labelCls}>หมวดบนเว็บ (เลือกได้หลายหมวด · ตัวแรก = หมวดหลัก)</label>
                          <div className="flex flex-wrap gap-1.5">
                            {categories.map((c) => {
                              const cur = l.webCategories ?? l.categories ?? [];
                              const on = cur.includes(c.key);
                              return (
                                <button
                                  key={c.key}
                                  type="button"
                                  onClick={() => {
                                    const next = on ? cur.filter((k) => k !== c.key) : [...cur, c.key];
                                    patch(l.parentId, { webCategories: next, categories: next });
                                  }}
                                  className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-600 hover:border-slate-500"}`}
                                >
                                  {on && cur[0] === c.key ? "★ " : ""}
                                  {c.icon ? `${c.icon} ` : ""}
                                  {c.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <label className={labelCls}>หน่วยขาย{l.mapped?.unit ? ` (อัตโนมัติ: ${l.mapped.unit})` : ""}</label>
                          <input value={l.webUnit} onChange={(e) => patch(l.parentId, { webUnit: e.target.value })} placeholder={l.mapped?.unit || "ชิ้น / ใบ / หลา"} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>สถานะสต๊อกบนเว็บ</label>
                          <select value={l.webStockStatus || "in"} onChange={(e) => patch(l.parentId, { webStockStatus: e.target.value })} className={inputCls}>
                            {STOCKS.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>ป้ายบนการ์ด</label>
                          <input value={l.webBadge} onChange={(e) => patch(l.parentId, { webBadge: e.target.value })} placeholder="ขายดี / ใหม่" className={inputCls} />
                        </div>

                        <div className="sm:col-span-2 lg:col-span-3">
                          <label className={labelCls}>คำอธิบายบนเว็บ (เว้นว่าง = ใช้อัตโนมัติ)</label>
                          <textarea
                            rows={2}
                            value={l.webDescription}
                            onChange={(e) => patch(l.parentId, { webDescription: e.target.value })}
                            placeholder={l.mapped?.description || l.erpDescription || "อธิบายสินค้าสำหรับลูกค้า"}
                            className={inputCls}
                          />
                        </div>

                        {/* ตัวเลือกกรอกเอง + สีตัวอย่าง — ใช้กับร้านวัสดุ (ร้านกระเป๋าใช้สีจาก SKU อัตโนมัติ) */}
                        <details className="sm:col-span-2 lg:col-span-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <summary className="cursor-pointer text-xs text-slate-500">ตั้งค่าเพิ่มเติม (ตัวเลือกกรอกเอง · สีตัวอย่างแทนรูป)</summary>
                          <div className="grid gap-3 sm:grid-cols-3 mt-2">
                            <div>
                              <label className={labelCls}>ชื่อชุดตัวเลือก</label>
                              <input
                                value={l.webOptions?.label ?? ""}
                                onChange={(e) => patch(l.parentId, { webOptions: { label: e.target.value, items: l.webOptions?.items ?? [] } })}
                                placeholder="ความหนา / สี"
                                className={inputCls}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={labelCls}>ตัวเลือก (คั่นด้วยจุลภาค · ว่าง = ใช้สีจาก SKU อัตโนมัติ)</label>
                              <input
                                defaultValue={itemsToText(l.webOptions)}
                                onBlur={(e) => patch(l.parentId, { webOptions: { label: l.webOptions?.label || "ตัวเลือก", items: parseItems(e.target.value) } })}
                                placeholder="1.5 มม., 2.0 มม., 3.0 มม."
                                className={inputCls}
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className={labelCls}>สีตัวอย่าง (ใช้แทนรูปจนกว่าจะมีรูปจริง)</label>
                              <div className="flex items-center gap-2">
                                <input value={l.webSwatch} onChange={(e) => patch(l.parentId, { webSwatch: e.target.value })} placeholder="#C89A5B หรือ linear-gradient(...)" className={inputCls} />
                                <span className="shrink-0 w-9 h-9 rounded-lg border border-slate-200" style={l.webSwatch ? { background: l.webSwatch } : { background: "#f1f5f9" }} />
                              </div>
                            </div>
                          </div>
                        </details>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-200">
                        <button onClick={() => setRemoving(l)} className="text-xs text-red-500 hover:text-red-700 hover:underline">
                          เอาออกจากเว็บร้านนี้
                        </button>
                        <button
                          onClick={() => void save(l)}
                          disabled={saving === l.parentId}
                          className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                          {saving === l.parentId ? "กำลังบันทึก…" : "บันทึก"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {listings.length > 0 && !loading && (
        <p className="mt-2 text-[11px] text-slate-400">
          แสดง {shown.length} จาก {listings.length} รายการ ·{" "}
          {filtered ? "ล้างตัวกรองเพื่อลาก ⠿ เรียงลำดับบนเว็บ" : "ลาก ⠿ เพื่อเรียงลำดับที่โชว์บนเว็บ"} · ติ๊กหลายรายการเพื่อทำพร้อมกัน
        </p>
      )}

      {/* ☑️ ทำหลายรายการพร้อมกัน — แถบลอยล่างจอ (ของกลาง) */}
      <BulkActionBar
        count={sel.size}
        unit="รายการ"
        onClear={() => setSel(new Set())}
        extra={
          !allShownSelected && shown.length > sel.size ? (
            <button type="button" onClick={toggleAllShown} className="underline text-white/80 hover:text-white">
              เลือกทั้งหมดที่เห็น ({shown.length})
            </button>
          ) : null
        }
      >
        <button disabled={bulkBusy} onClick={() => void bulk({ isPublished: true }, "ขึ้นเว็บ")} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 disabled:opacity-50">
          ขึ้นเว็บ
        </button>
        <button disabled={bulkBusy} onClick={() => void bulk({ isPublished: false }, "ซ่อน")} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 disabled:opacity-50">
          ซ่อน
        </button>
        <button disabled={bulkBusy} onClick={() => void bulk({ featured: true }, "ตั้งแนะนำ")} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 disabled:opacity-50">
          ⭐ ตั้งแนะนำ
        </button>
        <button disabled={bulkBusy} onClick={() => void bulk({ featured: false }, "เลิกแนะนำ")} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 disabled:opacity-50">
          เลิกแนะนำ
        </button>
      </BulkActionBar>

      {/* 🖼 รูป สี และรูปเปิด — แท็บ 🛍 เว็บไซต์ ของ Parent SKU ตัวจริง (ทุกร้าน) */}
      <Drawer
        open={!!media}
        onClose={closeMedia}
        size="xl"
        title={media ? `รูป สี และรูปเปิด — ${media.code}` : ""}
        description="ตั้งค่าบนเว็บของรุ่นนี้ (ชุดเดียวกับแท็บ 🛍 เว็บไซต์ ในหน้า Parent SKU)"
        hasUnsavedChanges={mediaSave.anyDirty}
        footer={
          <>
            <button onClick={closeMedia} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">
              ปิด
            </button>
            <FooterSaveButton host={mediaSave} />
          </>
        }
      >
        <FooterSaveProvider value={mediaSave.register}>{media && <ParentWebListings parentId={media.parentId} />}</FooterSaveProvider>
      </Drawer>

      {/* 📦 Parent SKU ตัวเต็ม (ข้อมูลสินค้า/รูป/BOM/🛍 เว็บไซต์ …) — ปิดแล้วดึงค่าที่เว็บเห็นใหม่ */}
      {parentOpen && (
        <MasterRecordDrawer
          moduleKey="parent-skus-v2"
          apiPath="parent-skus"
          recordId={parentOpen}
          navIds={shown.map((l) => l.parentId)}
          onClose={() => {
            setParentOpen(null);
            void reload();
          }}
          onChanged={() => void reload()}
        />
      )}

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && void removeProduct(removing)}
        title="เอาออกจากเว็บร้านนี้?"
        message={removing ? `"${shownName(removing)}" จะหายจากเว็บ ${shop.name} (สินค้าใน ERP ไม่หาย · เพิ่มกลับได้ภายหลัง)` : ""}
        confirmText="เอาออก"
        cancelText="ยกเลิก"
        variant="danger"
        loading={!!removing && saving === removing.parentId}
      />
    </div>
  );
}
