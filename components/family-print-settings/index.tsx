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
import { FAMILY_DEFAULT_SETTINGS, FAMILY_SETTING_FIELDS, normalizeFamilySettings, type FamilyPrintSettings } from "@/lib/family-print";

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

export function FamilyPrintSettingsButton({ current, onPreview, onSaved }: {
  /** ค่าที่หน้าพิมพ์ใช้อยู่ (ค่ากลางที่บันทึกไว้) — เปิดแผงแล้วเริ่มจากค่านี้ */
  current: FamilyPrintSettings;
  /** ส่งค่าให้หน้าพิมพ์วาดสด (null = กลับไปใช้ค่าที่บันทึกไว้) */
  onPreview: (s: FamilyPrintSettings | null) => void;
  onSaved: () => void;
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
