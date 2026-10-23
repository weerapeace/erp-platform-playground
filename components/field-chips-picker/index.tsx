"use client";

/**
 * FieldChipsPicker — เลือก "หลายฟิลด์" แบบกะทัดรัด (ของกลาง)
 * --------------------------------------------------------------------------
 * ที่เลือกแล้วโชว์เป็นชิป (กด ✕ เอาออก) + ปุ่ม "＋ เลือกฟิลด์…" เปิดป๊อปอัป ERPModal
 * ป๊อปอัป: ค้นหา · จัดกลุ่ม · ติ๊กแล้วเรียงตามลำดับที่ติ๊ก
 *
 * ใช้แทนกล่องติ๊กยาว ๆ ทุกที่ที่ให้เลือกฟิลด์ เช่น ชุดรายละเอียดสินค้า · แบนเนอร์หน้าสินค้า (กลาง/รายรุ่น)
 *   <FieldChipsPicker value={keys} onChange={setKeys} fields={[{ key, label, group? }]} groups={{ core: "ข้อมูลหลัก" }} />
 * ใช้กับรายการอื่นที่ไม่ใช่ฟิลด์ก็ได้ (เช่น หมวดบนเว็บ): addLabel/searchPlaceholder/unit · showKeys={false} · icon ต่อรายการ
 *   markFirst="หลัก" = ตัวแรกมี ★ + ในป๊อปกด ★ ตั้งตัวไหนเป็นตัวแรกได้ (หมวดหลัก)
 *   hint ต่อรายการ = ข้อความเล็กด้านขวาในป๊อป (เช่น "มีข้อมูล 1/54") แทน key · ไม่โชว์บนชิป
 */
import { useState } from "react";
import { ERPModal } from "@/components/modal";

export interface PickableField { key: string; label: string; group?: string; icon?: string; hint?: string }

