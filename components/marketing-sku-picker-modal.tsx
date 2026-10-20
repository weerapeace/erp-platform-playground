"use client";
/**
 * 🎯 ป๊อปเลือกรุ่น (Parent SKU) แบบหน้า SKU การตลาด — ของกลาง
 *   แท็บ 🎯 SKU การตลาด = การ์ดรูป: แยกแบรนด์ · กรองป้ายหลัก (นับว่าเพิ่มไปแล้วกี่รุ่น) · ป้ายเสริม · 🎨 สีที่เหลือ
 *   แท็บ ☰ รายการสินค้า = ตาราง: ค้นหา · แบรนด์ · หมวด ERP (ถ้าส่งหมวดมา)
 *   ติ๊กได้หลายรุ่น (จำข้ามแท็บ/หน้า) → กดยืนยันทีเดียว · รุ่นที่ "เพิ่มไปแล้ว" (takenIds) ติ๊กซ้ำไม่ได้
 * ใช้ที่: ➕ เพิ่มสินค้าเข้าเว็บ (website-add-products-modal) · 🛠 เพิ่มรุ่นเข้างาน (โหมดทำงาน หน้า SKU การตลาด)
 * ข้อมูล: ผู้เรียกส่ง load() มา (ตัวโหลดกลาง lib/marketing/sku-list-db เบื้องหลัง) · ป๊อปนี้ไม่บันทึกอะไรเอง → onConfirm(ids)
 * ของกลาง: ERPModal · Pager · useViewPref · r2ImageUrl · GalleryColumns (จำนวนการ์ดต่อแถว จำรายคน)
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { Pager } from "@/components/pager";
import { useViewPref } from "@/lib/use-view-pref";
import { r2ImageUrl } from "@/lib/r2-image";
import { useGalleryColumns, GalleryColumnsControl } from "@/components/gallery-columns";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { labelName, type MarketingBrand, type MarketingSkuItem, type MarketingSkuLabel } from "@/lib/marketing/sku-list";

export type SkuPickerItem = MarketingSkuItem & { category_id?: string | null };
export type SkuPickerCatalog = {
  items: SkuPickerItem[];
  labels: MarketingSkuLabel[];
  badges: MarketingSkuLabel[];
  brands: MarketingBrand[];
  /** หมวด ERP (ไม่ส่ง = ไม่มีตัวกรองหมวดในแท็บรายการ) */
  categories?: { id: string; name: string }[];
  /** รุ่นที่เพิ่มไปแล้ว (รวมกับ prop takenIds) */
  takenIds?: string[];
  /** แบรนด์ที่จะเปิดให้ก่อน (null = ทุกแบรนด์) */
  startBrandId?: string | null;
};
/** คำที่ใช้เรียกรุ่นที่ "เพิ่มไปแล้ว" ในแต่ละที่ */
export type SkuPickerTakenText = { badge: string; short: string; hide: string; row: string };

const TABS = ["mkt", "list"] as const;
const ALL = "__all";
const NONE = "__none";
const PAGE_SIZE = 60;
// ค่าเริ่มต้นตามภาษาที่เลือก (เรียกตอน render — ผู้เรียกส่งคำของตัวเองมาแทนได้)
const takenDefault = (t: (th: string, en: string) => string): SkuPickerTakenText =>
  ({ badge: t("เพิ่มแล้ว", "Added"), short: t("เพิ่มแล้ว", "Added"), hide: t("ซ่อนที่เพิ่มแล้ว", "Hide added"), row: t("✓ อยู่แล้ว", "✓ Added") });

const chip = (on: boolean) =>
  `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`;

