"use client";

/**
 * 📂 หมวดหมู่สินค้าบนเว็บ (แท็บในหน้า /website/<ร้าน>)
 *
 * ซ้าย  = รายการหมวด (ลากเรียง · ➕ เพิ่ม) — ลำดับนี้ = ลำดับบนเว็บ (ปุ่มหมวดหน้าร้าน · Section หมวดสินค้า)
 * ขวา  = หมวดที่เลือก: ชื่อ · คำอธิบาย · รูปหมวด (การ์ด/แถบหมวดหน้าแรก) · แบนเนอร์หน้าหมวด · ไอคอน · ลบ
 *         + สินค้าในหมวด (เอาออก ✕ · ➕ เพิ่มทีละหลายรุ่น) — 1 รุ่นอยู่ได้หลายหมวด
 *
 * เก็บที่ไหน: รายการหมวด = shops.field_map.categories (PUT /api/website/field-map — บันทึกเองหลังหยุดแก้)
 *             สินค้า↔หมวด = store_listings.web_categories (POST /api/website/listings action "setCategories" — บันทึกทันที + audit)
 * รหัสหมวด (ใช้ในลิงก์หน้าหมวด /c/<รหัส>) ตั้งตอนสร้าง · ✏️ เปลี่ยนลิงก์ = CategoryRenameModal (ระบบตามแก้สินค้า/เมนู/Section + ย้ายลิงก์เก่าให้เอง)
 * 📂 หมวดย่อย (2 ชั้น · lib/website-category-tree): ➕ หมวดย่อยใต้หมวดที่เลือก · ช่อง "อยู่ใต้หมวด" ย้ายแม่ · ลากเรียงในแม่เดิม
 *    สินค้าในหมวดย่อยนับรวมในหมวดแม่ (เว็บร้านโชว์ในหน้าหมวดแม่ด้วย)
 * ↪ ย้ายสินค้าข้ามหมวด: ลากการ์ดสินค้าไปวางบนหมวดทางซ้าย (Ctrl/Alt ค้าง = เพิ่มเข้าอีกหมวด) · ช่อง "↪ ย้ายไป…" ในการ์ด
 *    · ติ๊กหลายรุ่น → แถบล่างจอ (ของกลาง BulkActionBar) ย้าย/เพิ่ม/เอาออกพร้อมกัน
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { apiFetch } from "@/lib/api";
import { loadWebListings } from "@/lib/website-data";
import { ImageChooser } from "@/components/website-canvas-media";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { cleanCategoryKey, type WebCategoryDef } from "@/lib/website-field-map";
import { categoryTree, reorderCategoryTree, childCategories, topCategories, familyKeys, flattenTree, categoryChoiceLabel } from "@/lib/website-category-tree";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { SaveBar } from "@/components/save-bar";
import { TranslateButton } from "@/components/translation-table";
import { BilingualText, ContentLangProvider, RecordLangBar } from "@/components/bilingual-field";
import { pickText, type ContentLang } from "@/lib/content-i18n";
import { CATEGORY_TEXT_KEYS } from "@/lib/website-field-map";
import { CategoryRenameModal } from "@/components/website-category-rename-modal";
import { webForm } from "@/lib/website-form-styles";

/** ชนิดข้อมูลตอนลากการ์ดสินค้า (กันรับของที่ลากมาจากที่อื่น) */
const DRAG_MIME = "application/x-erp-web-listings";

type Listing = {
  parentId: string;
  code: string;
  erpName: string;
  webName: string;
  erpImageKey: string | null;
  webImages: string[];
  published: boolean;
  categories: string[];
  mapped: { name?: string; images?: string[] } | null;
};

const img = (key: string | null | undefined, w = 200) => (key ? `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}` : null);
const thumbOf = (l: Listing) => l.webImages[0] || l.mapped?.images?.[0] || l.erpImageKey || null;
const nameOf = (l: Listing) => l.webName || l.mapped?.name || l.erpName;
const inputCls = webForm.inputRoomy;
const labelCls = "block text-xs font-medium text-slate-600 mb-1";

