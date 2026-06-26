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
import { resolveTheme, themeToCssVars, brandBgUrl, hexToRgba, THEME_PRESETS, themeWarnings, isValidColor, type BrandTheme } from "@/lib/brand-theme";
import { BrandThemeStyles } from "@/components/brand-theme/styles";
import { ColorInput } from "@/components/color-picker";

type Tab = "preset" | "colors" | "background" | "cards" | "buttons" | "icons";
const TABS: [Tab, string][] = [["preset", "🎨 พรีเซ็ต"], ["colors", "🌈 สี"], ["background", "🖼 พื้นหลัง"], ["cards", "🃏 การ์ด"], ["buttons", "🔘 ปุ่ม"], ["icons", "⭐ ไอคอน"]];

export function BrandThemeBuilder({ brandId, brandName, open, onClose, onPublished }: {
  brandId: string; brandName: string; open: boolean; onClose: () => void; onPublished?: () => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("preset");
  const [draft, setDraft] = useState<BrandTheme>(resolveTheme(null));
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab("preset"); setLoading(true);
    apiFetch(`/api/brand-themes/${brandId}`).then((r) => r.json())
      .then((j) => setDraft(resolveTheme(j.draft ?? j.published)))
      .catch(() => setDraft(resolveTheme(null))).finally(() => setLoading(false));
  }, [open, brandId]);

  const set = <K extends keyof BrandTheme>(k: K, v: BrandTheme[K]) => setDraft((d) => ({ ...d, [k]: v }));
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

  // ช่องสี: ใช้ของกลาง ColorInput (ลากเลือกได้ + พิมพ์ hex/rgba)
  const Color = ({ label, k }: { label: string; k: keyof BrandTheme }) => {
    const v = String(draft[k] ?? "");
    return (
      <label className="block">
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
            <div className="flex flex-wrap gap-1 mb-3">
              {TABS.map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className={`h-8 px-2.5 text-xs rounded-lg ${tab === k ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50 border border-slate-200"}`}>{l}</button>
              ))}
            </div>

            {tab === "preset" && (
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
            )}
            {tab === "colors" && (
              <div className="space-y-2">
                <Color label="สีหลัก (primary)" k="primary_color" /><Color label="สีรอง (secondary)" k="secondary_color" /><Color label="สีเน้น (accent)" k="accent_color" />
                <Color label="สีหัวข้อ" k="heading_text_color" /><Color label="สีตัวอักษร" k="body_text_color" /><Color label="สีตัวอักษรจาง" k="muted_text_color" />
                <Color label="สีเส้น workflow" k="workflow_line_color" />
              </div>
            )}
            {tab === "background" && (
              <div className="space-y-3">
                <Color label="สีพื้นหลัง" k="background_color" />
                <div>
                  <span className="text-[11px] text-slate-500">รูปพื้นหลัง (ไม่บังคับ · ย่อ ?w= อัตโนมัติ)</span>
                  <div className="mt-1"><ImageInput value={draft.background_image_key ?? null} folder="brand-theme" onChange={(k) => set("background_image_key", k)} /></div>
                </div>
                <Color label="สีทับรูป (overlay)" k="background_overlay_color" />
                <label className="block">
                  <span className="text-[11px] text-slate-500">ความเข้ม overlay ({Math.round(draft.background_opacity * 100)}%)</span>
                  <input type="range" min={0} max={100} value={Math.round(draft.background_opacity * 100)} onChange={(e) => set("background_opacity", Number(e.target.value) / 100)} className="w-full" />
                </label>
              </div>
            )}
            {tab === "cards" && (
              <div className="space-y-2">
                <Color label="พื้นการ์ด" k="card_background_color" /><Color label="เส้นขอบการ์ด" k="card_border_color" />
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
                <Color label="พื้นปุ่มหลัก" k="button_primary_bg" /><Color label="ตัวอักษรปุ่มหลัก" k="button_primary_text" />
                <Color label="พื้นปุ่มรอง" k="button_secondary_bg" /><Color label="ตัวอักษรปุ่มรอง" k="button_secondary_text" />
              </div>
            )}
            {tab === "icons" && (
              <div className="space-y-3">
                <div><span className="text-[11px] text-slate-500">ไอคอนการ์ดสถิติ (ไม่บังคับ)</span>
                  <div className="mt-1"><ImageInput value={draft.stat_icon_image_key ?? null} folder="brand-theme" onChange={(k) => set("stat_icon_image_key", k)} /></div></div>
                <div><span className="text-[11px] text-slate-500">ไอคอนการ์ดงาน (ไม่บังคับ)</span>
                  <div className="mt-1"><ImageInput value={draft.card_icon_image_key ?? null} folder="brand-theme" onChange={(k) => set("card_icon_image_key", k)} /></div></div>
              </div>
            )}

            {warns.length > 0 && (
              <div className="mt-3 px-2.5 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-700 space-y-0.5">
                {warns.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
          </div>

          {/* ขวา: พรีวิวสด */}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-slate-400 mb-1">พรีวิว (อัปเดตทันที · ยังไม่บันทึกจนกดปุ่ม)</div>
            <div className="brand-themed rounded-xl border border-slate-200 p-4 min-h-[300px]" style={previewStyle}>
              <BrandThemeStyles />
              <h2 className="text-lg font-semibold mb-3">{draft.theme_name || brandName}</h2>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {["งานทั้งหมด", "ใกล้ครบ"].map((l, i) => (
                  <div key={l} data-gg-stat-card className="rounded-lg border border-white/70 bg-white/80 p-3">
                    <div className="text-xs font-medium text-slate-400">{l}</div>
                    <div className="text-2xl font-semibold text-slate-900">{i === 0 ? 19 : 3}</div>
                  </div>
                ))}
              </div>
              <div data-gg-task-card className="rounded-lg border border-slate-200 bg-white p-3 mb-3">
                <div className="text-xs text-slate-400">DS-2026-0001</div>
                <div className="text-sm font-semibold text-slate-800">ตัวอย่างการ์ดงาน</div>
              </div>
              <div className="flex gap-2">
                <button data-gg-action="primary" className="h-9 px-3 text-sm rounded-md border">ปุ่มหลัก</button>
                <button data-gg-action className="h-9 px-3 text-sm rounded-md border">ปุ่มรอง</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={resetConfirm} onClose={() => setResetConfirm(false)} onConfirm={() => void doReset()}
        title="รีเซ็ตธีม" variant="danger" confirmText="รีเซ็ต" cancelText="ยกเลิก"
        message={`ล้างธีมของ "${brandName}" กลับเป็นค่าเริ่มต้น ERP ทั้งร่างและที่เผยแพร่? (ย้อนกลับไม่ได้)`} />
    </ERPModal>
  );
}
