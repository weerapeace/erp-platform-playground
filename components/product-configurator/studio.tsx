"use client";

/**
 * 👜 สตูดิโอตัวประกอบสินค้า (/admin/product-configurator) — หลังบ้านของ "ลูกค้าออกแบบสินค้าเอง"
 *
 * ซ้าย  = พรีวิวประกอบรูปจริงตามการเลือก (สลับมุม · ลองเลือกตัวเลือกได้) + ราคารวม + ความครบของรูป
 * ขวา  = แท็บ ข้อมูลทรง · ตัวเลือก · ชั้นรูป · กติกา · แม่แบบ & รูปที่ต้องถ่าย · แบบของลูกค้า
 * ทุกการแก้ = API /api/configurator/* (สิทธิ์ configurator.edit + บันทึกประวัติ) แล้วโหลดข้อมูลทรงใหม่ทั้งก้อน
 * ของกลางที่ใช้: ERPModal · ConfirmDialog · Drawer · ERPForm* · MoneyInput · ColorInput · useDragReorder · useToast · Icon
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { ERPFormField, ERPInput } from "@/components/form";
import { Icon } from "@/components/icon";
import {
  activeSlots, countDesigns, expectedImages, normalizeSelection, normCode, optionsOf, priceOf, VIEW_LABEL,
  type CfgModel, type ConfigData, type ConfigView, type Selection,
} from "@/lib/product-configurator";
import { createRow, fetchBundle, fetchModels, fetchShops, money, runAction, type CfgShop } from "./data";
import { ConfigPreview } from "./preview";
import { ModelPanel } from "./model-panel";
import { OptionsPanel } from "./options-panel";
import { LayersPanel } from "./layers-panel";
import { RulesPanel } from "./rules-panel";
import { TemplatePanel } from "./template-panel";
import { DesignsPanel } from "./designs-panel";

const TABS = [
  { key: "model", label: "ข้อมูลทรง", icon: "settings" },
  { key: "options", label: "ตัวเลือก", icon: "design" },
  { key: "layers", label: "ชั้นรูป", icon: "image" },
  { key: "rules", label: "กติกา", icon: "warning" },
  { key: "template", label: "แม่แบบ & รูปที่ต้องถ่าย", icon: "camera" },
  { key: "designs", label: "แบบของลูกค้า", icon: "bag" },
] as const;
export type StudioTab = (typeof TABS)[number]["key"];

const inp = "h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

/** ตัวเลือกย่อสำหรับลองพรีวิว (ไม่บันทึก) */
function TrySelection({ data, selection, onChange }: { data: ConfigData; selection: Selection; onChange: (s: Selection) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {activeSlots(data).map((slot) => {
        const opts = optionsOf(data, slot);
        const v = selection[slot.code];
        if (slot.kind === "text") {
          return (
            <label key={slot.id} className="col-span-2 grid gap-1 text-xs text-slate-600">{slot.name_th}
              <input className={inp} value={typeof v === "string" ? v : ""} placeholder={String(slot.config?.placeholder ?? "พิมพ์เพื่อลองดู")} onChange={(e) => onChange({ ...selection, [slot.code]: e.target.value })} />
            </label>
          );
        }
        if (slot.kind === "multi") {
          const cur = Array.isArray(v) ? v : [];
          return (
            <div key={slot.id} className="col-span-2 grid gap-1 text-xs text-slate-600">{slot.name_th}
              <div className="flex flex-wrap gap-1">
                {opts.map((o) => {
                  const on = cur.includes(o.code);
                  return <button key={o.id} type="button" onClick={() => onChange({ ...selection, [slot.code]: on ? cur.filter((c) => c !== o.code) : [...cur, o.code] })} className={`rounded-full border px-2 py-0.5 ${on ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600"}`}>{o.name_th}</button>;
                })}
                {opts.length === 0 && <span className="text-slate-400">ยังไม่มีตัวเลือก</span>}
              </div>
            </div>
          );
        }
        return (
          <label key={slot.id} className="grid gap-1 text-xs text-slate-600">{slot.name_th}
            <select className={inp} value={typeof v === "string" ? v : ""} onChange={(e) => onChange({ ...selection, [slot.code]: e.target.value })}>
              {!slot.required && <option value="">— ไม่เลือก —</option>}
              {opts.map((o) => <option key={o.id} value={o.code}>{o.name_th}</option>)}
            </select>
          </label>
        );
      })}
    </div>
  );
}

