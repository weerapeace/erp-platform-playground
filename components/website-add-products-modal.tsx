"use client";
/**
 * ➕ ป๊อป "เพิ่มสินค้าเข้าเว็บ" (แท็บ สินค้าบนเว็บ ของหน้า /website/<slug>)
 *   แท็บ 🎯 SKU การตลาด = การ์ดแบบหน้า SKU การตลาด: แยกแบรนด์ (เปิดที่แบรนด์ของร้าน) · กรองป้ายหลัก (นับบนเว็บแล้วกี่รุ่น) · ป้ายเสริม · สีที่เหลือ
 *   แท็บ ☰ รายการสินค้า = ตาราง: ค้นหา · แบรนด์ · หมวด ERP
 *   ติ๊กได้หลายรุ่น (จำข้ามแท็บ/หน้า) → เพิ่มทีเดียว · ค่าเริ่มต้น "ซ่อนไว้ก่อน" (เจ้าของเลือก) ไปตั้งรูป/ราคา/หมวดก่อนค่อยขึ้นเว็บ
 *   รุ่นที่อยู่บนเว็บแล้ว = ติ๊กไม่ได้ · ป้าย Out Of Stock / ไม่ใช่สินค้าสำหรับขาย = เตือนก่อนเพิ่ม
 * ข้อมูล: GET /api/website/listings/catalog (ตัวโหลดกลางเดียวกับหน้า SKU การตลาด) · POST /api/website/listings action addMany (audit)
 * ของกลาง: ERPModal · Pager · useViewPref · r2ImageUrl · GalleryColumns (จำนวนการ์ดต่อแถว จำรายคน)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { Pager } from "@/components/pager";
import { useViewPref } from "@/lib/use-view-pref";
import { r2ImageUrl } from "@/lib/r2-image";
import { useGalleryColumns, GalleryColumnsControl } from "@/components/gallery-columns";
import type { MarketingBrand, MarketingSkuItem, MarketingSkuLabel } from "@/lib/marketing/sku-list";

type Item = MarketingSkuItem & { category_id: string | null };
type Catalog = { items: Item[]; labels: MarketingSkuLabel[]; badges: MarketingSkuLabel[]; brands: MarketingBrand[]; categories: { id: string; name: string }[]; onShop: string[]; shopBrandId: string | null };

const TABS = ["mkt", "list"] as const;
const ALL = "__all";
const NONE = "__none";
const PAGE_SIZE = 60;
/** ป้ายที่ควรเตือนก่อนเอาขึ้นเว็บ */
const WARN_LABEL = /out of stock|ไม่ใช่สินค้าสำหรับขาย/i;

const chip = (on: boolean) =>
  `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`;

