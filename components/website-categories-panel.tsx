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
 * รหัสหมวด (ใช้ในลิงก์หน้าหมวด /c/<รหัส>) ตั้งตอนสร้างแล้วเปลี่ยนไม่ได้ — กันลิงก์/เมนูเดิมเสีย
 * 📂 หมวดย่อย (2 ชั้น · lib/website-category-tree): ➕ หมวดย่อยใต้หมวดที่เลือก · ช่อง "อยู่ใต้หมวด" ย้ายแม่ · ลากเรียงในแม่เดิม
 *    สินค้าในหมวดย่อยนับรวมในหมวดแม่ (เว็บร้านโชว์ในหน้าหมวดแม่ด้วย)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { ImageChooser } from "@/components/website-canvas-media";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { cleanCategoryKey, type WebCategoryDef } from "@/lib/website-field-map";
import { categoryTree, reorderCategoryTree, childCategories, topCategories, familyKeys, flattenTree } from "@/lib/website-category-tree";

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
const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";
const labelCls = "block text-xs font-medium text-slate-600 mb-1";

export function WebsiteCategoriesPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const [fieldMap, setFieldMap] = useState<Record<string, unknown> | null>(null);
  const [cats, setCats] = useState<WebCategoryDef[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selKey, setSelKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // เปิดป๊อปสร้างหมวด: null = ปิด · "" = หมวดชั้นบน · รหัส = หมวดย่อยใต้หมวดนั้น
  const [newParent, setNewParent] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<WebCategoryDef | null>(null);
  const [chooser, setChooser] = useState<null | "imageKey" | "bannerKey">(null);
  const dirty = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fm, ls] = await Promise.all([
        apiFetch(`/api/website/field-map?shop=${encodeURIComponent(shopSlug)}`).then((r) => r.json()),
        apiFetch(`/api/website/listings?shop=${encodeURIComponent(shopSlug)}`).then((r) => r.json()),
      ]);
      if (!fm?.fieldMap) throw new Error(fm?.error || "โหลดหมวดไม่สำเร็จ");
      setFieldMap(fm.fieldMap);
      const list = (fm.fieldMap.categories ?? []) as WebCategoryDef[];
      setCats(list);
      setSelKey((k) => (k && list.some((c) => c.key === k) ? k : list[0]?.key ?? null));
      setListings((ls?.listings ?? []) as Listing[]);
    } catch (e) {
      setError((e as Error).message || "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }, [shopSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ── บันทึกรายการหมวด (หลังหยุดแก้ 0.7 วิ) ── */
  useEffect(() => {
    if (!dirty.current || !fieldMap) return;
    setSaveState("saving");
    const t = window.setTimeout(async () => {
      try {
        const r = await apiFetch("/api/website/field-map", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId, fieldMap: { ...fieldMap, categories: cats } }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
        dirty.current = false;
        setSaveState("saved");
      } catch (e) {
        setSaveState("error");
        toast.error((e as Error).message);
      }
    }, 700);
    return () => window.clearTimeout(t);
  }, [cats, fieldMap, shopId, toast]);

  const editCats = (next: WebCategoryDef[]) => {
    dirty.current = true;
    setCats(next);
  };
  const patchCat = (key: string, p: Partial<WebCategoryDef>) => editCats(cats.map((c) => (c.key === key ? { ...c, ...p } : c)));

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
      if (!r.ok || !j.ok) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      const byId = new Map(items.map((it) => [it.parentId, it.categories]));
      setListings((ls) => ls.map((l) => (byId.has(l.parentId) ? { ...l, categories: byId.get(l.parentId)! } : l)));
      toast.success(okMsg);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sel = cats.find((c) => c.key === selKey) ?? null;
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

  const removeFromCat = (l: Listing) => {
    if (!sel) return;
    void setCategoriesOf([{ parentId: l.parentId, categories: l.categories.filter((k) => k !== sel.key) }], sel.key, `เอา "${nameOf(l)}" ออกจากหมวด ${sel.label} แล้ว`);
  };

  const deleteCat = async () => {
    const c = confirmDel;
    if (!c) return;
    setConfirmDel(null);
    // สินค้าที่อยู่หมวดนี้ → เอาหมวดนี้ออก (สินค้ายังอยู่บนเว็บ)
    const affected = listings.filter((l) => l.categories.includes(c.key)).map((l) => ({ parentId: l.parentId, categories: l.categories.filter((k) => k !== c.key) }));
    if (affected.length) await setCategoriesOf(affected, c.key, `เอาสินค้า ${affected.length} รายการออกจากหมวด ${c.label} แล้ว`);
    // หมวดย่อยของหมวดที่ลบ → กลายเป็นหมวดชั้นบน (ไม่หายไปด้วย)
    const next = flattenTree(cats.filter((x) => x.key !== c.key).map((x) => (x.parent === c.key ? { ...x, parent: null } : x)));
    editCats(next);
    setSelKey(next[0]?.key ?? null);
    toast.success(`ลบหมวด "${c.label}" แล้ว`);
  };

  if (loading) return <p className="text-sm text-slate-400 py-10 text-center">กำลังโหลดหมวดหมู่…</p>;
  if (error)
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={() => void load()} className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100">
          ลองใหม่
        </button>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-base font-semibold text-slate-800">📂 หมวดหมู่สินค้าบนเว็บ</h2>
          <p className="text-xs text-slate-500 mt-0.5">ลากเรียงลำดับได้ · 1 สินค้าอยู่ได้หลายหมวด · หมวดแรกของสินค้า = ป้ายบนการ์ด · รูปหมวดใช้ใน Section &quot;หมวดสินค้า&quot; หน้าแรก</p>
        </div>
        <span className="text-xs text-slate-400">
          {saveState === "saving" ? "กำลังบันทึก…" : saveState === "saved" ? "✓ บันทึกแล้ว" : saveState === "error" ? "⚠ บันทึกไม่สำเร็จ" : ""}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* ซ้าย: รายการหมวด */}
        <div className="rounded-xl border border-slate-200 bg-white p-2 h-fit">
          {cats.length === 0 && <p className="text-xs text-slate-400 px-2 py-6 text-center">ยังไม่มีหมวด — กด ➕ เพิ่มหมวด</p>}
          {rows.map(({ cat: c, depth }, i) => {
            const lastOfGroup = c.key === selTop || c.parent === selTop ? !rows[i + 1] || rows[i + 1].depth === 0 : false;
            return (
              <div key={c.key}>
                <div
                  {...rowProps(i)}
                  onClick={() => setSelKey(c.key)}
                  className={`flex items-center gap-2 rounded-lg py-2 cursor-pointer ${depth ? "pl-7 pr-2" : "px-2"} ${c.key === selKey ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50"} ${rowCls(i)}`}
                >
                  {depth > 0 && <span className="text-slate-300 text-xs -ml-3" aria-hidden>└</span>}
                  <DragHandle {...handleProps(i)} />
                  {c.imageKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img(c.imageKey, 80)!} alt="" className={`${depth ? "w-7 h-7" : "w-9 h-9"} rounded-md object-cover border border-slate-200`} />
                  ) : (
                    <span className={`${depth ? "w-7 h-7 text-sm" : "w-9 h-9 text-lg"} rounded-md bg-slate-100 flex items-center justify-center`}>{c.icon || (depth ? "▫️" : "📁")}</span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className={`block ${depth ? "text-[13px]" : "text-sm font-medium"} text-slate-800 truncate`}>{c.label}</span>
                    <span className="block text-[10px] text-slate-400 truncate">/c/{c.key}</span>
                  </span>
                  <span className="text-[11px] text-slate-500 tabular-nums" title={depth ? undefined : "รวมสินค้าในหมวดย่อย"}>{countOf(c.key)}</span>
                </div>
                {/* ➕ หมวดย่อย — ท้ายกลุ่มของหมวดที่เลือกอยู่ */}
                {lastOfGroup && selTop && (
                  <button type="button" onClick={() => setNewParent(selTop)} className="ml-7 mb-1 mt-0.5 rounded-md px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50">
                    ➕ หมวดย่อยใน “{cats.find((x) => x.key === selTop)?.label}”
                  </button>
                )}
              </div>
            );
          })}
          <button onClick={() => setNewParent("")} className="mt-1 w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600">
            ➕ เพิ่มหมวด
          </button>
        </div>

        {/* ขวา: หมวดที่เลือก */}
        {sel ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                <div>
                  <label className={labelCls}>ชื่อหมวด</label>
                  <input value={sel.label} onChange={(e) => patchCat(sel.key, { label: e.target.value.slice(0, 60) })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>ไอคอน (ถ้าไม่มีรูป)</label>
                  <input value={sel.icon} onChange={(e) => patchCat(sel.key, { icon: e.target.value.slice(0, 8) })} className={inputCls} placeholder="👜" />
                </div>
              </div>
              {/* 📂 อยู่ใต้หมวด (หมวดย่อย) */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium text-slate-600">อยู่ใต้หมวด</label>
                <select
                  value={sel.parent ?? ""}
                  disabled={childCategories(cats, sel.key).length > 0}
                  onChange={(e) => editCats(flattenTree(cats.map((c) => (c.key === sel.key ? { ...c, parent: e.target.value || null } : c))))}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">— ไม่มี (เป็นหมวดหลัก) —</option>
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
                    ? `มีหมวดย่อย ${childCategories(cats, sel.key).length} หมวด — ย้ายไปอยู่ใต้หมวดอื่นไม่ได้ (ซ้อนได้ 2 ชั้น)`
                    : sel.parent
                      ? "สินค้าในหมวดนี้ขึ้นในหน้าหมวดแม่ด้วย · บนเว็บเป็นปุ่มชิปใต้ชื่อหมวดแม่"
                      : "เลือกหมวดแม่ = ทำเป็นหมวดย่อย"}
                </span>
              </div>
              <div>
                <label className={labelCls}>คำอธิบาย (ใต้ชื่อหมวด / บนหน้าหมวด)</label>
                <textarea value={sel.blurb} onChange={(e) => patchCat(sel.key, { blurb: e.target.value.slice(0, 240) })} rows={2} className={inputCls} />
              </div>
              {/* 🔎 หน้าหมวดใน Google — หน้า /c/<รหัส> ของเว็บร้านใช้ค่านี้เป็น title/description */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-700">🔎 หน้าหมวดใน Google <span className="font-normal text-slate-400">· ว่าง = ใช้ชื่อหมวด/คำอธิบายด้านบน</span></p>
                <div>
                  <label className={labelCls}>
                    ชื่อใน Google <span className={(sel.seoTitle ?? "").length > 60 ? "text-amber-600" : "text-slate-400"}>({(sel.seoTitle ?? "").length}/70 · แนะนำไม่เกิน 60)</span>
                  </label>
                  <input value={sel.seoTitle ?? ""} onChange={(e) => patchCat(sel.key, { seoTitle: e.target.value.slice(0, 70) })} className={inputCls} placeholder={`${sel.label} | ชื่อร้าน`} />
                </div>
                <div>
                  <label className={labelCls}>
                    คำอธิบายใน Google <span className={(sel.seoDescription ?? "").length > 155 ? "text-amber-600" : "text-slate-400"}>({(sel.seoDescription ?? "").length}/170 · แนะนำ 70–155)</span>
                  </label>
                  <textarea value={sel.seoDescription ?? ""} onChange={(e) => patchCat(sel.key, { seoDescription: e.target.value.slice(0, 170) })} rows={2} className={inputCls} placeholder={sel.blurb || "เช่น กระเป๋าถือดีไซน์น่ารัก งานคุณภาพ ส่งไวทั่วไทย"} />
                </div>
                {/* ตัวอย่างหน้าตาผลค้นหา */}
                <div className="rounded-md bg-white border border-slate-200 px-3 py-2">
                  <p className="text-[11px] text-emerald-700 truncate">…/c/{sel.key}</p>
                  <p className="text-sm text-blue-700 truncate">{(sel.seoTitle ?? "").trim() || `${sel.label} | ชื่อร้าน`}</p>
                  <p className="text-xs text-slate-600 line-clamp-2">{(sel.seoDescription ?? "").trim() || sel.blurb || "(ยังไม่มีคำอธิบาย — Google จะดึงข้อความจากหน้ามาเอง)"}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ImageSlot label="รูปหมวด (การ์ด/แถบหมวดหน้าแรก)" k={sel.imageKey} aspect="1 / 1" onPick={() => setChooser("imageKey")} onClear={() => patchCat(sel.key, { imageKey: null })} />
                <ImageSlot label="แบนเนอร์หัวหน้าหมวด" k={sel.bannerKey} aspect="21 / 9" onPick={() => setChooser("bannerKey")} onClear={() => patchCat(sel.key, { bannerKey: null })} />
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  ลิงก์หน้าหมวด: <code>/c/{sel.key}</code> (รหัสเปลี่ยนไม่ได้ — กันลิงก์เดิมเสีย)
                </span>
                <button onClick={() => setConfirmDel(sel)} className="text-xs text-red-600 hover:underline">
                  🗑 ลบหมวดนี้
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <p className="flex-1 text-sm font-semibold text-slate-800">
                  สินค้าในหมวด &quot;{sel.label}&quot; <span className="font-normal text-slate-400">({inCat.length})</span>
                </p>
                <button disabled={busy} onClick={() => setAddOpen(true)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  ➕ เพิ่มสินค้าเข้าหมวด
                </button>
              </div>
              {inCat.length > 1 && <p className="text-[11px] text-slate-400 -mt-1.5 mb-2">ลาก ⠿ เพื่อเรียงลำดับสินค้าในหมวดนี้ (หน้าร้านเรียงตามนี้เมื่อเลือกหมวด)</p>}
              {/* 📂 สินค้าจากหมวดย่อย (ไม่ได้อยู่หมวดนี้ตรง ๆ แต่ขึ้นในหน้าหมวดนี้บนเว็บ) */}
              {!sel.parent && countOf(sel.key) > inCat.length && (
                <p className="text-[11px] text-blue-600 -mt-1 mb-2">+ อีก {countOf(sel.key) - inCat.length} รุ่นจากหมวดย่อย ({childCategories(cats, sel.key).map((c) => c.label).join(", ")}) — ขึ้นในหน้าหมวดนี้บนเว็บด้วย · จัดลำดับ/เพิ่ม-เอาออกที่หมวดย่อยนั้น</p>
              )}
              {inCat.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">ยังไม่มีสินค้าในหมวดนี้ — กด ➕ เพิ่มสินค้าเข้าหมวด</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                  {inCat.map((l, i) => (
                    <div key={l.parentId} {...prodDrag.rowProps(i)} className={`group relative rounded-lg border border-slate-200 p-1.5 ${prodDrag.rowCls(i)}`}>
                      <DragHandle {...prodDrag.handleProps(i)} title="ลากเพื่อเรียงลำดับในหมวดนี้" className="absolute left-2.5 top-2.5 z-10 rounded bg-white/90 px-1 text-sm shadow-sm" />
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
                        {!l.published && " · ยังไม่เผยแพร่"}
                        {l.categories[0] === sel.key ? " · หมวดหลัก" : l.categories.length > 1 ? ` · หลัก: ${labelOf(l.categories[0])}` : ""}
                      </p>
                      <button
                        title="เอาออกจากหมวดนี้"
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
          <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">เลือกหมวดทางซ้าย หรือกด ➕ เพิ่มหมวด</div>
        )}
      </div>

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
              `เพิ่มสินค้า ${picked.length} รายการเข้าหมวด ${sel.label} แล้ว`
            );
          }}
        />
      )}

      <ImageChooser
        open={!!chooser}
        onClose={() => setChooser(null)}
        shopSlug={shopSlug}
        title={chooser === "bannerKey" ? "แบนเนอร์หัวหน้าหมวด" : "รูปหมวด"}
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
        title={`ลบหมวด "${confirmDel?.label ?? ""}"?`}
        message={`สินค้า ${confirmDel ? directCount(confirmDel.key) : 0} รายการจะไม่อยู่ในหมวดนี้แล้ว (สินค้ายังอยู่บนเว็บ) · ลิงก์หน้าหมวด /c/${confirmDel?.key ?? ""} จะใช้ไม่ได้${confirmDel && childCategories(cats, confirmDel.key).length ? ` · หมวดย่อย ${childCategories(cats, confirmDel.key).length} หมวดจะกลายเป็นหมวดหลัก (ไม่ถูกลบ)` : ""}`}
        confirmText="ลบหมวด"
      />
    </div>
  );
}

