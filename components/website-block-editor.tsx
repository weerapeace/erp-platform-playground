"use client";

/**
 * ของกลาง — ชิ้นส่วนร่วมของตัวจัดหน้าเว็บ (Website Builder)
 *
 * ตั้งแต่เฟส Schema-Driven: ฟอร์มตั้งค่าต่อชนิดย้ายไป components/website-schema-form.tsx (วาดจาก schema)
 * และต้นไม้/พรีวิว/แผงคุณสมบัติอยู่ที่ components/website-builder.tsx
 * ไฟล์นี้เหลือ: ชนิดข้อมูลแบบหลวมสำหรับหน้าจอ · makeBlock · แผง "รูปลักษณ์" (StylePanel) ที่ใช้ร่วมทุก Section
 *
 * ⚠️ ชนิดบล็อก/ค่าตั้งต้น มาจาก lib/website-blocks.ts + lib/website-schema.ts ที่เดียวเท่านั้น — ห้ามประกาศซ้ำที่นี่
 */
import { useState } from "react";
import { ColorInput } from "@/components/color-picker";
import { DEFAULT_BLOCK_STYLE, newBlock, type BlockStyle, type BlockType, type Visibility } from "@/lib/website-blocks";

export type { BlockType, Visibility };

/**
 * บล็อกแบบหลวมสำหรับหน้าจอ — ฟอร์มต้องอ่าน/เขียนฟิลด์ตามชนิดที่เลือกตอนรันไทม์
 * (ชนิดเข้มของจริงคือ Block ใน lib ซึ่งใช้ตอน normalize/ตรวจก่อนเผยแพร่)
 */
export interface Block {
  id: string;
  type: BlockType;
  enabled: boolean;
  visibility?: Visibility;
  style?: BlockStyle;
  [k: string]: unknown;
}

/** ชิ้นย่อยใน Section (Block) แบบหลวม */
export interface ChildBlock {
  id: string;
  enabled?: boolean;
  visibility?: Visibility;
  [k: string]: unknown;
}

export const ALL_VISIBLE: Visibility = { desktop: true, tablet: true, mobile: true };

export type BlockTypeInfo = { type: BlockType; label: string; icon: string; hint: string; group?: string };

/** สร้างบล็อกใหม่ตอนผู้ใช้กดเพิ่ม/ลากจากคลัง — ค่าตั้งต้นทั้งหมดมาจาก newBlock() ใน lib */
export function makeBlock(type: BlockType, seq: number): Block {
  return newBlock(type, seq, { uniqueId: true }) as unknown as Block;
}

/** สรุปว่าซ่อนบนอุปกรณ์ไหนบ้าง */
export function visibilityLabel(v?: Visibility): string {
  const x = { ...ALL_VISIBLE, ...v };
  const hidden = [!x.desktop && "คอม", !x.tablet && "แท็บเล็ต", !x.mobile && "มือถือ"].filter(Boolean);
  return hidden.length ? `ซ่อนบน ${hidden.join("/")}` : "";
}

