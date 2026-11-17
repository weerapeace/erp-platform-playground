"use client";

/** โลโก้ — รูปแบบ · รูปโลโก้/Favicon · ดูบนพื้นหลังต่าง ๆ (ใช้ซ้ำในป๊อป ⚙ โลโก้ ของแท็บ Header) (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { ImageUploadField, keyUrl } from "@/components/website-theme-media";
import { LangInput } from "@/components/bilingual-field";
import { RangeInput } from "@/components/range-input";
import { useT } from "@/components/i18n";
import { labelEn } from "@/lib/website-admin-en";
import { type LogoMode, inputCls, labelCls } from "./shared";
import { useDesign } from "./context";
import { DesignCard } from "./design-card";

// 🔤 เนื้อหาแท็บโลโก้ — ใช้ร่วม แท็บโลโก้ + ป๊อป ⚙ โลโก้ ในตำแหน่งชิ้นส่วน Header (ค่าเดียวกัน)
export function LogoSettings() {
  const { theme, choices, setLogo } = useDesign();
  const t = useT();
  return (
    <>
      <DesignCard title="รูปแบบโลโก้" summary={`${labelEn(choices.logoModes.find((m) => m.value === theme.logo.mode)?.label ?? theme.logo.mode)} · ${t("สูง", "height")} ${theme.logo.height}px`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{t("แสดงแบบ", "Display as")}</label>
            <select className={inputCls} value={theme.logo.mode} onChange={(e) => setLogo({ mode: e.target.value as LogoMode })}>
              {choices.logoModes.map((m) => <option key={m.value} value={m.value}>{labelEn(m.label)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t("ความสูงโลโก้", "Logo height")} · {theme.logo.height}px</label>
            <RangeInput min={16} max={200} value={theme.logo.height} onChange={(v) => setLogo({ height: v })} className="w-full accent-blue-600" />
            <p className="text-[11px] text-slate-500 mt-1">{t("Header สูงขึ้นตามโลโก้ให้เอง · บนมือถือโลโก้สูงสุด 80px", "Header grows with the logo automatically · max logo height 80px on mobile")}</p>
          </div>
          <div>
            <label className={labelCls}>{t("อักษรในกล่อง (1-4 ตัว)", "Letters in box (1-4 chars)")}</label>
            <input className={inputCls} maxLength={4} value={theme.logo.mark} onChange={(e) => setLogo({ mark: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>{t("ชื่อร้าน", "Shop name")}</label>
            <LangInput className={inputCls} obj={theme.logo} k="text" onPatch={setLogo} />
          </div>
        </div>
      </DesignCard>

      <DesignCard title="รูปโลโก้ & ไอคอน" summary={[theme.logo.imageKey ? t("มีรูปโลโก้", "Has logo image") : t("ยังไม่มีรูปโลโก้", "No logo image yet"), theme.logo.faviconKey ? t("มี Favicon", "Has favicon") : t("ยังไม่มี Favicon", "No favicon yet")].join(" · ")} hint={t("อัปโหลดแล้วเลือก \"แสดงแบบ: รูปโลโก้\" ด้านบน · รองรับ PNG/JPG/WebP (โปร่งใสแนะนำ PNG)", "Upload, then choose \"Display as: Logo image\" above · supports PNG/JPG/WebP (PNG recommended for transparency)")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageUploadField label={t("โลโก้หลัก", "Main logo")} hint={t("ใช้บนพื้นสว่าง", "Used on light backgrounds")} value={theme.logo.imageKey} onChange={(k) => setLogo({ imageKey: k })} previewBg={theme.colors.page} />
          <ImageUploadField label={t("โลโก้สำหรับพื้นเข้ม", "Logo for dark backgrounds")} hint={t("ใช้ตอน Header สีเข้ม", "Used when the header is dark")} value={theme.logo.imageDarkKey} onChange={(k) => setLogo({ imageDarkKey: k })} previewBg={theme.colors.ink} />
          <ImageUploadField label={t("ไอคอนแท็บเบราว์เซอร์ (Favicon)", "Browser tab icon (favicon)")} hint={t("จัตุรัส 64px+", "Square 64px+")} value={theme.logo.faviconKey} onChange={(k) => setLogo({ faviconKey: k })} height={44} />
        </div>
      </DesignCard>

      <DesignCard title="ดูบนพื้นหลังต่าง ๆ">
        <div className="grid grid-cols-3 gap-2">
          {[
            { bg: "#FFFFFF", label: t("พื้นขาว", "White"), dark: false },
            { bg: theme.colors.ink, label: t("พื้นเข้ม", "Dark"), dark: true },
            { bg: theme.colors.brand, label: t("พื้นแบรนด์", "Brand"), dark: true },
          ].map((v) => {
            const img = v.dark && theme.logo.imageDarkKey ? theme.logo.imageDarkKey : theme.logo.imageKey;
            const showImg = theme.logo.mode === "image" && img;
            return (
              <div key={v.label} className="rounded-lg p-3 border border-slate-200 text-center" style={{ background: v.bg }}>
                <span className="inline-flex items-center gap-1.5">
                  {showImg ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={keyUrl(img, 200)!} alt={t("โลโก้", "Logo")} style={{ height: Math.min(theme.logo.height, 34) }} />
                  ) : (
                    <>
                      {(theme.logo.mode === "icon-text" || theme.logo.mode === "icon") && (
                        <span className="inline-flex items-center justify-center text-white font-semibold" style={{ width: 22, height: 22, borderRadius: 6, background: theme.colors.brand, fontSize: 10 }}>
                          {theme.logo.mark}
                        </span>
                      )}
                      {(theme.logo.mode === "icon-text" || theme.logo.mode === "text") && (
                        <span className="text-xs font-semibold" style={{ color: v.dark ? "#fff" : theme.colors.ink }}>{theme.logo.text}</span>
                      )}
                    </>
                  )}
                </span>
                <p className="text-[9px] mt-1.5" style={{ color: v.dark ? "rgba(255,255,255,.6)" : "#94a3b8" }}>{v.label}</p>
              </div>
            );
          })}
        </div>
      </DesignCard>
    </>
  );
}
