"use client";

/**
 * 📐 SizeGridEditor — ตาราง สี × ไซส์ ของ 1 รุ่น บนเว็บร้าน 1 ร้าน (ของกลาง)
 * ใช้ใน: ตัวตั้งค่าเว็บของสินค้า (components/parent-web-listings · แท็บ 🛒 ขายบนเว็บ)
 *
 * ช่องในตาราง = SKU ไซส์ใน ERP (attribute_values.variant_option · สร้างจากปุ่ม "＋ เพิ่มแบบ/ไซส์" ในตาราง SKU ลูก)
 *   ✓ = ขายบนเว็บ · ✕ = ปิดไว้ (ลูกค้าเห็นไซส์นั้นขีดฆ่า กดไม่ได้) · — = ไม่มี SKU คู่นี้ใน ERP
 * กดหัวแถว (สี) / หัวคอลัมน์ (ไซส์) = เปิด/ปิดทั้งแถว/คอลัมน์ · ปิดครบทุกไซส์ของสี = สีนั้นไม่ขึ้นเว็บ
 * เก็บเป็น off = id SKU ไซส์ที่ปิด (store_listings.web_variant_off · lib/website-size-options) — ไม่แตะข้อมูล SKU
 */
import type { SizeGrid, SizeGridColor } from "@/lib/website-size-options";
import { useT } from "@/components/i18n";

export type SizeGridView = Omit<SizeGrid, "colors"> & { colors: (SizeGridColor & { swatch?: string | null })[] };

