"use client";

/**
 * TableLayoutPanel (ของกลาง) — ตั้งค่าเริ่มต้นของตาราง: เรียง/จัดกลุ่ม/จำนวนต่อหน้า,
 * คอลัมน์ที่โชว์เริ่มต้น (View default), สีแถวตามเงื่อนไข, สรุปท้ายคอลัมน์
 * เขียนลง erp_table_layouts ผ่าน /api/admin/table-layouts
 *
 * ใช้ได้ทั้ง:
 *  - หน้า /admin/module/[key] (showColumns=true เต็ม)
 *  - Studio "ออกแบบหน้า" แท็บตาราง (showColumns=false — Studio มี toggle คอลัมน์เองแล้ว)
 */
import { useEffect, useState, useCallback, useRef, type MutableRefObject } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { tr } from "@/lib/lang";
import { useT } from "@/components/i18n";

export type SummaryMap = Record<string, "sum" | "count" | "avg">;

type SortDir = "asc" | "desc";
type SortSpec = { column: string; dir: SortDir };
type RowColorOp = "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "empty" | "not_empty";
type RowColorRule = { column: string; op: RowColorOp; value?: string; color: string };
export type LayoutSettings = {
  default_sort?: SortSpec | null;
  secondary_sort?: SortSpec | null;
  group_by?: string | null;
  row_color_rules?: RowColorRule[];
  summaries?: Record<string, "sum" | "count" | "avg">;
};
// ค่าที่ panel นี้ผลิต/รับเข้า (ใช้ตอนผูกกับ "มุมมอง" แทนการเขียนทับค่าทั้งตาราง)
export type LayoutPanelState = { settings: LayoutSettings; pageSize: number };
type LayoutColumn = { key: string; label: string; visible: boolean; order: number; width?: number; pinned?: "left" | "right" | null };
type FullLayout = {
  label?: string; description?: string | null; columns?: LayoutColumn[];
  default_density?: string; default_page_size?: number; default_view_mode?: string;
  notes?: string | null; settings?: LayoutSettings;
};

const COLOR_OPTS = [
  { key: "red", get label() { return tr("แดง", "Red"); } }, { key: "orange", get label() { return tr("ส้ม", "Orange"); } }, { key: "amber", get label() { return tr("เหลือง", "Yellow"); } },
  { key: "green", get label() { return tr("เขียว", "Green"); } }, { key: "blue", get label() { return tr("ฟ้า", "Blue"); } }, { key: "purple", get label() { return tr("ม่วง", "Purple"); } }, { key: "slate", get label() { return tr("เทา", "Gray"); } },
];
const OP_OPTS: { key: RowColorOp; label: string }[] = [
  { key: "eq", get label() { return tr("เท่ากับ", "Equals"); } }, { key: "ne", get label() { return tr("ไม่เท่ากับ", "Not equal"); } },
  { key: "lt", get label() { return tr("น้อยกว่า", "Less than"); } }, { key: "lte", get label() { return tr("น้อยกว่า/เท่ากับ", "Less than or equal"); } },
  { key: "gt", get label() { return tr("มากกว่า", "Greater than"); } }, { key: "gte", get label() { return tr("มากกว่า/เท่ากับ", "Greater than or equal"); } },
  { key: "empty", get label() { return tr("ว่าง", "Is empty"); } }, { key: "not_empty", get label() { return tr("ไม่ว่าง", "Is not empty"); } },
];

