"use client";

/**
 * 📚 Design Library — หน้าปรับสูตร (/master/design-library/recipe/[id])
 *
 * รูปแม่แบบ (สลับ รูปจริง / Vector) · กดตรงไหนก็ได้ = เพิ่มจุด → เลือกหมวด → เลือกของ (PickPanel) · ลากจุดย้ายได้
 * ขนาด · สีอะไหล่ทั้งใบ · คำเตือน (กฎห้ามคู่ + วัสดุหมด/เหลือน้อย) · วาดช่อง 4 ฝั่ง (PocketEditor)
 * Prompt 3 ชุด (คัดลอก) · ใบสรุป PDF (/print/design-library/[id]) · รูปที่ได้จาก GPT แยกตามชุดมุม เวอร์ชันซ้อน + ใครอัป
 * ชุดสี (รอบ 5): ColorwayBar สลับชุดสี → รูป/จุด/prompt/รูป GPT/ใบสรุป ทั้งหน้าแสดงตามชุดสีที่เลือก · แก้จุดตอนอยู่ชุดสีอื่น = เก็บเป็นของชุดสีนั้น
 * เปลี่ยนเป็นสินค้าจริง (รอบ 5 ช่วง 4): ToProductModal ตรวจความพร้อม → พาไปตัวสร้าง SKU / สร้างสูตร BOM เดิมของใบงาน (ไม่เขียนข้อมูลเอง)
 * ส่งเป็นใบงานออกแบบ (รอบ 5 ช่วง 3): SendToSheetModal (ใบใหม่ / ใบเดิม / ใบอื่น) · ป้ายลิงก์ใบงานใต้ชื่อสูตร
 * ทุนประมาณ (รอบ 5 ช่วง 2): CostPanel เฉพาะ products.cost.view · ใบสั่งทำตัวอย่างให้ช่าง /print/design-library/[id]/techpack (แม่แบบเอกสาร dl_techpack)
 * บันทึกด้วย SaveBar กลาง (ถามก่อนออกถ้ายังไม่บันทึก) → POST /api/design-library/actions save_recipe
 * สิทธิ์: ดู design_library.view · แก้ design_library.edit (ไม่มีสิทธิ์ = ดูอย่างเดียว)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import Link from "next/link";
import { usePermission } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { askLeaveUnsaved } from "@/components/modal/ask-dialog";
import { SaveBar } from "@/components/save-bar";
import { ErrorState, LoadingState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { uploadImagesWithDupCheck } from "@/components/duplicate-upload";
import { useFileDrop } from "@/components/file-drop";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import {
  allSkuIds, applyColorway, bodyPickOf, categoryOf, chosenRenders, cleanSpec, colorwayLabel, pickInfo, RENDER_VIEWS, ruleHits, setColorwayPick, sizeKnown, skuIdOf, stockHits, toStudioParams,
  MAX_PINS, type Pin, type Spec,
} from "@/lib/design-library";
import { PATTERN_SCHEMA } from "@/lib/pattern-project";
import { apiFetch } from "@/lib/api";
import { PickPanel, PickThumb } from "./pick-panel";
import { PocketEditor } from "./pocket-editor";
import { HandleFields } from "./template-form";
import { ColorwayBar, ColorwayTable } from "./colorways";
import { CostPanel } from "./cost-panel";
import type { MaterialInfo } from "@/lib/design-library-cost";
import { LenInput, UnitToggle, useLenUnit } from "./units";
import { SendToSheetModal, sheetHref } from "./send-to-sheet";
import { ToProductModal } from "./to-product";
import { PromptsPanel } from "./prompts-panel";
import { api, compareHref, img, newId, printHref, techpackHref, thaiDate, tplHref, type Recipe, type RecipeBundle, type Render } from "./shared";

export function RecipeEditor({ id }: { id: string }) {
  const toast = useToast();
  const canEdit = usePermission("design_library.edit");
  const [b, setB] = useState<RecipeBundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [meta, setMeta] = useState({ name: "", note: "" });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [vector, setVector] = useState(false);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [materials, setMaterials] = useState<Record<string, MaterialInfo>>({});
  const canCost = usePermission("products.cost.view");
  const [sending, setSending] = useState(false);
  const canSheet = usePermission("products.edit");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [cw, setCw] = useState<string | null>(null);   // ชุดสีที่กำลังดู/แก้ (null = สีหลัก)
  const canManage = usePermission("design_library.manage");
  const unit = useLenUnit();
  const readOnly = !canEdit;

  const load = useCallback(async () => {
    setErr(null);
    try {
      const d = await api<RecipeBundle>(`/api/design-library/bundle?recipe_id=${id}`);
      setB(d); setSpec(cleanSpec(d.recipe.spec)); setMeta({ name: d.recipe.name ?? "", note: d.recipe.note ?? "" }); setStock(d.stock); setMaterials(d.materials ?? {}); setDirty(false);
    } catch (e) { setErr((e as Error).message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  // SKU ที่เพิ่งเลือก → ดึงสต็อกสด
  useEffect(() => {
    if (!spec) return;
    const need = allSkuIds(spec).filter((x) => !(x in stock));
    if (!need.length) return;
    let alive = true;
    api<{ stock: Record<string, number>; materials?: Record<string, MaterialInfo> }>(`/api/design-library/bundle?stock_ids=${need.join(",")}`)
      .then((d) => { if (alive) { setStock((p) => ({ ...p, ...d.stock })); setMaterials((p) => ({ ...p, ...(d.materials ?? {}) })); } }).catch(() => undefined);
    return () => { alive = false; };
  }, [spec, stock]);

  const update = (fn: (s: Spec) => Spec) => { setSpec((s) => (s ? fn(s) : s)); setDirty(true); };
  const setPin = (i: number, p: Pin) => update((s) => ({ ...s, pins: s.pins.map((x, k) => (k === i ? p : x)) }));
  /** สูตรตามชุดสีที่เลือก — ทุกส่วนของหน้า (รูป/จุด/คำเตือน/prompt) ใช้ตัวนี้ */
  const view = useMemo(() => (spec ? applyColorway(spec, cw) : null), [spec, cw]);
  /** แก้จุดจากแผงเลือก: ตำแหน่ง/หมวด/โน้ต = ของจุดเอง (ทุกชุดสี) · ของที่เลือก = ของชุดสีที่กำลังแก้ */
  const editPin = (i: number, p: Pin) => {
    if (!cw) { setPin(i, p); return; }
    update((s) => {
      const base = s.pins[i]; if (!base) return s;
      const moved = { ...s, pins: s.pins.map((x, k) => (k === i ? { ...p, pick: base.pick } : x)) };
      const curPick = applyColorway(s, cw).pins[i]?.pick ?? null;
      return JSON.stringify(curPick) === JSON.stringify(p.pick) ? moved : setColorwayPick(moved, cw, base.id, p.pick);
    });
  };

  const save = async () => {
    if (!spec) return;
    setSaving(true);
    try {
      const r = await api<Recipe>(`/api/design-library/actions`, { json: { action: "save_recipe", id, spec, name: meta.name, note: meta.note } });
      setB((p) => (p ? { ...p, recipe: { ...p.recipe, ...r, spec: cleanSpec(r.spec) } } : p));
      setDirty(false); toast.success("บันทึกสูตรแล้ว");
      return true;
    } catch (e) { toast.error((e as Error).message); return false; }
    finally { setSaving(false); }
  };
  const discard = () => { if (!b) return; setSpec(cleanSpec(b.recipe.spec)); setMeta({ name: b.recipe.name ?? "", note: b.recipe.note ?? "" }); setDirty(false); setSel(null); };
  const openPrint = async () => {
    if (dirty && !(await save())) return;
    window.open(printHref(id, cw), "_blank", "noopener");
  };
  const openSendSheet = async () => {
    if (dirty && !(await save())) return;
    setSheetOpen(true);
  };
  const openTechpack = async () => {
    if (dirty && !(await save())) return;
    window.open(techpackHref(id, cw), "_blank", "noopener");
  };
  /** สร้างแพทเทิร์นใหม่ในสตูดิโอ: เก็บขนาดไว้ใน template.dl_draft → สตูดิโอเปิดตัวสร้างจากแม่แบบพร้อมค่านี้ให้ตรวจก่อนวาง */
  const sendToStudio = async () => {
    if (!b || !spec) return;
    if (!sizeKnown(spec.size)) { toast.warning("ใส่ขนาด กว้าง สูง หนา ให้ครบก่อน — สตูดิโอแพทเทิร์นต้องใช้ขนาดจริงตัดชิ้น"); return; }
    if (dirty && !(await save())) return;
    setSending(true);
    try {
      const params = toStudioParams(spec);
      const notice = `ขนาดจาก Design Library ${b.template.code} สูตร #${b.recipe.seq} — ตรวจและเลือกทรงให้ตรงก่อนวาง (แม่แบบในสตูดิโอเริ่มจากทรงโท้ท${spec.pockets.front.length > 1 ? " · ส่งช่องด้านหน้าได้ช่องแรกช่องเดียว" : ""})`;
      const res = await apiFetch("/api/pattern-projects", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${b.template.code} สูตร #${b.recipe.seq}${b.recipe.name ? ` ${b.recipe.name}` : ""}`.slice(0, 120), template: { schema: PATTERN_SCHEMA, dl_draft: { params, notice, recipe_id: id } } }) });
      const j = await res.json().catch(() => ({}));
      if (res.status === 403) throw new Error("คุณยังไม่มีสิทธิ์สร้างแพทเทิร์นในสตูดิโอแพทเทิร์น — ขอผู้ดูแลเพิ่มสิทธิ์ให้");
      if (!res.ok || j.error || !j.data?.id) throw new Error(j.error || "สร้างแพทเทิร์นไม่สำเร็จ กรุณาลองใหม่");
      toast.success("สร้างแพทเทิร์นแล้ว — กำลังเปิดสตูดิโอ");
      window.open(`/pattern-studio/${j.data.id}`, "_blank", "noopener");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSending(false); }
  };

  if (err) return <div className="p-6"><ErrorState title="เปิดสูตรไม่สำเร็จ" hint={err} onRetry={() => void load()} /></div>;
  if (!b || !spec || !view) return <div className="p-6"><LoadingState label="กำลังโหลดสูตร…" /></div>;
  const t = b.template;

  return (
    <div className="p-4 sm:p-6 pb-24 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link href={tplHref(t.id)} onClick={async (e) => { if (dirty) { e.preventDefault(); if (await askLeaveUnsaved()) window.location.href = tplHref(t.id); } }}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50" aria-label="กลับไปแม่แบบ"><Icon value="i:arrow-left" /></Link>
        <div className="min-w-0 mr-auto">
          <div className="text-[12px] text-slate-500 font-mono">{t.code} · {t.name}</div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-800">สูตร #{b.recipe.seq}</h1>
            <input value={meta.name} disabled={readOnly} onChange={(e) => { setMeta((m) => ({ ...m, name: e.target.value })); setDirty(true); }} placeholder="ตั้งชื่อสูตร (ไม่บังคับ)"
              className="h-8 px-2 border border-transparent hover:border-slate-200 focus:border-indigo-300 rounded-md text-[14px] min-w-0 w-56 bg-transparent" />
            {b.sheet && (
              <a href={sheetHref(b.sheet.id)} target="_blank" rel="noopener" title={`ใบงานออกแบบที่ส่งสูตรนี้ไป: ${b.sheet.name}`}
                className="h-7 px-2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[12px] inline-flex items-center gap-1 hover:bg-emerald-100 shrink-0">
                <Icon value="i:clipboard-list" />ใบงาน {b.sheet.code}<Icon value="i:external-link" />
              </a>
            )}
          </div>
        </div>
        <Link href={compareHref(id)} className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5"><Icon value="i:arrows-exchange" />เทียบสูตร</Link>
        <button type="button" disabled={sending} onClick={() => void sendToStudio()}
          title="สร้างแพทเทิร์นใหม่ในสตูดิโอแพทเทิร์นจากขนาดของสูตรนี้ (ได้ชิ้นตัด + 3D) — ต้องมีสิทธิ์แก้สตูดิโอแพทเทิร์น"
          className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5"><Icon value="i:vector-bezier" />{sending ? "กำลังส่ง…" : "ส่งเข้าสตูดิโอแพทเทิร์น"}</button>
        {canEdit && canSheet && (
          <button type="button" onClick={() => void openSendSheet()} title="สร้างใบงานออกแบบใหม่ หรือแนบเข้าใบที่มีอยู่ พร้อมรูป GPT · หมุดวัสดุ · ตารางสี · ทุนประมาณ"
            className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5"><Icon value="i:clipboard-list" />ส่งเป็นใบงาน</button>
        )}
        <button type="button" onClick={() => setProductOpen(true)} title="ตรวจความพร้อม แล้วพาไปสร้าง SKU + สูตร BOM ผ่านใบงานออกแบบ"
          className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5"><Icon value="i:dna" />เปลี่ยนเป็นสินค้าจริง</button>
        <button type="button" onClick={() => void openTechpack()} title="ใบสำหรับช่างทำตัวอย่าง: ขนาด วัสดุ+จำนวน ช่อง ตารางสี ช่องเซ็น (ไม่มีราคา/prompt) — แก้หน้าตาได้ที่หน้าแม่แบบเอกสาร"
          className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5"><Icon value="i:scissors" />ใบสั่งทำตัวอย่าง</button>
        <button type="button" onClick={() => void openPrint()} className="h-9 px-3 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center gap-1.5"><Icon value="i:printer" />ใบสรุป PDF{spec.colorways.length ? ` · ${colorwayLabel(spec, cw)}` : ""}</button>
      </div>

      {/* ── ชุดสี ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 mb-4">
        <ColorwayBar spec={spec} active={cw} readOnly={readOnly} renderCount={(c) => b.renders.filter((r) => (r.colorway_id ?? null) === c).length}
          onActive={(c) => setCw(c)} onChange={(colorways) => update((s) => ({ ...s, colorways }))} />
        {cw && <p className="text-[12px] text-indigo-700 mt-2">กำลังแก้ “{colorwayLabel(spec, cw)}” — เลือกของที่จุดไหน จะเปลี่ยนเฉพาะชุดสีนี้ · ย้ายจุด/เปลี่ยนหมวด/โน้ต มีผลทุกชุดสี</p>}
        {spec.colorways.length > 0 && <div className="mt-3"><ColorwayTable spec={spec} choices={b.choices} active={cw} readOnly={readOnly}
          onOpen={(c, i) => { setCw(c); setSel(i); }} onChange={(s) => update(() => s)} /></div>}
        {!spec.colorways.length && !readOnly && <p className="text-[12px] text-slate-400 mt-2">ทรงเดิมหลายสี? กด “เพิ่มชุดสี” แล้วเปลี่ยนเฉพาะจุดที่ต่าง (ผ้า ซิป ด้าย สีอะไหล่) — ใบสรุป prompt และรูป GPT แยกตามชุดสีได้</p>}
      </div>

      {/* ── รูป + จุด | แผงเลือก ── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-3 self-start">
          <div className="flex items-center gap-2 mb-2">
            {t.vector_image_key ? (
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                <button type="button" onClick={() => setVector(false)} className={`h-8 px-3 text-[13px] ${!vector ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}>รูปจริง</button>
                <button type="button" onClick={() => setVector(true)} className={`h-8 px-3 text-[13px] border-l border-slate-200 ${vector ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}>Vector</button>
              </div>
            ) : <span className="text-[12px] text-slate-400">แม่แบบนี้ยังไม่มีรูป Vector</span>}
            <span className="ml-auto text-[12px] text-slate-500">{spec.colorways.length > 0 && <b className="text-indigo-700 font-medium mr-2">{colorwayLabel(spec, cw)}</b>}{spec.pins.length} จุด</span>
          </div>
          <Stage imageKey={vector && t.vector_image_key ? t.vector_image_key : t.image_key} pins={view.pins} sel={sel} readOnly={readOnly}
            onSelect={setSel}
            onAdd={(x, y) => { if (spec.pins.length >= MAX_PINS) { toast.warning(`เพิ่มได้สูงสุด ${MAX_PINS} จุด`); return; } update((s) => ({ ...s, pins: [...s.pins, { id: newId(), x, y, cat: "", pick: null, note: "" }] })); setSel(spec.pins.length); }}
            onMove={(i, x, y) => setPin(i, { ...spec.pins[i], x, y })} />
          {!readOnly && <p className="text-[12px] text-slate-400 mt-2">กดตรงไหนก็ได้บนรูป = เพิ่มจุด · ลากจุด = ย้ายตำแหน่ง · ตัวเลขบนจุด = เลขเดียวกับใบสรุปและ prompt</p>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 self-start">
          {sel != null && spec.pins[sel] ? (
            <PickPanel key={`${spec.pins[sel].id}-${cw ?? "main"}`} pin={view.pins[sel]} index={sel} spec={view} choices={b.choices} stock={stock} readOnly={readOnly}
              onChange={(p) => editPin(sel, p)} onHwColor={(code) => update((s) => (cw ? { ...s, colorways: s.colorways.map((c) => (c.id === cw ? { ...c, hw_color: code } : c)) } : { ...s, hw_color: code }))}
              onDelete={() => { update((s) => ({ ...s, pins: s.pins.filter((_, k) => k !== sel) })); setSel(null); }} />
          ) : (
            <PinList spec={view} b={b} stock={stock} onSelect={setSel} readOnly={readOnly} />
          )}
        </div>
      </div>

      {/* ── ขนาด + คำเตือน + หมายเหตุ ── */}
      <div className="grid gap-4 lg:grid-cols-2 mt-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2 mb-2"><span className="text-[14px] font-medium text-slate-800">ขนาดกระเป๋า</span><span className="ml-auto"><UnitToggle unit={unit.unit} set={unit.set} /></span></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(["w", "h", "d", "strap"] as const).map((k) => (
              <label key={k} className="text-[12px] text-slate-500 block">{{ w: "กว้าง", h: "สูง", d: "หนา", strap: "สายยาว (ว่าง = ไม่มี)" }[k]}
                <LenInput optional cm={spec.size[k]} unit={unit.unit} disabled={readOnly} onChange={(v) => update((s) => ({ ...s, size: { ...s.size, [k]: v } }))} className="mt-1" />
              </label>
            ))}
          </div>
          <div className="mt-3"><HandleFields handle={spec.handle} unit={unit.unit} disabled={readOnly} onChange={(h) => update((s) => ({ ...s, handle: h }))} /></div>
          <label className="block text-[12px] text-slate-500 mt-3">หมายเหตุของสูตร
            <textarea rows={2} disabled={readOnly} value={meta.note} onChange={(e) => { setMeta((m) => ({ ...m, note: e.target.value })); setDirty(true); }}
              className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-800 disabled:bg-slate-50" />
          </label>
        </div>
        <Warnings spec={view} b={b} stock={stock} />
      </div>

      {/* ── ช่อง ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 mt-4">
        <div className="text-[14px] font-medium text-slate-800 mb-2 flex items-center gap-2"><Icon value="i:ruler-measure" />วาดขนาดช่อง</div>
        <PocketEditor spec={spec} choices={b.choices} readOnly={readOnly} unit={unit.unit} onChange={(pockets) => update((s) => ({ ...s, pockets }))} />
      </section>

      {/* ── ทุนประมาณ (เฉพาะสิทธิ์ดูต้นทุน) ── */}
      {canCost && b.can_cost && (
        <CostPanel spec={view} cost={spec.cost} choices={b.choices} materials={materials} calcRows={b.calc ?? []} skuIds={allSkuIds(spec)}
          colorway={spec.colorways.length ? colorwayLabel(spec, cw) : null} readOnly={readOnly} onChange={(cost) => update((s) => ({ ...s, cost }))} />
      )}

      {/* ── Prompt ── */}
      <PromptsPanel template={b.template} spec={view} choices={b.choices} dirty={dirty} colorway={spec.colorways.length ? colorwayLabel(spec, cw) : null}
        readOnly={readOnly} onChange={(p) => update((s) => ({ ...s, prompts: p }))} />

      {/* ── รูปจาก GPT ── */}
      <Renders recipeId={id} renders={b.renders.filter((r) => (r.colorway_id ?? null) === cw)} allRenders={b.renders} colorwayId={cw} colorway={spec.colorways.length ? colorwayLabel(spec, cw) : null} canEdit={canEdit} canManage={canManage} vectorKey={t.vector_image_key}
        onChanged={(renders) => setB((p) => (p ? { ...p, renders } : p))}
        onVector={(key) => setB((p) => (p ? { ...p, template: { ...p.template, vector_image_key: key } } : p))} />

      <ToProductModal open={productOpen} onClose={() => setProductOpen(false)} spec={spec} choices={b.choices} sheet={b.sheet}
        canSend={canEdit && canSheet} onSend={() => { setProductOpen(false); void openSendSheet(); }} />
      <SendToSheetModal open={sheetOpen} onClose={() => setSheetOpen(false)} recipeId={id}
        defaultName={`${t.name} · ${meta.name.trim() || `สูตร #${b.recipe.seq}`}`} linked={b.sheet}
        colorwayId={cw} colorwayName={spec.colorways.length ? colorwayLabel(spec, cw) : null} colorwayCount={spec.colorways.length + 1}
        renderCount={b.renders.length} canCost={canCost && b.can_cost}
        onSent={(s) => setB((p) => (p ? { ...p, sheet: p.sheet?.id === s.id ? p.sheet : { id: s.id, code: s.code, name: s.name, is_active: true, status: "design", parent_sku_codes: [] }, recipe: { ...p.recipe, design_sheet_id: s.id } } : p))} />
      {canEdit && <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onDiscard={discard} />}
    </div>
  );
}