export function ConfiguratorStudio({ shopId: initialShop, modelId: initialModel, onRoute }: {
  shopId?: string; modelId?: string;
  /** แจ้งหน้าให้จำร้าน/ทรงที่เลือกไว้ใน URL */
  onRoute?: (shopId: string, modelId: string | null) => void;
}) {
  const { can } = useAuth();
  const canEdit = can("configurator.edit");
  const toast = useToast();

  const [shops, setShops] = useState<CfgShop[]>([]);
  const [shopId, setShopId] = useState(initialShop ?? "");
  const [models, setModels] = useState<CfgModel[] | null>(null);
  const [modelId, setModelId] = useState<string | null>(initialModel ?? null);
  const [data, setData] = useState<ConfigData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<StudioTab>("model");
  const [view, setView] = useState<ConfigView>("front");
  const [selection, setSelection] = useState<Selection>({});
  const [focusLayer, setFocusLayer] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newModel, setNewModel] = useState({ code: "", name_th: "" });
  const [busy, setBusy] = useState(false);

  // ร้าน: ไม่ระบุ → IG International (ร้านแรกที่ใช้ระบบนี้) หรือร้านแรก
  useEffect(() => {
    fetchShops().then((rows) => {
      setShops(rows);
      setShopId((cur) => cur || rows.find((s) => s.slug === "ig-international")?.id || rows[0]?.id || "");
    }).catch((e) => setErr(e instanceof Error ? e.message : "โหลดรายชื่อร้านไม่สำเร็จ"));
  }, []);

  const loadModels = useCallback(async (sid: string, prefer?: string | null) => {
    const rows = await fetchModels(sid);
    setModels(rows);
    setModelId((cur) => {
      const want = prefer ?? cur;
      return want && rows.some((m) => m.id === want) ? want : rows[0]?.id ?? null;
    });
  }, []);
  useEffect(() => {
    if (!shopId) return;
    setModels(null); setData(null);
    loadModels(shopId).catch((e) => setErr(e instanceof Error ? e.message : "โหลดทรงไม่สำเร็จ"));
  }, [shopId, loadModels]);

  const reload = useCallback(async () => {
    if (!modelId) { setData(null); return; }
    setLoading(true);
    try {
      const d = await fetchBundle(modelId);
      setData(d);
      setSelection((cur) => normalizeSelection(d, cur).selection);
      setView((v) => (d.model.views.includes(v) ? v : d.model.views[0] ?? "front"));
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดข้อมูลทรงไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [modelId]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { if (shopId) onRoute?.(shopId, modelId); }, [shopId, modelId, onRoute]);

  const trySelect = (s: Selection) => {
    if (!data) return;
    const r = normalizeSelection(data, s);
    setSelection(r.selection);
    if (r.messages.length) toast.info(r.messages.join(" · "));
  };

  const price = useMemo(() => (data ? priceOf(data, selection) : null), [data, selection]);
  const coverage = useMemo(() => {
    if (!data) return null;
    const all = expectedImages(data);
    return { need: all.length, have: all.filter((e) => e.image).length };
  }, [data]);
  const designs = useMemo(() => (data ? countDesigns(data) : null), [data]);

  const afterModelChange = async (id: string | null) => { await loadModels(shopId, id); if (id === modelId) await reload(); };

  const createSample = async () => {
    setBusy(true);
    try { const r = await runAction({ action: "sample", shop_id: shopId }); toast.success("สร้างทรงตัวอย่าง \"กระเป๋าโท้ท\" แล้ว (ปิดไว้ก่อน ลูกค้ายังไม่เห็น)"); await afterModelChange(r.model_id ?? null); }
    catch (e) { toast.error(e instanceof Error ? e.message : "สร้างไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const createBlank = async () => {
    const code = normCode(newModel.code);
    if (!code || !newModel.name_th.trim()) { toast.error("ใส่รหัสทรง (ตัวอังกฤษ) และชื่อทรงก่อน"); return; }
    setBusy(true);
    try {
      const m = await createRow<CfgModel>("models", { shop_id: shopId, code, name_th: newModel.name_th.trim(), views: ["front"], sort_order: ((models?.length ?? 0) + 1) * 10 });
      toast.success(`เพิ่มทรง ${m.name_th} แล้ว — ต่อด้วยแท็บ "ตัวเลือก"`);
      setCreating(false); setNewModel({ code: "", name_th: "" }); setTab("options");
      await afterModelChange(m.id);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  if (err && !data && !models) {
    return <div className="p-6 text-sm text-amber-700">{err} — ต้องเข้าสู่ระบบและมีสิทธิ์ &quot;ดูตัวประกอบสินค้า&quot; (configurator.view)</div>;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800"><Icon name="bag" /> ตัวประกอบสินค้า</h1>
          <p className="text-sm text-slate-500">ให้ลูกค้าเลือกวัสดุ สี อะไหล่ เองบนเว็บ แล้วเห็นรูปสินค้าที่ประกอบจากรูปถ่ายพื้นใสหลายชั้น</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={inp} value={shopId} onChange={(e) => { setShopId(e.target.value); setModelId(null); }} aria-label="ร้าน">
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {models && models.length > 0 && (
            <select className={inp} value={modelId ?? ""} onChange={(e) => setModelId(e.target.value)} aria-label="ทรง">
              {models.map((m) => <option key={m.id} value={m.id}>{m.name_th} ({m.code}){m.is_active ? "" : " · ปิดอยู่"}</option>)}
            </select>
          )}
          {canEdit && <button type="button" onClick={() => setCreating(true)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon name="add" /> เพิ่มทรง</button>}
          {canEdit && <button type="button" disabled={busy || !shopId} onClick={() => void createSample()} className="inline-flex h-9 items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-3 text-sm text-violet-700 hover:bg-violet-100 disabled:opacity-50">สร้างทรงตัวอย่าง (โท้ท)</button>}
        </div>
      </div>

      {models && models.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="text-base font-medium text-slate-700">ร้านนี้ยังไม่มีทรงให้ลูกค้าออกแบบ</div>
          <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">เริ่มจาก &quot;สร้างทรงตัวอย่าง (โท้ท)&quot; จะได้ช่องตัวเลือก ชั้นรูป และกติกาครบชุดตามหน้าตัวอย่าง แล้วค่อยแก้เป็นของจริง หรือกด &quot;เพิ่มทรง&quot; เพื่อเริ่มจากศูนย์</p>
          {!canEdit && <p className="mt-2 text-xs text-amber-700">คุณมีสิทธิ์ดูอย่างเดียว — ขอสิทธิ์ &quot;แก้ตัวประกอบสินค้า&quot; จากแอดมิน</p>}
        </div>
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <aside className="space-y-3 lg:sticky lg:top-2 lg:self-start">
            <div className="flex flex-wrap items-center gap-1">
              {data.model.views.map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} className={`rounded-full px-3 py-1 text-sm ${view === v ? "bg-slate-800 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{VIEW_LABEL[v].th}</button>
              ))}
              <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${data.model.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{data.model.is_active ? "เปิดให้ลูกค้าใช้" : "ปิดอยู่ (ลูกค้ายังไม่เห็น)"}</span>
            </div>
            <ConfigPreview data={data} view={view} selection={selection} focusLayerId={focusLayer} />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 p-2"><div className="text-xs text-slate-500">ราคาแบบที่ลอง</div><div className="text-base font-semibold tabular-nums text-slate-800">{price && price.total > 0 ? money(price.total) : "สอบถามราคา"}</div></div>
              <div className="rounded-lg bg-slate-50 p-2"><div className="text-xs text-slate-500">รูปที่มีแล้ว</div><div className="text-base font-semibold tabular-nums text-slate-800">{coverage ? `${coverage.have}/${coverage.need}` : "—"}</div></div>
              <div className="rounded-lg bg-slate-50 p-2"><div className="text-xs text-slate-500">ประกอบได้</div><div className="text-base font-semibold tabular-nums text-slate-800">{designs ? `${designs.count.toLocaleString("th-TH")}${designs.capped ? "+" : ""}` : "—"} แบบ</div></div>
            </div>
            <details className="rounded-xl border border-slate-200 bg-white p-3" open>
              <summary className="cursor-pointer text-sm font-medium text-slate-700">ลองเลือกเหมือนลูกค้า (ไม่บันทึก)</summary>
              <div className="mt-3"><TrySelection data={data} selection={selection} onChange={trySelect} /></div>
              {price && <p className="mt-2 text-xs text-slate-500">ผลิตประมาณ {price.leadDays}–{price.leadDays + 3} วันทำการ</p>}
            </details>
          </aside>

          <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
            <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2">
              {TABS.map((t) => (
                <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm ${tab === t.key ? "border-violet-500 font-medium text-violet-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                  <Icon name={t.icon} /> {t.label}
                </button>
              ))}
            </div>
            <div className={`p-4 ${loading ? "pointer-events-none opacity-60" : ""}`}>
              {tab === "model" && <ModelPanel data={data} canEdit={canEdit} onSaved={reload} onDeleted={() => void afterModelChange(null)} onDuplicated={(id) => void afterModelChange(id)} />}
              {tab === "options" && <OptionsPanel data={data} canEdit={canEdit} onChanged={reload} />}
              {tab === "layers" && <LayersPanel data={data} canEdit={canEdit} view={view} onView={setView} onChanged={reload} onFocusLayer={setFocusLayer} />}
              {tab === "rules" && <RulesPanel data={data} canEdit={canEdit} onChanged={reload} />}
              {tab === "template" && <TemplatePanel data={data} canEdit={canEdit} view={view} onView={setView} onChanged={reload} />}
              {tab === "designs" && <DesignsPanel data={data} />}
            </div>
          </section>
        </div>
      )}

      <ERPModal open={creating} onClose={() => setCreating(false)} title="เพิ่มทรงใหม่" size="sm" hasUnsavedChanges={!!(newModel.code || newModel.name_th)}
        footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">ยกเลิก</button><button type="button" disabled={busy} onClick={() => void createBlank()} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">เพิ่มทรง</button></div>}>
        <div className="grid gap-3">
          <ERPFormField label="ชื่อทรง" required><ERPInput value={newModel.name_th} onChange={(e) => setNewModel((s) => ({ ...s, name_th: e.target.value }))} placeholder="เช่น กระเป๋าสะพายข้าง" /></ERPFormField>
          <ERPFormField label="รหัสทรง (อังกฤษ ใช้นำหน้าชื่อไฟล์รูป)" required hint={`ชื่อไฟล์จะเป็น ${normCode(newModel.code) || "CROSS"}_FRONT_BODY_….png`}>
            <ERPInput value={newModel.code} onChange={(e) => setNewModel((s) => ({ ...s, code: e.target.value.toUpperCase() }))} placeholder="เช่น CROSS" />
          </ERPFormField>
          <p className="text-xs text-slate-500">ทรงใหม่จะปิดไว้ก่อน ลูกค้ายังไม่เห็น จนกว่าจะกดเปิดในแท็บ &quot;ข้อมูลทรง&quot;</p>
        </div>
      </ERPModal>
    </div>
  );
}
