"use client";

/**
 * ค่าตั้งแผ่นงาน — ย้ายมาจากหน้าเว็บตัวช่วย · แม่แบบขนาดแผ่น = "ประเภทงานพิมพ์" กลาง (erp_print_types: DTF/UV …)
 * ค่าเก็บเป็น mm เสมอ · ช่องกรอกแสดงตามหน่วยที่เลือก (mm/cm)
 */
import { useT } from "@/components/i18n";
import { toMm, type PrintType } from "./data";
import { toUnit, unitScale, type Settings } from "./nest-utils";
import { NumInput } from "./num-input";

type Rot = "none" | "flip" | "four" | "step";

export function rotModeOf(s: Settings): Rot {
  if (s.rotate_step) return "step";
  const r = [...(s.rotate ?? [])].map(Number).sort((a, b) => a - b).join(",");
  return r === "0" ? "none" : r === "0,180" ? "flip" : "four";
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`flex-1 px-2 py-1.5 ${value === v ? "bg-violet-100 font-semibold text-violet-700" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs text-slate-500">{label}</span>{children}</label>;
}

const inputCls = "h-8 w-full rounded-lg border border-slate-300 px-2 text-sm";

export function SettingsPanel({ settings, onChange, printTypes, printTypeId, onPrintType }: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  printTypes: PrintType[];
  printTypeId: string | null;
  onPrintType: (pt: PrintType | null) => void;
}) {
  const t = useT();
  const s = settings;
  const u = s.unit;
  const len = (mm: number | null | undefined) => toUnit(mm, u);
  const fromLen = (v: number | null) => (v == null ? null : v * unitScale(u));
  const roll = s.sheet_height_mm == null;
  const rot = rotModeOf(s);

  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1 block text-xs text-slate-500">{t("ประเภทแผ่น (จากประเภทงานพิมพ์)", "Sheet type (from print types)")}</span>
        <div className="flex flex-wrap gap-1.5">
          {printTypes.map((pt) => (
            <button key={pt.id} type="button" onClick={() => onPrintType(pt)}
              className={`rounded-lg border px-2.5 py-1 text-xs ${printTypeId === pt.id ? "border-violet-400 bg-violet-50 font-semibold text-violet-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
              {pt.code} {pt.default_w ? `${pt.default_w}×${pt.default_h ?? "∞"} ${pt.unit}` : ""}
            </button>
          ))}
          <button type="button" onClick={() => onPrintType(null)}
            className={`rounded-lg border px-2.5 py-1 text-xs ${!printTypeId ? "border-violet-400 bg-violet-50 font-semibold text-violet-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
            {t("กำหนดเอง", "Custom")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label={t(`กว้าง (${u})`, `Width (${u})`)}>
          <NumInput className={inputCls} value={len(s.sheet_width_mm)} onChange={(v) => onChange({ sheet_width_mm: fromLen(v) ?? 0 })} />
        </Field>
        <div>
          <span className="mb-1 block text-xs text-slate-500">{t("ความยาว", "Length")}</span>
          <Seg value={roll ? "roll" : "fixed"} options={[["roll", t("ม้วน", "Roll")], ["fixed", t("กำหนด", "Fixed")]]}
            onChange={(v) => onChange({ sheet_height_mm: v === "roll" ? null : (s.fill_length_mm || 1000) })} />
        </div>
        {!roll && (
          <Field label={t(`ยาวแผ่น (${u})`, `Sheet length (${u})`)}>
            <NumInput className={inputCls} value={len(s.sheet_height_mm)} onChange={(v) => onChange({ sheet_height_mm: fromLen(v) ?? 0 })} />
          </Field>
        )}
        <Field label={t(`ระยะห่างระหว่างชิ้น (${u})`, `Spacing (${u})`)}>
          <NumInput className={inputCls} value={len(s.spacing_mm)} onChange={(v) => onChange({ spacing_mm: fromLen(v) ?? 0 })} />
        </Field>
        <Field label={t(`ขอบแผ่น (${u})`, `Margin (${u})`)}>
          <NumInput className={inputCls} value={len(s.margin_mm)} onChange={(v) => onChange({ margin_mm: fromLen(v) ?? 0 })} />
        </Field>
      </div>

      <div>
        <span className="mb-1 block text-xs text-slate-500">{t("จำนวนชิ้น", "Quantity")}</span>
        <Seg value={s.fill ? "fill" : "qty"} options={[["qty", t("ตามจำนวนที่ใส่", "Exact count")], ["fill", t("ตามจำนวน + เติมที่ว่าง (%)", "Exact + fill gaps (%)")]]}
          onChange={(v) => onChange({ fill: v === "fill" })} />
        {s.fill && (
          <div className="mt-1 text-[11px] text-slate-500">
            {t("ทุกแผ่นได้ตามจำนวนที่ใส่ก่อน แล้วเติมที่ว่างด้วยลายตาม % ที่ใส่ในการ์ดลาย (รวม 100%) · หัวงานบอกจำนวนที่เติมเป็น (+N)",
              "Every sheet gets the exact quantities first, then the gaps are filled by the % set on each artwork card (total 100%) · the header shows extras as (+N)")}
          </div>
        )}
        {s.fill && roll && (
          <div className="mt-2 space-y-2">
            <Seg value={s.fill_roll} options={[["used", t("เติมช่องว่าง ไม่ยืดม้วน", "Fill gaps, keep length")], ["length", t("เติมถึงความยาว", "Fill up to a length")]]}
              onChange={(v) => onChange({ fill_roll: v })} />
            {s.fill_roll === "length" && (
              <Field label={t(`แผ่นม้วน: เติมถึงความยาว (${u})`, `Roll: fill up to (${u})`)}>
                <NumInput className={inputCls} value={len(s.fill_length_mm)} onChange={(v) => onChange({ fill_length_mm: fromLen(v) ?? 0 })} />
              </Field>
            )}
          </div>
        )}
      </div>

      <div>
        <span className="mb-1 block text-xs text-slate-500">{t("รูปแบบการจัด", "Layout")}</span>
        <Seg value={s.layout} options={[["nest", t("แทรกให้ประหยัด", "Tight nesting")], ["rows", t("เรียงเป็นแถว", "Rows")]]}
          onChange={(v) => onChange({ layout: v })} />
        {s.layout === "rows" && (
          <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={s.rows_new_row} onChange={(e) => onChange({ rows_new_row: e.target.checked })} />
            {t("แต่ละไฟล์เริ่มแถวใหม่", "Start each file on a new row")}
          </label>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={s.header} onChange={(e) => onChange({ header: e.target.checked })} />
        {t("พิมพ์หัวงานบนแผ่น (ชื่องาน + จำนวนแต่ละรูป)", "Print a header on the sheet (job name + count per image)")}
      </label>

      <div>
        <span className="mb-1 block text-xs text-slate-500">{t("การหมุน", "Rotation")}</span>
        <Seg value={rot} options={[["none", t("ห้ามหมุน", "None")], ["flip", t("กลับหัวได้", "Flip 180°")], ["four", t("4 ทิศ", "4 ways")], ["step", t("ทุก N°", "Every N°")]]}
          onChange={(v) => onChange(v === "step" ? { rotate: null, rotate_step: s.rotate_step || 15 }
            : { rotate_step: null, rotate: { none: [0], flip: [0, 180], four: [0, 90, 180, 270] }[v] })} />
        {rot === "step" && (
          <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-600">
            {t("หมุนได้ทุก", "Rotate every")}
            <NumInput className="h-7 w-14 rounded border border-slate-300 px-1" integer value={String(s.rotate_step ?? 15)}
              onChange={(v) => onChange({ rotate_step: v && v > 0 ? v : 15 })} />
            {t("องศา", "degrees")}
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={s.cut_contour} onChange={(e) => onChange({ cut_contour: e.target.checked })} />
          {t("เส้นตัด CutContour", "CutContour cut line")}
        </label>
        {s.cut_contour && (
          <label className="flex items-center gap-1">
            {t("ห่างจากภาพ", "Offset")}
            <NumInput className="h-7 w-14 rounded border border-slate-300 px-1" value={len(s.cut_offset_mm)} onChange={(v) => onChange({ cut_offset_mm: fromLen(v) ?? 0 })} />
            {u}
          </label>
        )}
      </div>

      <details className="rounded-lg border border-slate-200 px-3 py-2">
        <summary className="cursor-pointer text-xs text-slate-600">{t("ตั้งค่าเพิ่มเติม", "More settings")}</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label={t("คิดนานสุด (วินาที)", "Max thinking time (s)")}>
            <NumInput className={inputCls} integer value={String(s.time_limit_s)} onChange={(v) => onChange({ time_limit_s: Math.max(0, v ?? 0) })} />
          </Field>
          <Field label={t("เส้นบางสุดที่พิมพ์ติด (mm)", "Thinnest printable line (mm)")}>
            <NumInput className={inputCls} value={String(s.min_line_mm)} onChange={(v) => onChange({ min_line_mm: v ?? 0.1 })} />
          </Field>
          <Field label={t("DPI ขั้นต่ำ (เตือน)", "Minimum DPI (warning)")}>
            <NumInput className={inputCls} integer value={String(s.min_dpi)} onChange={(v) => onChange({ min_dpi: v ?? 150 })} />
          </Field>
          <Field label={t("DPI เมื่อไฟล์ไม่บอก", "DPI if the file has none")}>
            <NumInput className={inputCls} integer value={String(s.default_dpi)} onChange={(v) => onChange({ default_dpi: v ?? 300 })} />
          </Field>
          <Field label={t("Alpha threshold (0–254)", "Alpha threshold (0–254)")}>
            <NumInput className={inputCls} integer value={String(s.alpha_threshold)} onChange={(v) => onChange({ alpha_threshold: Math.min(254, Math.max(0, v ?? 10)) })} />
          </Field>
          <Field label={t("ลดภาพที่ละเอียดเกิน (dpi)", "Downsample above (dpi)")}>
            <NumInput className={inputCls} integer value={String(s.resample_to_dpi ?? 0)} onChange={(v) => onChange({ resample_to_dpi: v ?? 0 })} />
          </Field>
        </div>
      </details>
    </div>
  );
}

/** ตั้งขนาดแผ่นตามประเภทงานพิมพ์ (ไม่มีความยาว = ม้วน) */
export function sheetFromPrintType(pt: PrintType): Partial<Settings> {
  return {
    sheet_width_mm: pt.default_w ? toMm(Number(pt.default_w), pt.unit) : undefined,
    sheet_height_mm: pt.default_h ? toMm(Number(pt.default_h), pt.unit) : null,
  };
}
