"use client";
/**
 * ชื่อตัวเลือก + เพิ่มสีจากระบบ ของสินค้าบน Lazada (แท็บตัวเลือก & ราคา โหมดราคา ในลิ้นชักสินค้าบนร้าน)
 *   เจ้าของเลือก 2026-11-24 แบบ A + ข้อเสนอ 1 (ชื่อตามระบบ) / 3 (สีที่ยังไม่อยู่บนร้าน + ปุ่มเพิ่ม) / 5 (สี×ไซซ์) / 6 (ย้อน)
 *   <LazadaOptionEditor v={view} edit={edit} listingId matchedParent matchedCode />
 *   ปิดขายทีละสี = คอลัมน์ "ขาย" ในตาราง (มีอยู่แล้ว) · รูปตัวเลือกเดิม = โหมด "รูป · น้ำหนัก · กล่อง"
 *   สีใหม่: ขึ้นด้วยสต๊อก 0 (BigSeller เติมให้ถ้าผูกรหัส) · น้ำหนัก/กล่องใช้ค่าเดียวกับตัวเลือกเดิม · มีรูปตัวเลือก = ต้องมีรูป
 *   แก้แล้ว = ฟอร์มเปลี่ยนเฉย ๆ → ส่งตอนกด "บันทึกขึ้น Lazada" (ถามยืนยันก่อน · มีประวัติ)
 * กฎ: lib/lazada-option-edit · ของกลาง: useSysVariants · lib/listing-option-sync · ListingImagePicker · MoneyInput · Icon
 */
import { useState } from "react";
import { Icon } from "@/components/icon";
import { MoneyInput } from "@/components/money-input";
import { lazColorGroup, lazModelsLite, lazOptNameKey, LAZ_OPT_NAME_MAX, type LazOptAdd, type LazOptAddSize } from "@/lib/lazada-option-edit";
import type { LazadaListingView } from "@/lib/lazada-listing-edit";
import { sizePricesForNewColor, sizeSkusForNewColor, sysOptionName, sysVariantOfOption, sysVariantsNotOnShop, type SysVariantView } from "@/lib/listing-option-sync";
import { ListingImagePicker, listingImgSrc, useSystemImages } from "./listing-images";
import { useSysVariants } from "./use-sys-variants";
import type { LazadaEditApi } from "./lazada-listing-panels";

