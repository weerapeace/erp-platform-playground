"use client";
// คลังไฟล์: ป๊อปแก้หลายรายการ (แท็ก · ย้ายอัลบั้ม · แก้หลายช่อง · ตั้งโฟลเดอร์) — แยกจาก index.tsx (Y1)
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { ERPModal } from "@/components/modal";
import { withImageWidth } from "@/lib/r2-image";
import { type AssetRow, type AssetDetail, type AssetSize } from "@/app/api/assets/shared";
import { Spinner, LoadingOverlay } from "@/components/spinner";
import type { AssetCollection } from "@/app/api/assets/collections/route";
import type { AssetTag } from "@/app/api/assets/tags/route";
import { type LookupItem, isImage, useDriveFolderMaps, brandFolderPath } from "./asset-shared";
import { ArtTypeMultiSelect, SizesEditor, ParentSkuField, TagPickerField } from "./asset-fields";

// ── ติดแท็กหลายไฟล์ ──
export function BulkTagModal({ count, tags, onClose, onApply }: {
  count: number; tags: AssetTag[]; onClose: () => void; onApply: (tag: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const apply = () => { if (name.trim()) onApply(name.trim()); };
  return (
    <ERPModal open onClose={onClose} title={`${t("ติดแท็กให้", "Tag")} ${count} ${t("ไฟล์", "files")}`} size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={apply} disabled={!name.trim()} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{t("ติดแท็ก", "Add tag")}</button>
        </div>
      }>
      <label className="text-[12px] text-slate-500">{t("ชื่อแท็ก (มีอยู่แล้วหรือพิมพ์ใหม่)", "Tag name (existing or type a new one)")}
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder={t("เช่น โปรโมชั่น", "e.g. promotion")}
          className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </label>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {tags.map((t) => (
            <button key={t.id} onClick={() => setName(t.name)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100">{t.name}</button>
          ))}
        </div>
      )}
    </ERPModal>
  );
}

// ── ย้ายหลายไฟล์ไปอัลบั้ม ──
export function BulkMoveModal({ count, collections, onClose, onApply }: {
  count: number; collections: AssetCollection[]; onClose: () => void; onApply: (collectionId: string) => void;
}) {
  const t = useT();
  const [col, setCol] = useState("");
  return (
    <ERPModal open onClose={onClose} title={`${t("เพิ่ม", "Add")} ${count} ${t("ไฟล์เข้าอัลบั้ม", "files to album")}`} size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={() => onApply(col)} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{t("ตกลง", "OK")}</button>
        </div>
      }>
      <label className="text-[12px] text-slate-500">{t("เลือกอัลบั้ม (asset อยู่ได้หลายอัลบั้ม)", "Select album (an asset can be in multiple albums)")}
        <select value={col} onChange={(e) => setCol(e.target.value)}
          className="mt-1 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">{t("— เอาออกจากทุกอัลบั้ม —", "— Remove from all albums —")}</option>
          {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
    </ERPModal>
  );
}

// แถวฟิลด์ใน bulk edit — ติ๊กเปิด/ปิดการแก้ฟิลด์ (module-level กัน remount ตอนพิมพ์)
export function BulkEditRow({ on, setOn, label, preview, children }: { on: boolean; setOn: (v: boolean) => void; label: string; preview?: React.ReactNode; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className={`rounded-lg border p-2.5 ${on ? "border-indigo-200 bg-indigo-50/30" : "border-slate-200"}`}>
      <label className="flex items-center gap-2 text-[12px] font-medium text-slate-700 cursor-pointer">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> {label}
      </label>
      {preview != null && <div className="mt-1 pl-6 text-[11px] text-slate-500">{t("เดิม:", "Was:")} {preview}</div>}
      {on && <div className="mt-2">{children}</div>}
    </div>
  );
}

