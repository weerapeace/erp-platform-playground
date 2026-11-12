"use client";

/**
 * เช็กลิสต์กลางแบบฝัง (ของกลาง) — ใช้ hook useRecordTasks ตัวเดียวกับ RecordTasksButton
 *   <RecordChecklist .../>     = ในฟอร์ม: ติ๊ก / กดข้อความเพื่อแก้ / ✕ ลบ / 👤 ผู้รับผิดชอบรายข้อ / เพิ่ม + ปุ่มลัด "ใช้บ่อย" + พับข้อที่เสร็จ
 *   <RecordChecklistChip .../> = บนการ์ด: ข้อที่รอเป็นช่องติ๊กได้เลย (สูงสุด 3 ข้อ) + ⋯ เด้งกล่องดูทั้งหมด/เพิ่ม (ไม่เปิดเรคคอร์ด · ไม่ลากการ์ด)
 * ค่าที่ใช้บ่อย = ค่ากลาง erp_lookups ชนิด presetType (⚙️ ข้างปุ่มลัด เปิดป๊อปแก้/ลากเรียง)
 * ผู้รับผิดชอบ = ของกลาง UserPicker (เฉพาะคนที่ยังทำงานอยู่) · ใส่ชื่อแล้วกระดิ่งเด้งบอกคนนั้น + เห็นใน "งานของคุณ" ของป๊อปตอนเข้า ERP
 * ลิงก์ต่อข้อ (🔗 · หลายลิงก์ + ชื่อกำกับไม่บังคับ) — ค่าที่ใช้บ่อยที่เปิดสวิตช์ 🔗 ไว้ (เช่น "ซื้อของ") กดแล้วเปิดช่องวางลิงก์ให้เลย
 * ใช้แล้วที่: ใบงานออกแบบ "⏳ รออะไรอยู่" (lib/design-sheet-waiting) · แผนงานทีม "เช็กลิสต์ในงาน" (lib/team-plan TEAM_PLAN_CHECK) · doc: docs/record-tasks.md
 * แม่แบบหลายข้อ (templateType · 2026-11-12) = ค่ากลาง erp_lookups name = ชื่อแม่แบบ · metadata.items = ข้อ → "ใส่จากแม่แบบ" / "บันทึกเป็นแม่แบบ"
 * ป้ายบนการ์ด variant="progress" = "เสร็จ 2/4" + แถบความคืบหน้า (กดแล้วเด้งกล่องติ๊ก) · ค่าเริ่ม "waiting" = แถวสิ่งที่รอแบบเดิม
 *   <ChecklistPresetsEditor .../> = ป๊อปตั้งค่าค่าที่ใช้บ่อย (ตัวเดียวกับ ⚙️) เปิดจากที่อื่นได้ เช่น เมนูตั้งค่า Design Dashboard → Checklist งานใหม่
 *   <ChecklistSeedPicker .../>    = เลือกข้อที่จะใส่ "ตอนสร้าง" (ยังไม่มีเลขเรคคอร์ด) — ตั้งต้น = ข้อที่เปิดสวิตช์ "ใบใหม่" · ส่งไปกับการสร้าง → seedChecklistOnCreate(..., explicit)
 */
import { useRef, useState, type KeyboardEvent, type ReactNode, type SyntheticEvent } from "react";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { LookupValuesEditor, refreshLookup, useLookupRows, type LookupFlag, type LookupRow } from "@/components/lookup-values-editor";
import { Icon } from "@/components/icon";
import { UserPicker, useRecentUsers } from "@/components/pickers";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { checklistProgress, isAutoNewPreset, isTaskDone, MAX_TASK_LINKS, parseTaskLinkUrl, PRESET_AUTO_NEW, summarizeTasks, taskTitleWithLinks, taskWithWho, TEMPLATE_MAX_ITEMS, templateItems, templateTitlesToAdd, type ChecklistSummary, type TaskLink } from "@/lib/record-tasks";
import type { RecordTask } from "@/app/api/record-tasks/route";
import { relTime, useRecordTasks } from "./use-record-tasks";
import { TaskLinkList, TaskLinksButton } from "./task-links";

export { TaskLinkList, TaskLinksButton };

type Common = {
  moduleKey: string;
  recordType?: string | null;
  recordId: string;
  canEdit: boolean;
  /** แก้แล้ว → สรุปใหม่ (ให้หน้าแม่อัปเดตการ์ด/ตัวนับ) */
  onChange?: (summary: ChecklistSummary) => void;
};

const tickCls = (done: boolean) =>
  `mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none ${done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent hover:border-emerald-400"}`;

const AV_COLORS = ["#7F77DD", "#1D9E75", "#D85A30", "#378ADD", "#D4537E", "#639922", "#BA7517"];
const avColor = (name: string) => AV_COLORS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AV_COLORS.length];

/** ชิปผู้รับผิดชอบ — มีชื่อ = วงกลมตัวแรก + ชื่อ · ไม่มี = เส้นประ "👤 ใคร" */
export function WhoChip({ name, onClick, compact = false, title }: { name: string | null | undefined; onClick?: () => void; compact?: boolean; title?: string }) {
  const cls = `inline-flex shrink-0 items-center gap-1 rounded-full border text-[11px] whitespace-nowrap ${compact ? "h-5" : "h-6"} ${onClick ? "cursor-pointer hover:bg-slate-50" : "cursor-default"}`;
  const inner = name
    ? <><span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white" style={{ backgroundColor: avColor(name) }}>{[...name][0]}</span><span className="max-w-[7rem] truncate pr-1.5 text-slate-700">{name}</span></>
    : <span className="px-1.5 text-slate-400">👤 ใคร</span>;
  return onClick
    ? <button type="button" onClick={onClick} title={title ?? (name ? `ผู้รับผิดชอบ: ${name} (กดเพื่อเปลี่ยน)` : "ใส่ผู้รับผิดชอบ")} className={`${cls} ${name ? "border-slate-200 pl-0.5" : "border-dashed border-slate-300"}`}>{inner}</button>
    : <span className={`${cls} ${name ? "border-slate-200 pl-0.5" : "border-dashed border-slate-300"}`}>{inner}</span>;
}

