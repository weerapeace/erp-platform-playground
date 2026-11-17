"use client";

/** ท้ายเว็บ (Footer) — สี · โลโก้ · ระยะห่าง · คอลัมน์ · แถวล่างสุด · มือถือ (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { useContext, useMemo, useState } from "react";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { LangInput } from "@/components/bilingual-field";
import { newMenuItem, FOOTER_COL_DEFS, FOOTER_BGS, FOOTER_SPACING_DEFAULTS, FOOTER_GAP_MAX, FOOTER_PAD_PX, PAYMENT_ICONS, SHIP_ICON_LABELS, newFooterColumn, type FooterConfig, type FooterColumn, type FooterColKind } from "@/lib/website-theme";
import { SocialLinksModal } from "@/components/website-social-links";
import { ColorPicker } from "@/components/color-picker";
import { FontSelect } from "@/components/font-select";
import { RangeInput } from "@/components/range-input";
import { webFontOptions, WEB_FONT_NAMES } from "@/components/website-text-pickers";
import { FOOTER_PARTS } from "@/lib/website-page-parts";
import { type Choices, inputCls, labelCls, ColorField, useAreaFold } from "./shared";
import { MenuEditor } from "./menu-tab";
import { PageHealthCtx, IssueNote, footerColumnIssue, FooterHealthSummary } from "./link-health";
import { useDesign } from "./context";
import { DesignCard } from "./design-card";
import { useT } from "@/components/i18n";
import { labelEn } from "@/lib/website-admin-en";

export function FooterTab() {
  const { shopSlug, shopId, theme, choices, setFooter, storePages, iframeRef } = useDesign();
  const areaFold = useAreaFold();
  const t = useT();
  const [footerSocialOpen, setFooterSocialOpen] = useState(false);
  return (
    <>
      <DesignCard title="ท้ายเว็บ (Footer) — สี">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{t("สีพื้น", "Background color")}</label>
            <select className={inputCls} value={theme.footer.bg} onChange={(e) => setFooter({ bg: e.target.value as FooterConfig["bg"] })}>
              {FOOTER_BGS.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
            </select>
            {theme.footer.bg === "custom" && (
              <div className="mt-2">
                <ColorPicker value={theme.footer.bgColor} onChange={(hex) => setFooter({ bgColor: hex })} />
              </div>
            )}
          </div>
          <ColorField label={t("สีตัวอักษร", "Text color")} value={theme.footer.textColor} onChange={(hex) => setFooter({ textColor: hex })} emptyLabel={t("อัตโนมัติ (ขาว/ดำตามพื้น)", "Auto (white/black by background)")} />
          <div>
            <label className={labelCls}>{t("จัดข้อความ", "Text alignment")}</label>
            <select className={inputCls} value={theme.footer.align} onChange={(e) => setFooter({ align: e.target.value as "left" | "center" })}>
              <option value="left">{t("ชิดซ้าย", "Left")}</option>
              <option value="center">{t("กึ่งกลาง (เหมาะกับ 1-2 คอลัมน์)", "Center (best for 1-2 columns)")}</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t("ระยะบน-ล่าง (แบบเร็ว · ละเอียดที่การ์ด 📏)", "Top-bottom spacing (quick · fine-tune in 📏 card)")}</label>
            <select className={inputCls} value={theme.footer.padY} onChange={(e) => setFooter({ padY: e.target.value as FooterConfig["padY"], padTop: -1, padBottom: -1 })}>
              <option value="sm">{t("แคบ", "Narrow")}</option>
              <option value="md">{t("ปกติ (แบบเดิม)", "Normal (default)")}</option>
              <option value="lg">{t("กว้าง", "Wide")}</option>
              <option value="xl">{t("กว้างมาก", "Extra wide")}</option>
            </select>
          </div>
        </div>

        {/* 🔤 หัวคอลัมน์ + ลิงก์ */}
        <h4 className="text-xs font-semibold text-slate-600 mt-4 mb-2 pt-3 border-t border-slate-100">{t("🔤 หัวคอลัมน์ & ลิงก์", "🔤 Column headings & links")}</h4>
        {/* 🔤 ฟอนต์ท้ายเว็บ ("" = ตามธีมแบบเดิม) — เว็บร้านโหลดฟอนต์ที่เลือกให้เอง (themeFontNames) */}
        <div className="grid gap-3 sm:grid-cols-2 mb-3">
          <div>
            <label className={labelCls}>{t("ฟอนต์หัวคอลัมน์", "Column heading font")}</label>
            <FontSelect
              value={theme.footer.headingFont}
              onChange={(v) => setFooter({ headingFont: v })}
              options={webFontOptions([{ value: "", label: t("ตามธีม (แบบเดิม)", "Theme default"), family: `"${theme.footer.headingSize === "l" ? theme.fonts.display : theme.fonts.body}", sans-serif` }])}
              googleFonts={WEB_FONT_NAMES}
              sample="ติดต่อเรา · CONTACT"
            />
          </div>
          <div>
            <label className={labelCls}>{t("ฟอนต์ข้อความ / ลิงก์", "Text / link font")}</label>
            <FontSelect
              value={theme.footer.textFont}
              onChange={(v) => setFooter({ textFont: v })}
              options={webFontOptions([{ value: "", label: t("ตามธีม (แบบเดิม)", "Theme default"), family: `"${theme.fonts.body}", sans-serif` }])}
              googleFonts={WEB_FONT_NAMES}
              sample="สินค้าทั้งหมด · Shipping 123"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>{t("ขนาดหัวคอลัมน์", "Column heading size")}</label>
            <select className={inputCls} value={theme.footer.headingSize} onChange={(e) => setFooter({ headingSize: e.target.value as FooterConfig["headingSize"] })}>
              <option value="s">{t("เล็ก ตัวห่าง (แบบเดิม)", "Small, spaced (default)")}</option>
              <option value="m">{t("กลาง", "Medium")}</option>
              <option value="l">{t("ใหญ่", "Large")}</option>
            </select>
            <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={theme.footer.headingUpper} onChange={(e) => setFooter({ headingUpper: e.target.checked })} />
              {t("ตัวพิมพ์ใหญ่ (อังกฤษ)", "All caps (English)")}
            </label>
          </div>
          <ColorField label={t("สีหัวคอลัมน์", "Column heading color")} value={theme.footer.headingColor} onChange={(hex) => setFooter({ headingColor: hex })} emptyLabel={t("อัตโนมัติ (เท่าสีตัวอักษร)", "Auto (same as text color)")} />
          <div>
            <label className={labelCls}>{t("ขนาดลิงก์ / ข้อความ", "Link / text size")}</label>
            <select className={inputCls} value={theme.footer.linkSize} onChange={(e) => setFooter({ linkSize: e.target.value as FooterConfig["linkSize"] })}>
              <option value="s">{t("เล็ก", "Small")}</option>
              <option value="m">{t("ปกติ (แบบเดิม)", "Normal (default)")}</option>
              <option value="l">{t("ใหญ่", "Large")}</option>
            </select>
          </div>
          <ColorField label={t("สีลิงก์ / ข้อความ", "Link / text color")} value={theme.footer.linkColor} onChange={(hex) => setFooter({ linkColor: hex })} emptyLabel={t("อัตโนมัติ (จางกว่าหัวข้อ)", "Auto (lighter than headings)")} />
          <ColorField label={t("สีลิงก์ตอนชี้", "Link hover color")} value={theme.footer.linkHover} onChange={(hex) => setFooter({ linkHover: hex })} emptyLabel={t("อัตโนมัติ (สว่างขึ้น)", "Auto (brighter)")} />
          <div>
            <label className={labelCls}>{t("โซเชียลแสดงเป็น", "Show social as")}</label>
            <select className={inputCls} value={theme.footer.socialStyle} onChange={(e) => setFooter({ socialStyle: e.target.value as FooterConfig["socialStyle"] })}>
              <option value="pill">{t("ป้ายชื่อ (แบบเดิม)", "Name tags (default)")}</option>
              <option value="icon">{t("ไอคอน", "Icons")}</option>
              <option value="circle">{t("ไอคอนในวงกลม", "Icons in circles")}</option>
              <option value="list">{t("รายการตัวหนังสือ (เหมือนลิงก์)", "Text list (like links)")}</option>
              <option value="iconlist">{t("รายการ ไอคอน + ชื่อ (ไอคอนขาวดำ)", "List: icon + name (mono icons)")}</option>
            </select>
            <button type="button" onClick={() => setFooterSocialOpen(true)} className="mt-1 text-[11px] text-blue-600 hover:underline">{t("🌐 แก้/เพิ่มลิงก์โซเชียล", "🌐 Edit/add social links")}</button>
            <SocialLinksModal
              open={footerSocialOpen}
              onClose={() => setFooterSocialOpen(false)}
              shopSlug={shopSlug}
              shopId={shopId}
              onSaved={() => setTimeout(() => { if (iframeRef.current) iframeRef.current.src = iframeRef.current.src; }, 1500)}
            />
          </div>
        </div>
      </DesignCard>

      {/* 🖼 โลโก้ท้ายเว็บ */}
      <DesignCard title="🖼 โลโก้ท้ายเว็บ" hint={t("รูปโลโก้ (รวม \"โลโก้สำหรับพื้นเข้ม\") ตั้งที่แท็บ โลโก้", "Logo images (incl. \"Dark-background logo\") are set in the Logo tab")}>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mb-3">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.footer.logoShow} onChange={(e) => setFooter({ logoShow: e.target.checked })} />
          {t("แสดงโลโก้", "Show logo")}
        </label>
        {theme.footer.logoShow && (() => {
          // 🖼 ตำแหน่งโลโก้ — เคยพลาด: จัดคอลัมน์เองไม่มี "เกี่ยวกับร้าน" = โลโก้หายเงียบ → อัตโนมัติขึ้นแถวบนให้ + เตือนเมื่อบังคับ "ในคอลัมน์" แต่ไม่มีคอลัมน์นั้น
          const cols = theme.footer.columns;
          const hasAbout = cols === null || cols.some((c) => c.kind === "about" && !c.hidden);
          return (
            <div className="mb-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div>
              <label className={labelCls}>{t("ตำแหน่งโลโก้", "Logo position")}</label>
              <select className={inputCls} value={theme.footer.logoPlace} onChange={(e) => setFooter({ logoPlace: e.target.value as FooterConfig["logoPlace"] })}>
                <option value="auto">{t("อัตโนมัติ — ในคอลัมน์ “เกี่ยวกับร้าน” ถ้ามี · ไม่มี = แถวบนสุด", "Auto — in the “About shop” column if any · otherwise top row")}{hasAbout ? "" : t(" (ตอนนี้: แถวบนสุด)", " (now: top row)")}</option>
                <option value="top">{t("แถวบนสุด เหนือคอลัมน์", "Top row, above columns")}</option>
                <option value="column">{t("ในคอลัมน์ “เกี่ยวกับร้าน” เท่านั้น", "Only in the “About shop” column")}</option>
              </select>
              </div>
              <div>
                <label className={labelCls}>{t("จัดโลโก้", "Logo alignment")}</label>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden h-[34px]">
                  {(
                    [
                      ["auto" as const, t("อัตโนมัติ", "Auto")],
                      ["left" as const, t("⬅ ซ้าย", "⬅ Left")],
                      ["center" as const, t("กลาง", "Center")],
                      ["right" as const, t("ขวา ➡", "Right ➡")],
                    ] as [FooterConfig["logoAlign"], string][]
                  ).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setFooter({ logoAlign: v })}
                      className={`flex-1 text-[11px] border-r last:border-r-0 border-slate-200 ${theme.footer.logoAlign === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                      title={v === "auto" ? t("ตามการจัดข้อความท้ายเว็บ (ซ้าย/กึ่งกลาง)", "Follows footer text alignment (left/center)") : undefined}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
              {theme.footer.logoPlace === "column" && !hasAbout && (
                <p className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                  {t("ยังไม่มีคอลัมน์ “เกี่ยวกับร้าน” ที่โชว์อยู่ — โลโก้จะไม่ขึ้น ·", "No visible “About shop” column — the logo won't show ·")}{" "}
                  <button type="button" className="underline" onClick={() => setFooter({ logoPlace: "auto" })}>
                    {t("เปลี่ยนเป็นอัตโนมัติ", "Switch to auto")}
                  </button>
                </p>
              )}
              </div>
            </div>
          );
        })()}
        {theme.footer.logoShow && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>{t("ความสูงโลโก้", "Logo height")} ({theme.footer.logoHeight}px)</label>
              <RangeInput min={16} max={120} step={2} value={theme.footer.logoHeight} onChange={(v) => setFooter({ logoHeight: v })} className="w-full" />
            </div>
            <div>
              <label className={labelCls}>{t("ใช้รูปโลโก้", "Logo image")}</label>
              <select className={inputCls} value={theme.footer.logoVariant} onChange={(e) => setFooter({ logoVariant: e.target.value as FooterConfig["logoVariant"] })}>
                <option value="auto">{t("อัตโนมัติ (พื้นเข้ม = โลโก้สำหรับพื้นเข้ม)", "Auto (dark background = dark-background logo)")}</option>
                <option value="normal">{t("โลโก้ปกติ", "Normal logo")}</option>
                <option value="dark">{t("โลโก้สำหรับพื้นเข้ม", "Dark-background logo")}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("กล่องรองโลโก้", "Logo backing box")}</label>
              <select className={inputCls} value={theme.footer.logoChip} onChange={(e) => setFooter({ logoChip: e.target.value as FooterConfig["logoChip"] })}>
                <option value="auto">{t("อัตโนมัติ (ขาว เฉพาะโลโก้เข้มบนพื้นเข้ม)", "Auto (white, only for dark logo on dark background)")}</option>
                <option value="none">{t("ไม่มี", "None")}</option>
                <option value="white">{t("กล่องขาว", "White box")}</option>
              </select>
            </div>
          </div>
        )}
      </DesignCard>

      {/* 📏 ระยะห่าง — ค่าเริ่ม = หน้าตาเดิม (FOOTER_SPACING_DEFAULTS) */}
      <DesignCard title="📏 ระยะห่าง" hint={t("ปรับแล้วดูพรีวิวด้านขวาได้ทันที", "Changes show in the preview on the right right away")} summary={t("ระยะห่างบน-ล่าง · ช่องไฟคอลัมน์ · ระยะแถวล่างสุด", "Top-bottom spacing · column gaps · bottom row spacing")} right={<><button
            type="button"
            className="ml-auto text-[11px] text-slate-500 hover:text-blue-600 hover:underline"
            onClick={() => setFooter({ ...FOOTER_SPACING_DEFAULTS, colFit: "equal" })}
            title={t("กลับเป็นระยะแบบเดิม", "Reset to default spacing")}
          >
            {t("↺ ค่าเริ่ม", "↺ Default")}
          </button></>}>
        {/* ขอบบน/ล่าง: ยังไม่เคยเลื่อน (-1) = ตาม "ระยะบน-ล่าง (แบบเร็ว)" ด้านบน */}
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3 mb-3 pb-3 border-b border-slate-100">
          {(
            [
              { k: "padTop" as const, l: t("ขอบบน (เหนือเนื้อหา)", "Top padding (above content)"), max: 200 },
              { k: "padBottom" as const, l: t("ขอบล่าง (ใต้แถว ©)", "Bottom padding (below © row)"), max: 200 },
            ]
          ).map((s) => {
            const v = theme.footer[s.k] >= 0 ? theme.footer[s.k] : FOOTER_PAD_PX[theme.footer.padY];
            return (
              <div key={s.k}>
                <label className={labelCls}>
                  {s.l} ({v}px)
                </label>
                <RangeInput min={0} max={s.max} step={4} hardMax={FOOTER_GAP_MAX} unit="px" value={v} onChange={(v) => setFooter({ [s.k]: v } as Partial<FooterConfig>)} className="w-full" />
              </div>
            );
          })}
          <div>
            <label className={labelCls}>{t("คอลัมน์ ↔ แถวล่าง ©", "Columns ↔ © bottom row")} ({theme.footer.bottomGap}px)</label>
            <RangeInput min={0} max={160} step={4} hardMax={FOOTER_GAP_MAX} unit="px" value={theme.footer.bottomGap} onChange={(v) => setFooter({ bottomGap: v })} className="w-full" />
          </div>
        </div>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          {(
            [
              { k: "colGap" as const, l: t("ระหว่างคอลัมน์ (แนวนอน)", "Between columns (horizontal)"), min: 0, max: 160, step: 4 },
              { k: "rowGap" as const, l: t("ระหว่างแถว (แนวตั้ง · โลโก้แถวบน↔คอลัมน์)", "Between rows (vertical · top logo row ↔ columns)"), min: 0, max: 120, step: 4 },
              { k: "linkGap" as const, l: t("ระหว่างลิงก์ในคอลัมน์", "Between links in a column"), min: 0, max: 32, step: 1 },
              { k: "stackGap" as const, l: t("ระหว่าง 2 หัวข้อที่ซ้อนกัน (⤵)", "Between 2 stacked headings (⤵)"), min: 0, max: 96, step: 2 },
            ]
          ).map((s) => (
            <div key={s.k}>
              <label className={labelCls}>
                {s.l} ({theme.footer[s.k]}px)
              </label>
              <RangeInput min={s.min} max={s.max} step={s.step} hardMax={FOOTER_GAP_MAX} unit="px" value={theme.footer[s.k]} onChange={(v) => setFooter({ [s.k]: v } as Partial<FooterConfig>)} className="w-full" />
            </div>
          ))}
          <div>
            <label className={labelCls}>{t("หัวข้อ → ลิงก์แรก", "Heading → first link")} ({theme.footer.headGap < 0 ? t("อัตโนมัติ", "auto") : `${theme.footer.headGap}px`})</label>
            <div className="flex items-center gap-2">
              <RangeInput
                min={0}
                max={40}
                step={1}
                hardMax={FOOTER_GAP_MAX}
                unit="px"
                value={theme.footer.headGap < 0 ? 16 : theme.footer.headGap}
                onChange={(v) => setFooter({ headGap: v })}
                className={`flex-1 ${theme.footer.headGap < 0 ? "opacity-40" : ""}`}
              />
              {theme.footer.headGap >= 0 && (
                <button type="button" className="text-[11px] text-slate-500 hover:underline" onClick={() => setFooter({ headGap: -1 })}>
                  {t("อัตโนมัติ", "Auto")}
                </button>
              )}
            </div>
          </div>
          <div>
            <label className={labelCls}>{t("ความกว้างคอลัมน์ (จอคอม)", "Column width (desktop)")}</label>
            <select className={inputCls} value={theme.footer.colFit} onChange={(e) => setFooter({ colFit: e.target.value as FooterConfig["colFit"] })}>
              <option value="equal">{t("เท่ากัน เต็มความกว้าง (แบบเดิม)", "Equal, full width (default)")}</option>
              <option value="content">{t("ชิดกันตามเนื้อหา (ห่างเท่า “ระหว่างคอลัมน์”)", "Fit content (gap = “Between columns”)")}</option>
            </select>
          </div>
        </div>
      </DesignCard>

      <DesignCard title="คอลัมน์" hint={t("เลือกชนิดคอลัมน์ ตั้งหัวข้อ ลาก ⠿ จัดลำดับ · กว้าง 1 หรือ 2 ช่อง · กด ⤵ ซ้อนใต้ = 2 หัวข้อในคอลัมน์เดียว · 👁 ปิดตา = ซ่อนชั่วคราว (ไม่ลบ) · จำนวนคอลัมน์ต่อแถว (คอม/มือถือ) ตั้งได้ด้านล่าง", "Pick column type, set a heading, drag ⠿ to reorder · width 1 or 2 · ⤵ Stack = 2 headings in one column · 👁 closed eye = hide temporarily (not deleted) · columns per row (desktop/mobile) below")} summary={theme.footer.columns ? t(`${theme.footer.columns.length} คอลัมน์`, `${theme.footer.columns.length} columns`) : t("คอลัมน์อัตโนมัติ", "Auto columns")}>
        <FooterHealthSummary columns={theme.footer.columns ?? []} bottomLinks={theme.footer.bottomLinks} shopSlug={shopSlug} />
        {theme.footer.columns === null ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
            {t("ตอนนี้ใช้แบบ", "Currently using ")}<b>{t("อัตโนมัติ", "auto")}</b>{t(": โลโก้ + คำอธิบายร้าน (2 ช่อง) · เมนู · ติดต่อ", ": logo + shop description (2 wide) · menu · contact")}
            <div className="mt-3">
              <button type="button" className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700" onClick={() => setFooter({ columns: [newFooterColumn("about"), newFooterColumn("links"), newFooterColumn("contact")] })}>
                {t("จัดคอลัมน์เอง (เริ่มจากชุดอัตโนมัติ)", "Customize columns (start from the auto set)")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <FooterColumnsEditor
              columns={theme.footer.columns}
              onChange={(columns) => setFooter({ columns })}
              choices={choices}
              pages={storePages}
              onEditSocial={() => setFooterSocialOpen(true)}
              shopSlug={shopSlug}
              grid={{ gridCols: theme.footer.gridCols, mobileCols: theme.footer.mobileCols }}
              onGrid={(p) => setFooter(p)}
            />
            <button type="button" className="mt-3 text-xs text-slate-500 hover:text-rose-600 hover:underline" onClick={() => { if (confirm(t("กลับไปใช้ท้ายเว็บแบบอัตโนมัติ? (คอลัมน์ที่จัดไว้จะหาย)", "Go back to the auto footer? (your columns will be removed)"))) setFooter({ columns: null }); }}>{t("กลับไปใช้แบบอัตโนมัติ", "Back to auto")}</button>
          </>
        )}
      </DesignCard>

      <DesignCard title="แถวล่างสุด">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mb-3">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.footer.showCopyright} onChange={(e) => setFooter({ showCopyright: e.target.checked })} />
          {t("แสดง © ปี + ชื่อร้าน (ข้อความท้ายเว็บตั้งที่แท็บข้อมูลร้าน)", "Show © year + shop name (footer text is set in the Shop info tab)")}
        </label>
        {theme.footer.showCopyright && (
          <div className="mb-3">
            <label className={labelCls}>{t("ข้อความ © (ว่าง = แบบเดิม · ใส่", "© text (empty = default ·")} {"{year}"} {t("= ปีปัจจุบัน ·", "= current year ·")} {"{shop}"} {t("= ชื่อร้าน)", "= shop name)")}</label>
            <LangInput className={inputCls} obj={theme.footer} k="copyrightText" maxLength={200} placeholder={t("© {year} {shop}. สงวนลิขสิทธิ์.", "© {year} {shop}. All rights reserved.")} onPatch={(p) => setFooter(p as Partial<FooterConfig>)} />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 mb-3">
          <div>
            <label className={labelCls}>{t("จัดแถวล่างสุด", "Bottom row alignment")}</label>
            <select className={inputCls} value={theme.footer.bottomAlign} onChange={(e) => setFooter({ bottomAlign: e.target.value as FooterConfig["bottomAlign"] })}>
              <option value="auto">{t("อัตโนมัติ (แบบเดิม)", "Auto (default)")}</option>
              <option value="left">{t("ชิดซ้ายทั้งหมด", "All left")}</option>
              <option value="center">{t("กึ่งกลาง", "Center")}</option>
              <option value="split">{t("ซ้าย-ขวา (ข้อความซ้าย · ไอคอนชำระเงินขวา)", "Split (text left · payment icons right)")}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer sm:mt-6">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.footer.divider} onChange={(e) => setFooter({ divider: e.target.checked })} />
            {t("เส้นคั่นเหนือแถวล่างสุด", "Divider above bottom row")}
          </label>
        </div>
        <label className={labelCls}>{t("ไอคอนช่องทางชำระเงิน", "Payment method icons")}</label>
        <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3">
          {PAYMENT_ICONS.map((pm) => (
            <label key={pm.value} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={theme.footer.payments.includes(pm.value)} onChange={(e) => setFooter({ payments: e.target.checked ? [...theme.footer.payments, pm.value] : theme.footer.payments.filter((v) => v !== pm.value) })} />
              {labelEn(pm.label)}
            </label>
          ))}
        </div>
        <label className={labelCls}>{t("หน้าตาโลโก้ชำระเงิน/ขนส่ง", "Payment/shipping logo style")}</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {([
            ["text" as const, t("ป้ายตัวหนังสือ (แบบเดิม)", "Text tags (default)")],
            ["color" as const, t("โลโก้สี", "Color logos")],
            ["mono" as const, t("โลโก้ขาวดำ", "Mono logos")],
          ] as [FooterConfig["paymentStyle"], string][]).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setFooter({ paymentStyle: v })} className={`px-3 py-1.5 rounded-lg border text-xs transition ${theme.footer.paymentStyle === v ? "border-blue-600 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
              {l}
            </button>
          ))}
        </div>
        <label className={labelCls}>{t("🚚 ขนส่งที่ใช้ (โชว์ต่อจากช่องทางชำระเงิน)", "🚚 Shipping carriers (shown after payment methods)")}</label>
        <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3">
          {SHIP_ICON_LABELS.map((sh) => (
            <label key={sh.value} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={theme.footer.shipping.includes(sh.value)} onChange={(e) => setFooter({ shipping: e.target.checked ? [...theme.footer.shipping, sh.value] : theme.footer.shipping.filter((v) => v !== sh.value) })} />
              {labelEn(sh.label)}
            </label>
          ))}
        </div>
        <label className={labelCls}>{t("ลิงก์แถวล่าง (เช่น นโยบายความเป็นส่วนตัว · เงื่อนไข)", "Bottom row links (e.g. Privacy policy · Terms)")}</label>
        <MenuEditor items={theme.footer.bottomLinks} onChange={(bottomLinks) => setFooter({ bottomLinks })} choices={choices} pages={storePages} depth={1} />
        <button type="button" className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:border-slate-500" onClick={() => setFooter({ bottomLinks: [...theme.footer.bottomLinks, newMenuItem("ลิงก์ใหม่", "page")] })}>{t("+ เพิ่มลิงก์", "+ Add link")}</button>
      </DesignCard>

      {/* 📱 มือถือ */}
      <DesignCard title="📱 บนมือถือ">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mb-2">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.footer.mobileCollapse} onChange={(e) => setFooter({ mobileCollapse: e.target.checked })} />
          {t("หัวคอลัมน์กดพับ/กางได้ (ท้ายเว็บสั้นลง ไม่ต้องเลื่อนยาว)", "Column headings collapse/expand (shorter footer, less scrolling)")}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.footer.mobileCenter} onChange={(e) => setFooter({ mobileCenter: e.target.checked })} />
          {t("จัดกึ่งกลางบนมือถือ (จอคอมตามที่ตั้งด้านบน)", "Center on mobile (desktop follows the setting above)")}
        </label>
      </DesignCard>
      {areaFold("footer", FOOTER_PARTS, t("หัวคอลัมน์ · ลิงก์ · โซเชียล · แถวล่าง", "Column headings · links · social · bottom row"))}
    </>
  );
}

