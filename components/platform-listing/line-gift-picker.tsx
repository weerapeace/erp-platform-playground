"use client";

/**
 * ตัวเลือก "ส่งเป็นของขวัญ" ของ LINE (สถานะ 3 แบบ + หมวด ≤3) — ใช้ในหน้าดูก่อนส่ง (ตัวช่วยลงสินค้า) + ลิ้นชักสินค้าบนร้าน
 * กฎ/ค่าเริ่ม/รายชื่อหมวด = lib/line-gift (ของกลาง) · คอมโพเนนต์นี้แค่แสดงและแก้ค่า ไม่บันทึกเอง
 */
import { GIFT_STATUS_LABEL, LINE_GIFT_GROUPS, LINE_GIFT_MAX_GROUPS, type GiftSetting, type GiftStatus } from "@/lib/line-gift";
import { Icon } from "@/components/icon";

export function LineGiftPicker({ value, onChange, disabled = false }: {
  value: GiftSetting;
  onChange: (v: GiftSetting) => void;
  disabled?: boolean;
}) {
  const setStatus = (status: GiftStatus) => onChange({ ...value, status });
  const toggleCat = (name: string) => {
    const has = value.categories.includes(name);
    if (!has && value.categories.length >= LINE_GIFT_MAX_GROUPS) return;
    onChange({ ...value, categories: has ? value.categories.filter((c) => c !== name) : [...value.categories, name] });
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="สถานะของขวัญ">
        {(Object.keys(GIFT_STATUS_LABEL) as GiftStatus[]).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={value.status === s} disabled={disabled} onClick={() => setStatus(s)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs disabled:opacity-50 ${value.status === s ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <span className={`h-3 w-3 rounded-full border ${value.status === s ? "border-[4px] border-violet-600" : "border-slate-300"}`} />{GIFT_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {value.status !== "off" && (
        <div>
          <div className="mb-1 text-[11px] text-slate-500">หมวดของขวัญ (เลือกได้สูงสุด {LINE_GIFT_MAX_GROUPS}) · ไม่เลือก = ลูกค้าเจอจากการค้นหาเท่านั้น</div>
          <div className="flex flex-wrap gap-1.5">
            {LINE_GIFT_GROUPS.map((g) => {
              const on = value.categories.includes(g.name);
              const full = !on && value.categories.length >= LINE_GIFT_MAX_GROUPS;
              return (
                <button key={g.id} type="button" disabled={disabled || full} onClick={() => toggleCat(g.name)}
                  title={full ? `เลือกครบ ${LINE_GIFT_MAX_GROUPS} หมวดแล้ว` : g.confirmed ? "" : "หมวดนี้ยังไม่เคยใช้กับร้านเรา (รหัสเดาจากลำดับในหน้า LINE)"}
                  className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs disabled:opacity-40 ${on ? "border-violet-400 bg-violet-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {on && <Icon name="done" />}{g.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
