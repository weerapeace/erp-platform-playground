"use client";
/**
 * 📐 หน้าตาหน้ารายการสินค้า (แท็บ "หน้ารายการสินค้า" ในหน้าดีไซน์เว็บ) — ส่วนบนสุดของ ListingPanel
 *   หัวหน้า · สินค้าต่อแถว (เฉพาะหน้านี้) · แบ่งหน้า · การเรียง
 * ค่า/ตัวกรอง: lib/website-listing.ts (theme.listing · มิเรอร์ storefront src/lib/listing.ts) · เว็บร้านวาดใน ShopClient
 * ของกลาง: WheelSelect (ช่องค่ามีลำดับ) · Seg
 */
import { WheelSelect } from "@/components/wheel-select";
import { Seg } from "@/components/website-block-editor";
import {
  LISTING_PAGINGS, LISTING_PAGE_SIZES, LISTING_SORTS, LISTING_SOLD_OUT, listingColumnsFrom,
  type ListingColumns, type ListingConfig, type ListingHeader, type ListingSort,
} from "@/lib/website-listing";

const inputCls = "w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 bg-white";
const lbl = "block text-[11px] text-slate-500 mb-1";
const box = "rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2";

/** กริดจิ๋วโชว์จำนวนช่องต่อแถว */
function MiniGrid({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="grid gap-0.5 w-20" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {Array.from({ length: n * 2 }, (_, i) => (
          <span key={i} className="aspect-[4/5] rounded-[2px] bg-slate-300" />
        ))}
      </div>
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  );
}

