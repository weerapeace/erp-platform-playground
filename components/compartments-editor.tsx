"use client";

/**
 * 📐 ช่องใส่ของ (ขนาดด้านใน) ของ Parent SKU — ของกลาง ใช้ 3 ที่ หน้าตา/กฎเดียวกัน:
 *   1) ลิ้นชักตั้งค่าเว็บของสินค้า (components/parent-web-listings → แท็บ 🔤 ปั๊มชื่อ · แบนเนอร์ · รายละเอียด) — บันทึกเอง
 *   2) ฟอร์ม Parent SKU หน้า "ดู" (บันทึกเอง) / หน้า "แก้ไข" (ใส่ค่าในฟอร์ม) — ParentCompartmentsField
 * ค่า: null = ยังไม่ได้วัด · [] = ไม่มีช่องใส่ของ (ไม่ใช่กระเป๋า) · [{id,name,name_en,w,h,d,window,area}]
 *   name_en = ชื่อช่องภาษาอังกฤษ (เว็บ /en) · area = กรอบของช่องบนรูป (📍 → components/compartment-area-dialog) ป๊อป 📏 เทียบขนาดบนเว็บวาดเส้นช่องตามนี้
 * ผลคำนวณ "ใส่อะไรได้" สด ๆ จากทะเบียน product_fit_items ที่มีขนาด (ตุ๊กตา/ของ) ด้วยกฎกลาง lib/fit-check
 * บันทึก: PATCH /api/master-v2/parent-skus/<id> (สิทธิ์ products.edit + สิทธิ์รายฟิลด์ + audit ของกลาง)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { compartmentsProblem, fitReport, fitTargetOf, parseCompartments, MAX_COMPARTMENTS, type Compartment, type CompartmentArea, type FitTarget } from "@/lib/fit-check";
import { Icon } from "@/components/icon";
import { CompartmentAreaDialog } from "@/components/compartment-area-dialog";

type Row = { id: string; name: string; name_en: string; w: string; h: string; d: string; window: boolean; area?: CompartmentArea };

const toRows = (c: Compartment[]): Row[] =>
  c.map((x) => ({ id: x.id, name: x.name, name_en: x.name_en ?? "", w: String(x.w), h: String(x.h), d: String(x.d), window: !!x.window, ...(x.area ? { area: x.area } : {}) }));
const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const inputCls = "w-full h-8 rounded-md border border-slate-200 px-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-400";

/** ทะเบียนของที่คำนวณได้ (มีขนาด) — โหลดครั้งเดียวต่อหน้า */
let catalogCache: Promise<FitTarget[]> | null = null;
function loadTargets(): Promise<FitTarget[]> {
  catalogCache ??= apiFetch("/api/master-v2/product_fit_items?limit=500&sort_by=sort_order")
    .then((r) => r.json())
    .then((j) => ((j.data ?? j.rows ?? []) as Parameters<typeof fitTargetOf>[0][]).map((r) => fitTargetOf(r)).filter((x): x is FitTarget => !!x))
    .catch(() => {
      catalogCache = null;
      return [];
    });
  return catalogCache;
}

