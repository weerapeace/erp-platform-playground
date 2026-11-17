"use client";

/**
 * 👤 ตั้งค่าหน้าตา "บัญชีของฉัน" ของเว็บร้าน — การ์ดในแท็บดีไซน์ › 📄 หน้าพิเศษ (theme.page.account)
 *
 * ① ส่วนหัว (4 แบบ · ข้อความทักทาย · ป้ายใต้ชื่อ) ② เมนู (4 แบบ · ไอคอนอีโมจิ/เส้น/ไม่มี · ลำดับ/ชื่อ/ไอคอน/ซ่อน · แท็บแรก)
 * ③ กล่องเนื้อหา (แบบกล่อง · กล่องเพิ่มออเดอร์เก่า · ข้อความตอนว่าง · โปรไฟล์แบบฟอร์ม/แถว) ④ ส่วนเสริม (แถบประกาศ · สินค้าแนะนำ · ช่วยเหลือ · ความกว้าง · กล่องข้างขวา)
 * ⑤ จัดวาง (ลำดับส่วนในหน้า · เมนูซ้าย/ขวา) ✨ ลูกเล่น (พื้นหลังวงกลมเบลอ/รูปภาพ · ของลอย · กระจกฝ้า · ทักทายตามเวลา · เลขแต้มวิ่ง · เปลี่ยนแท็บนุ่ม · บัตรเอียงตามเมาส์)
 * ⚡ แบบสำเร็จรูป "หน้าต่างแอป" = ตั้งหลายช่องในคลิกเดียว (ปรับต่อเองได้ทุกช่อง)
 * 🎨 ปรับละเอียดทีละชิ้น = ของกลาง PartStyleEditor + ทะเบียนชิ้นส่วน ACCOUNT_PARTS (คลิกเลือกในพรีวิวได้)
 * ค่าเริ่ม = หน้าตาเดิม · ตัวตรวจค่า normalizeAccount (lib/website-site-design — มิเรอร์กับเว็บร้าน) · เว็บร้าน components/account/AccountClient
 * พรีวิว: /account ในกรอบพรีวิว = ข้อมูลตัวอย่าง (ไม่ต้องล็อกอิน)
 */
import { type ReactNode } from "react";
import { LangInput } from "@/components/bilingual-field";
import { ImageInput } from "@/components/image-input";
import { RangeInput } from "@/components/range-input";
import { SiteIconPicker } from "@/components/site-icon-picker";
import { PartStyleFold } from "@/components/website-part-style-editor";
import { webForm } from "@/lib/website-form-styles";
import { ACCOUNT_BG_FADE_RANGE, ACCOUNT_TAB_DEFAULTS, DEFAULT_ACCOUNT_LOOK, FLOAT_COUNT_RANGE, type AccountBlock, type AccountEmptyKey, type AccountLook, type AccountTabKey } from "@/lib/website-site-design";
import { ACCOUNT_PARTS } from "@/lib/website-page-parts";
import type { SiteTheme } from "@/lib/website-theme";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

