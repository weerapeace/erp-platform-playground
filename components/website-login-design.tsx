"use client";

/**
 * 👤 ตั้งค่าป๊อปสมัคร/เข้าสู่ระบบ + ปุ่มสมัครบนหัวเว็บ — ส่วนเสริมในการ์ด "หน้าเข้าสู่ระบบ" (แท็บดีไซน์ › 📄 หน้าพิเศษ)
 *
 * ข้อความหัวป๊อป / ปุ่มสมัคร (ไทย+อังกฤษ) · กล่องข้อดีสมาชิก (เปิด/ปิด + เขียนเอง) · ลิงก์สั่งโดยไม่สมัคร · สีปุ่ม Google/LINE/Facebook
 * 🎨 ปรับละเอียดทีละชิ้น = ของกลาง PartStyleEditor + ทะเบียน LOGIN_PARTS (คลิกเลือกในพรีวิวได้)
 * ค่า theme.page.login (normalizeLogin — มิเรอร์ lib/website-site-design ↔ เว็บร้าน) · ค่าเริ่ม = หน้าตาเดิม
 * พรีวิว: /account/login (ร้านที่ยังไม่ตั้งช่องทาง = ปุ่มตัวอย่าง) · ?auth=signup = เปิดป๊อปทันที
 */
import { type ReactNode } from "react";
import { LangInput } from "@/components/bilingual-field";
import { PartStyleFold } from "@/components/website-part-style-editor";
import { webForm } from "@/lib/website-form-styles";
import type { LoginLook } from "@/lib/website-site-design";
import { LOGIN_PARTS } from "@/lib/website-page-parts";
import type { SiteTheme } from "@/lib/website-theme";
import { useT } from "@/components/i18n";

const DEFAULT_PERKS = ["⭐ สะสมแต้มทุกออเดอร์ แลกเป็นส่วนลด", "📦 ดูและติดตามออเดอร์ได้ตลอด", "🏠 จำที่อยู่จัดส่ง สั่งครั้งหน้าเร็วขึ้น", "🎟️ รับคูปองและสิทธิ์เฉพาะสมาชิก"];

