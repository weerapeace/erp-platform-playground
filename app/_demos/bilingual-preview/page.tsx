"use client";

/**
 * 🌐 ตัวอย่าง widget 2 ภาษา (ของกลาง components/bilingual-field.tsx)
 * ใช้จริงที่: ตัวจัดหน้าเว็บ (/website/<ร้าน> → แผงตั้งค่าขวา) · เอกสาร docs/bilingual-content.md
 */
import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { BilingualText, ContentLangProvider, TranslationBar } from "@/components/bilingual-field";
import { coverageOf, readMeta, textOf, translationStatus } from "@/lib/content-i18n";

const FIELDS = [
  { key: "eyebrow", label: "คำโปรยเหนือหัวข้อ" },
  { key: "title", label: "หัวข้อ" },
  { key: "subtitle", label: "คำอธิบาย", multiline: true },
  { key: "button", label: "ข้อความบนปุ่ม" },
] as const;

export default function BilingualPreviewPage() {
  const [row, setRow] = useState<Record<string, unknown>>({
    eyebrow: "คอลเลกชันใหม่",
    eyebrow_en: "New collection",
    title: "กระเป๋าหนังแท้ ทำมือทุกใบ",
    subtitle: "หนังวัวแท้ เย็บมือ รับประกัน 1 ปี",
    button: "ดูสินค้าทั้งหมด",
  });
  const patch = (p: Record<string, unknown>) => setRow((r) => ({ ...r, ...p }));
  const meta = readMeta(row);
  const cov = coverageOf(FIELDS.map((f) => ({ th: row[f.key], status: translationStatus(row[f.key], row[`${f.key}_en`], meta[f.key]) })));

  return (
    <PlaygroundShell>
      <div className="max-w-md mx-auto p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">🌐 ช่องกรอก 2 ภาษา</h1>
          <p className="text-xs text-slate-500">กดสลับ ไทย / EN ที่แถบบน → ทุกช่องเปลี่ยนภาษาพร้อมกัน · กด 🌐 แปล ให้ AI แปลจากไทย</p>
        </div>
        <ContentLangProvider>
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
            <TranslationBar coverage={cov} onTranslateMissing={() => undefined} />
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <BilingualText key={f.key} label={f.label} wide multiline={"multiline" in f} value={row} fieldKey={f.key} onPatch={patch} />
              ))}
            </div>
          </div>
        </ContentLangProvider>
        <pre className="rounded-lg bg-slate-900 text-slate-100 text-[11px] p-3 overflow-x-auto">{JSON.stringify(row, null, 2)}</pre>
        <p className="text-[11px] text-slate-400">ภาษาไทยของหัวข้อ: {textOf(row.title)}</p>
      </div>
    </PlaygroundShell>
  );
}
