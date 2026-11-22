"use client";

// การ์ดแบรนด์ + วงกลมแพลตฟอร์ม (ศูนย์ออเดอร์ · เจ้าของเลือก widget 2026-11-22 แทนช่องเลือก "ทุกร้าน/ทุกแบรนด์")
//   กดการ์ด = ดูเฉพาะแบรนด์นั้น (กดซ้ำ = ทุกแบรนด์) · กดวงกลม = ปิด/เปิดแพลตฟอร์มนั้น
//   Shift+กดวงกลม = โชว์วงนั้นวงเดียว · Shift+กดซ้ำ = กลับมาโชว์ทุกวง (กติกา lib/platform-order-status toggleOffCircle · มีเทสต์)
//   ตัวเลข = งานต้องจัดส่ง · ✉ = มียอดจากเมล (ร้านที่ยังไม่มี API) · วงที่ปิดจางลง

import { PlatformIcon } from "@/components/platform-icon";
import { Icon } from "@/components/icon";
import { offKey, toggleOffCircle, type PlatformBrandCard } from "@/lib/platform-order-status";

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
const PHONE_LABEL = "สร้างเอง / โทร";

export function BrandCards({ cards, platforms, brandId, onBrand, off, onOff }: {
  cards: PlatformBrandCard[];
  platforms: Map<string, Platform>;
  brandId: string;
  onBrand: (id: string) => void;
  off: string[];
  onOff: (next: string[]) => void;
}) {
  if (!cards.length) return null;
  // การ์ด "ทุกแบรนด์" = รวมทุกแบรนด์ต่อแพลตฟอร์ม (วงกลมในการ์ดนี้ปิด/เปิดแพลตฟอร์มทั้งร้าน)
  const allMap = new Map<string, { platform_id: string | null; code: string; todo: number; email: number }>();
  for (const c of cards) for (const p of c.platforms) {
    const k = p.platform_id ?? "phone";
    const cur = allMap.get(k) ?? { platform_id: p.platform_id, code: p.code, todo: 0, email: 0 };
    cur.todo += p.todo; cur.email += p.email; allMap.set(k, cur);
  }
  const allCard: PlatformBrandCard = { brand_id: null, name: "ทุกแบรนด์", todo: cards.reduce((a, c) => a + c.todo, 0), platforms: [...allMap.values()] };
  const offSet = new Set(off);
  const anyOff = off.length > 0;

  const renderCard = (c: PlatformBrandCard, isAll: boolean) => {
    const bKey = isAll ? null : c.brand_id;
    const selected = isAll ? !brandId : brandId === c.brand_id;
    const visibleTodo = c.platforms.reduce((a, p) => a + (offSet.has(offKey(bKey, p.platform_id)) || offSet.has(offKey(null, p.platform_id)) ? 0 : p.todo), 0);
    const ids = c.platforms.map((p) => p.platform_id);
    return (
      <div key={isAll ? "all" : c.brand_id ?? "none"} role="button" tabIndex={0}
        onClick={() => onBrand(isAll ? "" : selected ? "" : c.brand_id ?? "")}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onBrand(isAll ? "" : selected ? "" : c.brand_id ?? ""); } }}
        className={`min-w-0 cursor-pointer rounded-xl border bg-white p-3 text-left transition hover:border-slate-300 ${selected ? "border-sky-500 ring-1 ring-sky-500" : "border-slate-200"}`}>
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{c.name}</div>
            <div className="text-[11px] text-slate-400">ต้องจัดส่ง</div>
          </div>
          <div className="text-xl font-semibold tabular-nums text-slate-900">{visibleTodo.toLocaleString("th-TH")}</div>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-3">
          {c.platforms.map((p) => {
            const k = offKey(bKey, p.platform_id);
            const isOff = offSet.has(k) || (!isAll && offSet.has(offKey(null, p.platform_id)));
            const pl = p.platform_id ? platforms.get(p.platform_id) : null;
            const name = p.code === "phone" ? PHONE_LABEL : pl?.name_th ?? p.code;
            return (
              <button key={k} type="button"
                title={`${name} · ต้องจัดส่ง ${p.todo}${p.email ? ` · ยอดจากเมล ${p.email}` : ""}\nกด = ปิด/เปิด · Shift+กด = โชว์วงนี้วงเดียว (กดซ้ำ = โชว์ทั้งหมด)`}
                aria-pressed={!isOff} aria-label={`${name} ${isOff ? "ปิดอยู่" : "เปิดอยู่"}`}
                onClick={(e) => { e.stopPropagation(); onOff(toggleOffCircle(off, bKey, ids, p.platform_id, e.shiftKey)); }}
                className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white transition ${isOff ? "opacity-30 grayscale" : "hover:border-slate-400"}`}>
                {p.code === "phone" ? <Icon value="i:phone" className="text-slate-500" /> : <PlatformIcon code={p.code} iconKey={pl?.icon_key ?? null} size={20} />}
                {p.todo > 0 && <span className="absolute -right-2 -top-1.5 min-w-[18px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-medium leading-4 text-white">{p.todo > 999 ? "999+" : p.todo}</span>}
                {p.email > 0 && <span className="absolute -bottom-1.5 -right-2 rounded border border-slate-200 bg-white px-0.5 text-[9px] leading-3 text-slate-500" title={`ยอดจากเมล ${p.email}`}><Icon value="i:mail" /></span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="mb-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {renderCard(allCard, true)}
        {cards.map((c) => renderCard(c, false))}
      </div>
      {anyOff && (
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
          <span>ปิดวงกลมไว้ {off.length} วง</span>
          <button type="button" onClick={() => onOff([])} className="rounded px-1.5 text-sky-700 hover:bg-sky-50">เปิดทั้งหมด</button>
        </div>
      )}
    </div>
  );
}
