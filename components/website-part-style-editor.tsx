"use client";

/**
 * 🎨 PartStyleEditor — ตัวปรับหน้าตาละเอียดทีละชิ้น (ของกลาง · ใช้ได้ทุกหน้าในแท็บดีไซน์)
 *
 * <PartStyleEditor parts={ACCOUNT_PARTS} value={look.parts} onChange={(parts) => set({ parts })} colors={theme.colors} />
 * - รายการชิ้นส่วน + ตัวปรับของแต่ละชิ้นมาจากทะเบียน lib/website-page-parts (หน้าใหม่แค่ประกาศชิ้นส่วน)
 * - 🖥 ทุกจอ / 📱 เฉพาะมือถือ (ค่ามือถือทับค่าทุกจอ) · ไม่ตั้ง = ค่ากลางของร้าน (หน้าตาเดิม) · ↺ คืนค่ากลางทีละช่อง/ทีละชิ้น · คัดลอก/วางสไตล์
 * - 🎯 คลิกเลือกในพรีวิว: ส่งโหมดเลือกเข้า iframe (lib/storefront-preview-bus) → เว็บร้าน PartPickBridge ส่งชิ้นที่คลิกกลับมา
 * - สี = ชื่อสีของร้าน (เปลี่ยนสีร้านแล้วตาม) หรือกำหนดเอง · ค่าบันทึกผ่านระบบร่าง/เผยแพร่ของแท็บดีไซน์ (ไม่บันทึกเอง)
 * ของกลางที่ใช้: FontSelect · RangeInput · ColorInput · ชนิด/ตัวตรวจค่า lib/website-site-design (PartStyles — มิเรอร์กับเว็บร้าน)
 */
import { useEffect, useState } from "react";
import { FontSelect, type FontOption } from "@/components/font-select";
import { RangeInput } from "@/components/range-input";
import { ColorInput } from "@/components/color-picker";
import { GOOGLE_FONTS, type SiteTheme } from "@/lib/website-theme";
import { PART_COLOR_KEYS, PART_COLOR_TOKENS, PART_RANGES, type PartColorToken, type PartStyleEntry, type PartStyleValue, type PartStyles } from "@/lib/website-site-design";
import { PART_COLOR_LABEL, PART_GROUP_FIELDS, PART_GROUP_LABEL, PART_SLIDER, type PartDef } from "@/lib/website-page-parts";
import { sendToPreview, usePreviewMessages } from "@/lib/storefront-preview-bus";

type Device = "all" | "mobile";
type Field = keyof PartStyleValue;

const TOKEN_LABEL: Record<PartColorToken, string> = {
  brand: "สีหลัก",
  brandDeep: "สีหลักเข้ม",
  brandSoft: "สีหลักอ่อน",
  tint: "สีหลักจาง",
  ink: "ตัวอักษรเข้ม",
  inkSoft: "ตัวอักษรรอง",
  slate: "ตัวอักษรเทา",
  muted: "ตัวอักษรจาง",
  line: "เส้น",
  surface: "พื้นการ์ด",
  paper: "พื้นหน้า",
  onBrand: "ตัวอักษรบนสีหลัก",
  white: "ขาว",
  black: "ดำ",
};

/** ผสมสี hex (โชว์สีตัวอย่างของสีที่เว็บร้านคำนวณเอง เช่น สีหลักอ่อน) */
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => {
    const x = h.replace("#", "");
    const f = x.length === 3 ? x.split("").map((c) => c + c).join("") : x.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
  };
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const m = (u: number, v: number) => Math.round(u + (v - u) * t).toString(16).padStart(2, "0");
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
}

export function partPalette(c: SiteTheme["colors"]): Record<PartColorToken, string> {
  const onBrand = c.onBrand && c.onBrand !== "auto" ? c.onBrand : "#ffffff";
  return {
    brand: c.brand,
    brandDeep: c.brandDeep,
    brandSoft: mix(c.brand, "#ffffff", 0.8),
    tint: mix(c.brand, "#ffffff", 0.94),
    ink: c.ink,
    inkSoft: mix(c.ink, "#ffffff", 0.2),
    slate: mix(c.ink, "#ffffff", 0.4),
    muted: c.muted,
    line: c.line,
    surface: c.surface,
    paper: c.page,
    onBrand,
    white: "#ffffff",
    black: "#000000",
  };
}

