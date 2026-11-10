"use client";

/**
 * ดูและแก้ก่อนสร้างสินค้าบน Lazada (ของกลาง) — แท็บ Lazada ในตัวช่วยลงสินค้า (AddToPlatformWizard ขั้น "ดูและแก้")
 * --------------------------------------------------------------------------
 * ข้อมูล = GET /api/lazada/create-product?parent_sku_id= (ตัวประกอบเดียวกับตอนลงจริง — lib/lazada-create-plan)
 * แก้แล้วเขียนลง "ร่าง Lazada" (PATCH /api/product-platforms) — ไม่แก้ข้อมูลสินค้าในระบบ:
 *   ชื่อ / รายละเอียด / หมวด → ร่าง · รูป → extra.lazada_images · จุดเด่น → extra.lazada_highlights
 *   น้ำหนัก (แทนของสินค้า) → extra.lazada_weight · ชั้นตัวเลือก → extra.lazada_variation · ข้อมูลเฉพาะของหมวด → extra.lazada_attrs
 * ของกลางที่ใช้: ListingImageGrid/ListingImagePicker (รูป) · LazadaAttrField + useLazadaAttrDefs (ช่องของหมวด — ตัวเดียวกับลิ้นชัก Lazada)
 *   PlatformCategoryPicker (หมวด) · state-views
 * ห้ามใช้: แก้สินค้าที่มีบน Lazada แล้ว (ใช้ลิ้นชักสินค้าบนร้าน)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { PlatformCategoryPicker } from "@/components/platform-category-picker";
import { ListingImageGrid, ListingImagePicker, listingImgSrc, useSystemImages } from "@/components/platform-catalog/listing-images";
import { LazadaAttrField, useLazadaAttrDefs } from "@/components/platform-catalog/lazada-listing-panels";
import { lazAttrEditable, lazAttrGroup, lazNormAttr } from "@/lib/lazada-listing-edit";
import { noteToText } from "@/lib/rich-note";
import { LAZADA_CREATE_MAX_IMAGES, type LazCreatePreview } from "@/lib/lazada-create-plan";

type Resp = { preview: LazCreatePreview | null; blockers?: string[]; live?: boolean; platform_id?: string; brand_id?: string | null; error: string | null };
type EditKey = "name" | "desc" | "hi" | "weight" | null;
const baht = (n: number | null) => (n == null ? "—" : n.toLocaleString("th-TH"));

export function LazadaCreatePreviewEditor({ parentId, canEdit, onLoaded }: {
  parentId: string;
  canEdit: boolean;
  /** โหลดแล้ว — ให้ตัวช่วยรู้จำนวนข้อที่ขาด */
  onLoaded?: (pv: LazCreatePreview, blockers: string[]) => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<EditKey>(null);
  const [val, setVal] = useState("");
  const [imgs, setImgs] = useState<string[] | null>(null);
  const [picker, setPicker] = useState(false);
  const [attrs, setAttrs] = useState<Record<string, string> | null>(null);
  const [moreAttrs, setMoreAttrs] = useState(false);
  const sys = useSystemImages(parentId);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch(`/api/lazada/create-product?parent_sku_id=${encodeURIComponent(parentId)}`).then((r) => r.json()) as Resp;
      if (j.error || !j.preview) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setData(j); setImgs(null); setAttrs(null); onLoaded?.(j.preview, j.blockers ?? []);
    } catch (e) { setErr((e as Error).message || "โหลดไม่สำเร็จ"); }
  }, [parentId, onLoaded]);
  useEffect(() => { setData(null); void load(); }, [load]);

  const pv = data?.preview ?? null;
  const defsState = useLazadaAttrDefs(data?.brand_id ?? null, pv?.category.id ?? null);
  const { load: loadDefs } = defsState;
  useEffect(() => { loadDefs(); }, [loadDefs]);

  const patch = async (body: Record<string, unknown>, okMsg: string) => {
    if (!pv || !data?.platform_id) return;
    setSaving(true);
    try {
      const r = await apiFetch("/api/product-platforms", { method: "PATCH", body: JSON.stringify({ parent_sku_id: parentId, platform_id: data.platform_id, ...body }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      toast.success(okMsg); setEdit(null); await load();
    } catch (e) { toast.error((e as Error).message || "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  const patchExtra = (partial: Record<string, unknown>, okMsg: string) => patch({ extra: { ...(pv?.draft_extra ?? {}), ...partial } }, okMsg);

  const editable = useMemo(() => (defsState.defs ?? []).filter((d) => lazAttrEditable(d) && lazAttrGroup(d) !== "gift"), [defsState.defs]);
  if (err) return <ErrorState title="โหลดข้อมูลที่จะส่ง Lazada ไม่สำเร็จ" hint={err} onRetry={() => void load()} className="py-6" />;
  if (!pv || !data) return <LoadingState label="กำลังเตรียมข้อมูลที่จะส่ง Lazada…" className="py-6" />;

  const blockers = data.blockers ?? [];
  const curImgs = imgs ?? pv.images.refs;
  const imgDirty = !!imgs && imgs.join("|") !== pv.images.refs.join("|");
  const attrVals = attrs ?? pv.attrs.values;
  const attrDirty = !!attrs && JSON.stringify(attrs) !== JSON.stringify(pv.attrs.values);
  const sortedAttrs = [...editable].sort((a, b) => Number(b.required) - Number(a.required) || Number(b.is_key_prop) - Number(a.is_key_prop));
  const mainAttrs = sortedAttrs.filter((d) => d.required || d.is_key_prop || lazNormAttr(d, attrVals[d.name]));
  const restAttrs = sortedAttrs.filter((d) => !mainAttrs.includes(d));

  const fieldRow = (k: Exclude<EditKey, null>, label: string, shown: React.ReactNode, src: string, start: string, opts: { multiline?: boolean; bad?: boolean; save: (v: string) => void; placeholder?: string }) => (
    <div className="grid gap-x-3 gap-y-1 py-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="min-w-0">
        {edit === k ? (
          <div className="space-y-1.5">
            {opts.multiline
              ? <textarea value={val} onChange={(e) => setVal(e.target.value)} rows={6} placeholder={opts.placeholder} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              : <input value={val} onChange={(e) => setVal(e.target.value)} placeholder={opts.placeholder} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" />}
            <div className="flex gap-1.5">
              <button type="button" disabled={saving} onClick={() => opts.save(val)} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกลงร่าง Lazada</button>
              <button type="button" onClick={() => setEdit(null)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <div className={`min-w-0 flex-1 break-words text-sm ${opts.bad ? "text-rose-600" : "text-slate-800"}`}>{shown}</div>
            {canEdit && <button type="button" onClick={() => { setEdit(k); setVal(start); }} className="shrink-0 text-xs text-violet-700 hover:underline">แก้</button>}
          </div>
        )}
        <div className="mt-0.5 text-[11px] text-slate-400">มาจาก: {src}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {!data.live && <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800"><Icon name="info" /> ดูก่อนส่งได้ครบ · ลงจริงบน Lazada เปิดเมื่อ Lazada ให้สร้างสินค้าอีกครั้ง (ปิดช่วงแคมเปญ) — ตอนนี้ระบบบันทึกร่างไว้ให้</p>}
      {(pv.missing.length > 0 || blockers.length > 0) && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {pv.missing.length > 0 && <div><Icon name="warning" /> ยังขาด: {pv.missing.join(" · ")}</div>}
          {blockers.map((b) => <div key={b}><Icon name="warning" /> {b}</div>)}
        </div>
      )}
      {pv.warnings.length > 0 && <ul className="space-y-0.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{pv.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}

      {/* รูป */}
      <div>
        <ListingImageGrid images={curImgs} onChange={(next) => setImgs(next)} canEdit={canEdit} max={LAZADA_CREATE_MAX_IMAGES} platformName="Lazada"
          onOpen={() => {}} onAdd={() => { setPicker(true); sys.load(); }} canAdd={canEdit}
          note="รูปแรก = ปก · ระบบฝากรูปเข้า Lazada ให้ตอนลงจริง (Lazada ไม่รับลิงก์รูปภายนอก) · ควรเป็นพื้นขาว" />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span>มาจาก: {imgDirty ? "ที่เลือกตอนนี้ (ยังไม่บันทึก)" : pv.images.src}</span>
          {canEdit && imgDirty && <button type="button" disabled={saving || curImgs.length === 0} onClick={() => void patchExtra({ lazada_images: curImgs }, "บันทึกรูปแล้ว")} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกรูปที่เลือก</button>}
          {canEdit && imgDirty && <button type="button" onClick={() => setImgs(null)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>}
          {canEdit && !imgDirty && pv.images.custom && <button type="button" disabled={saving} onClick={() => { const ex = { ...pv.draft_extra }; delete ex.lazada_images; void patch({ extra: ex }, "กลับไปใช้รูปอัตโนมัติ"); }} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">กลับไปใช้รูปอัตโนมัติ</button>}
        </div>
        <ListingImagePicker open={picker} onClose={() => setPicker(false)} mode="product" title="เลือกรูปสินค้าสำหรับ Lazada"
          description={`เลือกได้อีก ${Math.max(0, LAZADA_CREATE_MAX_IMAGES - curImgs.length)} รูป (Lazada รับไม่เกิน ${LAZADA_CREATE_MAX_IMAGES})`}
          matchedParent={parentId} matchedCode={pv.parent_code} sysImages={sys.images} isUsed={(ref) => curImgs.includes(ref)} full={curImgs.length >= LAZADA_CREATE_MAX_IMAGES}
          onPick={(ref) => setImgs((xs) => [...(xs ?? pv.images.refs), ref].slice(0, LAZADA_CREATE_MAX_IMAGES))} storageKey="lazada-create-image-picker" />
      </div>

      {/* ข้อความ */}
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
        {fieldRow("name", "ชื่อ", pv.name.value || "(ยังไม่มีชื่อ)", pv.name.src, pv.name.value, { bad: !pv.name.value, save: (v) => void patch({ title: v.trim() || null }, "บันทึกชื่อแล้ว") })}
        <div className="grid gap-x-3 gap-y-1 py-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <span className="text-xs text-slate-500">หมวด Lazada</span>
          <div className="min-w-0">
            <div className={`text-sm ${pv.category.id ? "text-slate-800" : "text-rose-600"}`}>{pv.category.label || "ยังไม่ได้เลือก — ต้องเลือกก่อนลง"}</div>
            {canEdit && data.platform_id && <div className="mt-1 max-w-md"><PlatformCategoryPicker platformId={data.platform_id} placeholder="เปลี่ยนหมวด Lazada (พิมพ์ค้น เช่น กระเป๋า / bag)" onPick={(label) => void patch({ category_path: label }, "บันทึกหมวดแล้ว")} /></div>}
            <div className="mt-0.5 text-[11px] text-slate-400">มาจาก: {pv.category.src} · เปลี่ยนหมวด = ช่องข้อมูลเฉพาะเปลี่ยนตาม</div>
          </div>
        </div>
        <div className="grid gap-x-3 gap-y-1 py-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <span className="text-xs text-slate-500">แบรนด์</span>
          <div><div className="text-sm text-slate-800">{pv.brand.value}</div><div className="mt-0.5 text-[11px] text-slate-400">มาจาก: {pv.brand.src}</div></div>
        </div>
        {fieldRow("hi", "จุดเด่น", pv.highlights.value ? <ul className="list-disc pl-4">{pv.highlights.value.split("\n").filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ul> : <span className="text-slate-400">ไม่มี (ไม่บังคับ)</span>, pv.highlights.src, pv.highlights.value,
          { multiline: true, placeholder: "1 บรรทัด = 1 จุดเด่น", save: (v) => void patchExtra({ lazada_highlights: v.trim() || null }, "บันทึกจุดเด่นแล้ว") })}
        {fieldRow("desc", "รายละเอียด", pv.description.value ? <div className="line-clamp-6 whitespace-pre-line text-slate-700">{noteToText(pv.description.value)}</div> : <span className="text-slate-400">ไม่มี (ไม่บังคับ)</span>, pv.description.src, noteToText(pv.description.value),
          { multiline: true, save: (v) => void patch({ description: v.trim() || null }, "บันทึกรายละเอียดแล้ว") })}
      </div>

      {/* พัสดุ */}
      <div className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
        <div className="mb-1 text-xs font-medium text-slate-600">พัสดุ (บังคับ)</div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span className={pv.package.weight ? "" : "text-rose-600"}>น้ำหนัก {pv.package.weight ? `${pv.package.weight} กก.` : "— ยังไม่มี"}</span>
          <span className={pv.package.l && pv.package.w && pv.package.h ? "" : "text-rose-600"}>กล่อง {pv.package.l && pv.package.w && pv.package.h ? `${pv.package.l}×${pv.package.w}×${pv.package.h} ซม.` : "— ยังไม่ได้เลือกขนาดกล่อง"}</span>
          {canEdit && edit !== "weight" && <button type="button" onClick={() => { setEdit("weight"); setVal(pv.package.weight ? String(pv.package.weight) : ""); }} className="text-xs text-violet-700 hover:underline">ใส่น้ำหนักสำหรับ Lazada</button>}
        </div>
        {edit === "weight" && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <input value={val} onChange={(e) => setVal(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="h-8 w-24 rounded-md border border-slate-200 px-2 text-sm" aria-label="น้ำหนัก กิโลกรัม" />
            <span className="text-xs text-slate-500">กก.</span>
            <button type="button" disabled={saving} onClick={() => void patchExtra({ lazada_weight: Number(val) > 0 ? Number(val) : null }, "บันทึกน้ำหนักแล้ว")} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึก</button>
            <button type="button" onClick={() => setEdit(null)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
          </div>
        )}
        <div className="mt-0.5 text-[11px] text-slate-400">มาจาก: {pv.package.src} · ขนาดกล่องแก้ที่หน้าสินค้า (Parent SKU)</div>
      </div>

      {/* ตัวเลือก + ราคา */}
      <div className="rounded-xl border border-slate-200 p-3 text-sm">
        <div className="mb-2 text-xs font-medium text-slate-600">ตัวเลือก & ราคา ({pv.variants.length.toLocaleString()} SKU · สต๊อกส่ง 0 — ระบบสต๊อกดูแลทีหลัง)</div>
        {pv.dims.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {pv.dims.map((dm) => (
              <div key={dm.key} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500">ชั้น &quot;{dm.label}&quot; ({dm.values.length} ค่า) →</span>
                {canEdit ? (
                  <select value={dm.customize ? `custom:${dm.lazName}` : dm.lazName} disabled={saving}
                    onChange={(e) => { const v = e.target.value; const next = { ...((pv.draft_extra.lazada_variation as Record<string, unknown>) ?? {}), [dm.key]: v.startsWith("custom:") ? { name: v.slice(7) || dm.label.slice(0, 15), customize: true } : { name: v, customize: false } }; void patchExtra({ lazada_variation: next }, "บันทึกชั้นตัวเลือกแล้ว"); }}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs">
                    {pv.saleProps.map((sp) => <option key={sp.name} value={sp.name}>{sp.label} (ช่องของหมวด)</option>)}
                    <option value={`custom:${dm.customize ? dm.lazName : dm.label.slice(0, 15)}`}>กำหนดเอง: {dm.customize ? dm.lazName : dm.label.slice(0, 15)}</option>
                  </select>
                ) : <span className="font-medium">{dm.lazName}</span>}
                {dm.hasImage && <span className="text-emerald-700">มีรูปต่อตัวเลือก</span>}
                <span className="text-slate-400">· {dm.src}</span>
              </div>
            ))}
          </div>
        )}
        <div className="max-h-64 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-100">
          {pv.variants.map((v) => (
            <div key={v.sku_id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5 text-xs">
              {v.image_ref ? <img src={listingImgSrc(v.image_ref, 96)} alt="" className="h-8 w-8 rounded object-cover" /> : <span className="h-8 w-8 rounded bg-slate-50" />}
              <div className="min-w-0"><div className="truncate font-mono">{v.code}</div><div className="truncate text-slate-500">{Object.values(v.saleProp).join(" · ") || "—"}</div></div>
              <div className="text-right">{v.special != null ? <><span className="text-slate-400 line-through">{baht(v.price)}</span> <span className="font-medium text-rose-600">{baht(v.special)}</span></> : <span className={v.price ? "font-medium" : "text-rose-600"}>{v.price ? baht(v.price) : "ไม่มีราคา"}</span>}</div>
            </div>
          ))}
        </div>
        <div className="mt-1 text-[11px] text-slate-400">ราคาเต็ม = ราคาเต็มในระบบ · ราคาลด = ราคาขาย (ไม่มีราคาเต็ม = ราคาขายเป็นราคาปกติ) · แก้ราคาที่หน้า SKU</div>
      </div>

      {/* ข้อมูลเฉพาะของหมวด */}
      <div className="rounded-xl border border-slate-200 p-3 text-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-600">ข้อมูลเฉพาะของหมวด {pv.attrs.missingRequired.length ? <span className="text-rose-600">· ช่องบังคับยังว่าง {pv.attrs.missingRequired.length}</span> : null}</span>
          {canEdit && attrDirty && (
            <div className="flex gap-1.5">
              <button type="button" disabled={saving} onClick={() => void patchExtra({ lazada_attrs: attrVals }, "บันทึกข้อมูลเฉพาะแล้ว")} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกลงร่าง Lazada</button>
              <button type="button" onClick={() => setAttrs(null)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
            </div>
          )}
        </div>
        {!pv.category.id ? <p className="text-xs text-slate-500">เลือกหมวด Lazada ก่อน แล้วช่องของหมวดจะขึ้นที่นี่</p>
          : defsState.error ? <ErrorState title={defsState.error} onRetry={defsState.load} className="py-4" />
          : !defsState.defs ? <LoadingState label="กำลังดึงช่องของหมวดจาก Lazada…" className="py-4" />
          : sortedAttrs.length === 0 ? <p className="text-xs text-slate-500">หมวดนี้ไม่มีช่องให้กรอกเพิ่ม</p>
          : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {(moreAttrs ? sortedAttrs : mainAttrs).map((d) => (
                  <LazadaAttrField key={d.name} def={d} value={attrVals[d.name] ?? ""} base={pv.attrs.values[d.name] ?? ""} can={canEdit}
                    onChange={(x) => setAttrs((a) => ({ ...(a ?? pv.attrs.values), [d.name]: x }))} />
                ))}
              </div>
              {restAttrs.length > 0 && <button type="button" onClick={() => setMoreAttrs((x) => !x)} className="mt-2 text-xs text-violet-700 hover:underline">{moreAttrs ? "ซ่อนช่องเพิ่มเติม" : `แสดงเพิ่มเติม (${restAttrs.length} ช่อง)`}</button>}
            </>
          )}
      </div>
    </div>
  );
}
