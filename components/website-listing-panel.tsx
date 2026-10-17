"use client";
/**
 * 🖼 แท็บ "หน้ารายการสินค้า" ในหน้าดีไซน์เว็บ — รูปแทรกในกริดสินค้า (theme.listing)
 * ของกลาง: useDragReorder/DragHandle (ลากเรียง) · ImageUploadField (อัปโหลดรูป) · ConfirmDialog (ลบ)
 * ตรรกะ/ค่าที่เลือกได้อยู่ lib/website-listing.ts · storefront วาดใน ShopClient + ListingInsertTile
 */
import { useState } from "react";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { ImageUploadField, keyUrl } from "@/components/website-theme-media";
import { ConfirmDialog } from "@/components/modal";
import { categoryHref } from "@/lib/website-links";
import { ShopFiltersEditor } from "@/components/website-shop-filters-editor";
import { LinkTargetPicker } from "@/components/website-link-picker";
import { ListingLayoutSettings } from "@/components/website-listing-layout";
import type { SchemaFormContext } from "@/components/website-schema-form";
import {
  LISTING_SIZES, LISTING_SCOPES, LISTING_TEXT_POS, LISTING_RATIOS, LISTING_RATIOS_MOBILE, MAX_LISTING_INSERTS,
  newListingInsert, type ListingConfig, type ListingInsert,
} from "@/lib/website-listing";

const inputCls = "w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 bg-white";
const lbl = "block text-[11px] text-slate-500 mb-1";