const FONT_OPTIONS: FontOption[] = [
  { value: "", label: "ค่ากลาง (ตามร้าน)", group: "ของร้าน" },
  { value: "display", label: "ฟอนต์หัวข้อของร้าน", group: "ของร้าน" },
  { value: "body", label: "ฟอนต์เนื้อหาของร้าน", group: "ของร้าน" },
  ...GOOGLE_FONTS.map((f) => ({ value: f.name, label: f.name, family: `"${f.name}"`, group: f.thai ? "ไทย + อังกฤษ" : "อังกฤษ (ไทยใช้ฟอนต์สำรอง)" })),
];
const FONT_NAMES = GOOGLE_FONTS.map((f) => f.name);

const chip = (on: boolean) => `h-7 px-2.5 rounded-md border text-xs ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

function Chips<T extends string | number | boolean>({ value, options, onChange }: { value: T | undefined; options: { v: T | undefined; l: string }[]; onChange: (v: T | undefined) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button key={String(o.v)} type="button" className={chip(value === o.v)} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function ColorField({ value, onChange, palette, allowNone }: { value: string | undefined; onChange: (v: string | undefined) => void; palette: Record<PartColorToken, string>; allowNone: boolean }) {
  const custom = value?.startsWith("#") ? value : "";
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" className={chip(value === undefined)} onClick={() => onChange(undefined)}>
        ค่ากลาง
      </button>
      {allowNone && (
        <button type="button" className={chip(value === "none")} onClick={() => onChange("none")}>
          ไม่มี
        </button>
      )}
      {PART_COLOR_TOKENS.map((t) => (
        <button
          key={t}
          type="button"
          title={TOKEN_LABEL[t]}
          aria-label={TOKEN_LABEL[t]}
          onClick={() => onChange(t)}
          className={`w-6 h-6 rounded-md border ${value === t ? "ring-2 ring-blue-500 ring-offset-1" : "border-slate-300"}`}
          style={{ background: palette[t] }}
        />
      ))}
      <div className="w-28">
        <ColorInput value={custom || "#000000"} onChange={(hex) => onChange(hex.toLowerCase())} allowText invalid={false} />
      </div>
    </div>
  );
}

export function PartStyleEditor({ parts, value, onChange, colors, title = "🎨 ปรับละเอียดทีละชิ้น" }: { parts: PartDef[]; value: PartStyles; onChange: (v: PartStyles) => void; colors: SiteTheme["colors"]; title?: string }) {
  const [sel, setSel] = useState(parts[0]?.key ?? "");
  const [device, setDevice] = useState<Device>("all");
  const [pick, setPick] = useState(true);
  const [clip, setClip] = useState<PartStyleValue | null>(null);
  const palette = partPalette(colors);
  const part = parts.find((p) => p.key === sel) ?? parts[0];

  // 🎯 โหมดคลิกเลือกในพรีวิว (เว็บร้าน PartPickBridge) · ออกจากแผง = ปิดโหมด
  useEffect(() => {
    sendToPreview({ type: "storefront-part-pick", on: pick, selected: sel });
  }, [pick, sel]);
  useEffect(() => () => sendToPreview({ type: "storefront-part-pick", on: false, selected: "" }), []);
  usePreviewMessages((d) => {
    if (d.type === "storefront-part-picked" && typeof d.part === "string" && parts.some((p) => p.key === d.part)) setSel(d.part);
    if (d.type === "storefront-preview-ready") sendToPreview({ type: "storefront-part-pick", on: pick, selected: sel });
  });

  if (!part) return null;
  const entry: PartStyleEntry = value[part.key] ?? {};
  const bucket = device === "mobile" ? entry.mobile ?? {} : entry.all ?? {};
  const shown = (k: Field) => (device === "mobile" ? (entry.mobile?.[k] ?? entry.all?.[k]) : entry.all?.[k]);
  const inherited = (k: Field) => device === "mobile" && entry.mobile?.[k] === undefined && entry.all?.[k] !== undefined;

  const writeEntry = (key: string, next: PartStyleEntry | null) => {
    const out: PartStyles = { ...value };
    if (next && (next.all || next.mobile)) out[key] = next;
    else delete out[key];
    onChange(out);
  };
  const setField = (k: Field, v: PartStyleValue[Field] | undefined) => {
    const b: PartStyleValue = { ...bucket };
    if (v === undefined) delete b[k];
    else (b as Record<string, unknown>)[k] = v;
    const has = Object.keys(b).length > 0;
    writeEntry(part.key, device === "mobile" ? { all: entry.all, mobile: has ? b : undefined } : { all: has ? b : undefined, mobile: entry.mobile });
  };
  const resetPart = () => writeEntry(part.key, device === "mobile" ? { all: entry.all } : null);
  const customized = (key: string) => !!(value[key]?.all || value[key]?.mobile);

  const label = (k: Field, text: string) => (
    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
      {text}
      {inherited(k) && <span className="text-[10px] text-slate-400">(ใช้ค่าทุกจอ)</span>}
      {bucket[k] !== undefined && (
        <button type="button" className="text-[10px] text-blue-600 hover:underline" onClick={() => setField(k, undefined)} title="กลับค่ากลาง">
          ↺
        </button>
      )}
    </span>
  );

  const fieldEl = (k: Field) => {
    if (k === "font")
      return (
        <div key={k} className="grid gap-1">
          {label(k, "ฟอนต์")}
          <FontSelect value={String(shown(k) ?? "")} onChange={(v) => setField("font", v || undefined)} options={FONT_OPTIONS} googleFonts={FONT_NAMES} size="sm" />
        </div>
      );
    if ((PART_COLOR_KEYS as readonly string[]).includes(k))
      return (
        <div key={k} className="grid gap-1 sm:col-span-2">
          {label(k, PART_COLOR_LABEL[k] ?? k)}
          <ColorField value={shown(k) as string | undefined} onChange={(v) => setField(k, v)} palette={palette} allowNone={k === "bg" || k === "activeBg" || k === "borderColor"} />
        </div>
      );
    if (k === "align")
      return (
        <div key={k} className="grid gap-1">
          {label(k, "จัดวาง")}
          <Chips value={shown(k) as string | undefined} onChange={(v) => setField(k, v)} options={[{ v: undefined, l: "ค่ากลาง" }, { v: "left", l: "ซ้าย" }, { v: "center", l: "กลาง" }, { v: "right", l: "ขวา" }]} />
        </div>
      );
    if (k === "upper" || k === "italic" || k === "hidden") {
      const names = { upper: ["ตัวพิมพ์", "ปกติ", "ตัวใหญ่ (EN)"], italic: ["ตัวเอียง", "ตรง", "เอียง"], hidden: ["การแสดง", "โชว์", "ซ่อน"] }[k];
      return (
        <div key={k} className="grid gap-1">
          {label(k, names[0])}
          <Chips value={shown(k) as boolean | undefined} onChange={(v) => setField(k, v)} options={[{ v: undefined, l: "ค่ากลาง" }, { v: false, l: names[1] }, { v: true, l: names[2] }]} />
        </div>
      );
    }
    if (k === "shadow")
      return (
        <div key={k} className="grid gap-1">
          {label(k, "เงา")}
          <Chips value={shown(k) as number | undefined} onChange={(v) => setField(k, v)} options={[{ v: undefined, l: "ค่ากลาง" }, { v: 0, l: "ไม่มี" }, { v: 1, l: "บาง" }, { v: 2, l: "กลาง" }, { v: 3, l: "ลึก" }]} />
        </div>
      );
    const sl = PART_SLIDER[k];
    if (!sl) return null;
    const cur = shown(k) as number | undefined;
    const range = PART_RANGES[k as keyof typeof PART_RANGES];
    return (
      <div key={k} className="grid gap-1">
        {label(k, `${sl.label}${cur === undefined ? " · ค่ากลาง" : ""}`)}
        <div className="flex items-center gap-2">
          <div className={`flex-1 ${cur === undefined ? "opacity-50" : ""}`}>
            <RangeInput value={cur ?? sl.hint ?? sl.min} onChange={(v) => setField(k, v)} min={sl.min} max={sl.max} step={sl.step ?? 1} hardMin={range?.[0]} hardMax={range?.[1]} unit={sl.unit} ariaLabel={sl.label} />
          </div>
          {k === "radius" && (
            <button type="button" className={chip(cur === 999)} onClick={() => setField("radius", 999)}>
              เม็ดยา
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-3" data-part-editor>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <div className="flex gap-1 ml-auto">
          <button type="button" className={chip(device === "all")} onClick={() => setDevice("all")}>
            🖥 ทุกจอ
          </button>
          <button type="button" className={chip(device === "mobile")} onClick={() => setDevice("mobile")}>
            📱 เฉพาะมือถือ
          </button>
          <button type="button" className={chip(pick)} onClick={() => setPick((v) => !v)} title="คลิกชิ้นส่วนในพรีวิวเพื่อเลือก">
            🎯 คลิกเลือกในพรีวิว
          </button>
        </div>
      </div>
      {device === "mobile" && <p className="text-[11px] rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1">📱 ค่าที่ตั้งตอนนี้ใช้เฉพาะจอมือถือ — ช่องที่ไม่ได้แตะใช้ค่าทุกจอ (ดูในพรีวิวโหมดมือถือ)</p>}

      <div className="flex flex-wrap gap-1" role="tablist" aria-label="ชิ้นส่วน">
        {parts.map((p) => (
          <button key={p.key} type="button" role="tab" aria-selected={p.key === part.key} onClick={() => setSel(p.key)} className={`h-7 px-2.5 rounded-full border text-xs ${p.key === part.key ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`} data-part-chip={p.key}>
            {p.label}
            {customized(p.key) && <span className={`ml-1 inline-block w-1.5 h-1.5 rounded-full align-middle ${p.key === part.key ? "bg-white" : "bg-blue-500"}`} />}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-sm text-slate-800">{part.label}</b>
          {part.hint && <span className="text-[11px] text-slate-400">{part.hint}</span>}
          <span className="ml-auto flex gap-1">
            <button type="button" className={chip(false)} onClick={() => setClip({ ...(entry.all ?? {}), ...(device === "mobile" ? entry.mobile ?? {} : {}) })} title="คัดลอกสไตล์ชิ้นนี้">
              📋 คัดลอก
            </button>
            <button type="button" className={chip(false)} disabled={!clip} onClick={() => clip && writeEntry(part.key, device === "mobile" ? { all: entry.all, mobile: { ...clip } } : { all: { ...clip }, mobile: entry.mobile })} title="วางสไตล์ที่คัดลอกไว้">
              📌 วาง
            </button>
            <button type="button" className={chip(false)} onClick={resetPart} title={device === "mobile" ? "ลบค่าเฉพาะมือถือของชิ้นนี้" : "ชิ้นนี้กลับค่ากลางทั้งหมด"}>
              ↺ กลับค่ากลาง
            </button>
          </span>
        </div>
        {part.groups.map((g) => (
          <div key={g} className="space-y-2 border-t border-slate-100 pt-2">
            <p className="text-xs font-semibold text-slate-600">{PART_GROUP_LABEL[g]}</p>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2.5">{PART_GROUP_FIELDS[g].filter((k, i, a) => a.indexOf(k) === i).map((k) => fieldEl(k))}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">ไม่ตั้ง = ใช้ค่ากลางของร้าน (หน้าตาเดิม) · สีจากชุดสีร้านจะเปลี่ยนตามเมื่อเปลี่ยนสีร้าน · กดเผยแพร่ของแท็บดีไซน์เพื่อขึ้นเว็บจริง</p>
    </div>
  );
}