/** เลือกผู้รับผิดชอบแบบเปิดในแถว (ไม่ซ้อน popover กับรายการของ UserPicker)
 *  3 คนที่เลือกล่าสุด = ปุ่มลัดกดได้เลย ไม่ต้องพิมพ์ (ของกลาง useRecentUsers · ประวัติเดียวกับ UserPicker) */
export function WhoPicker({ onPick, onCancel, allowNone }: { onPick: (u: { id: string; name: string } | null) => void; onCancel: () => void; allowNone: boolean }) {
  const { recent, remember } = useRecentUsers(3);
  return (
    <div className="ml-6 mt-1 flex flex-wrap items-center gap-1.5 rounded-md bg-slate-50 p-1.5">
      {recent.length > 0 && (
        <div className="flex w-full flex-wrap items-center gap-1">
          <span className="text-[11px] text-slate-400">ล่าสุด:</span>
          {recent.map((u) => (
            <WhoChip key={u.id} name={u.name} title={`เลือก ${u.name}`} onClick={() => { remember(u); onPick({ id: u.id, name: u.name }); }} />
          ))}
        </div>
      )}
      <div className="min-w-[12rem] flex-1"><UserPicker value={null} onChange={(u) => { if (u) onPick({ id: u.id, name: u.name }); }} placeholder="พิมพ์ชื่อคนรับผิดชอบ…" /></div>
      {allowNone && <button type="button" onClick={() => onPick(null)} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-600 hover:bg-slate-100">ไม่ระบุ</button>}
      <button type="button" onClick={onCancel} className="h-8 rounded-md px-2 text-xs text-slate-500 hover:text-slate-800">ยกเลิก</button>
    </div>
  );
}

/** สวิตช์ในป๊อปตั้งค่าปุ่มลัด: ค่านี้กดแล้วเปิดช่องลิงก์ให้เอง (metadata.links ของค่ากลาง) */
const PRESET_FLAGS: LookupFlag[] = [{ key: "links", label: "🔗", title: "กดปุ่มนี้แล้วเปิดช่องวางลิงก์ให้เลย (เช่น ซื้อของ)" }];
/** สวิตช์ "ใส่ให้เองตอนสร้างใหม่" (metadata.auto_new) — โชว์เฉพาะเช็กลิสต์ที่ฝั่งสร้างเรียก seedChecklistOnCreate (prop autoNew) */
const AUTO_NEW_FLAG: LookupFlag = { key: PRESET_AUTO_NEW, label: "ใบใหม่", title: "ใส่ข้อนี้ให้เองทุกครั้งที่สร้างใบใหม่" };

/** ช่องเพิ่มลิงก์ใต้ข้อ — วางลิงก์ + ชื่อกำกับ (ไม่บังคับ) · Enter = เพิ่ม · ไม่ใช่ลิงก์/ซ้ำ = เตือน ไม่บันทึก */
function LinkAdder({ existing, onAdd, onClose }: { existing: TaskLink[]; onAdd: (l: TaskLink) => Promise<boolean>; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const full = existing.length >= MAX_TASK_LINKS;
  const submit = async () => {
    const u = parseTaskLinkUrl(url);
    if (!u) { setErr(url.trim() ? "ลิงก์ไม่ถูกต้อง — วางลิงก์ที่ขึ้นต้นด้วย https://" : "วางลิงก์ก่อน"); return; }
    if (existing.some((l) => l.url === u)) { setErr("มีลิงก์นี้แล้ว"); return; }
    setBusy(true);
    const ok = await onAdd({ url: u, label: label.trim() || null });
    setBusy(false);
    if (ok) { setUrl(""); setLabel(""); }
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } if (e.key === "Escape") onClose(); };
  return (
    <div className="ml-6 mt-1 rounded-md bg-slate-50 p-1.5">
      {full ? <div className="px-1 text-xs text-slate-500">ใส่ลิงก์ครบ {MAX_TASK_LINKS} อันแล้ว — เอาอันเดิมออกก่อน</div> : (
        <div className="flex flex-wrap gap-1.5">
          <input autoFocus value={url} onChange={(e) => { setUrl(e.target.value); setErr(null); }} onKeyDown={onKey} disabled={busy}
            placeholder="วางลิงก์ร้าน แล้วกด Enter" aria-label="ลิงก์"
            className="h-8 min-w-[12rem] flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} onKeyDown={onKey} disabled={busy}
            placeholder="ชื่อ (ไม่บังคับ)" aria-label="ชื่อกำกับลิงก์"
            className="h-8 w-36 rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="button" onClick={() => void submit()} disabled={busy} className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50">＋ ลิงก์</button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-2 text-xs text-slate-500 hover:text-slate-800">เสร็จ</button>
        </div>
      )}
      {err && <p className="px-1 pt-1 text-xs text-rose-600">{err}</p>}
    </div>
  );
}

export function RecordChecklist({ moduleKey, recordType = null, recordId, canEdit, onChange, presetType = null, label = null,
  emptyText = "ไม่มีอะไรรอ", placeholder = "＋ เพิ่มสิ่งที่รอ… (Enter)", presetTitle = "ค่าที่ใช้บ่อย", assignable = true, autoNew = false, templateType = null }: Common & {
  /** ชนิดค่ากลางของ "แม่แบบหลายข้อ" (null = ไม่มีแถบแม่แบบ) — name = ชื่อแม่แบบ · metadata.items = ข้อในแม่แบบ */
  templateType?: string | null;
  /** ชนิดค่ากลางของปุ่มลัด (null = ไม่มีปุ่มลัด) */
  presetType?: string | null;
  /** ป๊อปตั้งค่าปุ่มลัดมีสวิตช์ "ใส่ให้เองตอนสร้างใหม่" — ใส่เฉพาะเรคคอร์ดที่ API สร้างเรียก seedChecklistOnCreate แล้ว */
  autoNew?: boolean;
  label?: ReactNode;
  emptyText?: string;
  placeholder?: string;
  presetTitle?: string;
  /** ใส่ผู้รับผิดชอบรายข้อได้ */
  assignable?: boolean;
}) {
  const { items, loading, loaded, add, toggle, rename, assign, setLinks, remove } = useRecordTasks({
    moduleKey, recordId, recordType, onChange: onChange ? (list) => onChange(summarizeTasks(list)) : undefined,
  });
  const presetRows = useLookupRows(presetType);
  const presets = presetRows.map((r) => r.name);
  const linkPresets = new Set(presetRows.filter((r) => r.metadata.links).map((r) => r.name.trim()));   // ค่าที่เปิดช่องลิงก์ให้เอง
  const [linkFor, setLinkFor] = useState<string | null>(null);   // id ข้อที่เปิดช่องเพิ่มลิงก์อยู่
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  // แม่แบบหลายข้อ
  const tplRows = useLookupRows(templateType);
  const [tplName, setTplName] = useState<string | null>(null);   // null = ไม่ได้กำลังตั้งชื่อแม่แบบ
  const [tplOpen, setTplOpen] = useState(false);
  const toastT = useToast();
  const applyTemplate = async (r: LookupRow) => {
    const todo = templateTitlesToAdd(items.map((i) => i.title), templateItems(r.metadata));
    if (!todo.length) { toastT.info(`ข้อในแม่แบบ "${r.name}" มีครบแล้ว`); return; }
    setBusy(true);
    let n = 0;
    for (const t of todo) { if (await add(t)) n++; }   // ทีละข้อ = ลำดับตามแม่แบบ
    setBusy(false);
    if (n) toastT.success(`ใส่จากแม่แบบ "${r.name}" แล้ว ${n} ข้อ`);
  };
  const saveTemplate = async () => {
    const name = (tplName ?? "").trim().slice(0, 80);
    if (!name || !templateType) { toastT.error("ตั้งชื่อแม่แบบก่อน"); return; }
    const list = items.map((i) => i.title.trim()).filter(Boolean).slice(0, TEMPLATE_MAX_ITEMS);
    if (!list.length) { toastT.error("ยังไม่มีข้อให้บันทึกเป็นแม่แบบ"); return; }
    const same = tplRows.find((r) => r.name.trim() === name);
    setBusy(true);
    try {
      const res = same
        ? await apiFetch(`/api/lookups/${same.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metadata: { ...same.metadata, items: list } }) })
        : await apiFetch("/api/lookups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lookup_type: templateType, name, metadata: { items: list }, sort_order: tplRows.length }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกแม่แบบไม่สำเร็จ");
      refreshLookup(templateType);
      setTplName(null);
      toastT.success(same ? `อัปเดตแม่แบบ "${name}" แล้ว (${list.length} ข้อ)` : `บันทึกแม่แบบ "${name}" แล้ว (${list.length} ข้อ)`);
    } catch (e) { toastT.error(e instanceof Error ? e.message : "บันทึกแม่แบบไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const [showDone, setShowDone] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [pickFor, setPickFor] = useState<string | null>(null);   // id ข้อที่กำลังเลือกคน · "new" = ข้อที่กำลังจะเพิ่ม
  const [newWho, setNewWho] = useState<{ id: string; name: string } | null>(null);

  const openItems = items.filter((t) => !isTaskDone(t.status));
  const doneItems = items.filter((t) => isTaskDone(t.status));
  const quick = presets.filter((p) => !openItems.some((i) => i.title.trim() === p.trim()));   // ข้อที่มีอยู่แล้ว ไม่ต้องโชว์ปุ่มลัดซ้ำ

  const submit = async (t: string) => {
    if (!t.trim()) { setErr(true); return; }
    setBusy(true);
    const created = await add(t, newWho);
    setBusy(false);
    if (created) {
      if (t === text) setText(""); setNewWho(null); if (pickFor === "new") setPickFor(null);
      if (linkPresets.has(created.title.trim())) setLinkFor(created.id);   // เช่น "ซื้อของ" → เปิดช่องวางลิงก์ให้เลย
    }
  };
  const commitEdit = () => { const e = editing; setEditing(null); if (e) { const it = items.find((x) => x.id === e.id); if (it) void rename(it, e.text); } };

  const row = (it: RecordTask) => {
    const done = isTaskDone(it.status);
    const meta = (done ? ["✓", [it.resolved_by, relTime(it.resolved_at)].filter(Boolean).join(" · ")] : [[it.created_by, relTime(it.created_at)].filter(Boolean).join(" · ")]).join(" ");
    return (
      <div key={it.id}>
      <div className="group flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50">
        <button type="button" onClick={() => canEdit && void toggle(it)} disabled={!canEdit} className={tickCls(done)}
          title={done ? "ทำเครื่องหมายว่ายังรอ" : "ติ๊กว่าเสร็จ"} aria-label={done ? `ยกเลิกติ๊ก ${it.title}` : `ติ๊กเสร็จ ${it.title}`}>✓</button>
        <div className="min-w-0 flex-1">
          {editing?.id === it.id ? (
            <input autoFocus value={editing.text} maxLength={300} aria-label="ข้อความ"
              onChange={(e) => setEditing({ id: it.id, text: e.target.value })} onBlur={commitEdit}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitEdit(); } if (e.key === "Escape") setEditing(null); }}
              className="h-7 w-full rounded-md border border-blue-400 bg-white px-1.5 text-sm focus:outline-none" />
          ) : (
            <button type="button" disabled={!canEdit} onClick={() => setEditing({ id: it.id, text: it.title })} title={canEdit ? "กดเพื่อแก้" : undefined}
              className={`block w-full break-words text-left text-sm disabled:cursor-default ${done ? "text-slate-400 line-through" : "text-slate-700"}`}>{it.title}</button>
          )}
          <TaskLinkList links={it.links} className="mt-0.5" onRemove={canEdit ? (url) => void setLinks(it, (it.links ?? []).filter((l) => l.url !== url)) : undefined} />
        </div>
        {canEdit && (
          <button type="button" onClick={() => setLinkFor(linkFor === it.id ? null : it.id)} aria-pressed={linkFor === it.id}
            title={it.links?.length ? `ลิงก์ ${it.links.length} อัน — กดเพื่อเพิ่ม` : "ใส่ลิงก์ (เช่น ร้านที่จะซื้อ)"}
            className={`inline-flex h-6 shrink-0 items-center rounded-full border px-1.5 text-[11px] ${it.links?.length ? "border-slate-200 text-blue-700 hover:bg-blue-50" : "border-dashed border-slate-300 text-slate-400 opacity-0 hover:text-slate-600 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"} ${linkFor === it.id ? "!opacity-100 bg-blue-50" : ""}`}>
            🔗{it.links?.length ? ` ${it.links.length}` : ""}
          </button>
        )}
        {assignable && (it.assigned_name || canEdit) && <WhoChip name={it.assigned_name} onClick={canEdit ? () => setPickFor(pickFor === it.id ? null : it.id) : undefined} />}
        <span className="mt-0.5 hidden shrink-0 whitespace-nowrap text-[10px] text-slate-400 sm:inline">{meta}</span>
        {canEdit && (
          <button type="button" onClick={() => void remove(it)} title="ลบ" aria-label={`ลบ ${it.title}`}
            className="mt-0.5 shrink-0 px-0.5 text-xs text-slate-300 opacity-0 hover:text-rose-500 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100">✕</button>
        )}
      </div>
      {pickFor === it.id && <WhoPicker allowNone={!!it.assigned_to} onCancel={() => setPickFor(null)} onPick={(u) => { setPickFor(null); void assign(it, u); }} />}
      {linkFor === it.id && canEdit && <LinkAdder existing={it.links ?? []} onClose={() => setLinkFor(null)} onAdd={(l) => setLinks(it, [...(it.links ?? []), l])} />}
      </div>
    );
  };

  return (
    <div>
      {label && (
        <div className="text-[11px] text-slate-500">
          {label}{items.length > 0 && <span className="text-slate-400"> · เหลือ {openItems.length}/{items.length}</span>}
        </div>
      )}
      <div className="mt-0.5 rounded-lg border border-slate-200 bg-white p-1">
        {!loaded && loading ? <div className="px-2 py-1.5 text-xs text-slate-400">กำลังโหลด…</div>
          : openItems.length ? openItems.map(row)
          : <div className="px-2 py-1.5 text-xs text-slate-400">{emptyText}</div>}
        {canEdit && (
          <div className="flex gap-1.5 px-1 pt-1">
            <input value={text} maxLength={300} placeholder={placeholder} aria-label="เพิ่มรายการ"
              onChange={(e) => { setText(e.target.value); setErr(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(text); } }}
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {assignable && <span className="flex items-center"><WhoChip name={newWho?.name} onClick={() => setPickFor(pickFor === "new" ? null : "new")} /></span>}
            <button type="button" onClick={() => void submit(text)} disabled={busy} className="h-8 shrink-0 rounded-md border border-slate-300 px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">เพิ่ม</button>
          </div>
        )}
        {pickFor === "new" && <WhoPicker allowNone={!!newWho} onCancel={() => setPickFor(null)} onPick={(u) => { setNewWho(u); setPickFor(null); }} />}
        {err && <p className="px-2 pt-1 text-xs text-rose-600">พิมพ์ข้อความก่อน</p>}
        {canEdit && presetType && (
          <div className="flex flex-wrap items-center gap-1 px-1 pb-0.5 pt-1.5">
            {quick.length > 0 && <span className="text-[11px] text-slate-400">ใช้บ่อย:</span>}
            {quick.map((p) => (
              <button key={p} type="button" onClick={() => void submit(p)} disabled={busy}
                className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50">＋ {p}</button>
            ))}
            <button type="button" onClick={() => setPresetOpen(true)} title={`ตั้งค่า${presetTitle} (เพิ่ม · แก้ · ลากเรียง)`}
              className="ml-auto rounded px-1 text-[11px] text-slate-400 hover:text-blue-600">⚙️ ตั้งค่า</button>
          </div>
        )}
        {canEdit && templateType && (
          <div className="flex flex-wrap items-center gap-1.5 px-1 pb-0.5 pt-1.5">
            <span className="text-[11px] text-slate-400"><Icon name="documents" /> แม่แบบ:</span>
            <select value="" disabled={busy || tplRows.length === 0} aria-label="ใส่จากแม่แบบ"
              onChange={(e) => { const r = tplRows.find((x) => x.id === e.target.value); if (r) void applyTemplate(r); }}
              className="h-7 max-w-[14rem] rounded-md border border-slate-200 bg-white px-1.5 text-[11px] text-slate-600 disabled:opacity-60">
              <option value="">{tplRows.length ? "ใส่จากแม่แบบ…" : "ยังไม่มีแม่แบบ"}</option>
              {tplRows.map((r) => <option key={r.id} value={r.id}>{r.name} ({templateItems(r.metadata).length} ข้อ)</option>)}
            </select>
            {items.length > 0 && (tplName === null
              ? <button type="button" onClick={() => setTplName("")} disabled={busy} title="เก็บข้อทั้งหมดในเช็กลิสต์นี้ไว้ใช้กับงานอื่น (ชื่อซ้ำ = บันทึกทับ)"
                  className="h-7 rounded-md border border-dashed border-slate-300 px-2 text-[11px] text-slate-600 hover:border-blue-400 hover:text-blue-700"><Icon name="save" /> บันทึกเป็นแม่แบบ</button>
              : <span className="flex items-center gap-1">
                  <input autoFocus value={tplName} maxLength={80} placeholder="ชื่อแม่แบบ เช่น ลงรูปเว็บไซต์" aria-label="ชื่อแม่แบบ"
                    onChange={(e) => setTplName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveTemplate(); } if (e.key === "Escape") setTplName(null); }}
                    className="h-7 w-44 rounded-md border border-blue-300 px-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <button type="button" onClick={() => void saveTemplate()} disabled={busy} className="h-7 rounded-md bg-blue-600 px-2 text-[11px] text-white hover:bg-blue-700 disabled:opacity-50">บันทึก</button>
                  <button type="button" onClick={() => setTplName(null)} className="h-7 px-1 text-[11px] text-slate-400 hover:text-slate-700">ยกเลิก</button>
                </span>)}
            {tplRows.length > 0 && <button type="button" onClick={() => setTplOpen(true)} title="เปลี่ยนชื่อ · ลากเรียง · เอาแม่แบบที่ไม่ใช้ออก"
              className="ml-auto rounded px-1 text-[11px] text-slate-400 hover:text-blue-600"><Icon name="settings" /> จัดการแม่แบบ</button>}
          </div>
        )}
        {doneItems.length > 0 && (
          <div className="mt-1 border-t border-slate-100 pt-0.5">
            <button type="button" onClick={() => setShowDone((s) => !s)} className="px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-slate-800">
              {showDone ? "▾" : "▸"} เสร็จแล้ว {doneItems.length} ข้อ
            </button>
            {showDone && doneItems.map(row)}
          </div>
        )}
      </div>
      {templateType && <LookupValuesEditor lookupType={templateType} open={tplOpen} onClose={() => setTplOpen(false)} title="แม่แบบเช็กลิสต์"
        description="กดชื่อเพื่อเปลี่ยนชื่อ · ลากเรียง · เอาออก = ไม่โชว์ในรายการ (เรียกคืนได้ที่หน้าค่ากลาง) · แก้ข้อในแม่แบบ = ทำเช็กลิสต์ในงานใหม่แล้วกด บันทึกเป็นแม่แบบ ด้วยชื่อเดิม" />}
      {presetType && <LookupValuesEditor lookupType={presetType} open={presetOpen} onClose={() => setPresetOpen(false)} title={presetTitle}
        flags={autoNew ? [...PRESET_FLAGS, AUTO_NEW_FLAG] : PRESET_FLAGS}
        description={`เพิ่ม · กดชื่อเพื่อแก้ · ลากเรียงลำดับ · 🔗 = กดแล้วเปิดช่องวางลิงก์ให้เลย${autoNew ? " · ใบใหม่ = ใส่ข้อนี้ให้เองตอนสร้างใบใหม่" : ""} · ใช้ร่วมกันทั้งทีม`} />}
    </div>
  );
}

/** แถบบนการ์ด — ไม่มีรายการเลย = ไม่โชว์ (การ์ดสั้นเท่าเดิม) · เสร็จครบ = "✓ ไม่มีอะไรรอแล้ว"
 *  สรุปมี ids (API รายการรุ่นใหม่) = ติ๊กบนการ์ดได้เลยทีละข้อ (สูงสุด CHIP_ROWS ข้อ · ติ๊กแล้วขีดฆ่า กดซ้ำ = ยกเลิก) + ปุ่ม ⋯ เปิดกล่องดูทั้งหมด/เพิ่ม
 *  ติ๊กได้ = canEdit หรือเป็นผู้รับผิดชอบข้อนั้น (กฎเดียวกับ PATCH /api/record-tasks/[id]) */
const CHIP_ROWS = 3;
type ChipRow = { id: string; title: string; who: string | null; aid: string | null; links: TaskLink[] };
export function RecordChecklistChip({ moduleKey, recordType = null, recordId, canEdit, onChange, summary, variant = "waiting" }: Common & {
  /** สรุปจาก API รายการ (ไม่ต้องยิงทีละการ์ด) */
  summary: ChecklistSummary | null | undefined;
  /** "waiting" (ค่าเริ่ม) = แถวสิ่งที่รอ ติ๊กบนการ์ดได้ · "progress" = ป้ายเล็ก "เสร็จ 2/4" + แถบความคืบหน้า กดแล้วเด้งกล่องติ๊ก (การ์ดสั้นเท่าเดิม) */
  variant?: "waiting" | "progress";
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const toast = useToast();
  const [doneLocal, setDoneLocal] = useState<ChipRow[]>([]);   // เพิ่งติ๊กบนการ์ด — ยังโชว์ขีดฆ่าให้กดยกเลิกได้
  const [busy, setBusy] = useState<string | null>(null);
  if (!summary || (summary.open.length === 0 && summary.done === 0 && !open && doneLocal.length === 0)) return null;
  // กันคลิก/พิมพ์ในแถบและกล่อง (portal) ไหลไปเปิดการ์ด / ลากการ์ด
  const stop = (e: SyntheticEvent) => e.stopPropagation();

  // ── ป้ายความคืบหน้า (แผนงานทีม) ──
  if (variant === "progress") {
    const p = checklistProgress(summary);
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
    return (
      <span className="inline-flex" onClick={stop} onKeyDown={stop} onMouseDown={stop} onPointerDown={stop}>
        <button ref={anchorRef} type="button" onClick={() => setOpen((o) => !o)} draggable={false} onDragStart={(e) => e.preventDefault()}
          title={p.allDone ? "เช็กลิสต์ครบทุกข้อแล้ว — กดเพื่อดู" : `เช็กลิสต์เสร็จ ${p.done} จาก ${p.total} ข้อ — กดเพื่อติ๊ก${canEdit ? " / เพิ่ม" : ""}`}
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap ${p.allDone ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"} hover:ring-1 hover:ring-slate-300`}>
          <Icon name="done" /> {p.done}/{p.total}
          <span className="h-1 w-8 overflow-hidden rounded-full bg-white/80" aria-hidden><span className={`block h-1 rounded-full ${p.allDone ? "bg-emerald-500" : "bg-emerald-400"}`} style={{ width: `${pct}%` }} /></span>
        </button>
        <FloatingDropdown anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} minWidth={240} maxWidth={320}>
          {open && <ChipPanel moduleKey={moduleKey} recordType={recordType} recordId={recordId} canEdit={canEdit} onChange={onChange} variant="progress" />}
        </FloatingDropdown>
      </span>
    );
  }
  const rows: ChipRow[] | null = summary.ids && summary.ids.length === summary.open.length
    ? summary.open.map((title, i) => ({ id: summary.ids![i], title, who: summary.who?.[i] ?? null, aid: summary.aids?.[i] ?? null, links: summary.links?.[i] ?? [] }))
    : null;

  // ── ติ๊กตรงบนการ์ด ──
  if (rows) {
    const canTick = (r: ChipRow) => canEdit || (!!user && r.aid === user.id);
    const struck = doneLocal.filter((d) => !rows.some((r) => r.id === d.id));
    const setStatus = async (r: ChipRow, done: boolean) => {
      if (busy) return;
      setBusy(r.id);
      try {
        const res = await apiFetch(`/api/record-tasks/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: done ? "resolved" : "open", actor: user?.name }) });
        if (!res.ok) throw new Error();
        const idx = rows.findIndex((x) => x.id === r.id);
        if (done) {
          setDoneLocal((d) => [...d.filter((x) => x.id !== r.id), r]);
          if (idx >= 0) onChange?.({ open: summary.open.filter((_, i) => i !== idx), who: summary.who?.filter((_, i) => i !== idx), ids: summary.ids!.filter((_, i) => i !== idx), aids: summary.aids?.filter((_, i) => i !== idx), links: summary.links?.filter((_, i) => i !== idx), done: summary.done + 1 });
        } else {
          setDoneLocal((d) => d.filter((x) => x.id !== r.id));
          onChange?.({ open: [...summary.open, r.title], who: [...(summary.who ?? summary.open.map(() => null)), r.who], ids: [...summary.ids!, r.id], aids: [...(summary.aids ?? summary.open.map(() => null)), r.aid],
            links: summary.links || r.links.length ? [...(summary.links ?? summary.open.map(() => [])), r.links] : undefined, done: Math.max(0, summary.done - 1) });
        }
      } catch { toast.error("ติ๊กไม่สำเร็จ ลองใหม่อีกครั้ง"); }
      finally { setBusy(null); }
    };
    const rowBtn = (r: ChipRow, done: boolean) => {
      const can = canTick(r);
      // ปุ่มติ๊กกับปุ่มลิงก์แยกกัน (ห้ามซ้อนปุ่มในปุ่ม) · ลิงก์โชว์เฉพาะข้อที่ยังรอ
      return (
        <span key={r.id} className={`flex w-full min-w-0 items-start rounded-md ${done ? "bg-emerald-50" : "bg-amber-50"}`}>
          <button type="button" draggable={false} onDragStart={(e) => e.preventDefault()} disabled={!can || busy === r.id}
            onClick={() => void setStatus(r, !done)}
            title={can ? (done ? "กดเพื่อยกเลิกติ๊ก" : "ติ๊กเมื่อเสร็จ") : "ติ๊กได้เฉพาะคนที่แก้ใบงานได้ / ผู้รับผิดชอบข้อนี้"}
            className={`flex min-w-0 flex-1 items-start gap-1.5 rounded-md px-1.5 py-0.5 text-left text-[11px] transition ${done ? "text-slate-400" : "text-amber-900"} ${can ? "hover:bg-amber-100" : "cursor-default"} ${busy === r.id ? "opacity-60" : ""}`}>
            <span className={tickCls(done)}>✓</span>
            <span className={`min-w-0 flex-1 truncate ${done ? "line-through" : ""}`} title={taskTitleWithLinks(r.title, r.links)}>{taskTitleWithLinks(r.title, r.links)}{r.who && <span className={done ? "" : "text-amber-700/70"}> · {r.who}</span>}</span>
          </button>
          {!done && <TaskLinksButton links={r.links} />}
        </span>
      );
    };
    return (
      <span className="mt-1 block space-y-0.5" onClick={stop} onKeyDown={stop} onMouseDown={stop} onPointerDown={stop}>
        {rows.slice(0, CHIP_ROWS).map((r) => rowBtn(r, false))}
        {struck.map((r) => rowBtn(r, true))}
        {rows.length === 0 && struck.length === 0 && <span className="block text-[10px] text-emerald-600">✓ ไม่มีอะไรรอแล้ว</span>}
        <button ref={anchorRef} type="button" onClick={() => setOpen((o) => !o)} draggable={false} onDragStart={(e) => e.preventDefault()}
          title="ดูทั้งหมด / เพิ่มสิ่งที่รอ" className="rounded px-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100">
          {rows.length > CHIP_ROWS ? `+${rows.length - CHIP_ROWS} ข้อ ⋯` : canEdit ? "＋ เพิ่ม ⋯" : "⋯"}
        </button>
        <FloatingDropdown anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} minWidth={240} maxWidth={320}>
          {open && <ChipPanel moduleKey={moduleKey} recordType={recordType} recordId={recordId} canEdit={canEdit} onChange={onChange} />}
        </FloatingDropdown>
      </span>
    );
  }

  // ── สรุปแบบเก่า (ไม่มี ids) = แถบเดียว กดแล้วเด้งกล่องติ๊ก ──
  if (summary.open.length === 0 && !open) return <div className="mt-1 text-[10px] text-emerald-600">✓ ไม่มีอะไรรอแล้ว</div>;
  return (
    <span className="block" onClick={stop} onKeyDown={stop} onMouseDown={stop} onPointerDown={stop}>
      <button ref={anchorRef} type="button" onClick={() => setOpen((o) => !o)} draggable={false} onDragStart={(e) => e.preventDefault()}
        title="กดเพื่อติ๊ก / เพิ่มสิ่งที่รอ"
        className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100">
        <span className="shrink-0">⏳</span>
        <span className="truncate">{summary.open[0] ? taskWithWho(summary.open[0], summary.who?.[0]) : "ไม่มีอะไรรอแล้ว"}</span>
        {summary.open.length > 1 && <span className="shrink-0 font-semibold">+{summary.open.length - 1}</span>}
      </button>
      <FloatingDropdown anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} minWidth={240} maxWidth={320}>
        {open && <ChipPanel moduleKey={moduleKey} recordType={recordType} recordId={recordId} canEdit={canEdit} onChange={onChange} />}
      </FloatingDropdown>
    </span>
  );
}

function ChipPanel({ moduleKey, recordType, recordId, canEdit, onChange, variant = "waiting" }: Common & { variant?: "waiting" | "progress" }) {
  const prog = variant === "progress";
  const { items, loading, loaded, add, toggle } = useRecordTasks({
    moduleKey, recordId, recordType, onChange: onChange ? (list) => onChange(summarizeTasks(list)) : undefined,
  });
  const [text, setText] = useState("");
  const [touched, setTouched] = useState<Set<string>>(new Set());   // ข้อที่เพิ่งติ๊กในกล่องนี้ — ยังโชว์ (ขีดฆ่า) จนกว่าจะปิด กดผิดแก้ได้
  const shown = items.filter((t) => !isTaskDone(t.status) || touched.has(t.id));
  const openCount = items.filter((t) => !isTaskDone(t.status)).length;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-2xl">
      <div className="mb-1 px-1 text-[11px] text-slate-500">{prog ? <><Icon name="done" /> เช็กลิสต์{items.length > 0 && ` · เสร็จ ${items.length - openCount}/${items.length}`}</> : <>⏳ รออะไรอยู่{items.length > 0 && ` · เหลือ ${openCount}/${items.length}`}</>}</div>
      {!loaded && loading ? <div className="px-1 py-2 text-xs text-slate-400">กำลังโหลด…</div> : (
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {shown.length === 0 && <div className="px-1 py-1 text-xs text-slate-400">{prog ? "เสร็จครบทุกข้อแล้ว" : "ไม่มีอะไรรอแล้ว"}</div>}
          {shown.map((it) => {
            const done = isTaskDone(it.status);
            return (
              <label key={it.id} className={`flex items-start gap-2 rounded-md px-1 py-1 text-sm ${canEdit ? "cursor-pointer hover:bg-slate-50" : ""}`}>
                <button type="button" disabled={!canEdit} className={tickCls(done)} aria-label={done ? `ยกเลิกติ๊ก ${it.title}` : `ติ๊กเสร็จ ${it.title}`}
                  onClick={() => { setTouched((s) => new Set(s).add(it.id)); void toggle(it); }}>✓</button>
                <span className={`min-w-0 flex-1 break-words ${done ? "text-slate-400 line-through" : "text-slate-700"}`}>{it.title}<TaskLinkList links={it.links} className="mt-0.5" /></span>
                {it.assigned_name && <WhoChip name={it.assigned_name} compact />}
              </label>
            );
          })}
        </div>
      )}
      {canEdit && (
        <input value={text} maxLength={300} placeholder={prog ? "＋ เพิ่มข้อ… (Enter)" : "＋ เพิ่ม… (Enter)"} aria-label={prog ? "เพิ่มข้อในเช็กลิสต์" : "เพิ่มสิ่งที่รอ"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { e.preventDefault(); const t = text; void add(t).then((ok) => { if (ok) setText(""); }); } }}
          className="mt-1.5 h-8 w-full rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      )}
      <div className="mt-1.5 px-1 text-[10px] text-slate-400">{prog ? "เปิดงานเพื่อแก้/ลบ หรือใช้แม่แบบ" : "เปิดใบงานเพื่อแก้/ลบ หรือดูข้อที่เสร็จแล้ว"}</div>
    </div>
  );
}

/** ป๊อปตั้งค่า "ค่าที่ใช้บ่อย" ของเช็กลิสต์ — ตัวเดียวกับปุ่ม ⚙️ ในเช็กลิสต์ แต่เปิดจากที่อื่นได้ (เช่น เมนูตั้งค่า Design Dashboard)
 *  autoNew = โชว์สวิตช์ "ใบใหม่" (ใส่ข้อนี้ให้เองตอนสร้างใบใหม่) */
export function ChecklistPresetsEditor({ presetType, open, onClose, title = "ค่าที่ใช้บ่อย", autoNew = true }: {
  presetType: string; open: boolean; onClose: () => void; title?: string; autoNew?: boolean;
}) {
  return (
    <LookupValuesEditor lookupType={presetType} open={open} onClose={onClose} title={title}
      flags={autoNew ? [...PRESET_FLAGS, AUTO_NEW_FLAG] : PRESET_FLAGS}
      description={`เพิ่ม · กดชื่อเพื่อแก้ · ลากเรียงลำดับ · 🔗 = กดแล้วเปิดช่องวางลิงก์ให้เลย${autoNew ? " · ใบใหม่ = ใส่ข้อนี้ให้เองตอนสร้างใบใหม่" : ""} · ใช้ร่วมกันทั้งทีม`} />
  );
}

/** เลือกเช็กลิสต์ที่จะใส่ให้ "ตอนสร้าง" (ยังไม่มีเลขเรคคอร์ด จึงยังบันทึกทีละข้อไม่ได้)
 *  value null = ยังไม่แตะ → ใช้ข้อที่เปิดสวิตช์ "ใบใหม่" · กดชิป = เอาออก/ใส่ · พิมพ์เพิ่มเฉพาะงานนี้ได้ · ⚙️ = แก้ค่าตั้งต้นของทุกงาน
 *  หน้าที่สร้าง ส่ง value (ถ้าไม่ใช่ null) ไปกับการสร้าง → server เรียก seedChecklistOnCreate(..., value) */
export function ChecklistSeedPicker({ presetType, value, onChange, disabled = false, label = null, settingsTitle = "Checklist งานใหม่" }: {
  presetType: string; value: string[] | null; onChange: (v: string[]) => void; disabled?: boolean; label?: ReactNode; settingsTitle?: string;
}) {
  const rows = useLookupRows(presetType);
  const [text, setText] = useState("");
  const [cfgOpen, setCfgOpen] = useState(false);
  const names = rows.map((r) => r.name.trim()).filter(Boolean);
  const sel = value ?? rows.filter((r) => isAutoNewPreset(r.metadata)).map((r) => r.name.trim()).filter(Boolean);
  const all = [...names, ...sel.filter((s) => !names.includes(s))];
  const toggle = (n: string) => onChange(sel.includes(n) ? sel.filter((x) => x !== n) : [...sel, n].slice(0, 10));
  const addText = () => {
    const v = text.trim().slice(0, 300);
    if (!v) return;
    if (!sel.includes(v)) onChange([...sel, v].slice(0, 10));
    setText("");
  };
  return (
    <div>
      {label && <div className="text-[11px] text-slate-500">{label}</div>}
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        {all.map((n) => {
          const on = sel.includes(n);
          return (
            <button key={n} type="button" disabled={disabled} onClick={() => toggle(n)} aria-pressed={on}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] disabled:opacity-60 ${on ? "border-blue-300 bg-blue-50 text-blue-700" : "border-dashed border-slate-300 text-slate-500 hover:border-blue-300 hover:text-blue-700"}`}>
              <Icon value={on ? "i:check" : "i:plus"} className="text-[11px]" />{n}
            </button>
          );
        })}
        {!disabled && (
          <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} aria-label="เพิ่มข้อเฉพาะงานนี้"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addText(); } }}
            placeholder="＋ เพิ่มเฉพาะงานนี้ (Enter)"
            className="h-6 w-40 rounded-full border border-slate-200 px-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-400" />
        )}
        {!disabled && (
          <button type="button" onClick={() => setCfgOpen(true)} title="แก้ข้อที่ใส่ให้ทุกงานใหม่ (ใช้ร่วมกันทั้งทีม)"
            className="ml-auto inline-flex items-center gap-0.5 rounded px-1 text-[11px] text-slate-400 hover:text-blue-600"><Icon name="settings" /> ตั้งค่า</button>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-slate-400">{sel.length ? `จะใส่ให้ ${sel.length} ข้อตอนกดบันทึก` : "ไม่ใส่เช็กลิสต์ให้งานนี้"}</p>
      <ChecklistPresetsEditor presetType={presetType} open={cfgOpen} onClose={() => setCfgOpen(false)} title={settingsTitle} />
    </div>
  );
}
