"use client";

/**
 * 📚 Design Library — หน้าปรับสูตร (/master/design-library/recipe/[id])
 *
 * รูปแม่แบบ (สลับ รูปจริง / Vector) · กดตรงไหนก็ได้ = เพิ่มจุด → เลือกหมวด → เลือกของ (PickPanel) · ลากจุดย้ายได้
 * ขนาด · สีอะไหล่ทั้งใบ · คำเตือน (กฎห้ามคู่ + วัสดุหมด/เหลือน้อย) · วาดช่อง 4 ฝั่ง (PocketEditor)
 * Prompt 3 ชุด (คัดลอก) · ใบสรุป PDF (/print/design-library/[id]) · รูปที่ได้จาก GPT แยกตามชุดมุม เวอร์ชันซ้อน + ใครอัป
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
import {
  bodyPickOf, buildPrompts, categoryOf, cleanSpec, pickInfo, RENDER_VIEWS, ruleHits, skuIdOf, specSkuIds, stockHits,
  MAX_PINS, type Pin, type Spec,
} from "@/lib/design-library";
import { PickPanel, PickThumb } from "./pick-panel";
import { PocketEditor } from "./pocket-editor";
import { api, img, newId, printHref, thaiDate, tplHref, type Recipe, type RecipeBundle, type Render } from "./shared";

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
  const readOnly = !canEdit;

  const load = useCallback(async () => {
    setErr(null);
    try {
      const d = await api<RecipeBundle>(`/api/design-library/bundle?recipe_id=${id}`);
      setB(d); setSpec(cleanSpec(d.recipe.spec)); setMeta({ name: d.recipe.name ?? "", note: d.recipe.note ?? "" }); setStock(d.stock); setDirty(false);
    } catch (e) { setErr((e as Error).message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  // SKU ที่เพิ่งเลือก → ดึงสต็อกสด
  useEffect(() => {
    if (!spec) return;
    const need = specSkuIds(spec).filter((x) => !(x in stock));
    if (!need.length) return;
    let alive = true;
    api<{ stock: Record<string, number> }>(`/api/design-library/bundle?stock_ids=${need.join(",")}`)
      .then((d) => { if (alive) setStock((p) => ({ ...p, ...d.stock })); }).catch(() => undefined);
    return () => { alive = false; };
  }, [spec, stock]);

  const update = (fn: (s: Spec) => Spec) => { setSpec((s) => (s ? fn(s) : s)); setDirty(true); };
  const setPin = (i: number, p: Pin) => update((s) => ({ ...s, pins: s.pins.map((x, k) => (k === i ? p : x)) }));

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
    window.open(printHref(id), "_blank", "noopener");
  };

  if (err) return <div className="p-6"><ErrorState title="เปิดสูตรไม่สำเร็จ" hint={err} onRetry={() => void load()} /></div>;
  if (!b || !spec) return <div className="p-6"><LoadingState label="กำลังโหลดสูตร…" /></div>;
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
          </div>
        </div>
        <button type="button" onClick={() => void openPrint()} className="h-9 px-3 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center gap-1.5"><Icon value="i:printer" />ใบสรุป PDF</button>
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
            <span className="ml-auto text-[12px] text-slate-500">{spec.pins.length} จุด</span>
          </div>
          <Stage imageKey={vector && t.vector_image_key ? t.vector_image_key : t.image_key} pins={spec.pins} sel={sel} readOnly={readOnly}
            onSelect={setSel}
            onAdd={(x, y) => { if (spec.pins.length >= MAX_PINS) { toast.warning(`เพิ่มได้สูงสุด ${MAX_PINS} จุด`); return; } update((s) => ({ ...s, pins: [...s.pins, { id: newId(), x, y, cat: "", pick: null, note: "" }] })); setSel(spec.pins.length); }}
            onMove={(i, x, y) => setPin(i, { ...spec.pins[i], x, y })} />
          {!readOnly && <p className="text-[12px] text-slate-400 mt-2">กดตรงไหนก็ได้บนรูป = เพิ่มจุด · ลากจุด = ย้ายตำแหน่ง · ตัวเลขบนจุด = เลขเดียวกับใบสรุปและ prompt</p>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 self-start">
          {sel != null && spec.pins[sel] ? (
            <PickPanel key={spec.pins[sel].id} pin={spec.pins[sel]} index={sel} spec={spec} choices={b.choices} stock={stock} readOnly={readOnly}
              onChange={(p) => setPin(sel, p)} onHwColor={(code) => update((s) => ({ ...s, hw_color: code }))}
              onDelete={() => { update((s) => ({ ...s, pins: s.pins.filter((_, k) => k !== sel) })); setSel(null); }} />
          ) : (
            <PinList spec={spec} b={b} stock={stock} onSelect={setSel} readOnly={readOnly} />
          )}
        </div>
      </div>

      {/* ── ขนาด + คำเตือน + หมายเหตุ ── */}
      <div className="grid gap-4 lg:grid-cols-2 mt-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[14px] font-medium text-slate-800 mb-2">ขนาดกระเป๋า (ซม.)</div>
          <div className="grid grid-cols-4 gap-2">
            {(["w", "h", "d", "strap"] as const).map((k) => (
              <label key={k} className="text-[12px] text-slate-500">{{ w: "กว้าง", h: "สูง", d: "หนา", strap: "สายยาว (0 = ไม่มี)" }[k]}
                <input type="number" min={0} step={0.5} disabled={readOnly} value={spec.size[k]} onChange={(e) => update((s) => ({ ...s, size: { ...s.size, [k]: Math.max(0, Number(e.target.value) || 0) } }))}
                  className="mt-1 w-full h-9 px-2 border border-slate-200 rounded-lg text-sm text-slate-800 disabled:bg-slate-50" />
              </label>
            ))}
          </div>
          <label className="block text-[12px] text-slate-500 mt-3">หมายเหตุของสูตร
            <textarea rows={2} disabled={readOnly} value={meta.note} onChange={(e) => { setMeta((m) => ({ ...m, note: e.target.value })); setDirty(true); }}
              className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-800 disabled:bg-slate-50" />
          </label>
        </div>
        <Warnings spec={spec} b={b} stock={stock} />
      </div>

      {/* ── ช่อง ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 mt-4">
        <div className="text-[14px] font-medium text-slate-800 mb-2 flex items-center gap-2"><Icon value="i:ruler-measure" />วาดขนาดช่อง</div>
        <PocketEditor spec={spec} choices={b.choices} readOnly={readOnly} onChange={(pockets) => update((s) => ({ ...s, pockets }))} />
      </section>

      {/* ── Prompt ── */}
      <Prompts spec={spec} b={b} dirty={dirty} />

      {/* ── รูปจาก GPT ── */}
      <Renders recipeId={id} renders={b.renders} canEdit={canEdit} onChanged={(renders) => setB((p) => (p ? { ...p, renders } : p))} />

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