export function WebsiteCategoriesPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const t = useT();
  const [fieldMap, setFieldMap] = useState<Record<string, unknown> | null>(null);
  const [cats, setCats] = useState<WebCategoryDef[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selKey, setSelKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // เปิดป๊อปสร้างหมวด: null = ปิด · "" = หมวดชั้นบน · รหัส = หมวดย่อยใต้หมวดนั้น
  const [newParent, setNewParent] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<WebCategoryDef | null>(null);
  // ✏️ เปลี่ยนลิงก์หมวด (ป๊อป) — เก็บหมวดตอนเปิดไว้ทั้งก้อน
  const [renameOf, setRenameOf] = useState<WebCategoryDef | null>(null);
  const [chooser, setChooser] = useState<null | "imageKey" | "bannerKey">(null);
  // ↪ ย้ายสินค้าข้ามหมวด: รุ่นที่ติ๊กไว้ · หมวดที่กำลังลากผ่าน (ไฮไลต์)
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dropKey, setDropKey] = useState<string | null>(null);
  const dirty = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fm, ls] = await Promise.all([
        apiFetch(`/api/website/field-map?shop=${encodeURIComponent(shopSlug)}`).then((r) => r.json()),
        loadWebListings<Listing>(shopSlug, true),
      ]);
      if (!fm?.fieldMap) throw new Error(fm?.error || tr("โหลดหมวดไม่สำเร็จ", "Could not load categories"));
      if ((ls as { retryable?: boolean })?.retryable) throw new Error(ls?.error || tr("โหลดข้อมูลสินค้าไม่ครบ — กดลองใหม่อีกครั้ง", "Product data incomplete — press Retry"));
      setFieldMap(fm.fieldMap);
      const list = (fm.fieldMap.categories ?? []) as WebCategoryDef[];
      setCats(list);
      setSelKey((k) => (k && list.some((c) => c.key === k) ? k : list[0]?.key ?? null));
      setListings((ls?.listings ?? []) as Listing[]);
    } catch (e) {
      setError((e as Error).message || tr("เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่", "Error loading data, please try again"));
    } finally {
      setLoading(false);
    }
  }, [shopSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ── บันทึกรายการหมวด (หลังหยุดแก้ 0.7 วิ · หรือกด 💾 บันทึกเดี๋ยวนี้ ที่แถบล่าง) ── */
  // ver = นับครั้งที่แก้ — บันทึกเสร็จแล้วมีการแก้ใหม่ระหว่างทาง = ยังไม่ถือว่าบันทึกครบ (รอบถัดไปบันทึกต่อ)
  const ver = useRef(0);
  const catsRef = useRef(cats);
  catsRef.current = cats;
  const timer = useRef<number | null>(null);
  const persist = useCallback(async () => {
    if (!dirty.current || !fieldMap) return;
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const v = ver.current;
    setSaveState("saving");
    try {
      const r = await apiFetch("/api/website/field-map", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, fieldMap: { ...fieldMap, categories: catsRef.current } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || tr("บันทึกไม่สำเร็จ", "Save failed"));
      setSaveErr(null);
      setSavedAt(new Date());
      if (ver.current === v) {
        dirty.current = false;
        setSaveState("saved");
      } else setSaveState("pending");
    } catch (e) {
      setSaveState("error");
      setSaveErr((e as Error).message);
      toast.error((e as Error).message);
    }
  }, [fieldMap, shopId, toast]);
  useEffect(() => {
    if (!dirty.current || !fieldMap) return;
    setSaveState("pending");
    timer.current = window.setTimeout(() => void persist(), 700);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [cats, fieldMap, persist]);

  const editCats = (next: WebCategoryDef[]) => {
    dirty.current = true;
    ver.current += 1;
    setCats(next);
  };
  const patchCat = (key: string, p: Partial<WebCategoryDef>) => editCats(cats.map((c) => (c.key === key ? { ...c, ...p } : c)));
  // 🌐 ภาษาที่กำลังแก้ในการ์ดหมวด (ไทย/EN) — ช่องข้อความ = BilingualText · ตัวอย่างใน Google โชว์ตามภาษานี้
  const [editLang, setEditLang] = useState<ContentLang>("th");
  const patchI18n = (key: string, p: Record<string, unknown>) => patchCat(key, p as Partial<WebCategoryDef>);

  /* ── สินค้า ↔ หมวด (บันทึกทันที) ── */
  const setCategoriesOf = async (items: { parentId: string; categories: string[] }[], category: string, okMsg: string) => {
    if (!items.length) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/website/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, action: "setCategories", category, items }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j?.error || t("บันทึกไม่สำเร็จ", "Save failed"));
      const byId = new Map(items.map((it) => [it.parentId, it.categories]));
      setListings((ls) => ls.map((l) => (byId.has(l.parentId) ? { ...l, categories: byId.get(l.parentId)! } : l)));
      toast.success(okMsg);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /* ── ✏️ เปลี่ยนลิงก์หมวด — server แก้ field_map เอง: บันทึกที่ค้างก่อนเปิด · เสร็จแล้วโหลดใหม่ (ไม่ให้รอบบันทึกถัดไปเขียนรหัสเก่าทับ) ── */
  const openRename = async (c: WebCategoryDef) => {
    if (dirty.current) await persist();
    if (dirty.current) return toast.error(t("บันทึกหมวดที่แก้ค้างไว้ไม่สำเร็จ — ลองกด 💾 บันทึกก่อน", "Could not save pending category edits — try pressing 💾 Save first"));
    setRenameOf(c);
  };
  const onRenamed = async (newKey: string, warning: string | null) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    dirty.current = false;
    setRenameOf(null);
    await load();
    setSelKey(newKey);
    if (warning) toast.error(warning);
    else toast.success(t(`เปลี่ยนลิงก์เป็น /c/${newKey} แล้ว · ลิงก์เก่าพาไปหน้าใหม่อัตโนมัติ`, `Link changed to /c/${newKey} · the old link redirects automatically`));
  };

  const sel = cats.find((c) => c.key === selKey) ?? null;
  // หมวดที่เลือกแบบ object ทั่วไป (ช่อง _en/_i18n ที่ widget 2 ภาษาอ่าน/เขียน)
  const selRec = (sel ?? {}) as unknown as Record<string, unknown>;
  useEffect(() => setPicked(new Set()), [selKey]);
  // สินค้าในหมวด เรียงตามที่ลากไว้ (ตัวที่ยังไม่อยู่ในลำดับ ต่อท้ายตามลำดับรวมของร้าน)
  const inCat = useMemo(() => {
    if (!sel) return [];
    const list = listings.filter((l) => l.categories.includes(sel.key));
    const pos = new Map((sel.order ?? []).map((c, i) => [c, i]));
    return list
      .map((l, i) => ({ l, i }))
      .sort((a, b) => (pos.get(a.l.code.toUpperCase()) ?? 1e6 + a.i) - (pos.get(b.l.code.toUpperCase()) ?? 1e6 + b.i))
      .map((x) => x.l);
  }, [listings, sel]);
  const prodDrag = useDragReorder((from, to) => {
    if (!sel) return;
    patchCat(sel.key, { order: moveItem(inCat, from, to).map((l) => l.code.toUpperCase()) });
  });
  // นับรวมหมวดย่อย (ไม่ซ้ำรุ่น) — ตรงกับที่เว็บร้านโชว์ในหน้าหมวดแม่
  const countOf = (key: string) => {
    const fam = familyKeys(cats, key);
    return listings.filter((l) => l.categories.some((k) => fam.includes(k))).length;
  };
  const directCount = (key: string) => listings.filter((l) => l.categories.includes(key)).length;
  const labelOf = (key: string) => cats.find((c) => c.key === key)?.label ?? key;

  // 📂 มุมมองต้นไม้ (หมวด → หมวดย่อย) · ลากหมวดชั้นบน = ย้ายทั้งกลุ่ม · ลากหมวดย่อย = เรียงในแม่เดิม
  const rows = useMemo(() => categoryTree(cats), [cats]);
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => editCats(reorderCategoryTree(cats, from, to)));
  const selTop = sel ? (sel.parent ? sel.parent : sel.key) : null;

  /* ── ▸/▾ พับ/ขยายหมวดย่อย — จำต่อร้านในเครื่องนี้ (localStorage · ใช้ไม่ได้ = ไม่จำ) ── */
  // ลากเรียงยังใช้ลำดับแถวเต็ม (rows) — แถวที่พับแค่ไม่วาด เลขแถวไม่เลื่อน
  const collapseKey = `erp-web-cat-collapsed:${shopSlug}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(collapseKey) ?? "[]");
      if (Array.isArray(raw)) setCollapsed(new Set(raw.filter((x): x is string => typeof x === "string")));
    } catch {
      /* ไม่มีที่เก็บ = เริ่มกางทั้งหมด */
    }
  }, [collapseKey]);
  const saveCollapsed = useCallback(
    (next: Set<string>) => {
      setCollapsed(next);
      try {
        localStorage.setItem(collapseKey, JSON.stringify([...next]));
      } catch {
        /* จำไม่ได้ก็ใช้ได้ในหน้านี้ */
      }
    },
    [collapseKey]
  );
  const kidsOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cats) if (c.parent) m.set(c.parent, (m.get(c.parent) ?? 0) + 1);
    return m;
  }, [cats]);
  const toggleCollapse = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    saveCollapsed(next);
  };
  // เลือก/สร้างหมวดย่อยในกลุ่มที่พับอยู่ → กางแม่ให้เห็น (ทุกครั้งที่เปลี่ยนหมวดที่เลือก · พับเองทีหลังได้)
  useEffect(() => {
    if (sel?.parent && collapsed.has(sel.parent)) {
      const next = new Set(collapsed);
      next.delete(sel.parent);
      saveCollapsed(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);

  /**
   * ↪ ย้าย (แทนที่หมวดนี้ด้วยหมวดปลายทาง — ตำแหน่งเดิม หมวดหลักยังเป็นหมวดหลัก) หรือ copy = เพิ่มเข้าอีกหมวด (คงหมวดนี้ไว้)
   */
  const moveTo = (ids: string[], toKey: string, copy = false) => {
    if (!sel || !ids.length || toKey === sel.key) return;
    const to = cats.find((c) => c.key === toKey);
    if (!to) return;
    const items = listings
      .filter((l) => ids.includes(l.parentId))
      .map((l) => {
        const next = copy ? [...l.categories, toKey] : l.categories.map((k) => (k === sel.key ? toKey : k));
        return { parentId: l.parentId, categories: [...new Set(next)] };
      });
    setPicked(new Set());
    void setCategoriesOf(items, toKey, copy ? t(`เพิ่ม ${items.length} รุ่นเข้าหมวด ${to.label} แล้ว (ยังอยู่หมวด ${sel.label})`, `Added ${items.length} models to ${to.label} (still in ${sel.label})`) : t(`ย้าย ${items.length} รุ่นไปหมวด ${to.label} แล้ว`, `Moved ${items.length} models to ${to.label}`));
  };
  const removeMany = (ids: string[]) => {
    if (!sel || !ids.length) return;
    const items = listings.filter((l) => ids.includes(l.parentId)).map((l) => ({ parentId: l.parentId, categories: l.categories.filter((k) => k !== sel.key) }));
    setPicked(new Set());
    void setCategoriesOf(items, sel.key, t(`เอา ${items.length} รุ่นออกจากหมวด ${sel.label} แล้ว`, `Removed ${items.length} models from ${sel.label}`));
  };
  // ปลายทางที่เลือกได้ (ทุกหมวดยกเว้นหมวดนี้ · เรียงแบบต้นไม้ ↳ = หมวดย่อย)
  const moveTargets = sel ? rows.filter((r) => r.cat.key !== sel.key).map((r) => r.cat) : [];
  const dropProps = (key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!sel || key === sel.key || !e.dataTransfer.types.includes(DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? "copy" : "move";
      if (dropKey !== key) setDropKey(key);
    },
    onDragLeave: () => setDropKey((k) => (k === key ? null : k)),
    onDrop: (e: React.DragEvent) => {
      setDropKey(null);
      if (!sel || key === sel.key) return;
      e.preventDefault();
      try {
        const ids = JSON.parse(e.dataTransfer.getData(DRAG_MIME) || "[]") as string[];
        moveTo(ids, key, e.ctrlKey || e.altKey);
      } catch {
        /* ไม่ใช่ของเรา */
      }
    },
  });

  const removeFromCat = (l: Listing) => {
    if (!sel) return;
    void setCategoriesOf([{ parentId: l.parentId, categories: l.categories.filter((k) => k !== sel.key) }], sel.key, t(`เอา "${nameOf(l)}" ออกจากหมวด ${sel.label} แล้ว`, `Removed "${nameOf(l)}" from ${sel.label}`));
  };

  const deleteCat = async () => {
    const c = confirmDel;
    if (!c) return;
    setConfirmDel(null);
    // สินค้าที่อยู่หมวดนี้ → เอาหมวดนี้ออก (สินค้ายังอยู่บนเว็บ)
    const affected = listings.filter((l) => l.categories.includes(c.key)).map((l) => ({ parentId: l.parentId, categories: l.categories.filter((k) => k !== c.key) }));
    if (affected.length) await setCategoriesOf(affected, c.key, t(`เอาสินค้า ${affected.length} รายการออกจากหมวด ${c.label} แล้ว`, `Removed ${affected.length} products from ${c.label}`));
    // หมวดย่อยของหมวดที่ลบ → กลายเป็นหมวดชั้นบน (ไม่หายไปด้วย)
    const next = flattenTree(cats.filter((x) => x.key !== c.key).map((x) => (x.parent === c.key ? { ...x, parent: null } : x)));
    editCats(next);
    setSelKey(next[0]?.key ?? null);
    toast.success(t(`ลบหมวด "${c.label}" แล้ว`, `Category "${c.label}" deleted`));
  };

  if (loading) return <p className="text-sm text-slate-400 py-10 text-center">{t("กำลังโหลดหมวดหมู่…", "Loading categories…")}</p>;
  if (error)
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={() => void load()} className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100">
          {t("ลองใหม่", "Retry")}
        </button>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-base font-semibold text-slate-800">📂 {t("หมวดหมู่สินค้าบนเว็บ", "Web categories")}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{t("ลากเรียงลำดับได้ · 1 สินค้าอยู่ได้หลายหมวด · หมวดแรกของสินค้า = ป้ายบนการ์ด · รูปหมวดใช้ใน Section \"หมวดสินค้า\" หน้าแรก", "Drag to reorder · a product can be in several categories · its first category = the card label · category images are used in the home page \"Categories\" section")}</p>
        </div>
        {/* 🌐 ชื่อหมวด / คำโปรย / SEO ภาษาอังกฤษ (หน้าเว็บ /en) — ตารางคำแปลของกลาง · บันทึกอัตโนมัติเหมือนช่องอื่น */}
        <TranslateButton
          value={cats}
          onChange={editCats}
          keys={CATEGORY_TEXT_KEYS}
          crumbOf={(f) => ({ label: t("ชื่อหมวด", "Category name"), blurb: t("คำโปรย", "Tagline"), seoTitle: t("ชื่อใน Google", "Google title"), seoDescription: t("คำอธิบายใน Google", "Google description") })[f] ?? null}
          title={t("หมวดหมู่ภาษาอังกฤษ — ชื่อ · คำโปรย · SEO", "Categories in English — name · tagline · SEO")}
          description={t("บันทึกอัตโนมัติเหมือนช่องอื่นในแท็บนี้ · ช่องที่ยังว่าง ลูกค้าหน้า /en เห็นภาษาไทยแทน", "Auto-saved like other fields in this tab · empty fields show Thai to customers on /en")}
        />
        <span className="text-xs text-slate-400">💾 {t("บันทึกอัตโนมัติ — ดูสถานะที่แถบล่าง", "Auto-save — see status in the bottom bar")}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* ซ้าย: รายการหมวด */}
        <div className="rounded-xl border border-slate-200 bg-white p-2 h-fit">
          {cats.length === 0 && <p className="text-xs text-slate-400 px-2 py-6 text-center">{t("ยังไม่มีหมวด — กด ➕ เพิ่มหมวด", "No categories yet — press ➕ Add category")}</p>}
          {kidsOf.size > 0 && (
            <div className="flex items-center justify-end gap-1 px-1 pb-1">
              <button type="button" onClick={() => saveCollapsed(new Set())} disabled={collapsed.size === 0} className="rounded-md px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40">
                ▾ {t("ขยายทั้งหมด", "Expand all")}
              </button>
              <button type="button" onClick={() => saveCollapsed(new Set(kidsOf.keys()))} disabled={[...kidsOf.keys()].every((k) => collapsed.has(k))} className="rounded-md px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40">
                ▸ {t("พับทั้งหมด", "Collapse all")}
              </button>
            </div>
          )}
          {rows.map(({ cat: c, depth }, i) => {
            // หมวดย่อยของแม่ที่พับอยู่ = ไม่วาด (ยกเว้นตัวที่เลือกอยู่ — กันการ์ดขวาค้างไม่มีแถว)
            if (depth > 0 && c.parent && collapsed.has(c.parent) && c.key !== selKey) return null;
            const kids = depth === 0 ? kidsOf.get(c.key) ?? 0 : 0;
            const folded = kids > 0 && collapsed.has(c.key);
            // ปุ่ม ➕ หมวดย่อย = ท้ายกลุ่มที่เห็นจริง: แม่พับ+เลือกแม่ → ใต้แม่ · แม่พับ+เลือกหมวดย่อย (ยังโชว์แถวเดียว) → ใต้หมวดย่อยนั้น
            const parentFolded = depth > 0 && !!c.parent && collapsed.has(c.parent);
            const lastOfGroup = c.key === selTop || c.parent === selTop ? (folded ? selKey === c.key : parentFolded || !rows[i + 1] || rows[i + 1].depth === 0) : false;
            return (
              <div key={c.key}>
                <div
                  {...rowProps(i)}
                  {...dropProps(c.key)}
                  onClick={() => setSelKey(c.key)}
                  className={`flex items-center gap-2 rounded-lg py-2 cursor-pointer ${depth ? "pl-9 pr-2" : "px-1.5"} ${dropKey === c.key ? "bg-emerald-50 ring-2 ring-emerald-400" : c.key === selKey ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50"} ${rowCls(i)}`}
                  title={dropKey === c.key ? t("ปล่อยเพื่อย้ายมาหมวดนี้ (Ctrl ค้าง = เพิ่มเข้าหมวดนี้อีกหมวด)", "Drop to move here (hold Ctrl = also add to this category)") : undefined}
                >
                  {depth > 0 && <span className="text-slate-300 text-xs -ml-3" aria-hidden>└</span>}
                  {/* ▸/▾ พับหมวดย่อย (เฉพาะหมวดแม่ที่มีหมวดย่อย · ไม่มี = เว้นที่ให้แถวตรงกัน) */}
                  {depth === 0 &&
                    (kids > 0 ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapse(c.key);
                        }}
                        title={folded ? t(`ขยาย — โชว์หมวดย่อย ${kids} หมวด`, `Expand — show ${kids} subcategories`) : t("พับหมวดย่อย", "Collapse subcategories")}
                        aria-expanded={!folded}
                        aria-label={folded ? t(`ขยายหมวดย่อยของ ${c.label}`, `Expand subcategories of ${c.label}`) : t(`พับหมวดย่อยของ ${c.label}`, `Collapse subcategories of ${c.label}`)}
                        className="shrink-0 w-5 h-5 -mr-1 rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center"
                      >
                        <span className={`inline-block text-[10px] transition-transform ${folded ? "" : "rotate-90"}`}>▶</span>
                      </button>
                    ) : (
                      <span className="shrink-0 w-5 -mr-1" aria-hidden />
                    ))}
                  <DragHandle {...handleProps(i)} />
                  {c.imageKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img(c.imageKey, 80)!} alt="" className={`${depth ? "w-7 h-7" : "w-9 h-9"} rounded-md object-cover border border-slate-200`} />
                  ) : (
                    <span className={`${depth ? "w-7 h-7 text-sm" : "w-9 h-9 text-lg"} rounded-md bg-slate-100 flex items-center justify-center`}>{c.icon || (depth ? "▫️" : "📁")}</span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className={`block ${depth ? "text-[13px]" : "text-sm font-medium"} text-slate-800 truncate`}>{c.label}</span>
                    <span className="block text-[10px] text-slate-400 truncate">
                      /c/{c.key}
                      {folded && <span className="text-slate-500"> · {kids} {t("หมวดย่อย", "subcategories")}</span>}
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-500 tabular-nums" title={depth ? undefined : t("รวมสินค้าในหมวดย่อย", "Includes products in subcategories")}>{countOf(c.key)}</span>
                </div>
                {/* ➕ หมวดย่อย — ท้ายกลุ่มของหมวดที่เลือกอยู่ */}
                {lastOfGroup && selTop && (
                  <button type="button" onClick={() => setNewParent(selTop)} className="ml-7 mb-1 mt-0.5 rounded-md px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50">
                    ➕ {t("หมวดย่อยใน", "Subcategory in")} “{cats.find((x) => x.key === selTop)?.label}”
                  </button>
                )}
              </div>
            );
          })}
          <button onClick={() => setNewParent("")} className="mt-1 w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600">
            ➕ {t("เพิ่มหมวด", "Add category")}
          </button>
        </div>

        {/* ขวา: หมวดที่เลือก */}
        {sel ? (
          <div className="space-y-4">
            <ContentLangProvider lang={editLang} onLangChange={setEditLang}>
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              {/* 🌐 สลับ ไทย | EN ทั้งการ์ด (ของกลาง RecordLangBar) — ชื่อ/คำอธิบาย/ชื่อและคำอธิบายใน Google */}
              <RecordLangBar
                value={selRec}
                keys={CATEGORY_TEXT_KEYS}
                onPatch={(p) => patchI18n(sel.key, p)}
                note={editLang === "en" ? t("🇬🇧 กำลังแก้ภาษาอังกฤษ — หน้าเว็บ /en ใช้ค่านี้ · ช่องที่ว่าง ลูกค้าเห็นภาษาไทยแทน", "🇬🇧 Editing English — used by /en pages · empty fields show Thai to customers") : undefined}
              />
              <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                <BilingualText label={t("ชื่อหมวด", "Category name")} maxLength={60} value={selRec} fieldKey="label" onPatch={(p) => patchI18n(sel.key, p)} />
                <div>
                  <label className={labelCls}>{t("ไอคอน (ถ้าไม่มีรูป)", "Icon (if no image)")}</label>
                  <input value={sel.icon} onChange={(e) => patchCat(sel.key, { icon: e.target.value.slice(0, 8) })} className={inputCls} placeholder="👜" />
                </div>
              </div>
              {/* 📂 อยู่ใต้หมวด (หมวดย่อย) */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium text-slate-600">{t("อยู่ใต้หมวด", "Parent category")}</label>
                <select
                  value={sel.parent ?? ""}
                  disabled={childCategories(cats, sel.key).length > 0}
                  onChange={(e) => editCats(flattenTree(cats.map((c) => (c.key === sel.key ? { ...c, parent: e.target.value || null } : c))))}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">{t("— ไม่มี (เป็นหมวดหลัก) —", "— None (main category) —")}</option>
                  {topCategories(cats)
                    .filter((c) => c.key !== sel.key)
                    .map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                </select>
                <span className="text-[11px] text-slate-400">
                  {childCategories(cats, sel.key).length > 0
                    ? t(`มีหมวดย่อย ${childCategories(cats, sel.key).length} หมวด — ย้ายไปอยู่ใต้หมวดอื่นไม่ได้ (ซ้อนได้ 2 ชั้น)`, `Has ${childCategories(cats, sel.key).length} subcategories — can't move under another category (max 2 levels)`)
                    : sel.parent
                      ? t("สินค้าในหมวดนี้ขึ้นในหน้าหมวดแม่ด้วย · บนเว็บเป็นปุ่มชิปใต้ชื่อหมวดแม่", "Products here also show on the parent category page · shown as a chip under the parent name on the web")
                      : t("เลือกหมวดแม่ = ทำเป็นหมวดย่อย", "Pick a parent = make it a subcategory")}
                </span>
              </div>
              <BilingualText label={t("คำอธิบาย (ใต้ชื่อหมวด / บนหน้าหมวด)", "Description (under the name / on the category page)")} multiline rows={2} maxLength={240} value={selRec} fieldKey="blurb" onPatch={(p) => patchI18n(sel.key, p)} />
              {/* 🔎 หน้าหมวดใน Google — หน้า /c/<รหัส> ของเว็บร้านใช้ค่านี้เป็น title/description */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-700">🔎 {t("หน้าหมวดใน Google", "Category page in Google")} <span className="font-normal text-slate-400">{t("· ว่าง = ใช้ชื่อหมวด/คำอธิบายด้านบน", "· empty = use the name/description above")}</span></p>
                {(() => {
                  // นับตัวอักษรตามภาษาที่กำลังแก้ (Google ตัดตามความยาวจริงของแต่ละภาษา)
                  const seoT = pickText(selRec, "seoTitle", editLang);
                  const d = pickText(selRec, "seoDescription", editLang);
                  const lab = pickText(selRec, "label", editLang);
                  const blurb = pickText(selRec, "blurb", editLang);
                  return (
                    <>
                      <BilingualText
                        label={t(`ชื่อใน Google (${seoT.length}/70 · แนะนำไม่เกิน 60)`, `Google title (${seoT.length}/70 · recommended up to 60)`)}
                        maxLength={70}
                        placeholder={`${sel.label} | ${t("ชื่อร้าน", "Shop name")}`}
                        value={selRec}
                        fieldKey="seoTitle"
                        onPatch={(p) => patchI18n(sel.key, p)}
                      />
                      <BilingualText
                        label={t(`คำอธิบายใน Google (${d.length}/170 · แนะนำ 70–155)`, `Google description (${d.length}/170 · recommended 70–155)`)}
                        multiline
                        rows={2}
                        maxLength={170}
                        placeholder={sel.blurb || t("เช่น กระเป๋าถือดีไซน์น่ารัก งานคุณภาพ ส่งไวทั่วไทย", "e.g. Cute handbags, quality work, fast shipping nationwide")}
                        value={selRec}
                        fieldKey="seoDescription"
                        onPatch={(p) => patchI18n(sel.key, p)}
                      />
                      {/* ตัวอย่างหน้าตาผลค้นหา (ตามภาษาที่กำลังแก้ · อังกฤษว่าง = ไทย) */}
                      <div className="rounded-md bg-white border border-slate-200 px-3 py-2">
                        <p className="text-[11px] text-emerald-700 truncate">…{editLang === "en" ? "/en" : ""}/c/{sel.key}</p>
                        <p className="text-sm text-blue-700 truncate">{seoT.trim() || `${lab} | ${t("ชื่อร้าน", "Shop name")}`}</p>
                        <p className="text-xs text-slate-600 line-clamp-2">{d.trim() || blurb || t("(ยังไม่มีคำอธิบาย — Google จะดึงข้อความจากหน้ามาเอง)", "(No description — Google will pull text from the page)")}</p>
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ImageSlot label={t("รูปหมวด (การ์ด/แถบหมวดหน้าแรก)", "Category image (home page card/strip)")} k={sel.imageKey} aspect="1 / 1" onPick={() => setChooser("imageKey")} onClear={() => patchCat(sel.key, { imageKey: null })} />
                <ImageSlot label={t("แบนเนอร์หัวหน้าหมวด", "Category page banner")} k={sel.bannerKey} aspect="21 / 9" onPick={() => setChooser("bannerKey")} onClear={() => patchCat(sel.key, { bannerKey: null })} />
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  {t("ลิงก์หน้าหมวด:", "Category link:")} <code>/c/{sel.key}</code>{" "}
                  <button onClick={() => void openRename(sel)} className="ml-1 text-blue-600 hover:underline">
                    ✏️ {t("เปลี่ยนลิงก์", "Change link")}
                  </button>
                </span>
                <button onClick={() => setConfirmDel(sel)} className="text-xs text-red-600 hover:underline">
                  🗑 {t("ลบหมวดนี้", "Delete this category")}
                </button>
              </div>
            </div>
            </ContentLangProvider>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <p className="flex-1 text-sm font-semibold text-slate-800">
                  {t("สินค้าในหมวด", "Products in")} &quot;{sel.label}&quot; <span className="font-normal text-slate-400">({inCat.length})</span>
                </p>
                <button disabled={busy} onClick={() => setAddOpen(true)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  ➕ {t("เพิ่มสินค้าเข้าหมวด", "Add products to category")}
                </button>
              </div>
              {inCat.length > 0 && (
                <p className="text-[11px] text-slate-400 -mt-1.5 mb-2">
                  {inCat.length > 1 && t("ลาก ⠿ = เรียงลำดับในหมวดนี้ · ", "Drag ⠿ = reorder in this category · ")}{t("ลากรูปสินค้าไปวางบนหมวดทางซ้าย =", "Drag a product image onto a category on the left =")} <b className="font-medium text-slate-500">{t("ย้าย", "move")}</b> {t("(Ctrl ค้าง = เพิ่มเข้าอีกหมวด) · ติ๊ก ☐ หลายรุ่นแล้วย้ายพร้อมกันได้", "(hold Ctrl = also add to that category) · tick ☐ several models to move them together")}
                </p>
              )}
              {/* 📂 สินค้าจากหมวดย่อย (ไม่ได้อยู่หมวดนี้ตรง ๆ แต่ขึ้นในหน้าหมวดนี้บนเว็บ) */}
              {!sel.parent && countOf(sel.key) > inCat.length && (
                <p className="text-[11px] text-blue-600 -mt-1 mb-2">+ {t(`อีก ${countOf(sel.key) - inCat.length} รุ่นจากหมวดย่อย`, `${countOf(sel.key) - inCat.length} more models from subcategories`)} ({childCategories(cats, sel.key).map((c) => c.label).join(", ")}) {t("— ขึ้นในหน้าหมวดนี้บนเว็บด้วย · จัดลำดับ/เพิ่ม-เอาออกที่หมวดย่อยนั้น", "— also shown on this category page · reorder/add/remove in that subcategory")}</p>
              )}
              {inCat.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">{t("ยังไม่มีสินค้าในหมวดนี้ — กด ➕ เพิ่มสินค้าเข้าหมวด", "No products in this category — press ➕ Add products to category")}</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                  {inCat.map((l, i) => (
                    <div
                      key={l.parentId}
                      {...prodDrag.rowProps(i)}
                      draggable
                      onDragStart={(e) => {
                        const ids = picked.has(l.parentId) ? [...picked] : [l.parentId];
                        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(ids));
                        e.dataTransfer.setData("text/plain", ids.length > 1 ? t(`${ids.length} รุ่น`, `${ids.length} models`) : nameOf(l));
                        e.dataTransfer.effectAllowed = "copyMove";
                      }}
                      onDragEnd={() => setDropKey(null)}
                      className={`group relative rounded-lg border p-1.5 ${picked.has(l.parentId) ? "border-blue-500 ring-1 ring-blue-300" : "border-slate-200"} ${prodDrag.rowCls(i)}`}
                    >
                      <DragHandle {...prodDrag.handleProps(i)} title={t("ลากเพื่อเรียงลำดับในหมวดนี้", "Drag to reorder in this category")} className="absolute left-2.5 top-2.5 z-10 rounded bg-white/90 px-1 text-sm shadow-sm" />
                      <label className="absolute left-9 top-2.5 z-10 flex h-5 w-5 items-center justify-center rounded bg-white/90 shadow-sm cursor-pointer" title={t("ติ๊กเพื่อย้ายหลายรุ่นพร้อมกัน", "Tick to move several models together")}>
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 accent-blue-600"
                          checked={picked.has(l.parentId)}
                          onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(l.parentId); else n.delete(l.parentId); return n; })}
                        />
                      </label>
                      <span className="absolute right-2 top-2 z-10 rounded-full bg-white/90 px-1.5 text-[10px] text-slate-500 tabular-nums">{i + 1}</span>
                      <div className="aspect-square rounded-md bg-slate-100 overflow-hidden">
                        {thumbOf(l) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img(thumbOf(l), 240)!} alt="" className="w-full h-full object-cover" loading="lazy" />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-700 line-clamp-2 leading-snug">{nameOf(l)}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {l.code}
                        {!l.published && t(" · ยังไม่เผยแพร่", " · unpublished")}
                        {l.categories[0] === sel.key ? t(" · หมวดหลัก", " · main category") : l.categories.length > 1 ? ` · ${t("หลัก", "main")}: ${labelOf(l.categories[0])}` : ""}
                      </p>
                      {moveTargets.length > 0 && (
                        <select
                          value=""
                          disabled={busy}
                          onChange={(e) => e.target.value && moveTo([l.parentId], e.target.value)}
                          className="mt-1 w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-600 focus:border-blue-400 focus:outline-none"
                          aria-label={t("ย้ายไปหมวด", "Move to category")}
                        >
                          <option value="">{t("↪ ย้ายไป…", "↪ Move to…")}</option>
                          {moveTargets.map((c) => (
                            <option key={c.key} value={c.key}>
                              {categoryChoiceLabel(c)}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        title={t("เอาออกจากหมวดนี้", "Remove from this category")}
                        disabled={busy}
                        onClick={() => removeFromCat(l)}
                        className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-6 h-6 items-center justify-center rounded-full bg-white border border-slate-300 text-xs text-red-600 shadow-sm"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">{t("เลือกหมวดทางซ้าย หรือกด ➕ เพิ่มหมวด", "Pick a category on the left or press ➕ Add category")}</div>
        )}
      </div>

      {/* 💾 แถบบันทึก (ของกลาง) — หมวด/รูป/ชื่อ บันทึกเองหลังหยุดแก้ · สินค้า↔หมวด บันทึกทันทีทุกครั้งที่กด */}
      <SaveBar
        mode="auto"
        dirty={saveState === "pending"}
        saving={saveState === "saving"}
        error={saveState === "error" ? saveErr : null}
        savedAt={savedAt}
        onSave={persist}
        note={t("ชื่อ/รูป/ลำดับหมวด บันทึกเองหลังหยุดแก้ · เพิ่ม/ย้ายสินค้าเข้าหมวด บันทึกทันที", "Category names/images/order auto-save when you stop editing · adding/moving products saves instantly")}
      />

      {sel && (
        <BulkActionBar count={picked.size} unit={t("รุ่น", "models")} onClear={() => setPicked(new Set())} extra={<button type="button" className="underline hover:text-white" onClick={() => setPicked(new Set(inCat.map((l) => l.parentId)))}>{t("เลือกทั้งหมดในหมวด", "Select all in category")} ({inCat.length})</button>}>
          <select value="" disabled={busy} onChange={(e) => e.target.value && moveTo([...picked], e.target.value)} className="h-8 rounded-lg border border-slate-600 bg-slate-800 px-2 text-xs text-white" aria-label={t("ย้ายที่เลือกไปหมวด", "Move selected to category")}>
            <option value="">{t("↪ ย้ายไปหมวด…", "↪ Move to category…")}</option>
            {moveTargets.map((c) => (
              <option key={c.key} value={c.key}>
                {categoryChoiceLabel(c)}
              </option>
            ))}
          </select>
          <select value="" disabled={busy} onChange={(e) => e.target.value && moveTo([...picked], e.target.value, true)} className="h-8 rounded-lg border border-slate-600 bg-slate-800 px-2 text-xs text-white" aria-label={t("เพิ่มที่เลือกเข้าอีกหมวด", "Add selected to another category")}>
            <option value="">{t("＋ เพิ่มเข้าอีกหมวด…", "＋ Also add to…")}</option>
            {moveTargets.map((c) => (
              <option key={c.key} value={c.key}>
                {categoryChoiceLabel(c)}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy} onClick={() => removeMany([...picked])} className="h-8 rounded-lg px-3 text-xs text-red-300 hover:bg-white/10">
            {t("เอาออกจากหมวดนี้", "Remove from this category")}
          </button>
        </BulkActionBar>
      )}

      <NewCategoryModal
        open={newParent !== null}
        onClose={() => setNewParent(null)}
        taken={cats.map((c) => c.key)}
        parentLabel={newParent ? cats.find((c) => c.key === newParent)?.label ?? null : null}
        suggestPrefix={newParent || ""}
        onCreate={(c) => {
          editCats(flattenTree([...cats, { ...c, parent: newParent || null }]));
          setSelKey(c.key);
          setNewParent(null);
        }}
      />

      {sel && (
        <AddProductsModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          category={sel}
          listings={listings.filter((l) => !l.categories.includes(sel.key))}
          labelOf={labelOf}
          onAdd={(picked) => {
            setAddOpen(false);
            void setCategoriesOf(
              picked.map((l) => ({ parentId: l.parentId, categories: [...l.categories, sel.key] })),
              sel.key,
              t(`เพิ่มสินค้า ${picked.length} รายการเข้าหมวด ${sel.label} แล้ว`, `Added ${picked.length} products to ${sel.label}`)
            );
          }}
        />
      )}

      <ImageChooser
        open={!!chooser}
        onClose={() => setChooser(null)}
        shopSlug={shopSlug}
        title={chooser === "bannerKey" ? t("แบนเนอร์หัวหน้าหมวด", "Category page banner") : t("รูปหมวด", "Category image")}
        onPick={(p) => {
          if (sel && chooser) patchCat(sel.key, { [chooser]: p.key });
          setChooser(null);
        }}
      />

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => void deleteCat()}
        variant="danger"
        title={t(`ลบหมวด "${confirmDel?.label ?? ""}"?`, `Delete category "${confirmDel?.label ?? ""}"?`)}
        message={t(`สินค้า ${confirmDel ? directCount(confirmDel.key) : 0} รายการจะไม่อยู่ในหมวดนี้แล้ว (สินค้ายังอยู่บนเว็บ) · ลิงก์หน้าหมวด /c/${confirmDel?.key ?? ""} จะใช้ไม่ได้`, `${confirmDel ? directCount(confirmDel.key) : 0} products will leave this category (they stay on the website) · the category link /c/${confirmDel?.key ?? ""} will stop working`) + (confirmDel && childCategories(cats, confirmDel.key).length ? t(` · หมวดย่อย ${childCategories(cats, confirmDel.key).length} หมวดจะกลายเป็นหมวดหลัก (ไม่ถูกลบ)`, ` · ${childCategories(cats, confirmDel.key).length} subcategories become main categories (not deleted)`) : "")}
        confirmText={t("ลบหมวด", "Delete category")}
      />

      <CategoryRenameModal cat={renameOf} cats={cats} shopId={shopId} onClose={() => setRenameOf(null)} onDone={(k, w) => void onRenamed(k, w)} />
    </div>
  );
}

function ImageSlot({ label, k, aspect, onPick, onClear }: { label: string; k?: string | null; aspect: string; onPick: () => void; onClear: () => void }) {
  const t = useT();
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <button type="button" onClick={onPick} className="block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 overflow-hidden hover:border-blue-400" style={{ aspectRatio: aspect, maxHeight: 160 }}>
        {k ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img(k, 600)!} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-slate-400">＋ {t("เลือกรูป", "Pick image")}</span>
        )}
      </button>
      {k && (
        <div className="mt-1 flex gap-3 text-[11px]">
          <button type="button" onClick={onPick} className="text-slate-600 hover:text-blue-600">
            {t("เปลี่ยนรูป", "Change image")}
          </button>
          <button type="button" onClick={onClear} className="text-red-600 hover:underline">
            {t("เอาออก", "Remove")}
          </button>
        </div>
      )}
    </div>
  );
}

/** สร้างหมวดใหม่: ชื่อ + รหัสในลิงก์ (เดาจากชื่อภาษาอังกฤษ · ชื่อไทย = ต้องตั้งเอง) — ใช้ซ้ำในหน้า 🗂 จัดหมวด (website-category-sorter) */
export function NewCategoryModal({ open, onClose, taken, onCreate, parentLabel, suggestPrefix = "" }: { open: boolean; onClose: () => void; taken: string[]; onCreate: (c: WebCategoryDef) => void; /** สร้างเป็นหมวดย่อยใต้หมวดนี้ */ parentLabel?: string | null; /** หมวดย่อย: รหัสขึ้นต้นด้วยรหัสแม่ (กันชนกับหมวดอื่น) */ suggestPrefix?: string }) {
  const t = useT();
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setLabel("");
      setKey("");
      setKeyTouched(false);
    }
  }, [open]);
  // ชื่ออังกฤษ = เดารหัสให้ (หมวดย่อยขึ้นต้นด้วยรหัสแม่) · ชื่อไทยล้วน = ว่าง ให้ตั้งเอง (ไม่เดาเป็นรหัสแม่ซ้ำ)
  const baseKey = cleanCategoryKey(label);
  const autoKey = baseKey ? (suggestPrefix ? cleanCategoryKey(`${suggestPrefix}-${baseKey}`) : baseKey) : "";
  const k = keyTouched ? cleanCategoryKey(key) : autoKey;
  const problem = !label.trim() ? t("ใส่ชื่อหมวด", "Enter a category name") : !k ? t("ตั้งรหัสในลิงก์ (ภาษาอังกฤษ/ตัวเลข/ขีด)", "Set a link code (letters/numbers/dashes)") : taken.includes(k) ? t("รหัสนี้มีแล้ว — ตั้งใหม่", "This code already exists — pick another") : null;
  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={parentLabel ? t(`➕ หมวดย่อยใน “${parentLabel}”`, `➕ Subcategory in “${parentLabel}”`) : t("➕ เพิ่มหมวด", "➕ Add category")}
      size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
            {t("ยกเลิก", "Cancel")}
          </button>
          <button
            disabled={!!problem}
            onClick={() => onCreate({ key: k, label: label.trim().slice(0, 60), icon: "", blurb: "", imageKey: null, bannerKey: null })}
            className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {t("เพิ่มหมวด", "Add category")}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className={labelCls}>{t("ชื่อหมวด (โชว์บนเว็บ)", "Category name (shown on web)")}</label>
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder={t("เช่น BAGS / กระเป๋าสะพาย", "e.g. BAGS / Shoulder bags")} />
        </div>
        <div>
          <label className={labelCls}>{t("รหัสในลิงก์ (/c/…)", "Link code (/c/…)")}</label>
          <input
            value={keyTouched ? key : autoKey}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value);
            }}
            className={inputCls}
            placeholder={suggestPrefix ? t(`เช่น ${suggestPrefix}-small`, `e.g. ${suggestPrefix}-small`) : t("เช่น bags", "e.g. bags")}
          />
          <p className="text-[11px] text-slate-400 mt-1">{t("ภาษาอังกฤษตัวเล็ก ตัวเลข ขีดกลาง · ตั้งแล้วเปลี่ยนไม่ได้", "Lowercase letters, numbers, dashes · can't be changed later")}</p>
        </div>
        {problem && label && <p className="text-xs text-amber-700">{problem}</p>}
      </div>
    </ERPModal>
  );
}

