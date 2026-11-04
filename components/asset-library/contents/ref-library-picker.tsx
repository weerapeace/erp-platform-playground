"use client";

/**
 * ป๊อป "หยิบจากคลัง Ref" — เลือก Reference จากคลังกลางใส่รายการที่อยากได้ / อัลบั้ม (เลือกได้หลายชิ้น · แตะตรงไหนของการ์ดก็ติ๊ก)
 *   ค้นหา · กรองชนิด/แท็ก · "แบรนด์นี้" (แบรนด์ของรายการ + ชิ้นที่ใช้ได้ทุกแบรนด์) · เรียงแบรนด์เดียวกัน → ใช้บ่อย → ใหม่ (rankForPicker)
 *   ชิ้นที่มีในรายการแล้ว = จาง กดไม่ได้ · ใส่แล้ว = ก๊อปแถว + library_id (ไฟล์รูปตัวเดิม ไม่อัปซ้ำ)
 * ใช้ของกลาง: ERPModal · state-views · RefTile · lib/content-ref-library
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { REF_PROVIDER_META, type RefKind, type RefProvider } from "@/lib/content-album-refs";
import { filterLibrary, libraryTags, rankForPicker, type LibraryRef } from "@/lib/content-ref-library";
import { listRefLibrary, addRefsFromLibrary } from "./api";
import { RefTile } from "./ref-tile";

const KINDS: [RefKind | "all", string, string][] = [["all", "ทั้งหมด", "All"], ["image", "รูป", "Images"], ["link", "วิดีโอ/ลิงก์", "Videos/links"], ["text", "ข้อความ", "Notes"]];
const TAG_CHIPS = 15;

export function RefLibraryPicker({ albumId, brandId, haveIds, onClose, onAdded }: {
  albumId: string;
  brandId: string | null;
  /** library_id ที่อยู่ในรายการนี้แล้ว */
  haveIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [items, setItems] = useState<LibraryRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<RefKind | "all">("all");
  const [tag, setTag] = useState<string | null>(null);
  const [onlyBrand, setOnlyBrand] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await listRefLibrary()); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const tags = useMemo(() => libraryTags(items).slice(0, TAG_CHIPS), [items]);
  const shown = useMemo(() => rankForPicker(filterLibrary(items, { q, kind, tag, brandId: onlyBrand ? brandId : null }), brandId), [items, q, kind, tag, onlyBrand, brandId]);
  const brandName = items.find((it) => it.brand_id === brandId)?.brand?.name ?? null;
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const confirm = async () => {
    if (!picked.length || saving) return;
    setSaving(true);
    try {
      const r = await addRefsFromLibrary(albumId, picked);
      toast.success(r.skipped ? t(`ใส่แล้ว ${r.added} ชิ้น · ข้าม ${r.skipped} ชิ้นที่มีอยู่แล้ว`, `Added ${r.added} · skipped ${r.skipped} already there`) : t(`ใส่ Reference จากคลังแล้ว ${r.added} ชิ้น`, `Added ${r.added} reference(s) from the library`));
      onAdded();
    } catch (e) { toast.error((e as Error).message); setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="xl" defaultExpanded={false} zIndex={60} storageKey="content-ref-library-picker"
      title={t("หยิบจากคลัง Ref", "Pick from the reference library")}
      description={t("เลือกได้หลายชิ้น · แตะตรงไหนของการ์ดก็ติ๊ก · ใส่แล้วเขียน \"ชอบตรงไหน\" แยกของรายการนี้ได้", "Pick several · tap a card to tick · notes stay per item")}
      hasUnsavedChanges={picked.length > 0 && !saving}
      footer={<>
        <span className="mr-auto text-sm text-slate-500">{picked.length ? t(`เลือก ${picked.length} ชิ้น`, `${picked.length} selected`) : t("ยังไม่ได้เลือก", "Nothing selected")}</span>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={() => void confirm()} disabled={!picked.length || saving}
          className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">
          <Icon name="add" />{saving ? t("กำลังใส่…", "Adding…") : t(`ใส่ที่เลือก${picked.length ? ` (${picked.length})` : ""}`, `Add selected${picked.length ? ` (${picked.length})` : ""}`)}
        </button>
      </>}>
      {loading ? <LoadingState label={t("กำลังโหลดคลัง Ref…", "Loading the library…")} /> : error ? <ErrorState hint={error} onRetry={() => void load()} /> : items.length === 0 ? (
        <EmptyState icon={<Icon name="bookmark" size={36} />} title={t("คลัง Ref ยังว่าง", "The library is empty")}
          hint={t("กดดาวที่ Reference ไหนก็ได้เพื่อเก็บเข้าคลัง หรือเพิ่มที่แท็บ \"คลัง Ref\" ในหน้า Contents", "Star any reference to save it, or add in the Library tab of Contents")} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></span>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้น: ชื่อ / ข้อความ / แท็ก", "Search: title / text / tag")}
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            {KINDS.map(([k, th, en]) => (
              <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                className={`h-8 px-3 rounded-full border text-xs ${kind === k ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{t(th, en)}</button>
            ))}
            {brandId && (
              <button type="button" onClick={() => setOnlyBrand((v) => !v)} aria-pressed={onlyBrand}
                className={`h-8 px-3 rounded-full border text-xs ${onlyBrand ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                title={t("แบรนด์ของรายการนี้ + ชิ้นที่ใช้ได้ทุกแบรนด์", "This item's brand + all-brand references")}>
                {brandName ? t(`เฉพาะ ${brandName}`, `Only ${brandName}`) : t("เฉพาะแบรนด์นี้", "This brand only")}
              </button>
            )}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <Icon name="tag" className="text-slate-400 mt-1" />
              {tags.map(({ tag: tg, count }) => (
                <button key={tg} type="button" onClick={() => setTag(tag === tg ? null : tg)} aria-pressed={tag === tg}
                  className={`h-7 px-2.5 rounded-full border text-xs ${tag === tg ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {tg} <span className="text-slate-400">{count}</span>
                </button>
              ))}
            </div>
          )}
          {shown.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">{t("ไม่เจอ Reference ที่ตรงกับตัวกรอง — ลองล้างคำค้นหรือแท็ก", "Nothing matches — clear the search or tag")}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {shown.map((it) => {
                const have = haveIds.has(it.id);
                const on = picked.includes(it.id);
                const prov = (it.provider ?? "web") as RefProvider;
                return (
                  <button key={it.id} type="button" disabled={have} onClick={() => toggle(it.id)} aria-pressed={on}
                    className={`relative text-left rounded-lg border overflow-hidden bg-white select-none ${on ? "border-violet-500 ring-2 ring-violet-300" : "border-slate-200 hover:border-violet-300"} ${have ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                    <RefTile r={it} className="aspect-[4/5]" />
                    <span className={`absolute top-1.5 left-1.5 w-7 h-7 grid place-items-center rounded-full border-2 ${on ? "bg-violet-600 border-violet-600 text-white" : "bg-black/25 border-white text-transparent"}`}><Icon name="done" size={16} /></span>
                    {have && <span className="absolute top-1.5 right-1.5 px-1.5 rounded bg-white/90 text-[11px] text-slate-600">{t("ใส่แล้ว", "Added")}</span>}
                    <div className="p-2 text-xs">
                      <p className="truncate text-slate-700">{it.kind === "link" ? `${REF_PROVIDER_META[prov].label}${it.title ? ` · ${it.title}` : ""}` : it.kind === "text" ? t("ข้อความ", "Note") : it.note || t("รูป", "Image")}</p>
                      <p className="truncate text-slate-400">{it.brand?.name ?? t("ทุกแบรนด์", "All brands")} · {t(`ใช้ ${it.used_count} ครั้ง`, `used ${it.used_count}×`)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </ERPModal>
  );
}
