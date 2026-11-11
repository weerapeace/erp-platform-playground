"use client";
/**
 * กล่อง "ยังขาด N อย่าง — กรอกตรงนี้ได้เลย" บนสุดของป๊อปคู่ค้า (เปิดจากแท็บ ⚠️ ข้อมูลไม่ครบ ในหน้า Partners)
 *   โชว์เฉพาะช่องที่ขาด (กติกา lib/partner-data-check) · บันทึกผ่าน PATCH /api/master-v2/partners/<id> ตัวเดียวกับฟอร์มแก้ไข
 *   (สิทธิ์ระดับฟิลด์ + audit ของกลาง) · ส่งเฉพาะช่องที่เปลี่ยน · "ข้ามไปรายถัดไป" = เปิดรายถัดไปในแท็บ
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/spinner";
import { askLeaveUnsaved } from "@/components/modal/ask-dialog";
import { GAP_FIELDS, partnerGaps, taxSwapped, isChinaPartner } from "@/lib/partner-data-check";

type Partner = Record<string, unknown> & { id: string };
const str = (v: unknown) => (v == null ? "" : String(v));

export function PartnerQuickFix({ partner, canEdit, onSaved, onNext, onDirtyChange }: {
  partner: Partner;
  canEdit: boolean;
  onSaved: (p: Partner) => void;
  /** มีรายถัดไปในแท็บข้อมูลไม่ครบ */
  onNext?: () => void;
  /** แจ้งป๊อปว่ามีข้อมูลยังไม่บันทึก (ใช้ถามก่อนปิด) */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const toast = useToast();
  const gaps = useMemo(() => partnerGaps(partner), [partner]);
  const swapped = !isChinaPartner(partner) && taxSwapped(partner);
  const fields = useMemo(() => gaps.flatMap((g) => GAP_FIELDS[g.key]), [gaps]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // เปลี่ยนราย = เริ่มใหม่จากค่าปัจจุบันในทะเบียน (ที่อยู่ที่กรอกไว้บางส่วนก็เห็น)
  useEffect(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.k] = str(partner[f.k]);
    if (swapped) { init.tax_id = str(partner.tax_id); init.tax_branch = str(partner.tax_branch); }
    setVals(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner.id, gaps.length, swapped]);

  const changed = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(vals)) if (v.trim() !== str(partner[k]).trim()) out[k] = v.trim() || null;
    return out;
  }, [vals, partner]);
  const dirty = Object.keys(changed).length > 0;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  if (!gaps.length && !swapped) {
    return (
      <div className="mb-4 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] text-emerald-800 flex items-center gap-2 flex-wrap">
        ✓ ข้อมูลสำหรับออกเอกสารครบแล้ว
        {onNext && <button type="button" onClick={onNext} className="ml-auto h-[30px] px-3 rounded-[8px] bg-white border border-emerald-200 text-emerald-700 font-semibold hover:bg-emerald-100">ไปรายถัดไป →</button>}
      </div>
    );
  }

  const save = async () => {
    if (!dirty) { toast.error("ยังไม่ได้กรอกอะไรเพิ่ม"); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/master-v2/partners/${partner.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changed),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success("บันทึกแล้ว");
      onSaved({ ...partner, ...changed, ...((j.data ?? {}) as Partner) });
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  const skip = async () => {
    if (dirty && !(await askLeaveUnsaved())) return;
    onDirtyChange?.(false);
    onNext?.();
  };
  const IN = "h-[34px] w-full border border-slate-200 rounded-[8px] px-2.5 text-[13px] bg-white focus:outline-2 focus:outline-indigo-500";

  return (
    <div className="mb-4 rounded-[10px] border border-amber-200 bg-amber-50/70 px-3.5 py-3">
      <div className="text-[12.5px] font-semibold text-amber-800">
        ⚠️ ยังขาด {gaps.length + (swapped ? 1 : 0)} อย่าง{canEdit ? " — กรอกตรงนี้ได้เลย" : ""}
      </div>
      {!canEdit && <div className="mt-1 text-[12px] text-amber-700">{gaps.map((g) => g.label).join(" · ")} — คุณไม่มีสิทธิ์แก้ข้อมูลคู่ค้า</div>}
      {canEdit && (
        <div className="mt-2.5 space-y-3">
          {swapped && (
            <div className="flex items-center gap-2 flex-wrap text-[12px] text-amber-800">
              เลข 13 หลักอยู่ในช่อง &quot;สาขา&quot; ({str(partner.tax_branch)})
              <button type="button" onClick={() => setVals((v) => ({ ...v, tax_id: str(partner.tax_branch), tax_branch: "00000" }))}
                className="h-[28px] px-2.5 rounded-[7px] bg-white border border-amber-300 font-semibold hover:bg-amber-100">ย้ายไปช่องเลขภาษี</button>
            </div>
          )}
          {gaps.map((g) => (
            <div key={g.key}>
              <div className="text-[11.5px] font-semibold text-slate-600 mb-1">{g.label}{!g.required && <span className="font-normal text-slate-400"> (ควรมี)</span>}</div>
              <div className="grid grid-cols-2 gap-2">
                {GAP_FIELDS[g.key].map((f) => (
                  <input key={f.k} aria-label={f.label} placeholder={f.ph ?? f.label} value={vals[f.k] ?? ""}
                    onChange={(e) => setVals((v) => ({ ...v, [f.k]: e.target.value }))}
                    className={`${IN} ${f.k === "address_line" ? "col-span-2" : ""}`} />
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            {onNext && <button type="button" onClick={() => void skip()} className="h-[34px] px-3 rounded-[9px] border border-slate-200 bg-white text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50">ข้ามไปรายถัดไป</button>}
            <button type="button" onClick={() => void save()} disabled={saving}
              className="ml-auto h-[34px] px-4 rounded-[9px] bg-indigo-600 text-white text-[12.5px] font-semibold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">
              {saving && <Spinner />}บันทึกที่กรอก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
