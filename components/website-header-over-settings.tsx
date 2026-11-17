"use client";

/**
 * 🪟 ตาราง "โปร่งใสตอนอยู่บนสุด" รายประเภทหน้า (ธีม → แท็บ Header)
 * แต่ละแถว: ติ๊กเปิด · สีตัวหนังสือตอนโปร่งใส (ขาว/เข้ม) · 👁 พาพรีวิวไปหน้านั้น
 * ค่า/ประเภทหน้า/การตัดสินว่าทับรูปไหม อยู่ที่ lib/website-header-over (เว็บร้านใช้ชุดเดียวกัน)
 */
import { OVER_PAGE_KINDS, OVER_TEXT_LABEL, type OverPageKind, type OverPages, type OverText } from "@/lib/website-header-over";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

/** ป้ายจาก lib/website-header-over (เว็บร้านใช้ชุดเดียวกัน — คงไทย) → แปลตอนแสดงในหน้าแอดมิน */
const OVER_EN: Record<string, string> = {
  "หน้าแรก": "Home page",
  "หน้าสินค้า": "Product page",
  "ทับรูปเมื่อเป็นแบบโชว์เคส + รูปชิดบน (ไม่มีชื่อ/breadcrumb ด้านบน)": "Overlays the image with showcase layout + top-aligned image (no title/breadcrumb above)",
  "หน้ารวมสินค้า / หมวด / คอลเลกชัน": "Shop / category / collection pages",
  "/shop · /c/… · /collection/… (คอลเลกชันที่มีแบนเนอร์ = ทับรูป)": "/shop · /c/… · /collection/… (collections with a banner = overlay)",
  "หน้ามาใหม่": "New drops page",
  "หน้าที่สร้างเอง": "Custom pages",
  "หน้าจากแท็บ 📄 หน้าเว็บ": "Pages from the 📄 Pages tab",
  "หน้าอื่น ๆ": "Other pages",
  "ตะกร้า · ชำระเงิน · ติดตามพัสดุ · บัญชี · ติดต่อ ฯลฯ": "Cart · checkout · tracking · account · contact, etc.",
  "⚪ ขาว": "⚪ White",
  "⚫ เข้ม": "⚫ Dark",
};
const overEn = (th: string) => tr(th, OVER_EN[th] ?? th);

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
  const t = useT();
  const set = (k: OverPageKind, p: Partial<OverPages[OverPageKind]>) => onChange({ ...value, [k]: { ...value[k], ...p } });
  const onCount = OVER_PAGE_KINDS.filter((k) => value[k.key].on).length;

  return (
    <div className="mt-4 pt-3 border-t border-slate-100">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h4 className="text-sm font-semibold text-slate-800">{t("🪟 โปร่งใสตอนอยู่บนสุด", "🪟 Transparent at the top")}</h4>
        <span className="text-xs text-slate-500">{onCount ? t(`เปิด ${onCount} ประเภทหน้า`, `On for ${onCount} page types`) : t("ยังไม่เปิดหน้าไหน", "Not on for any page")}</span>
      </div>
      <p className="text-xs text-slate-500 mt-0.5 mb-2">
        {t("หน้าที่เริ่มด้วยรูปเต็มจอ → Header ลอยทับรูป · หน้าไม่มีรูปด้านบน → ไม่มีพื้นแต่ไม่ทับเนื้อหา · เลื่อนลง → กลับเป็นพื้นสีปกติ", "Pages starting with a full-screen image → header floats over it · pages without a top image → no background but doesn't cover content · scroll down → normal background returns")}
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
                  <span className="block text-sm text-slate-800">{overEn(label)}</span>
                  <span className="block text-[11px] text-slate-400 leading-snug">{overEn(hint)}</span>
                </span>
              </label>
              <div className={`inline-flex rounded-lg border border-slate-200 p-0.5 ${r.on ? "" : "opacity-40 pointer-events-none"}`} role="radiogroup" aria-label={tr(`สีตัวหนังสือ ${label}`, `Text color ${overEn(label)}`)}>
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
                    {overEn(OVER_TEXT_LABEL[t])}
                  </button>
                ))}
              </div>
              {path ? (
                <button
                  type="button"
                  onClick={() => onPreview(path)}
                  title={t("ให้พรีวิวไปหน้านี้", "Show this page in the preview")}
                  className={`rounded-lg border px-2 py-1 text-xs transition ${currentPath === path ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                >
                  {t("👁 ดู", "👁 View")}
                </button>
              ) : (
                <span className="w-[42px]" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">{t("⚪ ขาว = บนรูปโทนมืด · ⚫ เข้ม = บนรูปโทนสว่าง/พื้นหน้าเว็บ · ตั้งสีตัวหนังสือ Header เองไว้ = ใช้ตอนเลื่อนลงแล้ว", "⚪ White = on dark images · ⚫ Dark = on light images/page background · a custom header text color is used after scrolling down")}</p>
    </div>
  );
}