export function WebsiteAddProductsModal({ open, onClose, shop, onAdded }: { open: boolean; onClose: () => void; shop: { id: string; slug: string; name: string }; onAdded: () => void | Promise<void> }) {
  const toast = useToast();
  const { view: tab, setView: setTab, saveDefault } = useViewPref("website_add_products_tab", TABS, "mkt");
  const [cat, setCatalog] = useState<Catalog | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [brand, setBrand] = useState<string>(ALL);
  const [label, setLabel] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);
  const [q, setQ] = useState("");
  const [hideOn, setHideOn] = useState(true);
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [publish, setPublish] = useState(false);
  const [saving, setSaving] = useState(false);
  // ▦ การ์ดต่อแถว (dropdown · จำรายคน) — มือถือ 2 ใบเสมอ
  const { cols, setCols } = useGalleryColumns("website-add-products", 6);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await (await apiFetch(`/api/website/listings/catalog?shop=${encodeURIComponent(shop.slug)}`)).json();
      if (j.error) return setErr(j.error);
      setCatalog(j as Catalog);
      setBrand((j as Catalog).shopBrandId ?? ALL);
    } catch {
      setErr("โหลดรายการสินค้าไม่สำเร็จ");
    }
  }, [shop.slug]);
  useEffect(() => {
    if (!open) return;
    setSel(new Set());
    setQ("");
    setLabel(ALL);
    setCategory(ALL);
    setPage(0);
    setPublish(false);
    void load();
  }, [open, load]);

  const onShop = useMemo(() => new Set(cat?.onShop ?? []), [cat]);
  const labelMap = useMemo(() => new Map((cat?.labels ?? []).map((l) => [l.id, l])), [cat]);
  const badgeMap = useMemo(() => new Map((cat?.badges ?? []).map((l) => [l.id, l])), [cat]);
  const brandMap = useMemo(() => new Map((cat?.brands ?? []).map((b) => [b.id, b])), [cat]);
  const catName = useMemo(() => new Map((cat?.categories ?? []).map((c) => [c.id, c.name])), [cat]);

  // ตัวกรองทีละชั้น: แบรนด์ → (ค้นหา/ซ่อนที่อยู่บนเว็บ) → ป้าย/หมวด
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

  // นับต่อแบรนด์ / ต่อป้าย (ป้าย: รวม + บนเว็บแล้วกี่รุ่น — ของแบรนด์ที่เลือก)
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
  const selItems = [...sel].map((id) => itemById.get(id)).filter((x): x is Item => !!x);
  const warnItems = selItems.filter((i) => i.label_id && WARN_LABEL.test(labelMap.get(i.label_id)?.name ?? ""));
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

  const add = async () => {
    if (!sel.size) return;
    setSaving(true);
    try {
      const j = await (await apiFetch("/api/website/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId: shop.id, action: "addMany", parentIds: [...sel], publish }) })).json();
      if (!j.ok) return toast.error(j.error ?? "เพิ่มไม่สำเร็จ");
      toast.success(`เพิ่ม ${j.added} รุ่นเข้าเว็บแล้ว${publish ? " (ขึ้นเว็บทันที)" : " — ซ่อนไว้ก่อน ไปตั้งรูป/ราคา/หมวดแล้วค่อยเปิด"}${j.skipped ? ` · ข้าม ${j.skipped} (อยู่แล้ว)` : ""}`);
      await onAdded();
      onClose();
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  };

  const labelPill = (i: Item) => {
    const l = i.label_id ? labelMap.get(i.label_id) : null;
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 min-w-0">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l?.color || "#cbd5e1" }} />
        <span className="truncate">{l?.name ?? "ยังไม่ติดป้าย"}</span>
      </span>
    );
  };
  const colors = (i: Item) => (
    <span className={`text-[11px] whitespace-nowrap ${i.sku_total && i.sku_active < i.sku_total / 2 ? "text-amber-700" : "text-slate-500"}`} title="สี/แบบที่ยังเปิดใช้ / ทั้งหมด">
      🎨 {i.sku_active}/{i.sku_total}
    </span>
  );
  const brandName = (id: string) => (id === ALL ? "ทุกแบรนด์" : id === NONE ? "ไม่มีแบรนด์" : brandMap.get(id)?.name ?? "?");
  const brandOrder = [...brandCount.entries()].filter(([k]) => k !== NONE).sort((a, b) => b[1] - a[1]).map(([k]) => k);

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={`➕ เพิ่มสินค้าเข้าเว็บ — ${shop.name}`}
      description="ติ๊กได้หลายรุ่น (จำข้ามแท็บ/ข้ามหน้า) แล้วกดเพิ่มทีเดียว"
      size="xl"
      hasUnsavedChanges={sel.size > 0}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[12rem]">
            <p className="text-sm font-medium text-slate-800">
              {sel.size ? `เลือกแล้ว ${sel.size} รุ่น` : "ยังไม่ได้เลือก"}
              {sel.size > 0 && <span className="font-normal text-slate-500"> · {selItems.slice(0, 6).map((i) => i.code).join(", ")}{sel.size > 6 ? "…" : ""}</span>}
              {sel.size > 0 && (
                <button type="button" onClick={() => setSel(new Set())} className="ml-2 text-xs text-slate-400 hover:text-rose-600">
                  ล้าง
                </button>
              )}
            </p>
            {warnItems.length > 0 && (
              <p className="text-[11px] text-amber-700">
                ⚠️ {warnItems.length} รุ่นติดป้าย {[...new Set(warnItems.map((i) => labelMap.get(i.label_id!)?.name))].join(" / ")} ({warnItems.slice(0, 4).map((i) => i.code).join(", ")}) — ยังเพิ่มได้ แนะนำซ่อนไว้ก่อน
              </p>
            )}
          </div>
          <select value={publish ? "pub" : "hide"} onChange={(e) => setPublish(e.target.value === "pub")} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700">
            <option value="hide">ซ่อนไว้ก่อน (ไปตั้งรูป/ราคา/หมวด)</option>
            <option value="pub">ขึ้นเว็บทันที</option>
          </select>
          <button type="button" onClick={() => void add()} disabled={!sel.size || saving} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
            {saving ? "กำลังเพิ่ม…" : sel.size ? `เพิ่ม ${sel.size} รุ่นเข้าเว็บ` : "เพิ่มเข้าเว็บ"}
          </button>
        </div>
      }
    >
      {err ? (
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {err}{" "}
          <button type="button" onClick={() => void load()} className="underline">
            ลองใหม่
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
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  void saveDefault(t);
                }}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
              >
                {t === "mkt" ? "🎯 SKU การตลาด" : "☰ รายการสินค้า"}
              </button>
            ))}
            <a href="/marketing/skus" target="_blank" rel="noopener" className="ml-auto pb-2 text-xs text-blue-600 hover:underline">
              เปิดหน้า SKU การตลาดเต็ม ↗
            </a>
          </div>

          {/* ตัวกรอง */}
          {tab === "mkt" ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                แบรนด์:
                {brandOrder.map((id) => (
                  <button key={id} type="button" className={chip(brand === id)} onClick={() => setBrand(id)}>
                    {brandMap.get(id)?.color && <span className="w-2 h-2 rounded-full" style={{ background: brandMap.get(id)!.color! }} />}
                    {brandName(id)} <b className="font-medium">{brandCount.get(id)}</b>
                  </button>
                ))}
                {brandCount.has(NONE) && (
                  <button type="button" className={chip(brand === NONE)} onClick={() => setBrand(NONE)}>
                    ไม่มีแบรนด์ {brandCount.get(NONE)}
                  </button>
                )}
                <button type="button" className={chip(brand === ALL)} onClick={() => setBrand(ALL)}>
                  ทุกแบรนด์
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={chip(label === ALL)} onClick={() => setLabel(ALL)}>
                  ทั้งหมด <b className="font-medium">{inBrand.length}</b>
                  <span className="text-[10px] opacity-60">· เว็บ {inBrand.filter((i) => onShop.has(i.parent_sku_id)).length}</span>
                </button>
                {cat.labels
                  .filter((l) => labelStats.has(l.id))
                  .map((l) => (
                    <button key={l.id} type="button" className={chip(label === l.id)} onClick={() => setLabel(l.id)}>
                      <span className="w-2 h-2 rounded-full" style={{ background: l.color || "#cbd5e1" }} />
                      {l.name} <b className="font-medium">{labelStats.get(l.id)!.n}</b>
                      <span className="text-[10px] opacity-60">· เว็บ {labelStats.get(l.id)!.web}</span>
                    </button>
                  ))}
                {labelStats.has(NONE) && (
                  <button type="button" className={chip(label === NONE)} onClick={() => setLabel(NONE)}>
                    ยังไม่ติดป้าย <b className="font-medium">{labelStats.get(NONE)!.n}</b>
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <select value={brand} onChange={(e) => setBrand(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">
                <option value={ALL}>ทุกแบรนด์</option>
                {brandOrder.map((id) => (
                  <option key={id} value={id}>
                    {brandName(id)} ({brandCount.get(id)})
                  </option>
                ))}
                {brandCount.has(NONE) && <option value={NONE}>ไม่มีแบรนด์</option>}
              </select>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">
                <option value={ALL}>ทุกหมวด</option>
                {cat.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value={NONE}>ไม่มีหมวด</option>
              </select>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นรหัส หรือ ชื่อ เช่น BPU04, Nikita" className="h-9 flex-1 min-w-[12rem] rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={hideOn} onChange={(e) => setHideOn(e.target.checked)} className="w-4 h-4 accent-blue-600" />
              ซ่อนที่อยู่บนเว็บแล้ว
            </label>
            {tab === "mkt" && <GalleryColumnsControl as="select" cols={cols} onChange={setCols} />}
            {pageSelectable.length > 0 && (
              <button type="button" onClick={togglePage} className="text-xs text-blue-600 hover:underline">
                {pageAllOn ? "เอาติ๊กหน้านี้ออก" : `ติ๊กทั้งหน้านี้ (${pageSelectable.length})`}
              </button>
            )}
          </div>

          {/* รายการ */}
          {!filtered.length ? (
            <p className="py-10 text-center text-sm text-slate-400">ไม่พบสินค้า ลองเปลี่ยนป้าย/แบรนด์ หรือคำค้น</p>
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
                              {b!.name}
                            </span>
                          ))}
                        </span>
                      )}
                      {on && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white">อยู่บนเว็บแล้ว</span>}
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
              <div className="grid grid-cols-[28px_40px_minmax(0,1fr)_9rem_4.5rem_5.5rem] items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">
                <input type="checkbox" checked={pageAllOn} onChange={togglePage} className="w-4 h-4 accent-blue-600" aria-label="ติ๊กทั้งหน้า" />
                <span />
                <span>รุ่น</span>
                <span>ป้ายการตลาด</span>
                <span>สีเหลือ</span>
                <span>บนเว็บ</span>
              </div>
              {pageRows.map((i) => {
                const on = onShop.has(i.parent_sku_id);
                const img = r2ImageUrl(i.image_key, 80);
                return (
                  <div
                    key={i.parent_sku_id}
                    onClick={() => toggle(i.parent_sku_id)}
                    className={`grid grid-cols-[28px_40px_minmax(0,1fr)_9rem_4.5rem_5.5rem] items-center gap-2 border-b border-slate-100 px-2 py-1.5 text-sm ${on ? "opacity-50" : "cursor-pointer hover:bg-slate-50"} ${sel.has(i.parent_sku_id) ? "bg-blue-50/60" : ""}`}
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
                    <span className={`text-xs ${on ? "text-emerald-700" : "text-slate-300"}`}>{on ? "✓ อยู่แล้ว" : "—"}</span>
                  </div>
                );
              })}
            </div>
          )}
          {filtered.length > PAGE_SIZE && <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} unitLabel="รุ่น" />}
        </div>
      )}
    </ERPModal>
  );
}
