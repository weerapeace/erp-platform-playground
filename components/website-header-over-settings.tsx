"use client";

/**
 * 🪟 ตาราง "โปร่งใสตอนอยู่บนสุด" รายประเภทหน้า (ธีม → แท็บ Header)
 * แต่ละแถว: ติ๊กเปิด · สีตัวหนังสือตอนโปร่งใส (ขาว/เข้ม) · 👁 พาพรีวิวไปหน้านั้น
 * ค่า/ประเภทหน้า/การตัดสินว่าทับรูปไหม อยู่ที่ lib/website-header-over (เว็บร้านใช้ชุดเดียวกัน)
 */
import { OVER_PAGE_KINDS, OVER_TEXT_LABEL, type OverPageKind, type OverPages, type OverText } from "@/lib/website-header-over";

export function HeaderOverPagesSettings({
  value,
  onChange,
  previewPath,
  currentPath,
  onPreview,
}: {
  value: OverPages;
  onChange: (next: OverPages) => void;
  /** หน้าตัวอย่างของแต่ละประเภท (null = ร้านยังไม่มีหน้าแบบนั้น → ไม่มีปุ่ม 👁) */
  previewPath: Record<OverPageKind, string | null>;
  currentPath: string;
  onPreview: (path: string) => void;
}) {
  const set = (k: OverPageKind, p: Partial<OverPages[OverPageKind]>) => onChange({ ...value, [k]: { ...value[k], ...p } });
  const onCount = OVER_PAGE_KINDS.filter((k) => value[k.key].on).length;

  return (
    <div className="mt-4 pt-3 border-t border-slate-100">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h4 className="text-sm font-semibold text-slate-800">🪟 โปร่งใสตอนอยู่บนสุด</h4>
        <span className="text-xs text-slate-500">{onCount ? `เปิด ${onCount} ประเภทหน้า` : "ยังไม่เปิดหน้าไหน"}</span>
      </div>
      <p className="text-xs text-slate-500 mt-0.5 mb-2">
        หน้าที่เริ่มด้วยรูปเต็มจอ → Header ลอยทับรูป · หน้าไม่มีรูปด้านบน → ไม่มีพื้นแต่ไม่ทับเนื้อหา · เลื่อนลง → กลับเป็นพื้นสีปกติ
      </p>
      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
        {OVER_PAGE_KINDS.map(({ key, label, hint }) => {
          const r = value[key];
          const path = previewPath[key];
          return (
            <div key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
              <label className="flex items-start gap-2 min-w-0 flex-1 basis-56 cursor-pointer">
                <input type="checkbox" className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0" checked={r.on} onChange={(e) => set(key, { on: e.target.checked })} />
                <span className="min-w-0">
                  <span className="block text-sm text-slate-800">{label}</span>
                  <span className="block text-[11px] text-slate-400 leading-snug">{hint}</span>
                </span>
              </label>
              <div className={`inline-flex rounded-lg border border-slate-200 p-0.5 ${r.on ? "" : "opacity-40 pointer-events-none"}`} role="radiogroup" aria-label={`สีตัวหนังสือ ${label}`}>
                {(["light", "dark"] as OverText[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={r.text === t}
                    tabIndex={r.on ? 0 : -1}
                    onClick={() => set(key, { text: t })}
                    className={`rounded-md px-2.5 py-1 text-xs transition ${r.text === t ? (t === "light" ? "bg-slate-700 text-white" : "bg-slate-900 text-white") : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    {OVER_TEXT_LABEL[t]}
                  </button>
                ))}
              </div>
              {path ? (
                <button
                  type="button"
                  onClick={() => onPreview(path)}
                  title="ให้พรีวิวไปหน้านี้"
                  className={`rounded-lg border px-2 py-1 text-xs transition ${currentPath === path ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                >
                  👁 ดู
                </button>
              ) : (
                <span className="w-[42px]" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">⚪ ขาว = บนรูปโทนมืด · ⚫ เข้ม = บนรูปโทนสว่าง/พื้นหน้าเว็บ · ตั้งสีตัวหนังสือ Header เองไว้ = ใช้ตอนเลื่อนลงแล้ว</p>
    </div>
  );
}