const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; l: string }[] }) {
  return (
    <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`flex-1 px-2 py-1.5 text-xs transition ${value === o.v ? "bg-slate-900 text-white font-medium" : "text-slate-600 hover:bg-slate-50"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

const SPACE = [
  { v: "auto" as const, l: "ตามเดิม" },
  { v: "none" as const, l: "ไม่มี" },
  { v: "sm" as const, l: "น้อย" },
  { v: "md" as const, l: "กลาง" },
  { v: "lg" as const, l: "มาก" },
];
const ALIGN = [
  { v: "auto" as const, l: "ตามเดิม" },
  { v: "left" as const, l: "ซ้าย" },
  { v: "center" as const, l: "กลาง" },
  { v: "right" as const, l: "ขวา" },
];

/**
 * แผง "รูปลักษณ์" — มีเหมือนกันทุกชนิด Section (แยกจากฟอร์มเนื้อหา)
 * เก็บเป็นชื่อขนาด/ชื่อสีจากธีม ไม่ใช่ค่า pixel หรือรหัสสีตรง ๆ → เว็บแต่ละร้านแปลงเป็นสเกลของตัวเอง
 * แท็บ "มือถือ" = ตั้งทับเฉพาะจอเล็ก (auto = ใช้ค่าเดียวกับคอม)
 */
export function StylePanel({ value, onChange, defaultOpen = true }: { value: BlockStyle; onChange: (s: BlockStyle) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<"all" | "mobile">("all");
  const s: BlockStyle = { ...DEFAULT_BLOCK_STYLE, ...(value ?? {}), mobile: { ...DEFAULT_BLOCK_STYLE.mobile, ...(value?.mobile ?? {}) } };
  const set = (p: Partial<BlockStyle>) => onChange({ ...s, ...p });
  const setM = (p: Partial<BlockStyle["mobile"]>) => onChange({ ...s, mobile: { ...s.mobile, ...p } });
  const isDefault = JSON.stringify(s) === JSON.stringify(DEFAULT_BLOCK_STYLE);
  const mobileTouched = JSON.stringify(s.mobile) !== JSON.stringify(DEFAULT_BLOCK_STYLE.mobile);

  return (
    <div className="pt-3 border-t border-slate-200">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900">
        <span>{open ? "▾" : "▸"}</span>
        🎨 รูปลักษณ์
        {!isDefault && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] border border-blue-200">ปรับแล้ว</span>}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-1 text-[11px]">
            {([
              { k: "all" as const, l: "🖥️ ทุกจอ" },
              { k: "mobile" as const, l: `📲 มือถือ${mobileTouched ? " •" : ""}` },
            ]).map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => setTab(t.k)}
                className={`px-2.5 py-1 rounded-full border ${tab === t.k ? "bg-slate-900 border-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
              >
                {t.l}
              </button>
            ))}
            {tab === "mobile" && <span className="text-slate-400 ml-1">ตั้งทับเฉพาะจอเล็ก · &quot;ตามเดิม&quot; = ใช้ค่าเดียวกับคอม</span>}
          </div>

          {tab === "all" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ระยะห่างด้านบน"><Seg value={s.padTop} onChange={(v) => set({ padTop: v })} options={SPACE} /></Field>
              <Field label="ระยะห่างด้านล่าง"><Seg value={s.padBottom} onChange={(v) => set({ padBottom: v })} options={SPACE} /></Field>
              <Field label="ความกว้างเนื้อหา">
                <Seg value={s.width} onChange={(v) => set({ width: v })} options={[{ v: "auto", l: "ตามเดิม" }, { v: "narrow", l: "แคบ" }, { v: "full", l: "เต็มจอ" }]} />
              </Field>
              <Field label="จัดข้อความ"><Seg value={s.align} onChange={(v) => set({ align: v })} options={ALIGN} /></Field>
              <div className="sm:col-span-2">
                <Field label="พื้นหลังบล็อก">
                  <Seg
                    value={s.bg}
                    onChange={(v) => set({ bg: v })}
                    options={[
                      { v: "auto", l: "ตามเดิม" },
                      { v: "page", l: "พื้นเว็บ" },
                      { v: "surface", l: "พื้นการ์ด" },
                      { v: "brand", l: "สีแบรนด์" },
                      { v: "ink", l: "เข้ม" },
                      { v: "custom", l: "เลือกเอง" },
                    ]}
                  />
                </Field>
                {s.bg === "custom" && (
                  <div className="mt-2">
                    <ColorInput value={s.bgColor || "#ffffff"} onChange={(hex) => set({ bgColor: hex })} />
                    <p className="mt-1 text-[11px] text-amber-600">เลือกสีเองจะไม่เปลี่ยนตามธีมร้าน — ถ้าอยากให้เปลี่ยนตามธีมด้วย ใช้ &quot;สีแบรนด์&quot; หรือ &quot;พื้นการ์ด&quot;</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ระยะห่างด้านบน (มือถือ)"><Seg value={s.mobile.padTop} onChange={(v) => setM({ padTop: v })} options={SPACE} /></Field>
              <Field label="ระยะห่างด้านล่าง (มือถือ)"><Seg value={s.mobile.padBottom} onChange={(v) => setM({ padBottom: v })} options={SPACE} /></Field>
              <Field label="จัดข้อความ (มือถือ)"><Seg value={s.mobile.align} onChange={(v) => setM({ align: v })} options={ALIGN} /></Field>
            </div>
          )}

          {!isDefault && (
            <button type="button" onClick={() => onChange({ ...DEFAULT_BLOCK_STYLE, mobile: { ...DEFAULT_BLOCK_STYLE.mobile } })} className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline">
              คืนค่าเริ่มต้นทั้งหมด
            </button>
          )}
        </div>
      )}
    </div>
  );
}