function Prompts({ spec, b, dirty }: { spec: Spec; b: RecipeBundle; dirty: boolean }) {
  const toast = useToast();
  const prompts = useMemo(() => buildPrompts(b.template, spec, b.choices), [b.template, spec, b.choices]);
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("คัดลอก prompt แล้ว"); } catch { toast.error("คัดลอกไม่สำเร็จ — ลองเลือกข้อความแล้วกด Ctrl+C"); }
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 mt-4">
      <div className="text-[14px] font-medium text-slate-800 mb-1 flex items-center gap-2"><Icon value="i:sparkles" />Prompt สำหรับ GPT</div>
      <p className="text-[12px] text-slate-500 mb-2">แนบรูปจากใบสรุป PDF (เส้นชี้ + รูปชิ้นส่วน) ไปพร้อม prompt · เลข [ref N] = เลขจุดบนรูป{dirty ? " · ยังไม่ได้บันทึก — prompt นี้ตามที่แก้อยู่ตอนนี้" : ""}</p>
      <div className="space-y-2">
        {prompts.map((p) => (
          <div key={p.key} className="rounded-lg border border-slate-200 p-2">
            <div className="flex items-center gap-2 mb-1"><span className="text-[13px] font-medium text-slate-700">{p.title}</span>
              <button type="button" onClick={() => void copy(p.text)} className="ml-auto h-7 px-2.5 text-[12px] rounded-md border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-1"><Icon value="i:copy" />คัดลอก</button></div>
            <div className="text-[12px] font-mono text-slate-600 whitespace-pre-wrap break-words">{p.text}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Renders({ recipeId, renders, canEdit, onChanged }: { recipeId: string; renders: Render[]; canEdit: boolean; onChanged: (r: Render[]) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, string>>({});   // view → render id ที่กำลังดู
  const [del, setDel] = useState<Render | null>(null);
  const upload = async (view: string, file: File | undefined) => {
    if (!file) return;
    setBusy(view);
    try {
      const up = await uploadImagesWithDupCheck([file], { folder: "design-library/renders", max: 2400, onError: (_, e) => toast.error(e.message) });
      const key = up?.keys[0]; if (!key) return;
      const r = await api<Render>(`/api/design-library/actions`, { json: { action: "add_render", recipe_id: recipeId, view_key: view, image_key: key } });
      onChanged([r, ...renders]); setOpen((o) => ({ ...o, [view]: r.id })); toast.success(`เก็บรูปเวอร์ชัน ${r.version} แล้ว`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  const remove = async (r: Render) => {
    try { await api(`/api/design-library/renders/${r.id}`, { method: "DELETE" }); onChanged(renders.filter((x) => x.id !== r.id)); toast.success("ลบรูปแล้ว"); }
    catch (e) { toast.error((e as Error).message); }
    setDel(null);
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 mt-4">
      <div className="text-[14px] font-medium text-slate-800 mb-2 flex items-center gap-2"><Icon value="i:photo" />รูปที่ได้จาก GPT (เก็บทุกเวอร์ชัน)</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {RENDER_VIEWS.map((v) => {
          const list = renders.filter((r) => r.view_key === v.key).sort((a, c) => c.version - a.version);
          const cur = list.find((r) => r.id === open[v.key]) ?? list[0];
          return (
            <div key={v.key} className="rounded-lg border border-slate-200 p-2 flex flex-col">
              <div className="text-[13px] font-medium text-slate-700 mb-1">{v.label}</div>
              <div className="aspect-square rounded-md bg-slate-50 overflow-hidden flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {cur ? <a href={img(cur.image_key, 0)} target="_blank" rel="noopener"><img src={img(cur.image_key, 700)} alt="" className="w-full h-full object-contain" /></a> : <span className="text-[12px] text-slate-400">ยังไม่มีรูป</span>}
              </div>
              {cur && <div className="text-[11.5px] text-slate-500 mt-1">v{cur.version} · {cur.created_by_name ?? "—"} · {thaiDate(cur.created_at)}</div>}
              {list.length > 1 && (
                <div className="flex flex-wrap gap-1 mt-1">{list.map((r) => (
                  <button key={r.id} type="button" onClick={() => setOpen((o) => ({ ...o, [v.key]: r.id }))} title={`${r.created_by_name ?? ""} · ${thaiDate(r.created_at)}`}
                    className={`h-6 px-2 text-[11px] rounded-full border ${r.id === cur?.id ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-500"}`}>v{r.version}</button>
                ))}</div>
              )}
              {canEdit && (
                <div className="flex gap-1 mt-2">
                  <label className="flex-1 h-8 text-[12px] rounded-md border border-slate-200 hover:bg-slate-50 inline-flex items-center justify-center gap-1 cursor-pointer">
                    <Icon value="i:upload" />{busy === v.key ? "กำลังอัป…" : "อัปโหลดรูปใหม่"}
                    <input type="file" accept="image/*" className="hidden" disabled={!!busy} onChange={(e) => { void upload(v.key, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  {cur && <button type="button" onClick={() => setDel(cur)} className="h-8 w-8 rounded-md border border-slate-200 text-rose-600 hover:bg-rose-50" aria-label="ลบรูปนี้"><Icon value="i:trash" /></button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && void remove(del)} variant="danger" confirmText="ลบ"
        title={`ลบรูปเวอร์ชัน ${del?.version ?? ""}?`} message="รูปนี้จะหายจากประวัติของสูตร (เวอร์ชันอื่นยังอยู่)" />
    </section>
  );
}
