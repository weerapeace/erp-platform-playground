"use client";

/**
 * ของกลาง — แถบ "ตั้งค่าการพิมพ์" (เลือกแม่แบบ + ติ๊กคอลัมน์ที่จะโชว์)
 *
 * ใช้กับเอกสารชนิดไหนก็ได้ — ส่ง entityType ต่างกัน (so / po / qt / billing_note …)
 * ค่าที่ตั้งเป็น "ค่ากลางของระบบ" ทุกคนพิมพ์ได้หน้าตาเดียวกัน (ต้องมีสิทธิ์ products.edit ถึงบันทึกได้)
 *
 * เห็นผลบนเอกสารทันทีที่ติ๊ก แล้วค่อยกดบันทึก — จะได้ลองก่อนว่าชอบไหม
 *
 * 2 หน้าตา:
 *   DocPrintSettings = แถบบนหน้าพิมพ์ (เลือกแม่แบบ + เปิด/ปิดคอลัมน์) — ใบกำกับภาษี
 *   DocPrintPanel    = แผงข้างพรีวิว (เอกสารใน DOC_TABLE_SETUP) — ความกว้าง/ชื่อหัว/ลำดับ/ตัวอักษร/เส้น + บันทึกเป็นค่าเริ่มต้น
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePermission, type Permission } from "@/components/auth";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import {
  DOC_BORDER_MM, DOC_COLUMNS, DOC_FONT_PT, DOC_ROW_PAD_MM, DOC_TABLE_SETUP, DOC_WIDTH_MAX_MM, DOC_WIDTH_MIN_MM,
  defaultPrefs, docColumnsOrdered, docWidthUsedMm, normalizePrefs, prefsKey,
  type DocBorder, type DocPrintPrefs, type DocPrintStyle,
} from "@/lib/doc-print-prefs";
import type { ReportTemplateRow } from "@/app/api/admin/report-templates/route";

/** โหลด/เก็บค่าตั้งค่าการพิมพ์ของเอกสารชนิดหนึ่ง · saved = ค่าที่บันทึกไว้ล่าสุด (ใช้ปุ่ม "คืนค่าที่บันทึกไว้") */
export function useDocPrintPrefs(entityType: string) {
  const [prefs, setPrefs] = useState<DocPrintPrefs | null>(null);
  const [saved, setSaved] = useState<DocPrintPrefs | null>(null);

  const reload = useCallback(() => {
    apiFetch(`/api/ui-config?key=${encodeURIComponent(prefsKey(entityType))}`)
      .then((r) => r.json())
      .then((j) => { const p = normalizePrefs(entityType, j?.value); setPrefs(p); setSaved(p); })
      .catch(() => { const p = defaultPrefs(entityType); setPrefs(p); setSaved(p); });   // โหลดไม่ได้ = ใช้ค่าเริ่มต้น ไม่ให้หน้าพิมพ์พัง
  }, [entityType]);

  useEffect(() => { reload(); }, [reload]);
  return { prefs, setPrefs, reload, saved, setSaved };
}

/**
 * สวิตช์ "พิมพ์ต้นฉบับ + สำเนา" (เจ้าของ 2026-11-10) — ใช้ทั้ง DocPrintPanel และ DocPrintSettings
 * เปิด = แต่ละใบพิมพ์ 2 หน้า (หน้าพิมพ์ใช้ withCopies + buildReportHtmlMulti) · บันทึกเป็นค่าเริ่มต้นไปพร้อมค่าอื่น
 * supported = แม่แบบมีช่อง {{copy_label}} (templateHasCopyLabel) — ไม่มี = เตือน เพราะจะไม่เห็นคำบนกระดาษ
 */
