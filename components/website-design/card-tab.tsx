"use client";

/** การ์ดสินค้า — ชุดสำเร็จรูป · กรอบ/รูป · ป้าย · จุดสี · ระหว่างรอรูปโหลด · การ์ดจำลอง (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { ImageUploadField, keyUrl } from "@/components/website-theme-media";
import { ColorSwatchButton } from "@/components/color-swatch-manager";
import { type ImagePlaceholder, type Shape } from "@/lib/website-theme";
import { LangInput } from "@/components/bilingual-field";
import { CARD_LOOKS } from "@/lib/website-card-looks";
import { ColorInput } from "@/components/color-picker";
import { WheelSelect } from "@/components/wheel-select";
import { RangeInput } from "@/components/range-input";
import { RATIO_CSS, SampleCard } from "./sample-card";
import { type ImageRatio, type CardHover, type Theme, inputCls, labelCls, useAreaFold } from "./shared";
import { CARD_PARTS } from "@/lib/website-page-parts";
import { useDesign } from "./context";
import { DesignCard } from "./design-card";

export function CardTab() {
  const { theme, choices, setLogo, setCard, setShape, sampleItems } = useDesign();
  const areaFold = useAreaFold();
  return (
    <>
    {/* การ์ดจำลองจากสินค้าจริง — เปลี่ยนค่าแล้วเห็นทันที (ชี้เมาส์ดูเอฟเฟกต์) */}
    <DesignCard title="ตัวอย่างการ์ด (ดูผลทันที)" hint="จากสินค้าจริงในร้าน · ชี้เมาส์เพื่อดูเอฟเฟกต์" defaultOpen>
      {sampleItems.length ? (
        <div className="rounded-xl p-4" style={{ background: theme.colors.page }}>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(sampleItems.length, theme.card.columns.desktop)}, minmax(0, 1fr))`, gap: theme.card.gap === "sm" ? 8 : theme.card.gap === "lg" ? 24 : 16, maxWidth: 560 }}>
            {sampleItems.slice(0, Math.min(sampleItems.length, theme.card.columns.desktop)).map((it, i) => (
              <SampleCard key={i} item={it} card={theme.card} colors={theme.colors} fonts={theme.fonts} radius={theme.radius} shape={theme.shape} />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">ยังไม่มีสินค้าบนเว็บ — การ์ดจำลองจะโชว์เมื่อมีสินค้าที่เผยแพร่แล้ว</p>
      )}
    </DesignCard>

    <DesignCard
      title="หน้าตาการ์ด — ชุดสำเร็จรูป · รูปแบบ · ช่องหลัก"
      summary={`${choices.cardPresets.find((p) => p.value === theme.card.preset)?.label ?? theme.card.preset} · รูป ${theme.card.imageRatio} · ชื่อ ${theme.card.titleLines} บรรทัด`}
    >

      {/* 🃏 ชุดสำเร็จรูป — กดทีเดียวตั้งหลายช่อง แล้วปรับต่อเองได้ (lib/website-card-looks · ใช้ชุดเดียวกับ "การ์ดในส่วนนี้" ของ Section) */}
      <label className={labelCls}>ชุดหน้าตาสำเร็จรูป</label>
      <div className="flex flex-wrap gap-2 mb-1">
        {CARD_LOOKS.map((l) => (
          <button key={l.key} type="button" onClick={() => setCard({ ...(l.card as Partial<Theme["card"]>), ...(l.card.showBadge === false ? { autoBadges: { ...theme.card.autoBadges, sale: false, new: false, best: false } } : null) })} title={l.hint} className="px-3.5 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-blue-500 hover:text-blue-700">
            {l.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mb-4">กดแล้วตั้งช่องด้านล่างให้ทีเดียว (ปรับต่อทีละช่องได้ · กด ↶ ย้อนได้ถ้าไม่ชอบ)</p>

      <label className={labelCls}>รูปแบบการ์ด</label>
      <div className="flex flex-wrap gap-2 mb-4">
        {choices.cardPresets.map((p) => (
          <button
            key={p.value}
            onClick={() => setCard({ preset: p.value })}
            title={p.hint}
            className={`px-3.5 py-2 rounded-lg border text-sm transition ${
              theme.card.preset === p.value ? "border-blue-600 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:border-slate-400"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>สัดส่วนรูปสินค้า</label>
          <select className={inputCls} value={theme.card.imageRatio} onChange={(e) => setCard({ imageRatio: e.target.value as ImageRatio })}>
            {choices.imageRatios.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>ชื่อสินค้าแสดงกี่บรรทัด</label>
          <WheelSelect value={theme.card.titleLines} onChange={(e) => setCard({ titleLines: Number(e.target.value) })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n} บรรทัด</option>)}
          </WheelSelect>
        </div>
        <div>
          <label className={labelCls}>เอฟเฟกต์ตอนชี้เมาส์</label>
          <select className={inputCls} value={theme.card.hover} onChange={(e) => setCard({ hover: e.target.value as CardHover })}>
            {choices.cardHovers.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* "รูปในกรอบ" (เต็มกรอบ/เห็นทั้งรูป) ย้ายไปอยู่กลุ่ม 🖼 รูปบนการ์ด ข้างล่าง คู่กับสีพื้นหลัง/ระยะห่าง */}
      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        <div>
          <label className={labelCls}>ปุ่ม "เพิ่มลงตะกร้า" บนรูป</label>
          <select className={inputCls} value={theme.card.quickAdd} onChange={(e) => setCard({ quickAdd: e.target.value as Theme["card"]["quickAdd"] })}>
            <option value="hover">โผล่ตอนชี้เมาส์ (มือถือไม่มี)</option>
            <option value="always">โชว์ตลอด</option>
            <option value="none">ไม่มีปุ่ม</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>จัดข้อความ</label>
          <select className={inputCls} value={theme.card.align} onChange={(e) => setCard({ align: e.target.value as Theme["card"]["align"] })}>
            <option value="left">ชิดซ้าย</option>
            <option value="center">กึ่งกลาง</option>
          </select>
        </div>
      </div>

      {/* ⬜ ความมน/เหลี่ยมของกรอบ — ค่าเดียวกับแท็บรูปทรง (theme.shape) แก้ที่ไหนก็เปลี่ยนตาม */}
      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        {([
          ["cardRadius", "ความมนของกรอบการ์ด", "มีผลกับแบบ มีกรอบ / เงานุ่ม / ลอย"],
          ["imageRadius", "ความมนของรูปสินค้า", "มีผลกับแบบ เรียบ / มินิมอล (รูปไม่มีกรอบการ์ด)"],
        ] as const).map(([k, label, hint]) => (
          <div key={k}>
            <label className={labelCls}>{label}</label>
            <div className="flex flex-wrap gap-1.5">
              {([null, 0, 4, 8, 12, 20, 32] as const).map((n) => {
                const on = theme.shape[k] === n;
                const preview = n == null ? (theme.radius === "sharp" ? 4 : theme.radius === "round" ? 20 : 12) : n;
                return (
                  <button key={String(n)} type="button" onClick={() => setShape({ [k]: n } as Partial<Shape>)}
                    title={n == null ? "ตามค่ารวมของธีม (แท็บรูปทรง)" : n === 0 ? "เหลี่ยม" : `มน ${n}px`}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>
                    <span className="block w-6 h-6 border-2 border-current" style={{ borderRadius: Math.min(preview, 12) }} />
                    {n == null ? "ตามธีม" : n === 0 ? "เหลี่ยม" : n}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-4 mt-3">
        <div>
          <label className={labelCls}>คอลัมน์ · คอม</label>
          <WheelSelect value={theme.card.columns.desktop} onChange={(e) => setCard({ columns: { ...theme.card.columns, desktop: Number(e.target.value) } })}>
            {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </WheelSelect>
        </div>
        <div>
          <label className={labelCls}>คอลัมน์ · แท็บเล็ต</label>
          <WheelSelect value={theme.card.columns.tablet} onChange={(e) => setCard({ columns: { ...theme.card.columns, tablet: Number(e.target.value) } })}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </WheelSelect>
        </div>
        <div>
          <label className={labelCls}>คอลัมน์ · มือถือ</label>
          <WheelSelect value={theme.card.columns.mobile} onChange={(e) => setCard({ columns: { ...theme.card.columns, mobile: Number(e.target.value) } })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </WheelSelect>
        </div>
        <div>
          <label className={labelCls}>ระยะห่างการ์ด</label>
          <WheelSelect value={theme.card.gap} onChange={(e) => setCard({ gap: e.target.value as Theme["card"]["gap"] })}>
            <option value="sm">ชิด</option>
            <option value="md">ปกติ</option>
            <option value="lg">ห่าง</option>
          </WheelSelect>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        <div>
          <label className={labelCls}>ขนาดชื่อสินค้า ({theme.card.nameSize}%)</label>
          <RangeInput min={60} max={180} step={5} value={theme.card.nameSize} onChange={(v) => setCard({ nameSize: v })} className="w-full" />
        </div>
        <div>
          <label className={labelCls}>ขนาดราคา ({theme.card.priceSize}%)</label>
          <RangeInput min={60} max={180} step={5} value={theme.card.priceSize} onChange={(v) => setCard({ priceSize: v })} className="w-full" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        <div>
          <label className={labelCls}>ชื่อ-ราคา</label>
          <select className={inputCls} value={theme.card.infoLayout} onChange={(e) => setCard({ infoLayout: e.target.value as Theme["card"]["infoLayout"] })}>
            <option value="stack">ราคาอยู่ใต้ชื่อ (แบบเดิม)</option>
            <option value="split">ชื่อซ้าย · ราคาขวา บรรทัดเดียวกัน</option>
          </select>
          {theme.card.infoLayout === "split" && <p className="text-[11px] text-slate-400 mt-0.5">ชื่อยาวตัดเหลือ 1 บรรทัด · ราคาชิดขวาเสมอ</p>}
        </div>
        <div>
          <label className={labelCls}>ความหนาราคา</label>
          <WheelSelect value={theme.card.priceWeight} onChange={(e) => setCard({ priceWeight: Number(e.target.value) as Theme["card"]["priceWeight"] })}>
            <option value={400}>บาง</option>
            <option value={500}>กลาง</option>
            <option value={600}>หนา (แบบเดิม)</option>
            <option value={700}>หนามาก</option>
          </WheelSelect>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-3 border-t border-slate-100">
        {([
          ["showBadge", "ป้าย (ขายดี/แนะนำ)"],
          ["showStock", "สถานะสต๊อก"],
          ["showCategory", "ชื่อหมวดเหนือชื่อสินค้า"],
          ["showUnit", "หน่วย (/ ใบ)"],
          ["showCompare", "ราคาเต็มขีดฆ่า (fake_price)"],
          ["showSwatches", "จุดสีตัวเลือก"],
        ] as const).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.card[k]} onChange={(e) => setCard({ [k]: e.target.checked } as Partial<Theme["card"]>)} />
            {label}
          </label>
        ))}
        {/* หน้าตาจุดสีมาจากทะเบียนสีกลาง (ใช้ทุกร้าน) — บันทึกแล้วเว็บเปลี่ยนทันที ไม่ต้องกดเผยแพร่ธีม */}
        <span className="ml-auto"><ColorSwatchButton /></span>
      </div>

    </DesignCard>

    {/* 🎨 จุดสีบนการ์ด */}
    <DesignCard
      title="จุดสีบนการ์ด"
      summary={theme.card.showSwatches ? `โชว์สูงสุด ${theme.card.swatchMax} จุด${theme.card.swatchSwap ? " · ชี้แล้วเปลี่ยนรูป" : ""}` : "ปิดอยู่ (เปิด “จุดสีตัวเลือก” ในการ์ดหน้าตาการ์ด)"}
    >
      {!theme.card.showSwatches && <p className="text-xs text-slate-400">ยังไม่ได้เปิด “จุดสีตัวเลือก” — ติ๊กในการ์ด “หน้าตาการ์ด” ด้านบนก่อน</p>}
      {theme.card.showSwatches && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              ตำแหน่ง
              <WheelSelect value={theme.card.swatchPos} onChange={(e) => setCard({ swatchPos: e.target.value as Theme["card"]["swatchPos"] })}>
                <option value="below">ใต้ราคา (แบบเดิม)</option>
                <option value="name">ขวาของชื่อ (1 ช่อง + จำนวนที่เหลือ)</option>
              </WheelSelect>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              ทรง
              <WheelSelect value={theme.card.swatchShape} onChange={(e) => setCard({ swatchShape: e.target.value as Theme["card"]["swatchShape"] })}>
                <option value="circle">วงกลม (แบบเดิม)</option>
                <option value="square">สี่เหลี่ยม</option>
                <option value="rounded">มุมมน</option>
              </WheelSelect>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {theme.card.swatchPos !== "name" && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              จุดสีสูงสุด
              <WheelSelect value={theme.card.swatchMax} onChange={(e) => setCard({ swatchMax: Number(e.target.value) })}>
                {[3, 4, 5, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} จุด</option>)}
              </WheelSelect>
              <span className="text-[11px] text-slate-400">เกินโชว์ +N</span>
            </label>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.card.swatchSwap} onChange={(e) => setCard({ swatchSwap: e.target.checked })} />
              ชี้ (คอม) / แตะ (มือถือ) จุดสี แล้วรูปการ์ดเปลี่ยนเป็นสีนั้น
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.card.showColorCount} onChange={(e) => setCard({ showColorCount: e.target.checked })} />
              โชว์จำนวนสี (เช่น &quot;4 สี&quot;)
            </label>
          </div>
          <p className="text-[11px] text-slate-400">เลือกว่าแต่ละรุ่นโชว์สีไหนบ้าง + ★ สีหลัก (รูปแรกบนการ์ด) ได้ที่ Parent SKU → แท็บ 🛍 เว็บไซต์ · ไม่ตั้ง = ทุกสีตามลำดับเดิม · กดการ์ดหลังเลือกสี = เปิดหน้าสินค้าโดยเลือกสีนั้นไว้</p>
        </div>
      )}

    </DesignCard>

    <DesignCard title="ป้าย · รูปบนการ์ด · ชื่อ/ราคา · ดูด่วน" hint="ป้ายอัตโนมัติ (ลด/ใหม่/ขายดี) · รูปในกรอบ · ตำแหน่งรูป · ขนาดชื่อ/ราคา · ปุ่มดูด่วน">
      <CardExtras card={theme.card} setCard={setCard} />
    </DesignCard>


    {/* 🖼 ระหว่างรอรูปโหลด — ใช้ทั้งการ์ดและหน้าสินค้า (เก็บใน logo.placeholder) */}
    <DesignCard title="ระหว่างรอรูปโหลด" hint="ใช้ทั้งการ์ดสินค้าและหน้าสินค้า">
      <PlaceholderSettings
        value={theme.logo.placeholder}
        onChange={(p) => setLogo({ placeholder: { ...theme.logo.placeholder, ...p } })}
        logoKey={theme.logo.imageKey}
        surface={theme.colors.surface}
        colors={theme.colors}
        ratio={RATIO_CSS[theme.card.imageRatio] ?? "4 / 5"}
      />
    </DesignCard>
    {areaFold("card", CARD_PARTS, "กรอบ · รูป · ชื่อ · ราคา · ป้าย · ปุ่มใส่ตะกร้า — ทุกที่ที่มีการ์ด", "/shop")}
    </>
  );
}

/* ─────────── การ์ดสินค้า: ป้ายอัตโนมัติ · รูปบนการ์ด · ชื่อ/ราคา · ดูด่วน ─────────── */
export function CardExtras({ card, setCard }: { card: Theme["card"]; setCard: (p: Partial<Theme["card"]>) => void }) {
  const ab = card.autoBadges;
  const setAb = (p: Partial<typeof ab>) => setCard({ autoBadges: { ...ab, ...p } });
  const mini = "rounded-lg border border-slate-200 px-2 py-1 text-xs bg-white";
  const badgeRow = (
    on: boolean,
    label: string,
    text: string,
    color: string,
    param: React.ReactNode,
    set: (p: { on?: boolean; text?: string; color?: string }) => void,
    placeholder: string,
    textKey: "saleText" | "newText" | "bestText"
  ) => (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 ${on ? "bg-white border border-slate-200" : "bg-slate-50"}`}>
      <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer w-24 shrink-0">
        <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={on} onChange={(e) => set({ on: e.target.checked })} />
        {label}
      </label>
      <LangInput className={`${mini} w-28`} obj={ab} k={textKey} maxLength={24} onPatch={(p) => setAb(p)} placeholder={placeholder} disabled={!on} />
      {param}
      <span className="w-36"><ColorInput value={color} onChange={(v) => set({ color: v })} /></span>
      <span className="text-[11px] px-2 py-0.5 text-white" style={{ background: color, borderRadius: ab.shape === "pill" ? 99 : 3 }}>{text.replace("{pct}", "20") || placeholder}</span>
    </div>
  );
  return (
    <>
      {/* 🏷 ป้ายอัตโนมัติ */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>🏷 ป้ายอัตโนมัติ (ซ้อนกับป้ายที่ตั้งเองรายรุ่น)</label>
        <div className="space-y-1.5">
          {badgeRow(ab.sale, "ลดราคา", ab.saleText, ab.saleColor,
            <label className="flex items-center gap-1 text-[11px] text-slate-500">ลดอย่างน้อย
              <WheelSelect value={ab.saleMin} disabled={!ab.sale} onChange={(e) => setAb({ saleMin: Number(e.target.value) })}>
                {[1, 5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n}%</option>)}
              </WheelSelect>
            </label>,
            (p) => setAb({ ...(p.on !== undefined ? { sale: p.on } : {}), ...(p.text !== undefined ? { saleText: p.text } : {}), ...(p.color !== undefined ? { saleColor: p.color } : {}) }),
            "ลด {pct}%", "saleText")}
          {badgeRow(ab.new, "สินค้าใหม่", ab.newText, ab.newColor,
            <label className="flex items-center gap-1 text-[11px] text-slate-500">ขึ้นเว็บภายใน
              <WheelSelect value={ab.newDays} disabled={!ab.new} onChange={(e) => setAb({ newDays: Number(e.target.value) })}>
                {[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{n} วัน</option>)}
              </WheelSelect>
            </label>,
            (p) => setAb({ ...(p.on !== undefined ? { new: p.on } : {}), ...(p.text !== undefined ? { newText: p.text } : {}), ...(p.color !== undefined ? { newColor: p.color } : {}) }),
            "ใหม่", "newText")}
          {badgeRow(ab.best, "ขายดี", ab.bestText, ab.bestColor,
            <label className="flex items-center gap-1 text-[11px] text-slate-500">อันดับ 1 –
              <WheelSelect value={ab.bestTop} disabled={!ab.best} onChange={(e) => setAb({ bestTop: Number(e.target.value) })}>
                {[3, 5, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
              </WheelSelect>
            </label>,
            (p) => setAb({ ...(p.on !== undefined ? { best: p.on } : {}), ...(p.text !== undefined ? { bestText: p.text } : {}), ...(p.color !== undefined ? { bestColor: p.color } : {}) }),
            "ขายดี", "bestText")}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-600">
          <label className="flex items-center gap-1.5">มุมป้าย
            <select className={mini} value={ab.pos} onChange={(e) => setAb({ pos: e.target.value as typeof ab.pos })}>
              <option value="top-left">บนซ้าย</option>
              <option value="top-right">บนขวา</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">รูปทรงป้าย
            <select className={mini} value={ab.shape} onChange={(e) => setAb({ shape: e.target.value as typeof ab.shape })}>
              <option value="pill">มน (แคปซูล)</option>
              <option value="square">เหลี่ยม</option>
              <option value="ribbon">ริบบิ้นชิดขอบ</option>
              <option value="corner">ชิดมุมการ์ด</option>
              <option value="text">ตัวหนังสือล้วน</option>
            </select>
          </label>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">ลด % คิดจาก “ราคาเต็มขีดฆ่า (fake_price)” · {"{pct}"} = เลขเปอร์เซ็นต์ · ใหม่ = นับจากวันที่เพิ่มรุ่นเข้าร้าน · ขายดี = อันดับยอดขายบนเว็บ (ยังไม่มีออเดอร์ = ยังไม่ขึ้น)</p>
      </div>

      {/* 🖼 รูปบนการ์ด — รูปในกรอบ (ตัด/ไม่ตัด) · ตำแหน่งรูป · สีพื้นหลัง · ระยะห่างจากขอบ */}
      <div className="grid gap-3 sm:grid-cols-2 mt-4 pt-3 border-t border-slate-100">
        <div>
          <label className={labelCls}>🖼 รูปในกรอบ</label>
          <select className={inputCls} value={card.imageFit} onChange={(e) => setCard({ imageFit: e.target.value as Theme["card"]["imageFit"] })}>
            <option value="cover">เต็มกรอบ (ตัดขอบรูปให้เต็มช่อง)</option>
            <option value="contain">โชว์เต็มรูป (ไม่ตัด · ย่อให้เห็นครบ)</option>
          </select>
          <p className="text-[11px] text-slate-400 mt-0.5">ไม่ตัด = เห็นสินค้าครบทั้งชิ้น · ช่องว่างรอบรูปใช้ “สีพื้นหลัง” ข้าง ๆ</p>
        </div>
        <div>
          <label className={labelCls}>📍 ตำแหน่งรูปในกรอบ</label>
          <select className={inputCls} value={card.imagePos} onChange={(e) => setCard({ imagePos: e.target.value as Theme["card"]["imagePos"] })}>
            <option value="center">กึ่งกลาง (แบบเดิม)</option>
            <option value="top">ชิดบน</option>
            <option value="bottom">ชิดล่าง</option>
            <option value="custom">กำหนดเอง (เลื่อนเอง)</option>
          </select>
          <p className="text-[11px] text-slate-400 mt-0.5">{card.imageFit === "contain" ? "ไม่ตัด = รูปไปวางชิดตรงนี้ในกรอบ" : "เต็มกรอบ = เลือกว่าเห็นส่วนไหนของรูป (เช่น ชิดบน = ไม่ตัดหัวสินค้า)"}</p>
          {card.imagePos === "custom" && (
            <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 px-2.5 py-2">
              <label className="flex items-center gap-2 text-[11px] text-slate-600">
                <span className="w-20 shrink-0">ซ้าย ↔ ขวา {card.imagePosX}%</span>
                <RangeInput min={0} max={100} step={1} value={card.imagePosX} onChange={(v) => setCard({ imagePosX: v })} className="flex-1" />
              </label>
              <label className="flex items-center gap-2 text-[11px] text-slate-600">
                <span className="w-20 shrink-0">บน ↕ ล่าง {card.imagePosY}%</span>
                <RangeInput min={0} max={100} step={1} value={card.imagePosY} onChange={(v) => setCard({ imagePosY: v })} className="flex-1" />
              </label>
              <button type="button" onClick={() => setCard({ imagePosX: 50, imagePosY: 50 })} className="text-[11px] text-slate-500 hover:text-blue-600">↺ กลับกึ่งกลาง</button>
            </div>
          )}
          {/* 🔍 ขนาดรูปในกรอบ — ย่อ/ขยายรอบจุดตำแหน่งที่เลือก (ชิดบน = ย่อแล้วยังชิดบน) */}
          <div className="mt-2">
            <label className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-0.5">
              <span>🔍 ขนาดรูปในกรอบ ({card.imageScale}%)</span>
              {card.imageScale !== 100 && (
                <button type="button" onClick={() => setCard({ imageScale: 100 })} className="font-normal text-slate-500 hover:text-blue-600">
                  ↺ 100%
                </button>
              )}
            </label>
            <RangeInput min={50} max={200} step={5} value={card.imageScale} onChange={(v) => setCard({ imageScale: v })} className="w-full" />
            <p className="text-[11px] text-slate-400">น้อยกว่า 100 = ย่อรูป เห็นพื้นรอบ · มากกว่า 100 = ซูมเข้า (ตัดขอบเพิ่ม)</p>
          </div>
        </div>
        <div>
          <label className={labelCls}>สีพื้นหลังหลังรูปสินค้า</label>
          <div className="flex items-center gap-2">
            <span className="flex-1"><ColorInput value={card.imageBg} onChange={(v) => setCard({ imageBg: v })} /></span>
            {card.imageBg && <button type="button" onClick={() => setCard({ imageBg: "" })} className="text-xs text-slate-500 hover:text-red-600">ล้าง (ตามสินค้า)</button>}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">เช่น เทาอ่อน #F2F2F0 ให้รูปพื้นขาวดูเป็นชุดเดียวกัน · ว่าง = แบบเดิม</p>
        </div>
        <div>
          <label className={labelCls}>ระยะห่างรูปจากขอบกรอบ</label>
          <WheelSelect value={card.imagePad == null ? "" : String(card.imagePad)} onChange={(e) => setCard({ imagePad: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">อัตโนมัติ (ไม่ตัด = เว้นนิดหน่อย · เต็มกรอบ = ชิดขอบ)</option>
            {[0, 2, 4, 6, 8, 12, 16].map((n) => <option key={n} value={n}>{n === 0 ? "ชิดขอบ (0)" : `${n}%`}</option>)}
          </WheelSelect>
        </div>
      </div>

      {/* 🔤 ชื่อ / ราคา */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>🔤 ชื่อสินค้า / ราคา</label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">ความหนาชื่อ</label>
            <WheelSelect value={card.nameWeight} onChange={(e) => setCard({ nameWeight: Number(e.target.value) as Theme["card"]["nameWeight"] })}>
              <option value={400}>ปกติ</option>
              <option value={500}>กลาง</option>
              <option value={600}>หนา</option>
              <option value={700}>หนามาก</option>
            </WheelSelect>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">ระยะห่างตัวอักษร</label>
            <WheelSelect value={card.nameTracking} onChange={(e) => setCard({ nameTracking: Number(e.target.value) })}>
              {[0, 2, 4, 8, 12].map((n) => <option key={n} value={n}>{n === 0 ? "ปกติ" : `+${n}`}</option>)}
            </WheelSelect>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">ชื่อหมวด</label>
            <select className={inputCls} value={card.categoryPos} onChange={(e) => setCard({ categoryPos: e.target.value as Theme["card"]["categoryPos"] })}>
              <option value="above">เหนือชื่อสินค้า</option>
              <option value="below">ใต้ราคา</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={card.nameUpper} onChange={(e) => setCard({ nameUpper: e.target.checked })} />
            ชื่อเป็นตัวพิมพ์ใหญ่ (ชื่ออังกฤษ แบบแบรนด์หรู)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={card.priceFrom} onChange={(e) => setCard({ priceFrom: e.target.checked })} />
            ราคา “เริ่มต้น ฿…” เมื่อแต่ละสีราคาไม่เท่ากัน
          </label>
        </div>
      </div>

      {/* 👁 ดูด่วน */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>👁 ดูด่วน (Quick view) — เลือกสี/จำนวนแล้วใส่ตะกร้าได้โดยไม่ต้องเข้าหน้าสินค้า</label>
        <select className={inputCls} value={card.quickView} onChange={(e) => setCard({ quickView: e.target.value as Theme["card"]["quickView"] })}>
          <option value="none">ไม่มี</option>
          <option value="button">ปุ่ม 👁 มุมรูป (คอมโผล่ตอนชี้ · มือถือโชว์ตลอด)</option>
          <option value="replace">ปุ่มบนรูป &quot;เลือกสี / ใส่ตะกร้า&quot; เปิดดูด่วน (แทนใส่ตะกร้าทันที)</option>
        </select>
      </div>
    </>
  );
}
/** 🖼 ระหว่างรอรูปโหลด: โลโก้จาง ๆ กลางกรอบรูป (การ์ด + หน้าสินค้า) — ตัวอย่างสดด้านขวา */
export function PlaceholderSettings({
  value,
  onChange,
  logoKey,
  surface,
  colors,
  ratio,
}: {
  value: ImagePlaceholder;
  onChange: (p: Partial<ImagePlaceholder>) => void;
  logoKey: string | null;
  surface: string;
  colors: Theme["colors"];
  ratio: string;
}) {
  const k = value.imageKey ?? logoKey;
  const url = k ? keyUrl(k, 400) : null;
  // สีพื้นตอนรอ: ชื่อสีธีม (เปลี่ยนธีมแล้วตาม) — แบรนด์จาง = สูตรเดียวกับเว็บร้าน (แบรนด์ 14% บนขาว)
  const soft = `color-mix(in srgb, ${colors.brand} 14%, white)`;
  const BG_CHOICES: { v: string; l: string; css: string }[] = [
    { v: "page", l: "พื้นเว็บ", css: colors.page },
    { v: "surface", l: "พื้นการ์ด", css: colors.surface },
    { v: "brandSoft", l: "แบรนด์จาง", css: soft },
    { v: "brand", l: "แบรนด์", css: colors.brand },
    { v: "muted", l: "ตัวอักษรรอง", css: colors.muted },
    { v: "ink", l: "เข้ม", css: colors.ink },
    { v: "white", l: "ขาว", css: "#ffffff" },
  ];
  const custom = /^#[0-9a-f]{6}$/i.test(value.bg);
  const bgCss = !value.bg ? surface : custom ? value.bg : BG_CHOICES.find((c) => c.v === value.bg)?.css ?? surface;
  return (
    <div className="mt-4 pt-3 border-t border-slate-100">
      <label className={labelCls}>🖼 ระหว่างรอรูปโหลด (การ์ดสินค้า + หน้าสินค้า)</label>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <div className="space-y-2">
          <select className={inputCls} value={value.mode} onChange={(e) => onChange({ mode: e.target.value as ImagePlaceholder["mode"] })}>
            <option value="logo">โลโก้แบรนด์จาง ๆ กลางกรอบ แล้วรูปจริงค่อย ๆ ขึ้นทับ</option>
            <option value="none">พื้นเปล่า (ไม่มีโลโก้)</option>
          </select>
          {value.mode === "logo" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500">ความจาง ({value.opacity}%)</label>
                  <RangeInput min={4} max={40} step={2} value={value.opacity} onChange={(v) => onChange({ opacity: v })} className="w-full" />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500">ขนาดโลโก้ ({value.size}% ของกรอบ)</label>
                  <RangeInput min={20} max={70} step={2} value={value.size} onChange={(v) => onChange({ size: v })} className="w-full" />
                </div>
              </div>
              <ImageUploadField label="โลโก้สำหรับจุดนี้ (ว่าง = ใช้โลโก้หลัก)" hint="แนะนำโลโก้สีเดียว พื้นใส" value={value.imageKey} onChange={(key) => onChange({ imageKey: key })} height={44} />
              {!k && <p className="text-[11px] text-amber-600">ยังไม่มีรูปโลโก้ — อัปโหลดที่แท็บ “โลโก้” หรือช่องด้านบน (ไม่มีรูป = พื้นเปล่า)</p>}
            </>
          )}
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">สีพื้นตอนรอ (หายไปเมื่อรูปจริงขึ้น)</label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChange({ bg: "" })}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${!value.bg ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                title="ใช้พื้นหลังรูปเดิม (ตั้งที่ “พื้นหลังหลังรูปสินค้า”)"
              >
                ตามพื้นหลังรูป
              </button>
              {BG_CHOICES.map((c) => (
                <button
                  key={c.v}
                  type="button"
                  title={c.l}
                  onClick={() => onChange({ bg: c.v })}
                  className={`w-6 h-6 rounded-full border border-black/10 ${value.bg === c.v ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
                  style={{ background: c.css }}
                />
              ))}
              {/* สีเอง: ตัวเลือกสีของกลาง (มีปุ่ม 💧 ดูดสีจากหน้าจอ/พรีวิว) */}
              <span title="สีเอง (มี 💧 ดูดสีจากหน้าจอ)" className={`rounded ${custom ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}>
                <ColorInput
                  value={custom ? value.bg : "#f4e3e6"}
                  allowText={false}
                  onChange={(hex) => {
                    if (/^#[0-9a-f]{6}$/i.test(hex)) onChange({ bg: hex.toLowerCase() });
                  }}
                />
              </span>
            </div>
            {custom && <p className="mt-1 text-[11px] text-amber-600">สีที่เลือกเองจะไม่เปลี่ยนตามธีมร้าน</p>}
          </div>
        </div>
        <div className="relative rounded-lg overflow-hidden border border-slate-200" style={{ aspectRatio: ratio, background: bgCss }} title="ตัวอย่างตอนรูปยังโหลดไม่เสร็จ">
          {value.mode === "logo" && url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain" style={{ width: `${value.size}%`, opacity: value.opacity / 100, filter: "grayscale(1)" }} />
          )}
          <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] text-slate-400">ตัวอย่าง</span>
        </div>
      </div>
    </div>
  );
}