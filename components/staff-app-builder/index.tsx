"use client";

/**
 * 🧩 ตัวช่วยสร้างแอปพนักงาน (ของกลาง) — ใช้ใน /admin/app-manager
 *   ขั้น 1 ชื่อ TH/EN + ไอคอน + สี · ขั้น 2 ติ๊กเมนูจากทั้งระบบ + ลากเรียง + ตั้งชื่อเฉพาะแอป 2 ภาษา + หัวข้อ · ขั้น 3 ใครเห็นแอป
 *   + ประวัติเวอร์ชัน (เอาเวอร์ชันเก่ามาเป็นร่าง) · ร่าง → เผยแพร่ · ลบ = ย้ายเข้าถังขยะ (กู้คืนได้)
 * ข้อมูล/กฎ: /api/staff-apps · lib/staff-apps.ts · เอกสาร docs/staff-apps.md
 * ตัวอย่างหน้าจอด้านขวา = หน้าแรกจริงของแอป (components/staff-app-home) ใช้ร่างที่กำลังแก้
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { Icon } from "@/components/icon";
import { IconPicker } from "@/components/icon-picker";
import { InstallAppModal } from "@/components/install-app";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { StaffAppHome, type StaffHomeItem } from "@/components/staff-app-home";
import { MultiUserPicker } from "@/app/tasks/multi-user-picker";
import type { UserPickerValue } from "@/components/pickers";
import { cleanAudience, describeAudience, type MenuAudience } from "@/lib/menu-audience";
import { cleanDraft, draftChanged, publishProblems, STAFF_APP_LIMITS, type StaffAppDraft, type StaffAppMenu } from "@/lib/staff-apps";

export type StaffAppRow = {
  id: string; key: string; label: string; label_en: string | null; icon: string | null; theme_color: string | null;
  status: "draft" | "published"; draft: unknown; published_version: number; published_at: string | null; deleted_at: string | null; last_snapshot: unknown;
};
export type BuilderMenu = { id: string; label: string; href: string; icon: string | null; icon_url?: string | null; section?: string | null; app_keys?: string[] | null; is_active?: boolean | null; show_in_sidebar?: boolean | null; parent_id?: string | null };
type Role = { key: string; label: string; active?: boolean };
type Version = { id: string; version_no: number; note: string | null; created_by_name: string | null; created_at: string; snapshot: unknown };
type Step = "info" | "menus" | "who" | "history";

const COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#475569"];

async function post(body: Record<string, unknown>) {
  const r = await apiFetch("/api/staff-apps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export function StaffAppBuilder({ app, menus, appLabels, onChanged }: {
  app: StaffAppRow;
  menus: BuilderMenu[];
  appLabels: Record<string, string>;
  onChanged: () => void;
}) {
  const toast = useToast();
  const saved = useMemo(() => cleanDraft(app.draft), [app.draft]);
  const [draft, setDraft] = useState<StaffAppDraft>(saved);
  useEffect(() => { setDraft(saved); }, [saved]);
  const [step, setStep] = useState<Step>("info");
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<"th" | "en">("th");
  const [confirm, setConfirm] = useState<null | "publish" | "unpublish" | "trash">(null);
  const [note, setNote] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const dirty = JSON.stringify(cleanDraft(draft)) !== JSON.stringify(saved);
  const pending = app.status === "published" ? draftChanged(saved, app.last_snapshot) : false;
  const menuById = useMemo(() => new Map(menus.map((m) => [m.id, m])), [menus]);
  const problems = publishProblems(cleanDraft(draft), menus);

  const patch = (p: Partial<StaffAppDraft>) => setDraft((d) => ({ ...d, ...p }));

  const saveDraft = async (next = draft, quiet = false) => {
    setBusy(true);
    try {
      const before = saved;
      await post({ action: "save_draft", id: app.id, draft: next });
      onChanged();
      if (!quiet) toast.undo("บันทึกร่างแล้ว (พนักงานยังไม่เห็นจนกว่าจะกดเผยแพร่)", async () => {
        await post({ action: "save_draft", id: app.id, draft: before });
        onChanged();
      });
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); return false; }
    finally { setBusy(false); }
  };

  const run = async (action: "publish" | "unpublish" | "trash") => {
    setBusy(true);
    try {
      if (dirty && action === "publish" && !(await saveDraft(draft, true))) return;
      const j = await post({ action, id: app.id, ...(action === "publish" ? { note } : {}) });
      onChanged();
      if (action === "publish") { toast.success(`เผยแพร่แล้ว (เวอร์ชัน ${j.version}) — พนักงานที่อยู่ในรายชื่อเห็นแอปนี้แล้ว`); setNote(""); }
      if (action === "unpublish") toast.undo("ซ่อนจากพนักงานแล้ว (กลับเป็นร่าง)", async () => { await post({ action: "publish", id: app.id, note: "เผยแพร่กลับ" }); onChanged(); });
      if (action === "trash") toast.undo(`ย้าย “${app.label}” เข้าถังขยะแล้ว`, async () => { await post({ action: "restore", id: app.id }); onChanged(); });
    } catch (e) { toast.error(e instanceof Error ? e.message : "ทำไม่สำเร็จ"); }
    finally { setBusy(false); setConfirm(null); }
  };

  // ตัวอย่างหน้าแรก (ตามร่าง)
  const previewItems: StaffHomeItem[] = draft.menus.map((m) => {
    const src = menuById.get(m.menu_id);
    const sec = draft.sections.find((s) => s.key === m.section);
    return {
      id: m.menu_id,
      label: (lang === "en" ? m.label_en : undefined) || m.label || src?.label || "(เมนูถูกลบ)",
      section: sec ? ((lang === "en" && sec.label_en) || sec.label) : "",
      icon: src?.icon ?? null, icon_url: src?.icon_url ?? null,
    };
  });

  const stepBtn = (k: Step, n: string, label: string) => (
    <button key={k} type="button" onClick={() => setStep(k)} aria-current={step === k ? "step" : undefined}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${step === k ? "border-violet-300 bg-violet-100 font-medium text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>
      {n && <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${step === k ? "bg-violet-600 text-white" : "bg-slate-200 text-slate-600"}`}>{n}</span>}
      {label}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* หัว: ชื่อ + สถานะ + ปุ่มหลัก */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-white" style={{ background: draft.theme_color || "#2563eb" }}><Icon value={draft.icon ?? "📱"} /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-800">{draft.label || "(ยังไม่ตั้งชื่อ)"}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {app.status === "published"
              ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">เผยแพร่แล้ว · v{app.published_version}</span>
              : <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">ร่าง — พนักงานยังไม่เห็น</span>}
            {(pending || dirty) && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{dirty ? "ยังไม่ได้บันทึก" : "มีแก้ที่ยังไม่เผยแพร่"}</span>}
            <span className="font-mono text-slate-400">/app/{app.key}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <a href={`/app/${app.key}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon name="external-link" /> เปิดดู</a>
          {app.status === "published" && <button type="button" onClick={() => setQrOpen(true)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon name="qrcode" /> QR ติดตั้ง</button>}
          <button type="button" disabled={!dirty || busy} onClick={() => void saveDraft()} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">บันทึกร่าง</button>
          <button type="button" disabled={busy || problems.length > 0 || (!dirty && !pending && app.status === "published")} onClick={() => setConfirm("publish")}
            title={problems.join(" · ") || undefined}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40"><Icon name="rocket" /> เผยแพร่</button>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 bg-slate-50 px-4 py-2">
        {stepBtn("info", "1", "ชื่อ + ไอคอน")}
        {stepBtn("menus", "2", `เมนู (${draft.menus.length})`)}
        {stepBtn("who", "3", "ใครเห็นแอป")}
        {stepBtn("history", "", "ประวัติเวอร์ชัน")}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
          {problems.length > 0 && step !== "history" && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">ก่อนเผยแพร่: {problems.join(" · ")}</div>
          )}
          {step === "info" && <InfoStep draft={draft} patch={patch} />}
          {step === "menus" && <MenusStep draft={draft} setDraft={setDraft} menus={menus} menuById={menuById} appLabels={appLabels} />}
          {step === "who" && <WhoStep audience={draft.audience ?? null} onChange={(a) => patch({ audience: a })} />}
          {step === "history" && <HistoryStep app={app} onLoaded={() => { onChanged(); setStep("menus"); }} />}

          <div className="mt-8 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {app.status === "published" && <button type="button" disabled={busy} onClick={() => setConfirm("unpublish")} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50"><Icon name="eye-off" /> ซ่อนจากพนักงาน (กลับเป็นร่าง)</button>}
            <button type="button" disabled={busy} onClick={() => setConfirm("trash")} className="h-9 rounded-lg border border-rose-200 bg-white px-3 text-sm text-rose-600 hover:bg-rose-50"><Icon name="trash" /> ย้ายแอปเข้าถังขยะ</button>
          </div>
        </div>

        {/* ตัวอย่างหน้าแรกบนมือถือ */}
        <aside className="border-t border-slate-200 bg-slate-100 p-4 lg:w-[360px] lg:flex-shrink-0 lg:border-l lg:border-t-0 lg:overflow-y-auto">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
            <span>ตัวอย่างหน้าแรก (มือถือ)</span>
            <span className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white">
              {(["th", "en"] as const).map((l) => <button key={l} type="button" onClick={() => setLang(l)} className={`px-2 py-0.5 ${lang === l ? "bg-violet-600 text-white" : "text-slate-600"}`}>{l.toUpperCase()}</button>)}
            </span>
          </div>
          <div className="mx-auto flex h-[560px] w-full max-w-[340px] flex-col overflow-hidden rounded-[28px] border-[6px] border-slate-800 bg-white shadow-lg">
            <div className="flex items-center gap-2 px-3 py-2.5 text-white" style={{ background: draft.theme_color || "#2563eb" }}>
              <Icon value={draft.icon ?? "📱"} />
              <span className="truncate text-sm font-semibold">{(lang === "en" && draft.label_en) || draft.label || "แอป"}</span>
            </div>
            <StaffAppHome items={previewItems} onOpen={() => {}} preview />
          </div>
        </aside>
      </div>

      <ConfirmDialog open={confirm === "publish"} onClose={() => setConfirm(null)} onConfirm={() => void run("publish")} loading={busy}
        title="เผยแพร่แอปนี้?" confirmText="เผยแพร่"
        message={<div className="space-y-2 text-sm">
          <p>พนักงานใน “{describeAudience(draft.audience)}” จะเห็นแอป <b>{draft.label}</b> ({draft.menus.length} เมนู) ทันที</p>
          <p className="text-xs text-slate-500">เก็บเป็นเวอร์ชันใหม่ ย้อนกลับได้ที่แท็บ “ประวัติเวอร์ชัน”</p>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="บันทึกสั้น ๆ ว่าแก้อะไร (ไม่ใส่ก็ได้)" className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" />
        </div>} />
      <ConfirmDialog open={confirm === "unpublish"} onClose={() => setConfirm(null)} onConfirm={() => void run("unpublish")} loading={busy}
        title="ซ่อนแอปจากพนักงาน?" confirmText="ซ่อน" message="แอปกลับเป็นร่าง พนักงานเปิดไม่ได้จนกว่าจะเผยแพร่อีกครั้ง (ข้อมูลอยู่ครบ)" />
      <ConfirmDialog open={confirm === "trash"} onClose={() => setConfirm(null)} onConfirm={() => void run("trash")} loading={busy} variant="danger"
        title={`ย้าย “${app.label}” เข้าถังขยะ?`} confirmText="ย้ายเข้าถังขยะ" message="พนักงานจะเปิดแอปนี้ไม่ได้ · กู้คืนได้จากถังขยะแอป" />
      {qrOpen && <InstallAppModal open onClose={() => setQrOpen(false)} qr={{ appKey: app.key, appLabel: app.label }} />}
    </div>
  );
}

// ── ขั้น 1 ──
function InfoStep({ draft, patch }: { draft: StaffAppDraft; patch: (p: Partial<StaffAppDraft>) => void }) {
  const field = "h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-violet-400";
  return (
    <div className="max-w-xl space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">ชื่อแอป (ไทย) *</span>
        <input value={draft.label} maxLength={STAFF_APP_LIMITS.label} onChange={(e) => patch({ label: e.target.value })} className={field} placeholder="เช่น แอปหน้างานผลิต" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">ชื่อแอป (English)</span>
        <input value={draft.label_en ?? ""} maxLength={STAFF_APP_LIMITS.label} onChange={(e) => patch({ label_en: e.target.value })} className={field} placeholder="e.g. Shop floor" />
      </label>
      <div className="text-sm">
        <span className="mb-1 block text-slate-600">ไอคอน</span>
        <IconPicker value={draft.icon ?? ""} onChange={(v) => patch({ icon: v })} />
      </div>
      <div className="text-sm">
        <span className="mb-1 block text-slate-600">สีหัวแอป</span>
        <div className="flex flex-wrap items-center gap-2">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => patch({ theme_color: c })} aria-label={c} aria-pressed={draft.theme_color === c}
              className={`h-8 w-8 rounded-full border-2 ${draft.theme_color === c ? "border-slate-800" : "border-white shadow"}`} style={{ background: c }} />
          ))}
          <input type="color" value={draft.theme_color ?? "#2563eb"} onChange={(e) => patch({ theme_color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-slate-200" aria-label="เลือกสีเอง" />
        </div>
      </div>
      <p className="text-xs text-slate-500">อัปโหลดรูปไอคอนแอป (แทนอีโมจิ) ได้ที่ /admin/menu → ตั้งค่าแอป/PWA หลังเผยแพร่ครั้งแรก</p>
    </div>
  );
}

// ── ขั้น 2 ──
function MenusStep({ draft, setDraft, menus, menuById, appLabels }: {
  draft: StaffAppDraft; setDraft: React.Dispatch<React.SetStateAction<StaffAppDraft>>;
  menus: BuilderMenu[]; menuById: Map<string, BuilderMenu>; appLabels: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const chosen = new Set(draft.menus.map((m) => m.menu_id));
  const setMenus = (fn: (m: StaffAppMenu[]) => StaffAppMenu[]) => setDraft((d) => ({ ...d, menus: fn(d.menus) }));
  const setMenu = (id: string, p: Partial<StaffAppMenu>) => setMenus((ms) => ms.map((m) => (m.menu_id === id ? { ...m, ...p } : m)));
  const toggle = (id: string) => setMenus((ms) => (ms.some((m) => m.menu_id === id) ? ms.filter((m) => m.menu_id !== id) : [...ms, { menu_id: id }]));
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => setMenus((ms) => moveItem(ms, from, to)));

  // เมนูที่เลือกได้ = เปิดใช้ + โชว์ในเมนู · จัดกลุ่มตามแอปแรกที่อยู่
  const query = q.trim().toLowerCase();
  const pool = menus.filter((m) => m.is_active !== false && m.show_in_sidebar !== false && (!query || m.label.toLowerCase().includes(query) || m.href.toLowerCase().includes(query)));
  const groups = useMemo(() => {
    const g = new Map<string, BuilderMenu[]>();
    for (const m of pool) { const k = (m.app_keys ?? []).find((x) => appLabels[x]) ?? ""; const a = g.get(k) ?? []; a.push(m); g.set(k, a); }
    return [...g.entries()].sort((a, b) => (appLabels[a[0]] ?? "zz").localeCompare(appLabels[b[0]] ?? "zz", "th"));
  }, [pool, appLabels]);

  const addSection = () => setDraft((d) => {
    if (d.sections.length >= STAFF_APP_LIMITS.sections) return d;
    let n = d.sections.length + 1;
    while (d.sections.some((s) => s.key === `s${n}`)) n++;
    return { ...d, sections: [...d.sections, { key: `s${n}`, label: `หัวข้อ ${n}` }] };
  });
  const setSection = (key: string, p: { label?: string; label_en?: string }) => setDraft((d) => ({ ...d, sections: d.sections.map((s) => (s.key === key ? { ...s, ...p } : s)) }));
  const delSection = (key: string) => setDraft((d) => ({ ...d, sections: d.sections.filter((s) => s.key !== key), menus: d.menus.map((m) => (m.section === key ? { ...m, section: undefined } : m)) }));
  const input = "h-8 w-full min-w-0 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-violet-400";

  return (
    <div className="space-y-5">
      {/* หัวข้อ */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">หัวข้อบนหน้าแรก</h3>
          <button type="button" onClick={addSection} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50"><Icon name="plus" /> เพิ่มหัวข้อ</button>
        </div>
        {draft.sections.length === 0 && <p className="text-xs text-slate-500">ยังไม่มีหัวข้อ — เมนูทั้งหมดจะอยู่ในกลุ่มเดียว</p>}
        <div className="space-y-1.5">
          {draft.sections.map((s) => (
            <div key={s.key} className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
              <input value={s.label} maxLength={STAFF_APP_LIMITS.sectionLabel} onChange={(e) => setSection(s.key, { label: e.target.value })} className={`${input} sm:flex-1`} placeholder="ชื่อหัวข้อ (ไทย)" aria-label="ชื่อหัวข้อ (ไทย)" />
              <input value={s.label_en ?? ""} maxLength={STAFF_APP_LIMITS.sectionLabel} onChange={(e) => setSection(s.key, { label_en: e.target.value })} className={`${input} sm:flex-1`} placeholder="Section (EN)" aria-label="ชื่อหัวข้อ (อังกฤษ)" />
              <button type="button" onClick={() => delSection(s.key)} aria-label={`ลบหัวข้อ ${s.label}`} className="h-8 w-8 shrink-0 rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="x" /></button>
            </div>
          ))}
        </div>
      </section>

      {/* เมนูที่เลือก */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">เมนูในแอปนี้ ({draft.menus.length}/{STAFF_APP_LIMITS.menus}) <span className="font-normal text-slate-400">· ลาก ⠿ เพื่อเรียง</span></h3>
          <button type="button" onClick={() => setAddOpen((v) => !v)} className="h-8 rounded-lg bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-700"><Icon name="plus" /> เพิ่มเมนู</button>
        </div>
        {draft.menus.length === 0 && !addOpen && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">ยังไม่มีเมนู — กด “เพิ่มเมนู” แล้วติ๊กจากทั้งระบบ</p>}
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {draft.menus.map((m, i) => {
            const src = menuById.get(m.menu_id);
            const isOpen = open === m.menu_id;
            return (
              <div key={m.menu_id} {...rowProps(i)} className={rowCls(i)}>
                <div className="flex items-center gap-2 px-2 py-2">
                  <DragHandle {...handleProps(i)} />
                  <span className="w-6 text-center"><Icon value={src?.icon ?? "📄"} /></span>
                  <button type="button" onClick={() => setOpen(isOpen ? null : m.menu_id)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm text-slate-800">{m.label || src?.label || <span className="text-rose-600">(เมนูถูกลบจากระบบ)</span>}</div>
                    <div className="truncate text-[11px] text-slate-400">
                      {m.label && src ? `ชื่อกลาง: ${src.label} · ` : ""}{draft.sections.find((s) => s.key === m.section)?.label ?? "ไม่มีหัวข้อ"}{m.label_en ? ` · EN: ${m.label_en}` : ""}
                    </div>
                  </button>
                  <button type="button" onClick={() => setOpen(isOpen ? null : m.menu_id)} className="h-8 rounded-md px-2 text-xs text-violet-700 hover:bg-violet-50"><Icon name="edit" /> <span className="hidden sm:inline">ตั้งชื่อ/หัวข้อ</span></button>
                  <button type="button" onClick={() => toggle(m.menu_id)} aria-label="เอาออกจากแอป" className="h-8 w-8 rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="x" /></button>
                </div>
                {isOpen && (
                  <div className="grid gap-2 bg-violet-50/40 px-3 pb-3 pt-1 sm:grid-cols-3">
                    <label className="text-xs text-slate-500">ชื่อในแอปนี้ (ไทย)
                      <input value={m.label ?? ""} maxLength={STAFF_APP_LIMITS.menuLabel} onChange={(e) => setMenu(m.menu_id, { label: e.target.value })} placeholder={src?.label} className={`${input} mt-0.5`} />
                    </label>
                    <label className="text-xs text-slate-500">ชื่อ (English)
                      <input value={m.label_en ?? ""} maxLength={STAFF_APP_LIMITS.menuLabel} onChange={(e) => setMenu(m.menu_id, { label_en: e.target.value })} className={`${input} mt-0.5`} />
                    </label>
                    <label className="text-xs text-slate-500">หัวข้อ
                      <select value={m.section ?? ""} onChange={(e) => setMenu(m.menu_id, { section: e.target.value || undefined })} className={`${input} mt-0.5 bg-white`}>
                        <option value="">— ไม่มีหัวข้อ —</option>
                        {draft.sections.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </label>
                    <p className="text-[11px] text-slate-500 sm:col-span-3">ชื่อที่ตั้งตรงนี้ใช้เฉพาะแอปนี้ — เมนูกลางและแอปอื่นไม่เปลี่ยน · ลิงก์: <span className="font-mono">{src?.href}</span></p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* เพิ่มเมนูจากทั้งระบบ */}
      {addOpen && (
        <section className="rounded-lg border border-violet-200 bg-white p-3">
          <div className="mb-2 flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="ค้นหาเมนูจากทั้งระบบ…" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-violet-400" autoFocus />
            <button type="button" onClick={() => setAddOpen(false)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">เสร็จ</button>
          </div>
          <div className="max-h-[50vh] space-y-3 overflow-y-auto">
            {groups.map(([k, list]) => (
              <div key={k || "_"}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{appLabels[k] ?? "ไม่อยู่แอปไหน"}</div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {list.map((m) => (
                    <label key={m.id} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${chosen.has(m.id) ? "bg-violet-50 text-violet-800" : "hover:bg-slate-50"}`}>
                      <input type="checkbox" checked={chosen.has(m.id)} onChange={() => toggle(m.id)} disabled={!chosen.has(m.id) && draft.menus.length >= STAFF_APP_LIMITS.menus} className="accent-violet-600" />
                      <span className="w-5 text-center"><Icon value={m.icon ?? "📄"} /></span>
                      <span className="min-w-0 flex-1 truncate">{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {groups.length === 0 && <p className="py-4 text-center text-sm text-slate-500">ไม่พบเมนู</p>}
          </div>
        </section>
      )}
    </div>
  );
}

