"use client";
/**
 * 🧷 TrimsModal — หน้าต่าง "ซิปและอะไหล่" ของสตูดิโอแพทเทิร์น (เจ้าของสั่ง 2026-11-11 "ส่งซิปและอะไหล่ไปตีราคา")
 *   ของที่ไม่ใช่ชิ้นตัด แต่ต้องอยู่ในต้นทุน — ใส่จำนวนต่อกระเป๋า 1 ใบ แล้วไปกับปุ่ม "ส่งไปตีราคา" (1 วัสดุ = 1 บรรทัด)
 *     1) ซิปของช่องเจาะ — ทุกช่องเจาะ (เส้นในชนิด "ช่องเจาะ (ซิป)") ขึ้นให้เอง: เลือกซิป + เผื่อปลาย · ความยาวตามช่องบนกระดานเสมอ
 *     2) อะไหล่ / สาย / ซิปอื่น — เพิ่มเอง: วัสดุคิดตามยาว = ยาวต่อเส้น × จำนวน · วัสดุนับชิ้น = จำนวน
 *     3) รวมต่อกระเป๋า 1 ใบ (ตามวัสดุ) = สิ่งที่จะไปเป็นบรรทัดตีราคา
 *   วัสดุ = รายการวัสดุตีราคาเดียวกับของชิ้น — เฉพาะกลุ่มที่คิด "ตามความยาว" หรือ "นับชิ้น" (ซิป · สาย/เทป · อะไหล่)
 *   แก้ = ส่ง onChange ทันที (หน้าแก้แพทเทิร์นเก็บลง template.trims แล้วบันทึกพร้อมแพทเทิร์น) · สูตรทั้งหมด = lib/pattern-trims
 *
 *   <TrimsModal open onClose={…} pieces={pieces} trims={trims} materials={[{ id, name, group, calc }]} onChange={setTrims} readonly={!canEdit} />
 * ใช้ที่: app/pattern-studio/[id]/editor · คู่มือ: docs/pattern-studio.md
 */
import { useMemo } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { SearchableSelect } from "@/components/searchable-select";
import { StepInput } from "@/components/step-input";
import { MAX_TRIMS, TRIM_MAX_EXTRA, TRIM_MAX_LEN, TRIM_MAX_QTY, ZIP_EXTRA_DEFAULT, slitList, trimModeOf, trimRows, trimTotals, type ProjectTrim, type TrimMode } from "@/lib/pattern-trims";
import type { ProjectPiece } from "@/lib/pattern-project";

