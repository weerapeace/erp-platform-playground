"use client";

/**
 * Brand Theme Builder — UI ตั้งค่าธีมต่อแบรนด์ (ของกลาง)
 * ซ้าย = แผงตั้งค่า (tabs) · ขวา = พรีวิวสด · footer = รีเซ็ต/บันทึกร่าง/เผยแพร่
 * reuse: ERPModal, ImageInput (อัปรูป→R2 key), apiFetch, lib/brand-theme, BrandThemeStyles
 */
import { useState, useEffect } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ImageInput } from "@/components/image-input";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { resolveTheme, themeToCssVars, brandBgUrl, hexToRgba, THEME_PRESETS, themeWarnings, isValidColor, SLOT_REGISTRY, wfIconSlotId, type BrandTheme } from "@/lib/brand-theme";
import { BrandThemeStyles } from "@/components/brand-theme/styles";
import { BrandSlot } from "@/components/brand-theme/slots";
import { ColorInput } from "@/components/color-picker";
import { ThemeKitModal, type KitApplyPatch } from "@/components/brand-theme-builder/theme-kit";

type Tab = "preset" | "colors" | "background" | "page" | "header" | "sidebar" | "stat" | "workflow" | "task" | "audit" | "cards" | "buttons";
const TABS: [Tab, string][] = [["preset", "🎨 พรีเซ็ต"], ["colors", "🌈 สี"], ["background", "🖼 พื้นหลัง"], ["page", "✨ ตกแต่งหน้า"], ["header", "🙆 หัว/Mascot"], ["sidebar", "📚 แถบแบรนด์"], ["stat", "📊 การ์ดสถิติ"], ["workflow", "🏷 ไอคอนสถานะ"], ["task", "🃏 การ์ดงาน"], ["audit", "🕘 แผงประวัติ"], ["cards", "🎴 สไตล์การ์ด"], ["buttons", "🔘 ปุ่ม"]];

// ช่องอัปรูป slot + สวิตช์โชว์/ซ่อน + สไลเดอร์ขนาด/ความเข้ม (ของกลางระดับโมดูล — stable ไม่ remount ตอนลากสไลเดอร์)
type SlotOpt = { scale?: number; opacity?: number };
function SlotField({ id, label, value, hidden, opt, onImage, onToggle, onOpt }: {
  id: string; label: string; value: string | null; hidden: boolean; opt?: SlotOpt;
  onImage: (k: string | null) => void; onToggle: (hidden: boolean) => void; onOpt: (patch: SlotOpt) => void;
}) {
  const scale = opt?.scale ?? 1;
  const opacity = opt?.opacity ?? 1;
  return (
    <div className="rounded-lg border border-slate-100 p-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 text-[11px] text-slate-500">{label}</div>
          <ImageInput value={value} folder="brand-theme" onChange={onImage} />
        </div>
        <label className="mt-5 flex shrink-0 items-center gap-1 text-[10px] text-slate-500">
          <input type="checkbox" checked={!hidden} onChange={(e) => onToggle(!e.target.checked)} className="rounded border-slate-300" /> โชว์
        </label>
      </div>
      {value && (
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <label className="block text-[10px] text-slate-400">ขนาด {Math.round(scale * 100)}%
            <input type="range" min={50} max={150} value={Math.round(scale * 100)} onChange={(e) => onOpt({ scale: Number(e.target.value) / 100 })} className="w-full" /></label>
          <label className="block text-[10px] text-slate-400">ความเข้ม {Math.round(opacity * 100)}%
            <input type="range" min={20} max={100} value={Math.round(opacity * 100)} onChange={(e) => onOpt({ opacity: Number(e.target.value) / 100 })} className="w-full" /></label>
        </div>
      )}
    </div>
  );
}