/** รูป + จุด (พิกัด % ของรูป) — กดที่ว่างเพิ่มจุด · ลากจุดย้าย (ขยับ < 4px = กดเลือก) */
function Stage({ imageKey, pins, sel, readOnly, onSelect, onAdd, onMove }: {
  imageKey: string | null; pins: Pin[]; sel: number | null; readOnly: boolean;
  onSelect: (i: number) => void; onAdd: (x: number, y: number) => void; onMove: (i: number, x: number, y: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ i: number; sx: number; sy: number; moved: boolean } | null>(null);
  const pct = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)) * 10) / 10, y: Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)) * 10) / 10 };
  };
  const pinDown = (e: RPointerEvent, i: number) => {
    e.stopPropagation();
    if (readOnly) { onSelect(i); return; }
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { i, sx: e.clientX, sy: e.clientY, moved: false };
  };
  const pinMove = (e: RPointerEvent) => {
    const d = drag.current; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
    d.moved = true; const p = pct(e); onMove(d.i, p.x, p.y);
  };
  const pinUp = () => { const d = drag.current; drag.current = null; if (d && !d.moved) onSelect(d.i); };
  return (
    <div ref={box} className="relative select-none" style={{ cursor: readOnly ? "default" : "crosshair", touchAction: "none" }}
      onClick={(e) => { if (readOnly || (e.target as Element).closest("[data-pin]")) return; const p = pct(e); onAdd(p.x, p.y); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {imageKey ? <img src={img(imageKey, 1400)} alt="แม่แบบ" draggable={false} className="w-full block" /> : <div className="h-72 bg-slate-50" />}
      {pins.map((p, i) => (
        <button key={p.id} type="button" data-pin onPointerDown={(e) => pinDown(e, i)} onPointerMove={pinMove} onPointerUp={pinUp}
          className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border text-[12px] font-semibold flex items-center justify-center ${i === sel ? "w-8 h-8 ring-4 ring-indigo-400/60" : "w-7 h-7"} ${p.pick || p.cat ? "bg-amber-400 border-amber-900 text-amber-950" : "bg-white border-slate-400 text-slate-600"}`}
          style={{ left: `${p.x}%`, top: `${p.y}%`, cursor: readOnly ? "pointer" : "grab" }} aria-label={`จุดที่ ${i + 1}`}>
          {i + 1}
        </button>
      ))}
    </div>
  );
}

function PinList({ spec, b, stock, onSelect, readOnly }: { spec: Spec; b: RecipeBundle; stock: Record<string, number>; onSelect: (i: number) => void; readOnly: boolean }) {
  const body = bodyPickOf(spec);
  if (!spec.pins.length) return <div className="text-[13px] text-slate-500 py-6 text-center">{readOnly ? "สูตรนี้ยังไม่มีจุด" : "กดบนรูปตรงส่วนที่อยากเปลี่ยน เพื่อเพิ่มจุดแรก"}</div>;
  return (
    <div>
      <div className="text-[14px] font-medium text-slate-800 mb-2">สิ่งที่เลือกทั้งหมด</div>
      <div className="space-y-1.5">
        {spec.pins.map((p, i) => {
          const info = pickInfo(p.pick, { bodyPick: body }); const sid = skuIdOf(p.pick);
          return (
            <button key={p.id} type="button" onClick={() => onSelect(i)} className="w-full flex items-center gap-2 rounded-lg border border-slate-200 hover:border-indigo-300 p-1.5 text-left">
              <span className="w-6 h-6 rounded-full bg-amber-400 text-amber-950 text-[12px] font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
              <PickThumb pick={p.pick} spec={spec} choices={b.choices} cat={p.cat} size={40} />
              <span className="min-w-0 flex-1 text-[13px]">
                <span className="block text-slate-500 text-[11.5px]">{categoryOf(b.choices, p.cat)?.name ?? "ยังไม่เลือกหมวด"}</span>
                <span className="block truncate text-slate-800">{info.code ? `${info.code} · ` : ""}{info.name || "—"}</span>
                {p.note && <span className="block truncate text-[11.5px] text-slate-500">Note. {p.note}</span>}
              </span>
              {sid && stock[sid] !== undefined && stock[sid] < 10 && <span className={`text-[11px] px-1.5 rounded ${stock[sid] <= 0 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{stock[sid] <= 0 ? "หมด" : `เหลือ ${stock[sid]}`}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Warnings({ spec, b, stock }: { spec: Spec; b: RecipeBundle; stock: Record<string, number> }) {
  const rules = ruleHits(spec, b.choices);
  const st = stockHits(spec, stock);
  const items = [
    ...rules.map((r) => ({ tone: "warn", text: `กฎทีม: ${r.reason}` })),
    ...st.out.map((h) => ({ tone: "bad", text: `จุด ${h.pinIndex + 1} ${h.code} หมดสต็อก` })),
    ...st.low.map((h) => ({ tone: "warn", text: `จุด ${h.pinIndex + 1} ${h.code} เหลือน้อย (${h.onHand})` })),
    ...spec.pins.map((p, i) => (!p.cat ? { tone: "info", text: `จุด ${i + 1} ยังไม่เลือกหมวด` } : !p.pick && !p.note ? { tone: "info", text: `จุด ${i + 1} ยังไม่ได้เลือกของ` } : null)).filter(Boolean) as { tone: string; text: string }[],
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[14px] font-medium text-slate-800 mb-2 flex items-center gap-2"><Icon value="i:alert-triangle" />ตรวจก่อนส่ง</div>
      {items.length === 0 ? <div className="text-[13px] text-emerald-700 flex items-center gap-1.5"><Icon value="i:circle-check" />ไม่มีอะไรต้องแก้</div> : (
        <ul className="space-y-1">{items.map((x, i) => (
          <li key={i} className={`text-[13px] px-2 py-1 rounded ${x.tone === "bad" ? "bg-rose-50 text-rose-700" : x.tone === "warn" ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600"}`}>{x.text}</li>
        ))}</ul>
      )}
    </div>
  );
}

/**
 * รูปจาก GPT (รอบ 6): แกลเลอรีเดียว ไม่แยกมุม — ลากวาง / Ctrl+V / เลือกหลายรูป · แยกตามชุดสีที่ดูอยู่
 * ⭐ ติดดาว = รูปที่ใช้ในใบสั่งทำตัวอย่าง / ส่งใบงาน / ปกการ์ด (ไม่มีดาว = รูปล่าสุด — chosenRenders) · รูปเก่าที่เคยแยกมุมยังอยู่ครบ (ป้ายมุมเดิม)
 */
function Renders({ recipeId, renders, allRenders, colorwayId, colorway, canEdit, canManage, vectorKey, onChanged, onVector }: {
  recipeId: string; renders: Render[]; allRenders: Render[]; colorwayId: string | null; colorway: string | null; canEdit: boolean; canManage: boolean; vectorKey: string | null;
  onChanged: (r: Render[]) => void; onVector: (key: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgressState | null>(null);
  const [del, setDel] = useState<Render | null>(null);
  const list = useMemo(() => [...renders].sort((a, c) => c.created_at.localeCompare(a.created_at)), [renders]);
  const used = useMemo(() => new Set(chosenRenders(renders, colorwayId).map((r) => r.id)), [renders, colorwayId]);
  const starred = list.filter((r) => r.is_starred).length;

  const upload = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length || busy) return;
    setBusy(true);
    let added: Render[] = [];
    try {
      const up = await uploadImagesWithDupCheck(imgs, { folder: "design-library/renders", max: 2400, onError: (_, e) => toast.error(e.message), onProgress: setProgress });
      for (const key of up?.keys ?? []) {
        const r = await api<Render>(`/api/design-library/actions`, { json: { action: "add_render", recipe_id: recipeId, view_key: "other", image_key: key, colorway_id: colorwayId } });
        added = [r, ...added];
      }
      if (added.length) { onChanged([...added, ...allRenders]); toast.success(`เพิ่มรูปแล้ว ${added.length} รูป`); }
    } catch (e) { toast.error((e as Error).message); if (added.length) onChanged([...added, ...allRenders]); }
    finally { setBusy(false); setProgress(null); }
  };
  const drop = useFileDrop((files) => void upload(files), { accept: "image/", disabled: !canEdit || busy, onReject: () => toast.error("วางได้เฉพาะไฟล์รูป") });
  const onPaste = (e: React.ClipboardEvent) => {
    if (!canEdit) return;
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault(); void upload(files);
  };
  const star = async (r: Render) => {
    const next = !r.is_starred;
    onChanged(allRenders.map((x) => (x.id === r.id ? { ...x, is_starred: next } : x)));
    try { await api(`/api/design-library/renders/${r.id}`, { method: "PATCH", json: { is_starred: next } }); }
    catch (e) { toast.error((e as Error).message); onChanged(allRenders); }
  };
  const setVector = async (r: Render) => {
    try { await api(`/api/design-library/actions`, { json: { action: "set_template_vector", render_id: r.id } }); onVector(r.image_key); toast.success("ตั้งเป็นรูป Vector ของแม่แบบแล้ว — ปุ่มสลับ รูปจริง/Vector ใช้รูปนี้"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const remove = async (r: Render) => {
    try { await api(`/api/design-library/renders/${r.id}`, { method: "DELETE" }); onChanged(allRenders.filter((x) => x.id !== r.id)); toast.success("ลบรูปแล้ว"); }
    catch (e) { toast.error((e as Error).message); }
    setDel(null);
  };
  const viewLabel = (k: string) => (k === "other" ? null : RENDER_VIEWS.find((v) => v.key === k)?.label ?? null);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 mt-4" {...drop.guard}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-[14px] font-medium text-slate-800 flex items-center gap-2"><Icon value="i:photo" />รูปจาก GPT{colorway && <span className="text-indigo-700 font-normal">· {colorway}</span>}</span>
        <span className="text-[12px] text-slate-500">{list.length} รูป{starred ? ` · ติดดาว ${starred}` : ""}</span>
        {canEdit && (
          <label className="ml-auto h-8 px-3 text-[12.5px] rounded-lg border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer">
            <Icon value="i:upload" />{busy ? "กำลังอัป…" : "เลือกรูป"}
            <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          </label>
        )}
      </div>
      <p className="text-[12px] text-slate-500 mb-2">ติดดาวรูปที่จะใช้ในใบสั่งทำตัวอย่าง / ส่งใบงาน / ปกการ์ด — ไม่ติดดาวเลย = ใช้รูปล่าสุด</p>
      {progress && <UploadProgress {...progress} className="mb-2" />}
      <div {...drop.zone("gallery")} onPaste={onPaste} tabIndex={canEdit ? 0 : -1}
        className={`grid gap-2 grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${drop.over === "gallery" ? "ring-2 ring-indigo-400 bg-indigo-50/40" : ""}`}>
        {list.map((r) => (
          <div key={r.id} className={`group relative rounded-lg border overflow-hidden bg-slate-50 ${used.has(r.id) ? "border-amber-300" : "border-slate-200"}`}>
            <a href={img(r.image_key, 0)} target="_blank" rel="noopener" className="block aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img(r.image_key, 500)} alt="" className="w-full h-full object-contain" loading="lazy" />
            </a>
            <button type="button" disabled={!canEdit} onClick={() => void star(r)} title={r.is_starred ? "เอาดาวออก" : "ติดดาว (ใช้รูปนี้ในใบ)"} aria-pressed={!!r.is_starred}
              className={`absolute top-1 right-1 h-7 w-7 rounded-full inline-flex items-center justify-center bg-white/90 border ${r.is_starred ? "border-amber-300 text-amber-500" : "border-slate-200 text-slate-400 hover:text-amber-500"} disabled:cursor-default`}>
              <Icon value="i:star" />
            </button>
            <div className="px-1.5 py-1 text-[11px] text-slate-500 flex items-center gap-1 bg-white">
              <span className="truncate">{r.created_by_name ?? "—"} · {thaiDate(r.created_at)}</span>
              {viewLabel(r.view_key) && <span className="shrink-0 px-1 rounded bg-slate-100 text-slate-500" title="รูปเก่าที่เคยแยกมุม">{viewLabel(r.view_key)}</span>}
            </div>
            {r.image_key === vectorKey && <div className="px-1.5 pb-1 text-[11px] text-emerald-700 bg-white">รูป Vector ของแม่แบบ</div>}
            {canEdit && (
              <div className="absolute top-1 left-1 hidden group-hover:flex group-focus-within:flex gap-1">
                {canManage && r.image_key !== vectorKey && (
                  <button type="button" onClick={() => void setVector(r)} title="ตั้งเป็นรูป Vector ของแม่แบบ (รูปลายเส้น)" className="h-7 w-7 rounded-full bg-white/90 border border-slate-200 text-indigo-700 inline-flex items-center justify-center"><Icon value="i:vector-bezier" /></button>
                )}
                <button type="button" onClick={() => setDel(r)} title="ลบรูปนี้" className="h-7 w-7 rounded-full bg-white/90 border border-slate-200 text-rose-600 inline-flex items-center justify-center"><Icon value="i:trash" /></button>
              </div>
            )}
          </div>
        ))}
        {canEdit ? (
          <label className="aspect-square rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:bg-slate-50 flex flex-col items-center justify-center gap-1 text-center text-[12px] cursor-pointer px-2">
            <Icon value="i:upload" />ลากรูปมาวาง<br />หรือคลิกตรงนี้แล้วกด Ctrl+V
            <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          </label>
        ) : list.length === 0 && <div className="col-span-full text-center text-[12px] text-slate-400 py-6">ยังไม่มีรูปของชุดสีนี้</div>}
      </div>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && void remove(del)} variant="danger" confirmText="ลบ"
        title="ลบรูปนี้?" message="รูปนี้จะหายจากแกลเลอรีของสูตร (รูปอื่นยังอยู่)" />
    </section>
  );
}
