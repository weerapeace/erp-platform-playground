"use client";

// ============================================================
// PromptEditor (ของกลาง) — ตัวแก้ prompt ที่มี "ปุ่มเลือกตัวแปร" + ดูค่าตัวอย่าง
// ใช้ที่: หน้า Prompt ต่อแบรนด์ + ตัวแก้เทมเพลตชนิดงานย่อย (และที่อื่นที่ใช้ {{var}})
// - คลิกปุ่มตัวแปร → แทรก {{key}} ณ ตำแหน่ง cursor (ไม่ต้องพิมพ์วงเล็บเอง)
// - ปุ่มบอกชื่อภาษาไทย + เลื่อนเมาส์เห็นค่าตัวอย่าง · ตัวที่ระบบยังไม่มีข้อมูลให้ = ขึ้น "ยังว่าง"
// - กล่อง preview แสดงผลเมื่อแทนค่าตัวอย่าง เพื่อให้เห็นหน้าตาจริงก่อนใช้
// ============================================================

import { useRef } from "react";
import { ERPTextarea } from "@/components/form";
import { useT } from "@/components/i18n";
import { PROMPT_VARS, renderPrompt, type PromptVars } from "@/lib/subtask-prompt";

// ค่าตัวอย่างกลาง (เวลายังไม่มี context จริง) — ให้เห็นว่าตัวแปรจะกลายเป็นอะไร
export const PROMPT_SAMPLE: Record<string, string> = {
  brand_name: "Good Goods",
  task_name: "ถ่ายภาพสินค้าคอลใหม่",
  parent_sku: "PS-1023",
  sku_list: "SKU-001, SKU-002",
  product_name: "กระเป๋าผ้าแคนวาส",
  price: "1,290",
  collection: "Summer 2026",
  colors: "ดำ, ครีม, เขียวมะกอก",
  materials: "ผ้าแคนวาส, หนัง PU",
  platforms: "Shopee, Lazada, TikTok",
  approved_image_urls: "https://.../img1.jpg",
  notes: "เน้นวางขายจริง พื้นหลังสะอาด",
  output_format: "ภาพ 1:1 จำนวน 5 รูป",
};

// ตัวแปรที่ระบบ "เติมค่าจริงให้อัตโนมัติ" ตอน copy prompt (อื่นๆ = ยังไม่มีข้อมูลป้อน → ออกมาว่าง)
const RESOLVED_KEYS = new Set([
  "brand_name", "task_name", "parent_sku", "sku_list", "product_name", "price", "platforms", "approved_image_urls", "notes",
]);

const VAR_LABEL_TH: Record<string, string> = Object.fromEntries(PROMPT_VARS.map((v) => [v.key, v.hint]));

export function PromptEditor({ value, onChange, onCommit, sampleOverrides, placeholder, rows = 4, disabled = false }: {
  value: string;
  onChange: (v: string) => void;
  onCommit?: (v: string) => void;          // เรียกตอน blur (ใช้บันทึก)
  sampleOverrides?: Record<string, string>; // ค่าจริงจาก context เช่น brand_name ของแบรนด์ที่เลือก
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const sample: PromptVars = { ...PROMPT_SAMPLE, ...(sampleOverrides ?? {}) };

  // แทรก {{key}} ณ ตำแหน่ง cursor แล้วคืน focus
  const insert = (key: string) => {
    const token = `{{${key}}}`;
    const el = ref.current;
    if (!el) { onChange(`${value}${token}`); return; }
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? value.length;
    const next = value.slice(0, s) + token + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); const pos = s + token.length; el.setSelectionRange(pos, pos); });
  };

  const usedKeys = new Set([...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]));
  const preview = renderPrompt(value, sample);

  return (
    <div className="space-y-2">
      <ERPTextarea ref={ref} value={value} rows={rows} placeholder={placeholder} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} onBlur={() => onCommit?.(value)} />

      {/* คลังตัวแปร: คลิกเพื่อแทรก */}
      <div>
        <p className="text-[11px] text-slate-400 mb-1">{t("คลิกเพื่อแทรกตัวแปร (เลื่อนเมาส์ดูค่าตัวอย่าง)", "Click to insert a variable (hover to see sample)")}</p>
        <div className="flex flex-wrap gap-1.5">
          {PROMPT_VARS.map((v) => {
            const filled = RESOLVED_KEYS.has(v.key) || (sampleOverrides?.[v.key]?.trim()?.length ?? 0) > 0;
            const used = usedKeys.has(v.key);
            const ex = (sample[v.key as keyof PromptVars] ?? "") as string;
            return (
              <button key={v.key} type="button" disabled={disabled} onClick={() => insert(v.key)}
                title={`{{${v.key}}} — ${VAR_LABEL_TH[v.key]}\n${t("ค่าตัวอย่าง", "Sample")}: ${ex || t("(ว่าง)", "(empty)")}`}
                className={`text-[11px] rounded-md px-1.5 py-0.5 border transition-colors disabled:opacity-50 ${used
                  ? "bg-violet-600 text-white border-violet-600"
                  : filled
                    ? "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
                    : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100"}`}>
                ＋ {VAR_LABEL_TH[v.key]}{!filled && <span className="ml-0.5 opacity-70">· {t("ยังว่าง", "blank")}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* preview — แทนค่าตัวอย่างให้เห็นหน้าตาจริง */}
      {value.trim().length > 0 && (
        <details className="text-xs" open>
          <summary className="cursor-pointer text-slate-500 select-none">{t("ตัวอย่างผลลัพธ์ (แทนค่าตัวอย่าง)", "Preview (sample values)")}</summary>
          <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 border border-slate-200 p-2 text-slate-700 font-sans leading-relaxed">{preview || t("(ว่าง)", "(empty)")}</pre>
        </details>
      )}
    </div>
  );
}
