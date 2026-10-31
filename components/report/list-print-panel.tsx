"use client";

/**
 * 🖨 ListPrintPanel — ของกลาง: แผงตั้งค่าหน้าพิมพ์แบบรายการ (วางข้างพรีวิว) · ค่าทั้งหมดอยู่ใน lib/list-print
 *   แบบที่บันทึกไว้ (สำเร็จรูป / ของทีม / ของฉัน) · กระดาษ · ขนาด · คอลัมน์ (เปิด/ปิด ลำดับ ชื่อ ช่องเขียนมือ)
 *   เรียง & จัดกลุ่ม · หัว-ท้ายกระดาษ · บันทึกเป็นแบบ
 * ใช้คู่กับ useListPrintSettings · ใช้ที่: /print/work-board · เอกสาร docs/list-print.md
 */
import { askConfirm, askText } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import {
  BLANK_WIDTHS, DENSITY_LABEL, EXTRA_COLUMNS, FONT_MAX, FONT_MIN, IMAGE_LABEL, MAX_CUSTOM_COLUMNS, applyListPrintPreset, isCustomColumn, isExtraColumn, newCustomColumn,
  type ListPrintColumn, type ListPrintColumnPref, type ListPrintDensity, type ListPrintImage, type ListPrintPreset, type ListPrintSettings,
} from "@/lib/list-print";
import type { ListPrintSettingsState } from "@/components/report/use-list-print-settings";

type Opt = { value: string; label: string };

