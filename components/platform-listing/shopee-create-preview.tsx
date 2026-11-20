"use client";

/**
 * ดูและแก้ก่อนลงสินค้าใหม่บน Shopee (เฟส 5A · ของกลาง) — แท็บ Shopee ในตัวช่วยลงสินค้า (AddToPlatformWizard ขั้น "ดูและแก้")
 * --------------------------------------------------------------------------
 * ข้อมูล = GET /api/shopee/create-product?parent_sku_id= (ตัวประกอบเดียวกับตอนลงจริง — lib/shopee-create-plan)
 * แก้แล้วเขียนลง "ร่าง Shopee" (PATCH /api/product-platforms) — ไม่แก้ข้อมูลสินค้าในระบบ:
 *   ชื่อ / รายละเอียด / หมวด → ร่าง · รูป → extra.shopee_images · น้ำหนัก (แทนของสินค้า) → extra.shopee_weight · ช่องของหมวด → extra.shopee_attrs
 *   ขนส่ง (ติ๊กเปิด/ปิด · เจ้าของขอ 2026-11-15) → extra.shopee_logistics · ช่องของหมวด: บอกที่มา + แนะนำจากข้อความ (ฟรี) / AI ช่วยเติม (ของกลาง ../platform-catalog/attr-suggest-box)
 * ลงแบบ "ปิดขาย" + สต๊อก 0 เสมอ (BigSeller ยังคุมสต๊อก) · 5B: ลงจริงจากขั้นสุดท้ายของตัวช่วย (POST /api/shopee/create-product)
 * รอบ LY22 (เจ้าของเลือก 2026-11-20): ตารางตัวเลือกแก้ได้ในร่าง — ราคา (extra.shopee_prices) · ชื่อสีจาก Color Platform [TH] (extra.shopee_option_names)
 *   · รูปประจำสี (extra.shopee_option_images) · สต๊อกล็อก 0 · ปุ่มกลับไปใช้ค่าจากระบบ — ไม่เขียนกลับข้อมูลสินค้าในระบบ
 *   ช่องของหมวด: ค่าเริ่มต้นของร้าน (ป๊อป AttrDefaultsDialog · ui_config) + ขนาด/รับประกันจากสินค้า · รายละเอียดเต็ม กดย่อ/ขยาย
 *   บันทึกลงร่างทุกครั้ง กด "ย้อนกลับ" ในแจ้งผลได้ (คืนร่างก่อนหน้า)
 * ของกลางที่ใช้: ListingImageGrid/ListingImagePicker (รูป) · PlatformCategoryPicker (หมวด) · LazadaAttrField + ttsAttrDef (ช่องของหมวด)
 *   · AttrDefaultsDialog (ค่าเริ่มต้นของร้าน) · MoneyInput (ราคา) · SearchableSelect (ชื่อสี) · state-views · Icon
 * ห้ามใช้: แก้สินค้าที่มีบน Shopee แล้ว (ใช้ลิ้นชักสินค้าบนร้าน)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { PlatformCategoryPicker } from "@/components/platform-category-picker";
import { ListingImageGrid, ListingImagePicker, listingImgSrc, useSystemImages } from "@/components/platform-catalog/listing-images";
import { LazadaAttrField } from "@/components/platform-catalog/lazada-listing-panels";
import { useWeightUnit } from "@/components/platform-catalog/weight-unit";
import { kgToUnit, sameAttrState, ttsAttrDef, ttsAttrFromText, ttsAttrToText, unitToKg, type TtsAttrState, type WeightUnit } from "@/lib/tiktok-attrs";
import type { ShopeeCreatePreview, ShopeeCreateVariantRow } from "@/lib/shopee-create-plan";
import { ToggleSwitch } from "@/components/toggle-switch";
import { AttrSuggestButtons, AttrSuggestPanel, applyAttrHits, useAttrSuggest, type AttrSuggestSource } from "@/components/platform-catalog/attr-suggest-box";
import { AttrDefaultsDialog } from "@/components/platform-catalog/attr-defaults-dialog";
import { MoneyInput } from "@/components/money-input";
import { SearchableSelect } from "@/components/searchable-select";

type LastAttempt = { status: string | null; at: string | null; error: string | null; product_id: string | null };
type Resp = { preview: ShopeeCreatePreview | null; blockers?: string[]; live?: boolean; platform_id?: string; brand_id?: string | null; last_attempt?: LastAttempt | null; error: string | null };
type EditKey = "name" | "desc" | "weight" | null;
const baht = (n: number | null) => (n == null ? "—" : n.toLocaleString("th-TH"));
/** แก้ตารางตัวเลือก (ยังไม่บันทึก) ต่อ SKU: ราคา (null = กลับไปราคาจากระบบ) · ชื่อสี ("" = กลับไปชื่อจากระบบ) · รูปสี ("" = กลับไปรูปอัตโนมัติ) */
type VarEdit = { price: Record<string, number | null>; name: Record<string, string>; img: Record<string, string> };
const NO_VAR_EDIT: VarEdit = { price: {}, name: {}, img: {} };
const recOf = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const thDateTime = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };

