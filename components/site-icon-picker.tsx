"use client";

/**
 * 🔣 SiteIconPicker / SiteIcon — ของกลาง: เลือก/วาดไอคอนของเว็บร้าน (ชุดเส้นกลาง lib/website-icons)
 *   แท็บ: 〰 ไอคอนเส้น (ค้นหาได้ · สีตามธีมร้าน) · 😀 อีโมจิ (ค่าเดิม) · ⬆ อัปโหลดรูป/SVG เอง
 *   ค่าที่ได้ = ข้อความเดียว "i:<key>" / "img:<r2 key>" / อีโมจิ — เว็บร้านวาดด้วย components/ui/SiteIcon ตัวคู่กัน
 * ใช้ที่: ตะกร้า (แถบความมั่นใจ + ไอคอนคูปอง/ห่อ/การ์ด/หมายเหตุ/แต้ม/วันได้รับ — website-cart-settings) · แถวความมั่นใจหน้าสินค้าแบบหรู (website-product-luxe-setting)
 *         · ไอคอนลิงก์เมนูใหญ่ (website-mega-menu-editor) · ต่อไป Footer / ศูนย์ช่วยเหลือ / ป้าย
 * (IconPicker ใน components/icon-picker = อีโมจิสำหรับตั้งค่าโมดูล ERP — คนละงาน)
 *
 * <SiteIconPicker value={icon} onChange={setIcon} />
 */
import { useEffect, useMemo, useState } from "react";
import { imageIconValue, lineIconValue, parseSiteIcon, searchSiteIcons } from "@/lib/website-icons";
import { ImageUploadField, keyUrl } from "@/components/website-theme-media";

const QUICK_EMOJI = ["🔒", "🚚", "↩️", "✅", "🛡️", "💳", "📦", "🎁", "⭐", "💬", "📞", "⏱️", "✨", "❤️", "🏷️", "🌿"];
type Tab = "line" | "emoji" | "img";

/** วาดไอคอนตามค่า (ไอคอนเส้น = stroke currentColor · รูป = r2 · อีโมจิ = ตัวอักษร) — ว่าง/ไม่รู้จัก = ไม่วาด */
export function SiteIcon({ value, size = 18, className }: { value: string | null | undefined; size?: number; className?: string }) {
  const v = parseSiteIcon(value);
  if (!v) return null;
  if (v.kind === "line")
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
        {v.def.d.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    );
  if (v.kind === "img")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={keyUrl(v.key, 96) ?? undefined} alt="" style={{ width: size, height: size, objectFit: "contain" }} className={className} />;
  return (
    <span aria-hidden className={className}>
      {v.text}
    </span>
  );
}

export function SiteIconPicker({ value, onChange, label = "ไอคอน" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const cur = parseSiteIcon(value);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("line");
  const [q, setQ] = useState("");
  const [emoji, setEmoji] = useState("");
  const icons = useMemo(() => searchSiteIcons(q), [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  // เปิดทุกครั้ง = แท็บตามค่าปัจจุบัน (ค่าอาจเปลี่ยนจากข้างนอก เช่น "ใช้ชุดเริ่มต้น")
  const toggle = () => {
    if (!open) {
      setTab(cur?.kind === "text" ? "emoji" : cur?.kind === "img" ? "img" : "line");
      setEmoji(cur?.kind === "text" ? cur.text : "");
      setQ("");
    }
    setOpen(!open);
  };
  const tabBtn = (t: Tab, l: string) => (
    <button type="button" onClick={() => setTab(t)} className={`flex-1 h-7 rounded-md text-[11px] ${tab === t ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
      {l}
    </button>
  );

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        title={`เลือก${label}`}
        aria-label={`เลือก${label}`}
        aria-expanded={open}
        data-site-icon-picker
        className="h-8 w-14 inline-flex items-center justify-center gap-0.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:border-slate-400 focus:outline-none focus:border-blue-400"
      >
        {cur ? <SiteIcon value={value} size={18} /> : <span className="text-slate-300">—</span>}
        <span className="text-[9px] text-slate-400">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 left-0 top-full mt-1 w-[300px] rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl space-y-2" data-site-icon-pop>
            <div className="flex gap-1 rounded-lg bg-slate-50 p-0.5">
              {tabBtn("line", "〰 ไอคอนเส้น")}
              {tabBtn("emoji", "😀 อีโมจิ")}
              {tabBtn("img", "⬆ อัปโหลด")}
            </div>

            {tab === "line" && (
              <>
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ค้นหา เช่น ส่ง, ปลอดภัย, คืน, lock…"
                  className="w-full h-8 rounded-lg border border-slate-200 px-2.5 text-xs focus:outline-none focus:border-blue-400"
                />
                <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto pr-0.5">
                  {icons.map((ic) => {
                    const on = cur?.kind === "line" && cur.def.key === ic.key;
                    return (
                      <button
                        key={ic.key}
                        type="button"
                        title={ic.label}
                        aria-label={ic.label}
                        onClick={() => pick(lineIconValue(ic.key))}
                        className={`h-8 rounded-md border inline-flex items-center justify-center text-slate-700 ${on ? "border-blue-500 bg-blue-50" : "border-transparent hover:border-slate-300 hover:bg-slate-50"}`}
                      >
                        <SiteIcon value={lineIconValue(ic.key)} size={18} />
                      </button>
                    );
                  })}
                </div>
                {!icons.length && <p className="text-[11px] text-slate-400 text-center py-2">ไม่พบไอคอน — ลองคำอื่น หรือใช้อีโมจิ/อัปโหลดเอง</p>}
                <p className="text-[10px] text-slate-400">ไอคอนเส้นเปลี่ยนสีตามธีมร้านเอง · คมทุกขนาด</p>
              </>
            )}

            {tab === "emoji" && (
              <>
                <div className="grid grid-cols-8 gap-1">
                  {QUICK_EMOJI.map((e) => (
                    <button key={e} type="button" onClick={() => pick(e)} className={`h-8 rounded-md text-lg hover:bg-slate-100 ${cur?.kind === "text" && cur.text === e ? "bg-blue-50 ring-1 ring-blue-400" : ""}`}>
                      {e}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={emoji}
                    maxLength={8}
                    onChange={(e) => setEmoji(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && emoji.trim() && pick(emoji.trim())}
                    placeholder="พิมพ์/วางอีโมจิเอง"
                    className="flex-1 min-w-0 h-8 rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                  <button type="button" disabled={!emoji.trim()} onClick={() => pick(emoji.trim())} className="h-8 px-3 rounded-lg bg-slate-800 text-white text-xs disabled:opacity-40">
                    ใช้
                  </button>
                </div>
              </>
            )}

            {tab === "img" && (
              <ImageUploadField
                label="อัปโหลดไอคอนเอง (PNG/SVG พื้นใส)"
                hint="รูปไม่เปลี่ยนสีตามธีม — ใช้ไอคอนเส้นถ้าอยากให้สีเข้ากับร้าน"
                value={cur?.kind === "img" ? cur.key : null}
                onChange={(k) => onChange(k ? imageIconValue(k) : "")}
                height={40}
              />
            )}

            <div className="flex justify-between pt-1 border-t border-slate-100">
              <button type="button" onClick={() => pick("")} className="text-[11px] text-slate-500 hover:text-red-600">
                ไม่มีไอคอน
              </button>
              <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-blue-600 hover:underline">
                เสร็จ
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