const segBtn = (on: boolean) =>
  `h-7 px-2.5 rounded-lg border text-xs transition-colors ${on ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-200 py-3 first:border-t-0 first:pt-0">
      <div className="mb-2 text-[13px] font-semibold text-slate-800">{title}{hint && <span className="ml-1 text-[11px] font-normal text-slate-400">{hint}</span>}</div>
      {children}
    </section>
  );
}
function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 py-0.5 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-blue-600" />
      {children}
    </label>
  );
}

export function ListPrintPanel({
  state, available, sorts, groups, builtinPresets, companies, estimatedPages, defaultTitle, canSaveTeam, signatureHint,
}: {
  state: ListPrintSettingsState;
  available: ListPrintColumn[];
  sorts: Opt[];
  groups: Opt[];
  builtinPresets: ListPrintPreset[];
  companies: { id: string; name: string }[];
  estimatedPages: number;
  defaultTitle: string;
  /** แอดมิน = บันทึก/ลบแบบของทีมได้ */
  canSaveTeam: boolean;
  /** ข้อความช่องเซ็น เช่น "ผู้จ่ายงาน / ผู้รับงาน" */
  signatureHint?: string;
}) {
  const toast = useToast();
  const s = state.settings;
  const set = (patch: Partial<ListPrintSettings>) => state.setSettings({ ...s, ...patch });
  const setCols = (columns: ListPrintColumnPref[]) => set({ columns });
  const labelOf = (key: string) => available.find((c) => c.key === key)?.label ?? EXTRA_COLUMNS.find((c) => c.key === key)?.label ?? "ช่องใหม่";
  const patchCol = (key: string, patch: Partial<ListPrintColumnPref>) => setCols(s.columns.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const customCount = s.columns.filter((c) => isCustomColumn(c.key)).length;
  const addCustom = async () => {
    const name = await askText({ title: "เพิ่มช่องใหม่", message: "ตั้งชื่อหัวช่อง — ในใบจะเป็นช่องว่างไว้เขียนหรือติ๊กด้วยมือ", placeholder: "เช่น วันที่รับ, คนตัด, จำนวนเสีย", required: true });
    if (!name?.trim()) return;
    setCols([...s.columns, newCustomColumn(name)]);
  };
  const visibleCols = s.columns.filter((c) => available.some((a) => a.key === c.key) || isExtraColumn(c.key));
  const move = (key: string, dir: -1 | 1) => {
    const list = [...s.columns];
    const i = list.findIndex((c) => c.key === key);
    // ข้ามคอลัมน์ที่ใบนี้ไม่มี (ค่าที่ใช้ร่วมกับใบอื่น) ให้เลื่อนตามที่เห็น
    let j = i + dir;
    while (j >= 0 && j < list.length && !visibleCols.some((v) => v.key === list[j].key)) j += dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setCols(list);
  };
  const applyPreset = (p: ListPrintPreset) => {
    state.setSettings(applyListPrintPreset(s, p, available));
    toast.success(`ใช้แบบ “${p.name}” แล้ว`);
  };
  const savePreset = async (team: boolean) => {
    const name = await askText({ title: team ? "บันทึกเป็นแบบของทีม" : "บันทึกเป็นแบบของฉัน", message: team ? "ทุกคนในทีมเลือกใช้แบบนี้ได้" : "เลือกใช้ได้ทุกใบในหน้าพิมพ์นี้", placeholder: "เช่น ใบเช็กของโต๊ะ A", required: true });
    if (!name?.trim()) return;
    if (team) {
      const err = await state.saveTeamPreset(name);
      if (err) toast.error(err); else toast.success("บันทึกแบบของทีมแล้ว");
    } else {
      state.saveMyPreset(name);
      toast.success("บันทึกแบบของฉันแล้ว");
    }
  };
  const removePreset = async (p: ListPrintPreset, team: boolean) => {
    if (!(await askConfirm({ title: `ลบแบบ “${p.name}”?`, message: team ? "คนอื่นในทีมจะไม่เห็นแบบนี้อีก" : undefined, variant: "danger", confirmText: "ลบ" }))) return;
    if (team) { const err = await state.deleteTeamPreset(p.id); if (err) toast.error(err); } else state.deleteMyPreset(p.id);
  };
  const presetRow = (p: ListPrintPreset, kind: "sys" | "team" | "mine") => (
    <div key={`${kind}-${p.id}`} className="group flex items-center gap-1">
      <button type="button" onClick={() => applyPreset(p)}
        className="flex-1 min-w-0 truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50/50">
        <Icon value={kind === "sys" ? "i:sparkles" : kind === "team" ? "i:users" : "i:user"} className="mr-1.5 text-slate-400" />{p.name}
      </button>
      {(kind === "mine" || (kind === "team" && canSaveTeam)) && (
        <button type="button" onClick={() => void removePreset(p, kind === "team")} aria-label={`ลบแบบ ${p.name}`}
          className="h-7 w-7 shrink-0 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-600"><Icon value="i:trash" /></button>
      )}
    </div>
  );

  return (
    <div className="text-sm">
      <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <span><Icon value="i:file-text" className="mr-1" />ประมาณ <b>{estimatedPages}</b> หน้า · {s.paper} {s.orientation === "portrait" ? "แนวตั้ง" : "แนวนอน"}</span>
        <button type="button" onClick={state.reset} className="text-blue-600 hover:underline" title="กลับเป็นค่าเริ่มต้นของใบนี้">ค่าเริ่มต้น</button>
      </div>

      <Section title="แบบที่บันทึกไว้" hint="กดทีเดียวเปลี่ยนทั้งชุด">
        <div className="space-y-1">
          {builtinPresets.map((p) => presetRow(p, "sys"))}
          {state.teamPresets.map((p) => presetRow(p, "team"))}
          {state.myPresets.map((p) => presetRow(p, "mine"))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => void savePreset(false)} className="h-7 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50"><Icon value="i:device-floppy" className="mr-1" />บันทึกเป็นแบบของฉัน</button>
          {canSaveTeam && <button type="button" onClick={() => void savePreset(true)} className="h-7 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50"><Icon value="i:users" className="mr-1" />บันทึกให้ทั้งทีม</button>}
        </div>
      </Section>

      <Section title="กระดาษ">
        <div className="flex flex-wrap gap-1.5">
          {(["A4", "A5"] as const).map((p) => <button key={p} type="button" className={segBtn(s.paper === p)} onClick={() => set({ paper: p })}>{p}</button>)}
          <span className="w-2" />
          <button type="button" className={segBtn(s.orientation === "portrait")} onClick={() => set({ orientation: "portrait" })}>แนวตั้ง</button>
          <button type="button" className={segBtn(s.orientation === "landscape")} onClick={() => set({ orientation: "landscape" })}>แนวนอน</button>
        </div>
      </Section>

      <Section title="ขนาด">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <span className="w-16 shrink-0">ตัวอักษร</span>
          <input type="range" min={FONT_MIN} max={FONT_MAX} step={1} value={s.fontPx} onChange={(e) => set({ fontPx: Number(e.target.value) })} className="flex-1 accent-blue-600" />
          <span className="w-9 text-right font-mono">{s.fontPx}px</span>
        </label>
        <div className="mt-2 text-xs text-slate-500">รูปสินค้า</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(Object.keys(IMAGE_LABEL) as ListPrintImage[]).map((k) => <button key={k} type="button" className={segBtn(s.image === k)} onClick={() => set({ image: k })}>{IMAGE_LABEL[k]}</button>)}
        </div>
        <div className="mt-2 text-xs text-slate-500">ความแน่นของแถว</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(Object.keys(DENSITY_LABEL) as ListPrintDensity[]).map((k) => <button key={k} type="button" className={segBtn(s.density === k)} onClick={() => set({ density: k })}>{DENSITY_LABEL[k]}</button>)}
        </div>
        <div className="mt-2"><Check checked={s.zebra} onChange={(zebra) => set({ zebra })}>แถวสลับสี</Check></div>
      </Section>

      <Section title="คอลัมน์" hint="ติ๊ก · เลื่อนลำดับ · แก้ชื่อหัว">
        <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-500">
          <Icon value="i:arrows-exchange" className="mt-0.5 shrink-0 text-slate-400" />
          <span className="flex-1">ปรับความกว้าง: ลากขอบหัวคอลัมน์ในใบพรีวิว · ดับเบิลคลิกขอบ = กลับค่าเดิม</span>
          {s.columns.some((c) => c.widthMm != null && !isExtraColumn(c.key)) && (
            <button type="button" onClick={state.resetColumnWidths} className="shrink-0 text-blue-600 hover:underline">คืนเดิมทั้งหมด</button>
          )}
        </div>
        <div className="space-y-1">
          {visibleCols.map((c, i) => (
            <div key={c.key}>
            <div className="flex items-center gap-1">
              <input type="checkbox" checked={c.on} aria-label={`พิมพ์คอลัมน์ ${labelOf(c.key)}`}
                onChange={(e) => setCols(s.columns.map((x) => (x.key === c.key ? { ...x, on: e.target.checked } : x)))} className="h-4 w-4 shrink-0 accent-blue-600" />
              <input value={c.label ?? ""} placeholder={labelOf(c.key)} maxLength={40}
                onChange={(e) => patchCol(c.key, { label: e.target.value || undefined })}
                onBlur={(e) => { if (isCustomColumn(c.key) && !e.target.value.trim()) patchCol(c.key, { label: "ช่องใหม่" }); }}
                className={`h-7 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-xs ${c.on ? "text-slate-800" : "text-slate-400"} placeholder:text-slate-500`} />
              {c.widthMm != null && !isExtraColumn(c.key) && (
                <button type="button" onClick={() => state.setColumnWidth(c.key, null)} title="ความกว้างที่ลากปรับไว้ — กดเพื่อกลับค่าเดิม"
                  className="h-7 shrink-0 rounded px-1 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-700">{c.widthMm}มม.</button>
              )}
              <button type="button" disabled={i === 0} onClick={() => move(c.key, -1)} aria-label="เลื่อนขึ้น" className="h-7 w-6 shrink-0 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25"><Icon value="i:chevron-up" /></button>
              <button type="button" disabled={i === visibleCols.length - 1} onClick={() => move(c.key, 1)} aria-label="เลื่อนลง" className="h-7 w-6 shrink-0 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25"><Icon value="i:chevron-down" /></button>
              {isExtraColumn(c.key)
                ? <button type="button" onClick={() => setCols(s.columns.filter((x) => x.key !== c.key))} aria-label={`ลบช่อง ${labelOf(c.key)}`} className="h-7 w-6 shrink-0 rounded text-slate-300 hover:bg-red-50 hover:text-red-600"><Icon value="i:x" /></button>
                : <span className="w-6 shrink-0" />}
            </div>
            {isExtraColumn(c.key) && c.on && (
              <div className="ml-5 mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                {(["line", "box"] as const).map((b) => {
                  const cur = c.blank ?? EXTRA_COLUMNS.find((x) => x.key === c.key)?.blank ?? "line";
                  return <button key={b} type="button" onClick={() => patchCol(c.key, { blank: b })} className={`${segBtn(cur === b)} !h-6 !px-2 !text-[11px]`}>{b === "line" ? "ช่องเขียน" : "ช่องติ๊ก ☐"}</button>;
                })}
                <span className="mx-1 text-slate-300">|</span>
                {BLANK_WIDTHS.map((w) => {
                  const cur = c.widthMm ?? EXTRA_COLUMNS.find((x) => x.key === c.key)?.widthMm ?? 25;
                  return <button key={w.mm} type="button" onClick={() => patchCol(c.key, { widthMm: w.mm })} className={`${segBtn(cur === w.mm)} !h-6 !px-2 !text-[11px]`}>{w.label}</button>;
                })}
              </div>
            )}
            </div>
          ))}
        </div>
        <div className="mt-2 text-xs text-slate-500">เพิ่มช่องว่างให้เขียนมือ</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {EXTRA_COLUMNS.map((x) => {
            const has = s.columns.some((c) => c.key === x.key);
            return <button key={x.key} type="button" disabled={has} onClick={() => setCols([...s.columns, { key: x.key, on: true }])} className={`${segBtn(false)} disabled:opacity-40`}>+ {x.label}</button>;
          })}
          <button type="button" disabled={customCount >= MAX_CUSTOM_COLUMNS} onClick={() => void addCustom()}
            className="h-7 rounded-lg border border-dashed border-blue-400 bg-blue-50/40 px-2.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40"
            title={customCount >= MAX_CUSTOM_COLUMNS ? `เพิ่มเองได้สูงสุด ${MAX_CUSTOM_COLUMNS} ช่อง` : "เพิ่มช่องว่าง ตั้งชื่อเอง"}>+ ช่องใหม่ (ตั้งชื่อเอง)</button>
        </div>
      </Section>

      <Section title="เรียง & จัดกลุ่ม">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <span className="w-16 shrink-0">เรียงตาม</span>
          <select value={s.sortBy} onChange={(e) => set({ sortBy: e.target.value })} className="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm">
            {sorts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-600">
          <span className="w-16 shrink-0">จัดกลุ่ม</span>
          <select value={s.groupBy} onChange={(e) => set({ groupBy: e.target.value })} disabled={groups.length < 2} className="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-50 disabled:text-slate-500">
            {groups.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <div className="mt-1.5"><Check checked={s.pageBreakPerGroup} onChange={(pageBreakPerGroup) => set({ pageBreakPerGroup })}>ขึ้นหน้าใหม่ทุกกลุ่ม</Check></div>
      </Section>

      <Section title="หัว & ท้ายกระดาษ">
        <input value={s.title} placeholder={defaultTitle} maxLength={80} onChange={(e) => set({ title: e.target.value })}
          className="mb-2 h-8 w-full rounded-lg border border-slate-200 px-2.5 text-sm placeholder:text-slate-500" aria-label="ชื่อรายงาน" />
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <span className="w-16 shrink-0">หัวบริษัท</span>
          <select value={s.companyId ?? ""} onChange={(e) => set({ companyId: e.target.value || null })} className="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm">
            <option value="">ไม่แสดง</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="mt-1.5 space-y-0.5">
          <Check checked={s.pageNumbers} onChange={(pageNumbers) => set({ pageNumbers })}>เลขหน้า (หน้า 1 / N)</Check>
          <Check checked={s.signature} onChange={(signature) => set({ signature })}>ช่องเซ็นท้ายใบ{signatureHint ? ` (${signatureHint})` : ""}</Check>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">เลขหน้าโชว์ตอนพิมพ์/บันทึก PDF (พรีวิวบนจอเป็นกระดาษม้วนเดียว) · ค่าทั้งหมดจำไว้ให้คุณเองต่อใบ</p>
      </Section>
    </div>
  );
}