export function CompartmentsEditor({
  value,
  parentId,
  onSaved,
  onChange,
  canEdit = true,
  outer,
  toggle = false,
  imagesOf,
  coverKey,
}: {
  value: unknown;
  /** มี = บันทึกเองด้วยปุ่มในกล่อง · ไม่มี = ส่งค่าออกทาง onChange (ฟอร์มบันทึกเอง) */
  parentId?: string | null;
  onSaved?: (v: Compartment[] | null) => void;
  onChange?: (v: Compartment[] | null) => void;
  canEdit?: boolean;
  /** ขนาดภายนอก (ไว้เตือนถ้าช่องในใหญ่กว่าตัวกระเป๋า) */
  outer?: { w?: unknown; h?: unknown; d?: unknown } | null;
  /** true = ยังไม่ได้วัด → ย่อเหลือช่องติ๊กบรรทัดเดียว ติ๊กก่อนถึงจะใส่ได้ (ฟอร์ม Parent SKU — เจ้าของขอ "จะได้ไม่รก" 2026-10-17)
   *  ที่มีปุ่มพับ/กางของตัวเองอยู่แล้ว (ลิ้นชักเว็บ แผง 📐) ไม่ต้องเปิด */
  toggle?: boolean;
  /** Parent SKU ที่ใช้หารูปให้ 📍 ชี้ตำแหน่งช่อง (ว่าง = ใช้ parentId) */
  imagesOf?: string | null;
  /** รูปปก (R2 key) ถ้ามีในมือ — ไม่มี = ป๊อปโหลดเอง */
  coverKey?: string | null;
}) {
  const toast = useToast();
  const initial = parseCompartments(value);
  const [state, setState] = useState<"unmeasured" | "none" | "rows">(initial === null ? "unmeasured" : initial.length ? "rows" : "none");
  const [rows, setRows] = useState<Row[]>(toRows(initial ?? []));
  // toggle: กางอยู่ไหม (มีข้อมูลแล้ว = กาง) · แถวที่เพิ่งเอาติ๊กออก เก็บไว้คืนให้ถ้าติ๊กกลับ
  const [open, setOpen] = useState(!toggle || initial !== null);
  const stash = useRef<Row[]>([]);
  const [targets, setTargets] = useState<FitTarget[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [areaIdx, setAreaIdx] = useState<number | null>(null);
  const selfSave = !!parentId && !onChange;

  useEffect(() => {
    let alive = true;
    void loadTargets().then((t) => alive && setTargets(t));
    return () => {
      alive = false;
    };
  }, []);

  // ค่าจากข้างนอกเปลี่ยน (เปิดรุ่นอื่น) → เริ่มใหม่
  // ⚠️ ข้าม "เสียงสะท้อน" ของค่าที่เราเพิ่งส่งออกเอง (ไม่งั้นพิมพ์ไม่ครบแล้วกล่องรีเซ็ตทับ)
  const valueKey = JSON.stringify(parseCompartments(value));
  const lastEmit = useRef<string | null>(null);
  useEffect(() => {
    if (lastEmit.current !== null && valueKey === lastEmit.current) return;
    const p = parseCompartments(value);
    setState(p === null ? "unmeasured" : p.length ? "rows" : "none");
    setRows(toRows(p ?? []));
    setOpen(!toggle || p !== null);
    stash.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey]);

  const problem = state === "rows" ? (rows.length ? compartmentsProblem(rows) : "เพิ่มอย่างน้อย 1 ช่อง หรือกด \"ไม่มีช่องใส่ของ\"") : null;
  // แถวที่ขนาดยังไม่ครบไม่นับ · มีแถวแต่ยังไม่ครบสักแถว = ยังไม่ได้วัด (ไม่ใช่ "ไม่มีช่อง")
  const valueOf = (st: typeof state, rs: Row[]): Compartment[] | null => {
    if (st === "unmeasured") return null;
    if (st === "none") return [];
    const p = parseCompartments(rs) ?? [];
    return p.length ? p : null;
  };
  const current = valueOf(state, rows);
  const dirty = JSON.stringify(current) !== JSON.stringify(initial);

  const outerMax = Math.max(Number(outer?.w) || 0, Number(outer?.h) || 0, Number(outer?.d) || 0);
  const tooBig = outerMax > 0 && (current ?? []).some((c) => Math.max(c.w, c.h, c.d) > outerMax + 0.5);

  const report = useMemo(() => (targets && current?.length ? fitReport(targets, current) : []), [targets, current]);

  const emit = (nextState: typeof state, nextRows: Row[]) => {
    if (!onChange) return;
    const v = valueOf(nextState, nextRows);
    lastEmit.current = JSON.stringify(v);
    onChange(v);
  };
  const setRow = (i: number, p: Partial<Row>) => {
    const next = rows.map((r, j) => (j === i ? { ...r, ...p } : r));
    setRows(next);
    emit("rows", next);
  };
  const addRow = () => {
    const next = [...rows, { id: newId(), name: rows.length ? "" : "ช่องหลัก", name_en: rows.length ? "" : "Main compartment", w: "", h: "", d: "", window: false }];
    setRows(next);
    setState("rows");
    emit("rows", next);
  };
  const removeRow = (i: number) => {
    const next = rows.filter((_, j) => j !== i);
    setRows(next);
    if (!next.length) setState("unmeasured");
    emit(next.length ? "rows" : "unmeasured", next);
  };
  const setNone = () => {
    setState("none");
    setRows([]);
    emit("none", []);
  };
  // ติ๊กออก = กลับเป็น "ยังไม่ได้วัด" (หน้าดูยังต้องกดบันทึกเอง) · ติ๊กกลับ = คืนแถวเดิม
  const setOpenTick = (on: boolean) => {
    setOpen(on);
    if (on) {
      const back = stash.current;
      stash.current = [];
      if (back.length && state === "unmeasured") {
        setRows(back);
        setState("rows");
        emit("rows", back);
      }
      return;
    }
    if (state === "rows" && rows.length) stash.current = rows;
    if (state !== "unmeasured") {
      setState("unmeasured");
      setRows([]);
      emit("unmeasured", []);
    }
  };

  const save = async () => {
    if (!parentId || problem) return;
    setSaving(true);
    try {
      const r = await apiFetch(`/api/master-v2/parent-skus/${parentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ compartments: current }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      toast.success(current === null ? "ล้างขนาดช่องแล้ว" : current.length ? `บันทึก ${current.length} ช่องแล้ว` : "บันทึกว่าไม่มีช่องใส่ของแล้ว");
      onSaved?.(current);
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  };

  const tick = !toggle ? null : canEdit ? (
    <label className="flex w-fit cursor-pointer select-none items-center gap-2 text-sm text-slate-600" data-compartments-toggle
      title="สำหรับกระเป๋า — วัดขนาดด้านในของแต่ละช่อง แล้วระบบบอกเองว่าใส่ตุ๊กตา/ของอะไรได้">
      <input type="checkbox" className="h-4 w-4 shrink-0 accent-orange-500" checked={open} onChange={(e) => setOpenTick(e.target.checked)} />
      <span>{open ? "ใส่ข้อมูลช่องใส่ของ" : "ติ๊กเพื่อใส่ขนาดช่อง"}</span>
    </label>
  ) : !open ? (
    <span className="text-sm text-slate-300">— ยังไม่ได้วัด</span>
  ) : null;

  return (
    <div className="space-y-2" data-compartments>
      {tick}
      {open && (
      <>
      {state === "unmeasured" && (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-800">
          ยังไม่ได้วัดช่องใส่ของ — วัดขนาด<b>ด้านใน</b>ของแต่ละช่อง (ไม่ใช่ขนาดตัวกระเป๋า) แล้วระบบจะบอกเองว่าใส่ตุ๊กตา/ของอะไรได้กี่ชิ้น
          {canEdit && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={addRow} className="h-8 px-3 rounded-lg bg-orange-500 text-white">
                ＋ เพิ่มช่อง
              </button>
              <button type="button" onClick={setNone} className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-slate-700">
                ไม่มีช่องใส่ของ (ไม่ใช่กระเป๋า)
              </button>
            </div>
          )}
        </div>
      )}

      {state === "none" && (
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 flex items-center gap-2 flex-wrap">
          <span className="flex-1">ไม่มีช่องใส่ของ — รุ่นนี้ไม่ขึ้นในหน้าเช็คขนาด</span>
          {canEdit && (
            <button type="button" onClick={addRow} className="h-7 px-2.5 rounded-lg border border-slate-300 bg-white text-slate-700">
              เปลี่ยน: มีช่องใส่ของ
            </button>
          )}
        </div>
      )}

      {state === "rows" && (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_4.2rem_4.2rem_4.2rem_3.6rem_1.8rem] gap-1.5 text-[11px] text-slate-500">
            <span>ชื่อช่อง</span>
            <span className="text-right">กว้าง</span>
            <span className="text-right">สูง</span>
            <span className="text-right">หนา</span>
            <span className="text-center">ช่องใส</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={r.id} className="space-y-1">
            <div className="grid grid-cols-[minmax(0,1fr)_4.2rem_4.2rem_4.2rem_3.6rem_1.8rem] gap-1.5 items-center" data-compartment-row>
              <input aria-label="ชื่อช่อง" className={inputCls} value={r.name} maxLength={40} disabled={!canEdit} placeholder={`เช่น ${i ? "ช่องหน้าใส" : "ช่องหลัก"}`} onChange={(e) => setRow(i, { name: e.target.value })} />
              {(["w", "h", "d"] as const).map((k) => (
                <input key={k} aria-label={{ w: "กว้าง", h: "สูง", d: "หนา" }[k]} className={`${inputCls} text-right`} type="number" inputMode="decimal" step="0.1" min={0} disabled={!canEdit} value={r[k]} placeholder="ซม." onChange={(e) => setRow(i, { [k]: e.target.value })} />
              ))}
              <label className="flex justify-center">
                <input type="checkbox" aria-label="ช่องโชว์ (หน้าใส)" className="w-4 h-4 accent-orange-500" disabled={!canEdit} checked={r.window} onChange={(e) => setRow(i, { window: e.target.checked })} />
              </label>
              {canEdit ? (
                <button type="button" aria-label={`ลบ ${r.name || `ช่องที่ ${i + 1}`}`} onClick={() => removeRow(i)} className="h-7 w-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50">
                  ✕
                </button>
              ) : (
                <span />
              )}
            </div>
            {(canEdit || r.name_en || r.area) && (
              <div className="flex items-center gap-1.5 pb-1" data-compartment-extra>
                <input aria-label="ชื่อช่องภาษาอังกฤษ" className={`${inputCls} h-7 max-w-[14rem] text-xs`} value={r.name_en} maxLength={40} disabled={!canEdit} placeholder="EN เช่น Front pocket" onChange={(e) => setRow(i, { name_en: e.target.value })} />
                <button
                  type="button"
                  onClick={() => setAreaIdx(i)}
                  disabled={!canEdit && !r.area}
                  className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs ${r.area ? "border-pink-200 bg-pink-50 text-pink-700" : "border-dashed border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                  title="ชี้ว่าช่องนี้อยู่ตรงไหนของรูป — ป๊อปเทียบขนาดบนเว็บวาดเส้นช่อง + ขนาดให้ลูกค้าเห็น"
                  data-compartment-area={r.area ? "set" : "none"}
                >
                  <Icon name="pin" /> {r.area ? "ชี้บนรูปแล้ว · แก้" : "ชี้ตำแหน่งบนรูป"}
                </button>
              </div>
            )}
            </div>
          ))}
          {canEdit && rows.length < MAX_COMPARTMENTS && (
            <button type="button" onClick={addRow} className="h-7 px-2.5 rounded-lg border border-dashed border-slate-300 text-xs text-slate-600">
              ＋ เพิ่มช่อง
            </button>
          )}
          <p className="text-[11px] text-slate-400">ขนาดด้านใน หน่วย ซม. · วัดตอนกระเป๋าว่าง · ช่องใส = ช่องโชว์ตุ๊กตาด้านหน้า · 📍 ชี้บนรูป = ป๊อปเทียบขนาดบนเว็บวาดเส้นช่องให้</p>
          {areaIdx !== null && (
            <CompartmentAreaDialog
              open
              onClose={() => setAreaIdx(null)}
              rows={rows}
              index={areaIdx}
              parentId={imagesOf ?? parentId ?? null}
              coverKey={coverKey}
              onApply={(area) => {
                const i = areaIdx;
                const next = rows.map((r, j) => {
                  if (j !== i) return r;
                  const { area: _old, ...rest } = r;
                  void _old;
                  return area ? { ...rest, area } : rest;
                });
                setRows(next);
                emit("rows", next);
              }}
            />
          )}
        </>
      )}

      {problem && (state === "rows" || dirty) && <p className="text-[11px] text-amber-700">{problem}</p>}
      {tooBig && <p className="text-[11px] text-amber-700">⚠️ มีช่องที่ใหญ่กว่าขนาดภายนอกของกระเป๋า — ตรวจตัวเลขอีกครั้ง</p>}

      {state === "rows" && !problem && (
        <div className="rounded-lg bg-slate-50 p-2.5" data-fit-preview>
          <p className="text-[11px] text-slate-500 mb-1.5">ระบบคำนวณให้ (ใส่ได้กี่ชิ้น = ประมาณ)</p>
          {targets === null ? (
            <p className="text-xs text-slate-400">กำลังโหลดรายการตุ๊กตา…</p>
          ) : !report.length ? (
            <p className="text-xs text-slate-400">
              ยังไม่มีตุ๊กตา/ของที่ใส่ขนาดไว้ —{" "}
              <a href="/m/product_fit_items" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                เพิ่มในทะเบียน ↗
              </a>
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {report.map(({ item, result }) => (
                <span
                  key={item.id}
                  title={result ? `${result.compartment.name} · ${item.w}×${item.h}×${item.d} ซม.${item.estimated ? " (ขนาดประมาณ)" : ""}` : `${item.w}×${item.h}×${item.d} ซม.`}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${!result ? "bg-slate-200/70 text-slate-500" : result.status === "roomy" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                  data-fit-chip={result ? result.status : "no"}
                >
                  {!result ? "✕" : result.status === "roomy" ? "✓" : "⚠"} {item.name}
                  {result && ` ×${result.count}`}
                  {result?.status === "snug" && " (แน่น)"}
                  {item.estimated && <span className="opacity-60">*</span>}
                </span>
              ))}
            </div>
          )}
          {report.some((r) => r.item.estimated) && (
            <p className="text-[10px] text-slate-400 mt-1.5">
              * ขนาดตุ๊กตาเป็นค่าประมาณ — วัดของจริงแล้วแก้ที่{" "}
              <a href="/m/product_fit_items" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                ทะเบียน "ใส่อะไรได้บ้าง" ↗
              </a>
            </p>
          )}
        </div>
      )}
      </>
      )}

      {selfSave && canEdit && dirty && (
        <div className="flex items-center gap-2">
          <button type="button" disabled={saving || !!problem} onClick={() => void save()} className="h-8 px-4 rounded-lg bg-orange-500 text-white text-sm disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : "บันทึกช่องใส่ของ"}
          </button>
          <span className="text-[11px] text-slate-400">บันทึกที่ตัวสินค้า (ทุกร้านที่ขายรุ่นนี้เห็นเหมือนกัน)</span>
        </div>
      )}
    </div>
  );
}

/** ฟิลด์ในฟอร์ม Parent SKU (ต่อสาย 2 ที่: app/master/parent-skus/page.tsx + MasterRecordDrawer ใน components/master-crud) */
export function ParentCompartmentsField(p: { value: unknown; mode: "edit" | "view"; onChange?: (v: unknown) => void; onSaved?: (v: unknown) => void; recordId?: string | null; canEdit?: boolean; form?: Record<string, unknown> }) {
  // รูปปกจากฟอร์ม (มี = ป๊อป 📍 ไม่ต้องโหลดเอง)
  const cover = typeof p.form?.cover_image_r2_key === "string" && p.form.cover_image_r2_key ? (p.form.cover_image_r2_key as string) : null;
  return p.mode === "edit" ? (
    <CompartmentsEditor value={p.value} canEdit={p.canEdit} onChange={(v) => p.onChange?.(v)} toggle imagesOf={p.recordId ?? null} coverKey={cover} />
  ) : (
    <CompartmentsEditor value={p.value} parentId={p.recordId ?? null} canEdit={p.canEdit} onSaved={(v) => p.onSaved?.(v)} toggle coverKey={cover} />
  );
}
