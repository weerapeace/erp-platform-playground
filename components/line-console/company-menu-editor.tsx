"use client";

/**
 * ตั้งปุ่มเมนูล่างจอของไลน์บริษัท (อยู่ในส่วน "ไลน์บริษัท" ของศูนย์ LINE · components/line-console/company-section)
 *   4 ชุด: ยังไม่ผูก / พนักงาน / ลูกค้า / แอดมิน · แก้ชื่อ คำอธิบาย ลำดับ (ลากหูจับ) · ซ่อน · เอาออก · เพิ่มปุ่มจากรายการที่ระบบรองรับ
 *   บันทึกแล้วชุดเดิมเก็บเข้าประวัติ (ย้อนได้ 10 ชุด) · คนในไลน์เห็นปุ่มใหม่หลังกด "สร้างเมนูในไลน์" (ปุ่มอยู่ใน company-section)
 * รูปที่ออกแบบเอง (อัปโหลด/เส้นแบ่งปุ่ม/แบบเปล่า/ย้อนกลับ): company-menu-images ใต้ตัวอย่าง (ต่อหน้าเมนูที่ดูอยู่)
 * กติกาปุ่ม/ขนาดรูป: lib/line-company · API: /api/admin/line-company (save_layout / revert_layout / reset_layout / preview)
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { askConfirm } from "@/components/modal/ask-dialog";
import { Icon } from "@/components/icon";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import { CompanyMenuImages, type MenuImagesView } from "@/components/line-console/company-menu-images";
import {
  ADMIN_TABS, COMPANY_ACTIONS, COMPANY_MENU_KINDS, COMPANY_MENU_LABEL, HINT_MAX, LABEL_MAX, MAX_MENU_BUTTONS,
  actionsForKind, menuGrid, normalizeCompanyLayout, visibleButtons,
  type CompanyAction, type CompanyMenuButton, type CompanyMenuKind, type CompanyMenuLayout, type PublishedMenuKey,
} from "@/lib/line-company";

export type LayoutHistoryItem = { saved_at: string | null; saved_by: string | null; layout: CompanyMenuLayout };

const fmtTime = (d: string | null) => (d ? new Date(d).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "ค่าตั้งต้น");
const same = (a: CompanyMenuLayout, b: CompanyMenuLayout) => JSON.stringify(a) === JSON.stringify(b);

/** ตัวอย่างเมนูแบบเร็ว (HTML) — รูปจริงกด "ดูรูปจริง" */
function MenuPreview({ kind, buttons, tab, onTab }: { kind: CompanyMenuKind; buttons: CompanyMenuButton[]; tab: PublishedMenuKey; onTab: (k: PublishedMenuKey) => void }) {
  const shown = visibleButtons(buttons);
  const g = menuGrid(shown.length);
  const tone = kind === "employee" ? "border-t-emerald-500" : kind === "customer" ? "border-t-blue-500" : kind === "admin" ? "border-t-violet-500" : "border-t-slate-400";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-1.5">
      {kind === "admin" && (
        <div className="grid grid-cols-3 gap-1 mb-1">
          {ADMIN_TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => onTab(t.key)}
              className={`h-6 rounded-md text-[10px] ${t.key === tab ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}>{t.label}</button>
          ))}
        </div>
      )}
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${g.cols}, minmax(0, 1fr))` }}>
        {shown.map((b) => (
          <div key={b.act} className={`rounded-lg border border-slate-200 border-t-4 ${tone} bg-slate-50 px-1 ${g.rows === 1 ? "py-4" : "py-3"} text-center`}>
            <div className="text-[12px] font-semibold text-slate-800 leading-tight">{b.label}</div>
            {b.hint && <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{b.hint}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompanyMenuEditor({ layout, history, savedAt, busy, onSaved, images }: {
  layout: CompanyMenuLayout; history: LayoutHistoryItem[]; savedAt: string | null; busy?: boolean; onSaved: () => Promise<void> | void;
  /** รูปที่ออกแบบเอง (ไม่ส่ง = ไม่มีส่วนอัปรูป) */
  images?: MenuImagesView;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<CompanyMenuLayout>(layout);
  const [kind, setKind] = useState<CompanyMenuKind>("employee");
  const [tab, setTab] = useState<PublishedMenuKey>("admin");
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [img, setImg] = useState<{ url: string; key: string } | null>(null);
  const [imgBusy, setImgBusy] = useState(false);

  // ผู้เรียกใส่ key={savedAt} — บันทึก/ย้อนแล้วเริ่มร่างใหม่จากชุดล่าสุด (โหลดหน้าใหม่เฉย ๆ ไม่ทับที่กำลังแก้)
  useEffect(() => () => { if (img) URL.revokeObjectURL(img.url); }, [img]);

  const dirty = !same(normalizeCompanyLayout(draft), layout);
  const rows = draft[kind];
  const shownCount = rows.filter((b) => !b.hidden).length;
  const unused = useMemo(() => actionsForKind(kind).filter((a) => !rows.some((b) => b.act === a)), [kind, rows]);
  // แท็บแอดมิน "ดูแบบพนักงาน/ลูกค้า" ใช้ปุ่มของชุดพนักงาน/ลูกค้า
  const previewKind: CompanyMenuKind = kind === "admin" ? (ADMIN_TABS.find((t) => t.key === tab)?.buttonsOf ?? "admin") : kind;
  const previewKey: PublishedMenuKey = kind === "admin" ? tab : kind;

  const setRows = (next: CompanyMenuButton[]) => setDraft((d) => ({ ...d, [kind]: next }));
  const patch = (i: number, p: Partial<CompanyMenuButton>) => setRows(rows.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const drag = useDragReorder((from, to) => setRows(moveItem(rows, from, to)), { group: `cmp-menu-${kind}` });

  const toggleHidden = (i: number) => {
    const b = rows[i];
    if (b.hidden && shownCount >= MAX_MENU_BUTTONS) { toast.warning(`เมนูโชว์ได้ไม่เกิน ${MAX_MENU_BUTTONS} ปุ่ม — ซ่อนปุ่มอื่นก่อน`); return; }
    if (!b.hidden && shownCount <= 1) { toast.warning("ต้องเหลือปุ่มที่โชว์อย่างน้อย 1 ปุ่ม"); return; }
    patch(i, { hidden: !b.hidden || undefined });
  };
  const remove = (i: number) => {
    if (!rows[i].hidden && shownCount <= 1) { toast.warning("ต้องเหลือปุ่มที่โชว์อย่างน้อย 1 ปุ่ม"); return; }
    const before = rows;
    setRows(rows.filter((_, j) => j !== i));
    toast.undo(`เอาปุ่ม "${rows[i].label}" ออกแล้ว (ยังไม่บันทึก)`, () => setRows(before));
  };
  const add = (act: CompanyAction) => {
    const a = COMPANY_ACTIONS[act];
    setRows([...rows, { act, label: a.label, hint: a.hint, ...(shownCount >= MAX_MENU_BUTTONS ? { hidden: true } : {}) }]);
    if (shownCount >= MAX_MENU_BUTTONS) toast.info(`เพิ่มแล้วแต่ซ่อนไว้ (โชว์ได้ไม่เกิน ${MAX_MENU_BUTTONS} ปุ่ม)`);
  };

  const post = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      const r = await apiFetch("/api/admin/line-company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      await onSaved();
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); return false; }
    finally { setSaving(false); }
  };

  const save = async () => {
    for (const k of COMPANY_MENU_KINDS) if (draft[k].some((b) => !b.label.trim())) { setKind(k); toast.error(`ชุด${COMPANY_MENU_LABEL[k]}: ใส่ชื่อปุ่มให้ครบก่อน`); return; }
    if (await post({ save_layout: draft })) toast.undo("บันทึกปุ่มเมนูแล้ว · กดสร้างเมนูในไลน์เพื่อให้ทุกคนเห็น", async () => { if (await post({ revert_layout: 0 })) toast.success("ย้อนกลับเป็นชุดก่อนแล้ว"); });
  };
  const revert = async (i: number) => {
    const h = history[i];
    const ok = await askConfirm({ title: "ย้อนไปใช้ปุ่มชุดนี้?", message: `ชุดที่บันทึกเมื่อ ${fmtTime(h.saved_at)}${h.saved_by ? ` โดย ${h.saved_by}` : ""} · ชุดปัจจุบันจะเก็บเข้าประวัติ (ย้อนกลับมาได้)`, confirmText: "ย้อนไปชุดนี้" });
    if (ok && (await post({ revert_layout: i }))) { toast.success("ย้อนไปชุดที่เลือกแล้ว"); setShowHistory(false); }
  };
  const reset = async () => {
    const ok = await askConfirm({ title: "กลับเป็นค่าตั้งต้น?", message: "ปุ่มทั้ง 4 ชุดจะกลับเป็นแบบตามผัง (ชุดปัจจุบันเก็บเข้าประวัติ ย้อนกลับมาได้)", confirmText: "กลับเป็นค่าตั้งต้น" });
    if (ok && (await post({ reset_layout: true }))) toast.success("กลับเป็นค่าตั้งต้นแล้ว");
  };
  const realImage = async () => {
    setImgBusy(true);
    try {
      const r = await apiFetch("/api/admin/line-company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preview: { key: previewKey, layout: draft } }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error((j as { error?: string }).error || "วาดรูปไม่สำเร็จ"); }
      const url = URL.createObjectURL(await r.blob());
      setImg({ url, key: previewKey });
    } catch (e) { toast.error(e instanceof Error ? e.message : "วาดรูปไม่สำเร็จ"); }
    finally { setImgBusy(false); }
  };

  const lock = busy || saving;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-medium text-slate-600 mr-1">ปุ่มเมนู</span>
        {COMPANY_MENU_KINDS.map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`h-7 px-2.5 text-xs rounded-lg border ${k === kind ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600"}`}>
            {COMPANY_MENU_LABEL[k]} <span className="text-slate-400">{visibleButtons(draft[k]).length}</span>
          </button>
        ))}
        {dirty && <span className="text-[11px] text-amber-700 ml-1">ยังไม่บันทึก</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-3">
        <div>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {rows.map((b, i) => (
              <div key={b.act} {...drag.rowProps(i)} className={`${drag.rowCls(i)} flex items-center gap-1.5 px-2 py-1.5 ${b.hidden ? "bg-slate-50" : "bg-white"}`}>
                <DragHandle {...drag.handleProps(i)} title="ลากเพื่อเรียง" />
                <span className="w-4 text-[11px] text-slate-400 text-center shrink-0">{b.hidden ? "" : rows.slice(0, i + 1).filter((x) => !x.hidden).length}</span>
                <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-1">
                  <input value={b.label} maxLength={LABEL_MAX} disabled={lock} onChange={(e) => patch(i, { label: e.target.value })}
                    placeholder={COMPANY_ACTIONS[b.act].label} aria-label="ชื่อบนปุ่ม"
                    className={`h-8 px-2 text-xs border rounded-lg ${b.label.trim() ? "border-slate-200" : "border-rose-300"} ${b.hidden ? "text-slate-400" : "text-slate-800"}`} />
                  <input value={b.hint} maxLength={HINT_MAX} disabled={lock} onChange={(e) => patch(i, { hint: e.target.value })}
                    placeholder="คำอธิบายเล็ก (ไม่ใส่ก็ได้)" aria-label="คำอธิบายใต้ชื่อ"
                    className="h-8 px-2 text-xs border border-slate-200 rounded-lg text-slate-600" />
                  <div className="sm:col-span-2 text-[10px] text-slate-400">กดแล้ว: {COMPANY_ACTIONS[b.act].label}{b.hidden ? " · ซ่อนอยู่" : ""}</div>
                </div>
                <button type="button" disabled={lock} onClick={() => toggleHidden(i)} title={b.hidden ? "โชว์ปุ่มนี้" : "ซ่อนปุ่มนี้"}
                  className="h-7 w-7 rounded-lg border border-slate-200 text-slate-500 shrink-0 flex items-center justify-center"><Icon name={b.hidden ? "view" : "hide"} /></button>
                <button type="button" disabled={lock} onClick={() => remove(i)} title="เอาปุ่มนี้ออก"
                  className="h-7 w-7 rounded-lg border border-slate-200 text-rose-500 shrink-0 flex items-center justify-center"><Icon name="delete" /></button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {unused.length > 0 && (
              <select value="" disabled={lock} onChange={(e) => e.target.value && add(e.target.value as CompanyAction)}
                className="h-7 px-2 text-xs border border-slate-200 rounded-lg bg-white text-indigo-700">
                <option value="">+ เพิ่มปุ่ม…</option>
                {unused.map((a) => <option key={a} value={a}>{COMPANY_ACTIONS[a].label} — {COMPANY_ACTIONS[a].hint}</option>)}
              </select>
            )}
            <span className="text-[11px] text-slate-400">โชว์ {shownCount}/{MAX_MENU_BUTTONS} ปุ่ม · 1-3 ปุ่ม = แถวเดียว · 4 = 2×2 · 5-6 = 3×2</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-slate-500">ตัวอย่างในไลน์{kind === "admin" ? " (กดแท็บดูได้)" : ""}</span>
            <button type="button" disabled={imgBusy} onClick={() => void realImage()} className="text-[11px] text-indigo-600 underline disabled:opacity-50">
              {imgBusy ? "กำลังวาด…" : "ดูรูปจริง"}
            </button>
          </div>
          <MenuPreview kind={kind} buttons={draft[previewKind]} tab={tab} onTab={setTab} />
          {img && img.key === previewKey && (
            <div className="mt-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="รูปเมนูจริงที่จะส่งให้ LINE" className="w-full rounded-lg border border-slate-200" />
              <div className="text-[10px] text-slate-400 mt-0.5">รูปที่ระบบวาด ขนาด 2500 px (จากปุ่มที่แก้อยู่ ยังไม่บันทึกก็ดูได้)</div>
            </div>
          )}
          {images && <CompanyMenuImages menuKey={previewKey} layout={draft} images={images} onChanged={onSaved} />}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-1">
        <button type="button" disabled={lock || !dirty} onClick={() => void save()}
          className="h-8 px-3 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึกปุ่มเมนู"}</button>
        {dirty && <button type="button" disabled={lock} onClick={() => setDraft(layout)} className="h-8 px-3 text-xs rounded-lg border border-slate-200 text-slate-600">ยกเลิกที่แก้</button>}
        <button type="button" disabled={lock || history.length === 0} onClick={() => setShowHistory((v) => !v)}
          className="h-8 px-3 text-xs rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 inline-flex items-center gap-1"><Icon name="history" /> ชุดก่อน ๆ ({history.length})</button>
        <button type="button" disabled={lock} onClick={() => void reset()} className="h-8 px-3 text-xs rounded-lg border border-slate-200 text-slate-600">ค่าตั้งต้น</button>
        <span className="text-[11px] text-slate-400">บันทึกล่าสุด {fmtTime(savedAt)}</span>
      </div>

      {showHistory && history.length > 0 && (
        <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
          {history.map((h, i) => (
            <div key={`${h.saved_at ?? "default"}-${i}`} className="flex items-center gap-2 px-2 py-1.5 text-xs">
              <span className="w-28 text-slate-500 shrink-0">{fmtTime(h.saved_at)}</span>
              <span className="flex-1 min-w-0 truncate text-slate-600">
                {COMPANY_MENU_KINDS.map((k) => `${COMPANY_MENU_LABEL[k]}: ${visibleButtons(h.layout[k]).map((b) => b.label).join(" · ")}`).join("  |  ")}
              </span>
              {h.saved_by && <span className="text-slate-400 shrink-0 hidden sm:inline">{h.saved_by}</span>}
              <button type="button" disabled={lock} onClick={() => void revert(i)} className="h-6 px-2 rounded border border-slate-200 text-slate-600 shrink-0">ย้อนไปชุดนี้</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
