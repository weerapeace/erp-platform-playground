"use client";
/**
 * 🧷 TrimsModal — หน้าต่าง "ซิปและอะไหล่" ของสตูดิโอแพทเทิร์น (เจ้าของสั่ง 2026-11-11 "ส่งซิปและอะไหล่ไปตีราคา")
 *   ของที่ไม่ใช่ชิ้นตัด แต่ต้องอยู่ในต้นทุน — ใส่จำนวนต่อกระเป๋า 1 ใบ แล้วไปกับปุ่ม "ส่งไปตีราคา" (1 วัสดุ = 1 บรรทัด)
 *     1) ซิป — ขึ้นให้เองจากกระดาน: ช่องเจาะ (เส้นในชนิด "ช่องเจาะ (ซิป)") + ขอบที่ติ๊ก "ติดซิปตามขอบนี้" → เลือกซิป + เผื่อปลาย · ความยาวตามกระดานเสมอ
 *     2) กุ๊น / หุ้มขอบ — รวมความยาวขอบที่ติ๊ก "กุ้นขอบ" + ตะเข็บชนิด "หุ้มขอบ" ทั้งใบ → เลือกเทปกุ๊น + เผื่อเพิ่ม
 *     3) อะไหล่ / สาย / ซิปอื่น — เพิ่มเอง: วัสดุคิดตามยาว = ยาวต่อเส้น × จำนวน · วัสดุนับชิ้น = จำนวน
 *     4) รวมต่อกระเป๋า 1 ใบ (ตามวัสดุ) = สิ่งที่จะไปเป็นบรรทัดตีราคา
 *   วัสดุ = รายการวัสดุตีราคาเดียวกับของชิ้น — เฉพาะกลุ่มที่คิด "ตามความยาว" หรือ "นับชิ้น" (ซิป · สาย/เทป · อะไหล่)
 *   แก้ = ส่ง onChange ทันที (หน้าแก้แพทเทิร์นเก็บลง template.trims แล้วบันทึกพร้อมแพทเทิร์น) · สูตรทั้งหมด = lib/pattern-trims
 *
 *   <TrimsModal open onClose={…} pieces={pieces} seams={seams} trims={trims} materials={[{ id, name, group, calc }]} onChange={setTrims} readonly={!canEdit} />
 * ใช้ที่: app/pattern-studio/[id]/editor · คู่มือ: docs/pattern-studio.md
 */
