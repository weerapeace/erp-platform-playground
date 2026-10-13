"use client";

/**
 * ⚙️ ตั้งค่าหน้าวางแผนคอนเทนต์ — เปิดได้จากหัวหน้า และจากในการ์ดไอเดีย
 *   📱 ช่องทาง: เลือกช่องทางที่โชว์ (แถวในมุมมองสัปดาห์ + ตัวเลือกในการ์ด) · ลากเรียงลำดับ · เพิ่มช่องทางใหม่ (เข้ารายการกลาง creative-options)
 *        + ลัดไป "แบรนด์ลงช่องทางไหน" (BrandPlatformsModal ของโมดูลคอนเทนต์ — ตอนเลือกแท็บแบรนด์ แถวจะเหลือเฉพาะช่องทางของแบรนด์นั้น)
 *        + ประเภทการลง (แต่งร้าน / ในสินค้า / Story …) แต่ละประเภทติ๊กช่องทางของตัวเอง — บันทึกพร้อมช่องทาง
 *   🧭 แนวคอนเทนต์: LabelListEditor (kind = pillar)
 *   🎯 เป้ารายเดือน / 🗓️ สล็อตประจำสัปดาห์: ต่อแบรนด์ (plan-targets-slots.tsx)
 *   🔔 รอบเปลี่ยน: อะไรต้องเปลี่ยนทุกกี่วัน ต่อแบรนด์ (plan-refresh.tsx)
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
import { BrandSelect, TargetsEditor, SlotsEditor } from "./plan-targets-slots";
import { RefreshRulesEditor } from "./plan-refresh";
import type { PlacementType } from "@/lib/marketing/content-plan";

export type PlanSettingsTab = "platforms" | "pillars" | "targets" | "slots" | "refresh";

export function PlanSettingsModal({ open, onClose, initialTab = "platforms", allPlatforms, planPlatforms, placementTypes, pillars, brands, defaultBrandId, canEdit, canEditBrands, onPlatformsSaved, onPillarsChanged, onOptionsChanged, onBrandPlatformsSaved, onTargetsChanged, onRefreshChanged }: {
  open: boolean;
  onClose: () => void;
  initialTab?: PlanSettingsTab;
  /** ช่องทางทั้งหมดจากหน้าแพลตฟอร์มกลาง (รวมที่ปิดอยู่ · is_active บอกสถานะ) */
  allPlatforms: PlatformOpt[];
  /** ช่องทางที่ตั้งไว้ให้โชว์ (เรียงแล้ว) · null = ยังไม่ตั้ง (โชว์ทั้งหมด) */
  planPlatforms: string[] | null;
  /** ประเภทการลงที่ใช้อยู่ (ค่าที่บันทึก หรือค่าเริ่มต้น) */
  placementTypes: PlacementType[];
  pillars: MarketingSkuLabel[];
  brands: BrandOption[];
  /** แบรนด์เริ่มต้นของแท็บเป้า/สล็อต (แท็บแบรนด์ที่เปิดอยู่) */
  defaultBrandId?: string | null;
  canEdit: boolean;
  /** แก้ "แบรนด์ลงช่องทางไหน" ได้ (สิทธิ์ของโมดูลคอนเทนต์ tasks.edit) */
  canEditBrands: boolean;
  onPlatformsSaved: (platforms: string[] | null, placements: PlacementType[]) => void;
  onPillarsChanged: () => void;
  /** เพิ่มช่องทางใหม่แล้ว → ให้หน้าโหลดรายการกลางใหม่ */
  onOptionsChanged: () => Promise<void> | void;
  onBrandPlatformsSaved: (map: BrandPlatformMap) => void;
  /** เป้า/สล็อตเปลี่ยน → ให้หน้าแผนโหลดเป้าใหม่ */
  onTargetsChanged: () => void;
  /** รอบเปลี่ยนเปลี่ยน → ให้กล่อง 🔔 ต้องเตรียม โหลดใหม่ */
  onRefreshChanged?: () => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<PlanSettingsTab>(initialTab);
  const [order, setOrder] = useState<string[]>([]);       // ลำดับทุกช่องทาง (ที่เลือก + ไม่เลือก)
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [pillarDirty, setPillarDirty] = useState(false);
  const [brandModal, setBrandModal] = useState<{ map: BrandPlatformMap; formats: BrandFormatMap } | null>(null);
  const [brandId, setBrandId] = useState("");   // แบรนด์ของแท็บเป้า/สล็อต

  // เปิดใหม่ทุกครั้ง → ตั้งจากค่าล่าสุด: ที่เลือกไว้ (ตามลำดับ) ก่อน แล้วต่อด้วยช่องทางที่เหลือ
  const [ptypes, setPtypes] = useState<PlacementType[]>([]);   // ประเภทการลง (กำลังแก้)
  const resetFrom = () => {
    setPtypes(placementTypes.map((t) => ({ ...t, platforms: [...t.platforms] })));
    const keys = allPlatforms.map((p) => p.value);
    const sel = planPlatforms ? planPlatforms.filter((k) => keys.includes(k)) : allPlatforms.filter((p) => p.is_active !== false).map((p) => p.value);
    setOrder([...sel, ...keys.filter((k) => !sel.includes(k))]);
    setChosen(new Set(sel));
  };
  useEffect(() => { if (open) { setTab(initialTab); resetFrom(); setNewName(""); setBrandId(defaultBrandId || brands[0]?.id || ""); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && !brandId && brands[0]) setBrandId(brands[0].id); }, [open, brands, brandId]);
  // ช่องทางสำหรับเป้า/สล็อต = ที่ตั้งให้โชว์ในหน้านี้ (เรียงแล้ว)
  const planPlatformOpts = (planPlatforms ? planPlatforms : allPlatforms.filter((p) => p.is_active !== false).map((p) => p.value)).map((k) => allPlatforms.find((p) => p.value === k)).filter((p): p is PlatformOpt => !!p);
  useEffect(() => { if (open) setOrder((o) => [...o, ...allPlatforms.map((p) => p.value).filter((k) => !o.includes(k))]); }, [allPlatforms, open]);

  const byKey = new Map(allPlatforms.map((p) => [p.value, p]));
  const savedSel = (planPlatforms ?? allPlatforms.filter((p) => p.is_active !== false).map((p) => p.value)).filter((k) => byKey.has(k));
  const curSel = order.filter((k) => chosen.has(k));
  const placementsDirty = JSON.stringify(ptypes) !== JSON.stringify(placementTypes);
  const platformsDirty = JSON.stringify(curSel) !== JSON.stringify(savedSel) || placementsDirty;
  const ptypeError = ptypes.find((t) => !t.label.trim()) ? "ใส่ชื่อประเภทการลงให้ครบ"
    : ptypes.find((t) => t.platforms.length === 0) ? `ประเภท "${ptypes.find((t) => t.platforms.length === 0)!.label}" ยังไม่ได้ติ๊กช่องทาง` : null;
  const setPtype = (i: number, patch: Partial<PlacementType>) => setPtypes((list) => list.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const movePtype = (i: number, dir: -1 | 1) => setPtypes((list) => { const j = i + dir; if (j < 0 || j >= list.length) return list; const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const { rowProps, handleProps, dragIdx } = useDragReorder((from, to) => setOrder((o) => moveItem(o, from, to)));

  const savePlatforms = async () => {
    if (curSel.length === 0) { toast.warning("เลือกอย่างน้อย 1 ช่องทาง"); return; }
    if (ptypeError) { toast.warning(ptypeError); return; }
    setBusy(true);
    try {
      const r = await apiFetch("/api/marketing/content-plan-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platforms: curSel, placements: ptypes }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      onPlatformsSaved(curSel, ptypes);
      toast.success("บันทึกช่องทาง + ประเภทการลงแล้ว");
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
      <ERPModal open={open} onClose={onClose} title="⚙️ ตั้งค่าหน้าวางแผนคอนเทนต์" size="xl" defaultExpanded={false} hasUnsavedChanges={dirty}
        description={canEdit ? "ตั้งครั้งเดียว ใช้ทั้งทีม" : "คุณดูได้อย่างเดียว — การแก้ต้องมีสิทธิ์ \"ตั้งค่าป้าย SKU การตลาด\""}
        footer={tab === "platforms" && canEdit ? (
          <div className="flex w-full justify-end gap-2">
            <button type="button" onClick={resetFrom} disabled={busy || !platformsDirty} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50 disabled:opacity-40">คืนค่าเดิม</button>
            <button type="button" onClick={() => void savePlatforms()} disabled={busy || !platformsDirty}
              className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
          </div>
        ) : undefined}>
        <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "platforms"} disabled={pillarDirty} onClick={() => setTab("platforms")} className={seg(tab === "platforms")}>📱 ช่องทาง ({curSel.length})</button>
          <button type="button" role="tab" aria-selected={tab === "pillars"} disabled={platformsDirty && canEdit} title={platformsDirty ? "บันทึกช่องทางก่อนสลับแท็บ" : undefined}
            onClick={() => setTab("pillars")} className={seg(tab === "pillars")}>🧭 แนวคอนเทนต์ ({pillars.length})</button>
          <button type="button" role="tab" aria-selected={tab === "targets"} disabled={(platformsDirty && canEdit) || pillarDirty} onClick={() => setTab("targets")} className={seg(tab === "targets")}>🎯 เป้ารายเดือน</button>
          <button type="button" role="tab" aria-selected={tab === "slots"} disabled={(platformsDirty && canEdit) || pillarDirty} onClick={() => setTab("slots")} className={seg(tab === "slots")}>🗓️ สล็อตประจำสัปดาห์</button>
          <button type="button" role="tab" aria-selected={tab === "refresh"} disabled={(platformsDirty && canEdit) || pillarDirty} onClick={() => setTab("refresh")} className={seg(tab === "refresh")}>🔔 รอบเปลี่ยน</button>
        </div>

        {tab === "platforms" ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">รายการดึงจากหน้าแพลตฟอร์มกลางครบทุกตัว ({allPlatforms.length}) — ติ๊กช่องทางที่ทีมวางแผน ใช้เป็นแถวในมุมมองสัปดาห์และตัวเลือกในการ์ดไอเดีย · ลาก ⋮⋮ เพื่อเรียงลำดับ</p>
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
                    {p.is_active === false && <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500" title="ปิดอยู่ในหน้าแพลตฟอร์มกลาง — ติ๊กใช้ในแผนได้เลย (ฟอร์มสร้างคอนเทนต์ของทีม Creative จะโชว์เมื่อเปิดในหน้าแพลตฟอร์ม)">ปิดในหน้าแพลตฟอร์ม</span>}
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
            {/* ── ประเภทการลง ── */}
            <div className="border-t border-slate-100 pt-3">
              <div className="mb-1 text-sm font-semibold text-slate-700">ประเภทการลง</div>
              <p className="mb-2 text-xs text-slate-500">แบ่ง "ลงที่ไหน" ในการ์ดไอเดียเป็นประเภท เช่น แต่งร้าน → Shopee/Lazada/TikTok · Story → Facebook/IG (ติ๊กได้เฉพาะช่องทางที่เลือกไว้ด้านบน)</p>
              <div className="space-y-1.5">
                {ptypes.map((t, i) => (
                  <div key={t.key} className="rounded-lg border border-slate-200 px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      {canEdit && (
                        <span className="flex flex-col">
                          <button type="button" onClick={() => movePtype(i, -1)} disabled={i === 0} className="h-3.5 text-[10px] leading-none text-slate-400 hover:text-slate-700 disabled:opacity-20" aria-label="เลื่อนขึ้น">▲</button>
                          <button type="button" onClick={() => movePtype(i, 1)} disabled={i === ptypes.length - 1} className="h-3.5 text-[10px] leading-none text-slate-400 hover:text-slate-700 disabled:opacity-20" aria-label="เลื่อนลง">▼</button>
                        </span>
                      )}
                      <input value={t.icon ?? ""} onChange={(e) => setPtype(i, { icon: e.target.value.slice(0, 8) || null })} disabled={!canEdit} placeholder="🏪" title="ไอคอน (อีโมจิ)"
                        className="h-8 w-10 rounded-md border border-slate-200 text-center text-sm disabled:bg-slate-50" />
                      <input value={t.label} onChange={(e) => setPtype(i, { label: e.target.value.slice(0, 40) })} disabled={!canEdit} placeholder="ชื่อประเภท เช่น แต่งร้าน"
                        className={`h-8 w-36 rounded-md border px-2 text-sm disabled:bg-slate-50 ${t.label.trim() ? "border-slate-200" : "border-red-300"}`} />
                      <div className="flex flex-1 flex-wrap gap-1">
                        {curSel.map((k) => {
                          const p = byKey.get(k);
                          if (!p) return null;
                          const on = t.platforms.includes(k);
                          return (
                            <button key={k} type="button" disabled={!canEdit} onClick={() => setPtypes((list) => list.map((x, j) => (j === i ? { ...x, platforms: x.platforms.includes(k) ? x.platforms.filter((y) => y !== k) : [...x.platforms, k] } : x)))}
                              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ${on ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
                              <PlatformIcon code={p.value} iconKey={p.icon_key ?? p.icon} size={12} />{p.label}
                            </button>
                          );
                        })}
                        {t.platforms.filter((k) => !curSel.includes(k)).map((k) => (
                          <span key={k} className="rounded-md px-1.5 py-0.5 text-xs text-slate-300 line-through" title="ช่องทางนี้ถูกซ่อนด้านบน — ไม่โชว์ในการ์ด">{byKey.get(k)?.label ?? k}</span>
                        ))}
                      </div>
                      {canEdit && <button type="button" onClick={() => setPtypes((list) => list.filter((_, j) => j !== i))} title="ลบประเภท" className="h-8 w-8 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600">🗑</button>}
                    </div>
                  </div>
                ))}
                {canEdit && (
                  <button type="button" onClick={() => setPtypes((list) => [...list, { key: `t${Date.now().toString(36)}`, label: "", icon: null, platforms: [] }])}
                    disabled={ptypes.length >= 20} className="w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-xs text-slate-500 hover:bg-slate-50">＋ เพิ่มประเภทการลง</button>
                )}
                {ptypeError && canEdit && <p className="text-xs text-red-600">{ptypeError}</p>}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">ลบประเภทแล้ว คอนเทนต์ที่เคยเลือกไว้ยังเก็บช่องทางไว้ตามเดิม (โชว์เป็น "ไม่ระบุประเภท")</p>
            </div>

            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              🏷️ แต่ละแบรนด์ลงช่องทางไหนบ้าง — ตอนเลือกแท็บแบรนด์ แถวจะเหลือเฉพาะช่องทางของแบรนด์นั้น
              {canEditBrands && <button type="button" onClick={() => void openBrandModal()} className="ml-2 font-medium text-blue-600 hover:underline">ตั้งค่าต่อแบรนด์ →</button>}
              <span className="mt-1 block text-slate-400">ไอคอน/สีของช่องทาง ตั้งได้ที่ /tasks/settings แท็บแพลตฟอร์ม</span>
            </div>
          </div>
        ) : tab === "pillars" ? (
          <LabelListEditor kind="pillar" items={pillars} canEdit={canEdit} onChanged={onPillarsChanged} onDirtyChange={setPillarDirty} />
        ) : (
          <div className="space-y-3">
            <BrandSelect brands={brands} value={brandId} onChange={setBrandId} />
            {brandId && (tab === "targets"
              ? <TargetsEditor key={`t-${brandId}`} brandId={brandId} platforms={planPlatformOpts} placementTypes={placementTypes} canEdit={canEdit} onChanged={onTargetsChanged} />
              : tab === "refresh"
                ? <RefreshRulesEditor key={`r-${brandId}`} brandId={brandId} platforms={allPlatforms} placementTypes={placementTypes} canEdit={canEdit} onChanged={() => onRefreshChanged?.()} />
                : <SlotsEditor key={`s-${brandId}`} brandId={brandId} platforms={planPlatformOpts} pillars={pillars} canEdit={canEdit} onChanged={onTargetsChanged} />)}
          </div>
        )}
      </ERPModal>

      {brandModal && (
        <BrandPlatformsModal brands={brands} initial={brandModal.map} initialFormats={brandModal.formats} pushToast={pushToast}
          onClose={() => setBrandModal(null)} onSaved={(map) => { onBrandPlatformsSaved(map); setBrandModal(null); }} />
      )}
    </>
  );
}
