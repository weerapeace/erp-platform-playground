"use client";

/**
 * 👤 ตั้งค่าหน้าตา "บัญชีของฉัน" ของเว็บร้าน — การ์ดในแท็บดีไซน์ › 📄 หน้าพิเศษ (theme.page.account)
 *
 * ① ส่วนหัว (4 แบบ · ข้อความทักทาย · ป้ายใต้ชื่อ) ② เมนู (4 แบบ · ไอคอนอีโมจิ/เส้น/ไม่มี · ลำดับ/ชื่อ/ไอคอน/ซ่อน · แท็บแรก)
 * ③ กล่องเนื้อหา (แบบกล่อง · กล่องเพิ่มออเดอร์เก่า · ข้อความตอนว่าง · โปรไฟล์แบบฟอร์ม/แถว) ④ ส่วนเสริม (แถบประกาศ · สินค้าแนะนำ · ช่วยเหลือ · ความกว้าง · กล่องข้างขวา)
 * ⑤ จัดวาง (ลำดับส่วนในหน้า · เมนูซ้าย/ขวา) ✨ ลูกเล่น (พื้นหลังวงกลมเบลอ · กระจกฝ้า · ทักทายตามเวลา · เลขแต้มวิ่ง · เปลี่ยนแท็บนุ่ม · บัตรเอียงตามเมาส์)
 * ⚡ แบบสำเร็จรูป "หน้าต่างแอป" = ตั้งหลายช่องในคลิกเดียว (ปรับต่อเองได้ทุกช่อง)
 * 🎨 ปรับละเอียดทีละชิ้น = ของกลาง PartStyleEditor + ทะเบียนชิ้นส่วน ACCOUNT_PARTS (คลิกเลือกในพรีวิวได้)
 * ค่าเริ่ม = หน้าตาเดิม · ตัวตรวจค่า normalizeAccount (lib/website-site-design — มิเรอร์กับเว็บร้าน) · เว็บร้าน components/account/AccountClient
 * พรีวิว: /account ในกรอบพรีวิว = ข้อมูลตัวอย่าง (ไม่ต้องล็อกอิน)
 */
import { type ReactNode } from "react";
import { ImageInput } from "@/components/image-input";
import { SiteIconPicker } from "@/components/site-icon-picker";
import { PartStyleFold } from "@/components/website-part-style-editor";
import { webForm } from "@/lib/website-form-styles";
import { ACCOUNT_TAB_DEFAULTS, DEFAULT_ACCOUNT_LOOK, type AccountBlock, type AccountEmptyKey, type AccountLook, type AccountTabKey } from "@/lib/website-site-design";
import { ACCOUNT_PARTS } from "@/lib/website-page-parts";
import type { SiteTheme } from "@/lib/website-theme";

function Opt<T extends string>({ value, onChange, options, def }: { value: T; onChange: (v: T) => void; options: { v: T; l: string; d?: string }[]; def?: T }) {
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
          {(o.d || o.v === def) && <span className={`block text-[10px] ${o.v === def ? "text-emerald-600" : "text-slate-400"}`}>{o.v === def ? "แบบเดิม" : o.d}</span>}
        </button>
      ))}
    </div>
  );
}