import { useMemo, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { SearchableSelect } from "@/components/searchable-select";
import { StepInput } from "@/components/step-input";
import { BIND_MAX_EXTRA, MAX_TRIMS, TRIM_MAX_EXTRA, TRIM_MAX_LEN, TRIM_MAX_QTY, ZIP_EXTRA_DEFAULT, bindRuns, hwCounts, slitList, trimModeOf, trimRows, trimTotals, zipEdgeList, type ProjectTrim, type TrimMode, type TrimRow } from "@/lib/pattern-trims";
import type { ProjectPiece } from "@/lib/pattern-project";
import type { Seam } from "@/lib/pattern-seams";

export type TrimMaterial = { id: string; name: string; group: string | null; calc?: string | null };
const f1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString("th-TH", { maximumFractionDigits: 1 });
const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function TrimsModal({ open, onClose, pieces, seams = [], trims, materials, onChange, readonly = false }: {
  open: boolean;
  onClose: () => void;
  /** ชิ้นล่าสุดบนกระดาน (อ่านช่องเจาะ · ค่าของขอบ · จำนวนตัด) */
  pieces: ProjectPiece[];
  /** ตะเข็บล่าสุด (ตะเข็บชนิด "หุ้มขอบ" นับเป็นความยาวกุ๊น) */
  seams?: Seam[];
  trims: ProjectTrim[];
  /** วัสดุตีราคา (ชื่อ + ชนิด + วิธีคิดของกลุ่ม — ไม่มีราคา) */
  materials: TrimMaterial[];
  onChange: (next: ProjectTrim[]) => void;
  readonly?: boolean;
}) {
  const t = useT();
  const usable = useMemo(() => materials.flatMap((m) => { const mode = trimModeOf(m.calc); return mode ? [{ ...m, mode }] : []; }), [materials]);
  const lenOptions = useMemo(() => usable.filter((m) => m.mode === "length").map((m) => ({ value: m.id, label: m.name, sub: m.group ?? undefined })), [usable]);
  const allOptions = useMemo(() => usable.map((m) => ({ value: m.id, label: m.name, sub: `${m.group ?? ""}${m.group ? " · " : ""}${m.mode === "length" ? t("คิดตามความยาว", "by length") : t("นับชิ้น", "by count")}` })), [usable, t]);
  const slits = useMemo(() => slitList(pieces), [pieces]);
  const zipEdges = useMemo(() => zipEdgeList(pieces), [pieces]);
  const runs = useMemo(() => bindRuns(pieces, seams), [pieces, seams]);
  const placed = useMemo(() => hwCounts(pieces), [pieces]);
  const countOptions = useMemo(() => usable.filter((m) => m.mode === "count").map((m) => ({ value: m.id, label: m.name, sub: m.group ?? undefined })), [usable]);
  const rows = useMemo(() => trimRows(trims, pieces, seams), [trims, pieces, seams]);
  const totals = useMemo(() => trimTotals(rows), [rows]);
  const manual = rows.filter((r) => !r.trim.src && !r.trim.edge && !r.trim.bind && !r.trim.hw), gone = rows.filter((r) => r.gone);
  const bindRow = rows.find((r) => r.trim.bind && !r.gone) ?? null, hasBind = runs.edges + runs.seams > 0;
  const full = trims.length >= MAX_TRIMS;

  const patch = (id: string, p: Partial<ProjectTrim>) => onChange(trims.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id: string) => onChange(trims.filter((x) => x.id !== id));
  const matOf = (id: string) => { const m = usable.find((x) => x.id === id); return m ? { id: m.id, name: m.name, mode: m.mode as TrimMode } : null; };
  const add = (matId: string, extra: Partial<ProjectTrim>) => { const mat = matOf(matId); if (mat && !full) onChange([...trims, { id: newId(), mat, qty: 1, ...extra }]); };
  const unit = (mode: TrimMode) => (mode === "length" ? t("เส้น", "pcs") : t("ตัว", "pcs"));
  const head = "text-xs font-medium text-slate-600", box = "rounded-lg border border-slate-200 bg-white", line = "flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2";
  const del = (id: string, name: string) => !readonly && (
    <button type="button" onClick={() => remove(id)} aria-label={t(`เอา ${name} ออก`, `Remove ${name}`)} title={t("เอาออกจากรายการ", "Remove from the list")}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon value="i:x" className="text-sm" /></button>
  );
  const chip = (name: string) => <span className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-800" title={name}><Icon value="i:link" className="text-xs" />{name}</span>;
  const picker = (placeholder: string, onPick: (v: string) => void, none: string) => (readonly ? <span className="text-xs text-amber-600">{none}</span>
    : <div className="w-64 max-w-full"><SearchableSelect value="" options={lenOptions} disabled={!lenOptions.length || full} placeholder={placeholder} onChange={onPick} /></div>);
  const extraInput = (row: TrimRow, label: string, aria: string, max: number, fallback: number) => (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">{label}
      <StepInput value={row.trim.extra ?? fallback} step={0.5} min={0} max={max} unit={t("ซม.", "cm")} disabled={readonly} className="h-8 w-28" ariaLabel={aria} onChange={(v) => patch(row.trim.id, { extra: v ?? 0 })} />
    </label>
  );
  const qtyInput = (row: TrimRow) => (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">{t("จำนวน", "Qty")}
      <StepInput value={row.trim.qty} step={1} min={1} max={TRIM_MAX_QTY} integer unit={unit(row.mode)} disabled={readonly} className="h-8 w-28"
        ariaLabel={t(`จำนวน ${row.label}`, `Quantity ${row.label}`)} onChange={(v) => patch(row.trim.id, { qty: Math.max(1, Math.round(v ?? 1)) })} />
    </label>
  );
  const sum = (row: TrimRow) => <span className="text-xs tabular-nums text-slate-700" data-row-total>{t(`= ${f1(row.each ?? 0)} ซม.${row.qty > 1 ? ` × ${row.qty} = ${f1(row.total)} ซม.` : ""}`, `= ${f1(row.each ?? 0)} cm${row.qty > 1 ? ` × ${row.qty} = ${f1(row.total)} cm` : ""}`)}</span>;
  const titleOf = (main: string, sub: string): ReactNode => <div className="min-w-[150px] flex-1"><div className="font-medium text-slate-800">{main}</div><div className="text-xs text-slate-500">{sub}</div></div>;

  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="pattern-trims-modal"
      title={t("ซิปและอะไหล่", "Zips and hardware")}
      description={t("ของที่ไม่ใช่ชิ้นตัดแต่ต้องอยู่ในต้นทุน: ซิป กุ๊น สาย/เทป ห่วง ล็อก หมุด — ใส่จำนวนต่อกระเป๋า 1 ใบ แล้วไปพร้อมชิ้นตอนกด ส่งไปตีราคา (1 วัสดุ = 1 บรรทัด)", "Things that are not cut pieces but belong in the cost: zips, binding, tapes, rings, locks, rivets — enter the amount per bag; they go to costing with the pieces (one line per material)")}
      footer={<div className="flex w-full items-center justify-between gap-3">
        <span className="text-xs text-slate-500">{readonly ? "" : t("รายการนี้บันทึกพร้อมแพทเทิร์น — ปิดแล้วกด บันทึก ที่แถบด้านล่าง", "This list is saved with the pattern — close, then press Save in the bar below")}</span>
        <button type="button" onClick={onClose} className="h-9 rounded-lg bg-slate-800 px-4 text-sm text-white hover:bg-slate-900">{t("ปิด", "Close")}</button>
      </div>}>
      <div className="space-y-5 text-sm" data-trims>
        {!usable.length && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{t("ยังไม่มีวัสดุกลุ่ม ซิป / สาย-เทป / อะไหล่ ในรายการวัสดุตีราคา (กลุ่มที่คิดตามความยาวหรือนับชิ้น) — เพิ่มวัสดุในหน้าวัสดุตีราคาของใบงานออกแบบก่อน", "No zip / tape / hardware materials in the costing material list yet (groups priced by length or by count) — add them on the design-sheet costing materials page first")}</p>
        )}

        {/* 1) ซิป: ช่องเจาะ + ตามขอบ */}
        <section className="space-y-1.5">
          <div className={head}>{t(`1. ซิป (ช่องเจาะ ${slits.length} ช่อง · ตามขอบ ${zipEdges.length} ขอบ)`, `1. Zips (${slits.length} slits · ${zipEdges.length} edges)`)}</div>
          {slits.length + zipEdges.length > 0 && (
            <ul className={`${box} divide-y divide-slate-100`}>
              {slits.map((s) => {
                const row = rows.find((r) => r.trim.src?.pid === s.pid && r.trim.src.line === s.line);
                return (
                  <li key={`${s.pid}/${s.line}`} data-slit={`${s.pid}/${s.line}`} className={line}>
                    {titleOf(`${s.piece} · ${s.label}`, t(`ช่องยาว ${f1(s.len)} ซม.${s.count > 1 ? ` × ตัด ${s.count} ชิ้น` : ""}`, `Slit ${f1(s.len)} cm${s.count > 1 ? ` × ${s.count} pieces` : ""}`))}
                    {row ? <>{chip(row.trim.mat.name)}{extraInput(row, t("เผื่อปลาย", "End allowance"), t(`เผื่อปลายซิป ${s.piece}`, `Zip end allowance ${s.piece}`), TRIM_MAX_EXTRA, ZIP_EXTRA_DEFAULT)}{sum(row)}{del(row.trim.id, row.trim.mat.name)}</>
                      : picker(t("เลือกซิปของช่องนี้", "Choose the zip for this slit"), (v) => add(v, { extra: ZIP_EXTRA_DEFAULT, src: { pid: s.pid, line: s.line } }), t("ยังไม่เลือกซิป", "No zip chosen"))}
                  </li>
                );
              })}
              {zipEdges.map((e) => {
                const row = rows.find((r) => r.trim.edge?.pid === e.pid && r.trim.edge.i === e.i);
                return (
                  <li key={`${e.pid}#${e.i}`} data-zipedge={`${e.pid}#${e.i}`} className={line}>
                    {titleOf(`${e.piece} · ${e.label}`, e.full != null ? t(`ซิปตามขอบ · ช่วง ${f1(e.len)} ซม. ของขอบยาว ${f1(e.full)} ซม.`, `Zip along part of the edge · ${f1(e.len)} of ${f1(e.full)} cm`) : t(`ซิปตามขอบ · ขอบยาว ${f1(e.len)} ซม.`, `Zip along the edge · edge ${f1(e.len)} cm`))}
                    {row ? <>{chip(row.trim.mat.name)}{extraInput(row, t("เผื่อ", "Allowance"), t(`เผื่อซิป ${e.piece} ${e.label}`, `Zip allowance ${e.piece} ${e.label}`), TRIM_MAX_EXTRA, 0)}{qtyInput(row)}{sum(row)}{del(row.trim.id, row.trim.mat.name)}</>
                      : picker(t("เลือกซิปของขอบนี้", "Choose the zip for this edge"), (v) => add(v, { extra: 0, edge: { pid: e.pid, i: e.i } }), t("ยังไม่เลือกซิป", "No zip chosen"))}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-slate-400">{t("ช่องซิป: ปุ่ม เพิ่มช่อง บนกระดาน หรือวาดเส้นในชนิด ช่องเจาะ (ซิป) · ซิปตามขอบ (เช่น ซิปปากกระเป๋า): ถือเครื่องมือ แก้ตะเข็บ (B) กดขอบ แล้วติ๊ก ติดซิปตามขอบนี้ — ซิป 1 เส้นที่ติดกับขอบของ 2 ชิ้น ให้ติ๊กขอบเดียว", "Zip slits: Add pocket on the board, or draw an inner line of kind Slit (zip) · Zip along an edge (e.g. the mouth zip): with the Edit sewing tool (B), click the edge and tick Zip along this edge — for one zip joining two pieces, tick only one edge")}</p>
          {gone.map((r) => (
            <div key={r.trim.id} className="flex items-center justify-between gap-2 rounded-md bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
              <span>{t(`${r.trim.mat.name}: ${r.trim.hw ? "ไม่มีอะไหล่ชนิดนี้บนชิ้นแล้ว" : r.trim.bind ? "ไม่มีขอบกุ๊นเหลือแล้ว" : r.trim.edge ? "ขอบนี้เลิกติดซิปแล้ว" : "ช่องของซิปเส้นนี้ถูกลบไปแล้ว"} — แถวนี้จะหายตอนบันทึก`, `${r.trim.mat.name}: its source on the board is gone — this row goes away on save`)}</span>{del(r.trim.id, r.trim.mat.name)}
            </div>
          ))}
        </section>

        {/* 2) กุ๊น / หุ้มขอบ */}
        <section className="space-y-1.5">
          <div className={head}>{t("2. กุ๊น / หุ้มขอบ", "2. Binding")}</div>
          {!hasBind ? (
            <p className="text-[13px] text-slate-400">{t("ยังไม่มีขอบที่กุ๊น — ถือเครื่องมือ แก้ตะเข็บ (B) กดขอบ แล้วติ๊ก กุ้นขอบ หรือตั้งวิธีเย็บของตะเข็บเป็น หุ้มขอบ", "No bound edges yet — with the Edit sewing tool (B), click an edge and tick Bound edge, or set a seam's method to Bound seam")}</p>
          ) : (
            <div className={`${box} ${line}`} data-bind>
              {titleOf(t("เทปกุ๊นทั้งใบ", "Binding tape, whole bag"), t(`${runs.edges > 0 ? `ขอบกุ๊น ${runs.edges} ขอบ` : ""}${runs.edges > 0 && runs.seams > 0 ? " + " : ""}${runs.seams > 0 ? `ตะเข็บหุ้มขอบ ${runs.seams} แนว` : ""} = ${f1(runs.total)} ซม.`, `${runs.edges} bound edges + ${runs.seams} bound seams = ${f1(runs.total)} cm`))}
              {bindRow ? <>{chip(bindRow.trim.mat.name)}{extraInput(bindRow, t("เผื่อเพิ่มรวม", "Extra in total"), t("เผื่อเพิ่มของกุ๊น", "Extra binding"), BIND_MAX_EXTRA, 0)}<span className="text-xs tabular-nums text-slate-700" data-row-total>{t(`= ${f1(bindRow.total)} ซม.`, `= ${f1(bindRow.total)} cm`)}</span>{del(bindRow.trim.id, bindRow.trim.mat.name)}</>
                : picker(t("เลือกเทปกุ๊น", "Choose the binding tape"), (v) => add(v, { extra: 0, bind: true }), t("ยังไม่เลือกเทปกุ๊น", "No binding tape chosen"))}
            </div>
          )}
        </section>

        {/* อะไหล่ที่วางบนชิ้น (นับจากกระดาน) */}
        {placed.length > 0 && (
          <section className="space-y-1.5">
            <div className={head}>{t(`อะไหล่ที่วางบนชิ้น (${placed.length} ชนิด) — นับจากกระดาน`, `Hardware placed on pieces (${placed.length} kinds) — counted from the board`)}</div>
            <ul className={`${box} divide-y divide-slate-100`}>
              {placed.map((h) => {
                const row = rows.find((r) => r.trim.hw === h.hw && !r.gone);
                return (
                  <li key={h.hw} data-hw-row={h.hw} className={line}>
                    {titleOf(t(h.th, h.en), t(`วางบนชิ้นรวม ${h.count} ตัว (นับจำนวนตัดของชิ้นแล้ว)`, `${h.count} placed in total (piece counts included)`))}
                    {row ? <>{chip(row.trim.mat.name)}<span className="text-xs tabular-nums text-slate-700" data-row-total>{t(`= ${row.total} ตัว`, `= ${row.total} pcs`)}</span>{del(row.trim.id, row.trim.mat.name)}</>
                      : readonly ? <span className="text-xs text-amber-600">{t("ยังไม่เลือกวัสดุ", "No material chosen")}</span>
                      : <div className="w-64 max-w-full"><SearchableSelect value="" options={countOptions} disabled={!countOptions.length || full} placeholder={t("เลือกวัสดุของอะไหล่นี้", "Choose the material for this hardware")} onChange={(v) => add(v, { hw: h.hw })} /></div>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* 3) อะไหล่ / สาย / ซิปอื่น */}
        <section className="space-y-1.5">
          <div className={head}>{t(`3. อะไหล่ / สาย / ซิปอื่น (${manual.length} รายการ)`, `3. Hardware / tapes / other zips (${manual.length})`)}</div>
          {manual.length > 0 && (
            <ul className={`${box} divide-y divide-slate-100`}>
              {manual.map((r) => (
                <li key={r.trim.id} data-trim={r.trim.id} className={line}>
                  <div className="min-w-[150px] flex-1">
                    <div className="truncate font-medium text-slate-800" title={r.trim.mat.name}>{r.trim.mat.name}</div>
                    <input type="text" value={r.trim.name ?? ""} maxLength={60} disabled={readonly} placeholder={t("ใช้ตรงไหน เช่น ห่วงหู (ไม่ใส่ก็ได้)", "Where it goes, e.g. handle ring (optional)")}
                      aria-label={t(`ใช้ตรงไหน: ${r.trim.mat.name}`, `Where used: ${r.trim.mat.name}`)}
                      onChange={(e) => patch(r.trim.id, { name: e.target.value || undefined })}
                      className="mt-0.5 h-7 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-blue-400 disabled:bg-slate-50" />
                  </div>
                  {r.mode === "length" && (
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">{t("ยาวต่อเส้น", "Length each")}
                      <StepInput value={r.trim.len ?? null} step={1} min={0.1} max={TRIM_MAX_LEN} unit={t("ซม.", "cm")} disabled={readonly} className="h-8 w-28" placeholder="0"
                        ariaLabel={t(`ยาวต่อเส้น ${r.trim.mat.name}`, `Length each ${r.trim.mat.name}`)} onChange={(v) => patch(r.trim.id, { len: v && v > 0 ? v : undefined })} />
                    </label>
                  )}
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">{t("จำนวน", "Qty")}
                    <StepInput value={r.trim.qty} step={1} min={1} max={TRIM_MAX_QTY} integer unit={unit(r.mode)} disabled={readonly} className="h-8 w-28"
                      ariaLabel={t(`จำนวน ${r.trim.mat.name}`, `Quantity ${r.trim.mat.name}`)} onChange={(v) => patch(r.trim.id, { qty: Math.max(1, Math.round(v ?? 1)) })} />
                  </label>
                  {r.mode === "length" && (r.total > 0
                    ? <span className="text-xs tabular-nums text-slate-700">{t(`= ${f1(r.total)} ซม.`, `= ${f1(r.total)} cm`)}</span>
                    : <span className="text-xs text-amber-600">{t("ยังไม่ใส่ความยาว", "No length yet")}</span>)}
                  {del(r.trim.id, r.trim.mat.name)}
                </li>
              ))}
            </ul>
          )}
          {!readonly && (
            <div className="w-80 max-w-full" data-trim-add><SearchableSelect value="" options={allOptions} disabled={!allOptions.length || full}
              placeholder={full ? t(`ครบ ${MAX_TRIMS} รายการแล้ว`, `Limit of ${MAX_TRIMS} reached`) : t("＋ เพิ่ม ซิป / สาย / อะไหล่", "＋ Add a zip / tape / hardware")} onChange={(v) => add(v, {})} /></div>
          )}
        </section>

        {/* 4) รวมต่อกระเป๋า 1 ใบ */}
        <section className="space-y-1.5">
          <div className={head}>{t("4. รวมต่อกระเป๋า 1 ใบ (จะไปเป็นบรรทัดตีราคา)", "4. Total per bag (becomes the costing lines)")}</div>
          {!totals.length ? <p className="text-[13px] text-slate-400">{t("ยังไม่มีรายการ", "Nothing yet")}</p> : (
            <ul className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px]" data-trim-totals>
              {totals.map((x) => (
                <li key={`${x.id}|${x.mode}`} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-slate-800">{x.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-700">{x.mode === "length" ? t(`${f1(x.total)} ซม. (${x.parts} ช่วง)`, `${f1(x.total)} cm (${x.parts} runs)`) : t(`${x.total} ตัว`, `${x.total} pcs`)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-400">{t("ราคาและเผื่อเสียคิดในใบตีราคาตามกลุ่มของวัสดุ (ซิป/สาย = ตามความยาว · อะไหล่ = นับชิ้น) · ส่งซ้ำ = อัปเดตบรรทัดเดิม ไม่เพิ่มซ้ำ", "Price and waste are worked out on the costing sheet by material group · sending again updates the same lines")}</p>
        </section>
      </div>
    </ERPModal>
  );
}