// ── ขั้น 3 ──
function WhoStep({ audience, onChange }: { audience: MenuAudience | null; onChange: (a: MenuAudience | null) => void }) {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const restricted = !!(audience?.roles?.length || audience?.users?.length);
  const [mode, setMode] = useState<"all" | "some">(restricted ? "some" : "all");
  useEffect(() => {
    apiFetch("/api/admin/roles").then((r) => r.json()).then((j) => setRoles(((j.roles ?? []) as Role[]).filter((r) => r.active !== false && r.key !== "admin"))).catch(() => setRoles([]));
    apiFetch("/api/admin/users").then((r) => r.json()).then((u) => {
      setNames(Object.fromEntries(((u.data ?? []) as { id: string; display_name?: string | null; username?: string | null; email?: string | null }[]).map((x) => [x.id, (x.display_name || x.username || x.email || "").trim()])));
    }).catch(() => {});
  }, []);
  const set = (p: Partial<MenuAudience>) => onChange(cleanAudience({ ...(audience ?? {}), ...p }));
  const toVals = (list?: string[]) => (list ?? []).map((id) => ({ id, code: null, name: names[id] ?? id } as UserPickerValue));
  const toggleRole = (k: string) => { const rs = audience?.roles ?? []; set({ roles: rs.includes(k) ? rs.filter((x) => x !== k) : [...rs, k] }); };
  const chip = (on: boolean) => `h-8 rounded-full border px-3 text-sm ${on ? "border-violet-300 bg-violet-100 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`;
  return (
    <div className="max-w-2xl space-y-4 text-sm">
      <p className="text-slate-600">ตอนนี้: <b>{describeAudience(audience)}</b> · แอดมินเห็นทุกแอปเสมอ</p>
      <div className="flex flex-wrap gap-4">
        <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="radio" checked={mode === "all"} onChange={() => { setMode("all"); onChange(audience?.hide_users?.length ? { hide_users: audience.hide_users } : null); }} className="accent-violet-600" /> ทุกคน</label>
        <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="radio" checked={mode === "some"} onChange={() => setMode("some")} className="accent-violet-600" /> เฉพาะบางตำแหน่ง / บางคน</label>
      </div>
      {mode === "some" && (
        <>
          <div>
            <div className="mb-1 text-xs text-slate-500">ตำแหน่งที่เห็น</div>
            <div className="flex flex-wrap gap-1.5">
              {(roles ?? []).map((r) => <button key={r.key} type="button" onClick={() => toggleRole(r.key)} className={chip(!!audience?.roles?.includes(r.key))}>{r.label}</button>)}
              {!roles && <span className="text-xs text-slate-400">กำลังโหลด…</span>}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">ให้เห็นเพิ่มรายคน</div>
            <MultiUserPicker value={toVals(audience?.users)} onChange={(v) => set({ users: v.map((u) => u.id) })} disableCreate />
          </div>
          {!restricted && <p className="text-xs text-amber-700">ยังไม่ได้เลือกใคร = ทุกคนยังเห็นอยู่</p>}
        </>
      )}
      <div>
        <div className="mb-1 text-xs text-slate-500">ซ่อนจากบางคน</div>
        <MultiUserPicker value={toVals(audience?.hide_users)} onChange={(v) => set({ hide_users: v.map((u) => u.id) })} disableCreate />
      </div>
      <p className="text-xs text-slate-500">เมนูแต่ละตัวยังใช้สิทธิ์เดิมของระบบ — ถ้าพนักงานไม่มีสิทธิ์ของเมนูไหน จะไม่เห็นปุ่มนั้น (ตั้งสิทธิ์ตามเมนูได้ในรอบถัดไป)</p>
    </div>
  );
}