const Toggle = ({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) => (
  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {children}
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

const BLOCK_LABEL: Record<AccountBlock, string> = {
  notice: "📢 แถบประกาศ",
  header: "🙂 ส่วนหัว (รูป + ชื่อ)",
  body: "📑 เมนู + เนื้อหา",
  help: "💬 กล่องช่วยเหลือ",
  reco: "🛍 สินค้าแนะนำ",
};

/** ⚡ แบบสำเร็จรูป — ตั้งหลายช่องพร้อมกัน (ค่าอื่นคงเดิม · ปรับต่อเองได้) */
const PRESETS: { k: string; l: string; d: string; p: Partial<AccountLook> }[] = [
  {
    k: "app",
    l: "🪟 หน้าต่างแอป",
    d: "กรอบมนใหญ่ · เมนูในกรอบ · วงกลมเบลอ · กระจกฝ้า",
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
    l: "💳 บัตรสมาชิก",
    d: "หัวเป็นบัตรเอียงได้ · เลขแต้มวิ่ง · ไอคอนแบบแอป",
    p: { header: "card", nav: "tiles", tilt: true, countUp: true, timeGreeting: true, decor: "wash", glass: false, tabAnim: "slide" },
  },
  {
    k: "plain",
    l: "↺ แบบเดิม",
    d: "คืนเฉพาะการจัดวาง + ลูกเล่น",
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
      aside: { ...DEFAULT_ACCOUNT_LOOK.aside },
    },
  },
];

const EMPTY_FALLBACK: Record<AccountEmptyKey, { label: string; text: string; button: string; href: string }> = {
  orders: { label: "📦 ยังไม่มีออเดอร์", text: "ยังไม่มีออเดอร์ในบัญชี", button: "เลือกซื้อสินค้า", href: "/shop" },
  wishlist: { label: "❤️ ยังไม่มีรายการโปรด", text: "ยังไม่มีรายการโปรด — กด ♡ ที่สินค้าที่ชอบ เก็บไว้ดูทีหลัง", button: "เลือกดูสินค้า", href: "/shop" },
  addresses: { label: "📍 ยังไม่มีที่อยู่", text: "(ไม่มีข้อความ)", button: "", href: "" },
};

export function AccountPageSetting({ value, onChange, colors, onPreview }: { value: AccountLook; onChange: (v: AccountLook) => void; colors: SiteTheme["colors"]; onPreview: (path: string) => void }) {
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

  return (
    <div className="space-y-2" data-account-design>
      <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-2.5 space-y-1.5">
        <span className="block text-[11px] font-medium text-violet-800">⚡ แบบสำเร็จรูป — กดแล้วปรับต่อเองได้ทุกช่อง</span>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((x) => (
            <button key={x.k} type="button" onClick={() => set(x.p)} className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-left text-xs leading-tight hover:bg-violet-50" data-account-preset={x.k}>
              <span className="block font-medium text-slate-800">{x.l}</span>
              <span className="block text-[10px] text-slate-500">{x.d}</span>
            </button>
          ))}
        </div>
      </div>
      <Section title="① ส่วนหัว" open>
        {value.nav === "panel" && <p className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">แบบเมนู &quot;หน้าต่างแอป&quot; ย่อส่วนหัวไปอยู่มุมขวาบนในกรอบ (ชื่อ · ป้าย · รูปโปรไฟล์) — แบบหัวด้านล่างใช้กับเมนูแบบอื่น</p>}
        <Opt
          value={value.header}
          def={d.header}
          onChange={(v) => set({ header: v })}
          options={[
            { v: "simple", l: "รูป + ชื่อ" },
            { v: "center", l: "อยู่กลาง" },
            { v: "banner", l: "แถบรูปปก", d: "มีรูปพื้นหลัง" },
            { v: "card", l: "บัตรสมาชิก", d: "สีตามระดับ + แต้ม" },
          ]}
        />
        {value.header === "banner" && (
          <div className="max-w-xs">
            <span className={webForm.label}>รูปปก (ไม่ใส่ = ไล่สีจากสีหลัก)</span>
            <ImageInput value={value.imageKey} onChange={(k) => set({ imageKey: k || null })} folder="website-pages" />
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="block">
            <span className={webForm.label}>ข้อความทักทาย ({"{ชื่อ}"} = ชื่อสมาชิก)</span>
            <input className={webForm.input} value={value.greeting} onChange={(e) => set({ greeting: e.target.value })} placeholder="บัญชีของฉัน" maxLength={80} />
          </label>
          <label className="block">
            <span className={webForm.label}>ข้อความรอง (ว่างได้)</span>
            <input className={webForm.input} value={value.subtext} onChange={(e) => set({ subtext: e.target.value })} placeholder="เช่น ขอบคุณที่เป็นครอบครัวเดียวกัน 💗" maxLength={160} />
          </label>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <Toggle checked={value.showEmail} onChange={(v) => set({ showEmail: v })}>อีเมล</Toggle>
          <Toggle checked={value.showTier} onChange={(v) => set({ showTier: v })}>ป้ายระดับสมาชิก</Toggle>
          <Toggle checked={value.showPoints} onChange={(v) => set({ showPoints: v })}>แต้มคงเหลือ</Toggle>
          <Toggle checked={value.showSince} onChange={(v) => set({ showSince: v })}>สมาชิกตั้งแต่</Toggle>
        </div>
      </Section>

      <Section title="② เมนูในหน้า" open>
        <Opt
          value={value.nav}
          def={d.nav}
          onChange={(v) => set({ nav: v })}
          options={[
            { v: "pills", l: "ปุ่มเม็ดยา" },
            { v: "under", l: "ขีดเส้นใต้" },
            { v: "side", l: "เมนูด้านซ้าย", d: "มือถือ = แถบบน" },
            { v: "tiles", l: "ไอคอนแบบแอป", d: "ตาราง" },
            { v: "panel", l: "หน้าต่างแอป", d: "กรอบมน · เมนูในกรอบ" },
          ]}
        />
        {(value.nav === "side" || value.nav === "panel") && (
          <div className="flex flex-wrap items-end gap-3">
            {value.nav === "panel" && (
              <label className="block">
                <span className={webForm.label}>หัวเมนูข้าง</span>
                <input className={`${webForm.input} !w-44`} value={value.panelTitle} onChange={(e) => set({ panelTitle: e.target.value })} placeholder="บัญชีของฉัน" maxLength={40} />
              </label>
            )}
            <div className="space-y-1">
              <span className={webForm.label}>เมนูอยู่ฝั่ง (จอคอม)</span>
              <Opt value={value.navSide} def={d.navSide} onChange={(v) => set({ navSide: v })} options={[{ v: "left", l: "◧ ซ้าย" }, { v: "right", l: "◨ ขวา" }]} />
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] text-slate-500">ไอคอนหน้าชื่อเมนู</span>
          <Opt value={value.navIcons} def={d.navIcons} onChange={(v) => set({ navIcons: v })} options={[{ v: "emoji", l: "อีโมจิ" }, { v: "line", l: "ไอคอนเส้น" }, { v: "none", l: "ไม่มี" }]} />
          <Toggle checked={value.showCounts} onChange={(v) => set({ showCounts: v })}>โชว์ตัวเลขจำนวน</Toggle>
        </div>
        <div className="space-y-1.5">
          <span className={webForm.label}>ลำดับ · ชื่อ · ไอคอน · ซ่อน (แต้ม/คูปองโชว์เฉพาะร้านที่เปิด · โปรไฟล์ซ่อนไม่ได้)</span>
          {tabs.map((t, i) => {
            const def = ACCOUNT_TAB_DEFAULTS[t.key];
            return (
              <div key={t.key} className={`flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 ${t.hidden ? "opacity-50" : ""}`} data-account-tab-row={t.key}>
                <button type="button" className="h-7 w-7 rounded border border-slate-200 bg-white text-xs disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="เลื่อนขึ้น">
                  ↑
                </button>
                <button type="button" className="h-7 w-7 rounded border border-slate-200 bg-white text-xs disabled:opacity-30" disabled={i === tabs.length - 1} onClick={() => move(i, 1)} aria-label="เลื่อนลง">
                  ↓
                </button>
                <input className={`${webForm.input} !w-40 flex-1`} value={t.label} placeholder={def.label} onChange={(e) => setTab(i, { label: e.target.value })} maxLength={40} aria-label={`ชื่อเมนู ${def.label}`} />
                {value.navIcons !== "none" && (
                  <div className="flex items-center gap-1">
                    <SiteIconPicker value={t.icon || (value.navIcons === "line" ? def.line : def.emoji)} onChange={(v) => setTab(i, { icon: v })} label="ไอคอน" />
                    {t.icon && (
                      <button type="button" className="text-[11px] text-blue-600 hover:underline" onClick={() => setTab(i, { icon: "" })} title="กลับไอคอนเดิม">
                        ↺
                      </button>
                    )}
                  </div>
                )}
                {t.key === "profile" ? (
                  <span className="text-[11px] text-slate-400 px-1" title="มีปุ่มออกจากระบบ/ลบบัญชี">
                    🔒
                  </span>
                ) : (
                  <button type="button" className="h-7 px-2 rounded border border-slate-200 bg-white text-xs" onClick={() => setTab(i, { hidden: !t.hidden })}>
                    {t.hidden ? "🚫 ซ่อน" : "👁 โชว์"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <label className="block max-w-xs">
          <span className={webForm.label}>เปิดหน้าไหนก่อน</span>
          <select className={webForm.input} value={value.firstTab} onChange={(e) => set({ firstTab: e.target.value as AccountTabKey })}>
            {visibleTabs.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label || ACCOUNT_TAB_DEFAULTS[t.key].label}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section title="③ กล่องเนื้อหา">
        <div className="space-y-1">
          <span className={webForm.label}>แบบกล่อง</span>
          <Opt value={value.cards} def={d.cards} onChange={(v) => set({ cards: v })} options={[{ v: "card", l: "การ์ดพื้นสี" }, { v: "line", l: "กรอบเส้น" }, { v: "flat", l: "เรียบ ไม่มีกรอบ" }]} />
        </div>
        <div className="space-y-1">
          <span className={webForm.label}>กล่อง &quot;เคยสั่งแบบไม่ได้สมัคร?&quot;</span>
          <Opt value={value.claim} def={d.claim} onChange={(v) => set({ claim: v })} options={[{ v: "box", l: "กล่องเต็ม" }, { v: "link", l: "ย่อเป็นลิงก์" }, { v: "hide", l: "ซ่อน" }]} />
        </div>
        <div className="space-y-1">
          <span className={webForm.label}>แท็บโปรไฟล์</span>
          <Opt value={value.profileStyle} def={d.profileStyle} onChange={(v) => set({ profileStyle: v })} options={[{ v: "form", l: "ฟอร์ม" }, { v: "rows", l: "แถวข้อมูล ›", d: "กดแถวแก้ทีละช่อง" }]} />
        </div>
        {(Object.keys(EMPTY_FALLBACK) as AccountEmptyKey[]).map((k) => {
          const fb = EMPTY_FALLBACK[k];
          const e = value.empty[k];
          return (
            <div key={k} className="grid sm:grid-cols-[2fr_1fr_1fr] gap-2 items-end">
              <label className="block">
                <span className={webForm.label}>{fb.label} — ข้อความ</span>
                <input className={webForm.input} value={e.text} onChange={(ev) => setEmpty(k, { text: ev.target.value })} placeholder={fb.text} maxLength={200} />
              </label>
              {k !== "addresses" && (
                <>
                  <label className="block">
                    <span className={webForm.label}>ปุ่ม</span>
                    <input className={webForm.input} value={e.button} onChange={(ev) => setEmpty(k, { button: ev.target.value })} placeholder={fb.button} maxLength={40} />
                  </label>
                  <label className="block">
                    <span className={webForm.label}>ไปที่ (/หน้า หรือ https://)</span>
                    <input className={webForm.input} value={e.href} onChange={(ev) => setEmpty(k, { href: ev.target.value })} placeholder={fb.href} maxLength={300} />
                  </label>
                </>
              )}
            </div>
          );
        })}
      </Section>

      <Section title="④ ส่วนเสริม">
        <Toggle checked={value.notice.on} onChange={(v) => set({ notice: { ...value.notice, on: v } })}>
          แถบประกาศสำหรับสมาชิก (บนสุดของหน้า)
        </Toggle>
        {value.notice.on && (
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${webForm.input} flex-1 min-w-[14rem]`} value={value.notice.text} onChange={(e) => set({ notice: { ...value.notice, text: e.target.value } })} placeholder="เช่น สมาชิกระดับ Gold รับส่งฟรีทุกออเดอร์ ✨" maxLength={200} />
            <Opt value={value.notice.tone} onChange={(v) => set({ notice: { ...value.notice, tone: v } })} options={[{ v: "soft", l: "สีอ่อน" }, { v: "brand", l: "สีหลัก" }]} />
          </div>
        )}
        <Toggle checked={value.recommend} onChange={(v) => set({ recommend: v })}>
          สินค้าแนะนำท้ายหน้า (4 ชิ้น ตามลำดับสินค้าของร้าน ที่ยังไม่ได้กดใจ)
        </Toggle>
        <Toggle checked={value.help} onChange={(v) => set({ help: v })}>
          กล่อง &quot;ต้องการความช่วยเหลือ?&quot; (LINE / โทร / อีเมล จากแท็บข้อมูลร้าน)
        </Toggle>
        <div className="space-y-1">
          <span className={webForm.label}>ความกว้างหน้า</span>
          <Opt value={value.width} def={d.width} onChange={(v) => set({ width: v })} options={[{ v: "site", l: "ตามทั้งเว็บ" }, { v: "narrow", l: "แคบ อ่านง่าย" }]} />
        </div>
        <Toggle checked={value.aside.on} onChange={(v) => setAside({ on: v })}>
          กล่องข้างขวา (คู่มือ / โปรสมาชิก) — จอกว้างอยู่ขวา · จอเล็กอยู่ท้ายเนื้อหา
        </Toggle>
        {value.aside.on && (
          <div className="grid sm:grid-cols-[auto_1fr_1fr] gap-2 items-end" data-account-aside>
            <SiteIconPicker value={value.aside.icon} onChange={(v) => setAside({ icon: v })} label="ไอคอน" />
            <label className="block">
              <span className={webForm.label}>หัวข้อ</span>
              <input className={webForm.input} value={value.aside.title} onChange={(e) => setAside({ title: e.target.value })} placeholder="คู่มือใช้งานบัญชี" maxLength={60} />
            </label>
            <label className="block">
              <span className={webForm.label}>กดแล้วไปที่ (ว่าง = กดไม่ได้)</span>
              <input className={webForm.input} value={value.aside.href} onChange={(e) => setAside({ href: e.target.value })} placeholder="/help หรือ https://" maxLength={300} />
            </label>
            <label className="block sm:col-span-3">
              <span className={webForm.label}>ข้อความ</span>
              <textarea className={webForm.input} rows={2} value={value.aside.text} onChange={(e) => setAside({ text: e.target.value })} placeholder="เช่น สมาชิก Gold รับส่วนลด 10% ทุกออเดอร์" maxLength={200} />
            </label>
          </div>
        )}
      </Section>

      <Section title="⑤ จัดวาง — ลำดับส่วนในหน้า">
        <div className="space-y-1.5">
          {value.order.map((b, i) => (
            <div key={b} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700" data-account-block={b}>
              <button type="button" className="h-7 w-7 rounded border border-slate-200 bg-white disabled:opacity-30" disabled={i === 0} onClick={() => moveBlock(i, -1)} aria-label="เลื่อนขึ้น">
                ↑
              </button>
              <button type="button" className="h-7 w-7 rounded border border-slate-200 bg-white disabled:opacity-30" disabled={i === value.order.length - 1} onClick={() => moveBlock(i, 1)} aria-label="เลื่อนลง">
                ↓
              </button>
              <span className="flex-1">{BLOCK_LABEL[b]}</span>
              {b === "header" && value.nav === "panel" && <span className="text-[10px] text-slate-400">อยู่ในกรอบแล้ว</span>}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">เปิด/ปิดแต่ละส่วนที่ ① และ ④ · ปรับระยะ/สี/ขนาดละเอียดที่ 🎨 ด้านล่าง</p>
      </Section>

      <Section title="✨ ลูกเล่น">
        <div className="space-y-1">
          <span className={webForm.label}>พื้นหลังหน้า</span>
          <Opt value={value.decor} def={d.decor} onChange={(v) => set({ decor: v })} options={[{ v: "none", l: "เรียบ" }, { v: "blobs", l: "วงกลมเบลอ", d: "สีตามสีหลักร้าน" }, { v: "wash", l: "ไล่สีจาง", d: "จากบนลงล่าง" }]} />
        </div>
        <div className="space-y-1">
          <span className={webForm.label}>ตอนเปลี่ยนแท็บ</span>
          <Opt value={value.tabAnim} def={d.tabAnim} onChange={(v) => set({ tabAnim: v })} options={[{ v: "none", l: "ทันที" }, { v: "fade", l: "ค่อย ๆ ปรากฏ" }, { v: "slide", l: "เลื่อนขึ้นนุ่ม ๆ" }]} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <Toggle checked={value.glass} onChange={(v) => set({ glass: v })}>กล่องกระจกฝ้า (สวยคู่กับพื้นวงกลมเบลอ)</Toggle>
          <Toggle checked={value.timeGreeting} onChange={(v) => set({ timeGreeting: v })}>ทักทายตามเวลา (อรุณสวัสดิ์ ☀️ / ราตรีสวัสดิ์ 🌙 · ใช้เมื่อไม่ได้ตั้งข้อความทักทาย)</Toggle>
          <Toggle checked={value.countUp} onChange={(v) => set({ countUp: v })}>ตัวเลขแต้มวิ่งจาก 0</Toggle>
          <Toggle checked={value.tilt} onChange={(v) => set({ tilt: v })}>บัตรสมาชิกเอียงตามเมาส์ + แสงสะท้อน (หัวแบบบัตรสมาชิก)</Toggle>
        </div>
        <p className="text-[11px] text-slate-500">ลูกค้าที่ตั้งเครื่องให้ &quot;ลดการเคลื่อนไหว&quot; จะไม่เห็นภาพเคลื่อนไหว (เพื่อความสบายตา)</p>
      </Section>

      <PartStyleFold parts={ACCOUNT_PARTS} value={value.parts} onChange={(parts) => set({ parts })} colors={colors} onOpen={() => onPreview("/account")} hint="สี · ฟอนต์ · ขนาด · ระยะ · ขอบ · เงา · ตำแหน่ง" testId="account" />
    </div>
  );
}