export function BrandThemeBuilder({ brandId, brandName, open, onClose, onPublished, statuses = [], brands = [] }: {
  brandId: string; brandName: string; open: boolean; onClose: () => void; onPublished?: () => void;
  statuses?: { key: string; label: string }[];   // สถานะ workflow (สำหรับไอคอนสถานะ)
  brands?: { id: string; name: string }[];        // แบรนด์อื่น (สำหรับคัดลอกธีมข้ามแบรนด์)
}) {
  const toast = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("preset");
  const [draft, setDraft] = useState<BrandTheme>(resolveTheme(null));
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [copyFrom, setCopyFrom] = useState("");
  const [kitOpen, setKitOpen] = useState(false);
  // ดึงผลจากชุดธีม (รูป+สี) เข้าแบบร่าง → โชว์ในพรีวิวทันที (ยังไม่เผยแพร่จนกดปุ่ม)
  const applyKit = (patch: KitApplyPatch) => setDraft((d) => ({
    ...d, ...(patch.colors ?? {}), slots: { ...(d.slots ?? {}), ...(patch.slots ?? {}) },
  }));

  useEffect(() => {
    if (!open) return;
    setTab("preset"); setLoading(true);
    apiFetch(`/api/brand-themes/${brandId}`).then((r) => r.json())
      .then((j) => setDraft(resolveTheme(j.draft ?? j.published)))
      .catch(() => setDraft(resolveTheme(null))).finally(() => setLoading(false));
  }, [open, brandId]);

  const set = <K extends keyof BrandTheme>(k: K, v: BrandTheme[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setSlot = (id: string, key: string | null) => setDraft((d) => ({ ...d, slots: { ...(d.slots ?? {}), [id]: key } }));
  const setSlotHidden = (id: string, hidden: boolean) => setDraft((d) => ({ ...d, slotHidden: { ...(d.slotHidden ?? {}), [id]: hidden } }));
  const setSlotOpt = (id: string, patch: SlotOpt) => setDraft((d) => ({ ...d, slotOpts: { ...(d.slotOpts ?? {}), [id]: { ...(d.slotOpts?.[id] ?? {}), ...patch } } }));
  // props ของช่อง slot (ใช้กับของกลาง SlotField — stable ไม่ remount)
  const slotProps = (id: string) => ({
    value: draft.slots?.[id] ?? null, hidden: !!draft.slotHidden?.[id], opt: draft.slotOpts?.[id],
    onImage: (k: string | null) => setSlot(id, k), onToggle: (h: boolean) => setSlotHidden(id, h), onOpt: (p: SlotOpt) => setSlotOpt(id, p),
  });
  const slotsOf = (group: string) => SLOT_REGISTRY.filter((d) => d.group === group);
  const warns = themeWarnings(draft);

  const saveDraft = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/brand-themes/${brandId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: draft, actor: user?.name }) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error ?? "บันทึกไม่สำเร็จ");
      toast.success("บันทึกแบบร่างแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  };
  const publish = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/brand-themes/${brandId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publish: true, config: draft, actor: user?.name }) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error ?? "เผยแพร่ไม่สำเร็จ");
      toast.success(`เผยแพร่ธีม "${brandName}" แล้ว ✅`); onPublished?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "เผยแพร่ไม่สำเร็จ"); } finally { setBusy(false); }
  };
  const doReset = async () => {
    setResetConfirm(false); setBusy(true);
    try {
      const r = await apiFetch(`/api/brand-themes/${brandId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset: true, actor: user?.name }) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error ?? "รีเซ็ตไม่สำเร็จ");
      setDraft(resolveTheme(null)); toast.success("รีเซ็ตธีมเป็นค่าเริ่มต้นแล้ว"); onPublished?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "รีเซ็ตไม่สำเร็จ"); } finally { setBusy(false); }
  };
  // คัดลอกธีมจากแบรนด์อื่น → ตั้งเป็นแบบร่าง (ยังไม่เผยแพร่จนกว่าจะกดเผยแพร่)
  const doCopyFrom = async () => {
    if (!copyFrom) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/brand-themes/${copyFrom}`); const j = await r.json();
      const src = j.published ?? j.draft;
      if (!src) { toast.error("แบรนด์นั้นยังไม่มีธีม"); return; }
      setDraft(resolveTheme(src)); toast.success("คัดลอกธีมมาแล้ว · ตรวจดูแล้วกดเผยแพร่เพื่อใช้จริง");
    } catch { toast.error("คัดลอกไม่สำเร็จ"); } finally { setBusy(false); }
  };

  // ช่องสี: ใช้ของกลาง ColorInput (ลากเลือกได้ + พิมพ์ hex/rgba)
  // เป็น "ฟังก์ชันคืน JSX" ไม่ใช่ component ย่อย → กัน React รีเมานต์ ColorInput ทุกครั้งที่ draft เปลี่ยน
  // (ถ้าเป็น <Color/> ที่ประกาศในนี้ พอเลือกสี → onChange → re-render → identity ใหม่ → popover เด้งปิด/ลากไม่ติด)
  const colorField = (label: string, k: keyof BrandTheme) => {
    const v = String(draft[k] ?? "");
    return (
      <label key={k as string} className="block">
        <span className="text-[11px] text-slate-500">{label}</span>
        <div className="mt-0.5">
          <ColorInput value={v} onChange={(nv) => set(k, nv as BrandTheme[typeof k])} invalid={!isValidColor(v)} />
        </div>
      </label>
    );
  };

  const previewBg = brandBgUrl(draft.background_image_key, 900);
  const previewStyle = {
    ...themeToCssVars(draft), backgroundColor: draft.background_color,
    ...(previewBg ? { backgroundImage: `linear-gradient(${hexToRgba(draft.background_overlay_color, draft.background_opacity)}, ${hexToRgba(draft.background_overlay_color, draft.background_opacity)}), url("${previewBg}")`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
  };

  return (
    <ERPModal open={open} onClose={onClose} size="xl" storageKey="brand-theme-builder"
      title={`🎨 ปรับธีมแบรนด์: ${brandName}`} description="ตั้งค่าหน้าตาของแบรนด์นี้ · บันทึกร่างก่อน แล้วกด “เผยแพร่” จึงมีผลจริง"
      footer={<>
        <button onClick={() => setResetConfirm(true)} disabled={busy} className="mr-auto h-9 px-3 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 disabled:opacity-50">↺ รีเซ็ตเป็นค่าเริ่มต้น</button>
        <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ปิด</button>
        <button onClick={() => void saveDraft()} disabled={busy || loading} className="h-9 px-4 text-sm border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50">💾 บันทึกแบบร่าง</button>
        <button onClick={() => void publish()} disabled={busy || loading} className="h-9 px-5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">🚀 เผยแพร่</button>
      </>}>
      {loading ? <div className="py-16 text-center text-slate-400 text-sm">กำลังโหลด...</div> : (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* ซ้าย: แผงตั้งค่า */}
          <div className="lg:w-[320px] lg:shrink-0">
            <button onClick={() => setKitOpen(true)} disabled={loading}
              className="mb-2 w-full h-9 px-3 text-sm font-medium rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50">🧩 ชุดธีม — แม่แบบรูป+สี (ให้ AI เติม)</button>
            <div className="flex flex-wrap gap-1 mb-3">
              {TABS.map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className={`h-8 px-2.5 text-xs rounded-lg ${tab === k ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50 border border-slate-200"}`}>{l}</button>
              ))}
            </div>

            {tab === "preset" && (
              <div className="space-y-3">
                {brands.length > 0 && (
                  <div className="rounded-lg border border-slate-200 p-2">
                    <div className="mb-1 text-[11px] font-medium text-slate-600">📋 คัดลอกธีมจากแบรนด์อื่น</div>
                    <div className="flex gap-2">
                      <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className="h-8 min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 text-xs">
                        <option value="">— เลือกแบรนด์ —</option>
                        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <button onClick={() => void doCopyFrom()} disabled={!copyFrom || busy} className="h-8 shrink-0 rounded border border-blue-300 px-2.5 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50">คัดลอกมา</button>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">ดึงธีมที่เผยแพร่ของแบรนด์นั้นมาเป็นแบบร่าง แล้วกด “เผยแพร่” เพื่อใช้กับ {brandName}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {THEME_PRESETS.map((p) => (
                    <button key={p.key} onClick={() => setDraft({ ...p.theme })} className="rounded-lg border border-slate-200 p-2 text-left hover:border-blue-300">
                      <div className="flex gap-1 mb-1">
                        {[p.theme.background_color, p.theme.primary_color, p.theme.accent_color, p.theme.card_background_color].map((c, i) => <span key={i} className="h-4 w-4 rounded-full border border-slate-200" style={{ background: c }} />)}
                      </div>
                      <div className="text-xs font-medium text-slate-700">{p.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tab === "colors" && (
              <div className="space-y-2">
                {colorField("สีหลัก (primary)", "primary_color")}{colorField("สีรอง (secondary)", "secondary_color")}{colorField("สีเน้น (accent)", "accent_color")}
                {colorField("สีหัวข้อ", "heading_text_color")}{colorField("สีตัวอักษร", "body_text_color")}{colorField("สีตัวอักษรจาง", "muted_text_color")}
                {colorField("สีเส้น workflow", "workflow_line_color")}
              </div>
            )}
            {tab === "background" && (
              <div className="space-y-3">
                {colorField("สีพื้นหลัง", "background_color")}
                <div>
                  <span className="text-[11px] text-slate-500">รูปพื้นหลัง (ไม่บังคับ · ย่อ ?w= อัตโนมัติ)</span>
                  <div className="mt-1"><ImageInput value={draft.background_image_key ?? null} folder="brand-theme" onChange={(k) => set("background_image_key", k)} /></div>
                </div>
                {colorField("สีทับรูป (overlay)", "background_overlay_color")}
                <label className="block">
                  <span className="text-[11px] text-slate-500">ความเข้ม overlay ({Math.round(draft.background_opacity * 100)}%)</span>
                  <input type="range" min={0} max={100} value={Math.round(draft.background_opacity * 100)} onChange={(e) => set("background_opacity", Number(e.target.value) / 100)} className="w-full" />
                </label>
              </div>
            )}
            {tab === "cards" && (
              <div className="space-y-2">
                {colorField("พื้นการ์ด", "card_background_color")}{colorField("เส้นขอบการ์ด", "card_border_color")}
                <label className="block"><span className="text-[11px] text-slate-500">ความโค้งมุม (เช่น 12px)</span>
                  <input value={draft.card_radius} onChange={(e) => set("card_radius", e.target.value)} className="mt-0.5 h-8 w-full px-2 text-xs border border-slate-200 rounded" /></label>
                <label className="block"><span className="text-[11px] text-slate-500">เงา (shadow)</span>
                  <select value={draft.card_shadow_style} onChange={(e) => set("card_shadow_style", e.target.value)} className="mt-0.5 h-8 w-full px-2 text-xs border border-slate-200 rounded bg-white">
                    <option value="none">ไม่มีเงา</option>
                    <option value="0 1px 2px rgba(15,23,42,0.06)">บาง</option>
                    <option value="0 4px 12px rgba(15,23,42,0.08)">กลาง</option>
                    <option value="0 18px 42px rgba(13,32,54,0.12)">ฟุ้ง (luxury)</option>
                  </select></label>
              </div>
            )}
            {tab === "buttons" && (
              <div className="space-y-2">
                {colorField("พื้นปุ่มหลัก", "button_primary_bg")}{colorField("ตัวอักษรปุ่มหลัก", "button_primary_text")}
                {colorField("พื้นปุ่มรอง", "button_secondary_bg")}{colorField("ตัวอักษรปุ่มรอง", "button_secondary_text")}
              </div>
            )}
            {tab === "page" && (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-400">รูปตกแต่งมุมหน้า/พื้นที่ว่าง (อยู่หลังเนื้อหา ไม่บังการกด · ซ่อนบนมือถือ)</p>
                {slotsOf("page").map((d) => <SlotField key={d.id} id={d.id} label={d.label} {...slotProps(d.id)} />)}
              </div>
            )}
            {tab === "header" && (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-400">Mascot/รูปบนหัวหน้า (ขนาดพอดี ไม่ดัน layout)</p>
                {slotsOf("header").map((d) => <SlotField key={d.id} id={d.id} label={d.label} {...slotProps(d.id)} />)}
              </div>
            )}
            {tab === "sidebar" && (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-400">รูปบน/ท้ายแถบแบรนด์ด้านซ้าย (banner/mascot)</p>
                {slotsOf("sidebar").map((d) => <SlotField key={d.id} id={d.id} label={d.label} {...slotProps(d.id)} />)}
              </div>
            )}
            {tab === "stat" && (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-400">ไอคอนมุมการ์ดสถิติ 4 ใบ</p>
                {slotsOf("stat").map((d) => <SlotField key={d.id} id={d.id} label={d.label} {...slotProps(d.id)} />)}
              </div>
            )}
            {tab === "workflow" && (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-400">ไอคอนต่อสถานะงาน (ตาม workflow จริง)</p>
                {statuses.length === 0 && <p className="text-xs text-slate-300">— ไม่พบสถานะ —</p>}
                {statuses.map((st) => <SlotField key={st.key} id={wfIconSlotId(st.key)} label={`ไอคอน: ${st.label}`} {...slotProps(wfIconSlotId(st.key))} />)}
              </div>
            )}
            {tab === "task" && (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-400">ตกแต่งการ์ดงาน + รูปแทนตอนไม่มีรูป</p>
                {slotsOf("task").map((d) => <SlotField key={d.id} id={d.id} label={d.label} {...slotProps(d.id)} />)}
              </div>
            )}
            {tab === "audit" && (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-400">ไอคอน/Mascot บนแผงประวัติ (Audit log)</p>
                {slotsOf("audit").map((d) => <SlotField key={d.id} id={d.id} label={d.label} {...slotProps(d.id)} />)}
              </div>
            )}

            {warns.length > 0 && (
              <div className="mt-3 px-2.5 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-700 space-y-0.5">
                {warns.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
          </div>

          {/* ขวา: พรีวิวสด — โชว์โซนตกแต่งตามแท็บที่เลือก (สะท้อนรูป + ขนาด/ความเข้ม ทันที) */}
          <div className="flex-1 min-w-0">
            <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-400">
              <span>พรีวิว (อัปเดตทันที · ยังไม่บันทึกจนกดปุ่ม)</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">กำลังดู: {TABS.find(([k]) => k === tab)?.[1] ?? ""}</span>
            </div>
            <div className="brand-themed relative overflow-hidden rounded-xl border border-slate-200 p-4 min-h-[320px]" style={previewStyle}>
              <BrandThemeStyles />

              {/* ตกแต่งมุมหน้า */}
              {tab === "page" && (
                <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                  <BrandSlot theme={draft} id="page_tl" /><BrandSlot theme={draft} id="page_tr" />
                  <BrandSlot theme={draft} id="page_bl" /><BrandSlot theme={draft} id="page_br" />
                </div>
              )}

              <div className="relative z-10">
                {/* หัว + mascot */}
                <div className="mb-3 flex items-center gap-2">
                  {tab === "header" && <BrandSlot theme={draft} id="header_left" className="shrink-0" />}
                  <h2 className="min-w-0 text-lg font-semibold">{draft.theme_name || brandName}</h2>
                  {tab === "header" && <BrandSlot theme={draft} id="header_right" className="ml-auto shrink-0" />}
                </div>

                <div className={tab === "sidebar" ? "flex gap-3" : ""}>
                  {/* แถบแบรนด์ (mini) */}
                  {tab === "sidebar" && (
                    <div data-gg-sidebar className="w-28 shrink-0 rounded-lg border border-white/70 bg-white/80 p-2">
                      <BrandSlot theme={draft} id="sidebar_top" />
                      <div className="my-2 h-7 rounded bg-slate-100" />
                      <div className="h-7 rounded bg-slate-100" />
                      <BrandSlot theme={draft} id="sidebar_bottom" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    {/* การ์ดสถิติ + ไอคอน */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {["งานทั้งหมด", "ใกล้ครบ"].map((l, i) => (
                        <div key={l} data-gg-stat-card className="relative overflow-hidden rounded-lg border border-white/70 bg-white/80 p-3">
                          {tab === "stat" && <BrandSlot theme={draft} id={`stat_icon_${i}`} />}
                          <div className="text-xs font-medium text-slate-400">{l}</div>
                          <div className="text-2xl font-semibold text-slate-900">{i === 0 ? 19 : 3}</div>
                        </div>
                      ))}
                    </div>

                    {/* หัวคอลัมน์สถานะ + ไอคอน */}
                    {tab === "workflow" && (
                      <div className="mb-3 flex gap-2 overflow-x-auto">
                        {(statuses.length ? statuses.slice(0, 4) : [{ key: "_", label: "สถานะ" }]).map((st) => (
                          <div key={st.key} data-gg-column-header className="relative shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center" style={{ minWidth: 84 }}>
                            <BrandSlot theme={draft} id={wfIconSlotId(st.key)} w={96} size="w-6 h-6" className="absolute left-1 top-1" />
                            <div className="truncate text-[11px] font-semibold text-slate-700">{st.label}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* การ์ดงาน */}
                    <div data-gg-task-card className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-3 mb-3">
                      {tab === "task" && <BrandSlot theme={draft} id="task_corner" />}
                      {tab === "task" && draft.slots?.task_placeholder && (
                        <div className="mb-2 flex h-16 items-center justify-center rounded-md border border-slate-100 bg-slate-50">
                          <BrandSlot theme={draft} id="task_placeholder" size="max-h-14" />
                        </div>
                      )}
                      <div className="text-xs text-slate-400">DS-2026-0001</div>
                      <div className="text-sm font-semibold text-slate-800">ตัวอย่างการ์ดงาน</div>
                    </div>

                    {/* แผงประวัติ + badge */}
                    {tab === "audit" && (
                      <div data-gg-audit className="mb-3 flex items-center gap-2 rounded-lg bg-slate-900 p-3 text-white">
                        <BrandSlot theme={draft} id="audit_badge" />
                        <div className="text-xs font-semibold">ประวัติจาก Audit Log กลาง</div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button data-gg-action="primary" className="h-9 px-3 text-sm rounded-md border">ปุ่มหลัก</button>
                      <button data-gg-action className="h-9 px-3 text-sm rounded-md border">ปุ่มรอง</button>
                    </div>

                    {/* รูปตอนไม่มีงาน (empty) */}
                    {tab === "page" && draft.slots?.page_empty && (
                      <div className="mt-3 flex flex-col items-center gap-1 text-xs text-slate-400">
                        <BrandSlot theme={draft} id="page_empty" />
                        ตัวอย่างหน้าว่าง
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ThemeKitModal open={kitOpen} onClose={() => setKitOpen(false)} draft={draft} statuses={statuses}
        brandName={brandName} onApply={applyKit} />

      <ConfirmDialog open={resetConfirm} onClose={() => setResetConfirm(false)} onConfirm={() => void doReset()}
        title="รีเซ็ตธีม" variant="danger" confirmText="รีเซ็ต" cancelText="ยกเลิก"
        message={`ล้างธีมของ "${brandName}" กลับเป็นค่าเริ่มต้น ERP ทั้งร่างและที่เผยแพร่? (ย้อนกลับไม่ได้)`} />
    </ERPModal>
  );
}
