"use client";

/**
 * BrandAlbumBrowser — มุมมอง "ดูตามแบรนด์" ของคลังไฟล์ (DAM)
 *
 * เดิน: แบรนด์ → Parent SKU → [รูป Parent | โฟลเดอร์ SKUs (ย่อยราย SKU) | โฟลเดอร์ Description]
 * อ่านจาก /api/assets/brand-tree (ผูกสินค้าผ่าน asset_usages เดิม — auto, ไม่ต้องจัดอัลบั้มมือ)
 * คลิกรูป → onOpenAsset(id) เปิด DetailModal ตัวเดียวกับหน้าคลัง
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { withImageWidth } from "@/lib/r2-image";
import { useToast } from "@/components/toast";
import type { AssetRow } from "@/app/api/assets/shared";

type Brand = { brand_id: string | null; brand_name: string; brand_color: string | null; parent_count: number; image_count: number };
type ParentRow = { parent_id: string; code: string; name_th: string | null; parent_img: number; sku_count: number; sku_img: number; desc_img: number };
type SkuFolder = { id: string; code: string; name: string; img_count: number };   // lazy — รูปโหลดตอนกาง (mode=sku)
type ParentDetail = { parent: { id: string; code: string; name: string } | null; parentImages: AssetRow[]; skus: SkuFolder[]; description: AssetRow[] };

const fmt = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("th-TH");
const reorderByIds = (arr: AssetRow[], ids: string[]) => { const m = new Map(arr.map((a) => [a.id, a])); return ids.map((id) => m.get(id)).filter((x): x is AssetRow => !!x); };

function Thumb({ a, onOpen }: { a: AssetRow; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  return (
    <button onClick={onOpen} title={a.title}
      className="group relative rounded-lg border border-slate-200 overflow-hidden bg-white text-left hover:border-indigo-300 hover:shadow-sm transition">
      <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
        {a.asset_type === "image" && !broken
          ? <img src={withImageWidth(a.url, 200) ?? a.url} alt={a.title} loading="lazy" onError={() => setBroken(true)} className="w-full h-full object-cover" />
          : <span className="text-2xl">🖼️</span>}
      </div>
      <p className="px-1.5 py-1 text-[10px] text-slate-600 truncate">{a.title}</p>
    </button>
  );
}

// กริดรูป + ลากเรียงลำดับ (onReorder คืน asset_ids ตามลำดับใหม่)
function ReorderableGrid({ items, onOpen, onReorder }: { items: AssetRow[]; onOpen: (id: string) => void; onReorder?: (orderedIds: string[]) => void }) {
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  useEffect(() => { setOrder(items.map((i) => i.id)); }, [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const dragIdx = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  if (items.length === 0) return <p className="text-[12px] text-slate-400 py-2">— ยังไม่มีรูป —</p>;

  const drop = (toIdx: number) => {
    const from = dragIdx.current; dragIdx.current = null; setOverIdx(null);
    if (from == null || from === toIdx) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(toIdx, 0, moved);
    setOrder(next);
    onReorder?.(next);
  };

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))" }}>
      {order.map((id, idx) => {
        const a = byId.get(id); if (!a) return null;
        return (
          <div key={id}
            draggable={!!onReorder}
            onDragStart={() => { dragIdx.current = idx; }}
            onDragOver={(e) => { if (onReorder) { e.preventDefault(); if (overIdx !== idx) setOverIdx(idx); } }}
            onDrop={(e) => { e.preventDefault(); drop(idx); }}
            onDragEnd={() => { dragIdx.current = null; setOverIdx(null); }}
            className={`rounded-lg ${onReorder ? "cursor-grab active:cursor-grabbing" : ""} ${overIdx === idx ? "ring-2 ring-indigo-400" : ""}`}>
            <Thumb a={a} onOpen={() => onOpen(a.id)} />
          </div>
        );
      })}
    </div>
  );
}

function Crumb({ label, onClick, last }: { label: string; onClick?: () => void; last?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {onClick && !last
        ? <button onClick={onClick} className="text-indigo-600 hover:underline">{label}</button>
        : <span className="text-slate-700 font-medium">{label}</span>}
    </span>
  );
}

export function BrandAlbumBrowser({ onOpenAsset, reloadKey }: { onOpenAsset: (id: string) => void; reloadKey?: number }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [loadingParents, setLoadingParents] = useState(false);
  const [detail, setDetail] = useState<ParentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [openSku, setOpenSku] = useState<Set<string>>(new Set());
  const [skuImages, setSkuImages] = useState<Record<string, AssetRow[]>>({});   // lazy cache รูปต่อ SKU
  const [skuLoading, setSkuLoading] = useState<Set<string>>(new Set());
  const toast = useToast();

  // บันทึกลำดับรูปในโฟลเดอร์ (optimistic — UI ขยับแล้ว, ยิงเก็บเงียบ ๆ)
  const saveOrder = useCallback(async (module: string, recordId: string, ids: string[]) => {
    if (!recordId) return;
    try {
      const res = await apiFetch("/api/assets/brand-tree", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, record_id: recordId, ordered_asset_ids: ids }),
      });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error || "บันทึกลำดับไม่สำเร็จ");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกลำดับไม่สำเร็จ"); }
  }, [toast]);

  const loadBrands = useCallback(async () => {
    setLoadingBrands(true);
    try { const j = await apiFetch("/api/assets/brand-tree?mode=brands").then((r) => r.json()); setBrands(j.brands ?? []); }
    catch { /* ignore */ } finally { setLoadingBrands(false); }
  }, []);
  useEffect(() => { void loadBrands(); }, [loadBrands, reloadKey]);

  const openBrand = async (b: Brand) => {
    setBrand(b); setDetail(null); setParents([]); setLoadingParents(true);
    try { window.history.pushState({ __brandNav: { level: "parents" } }, ""); } catch { /* ignore */ }
    try { const j = await apiFetch(`/api/assets/brand-tree?mode=parents&brand_id=${b.brand_id ?? "none"}`).then((r) => r.json()); setParents(j.parents ?? []); }
    catch { /* ignore */ } finally { setLoadingParents(false); }
  };
  const openParent = async (pid: string) => {
    setDetail(null); setLoadingDetail(true); setOpenSku(new Set()); setSkuImages({});
    try { window.history.pushState({ __brandNav: { level: "parent" } }, ""); } catch { /* ignore */ }
    try { const j = await apiFetch(`/api/assets/brand-tree?mode=parent&parent_id=${pid}`).then((r) => r.json()); setDetail(j as ParentDetail); }
    catch { /* ignore */ } finally { setLoadingDetail(false); }
  };
  // กางโฟลเดอร์ SKU → โหลดรูปครั้งแรกแบบ lazy (ไม่ดึงรูปทุก SKU พร้อมกัน = เร็วขึ้น)
  const toggleSku = (s: SkuFolder) => {
    const isOpen = openSku.has(s.id);
    setOpenSku((prev) => { const n = new Set(prev); if (isOpen) n.delete(s.id); else n.add(s.id); return n; });
    if (!isOpen && skuImages[s.id] === undefined) {
      setSkuLoading((p) => new Set(p).add(s.id));
      apiFetch(`/api/assets/brand-tree?mode=sku&sku_id=${s.id}`).then((r) => r.json())
        .then((j) => setSkuImages((m) => ({ ...m, [s.id]: (j.images ?? []) as AssetRow[] })))
        .catch(() => setSkuImages((m) => ({ ...m, [s.id]: [] })))
        .finally(() => setSkuLoading((p) => { const n = new Set(p); n.delete(s.id); return n; }));
    }
  };

  const backToBrands = () => { setBrand(null); setParents([]); setDetail(null); };
  const backToParents = () => setDetail(null);

  // ปุ่ม Back เบราว์เซอร์ย้อนทีละชั้น (Parent → แบรนด์ → ทุกแบรนด์) — พฤติกรรมย้อนกลับของกลางเหมือนหน้าอื่น
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const s = (e.state as { __brandNav?: { level?: string } } | null)?.__brandNav;
      if (!s) { setBrand(null); setParents([]); setDetail(null); }   // ถึงราก = ทุกแบรนด์
      else if (s.level === "parents") setDetail(null);               // กลับชั้นแบรนด์ (parents ยังอยู่)
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // breadcrumb
  const crumbs = (
    <div className="flex items-center gap-1.5 text-[13px] mb-3 flex-wrap">
      <Crumb label="🏷️ ทุกแบรนด์" onClick={backToBrands} last={!brand} />
      {brand && <><span className="text-slate-300">›</span><Crumb label={brand.brand_name} onClick={backToParents} last={!detail} /></>}
      {detail?.parent && <><span className="text-slate-300">›</span><Crumb label={`${detail.parent.code} · ${detail.parent.name}`} last /></>}
    </div>
  );

  // ── ระดับ 3: รายละเอียด Parent ──
  if (brand && detail) {
    return (
      <div>
        {crumbs}
        {loadingDetail ? <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div> : (
          <div className="flex flex-col gap-5">
            <section>
              <p className="text-[13px] font-medium text-slate-700 mb-2">🖼️ รูปที่ลงใน Parent SKU <span className="text-slate-400 font-normal">({fmt(detail.parentImages.length)})</span>
                {detail.parentImages.length > 1 && <span className="text-[11px] text-slate-300 ml-1">· ลากรูปเพื่อจัดลำดับ</span>}</p>
              <ReorderableGrid items={detail.parentImages} onOpen={onOpenAsset} onReorder={(ids) => saveOrder("parent_sku", detail.parent?.id ?? "", ids)} />
            </section>

            <section>
              <p className="text-[13px] font-medium text-slate-700 mb-2">📂 SKUs <span className="text-slate-400 font-normal">({fmt(detail.skus.length)} ตัวที่มีรูป)</span></p>
              {detail.skus.length === 0 ? <p className="text-[12px] text-slate-400">— SKU ลูกยังไม่มีรูป —</p> : (
                <div className="flex flex-col gap-1.5">
                  {detail.skus.map((s) => {
                    const open = openSku.has(s.id);
                    const imgs = skuImages[s.id];
                    return (
                      <div key={s.id} className="rounded-lg border border-slate-200 bg-white">
                        <button onClick={() => toggleSku(s)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 rounded-lg">
                          <span className="text-slate-400 text-xs w-3">{open ? "▾" : "▸"}</span>
                          <span className="text-base">📂</span>
                          <span className="font-mono text-[12px] text-slate-700">{s.code}</span>
                          <span className="text-[12px] text-slate-500 truncate flex-1">{s.name}</span>
                          <span className="text-[11px] text-slate-400">{fmt(s.img_count)} รูป</span>
                        </button>
                        {open && (
                          <div className="px-3 pb-3">
                            {skuLoading.has(s.id) || imgs === undefined
                              ? <p className="text-[12px] text-slate-400 py-2">กำลังโหลด…</p>
                              : <ReorderableGrid items={imgs} onOpen={onOpenAsset}
                                  onReorder={(ids) => { setSkuImages((m) => ({ ...m, [s.id]: reorderByIds(m[s.id] ?? [], ids) })); void saveOrder("product_sku", s.id, ids); }} />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <p className="text-[13px] font-medium text-slate-700 mb-2">📂 Description <span className="text-slate-400 font-normal">({fmt(detail.description.length)})</span></p>
              {detail.description.length === 0
                ? <p className="text-[12px] text-slate-400">— ยังไม่มีรูป Description — <span className="text-slate-300">(เพิ่มได้ที่ฟอร์ม Parent SKU → ช่อง “รูป Description”)</span></p>
                : <ReorderableGrid items={detail.description} onOpen={onOpenAsset} onReorder={(ids) => saveOrder("parent_sku_description", detail.parent?.id ?? "", ids)} />}
            </section>
          </div>
        )}
      </div>
    );
  }

  // ── ระดับ 2: Parent ในแบรนด์ ──
  if (brand) {
    return (
      <div>
        {crumbs}
        {loadingParents ? <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
          : parents.length === 0 ? <div className="py-10 text-center text-slate-400 text-sm">ยังไม่มี Parent SKU ที่มีรูปในแบรนด์นี้</div>
          : (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
              {parents.map((p) => (
                <button key={p.parent_id} onClick={() => openParent(p.parent_id)}
                  className="text-left rounded-xl border border-slate-200 bg-white p-3 hover:border-indigo-300 hover:shadow-sm transition">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{p.code}</span>
                    <span className="text-slate-300">›</span>
                  </div>
                  <p className="text-[13px] text-slate-700 mt-1 truncate">{p.name_th || "—"}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">🖼️ {fmt(p.parent_img)}</span>
                    <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-600">📂 SKUs {fmt(p.sku_img)}</span>
                    {p.desc_img > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">📂 Desc {fmt(p.desc_img)}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
      </div>
    );
  }

  // ── ระดับ 1: แบรนด์ ──
  return (
    <div>
      {crumbs}
      {loadingBrands ? <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
        : brands.length === 0 ? <div className="py-10 text-center text-slate-400 text-sm">ยังไม่มีรูปที่ผูกกับสินค้า</div>
        : (
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {brands.map((b) => (
              <button key={b.brand_id ?? "none"} onClick={() => openBrand(b)}
                className="text-left rounded-xl border border-slate-200 bg-white p-3.5 hover:border-indigo-300 hover:shadow-sm transition">
                <div className="flex items-center justify-between">
                  <span className="text-2xl" style={b.brand_color ? { color: b.brand_color } : undefined}>📁</span>
                  <span className="text-slate-300">›</span>
                </div>
                <p className="text-sm font-medium text-slate-800 mt-1 truncate">{b.brand_name}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{fmt(b.parent_count)} Parent · {fmt(b.image_count)} รูป</p>
              </button>
            ))}
          </div>
        )}
    </div>
  );
}