const pill = (on: boolean) => `rounded-lg border px-2.5 py-1.5 text-left text-xs leading-tight ${on ? "border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-500" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;
const Toggle = ({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) => (
  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {children}
  </label>
);

export function LoginExtraSetting({ value, onChange, colors, onPreview }: { value: LoginLook; onChange: (p: Partial<LoginLook>) => void; colors: SiteTheme["colors"]; onPreview: (path: string) => void }) {
  const t = useT();
  const perks = value.perks;
  const setPerk = (i: number, text: string) => onChange({ perks: perks.map((p, j) => (j === i ? text : p)) });

  return (
    <div className="space-y-3 mt-3 border-t border-slate-100 pt-3" data-login-design>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">{t("💬 ป๊อปสมัคร / เข้าสู่ระบบ", "💬 Sign-up / login popup")}</span>
        <button type="button" onClick={() => onPreview("/account/login?auth=signup")} className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 hover:border-slate-500">
          {t("👁 ดูป๊อปสมัคร", "👁 View sign-up popup")}
        </button>
        <span className="text-[11px] text-slate-400">{t("ร้านที่ยังไม่ตั้ง Google/LINE/Facebook = พรีวิวโชว์ปุ่มตัวอย่าง", "Shops without Google/LINE/Facebook set up see sample buttons in the preview")}</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <p className="text-[11px] text-slate-500 mb-1">{t("หัวป๊อป (ว่าง = \"สมาชิก\")", "Popup title (empty = default)")}</p>
          <LangInput className={webForm.input} obj={value} k="popupTitle" maxLength={40} placeholder="สมาชิก" onPatch={(p) => onChange(p as Partial<LoginLook>)} />
        </div>
        <div>
          <p className="text-[11px] text-slate-500 mb-1">{t("ข้อความปุ่มสมัครบนหัวเว็บ (ว่าง = \"สมัครสมาชิก\")", "Header sign-up button text (empty = default)")}</p>
          <LangInput className={webForm.input} obj={value} k="signupLabel" maxLength={30} placeholder="สมัครสมาชิก" onPatch={(p) => onChange(p as Partial<LoginLook>)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Toggle checked={value.perksOn} onChange={(v) => onChange({ perksOn: v })}>
          {t("กล่องข้อดีของสมาชิก (แท็บสมัคร)", "Member benefits box (sign-up tab)")}
        </Toggle>
        {value.perksOn && (
          <div className="space-y-1 pl-5">
            {(perks.length ? perks : []).map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input className={webForm.input} value={p} maxLength={80} onChange={(e) => setPerk(i, e.target.value)} aria-label={t(`ข้อดีบรรทัด ${i + 1}`, `Benefit line ${i + 1}`)} />
                <button type="button" className="h-7 w-7 rounded border border-slate-200 text-xs text-red-600" onClick={() => onChange({ perks: perks.filter((_, j) => j !== i) })} aria-label={t("ลบบรรทัด", "Delete line")}>
                  ✕
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {perks.length < 6 && (
                <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => onChange({ perks: perks.length ? [...perks, ""] : [...DEFAULT_PERKS] })}>
                  {perks.length ? t("+ เพิ่มบรรทัด", "+ Add line") : t("✏️ เขียนข้อความเอง (เริ่มจากข้อความเดิม)", "✏️ Write your own (start from the default text)")}
                </button>
              )}
              {perks.length > 0 && (
                <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => onChange({ perks: [] })}>
                  {t("↺ ใช้ข้อความตั้งต้น", "↺ Use default text")}
                </button>
              )}
            </div>
            {!perks.length && <p className="text-[11px] text-slate-400">{t("ตอนนี้ใช้ข้อความตั้งต้น:", "Currently using default text:")} {DEFAULT_PERKS.join(" · ")} {t("(แต้มโชว์เฉพาะร้านที่เปิดแต้ม)", "(points only show if the shop has points on)")}</p>}
          </div>
        )}
        <Toggle checked={value.guestLink} onChange={(v) => onChange({ guestLink: v })}>
          {t("ลิงก์ \"สั่งซื้อได้เลยโดยไม่ต้องสมัคร\"", "\"Order without an account\" link")}
        </Toggle>
      </div>

      <div className="space-y-1">
        <span className="text-[11px] text-slate-500">{t("สีปุ่ม Google / LINE / Facebook", "Google / LINE / Facebook button color")}</span>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { v: "brand", l: t("สีของแต่ละเจ้า", "Each provider's color"), d: t("แบบเดิม", "Original") },
              { v: "mono", l: t("สีเข้มของร้าน", "Shop dark color"), d: t("ทุกปุ่มสีเดียว", "All buttons one color") },
              { v: "outline", l: t("ขอบเส้น", "Outline"), d: t("พื้นโปร่ง", "Transparent") },
            ] as const
          ).map((o) => (
            <button key={o.v} type="button" className={pill(value.providerStyle === o.v)} onClick={() => onChange({ providerStyle: o.v })}>
              <span className="block font-medium">{o.l}</span>
              <span className={`block text-[10px] ${o.v === "brand" ? "text-emerald-600" : "text-slate-400"}`}>{o.d}</span>
            </button>
          ))}
        </div>
      </div>

      <PartStyleFold parts={LOGIN_PARTS} value={value.parts} onChange={(parts) => onChange({ parts })} colors={colors} onOpen={() => onPreview("/account/login?auth=signup")} hint={t("ป๊อป · ปุ่ม · หน้าเข้าสู่ระบบ · ปุ่มสมัครบนหัวเว็บ", "Popup · buttons · login page · header sign-up button")} testId="login" />
    </div>
  );
}