export function SizeGridEditor({
  grid,
  off,
  onChange,
  enabled,
}: {
  grid: SizeGridView;
  /** id SKU ไซส์ที่ปิดไว้ (ตัวพิมพ์เล็ก) */
  off: string[];
  onChange: (next: string[]) => void;
  /** ร้านนี้เปิดใช้ตัวเลือกชุดที่ 2 อยู่ (แท็บ ⚙️ จับคู่ฟิลด์) — ปิดอยู่ = เว็บยังไม่โชว์ไซส์ */
  enabled: boolean;
}) {
  const t = useT();
  const offSet = new Set(off.map((x) => x.toLowerCase()));
  const isOff = (id: string) => offSet.has(id.toLowerCase());
  const name = grid.name || t("ไซส์", "Size");
  const allCells = grid.colors.flatMap((c) => Object.values(c.cells));
  const openCount = allCells.filter((c) => !isOff(c.skuId)).length;

  const setMany = (ids: string[], turnOff: boolean) => {
    const next = new Set(offSet);
    for (const id of ids) {
      if (turnOff) next.add(id.toLowerCase());
      else next.delete(id.toLowerCase());
    }
    onChange([...next]);
  };
  // กดหัวแถว/คอลัมน์: มีช่องเปิดอยู่สักช่อง = ปิดทั้งหมด · ปิดหมดแล้ว = เปิดทั้งหมด
  const toggleGroup = (ids: string[]) => setMany(ids, ids.some((id) => !isOff(id)));
  const colIds = (size: string) => grid.colors.map((c) => c.cells[size]?.skuId).filter((x): x is string => !!x);
  const rowIds = (c: SizeGridColor) => Object.values(c.cells).map((x) => x.skuId);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-medium text-slate-700">
          {t(`📐 ${name}บนเว็บ — สี × ${name}`, `📐 ${name} on web — color × ${name}`)}{" "}
          <span className="font-normal text-slate-500">
            {t(`· ขายอยู่ ${openCount}/${allCells.length} คู่`, `· selling ${openCount}/${allCells.length} pairs`)}
          </span>
        </span>
        {off.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-[11px] text-blue-600 hover:underline">
            {t("เปิดทุกคู่", "Turn all on")}
          </button>
        )}
      </div>
      {!enabled && (
        <p className="text-[11px] rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1">
          {t(`ร้านนี้ยังไม่เปิด "ตัวเลือกชุดที่ 2" — ลูกค้ายังไม่เห็นปุ่มเลือก${name} · เปิดได้ที่ เว็บไซต์ → ⚙️ จับคู่ฟิลด์ → ตัวเลือกชุดที่ 2`, `This shop hasn't turned on "Option set 2" — customers can't pick a ${name} yet · turn it on in Website → ⚙️ Field mapping → Option set 2`)}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="text-xs border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="text-left font-normal text-slate-400 pr-2">{t("สี", "Color")} \ {name}</th>
              {grid.sizes.map((size) => (
                <th key={size} className="p-0">
                  <button
                    type="button"
                    onClick={() => toggleGroup(colIds(size))}
                    title={t(`เปิด/ปิด ${name} ${size} ทุกสี`, `Turn ${name} ${size} on/off for all colors`)}
                    className="min-w-[2.5rem] rounded-md px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {size}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.colors.map((c) => {
              const ids = rowIds(c);
              const allOff = !c.free && ids.length > 0 && ids.every(isOff);
              return (
                <tr key={c.label}>
                  <td className="pr-2 whitespace-nowrap">
                    <button
                      type="button"
                      disabled={c.free}
                      onClick={() => toggleGroup(ids)}
                      title={c.free ? undefined : t(`เปิด/ปิดทุก${name}ของสี ${c.label}`, `Turn every ${name} of ${c.label} on/off`)}
                      className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-slate-700 enabled:hover:bg-slate-100 disabled:cursor-default"
                    >
                      <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" style={c.swatch ? { background: c.swatch } : { background: "#f1f5f9" }} />
                      <span className={allOff ? "line-through text-slate-400" : ""}>{c.label}</span>
                    </button>
                  </td>
                  {c.free ? (
                    <td colSpan={grid.sizes.length} className="text-[11px] text-slate-400">
                      {t(`ไม่มี SKU ${name} — ขายสีนี้แบบไม่ต้องเลือก${name}`, `No ${name} SKU — this color sells without picking a ${name}`)}
                    </td>
                  ) : (
                    grid.sizes.map((size) => {
                      const cell = c.cells[size];
                      if (!cell)
                        return (
                          <td key={size} className="text-center text-slate-300" title={t(`ไม่มี SKU ${c.label} / ${size} ใน ERP`, `No SKU ${c.label} / ${size} in ERP`)}>
                            —
                          </td>
                        );
                      const o = isOff(cell.skuId);
                      return (
                        <td key={size} className="p-0">
                          <button
                            type="button"
                            onClick={() => setMany([cell.skuId], !o)}
                            title={`${cell.code} · ${o ? t("ปิดอยู่ — ลูกค้าเห็นขีดฆ่า (กดเพื่อเปิด)", "Off — customers see it struck out (click to turn on)") : t("ขายบนเว็บ (กดเพื่อปิด)", "Selling on web (click to turn off)")}`}
                            aria-pressed={!o}
                            className={`w-full min-w-[2.5rem] rounded-md border px-2 py-1 ${o ? "border-slate-200 bg-slate-50 text-slate-400 line-through" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}
                          >
                            {o ? size : "✓"}
                          </button>
                        </td>
                      );
                    })
                  )}
                  {allOff && <td className="text-[11px] text-amber-700 whitespace-nowrap pl-1">{t("สีนี้จะไม่ขึ้นเว็บ", "This color won't show on web")}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        {t(`✓ ขายบนเว็บ · ขีดฆ่า = ปิดไว้ (ลูกค้าเห็นแต่กดไม่ได้) · — = ไม่มี SKU คู่นี้ใน ERP (เพิ่มได้ที่ Parent SKU → SKU ลูก → ＋ เพิ่มแบบ/ไซส์) · กดชื่อสี/${name} = เปิด/ปิดทั้งแถว`, `✓ Selling on web · struck out = off (customers see it but can't pick) · — = no SKU for this pair in ERP (add at Parent SKU → Child SKUs → ＋ Add variant/size) · click a color/${name} = toggle the whole row`)}

      </p>
    </div>
  );
}