const numOrNull = (raw: string | number | null | undefined): number | null => { if (raw == null || raw === "") return null; const n = Number(raw); return Number.isFinite(n) ? n : null; };
const baht = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("th-TH", { maximumFractionDigits: 2 })}฿`);
const modeOf = (xs: (number | null)[]): number | null => {
  const count = new Map<number, number>();
  for (const x of xs) if (x != null) count.set(x, (count.get(x) ?? 0) + 1);
  let best: number | null = null; let n = 0;
  for (const [p, c] of count) if (c > n) { best = p; n = c; }
  return best;
};

export function LazadaOptionEditor({ v, edit, listingId, matchedParent, matchedCode }: { v: LazadaListingView; edit: LazadaEditApi; listingId: string | null; matchedParent: string | null; matchedCode: string | null }) {
  const groups = edit.optGroups;
  const sysV = useSysVariants(listingId, !!matchedParent && groups.length > 0);
  const sys = useSystemImages(matchedParent, { withSkuImages: true });
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [openState, setOpen] = useState<boolean | null>(null);
  const form = edit.optForm;
  if (!groups.length || !form) return null;
  const can = edit.canEdit;
  const plan = edit.optPlan;
  const sysList = sysV.variants ?? [];
  const colorName = form.colorGroup ?? lazColorGroup(groups, v.skus, sysList.map((x) => x.code));
  const color = groups.find((g) => g.name === colorName) ?? groups[0];
  const other = groups.find((g) => g !== color) ?? null;
  const canAdd = can && groups.length <= 2;
  const models = lazModelsLite(groups, color.name, v.skus);
  const nameOf = (g: string, value: string) => form.names[lazOptNameKey(g, value)] ?? value;
  const sysNameOf = (i: number) => sysOptionName(sysVariantOfOption(models, i, sysList));
  const sysNameDiff = color.values.map((x, i) => ({ x, n: sysNameOf(i) })).filter((r) => r.n && r.n !== nameOf(color.name, r.x.value).trim());
  const useSysNames = () => sysNameDiff.forEach((r) => edit.setOptName(color.name, r.x.value, r.n!));

  // สีใหม่จากระบบ
  const missing = matchedParent ? sysVariantsNotOnShop(v.skus.map((x) => x.sellerSku), sysList) : [];
  const adds = form.adds;
  const addOf = (code: string) => adds.find((a) => a.code === code) ?? null;
  const needImage = v.skus.some((x) => x.images.length > 0) || color.hasImage;
  const shopPrice = modeOf(v.skus.map((x) => x.price));
  const shopSpecial = modeOf(v.skus.map((x) => x.specialPrice));
  const sizeRow = (sv: SysVariantView, k: number): LazOptAddSize => {
    const n = other?.values.length ?? 0;
    const skus = sizeSkusForNewColor(models, sysList, sv.code, n);
    const prices = sizePricesForNewColor(models, n, shopPrice ?? (sv.price != null ? Math.round(sv.price) : null));
    return { value: other!.values[k].value, sku: skus[k] ?? "", price: prices[k] };
  };
  const defaultAdd = (sv: SysVariantView): LazOptAdd => {
    const base: LazOptAdd = { code: sv.code, name: sysOptionName(sv) ?? sv.code, image: sv.image, price: shopPrice ?? (sv.price != null ? Math.round(sv.price) : null), special: null };
    return other ? { ...base, sizes: other.values.map((_, k) => sizeRow(sv, k)) } : base;
  };
  const setAdds = (next: LazOptAdd[]) => edit.setOptAdds(next, color.name);
  const toggleAdd = (sv: SysVariantView) => setAdds(addOf(sv.code) ? adds.filter((a) => a.code !== sv.code) : [...adds, defaultAdd(sv)]);
  const patchAdd = (code: string, patch: Partial<LazOptAdd>) => setAdds(adds.map((a) => (a.code === code ? { ...a, ...patch } : a)));
  const toggleSize = (sv: SysVariantView, k: number) => {
    const a = addOf(sv.code); if (!a || !other) return;
    const val = other.values[k].value;
    const sizes = a.sizes ?? [];
    patchAdd(sv.code, { sizes: sizes.some((z) => z.value === val) ? sizes.filter((z) => z.value !== val) : [...sizes, sizeRow(sv, k)].sort((x, y) => other.values.findIndex((q) => q.value === x.value) - other.values.findIndex((q) => q.value === y.value)) });
  };
  const patchSize = (code: string, val: string, patch: Partial<LazOptAddSize>) => { const a = addOf(code); if (a) patchAdd(code, { sizes: (a.sizes ?? []).map((z) => (z.value === val ? { ...z, ...patch } : z)) }); };
  const notAdded = missing.filter((sv) => !addOf(sv.code));
  const addAll = () => setAdds([...adds, ...notAdded.map(defaultAdd)]);
  const dirtyN = plan?.changed ? plan.changes.length : 0;
  const open = openState ?? (missing.length > 0 && canAdd);

  const missingRow = (sv: SysVariantView) => {
    const a = addOf(sv.code);
    const img = a?.image ?? sv.image;
    return (
      <div key={sv.code} className={`flex flex-wrap items-start gap-2 border-t border-violet-100 px-2.5 py-2 ${a ? "bg-violet-50/70" : ""}`}>
        {a && canAdd && needImage ? (
          <button type="button" onClick={() => { sys.load(); setPickFor(sv.code); }} title="กดเพื่อเลือกรูปของสีนี้" className="relative block shrink-0 rounded">
            {img ? <img src={listingImgSrc(img, 120)} alt="" className="h-10 w-10 rounded object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-violet-300 text-violet-400"><Icon name="image" /></div>}
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-white text-[9px] text-slate-500"><Icon name="edit" /></span>
          </button>
        ) : (img ? <img src={listingImgSrc(img, 120)} alt="" className="h-10 w-10 shrink-0 rounded border border-dashed border-violet-200 object-cover" /> : <div className="h-10 w-10 shrink-0 rounded border border-dashed border-violet-200 bg-white" />)}
        <div className="min-w-0 flex-1 space-y-1">
          {a && canAdd ? (
            <input value={a.name} maxLength={LAZ_OPT_NAME_MAX + 20} onChange={(e) => patchAdd(sv.code, { name: e.target.value })} aria-label="ชื่อสีใหม่"
              className="h-8 w-full rounded-md border border-violet-300 bg-white px-2 text-sm" />
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-700">{sysOptionName(sv) ?? sv.code}
              <span className="rounded bg-violet-100 px-1 text-[10px] text-violet-800">ในระบบ</span>
            </div>
          )}
          <div className="text-[11px] text-slate-500"><span className="font-mono">{sv.code}</span> · ในระบบมี {sv.stock == null ? "—" : sv.stock.toLocaleString()} ชิ้น{a ? " · ขึ้นร้านด้วยสต๊อก 0 (BigSeller เติมให้ถ้าผูกรหัส)" : ""}</div>
          {a && canAdd && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              {!other && (
                <label className="flex items-center gap-1.5">ราคาปกติ
                  <MoneyInput value={a.price} onChange={(raw) => patchAdd(sv.code, { price: numOrNull(raw) })} className="h-8 w-24 rounded-md border border-violet-300 bg-white px-2 text-right text-sm" />
                </label>
              )}
              <label className="flex items-center gap-1.5">ราคาลด
                <MoneyInput value={a.special} onChange={(raw) => patchAdd(sv.code, { special: numOrNull(raw) })} placeholder="ไม่มี" className="h-8 w-24 rounded-md border border-violet-300 bg-white px-2 text-right text-sm" />
              </label>
              {shopSpecial != null && a.special !== shopSpecial && <button type="button" onClick={() => patchAdd(sv.code, { special: shopSpecial })} className="text-[11px] text-violet-700 hover:underline">ใช้ราคาลดเท่าตัวอื่น {baht(shopSpecial)}</button>}
              {!other && sv.price != null && Math.round(sv.price) !== a.price && <button type="button" onClick={() => patchAdd(sv.code, { price: Math.round(sv.price!) })} className="text-[11px] text-violet-700 hover:underline">ใช้ราคาระบบ {baht(sv.price)}</button>}
            </div>
          )}
          {a && other && canAdd && (
            <div className="space-y-1 rounded-md border border-violet-200 bg-white p-1.5">
              <div className="text-[11px] text-slate-500">{other.label} ที่จะเพิ่ม (ติ๊ก) · รหัส/ราคาปกติตามแบบของสีเดิม แก้ได้</div>
              {other.values.map((o, k) => {
                const z = (a.sizes ?? []).find((q) => q.value === o.value);
                return (
                  <div key={o.value} className="flex flex-wrap items-center gap-1.5 text-xs">
                    <label className="flex min-w-[5rem] items-center gap-1"><input type="checkbox" checked={!!z} onChange={() => toggleSize(sv, k)} />{nameOf(other.name, o.value)}</label>
                    {z && <input value={z.sku} onChange={(e) => patchSize(sv.code, o.value, { sku: e.target.value })} placeholder="รหัส SKU" aria-label={`รหัส ${o.value}`} className="h-7 w-36 rounded border border-slate-200 px-1.5 font-mono text-[11px]" />}
                    {z && <MoneyInput value={z.price} onChange={(raw) => patchSize(sv.code, o.value, { price: numOrNull(raw) })} className="h-7 w-24 rounded border border-slate-200 px-1.5 text-right" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {!a && !other && <span className="self-center text-sm text-slate-500">{baht(sv.price)}</span>}
        {canAdd && (
          <button type="button" onClick={() => toggleAdd(sv)}
            className={`h-8 shrink-0 self-center rounded-md px-2.5 text-xs ${a ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "border border-violet-300 bg-white text-violet-800 hover:bg-violet-50"}`}>
            {a ? "ไม่เพิ่ม" : <span className="inline-flex items-center gap-1"><Icon name="add" />เพิ่มขึ้น Lazada</span>}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-600">
        <Icon name="edit" />
        ชื่อตัวเลือก · เพิ่มสีจากระบบ
        <span className="font-normal text-slate-400">{groups.map((g) => `${g.label} ${g.values.length}`).join(" · ")}</span>
        {missing.length > 0 && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-normal text-violet-700">ในระบบมีสีที่ยังไม่อยู่บนร้าน {missing.length}</span>}
        {dirtyN > 0 && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-normal text-violet-700">แก้แล้ว {dirtyN}</span>}
        <span className="ml-auto text-violet-700">{open ? "ซ่อน" : can ? "แก้" : "ดู"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3">
          {can && sysNameDiff.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>ชื่อ{color.label}บนร้านต่างจากระบบ {sysNameDiff.length.toLocaleString()} ตัว</span>
              <button type="button" onClick={useSysNames} className="h-7 rounded-md border border-violet-300 bg-white px-2 text-violet-800 hover:bg-violet-50">ใช้ชื่อตามระบบทั้งหมด</button>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.name}>
              <div className="mb-1 text-xs font-medium text-slate-600">{g.label}{g === color && groups.length > 1 ? " · ชั้นสี" : ""}{g.customize ? <span className="ml-1 font-normal text-slate-400">(ร้านตั้งเอง · ยาวได้ {LAZ_OPT_NAME_MAX} ตัวอักษร)</span> : null}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.values.map((x, i) => {
                  const name = nameOf(g.name, x.value);
                  const changed = name.trim() !== x.value;
                  const sysName = g === color ? sysNameOf(i) : null;
                  const img = v.skus.find((q) => x.skuIds.includes(q.skuId))?.images[0] ?? null;
                  return (
                    <div key={x.value} className="flex items-center gap-2 rounded-lg border border-slate-100 p-1.5">
                      {g === color && (img ? <img src={img} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded object-cover" /> : <div className="h-10 w-10 shrink-0 rounded bg-slate-100" />)}
                      <div className="min-w-0 flex-1 space-y-0.5">
                        {can
                          ? <input value={name} maxLength={LAZ_OPT_NAME_MAX + 20} onChange={(e) => edit.setOptName(g.name, x.value, e.target.value)} aria-label="ชื่อตัวเลือก"
                              className={`h-8 w-full rounded-md border px-2 text-sm ${changed ? "border-violet-400 bg-violet-50" : "border-slate-200"}`} />
                          : <div className="truncate text-sm text-slate-700">{x.value}</div>}
                        <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                          <span>{x.skuIds.length} SKU</span>
                          {can && sysName && sysName !== name.trim() && (
                            <button type="button" onClick={() => edit.setOptName(g.name, x.value, sysName)} title="ใช้ชื่อตามระบบ (ยังไม่ส่งจนกดบันทึก)"
                              className="rounded border border-violet-200 bg-white px-1 text-violet-700 hover:bg-violet-50">ชื่อตามระบบ: {sysName}</button>
                          )}
                          {sysName && sysName === name.trim() && <span className="rounded bg-emerald-50 px-1 text-emerald-700">ตรงระบบ</span>}
                          {changed && <span className="line-through">{x.value}</span>}
                          {can && changed && <button type="button" onClick={() => edit.setOptName(g.name, x.value, x.value)} className="inline-flex items-center gap-0.5 text-slate-500 hover:text-slate-700"><Icon name="history" />ย้อน</button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {!!matchedParent && (missing.length > 0 || sysV.loading || sysV.error) && (
            <div className="overflow-hidden rounded-lg border border-dashed border-violet-300">
              <div className="flex flex-wrap items-center gap-2 bg-violet-50 px-2.5 py-1.5 text-xs text-violet-900">
                <span className="font-medium">มีในระบบ ยังไม่อยู่บนร้าน ({missing.length.toLocaleString()})</span>
                {sysV.loading && <span className="text-slate-500">กำลังโหลดสีในระบบ…</span>}
                {sysV.error && <span className="text-rose-600">{sysV.error} <button type="button" onClick={sysV.reload} className="underline">ลองใหม่</button></span>}
                {canAdd && notAdded.length > 1 && <button type="button" onClick={addAll} className="ml-auto h-7 rounded-md border border-violet-300 bg-white px-2 text-violet-800 hover:bg-violet-50">เพิ่มทั้งหมด ({notAdded.length.toLocaleString()})</button>}
              </div>
              {can && groups.length > 2 && <p className="border-t border-violet-100 px-2.5 py-1.5 text-xs text-amber-700">สินค้าที่มีตัวเลือกเกิน 2 ชั้น ยังเพิ่มสีจากระบบไม่ได้ — เพิ่มใน Seller Center</p>}
              {needImage && adds.length > 0 && <p className="border-t border-violet-100 px-2.5 py-1 text-[11px] text-slate-500">ตัวเลือกเดิมมีรูป — สีใหม่ต้องมีรูป (เริ่มจากรูปประจำสีในระบบ กดรูปเพื่อเปลี่ยน)</p>}
              {missing.map(missingRow)}
            </div>
          )}
          {plan?.changed && plan.errors.length > 0 && <ul className="space-y-0.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{plan.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <p className="text-[11px] text-slate-400">
            แก้แล้วกด “บันทึกขึ้น Lazada” ด้านล่าง (ถามก่อนส่ง · มีประวัติ) · ชื่อห้ามซ้ำในชั้นเดียวกัน · ปิดขายทีละสีใช้คอลัมน์ “ขาย” · รูปตัวเลือกเดิมแก้ที่โหมด “รูป · น้ำหนัก · กล่อง”
            {" · "}สีใหม่ขึ้นด้วยสต๊อก 0 · เอาสีออกทำใน Seller Center (ปิดขายสีนั้นแทนได้)
            {!matchedParent ? " · ดูสีในระบบได้เมื่อจับคู่สินค้านี้กับ Parent SKU แล้ว" : ""}
          </p>
        </div>
      )}
      {canAdd && (
        <ListingImagePicker open={!!pickFor} onClose={() => setPickFor(null)} mode="variant" storageKey="lazada-option-image-picker"
          title="เลือกรูปของสีใหม่" description="รูปจากระบบจะถูกฝากกับ Lazada เป็น JPG จัตุรัสพื้นขาวตอนกดบันทึก"
          matchedParent={matchedParent} matchedCode={matchedCode} sysImages={sys.images}
          onPick={(ref) => { if (pickFor) patchAdd(pickFor, { image: ref }); setPickFor(null); }} />
      )}
    </div>
  );
}
