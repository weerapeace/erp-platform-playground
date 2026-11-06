"use client";

/**
 * ⚙ ตั้งค่าประเภทงาน (ผู้จัดการ · pattern.manage) — เปิดจากปุ่มบนแผ่นประเภทงาน
 *   ซ้าย: รายการประเภท (ลากเรียงด้วยหูจับ · ของกลาง useDragReorder) + ปุ่มเพิ่มประเภทงาน
 *   ขวา: แก้ชื่อไทย/อังกฤษ (แปลอัตโนมัติ) · สีพื้นแผ่น · ไอคอน (มาตรฐาน Lottie / เส้น / อัปเอง) · เช็กลิสต์ตั้งต้น 2 ภาษา · ไฟล์ที่ต้องส่งกลับ
 *   ลบ: เฉพาะประเภทที่ยังไม่มีตั๋ว · มีตั๋วแล้ว = "ปิดใช้" (แผ่นหาย ตั๋วเก่าอยู่ครบ เปิดคืนได้)
 * บันทึกผ่าน /api/pattern-tickets/types (POST/PATCH/DELETE) · กติกาค่า lib/pattern-tickets
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useLang, useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { LoadingState, ErrorState } from "@/components/state-views";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import { apiFetch } from "@/lib/api";
import { translateContent } from "@/lib/content-translate";
import { lottieLibraryValue } from "@/lib/lottie-library";
import { COMMON_DELIVERABLES, defaultTypeIcon, templateItems, TYPE_COLOR_CLS, typeIconOf, typeLabelPair } from "@/lib/pattern-tickets";
import { TypeIconBox, TypeIconPicker } from "./type-icon-picker";
import type { TicketType } from "./types";

type Row = TicketType & { ticket_count: number };
type Draft = { key: string | null; label_th: string; label_en: string; color: string; icon: string; checklist: { th: string; en: string }[]; deliverables: string[] };

const SWATCH: Record<string, string> = { violet: "#7F77DD", teal: "#1D9E75", orange: "#D85A30", pink: "#D4537E", amber: "#EF9F27", blue: "#378ADD", green: "#639922", slate: "#888780" };

const toDraft = (r: Row): Draft => ({
  key: r.key, label_th: r.label_th, label_en: r.label_en, color: r.color, icon: typeIconOf(r),
  checklist: templateItems(r.checklist), deliverables: [...(r.deliverables ?? [])],
});
const NEW_DRAFT: Draft = { key: null, label_th: "", label_en: "", color: "slate", icon: lottieLibraryValue("check"), checklist: [], deliverables: [] };

export function TypeSettingsModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const isEn = useLang().lang === "en";
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selKey, setSelKey] = useState<string | null>(null);   // null + draft.key null = กำลังเพิ่มใหม่
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [newExt, setNewExt] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [changed, setChanged] = useState(false);

  const load = useCallback(async (keepKey?: string | null) => {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch("/api/pattern-tickets/types");
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      const list = (j.data ?? []) as Row[];
      setRows(list);
      const pick = list.find((r) => r.key === (keepKey ?? selKey)) ?? list[0];
      if (pick) { setSelKey(pick.key); setDraft(toDraft(pick)); }
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void load(); }, [load]);

  const sel = rows.find((r) => r.key === selKey) ?? null;
  const dirty = useMemo(() => {
    if (!draft) return false;
    if (!draft.key) return !!(draft.label_th || draft.checklist.length);
    return !!sel && JSON.stringify(draft) !== JSON.stringify(toDraft(sel));
  }, [draft, sel]);

  // สลับไปประเภทอื่นตอนยังไม่บันทึก → ถามก่อน (ConfirmDialog กลาง)
  const [pendingSwitch, setPendingSwitch] = useState<(() => void) | null>(null);
  const guard = (go: () => void) => { if (dirty) setPendingSwitch(() => go); else go(); };
  const pick = (r: Row) => guard(() => { setSelKey(r.key); setDraft(toDraft(r)); setNewExt(""); });
  const startNew = () => guard(() => { setSelKey(null); setDraft({ ...NEW_DRAFT }); setNewExt(""); });

  const reorder = useCallback(async (from: number, to: number) => {
    const next = moveItem(rows, from, to);
    setRows(next);
    const res = await apiFetch("/api/pattern-tickets/types", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: next.map((r) => r.key) }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) { toast.error(t("เรียงลำดับไม่สำเร็จ", "Couldn't reorder")); void load(selKey); return; }
    setChanged(true);
  }, [rows, load, selKey, t, toast]);
  const drag = useDragReorder((a, b) => void reorder(a, b));

  const up = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  // แปลชื่อ + เช็กลิสต์ข้อที่ยังไม่มีอังกฤษ
  const translateMissing = async (d: Draft): Promise<Draft> => {
    const jobs: { i: number; th: string }[] = [];
    if (!d.label_en.trim() && d.label_th.trim()) jobs.push({ i: -1, th: d.label_th });
    d.checklist.forEach((c, i) => { if (!c.en.trim() && c.th.trim()) jobs.push({ i, th: c.th }); });
    if (!jobs.length) return d;
    setTranslating(true);
    try {
      const out = await translateContent(jobs.map((j) => j.th), "en", { place: "ticket" });
      const next = { ...d, checklist: d.checklist.map((c) => ({ ...c })) };
      jobs.forEach((j, k) => { const en = out[k] ?? ""; if (!en) return; if (j.i < 0) next.label_en = en; else next.checklist[j.i].en = en; });
      return next;
    } catch { return d; }
    finally { setTranslating(false); }
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.label_th.trim()) { toast.warning(t("ใส่ชื่อประเภทงาน (ไทย)", "Enter a Thai name")); return; }
    setSaving(true);
    try {
      const d = await translateMissing({ ...draft, checklist: draft.checklist.filter((c) => c.th.trim()) });
      setDraft(d);
      const body = { label_th: d.label_th, label_en: d.label_en, color: d.color, icon: d.icon, checklist: d.checklist, deliverables: d.deliverables };
      const res = await apiFetch("/api/pattern-tickets/types", {
        method: d.key ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d.key ? { key: d.key, ...body, icon: d.icon === defaultTypeIcon(d.key) ? "" : d.icon } : body),
      });
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      toast.success(d.key ? t("บันทึกแล้ว", "Saved") : t("เพิ่มประเภทงานแล้ว", "Job type added"));
      setChanged(true);
      await load((j.data as Row).key);
    } catch (e) {
      toast.error(t(`บันทึกไม่สำเร็จ: ${(e as Error).message}`, `Couldn't save: ${(e as Error).message}`));
    } finally { setSaving(false); }
  };

  // 👁 เปิด/ปิดใช้ (ปุ่มตาท้ายแถว + ปุ่มล่าง) — เปลี่ยนในรายการทันที ไม่ทับที่กำลังแก้ค้างในช่องขวา · พลาด = คืนค่า
  const [toggling, setToggling] = useState<string | null>(null);
  const toggleActive = async (r: Row, on: boolean) => {
    setToggling(r.key);
    setRows((cur) => cur.map((x) => (x.key === r.key ? { ...x, is_active: on } : x)));
    try {
      const res = await apiFetch("/api/pattern-tickets/types", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: r.key, is_active: on }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      toast.success(on ? t(`เปิดใช้ "${r.label_th}" แล้ว`, `"${r.label_en}" enabled`) : t(`ซ่อน "${r.label_th}" แล้ว — ไม่โชว์ตอนเปิดตั๋ว`, `"${r.label_en}" hidden — not shown when opening tickets`));
      setChanged(true);
    } catch (e) {
      setRows((cur) => cur.map((x) => (x.key === r.key ? { ...x, is_active: !on } : x)));
      toast.error((e as Error).message);
    } finally { setToggling(null); }
  };

  const remove = async () => {
    if (!sel) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/pattern-tickets/types?key=${encodeURIComponent(sel.key)}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      toast.success(t("ลบแล้ว", "Deleted"));
      setConfirmDel(false); setChanged(true); setSelKey(null); await load(null);
    } catch (e) { toast.error((e as Error).message); setConfirmDel(false); }
    finally { setSaving(false); }
  };

  const close = () => { if (changed) onChanged(); onClose(); };
  const exts = draft ? Array.from(new Set([...COMMON_DELIVERABLES, ...draft.deliverables])) : [];

  return (
    <ERPModal open onClose={close} title={t("ตั้งค่าประเภทงาน", "Job type settings")} size="xl" storageKey="pattern-type-settings"
      hasUnsavedChanges={dirty && !saving}
      footer={draft ? (
        <div className="flex w-full flex-wrap items-center gap-2">
          {sel && draft.key && (sel.ticket_count > 0 ? (
            <button type="button" disabled={saving} onClick={() => void toggleActive(sel, !sel.is_active)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
              <Icon name={sel.is_active ? "hide" : "view"} />
              {sel.is_active ? t(`ปิดใช้ (มีตั๋ว ${sel.ticket_count} ใบ ลบไม่ได้)`, `Disable (${sel.ticket_count} tickets — can't delete)`) : t("เปิดใช้อีกครั้ง", "Enable again")}
            </button>
          ) : (
            <>
              <button type="button" disabled={saving} onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                <Icon name="delete" /> {t("ลบประเภทนี้", "Delete type")}
              </button>
              {sel.is_active ? null : (
                <button type="button" disabled={saving} onClick={() => void toggleActive(sel, true)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">{t("เปิดใช้อีกครั้ง", "Enable again")}</button>
              )}
            </>
          ))}
          <span className="flex-1" />
          <button type="button" onClick={close} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">{t("ปิด", "Close")}</button>
          <button type="button" onClick={() => void save()} disabled={saving || uploading || translating || !dirty}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving || translating ? t("กำลังบันทึก…", "Saving…") : draft.key ? t("บันทึก", "Save") : t("เพิ่มประเภทงาน", "Add job type")}
          </button>
        </div>
      ) : undefined}>
      {loading && !rows.length ? <LoadingState label={t("กำลังโหลดประเภทงาน…", "Loading job types…")} />
        : err ? <ErrorState title={t("โหลดประเภทงานไม่สำเร็จ", "Couldn't load job types")} hint={err} onRetry={() => void load(selKey)} />
        : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          {/* รายการ */}
          <div>
            <div className="flex flex-col gap-1.5">
              {rows.map((r, i) => {
                const [main, sub] = typeLabelPair(r, isEn);
                return (
                  <div key={r.key} {...drag.rowProps(i)} onClick={() => pick(r)}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 ${r.is_active ? "bg-white" : "bg-slate-50"} ${selKey === r.key && draft?.key ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200 hover:border-slate-300"} ${drag.rowCls(i)}`}>
                    <DragHandle {...drag.handleProps(i)} title={t("ลากเพื่อเรียงลำดับ", "Drag to reorder")} />
                    <span className={r.is_active ? "" : "opacity-40 grayscale"}><TypeIconBox value={typeIconOf(r)} color={r.color} box={36} /></span>
                    <div className={`min-w-0 flex-1 ${r.is_active ? "" : "opacity-60"}`}>
                      <div className="truncate text-sm font-medium text-slate-800">{main}{!r.is_active && <span className="ml-1 text-xs font-normal text-slate-400">({t("ปิดใช้", "disabled")})</span>}</div>
                      <div className="truncate text-xs text-slate-400">{sub} · {t("เช็กลิสต์", "checklist")} {(r.checklist ?? []).length} · {t("ตั๋ว", "tickets")} {r.ticket_count}</div>
                    </div>
                    <button type="button" disabled={toggling === r.key}
                      onClick={(e) => { e.stopPropagation(); void toggleActive(r, !r.is_active); }}
                      aria-label={r.is_active ? t("ซ่อน (ปิดใช้)", "Hide (disable)") : t("แสดง (เปิดใช้)", "Show (enable)")}
                      title={r.is_active ? t("กดเพื่อซ่อน — ไม่โชว์ตอนเปิดตั๋ว", "Click to hide — not shown when opening tickets") : t("ซ่อนอยู่ — กดเพื่อแสดง", "Hidden — click to show")}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg transition disabled:opacity-50 ${r.is_active ? "text-slate-500 hover:bg-slate-100 hover:text-slate-800" : "bg-slate-200/60 text-slate-400 hover:bg-slate-200 hover:text-slate-700"}`}>
                      <Icon name={r.is_active ? "view" : "hide"} />
                    </button>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={startNew}
              className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm ${draft && !draft.key ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-600 hover:border-slate-400"}`}>
              <Icon name="add" /> {t("เพิ่มประเภทงาน", "Add job type")}
            </button>
          </div>

          {/* ตัวแก้ */}
          {draft && (
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-600">{t("ชื่อ (ไทย)", "Name (Thai)")} *
                  <input value={draft.label_th} onChange={(e) => up({ label_th: e.target.value })} placeholder={t("ทำแบบพับ", "Folding pattern")}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" />
                </label>
                <label className="text-xs font-medium text-slate-600">English
                  <span className="ml-1 font-normal text-slate-400">({t("ว่าง = แปลให้ตอนบันทึก", "empty = auto-translated on save")})</span>
                  <input value={draft.label_en} onChange={(e) => up({ label_en: e.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" />
                </label>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-slate-600">{t("สีพื้นแผ่น", "Tile colour")}</div>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(TYPE_COLOR_CLS).map((c) => (
                    <button key={c} type="button" onClick={() => up({ color: c })} aria-label={c} title={c}
                      className={`h-7 w-7 rounded-full border-2 ${draft.color === c ? "border-slate-800" : "border-transparent"}`} style={{ background: SWATCH[c] ?? "#888" }} />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-slate-600">{t("ไอคอน", "Icon")}</div>
                <TypeIconPicker value={draft.icon} color={draft.color} defaultValue={draft.key ? defaultTypeIcon(draft.key) : undefined}
                  onChange={(v) => up({ icon: v })} onBusy={setUploading} />
              </div>

              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-600">
                  {t("เช็กลิสต์ตั้งต้น (ตั๋วใหม่ได้ชุดนี้)", "Starter checklist (new tickets get these)")}
                  <span className="font-normal text-slate-400">{t("ช่องอังกฤษว่าง = แปลให้ตอนบันทึก", "empty English = auto-translated on save")}</span>
                </div>
                <div className="flex flex-col gap-1">
                  {draft.checklist.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="w-5 text-right text-xs tabular-nums text-slate-400">{i + 1}.</span>
                      <input value={c.th} onChange={(e) => up({ checklist: draft.checklist.map((x, j) => (j === i ? { ...x, th: e.target.value } : x)) })}
                        placeholder={t("ข้อที่ต้องทำ (ไทย)", "Step (Thai)")} className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-400" />
                      <input value={c.en} onChange={(e) => up({ checklist: draft.checklist.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)) })}
                        placeholder="English" className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm outline-none focus:border-blue-400 focus:bg-white" />
                      <button type="button" aria-label={t("เลื่อนขึ้น", "Move up")} disabled={i === 0} onClick={() => up({ checklist: moveItem(draft.checklist, i, i - 1) })}
                        className="h-8 w-7 rounded-md text-slate-400 hover:bg-slate-100 disabled:opacity-30"><Icon value="i:chevron-up" /></button>
                      <button type="button" aria-label={t("เอาข้อนี้ออก", "Remove")} onClick={() => up({ checklist: draft.checklist.filter((_, j) => j !== i) })}
                        className="h-8 w-7 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"><Icon name="cancel" /></button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => up({ checklist: [...draft.checklist, { th: "", en: "" }] })}
                  className="mt-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"><Icon name="add" /> {t("เพิ่มข้อ", "Add step")}</button>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-slate-600">{t("ไฟล์ที่ช่างต้องส่งกลับ", "Files the maker delivers")}</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {exts.map((x) => {
                    const on = draft.deliverables.includes(x);
                    return (
                      <button key={x} type="button" onClick={() => up({ deliverables: on ? draft.deliverables.filter((y) => y !== x) : [...draft.deliverables, x] })}
                        className={`rounded-full border px-2.5 py-0.5 font-mono text-xs ${on ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>{x}</button>
                    );
                  })}
                  <input value={newExt} onChange={(e) => setNewExt(e.target.value.toUpperCase())} placeholder={t("+ นามสกุลอื่น", "+ other")} maxLength={5}
                    onKeyDown={(e) => { if (e.key === "Enter" && /^[A-Z0-9]{2,5}$/.test(newExt.replace(/^\./, ""))) { const x = newExt.replace(/^\./, ""); up({ deliverables: draft.deliverables.includes(x) ? draft.deliverables : [...draft.deliverables, x] }); setNewExt(""); } }}
                    className="h-7 w-24 rounded-full border border-dashed border-slate-300 px-2.5 font-mono text-xs outline-none focus:border-blue-400" />
                </div>
              </div>

              {!draft.key && <p className="text-xs text-slate-400">{t("ประเภทใหม่จะต่อท้ายรายการ — ลากเรียงได้หลังบันทึก", "New types go to the end — drag to reorder after saving")}</p>}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog open={!!pendingSwitch} onClose={() => setPendingSwitch(null)} onConfirm={() => { pendingSwitch?.(); setPendingSwitch(null); }}
        title={t("ยังไม่ได้บันทึก", "Unsaved changes")}
        message={t("คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกโดยไม่บันทึกหรือไม่?", "You have unsaved changes. Leave without saving?")}
        confirmText={t("ออกโดยไม่บันทึก", "Leave without saving")} cancelText={t("อยู่ต่อ", "Stay")} />
      <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={() => void remove()} variant="danger" loading={saving}
        title={t("ลบประเภทงาน", "Delete job type")}
        message={t(`ลบ "${sel?.label_th ?? ""}" ถาวร? (ยังไม่มีตั๋วใช้ประเภทนี้)`, `Permanently delete "${sel?.label_en ?? ""}"? (no tickets use it)`)}
        confirmText={t("ลบ", "Delete")} cancelText={t("ยกเลิก", "Cancel")} />
    </ERPModal>
  );
}
