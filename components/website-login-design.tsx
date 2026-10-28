"use client";

/**
 * 👤 ตั้งค่าป๊อปสมัคร/เข้าสู่ระบบ + ปุ่มสมัครบนหัวเว็บ — ส่วนเสริมในการ์ด "หน้าเข้าสู่ระบบ" (แท็บดีไซน์ › 📄 หน้าพิเศษ)
 *
 * ข้อความหัวป๊อป / ปุ่มสมัคร (ไทย+อังกฤษ) · กล่องข้อดีสมาชิก (เปิด/ปิด + เขียนเอง) · ลิงก์สั่งโดยไม่สมัคร · สีปุ่ม Google/LINE/Facebook
 * 🎨 ปรับละเอียดทีละชิ้น = ของกลาง PartStyleEditor + ทะเบียน LOGIN_PARTS (คลิกเลือกในพรีวิวได้)
 * ค่า theme.page.login (normalizeLogin — มิเรอร์ lib/website-site-design ↔ เว็บร้าน) · ค่าเริ่ม = หน้าตาเดิม
 * พรีวิว: /account/login (ร้านที่ยังไม่ตั้งช่องทาง = ปุ่มตัวอย่าง) · ?auth=signup = เปิดป๊อปทันที
 */
import { useState, type ReactNode } from "react";
import { LangInput } from "@/components/bilingual-field";
import { PartStyleEditor } from "@/components/website-part-style-editor";
import { webForm } from "@/lib/website-form-styles";
import type { LoginLook } from "@/lib/website-site-design";
import { LOGIN_PARTS } from "@/lib/website-page-parts";
import type { SiteTheme } from "@/lib/website-theme";

const DEFAULT_PERKS = ["⭐ สะสมแต้มทุกออเดอร์ แลกเป็นส่วนลด", "📦 ดูและติดตามออเดอร์ได้ตลอด", "🏠 จำที่อยู่จัดส่ง สั่งครั้งหน้าเร็วขึ้น", "🎟️ รับคูปองและสิทธิ์เฉพาะสมาชิก"];

const pill = (on: boolean) => `rounded-lg border px-2.5 py-1.5 text-left text-xs leading-tight ${on ? "border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-500" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;
const Toggle = ({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) => (
  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {children}
  </label>
);

export function LoginExtraSetting({ value, onChange, colors, onPreview }: { value: LoginLook; onChange: (p: Partial<LoginLook>) => void; colors: SiteTheme["colors"]; onPreview: (path: string) => void }) {
  const [fine, setFine] = useState(false);
  const perks = value.perks;
  const setPerk = (i: number, text: string) => onChange({ perks: perks.map((p, j) => (j === i ? text : p)) });

  return (
    <div className="space-y-3 mt-3 border-t border-slate-100 pt-3" data-login-design>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">💬 ป๊อปสมัคร / เข้าสู่ระบบ</span>
        <button type="button" onClick={() => onPreview("/account/login?auth=signup")} className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 hover:border-slate-500">
          👁 ดูป๊อปสมัคร
        </button>
        <span className="text-[11px] text-slate-400">ร้านที่ยังไม่ตั้ง Google/LINE/Facebook = พรีวิวโชว์ปุ่มตัวอย่าง</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <p className="text-[11px] text-slate-500 mb-1">หัวป๊อป (ว่าง = &quot;สมาชิก&quot;)</p>
          <LangInput className={webForm.input} obj={value} k="popupTitle" maxLength={40} placeholder="สมาชิก" onPatch={(p) => onChange(p as Partial<LoginLook>)} />
        </div>
        <div>
          <p className="text-[11px] text-slate-500 mb-1">ข้อความปุ่มสมัครบนหัวเว็บ (ว่าง = &quot;สมัครสมาชิก&quot;)</p>
          <LangInput className={webForm.input} obj={value} k="signupLabel" maxLength={30} placeholder="สมัครสมาชิก" onPatch={(p) => onChange(p as Partial<LoginLook>)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Toggle checked={value.perksOn} onChange={(v) => onChange({ perksOn: v })}>
          กล่องข้อดีของสมาชิก (แท็บสมัคร)
        </Toggle>
        {value.perksOn && (
          <div className="space-y-1 pl-5">
            {(perks.length ? perks : []).map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input className={webForm.input} value={p} maxLength={80} onChange={(e) => setPerk(i, e.target.value)} aria-label={`ข้อดีบรรทัด ${i + 1}`} />
                <button type="button" className="h-7 w-7 rounded border border-slate-200 text-xs text-red-600" onClick={() => onChange({ perks: perks.filter((_, j) => j !== i) })} aria-label="ลบบรรทัด">
                  ✕
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {perks.length < 6 && (
                <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => onChange({ perks: perks.length ? [...perks, ""] : [...DEFAULT_PERKS] })}>
                  {perks.length ? "+ เพิ่มบรรทัด" : "✏️ เขียนข้อความเอง (เริ่มจากข้อความเดิม)"}
                </button>
              )}
              {perks.length > 0 && (
                <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => onChange({ perks: [] })}>
                  ↺ ใช้ข้อความตั้งต้น
                </button>
              )}
            </div>
            {!perks.length && <p className="text-[11px] text-slate-400">ตอนนี้ใช้ข้อความตั้งต้น: {DEFAULT_PERKS.join(" · ")} (แต้มโชว์เฉพาะร้านที่เปิดแต้ม)</p>}
          </div>
        )}
        <Toggle checked={value.guestLink} onChange={(v) => onChange({ guestLink: v })}>
          ลิงก์ &quot;สั่งซื้อได้เลยโดยไม่ต้องสมัคร&quot;
        </Toggle>
      </div>

      <div className="space-y-1">
        <span className="text-[11px] text-slate-500">สีปุ่ม Google / LINE / Facebook</span>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { v: "brand", l: "สีของแต่ละเจ้า", d: "แบบเดิม" },
              { v: "mono", l: "สีเข้มของร้าน", d: "ทุกปุ่มสีเดียว" },
              { v: "outline", l: "ขอบเส้น", d: "พื้นโปร่ง" },
            ] as const
          ).map((o) => (
            <button key={o.v} type="button" className={pill(value.providerStyle === o.v)} onClick={() => onChange({ providerStyle: o.v })}>
              <span className="block font-medium">{o.l}</span>
              <span className={`block text-[10px] ${o.v === "brand" ? "text-emerald-600" : "text-slate-400"}`}>{o.d}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => {
            setFine((v) => !v);
            if (!fine) onPreview("/account/login?auth=signup");
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700"
          data-open-login-part-editor
        >
          🎨 ปรับละเอียดทีละชิ้น (ป๊อป · ปุ่ม · หน้าเข้าสู่ระบบ · ปุ่มสมัครบนหัวเว็บ)
          <span className="ml-auto text-xs text-slate-400">{Object.keys(value.parts).length ? `ปรับแล้ว ${Object.keys(value.parts).length} ชิ้น` : "ยังไม่ได้ปรับ"}</span>
          <span className="text-slate-400">{fine ? "▾" : "▸"}</span>
        </button>
        {fine && (
          <div className="px-3 pb-3">
            <PartStyleEditor parts={LOGIN_PARTS} value={value.parts} onChange={(parts) => onChange({ parts })} colors={colors} />
          </div>
        )}
      </div>
    </div>
  );
}
