"use client";
/**
 * ตัวแก้ "แบนเนอร์หน้าสินค้า" ต่อรุ่น (ใช้ในแท็บ 🛍 เว็บไซต์ ของ Parent SKU)
 * ของกลาง: useDragReorder/DragHandle (จัดลำดับ) · รูปเลือกจากรูปเว็บ/รูปสีที่มีอยู่ หรือเปิดคลัง (ผู้เรียกจัดการ onPickFromLibrary)
 */
import { useState } from "react";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { BANNER_LAYOUTS, textPosFor, fixTextPos, newBanner, type ProductBanner, type BannerLayout, type BannerTextPos } from "@/lib/website-banners";
import { PART_CHOICES } from "@/lib/website-theme";

const keyUrl = (key: string, w = 160) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
const mini = "h-7 rounded-lg border border-slate-200 text-[11px] px-1.5 bg-white text-slate-700";
const lbl = "block text-[11px] text-slate-500 mb-1";

export function ProductBannersEditor({
  banners,
  onChange,
  imageOptions,
  fields,
  onPickFromLibrary,
}: {
  banners: ProductBanner[];
  onChange: (b: ProductBanner[]) => void;
  /** รูปที่มีอยู่แล้วของรุ่นนี้ (รูปเว็บ + รูปรายสี) */
  imageOptions: { key: string; label: string }[];
  /** ฟิลด์ Parent SKU ให้เลือกโชว์ */
  fields: { key: string; label: string }[];
  /** เปิดคลังรูปเพื่อเลือกให้แบนเนอร์ id นี้ */
  onPickFromLibrary: (bannerId: string) => void;
}) {
  const drag = useDragReorder((from, to) => onChange(moveItem(banners, from, to)));
  const [openId, setOpenId] = useState<string | null>(null);
  const [fq, setFq] = useState("");
  const set = (id: string, patch: Partial<ProductBanner>) => onChange(banners.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {banners.map((b, i) => {
          const open = openId === b.id;
          const mLayout = b.mobile.layout ?? b.layout;
          return (
            <li key={b.id} {...drag.rowProps(i)} className={`rounded-lg border ${open ? "border-orange-300" : "border-slate-200"} bg-white ${drag.rowCls(i)}`}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <DragHandle {...drag.handleProps(i)} />
                <div className="w-14 h-9 rounded bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center text-[10px] text-slate-400">
                  {b.imageKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={keyUrl(b.imageKey)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    "ไม่มีรูป"
                  )}
                </div>
                <div className="flex-1 min-w-0 text-xs text-slate-700 truncate">
                  แบนเนอร์ {i + 1} · {b.layout === "half" ? "ครึ่งจอ" : "เต็มจอ"} · {textPosFor(b.layout).find((p) => p.value === b.textPos)?.label}
                  {!b.imageKey && <span className="ml-2 text-[10px] text-rose-600">ยังไม่เลือกรูป — เว็บจะไม่โชว์</span>}
                </div>
                <button type="button" onClick={() => setOpenId(open ? null : b.id)} className={`text-xs px-1.5 h-7 rounded-md border ${open ? "border-orange-500 text-orange-700 bg-orange-50" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>✎</button>
                <button type="button" onClick={() => onChange(banners.filter((x) => x.id !== b.id))} className="text-slate-300 hover:text-rose-600 px-1" title="ลบ">✕</button>
              </div>
              {open && (
                <div className="px-3 pb-3 pt-2 border-t border-slate-100 space-y-3">
                  {/* รูป */}
                  <div>
                    <label className={lbl}>รูปแบนเนอร์ — กดเลือกจากรูปที่มี หรือเปิดคลัง</label>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {imageOptions.map((o) => (
                        <button key={o.key} type="button" title={o.label} onClick={() => set(b.id, { imageKey: o.key })} className={`w-12 h-12 rounded-md overflow-hidden border-2 ${b.imageKey === o.key ? "border-orange-500" : "border-transparent hover:border-slate-300"}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={keyUrl(o.key, 120)} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                      <button type="button" onClick={() => onPickFromLibrary(b.id)} className="h-12 px-3 rounded-md border border-dashed border-slate-300 text-[11px] text-slate-500 hover:border-slate-500">📁 คลังรูป / อัปโหลด</button>
                      {b.imageKey && <button type="button" onClick={() => set(b.id, { imageKey: null })} className="text-[11px] text-slate-400 hover:text-rose-600">เอารูปออก</button>}
                    </div>
                  </div>

                  {/* จัดวาง คอม / มือถือ */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-slate-50 p-2 space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-600">🖥 คอม</div>
                      <select className={`${mini} w-full`} value={b.layout} onChange={(e) => { const layout = e.target.value as BannerLayout; set(b.id, { layout, textPos: fixTextPos(layout, b.textPos) }); }}>
                        {BANNER_LAYOUTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <select className={`${mini} w-full`} value={b.textPos} onChange={(e) => set(b.id, { textPos: e.target.value as BannerTextPos })}>
                        {textPosFor(b.layout).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-2 space-y-1.5">
                      <div className="text-[11px] font-semibold text-blue-700">📱 มือถือ {b.mobile.layout || b.mobile.textPos ? <button type="button" className="ml-2 font-normal hover:underline" onClick={() => set(b.id, { mobile: { layout: null, textPos: null } })}>ใช้ตามคอม</button> : <span className="font-normal text-blue-500">(ตามคอม)</span>}</div>
                      <select className={`${mini} w-full`} value={b.mobile.layout ?? ""} onChange={(e) => { const v = e.target.value as BannerLayout | ""; set(b.id, { mobile: { layout: v || null, textPos: v ? fixTextPos(v, b.mobile.textPos ?? b.textPos) : null } }); }}>
                        <option value="">ตามคอม</option>
                        {BANNER_LAYOUTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <select className={`${mini} w-full`} value={b.mobile.textPos ?? ""} onChange={(e) => set(b.id, { mobile: { ...b.mobile, textPos: (e.target.value as BannerTextPos) || null } })}>
                        <option value="">ตามคอม</option>
                        {textPosFor(mLayout).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* หัวข้อ / ข้อความ */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className={lbl}>หัวข้อ</label>
                      <select className={`${mini} w-full`} value={b.titleSource} onChange={(e) => set(b.id, { titleSource: e.target.value as ProductBanner["titleSource"] })}>
                        {PART_CHOICES.bannerTitles.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {b.titleSource === "text" && <input className={`${mini} w-full mt-1`} value={b.titleText} onChange={(e) => set(b.id, { titleText: e.target.value })} placeholder="หัวข้อแบนเนอร์" />}
                    </div>
                    <div>
                      <label className={lbl}>ข้อความ</label>
                      <select className={`${mini} w-full`} value={b.textSource} onChange={(e) => set(b.id, { textSource: e.target.value as ProductBanner["textSource"] })}>
                        {PART_CHOICES.bannerTexts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {b.textSource === "text" && <textarea rows={3} className="w-full mt-1 rounded-lg border border-slate-200 text-[11px] px-1.5 py-1 bg-white text-slate-700" value={b.text} onChange={(e) => set(b.id, { text: e.target.value })} placeholder="ข้อความใต้หัวข้อ" />}
                    </div>
                  </div>

                  {/* ฟิลด์ */}
                  <div>
                    <label className={lbl}>ฟิลด์ Parent SKU ที่โชว์ในแบนเนอร์ ({b.fields.length})</label>
                    {b.fields.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {b.fields.map((k) => (
                          <span key={k} className="inline-flex items-center gap-1 text-[11px] bg-orange-50 text-orange-700 rounded-full px-2 py-0.5">
                            {fields.find((f) => f.key === k)?.label ?? k}
                            <button type="button" onClick={() => set(b.id, { fields: b.fields.filter((x) => x !== k) })} className="hover:text-rose-600">✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input className={`${mini} w-full`} placeholder="ค้นหาฟิลด์เพื่อเพิ่ม…" value={fq} onChange={(e) => setFq(e.target.value)} />
                    {fq.trim() && (
                      <div className="mt-1 max-h-36 overflow-auto rounded-lg border border-slate-200 bg-white">
                        {fields.filter((f) => !b.fields.includes(f.key) && (f.label + f.key).toLowerCase().includes(fq.trim().toLowerCase())).slice(0, 30).map((f) => (
                          <button key={f.key} type="button" onClick={() => { set(b.id, { fields: [...b.fields, f.key] }); setFq(""); }} className="block w-full text-left text-[11px] px-2 py-1 hover:bg-slate-50">{f.label} <span className="text-slate-400">· {f.key}</span></button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => { const b = newBanner(imageOptions[1]?.key ?? imageOptions[0]?.key ?? null); onChange([...banners, b]); setOpenId(b.id); }} className="text-xs px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600">+ เพิ่มแบนเนอร์</button>
    </div>
  );
}