export function FieldChipsPicker({
  value,
  onChange,
  fields,
  groups,
  max,
  compact = false,
  title = "เลือกฟิลด์จาก Parent SKU",
  description = "ติ๊กฟิลด์ที่จะโชว์ — เรียงตามลำดับที่ติ๊ก · ฟิลด์ที่สินค้าไม่ได้กรอกจะไม่โชว์เอง",
  addLabel = "＋ เลือกฟิลด์…",
  searchPlaceholder = "ค้นหาชื่อฟิลด์…",
  unit = "ฟิลด์",
  showKeys = true,
  markFirst,
  emptyText,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
  fields: PickableField[];
  /** ป้ายชื่อกลุ่ม (group key → ชื่อ) */
  groups?: Record<string, string>;
  /** เลือกได้สูงสุด (ไม่ใส่ = ไม่จำกัด) */
  max?: number;
  /** ชิปเล็ก (ใช้ในแผงตั้งค่าย่อย) */
  compact?: boolean;
  title?: string;
  description?: string;
  /** ข้อความปุ่มเปิดป๊อป */
  addLabel?: string;
  searchPlaceholder?: string;
  /** หน่วยในแถบล่าง (เลือกแล้ว N <unit>) */
  unit?: string;
  /** โชว์ key ตัวเล็กด้านขวา (ฟิลด์ = true · รายการทั่วไปปิดได้) */
  showKeys?: boolean;
  /** ตัวแรกมีความหมายพิเศษ (เช่น "หลัก") → ชิปแรกมี ★ + ในป๊อปกด ★ ย้ายขึ้นเป็นตัวแรก */
  markFirst?: string;
  /** ยังไม่ได้เลือกเลย → ข้อความเล็กหน้าปุ่ม */
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const fieldOf = (k: string) => fields.find((f) => f.key === k);
  const labelOf = (k: string) => {
    const f = fieldOf(k);
    return f ? `${f.icon ? `${f.icon} ` : ""}${f.label}` : k;
  };
  const makeFirst = (k: string) => onChange([k, ...value.filter((x) => x !== k)]);
  const full = max !== undefined && value.length >= max;
  const toggle = (k: string) => {
    if (value.includes(k)) onChange(value.filter((x) => x !== k));
    else if (!full) onChange([...value, k]);
  };

  const chip = compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  const ql = q.trim().toLowerCase();
  const shown = fields.filter((f) => !ql || f.label.toLowerCase().includes(ql) || f.key.toLowerCase().includes(ql));
  const grouped = new Map<string, PickableField[]>();
  for (const f of shown) {
    const g = f.group ?? "";
    grouped.set(g, [...(grouped.get(g) ?? []), f]);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.length === 0 && emptyText && <span className="text-[11px] text-slate-400">{emptyText}</span>}
        {value.map((k, i) => (
          <span key={k} className={`inline-flex items-center gap-1 rounded-full border ${markFirst && i === 0 ? "border-amber-300 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-700"} ${chip}`} title={markFirst && i === 0 ? markFirst : undefined}>
            {markFirst && i === 0 ? "★ " : ""}
            {labelOf(k)}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== k))} className="text-blue-400 hover:text-rose-600" title="เอาออก" aria-label={`เอา ${labelOf(k)} ออก`}>✕</button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => { setQ(""); setOpen(true); }}
          className={`rounded-full border border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-700 ${chip}`}
        >
          {addLabel}
        </button>
      </div>

      <ERPModal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        size="md"
        defaultExpanded={false}
        storageKey="field-chips-picker"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-slate-500">
              เลือกแล้ว {value.length}{max !== undefined ? `/${max}` : ""} {unit}{full && " — ครบจำนวนแล้ว"}{markFirst && value.length > 0 ? ` · ★ ${markFirst} = ${labelOf(value[0])}` : ""}
            </span>
            <button type="button" onClick={() => setOpen(false)} className="text-sm px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">เสร็จ</button>
          </div>
        }
      >
        {open && (
          <div className="space-y-3">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
            {value.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {value.map((k, i) => (
                  <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px]">
                    <span className="text-blue-400">{markFirst && i === 0 ? "★" : i + 1}</span> {labelOf(k)}
                    <button type="button" onClick={() => toggle(k)} className="text-blue-400 hover:text-rose-600">✕</button>
                  </span>
                ))}
              </div>
            )}
            {[...grouped.entries()].map(([g, list]) => (
              <div key={g || "all"}>
                {g && <div className="text-[11px] font-medium text-slate-500 mb-1">{groups?.[g] ?? g}</div>}
                <div className="grid sm:grid-cols-2 gap-x-3 gap-y-0.5">
                  {list.map((f) => {
                    const on = value.includes(f.key);
                    return (
                      <label
                        key={f.key}
                        className={`flex items-center gap-2 px-2 py-1 rounded-lg text-sm cursor-pointer ${on ? "bg-blue-50 text-blue-800" : full ? "text-slate-300 cursor-not-allowed" : "text-slate-700 hover:bg-slate-50"}`}
                      >
                        <input type="checkbox" className="accent-blue-600" checked={on} disabled={!on && full} onChange={() => toggle(f.key)} />
                        <span className="truncate">{f.icon ? `${f.icon} ` : ""}{f.label}</span>
                        {markFirst && on && (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); makeFirst(f.key); }}
                            title={value[0] === f.key ? `เป็น${markFirst}อยู่` : `ตั้งเป็น${markFirst}`}
                            className={`ml-auto text-xs ${value[0] === f.key ? "text-amber-500" : "text-slate-300 hover:text-amber-500"}`}
                          >
                            ★{value[0] === f.key ? ` ${markFirst}` : ""}
                          </button>
                        )}
                        {f.hint ? <span className={`${markFirst && on ? "" : "ml-auto "}shrink-0 text-[11px] text-slate-400`}>{f.hint}</span>
                          : showKeys && <span className="ml-auto text-[10px] text-slate-300 font-mono truncate max-w-[40%]">{f.key}</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            {shown.length === 0 && <div className="text-sm text-slate-400 py-6 text-center">ไม่พบ{unit}ที่ค้นหา</div>}
          </div>
        )}
      </ERPModal>
    </>
  );
}
