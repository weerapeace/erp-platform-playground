"use client";
/**
 * รูปตัวเลือก + ชื่อตัวเลือก ของสินค้าบน TikTok (แท็บตัวเลือก & ราคา ในลิ้นชักสินค้าบนร้าน) — เจ้าของสั่ง 2026-11-13 "ทำ 1,2,4" (ข้อ 1)
 *   <TiktokOptionEditor v={view} edit={edit} matchedParent matchedCode />
 *   รูปใส่ได้ชั้นเดียว (ชั้นหลัก เช่น สี) และต้องครบทุกค่าของชั้นนั้น (กฎ TikTok) · เปลี่ยนชื่อค่าได้ทุกชั้น
 *   แก้แล้ว = ฟอร์มเปลี่ยนเฉย ๆ → ส่งตอนกด "บันทึกขึ้น TikTok" (ปุ่มเดียวกับชื่อ/ราคา) · ไม่แตะสต๊อก/ราคา/รหัส SKU
 * กฎ: lib/tiktok-sku-edit · ของกลางที่ใช้: ListingImagePicker (คลังรูปในระบบ) · Icon
 */
import { useState } from "react";
import { Icon } from "@/components/icon";
import { tiktokOptNameKey, TTS_OPT_VALUE_MAX } from "@/lib/tiktok-sku-edit";
import { tiktokUriOfRef, type TiktokListingView } from "@/lib/tiktok-listing-edit";
import { ListingImagePicker, listingImgSrc, useSystemImages } from "./listing-images";
import type { TiktokEditApi } from "./tiktok-listing-panels";

export function TiktokOptionEditor({ v, edit, matchedParent, matchedCode }: { v: TiktokListingView; edit: TiktokEditApi; matchedParent?: string | null; matchedCode?: string | null }) {
  const sys = useSystemImages(matchedParent ?? null);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const groups = edit.optGroups;
  const form = edit.skuForm;
  if (!groups.length || !form) return null;
  const st = (v.status ?? v.productStatus ?? "").toUpperCase();
  const can = edit.canEdit && !["PENDING", "FREEZE", "DELETED"].includes(st);
  const plan = edit.skuPlan;
  const primary = groups.find((g) => g.key === form.primary) ?? null;
  // รูปเดิมบนร้าน (uri → ลิงก์)
  const urlOfUri = new Map<string, string>();
  for (const g of groups) for (const x of g.values) if (x.img) urlOfUri.set(x.img.uri, x.img.url);
  const srcOf = (ref: string | null) => { if (!ref) return null; const uri = tiktokUriOfRef(ref); return uri ? urlOfUri.get(uri) ?? null : listingImgSrc(ref, 160); };
  const dirtyN = plan?.changed ? plan.changes.length : 0;
  return (
    <div className="rounded-xl border border-slate-200">
      <button type="button" onClick={() => setOpen((x) => !x)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-600">
        <Icon name="image" />
        รูปและชื่อตัวเลือก
        <span className="font-normal text-slate-400">{groups.map((g) => `${g.name} ${g.values.length}`).join(" · ")}{primary?.hasImages ? " · มีรูป" : " · ยังไม่มีรูป"}</span>
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
          {groups.map((g) => (
            <div key={g.key}>
              <div className="mb-1 text-xs font-medium text-slate-600">{g.name}{g.key === form.primary ? " · รูปตัวเลือก" : ""}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.values.map((x) => {
                  const nk = tiktokOptNameKey(g.key, x.key);
                  const name = form.names[nk] ?? x.name;
                  const isPrim = g.key === form.primary;
                  const ref = isPrim ? form.images[x.key] ?? null : null;
                  const src = srcOf(ref);
                  const imgChanged = isPrim && ref !== (x.img ? `tts:${x.img.uri}` : null);
                  return (
                    <div key={x.key} className="flex items-center gap-2 rounded-lg border border-slate-100 p-1.5">
                      {isPrim && (
                        <button type="button" disabled={!can || !matchedParent} onClick={() => { setPickFor(x.key); sys.load(); }}
                          title={!matchedParent ? "จับคู่สินค้านี้กับ Parent SKU ก่อน (แท็บจับคู่)" : can ? "เลือกรูปจากคลังรูปในระบบ" : ""}
                          className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white ${imgChanged ? "border-violet-400 ring-2 ring-violet-200" : "border-slate-200"} ${src ? "" : "border-dashed text-slate-300"} disabled:cursor-default`}>
                          {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Icon name="add" />}
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        {can
                          ? <input value={name} maxLength={TTS_OPT_VALUE_MAX + 10} onChange={(e) => edit.setSkuName(g.key, x.key, e.target.value)}
                              className={`h-8 w-full rounded-md border px-2 text-sm ${name.trim() !== x.name ? "border-violet-400 bg-violet-50" : "border-slate-200"}`} />
                          : <div className="truncate text-sm text-slate-700">{x.name}</div>}
                        <div className="truncate text-[11px] text-slate-400">{x.skuIds.length} SKU{name.trim() !== x.name ? ` · เดิม: ${x.name}` : ""}</div>
                      </div>
                      {isPrim && can && ref && imgChanged && (
                        <button type="button" onClick={() => edit.setSkuImage(x.key, x.img ? `tts:${x.img.uri}` : null)} className="shrink-0 text-[11px] text-slate-500 hover:underline">คืนรูปเดิม</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {plan?.changed && plan.errors.length > 0 && <ul className="space-y-0.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{plan.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <p className="text-[11px] text-slate-400">
            แก้แล้วกด “บันทึกขึ้น TikTok” ด้านล่าง (ถามก่อนส่ง) · TikTok ตรวจใหม่ ระหว่างตรวจร้านยังใช้ของเดิม · ไม่แตะสต๊อก/ราคา/รหัส SKU · ชื่อตัวเลือกยาวได้ {TTS_OPT_VALUE_MAX} ตัวอักษร ห้ามซ้ำในชั้นเดียวกัน
            {!matchedParent && can ? " · เลือกรูปได้เมื่อจับคู่สินค้านี้กับ Parent SKU แล้ว" : ""}
          </p>
        </div>
      )}
      {can && (
        <ListingImagePicker open={!!pickFor} onClose={() => setPickFor(null)} mode="variant" storageKey="tiktok-sku-image-picker"
          title={`เลือกรูปตัวเลือก${pickFor && primary ? `: ${primary.values.find((x) => x.key === pickFor)?.name ?? ""}` : ""}`}
          description="รูปจะถูกทำเป็นจัตุรัสพื้นขาว 1500px แล้วฝากกับ TikTok ตอนกดบันทึก"
          matchedParent={matchedParent ?? null} matchedCode={matchedCode} sysImages={sys.images}
          onPick={(ref) => { if (pickFor) edit.setSkuImage(pickFor, ref); setPickFor(null); }} />
      )}
    </div>
  );
}
