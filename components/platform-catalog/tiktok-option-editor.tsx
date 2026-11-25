"use client";
/**
 * รูปตัวเลือก + ชื่อตัวเลือก + เพิ่มสีจากระบบ ของสินค้าบน TikTok (แท็บตัวเลือก & ราคา ในลิ้นชักสินค้าบนร้าน)
 *   เจ้าของสั่ง 2026-11-13 "ทำ 1,2,4" (ข้อ 1) · 2026-11-25 แบบ A + ข้อเสนอ 1 (ชื่อตามระบบ) / 3 (สีที่ยังไม่อยู่บนร้าน + ปุ่มเพิ่ม) / 5 (สี×ไซซ์) / 6 (ย้อน)
 *   <TiktokOptionEditor v={view} edit={edit} listingId matchedParent matchedCode />
 *   รูปใส่ได้ชั้นเดียว (ชั้นหลัก เช่น สี) และต้องครบทุกค่าของชั้นนั้น (กฎ TikTok) · เปลี่ยนชื่อค่าได้ทุกชั้น
 *   สีใหม่ = สีในระบบที่ยังไม่มีรหัสบนร้าน (lib/listing-option-sync) → ขึ้นพร้อมสต๊อกจริงในระบบครั้งเดียว (TikTok บังคับ ≥ 1 · ในระบบ 0 = เพิ่มไม่ได้)
 *     สินค้าสี×ไซซ์: ติ๊กไซซ์ที่จะเพิ่ม รหัส/ราคาตามแบบของสีเดิม · สต๊อกต่อไซซ์กรอกเอง (ในระบบเก็บสต๊อกรวมระดับสี)
 *   แก้แล้ว = ฟอร์มเปลี่ยนเฉย ๆ → ส่งตอนกด "บันทึกขึ้น TikTok" (ปุ่มเดียวกับชื่อ/ราคา · ถามยืนยันก่อน)
 *   TikTok ปิดขายทีละสีไม่ได้ (ปิดได้ทั้งสินค้าที่หัวลิ้นชัก) · เอาสีออก = ทำใน Seller Center
 * กฎ: lib/tiktok-sku-edit · ของกลางที่ใช้: ListingImagePicker (คลังรูปในระบบ) · useSysVariants · MoneyInput · Icon
 */
import { useState } from "react";
import { Icon } from "@/components/icon";
import { MoneyInput } from "@/components/money-input";
import { tiktokModelsLite, tiktokOptNameKey, TTS_OPT_VALUE_MAX, TTS_STOCK_MAX, type TiktokSkuAdd, type TiktokSkuAddSize } from "@/lib/tiktok-sku-edit";
import { tiktokUriOfRef, type TiktokListingView } from "@/lib/tiktok-listing-edit";
import { sizePricesForNewColor, sizeSkusForNewColor, sysOptionName, sysVariantOfOption, sysVariantsNotOnShop, type SysVariantView } from "@/lib/listing-option-sync";
import { ListingImagePicker, listingImgSrc, useSystemImages } from "./listing-images";
import { useSysVariants } from "./use-sys-variants";
import type { TiktokEditApi } from "./tiktok-listing-panels";

