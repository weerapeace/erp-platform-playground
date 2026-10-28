"use client";

/** รูปทรง · การเคลื่อนไหว · ฐานหน้าตาทั้งเว็บ (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { BUTTON_SHAPES, BUTTON_SIZES, SHADOW_LEVELS, RADIUS_PX_CHOICES, resolveOnBrand, type Shape } from "@/lib/website-theme";
import { WheelSelect } from "@/components/wheel-select";
import { SiteControlsSetting, SiteMotionSetting, SitePageSetting, SiteSalesSetting } from "@/components/website-site-design-setting";
import { labelCls, cardCls, ResetBtn } from "./shared";
import { useDesign } from "./context";

export function ShapeTab() {
  const { theme, published, choices, apply, setShape, setPage } = useDesign();
  return (
    <>
      {/* ✨ การเคลื่อนไหวทั้งเว็บ — เว็บร้าน: PageMotion + ::view-transition (globals.css) */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">✨ การเคลื่อนไหวทั้งเว็บ</h3>
        <p className="text-xs text-slate-500 mb-3">ตอนลูกค้ากดไปหน้าอื่น · ลูกค้าที่ตั้งเครื่องให้ลดการเคลื่อนไหว จะไม่เห็นแอนิเมชันเสมอ</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {([
            ["fade", "จางเปลี่ยนหน้า", "หน้าเก่าจางออก หน้าใหม่จางเข้า (แนะนำ)"],
            ["rise", "เลื่อนขึ้น", "หน้าใหม่ลอยขึ้นพร้อมจางเข้า ดูหรูขึ้น"],
            ["curtain", "ม่านสีแบรนด์", "ม่านสีหลักปาดขึ้นปิดจอ แล้วเปิดเป็นหน้าใหม่"],
            ["logo", "โลโก้วาบ", "จอเป็นสีพื้นพร้อมโลโก้กลางจอ แล้วเปิดหน้าใหม่"],
            ["zoom", "ซูมเข้า", "หน้าใหม่ซูมเข้าเบา ๆ พร้อมจาง"],
            ["none", "ไม่มี", "เปลี่ยนหน้าทันที"],
          ] as const).map(([v, l, d]) => (
            <button
              key={v}
              type="button"
              onClick={() => apply({ ...theme, page: { ...theme.page, transition: v } })}
              className={`text-left px-3 py-2 rounded-lg border text-sm transition ${theme.page.transition === v ? "border-blue-600 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
            >
              <span className="block font-medium">{l}</span>
              <span className="block text-[11px] text-slate-500">{d}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.page.smoothScroll} onChange={(e) => apply({ ...theme, page: { ...theme.page, smoothScroll: e.target.checked } })} />
          เลื่อนจอนุ่ม (Smooth scroll)
        </label>
        <p className="text-[11px] text-slate-400 mt-1">เลื่อนลูกกลิ้งเมาส์แล้วหน้าเว็บไหลนุ่มแบบเว็บแบรนด์หรู · ใช้กับคอมที่ใช้เมาส์/ทัชแพด (มือถือเลื่อนแบบปกติ) · ไม่ทำงานในพรีวิวนี้ — ดูผลบนเว็บจริง</p>
      </div>
      {/* ✨ ลูกเล่นทั้งเว็บ (ชุด 2): Section โผล่ · หน้าโหลดแรก · เคอร์เซอร์ · แถบเลื่อนอ่าน · ปุ่มกลับขึ้นบน */}
      <SiteMotionSetting value={theme.page} onChange={(p) => apply({ ...theme, page: { ...theme.page, ...p } })} />
      {/* 📱 มือถือและช่วยขาย (ชุด 3): แถบเมนูล่าง · ปุ่มแชท · ค้นหาตอนยังไม่พิมพ์ · แถบคุกกี้ */}
      <SiteSalesSetting value={theme.page} onChange={(p) => apply({ ...theme, page: { ...theme.page, ...p } })} colors={theme.colors} onPreview={setPage} />
      {/* 🧱 ฐานหน้าตาทั้งเว็บ (ชุด 1) — components/website-site-design-setting · เว็บร้าน src/lib/site-design-css.ts */}
      <SitePageSetting value={theme.page} onChange={(p) => apply({ ...theme, page: { ...theme.page, ...p } })} colors={{ brand: theme.colors.brand, ink: theme.colors.ink, page: theme.colors.page, onBrand: resolveOnBrand(theme.colors) }} />
      <SiteControlsSetting value={theme.shape} onChange={(p) => setShape(p)} colors={{ brand: theme.colors.brand, ink: theme.colors.ink, page: theme.colors.page, onBrand: resolveOnBrand(theme.colors) }} />
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">ความมนของขอบ (ค่ารวมทั้งเว็บ)</h3>
        <div className="flex flex-wrap gap-2">
          {choices.radius.map((o) => (
            <button
              key={o.value}
              onClick={() => apply({ ...theme, radius: o.value })}
              className={`px-4 py-3 border text-sm transition ${theme.radius === o.value ? "border-blue-600 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
              style={{ borderRadius: o.value === "sharp" ? 2 : o.value === "soft" ? 12 : 22 }}
            >
              {o.label}
            </button>
          ))}
          <ResetBtn show={theme.radius !== published.radius} onClick={() => apply({ ...theme, radius: published.radius })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3 mt-4 pt-3 border-t border-slate-100">
          {([
            ["cardRadius", "ขอบการ์ด/กล่อง"],
            ["imageRadius", "ขอบรูปบนการ์ด"],
            ["inputRadius", "ขอบช่องกรอก"],
          ] as const).map(([k, label]) => (
            <div key={k}>
              <label className={labelCls}>{label}</label>
              <WheelSelect value={theme.shape[k] == null ? "" : String(theme.shape[k])} onChange={(e) => setShape({ [k]: e.target.value === "" ? null : Number(e.target.value) } as Partial<Shape>)}>
                <option value="">ตามค่ารวม</option>
                {RADIUS_PX_CHOICES.map((n) => <option key={n} value={n}>{n === 0 ? "เหลี่ยม (0)" : `${n} px`}</option>)}
              </WheelSelect>
            </div>
          ))}
        </div>
      </div>

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">ปุ่ม · เส้นขอบ · เงา</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>รูปทรงปุ่ม</label>
            <div className="flex flex-wrap gap-2">
              {BUTTON_SHAPES.map((o) => (
                <button key={o.value} onClick={() => setShape({ button: o.value })} className={`px-3.5 py-2 border text-xs transition ${theme.shape.button === o.value ? "border-blue-600 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:border-slate-400"}`} style={{ borderRadius: o.value === "pill" ? 99 : o.value === "rounded" ? 10 : 2 }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>ขนาดปุ่ม</label>
            <WheelSelect value={theme.shape.buttonSize} onChange={(e) => setShape({ buttonSize: e.target.value as Shape["buttonSize"] })}>
              {BUTTON_SIZES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </WheelSelect>
          </div>
          <div>
            <label className={labelCls}>ความหนาเส้นขอบ (การ์ด/ช่องกรอก)</label>
            <WheelSelect value={theme.shape.borderWidth} onChange={(e) => setShape({ borderWidth: Number(e.target.value) === 2 ? 2 : 1 })}>
              <option value={1}>บาง (1 px)</option>
              <option value={2}>หนา (2 px)</option>
            </WheelSelect>
          </div>
          <div>
            <label className={labelCls}>เงาของการ์ด</label>
            <WheelSelect value={theme.shape.shadow} onChange={(e) => setShape({ shadow: e.target.value as Shape["shadow"] })}>
              {SHADOW_LEVELS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </WheelSelect>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className={labelCls}>ตัวอย่าง (ปุ่ม · ช่องกรอก · การ์ด)</p>
          <div className="flex flex-wrap items-center gap-3 rounded-xl p-4" style={{ background: theme.colors.page }}>
            {(() => {
              const r = theme.radius === "sharp" ? { sm: 2, lg: 4 } : theme.radius === "soft" ? { sm: 8, lg: 20 } : { sm: 14, lg: 30 };
              const br = theme.shape.button === "pill" ? 99 : theme.shape.button === "rounded" ? 10 : 2;
              const pad = theme.shape.buttonSize === "sm" ? "8px 16px" : theme.shape.buttonSize === "lg" ? "14px 28px" : "11px 22px";
              const fs = theme.shape.buttonSize === "sm" ? 10 : theme.shape.buttonSize === "lg" ? 13 : 11;
              const shadow = theme.shape.shadow === "none" ? "none" : theme.shape.shadow === "soft" ? "0 1px 2px rgba(20,21,23,.06)" : "0 12px 32px rgba(20,21,23,.14)";
              const tr = theme.typography.button;
              const btnFont = { fontFamily: `"${tr.font || theme.fonts.body}", sans-serif`, fontWeight: tr.weight, letterSpacing: `${tr.spacing / 100}em`, textTransform: tr.uppercase ? ("uppercase" as const) : ("none" as const), fontStyle: tr.italic ? "italic" : "normal" };
              return (
                <>
                  <span className="text-white" style={{ background: theme.colors.brand, borderRadius: br, padding: pad, fontSize: fs, ...btnFont }}>เพิ่มลงตะกร้า</span>
                  <span style={{ border: `1px solid #D6D6D2`, color: theme.colors.ink, borderRadius: br, padding: pad, fontSize: fs, ...btnFont }}>ดูเพิ่มเติม</span>
                  <span className="text-xs text-slate-400 px-3 py-2 bg-white" style={{ border: `${theme.shape.borderWidth}px solid #DEDEDA`, borderRadius: theme.shape.inputRadius ?? r.sm, minWidth: 120 }}>ช่องกรอก…</span>
                  <span className="inline-block w-24 h-16" style={{ background: theme.colors.surface, border: `${theme.shape.borderWidth}px solid #e7e7e4`, borderRadius: theme.shape.cardRadius ?? r.lg, boxShadow: shadow }} />
                  <span className="inline-block w-16 h-16 bg-slate-300" style={{ borderRadius: theme.shape.imageRadius ?? r.lg }} />
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </>
  );
}