export type TrimMaterial = { id: string; name: string; group: string | null; calc?: string | null };
const f1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString("th-TH", { maximumFractionDigits: 1 });
const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function TrimsModal({ open, onClose, pieces, trims, materials, onChange, readonly = false }: {
  open: boolean;
  onClose: () => void;
  /** ชิ้นล่าสุดบนกระดาน (อ่านช่องเจาะ + จำนวนตัด) */
  pieces: ProjectPiece[];
  trims: ProjectTrim[];
  /** วัสดุตีราคา (ชื่อ + ชนิด + วิธีคิดของกลุ่ม — ไม่มีราคา) */
  materials: TrimMaterial[];
  onChange: (next: ProjectTrim[]) => void;
  readonly?: boolean;
}) {
  const t = useT();
  const usable = useMemo(() => materials.flatMap((m) => { const mode = trimModeOf(m.calc); return mode ? [{ ...m, mode }] : []; }), [materials]);
  const zipOptions = useMemo(() => usable.filter((m) => m.mode === "length").map((m) => ({ value: m.id, label: m.name, sub: m.group ?? undefined })), [usable]);
  const allOptions = useMemo(() => usable.map((m) => ({ value: m.id, label: m.name, sub: `${m.group ?? ""}${m.group ? " · " : ""}${m.mode === "length" ? t("คิดตามความยาว", "by length") : t("นับชิ้น", "by count")}` })), [usable, t]);
  const slits = useMemo(() => slitList(pieces), [pieces]);
  const rows = useMemo(() => trimRows(trims, pieces), [trims, pieces]);
  const totals = useMemo(() => trimTotals(rows), [rows]);
  const manual = rows.filter((r) => !r.trim.src), gone = rows.filter((r) => r.gone);
  const full = trims.length >= MAX_TRIMS;

  const patch = (id: string, p: Partial<ProjectTrim>) => onChange(trims.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id: string) => onChange(trims.filter((x) => x.id !== id));
  const matOf = (id: string) => { const m = usable.find((x) => x.id === id); return m ? { id: m.id, name: m.name, mode: m.mode as TrimMode } : null; };
  const pickZip = (pid: string, line: string, matId: string) => { const mat = matOf(matId); if (mat && !full) onChange([...trims, { id: newId(), mat, qty: 1, extra: ZIP_EXTRA_DEFAULT, src: { pid, line } }]); };
  const addManual = (matId: string) => { const mat = matOf(matId); if (mat && !full) onChange([...trims, { id: newId(), mat, qty: 1 }]); };
  const unit = (mode: TrimMode) => (mode === "length" ? t("เส้น", "pcs") : t("ตัว", "pcs"));
  const head = "text-xs font-medium text-slate-600", box = "rounded-lg border border-slate-200 bg-white";
  const del = (id: string, name: string) => !readonly && (
    <button type="button" onClick={() => remove(id)} aria-label={t(`เอา ${name} ออก`, `Remove ${name}`)} title={t("เอาออกจากรายการ", "Remove from the list")}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon value="i:x" className="text-sm" /></button>
  );

  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="pattern-trims-modal"
      title={t("ซิปและอะไหล่", "Zips and hardware")}
      description={t("ของที่ไม่ใช่ชิ้นตัดแต่ต้องอยู่ในต้นทุน: ซิป สาย/เทป ห่วง ล็อก หมุด — ใส่จำนวนต่อกระเป๋า 1 ใบ แล้วไปพร้อมชิ้นตอนกด ส่งไปตีราคา (1 วัสดุ = 1 บรรทัด)", "Things that are not cut pieces but belong in the cost: zips, tapes, rings, locks, rivets — enter the amount per bag; they go to costing with the pieces (one line per material)")}
      footer={<div className="flex w-full items-center justify-between gap-3">
        <span className="text-xs text-slate-500">{readonly ? "" : t("รายการนี้บันทึกพร้อมแพทเทิร์น — ปิดแล้วกด บันทึก ที่แถบด้านล่าง", "This list is saved with the pattern — close, then press Save in the bar below")}</span>
        <button type="button" onClick={onClose} className="h-9 rounded-lg bg-slate-800 px-4 text-sm text-white hover:bg-slate-900">{t("ปิด", "Close")}</button>
      </div>}>
      <div className="space-y-5 text-sm" data-trims>
        {!usable.length && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{t("ยังไม่มีวัสดุกลุ่ม ซิป / สาย-เทป / อะไหล่ ในรายการวัสดุตีราคา (กลุ่มที่คิดตามความยาวหรือนับชิ้น) — เพิ่มวัสดุในหน้าวัสดุตีราคาของใบงานออกแบบก่อน", "No zip / tape / hardware materials in the costing material list yet (groups priced by length or by count) — add them on the design-sheet costing materials page first")}</p>
        )}

        {/* 1) ซิปของช่องเจาะ */}
        <section className="space-y-1.5">
          <div className={head}>{t(`1. ซิปของช่องเจาะ (${slits.length} ช่อง)`, `1. Zips for slits (${slits.length})`)}</div>
          {!slits.length ? (
            <p className="text-[13px] text-slate-400">{t("ยังไม่มีช่องซิปในแพทเทิร์น — เพิ่มได้ที่ปุ่ม เพิ่มช่อง บนกระดาน หรือวาดเส้นในชนิด ช่องเจาะ (ซิป)", "No zip slits yet — use Add pocket on the board, or draw an inner line of kind Slit (zip)")}</p>
          ) : (
            <ul className={`${box} divide-y divide-slate-100`}>
              {slits.map((s) => {
                const row = rows.find((r) => r.trim.src?.pid === s.pid && r.trim.src.line === s.line);
                return (
                  <li key={`${s.pid}/${s.line}`} data-slit={`${s.pid}/${s.line}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
                    <div className="min-w-[150px] flex-1">
                      <div className="font-medium text-slate-800">{s.piece} · {s.label}</div>
                      <div className="text-xs text-slate-500">{t(`ช่องยาว ${f1(s.len)} ซม.${s.count > 1 ? ` × ตัด ${s.count} ชิ้น` : ""}`, `Slit ${f1(s.len)} cm${s.count > 1 ? ` × ${s.count} pieces` : ""}`)}</div>
                    </div>
                    {row ? (<>
                      <span className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-800" title={row.trim.mat.name}><Icon value="i:link" className="text-xs" />{row.trim.mat.name}</span>
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">{t("เผื่อปลาย", "End allowance")}
                        <StepInput value={row.trim.extra ?? ZIP_EXTRA_DEFAULT} step={0.5} min={0} max={TRIM_MAX_EXTRA} unit={t("ซม.", "cm")} disabled={readonly} className="h-8 w-28"
                          ariaLabel={t(`เผื่อปลายซิป ${s.piece}`, `Zip end allowance ${s.piece}`)} onChange={(v) => patch(row.trim.id, { extra: v ?? 0 })} />
                      </label>
                      <span className="text-xs tabular-nums text-slate-700" data-slit-total>{t(`= ${f1(row.each ?? 0)} ซม.${row.qty > 1 ? ` × ${row.qty} = ${f1(row.total)} ซม.` : ""}`, `= ${f1(row.each ?? 0)} cm${row.qty > 1 ? ` × ${row.qty} = ${f1(row.total)} cm` : ""}`)}</span>
                      {del(row.trim.id, row.trim.mat.name)}
                    </>) : readonly ? <span className="text-xs text-amber-600">{t("ยังไม่เลือกซิป", "No zip chosen")}</span> : (
                      <div className="w-64 max-w-full"><SearchableSelect value="" options={zipOptions} disabled={!zipOptions.length || full} placeholder={t("เลือกซิปของช่องนี้", "Choose the zip for this slit")} onChange={(v) => pickZip(s.pid, s.line, v)} /></div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {gone.map((r) => (
            <div key={r.trim.id} className="flex items-center justify-between gap-2 rounded-md bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
              <span>{t(`${r.trim.mat.name}: ช่องของซิปเส้นนี้ถูกลบไปแล้ว — แถวนี้จะหายตอนบันทึก`, `${r.trim.mat.name}: its slit was deleted — this row goes away on save`)}</span>{del(r.trim.id, r.trim.mat.name)}
            </div>
          ))}
        </section>

        {/* 2) อะไหล่ / สาย / ซิปอื่น */}
        <section className="space-y-1.5">
          <div className={head}>{t(`2. อะไหล่ / สาย / ซิปอื่น (${manual.length} รายการ)`, `2. Hardware / tapes / other zips (${manual.length})`)}</div>
          {manual.length > 0 && (
            <ul className={`${box} divide-y divide-slate-100`}>
              {manual.map((r) => (
                <li key={r.trim.id} data-trim={r.trim.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
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
            <div className="w-80 max-w-full"><SearchableSelect value="" options={allOptions} disabled={!allOptions.length || full}
              placeholder={full ? t(`ครบ ${MAX_TRIMS} รายการแล้ว`, `Limit of ${MAX_TRIMS} reached`) : t("＋ เพิ่ม ซิป / สาย / อะไหล่", "＋ Add a zip / tape / hardware")} onChange={addManual} /></div>
          )}
        </section>

        {/* 3) รวมต่อกระเป๋า 1 ใบ */}
        <section className="space-y-1.5">
          <div className={head}>{t("3. รวมต่อกระเป๋า 1 ใบ (จะไปเป็นบรรทัดตีราคา)", "3. Total per bag (becomes the costing lines)")}</div>
          {!totals.length ? <p className="text-[13px] text-slate-400">{t("ยังไม่มีรายการ", "Nothing yet")}</p> : (
            <ul className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px]" data-trim-totals>
              {totals.map((x) => (
                <li key={`${x.id}|${x.mode}`} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-slate-800">{x.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-700">{x.mode === "length" ? t(`${f1(x.total)} ซม. (${x.parts} เส้น)`, `${f1(x.total)} cm (${x.parts} pcs)`) : t(`${x.total} ตัว`, `${x.total} pcs`)}</span>
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
