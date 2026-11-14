"use client";
/**
 * 📚 Design Library — ป๊อป "ส่งเป็นใบงานออกแบบ" (รอบ 5 ช่วง 3)
 * สร้างใบงานใหม่ (ออกเลข DS ตามระบบเดิม) หรือแนบเข้าใบที่มีอยู่ (ตัวเลือกใบงานกลาง DesignSheetPickerModal)
 * เลือกได้ว่าจะส่งอะไร: รูป GPT · หน้ารูป+หมุดวัสดุ · ตารางสี · ตีราคา (เฉพาะคนดูต้นทุนได้)
 * งานจริงอยู่ที่ POST /api/design-library/send-to-sheet (แปลงด้วย lib/design-library-sheet)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { BrandSelect, type BrandSelectOption } from "@/components/brand-select";
import { DesignSheetPickerModal, type PickedDesignSheet } from "@/components/design-sheet-picker";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";

export type LinkedSheet = { id: string; code: string; name: string; is_active?: boolean | null };
export const sheetHref = (id: string) => `/master/design-sheets?open=${id}`;

type Include = { images: boolean; spec: boolean; colors: boolean; cost: boolean };

export function SendToSheetModal({ open, onClose, recipeId, defaultName, linked, colorwayId, colorwayName, colorwayCount, renderCount, canCost, onSent }: {
  open: boolean; onClose: () => void;
  recipeId: string; defaultName: string;
  /** ใบงานที่สูตรนี้ส่งไปแล้ว (null = ยังไม่เคย) */
  linked: LinkedSheet | null;
  /** ชุดสีที่ใช้ทำหมุด/ตีราคา (ตารางสีส่งทุกชุดสีเสมอ) */
  colorwayId: string | null; colorwayName: string | null; colorwayCount: number; renderCount: number;
  canCost: boolean;
  onSent: (sheet: LinkedSheet) => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"new" | "linked" | "other">("new");
  const [name, setName] = useState(defaultName);
  const [brandId, setBrandId] = useState("");
  const [brands, setBrands] = useState<BrandSelectOption[]>([]);
  const [other, setOther] = useState<PickedDesignSheet | null>(null);
  const [picking, setPicking] = useState(false);
  const [inc, setInc] = useState<Include>({ images: true, spec: true, colors: true, cost: true });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(linked ? "linked" : "new"); setName(defaultName); setOther(null); setInc({ images: true, spec: true, colors: true, cost: true });
  }, [open, linked, defaultName]);
  useEffect(() => {
    if (!open || brands.length) return;
    let alive = true;
    apiFetch("/api/brands").then((r) => r.json()).then((j) => { if (alive && Array.isArray(j.data)) setBrands(j.data as BrandSelectOption[]); }).catch(() => {});
    return () => { alive = false; };
  }, [open, brands.length]);

  const target = mode === "linked" ? linked : mode === "other" ? other : null;
  const nothing = !inc.images && !inc.spec && !inc.colors && !(canCost && inc.cost);
  const canSend = !busy && !nothing && (mode === "new" ? name.trim().length > 0 : !!target);

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/design-library/send-to-sheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        recipe_id: recipeId, mode: mode === "new" ? "new" : "attach", sheet_id: target?.id ?? null,
        name: name.trim(), brand_id: brandId || null, colorway_id: colorwayId, expect_sheet_id: linked?.id ?? null,
        include: { ...inc, cost: canCost && inc.cost },
      }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error || !j.data?.sheet) throw new Error(j.error || "ส่งเป็นใบงานไม่สำเร็จ กรุณาลองใหม่");
      const d = j.data as { sheet: LinkedSheet; created: boolean; counts: { images: number; pins: number; colorways: number; cost_lines: number }; warnings: string[] };
      const parts = [d.counts.images ? `รูป ${d.counts.images}` : "", d.counts.pins ? `หมุด ${d.counts.pins}` : "", d.counts.colorways ? `ชุดสี ${d.counts.colorways}` : "", d.counts.cost_lines ? `ตีราคา ${d.counts.cost_lines} บรรทัด` : ""].filter(Boolean);
      const msg = `${d.created ? "สร้างใบงาน" : "ส่งเข้าใบงาน"} ${d.sheet.code} แล้ว${parts.length ? ` (${parts.join(" · ")})` : ""}`;
      if (d.warnings.length) toast.warning(`${msg} — แต่ ${d.warnings.join(" · ")}`); else toast.success(msg);
      onSent(d.sheet);
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const Opt = ({ k, label, hint, disabled }: { k: keyof Include; label: string; hint: string; disabled?: boolean }) => (
    <label className={`flex items-start gap-2 py-1.5 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" className="mt-1" disabled={disabled} checked={!disabled && inc[k]} onChange={(e) => setInc((p) => ({ ...p, [k]: e.target.checked }))} />
      <span><span className="text-[14px] text-slate-800">{label}</span><span className="block text-[12px] text-slate-500">{hint}</span></span>
    </label>
  );
  const ModeBtn = ({ m, label, sub }: { m: typeof mode; label: string; sub: string }) => (
    <button type="button" onClick={() => setMode(m)} className={`flex-1 min-w-[9rem] text-left rounded-lg border px-3 py-2 ${mode === m ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
      <div className="text-[14px] font-medium text-slate-800">{label}</div><div className="text-[12px] text-slate-500 truncate">{sub}</div>
    </button>
  );

  return (
    <>
      <ERPModal open={open && !picking} onClose={onClose} title="ส่งเป็นใบงานออกแบบ" size="md" defaultExpanded={false} storageKey="design-library-send-sheet"
        footer={<div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm">ยกเลิก</button>
          <button type="button" disabled={!canSend} onClick={() => void send()} className="h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50">{busy ? "กำลังส่ง…" : mode === "new" ? "สร้างใบงาน" : "ส่งเข้าใบงาน"}</button>
        </div>}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <ModeBtn m="new" label="สร้างใบงานใหม่" sub="ออกเลข DS ใหม่" />
            {linked && <ModeBtn m="linked" label={`ใบเดิม ${linked.code}`} sub={linked.name} />}
            <ModeBtn m="other" label="แนบเข้าใบอื่น" sub={other ? `${other.code} ${other.name}` : "เลือกจากรายการใบงาน"} />
          </div>

          {mode === "new" && (
            <div className="grid gap-2">
              <label className="text-[13px] text-slate-600">ชื่องาน
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className="mt-1 w-full h-9 px-2 border border-slate-200 rounded-lg text-[14px]" />
              </label>
              <label className="text-[13px] text-slate-600">แบรนด์
                <div className="mt-1"><BrandSelect brands={brands} value={brandId} onChange={setBrandId} emptyLabel="— ไม่ระบุ —" /></div>
              </label>
              {linked && <p className="text-[12px] text-amber-700">สูตรนี้เคยส่งเป็นใบงาน {linked.code} แล้ว — สร้างใบใหม่ สูตรจะจำใบใหม่แทน (ใบเดิมยังอยู่)</p>}
            </div>
          )}
          {mode === "other" && (
            <button type="button" onClick={() => setPicking(true)} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm inline-flex items-center gap-1.5">
              <Icon value="i:clipboard-list" />{other ? `เปลี่ยนใบงาน (ตอนนี้ ${other.code})` : "เลือกใบงาน…"}
            </button>
          )}

          <div className="rounded-lg border border-slate-200 px-3 py-1">
            <Opt k="images" label="รูปจาก GPT" hint={renderCount ? `รูปล่าสุดของทุกมุม/ทุกชุดสี → ไฟล์แนบของใบงาน (แนบแล้วไม่แนบซ้ำ)` : "สูตรนี้ยังไม่มีรูปจาก GPT"} disabled={!renderCount} />
            <Opt k="spec" label="รูปแม่แบบ + หมุดวัสดุ" hint={`หน้าใหม่ในแท็บรายละเอียดงาน พร้อมรหัสวัสดุและจำนวน${colorwayName ? ` (ชุดสี ${colorwayName})` : ""} · ส่งซ้ำ = แทนหน้าเดิมจากสูตรนี้`} />
            <Opt k="colors" label="ตารางสี" hint={`${colorwayCount} ชุดสี → ตารางสีของใบงาน (รวมกับที่มีอยู่ ไม่ลบของเดิม)`} />
            {canCost && <Opt k="cost" label="ทุนประมาณ → ตีราคา" hint={`บรรทัดวัสดุ + จำนวน + ราคาที่รู้${colorwayName ? ` (ชุดสี ${colorwayName})` : ""} · ต่อท้ายตารางตีราคา ไม่ลบบรรทัดเดิม — ส่งซ้ำจะได้บรรทัดซ้ำ`} />}
          </div>
          {nothing && <p className="text-[12px] text-rose-600">เลือกอย่างน้อย 1 อย่างที่จะส่ง</p>}
        </div>
      </ERPModal>
      <DesignSheetPickerModal open={picking} onClose={() => setPicking(false)} title="เลือกใบงานที่จะแนบสูตร" confirmText="เลือกใบนี้"
        onConfirm={(s) => { setOther(s); setMode("other"); setPicking(false); }} />
    </>
  );
}
