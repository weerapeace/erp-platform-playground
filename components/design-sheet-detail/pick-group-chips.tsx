"use client";
// ปุ่มกรองตามชนิดวัสดุ ในป๊อปดึงข้อมูลเข้าตีราคา (คัดลอกจากแท็บ / ใบงานอื่น / BOM) — เจ้าของขอ 2026-11-17
//   กดชนิด = ดูเฉพาะชนิดนั้น (ช่อง "เลือกทั้งหมด" จะติ๊ก/เอาออกเฉพาะที่เห็น = ติ๊กทั้งชนิด) · ตัวเลข = ติ๊กแล้ว/ทั้งหมด ของชนิดนั้น
//   สูตร lib/cost-line-pick (groupsOf / groupLabel)
import { useT } from "@/components/i18n";

export const ALL_GROUPS = "__all";

export function PickGroupChips({ groups, value, onChange, pickedOf }: {
  groups: { label: string; count: number }[];
  value: string;
  onChange: (g: string) => void;
  /** จำนวนที่ติ๊กแล้วของชนิดนี้ (ไม่ส่ง = ไม่โชว์) */
  pickedOf?: (g: string) => number;
}) {
  const t = useT();
  if (groups.length < 2) return null;   // มีชนิดเดียว ไม่ต้องกรอง
  const total = groups.reduce((s, g) => s + g.count, 0);
  const chip = (key: string, label: string, n: number) => {
    const on = value === key;
    const p = pickedOf ? (key === ALL_GROUPS ? groups.reduce((s, g) => s + pickedOf(g.label), 0) : pickedOf(key)) : null;
    return (
      <button key={key} type="button" aria-pressed={on} onClick={() => onChange(key)}
        className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs ${on ? "border-blue-500 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
        {label}<span className={`text-[10px] tabular-nums ${on ? "text-blue-600" : "text-slate-400"}`}>{p != null ? `${p}/${n}` : n}</span>
      </button>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("กรองตามชนิด", "Filter by type")}>
      {chip(ALL_GROUPS, t("ทั้งหมด", "All"), total)}
      {groups.map((g) => chip(g.label, g.label, g.count))}
    </div>
  );
}