export function MarketingSkuPickerModal({
  open, onClose, title, description: descriptionProp,
  load, takenIds, taken: takenProp, startBrandId = null, warn, footerExtra,
  confirmText, busyText: busyTextProp, onConfirm, tabPrefKey, colsPrefKey, showFullPageLink = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** โหลดรายการรุ่น — เรียกทุกครั้งที่เปิด · โยน Error = โชว์ข้อความ + ปุ่มลองใหม่ */
  load: () => Promise<SkuPickerCatalog>;
  /** รุ่นที่อยู่ในปลายทางแล้ว (ติ๊กซ้ำไม่ได้) */
  takenIds?: string[];
  taken?: SkuPickerTakenText;
  /** แบรนด์ที่เปิดให้ก่อน ถ้า load() ไม่ได้บอกมา */
  startBrandId?: string | null;
  /** เตือน (ไม่บล็อก) เมื่อเลือกรุ่นที่ติดป้ายตามแบบนี้ เช่น Out Of Stock */
  warn?: { label: RegExp; note: string };
  /** ตัวเลือกเพิ่มในแถบล่าง (เช่น ซ่อนไว้ก่อน/ขึ้นเว็บทันที) */
  footerExtra?: ReactNode;
  /** ข้อความปุ่มยืนยัน ตามจำนวนที่เลือก (0 = ยังไม่เลือก) */
  confirmText: (n: number) => string;
  busyText?: string;
  /** บันทึกเอง แล้วคืน false ถ้าไม่สำเร็จ (ป๊อปค้างไว้ให้ลองใหม่) · อื่น ๆ = ปิดป๊อป */
  onConfirm: (parentSkuIds: string[]) => Promise<boolean | void>;
  /** จำแท็บที่เปิดล่าสุด / จำนวนการ์ดต่อแถว (รายคน) */
  tabPrefKey: string;
  colsPrefKey: string;
  showFullPageLink?: boolean;
}) {
  const t = useT();
  const description = descriptionProp ?? t("ติ๊กได้หลายรุ่น (จำข้ามแท็บ/ข้ามหน้า) แล้วกดยืนยันทีเดียว", "Tick as many models as you like (kept across tabs/pages), then confirm once");
  const taken = takenProp ?? takenDefault(t);
  const busyText = busyTextProp ?? t("กำลังบันทึก…", "Saving…");
  const { view: tab, setView: setTab, saveDefault } = useViewPref(tabPrefKey, TABS, "mkt");
  const [cat, setCatalog] = useState<SkuPickerCatalog | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [brand, setBrand] = useState<string>(ALL);
  const [label, setLabel] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);
  const [q, setQ] = useState("");
  const [hideOn, setHideOn] = useState(true);
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  // ▦ การ์ดต่อแถว (dropdown · จำรายคน) — มือถือ 2 ใบเสมอ
  const { cols, setCols } = useGalleryColumns(colsPrefKey, 6);

  const doLoad = useCallback(async () => {
    setErr(null);
    try {
      const c = await load();
      setCatalog(c);
      setBrand(c.startBrandId ?? startBrandId ?? ALL);
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : tr("โหลดรายการสินค้าไม่สำเร็จ", "Couldn't load the product list"));
    }
  }, [load, startBrandId]);
  useEffect(() => {
    if (!open) return;
    setSel(new Set());
    setQ("");
    setLabel(ALL);
    setCategory(ALL);
    setPage(0);
    void doLoad();   // ของเดิมยังโชว์ระหว่างโหลดใหม่ (ไม่กระพริบ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const takenKey = (takenIds ?? []).join(",");
  const onShop = useMemo(() => new Set([...(cat?.takenIds ?? []), ...(takenIds ?? [])]), [cat, takenKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const labelMap = useMemo(() => new Map((cat?.labels ?? []).map((l) => [l.id, l])), [cat]);
  const badgeMap = useMemo(() => new Map((cat?.badges ?? []).map((l) => [l.id, l])), [cat]);
  const brandMap = useMemo(() => new Map((cat?.brands ?? []).map((b) => [b.id, b])), [cat]);
  const catName = useMemo(() => new Map((cat?.categories ?? []).map((c) => [c.id, c.name])), [cat]);
  const hasCategories = (cat?.categories?.length ?? 0) > 0;

  // ตัวกรองทีละชั้น: แบรนด์ → (ค้นหา/ซ่อนที่เพิ่มแล้ว) → ป้าย/หมวด
  const inBrand = useMemo(() => (cat?.items ?? []).filter((i) => brand === ALL || (brand === NONE ? !i.brand_id : i.brand_id === brand)), [cat, brand]);
  const term = q.trim().toLowerCase();
  const base = useMemo(() => inBrand.filter((i) => (!term || `${i.code} ${i.name}`.toLowerCase().includes(term)) && (!hideOn || !onShop.has(i.parent_sku_id))), [inBrand, term, hideOn, onShop]);
  const filtered = useMemo(
    () =>
      base.filter((i) =>
        tab === "mkt"
          ? label === ALL || (label === NONE ? !i.label_id || !labelMap.has(i.label_id) : i.label_id === label)
          : category === ALL || (category === NONE ? !i.category_id : i.category_id === category)
      ),
    [base, tab, label, category, labelMap]
  );
  useEffect(() => setPage(0), [brand, label, category, term, hideOn, tab]);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // นับต่อแบรนด์ / ต่อป้าย (ป้าย: รวม + เพิ่มไปแล้วกี่รุ่น — ของแบรนด์ที่เลือก)
  const brandCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of cat?.items ?? []) m.set(i.brand_id ?? NONE, (m.get(i.brand_id ?? NONE) ?? 0) + 1);
    return m;
  }, [cat]);
  const labelStats = useMemo(() => {
    const m = new Map<string, { n: number; web: number }>();
    for (const i of inBrand) {
      const k = i.label_id && labelMap.has(i.label_id) ? i.label_id : NONE;
      const s = m.get(k) ?? { n: 0, web: 0 };
      s.n++;
      if (onShop.has(i.parent_sku_id)) s.web++;
      m.set(k, s);
    }
    return m;
  }, [inBrand, labelMap, onShop]);

  const itemById = useMemo(() => new Map((cat?.items ?? []).map((i) => [i.parent_sku_id, i])), [cat]);
  const selItems = [...sel].map((id) => itemById.get(id)).filter((x): x is SkuPickerItem => !!x);
  const warnItems = warn ? selItems.filter((i) => i.label_id && warn.label.test(labelMap.get(i.label_id)?.name ?? "")) : [];
  const toggle = (id: string) => {
    if (onShop.has(id)) return;
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const pageSelectable = pageRows.filter((i) => !onShop.has(i.parent_sku_id));
  const pageAllOn = pageSelectable.length > 0 && pageSelectable.every((i) => sel.has(i.parent_sku_id));
  const togglePage = () =>
    setSel((s) => {
      const n = new Set(s);
      for (const i of pageSelectable) {
        if (pageAllOn) n.delete(i.parent_sku_id);
        else n.add(i.parent_sku_id);
      }
      return n;
    });

  const confirm = async () => {
    if (!sel.size || saving) return;
    setSaving(true);
    try {
      const ok = await onConfirm([...sel]);
      if (ok !== false) onClose();
    } finally {
      setSaving(false);
    }
  };

  const labelPill = (i: SkuPickerItem) => {
    const l = i.label_id ? labelMap.get(i.label_id) : null;
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 min-w-0">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l?.color || "#cbd5e1" }} />
        <span className="truncate">{l ? labelName(l) : t("ยังไม่ติดป้าย", "No label yet")}</span>
      </span>
    );
  };
  const colors = (i: SkuPickerItem) => (
    <span className={`text-[11px] whitespace-nowrap ${i.sku_total && i.sku_active < i.sku_total / 2 ? "text-amber-700" : "text-slate-500"}`} title={t("สี/แบบที่ยังเปิดใช้ / ทั้งหมด", "Active colors/variants / total")}>
      🎨 {i.sku_active}/{i.sku_total}
    </span>
  );
  const brandName = (id: string) => (id === ALL ? t("ทุกแบรนด์", "All brands") : id === NONE ? t("ไม่มีแบรนด์", "No brand") : brandMap.get(id)?.name ?? "?");
  const brandOrder = [...brandCount.entries()].filter(([k]) => k !== NONE).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const listCols = "grid-cols-[28px_40px_minmax(0,1fr)_9rem_4.5rem_5.5rem]";

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="xl"
      hasUnsavedChanges={sel.size > 0}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[12rem]">
            <p className="text-sm font-medium text-slate-800">
              {sel.size ? t(`เลือกแล้ว ${sel.size} รุ่น`, `${sel.size} models selected`) : t("ยังไม่ได้เลือก", "Nothing selected")}
              {sel.size > 0 && <span className="font-normal text-slate-500"> · {selItems.slice(0, 6).map((i) => i.code).join(", ")}{sel.size > 6 ? "…" : ""}</span>}
              {sel.size > 0 && (
                <button type="button" onClick={() => setSel(new Set())} className="ml-2 text-xs text-slate-400 hover:text-rose-600">
                  {t("ล้าง", "Clear")}
                </button>
              )}
            </p>
            {warn && warnItems.length > 0 && (
              <p className="text-[11px] text-amber-700">
                ⚠️ {t(`${warnItems.length} รุ่นติดป้าย`, `${warnItems.length} models labelled`)} {[...new Set(warnItems.map((i) => labelName(labelMap.get(i.label_id!))))].join(" / ")} ({warnItems.slice(0, 4).map((i) => i.code).join(", ")}) — {warn.note}
              </p>
            )}
          </div>
          {footerExtra}
          <button type="button" onClick={() => void confirm()} disabled={!sel.size || saving} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
            {saving ? busyText : confirmText(sel.size)}
          </button>
        </div>
      }
    >
      {err ? (
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {err}{" "}
          <button type="button" onClick={() => void doLoad()} className="underline">
            {t("ลองใหม่", "Try again")}
          </button>
        </div>
      ) : !cat ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {/* แท็บ + ลิงก์หน้าเต็ม */}
          <div className="flex items-end gap-1 border-b border-slate-200">
            {TABS.map((tb) => (
              <button
                key={tb}
                type="button"
                onClick={() => {
                  setTab(tb);
                  void saveDefault(tb);
                }}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === tb ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
              >
                {tb === "mkt" ? t("🎯 SKU การตลาด", "🎯 Marketing SKUs") : t("☰ รายการสินค้า", "☰ Product list")}
              </button>
            ))}
            {showFullPageLink && (
              <a href="/marketing/skus" target="_blank" rel="noopener" className="ml-auto pb-2 text-xs text-blue-600 hover:underline">
                {t("เปิดหน้า SKU การตลาดเต็ม ↗", "Open full Marketing SKUs page ↗")}
              </a>
            )}
          </div>

          {/* ตัวกรอง */}
          {tab === "mkt" ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                {t("แบรนด์:", "Brand:")}
                {brandOrder.map((id) => (
                  <button key={id} type="button" className={chip(brand === id)} onClick={() => setBrand(id)}>
                    {brandMap.get(id)?.color && <span className="w-2 h-2 rounded-full" style={{ background: brandMap.get(id)!.color! }} />}
                    {brandName(id)} <b className="font-medium">{brandCount.get(id)}</b>
                  </button>
                ))}
                {brandCount.has(NONE) && (
                  <button type="button" className={chip(brand === NONE)} onClick={() => setBrand(NONE)}>
                    {t("ไม่มีแบรนด์", "No brand")} {brandCount.get(NONE)}
                  </button>
                )}
                <button type="button" className={chip(brand === ALL)} onClick={() => setBrand(ALL)}>
                  {t("ทุกแบรนด์", "All brands")}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={chip(label === ALL)} onClick={() => setLabel(ALL)}>
                  {t("ทั้งหมด", "All")} <b className="font-medium">{inBrand.length}</b>
                  <span className="text-[10px] opacity-60">· {taken.short} {inBrand.filter((i) => onShop.has(i.parent_sku_id)).length}</span>
                </button>
                {cat.labels
                  .filter((l) => labelStats.has(l.id))
                  .map((l) => (
                    <button key={l.id} type="button" className={chip(label === l.id)} onClick={() => setLabel(l.id)}>
                      <span className="w-2 h-2 rounded-full" style={{ background: l.color || "#cbd5e1" }} />
                      {labelName(l)} <b className="font-medium">{labelStats.get(l.id)!.n}</b>
                      <span className="text-[10px] opacity-60">· {taken.short} {labelStats.get(l.id)!.web}</span>
                    </button>
                  ))}
                {labelStats.has(NONE) && (
                  <button type="button" className={chip(label === NONE)} onClick={() => setLabel(NONE)}>
                    {t("ยังไม่ติดป้าย", "No label yet")} <b className="font-medium">{labelStats.get(NONE)!.n}</b>
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <select value={brand} onChange={(e) => setBrand(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">
                <option value={ALL}>{t("ทุกแบรนด์", "All brands")}</option>
                {brandOrder.map((id) => (
                  <option key={id} value={id}>
                    {brandName(id)} ({brandCount.get(id)})
                  </option>
                ))}
                {brandCount.has(NONE) && <option value={NONE}>{t("ไม่มีแบรนด์", "No brand")}</option>}
              </select>
              {hasCategories && (
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">
                  <option value={ALL}>{t("ทุกหมวด", "All categories")}</option>
                  {cat.categories!.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value={NONE}>{t("ไม่มีหมวด", "No category")}</option>
                </select>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นรหัส หรือ ชื่อ เช่น BPU04, Nikita", "Search code or name e.g. BPU04, Nikita")} className="h-9 flex-1 min-w-[12rem] rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={hideOn} onChange={(e) => setHideOn(e.target.checked)} className="w-4 h-4 accent-blue-600" />
              {taken.hide}
            </label>
            {tab === "mkt" && <GalleryColumnsControl as="select" cols={cols} onChange={setCols} />}
            {pageSelectable.length > 0 && (
              <button type="button" onClick={togglePage} className="text-xs text-blue-600 hover:underline">
                {pageAllOn ? t("เอาติ๊กหน้านี้ออก", "Untick this page") : t(`ติ๊กทั้งหน้านี้ (${pageSelectable.length})`, `Tick this page (${pageSelectable.length})`)}
              </button>
            )}
          </div>

          {/* รายการ */}
          {!filtered.length ? (
            <p className="py-10 text-center text-sm text-slate-400">{t("ไม่พบสินค้า ลองเปลี่ยนป้าย/แบรนด์ หรือคำค้น", "No products found — try another label/brand or search")}</p>
          ) : tab === "mkt" ? (
            <div className="grid grid-cols-2 gap-2.5 sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ ["--cols" as string]: cols } as React.CSSProperties}>
              {pageRows.map((i) => {
                const on = onShop.has(i.parent_sku_id);
                const picked = sel.has(i.parent_sku_id);
                const img = r2ImageUrl(i.image_key, 300);
                return (
                  <button
                    key={i.parent_sku_id}
                    type="button"
                    onClick={() => toggle(i.parent_sku_id)}
                    disabled={on}
                    className={`relative overflow-hidden rounded-xl border bg-white text-left transition ${picked ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-400"} ${on ? "opacity-50 cursor-default" : ""}`}
                  >
                    <div className="relative aspect-square bg-slate-100">
                      {img && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                      <input type="checkbox" readOnly tabIndex={-1} checked={picked || on} className="absolute left-2 top-2 w-4 h-4 accent-blue-600 pointer-events-none" />
                      {i.badge_ids.length > 0 && (
                        <span className="absolute right-1.5 top-1.5 flex max-w-[70%] flex-wrap justify-end gap-1">
                          {i.badge_ids.map((b) => badgeMap.get(b)).filter(Boolean).slice(0, 3).map((b) => (
                            <span key={b!.id} className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: b!.color || "#64748b" }}>
                              {labelName(b)}
                            </span>
                          ))}
                        </span>
                      )}
                      {on && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white">{taken.badge}</span>}
                    </div>
                    <div className="space-y-0.5 px-2 py-1.5">
                      <p className="font-mono text-xs font-semibold text-slate-800">{i.code}</p>
                      <p className="truncate text-[11px] text-slate-500" title={i.name}>
                        {i.name}
                      </p>
                      <div className="flex items-center justify-between gap-1">
                        {labelPill(i)}
                        {colors(i)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className={`grid ${listCols} items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500`}>
                <input type="checkbox" checked={pageAllOn} onChange={togglePage} className="w-4 h-4 accent-blue-600" aria-label={t("ติ๊กทั้งหน้า", "Tick whole page")} />
                <span />
                <span>{t("รุ่น", "Model")}</span>
                <span>{t("ป้ายการตลาด", "Marketing label")}</span>
                <span>{t("สีเหลือ", "Colors left")}</span>
                <span>{taken.short}</span>
              </div>
              {pageRows.map((i) => {
                const on = onShop.has(i.parent_sku_id);
                const img = r2ImageUrl(i.image_key, 80);
                return (
                  <div
                    key={i.parent_sku_id}
                    onClick={() => toggle(i.parent_sku_id)}
                    className={`grid ${listCols} items-center gap-2 border-b border-slate-100 px-2 py-1.5 text-sm ${on ? "opacity-50" : "cursor-pointer hover:bg-slate-50"} ${sel.has(i.parent_sku_id) ? "bg-blue-50/60" : ""}`}
                  >
                    <input type="checkbox" readOnly tabIndex={-1} checked={sel.has(i.parent_sku_id) || on} disabled={on} className="w-4 h-4 accent-blue-600 pointer-events-none" />
                    <span className="h-9 w-9 overflow-hidden rounded bg-slate-100">
                      {img && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-slate-800">{i.name}</span>
                      <span className="text-[11px] text-slate-400">
                        {i.code}
                        {i.category_id && catName.has(i.category_id) ? ` · ${catName.get(i.category_id)}` : ""}
                      </span>
                    </span>
                    {labelPill(i)}
                    {colors(i)}
                    <span className={`text-xs ${on ? "text-emerald-700" : "text-slate-300"}`}>{on ? taken.row : "—"}</span>
                  </div>
                );
              })}
            </div>
          )}
          {filtered.length > PAGE_SIZE && <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} unitLabel={t("รุ่น", "models")} />}
        </div>
      )}
    </ERPModal>
  );
}
