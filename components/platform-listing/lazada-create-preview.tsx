"use client";

/**
 * ดูและแก้ก่อนสร้างสินค้าบน Lazada (ของกลาง) — แท็บ Lazada ในตัวช่วยลงสินค้า (AddToPlatformWizard ขั้น "ดูและแก้")
 * --------------------------------------------------------------------------
 * ข้อมูล = GET /api/lazada/create-product?parent_sku_id= (ตัวประกอบเดียวกับตอนลงจริง — lib/lazada-create-plan)
 * แก้แล้วเขียนลง "ร่าง Lazada" (PATCH /api/product-platforms) — ไม่แก้ข้อมูลสินค้าในระบบ:
 *   ชื่อ / รายละเอียด / หมวด → ร่าง · รูป → extra.lazada_images · จุดเด่น → extra.lazada_highlights
 *   น้ำหนัก (แทนของสินค้า) → extra.lazada_weight · ชั้นตัวเลือก → extra.lazada_variation · ข้อมูลเฉพาะของหมวด → extra.lazada_attrs
 *   รูปตัวเลือก (≤ 8 รูป/ตัว · สีเดียวกันใช้ชุดเดียวกัน) → extra.lazada_sku_images { รหัส SKU: [ref] } — ไม่ตั้ง = รูปทั้งหมดของ SKU ในระบบ
 * รอบ LY22 (เจ้าของเลือก 2026-11-20 · ให้เหมือน Shopee · ใช้ชิ้นส่วนร่วม):
 *   ตารางตัวเลือกกลาง (โชว์รูปทุกรูป ไม่พับ · แก้ราคา extra.lazada_prices / ชื่อสี extra.lazada_option_names · สต๊อกล็อก 0)
 *   ช่องของหมวด: ค่าเริ่มต้นของร้าน (ป๊อป AttrDefaultsDialog) + AI เดาให้เองตอนเปิดครั้งแรก แล้วจำผลไว้ในร่าง (extra.lazada_attr_guess · ไม่เดาซ้ำ)
 *   รายละเอียด = กล่องกลางแบบ B (หน้าตาเหมือนบนร้าน · กดแก้) + รูปในรายละเอียด (extra.lazada_desc_images) · บันทึกลงร่างทุกครั้งย้อนกลับได้
 * ของกลางที่ใช้: ListingImageGrid/ListingImagePicker (รูป) · LazadaAttrField + useLazadaAttrDefs (ช่องของหมวด — ตัวเดียวกับลิ้นชัก Lazada)
 *   PlatformCategoryPicker (หมวด) · ListingVariantTable · ListingDescriptionBox · AttrDefaultsDialog · attr-suggest-box · state-views
 * ห้ามใช้: แก้สินค้าที่มีบน Lazada แล้ว (ใช้ลิ้นชักสินค้าบนร้าน)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { ERPModal } from "@/components/modal";
import { PlatformCategoryPicker } from "@/components/platform-category-picker";
import { ListingImageGrid, ListingImagePicker, listingImgSrc, useSystemImages } from "@/components/platform-catalog/listing-images";
import { LazadaAttrField, useLazadaAttrDefs } from "@/components/platform-catalog/lazada-listing-panels";
import { lazAttrEditable, lazAttrGroup, lazNormAttr } from "@/lib/lazada-listing-edit";
import { noteToText } from "@/lib/rich-note";
import { LAZADA_CREATE_MAX_IMAGES, type LazCreatePreview } from "@/lib/lazada-create-plan";
import { lazAttrFieldOf, lazAttrStateOf, lazAttrValuesOf } from "@/lib/lazada-attr-fields";
import { suggestAttrsFromText } from "@/lib/attr-suggest";
import { AttrDefaultsDialog } from "@/components/platform-catalog/attr-defaults-dialog";
import { AttrSuggestButtons, AttrSuggestPanel, applyAttrHits, fetchAiAttrHits, useAttrSuggest, type AttrSuggestSource } from "@/components/platform-catalog/attr-suggest-box";
import { ListingVariantTable, NO_VARIANT_EDIT, type VariantEdit, type VariantTableRow } from "@/components/platform-listing/listing-variant-table";
import { ListingDescriptionBox } from "@/components/platform-listing/listing-description-box";

type Resp = { preview: LazCreatePreview | null; blockers?: string[]; live?: boolean; platform_id?: string; brand_id?: string | null; error: string | null };
type EditKey = "name" | "hi" | "weight" | null;
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
  const [skuImgFor, setSkuImgFor] = useState<string | null>(null);
  const [vEdit, setVEdit] = useState<VariantEdit>(NO_VARIANT_EDIT);                  // ตารางตัวเลือกที่แก้ (ยังไม่บันทึก)
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [attrSrc, setAttrSrc] = useState<Record<string, AttrSuggestSource>>({});   // ช่องที่เพิ่งเติมจากปุ่มแนะนำ (ยังไม่บันทึก)
  const [guessing, setGuessing] = useState(false);
  const autoRan = useRef<string | null>(null);
  const sys = useSystemImages(parentId);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch(`/api/lazada/create-product?parent_sku_id=${encodeURIComponent(parentId)}`).then((r) => r.json()) as Resp;
      if (j.error || !j.preview) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setData(j); setImgs(null); setAttrs(null); setVEdit(NO_VARIANT_EDIT); setAttrSrc({}); onLoaded?.(j.preview, j.blockers ?? []);
    } catch (e) { setErr((e as Error).message || "โหลดไม่สำเร็จ"); }
  }, [parentId, onLoaded]);
  useEffect(() => { setData(null); void load(); }, [load]);

  const pv = data?.preview ?? null;
  const defsState = useLazadaAttrDefs(data?.brand_id ?? null, pv?.category.id ?? null);
  const { load: loadDefs } = defsState;
  useEffect(() => { loadDefs(); }, [loadDefs]);

  /** undo = ก้อนที่ส่งซ้ำเพื่อคืนค่าก่อนหน้า (ปุ่ม "ย้อนกลับ" ในแจ้งผล) · okMsg null = บันทึกเงียบ ๆ */
  const patch = async (body: Record<string, unknown>, okMsg: string | null, undo?: Record<string, unknown>): Promise<boolean> => {
    if (!pv || !data?.platform_id) return false;
    setSaving(true);
    try {
      const r = await apiFetch("/api/product-platforms", { method: "PATCH", body: JSON.stringify({ parent_sku_id: parentId, platform_id: data.platform_id, ...body }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      if (okMsg) { if (undo) toast.undo(okMsg, () => void patch(undo, "ย้อนกลับแล้ว")); else toast.success(okMsg); }
      setEdit(null); await load();
      return true;
    } catch (e) { toast.error((e as Error).message || "บันทึกไม่สำเร็จ"); return false; }
    finally { setSaving(false); }
  };
  const prevExtra = () => ({ extra: { ...(pv?.draft_extra ?? {}) } });
  const patchExtra = (partial: Record<string, unknown>, okMsg: string | null) => patch({ extra: { ...(pv?.draft_extra ?? {}), ...partial } }, okMsg, prevExtra());
  const dropExtra = (keys: string[], okMsg: string) => { const ex = { ...(pv?.draft_extra ?? {}) }; for (const k of keys) delete ex[k]; return patch({ extra: ex }, okMsg, prevExtra()); };
  /** รูปตัวเลือก: เขียนให้ทุก SKU ในกลุ่ม (สีเดียวกัน) · refs = null → กลับไปใช้รูปอัตโนมัติ */
  const saveSkuImages = async (codes: string[], refs: string[] | null) => {
    const cur = { ...((pv?.draft_extra.lazada_sku_images as Record<string, unknown> | undefined) ?? {}) };
    for (const c of codes) { if (refs) cur[c] = refs; else delete cur[c]; }
    const ok = await patchExtra({ lazada_sku_images: Object.keys(cur).length ? cur : null }, refs ? "บันทึกรูปตัวเลือกแล้ว" : "กลับไปใช้รูปอัตโนมัติ");
    if (ok) setSkuImgFor(null);
  };

  const editable = useMemo(() => (defsState.defs ?? []).filter((d) => lazAttrEditable(d) && lazAttrGroup(d) !== "gift"), [defsState.defs]);
  const attrFields = useMemo(() => editable.map(lazAttrFieldOf), [editable]);
  const descText = pv ? noteToText(pv.description.value) : "";
  const aiInput = pv && canEdit ? { platform: "Lazada", name: pv.name.value, description: descText, category: pv.category.label, imageKeys: pv.images.refs.filter((r) => r.startsWith("r2:")).map((r) => r.slice(3)) } : null;
  const sug = useAttrSuggest({ fields: attrFields, values: lazAttrStateOf(editable, attrs ?? pv?.attrs.values ?? {}), text: () => `${pv?.name.value ?? ""}\n${descText}`, ai: aiInput });

  // AI เดาช่องให้เองตอนเปิดครั้งแรก (เจ้าของเลือกข้อ 2) → จำผลไว้ในร่าง extra.lazada_attr_guess (เปิดใหม่ไม่เดาซ้ำ · ไม่เสียเงินซ้ำ)
  //   ตัวเลือก Lazada เป็นอังกฤษ จับคำจากรายละเอียดไทยแทบไม่เจอ → AI ก่อน แล้วจับคำ (ฟรี) เติมช่องที่ AI ไม่ได้ตอบ · ค่าที่เดาส่งพร้อมตอนลง (ป้าย "ตรวจก่อน")
  useEffect(() => {
    if (!pv || !canEdit || !data?.platform_id || pv.attrs.guess || !defsState.defs || !attrFields.length || !pv.category.id) return;
    const key = `${parentId}|${pv.category.id}`;
    if (autoRan.current === key) return;
    autoRan.current = key;
    const cur = lazAttrStateOf(editable, pv.attrs.values);
    const empty = attrFields.filter((f) => !(cur[f.id] ?? []).length);
    if (!empty.length) return;
    void (async () => {
      setGuessing(true);
      try {
        const textHits = suggestAttrsFromText(empty, `${pv.name.value}\n${descText}`);
        const ai = aiInput ? await fetchAiAttrHits(aiInput, empty) : { hits: [], error: "ไม่มีสิทธิ์แก้" };
        const by: Record<string, "ai" | "text"> = {};
        const merged = [...ai.hits];
        for (const h of ai.hits) by[h.fieldId] = "ai";
        for (const h of textHits) if (!by[h.fieldId]) { merged.push(h); by[h.fieldId] = "text"; }
        const values = lazAttrValuesOf(editable, applyAttrHits({}, merged).next);
        const guess = { at: new Date().toISOString(), ai: ai.hits.length > 0, by, values, ...(ai.error ? { ai_error: ai.error } : {}) };
        const ok = await patch({ extra: { ...pv.draft_extra, lazada_attr_guess: guess } }, null);
        if (ok) {
          const n = Object.keys(values).length;
          if (n) toast.info(`เดาช่องให้แล้ว ${n} ช่อง (AI ${ai.hits.length}) — ตรวจก่อนลง`);
          else if (ai.error) toast.warning(`AI เดาช่องไม่ได้: ${ai.error}`);
        }
      } finally { setGuessing(false); }
    })();
  }, [pv, canEdit, data?.platform_id, defsState.defs, attrFields, editable, parentId]);   // eslint-disable-line react-hooks/exhaustive-deps
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
        <div className="grid gap-x-3 gap-y-1 py-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <span className="text-xs text-slate-500">รายละเอียด</span>
          <div className="min-w-0">
            <ListingDescriptionBox platformName="Lazada" text={descText} html={pv.description.value} src={pv.description.src} canEdit={canEdit} saving={saving} maxLen={25_000}
              onSave={(v) => void patch({ description: v.trim() || null }, "บันทึกรายละเอียดแล้ว", { description: descText || null })}
              images={{ ...pv.descImages, parentId, parentCode: pv.parent_code,
                onSave: (refs) => void patchExtra({ lazada_desc_images: refs }, refs.length ? "บันทึกรูปในรายละเอียดแล้ว" : "เอารูปในรายละเอียดออกแล้ว"),
                onReset: () => void dropExtra(["lazada_desc_images"], "กลับไปใช้รูปอัตโนมัติ") }} />
          </div>
        </div>
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

      {/* ตัวเลือก + ราคา — ตารางกลาง (ตัวเดียวกับ Shopee) */}
      {(() => {
        const colorDim = pv.dims[0]?.key === "color" ? pv.dims[0] : null;
        const others = pv.dims.filter((d) => d !== colorDim);
        const rows: VariantTableRow[] = pv.variants.map((v) => ({
          sku_id: v.sku_id, code: v.code, color: colorDim ? v.saleProp[colorDim.lazName] ?? null : null, color_base: v.color_base, color_custom: v.color_custom,
          others: others.map((d) => v.saleProp[d.lazName] ?? ""), price: v.price, price_base: v.price_base, price_custom: v.price_custom,
          price_note: v.special != null ? `ราคาลด ${baht(v.special)}฿ (ราคาขายในระบบ)` : null,
          images: pv.dims[0]?.hasImage || !pv.dims.length ? v.image_refs : v.image_ref ? [v.image_ref] : [], image_custom: v.images_custom,
          images_more: Math.max(0, v.image_pool.length - v.image_refs.length),
        }));
        return (
          <>
            <ListingVariantTable rows={rows} platformName="Lazada" colorLabel={colorDim ? "ชื่อสีบน Lazada" : null} otherLabels={others.map((d) => d.label)} colorChoices={pv.colorChoices}
              stock={0} canEdit={canEdit} saving={saving} edit={vEdit} setEdit={setVEdit} imageMode="all" imageTitle="จัดรูปของตัวเลือกนี้ (เรียง / เอาออก / เพิ่ม)"
              onImageClick={pv.dims[0]?.hasImage ? (row) => setSkuImgFor(row.sku_id) : undefined}
              onSave={(r) => void patchExtra({ lazada_prices: r.prices, lazada_option_names: r.names }, "บันทึกตัวเลือกลงร่าง Lazada แล้ว")}
              onRevertAll={() => void dropExtra(["lazada_prices", "lazada_option_names"], "กลับไปใช้ราคา/ชื่อสีจากระบบแล้ว")}
              header={<>
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
              </>}
              footnote={`ราคาเต็ม = ราคาเต็มในระบบ · ราคาลด = ราคาขาย${pv.dims[0]?.hasImage ? ` · รูปตัวเลือก ≤ ${LAZADA_CREATE_MAX_IMAGES} รูป/ตัว กดที่รูปเพื่อจัด · สีเดียวกันใช้รูปชุดเดียวกัน` : ""}`} />
            <SkuImagesModal pv={pv} skuId={skuImgFor} canEdit={canEdit} saving={saving} onClose={() => setSkuImgFor(null)} onSave={(codes, refs) => void saveSkuImages(codes, refs)} />
          </>
        );
      })()}

      {/* ข้อมูลเฉพาะของหมวด */}
      <div className="rounded-xl border border-slate-200 p-3 text-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-600">ข้อมูลเฉพาะของหมวด {pv.attrs.missingRequired.length ? <span className="text-rose-600">· ช่องบังคับยังว่าง {pv.attrs.missingRequired.length}</span> : null}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {canEdit && attrFields.length > 0 && <AttrSuggestButtons s={sug} disabled={guessing} />}
            <button type="button" onClick={() => setDefaultsOpen(true)} title="ค่าที่ใส่ให้อัตโนมัติทุกสินค้า (เช่น Condition = New · Warranty Type)"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-50"><Icon name="sliders" />ค่าเริ่มต้นของร้าน</button>
          </div>
          {canEdit && attrDirty && (
            <div className="flex gap-1.5">
              <button type="button" disabled={saving} onClick={() => void patchExtra({ lazada_attrs: attrVals }, "บันทึกข้อมูลเฉพาะแล้ว")} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกลงร่าง Lazada</button>
              <button type="button" onClick={() => { setAttrs(null); setAttrSrc({}); }} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
            </div>
          )}
        </div>
        <AttrDefaultsDialog open={defaultsOpen} onClose={() => setDefaultsOpen(false)} platform="lazada" platformName="Lazada" brandId={data.brand_id ?? null}
          rules={pv.attrs.rules} custom={pv.attrs.rulesCustom} fieldNames={editable.map((d) => d.label || d.name)} canEdit={canEdit} onSaved={() => void load()} />
        {guessing && <p className="mb-2 rounded-lg bg-violet-50 px-3 py-1.5 text-xs text-violet-800"><Icon name="ai" /> AI กำลังเดาช่องให้จากชื่อ รายละเอียด และรูป… (ครั้งแรกครั้งเดียว)</p>}
        {!guessing && Object.values(pv.attrs.sources).some((s) => s === "ai" || s === "text") && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-violet-50 px-3 py-1.5 text-xs text-violet-800">
            <span><Icon name="ai" /> มีช่องที่ระบบเดาให้ (ป้าย “AI เดา · ตรวจก่อน”) — ส่งพร้อมตอนลง ตรวจ/แก้ก่อนได้</span>
            {canEdit && <button type="button" disabled={saving} onClick={() => void patchExtra({ lazada_attr_guess: { at: new Date().toISOString(), ai: false, values: {}, cleared: true } }, "เอาค่าที่เดาออกแล้ว")} className="ml-auto text-violet-700 underline disabled:opacity-50">ไม่เอาค่าที่เดา</button>}
          </div>
        )}
        <div className="mb-2"><AttrSuggestPanel s={sug} onApply={(hits, src) => {
          const { next, filledIds } = applyAttrHits(lazAttrStateOf(editable, attrVals), hits);
          setAttrs({ ...attrVals, ...lazAttrValuesOf(editable.filter((d) => filledIds.includes(d.name)), next) });
          setAttrSrc((m) => ({ ...m, ...Object.fromEntries(filledIds.map((id) => [id, src])) }));
          if (filledIds.some((id) => restAttrs.some((d) => d.name === id))) setMoreAttrs(true);
        }} /></div>
        {!pv.category.id ? <p className="text-xs text-slate-500">เลือกหมวด Lazada ก่อน แล้วช่องของหมวดจะขึ้นที่นี่</p>
          : defsState.error ? <ErrorState title={defsState.error} onRetry={defsState.load} className="py-4" />
          : !defsState.defs ? <LoadingState label="กำลังดึงช่องของหมวดจาก Lazada…" className="py-4" />
          : sortedAttrs.length === 0 ? <p className="text-xs text-slate-500">หมวดนี้ไม่มีช่องให้กรอกเพิ่ม</p>
          : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {(moreAttrs ? sortedAttrs : mainAttrs).map((d) => {
                  const has = !!lazNormAttr(d, attrVals[d.name]);
                  const pend = has ? attrSrc[d.name] : undefined;
                  const saved = has && !pend && lazNormAttr(d, attrVals[d.name]) === lazNormAttr(d, pv.attrs.values[d.name]) ? pv.attrs.sources[d.name] : undefined;
                  const label = pend === "ai" ? "AI เดา · ตรวจก่อน (ยังไม่บันทึก)" : pend === "text" ? "แนะนำจากชื่อ/รายละเอียด (ยังไม่บันทึก)"
                    : saved === "ai" ? "AI เดา · ตรวจก่อน" : saved === "text" ? "จับคำจากชื่อ/รายละเอียด · ตรวจก่อน" : saved === "draft" ? "บันทึกไว้ในร่าง"
                    : saved === "default" ? `ค่าเริ่มต้นของร้าน${pv.attrs.rulesCustom ? "" : " (ของระบบ)"}` : saved === "product" ? "ข้อมูลสินค้า (รับประกัน / ขนาด)"
                    : has ? "แก้ตอนนี้ (ยังไม่บันทึก)" : null;
                  return (
                    <div key={d.name}>
                      <LazadaAttrField def={d} value={attrVals[d.name] ?? ""} base={pv.attrs.values[d.name] ?? ""} can={canEdit}
                        suggested={pend ? [lazNormAttr(d, attrVals[d.name])].filter(Boolean) : undefined}
                        onChange={(x) => { setAttrSrc((m) => { const n = { ...m }; delete n[d.name]; return n; }); setAttrs((a) => ({ ...(a ?? pv.attrs.values), [d.name]: x })); }} />
                      {label && <div className={`mt-0.5 text-[10px] ${pend === "ai" || saved === "ai" ? "text-violet-700" : pend === "text" || saved === "text" ? "text-amber-700" : "text-slate-400"}`}>มาจาก: {label}</div>}
                    </div>
                  );
                })}
              </div>
              {restAttrs.length > 0 && <button type="button" onClick={() => setMoreAttrs((x) => !x)} className="mt-2 text-xs text-violet-700 hover:underline">{moreAttrs ? "ซ่อนช่องเพิ่มเติม" : `แสดงเพิ่มเติม (${restAttrs.length} ช่อง)`}</button>}
            </>
          )}
      </div>
    </div>
  );
}