function Opt<T extends string>({ value, onChange, options, def }: { value: T; onChange: (v: T) => void; options: { v: T; l: string; d?: string }[]; def?: T }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`rounded-lg border px-2.5 py-1.5 text-left text-xs leading-tight ${value === o.v ? "border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-500" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          <span className="block font-medium">{o.l}</span>
          {(o.d || o.v === def) && <span className={`block text-[10px] ${o.v === def ? "text-emerald-600" : "text-slate-400"}`}>{o.v === def ? t("แบบเดิม", "Original") : o.d}</span>}
        </button>
      ))}
    </div>
  );
}

/** off = ปุ่มนี้ไม่มีผลกับแบบที่เลือกอยู่ (ยังกดได้ — แค่จาง + บอกเหตุผล ไม่งั้นกดแล้วงงว่าทำไมพรีวิวไม่เปลี่ยน) */
const Toggle = ({ checked, onChange, children, off }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; off?: string }) => (
  <label className={`flex items-center gap-2 text-xs cursor-pointer ${off ? "text-slate-400" : "text-slate-700"}`} title={off}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>
      {children}
      {off && <span className="ml-1 text-[10px] text-amber-700">· {off}</span>}
    </span>
  </label>
);

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="rounded-lg border border-slate-200 bg-white">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-700">{title}</summary>
      <div className="px-3 pb-3 space-y-3">{children}</div>
    </details>
  );
}

const blockLabel = (): Record<AccountBlock, string> => ({
  notice: tr("📢 แถบประกาศ", "📢 Announcement bar"),
  header: tr("🙂 ส่วนหัว (รูป + ชื่อ)", "🙂 Header (photo + name)"),
  body: tr("📑 เมนู + เนื้อหา", "📑 Menu + content"),
  help: tr("💬 กล่องช่วยเหลือ", "💬 Help box"),
  reco: tr("🛍 สินค้าแนะนำ", "🛍 Recommended products"),
});

/** ⚡ แบบสำเร็จรูป — ตั้งหลายช่องพร้อมกัน (ค่าอื่นคงเดิม · ปรับต่อเองได้) */
const presets = (): { k: string; l: string; d: string; p: Partial<AccountLook> }[] => [
  {
    k: "app",
    l: tr("🪟 หน้าต่างแอป", "🪟 App window"),
    d: tr("กรอบมนใหญ่ · เมนูในกรอบ · วงกลมเบลอ · กระจกฝ้า", "Large rounded frame · menu inside · blurred circles · frosted glass"),
    p: {
      nav: "panel",
      navIcons: "line",
      navSide: "left",
      profileStyle: "rows",
      decor: "blobs",
      glass: true,
      tabAnim: "fade",
      aside: { on: true, icon: "💡", title: "คู่มือใช้งานบัญชี", text: "ดูออเดอร์ · ใช้คูปอง · แก้ข้อมูล ได้ในที่เดียว", href: "" },
    },
  },
  {
    k: "card",
    l: tr("💳 บัตรสมาชิก", "💳 Member card"),
    d: tr("หัวเป็นบัตรเอียงได้ · เลขแต้มวิ่ง · ไอคอนแบบแอป", "Tilting card header · counting points · app-style icons"),
    p: { header: "card", nav: "tiles", tilt: true, flip: true, celebrate: true, orderTimeline: true, countUp: true, timeGreeting: true, decor: "wash", glass: false, tabAnim: "slide" },
  },
  {
    k: "plain",
    l: tr("↺ แบบเดิม", "↺ Original"),
    d: tr("คืนเฉพาะการจัดวาง + ลูกเล่น", "Resets layout + effects only"),
    p: {
      header: DEFAULT_ACCOUNT_LOOK.header,
      nav: DEFAULT_ACCOUNT_LOOK.nav,
      navSide: "left",
      profileStyle: "form",
      order: [...DEFAULT_ACCOUNT_LOOK.order],
      decor: "none",
      glass: false,
      timeGreeting: false,
      countUp: false,
      tabAnim: "none",
      tilt: false,
      flip: false,
      celebrate: false,
      orderTimeline: false,
      aside: { ...DEFAULT_ACCOUNT_LOOK.aside },
    },
  },
];

const emptyFallback = (): Record<AccountEmptyKey, { label: string; text: string; button: string; href: string }> => ({
  orders: { label: tr("📦 ยังไม่มีออเดอร์", "📦 No orders yet"), text: "ยังไม่มีออเดอร์ในบัญชี", button: "เลือกซื้อสินค้า", href: "/shop" },
  wishlist: { label: tr("❤️ ยังไม่มีรายการโปรด", "❤️ No wishlist items yet"), text: "ยังไม่มีรายการโปรด — กด ♡ ที่สินค้าที่ชอบ เก็บไว้ดูทีหลัง", button: "เลือกดูสินค้า", href: "/shop" },
  addresses: { label: tr("📍 ยังไม่มีที่อยู่", "📍 No addresses yet"), text: tr("(ไม่มีข้อความ)", "(no text)"), button: "", href: "" },
});

export function AccountPageSetting({ value, onChange, colors, onPreview }: { value: AccountLook; onChange: (v: AccountLook) => void; colors: SiteTheme["colors"]; onPreview: (path: string) => void }) {
  const t = useT();
  const set = (p: Partial<AccountLook>) => onChange({ ...value, ...p });
  const d = DEFAULT_ACCOUNT_LOOK;
  const tabs = value.tabs;
  const setTab = (i: number, p: Partial<(typeof tabs)[number]>) => set({ tabs: tabs.map((t, j) => (j === i ? { ...t, ...p } : t)) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= tabs.length) return;
    const next = [...tabs];
    [next[i], next[j]] = [next[j], next[i]];
    set({ tabs: next });
  };
  const setEmpty = (k: AccountEmptyKey, p: Partial<AccountLook["empty"][AccountEmptyKey]>) => set({ empty: { ...value.empty, [k]: { ...value.empty[k], ...p } } });
  const visibleTabs = tabs.filter((t) => !t.hidden);
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.order.length) return;
    const next = [...value.order];
    [next[i], next[j]] = [next[j], next[i]];
    set({ order: next });
  };
  const setAside = (p: Partial<AccountLook["aside"]>) => set({ aside: { ...value.aside, ...p } });
  // ปุ่มที่มีผลเฉพาะบางแบบ (เว็บร้าน AccountClient) — จาง + บอกเหตุผล
  const cardOff = value.nav === "panel" ? t("แบบหน้าต่างแอปไม่มีบัตรสมาชิก", "App window style has no member card") : value.header !== "card" ? t("ใช้ได้เมื่อส่วนหัวเป็นแบบ “บัตรสมาชิก”", "Works when the header is “Member card”") : undefined;
  const customIcons = visibleTabs.filter((t) => t.icon).length;

  return (
    <div className="space-y-2" data-account-design>
      <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-2.5 space-y-1.5">
        <span className="block text-[11px] font-medium text-violet-800">{t("⚡ แบบสำเร็จรูป — กดแล้วปรับต่อเองได้ทุกช่อง", "⚡ Presets — click, then fine-tune any field")}</span>
        <div className="flex flex-wrap gap-1.5">
          {presets().map((x) => (
            <button key={x.k} type="button" onClick={() => set(x.p)} className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-left text-xs leading-tight hover:bg-violet-50" data-account-preset={x.k}>
              <span className="block font-medium text-slate-800">{x.l}</span>
              <span className="block text-[10px] text-slate-500">{x.d}</span>
            </button>
          ))}
        </div>
      </div>
      <Section title={t("① ส่วนหัว", "① Header")} open>
        {value.nav === "panel" && <p className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{t("แบบเมนู \"หน้าต่างแอป\" ย่อส่วนหัวไปอยู่มุมขวาบนในกรอบ (ชื่อ · ป้าย · รูปโปรไฟล์) — แบบหัวด้านล่างใช้กับเมนูแบบอื่น", "The \"App window\" menu shrinks the header into the top-right of the frame (name · badge · profile photo) — the header styles below apply to other menus")}</p>}
        <div className={value.nav === "panel" ? "opacity-50" : undefined} title={value.nav === "panel" ? t("แบบหน้าต่างแอปไม่ใช้แบบส่วนหัวนี้", "App window style doesn't use these header styles") : undefined}>
        <Opt
          value={value.header}
          def={d.header}
          onChange={(v) => set({ header: v })}
          options={[
            { v: "simple", l: t("รูป + ชื่อ", "Photo + name") },
            { v: "center", l: t("อยู่กลาง", "Centered") },
            { v: "banner", l: t("แถบรูปปก", "Cover banner"), d: t("มีรูปพื้นหลัง", "With background image") },
            { v: "card", l: t("บัตรสมาชิก", "Member card"), d: t("สีตามระดับ + แต้ม", "Tier color + points") },
          ]}
        />
        </div>
        {value.header === "banner" && (
          <div className="max-w-xs">
            <span className={webForm.label}>{t("รูปปก (ไม่ใส่ = ไล่สีจากสีหลัก)", "Cover image (empty = brand color gradient)")}</span>
            <ImageInput value={value.imageKey} onChange={(k) => set({ imageKey: k || null })} folder="website-pages" />
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="block">
            <span className={webForm.label}>{t("ข้อความทักทาย (", "Greeting (")}{"{ชื่อ}"} {t("หรือ", "or")} {"{name}"} {t("= ชื่อสมาชิก · ปุ่ม TH/EN = หน้าภาษาอังกฤษ)", "= member name · TH/EN button = English page)")}</span>
            <LangInput className={webForm.input} obj={value} k="greeting" onPatch={(p) => set(p)} placeholder="บัญชีของฉัน" enPlaceholder="My account" maxLength={80} />
          </label>
          <label className="block">
            <span className={webForm.label}>{t("ข้อความรอง (ว่างได้)", "Subtext (optional)")}</span>
            <LangInput className={webForm.input} obj={value} k="subtext" onPatch={(p) => set(p)} placeholder="เช่น ขอบคุณที่เป็นครอบครัวเดียวกัน 💗" maxLength={160} />
          </label>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <Toggle checked={value.showEmail} onChange={(v) => set({ showEmail: v })}>{t("อีเมล", "Email")}</Toggle>
          <Toggle checked={value.showTier} onChange={(v) => set({ showTier: v })}>{t("ป้ายระดับสมาชิก", "Member tier badge")}</Toggle>
          <Toggle checked={value.showPoints} onChange={(v) => set({ showPoints: v })}>{t("แต้มคงเหลือ", "Points balance")}</Toggle>
          <Toggle checked={value.showSince} onChange={(v) => set({ showSince: v })}>{t("สมาชิกตั้งแต่", "Member since")}</Toggle>
        </div>
      </Section>

      <Section title={t("② เมนูในหน้า", "② Page menu")} open>
        <Opt
          value={value.nav}
          def={d.nav}
          onChange={(v) => set({ nav: v })}
          options={[
            { v: "pills", l: t("ปุ่มเม็ดยา", "Pills") },
            { v: "under", l: t("ขีดเส้นใต้", "Underline") },
            { v: "side", l: t("เมนูด้านซ้าย", "Left menu"), d: t("มือถือ = แถบบน", "Mobile = top bar") },
            { v: "tiles", l: t("ไอคอนแบบแอป", "App icons"), d: t("ตาราง", "Grid") },
            { v: "panel", l: t("หน้าต่างแอป", "App window"), d: t("กรอบมน · เมนูในกรอบ", "Rounded frame · menu inside") },
          ]}
        />
        {(value.nav === "side" || value.nav === "panel") && (
          <div className="flex flex-wrap items-end gap-3">
            {value.nav === "panel" && (
              <label className="block">
                <span className={webForm.label}>{t("หัวเมนูข้าง", "Side menu title")}</span>
                <LangInput className={`${webForm.input} !w-44`} obj={value} k="panelTitle" onPatch={(p) => set(p)} placeholder="บัญชีของฉัน" enPlaceholder="My account" maxLength={40} />
              </label>
            )}
            <div className="space-y-1">
              <span className={webForm.label}>{t("เมนูอยู่ฝั่ง (จอคอม)", "Menu side (desktop)")}</span>
              <Opt value={value.navSide} def={d.navSide} onChange={(v) => set({ navSide: v })} options={[{ v: "left", l: t("◧ ซ้าย", "◧ Left") }, { v: "right", l: t("◨ ขวา", "◨ Right") }]} />
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] text-slate-500">{t("ไอคอนหน้าชื่อเมนู", "Icon before menu name")}</span>
          <Opt value={value.navIcons} def={d.navIcons} onChange={(v) => set({ navIcons: v })} options={[{ v: "emoji", l: t("อีโมจิ", "Emoji") }, { v: "line", l: t("ไอคอนเส้น", "Line icons") }, { v: "none", l: t("ไม่มี", "None") }]} />
          <Toggle checked={value.showCounts} onChange={(v) => set({ showCounts: v })}>{t("โชว์ตัวเลขจำนวน", "Show counts")}</Toggle>
        </div>
        {value.navIcons !== "none" && customIcons > 0 && (
          <p className="text-[11px] text-amber-700">{t("เมนู", "Menu:")} {customIcons} {t("แถวเลือกไอคอนเองไว้ — เปลี่ยน อีโมจิ/ไอคอนเส้น แล้วแถวนั้นไม่เปลี่ยนตาม (กด ↺ ที่แถวเพื่อกลับไปใช้ไอคอนตามแบบ)", "rows have custom icons — switching emoji/line icons won't change them (click ↺ on the row to use the style icon again)")}</p>
        )}
        <div className="space-y-1.5">
          <span className={webForm.label}>{t("ลำดับ · ชื่อ · ไอคอน · ซ่อน (แต้ม/คูปองโชว์เฉพาะร้านที่เปิด · โปรไฟล์ซ่อนไม่ได้)", "Order · name · icon · hide (points/coupons only show if the shop has them on · profile can't be hidden)")}</span>
          {tabs.map((t, i) => {
            const def = ACCOUNT_TAB_DEFAULTS[t.key];
            return (
              <div key={t.key} className={`flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 ${t.hidden ? "opacity-50" : ""}`} data-account-tab-row={t.key}>
                <button type="button" className="h-7 w-7 rounded border border-slate-200 bg-white text-xs disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={tr("เลื่อนขึ้น", "Move up")}>
                  ↑
                </button>
                <button type="button" className="h-7 w-7 rounded border border-slate-200 bg-white text-xs disabled:opacity-30" disabled={i === tabs.length - 1} onClick={() => move(i, 1)} aria-label={tr("เลื่อนลง", "Move down")}>
                  ↓
                </button>
                <LangInput className={`${webForm.input} !w-40 flex-1`} obj={t} k="label" placeholder={def.label} enPlaceholder={def.labelEn} onPatch={(p) => setTab(i, p)} maxLength={40} ariaLabel={tr(`ชื่อเมนู ${def.label}`, `Menu name ${def.labelEn}`)} />
                {value.navIcons !== "none" && (
                  <div className="flex items-center gap-1">
                    <SiteIconPicker value={t.icon || (value.navIcons === "line" ? def.line : def.emoji)} onChange={(v) => setTab(i, { icon: v })} label={tr("ไอคอน", "Icon")} />
                    {t.icon && (
                      <button type="button" className="text-[11px] text-blue-600 hover:underline" onClick={() => setTab(i, { icon: "" })} title={tr("กลับไอคอนเดิม", "Back to default icon")}>
                        ↺
                      </button>
                    )}
                  </div>
                )}
                {t.key === "profile" ? (
                  <span className="text-[11px] text-slate-400 px-1" title={tr("มีปุ่มออกจากระบบ/ลบบัญชี", "Has log out/delete account buttons")}>
                    🔒
                  </span>
                ) : (
                  <button type="button" className="h-7 px-2 rounded border border-slate-200 bg-white text-xs" onClick={() => setTab(i, { hidden: !t.hidden })}>
                    {t.hidden ? tr("🚫 ซ่อน", "🚫 Hidden") : tr("👁 โชว์", "👁 Shown")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <label className="block max-w-xs">
          <span className={webForm.label}>{t("เปิดหน้าไหนก่อน", "Open first")}</span>
          <select className={webForm.input} value={value.firstTab} onChange={(e) => set({ firstTab: e.target.value as AccountTabKey })}>
            {visibleTabs.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label || tr(ACCOUNT_TAB_DEFAULTS[t.key].label, ACCOUNT_TAB_DEFAULTS[t.key].labelEn)}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section title={t("③ กล่องเนื้อหา", "③ Content boxes")}>
        <div className="space-y-1">
          <span className={webForm.label}>{t("แบบกล่อง", "Box style")}</span>
          <Opt value={value.cards} def={d.cards} onChange={(v) => set({ cards: v })} options={[{ v: "card", l: t("การ์ดพื้นสี", "Filled card") }, { v: "line", l: t("กรอบเส้น", "Outlined") }, { v: "flat", l: t("เรียบ ไม่มีกรอบ", "Flat, no border") }]} />
        </div>
        <div className="space-y-1">
          <span className={webForm.label}>{t("กล่อง \"เคยสั่งแบบไม่ได้สมัคร?\"", "\"Ordered without an account?\" box")}</span>
          <Opt value={value.claim} def={d.claim} onChange={(v) => set({ claim: v })} options={[{ v: "box", l: t("กล่องเต็ม", "Full box") }, { v: "link", l: t("ย่อเป็นลิงก์", "Collapse to link") }, { v: "hide", l: t("ซ่อน", "Hide") }]} />
        </div>
        <div className="space-y-1">
          <span className={webForm.label}>{t("แท็บโปรไฟล์", "Profile tab")}</span>
          <Opt value={value.profileStyle} def={d.profileStyle} onChange={(v) => set({ profileStyle: v })} options={[{ v: "form", l: t("ฟอร์ม", "Form") }, { v: "rows", l: t("แถวข้อมูล ›", "Info rows ›"), d: t("กดแถวแก้ทีละช่อง", "Tap a row to edit one field") }]} />
        </div>
        {(Object.keys(emptyFallback()) as AccountEmptyKey[]).map((k) => {
          const fb = emptyFallback()[k];
          const e = value.empty[k];
          return (
            <div key={k} className="grid sm:grid-cols-[2fr_1fr_1fr] gap-2 items-end">
              <label className="block">
                <span className={webForm.label}>{fb.label} {t("— ข้อความ", "— text")}</span>
                <LangInput className={webForm.input} obj={e} k="text" onPatch={(p) => setEmpty(k, p)} placeholder={fb.text} maxLength={200} />
              </label>
              {k !== "addresses" && (
                <>
                  <label className="block">
                    <span className={webForm.label}>{t("ปุ่ม", "Button")}</span>
                    <LangInput className={webForm.input} obj={e} k="button" onPatch={(p) => setEmpty(k, p)} placeholder={fb.button} maxLength={40} />
                  </label>
                  <label className="block">
                    <span className={webForm.label}>{t("ไปที่ (/หน้า หรือ https://)", "Link to (/page or https://)")}</span>
                    <input className={webForm.input} value={e.href} onChange={(ev) => setEmpty(k, { href: ev.target.value })} placeholder={fb.href} maxLength={300} />
                  </label>
                </>
              )}
            </div>
          );
        })}
      </Section>

      <Section title={t("④ ส่วนเสริม", "④ Extras")}>
        <Toggle checked={value.notice.on} onChange={(v) => set({ notice: { ...value.notice, on: v } })}>
          {t("แถบประกาศสำหรับสมาชิก (บนสุดของหน้า)", "Member announcement bar (top of page)")}
        </Toggle>
        {value.notice.on && (
          <div className="flex flex-wrap items-center gap-2">
            <LangInput className={`${webForm.input} flex-1 min-w-[14rem]`} obj={value.notice} k="text" onPatch={(p) => set({ notice: { ...value.notice, ...p } })} placeholder="เช่น สมาชิกระดับ Gold รับส่งฟรีทุกออเดอร์ ✨" maxLength={200} />
            <Opt value={value.notice.tone} onChange={(v) => set({ notice: { ...value.notice, tone: v } })} options={[{ v: "soft", l: t("สีอ่อน", "Soft") }, { v: "brand", l: t("สีหลัก", "Brand color") }]} />
          </div>
        )}
        <Toggle checked={value.recommend} onChange={(v) => set({ recommend: v })}>
          {t("สินค้าแนะนำท้ายหน้า (4 ชิ้น ตามลำดับสินค้าของร้าน ที่ยังไม่ได้กดใจ)", "Recommended products at the bottom (4 items in shop order, not yet hearted)")}
        </Toggle>
        <Toggle checked={value.help} onChange={(v) => set({ help: v })}>
          {t("กล่อง \"ต้องการความช่วยเหลือ?\" (LINE / โทร / อีเมล จากแท็บข้อมูลร้าน)", "\"Need help?\" box (LINE / phone / email from Shop info)")}
        </Toggle>
        <div className="space-y-1">
          <span className={webForm.label}>{t("ความกว้างหน้า", "Page width")}</span>
          <Opt value={value.width} def={d.width} onChange={(v) => set({ width: v })} options={[{ v: "site", l: t("ตามทั้งเว็บ", "Same as site") }, { v: "narrow", l: t("แคบ อ่านง่าย", "Narrow, easy to read") }]} />
        </div>
        <Toggle checked={value.aside.on} onChange={(v) => setAside({ on: v })}>
          {t("กล่องข้างขวา (คู่มือ / โปรสมาชิก) — จอกว้างอยู่ขวา · จอเล็กอยู่ท้ายเนื้อหา", "Right side box (guide / member promo) — right on wide screens · below content on small screens")}
        </Toggle>
        {value.aside.on && (
          <div className="grid sm:grid-cols-[auto_1fr_1fr] gap-2 items-end" data-account-aside>
            <SiteIconPicker value={value.aside.icon} onChange={(v) => setAside({ icon: v })} label={t("ไอคอน", "Icon")} />
            <label className="block">
              <span className={webForm.label}>{t("หัวข้อ", "Title")}</span>
              <LangInput className={webForm.input} obj={value.aside} k="title" onPatch={(p) => setAside(p)} placeholder="คู่มือใช้งานบัญชี" maxLength={60} />
            </label>
            <label className="block">
              <span className={webForm.label}>{t("กดแล้วไปที่ (ว่าง = กดไม่ได้)", "Link to (empty = not clickable)")}</span>
              <input className={webForm.input} value={value.aside.href} onChange={(e) => setAside({ href: e.target.value })} placeholder={t("/help หรือ https://", "/help or https://")} maxLength={300} />
            </label>
            <label className="block sm:col-span-3">
              <span className={webForm.label}>{t("ข้อความ", "Text")}</span>
              <LangInput multiline className={webForm.input} rows={2} obj={value.aside} k="text" onPatch={(p) => setAside(p)} placeholder="เช่น สมาชิก Gold รับส่วนลด 10% ทุกออเดอร์" maxLength={200} />
            </label>
          </div>
        )}
      </Section>

      <Section title={t("⑤ จัดวาง — ลำดับส่วนในหน้า", "⑤ Layout — section order")}>
        <div className="space-y-1.5">
          {value.order.map((b, i) => (
            <div key={b} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700" data-account-block={b}>
              <button type="button" className="h-7 w-7 rounded border border-slate-200 bg-white disabled:opacity-30" disabled={i === 0} onClick={() => moveBlock(i, -1)} aria-label={t("เลื่อนขึ้น", "Move up")}>
                ↑
              </button>
              <button type="button" className="h-7 w-7 rounded border border-slate-200 bg-white disabled:opacity-30" disabled={i === value.order.length - 1} onClick={() => moveBlock(i, 1)} aria-label={t("เลื่อนลง", "Move down")}>
                ↓
              </button>
              <span className="flex-1">{blockLabel()[b]}</span>
              {b === "header" && value.nav === "panel" && <span className="text-[10px] text-slate-400">{t("อยู่ในกรอบแล้ว", "Already in the frame")}</span>}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">{t("เปิด/ปิดแต่ละส่วนที่ ① และ ④ · ปรับระยะ/สี/ขนาดละเอียดที่ 🎨 ด้านล่าง", "Turn sections on/off in ① and ④ · fine-tune spacing/color/size in 🎨 below")}</p>
      </Section>

      <Section title={t("✨ ลูกเล่น", "✨ Effects")}>
        <div className="space-y-1">
          <span className={webForm.label}>{t("พื้นหลังหน้า", "Page background")}</span>
          <Opt
            value={value.decor}
            def={d.decor}
            onChange={(v) => set({ decor: v })}
            options={[{ v: "none", l: t("เรียบ", "Plain") }, { v: "blobs", l: t("วงกลมเบลอ", "Blurred circles"), d: t("สีตามสีหลักร้าน", "Uses the brand color") }, { v: "wash", l: t("ไล่สีจาง", "Soft gradient"), d: t("จากบนลงล่าง", "Top to bottom") }, { v: "image", l: t("รูปภาพ", "Image"), d: t("อัปโหลดรูปเอง", "Upload your own") }]}
          />
        </div>
        {/* 🖼 พื้นหลังแบบรูปภาพ */}
        {value.decor === "image" && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <ImageInput value={value.bgImageKey} onChange={(k) => set({ bgImageKey: k || null })} folder="website-pages" />
            {!value.bgImageKey && <p className="text-[11px] text-amber-700">{t("ยังไม่ได้เลือกรูป — หน้าจะเป็นพื้นเรียบไปก่อน", "No image picked — the page stays plain for now")}</p>}
            <div className="space-y-1">
              <span className={webForm.label}>{t("ความจางของรูป (มาก = ตัวหนังสืออ่านง่าย · 0 = เห็นรูปเต็ม)", "Image fade (more = easier to read · 0 = full image)")}</span>
              <RangeInput value={value.bgFade} onChange={(n) => set({ bgFade: n })} min={ACCOUNT_BG_FADE_RANGE.min} max={ACCOUNT_BG_FADE_RANGE.max} step={5} unit="%" ariaLabel={t("ความจางของรูปพื้นหลัง", "Background image fade")} />
            </div>
            <Toggle checked={value.bgBlur} onChange={(v) => set({ bgBlur: v })}>{t("เบลอรูป (นุ่มตา · สวยคู่กับกล่องกระจกฝ้า)", "Blur image (soft · pairs well with frosted glass boxes)")}</Toggle>
          </div>
        )}
        {/* 🫧 ของลอยในพื้นหลัง — ทับบนพื้นหลังแบบไหนก็ได้ */}
        <div className="space-y-1">
          <span className={webForm.label}>{t("ของลอยในพื้นหลัง (เคลื่อนไหวตลอด · ไม่ต้องใช้ไฟล์ · สีตามสีหลักร้าน)", "Floating items in background (always moving · no files needed · brand color)")}</span>
          <Opt
            value={value.floatKind}
            def={d.floatKind}
            onChange={(v) => set({ floatKind: v })}
            options={[
              { v: "none", l: t("ไม่มี", "None") },
              { v: "bubbles", l: t("ฟองลอยขึ้น", "Rising bubbles") },
              { v: "hearts", l: t("หัวใจลอย", "Floating hearts") },
              { v: "sparkle", l: t("ประกายระยิบ", "Twinkling sparkles") },
              { v: "petals", l: t("กลีบดอกไม้โปรย", "Falling petals") },
              { v: "blobs", l: t("วงกลมเบลอเคลื่อนไหว", "Moving blurred circles") },
            ]}
          />
        </div>
        {value.floatKind !== "none" && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-[11px] text-slate-500">{t("ลอยอยู่หลังเนื้อหา — เห็นชัดตามช่องว่างและขอบจอ (จอกว้างเห็นมาก) · ลูกค้าที่ตั้งเครื่องให้ลดการเคลื่อนไหวจะไม่เห็น", "Floats behind content — most visible in gaps and screen edges (more on wide screens) · hidden for customers with reduced motion")}</p>
            <div className="space-y-1">
              <span className={webForm.label}>{t("จำนวน", "Amount")}{value.floatKind === "blobs" ? t(" (วงกลมใช้ 1 วงต่อ 5)", " (circles use 1 per 5)") : ""}</span>
              <RangeInput value={value.floatCount} onChange={(n) => set({ floatCount: n })} min={FLOAT_COUNT_RANGE.min} max={FLOAT_COUNT_RANGE.max} step={1} ariaLabel={t("จำนวนของลอย", "Floating item count")} />
            </div>
            <div className="space-y-1">
              <span className={webForm.label}>{t("ความเร็ว", "Speed")}</span>
              <Opt value={value.floatSpeed} def={d.floatSpeed} onChange={(v) => set({ floatSpeed: v })} options={[{ v: "slow", l: t("ช้า", "Slow") }, { v: "normal", l: t("กลาง", "Medium") }, { v: "fast", l: t("เร็ว", "Fast") }]} />
            </div>
          </div>
        )}
        <div className="space-y-1">
          <span className={webForm.label}>{t("ตอนเปลี่ยนแท็บ", "Tab change")}</span>
          <Opt value={value.tabAnim} def={d.tabAnim} onChange={(v) => set({ tabAnim: v })} options={[{ v: "none", l: t("ทันที", "Instant") }, { v: "fade", l: t("ค่อย ๆ ปรากฏ", "Fade in") }, { v: "slide", l: t("เลื่อนขึ้นนุ่ม ๆ", "Soft slide up") }]} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <Toggle checked={value.glass} onChange={(v) => set({ glass: v })}>{t("กล่องกระจกฝ้า (สวยคู่กับพื้นวงกลมเบลอ / รูปภาพ)", "Frosted glass boxes (pairs well with blurred circles / image)")}</Toggle>
          <Toggle checked={value.timeGreeting} onChange={(v) => set({ timeGreeting: v })} off={value.greeting.trim() ? t("ใช้เมื่อช่องข้อความทักทายว่าง", "Works when the greeting is empty") : value.nav === "panel" ? t("แบบหน้าต่างแอปไม่มีข้อความทักทาย", "App window style has no greeting") : undefined}>{t("ทักทายตามเวลา (อรุณสวัสดิ์ ☀️ / ราตรีสวัสดิ์ 🌙 · ใช้เมื่อไม่ได้ตั้งข้อความทักทาย)", "Time-based greeting (Good morning ☀️ / Good night 🌙 · used when no greeting is set)")}</Toggle>
          <Toggle checked={value.countUp} onChange={(v) => set({ countUp: v })}>{t("ตัวเลขแต้มวิ่งจาก 0", "Points count up from 0")}</Toggle>
          <Toggle checked={value.tilt} onChange={(v) => set({ tilt: v })} off={cardOff}>{t("บัตรสมาชิกเอียงตามเมาส์ + แสงสะท้อน (หัวแบบบัตรสมาชิก)", "Member card tilts with mouse + shine (member card header)")}</Toggle>
          <Toggle checked={value.flip} onChange={(v) => set({ flip: v })} off={cardOff}>{t("🔄 บัตรสมาชิกกดพลิกได้ — ด้านหลัง: สิทธิ์ของระดับ + QR ชวนเพื่อน (หัวแบบบัตรสมาชิก)", "🔄 Flippable member card — back: tier perks + referral QR (member card header)")}</Toggle>
          <Toggle checked={value.celebrate} onChange={(v) => set({ celebrate: v })}>{t("🎉 พลุฉลองตอนเลื่อนระดับ / เข้าบัญชีครั้งแรก (ครั้งเดียวต่อเครื่อง)", "🎉 Celebration on tier up / first login (once per device)")}</Toggle>
          <Toggle checked={value.orderTimeline} onChange={(v) => set({ orderTimeline: v })}>{t("🛤 ไทม์ไลน์สถานะในแต่ละออเดอร์ (รับคำสั่งซื้อ → เตรียมของ → จัดส่ง → สำเร็จ)", "🛤 Status timeline per order (received → preparing → shipped → done)")}</Toggle>
        </div>
        <p className="text-[11px] text-slate-500">{t("ลูกค้าที่ตั้งเครื่องให้ \"ลดการเคลื่อนไหว\" จะไม่เห็นภาพเคลื่อนไหว (เพื่อความสบายตา)", "Customers with \"reduce motion\" on won't see animations (for comfort)")}</p>
      </Section>

      <PartStyleFold parts={ACCOUNT_PARTS} value={value.parts} onChange={(parts) => set({ parts })} colors={colors} onOpen={() => onPreview("/account")} hint={t("สี · ฟอนต์ · ขนาด · ระยะ · ขอบ · เงา · ตำแหน่ง", "Color · font · size · spacing · border · shadow · position")} testId="account" />
    </div>
  );
}
