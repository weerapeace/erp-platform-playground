"use client";
/**
 * การ์ดสินค้าบนร้าน — ใบเดียวใช้ทั้งแท็บจับคู่และมุมมองหน้าร้าน (/master/platform-catalog)
 *
 * รูปเต็มใบ · ป้ายสถานะร้าน (ขายอยู่/ใกล้หมด/หมด/ปิดขาย/ไม่อยู่บนร้านแล้ว + สต๊อก) · ป้าย "ซ้ำ ×N" · ป้ายส่วนลด %
 * ชื่อ 2 บรรทัด · รหัส + เลขบนร้าน · ราคาที่จ่ายจริง (ราคาเต็มขีดฆ่า) · จำนวนตัวเลือก
 * ส่วนท้าย (footer) หน้าใส่เอง — แท็บจับคู่: สถานะจับคู่ + ยืนยัน · หน้าร้าน: สินค้าในระบบ + สร้างงาน
 *
 * ใช้คู่ MiniTable layout="cards" + cardPick (การ์ดชิดขอบ · ช่องติ๊กลอยมุมซ้ายบน → ป้ายสถานะจึงอยู่มุมล่าง)
 * กดปุ่มในส่วนท้าย = ไม่เปิดป๊อปรายละเอียด (กันกดพลาด)
 */
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { SHOP_STATE_LABEL, discountPct, type ShopState } from "@/lib/platform-listing-health";

/** สีป้ายสถานะร้าน (ตาราง + การ์ด + กล่องตัวซ้ำ ใช้ชุดเดียวกัน) */
export const SHOP_STATE_CLS: Record<ShopState, string> = {
  selling: "bg-emerald-50 text-emerald-700 border-emerald-200",
  low: "bg-amber-50 text-amber-700 border-amber-200",
  out: "bg-rose-50 text-rose-700 border-rose-200",
  hidden: "bg-slate-100 text-slate-600 border-slate-200",
  review: "bg-sky-50 text-sky-700 border-sky-200",
  nodata: "bg-white text-slate-400 border-slate-200",
  gone: "bg-slate-100 text-slate-500 border-dashed border-slate-300",
};

/** ป้ายสถานะร้าน (+ สต๊อกเมื่อยังขายได้) */
export function ShopStateBadge({ state, stock, className = "" }: { state: ShopState; stock?: number | null; className?: string }) {
  const showStock = stock != null && (state === "selling" || state === "low");
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${SHOP_STATE_CLS[state]} ${className}`}>
      {SHOP_STATE_LABEL[state]}{showStock ? ` · ${stock.toLocaleString()}` : ""}
    </span>
  );
}

export type ListingCardData = {
  image: string | null;
  title: string | null;
  sku: string | null;
  externalId: string | null;
  state: ShopState | null;
  stock: number | null;
  price: number | null;
  salePrice: number | null;
  variants?: number | null;
  dupCount?: number;
};

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

export function ListingCard({ data: d, footer, badges }: { data: ListingCardData; footer?: ReactNode; badges?: ReactNode }) {
  const disc = discountPct(d);
  const pay = d.salePrice ?? d.price;
  return (
    // content-visibility: การ์ดนอกจอไม่ต้องวาด (ร้านใหญ่ ~1,000 ใบ ยังเลื่อนลื่น)
    <div className="flex h-full flex-col" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 330px" }}>
      <div className="relative aspect-square bg-slate-50">
        {d.image
          // ไม่อยู่บนร้านแล้ว = รูปจางขาวดำ (ยังโชว์ไว้ให้จำได้ว่าตัวไหน)
          ? <img src={d.image} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover ${d.state === "gone" ? "opacity-50 grayscale" : ""}`} />
          : <div className="flex h-full flex-col items-center justify-center gap-1 text-xs text-slate-300"><Icon name="image" className="text-2xl" />ไม่มีรูป</div>}
        {d.state && d.state !== "nodata" && <ShopStateBadge state={d.state} stock={d.stock} className="absolute bottom-1.5 left-1.5" />}
        {!!d.dupCount && d.dupCount > 1 && (
          <span className="absolute right-1.5 top-1.5 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700"
            title={`บนร้านมีสินค้าชื่อและรหัสเหมือนกัน ${d.dupCount} ชิ้น`}>ซ้ำ ×{d.dupCount}</span>
        )}
        {disc > 0 && <span className="absolute bottom-1.5 right-1.5 rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-medium text-white">-{disc}%</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <div className="line-clamp-2 min-h-[2.5rem] text-[13px] leading-snug text-slate-800" title={d.title ?? ""}>{d.title || "—"}</div>
        <div className="truncate font-mono text-[11px] text-slate-400">{d.sku || "ไม่มี SKU"} · #{d.externalId || "—"}</div>
        <div className="mt-auto flex items-baseline gap-1.5">
          {pay != null ? <span className={`text-sm font-semibold ${d.salePrice != null ? "text-rose-600" : "text-slate-800"}`}>{baht(pay)}</span> : <span className="text-sm text-slate-300">—</span>}
          {d.salePrice != null && d.price != null && <span className="text-[11px] text-slate-400 line-through">{baht(d.price)}</span>}
          {!!d.variants && d.variants > 1 && <span className="ml-auto whitespace-nowrap text-[11px] text-slate-400">{d.variants.toLocaleString()} ตัวเลือก</span>}
        </div>
        {badges}
      </div>
      {footer && <div className="border-t border-slate-100 px-2.5 py-2" onClick={(e) => e.stopPropagation()}>{footer}</div>}
    </div>
  );
}