export function ShopeeCreatePreviewEditor({ parentId, canEdit, onLoaded }: {
  parentId: string;
  canEdit: boolean;
  /** โหลดแล้ว — ให้ตัวช่วยรู้จำนวนข้อที่ขาด */
  onLoaded?: (pv: ShopeeCreatePreview, blockers: string[]) => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<EditKey>(null);
  const [val, setVal] = useState("");
  const [imgs, setImgs] = useState<string[] | null>(null);
  const [picker, setPicker] = useState(false);
  const [attrs, setAttrs] = useState<TtsAttrState | null>(null);
  const [moreAttrs, setMoreAttrs] = useState(false);
  const [attrSrc, setAttrSrc] = useState<Record<string, AttrSuggestSource>>({});   // ช่องที่เพิ่งเติมจากตัวแนะนำ (ยังไม่บันทึก)
  const [logs, setLogs] = useState<number[] | null>(null);                          // ขนส่งที่ติ๊กไว้ (ยังไม่บันทึก)
  const [vEdit, setVEdit] = useState<VarEdit>(NO_VAR_EDIT);                          // ตารางตัวเลือกที่แก้ (ยังไม่บันทึก)
  const [optPick, setOptPick] = useState<string | null>(null);                       // เลือกรูปสีให้แถวนี้ (sku_id)
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [unit, setUnit] = useWeightUnit();
  const sys = useSystemImages(parentId);
  const pvx = data?.preview ?? null;
  const sug = useAttrSuggest({
    fields: pvx?.attrs.fields ?? [], values: attrs ?? pvx?.attrs.values ?? {},
    text: () => `${pvx?.name.value ?? ""}\n${pvx?.description.value ?? ""}`,
    ai: pvx && canEdit ? { platform: "Shopee", name: pvx.name.value, description: pvx.description.value, category: pvx.category.label, imageKeys: pvx.images.refs.filter((r) => r.startsWith("r2:")).map((r) => r.slice(3)) } : null,
  });

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch(`/api/shopee/create-product?parent_sku_id=${encodeURIComponent(parentId)}`).then((r) => r.json()) as Resp;
      if (j.error || !j.preview) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setData(j); setImgs(null); setAttrs(null); setAttrSrc({}); setLogs(null); setVEdit(NO_VAR_EDIT); onLoaded?.(j.preview, j.blockers ?? []);
    } catch (e) { setErr((e as Error).message || "โหลดไม่สำเร็จ"); }
  }, [parentId, onLoaded]);
  useEffect(() => { setData(null); void load(); }, [load]);

  const pv = data?.preview ?? null;
  /** undo = ก้อนที่ส่งซ้ำเพื่อคืนค่าก่อนหน้า (ปุ่ม "ย้อนกลับ" ในแจ้งผล 5 วินาที) */
  const patch = async (body: Record<string, unknown>, okMsg: string, undo?: Record<string, unknown>) => {
    if (!pv || !data?.platform_id) return;
    setSaving(true);
    try {
      const r = await apiFetch("/api/product-platforms", { method: "PATCH", body: JSON.stringify({ parent_sku_id: parentId, platform_id: data.platform_id, ...body }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      if (undo) toast.undo(okMsg, () => void patch(undo, "ย้อนกลับแล้ว")); else toast.success(okMsg);
      setEdit(null); await load();
    } catch (e) { toast.error((e as Error).message || "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  const prevExtra = () => ({ extra: { ...(pv?.draft_extra ?? {}) } });
  const patchExtra = (partial: Record<string, unknown>, okMsg: string) => patch({ extra: { ...(pv?.draft_extra ?? {}), ...partial } }, okMsg, prevExtra());
  const dropExtra = (key: string | string[], okMsg: string) => { const ex = { ...(pv?.draft_extra ?? {}) }; for (const k of [key].flat()) delete ex[k]; return patch({ extra: ex }, okMsg, prevExtra()); };

  if (err) return <ErrorState title="โหลดข้อมูลที่จะส่ง Shopee ไม่สำเร็จ" hint={err} onRetry={() => void load()} className="py-6" />;
  if (!pv || !data) return <LoadingState label="กำลังเตรียมข้อมูลที่จะส่ง Shopee (ดึงหมวด/ช่องบังคับจากร้าน)…" className="py-6" />;

  const blockers = data.blockers ?? [];
  const curImgs = imgs ?? pv.images.refs;
  const imgDirty = !!imgs && imgs.join("|") !== pv.images.refs.join("|");

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
              <button type="button" disabled={saving} onClick={() => opts.save(val)} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกลงร่าง Shopee</button>
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

  // ช่องของหมวด: บังคับก่อน · ที่เหลือซ่อนไว้
  const fields = pv.attrs.fields;
  const vals = attrs ?? pv.attrs.values;
  const attrDirty = !!attrs && !sameAttrState(attrs, pv.attrs.values);
  // โชว์ก่อน: ช่องบังคับ + ช่องที่มีค่าแล้ว (ร่าง/ค่าเริ่มต้นของร้าน/จากสินค้า) · ที่เหลือซ่อนไว้
  const shownFirst = (f: (typeof fields)[number]) => f.required || (pv.attrs.values[f.id] ?? []).length > 0;
  const mainFields = fields.filter(shownFirst);
  const restFields = fields.filter((f) => !shownFirst(f));

  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <Icon name="info" /> ลงแบบ <b>ปิดขาย</b> + <b>สต๊อก 0</b> เสมอ (BigSeller ยังคุมสต๊อก) — หลังลง ตรวจ/แก้ในลิ้นชักสินค้าบนร้าน แล้วค่อยเปิดขายและใส่สต๊อก
        {!data.live && <> · <b>ตอนนี้ยังลงจริงไม่ได้</b> (ดูก่อนส่ง + บันทึกร่างไว้ก่อน)</>}
      </p>
      {data.last_attempt && <LastAttemptBox a={data.last_attempt} />}
      {(pv.missing.length > 0 || blockers.length > 0) && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {pv.missing.length > 0 && <div><Icon name="warning" /> ต้องแก้ก่อนลง: {pv.missing.join(" · ")}</div>}
          {blockers.map((b) => <div key={b}><Icon name="warning" /> {b}</div>)}
        </div>
      )}
      {pv.warnings.length > 0 && <ul className="space-y-0.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{pv.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}

      {/* รูป */}
      <div>
        <ListingImageGrid images={curImgs} onChange={(next) => setImgs(next)} canEdit={canEdit} max={pv.images.max} platformName="Shopee" dragGroup="shopee-create-images"
          onOpen={() => {}} onAdd={() => { setPicker(true); sys.load(); }} canAdd={canEdit}
          note={`รูปแรก = ปก · Shopee ต้องมี ${pv.images.min}–${pv.images.max} รูป · ระบบทำเป็น JPG จัตุรัสพื้นขาวแล้วฝากกับ Shopee ให้ตอนลง`} />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span>มาจาก: {imgDirty ? "ที่เลือกตอนนี้ (ยังไม่บันทึก)" : pv.images.src}</span>
          {canEdit && imgDirty && <button type="button" disabled={saving || curImgs.length === 0} onClick={() => void patchExtra({ shopee_images: curImgs }, "บันทึกรูปแล้ว")} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกรูปที่เลือก</button>}
          {canEdit && imgDirty && <button type="button" onClick={() => setImgs(null)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>}
          {canEdit && !imgDirty && pv.images.custom && <button type="button" disabled={saving} onClick={() => void dropExtra("shopee_images", "กลับไปใช้รูปอัตโนมัติ")} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">กลับไปใช้รูปอัตโนมัติ</button>}
        </div>
        <ListingImagePicker open={picker} onClose={() => setPicker(false)} mode="product" title="เลือกรูปสินค้าสำหรับ Shopee"
          description={`เลือกได้อีก ${Math.max(0, pv.images.max - curImgs.length)} รูป (Shopee รับไม่เกิน ${pv.images.max})`}
          matchedParent={parentId} matchedCode={pv.parent_code} sysImages={sys.images} isUsed={(ref) => curImgs.includes(ref)} full={curImgs.length >= pv.images.max}
          onPick={(ref) => setImgs((xs) => [...(xs ?? pv.images.refs), ref].slice(0, pv.images.max))} storageKey="shopee-create-image-picker" />
      </div>

      {/* ข้อความ + หมวด + แบรนด์ */}
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
        {fieldRow("name", "ชื่อ", pv.name.value || "(ยังไม่มีชื่อ)", pv.name.src, pv.name.value, { bad: !pv.name.value, save: (v) => void patch({ title: v.trim() || null }, "บันทึกชื่อแล้ว") })}
        <div className="grid gap-x-3 gap-y-1 py-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <span className="text-xs text-slate-500">หมวด Shopee</span>
          <div className="min-w-0">
            <div className={`text-sm ${pv.category.id ? "text-slate-800" : "text-rose-600"}`}>{pv.category.label || "ยังไม่ได้เลือก — ต้องเลือกก่อนลง"}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">มาจาก: {pv.category.src}</div>
            {canEdit && pv.category.id && pv.category.label && (pv.category.kind === "recommend" || pv.category.kind === "same_type") && (
              <button type="button" disabled={saving} onClick={() => void patch({ category_path: pv.category.label }, "ยืนยันหมวดแล้ว")}
                className="mt-1.5 inline-flex h-7 items-center gap-1 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50"><Icon name="done" />ใช้หมวดนี้</button>
            )}
            {canEdit && pv.category.candidates.filter((c) => c.id !== pv.category.id).length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                <span className="text-[11px] text-slate-500">หมวดอื่นที่น่าจะใช่:</span>
                {pv.category.candidates.filter((c) => c.id !== pv.category.id).map((c) => (
                  <button key={c.id} type="button" disabled={saving} title={c.src} onClick={() => void patch({ category_path: c.label }, "บันทึกหมวดแล้ว")}
                    className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50">{c.label}</button>
                ))}
              </div>
            )}
            {canEdit && data.platform_id && <div className="mt-1.5 max-w-md"><PlatformCategoryPicker platformId={data.platform_id} placeholder="เลือกหมวด Shopee เอง (พิมพ์ค้น เช่น กระเป๋า / wallet)" onPick={(label) => void patch({ category_path: label }, "บันทึกหมวดแล้ว")} /></div>}
          </div>
        </div>
        <div className="grid gap-x-3 gap-y-1 py-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <span className="text-xs text-slate-500">แบรนด์</span>
          <div><div className={`text-sm ${pv.brand.id ? "text-slate-800" : "text-amber-700"}`}>{pv.brand.id ? pv.brand.name : "ไม่มีแบรนด์"}</div><div className="mt-0.5 text-[11px] text-slate-400">มาจาก: {pv.brand.src}</div></div>
        </div>
        {fieldRow("desc", "รายละเอียด", pv.description.value ? (
          <div>
            <div className={`whitespace-pre-line text-slate-700 ${descOpen ? "" : "line-clamp-6"}`}>{pv.description.value}</div>
            {(pv.description.value.length > 300 || pv.description.value.split("\n").length > 6) && (
              <button type="button" onClick={() => setDescOpen((x) => !x)} className="mt-1 inline-flex items-center gap-0.5 text-xs text-violet-700 hover:underline">
                <Icon name={descOpen ? "chevron-up" : "chevron-down"} />{descOpen ? "ย่อ" : `ดูทั้งหมด (${pv.description.value.length.toLocaleString()} ตัวอักษร)`}
              </button>
            )}
            <div className="mt-1 text-[11px] text-slate-500">
              <Icon name="image" /> รูปในรายละเอียด: {pv.description.imagesAllowed === true ? "ร้านนี้ได้สิทธิ์ใส่รูปจาก Shopee แล้ว — ตอนนี้ยังส่งเป็นข้อความอย่างเดียว"
                : pv.description.imagesAllowed === false ? "สินค้าบนร้านเป็นรายละเอียดแบบข้อความ — ยังไม่พบว่าร้านได้สิทธิ์ใส่รูปในรายละเอียด (Shopee เปิดให้บางร้าน) · ส่งเป็นข้อความ"
                : "ส่งเป็นข้อความอย่างเดียว"}
            </div>
          </div>
        ) : <span className="text-rose-600">ยังไม่มี (Shopee ต้องมี)</span>, pv.description.src, pv.description.value,
          { multiline: true, bad: !pv.description.value, save: (v) => void patch({ description: v.trim() || null }, "บันทึกรายละเอียดแล้ว", { description: pv.description.value || null }) })}
      </div>

      {/* พัสดุ + ขนส่ง */}
      <div className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
        <div className="mb-1 text-xs font-medium text-slate-600">พัสดุ & ขนส่ง</div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span className={pv.weight.kg ? "" : "text-rose-600"}>น้ำหนัก {pv.weight.kg ? `${pv.weight.kg} กก.` : "— ยังไม่มี (Shopee บังคับ)"}</span>
          <span className={pv.box.l && pv.box.w && pv.box.h ? "" : pv.box.mandatory ? "text-rose-600" : "text-slate-400"}>กล่อง {pv.box.l && pv.box.w && pv.box.h ? `${pv.box.l}×${pv.box.w}×${pv.box.h} ซม.` : pv.box.mandatory ? "— หมวดนี้บังคับ" : "— ไม่มี (ไม่บังคับ)"}</span>
          {canEdit && edit !== "weight" && <button type="button" onClick={() => { setEdit("weight"); setVal(pv.weight.kg ? String(kgToUnit(pv.weight.kg, unit)) : ""); }} className="text-xs text-violet-700 hover:underline">ใส่น้ำหนักสำหรับ Shopee</button>}
        </div>
        {edit === "weight" && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <input value={val} onChange={(e) => setVal(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="h-8 w-24 rounded-md border border-slate-200 px-2 text-sm" aria-label="น้ำหนัก" />
            <select value={unit} onChange={(e) => { const u = e.target.value as WeightUnit; const kg = unitToKg(Number(val) > 0 ? Number(val) : null, unit); setUnit(u); setVal(kg != null ? String(kgToUnit(kg, u)) : ""); }} className="h-8 rounded-md border border-slate-200 bg-white px-1 text-xs" aria-label="หน่วยน้ำหนัก">
              <option value="kg">กิโลกรัม</option><option value="g">กรัม</option>
            </select>
            <button type="button" disabled={saving} onClick={() => void patchExtra({ shopee_weight: unitToKg(Number(val) > 0 ? Number(val) : null, unit) }, "บันทึกน้ำหนักแล้ว")} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึก</button>
            <button type="button" onClick={() => setEdit(null)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
          </div>
        )}
        <div className="mt-0.5 text-[11px] text-slate-400">น้ำหนักมาจาก: {pv.weight.src} · ขนาดกล่องแก้ที่หน้าสินค้า (Parent SKU)</div>
        {(() => {
          const baseOn = pv.logistics.options.filter((o) => o.on).map((o) => o.id);
          const cur = logs ?? baseOn;
          const logDirty = !!logs && [...logs].sort().join(",") !== [...baseOn].sort().join(",");
          return (
            <div className="mt-2">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span>ขนส่ง (ติ๊กเปิด/ปิดได้){pv.daysToShip ? <span className="text-slate-500"> · ส่งภายใน {pv.daysToShip} วัน (ไม่ใช่พรีออเดอร์)</span> : null}</span>
                {canEdit && logDirty && (
                  <div className="flex gap-1.5">
                    <button type="button" disabled={saving || cur.length === 0} onClick={() => void patchExtra({ shopee_logistics: cur }, "บันทึกขนส่งแล้ว")} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกลงร่าง Shopee</button>
                    <button type="button" onClick={() => setLogs(null)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
                  </div>
                )}
                {canEdit && !logDirty && pv.logistics.custom && <button type="button" disabled={saving} onClick={() => void dropExtra("shopee_logistics", "กลับไปใช้ขนส่งค่าเริ่ม")} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">กลับไปใช้ค่าเริ่ม</button>}
              </div>
              {pv.logistics.options.length === 0 ? <p className="text-xs text-rose-600">ไม่พบขนส่ง — ต้องมีสินค้าแบรนด์เดียวกันขายอยู่บนร้านอย่างน้อย 1 ตัว</p> : (
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {pv.logistics.options.map((o) => {
                    const on = cur.includes(o.id);
                    return (
                      <div key={o.id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                        <ToggleSwitch on={on} size="sm" disabled={!canEdit || o.forced || (!!o.blocked && !on)} title={o.forced ? "ร้านบังคับเปิดขนส่งนี้" : o.blocked ?? (on ? "ปิดขนส่งนี้" : "เปิดขนส่งนี้")}
                          onChange={(v) => setLogs(() => { const s = new Set(cur); if (v) s.add(o.id); else s.delete(o.id); return [...s]; })} />
                        <span className={`min-w-0 flex-1 ${on ? "text-slate-800" : "text-slate-400"}`}>
                          {o.name}{o.forced ? <span className="text-[11px] text-slate-400"> · ร้านบังคับเปิด</span> : null}
                          {o.blocked && <span className="block text-[11px] text-amber-700">{o.blocked}</span>}
                        </span>
                        <span className={on ? "text-slate-600" : "text-slate-300"}>{o.fee == null ? "ตามน้ำหนัก" : o.fee === 0 ? "฿0" : `฿${o.fee.toLocaleString("th-TH")}`}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-0.5 text-[11px] text-slate-400">มาจาก: {pv.logistics.src} · ค่าส่งเป็นค่าประมาณตามน้ำหนัก (Shopee คิดจริงตอนสั่งซื้อ)</div>
            </div>
          );
        })()}
      </div>

      {/* ตัวเลือก + ราคา (แก้ในร่าง Shopee ได้ · ไม่แก้ระบบ) */}
      <VariantTable pv={pv} canEdit={canEdit} saving={saving} edit={vEdit} setEdit={setVEdit} onPickImage={(skuId) => { setOptPick(skuId); sys.load(); }}
        onSave={(extra) => void patchExtra(extra, "บันทึกตัวเลือกลงร่าง Shopee แล้ว")}
        onRevertAll={() => void dropExtra(["shopee_prices", "shopee_option_names", "shopee_option_images"], "กลับไปใช้ราคา/ชื่อสี/รูปจากระบบแล้ว")} />
      <ListingImagePicker open={!!optPick} onClose={() => setOptPick(null)} mode="variant" title="เลือกรูปประจำสี"
        description="รูปนี้จะขึ้นตอนลูกค้ากดเลือกสีบน Shopee (ใช้กับทุกแถวที่เป็นสีเดียวกัน)" shopImages={curImgs} shopLabel="รูปที่จะส่ง (รูปสินค้า)"
        matchedParent={parentId} matchedCode={pv.parent_code} sysImages={sys.images} storageKey="shopee-create-option-image-picker"
        onPick={(ref) => {
          const row = pv.variants.find((v) => v.sku_id === optPick); setOptPick(null); if (!row) return;
          const nameOf = (v: ShopeeCreateVariantRow) => varName(pv, vEdit, v);
          const same = pv.variants.filter((v) => nameOf(v) === nameOf(row));
          setVEdit((e) => ({ ...e, img: { ...e.img, ...Object.fromEntries(same.map((v) => [v.sku_id, ref])) } }));
        }} />

      {/* ช่องของหมวด (กรอกในร่าง → ส่งพร้อมตอนลง) — ช่องกรอกกลาง LazadaAttrField */}
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-600">ช่องของหมวด {pv.attrs.required.length ? <span className="text-rose-600">· ช่องบังคับยังว่าง {pv.attrs.required.length}</span> : null}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {canEdit && fields.length > 0 && <AttrSuggestButtons s={sug} />}
            <button type="button" onClick={() => setDefaultsOpen(true)} title="ค่าที่ใส่ให้อัตโนมัติทุกสินค้า (เช่น ประเทศ = ไทย · สภาพ = ใหม่)"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-50"><Icon name="sliders" />ค่าเริ่มต้นของร้าน</button>
          </div>
          {canEdit && attrDirty && (
            <div className="flex gap-1.5">
              <button type="button" disabled={saving} onClick={() => void patchExtra({ shopee_attrs: attrs }, "บันทึกช่องของหมวดแล้ว")} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกลงร่าง Shopee</button>
              <button type="button" onClick={() => { setAttrs(null); setAttrSrc({}); }} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
            </div>
          )}
        </div>
        <AttrDefaultsDialog open={defaultsOpen} onClose={() => setDefaultsOpen(false)} platform="shopee" platformName="Shopee" brandId={data.brand_id ?? null}
          rules={pv.attrs.rules} custom={pv.attrs.rulesCustom} fieldNames={fields.map((f) => f.name)} canEdit={canEdit} onSaved={() => void load()} />
        <div className="mb-2"><AttrSuggestPanel s={sug} onApply={(hits, src) => {
          const { next, filledIds } = applyAttrHits(attrs ?? pv.attrs.values, hits);
          setAttrs(next); setAttrSrc((m) => ({ ...m, ...Object.fromEntries(filledIds.map((id) => [id, src])) }));
          if (filledIds.some((id) => restFields.some((f) => f.id === id))) setMoreAttrs(true);
        }} /></div>
        {!pv.category.id ? <p className="text-xs text-slate-500">เลือกหมวดก่อน แล้วช่องของหมวดจะขึ้นที่นี่</p>
          : !pv.attrs.loaded ? <p className="text-xs text-slate-500">ดึงช่องของหมวดจาก Shopee ไม่ได้</p>
          : fields.length === 0 ? <p className="text-xs text-slate-500">หมวดนี้ไม่มีช่องให้กรอก</p>
          : (
            <>
              {pv.attrs.fromTemplate && <p className="mb-2 text-[11px] text-amber-700">ช่องบังคับเติมจากสินค้าบนร้านหมวดเดียวกัน (#{pv.attrs.fromTemplate}) — ตรวจว่าตรงกับสินค้านี้ แล้วกดบันทึก</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                {(moreAttrs ? [...mainFields, ...restFields] : mainFields).map((f) => {
                  const has = (vals[f.id] ?? []).length > 0;
                  const pend = has ? attrSrc[f.id] : undefined;
                  const saved = has && !pend && sameAttrState({ x: vals[f.id] ?? [] }, { x: pv.attrs.values[f.id] ?? [] }) ? pv.attrs.sources[f.id] : undefined;
                  const label = pend === "ai" ? "AI เดา · ตรวจก่อน (ยังไม่บันทึก)" : pend === "text" ? "แนะนำจากชื่อ/รายละเอียด (ยังไม่บันทึก)"
                    : saved === "template" ? `จากสินค้าบนร้านหมวดเดียวกัน #${pv.attrs.fromTemplate ?? ""} — ตรวจก่อน` : saved === "draft" ? "บันทึกไว้ในร่าง"
                    : saved === "default" ? `ค่าเริ่มต้นของร้าน${pv.attrs.rulesCustom ? "" : " (ของระบบ)"}` : saved === "product" ? "ข้อมูลสินค้า (ขนาด / รับประกัน / น้ำหนัก)"
                    : has ? "แก้ตอนนี้ (ยังไม่บันทึก)" : null;
                  return (
                    <div key={f.id}>
                      <LazadaAttrField def={ttsAttrDef(f)} value={ttsAttrToText(vals[f.id])} base={ttsAttrToText(pv.attrs.values[f.id])} can={canEdit}
                        suggested={pend ? (vals[f.id] ?? []).map((x) => x.id).filter((x): x is string => !!x) : undefined}
                        onChange={(text) => { setAttrSrc((m) => { const n = { ...m }; delete n[f.id]; return n; }); setAttrs((a) => { const n = { ...(a ?? pv.attrs.values) }; const v = ttsAttrFromText(f, text); if (v.length) n[f.id] = v; else delete n[f.id]; return n; }); }} />
                      {label && <div className={`mt-0.5 text-[10px] ${pend === "ai" ? "text-violet-700" : pend === "text" || saved === "template" ? "text-amber-700" : "text-slate-400"}`}>มาจาก: {label}</div>}
                    </div>
                  );
                })}
              </div>
              {mainFields.length === 0 && !moreAttrs && <p className="text-xs text-slate-500">หมวดนี้ไม่มีช่องบังคับ</p>}
              {Object.values(pv.attrs.sources).some((s) => s === "default" || s === "product") && <p className="mt-2 text-[11px] text-slate-400">ช่องที่ขึ้น “ค่าเริ่มต้นของร้าน / ข้อมูลสินค้า” ส่งพร้อมตอนลงเลย (แก้ทับได้ · แก้ค่าเริ่มต้นที่ปุ่มด้านบน)</p>}
              {restFields.length > 0 && <button type="button" onClick={() => setMoreAttrs((x) => !x)} className="mt-2 text-xs text-violet-700 hover:underline">{moreAttrs ? "ซ่อนช่องไม่บังคับ" : `แสดงช่องไม่บังคับ (${restFields.length} ช่อง)`}</button>}
            </>
          )}
      </div>
    </div>
  );
}

/** ชื่อสีของแถว (ที่แก้ค้างอยู่ → ที่บันทึก/จากระบบ) */
function varName(pv: ShopeeCreatePreview, e: VarEdit, v: ShopeeCreateVariantRow): string {
  const colorDim = pv.dims[0]?.key === "color" ? pv.dims[0] : null;
  if (!colorDim) return "";
  return v.sku_id in e.name ? (e.name[v.sku_id] || v.color_base || "") : (v.attrs[colorDim.name] ?? "");
}

/**
 * ตารางตัวเลือก & ราคา (หน้าลง Shopee) — PC = ตาราง · มือถือ = การ์ดซ้อน
 * แก้ราคา/ชื่อสี/รูปสี ค้างไว้ในเครื่อง → กด "บันทึกลงร่าง Shopee" ครั้งเดียว · สต๊อกล็อก 0 (BigSeller ยังคุม)
 */
function VariantTable({ pv, canEdit, saving, edit, setEdit, onPickImage, onSave, onRevertAll }: {
  pv: ShopeeCreatePreview; canEdit: boolean; saving: boolean; edit: VarEdit; setEdit: (f: (e: VarEdit) => VarEdit) => void;
  onPickImage: (skuId: string) => void; onSave: (extra: Record<string, unknown>) => void; onRevertAll: () => void;
}) {
  const colorDim = pv.dims[0]?.key === "color" ? pv.dims[0] : null;
  const otherDims = pv.dims.filter((d) => d !== colorDim);
  const dirty = Object.keys(edit.price).length + Object.keys(edit.name).length + Object.keys(edit.img).length > 0;
  const anyCustom = pv.variants.some((v) => v.price_custom || v.color_custom || v.image_custom);
  const priceOf = (v: ShopeeCreateVariantRow) => (v.sku_id in edit.price ? (edit.price[v.sku_id] ?? v.price_base) : v.price);
  const imgOf = (v: ShopeeCreateVariantRow) => (v.sku_id in edit.img ? (edit.img[v.sku_id] || v.image_base) : v.image_ref);
  const nameOf = (v: ShopeeCreateVariantRow) => varName(pv, edit, v);
  const priceCustom = (v: ShopeeCreateVariantRow) => (v.sku_id in edit.price ? edit.price[v.sku_id] != null : v.price_custom);
  const nameCustom = (v: ShopeeCreateVariantRow) => (v.sku_id in edit.name ? !!edit.name[v.sku_id] && edit.name[v.sku_id] !== v.color_base : v.color_custom);
  const imgCustom = (v: ShopeeCreateVariantRow) => (v.sku_id in edit.img ? !!edit.img[v.sku_id] : v.image_custom);
  const colorOpts = [...new Set([...pv.colorChoices, ...pv.variants.map(nameOf)].filter(Boolean))].map((c) => ({ value: c, label: c }));
  const setPrice = (v: ShopeeCreateVariantRow, raw: string) => { const n = Number(raw); setEdit((e) => ({ ...e, price: { ...e.price, [v.sku_id]: raw.trim() && n > 0 ? n : null } })); };
  const setName = (v: ShopeeCreateVariantRow, name: string) => setEdit((e) => ({ ...e, name: { ...e.name, [v.sku_id]: name === v.color_base ? "" : name } }));
  const resetImg = (v: ShopeeCreateVariantRow) => { const nm = nameOf(v); const same = pv.variants.filter((x) => nameOf(x) === nm); setEdit((e) => ({ ...e, img: { ...e.img, ...Object.fromEntries(same.map((x) => [x.sku_id, ""])) } })); };

  const save = () => {
    const prices = recOf(pv.draft_extra.shopee_prices) as Record<string, unknown>;
    const names = recOf(pv.draft_extra.shopee_option_names) as Record<string, unknown>;
    const nextPrices: Record<string, number> = {}; const nextNames: Record<string, string> = {}; const nextImgs: Record<string, string> = {};
    for (const v of pv.variants) {
      const p = v.sku_id in edit.price ? edit.price[v.sku_id] : (v.price_custom ? Number(prices[v.sku_id]) : null);
      if (p != null && p > 0) nextPrices[v.sku_id] = p;
      const n = v.sku_id in edit.name ? edit.name[v.sku_id] : (v.color_custom ? String(names[v.sku_id] ?? "") : "");
      if (n && n !== v.color_base) nextNames[v.sku_id] = n;
      const im = v.sku_id in edit.img ? edit.img[v.sku_id] : (v.image_custom ? v.image_ref ?? "" : "");
      const nm = nameOf(v);
      if (im && nm) nextImgs[nm] = im;
    }
    onSave({ shopee_prices: nextPrices, shopee_option_names: nextNames, shopee_option_images: nextImgs });
  };
  const badPrice = pv.variants.some((v) => { const p = priceOf(v); return p != null && !Number.isInteger(p); });

  const priceCell = (v: ShopeeCreateVariantRow) => (
    <div className="leading-tight">
      {canEdit ? (
        <div className="flex items-center gap-1">
          <MoneyInput value={priceOf(v) == null ? "" : String(priceOf(v))} onChange={(raw) => setPrice(v, raw)} placeholder="ราคา" formula={false}
            className={`h-8 w-24 rounded-md border px-2 text-right text-sm ${priceCustom(v) ? "border-violet-400 bg-violet-50" : !priceOf(v) ? "border-rose-300" : "border-slate-200"}`} />
          <span className="text-xs text-slate-500">฿</span>
          {priceCustom(v) && <button type="button" onClick={() => setEdit((e) => ({ ...e, price: { ...e.price, [v.sku_id]: null } }))} title={`กลับไปใช้ราคาจากระบบ (${baht(v.price_base)}฿)`} aria-label="กลับไปใช้ราคาจากระบบ" className="rounded p-0.5 text-slate-500 hover:bg-slate-100"><Icon name="back" /></button>}
        </div>
      ) : <span className={v.price ? "font-medium" : "text-rose-600"}>{v.price ? `${baht(v.price)}฿` : "ไม่มีราคา"}</span>}
      {priceCustom(v) ? <span className="block text-[11px] text-violet-700">ระบบ {baht(v.price_base)}฿</span>
        : v.fake && v.sale && v.sale < v.fake ? <span className="block text-[11px] text-slate-400">ขายในระบบ {baht(v.sale)}฿</span> : null}
    </div>
  );
  const colorCell = (v: ShopeeCreateVariantRow) => !colorDim ? null : canEdit ? (
    <div className="flex min-w-0 items-center gap-1">
      <div className={`min-w-0 flex-1 rounded-md ${nameCustom(v) ? "ring-2 ring-violet-300" : ""}`}>
        <SearchableSelect value={nameOf(v)} options={colorOpts} onChange={(c) => setName(v, c)} onCreate={(q) => setName(v, q)} createLabel="ใช้ชื่อนี้" placeholder="ชื่อสี" />
      </div>
      {nameCustom(v) && <button type="button" onClick={() => setName(v, v.color_base ?? "")} title={`กลับไปใช้ชื่อจากระบบ (${v.color_base ?? "-"})`} aria-label="กลับไปใช้ชื่อสีจากระบบ" className="rounded p-0.5 text-slate-500 hover:bg-slate-100"><Icon name="back" /></button>}
    </div>
  ) : <span className="truncate">{nameOf(v)}</span>;
  const imgCell = (v: ShopeeCreateVariantRow) => {
    const ref = imgOf(v);
    const pic = ref ? <img src={listingImgSrc(ref, 120)} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-rose-300 text-[10px] text-rose-500">ไม่มีรูป</span>;
    return (
      <div className="relative shrink-0">
        {canEdit && colorDim ? (
          <button type="button" onClick={() => onPickImage(v.sku_id)} title="เลือกรูปประจำสี" className={`block rounded ${imgCustom(v) ? "ring-2 ring-violet-400" : "hover:ring-2 hover:ring-violet-200"}`}>{pic}</button>
        ) : pic}
        {canEdit && imgCustom(v) && <button type="button" onClick={() => resetImg(v)} title="กลับไปใช้รูปอัตโนมัติ (ปก SKU)" aria-label="กลับไปใช้รูปอัตโนมัติ" className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-[10px] text-slate-500 shadow hover:text-slate-800"><Icon name="cancel" /></button>}
      </div>
    );
  };
  const stockCell = <span className="inline-flex items-center gap-1 text-slate-400" title="ล็อกไว้ที่ 0 — BigSeller ยังคุมสต๊อกอยู่ · ใส่สต๊อกหลังเลิกใช้ BigSeller"><Icon name="lock" />{pv.stock}</span>;

  return (
    <div className="rounded-xl border border-slate-200 p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">
          ตัวเลือก & ราคาตั้ง ({pv.variants.length.toLocaleString()} SKU{pv.dims.length ? ` · ชั้น: ${pv.dims.map((d) => `${d.name} (${d.values.length})`).join(" · ")}` : " · ตัวเลือกเดียว"})
        </span>
        {canEdit && (dirty ? (
          <div className="flex gap-1.5">
            <button type="button" disabled={saving || badPrice} onClick={save} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกลงร่าง Shopee</button>
            <button type="button" onClick={() => setEdit(() => NO_VAR_EDIT)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
          </div>
        ) : anyCustom ? <button type="button" disabled={saving} onClick={onRevertAll} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">กลับไปใช้ค่าจากระบบทั้งหมด</button> : null)}
      </div>
      {/* PC: ตาราง */}
      <div className="hidden max-h-80 overflow-auto rounded-lg border border-slate-100 sm:block">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th className="px-2 py-1.5 text-left font-normal">รูปสี</th>
              <th className="px-2 py-1.5 text-left font-normal">SKU</th>
              {colorDim && <th className="px-2 py-1.5 text-left font-normal">ชื่อสีบน Shopee</th>}
              {otherDims.map((d) => <th key={d.name} className="px-2 py-1.5 text-left font-normal">{d.name}</th>)}
              <th className="px-2 py-1.5 text-left font-normal">ราคาตั้ง</th>
              <th className="px-2 py-1.5 text-right font-normal">สต๊อก</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pv.variants.map((v) => (
              <tr key={v.sku_id} className="align-middle">
                <td className="px-2 py-1.5">{imgCell(v)}</td>
                <td className="px-2 py-1.5 font-mono">{v.code}</td>
                {colorDim && <td className="w-48 px-2 py-1.5">{colorCell(v)}</td>}
                {otherDims.map((d) => <td key={d.name} className="px-2 py-1.5 text-slate-600">{v.attrs[d.name] || "—"}</td>)}
                <td className="px-2 py-1.5">{priceCell(v)}</td>
                <td className="px-2 py-1.5 text-right">{stockCell}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* มือถือ: การ์ดซ้อน */}
      <div className="max-h-[28rem] space-y-1.5 overflow-auto sm:hidden">
        {pv.variants.map((v) => (
          <div key={v.sku_id} className="rounded-lg border border-slate-100 p-2 text-xs">
            <div className="flex items-start gap-2">
              {imgCell(v)}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2"><span className="truncate font-mono">{v.code}</span>{stockCell}</div>
                {colorCell(v)}
                {otherDims.length > 0 && <div className="truncate text-slate-500">{otherDims.map((d) => v.attrs[d.name]).filter(Boolean).join(" · ")}</div>}
              </div>
            </div>
            <div className="mt-1.5 flex justify-end">{priceCell(v)}</div>
          </div>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-slate-400">
        ราคาตั้ง = ราคาเต็มในระบบ (ไม่มี = ราคาขาย) · แก้ที่นี่ = ใช้กับ Shopee เท่านั้น (ไม่แก้ระบบ) · ชื่อสีเริ่มจาก Color Platform [TH] · ส่วนลดทำด้วยโปรโมชันของร้าน · สต๊อกล็อก 0 จนกว่าจะเลิกใช้ BigSeller
        {badPrice && <span className="text-rose-600"> · Shopee ไทยรับเฉพาะราคาเต็มบาท</span>}
      </div>
    </div>
  );
}

function LastAttemptBox({ a }: { a: LastAttempt }) {
  const when = thDateTime(a.at);
  if (a.status === "tier_failed") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <div className="font-medium"><Icon name="warning" /> สร้างสินค้าบน Shopee แล้ว #{a.product_id}{when ? ` (${when})` : ""} แต่ยังไม่มีตัวเลือก (ปิดขายอยู่ · ลูกค้ายังไม่เห็น)</div>
        {a.error && <div className="mt-0.5">{a.error}</div>}
        <div className="mt-0.5">เพิ่มตัวเลือกใน Seller Centre หรือลบสินค้านี้แล้วลงใหม่ — ระบบไม่สร้างซ้ำให้อัตโนมัติ</div>
      </div>
    );
  }
  if (a.status === "creating") {
    return <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><Icon name="refresh" /> กำลังสร้างบน Shopee{when ? ` (เริ่ม ${when})` : ""}{a.product_id ? ` · สร้างสินค้าแล้ว #${a.product_id}` : ""} — ถ้าค้างเกิน 3 นาที ให้ดูใน Seller Centre ก่อนกดใหม่</p>;
  }
  if (a.product_id) {
    return <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><Icon name="done" /> ลงบน Shopee แล้ว #{a.product_id}{when ? ` (${when})` : ""} — ตรวจ/แก้ในลิ้นชักสินค้าบนร้าน แล้วค่อยเปิดขาย</p>;
  }
  if (a.status === "failed") {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
        <div className="font-medium"><Icon name="warning" /> ครั้งล่าสุดที่กดลง{when ? ` (${when})` : ""}: ไม่สำเร็จ</div>
        {a.error && <div className="mt-0.5">{a.error}</div>}
      </div>
    );
  }
  return null;
}