/* ─────────── Footer: คอลัมน์ ─────────── */
export function FooterColumnsEditor({
  columns,
  onChange,
  choices,
  pages,
  onEditSocial,
  shopSlug,
  grid,
  onGrid,
}: {
  columns: FooterColumn[];
  onChange: (c: FooterColumn[]) => void;
  choices: Choices;
  pages: { slug: string; title: string; help?: string; status?: string }[];
  onEditSocial?: () => void;
  shopSlug?: string;
  /** 🧱 คอลัมน์ต่อแถว (คอม/มือถือ) */
  grid?: { gridCols: number; mobileCols: 1 | 2 };
  onGrid?: (p: { gridCols?: number; mobileCols?: 1 | 2 }) => void;
}) {
  const t = useT();
  const drag = useDragReorder((from, to) => onChange(moveItem(columns, from, to)));
  // 🧭 กลุ่มศูนย์ช่วยเหลือที่มีอยู่ (จากหน้าเว็บที่ตั้งกลุ่มไว้) + หน้าในกลุ่ม (กด ✎ เปิดแก้หน้านั้นในแท็บใหม่)
  const helpGroups = useMemo(() => {
    const m = new Map<string, { slug: string; title: string; status?: string }[]>();
    for (const p of pages) if (p.help) m.set(p.help, [...(m.get(p.help) ?? []), { slug: p.slug, title: p.title, status: p.status }]);
    return [...m.entries()].map(([name, list]) => ({ name, titles: list.map((x) => x.title), list, drafts: list.filter((x) => x.status && x.status !== "published").length }));
  }, [pages]);
  // 🩺 คอลัมน์ที่จะไม่ขึ้นเว็บจริง / มีลิงก์ไปหน้าที่ยังไม่มี-เป็นร่าง (ปิดตาไว้ = ตั้งใจซ่อน ไม่เตือน)
  const health = useContext(PageHealthCtx);
  const colIssue = (c: FooterColumn) => (health && !c.hidden ? footerColumnIssue(c, health) : null);
  const [openId, setOpenId] = useState<string | null>(null);
  const setCol = (id: string, patch: Partial<FooterColumn>) => onChange(columns.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const mini = "h-7 rounded-lg border border-slate-200 text-[11px] px-1.5 bg-white text-slate-700";
  // คอลัมน์ที่ "วางต่อใต้คอลัมน์ก่อนหน้า" ไม่กินช่องเพิ่ม (คอลัมน์แรกซ้อนไม่ได้) · 👁 ปิดตา = ไม่นับ (เว็บร้านนับแบบเดียวกัน)
  const visible = columns.filter((c) => !c.hidden);
  const used = visible.reduce((n, c, i) => n + (c.stack && i > 0 ? 0 : c.width), 0);
  return (
    <div>
      <ul className="space-y-1">
        {columns.map((c, i) => {
          const def = FOOTER_COL_DEFS.find((d) => d.key === c.kind)!;
          const open = openId === c.id;
          const stacked = c.stack && i > 0;
          return (
            <li key={c.id} {...drag.rowProps(i)} className={`rounded-lg border ${open ? "border-blue-300" : "border-slate-200"} ${c.hidden ? "bg-slate-50" : "bg-white"} ${stacked ? "ml-6" : ""} ${drag.rowCls(i)}`}>
              <div className={`flex items-center gap-1.5 px-2 py-1.5 ${c.hidden ? "[&>*:not(.eye-btn)]:opacity-40" : ""}`}>
                <DragHandle {...drag.handleProps(i)} />
                {stacked && <span className="text-slate-300 text-xs -ml-0.5" title={t("อยู่ใต้คอลัมน์ก่อนหน้า (คอลัมน์เดียวกัน)", "Under the previous column (same column)")}>↳</span>}
                <select className={mini} value={c.kind} onChange={(e) => setCol(c.id, { kind: e.target.value as FooterColKind })}>
                  {FOOTER_COL_DEFS.map((d) => <option key={d.key} value={d.key}>{labelEn(d.label)}</option>)}
                </select>
                <LangInput className={`${mini} flex-1 min-w-0`} obj={c} k="title" maxLength={60} placeholder={def.defaultTitle ? labelEn(def.defaultTitle) : t("หัวข้อ (ไม่บังคับ)", "Heading (optional)")} onPatch={(p) => setCol(c.id, p)} />
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => setCol(c.id, { stack: !c.stack })}
                    title={stacked ? t("แยกเป็นคอลัมน์ใหม่", "Split into a new column") : t("วางต่อใต้คอลัมน์ก่อนหน้า (2 หัวข้อในคอลัมน์เดียว)", "Stack under the previous column (2 headings in one column)")}
                    className={`h-7 shrink-0 rounded-lg border px-1.5 text-[11px] ${stacked ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}
                  >
                    {stacked ? t("↳ ซ้อนอยู่", "↳ Stacked") : t("⤵ ซ้อนใต้", "⤵ Stack")}
                  </button>
                )}
                <select className={mini} value={c.width} disabled={stacked} onChange={(e) => setCol(c.id, { width: Number(e.target.value) === 2 ? 2 : 1 })} title={stacked ? t("ความกว้างตามคอลัมน์บนสุดของกลุ่ม", "Width follows the top column of the group") : t("ความกว้าง", "Width")}>
                  <option value={1}>{t("กว้าง 1", "Width 1")}</option>
                  <option value={2}>{t("กว้าง 2", "Width 2")}</option>
                </select>
                {/* 👁 เปิด-ปิดตา: ซ่อนจากเว็บชั่วคราว ไม่ต้องลบ (ค่าที่ตั้งไว้ยังอยู่) */}
                <button
                  type="button"
                  onClick={() => setCol(c.id, { hidden: !c.hidden })}
                  className={`eye-btn h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md border text-sm ${c.hidden ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}
                  title={c.hidden ? t("ซ่อนอยู่ — กดเพื่อโชว์บนเว็บ", "Hidden — click to show on the site") : t("โชว์อยู่ — กดเพื่อซ่อน (ไม่ลบ)", "Shown — click to hide (not deleted)")}
                  aria-pressed={!c.hidden}
                >
                  {c.hidden ? "🙈" : "👁"}
                </button>
                <button type="button" onClick={() => setOpenId(open ? null : c.id)} className={`text-xs px-1.5 h-7 rounded-md border ${open ? "border-blue-500 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-500 hover:border-slate-400"}`} title={t("ตั้งค่าเพิ่ม", "More settings")}>✎</button>
                <button type="button" onClick={() => onChange(columns.filter((x) => x.id !== c.id))} className="text-slate-300 hover:text-rose-600 px-1" title={t("ลบ", "Delete")}>✕</button>
              </div>
              {(() => {
                const iss = colIssue(c);
                return iss ? <IssueNote issue={iss} className="mx-2 mb-1.5" /> : null;
              })()}
              {open && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2">
                  <p className="text-[11px] text-slate-400">{labelEn(def.hint)}</p>
                  {(c.kind === "text" || c.kind === "about" || c.kind === "newsletter") && (
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">{c.kind === "about" ? t("คำอธิบาย (ว่าง = ใช้คำอธิบายร้านจากแท็บข้อมูลร้าน)", "Description (empty = use the shop description from the Shop info tab)") : t("ข้อความ", "Text")}</label>
                      <LangInput multiline className="w-full rounded-lg border border-slate-200 text-xs px-2 py-1.5 bg-white text-slate-700" rows={3} obj={c} k="text" onPatch={(p) => setCol(c.id, p)} />
                    </div>
                  )}
                  {c.kind === "links" && (
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">{t("ลิงก์ (ว่าง = อัตโนมัติ)", "Links (empty = auto)")}</label>
                      <MenuEditor items={c.links} onChange={(links) => setCol(c.id, { links })} choices={choices} pages={pages} depth={1} />
                      <button type="button" className="mt-2 text-[11px] text-blue-600 hover:underline" onClick={() => setCol(c.id, { links: [...c.links, newMenuItem("ลิงก์ใหม่", "page")] })}>{t("+ เพิ่มลิงก์", "+ Add link")}</button>
                    </div>
                  )}
                  {c.kind === "social" && onEditSocial && (
                    <button type="button" onClick={onEditSocial} className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-400">{t("🌐 แก้/เพิ่มลิงก์โซเชียล", "🌐 Edit/add social links")}</button>
                  )}
                  {c.kind === "help" && (
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">{t("กลุ่มที่จะโชว์", "Group to show")}</label>
                      {helpGroups.length ? (
                        <select className="w-full rounded-lg border border-slate-200 text-xs px-2 py-1.5 bg-white text-slate-700" value={c.text} onChange={(e) => setCol(c.id, { text: e.target.value })}>
                          <option value="">{t("— เลือกกลุ่ม —", "— Pick group —")}</option>
                          {helpGroups.map((g) => (
                            <option key={g.name} value={g.name}>
                              {g.name} ({t(`${g.titles.length} หน้า`, `${g.titles.length} pages`)}{g.drafts ? t(` · ร่าง ${g.drafts}`, ` · ${g.drafts} drafts`) : ""})
                            </option>
                          ))}
                          {c.text && !helpGroups.some((g) => g.name === c.text) && <option value={c.text}>{c.text} {t("(ยังไม่มีหน้า)", "(no pages yet)")}</option>}
                        </select>
                      ) : (
                        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">{t("ยังไม่มีหน้าที่อยู่ในกลุ่มศูนย์ช่วยเหลือ — ไปที่แท็บ 📄 หน้าเว็บ แล้วกด “🧭 สร้างชุดศูนย์ช่วยเหลือ” หรือตั้งกลุ่มให้หน้าที่มีอยู่", "No pages in a help center group yet — go to the 📄 Pages tab and click “🧭 Create help center set”, or assign a group to existing pages")}</p>
                      )}
                      {(() => {
                        const g = helpGroups.find((x) => x.name === c.text);
                        if (!g) return null;
                        return (
                          <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2">
                            <p className="text-[11px] text-slate-500 mb-1">{t("ลิงก์ที่จะขึ้น (ชื่อ/ลำดับ/เนื้อหา แก้ที่แท็บ 📄 หน้าเว็บ — กด ✎ เปิดแก้หน้านั้นในแท็บใหม่)", "Links that will show (edit name/order/content in the 📄 Pages tab — click ✎ to edit that page in a new tab)")}</p>
                            <ul className="space-y-0.5">
                              {g.list.map((p) => (
                                <li key={p.slug} className="flex items-center gap-2 text-xs text-slate-700">
                                  <span className="flex-1 truncate">{p.title}</span>
                                  {p.status && (p.status === "published" ? (
                                    <span className="rounded bg-emerald-50 px-1.5 text-[10px] text-emerald-700">{t("ขึ้นเว็บแล้ว", "Live")}</span>
                                  ) : (
                                    <span className="rounded bg-amber-100 px-1.5 text-[10px] text-amber-800" title={t("ลูกค้ายังไม่เห็น — เผยแพร่ที่แท็บ 📄 หน้าเว็บ", "Customers can't see it yet — publish in the 📄 Pages tab")}>{t("ร่าง", "Draft")}</span>
                                  ))}
                                  <span className="text-[10px] text-slate-400">/{p.slug}</span>
                                  {shopSlug && (
                                    <a href={`/website/${encodeURIComponent(shopSlug)}?tab=pages&page=${encodeURIComponent(p.slug)}`} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline" title={t("เปิดแก้หน้านี้ในแท็บใหม่", "Edit this page in a new tab")}>
                                      {t("✎ แก้", "✎ Edit")}
                                    </a>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3 mt-2">
        <button type="button" className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700" onClick={() => { const c = newFooterColumn(); onChange([...columns, c]); setOpenId(c.id); }}>{t("+ เพิ่มคอลัมน์", "+ Add column")}</button>
        {(() => {
          // 🧱 อัตโนมัติ = แถวละเท่าจำนวนช่องที่ใช้ (สูงสุด 6) → เต็มความกว้างพอดี
          const per = grid?.gridCols ? grid.gridCols : Math.min(6, Math.max(1, used));
          return (
            <span className="text-[11px] text-slate-400">
              {t(`ใช้ไป ${used} ช่อง · แถวละ ${per} คอลัมน์`, `Using ${used} slots · ${per} columns per row`)}{used > per ? t(" — เกินจะขึ้นแถวใหม่", " — extra goes to a new row") : used < per ? t(` — เหลือที่ว่าง ${per - used} ช่อง`, ` — ${per - used} slots free`) : t(" — พอดีแถว", " — fits the row")}
            </span>
          );
        })()}
      </div>
      {grid && onGrid && (
        <div className="grid gap-3 sm:grid-cols-2 mt-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">{t("🧱 คอลัมน์ต่อแถว (จอคอม)", "🧱 Columns per row (desktop)")}</label>
            <select className="w-full rounded-lg border border-slate-200 text-sm px-2.5 py-1.5 bg-white text-slate-700" value={grid.gridCols} onChange={(e) => onGrid({ gridCols: Number(e.target.value) })}>
              <option value={0}>{t("อัตโนมัติ — เท่าที่ใช้ เต็มความกว้าง (ตอนนี้", "Auto — as used, full width (now")} {Math.min(6, Math.max(1, used))})</option>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {t(`${n} คอลัมน์`, `${n} columns`)}{n === 4 ? t(" (แบบเดิม)", " (default)") : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">{t("📱 คอลัมน์ต่อแถว (มือถือ)", "📱 Columns per row (mobile)")}</label>
            <select className="w-full rounded-lg border border-slate-200 text-sm px-2.5 py-1.5 bg-white text-slate-700" value={grid.mobileCols} onChange={(e) => onGrid({ mobileCols: Number(e.target.value) === 2 ? 2 : 1 })}>
              <option value={1}>{t("1 คอลัมน์ (เรียงลงมา · แบบเดิม)", "1 column (stacked · default)")}</option>
              <option value={2}>{t("2 คอลัมน์ (คู่กัน · ช่องกว้าง 2 เต็มแถว)", "2 columns (paired · width-2 spans full row)")}</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}