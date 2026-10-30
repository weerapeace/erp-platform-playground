"use client";
/**
 * 🎨 แผง "แต่งหน้าแรก" ของ /apps (ของกลาง · กฎ lib/launcher-theme · ชั้นวาด ./backdrop)
 *   พื้นหลัง (ไล่สี/รูป/สีเดียว + รูป: ความชัด · ตำแหน่ง 9 จุด · ขนาด · ซูม) · สีหลัก · ฟอนต์
 *   ของตกแต่ง: เพิ่มจากคลังไฟล์ (AssetPicker — อัปใหม่ได้ · GIF ไม่ถูกย่อ) · ลากย้ายบนหน้าจอ · ขนาด/ความชัด/หมุน/ท่าขยับ/ชั้น/มือถือ
 *   ของฉัน = บันทึกอัตโนมัติ · ค่ากลางทั้งทีม (แอดมิน) = ร่าง → 💾 บันทึก (แบบเดียวกับ ◎ ปรับวงแอป)
 */
import { useState } from "react";
import { ColorInput } from "@/components/color-picker";
import { RangeInput } from "@/components/range-input";
import { AssetPicker } from "@/components/asset-picker";
import { Icon } from "@/components/icon";
import { uploadResizedImage } from "@/components/image-attach";
import { useToast } from "@/components/toast";
import { r2ImageUrl } from "@/lib/r2-image";
import {
  BG_FITS, BG_FIT_LABEL, BG_POSITIONS, BG_POS_LABEL, BG_PRESETS, DECOR_ANIM_LABEL, DECOR_MAX, LAUNCHER_DECOR_ANIMS, LAUNCHER_FONTS, LEGACY_BG_OPACITY, newDecor,
  type LauncherDecor, type LauncherTheme,
} from "@/lib/launcher-theme";