export function CopiesSwitch({ prefs, onChange, supported, compact = false }: {
  prefs: DocPrintPrefs; onChange: (next: DocPrintPrefs) => void; supported: boolean; compact?: boolean;
}) {
  const on = !!prefs.copies;
  const toggle = () => { const next = { ...prefs }; if (on) delete next.copies; else next.copies = true; onChange(next); };
  return (
    <div className={compact ? "flex items-center gap-2" : ""}>
      <button type="button" role="switch" aria-checked={on} onClick={toggle}
        title="เปิด = แต่ละใบพิมพ์ 2 หน้า: ต้นฉบับ แล้วสำเนา"
        className={`flex items-center justify-between gap-3 rounded-lg border px-3 text-sm ${compact ? "h-8" : "h-10 w-full"} ${on ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
        <span>พิมพ์ต้นฉบับ + สำเนา</span>
        <span className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-violet-600" : "bg-slate-300"}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
        </span>
      </button>
      {on && !supported && (
        <p className={`text-[11px] text-amber-700 ${compact ? "" : "mt-1"}`}>แบบฟอร์มนี้ยังไม่มีช่องคำว่า &ldquo;ต้นฉบับ/สำเนา&rdquo; — พิมพ์ 2 หน้าได้ แต่ไม่มีคำบนกระดาษ (เพิ่ม {"{{copy_label}}"} ที่หน้าแม่แบบรายงาน)</p>
      )}
      {on && supported && !compact && <p className="mt-1 text-[11px] text-slate-500">แต่ละใบพิมพ์ 2 หน้า: ต้นฉบับ แล้วสำเนา (หลายใบ = เรียงทีละใบ)</p>}
    </div>
  );
}

export function DocPrintSettings({
  entityType, templates, prefs, onChange, copySupported = false,
}: {
  entityType: string;
  templates: ReportTemplateRow[];
  prefs: DocPrintPrefs;
  onChange: (next: DocPrintPrefs) => void;
  /** แม่แบบที่เลือกมีช่อง {{copy_label}} ไหม (templateHasCopyLabel) */
  copySupported?: boolean;
}) {
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const cols = DOC_COLUMNS[entityType] ?? [];

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const r = await apiFetch("/api/ui-config", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prefsKey(entityType), value: prefs }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) { toast.error(j.error ?? "บันทึกไม่สำเร็จ"); return; }
      toast.success("บันทึกเป็นค่ากลางแล้ว — ทุกคนพิมพ์ได้หน้าตานี้");
    } catch { toast.error("บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  }, [entityType, prefs, toast]);

  const setCol = (key: string, on: boolean) =>
    onChange({ ...prefs, columns: { ...prefs.columns, [key]: on } });

  const activeTpl = templates.find((t) => t.id === prefs.template_id)
    ?? templates.find((t) => t.is_default) ?? templates[0] ?? null;

  return (
    <div className="no-print border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 px-6 py-2.5">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <span className="text-xs font-medium text-slate-400">แบบฟอร์ม</span>
          <select
            value={prefs.template_id || activeTpl?.id || ""}
            onChange={(e) => onChange({ ...prefs, template_id: e.target.value })}
            className="h-8 max-w-[280px] rounded-md border border-slate-200 bg-white px-2 text-sm"
          >
            {templates.length === 0 && <option value="">— ยังไม่มีแบบฟอร์ม —</option>}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.label}{t.is_default ? " (ตั้งต้น)" : ""}</option>
            ))}
          </select>
        </label>

        <CopiesSwitch prefs={prefs} onChange={onChange} supported={copySupported} compact />

        {cols.length > 0 && (
          <button type="button" onClick={() => setOpen((v) => !v)}
            className={`h-8 px-3 text-sm rounded-md border ${open
              ? "bg-blue-600 border-blue-600 text-white font-medium" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
            ☰ เลือกคอลัมน์
          </button>
        )}

        <div className="ml-auto text-[11px] text-slate-400">
          เปลี่ยนแล้วเห็นผลทันที · กดบันทึกถ้าอยากให้ทุกคนได้หน้าตานี้
        </div>
      </div>

      {open && cols.length > 0 && (
        <div className="px-6 pb-3">
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {cols.map((c) => {
                const on = c.locked ? true : prefs.columns[c.key] !== false;
                return (
                  <label key={c.key}
                    className={`flex items-center gap-1.5 text-sm ${c.locked ? "text-slate-400" : "text-slate-700 cursor-pointer"}`}
                    title={c.locked ? "คอลัมน์นี้ปิดไม่ได้ — เอกสารขาดไม่ได้" : undefined}>
                    <input type="checkbox" checked={on} disabled={c.locked}
                      onChange={(e) => setCol(c.key, e.target.checked)} className="rounded border-slate-300" />
                    {c.label}{c.locked && " 🔒"}
                  </label>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-blue-200">
              <button type="button" onClick={() => onChange(defaultPrefs(entityType))}
                className="h-8 px-3 text-xs rounded-md border border-slate-300 bg-white text-slate-600">
                คืนค่าเริ่มต้น
              </button>
              {canEdit && (
                <button type="button" onClick={() => void save()} disabled={saving}
                  className="h-8 px-4 text-xs rounded-md bg-blue-600 text-white font-medium disabled:opacity-50">
                  {saving ? "กำลังบันทึก…" : "💾 บันทึกเป็นค่ากลาง"}
                </button>
              )}
              <span className="text-[11px] text-slate-500 ml-auto">
                {canEdit ? "บันทึกแล้วทุกคนจะพิมพ์ได้หน้าตานี้" : "ดูอย่างเดียว — ไม่มีสิทธิ์บันทึกค่ากลาง"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "พอดีอัตโนมัติ" — วัดเนื้อหาจริงในเอกสารพรีวิว (ฟอนต์จริงของแม่แบบ) แล้วคืนความกว้างที่ไม่ตัดบรรทัด (มม.)
 *   ตัวเลข/เลขที่/วันที่ไม่ตัดบรรทัด · หัวคอลัมน์ยาวตัดบรรทัดได้ · คอลัมน์ data-flex ("หมายเหตุ") ไม่คืน = ได้ที่เหลือ
 *   วัดเสร็จคืนสภาพตารางเดิมทันที (ไม่ทิ้งร่องรอยในพรีวิว)
 */
export function measureDocColumns(doc: Document, table = ".doc-t"): Record<string, number> {
  const t = doc.querySelector<HTMLTableElement>(table);
  if (!t) return {};
  const PX_PER_MM = 96 / 25.4;
  const cols = [...t.querySelectorAll<HTMLTableColElement>("col[data-col]")];
  const tds = [...t.querySelectorAll<HTMLElement>("tbody td")];
  const before = { cls: t.className, layout: t.style.tableLayout, width: t.style.width,
    cols: cols.map((c) => c.style.width), tds: tds.map((td) => td.style.whiteSpace) };
  t.classList.remove("fixed");
  t.style.tableLayout = "auto";
  t.style.width = "auto";
  cols.forEach((c) => { c.style.width = ""; });
  tds.forEach((td) => { td.style.whiteSpace = "nowrap"; });
  const out: Record<string, number> = {};
  t.querySelectorAll<HTMLElement>("thead th[data-col]").forEach((th) => {
    const key = th.dataset.col ?? "";
    if (!key || cols.find((c) => c.dataset.col === key)?.dataset.flex === "1") return;
    out[key] = Math.ceil((th.offsetWidth / PX_PER_MM + 1) * 2) / 2;   // +1 มม. เผื่อเครื่องพิมพ์/ฟอนต์ต่างเครื่อง
  });
  t.className = before.cls;
  t.style.tableLayout = before.layout;
  t.style.width = before.width;
  cols.forEach((c, i) => { c.style.width = before.cols[i]; });
  tds.forEach((td, i) => { td.style.whiteSpace = before.tds[i]; });
  return out;
}

// ============================================================
// DocPrintPanel — แผงข้างพรีวิว (ไม่บังเอกสาร) สำหรับ "ตารางปรับได้"
//   ปรับแล้วเห็นผลทันที (หน้าพิมพ์หน่วงสร้างพรีวิว ~200ms) · ไม่กดบันทึก = ใช้เฉพาะใบที่เปิดอยู่
//   บันทึกเป็นค่าเริ่มต้น = ทุกคนพิมพ์เอกสารชนิดนี้ได้หน้าตาเดียวกัน (สิทธิ์ตาม DOC_TABLE_SETUP.edit · บันทึกประวัติที่ /api/ui-config)
// ============================================================

/** ช่องกว้าง (มม.) — พิมพ์ได้อิสระ ค่อยใช้เมื่อเลขอยู่ในช่วง · ว่าง = อัตโนมัติ */
function WidthInput({ value, onChange }: { value?: number; onChange: (mm: number | null) => void }) {
  const shown = value ? String(Math.round(value)) : "";
  const [draft, setDraft] = useState(shown);
  useEffect(() => { setDraft(shown); }, [shown]);
  return (
    <input type="number" inputMode="numeric" min={DOC_WIDTH_MIN_MM} max={DOC_WIDTH_MAX_MM} value={draft} placeholder="อัตโนมัติ"
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value === "") onChange(null);
        else if (n >= DOC_WIDTH_MIN_MM && n <= DOC_WIDTH_MAX_MM) onChange(n);
      }}
      onBlur={() => setDraft(shown)}
      className="h-8 w-16 rounded-md border border-slate-200 px-1.5 text-right text-xs tabular-nums placeholder:text-slate-300" />
  );
}

function StyleRange({ label, unit, value, min, max, step, fallback, onChange }: {
  label: string; unit: string; value?: number; min: number; max: number; step: number; fallback: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span className="tabular-nums">
          {value !== undefined ? `${value} ${unit}` : <span className="text-slate-400">ตามแม่แบบ</span>}
          {value !== undefined && (
            <button type="button" onClick={() => onChange(undefined)} className="ml-1.5 text-[11px] text-blue-600 hover:underline">ค่าเดิม</button>
          )}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value ?? fallback}
        onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-blue-600" />
    </label>
  );
}

export function DocPrintPanel({
  entityType, templates, prefs, saved, onChange, onSaved, onAutoFit, tableSupported = true, copySupported = false,
}: {
  /** แม่แบบที่เลือกมีช่อง {{copy_label}} ไหม (templateHasCopyLabel) — สวิตช์ต้นฉบับ+สำเนา */
  copySupported?: boolean;
  entityType: string;
  templates: ReportTemplateRow[];
  prefs: DocPrintPrefs;
  /** ค่าที่บันทึกไว้ล่าสุด (จาก useDocPrintPrefs) */
  saved: DocPrintPrefs | null;
  onChange: (next: DocPrintPrefs) => void;
  onSaved: (next: DocPrintPrefs) => void;
  /** วัดเนื้อหาในพรีวิวแล้วตั้งความกว้างให้พอดี (หน้าพิมพ์เป็นคนวัด เพราะต้องเข้าถึงเอกสารพรีวิว) */
  onAutoFit?: () => void;
  /** แม่แบบที่เลือกมี {{{lines_table}}} ไหม — ไม่มี = ปรับตารางไม่ได้ (ใช้ตารางที่เขียนในแม่แบบเอง) */
  tableSupported?: boolean;
}) {
  const toast = useToast();
  const setup = DOC_TABLE_SETUP[entityType];
  const canEdit = usePermission((setup?.edit ?? "products.edit") as Permission);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const cols = docColumnsOrdered(entityType, prefs);
  const defs = DOC_COLUMNS[entityType] ?? [];
  const used = Math.round(docWidthUsedMm(entityType, prefs));
  const over = !!setup && used > setup.contentMm;
  const dirty = !!saved && JSON.stringify(saved) !== JSON.stringify(prefs);
  const style: DocPrintStyle = prefs.style ?? {};

  const change = (next: DocPrintPrefs) => { setMsg(null); onChange(next); };
  const setStyle = (patch: Partial<DocPrintStyle>) => {
    const s: DocPrintStyle = { ...style, ...patch };
    (Object.keys(s) as (keyof DocPrintStyle)[]).forEach((k) => { if (s[k] === undefined || s[k] === "") delete s[k]; });
    change({ ...prefs, style: Object.keys(s).length ? s : undefined });
  };
  const setWidth = (key: string, mm: number | null) => {
    const w = { ...(prefs.widths ?? {}) };
    if (mm === null) delete w[key]; else w[key] = mm;
    change({ ...prefs, widths: Object.keys(w).length ? w : undefined });
  };
  const setLabel = (key: string, text: string) => {
    const l = { ...(prefs.labels ?? {}) };
    if (text === defs.find((c) => c.key === key)?.label) delete l[key]; else l[key] = text.slice(0, 40);
    change({ ...prefs, labels: Object.keys(l).length ? l : undefined });
  };
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) =>
    change({ ...prefs, order: moveItem(cols.map((c) => c.key), from, to) }));

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await apiFetch("/api/ui-config", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prefsKey(entityType), value: prefs }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) { setMsg({ tone: "err", text: j.error ?? "บันทึกไม่สำเร็จ" }); return; }
      onSaved(prefs);
      setMsg({ tone: "ok", text: "บันทึกเป็นค่าเริ่มต้นแล้ว — ทุกคนพิมพ์ได้หน้าตานี้" });
      toast.success("บันทึกค่าเริ่มต้นการพิมพ์แล้ว");
    } catch { setMsg({ tone: "err", text: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" }); }
    finally { setSaving(false); }
  };

  const activeTpl = templates.find((t) => t.id === prefs.template_id)
    ?? templates.find((t) => t.is_default) ?? templates[0] ?? null;

  return (
    <div className="no-print space-y-4 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <div>
        <h3 className="font-semibold text-slate-800">ตั้งค่าการพิมพ์</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">ปรับแล้วเห็นผลทันที · ลากขอบหัวคอลัมน์บนกระดาษได้ (ดับเบิลคลิก = อัตโนมัติ)</p>
      </div>

      <CopiesSwitch prefs={prefs} onChange={change} supported={copySupported} />

      {templates.length > 1 && (
        <label className="block">
          <span className="text-xs text-slate-600">แบบฟอร์ม</span>
          <select value={prefs.template_id || activeTpl?.id || ""} onChange={(e) => change({ ...prefs, template_id: e.target.value })}
            className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
            {templates.map((t) => <option key={t.id} value={t.id}>{t.label}{t.is_default ? " (ตั้งต้น)" : ""}</option>)}
          </select>
        </label>
      )}

      {!tableSupported ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          แบบฟอร์มนี้เขียนตารางไว้เอง จึงปรับคอลัมน์จากแผงนี้ไม่ได้ — ใช้แบบฟอร์มตั้งต้น หรือแก้ที่หน้าแม่แบบรายงาน
        </p>
      ) : (
        <>
          <section>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">คอลัมน์</span>
              {setup && (
                <span className={`text-[11px] tabular-nums ${over ? "text-red-600" : "text-slate-400"}`}>
                  ใช้ {used} / {setup.contentMm} มม.{over ? " — เกินกระดาษ" : ""}
                </span>
              )}
            </div>
            <div className="mt-1.5 space-y-1">
              {cols.map((c, i) => (
                <div key={c.key} {...rowProps(i)} className={`flex items-center gap-1.5 rounded-md px-1 py-0.5 ${rowCls(i)}`}>
                  <DragHandle {...handleProps(i)} title="ลากเพื่อเรียงลำดับ" />
                  <input type="checkbox" checked={c.shown} disabled={c.locked}
                    title={c.locked ? "คอลัมน์นี้ปิดไม่ได้ — เอกสารขาดไม่ได้" : "แสดง/ซ่อน"}
                    onChange={(e) => change({ ...prefs, columns: { ...prefs.columns, [c.key]: e.target.checked } })}
                    className="rounded border-slate-300" />
                  <input value={c.label} onChange={(e) => setLabel(c.key, e.target.value)} title="ชื่อหัวคอลัมน์ (แก้ได้)"
                    className={`h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-xs ${c.shown ? "" : "text-slate-400"}`} />
                  {c.flex
                    ? <span className="w-16 text-center text-[11px] text-slate-400" title="ได้พื้นที่ที่เหลือทั้งหมด">ที่เหลือ</span>
                    : <WidthInput value={c.widthMm} onChange={(mm) => setWidth(c.key, mm)} />}
                  <span className="w-5 text-[10px] text-slate-400">{c.flex ? "" : "มม."}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              {onAutoFit && (
                <button type="button" onClick={() => { setMsg(null); onAutoFit(); }}
                  className="h-8 flex-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-xs font-medium text-blue-700 hover:bg-blue-100">
                  พอดีอัตโนมัติ
                </button>
              )}
              {prefs.widths && (
                <button type="button" onClick={() => change({ ...prefs, widths: undefined })}
                  className="h-8 rounded-md border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50">
                  ล้างความกว้าง
                </button>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <StyleRange label="ตัวอักษรในตาราง" unit="pt" value={style.font_pt} min={DOC_FONT_PT.min} max={DOC_FONT_PT.max} step={0.5} fallback={14}
              onChange={(v) => setStyle({ font_pt: v })} />
            <StyleRange label="ระยะบน-ล่างในแถว" unit="มม." value={style.row_pad_mm} min={DOC_ROW_PAD_MM.min} max={DOC_ROW_PAD_MM.max} step={0.1} fallback={1.5}
              onChange={(v) => setStyle({ row_pad_mm: v })} />
            <label className="block">
              <span className="text-xs text-slate-600">เส้นตาราง</span>
              <select value={style.border ?? ""} onChange={(e) => setStyle({ border: (e.target.value || undefined) as DocBorder | undefined })}
                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
                <option value="">ตามแม่แบบ</option>
                <option value="all">ทุกเส้น</option>
                <option value="h">เส้นนอนอย่างเดียว</option>
                <option value="none">ไม่มีเส้น</option>
              </select>
            </label>
            {style.border !== "none" && (
              <div>
                <StyleRange label="ความหนาเส้น" unit="มม." value={style.border_mm} min={DOC_BORDER_MM.min} max={0.6} step={0.01} fallback={DOC_BORDER_MM.def}
                  onChange={(v) => setStyle({ border_mm: v })} />
                <p className="mt-0.5 text-[10px] text-slate-400">ความหนาเส้นเห็นชัดตอนพิมพ์จริง (Ctrl+P) — บนจอวาดบางกว่า 1 จุดไม่ได้</p>
              </div>
            )}
          </section>
        </>
      )}

      <section className="space-y-2 border-t border-slate-100 pt-3">
        {dirty && <p className="text-[11px] text-amber-700">มีการปรับที่ยังไม่บันทึก — พิมพ์ใบนี้ได้เลย หรือบันทึกเป็นค่าเริ่มต้น</p>}
        {msg && <p className={`text-[11px] ${msg.tone === "ok" ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
        <div className="flex flex-wrap gap-2">
          {saved && dirty && (
            <button type="button" onClick={() => change(saved)}
              className="h-8 rounded-md border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50">คืนค่าที่บันทึกไว้</button>
          )}
          <button type="button" onClick={() => change({ ...defaultPrefs(entityType), template_id: prefs.template_id })}
            className="h-8 rounded-md border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50">ค่าตั้งต้นของระบบ</button>
        </div>
        {canEdit ? (
          <button type="button" onClick={() => void save()} disabled={saving || !dirty}
            className="h-9 w-full rounded-md bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : "บันทึกเป็นค่าเริ่มต้น (ทุกคน)"}
          </button>
        ) : (
          <p className="text-[11px] text-slate-500">ปรับใช้กับใบนี้ได้ · บันทึกเป็นค่าเริ่มต้นได้เฉพาะคนที่มีสิทธิ์แก้ใบขาย</p>
        )}
      </section>
    </div>
  );
}