/** เลือกสินค้าเข้าหมวด (ติ๊กหลายรุ่น · ค้นหาด้วยชื่อ/รหัส) */
function AddProductsModal({
  open,
  onClose,
  category,
  listings,
  labelOf,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  category: WebCategoryDef;
  listings: Listing[];
  labelOf: (k: string) => string;
  onAdd: (picked: Listing[]) => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) {
      setQ("");
      setPicked(new Set());
    }
  }, [open]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? listings.filter((l) => `${nameOf(l)} ${l.code}`.toLowerCase().includes(needle)) : listings;
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allShown = shown.length > 0 && shown.every((l) => picked.has(l.parentId));
  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={t(`➕ เพิ่มสินค้าเข้าหมวด "${category.label}"`, `➕ Add products to "${category.label}"`)}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-sm text-blue-700">{picked.size ? t(`เลือกแล้ว ${picked.size} รายการ`, `${picked.size} selected`) : t("ยังไม่ได้เลือก", "Nothing selected")}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
              {t("ยกเลิก", "Cancel")}
            </button>
            <button
              disabled={!picked.size}
              onClick={() => onAdd(listings.filter((l) => picked.has(l.parentId)))}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {t(`เพิ่ม ${picked.size || ""} รายการ`, `Add ${picked.size || ""} items`)}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} className={inputCls} placeholder={t("ค้นหาชื่อ / รหัสสินค้า", "Search name / product code")} />
          <button
            type="button"
            onClick={() => setPicked((s) => {
              const n = new Set(s);
              for (const l of shown) allShown ? n.delete(l.parentId) : n.add(l.parentId);
              return n;
            })}
            className="shrink-0 rounded-lg border border-slate-300 px-3 text-xs text-slate-700 hover:border-blue-400"
          >
            {allShown ? t("เลิกเลือกที่เห็น", "Deselect visible") : t("เลือกทั้งหมดที่เห็น", "Select all visible")}
          </button>
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-slate-400 py-10 text-center">{listings.length ? t("ไม่พบสินค้า ลองเปลี่ยนคำค้นหา", "No products found, try another search") : t("สินค้าทุกรายการอยู่ในหมวดนี้แล้ว", "Every product is already in this category")}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[55vh] overflow-y-auto pr-1">
            {shown.map((l) => {
              const on = picked.has(l.parentId);
              return (
                <button
                  key={l.parentId}
                  type="button"
                  onClick={() => toggle(l.parentId)}
                  className={`relative text-left rounded-lg border p-1.5 ${on ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-400"}`}
                >
                  <span className={`absolute top-2 left-2 z-10 w-5 h-5 rounded border flex items-center justify-center text-[11px] ${on ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300"}`}>{on ? "✓" : ""}</span>
                  <span className="block aspect-square rounded-md bg-slate-100 overflow-hidden">
                    {thumbOf(l) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img(thumbOf(l), 240)!} alt="" className="w-full h-full object-cover" loading="lazy" />
                    )}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-700 line-clamp-2 leading-snug">{nameOf(l)}</span>
                  <span className="block text-[10px] text-slate-400 truncate">
                    {l.code}
                    {l.categories.length ? ` · ${l.categories.map(labelOf).join(", ")}` : t(" · ไม่มีหมวด", " · no category")}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </ERPModal>
  );
}