export function ListingPanel({
  value,
  onChange,
  categories,
  products,
  fields = [],
  linkCtx,
  cardColumns = { desktop: 4, tablet: 3, mobile: 2 },
}: {
  value: ListingConfig;
  onChange: (v: ListingConfig) => void;
  categories: { key: string; label: string }[];
  products: { code: string; name: string }[];
  /** ฟิลด์สินค้าที่ส่งออกเว็บ — เลือกทำตัวกรองเพิ่มได้ */
  fields?: { key: string; label: string }[];
  /** ตัวเลือกลิงก์ปลายทาง (ของกลาง) — ไม่ส่ง = ช่องพิมพ์เอง */
  linkCtx?: SchemaFormContext;
  /** ค่าต่อแถวของ "การ์ดสินค้า" ทั้งเว็บ (ตัวตั้งต่อแถวเฉพาะหน้านี้เริ่มจากค่านี้) */
  cardColumns?: { desktop: number; tablet: number; mobile: number };
}) {
  const list = value.inserts;
  const set = (inserts: ListingInsert[]) => onChange({ ...value, inserts });
  const patch = (id: string, p: Partial<ListingInsert>) => set(list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const drag = useDragReorder((from, to) => set(moveItem(list, from, to)));
  const [openId, setOpenId] = useState<string | null>(null);
  const [del, setDel] = useState<ListingInsert | null>(null);

  const catLabel = (k: string) => categories.find((c) => c.key === k)?.label ?? k;
  const summary = (x: ListingInsert) =>
    [
      x.after === 0 ? "ก่อนสินค้าชิ้นแรก" : `หลังสินค้าชิ้นที่ ${x.after}`,
      LISTING_SIZES.find((s) => s.value === x.size)?.label.replace(/ \(.*\)$/, ""),
      x.scope === "all" ? "ทุกหน้า" : x.scope === "shop" ? "เฉพาะหน้าทั้งหมด" : x.categories.map(catLabel).join(", ") || "ยังไม่เลือกหมวด",
    ].join(" · ");

  return (
    <div className="space-y-3">
      {/* 📐 หัวหน้า · ต่อแถว · แบ่งหน้า · การเรียง */}
      <ListingLayoutSettings value={value} onChange={onChange} cardColumns={cardColumns} />
      {/* 🧭 ตัวกรอง — ตำแหน่ง + กลุ่มตัวกรอง (ลำดับ/เปิดปิด/ชื่อ/ตั้งค่า) · โทนสีเป็นของกลางทุกร้าน จัดในป๊อป "จัดโทนสี" */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
        <p className="text-xs font-semibold text-slate-800">🧭 ตัวกรองสินค้า</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-700">ตำแหน่งตัวกรอง</span>
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            {([
              ["side", "◧ แถบซ้าย"],
              ["top", "▤ แถวบน"],
            ] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => onChange({ ...value, filterLayout: v })}
                className={`px-3 py-1 text-xs ${value.filterLayout === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            {value.filterLayout === "side" ? "จอคอม: ตัวกรองอยู่แถบซ้าย (ติดจอเวลาเลื่อน · พับ/กางทีละกลุ่ม) · มือถือ: ปุ่ม “ตัวกรอง” เปิดจากด้านล่าง" : "ตัวกรองเป็นแถวปุ่มเหนือรายการสินค้า"}
          </span>
        </div>
        {value.filterLayout === "side" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-700">เปิดหน้ามา (จอคอม)</span>
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
              {([
                ["open", "▣ โชว์แถบตัวกรอง"],
                ["collapsed", "◁ พับเข้าซ้าย"],
              ] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange({ ...value, filterSidebar: v })}
                  className={`px-3 py-1 text-xs ${(value.filterSidebar ?? "open") === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-400">
              {value.filterSidebar === "collapsed" ? "สินค้าเต็มความกว้าง · ลูกค้ากดปุ่ม “ตัวกรอง” เพื่อกางแถบออกมา" : "แถบตัวกรองกางอยู่ · ลูกค้ากด “« ซ่อน” เพื่อพับเข้าซ้ายได้"}
            </span>
          </div>
        )}
        <ShopFiltersEditor value={value} onChange={onChange} fields={fields} />
      </div>

      <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600 leading-relaxed">
        แทรกรูป (เช่น รูปนายแบบ/ไลฟ์สไตล์) ระหว่างการ์ดสินค้าในหน้า <b>สินค้าทั้งหมด</b> และหน้าหมวด · เพิ่มได้หลายรูป ลาก ⠿ เพื่อเรียง
        <br />
        กฎบนเว็บ: โชว์เฉพาะตอนลูกค้าเรียงแบบ &quot;แนะนำ&quot; และไม่ได้ค้นหา/กดตัวกรอง · ถ้าหมวดนั้นมีสินค้าน้อยกว่าลำดับที่ตั้ง รูปนั้นจะไม่โชว์ · ระบบดึงการ์ดมาเติมช่องว่างให้เอง (ไม่มีรูโหว่) · มือถือ: รูปที่ใหญ่กว่า 1 ช่องจะเป็นเต็มแถว
      </div>

      {list.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400">ยังไม่มีรูปแทรก — กด “＋ เพิ่มรูปแทรก” ด้านล่าง</div>
      )}

      <ul className="space-y-1.5">
        {list.map((x, i) => {
          const open = openId === x.id;
          const thumb = x.imageKey ?? x.mobileImageKey;
          return (
            <li key={x.id} {...drag.rowProps(i)} className={`rounded-lg border bg-white ${open ? "border-blue-300" : "border-slate-200"} ${drag.rowCls(i)} ${x.enabled ? "" : "opacity-60"}`}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <DragHandle {...drag.handleProps(i)} />
                <div className="w-14 h-9 rounded bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center text-[10px] text-slate-400">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={keyUrl(thumb, 160) ?? ""} alt="" className="w-full h-full object-cover" />
                  ) : (
                    "ไม่มีรูป"
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-700 truncate">{x.title || `รูปแทรก ${i + 1}`}</div>
                  <div className="text-[11px] text-slate-400 truncate">{summary(x)}{!thumb && <span className="ml-1 text-rose-500">· ยังไม่มีรูป — เว็บจะไม่โชว์</span>}</div>
                </div>
                <label className="flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer shrink-0" title="เปิด/ปิดชั่วคราว">
                  <input type="checkbox" className="accent-blue-600" checked={x.enabled} onChange={(e) => patch(x.id, { enabled: e.target.checked })} />
                  โชว์
                </label>
                <button type="button" onClick={() => setOpenId(open ? null : x.id)} className={`text-xs px-1.5 h-7 rounded-md border ${open ? "border-blue-500 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>✎</button>
                <button type="button" onClick={() => setDel(x)} className="text-slate-300 hover:text-rose-600 px-1" title="ลบ">🗑</button>
              </div>

              {open && (
                <div className="px-3 pb-3 pt-2 border-t border-slate-100 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ImageUploadField label="รูปบนคอม" hint="แนะนำแนวนอนสำหรับ 2 ช่อง/เต็มแถว" value={x.imageKey} onChange={(k) => patch(x.id, { imageKey: k })} height={56} />
                    <ImageUploadField label="รูปบนมือถือ (ว่าง = ใช้รูปคอม)" hint="แนะนำแนวตั้ง 4:5" value={x.mobileImageKey} onChange={(k) => patch(x.id, { mobileImageKey: k })} height={56} />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <label className={lbl}>แทรกหลังสินค้าชิ้นที่</label>
                      <input type="number" min={0} max={500} value={x.after} onChange={(e) => patch(x.id, { after: Math.max(0, Math.min(500, Math.round(Number(e.target.value) || 0))) })} className={inputCls} />
                      <p className="text-[10px] text-slate-400 mt-0.5">0 = ก่อนสินค้าชิ้นแรก</p>
                    </div>
                    <div>
                      <label className={lbl}>ขนาด</label>
                      <select className={inputCls} value={x.size} onChange={(e) => patch(x.id, { size: e.target.value as ListingInsert["size"] })}>
                        {LISTING_SIZES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-0.5">{LISTING_SIZES.find((o) => o.value === x.size)?.hint}</p>
                    </div>
                    <div>
                      <label className={lbl}>โชว์ในหน้า</label>
                      <select className={inputCls} value={x.scope} onChange={(e) => patch(x.id, { scope: e.target.value as ListingInsert["scope"] })}>
                        {LISTING_SCOPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {x.scope === "categories" && (
                    <div className="flex flex-wrap gap-1.5">
                      {categories.length === 0 && <span className="text-[11px] text-slate-400">ร้านนี้ยังไม่มีหมวด (ตั้งที่แท็บ ⚙️ จับคู่ฟิลด์)</span>}
                      {categories.map((c) => {
                        const on = x.categories.includes(c.key);
                        return (
                          <button key={c.key} type="button" onClick={() => patch(x.id, { categories: on ? x.categories.filter((k) => k !== c.key) : [...x.categories, c.key] })}
                            className={`text-[11px] rounded-full border px-2.5 py-1 ${on ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                            {on ? "✓ " : ""}{c.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {(x.size === "full" || x.size !== "1x1") && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {x.size === "full" && (
                        <div>
                          <label className={lbl}>สัดส่วนรูปเต็มแถว · คอม</label>
                          <select className={inputCls} value={x.ratio} onChange={(e) => patch(x.id, { ratio: e.target.value as ListingInsert["ratio"] })}>
                            {LISTING_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className={lbl}>สัดส่วนบนมือถือ (เต็มแถว)</label>
                        <select className={inputCls} value={x.ratioMobile} onChange={(e) => patch(x.id, { ratioMobile: e.target.value as ListingInsert["ratioMobile"] })}>
                          {LISTING_RATIOS_MOBILE.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={lbl}>ลิงก์เมื่อกดรูป (ไม่มีลิงก์ = กดไม่ได้)</label>
                    {linkCtx ? (
                      <LinkTargetPicker value={x.link} onChange={(link) => patch(x.id, { link })} ctx={linkCtx} />
                    ) : (
                    <div className="grid gap-1.5 sm:grid-cols-[1fr_auto_auto]">
                      <input className={inputCls} value={x.link} onChange={(e) => patch(x.id, { link: e.target.value })} placeholder="/c/backpack · /product/bbp10 · https://…" />
                      <select className={inputCls} value="" onChange={(e) => e.target.value && patch(x.id, { link: e.target.value })} title="เลือกหมวดแทนการพิมพ์">
                        <option value="">↳ ลิงก์ไปหมวด…</option>
                        {categories.map((c) => <option key={c.key} value={categoryHref(c.key)}>{c.label}</option>)}
                      </select>
                      <select className={inputCls} value="" onChange={(e) => e.target.value && patch(x.id, { link: e.target.value })} title="เลือกสินค้าแทนการพิมพ์">
                        <option value="">↳ ลิงก์ไปสินค้า…</option>
                        {products.map((p) => <option key={p.code} value={`/product/${p.code.toLowerCase()}`}>{p.code} {p.name.slice(0, 30)}</option>)}
                      </select>
                    </div>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className={lbl}>หัวข้อทับรูป (ไม่บังคับ)</label>
                      <input className={inputCls} value={x.title} maxLength={120} onChange={(e) => patch(x.id, { title: e.target.value })} placeholder="เช่น NEW ARRIVAL" />
                    </div>
                    <div>
                      <label className={lbl}>ข้อความรอง (ไม่บังคับ)</label>
                      <input className={inputCls} value={x.text} maxLength={300} onChange={(e) => patch(x.id, { text: e.target.value })} placeholder="เช่น คอลเลกชันใหม่ ช้อปเลย →" />
                    </div>
                    {(x.title || x.text) && (
                      <>
                        <div>
                          <label className={lbl}>ตำแหน่งข้อความ</label>
                          <select className={inputCls} value={x.textPos} onChange={(e) => patch(x.id, { textPos: e.target.value as ListingInsert["textPos"] })}>
                            {LISTING_TEXT_POS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={lbl}>สีข้อความ</label>
                          <select className={inputCls} value={x.textColor} onChange={(e) => patch(x.id, { textColor: e.target.value as ListingInsert["textColor"] })}>
                            <option value="light">ขาว (บนรูปเข้ม)</option>
                            <option value="dark">ดำ (บนรูปสว่าง)</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {list.length < MAX_LISTING_INSERTS ? (
        <button
          type="button"
          onClick={() => {
            const nx = newListingInsert(list.length ? Math.max(...list.map((x) => x.after)) + 6 : 4);
            set([...list, nx]);
            setOpenId(nx.id);
          }}
          className="w-full rounded-lg border border-dashed border-blue-300 text-blue-700 text-xs py-2 hover:bg-blue-50"
        >
          ＋ เพิ่มรูปแทรก <span className="text-blue-400">({list.length}/{MAX_LISTING_INSERTS})</span>
        </button>
      ) : (
        <p className="text-[11px] text-slate-400">เพิ่มได้สูงสุด {MAX_LISTING_INSERTS} รูป</p>
      )}

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => {
          if (del) set(list.filter((x) => x.id !== del.id));
          setDel(null);
        }}
        title="ลบรูปแทรกนี้?"
        message={`ลบ "${del?.title || "รูปแทรก"}" ออกจากหน้ารายการสินค้า — ยังไม่หายจากเว็บจริงจนกว่าจะกดเผยแพร่ (ย้อนได้ด้วยปุ่มเลิกทำ)`}
        confirmText="ลบรูป"
        variant="danger"
      />
    </div>
  );
}