const numOrNull = (raw: string | number | null | undefined): number | null => { if (raw == null || raw === "") return null; const n = Number(raw); return Number.isFinite(n) ? n : null; };
const baht = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("th-TH", { maximumFractionDigits: 2 })}฿`);
/** ราคาที่พบบ่อยสุดบนร้าน (ราคาเริ่มของสีใหม่ ให้เท่าสีเดิม) */
const modeOf = (xs: (number | null)[]): number | null => {
  const count = new Map<number, number>();
  for (const x of xs) if (x != null) count.set(x, (count.get(x) ?? 0) + 1);
  let best: number | null = null; let n = 0;
  for (const [p, c] of count) if (c > n) { best = p; n = c; }
  return best;
};

type PickTarget = { kind: "opt"; key: string } | { kind: "add"; code: string };

export function TiktokOptionEditor({ v, edit, listingId, matchedParent, matchedCode }: { v: TiktokListingView; edit: TiktokEditApi; listingId?: string | null; matchedParent?: string | null; matchedCode?: string | null }) {
  const sys = useSystemImages(matchedParent ?? null);
  const groups = edit.optGroups;
  const sysV = useSysVariants(listingId ?? null, !!matchedParent && groups.length > 0);
  const [pick, setPick] = useState<PickTarget | null>(null);
  const [openState, setOpen] = useState<boolean | null>(null);
  const form = edit.skuForm;
  if (!groups.length || !form) return null;
  const st = (v.status ?? v.productStatus ?? "").toUpperCase();
  const can = edit.canEdit && !["PENDING", "FREEZE", "DELETED"].includes(st);
  const plan = edit.skuPlan;
  const primary = groups.find((g) => g.key === form.primary) ?? null;
  const color = groups[0];
  const size = groups.length === 2 ? groups[1] : null;
  const canAdd = can && groups.length <= 2;
  // รูปเดิมบนร้าน (uri → ลิงก์)
  const urlOfUri = new Map<string, string>();
  for (const g of groups) for (const x of g.values) if (x.img) urlOfUri.set(x.img.uri, x.img.url);
  const srcOf = (ref: string | null) => { if (!ref) return null; const uri = tiktokUriOfRef(ref); return uri ? urlOfUri.get(uri) ?? null : listingImgSrc(ref, 160); };

  // สีในระบบ ↔ ตัวเลือกบนร้าน (ชั้นแรก)
  const sysList = sysV.variants ?? [];
  const models = tiktokModelsLite(groups, v.skus);
  const sysOfValue = (i: number) => sysVariantOfOption(models, i, sysList);
  const nameOf = (gk: string, x: { key: string; name: string }) => form.names[tiktokOptNameKey(gk, x.key)] ?? x.name;
  const sysNameOf = (i: number) => sysOptionName(sysOfValue(i));
  const sysNameDiff = color.values.map((x, i) => ({ x, n: sysNameOf(i) })).filter((r) => r.n && r.n !== nameOf(color.key, r.x).trim());
  const useSysNames = () => sysNameDiff.forEach((r) => edit.setSkuName(color.key, r.x.key, r.n!));

  // สีใหม่จากระบบ
  const missing = matchedParent ? sysVariantsNotOnShop(v.skus.map((x) => x.sellerSku), sysList) : [];
  const adds = form.adds ?? [];
  const addOf = (code: string) => adds.find((a) => a.code === code) ?? null;
  const needImage = form.primary === color.key && color.values.some((x) => !!form.images[x.key]);
  const shopPrice = modeOf(v.skus.map((x) => x.price));
  const addable = (sv: SysVariantView) => (size ? true : (sv.stock ?? 0) > 0);
  const sizeDefaults = (sv: SysVariantView) => {
    const n = size?.values.length ?? 0;
    return { skus: sizeSkusForNewColor(models, sysList, sv.code, n), prices: sizePricesForNewColor(models, n, sv.price != null ? Math.round(sv.price) : shopPrice) };
  };
  const sizeRow = (sv: SysVariantView, k: number): TiktokSkuAddSize => { const d = sizeDefaults(sv); return { valueKey: size!.values[k].key, sku: d.skus[k] ?? "", price: d.prices[k], stock: null }; };
  const defaultAdd = (sv: SysVariantView): TiktokSkuAdd => {
    const name = sysOptionName(sv) ?? sv.code;
    const price = shopPrice ?? (sv.price != null ? Math.round(sv.price) : null);
    const base: TiktokSkuAdd = { code: sv.code, name, image: sv.image, price, stock: sv.stock };
    return size ? { ...base, sizes: size.values.map((_, k) => sizeRow(sv, k)) } : base;
  };
  const setAdds = (next: TiktokSkuAdd[]) => edit.setSkuAdds(next);
  const toggleAdd = (sv: SysVariantView) => setAdds(addOf(sv.code) ? adds.filter((a) => a.code !== sv.code) : [...adds, defaultAdd(sv)]);
  const patchAdd = (code: string, patch: Partial<TiktokSkuAdd>) => setAdds(adds.map((a) => (a.code === code ? { ...a, ...patch } : a)));
  const toggleSize = (sv: SysVariantView, k: number) => {
    const a = addOf(sv.code); if (!a || !size) return;
    const key = size.values[k].key;
    const sizes = a.sizes ?? [];
    patchAdd(sv.code, { sizes: sizes.some((z) => z.valueKey === key) ? sizes.filter((z) => z.valueKey !== key) : [...sizes, sizeRow(sv, k)].sort((x, y) => size.values.findIndex((q) => q.key === x.valueKey) - size.values.findIndex((q) => q.key === y.valueKey)) });
  };
  const patchSize = (code: string, key: string, patch: Partial<TiktokSkuAddSize>) => { const a = addOf(code); if (a) patchAdd(code, { sizes: (a.sizes ?? []).map((z) => (z.valueKey === key ? { ...z, ...patch } : z)) }); };
  const notAdded = missing.filter((sv) => !addOf(sv.code) && addable(sv));
  const addAll = () => setAdds([...adds, ...notAdded.map(defaultAdd)]);

  const onPicked = (ref: string) => {
    if (pick?.kind === "opt") edit.setSkuImage(pick.key, ref);
    else if (pick?.kind === "add") patchAdd(pick.code, { image: ref });
    setPick(null);
  };
  const openPick = (p: PickTarget) => { sys.load(); setPick(p); };
  const dirtyN = plan?.changed ? plan.changes.length : 0;
  const open = openState ?? (missing.length > 0 && canAdd);

  const missingRow = (sv: SysVariantView) => {
    const a = addOf(sv.code);
    const img = a?.image ?? sv.image;
    const ok = addable(sv);
    return (
      <div key={sv.code} className={`flex flex-wrap items-start gap-2 border-t border-violet-100 px-2.5 py-2 ${a ? "bg-violet-50/70" : ""}`}>
        {a && canAdd && needImage ? (
          <button type="button" onClick={() => openPick({ kind: "add", code: sv.code })} title="กดเพื่อเลือกรูปของสีนี้" className="relative block shrink-0 rounded">
            {img ? <img src={listingImgSrc(img, 120)} alt="" className="h-10 w-10 rounded object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-violet-300 text-violet-400"><Icon name="image" /></div>}
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-white text-[9px] text-slate-500"><Icon name="edit" /></span>
          </button>
        ) : (img ? <img src={listingImgSrc(img, 120)} alt="" className="h-10 w-10 shrink-0 rounded border border-dashed border-violet-200 object-cover" /> : <div className="h-10 w-10 shrink-0 rounded border border-dashed border-violet-200 bg-white" />)}
        <div className="min-w-0 flex-1 space-y-1">
          {a && canAdd ? (
            <input value={a.name} maxLength={TTS_OPT_VALUE_MAX + 10} onChange={(e) => patchAdd(sv.code, { name: e.target.value })} aria-label="ชื่อสีใหม่"
              className="h-8 w-full rounded-md border border-violet-300 bg-white px-2 text-sm" />
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-700">{sysOptionName(sv) ?? sv.code}
              <span className="rounded bg-violet-100 px-1 text-[10px] text-violet-800">ในระบบ</span>
            </div>
          )}
          <div className="text-[11px] text-slate-500">
            <span className="font-mono">{sv.code}</span> · ในระบบมี {sv.stock == null ? "—" : sv.stock.toLocaleString()} ชิ้น
            {!size && a ? ` · ขึ้นร้านด้วยสต๊อก ${(sv.stock ?? 0).toLocaleString()} ชิ้น (ครั้งเดียว แล้ว BigSeller ซิงค์ต่อ)` : ""}
            {!size && !ok ? <span className="text-rose-600"> · สต๊อก 0 — TikTok ต้องมีสต๊อก ยังเพิ่มไม่ได้</span> : null}
          </div>
          {a && !size && canAdd && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">ราคา (บาท)
              <MoneyInput value={a.price} onChange={(raw) => patchAdd(sv.code, { price: numOrNull(raw) })} className="h-8 w-28 rounded-md border border-violet-300 bg-white px-2 text-right text-sm" />
              {sv.price != null && Math.round(sv.price) !== a.price && <button type="button" onClick={() => patchAdd(sv.code, { price: Math.round(sv.price!) })} className="text-[11px] text-violet-700 hover:underline">ใช้ราคาระบบ {baht(sv.price)}</button>}
            </label>
          )}
          {a && size && canAdd && (
            <div className="space-y-1 rounded-md border border-violet-200 bg-white p-1.5">
              <div className="text-[11px] text-slate-500">{size.name || "ไซซ์"} ที่จะเพิ่ม (ติ๊ก) · รหัส/ราคาตามแบบของสีเดิม แก้ได้ · สต๊อกต่อ{size.name || "ไซซ์"} (ในระบบมีสีนี้รวม {sv.stock == null ? "—" : sv.stock.toLocaleString()} ชิ้น)</div>
              {size.values.map((o, k) => {
                const z = (a.sizes ?? []).find((q) => q.valueKey === o.key);
                return (
                  <div key={o.key} className="flex flex-wrap items-center gap-1.5 text-xs">
                    <label className="flex w-20 items-center gap-1"><input type="checkbox" checked={!!z} onChange={() => toggleSize(sv, k)} />{nameOf(size.key, o)}</label>
                    {z && <input value={z.sku} onChange={(e) => patchSize(sv.code, o.key, { sku: e.target.value })} placeholder="รหัส SKU" aria-label={`รหัส ${o.name}`} className="h-7 w-36 rounded border border-slate-200 px-1.5 font-mono text-[11px]" />}
                    {z && <MoneyInput value={z.price} onChange={(raw) => patchSize(sv.code, o.key, { price: numOrNull(raw) })} className="h-7 w-24 rounded border border-slate-200 px-1.5 text-right" />}
                    {z && (
                      <input type="number" min={1} max={TTS_STOCK_MAX} step={1} inputMode="numeric" value={z.stock ?? ""} placeholder="สต๊อก" aria-label={`สต๊อก ${o.name}`}
                        onChange={(e) => patchSize(sv.code, o.key, { stock: numOrNull(e.target.value) })}
                        className={`h-7 w-20 rounded border px-1.5 text-right ${z.stock == null || z.stock < 1 ? "border-rose-300 bg-rose-50" : "border-slate-200"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {!a && !size && <span className="self-center text-sm text-slate-500">{baht(sv.price)}</span>}
        {canAdd && (
          <button type="button" onClick={() => toggleAdd(sv)} disabled={!a && !ok} title={!ok ? "สต๊อกในระบบเป็น 0 — TikTok ต้องมีสต๊อกอย่างน้อย 1" : ""}
            className={`h-8 shrink-0 self-center rounded-md px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${a ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "border border-violet-300 bg-white text-violet-800 hover:bg-violet-50"}`}>
            {a ? "ไม่เพิ่ม" : <span className="inline-flex items-center gap-1"><Icon name="add" />เพิ่มขึ้น TikTok</span>}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-600">
        <Icon name="image" />
        รูปและชื่อตัวเลือก
        <span className="font-normal text-slate-400">{groups.map((g) => `${g.name} ${g.values.length}`).join(" · ")}{primary?.hasImages ? " · มีรูป" : " · ยังไม่มีรูป"}</span>
        {missing.length > 0 && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-normal text-violet-700">ในระบบมีสีที่ยังไม่อยู่บนร้าน {missing.length}</span>}
        {dirtyN > 0 && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-normal text-violet-700">แก้แล้ว {dirtyN}</span>}
        <span className="ml-auto text-violet-700">{open ? "ซ่อน" : can ? "แก้" : "ดู"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3">
          {!can && edit.canEdit && <p className="text-xs text-amber-700">{st === "PENDING" ? "สินค้านี้รอ TikTok ตรวจอยู่ — แก้ตัวเลือกได้หลังตรวจเสร็จ" : "สินค้าสถานะนี้แก้ตัวเลือกไม่ได้"}</p>}
          {groups.length > 1 && can && (
            <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              ใส่รูปที่ชั้น
              <select value={form.primary ?? ""} onChange={(e) => edit.setSkuPrimary(e.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2">
                {groups.map((g) => <option key={g.key} value={g.key}>{g.name}{g.hasImages ? " (มีรูปอยู่)" : ""}</option>)}
              </select>
              <span className="text-[11px] text-slate-400">TikTok ให้ใส่รูปได้ชั้นเดียว และต้องครบทุกค่า</span>
            </label>
          )}
          {can && sysNameDiff.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>ชื่อ{color.name}บนร้านต่างจากระบบ {sysNameDiff.length.toLocaleString()} ตัว</span>
              <button type="button" onClick={useSysNames} className="h-7 rounded-md border border-violet-300 bg-white px-2 text-violet-800 hover:bg-violet-50">ใช้ชื่อตามระบบทั้งหมด</button>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.key}>
              <div className="mb-1 text-xs font-medium text-slate-600">{g.name}{g.key === form.primary ? " · รูปตัวเลือก" : ""}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.values.map((x, i) => {
                  const name = nameOf(g.key, x);
                  const isPrim = g.key === form.primary;
                  const ref = isPrim ? form.images[x.key] ?? null : null;
                  const src = srcOf(ref);
                  const origRef = x.img ? `tts:${x.img.uri}` : null;
                  const imgChanged = isPrim && ref !== origRef;
                  const nameChanged = name.trim() !== x.name;
                  const sysName = g.key === color.key ? sysNameOf(i) : null;
                  return (
                    <div key={x.key} className="flex items-center gap-2 rounded-lg border border-slate-100 p-1.5">
                      {isPrim && (
                        <button type="button" disabled={!can || !matchedParent} onClick={() => openPick({ kind: "opt", key: x.key })}
                          title={!matchedParent ? "จับคู่สินค้านี้กับ Parent SKU ก่อน (แท็บจับคู่)" : can ? "เลือกรูปจากคลังรูปในระบบ" : ""}
                          className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white ${imgChanged ? "border-violet-400 ring-2 ring-violet-200" : "border-slate-200"} ${src ? "" : "border-dashed text-slate-300"} disabled:cursor-default`}>
                          {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Icon name="add" />}
                        </button>
                      )}
                      <div className="min-w-0 flex-1 space-y-0.5">
                        {can
                          ? <input value={name} maxLength={TTS_OPT_VALUE_MAX + 10} onChange={(e) => edit.setSkuName(g.key, x.key, e.target.value)} aria-label="ชื่อตัวเลือก"
                              className={`h-8 w-full rounded-md border px-2 text-sm ${nameChanged ? "border-violet-400 bg-violet-50" : "border-slate-200"}`} />
                          : <div className="truncate text-sm text-slate-700">{x.name}</div>}
                        <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                          <span>{x.skuIds.length} SKU</span>
                          {can && sysName && sysName !== name.trim() && (
                            <button type="button" onClick={() => edit.setSkuName(g.key, x.key, sysName)} title="ใช้ชื่อตามระบบ (ยังไม่ส่งจนกดบันทึก)"
                              className="rounded border border-violet-200 bg-white px-1 text-violet-700 hover:bg-violet-50">ชื่อตามระบบ: {sysName}</button>
                          )}
                          {sysName && sysName === name.trim() && <span className="rounded bg-emerald-50 px-1 text-emerald-700">ตรงระบบ</span>}
                          {nameChanged && <span className="line-through">{x.name}</span>}
                          {can && (nameChanged || imgChanged) && (
                            <button type="button" onClick={() => { edit.setSkuName(g.key, x.key, x.name); if (imgChanged) edit.setSkuImage(x.key, origRef); }}
                              className="inline-flex items-center gap-0.5 text-slate-500 hover:text-slate-700"><Icon name="history" />ย้อน</button>
                          )}
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
              {can && groups.length > 2 && <p className="border-t border-violet-100 px-2.5 py-1.5 text-xs text-amber-700">สินค้าที่มีตัวเลือก 3 ชั้น ยังเพิ่มสีจากระบบไม่ได้ — เพิ่มใน Seller Center</p>}
              {needImage && adds.length > 0 && <p className="border-t border-violet-100 px-2.5 py-1 text-[11px] text-slate-500">สินค้านี้มีรูปทุกสี — สีใหม่ต้องมีรูป (กดรูปเพื่อเปลี่ยน)</p>}
              {missing.map(missingRow)}
            </div>
          )}
          {plan?.changed && plan.errors.length > 0 && <ul className="space-y-0.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{plan.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <p className="text-[11px] text-slate-400">
            แก้แล้วกด “บันทึกขึ้น TikTok” ด้านล่าง (ถามก่อนส่ง · มีประวัติ) · TikTok ตรวจใหม่ ระหว่างตรวจร้านยังใช้ของเดิม · ชื่อตัวเลือกยาวได้ {TTS_OPT_VALUE_MAX} ตัวอักษร ห้ามซ้ำในชั้นเดียวกัน
            {" · "}สีใหม่ขึ้นพร้อมสต๊อกในระบบครั้งเดียว (TikTok บังคับมีสต๊อก) · TikTok ปิดขายทีละสีไม่ได้ (ปิดได้ทั้งสินค้าที่หัวลิ้นชัก) · เอาสีออกทำใน Seller Center
            {!matchedParent && can ? " · เลือกรูป/ดูสีในระบบได้เมื่อจับคู่สินค้านี้กับ Parent SKU แล้ว" : ""}
          </p>
        </div>
      )}
      {can && (
        <ListingImagePicker open={!!pick} onClose={() => setPick(null)} mode="variant" storageKey="tiktok-sku-image-picker"
          title={pick?.kind === "opt" ? `เลือกรูปตัวเลือก: ${primary?.values.find((x) => x.key === pick.key)?.name ?? ""}` : "เลือกรูปของสีใหม่"}
          description="รูปจะถูกทำเป็นจัตุรัสพื้นขาว 1500px แล้วฝากกับ TikTok ตอนกดบันทึก"
          matchedParent={matchedParent ?? null} matchedCode={matchedCode} sysImages={sys.images}
          onPick={onPicked} />
      )}
    </div>
  );
}