export function TableLayoutPanel({ tableId, moduleKey, showColumns = true, embedded = false, showSummaries = true, saveRef, onSummaries, seed, seedKey, getStateRef, disableSelfSave = false }: {
  tableId: string; moduleKey: string; showColumns?: boolean; embedded?: boolean;
  showSummaries?: boolean;                                                  // false = ซ่อนกล่องสรุป (ไปโชว์ inline ที่อื่น)
  saveRef?: MutableRefObject<(() => Promise<void>) | null>;                // ให้พ่อสั่ง save ได้ (รวมปุ่มบันทึก)
  onSummaries?: (summaries: SummaryMap, setSummary: (col: string, val: string) => void) => void;  // ยกค่าสรุปขึ้นไปแสดง inline
  // ── โหมดผูกกับ "มุมมอง" (ใช้ใน Studio): อ่าน/เขียนค่าผ่านพ่อแทนการเขียน table layout ──
  seed?: LayoutPanelState | null;                                          // ค่าตั้งต้นจาก config ของมุมมอง (null = กลับไปใช้ค่าทั้งตาราง)
  seedKey?: string;                                                        // เปลี่ยนค่านี้ = re-seed (เช่น id มุมมองที่กำลังแก้)
  getStateRef?: MutableRefObject<(() => LayoutPanelState) | null>;         // ให้พ่อดึงค่าปัจจุบันไปเซฟลงมุมมอง
  disableSelfSave?: boolean;                                               // true = ไม่ให้ save() เขียน table layout (พ่อเซฟลงมุมมองเอง)
}) {
  const t = useT();
  const [fields, setFields] = useState<{ value: string; label: string; visible: boolean }[]>([]);
  const [full, setFull] = useState<FullLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [sortCol, setSortCol] = useState(""); const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [sort2Col, setSort2Col] = useState(""); const [sort2Dir, setSort2Dir] = useState<SortDir>("asc");
  const [groupBy, setGroupBy] = useState("");
  const [rules, setRules] = useState<RowColorRule[]>([]);
  const [summaries, setSummaries] = useState<Record<string, "sum" | "count" | "avg">>({});
  const [colVis, setColVis] = useState<Record<string, boolean>>({});
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setLoading(true); setErr(null);
    Promise.all([
      apiFetch(`/api/admin/field-registry-v2?module=${encodeURIComponent(moduleKey)}`).then((r) => r.json()).catch(() => ({})),
      apiFetch(`/api/table-layouts?table_id=${encodeURIComponent(tableId)}`).then((r) => r.json()).catch(() => ({})),
    ]).then(([fr, lr]) => {
      const fl = (fr.fields as { field_key: string; column_name: string | null; field_label: string; field_label_en?: string | null; ui_field_type?: string; is_visible?: boolean }[] | undefined) ?? [];
      const flClean = fl
        .filter((f) => !["one2many", "many2many"].includes(String(f.ui_field_type)))
        .map((f) => {
          const key = String(f.column_name ?? f.field_key);
          const th = f.field_label || key;
          return { value: key, label: tr(th, f.field_label_en || th), visible: !!f.is_visible };
        });
      setFields(flClean);
      const layout = (lr.data as FullLayout | null) ?? null;
      setFull(layout);
      // โหมดผูกมุมมอง (seedKey มีค่า): ปล่อยให้ seed effect เป็นคนตั้งค่า sort/group/สี/หน้า — ไม่ดึงค่าทั้งตารางมาทับ
      if (!seedKey) {
        const s = layout?.settings ?? {};
        setSortCol(s.default_sort?.column ?? ""); setSortDir(s.default_sort?.dir ?? "asc");
        setSort2Col(s.secondary_sort?.column ?? ""); setSort2Dir(s.secondary_sort?.dir ?? "asc");
        setGroupBy(s.group_by ?? "");
        setRules(Array.isArray(s.row_color_rules) ? s.row_color_rules : []);
        setSummaries((s.summaries as Record<string, "sum" | "count" | "avg">) ?? {});
        setPageSize(Number(layout?.default_page_size) || 20);
      }
      const existing = Array.isArray(layout?.columns) ? (layout!.columns as LayoutColumn[]) : [];
      const exByKey: Record<string, LayoutColumn> = Object.fromEntries(existing.map((c) => [c.key, c]));
      const vis: Record<string, boolean> = {};
      flClean.forEach((f) => { const ex = exByKey[f.value]; vis[f.value] = ex ? !!ex.visible : f.visible; });
      setColVis(vis);
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, moduleKey]);

  // ── โหมดผูกมุมมอง: re-seed ค่า sort/group/สี/หน้า เมื่อสลับมุมมองที่กำลังแก้ (seedKey เปลี่ยน) ──
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (seedKey === undefined) return;             // ไม่ได้อยู่ในโหมดมุมมอง
    if (seededRef.current === seedKey) return;      // seed ไปแล้วสำหรับ key นี้
    seededRef.current = seedKey;
    // seed=null (เช่น "สร้างมุมมองใหม่") → กลับไปใช้ค่าทั้งตารางที่โหลดไว้
    const s = (seed ? seed.settings : full?.settings) ?? {};
    setSortCol(s.default_sort?.column ?? ""); setSortDir(s.default_sort?.dir ?? "asc");
    setSort2Col(s.secondary_sort?.column ?? ""); setSort2Dir(s.secondary_sort?.dir ?? "asc");
    setGroupBy(s.group_by ?? "");
    setRules(Array.isArray(s.row_color_rules) ? s.row_color_rules : []);
    setSummaries((s.summaries as Record<string, "sum" | "count" | "avg">) ?? {});
    setPageSize(Number(seed ? seed.pageSize : full?.default_page_size) || 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, seed]);

  // ให้พ่อดึงค่าปัจจุบันไปเซฟลง config ของมุมมอง
  const currentState = useCallback((): LayoutPanelState => ({
    settings: {
      default_sort: sortCol ? { column: sortCol, dir: sortDir } : null,
      secondary_sort: sort2Col ? { column: sort2Col, dir: sort2Dir } : null,
      group_by: groupBy || null,
      row_color_rules: rules.filter((r) => r.column && r.color),
      summaries: Object.keys(summaries).length ? summaries : undefined,
    },
    pageSize,
  }), [sortCol, sortDir, sort2Col, sort2Dir, groupBy, rules, summaries, pageSize]);
  if (getStateRef) getStateRef.current = currentState;

  const persist = async (): Promise<boolean> => {
    const settings: LayoutSettings = {
      default_sort: sortCol ? { column: sortCol, dir: sortDir } : null,
      secondary_sort: sort2Col ? { column: sort2Col, dir: sort2Dir } : null,
      group_by: groupBy || null,
      row_color_rules: rules.filter((r) => r.column && r.color),
      summaries: Object.keys(summaries).length ? summaries : undefined,
    };
    const existing = (full?.columns as LayoutColumn[] | undefined) ?? [];
    const exByKey: Record<string, LayoutColumn> = Object.fromEntries(existing.map((c) => [c.key, c]));
    const columns: LayoutColumn[] = fields.map((f, i) => {
      const ex = exByKey[f.value];
      return { key: f.value, label: f.label, visible: colVis[f.value] ?? true, order: ex?.order ?? (i + 1) * 10, width: ex?.width, pinned: ex?.pinned ?? null };
    });
    for (const ex of existing) if (!fields.some((f) => f.value === ex.key)) columns.push(ex);
    const j = await apiFetch("/api/admin/table-layouts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table_id: tableId, label: full?.label || tableId, description: full?.description ?? null, columns,
        default_density: full?.default_density ?? "normal", default_page_size: pageSize,
        default_view_mode: full?.default_view_mode ?? "table", notes: full?.notes ?? null, settings,
      }),
    }).then((r) => r.json());
    if (j.error) throw new Error(j.error);
    return true;
  };

  const save = async () => {
    if (disableSelfSave) return;   // โหมดแก้มุมมอง: พ่อเป็นคนเซฟลง config ของมุมมองเอง
    setSaving(true); setErr(null); setMsg(null);
    try { await persist(); setMsg(tr("บันทึกแล้ว ✓ (เปิดตารางใหม่จะใช้ค่านี้)", "Saved ✓ (applies next time the table opens)")); setTimeout(() => setMsg(null), 4000); }
    catch (e) { setErr(String(e instanceof Error ? e.message : e)); } finally { setSaving(false); }
  };

  const forceForEveryone = async () => {
    if (!confirm(tr("บังคับใช้คอลัมน์/ค่าตั้งนี้กับทุกคน?\n\n• มุมมองเริ่มต้น (ดาว ★) ของตารางนี้จะถูกยกเลิกทั้งหมด เพื่อให้ค่ากลางนี้แสดงผล\n• ผู้ใช้ที่เคยจัดคอลัมน์เองในเครื่อง อาจต้องกด \"รีเซ็ตเป็นค่าเริ่มต้น\" ในตารางอีกครั้ง", "Apply these columns/settings to everyone?\n\n• All default views (★) of this table will be unset so these defaults show\n• People who arranged columns on their own device may need to press \"Reset to default\" in the table again"))) return;
    setSaving(true); setErr(null); setMsg(null);
    try {
      await persist();
      const j = await apiFetch(`/api/admin/saved-views?table_id=${encodeURIComponent(tableId)}`).then((r) => r.json());
      const defaults = ((j.data ?? []) as { id: string; is_default?: boolean }[]).filter((v) => v.is_default);
      for (const v of defaults) {
        await apiFetch("/api/admin/saved-views", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: v.id, is_default: false }) });
      }
      setMsg(tr(`บังคับใช้กับทุกคนแล้ว ✓${defaults.length ? ` — ยกเลิกมุมมองเริ่มต้น ${defaults.length} อัน` : ""}`, `Applied to everyone ✓${defaults.length ? ` — unset ${defaults.length} default view(s)` : ""}`));
      setTimeout(() => setMsg(null), 6000);
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)); } finally { setSaving(false); }
  };

  // ยกค่าสรุปขึ้นไปให้พ่อแสดง inline (ในรายการคอลัมน์ของ Studio) + ให้พ่อสั่ง save ได้
  const setSummaryFor = useCallback((col: string, val: string) => {
    setSummaries((p) => { const n = { ...p }; if (val) n[col] = val as "sum" | "count" | "avg"; else delete n[col]; return n; });
  }, []);
  useEffect(() => { onSummaries?.(summaries, setSummaryFor); }, [summaries, onSummaries, setSummaryFor]);
  if (saveRef) saveRef.current = save;

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">{t("กำลังโหลด…", "Loading…")}</div>;

  const card = "bg-white border border-slate-200 rounded-xl p-5";
  const sel = "h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white";
  const colSelect = (val: string, on: (v: string) => void, allowNone = true) => (
    <select value={val} onChange={(e) => on(e.target.value)} className={sel}>
      {allowNone && <option value="">{t("— ไม่กำหนด —", "— None —")}</option>}
      {fields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
    </select>
  );
  const dirSelect = (val: SortDir, on: (v: SortDir) => void) => (
    <select value={val} onChange={(e) => on(e.target.value as SortDir)} className={sel}>
      <option value="asc">{t("น้อย → มาก (A→Z, เก่า→ใหม่)", "Ascending (A→Z, old→new)")}</option>
      <option value="desc">{t("มาก → น้อย (Z→A, ใหม่→เก่า)", "Descending (Z→A, new→old)")}</option>
    </select>
  );

  return (
    <div className={embedded ? "space-y-4" : "max-w-2xl mx-auto px-6 py-6 space-y-5"}>
      {/* การเรียง + จัดกลุ่ม */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-slate-800 mb-4">{t("ค่าเริ่มต้นตาราง", "Table defaults")}</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("เรียงเริ่มต้น (Default sort)", "Default sort")}</label>
            <div className="flex flex-wrap gap-2">{colSelect(sortCol, setSortCol)} {sortCol && dirSelect(sortDir, setSortDir)}</div>
          </div>
          {sortCol && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("เรียงรอง (ตัวตัดสินเมื่อค่าหลักเท่ากัน)", "Secondary sort (tie-breaker)")}</label>
              <div className="flex flex-wrap gap-2">{colSelect(sort2Col, setSort2Col)} {sort2Col && dirSelect(sort2Dir, setSort2Dir)}</div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("จัดกลุ่มเริ่มต้น (Group by)", "Default group by")}</label>
            {colSelect(groupBy, setGroupBy)}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("จำนวนแถวต่อหน้าเริ่มต้น", "Default rows per page")}</label>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className={sel}>
              {[10, 20, 50, 100, 200].map((n) => <option key={n} value={n}>{t(`${n} แถว/หน้า`, `${n} rows/page`)}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* คอลัมน์ที่โชว์เริ่มต้น (View default) — ซ่อนใน Studio (มี toggle เองแล้ว) */}
      {showColumns && (
        <div className={card}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-slate-800">{t("คอลัมน์ที่โชว์เริ่มต้น (View default)", "Default visible columns")}</h3>
            <div className="flex gap-2 text-xs">
              <button onClick={() => setColVis(Object.fromEntries(fields.map((f) => [f.value, true])))} className="px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">{t("เลือกทั้งหมด", "Select all")}</button>
              <button onClick={() => setColVis(Object.fromEntries(fields.map((f) => [f.value, false])))} className="px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">{t("ไม่เลือก", "Select none")}</button>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-3">{t("เปิดตารางครั้งแรกจะโชว์คอลัมน์ที่ติ๊กไว้ · ผู้ใช้ปรับเองได้ภายหลัง · ป้าย", "Ticked columns show when the table first opens · users can change them later · the")} <span className="px-1 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium">{t("ซ่อน", "Hidden")}</span> {t("= field ที่ตั้งให้ซ่อนไว้ (ยังติ๊กให้โชว์ในตารางนี้ได้)", "tag = a field set to hidden (you can still tick it to show here)")}</p>
          {fields.length === 0 ? (
            <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-3 text-center">{t("— ไม่มีคอลัมน์ —", "— No columns —")}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {fields.map((f) => (
                <label key={f.value} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none py-1">
                  <input type="checkbox" checked={colVis[f.value] ?? true} onChange={(e) => setColVis((p) => ({ ...p, [f.value]: e.target.checked }))} className="rounded border-slate-300 w-4 h-4" />
                  <span className={`flex-1 min-w-0 truncate inline-flex items-center gap-1.5 ${f.visible ? "" : "text-slate-400"}`}>
                    <span className="truncate">{f.label}</span>
                    {!f.visible && <span className="shrink-0 px-1 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium" title={t("field นี้ถูกตั้งให้ซ่อน (is_visible=false) — ติ๊กเพื่อบังคับโชว์ในตารางนี้", "This field is set to hidden (is_visible=false) — tick to force it to show in this table")}>{t("ซ่อน", "Hidden")}</span>}
                  </span>
                  <code className="text-[10px] text-slate-400 shrink-0">{f.value}</code>
                </label>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button"
              onClick={() => {
                if (typeof window === "undefined") return;
                if (!confirm(t(`รีเซ็ตมุมมองตาราง "${tableId}" ที่จำไว้ในเครื่องนี้?\n\nคอลัมน์/ฟิลเตอร์/ความหนาแน่นที่คุณเคยปรับเอง จะกลับไปใช้ค่าเริ่มต้นของระบบ`, `Reset the saved view of table "${tableId}" on this device?\n\nColumns/filters/density you adjusted will go back to the system defaults`))) return;
                try { const p1 = `erp-dt-${tableId}`; const p2 = `erp-card-cfg-${tableId}`; Object.keys(localStorage).forEach((k) => { if (k.startsWith(p1) || k === p2) localStorage.removeItem(k); }); alert(t("รีเซ็ตแล้ว ✓ — เปิดตารางใหม่จะเห็นค่าเริ่มต้นล่าสุด", "Reset ✓ — reopen the table to see the latest defaults")); }
                catch { alert(t("รีเซ็ตไม่สำเร็จ", "Reset failed")); }
              }}
              className="h-8 px-3 text-xs font-medium rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 inline-flex items-center gap-1">{t("↺ รีเซ็ตมุมมองตารางของฉัน", "↺ Reset my table view")}</button>
            <p className="text-[11px] text-amber-600 flex-1 min-w-[200px]">{t("กดปุ่มนี้ถ้าแก้คอลัมน์ด้านบนแล้วแต่ในตารางยังไม่เปลี่ยน (ระบบจำการปรับแต่งของแต่ละคนไว้ในเครื่อง — ปุ่มนี้รีเซ็ตเฉพาะเครื่องของคุณ)", "Press this if you changed the columns above but the table hasn't changed (each person's tweaks are stored on their device — this resets only yours)")}</p>
          </div>
        </div>
      )}

      {/* สีแถวตามเงื่อนไข */}
      <div className={card}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-slate-800">{t("ระบายสีแถวตามเงื่อนไข", "Conditional row colors")}</h3>
          <button onClick={() => setRules((r) => [...r, { column: fields[0]?.value ?? "", op: "eq", value: "", color: "red" }])} className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">{t("+ เพิ่มกฎ", "+ Add rule")}</button>
        </div>
        <p className="text-xs text-slate-500 mb-3">{t("เช่น สต๊อก น้อยกว่า 10 → แดง · กฎบนสุดที่เข้าเงื่อนไขชนะ", "e.g. stock less than 10 → red · the top matching rule wins")}</p>
        {rules.length === 0 ? (
          <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-3 text-center">{t("— ยังไม่มีกฎ —", "— No rules yet —")}</div>
        ) : (
          <div className="space-y-2">
            {rules.map((r, i) => {
              const upd = (p: Partial<RowColorRule>) => setRules((arr) => arr.map((x, j) => j === i ? { ...x, ...p } : x));
              const noVal = r.op === "empty" || r.op === "not_empty";
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 bg-slate-50 rounded-lg p-2">
                  <select value={r.column} onChange={(e) => upd({ column: e.target.value })} className={sel}>{fields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
                  <select value={r.op} onChange={(e) => upd({ op: e.target.value as RowColorOp })} className={sel}>{OP_OPTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select>
                  {!noVal && <input value={r.value ?? ""} onChange={(e) => upd({ value: e.target.value })} placeholder={t("ค่า", "Value")} className={`${sel} w-24`} />}
                  <select value={r.color} onChange={(e) => upd({ color: e.target.value })} className={sel}>{COLOR_OPTS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                  <span className="w-6 h-6 rounded border border-slate-300" style={{ backgroundColor: ({ red:"#fecaca",orange:"#fed7aa",amber:"#fde68a",green:"#bbf7d0",blue:"#bfdbfe",purple:"#e9d5ff",slate:"#e2e8f0" } as Record<string,string>)[r.color] }} />
                  <button onClick={() => setRules((arr) => arr.filter((_, j) => j !== i))} className="ml-auto text-slate-400 hover:text-red-500 text-sm">✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* สรุปท้ายคอลัมน์ — ซ่อนได้ถ้าไปโชว์ inline ที่รายการคอลัมน์ */}
      {showSummaries && (
      <div className={card}>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">{t("สรุปท้ายคอลัมน์ (Total row)", "Total row")}</h3>
        <p className="text-xs text-slate-500 mb-3">{t("แสดงแถวสรุปท้ายตาราง เช่น รวมยอด/นับจำนวน/เฉลี่ย ของคอลัมน์ที่เลือก", "Show a summary row at the bottom, e.g. sum/count/average of chosen columns")}</p>
        <div className="space-y-2">
          {fields.map((f) => {
            const cur = summaries[f.value] ?? "";
            return (
              <div key={f.value} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-slate-700 truncate">{f.label}</span>
                <select value={cur}
                  onChange={(e) => setSummaries((p) => { const n = { ...p }; const v = e.target.value; if (v) n[f.value] = v as "sum" | "count" | "avg"; else delete n[f.value]; return n; })}
                  className={sel}>
                  <option value="">{t("— ไม่สรุป —", "— None —")}</option>
                  <option value="sum">{t("รวมยอด (sum)", "Sum")}</option>
                  <option value="count">{t("นับจำนวน (count)", "Count")}</option>
                  <option value="avg">{t("เฉลี่ย (avg)", "Average")}</option>
                </select>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* actions — ซ่อนปุ่ม save ถ้าพ่อ (Studio) รวมปุ่มบันทึกแล้ว (saveRef) */}
      <div className="flex items-center gap-3 flex-wrap">
        {!saveRef && <button onClick={save} disabled={saving} className="h-10 px-6 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? t("กำลังบันทึก…", "Saving…") : t("บันทึกค่าเริ่มต้นตาราง", "Save table defaults")}</button>}
        {showColumns && (
          <button onClick={forceForEveryone} disabled={saving} title={t("บันทึก + ยกเลิกมุมมองเริ่มต้น (ดาว) ของตารางนี้ เพื่อให้ค่ากลางนี้แสดงผลกับทุกคน", "Save + unset this table's default (★) views so these defaults show for everyone")}
            className="h-10 px-5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 disabled:opacity-50">{t("📌 บังคับใช้กับทุกคน", "📌 Apply to everyone")}</button>
        )}
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
        {err && <span className="text-sm text-red-600">⚠️ {err}</span>}
      </div>
      {showColumns && (
        <>
          <p className="text-[11px] text-slate-400 -mt-2">ℹ️ {t("ถ้าตารางมี “มุมมองเริ่มต้น (ดาว ★)” อยู่ มุมมองนั้นจะชนะค่านี้ — กด “บังคับใช้กับทุกคน” เพื่อล้างมุมมองดาวของตารางนี้", "If the table has a “default view (★)”, it wins over these settings — press “Apply to everyone” to clear this table's starred views")}</p>
          <div className="text-center pt-2">
            <Link href={`/admin/table-layouts?table=${encodeURIComponent(tableId)}`} className="text-sm text-blue-600 hover:underline">{t("จัดคอลัมน์ / ความหนาแน่น / จำนวนต่อหน้า (ตัวจัดเลย์เอาต์เต็ม) →", "Columns / density / page size (full layout editor) →")}</Link>
          </div>
        </>
      )}
    </div>
  );
}
