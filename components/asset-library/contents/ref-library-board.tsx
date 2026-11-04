"use client";

/**
 * แท็บ "คลัง Ref" ในหน้า Contents — คลัง Reference กลาง (เก็บของดีไว้ที่เดียว ทุกรายการหยิบไปใช้ได้)
 *   เพิ่ม (รูป/ลิงก์/ข้อความ) · ค้นหา · กรองแท็ก/แบรนด์ · ติดแท็ก · ตั้งแบรนด์ (ว่าง = ทุกแบรนด์) · ดูว่าใช้กี่ครั้ง · ลบ (รายการที่หยิบไปแล้วไม่หายตาม)
 *   ในรายการที่อยากได้/อัลบั้ม: ปุ่ม "หยิบจากคลัง Ref" + ดาวเก็บเข้าคลัง (RefBoard)
 * ใช้ของกลาง: RefBoard (โหมด source) · BrandSelect · state-views · lib/content-ref-library
 * สิทธิ์: ดู assets.view · เพิ่ม/แก้ assets.upload · ลบ assets.delete
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/components/i18n";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { BrandSelect } from "@/components/brand-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import type { BrandOption } from "@/app/tasks/data";
import { filterLibrary, libraryTags, normalizeTags, type LibraryRef } from "@/lib/content-ref-library";
import { listRefLibrary, addLibraryRef, updateLibraryRef, removeLibraryRef } from "./api";
import { RefBoard, type RefLike, type RefSource } from "./ref-board";

const TAG_LIST_ID = "content-ref-library-tags";

export function RefLibraryBoard({ brands, onCount }: { brands: BrandOption[]; onCount?: (n: number) => void }) {
  const t = useT();
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can("assets.upload");
  const [items, setItems] = useState<LibraryRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [brandId, setBrandId] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try { const list = await listRefLibrary(); setItems(list); onCount?.(list.length); }
    catch (e) { if (!quiet) setError((e as Error).message); else toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [onCount, toast]);
  useEffect(() => { void load(); }, [load]);

  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const tags = useMemo(() => libraryTags(items), [items]);
  const shown = useMemo(() => filterLibrary(items, { q, tag, brandId: brandId || null }), [items, q, tag, brandId]);
  const brandsInUse = brands.filter((b) => items.some((it) => it.brand_id === b.id));

  // เพิ่มในแท็บนี้ = ติดแบรนด์/แท็กที่กำลังกรองอยู่ให้เลย (หาเจอทันทีในมุมมองเดิม)
  const source: RefSource = useMemo(() => ({
    add: async (ref) => {
      const r = await addLibraryRef({ ...ref, brand_id: brandId || null, tags: tag ? [tag] : [] });
      if (r.existed) toast.info(t("ชิ้นนี้มีในคลังอยู่แล้ว", "Already in the library"));
    },
    remove: (r) => removeLibraryRef(r.id),
    setNote: (r, note) => updateLibraryRef(r.id, { note }),
    removeText: { title: t("ลบออกจากคลัง Ref?", "Remove from the library?"), message: t("รายการที่หยิบไปใช้แล้วยังเก็บ Reference นี้ไว้ ไม่หายตาม", "Items that already use it keep their copy") },
  }), [brandId, tag, toast, t]);

  if (loading) return <LoadingState label={t("กำลังโหลดคลัง Ref…", "Loading the library…")} />;
  if (error) return <ErrorState hint={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2 text-sm text-violet-900 flex items-start gap-2">
        <Icon name="bookmark" className="mt-0.5 shrink-0" />
        <span>{t("เก็บ Reference ดี ๆ ไว้ที่เดียว · ในรายการที่อยากได้/อัลบั้ม กด \"หยิบจากคลัง Ref\" มาใช้ได้เลย ไม่ต้องหาใหม่ · เจอ Reference ดีในรายการไหน กดดาวเก็บเข้าคลังได้", "Keep good references in one place · use \"Pick from library\" in any wish or album · star a reference to save it here")}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้น: ชื่อ / ข้อความ / แท็ก", "Search: title / text / tag")}
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </div>
        {brandsInUse.length > 0 && (
          <div className="flex gap-1 overflow-x-auto">
            <button onClick={() => setBrandId("")} className={`shrink-0 h-8 px-3 rounded-full text-sm border ${!brandId ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600"}`}>{t("ทุกแบรนด์", "All brands")}</button>
            {brandsInUse.map((b) => (
              <button key={b.id} onClick={() => setBrandId(b.id === brandId ? "" : b.id)} title={t("แบรนด์นี้ + ชิ้นที่ใช้ได้ทุกแบรนด์", "This brand + all-brand references")}
                className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm border ${brandId === b.id ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600"}`}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.color || "#94a3b8" }} />{b.name}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto text-xs text-slate-400">{t(`ทั้งหมด ${items.length} ชิ้น`, `${items.length} total`)}</span>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Icon name="tag" className="text-slate-400" />
          {tags.map(({ tag: tg, count }) => (
            <button key={tg} type="button" onClick={() => setTag(tag === tg ? null : tg)} aria-pressed={tag === tg}
              className={`h-7 px-2.5 rounded-full border text-xs ${tag === tg ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {tg} <span className="text-slate-400">{count}</span>
            </button>
          ))}
        </div>
      )}
      <datalist id={TAG_LIST_ID}>{tags.map(({ tag: tg }) => <option key={tg} value={tg} />)}</datalist>

      {items.length === 0 && !canEdit ? (
        <EmptyState icon={<Icon name="bookmark" size={36} />} title={t("คลัง Ref ยังว่าง", "The library is empty")} hint={t("ทีมที่มีสิทธิ์อัปไฟล์เพิ่ม Reference ได้", "People who can upload can add references")} />
      ) : (
        <RefBoard source={source} refs={shown} canEdit={canEdit} canRemove={can("assets.delete")} onChanged={() => void load(true)}
          emptyText={items.length ? t("ไม่เจอ Reference ที่ตรงกับตัวกรอง — ลองล้างคำค้น แท็ก หรือแบรนด์", "Nothing matches — clear the search, tag or brand")
            : t("คลังยังว่าง — เพิ่มรูป ลิงก์วิดีโอ หรือข้อความด้านบน หรือกดดาวที่ Reference ในรายการไหนก็ได้", "Empty — add images, links or notes above, or star a reference in any wish")}
          tileExtra={(r: RefLike) => { const it = byId.get(r.id); return it ? <LibraryTileExtra it={it} canEdit={canEdit} brands={brands} onSaved={() => void load(true)} /> : null; }} />
      )}
    </div>
  );
}

/** ใต้การ์ดในคลัง: แท็ก (แก้ได้) · แบรนด์ · ใช้กี่ครั้ง */
function LibraryTileExtra({ it, canEdit, brands, onSaved }: { it: LibraryRef; canEdit: boolean; brands: BrandOption[]; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const save = async (patch: Parameters<typeof updateLibraryRef>[1]) => {
    try { await updateLibraryRef(it.id, patch); onSaved(); } catch (e) { toast.error((e as Error).message); }
  };
  const saveTags = () => {
    setEditing(false);
    const tags = normalizeTags(val);
    if (tags.join("\u0000") !== it.tags.join("\u0000")) void save({ tags });
  };
  return (
    <div className="px-2 pb-2 pt-1.5 space-y-1.5 border-t border-slate-100">
      {editing ? (
        <input autoFocus list={TAG_LIST_ID} value={val} onChange={(e) => setVal(e.target.value)} onBlur={saveTags}
          onKeyDown={(e) => { if (e.key === "Enter") saveTags(); if (e.key === "Escape") setEditing(false); }}
          placeholder={t("แท็ก คั่นด้วย , เช่น สตรีท, Reel", "Tags, comma separated")}
          className="w-full h-7 px-1.5 rounded border border-violet-300 text-xs focus:outline-none" />
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {it.tags.map((tg) => <span key={tg} className="inline-flex items-center h-5 px-1.5 rounded bg-slate-100 text-[11px] text-slate-600">{tg}</span>)}
          {canEdit && (
            <button type="button" onClick={() => { setVal(it.tags.join(", ")); setEditing(true); }}
              className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded text-[11px] text-violet-700 hover:bg-violet-50">
              <Icon name="tag" size={11} />{it.tags.length ? t("แก้แท็ก", "Edit tags") : t("+ แท็ก", "+ Tag")}
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        {canEdit ? (
          <BrandSelect plain brands={brands} value={it.brand_id} emptyLabel={t("ทุกแบรนด์", "All brands")} title={t("แบรนด์ (ว่าง = ใช้ได้ทุกแบรนด์)", "Brand (empty = all brands)")}
            onChange={(id) => { if ((id || null) !== it.brand_id) void save({ brand_id: id || null }); }}
            className="h-7 min-w-0 flex-1 rounded border border-slate-200 bg-white px-1 text-[11px] text-slate-600" />
        ) : <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">{it.brand?.name ?? t("ทุกแบรนด์", "All brands")}</span>}
        <span className="shrink-0 text-[11px] text-slate-400" title={t("จำนวนรายการที่หยิบไปใช้", "Items using it")}>{t(`ใช้ ${it.used_count} ครั้ง`, `used ${it.used_count}×`)}</span>
      </div>
    </div>
  );
}