export type LauncherThemeScope = "mine" | "team";

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 text-[11px]">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
          className={`h-6 rounded-md px-2 ${value === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>
      ))}
    </div>
  );
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-2"><span className="w-14 shrink-0 text-[11px] text-slate-500">{label}</span><div className="min-w-0 flex-1">{children}</div></div>
);

export function LauncherThemePanel({
  value, onPatch, onReset, onClose, scope, onScope, canTeam, ownBg, ownDecor, onUseTeam,
  teamDirty, savingTeam, onSaveTeam, onCancelTeam, selectedId, onSelect,
}: {
  /** ค่าที่กำลังแก้ (ของฉัน = รวมค่าทีมแล้ว · ทีม = ร่างของทีม) */
  value: LauncherTheme & { decor: LauncherDecor[] };
  onPatch: (patch: Partial<LauncherTheme>) => void;
  onReset: () => void;
  onClose: () => void;
  scope: LauncherThemeScope;
  onScope: (s: LauncherThemeScope) => void;
  canTeam: boolean;
  /** ของฉันตั้งพื้นหลัง / ของตกแต่งเองแล้ว (ไม่ได้ตามทีม) */
  ownBg: boolean;
  ownDecor: boolean;
  onUseTeam: (part: "bg" | "decor") => void;
  teamDirty: boolean;
  savingTeam: boolean;
  onSaveTeam: () => void;
  onCancelTeam: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const toast = useToast();
  const [bgBusy, setBgBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const decor = value.decor;
  const sel = decor.find((d) => d.id === selectedId) ?? null;
  const patchDecor = (id: string, p: Partial<LauncherDecor>) => onPatch({ decor: decor.map((d) => (d.id === id ? { ...d, ...p } : d)) });
  const mine = scope === "mine";

  const onPickBg = async (file: File | null | undefined) => {
    if (!file) return;
    setBgBusy(true);
    try { const up = await uploadResizedImage(file, { folder: "launcher-bg", max: 1920 }); onPatch({ bgImage: up.r2_key, bg: null, bgGradient: null }); }
    catch { toast.error("อัปโหลดรูปไม่สำเร็จ"); }
    finally { setBgBusy(false); }
  };

  const addDecor = (keys: string[]) => {
    let next = [...decor];
    for (const k of keys) { if (next.length >= DECOR_MAX) break; next = [...next, newDecor(k, next)]; }
    if (keys.length > DECOR_MAX - decor.length) toast.info(`ใส่ได้สูงสุด ${DECOR_MAX} ชิ้น`);
    onPatch({ decor: next });
    onSelect(next[next.length - 1]?.id ?? null);
  };

  return (
    <>
      {/* คลิกนอกแผง = ปิด (ของตกแต่งตอนแต่งอยู่ชั้นเหนือแผ่นนี้ → ลากได้) */}
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div className="absolute right-0 z-[62] mt-1 max-h-[78vh] w-[22rem] max-w-[92vw] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Icon value="🎨" /> แต่งหน้าแรก{mine ? " (ของฉัน)" : " (ทั้งทีม)"}</p>
          <button type="button" onClick={onReset} className="text-[11px] text-slate-400 hover:text-blue-600">{mine ? "รีเซ็ตของฉัน" : "ล้างค่าทีม"}</button>
        </div>
        {canTeam && (
          <div className="space-y-1">
            <Seg<LauncherThemeScope> value={scope} onChange={onScope} options={[["mine", "ของฉัน"], ["team", "ค่ากลางทั้งทีม"]]} />
            <p className="text-[11px] text-slate-400">{mine ? "เห็นเฉพาะคุณ บันทึกให้อัตโนมัติ" : "ทุกคนที่ยังไม่ได้แต่งเองจะเห็นแบบนี้ — กดบันทึกถึงจะมีผล"}</p>
          </div>
        )}

        {/* พื้นหลัง */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">พื้นหลัง</span>
            <span className="flex items-center gap-2">
              {mine && ownBg && <button type="button" onClick={() => onUseTeam("bg")} className="text-[11px] text-slate-400 hover:text-blue-600">ใช้ของทีม</button>}
              <button type="button" onClick={() => onPatch({ bg: null, bgGradient: null, bgImage: null })} className="text-[11px] text-slate-400 hover:text-slate-700">ล้าง</button>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {BG_PRESETS.map((p, i) => (
              <button key={i} type="button" onClick={() => onPatch({ bgGradient: p, bg: null, bgImage: null })} title="พื้นหลังไล่สี"
                className="h-8 w-8 rounded-lg border border-slate-200 transition-transform hover:scale-110" style={{ background: `linear-gradient(160deg,${p.from},${p.to})` }} />
            ))}
            <label className="flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2 text-[11px] text-slate-500 hover:bg-slate-50">
              {bgBusy ? "กำลังอัปโหลด…" : <><Icon value="🖼" /> รูป</>}
              <input type="file" accept="image/*" className="hidden" disabled={bgBusy} onChange={(e) => onPickBg(e.target.files?.[0])} />
            </label>
          </div>
          <Row label="สีเดียว"><ColorInput value={value.bg ?? "#f8fafc"} onChange={(c) => onPatch({ bg: c, bgGradient: null, bgImage: null })} /></Row>
          {value.bgImage && (
            <div className="space-y-2 rounded-lg bg-slate-50 p-2">
              <Row label="ความชัด"><RangeInput value={value.bgOpacity ?? LEGACY_BG_OPACITY} min={5} max={100} step={5} unit="%" onChange={(v) => onPatch({ bgOpacity: v })} ariaLabel="ความชัดของรูปพื้นหลัง" /></Row>
              <div className="flex items-start gap-2">
                <span className="w-14 shrink-0 pt-1 text-[11px] text-slate-500">ตำแหน่ง</span>
                <div className="grid grid-cols-3 gap-1">
                  {BG_POSITIONS.map((p) => {
                    const on = (value.bgPos ?? "center") === p;
                    return <button key={p} type="button" onClick={() => onPatch({ bgPos: p })} title={BG_POS_LABEL[p]} aria-label={BG_POS_LABEL[p]} aria-pressed={on}
                      className={`h-5 w-5 rounded border ${on ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white hover:border-blue-400"}`} />;
                  })}
                </div>
                <span className="pt-0.5 text-[10px] leading-4 text-slate-400">ให้รูปชิด<br />ไปทางนั้น</span>
              </div>
              <Row label="ขนาด"><Seg value={value.bgFit ?? "cover"} onChange={(v) => onPatch({ bgFit: v })} options={BG_FITS.map((f) => [f, BG_FIT_LABEL[f]])} /></Row>
              <Row label={value.bgFit === "tile" ? "ขนาดลาย" : "ซูม"}><RangeInput value={value.bgZoom ?? 100} min={100} max={300} step={10} unit="%" onChange={(v) => onPatch({ bgZoom: v })} ariaLabel="ซูมรูปพื้นหลัง" /></Row>
            </div>
          )}
        </section>

        <Row label="สีหลัก">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1"><ColorInput value={value.accent ?? "#0f172a"} onChange={(c) => onPatch({ accent: c })} /></div>
            <button type="button" onClick={() => onPatch({ accent: null })} className="shrink-0 text-[11px] text-slate-400 hover:text-slate-700">ล้าง</button>
          </div>
        </Row>

        <section>
          <span className="text-xs font-medium text-slate-600">ฟอนต์</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {LAUNCHER_FONTS.map((f) => (
              <button key={f.key} type="button" onClick={() => onPatch({ font: f.key || null })} style={f.css ? { fontFamily: f.css } : undefined}
                className={`h-7 rounded border px-2.5 text-xs ${(value.font ?? "") === f.key ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{f.label}</button>
            ))}
          </div>
        </section>

        {/* ของตกแต่ง */}
        <section className="space-y-2 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">ของตกแต่ง <span className="font-normal text-slate-400">({decor.length}/{DECOR_MAX})</span></span>
            <span className="flex items-center gap-2">
              {mine && ownDecor && <button type="button" onClick={() => { onSelect(null); onUseTeam("decor"); }} className="text-[11px] text-slate-400 hover:text-blue-600">ใช้ของทีม</button>}
              <button type="button" disabled={decor.length >= DECOR_MAX} onClick={() => setPickerOpen(true)}
                className="h-7 rounded-lg border border-violet-200 bg-violet-50 px-2.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50">+ เพิ่มรูป / GIF</button>
            </span>
          </div>
          {decor.length === 0 ? (
            <p className="text-[11px] text-slate-400">ใส่สติกเกอร์ รูปพื้นใส หรือ GIF ขยับได้ ไว้รอบ ๆ หน้าแรก · ซ่อนบนมือถือให้อัตโนมัติ</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {decor.map((d) => (
                  <button key={d.id} type="button" onClick={() => onSelect(d.id)} aria-pressed={d.id === selectedId}
                    className={`h-11 w-11 overflow-hidden rounded-lg border bg-slate-50 p-0.5 ${d.id === selectedId ? "border-violet-500 ring-2 ring-violet-200" : "border-slate-200 hover:border-violet-300"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r2ImageUrl(d.key, 96) ?? ""} alt="" className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">ลากชิ้นบนหน้าจอเพื่อย้าย · กดรูปด้านบนเพื่อปรับ</p>
            </>
          )}
          {sel && (
            <div className="space-y-2 rounded-lg bg-slate-50 p-2">
              <Row label="ขนาด"><RangeInput value={sel.w} min={2} max={40} step={0.5} unit="%" onChange={(v) => patchDecor(sel.id, { w: v })} ariaLabel="ขนาดของตกแต่ง" /></Row>
              <Row label="ความชัด"><RangeInput value={sel.opacity} min={10} max={100} step={5} unit="%" onChange={(v) => patchDecor(sel.id, { opacity: v })} ariaLabel="ความชัดของตกแต่ง" /></Row>
              <Row label="หมุน"><RangeInput value={sel.rotate} min={-180} max={180} step={1} unit="°" onChange={(v) => patchDecor(sel.id, { rotate: v })} ariaLabel="หมุนของตกแต่ง" /></Row>
              <div className="flex items-start gap-2">
                <span className="w-14 shrink-0 pt-1 text-[11px] text-slate-500">ท่าขยับ</span>
                <Seg value={sel.anim} onChange={(v) => patchDecor(sel.id, { anim: v })} options={LAUNCHER_DECOR_ANIMS.map((a) => [a, DECOR_ANIM_LABEL[a]])} />
              </div>
              <Row label="ชั้น"><Seg value={sel.front ? "front" : "back"} onChange={(v) => patchDecor(sel.id, { front: v === "front" })} options={[["back", "หลังการ์ดแอป"], ["front", "หน้าการ์ดแอป"]]} /></Row>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <input type="checkbox" checked={sel.mobile} onChange={(e) => patchDecor(sel.id, { mobile: e.target.checked })} className="h-3.5 w-3.5 accent-violet-600" /> โชว์บนมือถือด้วย
                </label>
                <button type="button" onClick={() => { onPatch({ decor: decor.filter((d) => d.id !== sel.id) }); onSelect(null); }}
                  className="flex items-center gap-1 text-[11px] text-red-600 hover:underline"><Icon name="delete" /> ลบชิ้นนี้</button>
              </div>
            </div>
          )}
        </section>

        {!mine && (
          <div className="sticky bottom-0 -mx-3 -mb-3 flex items-center justify-end gap-2 border-t border-slate-100 bg-white px-3 py-2">
            <button type="button" onClick={onCancelTeam} disabled={!teamDirty || savingTeam} className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button type="button" onClick={onSaveTeam} disabled={!teamDirty || savingTeam} className="flex h-8 items-center gap-1 rounded-lg bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50">
              <Icon name="save" /> {savingTeam ? "กำลังบันทึก…" : "บันทึกให้ทั้งทีม"}
            </button>
          </div>
        )}
      </div>

      <AssetPicker open={pickerOpen} onClose={() => setPickerOpen(false)} multiple typeFilter="image" title="เลือกของตกแต่ง (รูป / GIF / PNG พื้นใส)"
        onSelect={(rows) => { setPickerOpen(false); addDecor(rows.map((r) => r.r2_key).filter(Boolean)); }} />
    </>
  );
}
