"use client";

/**
 * ของกลาง — "ตั้งค่าใบรวมทั้งรุ่น" (ใบซื้อ-ตัด ของ × สี + ใบติดตามงาน)
 *  • useFamilyPrintSettings()      โหลดค่ากลาง ui_config key "family_print_settings"
 *  • <FamilyPrintSettingsButton/>   ปุ่ม + แผงลอยข้างเอกสาร — ปรับแล้วเห็นผลบนเอกสารทันที · กดบันทึกถึงมีผลกับทุกคน
 * ตัวเลือก/ค่าเริ่มต้น/อ่านค่าปลอดภัย อยู่ที่ lib/family-print (FAMILY_SETTING_FIELDS · normalizeFamilySettings)
 * บันทึกต้องมีสิทธิ์ products.edit (เหมือนตั้งค่าใบพิมพ์ใบสั่งงาน) · /api/ui-config จด audit setting_change ให้แล้ว
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { ColumnRows } from "@/components/wo-print-columns";
import {
  FAMILY_DEFAULT_SETTINGS, FAMILY_LINE_COLORS, FAMILY_LINE_MODES, FAMILY_LINE_WIDTHS, FAMILY_SETTING_FIELDS, FAMILY_SIZE_FIELDS, FAMILY_SIZE_PADS, FAMILY_SIZE_PRESETS,
  normalizeFamilySettings, type FamilyLine, type FamilyPrintSettings, type FamilySizes, type PrintColCfg,
} from "@/lib/family-print";
import { TRACK_EXTRA_COL, normalizeTrackCols, type TrackExtras } from "@/lib/family-track";

const CONFIG_KEY = "family_print_settings";

/** ค่ากลางที่บันทึกไว้ — ระหว่างโหลด/โหลดไม่ได้ = ค่าแนะนำ (หน้าพิมพ์ไม่พัง) */
export function useFamilyPrintSettings() {
  const [settings, setSettings] = useState<FamilyPrintSettings>(FAMILY_DEFAULT_SETTINGS);
  const reload = useCallback(() => {
    apiFetch(`/api/ui-config?key=${CONFIG_KEY}`)
      .then((r) => r.json())
      .then((j) => setSettings(normalizeFamilySettings(j?.value)))
      .catch(() => setSettings(FAMILY_DEFAULT_SETTINGS));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { settings, reload };
}

export function FamilyPrintSettingsButton({ current, onPreview, onSaved, extras }: {
  /** ค่าที่หน้าพิมพ์ใช้อยู่ (ค่ากลางที่บันทึกไว้) — เปิดแผงแล้วเริ่มจากค่านี้ */
  current: FamilyPrintSettings;
  /** ส่งค่าให้หน้าพิมพ์วาดสด (null = กลับไปใช้ค่าที่บันทึกไว้) */
  onPreview: (s: FamilyPrintSettings | null) => void;
  onSaved: () => void;
  /** ช่องเสริมใบติดตามงานที่เปิดอยู่ (ปุ่มบนแถบ) — ใช้บอกสถานะในรายการคอลัมน์ */
  extras?: TrackExtras;
}) {
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FamilyPrintSettings>(current);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof FamilyPrintSettings, v: string) => {
    const next = normalizeFamilySettings({ ...draft, [k]: v });
    setDraft(next);
    onPreview(next);
  };
  const apply = (next: FamilyPrintSettings) => { const n = normalizeFamilySettings(next); setDraft(n); onPreview(n); };
  const setSize = (p: Partial<FamilySizes>) => apply({ ...draft, sizes: { ...draft.sizes, ...p } });
  const setLine = (p: Partial<FamilyLine>) => apply({ ...draft, line: { ...draft.line, ...p } });
  const trackCols = normalizeTrackCols(draft.track_cols, draft.barcode);
  const setTrackCols = (list: PrintColCfg[]) => apply({ ...draft, track_cols: list });
  const openPanel = () => { setDraft(current); setOpen(true); };
  const closePanel = () => { onPreview(null); setOpen(false); };   // ปิดโดยไม่บันทึก = เอกสารกลับเป็นค่าเดิม

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/ui-config", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: CONFIG_KEY, value: draft }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      toast.success("บันทึกแล้ว — ทุกคนจะพิมพ์ได้หน้าตานี้");
      onSaved();
      onPreview(null);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  return (
    <>
      <button type="button" onClick={() => (open ? closePanel() : openPanel())}
        title="ปรับวิธีรวมแถว / ช่องติ๊ก / ช่องว่าง / รูป / บาร์โค้ด (เห็นผลบนเอกสารทันที)"
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${open ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
        <Icon name="settings" /> ตั้งค่าใบรวมทั้งรุ่น
      </button>
      {open && (
        <div className="no-print fixed right-4 top-[76px] z-40 w-[340px] rounded-xl border border-slate-300 bg-white/95 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-t-xl border-b border-slate-100 bg-slate-50/80 px-3 py-2">
            <span className="flex-1 text-[13px] font-bold text-slate-700"><Icon name="settings" /> ตั้งค่าใบรวมทั้งรุ่น</span>
            <button type="button" onClick={closePanel} title="ปิด (ไม่บันทึก)" className="h-6 rounded border border-slate-200 bg-white px-1.5 text-slate-500 hover:bg-slate-50"><Icon name="cancel" /></button>
          </div>
          <div className="max-h-[calc(100vh-220px)] space-y-2.5 overflow-y-auto px-3 py-2.5">
            <p className="text-[11px] leading-snug text-slate-500">ปรับแล้ว<b className="text-slate-700">เห็นผลบนเอกสารทันที</b> · กด <b>บันทึก</b> ถึงจะมีผลกับทุกคน · ใช้กับทั้งใบซื้อ-ตัดและใบติดตามงาน</p>
            {FAMILY_SETTING_FIELDS.map((f) => (
              <div key={f.key}>
                <div className="mb-1 text-[12px] font-bold text-slate-700">{f.label}</div>
                <div className="flex flex-wrap gap-1">
                  {f.options.map((o) => (
                    <button key={o.v} type="button" onClick={() => set(f.key, o.v)}
                      className={`h-7 rounded-lg border px-2.5 text-[12px] ${draft[f.key] === o.v ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
                {f.key === "merge" && (
                  <p className="mt-1 text-[11px] leading-snug text-slate-500">
                    รวมเป็นแถวเดียวเมื่อ <b>ชนิดวัตถุดิบเดียวกัน</b> + <b>หน่วยเดียวกัน</b> + <b>ชื่อขึ้นต้นเหมือนกัน</b> (จับคู่ข้ามสีตามลำดับใน BOM)
                    · ไม่รวม = ขาดข้อใดข้อหนึ่ง เช่น หน่วยไม่ตรง หรือยังไม่ได้ตั้งชนิดวัตถุดิบ
                  </p>
                )}
              </div>
            ))}

            {/* เส้นตาราง — ความหนา · สี · แบบเส้น (ใช้กับตาราง + กรอบหัวใบ/การ์ดสี ทุกแผ่น) */}
            <div className="rounded-lg border border-slate-200 px-2 py-1.5">
              <div className="mb-1 text-[12px] font-bold text-slate-700">เส้นตาราง</div>
              {([
                ["ความหนา", FAMILY_LINE_WIDTHS.map((w) => ({ key: String(w.v), label: w.label, on: draft.line.width === w.v, pick: () => setLine({ width: w.v }) }))],
                ["สี", FAMILY_LINE_COLORS.map((c) => ({ key: c.value, label: c.label, swatch: c.value, on: draft.line.color === c.value, pick: () => setLine({ color: c.value }) }))],
                ["แบบเส้น", FAMILY_LINE_MODES.map((m) => ({ key: m.value, label: m.label, on: draft.line.mode === m.value, pick: () => setLine({ mode: m.value }) }))],
              ] as [string, { key: string; label: string; swatch?: string; on: boolean; pick: () => void }[]][]).map(([label, opts]) => (
                <div key={label} className="mt-1 flex items-center gap-1.5">
                  <span className="w-14 shrink-0 text-[11px] text-slate-500">{label}</span>
                  <div className="flex flex-1 flex-wrap gap-1">
                    {opts.map((o) => (
                      <button key={o.key} type="button" onClick={o.pick}
                        className={`inline-flex h-6 items-center gap-1 rounded border px-1.5 text-[11px] ${o.on ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                        {o.swatch && <span className="inline-block h-3 w-3 rounded-sm border border-slate-300" style={{ background: o.swatch }} />}{o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* ขนาดแต่ละจุด — ชุดสำเร็จ + แถบเลื่อนต่อจุด (ค่าเริ่ม = หน้าตาเดิม) */}
            <details className="rounded-lg border border-slate-200 px-2 py-1.5" open>
              <summary className="cursor-pointer text-[12px] font-bold text-slate-700">ขนาดแต่ละจุด</summary>
              <div className="mt-1.5 space-y-2">
                <div className="flex flex-wrap gap-1">
                  {FAMILY_SIZE_PRESETS.map((p) => {
                    const on = JSON.stringify(p.value) === JSON.stringify(draft.sizes);
                    return (
                      <button key={p.label} type="button" onClick={() => apply({ ...draft, sizes: p.value })}
                        className={`h-7 rounded-lg border px-2.5 text-[12px] ${on ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{p.label}</button>
                    );
                  })}
                </div>
                {FAMILY_SIZE_FIELDS.map((z) => (
                  <div key={z.zone}>
                    <div className="text-[11px] font-bold text-slate-600">{z.zone}</div>
                    {z.fields.map((f) => (
                      <label key={f.key} className="flex items-center gap-1.5">
                        <span className="w-[118px] shrink-0 text-[11px] text-slate-500">{f.label}</span>
                        <input type="range" min={f.min} max={f.max} step={f.step} value={draft.sizes[f.key]}
                          onChange={(e) => setSize({ [f.key]: Number(e.target.value) } as Partial<FamilySizes>)} className="flex-1 accent-blue-600" />
                        <span className="w-14 text-right text-[11px] tabular-nums text-slate-600">{draft.sizes[f.key]} {f.unit}</span>
                      </label>
                    ))}
                    {z.zone === "ตารางของที่ต้องซื้อ" && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-[118px] shrink-0 text-[11px] text-slate-500">ระยะในช่อง</span>
                        {FAMILY_SIZE_PADS.map((p) => (
                          <button key={p.v} type="button" onClick={() => setSize({ pad: p.v })}
                            className={`h-6 flex-1 rounded border text-[11px] ${draft.sizes.pad === p.v ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{p.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <p className="text-[10px] leading-snug text-slate-400">บาร์โค้ดเส้นปรับได้แค่ความสูง — ความกว้างคงที่ ~55 มม. ให้เครื่องยิงอ่านได้ · การ์ดแคบกว่าบาร์โค้ด+QR → QR ตกบรรทัดล่าง</p>
              </div>
            </details>

            {/* คอลัมน์ใบติดตามงาน (แบบ A) — ลำดับ · ชื่อหัว · ความกว้าง · เปิดปิด (ช่องเสริมเปิด/ปิดที่ปุ่มบนแถบ) */}
            <details className="rounded-lg border border-slate-200 px-2 py-1.5">
              <summary className="cursor-pointer text-[12px] font-bold text-slate-700">คอลัมน์ใบติดตามงาน (แบบ A)</summary>
              <div className="mt-1.5 space-y-1">
                <p className="text-[11px] leading-snug text-slate-500">ลาก ⠿ สลับลำดับ · พิมพ์ทับชื่อหัวได้ · แถบ = ความกว้าง (% ขวา = สัดส่วนจริงบนกระดาษ)</p>
                <ColumnRows list={trackCols} onChange={setTrackCols} maxWidth={120}
                  shownOf={(c) => { const ex = TRACK_EXTRA_COL[c.key]; return ex ? (extras ? extras[ex] : true) : null; }}
                  lockHint="ช่องเสริม — เปิด/ปิดที่ปุ่ม &quot;ช่องเสริม (แบบ A)&quot; บนแถบด้านบน" />
                <button type="button" onClick={() => apply({ ...draft, track_cols: null })}
                  className="h-6 rounded border border-slate-200 px-2 text-[11px] text-slate-500 hover:bg-slate-50">คอลัมน์ค่าเริ่ม</button>
              </div>
            </details>
          </div>
          <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
            <button type="button" onClick={() => { setDraft(FAMILY_DEFAULT_SETTINGS); onPreview(FAMILY_DEFAULT_SETTINGS); }}
              className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-600 hover:bg-slate-50">ค่าแนะนำ</button>
            <div className="flex-1" />
            {canEdit
              ? <button type="button" onClick={save} disabled={saving}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-blue-600 px-4 text-[12px] font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                  <Icon name="save" /> {saving ? "กำลังบันทึก…" : "บันทึก"}
                </button>
              : <span className="text-[11px] text-slate-400">ดูตัวอย่างได้ · บันทึกต้องมีสิทธิ์แก้สินค้า</span>}
          </div>
        </div>
      )}
    </>
  );
}
