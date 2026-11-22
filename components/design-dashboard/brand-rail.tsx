"use client";
// Design Dashboard: แถบแบรนด์ด้านซ้าย (จอคอม) — ปกติพับ เห็นแค่โลโก้ · เอาเมาส์วาง = ขยายลอยทับ (ไม่ดันบอร์ด) · ปุ่มหมุด = เปิดค้าง (จำต่อคน)
// เจ้าของสั่ง 2026-11-22 (แทนแถวการ์ดแบรนด์ด้านบน · ที่ว่างด้านบนเป็นปฏิทินกำหนดส่ง) · มือถือ/แท็บเล็ตยังใช้ BrandBar เดิม
import { useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { BRAND_GROUPS, GROUP_KEY, GROUP_LABEL, MINE_KEY, type BrandGroup, type BrandGroupView, type BrandSummary } from "./dashboard-helpers";

const W_CLOSED = 56;
const W_OPEN = 248;

export function BrandRail({ groups, selectedBrandKey, setSelectedBrandKey, brandMark, setBrandSettingsOpen, onAddJob, favKeys = [], favBrands = [], onToggleFav, pinned, onTogglePin, stickyTop = 0 }: {
  groups: Record<BrandGroup, BrandGroupView>;
  selectedBrandKey: string;
  setSelectedBrandKey: (key: string) => void;
  brandMark: (brand: BrandSummary, cls: string) => ReactNode;
  setBrandSettingsOpen: (open: boolean) => void;
  onAddJob: (anchor: HTMLElement) => void;
  favKeys?: string[];
  favBrands?: BrandSummary[];
  onToggleFav?: (key: string) => void;
  pinned: boolean;
  onTogglePin: () => void;
  /** ระยะจากบนจอที่แถบติด (ใต้หัวหน้าที่ sticky) */
  stickyTop?: number;
}) {
  const t = useT();
  const [hover, setHover] = useState(false);
  const leaveTimer = useRef<number | null>(null);
  const open = pinned || hover;
  const enter = () => { if (leaveTimer.current) window.clearTimeout(leaveTimer.current); setHover(true); };
  const leave = () => { leaveTimer.current = window.setTimeout(() => setHover(false), 180); };   // หน่วงนิด กันหุบตอนเมาส์ลากผ่านขอบ
  const mineActive = favBrands.reduce((n, b) => n + b.active, 0);

  const row = (key: string, on: boolean, mark: ReactNode, label: string, sub: ReactNode, opts: { onClick: () => void; tone?: string; star?: { key: string; name: string } }) => {
    const fav = opts.star ? favKeys.includes(opts.star.key) : false;
    return (
      <div key={key} className="group/row relative">
        <button type="button" onClick={opts.onClick} title={open ? undefined : label} aria-pressed={on}
          className={`flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition ${on ? opts.tone ?? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
          {mark}
          <span className={`min-w-0 flex-1 ${open ? "" : "sr-only"}`}>
            <span className="block truncate text-[13px] font-medium leading-tight">{label}</span>
            <span className={`block truncate text-[11px] leading-tight ${on ? "opacity-75" : "text-slate-400"}`}>{sub}</span>
          </span>
        </button>
        {open && opts.star && onToggleFav && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onToggleFav(opts.star!.key); }} aria-pressed={fav}
            title={fav ? t(`เอา ${opts.star.name} ออกจากแบรนด์ของฉัน`, `Remove ${opts.star.name} from my brands`) : t(`ติดดาว ${opts.star.name}`, `Star ${opts.star.name}`)}
            className={`absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-sm ${fav ? "text-amber-500" : "text-slate-300 opacity-0 hover:text-amber-400 group-hover/row:opacity-100"}`}>
            {fav ? "★" : "☆"}
          </button>
        )}
        {!open && fav && <span className="absolute right-0.5 top-0.5 text-[9px] text-amber-500">★</span>}
      </div>
    );
  };
  const square = (txt: ReactNode, cls: string) => <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm ${cls}`}>{txt}</span>;

  return (
    <div className="relative shrink-0 self-stretch transition-[width] duration-200" style={{ width: pinned ? W_OPEN : W_CLOSED }}>
      <aside data-gg-sidebar onMouseEnter={enter} onMouseLeave={leave} onFocus={enter} onBlur={leave}
        aria-label={t("แบรนด์", "Brands")}
        className={`sticky z-[14] flex flex-col overflow-hidden rounded-xl border bg-white/95 backdrop-blur transition-[width,box-shadow] duration-200 ${open && !pinned ? "border-slate-200 shadow-xl" : "border-slate-200/80 shadow-sm"}`}
        style={{ top: stickyTop + 8, width: open ? W_OPEN : W_CLOSED, maxHeight: `calc(100vh - ${stickyTop + 24}px)` }}>
        <div className="flex items-center gap-1 border-b border-slate-100 p-1.5">
          <button type="button" onClick={(e) => onAddJob(e.currentTarget)} title={t("เพิ่มงาน", "Add job")}
            className={`flex h-8 items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 text-sm text-slate-500 hover:border-blue-300 hover:text-blue-600 ${open ? "flex-1 px-2" : "w-full"}`}>
            ＋{open && <span className="text-xs font-medium">{t("เพิ่มงาน", "Add job")}</span>}
          </button>
          {open && (
            <>
              <button type="button" onClick={() => setBrandSettingsOpen(true)} title={t("ตั้งค่าแบรนด์ (เรียงลำดับ / ซ่อน-โชว์)", "Brand settings (order / show-hide)")}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><Icon value="i:settings" /></button>
              <button type="button" onClick={onTogglePin} aria-pressed={pinned}
                title={pinned ? t("เลิกปักหมุด (กลับเป็นแถบพับ)", "Unpin (collapse again)") : t("ปักหมุด — เปิดแถบแบรนด์ค้างไว้ (จำค่าของคุณ)", "Pin — keep the brand bar open (remembered for you)")}
                className={`flex h-8 w-8 items-center justify-center rounded-md ${pinned ? "bg-amber-100 text-amber-700" : "text-slate-500 hover:bg-slate-100"}`}><Icon value="i:pin" /></button>
            </>
          )}
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden p-1.5 scrollbar-hide">
          {onToggleFav && favBrands.length > 0 && row(MINE_KEY, selectedBrandKey === MINE_KEY, square("★", selectedBrandKey === MINE_KEY ? "bg-white/25 text-white" : "bg-amber-100 text-amber-600"),
            t("แบรนด์ของฉัน", "My brands"), `${mineActive} ${t("งานเดินอยู่", "active")} · ${favBrands.map((b) => b.name).join(" + ")}`,
            { onClick: () => setSelectedBrandKey(MINE_KEY), tone: "bg-amber-500 text-white" })}
          {BRAND_GROUPS.map((group) => {
            const g = groups[group];
            const brands = [...g.top, ...g.others];
            return (
              <div key={group} className="pt-1">
                {open ? <div className="px-1.5 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{GROUP_LABEL[group].title}</div> : <div className="mx-2 my-1 border-t border-slate-100" />}
                {row(GROUP_KEY[group], selectedBrandKey === GROUP_KEY[group], square(GROUP_LABEL[group].icon, group === "own" ? "bg-teal-50" : "bg-violet-50"),
                  GROUP_LABEL[group].all, `${g.active} ${t("งานเดินอยู่", "active")}`, { onClick: () => setSelectedBrandKey(GROUP_KEY[group]) })}
                {brands.map((brand) => row(brand.key, selectedBrandKey === brand.key, brandMark(brand, "h-8 w-8"), brand.name,
                  <>{brand.active} {t("เดิน", "active")}{brand.urgent > 0 ? <> · <span className="text-rose-500">{brand.urgent} {t("ใกล้ครบ", "due soon")}</span></> : null}</>,
                  { onClick: () => setSelectedBrandKey(brand.key), tone: "bg-slate-100 text-slate-900 ring-2 ring-inset ring-slate-900", star: { key: brand.key, name: brand.name } }))}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