export function ListingLayoutSettings({
  value,
  onChange,
  cardColumns,
}: {
  value: ListingConfig;
  onChange: (v: ListingConfig) => void;
  /** ค่า "การ์ดสินค้า" ของทั้งเว็บ (ใช้เมื่อไม่ได้ตั้งเฉพาะหน้านี้) */
  cardColumns: { desktop: number; tablet: number; mobile: number };
}) {
  const set = (p: Partial<ListingConfig>) => onChange({ ...value, ...p });
  const setHeader = (p: Partial<ListingHeader>) => set({ header: { ...value.header, ...p } });
  const cols = value.columns;
  const setCols = (p: Partial<ListingColumns>) => cols && set({ columns: { ...cols, ...p } });
  const side = value.filterLayout === "side";
  const eff = cols ?? listingColumnsFrom(cardColumns);
  const toggleSort = (k: ListingSort, on: boolean) => {
    const next = LISTING_SORTS.map((s) => s.value).filter((v) => (v === k ? on : value.sorts.includes(v)));
    // เรียงเริ่มต้นต้องอยู่ในตัวเลือกที่โชว์ (ถ้าปิดตัวที่เป็นค่าเริ่ม → ย้ายไปตัวแรกที่เหลือ)
    set({ sorts: next, defaultSort: next.includes(value.defaultSort) || !next.length ? value.defaultSort : next[0] });
  };
  const uneven = value.paging !== "all" && value.pageSize % eff.desktop !== 0;
  // ขนาดชุดที่หารลงตัวและใกล้ค่าปัจจุบันที่สุด (จากตัวเลือกที่มี)
  const fit = uneven ? [...LISTING_PAGE_SIZES].filter((n) => n % eff.desktop === 0).sort((a, b) => Math.abs(a - value.pageSize) - Math.abs(b - value.pageSize))[0] : undefined;

  return (
    <div className="space-y-3">
      {/* 🏷 หัวหน้า */}
      <div className={box}>
        <p className="text-xs font-semibold text-slate-800">🏷 หัวหน้า "สินค้าทั้งหมด"</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block">
            <span className={lbl}>คำเล็กด้านบน</span>
            <input className={inputCls} value={value.header.eyebrow} maxLength={60} placeholder="ค่าเดิมของร้าน" onChange={(e) => setHeader({ eyebrow: e.target.value })} />
          </label>
          <label className="block">
            <span className={lbl}>ชื่อหน้า</span>
            <input className={inputCls} value={value.header.title} maxLength={80} placeholder="ค่าเดิม เช่น เลือกซื้อสินค้า" onChange={(e) => setHeader({ title: e.target.value })} />
          </label>
          <label className="block">
            <span className={lbl}>คำอธิบาย</span>
            <input className={inputCls} value={value.header.subtitle} maxLength={240} placeholder="ค่าเดิมของร้าน" onChange={(e) => setHeader({ subtitle: e.target.value })} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={value.header.showSearch} onChange={(e) => setHeader({ showSearch: e.target.checked })} />
            ช่องค้นหาในหน้า
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={value.header.showCount} onChange={(e) => setHeader({ showCount: e.target.checked })} />
            ข้อความ "พบ N รายการ"
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer" title="เลื่อนลงดูสินค้าแล้ว แถบค้นหา · ปุ่มตัวกรอง · การเรียง ยังติดอยู่บนจอ (ใต้หัวเว็บ)">
            <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={value.stickyBar} onChange={(e) => set({ stickyBar: e.target.checked })} />
            📌 แถบค้นหา/ตัวกรอง/เรียง ติดบนจอตอนเลื่อน
          </label>
          <span className="text-[11px] text-slate-400">หน้าหมวดใช้ชื่อ/คำอธิบายของหมวด (ตั้งที่ เว็บไซต์ → หมวดหมู่)</span>
        </div>
      </div>

      {/* 📐 สินค้าต่อแถว */}
      <div className={box}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-slate-800">📐 สินค้าต่อแถว</p>
          <Seg
            value={cols ? "own" : "card"}
            onChange={(v) => set({ columns: v === "own" ? listingColumnsFrom(cardColumns) : null })}
            options={[
              { v: "card", l: `ใช้ค่าการ์ดสินค้าทั้งเว็บ (${cardColumns.desktop}·${cardColumns.tablet}·${cardColumns.mobile})` },
              { v: "own", l: "ตั้งเฉพาะหน้านี้" },
            ]}
          />
        </div>
        {cols ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="block w-24">
              <span className={lbl}>คอม</span>
              <WheelSelect value={cols.desktop} onChange={(e) => setCols({ desktop: Number(e.target.value) })}>
                {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} ชิ้น</option>)}
              </WheelSelect>
            </label>
            {side && (
              <label className="block w-36">
                <span className={lbl}>คอม · ตอนแถบตัวกรองซ้ายกาง</span>
                <WheelSelect value={cols.desktopRail} onChange={(e) => setCols({ desktopRail: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} ชิ้น</option>)}
                </WheelSelect>
              </label>
            )}
            <label className="block w-24">
              <span className={lbl}>แท็บเล็ต</span>
              <WheelSelect value={cols.tablet} onChange={(e) => setCols({ tablet: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} ชิ้น</option>)}
              </WheelSelect>
            </label>
            <label className="block w-24">
              <span className={lbl}>มือถือ</span>
              <WheelSelect value={cols.mobile} onChange={(e) => setCols({ mobile: Number(e.target.value) })}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n} ชิ้น</option>)}
              </WheelSelect>
            </label>
            <div className="flex items-end gap-3 ml-auto">
              <MiniGrid n={cols.desktop} label="คอม" />
              <MiniGrid n={cols.tablet} label="แท็บเล็ต" />
              <MiniGrid n={cols.mobile} label="มือถือ" />
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">ตอนนี้ใช้ค่าเดียวกับทุกกริดในเว็บ (แก้ที่แท็บ "การ์ดสินค้า") · แถบตัวกรองซ้ายกาง = คอมลด 1 ช่องให้เอง</p>
        )}
      </div>

      {/* 📄 แบ่งหน้า */}
      <div className={box}>
        <p className="text-xs font-semibold text-slate-800">📄 แบ่งหน้า</p>
        <div className="grid gap-1.5 sm:grid-cols-4">
          {LISTING_PAGINGS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => set({ paging: o.value })}
              className={`text-left px-2.5 py-1.5 rounded-lg border transition ${value.paging === o.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
            >
              <span className="block text-xs font-medium">{o.label}</span>
              <span className="block text-[10px] text-slate-500 leading-snug">{o.hint}</span>
            </button>
          ))}
        </div>
        {value.paging !== "all" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-700">{value.paging === "pages" ? "สินค้าต่อหน้า" : "โหลดครั้งละ"}</span>
            <span className="w-28">
              <WheelSelect value={value.pageSize} onChange={(e) => set({ pageSize: Number(e.target.value) })}>
                {LISTING_PAGE_SIZES.map((n) => <option key={n} value={n}>{n} ชิ้น</option>)}
              </WheelSelect>
            </span>
            {uneven ? (
              <span className="text-[11px] text-amber-600">⚠ {value.pageSize} ÷ {eff.desktop} ต่อแถว ไม่ลงตัว — แถวสุดท้ายของแต่ละชุดจะไม่เต็ม {fit ? `(ลอง ${fit} ชิ้น)` : ""}</span>
            ) : (
              <span className="text-[11px] text-slate-400">= {value.pageSize / eff.desktop} แถวบนคอม · กลับจากหน้าสินค้า ลูกค้าอยู่ที่เดิม</span>
            )}
          </div>
        )}
      </div>

      {/* ↕ การเรียง */}
      <div className={box}>
        <p className="text-xs font-semibold text-slate-800">↕ การเรียงสินค้า</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-700">เปิดหน้ามาเรียงแบบ</span>
          <span className="w-40">
            <WheelSelect value={value.defaultSort} onChange={(e) => set({ defaultSort: e.target.value as ListingSort, sorts: value.sorts.includes(e.target.value as ListingSort) || !value.sorts.length ? value.sorts : LISTING_SORTS.map((s) => s.value).filter((v) => v === e.target.value || value.sorts.includes(v)) })}>
              {LISTING_SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </WheelSelect>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs text-slate-700">ตัวเลือกที่ลูกค้าเห็น</span>
          {LISTING_SORTS.map((s) => (
            <label key={s.value} className="flex items-center gap-1 text-xs text-slate-700 cursor-pointer" title={s.hint}>
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={value.sorts.includes(s.value)} onChange={(e) => toggleSort(s.value, e.target.checked)} />
              {s.label}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          {value.sorts.length ? "\"ขายดี\" โชว์เมื่อมีข้อมูลยอดขาย" : "ไม่ติ๊กเลย = ซ่อนช่องเรียง ลูกค้าเห็นตามแบบเริ่มต้นอย่างเดียว"} · รูปแทรกโชว์ตอนลูกค้ายังไม่เปลี่ยนการเรียง (และไม่ได้ค้นหา/กรอง)
        </p>
      </div>

      {/* 🚫 สินค้าหมด */}
      <div className={box}>
        <p className="text-xs font-semibold text-slate-800">🚫 สินค้าหมด</p>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {LISTING_SOLD_OUT.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => set({ soldOut: o.value })}
              className={`text-left px-2.5 py-1.5 rounded-lg border transition ${value.soldOut === o.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
            >
              <span className="block text-xs font-medium">{o.label}</span>
              <span className="block text-[10px] text-slate-500 leading-snug">{o.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          ตั้งสินค้าตัวไหนหมด: หน้า "สินค้าบนเว็บ" → ช่อง <b>สถานะสต๊อก</b> = สินค้าหมด (แก้หลายรายการพร้อมกันได้) · บนเว็บขึ้นป้าย "สินค้าหมด" + กดซื้อไม่ได้ทุกจุด + ระบบไม่รับออเดอร์
        </p>
      </div>
    </div>
  );
}