/** ป๊อปรูปของตัวเลือก 1 ตัว — ลากเรียง/ตั้งปก/เอาออก (เหลือ ≥ 1) · เพิ่มคืนจากรูปของ SKU ในระบบ · บันทึกให้ทุก SKU ค่าเดียวกัน */
function SkuImagesModal({ pv, skuId, canEdit, saving, onClose, onSave }: {
  pv: LazCreatePreview; skuId: string | null; canEdit: boolean; saving: boolean;
  onClose: () => void;
  /** refs = null → กลับไปใช้รูปอัตโนมัติ */
  onSave: (codes: string[], refs: string[] | null) => void;
}) {
  const [sel, setSel] = useState<string[] | null>(null);
  useEffect(() => { setSel(null); }, [skuId]);
  const v = pv.variants.find((x) => x.sku_id === skuId) ?? null;
  if (!v) return null;
  const cur = sel ?? v.image_refs;
  const dirty = !!sel && sel.join("|") !== v.image_refs.join("|");
  const members = v.group != null ? pv.variants.filter((x) => x.group === v.group) : [v];
  const rest = v.image_pool.filter((r) => !cur.includes(r));
  const full = cur.length >= LAZADA_CREATE_MAX_IMAGES;
  return (
    <ERPModal open onClose={onClose} size="lg" storageKey="lazada-create-sku-images" hasUnsavedChanges={dirty}
      title={`รูปของตัวเลือก ${Object.values(v.saleProp).join(" · ") || v.code}`}
      description={members.length > 1 ? `ใช้กับ ${members.length} SKU ที่ค่าเดียวกัน (${members.map((m) => m.code).join(", ")}) — Lazada ใช้รูปชุดเดียวกันต่อตัวเลือก` : v.code}
      footer={canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {v.images_custom && !dirty && <button type="button" disabled={saving} onClick={() => onSave(members.map((m) => m.code), null)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50 disabled:opacity-50">กลับไปใช้รูปอัตโนมัติ</button>}
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50">ปิด</button>
          <button type="button" disabled={!dirty || saving || cur.length === 0} onClick={() => onSave(members.map((m) => m.code), cur)} className="h-9 rounded-lg bg-violet-600 px-3 text-sm text-white hover:bg-violet-700 disabled:opacity-50">บันทึกลงร่าง Lazada</button>
        </div>
      ) : undefined}>
      <div className="space-y-3">
        <ListingImageGrid images={cur} onChange={setSel} canEdit={canEdit} max={LAZADA_CREATE_MAX_IMAGES} platformName="Lazada (รูปตัวเลือก)"
          onOpen={() => {}} onAdd={() => {}} canAdd={false} dragGroup="lazada-create-sku-images" note="ระบบฝากรูปเข้า Lazada ให้ตอนลงจริง" />
        {rest.length > 0 && (
          <div>
            <div className="mb-1 text-xs text-slate-600">รูปของตัวเลือกนี้ในระบบที่ยังไม่ได้ส่ง ({rest.length}) — {full ? `ครบ ${LAZADA_CREATE_MAX_IMAGES} รูปแล้ว เอารูปข้างบนออกก่อน` : "กดเพื่อเพิ่ม"}</div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {rest.map((r) => (
                <button key={r} type="button" disabled={!canEdit || full} onClick={() => setSel([...cur, r])} title="เพิ่มรูปนี้"
                  className="relative aspect-square overflow-hidden rounded-lg border border-dashed border-slate-300 enabled:hover:border-violet-400 disabled:opacity-40">
                  <img src={listingImgSrc(r, 200)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  {canEdit && !full && <span className="absolute bottom-1 right-1 rounded-full bg-white/90 px-1 text-[10px] text-violet-700"><Icon name="add" /></span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </ERPModal>
  );
}