// ── ประวัติเวอร์ชัน ──
function HistoryStep({ app, onLoaded }: { app: StaffAppRow; onLoaded: () => void }) {
  const toast = useToast();
  const [list, setList] = useState<Version[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState<Version | null>(null);
  useEffect(() => {
    apiFetch(`/api/staff-apps?versions=${encodeURIComponent(app.id)}`).then((r) => r.json()).then((j) => { if (j.error) throw new Error(j.error); setList(j.versions ?? []); })
      .catch((e) => setErr(e instanceof Error ? e.message : "โหลดประวัติไม่สำเร็จ"));
  }, [app.id, app.published_version]);
  const load = async (v: Version) => {
    try {
      const before = cleanDraft(app.draft);
      await post({ action: "load_version", id: app.id, version_no: v.version_no });
      onLoaded();
      toast.undo(`เอาเวอร์ชัน ${v.version_no} มาเป็นร่างแล้ว — กด “เผยแพร่” เพื่อใช้จริง`, async () => { await post({ action: "save_draft", id: app.id, draft: before }); onLoaded(); });
    } catch (e) { toast.error(e instanceof Error ? e.message : "ทำไม่สำเร็จ"); }
    setAsk(null);
  };
  if (err) return <p className="text-sm text-rose-600">{err}</p>;
  if (!list) return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}</div>;
  if (!list.length) return <p className="py-8 text-center text-sm text-slate-500">ยังไม่เคยเผยแพร่ — ประวัติจะเริ่มเก็บเมื่อกดเผยแพร่ครั้งแรก</p>;
  return (
    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {list.map((v) => {
        const d = cleanDraft(v.snapshot);
        return (
          <div key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
            <span className={`rounded px-1.5 py-0.5 text-xs ${v.version_no === app.published_version ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>v{v.version_no}{v.version_no === app.published_version ? " · ใช้อยู่" : ""}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-slate-700">{v.note || `${d.label} · ${d.menus.length} เมนู`}</div>
              <div className="text-[11px] text-slate-400">{new Date(v.created_at).toLocaleString("th-TH")} · {v.created_by_name ?? "-"}</div>
            </div>
            <button type="button" onClick={() => setAsk(v)} className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-700 hover:bg-slate-50"><Icon name="arrow-back-up" /> ใช้เวอร์ชันนี้เป็นร่าง</button>
          </div>
        );
      })}
      <ConfirmDialog open={!!ask} onClose={() => setAsk(null)} onConfirm={() => ask && void load(ask)}
        title={`ใช้เวอร์ชัน ${ask?.version_no ?? ""} เป็นร่าง?`} confirmText="ใช้เป็นร่าง"
        message="ร่างที่แก้อยู่จะถูกแทนที่ (กดย้อนกลับได้ทันที) · พนักงานยังเห็นแบบเดิมจนกว่าจะกดเผยแพร่" />
    </div>
  );
}
