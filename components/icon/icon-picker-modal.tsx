"use client";

/**
 * 🔣 IconPickerModal — ของกลาง: ป๊อปเลือกไอคอนจากทะเบียนไอคอนกลาง
 *   แท็บ 〰 ไอคอนเส้น (ชุด lib/erp-icons · ค้นหาไทย/อังกฤษได้) · 📁 ไอคอนของฉัน (อัปโหลดรูป/SVG หรือวางโค้ด SVG)
 *   คืนค่า "i:<key>" / "c:<id>" ผ่าน onPick · null = กลับไปใช้ไอคอนเริ่มต้น
 *   ส่ง onColor มา = มีแถบเลือกสี (สีอัตโนมัติ / สีด่วน 12 สี / เลือกเองจาก ColorInput) · โหมดนี้กดไอคอนแล้วป๊อปไม่ปิด (กด "เสร็จ")
 * ใช้ที่: /admin/icons (เปลี่ยนไอคอนของความหมาย) · ต่อไป: ช่องไอคอนเมนู/แอป
 *
 * <IconPickerModal open title="เลือกไอคอนให้ “บันทึก”" value={v} settings={s} onPick={...} onAddCustom={...} onClose={...} />
 */
import { useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { ERP_ICONS } from "@/lib/erp-icons";
import { ICON_COLOR_SWATCHES, type CustomIcon, type IconSettings } from "@/lib/icon-registry";
import { ColorInput } from "@/components/color-picker";
import { Icon } from "@/components/icon";
import { newCustomIconId, svgTextToPng, uploadIconFile } from "@/components/icon/upload";

type Tab = "line" | "mine";

export function IconPickerModal({
  open,
  onClose,
  title,
  value,
  defaultValue,
  settings,
  onPick,
  onAddCustom,
  color,
  defaultColor,
  onColor,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** ค่าที่เลือกอยู่ ("i:" / "c:") */
  value: string | null;
  /** ค่าเริ่มต้นของช่องนี้ — มีแล้วจะมีปุ่ม "ใช้ค่าเริ่มต้น" */
  defaultValue?: string;
  settings: IconSettings;
  onPick: (v: string | null) => void;
  /** มี = อัปโหลดไอคอนของฉันใหม่ได้ในป๊อปนี้ (ผู้เรียกเก็บลงรายการ custom) */
  onAddCustom?: (c: CustomIcon) => void;
  /** สีที่ตั้งเองอยู่ ("#rrggbb") · null = ใช้สีอัตโนมัติ */
  color?: string | null;
  /** สีอัตโนมัติของช่องนี้ (โชว์ในปุ่ม "อัตโนมัติ") · null = ตามตัวหนังสือ */
  defaultColor?: string | null;
  /** มี = เลือกสีได้ในป๊อปนี้ · null = กลับไปสีอัตโนมัติ */
  onColor?: (hex: string | null) => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(value?.startsWith("c:") ? "mine" : "line");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [svgText, setSvgText] = useState("");
  const [label, setLabel] = useState("");
  const [tint, setTint] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const lines = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? ERP_ICONS.filter((i) => `${i.key} ${i.label}`.toLowerCase().includes(t)) : ERP_ICONS;
  }, [q]);

  // มีแถบสี = แก้ทั้งไอคอนและสีในป๊อปเดียว → กดไอคอนแล้วยังไม่ปิด
  const pick = (v: string | null) => { onPick(v); if (!onColor) onClose(); };
  const shown = color ?? defaultColor ?? null;

  const addCustom = async (file: File) => {
    if (!onAddCustom) return;
    setBusy(true);
    try {
      const src = await uploadIconFile(file);
      const c: CustomIcon = { id: newCustomIconId(), label: label.trim() || file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60), src, tint };
      onAddCustom(c);
      setSvgText("");
      setLabel("");
      toast.success("เพิ่มไอคอนของฉันแล้ว");
      pick(`c:${c.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const cell = (v: string, node: React.ReactNode, tip: string) => (
    <button key={v} type="button" title={tip} onClick={() => pick(v)}
      style={shown ? { color: shown } : undefined}
      className={`h-11 w-11 flex items-center justify-center rounded-lg border text-slate-700 text-[22px] transition-colors ${value === v ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200" : "border-slate-200 hover:bg-slate-50 hover:border-slate-300"}`}>
      {node}
    </button>
  );
  const tabBtn = (t: Tab, text: string) => (
    <button type="button" onClick={() => setTab(t)}
      className={`px-3 py-1.5 rounded-lg text-sm ${tab === t ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>{text}</button>
  );

  return (
    <ERPModal open={open} onClose={onClose} title={title} size="lg" defaultExpanded={false} storageKey="icon-picker"
      footer={
        <div className="flex items-center gap-2 w-full">
          {defaultValue && (
            <button type="button" onClick={() => pick(null)} className="px-3 py-2 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5">
              <Icon value={defaultValue} size={16} /> ใช้ไอคอนเริ่มต้น
            </button>
          )}
          {onColor
            ? <button type="button" onClick={onClose} className="ml-auto px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">เสร็จ</button>
            : <button type="button" onClick={onClose} className="ml-auto px-4 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-800">ปิด</button>}
        </div>
      }>
      {onColor && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-center gap-3 mb-2.5">
            <span className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[28px] text-slate-700 shrink-0" style={shown ? { color: shown } : undefined}>
              {value && <Icon value={value} settings={settings} />}
            </span>
            <div className="text-sm">
              <div className="font-medium text-slate-800">สีไอคอน</div>
              <div className="text-xs text-slate-500">{color ? "สีที่ตั้งเอง — โชว์ทั้งโหมดไอคอนเส้น และไอคอนเส้น + สี" : "อัตโนมัติ — ตามตัวหนังสือ หรือสีตามความหมายในโหมดไอคอนเส้น + สี"}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => onColor(null)} title="กลับไปสีอัตโนมัติ"
              className={`h-8 px-2.5 rounded-lg border text-xs inline-flex items-center gap-1.5 ${!color ? "border-blue-500 bg-white ring-2 ring-blue-200 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
              <span className="w-3.5 h-3.5 rounded-full border border-slate-300" style={{ background: defaultColor ?? "linear-gradient(135deg,#fff 45%,#94a3b8 45%,#94a3b8 55%,#fff 55%)" }} />
              อัตโนมัติ
            </button>
            {ICON_COLOR_SWATCHES.map((c) => (
              <button key={c.hex} type="button" onClick={() => onColor(c.hex)} title={c.label} aria-label={c.label}
                className={`w-8 h-8 rounded-lg border-2 ${color === c.hex ? "border-slate-800 ring-2 ring-blue-200" : "border-white shadow-sm hover:scale-110"} transition-transform`}
                style={{ background: c.hex }} />
            ))}
            <span className="ml-1 text-xs text-slate-400">หรือเลือกเอง</span>
            <ColorInput value={color ?? defaultColor ?? "#334155"} onChange={(v) => /^#[0-9a-f]{6}$/i.test(v) && onColor(v.toLowerCase())} allowText />
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 mb-3">
        {tabBtn("line", `ไอคอนเส้น (${ERP_ICONS.length})`)}
        {tabBtn("mine", `ไอคอนของฉัน (${settings.custom.length})`)}
      </div>

      {tab === "line" && (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา เช่น บันทึก, รถ, เงิน, truck"
            className="w-full h-9 px-3 mb-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          {lines.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">ไม่พบไอคอน “{q}” — ลองคำอื่น หรืออัปโหลดเองที่แท็บไอคอนของฉัน</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {lines.map((i) => cell(`i:${i.key}`, <Icon value={`i:${i.key}`} settings={settings} />, `${i.label} (${i.key})`))}
            </div>
          )}
        </>
      )}

      {tab === "mine" && (
        <>
          {settings.custom.length === 0 ? (
            <p className="text-sm text-slate-400 mb-3">ยังไม่มีไอคอนของฉัน — อัปโหลดรูปหรือวางโค้ด SVG ด้านล่าง</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {settings.custom.map((c) => cell(`c:${c.id}`, <Icon value={`c:${c.id}`} settings={settings} />, c.label || "ไอคอนของฉัน"))}
            </div>
          )}
          {onAddCustom && (
            <div className="rounded-xl border border-dashed border-slate-300 p-3 space-y-2.5">
              <div className="text-sm font-medium text-slate-700">เพิ่มไอคอนของฉัน</div>
              <div className="flex flex-wrap items-center gap-2">
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ชื่อไอคอน (ไม่ใส่ก็ได้)"
                  className="h-9 px-3 rounded-lg border border-slate-200 text-sm flex-1 min-w-[160px]" />
                <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" checked={tint} onChange={(e) => setTint(e.target.checked)} />
                  ระบายสีตามตัวหนังสือ
                </label>
              </div>
              <p className="text-xs text-slate-400">ติ๊ก = ไอคอนสีเดียว (สีเปลี่ยนตามเมนู/ธีม) · ไม่ติ๊ก = ใช้สีเดิมของรูป · ใช้รูปพื้นใส (PNG/SVG) จะสวยที่สุด</p>
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void addCustom(f); }} />
                <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
                  className="h-9 px-3 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Icon value="i:upload" size={16} /> {busy ? "กำลังอัปโหลด…" : "อัปโหลดรูป / SVG"}
                </button>
                <span className="text-xs text-slate-400">หรือวางโค้ด SVG (เช่น กด Copy SVG จากเว็บไอคอน)</span>
              </div>
              <textarea value={svgText} onChange={(e) => setSvgText(e.target.value)} rows={3} placeholder={'<svg viewBox="0 0 24 24" ...>...</svg>'}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono" />
              <button type="button" disabled={busy || !svgText.trim()}
                onClick={async () => {
                  try { await addCustom(await svgTextToPng(svgText, "pasted")); } catch (e) { toast.error(e instanceof Error ? e.message : "โค้ด SVG ใช้ไม่ได้"); }
                }}
                className="h-9 px-3 rounded-lg text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                ใช้โค้ด SVG นี้
              </button>
            </div>
          )}
        </>
      )}
    </ERPModal>
  );
}
