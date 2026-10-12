"use client";

/**
 * ⚙️ ตั้งค่าหน้าวางแผนคอนเทนต์ — เปิดได้จากหัวหน้า และจากในการ์ดไอเดีย
 *   📱 ช่องทาง: เลือกช่องทางที่โชว์ (แถวในมุมมองสัปดาห์ + ตัวเลือกในการ์ด) · ลากเรียงลำดับ · เพิ่มช่องทางใหม่ (เข้ารายการกลาง creative-options)
 *        + ลัดไป "แบรนด์ลงช่องทางไหน" (BrandPlatformsModal ของโมดูลคอนเทนต์ — ตอนเลือกแท็บแบรนด์ แถวจะเหลือเฉพาะช่องทางของแบรนด์นั้น)
 *   🧭 แนวคอนเทนต์: LabelListEditor (kind = pillar)
 * ของกลาง: ERPModal · useDragReorder/DragHandle · PlatformIcon · createOption · BrandPlatformsModal · LabelListEditor · Toast
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { PlatformIcon } from "@/components/platform-icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { createOption } from "@/app/tasks/use-options";
import { BrandPlatformsModal, getBrandPlatforms, type BrandPlatformMap, type BrandFormatMap } from "@/app/tasks/content/brand-platforms-modal";
import type { BrandOption } from "@/app/tasks/data";
import type { MarketingSkuLabel } from "@/lib/marketing/sku-list";
import { LabelListEditor } from "../skus/label-manager";
import type { PlatformOpt } from "./plan-modal";

export type PlanSettingsTab = "platforms" | "pillars";

export function PlanSettingsModal({ open, onClose, initialTab = "platforms", allPlatforms, planPlatforms, pillars, brands, canEdit, canEditBrands, onPlatformsSaved, onPillarsChanged, onOptionsChanged, onBrandPlatformsSaved }: {
  open: boolean;
  onClose: () => void;
  initialTab?: PlanSettingsTab;
  /** ช่องทางทั้งหมดจากรายการกลาง (เปิดใช้อยู่) */
  allPlatforms: PlatformOpt[];
  /** ช่องทางที่ตั้งไว้ให้โชว์ (เรียงแล้ว) · null = ยังไม่ตั้ง (โชว์ทั้งหมด) */
  planPlatforms: string[] | null;
  pillars: MarketingSkuLabel[];
  brands: BrandOption[];
  canEdit: boolean;
  /** แก้ "แบรนด์ลงช่องทางไหน" ได้ (สิทธิ์ของโมดูลคอนเทนต์ tasks.edit) */
  canEditBrands: boolean;
  onPlatformsSaved: (platforms: string[] | null) => void;
  onPillarsChanged: () => void;
  /** เพิ่มช่องทางใหม่แล้ว → ให้หน้าโหลดรายการกลางใหม่ */
  onOptionsChanged: () => Promise<void> | void;
  onBrandPlatformsSaved: (map: BrandPlatformMap) => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<PlanSettingsTab>(initialTab);
  const [order, setOrder] = useState<string[]>([]);       // ลำดับทุกช่องทาง (ที่เลือก + ไม่เลือก)
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [pillarDirty, setPillarDirty] = useState(false);
  const [brandModal, setBrandModal] = useState<{ map: BrandPlatformMap; formats: BrandFormatMap } | null>(null);

  // เปิดใหม่ทุกครั้ง → ตั้งจากค่าล่าสุด: ที่เลือกไว้ (ตามลำดับ) ก่อน แล้วต่อด้วยช่องทางที่เหลือ
  const resetFrom = () => {
    const keys = allPlatforms.map((p) => p.value);
    const sel = planPlatforms ? planPlatforms.filter((k) => keys.includes(k)) : keys;
    setOrder([...sel, ...keys.filter((k) => !sel.includes(k))]);
    setChosen(new Set(sel));
  };
  useEffect(() => { if (open) { setTab(initialTab); resetFrom(); setNewName(""); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setOrder((o) => [...o, ...allPlatforms.map((p) => p.value).filter((k) => !o.includes(k))]); }, [allPlatforms, open]);

  const byKey = new Map(allPlatforms.map((p) => [p.value, p]));
  const savedSel = (planPlatforms ?? allPlatforms.map((p) => p.value)).filter((k) => byKey.has(k));
  const curSel = order.filter((k) => chosen.has(k));
  const platformsDirty = JSON.stringify(curSel) !== JSON.stringify(savedSel);

  const { rowProps, handleProps, dragIdx } = useDragReorder((from, to) => setOrder((o) => moveItem(o, from, to)));

  const savePlatforms = async () => {
    if (curSel.length === 0) { toast.warning("เลือกอย่างน้อย 1 ช่องทาง"); return; }
    setBusy(true);
    try {
      const r = await apiFetch("/api/marketing/content-plan-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platforms: curSel }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      onPlatformsSaved(curSel);
      toast.success("บันทึกช่องทางแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const addPlatform = async () => {
    const name = newName.trim();
    if (!name) return;
    if (allPlatforms.some((p) => p.label.toLowerCase() === name.toLowerCase())) { toast.warning("มีช่องทางชื่อนี้แล้ว — ติ๊กเลือกได้เลย"); return; }
    setBusy(true);
    try {
      const opt = await createOption("platform", name);
      await onOptionsChanged();
      setOrder((o) => [...o.filter((k) => k !== opt.key), opt.key]);
      setChosen((s) => new Set([...s, opt.key]));
      setNewName("");
      toast.success(`เพิ่มช่องทาง "${name}" แล้ว — กดบันทึกเพื่อใช้ในหน้านี้`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มช่องทางไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const openBrandModal = async () => setBrandModal(await getBrandPlatforms());
  const pushToast = (type: "success" | "error" | "info", m: string) => (type === "error" ? toast.error : type === "success" ? toast.success : toast.info)(m);

  const seg = (on: boolean) => `h-8 rounded-md px-3 text-sm font-medium disabled:opacity-40 ${on ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`;
  const dirty = (tab === "platforms" && platformsDirty && canEdit) || pillarDirty;

  return (
    <>
      <ERPModal open={open} onClose={onClose} title="⚙️ ตั้งค่าหน้าวางแผนคอนเทนต์" size="lg" defaultExpanded={false} hasUnsavedChanges={dirty}
        description={canEdit ? "ตั้งครั้งเดียว ใช้ทั้งทีม" : "คุณดูได้อย่างเดียว — การแก้ต้องมีสิทธิ์ \"ตั้งค่าป้าย SKU การตลาด\""}
        footer={tab === "platforms" && canEdit ? (
          <div className="flex w-full justify-end gap-2">
            <button type="button" onClick={resetFrom} disabled={busy || !platformsDirty} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50 disabled:opacity-40">คืนค่าเดิม</button>
            <button type="button" onClick={() => void savePlatforms()} disabled={busy || !platformsDirty}
              className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">{busy ? "กำลังบันทึก…" : "บันทึกช่องทาง"}</button>
          </div>
        ) : undefined}>
        <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "platforms"} disabled={pillarDirty} onClick={() => setTab("platforms")} className={seg(tab === "platforms")}>📱 ช่องทาง ({curSel.length})</button>
          <button type="button" role="tab" aria-selected={tab === "pillars"} disabled={platformsDirty && canEdit} title={platformsDirty ? "บันทึกช่องทางก่อนสลับแท็บ" : undefined}
            onClick={() => setTab("pillars")} className={seg(tab === "pillars")}>🧭 แนวคอนเทนต์ ({pillars.length})</button>
        </div>

        {tab === "platforms" ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">ติ๊กช่องทางที่ทีมวางแผน — ใช้เป็นแถวในมุมมองสัปดาห์และตัวเลือกในการ์ดไอเดีย · ลาก ⋮⋮ เพื่อเรียงลำดับ</p>
            <div className="space-y-1">
              {order.map((k, i) => {
                const p = byKey.get(k);
                if (!p) return null;
                const on = chosen.has(k);
                return (
                  <div key={k} {...(canEdit ? rowProps(i) : {})}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 data-[drag-over=true]:border-blue-500 data-[drag-over=true]:bg-blue-50 ${dragIdx === i ? "opacity-50" : ""} ${on ? "border-slate-200 bg-white" : "border-dashed border-slate-200 bg-slate-50"}`}>
                    {canEdit && <DragHandle {...handleProps(i)} title="ลากเพื่อเรียงลำดับ" />}
                    <label className="flex flex-1 cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={on} disabled={!canEdit} className="h-4 w-4 rounded border-slate-300"
                        onChange={(e) => setChosen((s) => { const n = new Set(s); if (e.target.checked) n.add(k); else n.delete(k); return n; })} />
                      <PlatformIcon code={p.value} iconKey={p.icon_key ?? p.icon} size={18} />
                      <span className={`text-sm ${on ? "text-slate-800" : "text-slate-400"}`}>{p.label}</span>
                    </label>
                    {!on && <span className="text-[11px] text-slate-400">ไม่โชว์</span>}
                  </div>
                );
              })}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} disabled={busy}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addPlatform(); } }}
                  placeholder="＋ เพิ่มช่องทางใหม่ เช่น YouTube, Pinterest"
                  className="h-9 flex-1 rounded-lg border border-dashed border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="button" onClick={() => void addPlatform()} disabled={busy || !newName.trim()}
                  className="h-9 rounded-lg bg-slate-800 px-3 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-30">เพิ่ม</button>
              </div>
            )}
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              🏷️ แต่ละแบรนด์ลงช่องทางไหนบ้าง — ตอนเลือกแท็บแบรนด์ แถวจะเหลือเฉพาะช่องทางของแบรนด์นั้น
              {canEditBrands && <button type="button" onClick={() => void openBrandModal()} className="ml-2 font-medium text-blue-600 hover:underline">ตั้งค่าต่อแบรนด์ →</button>}
              <span className="mt-1 block text-slate-400">ไอคอน/สีของช่องทาง ตั้งได้ที่ /tasks/settings แท็บแพลตฟอร์ม</span>
            </div>
          </div>
        ) : (
          <LabelListEditor kind="pillar" items={pillars} canEdit={canEdit} onChanged={onPillarsChanged} onDirtyChange={setPillarDirty} />
        )}
      </ERPModal>

      {brandModal && (
        <BrandPlatformsModal brands={brands} initial={brandModal.map} initialFormats={brandModal.formats} pushToast={pushToast}
          onClose={() => setBrandModal(null)} onSaved={(map) => { onBrandPlatformsSaved(map); setBrandModal(null); }} />
      )}
    </>
  );
}
