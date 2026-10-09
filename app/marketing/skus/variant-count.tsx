"use client";

/**
 * "SKU ที่เหลือ" ของรุ่น = จำนวนสี/แบบ (SKU ย่อย) ที่ยังเปิดขาย / ทั้งหมด
 *   กดแล้วเด้งรายการสีทั้งหมด (เปิดขาย ✓ / ปิดแล้ว) — ใช้ทั้งในตารางและการ์ด
 *   สี: ครบทุกแบบ = เทา · เหลือบางแบบ = เหลือง · ไม่เหลือเลย = แดง
 */
import { Popover } from "@/components/popover";
import { HoverImage } from "@/components/hover-image";
import { r2ImageUrl } from "@/lib/r2-image";
import { variantSummary, type MarketingSkuVariant } from "@/lib/marketing/sku-list";

export function VariantCount({ variants, compact = false }: { variants: MarketingSkuVariant[]; compact?: boolean }) {
  const { active, total } = variantSummary(variants);
  if (total === 0) return <span className="text-xs text-slate-400" title="รุ่นนี้ยังไม่มี SKU ย่อย">ไม่มี SKU ย่อย</span>;

  const tone = active === 0 ? "border-red-200 bg-red-50 text-red-700"
    : active < total ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-slate-200 bg-white text-slate-700";
  const text = active === 0 ? "ปิดหมดแล้ว" : `${active}/${total} แบบ`;

  return (
    <Popover align="left" panelClassName="w-72 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
      trigger={(toggle, open) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); toggle(); }} aria-expanded={open}
          title="กดดูรายการสี/แบบ"
          className={`inline-flex items-center gap-1 rounded-full border font-medium ${compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"} ${tone} hover:brightness-95`}>
          🎨 {text}
          <span className="opacity-50">▾</span>
        </button>
      )}>
      {() => (
        <div>
          <div className="mb-1.5 flex items-center justify-between px-1 text-xs">
            <span className="font-semibold text-slate-700">สี/แบบของรุ่นนี้</span>
            <span className="text-slate-400">เปิดขาย {active} จาก {total}</span>
          </div>
          <div className="space-y-0.5">
            {variants.map((v) => (
              <div key={v.code} className={`flex items-center gap-2 rounded-lg px-1.5 py-1 ${v.is_active ? "" : "opacity-50"}`}>
                <HoverImage url={r2ImageUrl(v.image_key, 80)} size={28} rounded="rounded-md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-slate-700">{v.color || "-"}</div>
                  <div className="truncate text-[11px] text-slate-400">{v.code}</div>
                </div>
                {v.is_active
                  ? <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">เปิดขาย</span>
                  : <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">ปิดแล้ว</span>}
              </div>
            ))}
          </div>
          <p className="mt-1.5 border-t border-slate-100 px-1 pt-1.5 text-[10px] leading-4 text-slate-400">
            นับจากสถานะ &quot;เปิดใช้งาน&quot; ของ SKU ย่อย (ไม่ใช่จำนวนชิ้นในคลัง) · เปิด/ปิดได้ที่หน้า SKU
          </p>
        </div>
      )}
    </Popover>
  );
}