// สวิตช์โหมด "ใส่ค่าเดียว (ทุกไฟล์)" ↔ "แก้แยกแต่ละไฟล์"
export function BulkModeToggle({ mode, setMode }: { mode: "all" | "each"; setMode: (m: "all" | "each") => void }) {
  const t = useT();
  return (
    <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 text-[11px]">
      <button type="button" onClick={() => setMode("all")} className={`px-2.5 h-6 rounded-md ${mode === "all" ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500"}`}>{t("ใส่ค่าเดียว (ทุกไฟล์)", "One value (all files)")}</button>
      <button type="button" onClick={() => setMode("each")} className={`px-2.5 h-6 rounded-md ${mode === "each" ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500"}`}>{t("แก้แยกแต่ละไฟล์", "Edit each file")}</button>
    </div>
  );
}

// ── แก้หลายรายการพร้อมกัน (bulk edit) — ติ๊กเลือกฟิลด์ที่จะแก้ · ขนาด/Parent SKU เลือก "รวม" หรือ "แยกรายไฟล์" ได้ ──
export function BulkEditModal({ ids, artTypes, onClose, onDone }: {
  ids: string[]; artTypes: LookupItem[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [artTypeList, setArtTypeList] = useState<LookupItem[]>(artTypes);
  const [busy, setBusy] = useState(false);
  const t = useT();
  const [enBrand, setEnBrand] = useState(false); const [brandId, setBrandId] = useState("");
  const [enType, setEnType] = useState(false); const [types, setTypes] = useState<string[]>([]);
  const [enSize, setEnSize] = useState(false); const [sizes, setSizes] = useState<AssetSize[]>([]); const [sizeMode, setSizeMode] = useState<"all" | "each">("all");
  const [enParent, setEnParent] = useState(false); const [parents, setParents] = useState<string[]>([]); const [parentMode, setParentMode] = useState<"all" | "each">("all");
  const [enTags, setEnTags] = useState(false); const [tags, setTags] = useState<string[]>([]);
  const [enKw, setEnKw] = useState(false); const [kw, setKw] = useState("");
  const [enLoc, setEnLoc] = useState(false); const [locMode, setLocMode] = useState<"all" | "each">("each"); const [locPath, setLocPath] = useState(""); const [locUrl, setLocUrl] = useState("");
  // ข้อมูลไฟล์รายใบ (ดึงค่าเดิมมาโชว์ + prefill ตอนแก้)
  type BEItem = { id: string; title: string; url: string; isImg: boolean; brandId: string; types: string[]; sizes: AssetSize[]; parents: string[]; keywords: string; path: string; masterUrl: string };
  const [items, setItems] = useState<BEItem[] | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [pfSizes, setPfSizes] = useState<Record<string, AssetSize[]>>({});
  const [pfParents, setPfParents] = useState<Record<string, string[]>>({});
  const [pfPath, setPfPath] = useState<Record<string, string>>({});
  const [pfUrl, setPfUrl] = useState<Record<string, string>>({});
  useEffect(() => { apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {}); }, []);

  const needPerFile = (enSize && sizeMode === "each") || (enParent && parentMode === "each") || (enLoc && locMode === "each");
  const PREFILL_CAP = 40;   // ดึงค่าเดิมอัตโนมัติเมื่อไฟล์ไม่เยอะ (กันยิงเยอะเกิน)
  const wantLoad = needPerFile || ids.length <= PREFILL_CAP;
  // โหลดไฟล์ที่เลือก → เก็บค่าเดิมทุกฟิลด์ (ไว้โชว์ "เดิม: …" + prefill + แก้แยกรายไฟล์)
  useEffect(() => {
    if (!wantLoad || items !== null || itemsLoading) return;
    setItemsLoading(true);
    Promise.all(ids.map((id) => apiFetch(`/api/assets/${id}`).then((r) => r.json()).then((j) => j.data as AssetDetail).catch(() => null)))
      .then((got) => {
        const list = got.filter(Boolean) as AssetDetail[];
        setItems(list.map((d) => ({ id: d.id, title: d.title, url: d.url, isImg: isImage(d), brandId: d.brand_id ?? "", types: d.artwork_types ?? [], sizes: d.sizes ?? [], parents: d.parent_sku_codes ?? [], keywords: d.keywords ?? "", path: d.master_path ?? "", masterUrl: d.master_url ?? "" })));
        const s: Record<string, AssetSize[]> = {}, p: Record<string, string[]> = {}, pa: Record<string, string> = {}, u: Record<string, string> = {};
        for (const d of list) { s[d.id] = d.sizes ?? []; p[d.id] = d.parent_sku_codes ?? []; pa[d.id] = d.master_path ?? ""; u[d.id] = d.master_url ?? ""; }
        setPfSizes(s); setPfParents(p); setPfPath(pa); setPfUrl(u);
      })
      .finally(() => setItemsLoading(false));
  }, [wantLoad, items, itemsLoading, ids]);

  // ค่าเดิม "ร่วม" ของไฟล์ที่เลือก (ต่างกัน = mixed) — ไว้โชว์ + prefill
  const cur = (() => {
    if (!items || items.length === 0) return null;
    const oneStr = (get: (i: BEItem) => string) => { const vs = items.map(get); return { mixed: new Set(vs).size > 1, value: vs[0] }; };
    const oneArr = <T,>(get: (i: BEItem) => T[], keyOf: (v: T[]) => string) => { const vs = items.map(get); return { mixed: new Set(vs.map(keyOf)).size > 1, value: vs[0] }; };
    const sortKey = (v: string[]) => JSON.stringify([...v].sort());
    return {
      brand: oneStr((i) => i.brandId),
      types: oneArr((i) => i.types, sortKey),
      sizes: oneArr((i) => i.sizes, (v) => JSON.stringify(v)),
      parents: oneArr((i) => i.parents, sortKey),
      keywords: oneStr((i) => i.keywords),
      path: oneStr((i) => i.path),
      url: oneStr((i) => i.masterUrl),
    };
  })();
  // เติมค่าเดิมลงช่องแก้ (ครั้งเดียว) — เฉพาะฟิลด์ที่ทุกไฟล์ค่าตรงกัน
  useEffect(() => {
    if (!cur || prefilled) return;
    if (!cur.brand.mixed) setBrandId(cur.brand.value);
    if (!cur.types.mixed) setTypes(cur.types.value);
    if (!cur.sizes.mixed) setSizes(cur.sizes.value);
    if (!cur.parents.mixed) setParents(cur.parents.value);
    if (!cur.keywords.mixed) setKw(cur.keywords.value);
    if (!cur.path.mixed) setLocPath(cur.path.value);
    if (!cur.url.mixed) setLocUrl(cur.url.value);
    setPrefilled(true);
  }, [cur, prefilled]);

  // ป้ายค่าเดิมแต่ละฟิลด์ (โชว์ใต้ชื่อฟิลด์)
  const mixedTag = <span className="text-amber-600">{t("ค่าต่างกัน", "Values differ")} ({ids.length} {t("ไฟล์", "files")})</span>;
  const brandLabel = (id: string) => id ? (brands.find((b) => b.id === id)?.name ?? t("แบรนด์อื่น", "Other brand")) : t("— ไม่มีแบรนด์ —", "— No brand —");
  const sizeLabel = (ss: AssetSize[]) => ss.length ? ss.map((s) => `${s.w}×${s.h} ${s.unit}`).join(", ") : "—";
  const prev = (field: keyof NonNullable<typeof cur>, render: (v: never) => React.ReactNode): React.ReactNode => {
    if (itemsLoading) return <span className="text-slate-400">{t("กำลังโหลดค่าเดิม…", "Loading current values…")}</span>;
    if (!cur) return ids.length > PREFILL_CAP ? <span className="text-slate-400">{t("ไฟล์เยอะ — ไม่ดึงค่าเดิม", "Many files — not loading current values")}</span> : null;
    const f = cur[field]; return f.mixed ? mixedTag : render(f.value as never);
  };

  const save = async () => {
    // ฟิลด์ "รวม" (ค่าเดียวทุกไฟล์) → bulk action edit
    const fields: Record<string, unknown> = {};
    if (enBrand) fields.brand_id = brandId || null;
    if (enType) fields.artwork_types = types;
    if (enKw) fields.keywords = kw.trim();
    if (enTags) fields.add_tags = tags;
    if (enSize && sizeMode === "all") fields.sizes = sizes;
    if (enParent && parentMode === "all") fields.parent_sku_codes = parents;
    if (enLoc && locMode === "all") { fields.master_path = locPath.trim(); fields.master_url = locUrl.trim(); }
    const anyShared = Object.keys(fields).length > 0;
    if (!anyShared && !needPerFile) { toast.error(t("ติ๊กเลือกฟิลด์ที่จะแก้ก่อน", "Check the fields you want to edit first")); return; }
    setBusy(true);
    try {
      if (anyShared) {
        const res = await apiFetch("/api/assets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "edit", asset_ids: ids, fields }) });
        const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("แก้ไม่สำเร็จ", "Edit failed"));
      }
      // ฟิลด์ "แยกรายไฟล์" → PATCH ทีละใบ
      if (needPerFile && items) {
        for (const it of items) {
          const patch: Record<string, unknown> = {};
          if (enSize && sizeMode === "each") patch.sizes = pfSizes[it.id] ?? [];
          if (enParent && parentMode === "each") patch.parent_sku_codes = pfParents[it.id] ?? [];
          if (enLoc && locMode === "each") { patch.master_path = (pfPath[it.id] ?? "").trim() || null; patch.master_url = (pfUrl[it.id] ?? "").trim() || null; }
          if (Object.keys(patch).length) await apiFetch(`/api/assets/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
        }
      }
      toast.success(`${t("แก้", "Edited")} ${ids.length} ${t("ไฟล์แล้ว", "files")}`); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("แก้ไม่สำเร็จ", "Edit failed")); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} title={`✏️ ${t("แก้", "Edit")} ${ids.length} ${t("ไฟล์พร้อมกัน", "files at once")}`} size="lg"
      description={t("ติ๊กเฉพาะฟิลด์ที่จะแก้ · ขนาด/Parent SKU เลือกได้ว่า “ใส่ค่าเดียวทุกไฟล์” หรือ “แก้แยกแต่ละไฟล์” · แท็ก = เพิ่มเข้าไป", "Check only the fields you want to edit · Size/Parent SKU can be “one value for all files” or “edit each file” · Tags = added on")}
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-amber-600">{t("จะแก้", "Will edit")} {ids.length} {t("ไฟล์ที่เลือก", "selected files")}</span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">{busy && <Spinner />}{busy ? t("กำลังบันทึก…", "Saving…") : `${t("บันทึก", "Save")} ${ids.length} ${t("ไฟล์", "files")}`}</button>
          </div>
        </div>
      }>
      {busy && <LoadingOverlay message={t("กำลังบันทึก…", "Saving…")} />}
      <div className="space-y-2.5">
        <BulkEditRow on={enBrand} setOn={setEnBrand} label={t("แบรนด์", "Brand")} preview={prev("brand", (v: string) => brandLabel(v))}>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white">
            <option value="">{t("— ไม่มีแบรนด์ —", "— No brand —")}</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </BulkEditRow>
        <BulkEditRow on={enType} setOn={setEnType} label={t("ชนิด (แทนที่ของเดิม)", "Type (replaces existing)")} preview={prev("types", (v: string[]) => (v.length ? v.join(", ") : "—"))}>
          <ArtTypeMultiSelect value={types} types={artTypeList} onChange={setTypes} onCreated={(t) => setArtTypeList((c) => [...c, t])} />
        </BulkEditRow>
        <BulkEditRow on={enSize} setOn={setEnSize} label={t("ขนาด (กว้าง × สูง)", "Size (W × H)")} preview={prev("sizes", (v: AssetSize[]) => sizeLabel(v))}>
          <BulkModeToggle mode={sizeMode} setMode={setSizeMode} />
          {sizeMode === "all"
            ? <div className="mt-1.5"><SizesEditor value={sizes} onChange={setSizes} /><p className="text-[10px] text-slate-400 mt-1">{t("ใส่ค่าเดียว → แทนที่ทุกไฟล์", "One value → replace all files")}</p></div>
            : <p className="text-[11px] text-indigo-600 mt-1.5">{t("↓ แก้ขนาดแยกแต่ละไฟล์ในส่วนล่าง", "↓ Edit size per file in the section below")}</p>}
        </BulkEditRow>
        <BulkEditRow on={enParent} setOn={setEnParent} label="Parent SKU" preview={prev("parents", (v: string[]) => (v.length ? v.join(", ") : "—"))}>
          <BulkModeToggle mode={parentMode} setMode={setParentMode} />
          {parentMode === "all"
            ? <div className="mt-1.5"><ParentSkuField value={parents} onChange={setParents} /><p className="text-[10px] text-slate-400 mt-1">{t("เลือกชุดเดียว → แทนที่ทุกไฟล์", "Pick one set → replace all files")}</p></div>
            : <p className="text-[11px] text-indigo-600 mt-1.5">{t("↓ แก้ Parent SKU แยกแต่ละไฟล์ในส่วนล่าง", "↓ Edit Parent SKU per file in the section below")}</p>}
        </BulkEditRow>
        <BulkEditRow on={enTags} setOn={setEnTags} label={t("แท็ก (เพิ่มเข้าไป)", "Tags (add)")}>
          <TagPickerField value={tags} onChange={setTags} />
        </BulkEditRow>
        <BulkEditRow on={enKw} setOn={setEnKw} label={t("คำค้นเพิ่มเติม (keyword — แทนที่ของเดิม)", "Extra keywords (replaces existing)")} preview={prev("keywords", (v: string) => v || "—")}>
          <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder={t("เช่น flower ดอกไม้ summer", "e.g. flower summer")}
            className="w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" />
        </BulkEditRow>
        <BulkEditRow on={enLoc} setOn={setEnLoc} label={t("ที่เก็บไฟล์ต้นฉบับ (path / ลิงก์โฟลเดอร์)", "Source file location (path / folder link)")}
          preview={prev("path", (v: string) => <>{v || "—"}{cur && !cur.url.mixed && cur.url.value ? <span className="text-slate-400"> {t("· มีลิงก์โฟลเดอร์", "· has folder link")}</span> : null}</>)}>
          <BulkModeToggle mode={locMode} setMode={setLocMode} />
          {locMode === "all"
            ? <div className="mt-1.5 space-y-1.5">
                <input value={locPath} onChange={(e) => setLocPath(e.target.value)} placeholder={t("path เช่น G:\Shared drives\…\Bow (Purple)", "path e.g. G:\Shared drives\…\Bow (Purple)")} className="w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" />
                <input value={locUrl} onChange={(e) => setLocUrl(e.target.value)} placeholder={t("ลิงก์โฟลเดอร์ Drive (https://drive.google.com/…)", "Drive folder link (https://drive.google.com/…)")} className="w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" />
                <p className="text-[10px] text-slate-400">{t("ใส่ค่าเดียว → แทนที่ทุกไฟล์ (เว้นว่าง = ล้างค่า)", "One value → replace all files (blank = clear)")}</p>
              </div>
            : <p className="text-[11px] text-indigo-600 mt-1.5">{t("↓ แก้ path/ลิงก์แยกแต่ละไฟล์ในส่วนล่าง", "↓ Edit path/link per file in the section below")}</p>}
        </BulkEditRow>

        {needPerFile && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/20 p-2.5">
            <p className="text-[12px] font-medium text-slate-700 mb-2">{t("🗂️ แก้รายไฟล์", "🗂️ Edit per file")} ({ids.length} {t("ไฟล์", "files")})
              {enSize && sizeMode === "each" ? t(" · ขนาด", " · Size") : ""}{enParent && parentMode === "each" ? " · Parent SKU" : ""}{enLoc && locMode === "each" ? t(" · ที่เก็บไฟล์", " · Location") : ""}</p>
            {itemsLoading || items === null ? (
              <p className="text-[12px] text-slate-400 py-4 text-center">{t("กำลังโหลดไฟล์ที่เลือก…", "Loading selected files…")}</p>
            ) : (
              <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                {items.map((it) => (
                  <div key={it.id} className="rounded-lg border border-slate-200 bg-white p-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      {it.isImg ? <img src={withImageWidth(it.url, 80) ?? it.url} alt="" className="w-9 h-9 object-contain rounded border border-slate-200 bg-slate-50 shrink-0" /> : <span className="text-xl shrink-0">🎨</span>}
                      <span className="text-[12px] text-slate-700 truncate">{it.title}</span>
                    </div>
                    {enSize && sizeMode === "each" && (
                      <div className="mb-1.5"><p className="text-[10px] text-slate-400 mb-0.5">{t("📐 ขนาด (กว้าง × สูง)", "📐 Size (W × H)")}</p><SizesEditor value={pfSizes[it.id] ?? []} onChange={(v) => setPfSizes((m) => ({ ...m, [it.id]: v }))} /></div>
                    )}
                    {enParent && parentMode === "each" && (
                      <div><p className="text-[10px] text-slate-400 mb-0.5">📦 Parent SKU</p><ParentSkuField value={pfParents[it.id] ?? []} onChange={(v) => setPfParents((m) => ({ ...m, [it.id]: v }))} /></div>
                    )}
                    {enLoc && locMode === "each" && (
                      <div className="mt-1.5 space-y-1">
                        <p className="text-[10px] text-slate-400 mb-0.5">{t("📁 ที่เก็บไฟล์ต้นฉบับ", "📁 Source file location")}</p>
                        <input value={pfPath[it.id] ?? ""} onChange={(e) => setPfPath((m) => ({ ...m, [it.id]: e.target.value }))} placeholder={t("path เช่น G:\Shared drives\…", "path e.g. G:\Shared drives\…")} className="w-full h-8 px-2.5 text-[11px] border border-slate-200 rounded-lg" />
                        <input value={pfUrl[it.id] ?? ""} onChange={(e) => setPfUrl((m) => ({ ...m, [it.id]: e.target.value }))} placeholder={t("ลิงก์โฟลเดอร์ Drive", "Drive folder link")} className="w-full h-8 px-2.5 text-[11px] border border-slate-200 rounded-lg" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </ERPModal>
  );
}

// ── สร้างโฟลเดอร์ Drive หลายรูป — เลือก "แยก (รูปละโฟลเดอร์)" หรือ "รวมเป็นโฟลเดอร์เดียว" (ตั้งชื่อได้) ──
export function BulkFolderModal({ ids, firstAsset, onClose, onDone }: {
  ids: string[]; firstAsset: AssetRow | null; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const { brandBase, typeSub } = useDriveFolderMaps();
  const t = useT();
  const [mode, setMode] = useState<"separate" | "combined">("separate");
  const [folderName, setFolderName] = useState(firstAsset?.title ?? "");   // default = ชื่อรูปแรก
  const [brandId, setBrandId] = useState("");
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const artType = firstAsset?.artwork_types?.[0] ?? firstAsset?.artwork_type ?? undefined;
  useEffect(() => { apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {}); }, []);
  // ดึงแบรนด์จากรูปแรกมาเป็นค่าเริ่มต้น (ไว้จัดที่ตั้งโฟลเดอร์รวม)
  useEffect(() => { if (firstAsset) apiFetch(`/api/assets/${firstAsset.id}`).then((r) => r.json()).then((j) => { if (j.data?.brand_id) setBrandId(j.data.brand_id); }).catch(() => {}); }, [firstAsset]);

  const run = async () => {
    setBusy(true);
    try {
      if (mode === "separate") {
        const res = await apiFetch("/api/assets/drive-folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
        const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("ทำไม่สำเร็จ", "Action failed"));
        toast.success(`${t("สร้างโฟลเดอร์", "Created folder for")} ${j.created} ${t("ไฟล์", "files")}${j.skipped ? ` · ${t("ข้าม(มีแล้ว)", "skipped (existing)")} ${j.skipped}` : ""}${j.failed ? ` · ${t("ล้มเหลว", "failed")} ${j.failed}` : ""}`);
      } else {
        const nm = folderName.trim(); if (!nm) { toast.error(t("ตั้งชื่อโฟลเดอร์ก่อน", "Name the folder first")); setBusy(false); return; }
        const master_path = brandFolderPath(nm, brandId, artType, brandBase, typeSub);   // path ในเครื่องตามแบรนด์/ชนิด/ชื่อ
        const res = await apiFetch("/api/assets/drive-folders/combined", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, brand_id: brandId || undefined, artwork_type: artType, folder_name: nm, master_path: master_path || undefined }) });
        const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("ทำไม่สำเร็จ", "Action failed"));
        toast.success(`${t("สร้างโฟลเดอร์", "Created folder")} “${nm}” + ${t("ใส่", "added")} ${j.count ?? ids.length} ${t("รูปแล้ว", "images")}`);
      }
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ทำไม่สำเร็จ", "Action failed")); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} title={`🗂️ ${t("สร้างโฟลเดอร์ Drive", "Create Drive folder")} (${ids.length} ${t("รูป", "images")})`} size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={run} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">{busy && <Spinner />}{busy ? t("กำลังทำ…", "Working…") : t("สร้าง", "Create")}</button>
        </div>
      }>
      {busy && <LoadingOverlay message={mode === "combined" ? t("กำลังสร้างโฟลเดอร์ + ก็อปรูป… อาจใช้เวลาสักครู่", "Creating folder + copying images… this may take a moment") : t("กำลังสร้างโฟลเดอร์ทีละรูป… อาจใช้เวลาสักครู่", "Creating a folder per image… this may take a moment")} />}
      <div className="flex gap-1 mb-3 p-0.5 bg-slate-100 rounded-lg">
        <button type="button" onClick={() => setMode("separate")}
          className={`flex-1 h-8 text-[12px] font-medium rounded-md transition ${mode === "separate" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t("🗂️ แยก (รูปละโฟลเดอร์)", "🗂️ Separate (one folder per image)")}</button>
        <button type="button" onClick={() => setMode("combined")}
          className={`flex-1 h-8 text-[12px] font-medium rounded-md transition ${mode === "combined" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t("📦 รวมโฟลเดอร์เดียว", "📦 One combined folder")}</button>
      </div>

      {mode === "separate" ? (
        <p className="text-[12px] text-slate-500">{t("แต่ละรูปจะได้โฟลเดอร์ Drive ของตัวเอง (ตามชื่อรูป + แบรนด์/ชนิดของรูปนั้น) · รูปที่มีโฟลเดอร์อยู่แล้วจะข้าม", "Each image gets its own Drive folder (by image name + that image's brand/type) · images that already have a folder are skipped")}</p>
      ) : (
        <div className="space-y-2.5">
          <p className="text-[12px] text-slate-500">{t("สร้างโฟลเดอร์ Drive", "Create a Drive folder")} <b>{t("1 อัน", "(just one)")}</b> {t("แล้วเอาทุกรูปที่เลือกใส่เข้าไป (ก็อปรูปตัวอย่างให้ด้วย)", "then put all selected images in it (previews copied too)")}</p>
          <label className="block text-[12px] text-slate-500">{t("ชื่อโฟลเดอร์", "Folder name")} <span className="text-red-500">*</span>
            <input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder={t("เช่น Cherry Collection", "e.g. Cherry Collection")}
              className={`mt-0.5 w-full h-9 px-3 text-sm border rounded-lg ${folderName.trim() ? "border-slate-200" : "border-amber-300"}`} /></label>
          <label className="block text-[12px] text-slate-500">{t("แบรนด์ (ไว้จัดที่ตั้งโฟลเดอร์)", "Brand (to place the folder)")}
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
              <option value="">{t("— โฟลเดอร์แม่ (ไม่จัดตามแบรนด์) —", "— Parent folder (not organized by brand) —")}</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>
        </div>
      )}
    </ERPModal>
  );
}