function ImageSlot({ label, k, aspect, onPick, onClear }: { label: string; k?: string | null; aspect: string; onPick: () => void; onClear: () => void }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <button type="button" onClick={onPick} className="block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 overflow-hidden hover:border-blue-400" style={{ aspectRatio: aspect, maxHeight: 160 }}>
        {k ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img(k, 600)!} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-slate-400">＋ เลือกรูป</span>
        )}
      </button>
      {k && (
        <div className="mt-1 flex gap-3 text-[11px]">
          <button type="button" onClick={onPick} className="text-slate-600 hover:text-blue-600">
            เปลี่ยนรูป
          </button>
          <button type="button" onClick={onClear} className="text-red-600 hover:underline">
            เอาออก
          </button>
        </div>
      )}
    </div>
  );
}

/** สร้างหมวดใหม่: ชื่อ + รหัสในลิงก์ (เดาจากชื่อภาษาอังกฤษ · ชื่อไทย = ต้องตั้งเอง) */
function NewCategoryModal({ open, onClose, taken, onCreate, parentLabel, suggestPrefix = "" }: { open: boolean; onClose: () => void; taken: string[]; onCreate: (c: WebCategoryDef) => void; /** สร้างเป็นหมวดย่อยใต้หมวดนี้ */ parentLabel?: string | null; /** หมวดย่อย: รหัสขึ้นต้นด้วยรหัสแม่ (กันชนกับหมวดอื่น) */ suggestPrefix?: string }) {
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
  const problem = !label.trim() ? "ใส่ชื่อหมวด" : !k ? "ตั้งรหัสในลิงก์ (ภาษาอังกฤษ/ตัวเลข/ขีด)" : taken.includes(k) ? "รหัสนี้มีแล้ว — ตั้งใหม่" : null;
  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={parentLabel ? `➕ หมวดย่อยใน “${parentLabel}”` : "➕ เพิ่มหมวด"}
      size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
            ยกเลิก
          </button>
          <button
            disabled={!!problem}
            onClick={() => onCreate({ key: k, label: label.trim().slice(0, 60), icon: "", blurb: "", imageKey: null, bannerKey: null })}
            className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            เพิ่มหมวด
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className={labelCls}>ชื่อหมวด (โชว์บนเว็บ)</label>
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder="เช่น BAGS / กระเป๋าสะพาย" />
        </div>
        <div>
          <label className={labelCls}>รหัสในลิงก์ (/c/…)</label>
          <input
            value={keyTouched ? key : autoKey}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value);
            }}
            className={inputCls}
            placeholder={suggestPrefix ? `เช่น ${suggestPrefix}-small` : "เช่น bags"}
          />
          <p className="text-[11px] text-slate-400 mt-1">ภาษาอังกฤษตัวเล็ก ตัวเลข ขีดกลาง · ตั้งแล้วเปลี่ยนไม่ได้</p>
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
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) {
      setQ("");
      setPicked(new Set());
    }
  }, [open]);
  const t = q.trim().toLowerCase();
  const shown = t ? listings.filter((l) => `${nameOf(l)} ${l.code}`.toLowerCase().includes(t)) : listings;
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
      title={`➕ เพิ่มสินค้าเข้าหมวด "${category.label}"`}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-sm text-blue-700">{picked.size ? `เลือกแล้ว ${picked.size} รายการ` : "ยังไม่ได้เลือก"}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
              ยกเลิก
            </button>
            <button
              disabled={!picked.size}
              onClick={() => onAdd(listings.filter((l) => picked.has(l.parentId)))}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              เพิ่ม {picked.size || ""} รายการ
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} className={inputCls} placeholder="ค้นหาชื่อ / รหัสสินค้า" />
          <button
            type="button"
            onClick={() => setPicked((s) => {
              const n = new Set(s);
              for (const l of shown) allShown ? n.delete(l.parentId) : n.add(l.parentId);
              return n;
            })}
            className="shrink-0 rounded-lg border border-slate-300 px-3 text-xs text-slate-700 hover:border-blue-400"
          >
            {allShown ? "เลิกเลือกที่เห็น" : "เลือกทั้งหมดที่เห็น"}
          </button>
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-slate-400 py-10 text-center">{listings.length ? "ไม่พบสินค้า ลองเปลี่ยนคำค้นหา" : "สินค้าทุกรายการอยู่ในหมวดนี้แล้ว"}</p>
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
                    {l.categories.length ? ` · ${l.categories.map(labelOf).join(", ")}` : " · ไม่มีหมวด"}
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
