"use client";
// ป๊อปของงานย่อยชนิดคอนเทนต์: แม่แบบคอนเทนต์ · รายละเอียด · ค่าเริ่มแพลตฟอร์ม · ส่งงานคอนเทนต์ (แยกจาก subtask-manager.tsx — Y1)
import { useCallback, useEffect, useState } from "react";
import { ERPInput } from "@/components/form";
import { ERPModal } from "@/components/modal";
import { ImageAttach } from "@/components/image-attach";
import { UserPicker } from "@/components/pickers";
import { useT } from "@/components/i18n";
import { TeamFill } from "./team-picker";
import type { UserPickerValue } from "@/components/pickers";
import { PlatformChip } from "./platform-chip";
import { useCreativeOptions } from "./use-options";
import { updateSubtask, addAttachment, deleteAttachment, POST_TYPES, postTypeLabel, listContentTemplates, createContent, updateContent, deleteContent, getPlatformSettings, savePlatformSettings, type CreativeSubtask, type ContentItem, type PlatformSettings } from "./data";
import { askConfirm } from "@/components/modal/ask-dialog";
import type { PushToast } from "@/components/toast";

// ป๊อปจัดการ "แม่แบบคอนเทนต์" — รายการ + สร้าง + แก้ + ลบ (ชื่อ + ประเภท + platforms หลายอัน + มอบหมาย)
export function ContentTemplateModal({ pushToast, onClose, onChanged, onPick }: { pushToast: PushToast; onClose: () => void; onChanged: () => void; onPick: (id: string) => void }) {
  const t = useT();
  const { platforms: platformOpts } = useCreativeOptions();
  const [list, setList] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);   // null = สร้างใหม่
  const [title, setTitle] = useState("");
  const [postType, setPostType] = useState("");
  const [pf, setPf] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<{ id: string; label: string }[]>([]);
  const [note, setNote] = useState("");   // บรีฟงานของแม่แบบ (โชว์บนสุดของป๊อปรายละเอียดงาน)
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => { setLoading(true); try { setList(await listContentTemplates()); } catch (e) { pushToast("error", (e as Error).message); } finally { setLoading(false); } };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const resetForm = () => { setEditId(null); setTitle(""); setPostType(""); setPf([]); setAssignees([]); setNote(""); };
  const startEdit = (c: ContentItem) => { setEditId(c.id); setTitle(c.title || ""); setPostType(c.post_type || ""); setPf(c.platforms ?? []); setAssignees((c.assignees ?? []).map((a) => ({ id: a.id, label: a.name }))); setNote((c.note as string) ?? ""); };
  const togglePf = (v: string) => setPf((xs) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]));
  const save = async () => {
    if (!title.trim()) { pushToast("error", t("ใส่ชื่อแม่แบบ", "Enter a template name")); return; }
    setBusy(true);
    try {
      const body = { title: title.trim(), post_type: postType || null, platforms: pf, assignee_ids: assignees.map((a) => a.id), note: note.trim() || null };
      if (editId) { await updateContent(editId, body); pushToast("success", t("บันทึกแม่แบบแล้ว", "Template saved")); }
      else { const { id } = await createContent({ ...body, is_template: true }); pushToast("success", t("สร้างแม่แบบแล้ว", "Template created")); onPick(id); }
      resetForm(); await load(); onChanged();
    } catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };
  const del = async (c: ContentItem) => {
    if (!(await askConfirm({ title: `${t("ลบแม่แบบ", "Delete template")} "${c.title}" ?`, variant: "danger" }))) return;
    try { await deleteContent(c.id); if (editId === c.id) resetForm(); await load(); onChanged(); pushToast("success", t("ลบแล้ว", "Deleted")); }
    catch (e) { pushToast("error", (e as Error).message); }
  };

  return (
    <ERPModal open onClose={onClose} size="md" title={t("จัดการแม่แบบคอนเทนต์", "Manage content templates")}>
      <div className="space-y-3">
        {/* รายการแม่แบบที่มี */}
        <div>
          <p className="text-[11px] font-semibold text-slate-500 mb-1">{t("แม่แบบที่มี", "Existing templates")}</p>
          {loading ? <p className="text-sm text-slate-400">{t("กำลังโหลด...", "Loading...")}</p>
            : list.length === 0 ? <p className="text-xs text-slate-400 italic">{t("ยังไม่มีแม่แบบ", "No templates yet")}</p>
            : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {list.map((c) => (
                  <div key={c.id} className={`flex items-center gap-2 text-sm rounded-md border px-2 py-1 ${editId === c.id ? "border-violet-300 bg-violet-50/50" : "border-slate-200"}`}>
                    <span className="flex-1 truncate">{c.title} <span className="text-[10px] text-slate-400">· {(c.platforms ?? []).length} {t("แพลตฟอร์ม", "platforms")}</span></span>
                    <button onClick={() => startEdit(c)} title={t("แก้ไข", "Edit")} className="text-slate-400 hover:text-violet-600">✎</button>
                    <button onClick={() => void del(c)} title={t("ลบ", "Delete")} className="text-slate-300 hover:text-red-500">🗑</button>
                  </div>
                ))}
              </div>
            )}
        </div>
        {/* ฟอร์ม สร้าง/แก้ */}
        <div className="border-t border-slate-100 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-violet-700">{editId ? t("แก้ไขแม่แบบ", "Edit template") : t("สร้างแม่แบบใหม่", "New template")}</p>
            {editId && <button onClick={resetForm} className="text-[11px] text-slate-500 hover:underline">＋ {t("สร้างใหม่แทน", "Create new")}</button>}
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-1">{t("ชื่อแม่แบบ", "Template name")}</p>
            <ERPInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("เช่น โปรโมตสินค้าใหม่", "e.g. New product promo")} />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-1">{t("ประเภทคอนเทนต์", "Content type")}</p>
            <select value={postType} onChange={(e) => setPostType(e.target.value)} className="h-9 w-full border border-slate-200 rounded-lg px-2 text-sm bg-white">
              <option value="">{t("— เลือกประเภท —", "— select —")}</option>
              {POST_TYPES.map((p) => <option key={p.value} value={p.value}>{postTypeLabel(p.value)}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-1">📋 {t("บรีฟงาน / รายละเอียดงาน (โชว์บนสุดของป๊อปรายละเอียดงาน)", "Work brief (shown at top of the details popup)")}</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t("เช่น สเปกรูป/สิ่งที่ต้องส่ง/โทนงาน ของแม่แบบนี้", "e.g. image specs / deliverables / tone for this template")} className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-mono leading-relaxed resize-y bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-violet-300" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-1">{t("แพลตฟอร์มที่จะลง (เลือกได้หลายอัน)", "Platforms (multi-select)")}</p>
            <div className="flex flex-wrap gap-1.5">
              {platformOpts.map((p) => <button key={p.value} type="button" onClick={() => togglePf(p.value)} className={`px-2.5 py-1 rounded-full text-xs border ${pf.includes(p.value) ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>{p.label}</button>)}
            </div>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-1">{t("มอบหมายให้ (เลือกได้หลายคน)", "Assign to (multiple)")}</p>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{a.label}<button onClick={() => setAssignees((xs) => xs.filter((x) => x.id !== a.id))} className="text-slate-400 hover:text-red-500">✕</button></span>)}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0"><UserPicker value={adding} onChange={(v) => { if (v && !assignees.some((a) => a.id === v.id)) setAssignees((xs) => [...xs, { id: v.id, label: v.name }]); setAdding(null); }} disableCreate /></div>
              <TeamFill onPick={(members) => setAssignees((xs) => { const fresh = members.filter((m) => !xs.some((a) => a.id === m.id)).map((m) => ({ id: m.id, label: m.name })); return fresh.length ? [...xs, ...fresh] : xs; })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
            <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{busy ? "..." : editId ? t("บันทึก", "Save") : t("สร้าง", "Create")}</button>
          </div>
        </div>
      </div>
    </ERPModal>
  );
}

// ป๊อป "รายละเอียดงาน" ต่อแพลตฟอร์ม (เฉพาะคอนเทนต์นี้) — ดู+แก้ หมายเหตุ/สิ่งที่ต้องแนบ · เก็บใน subtask.config.platform_notes
export function ContentDetailsModal({ sub, taskId, reload, pushToast, onClose }: {
  sub: CreativeSubtask; taskId: string; reload: () => Promise<void>; pushToast: PushToast; onClose: () => void;
}) {
  const t = useT();
  const platforms = sub.content_preview?.platforms ?? [];
  const templateId = sub.config?.content_template_id ?? "";
  const [notes, setNotes] = useState<Record<string, string>>(() => ({ ...((sub.config?.platform_notes ?? {}) as Record<string, string>) }));
  const [prefilled, setPrefilled] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);
  const [brief, setBrief] = useState("");        // บรีฟงานจากแม่แบบที่คอนเทนต์นี้ใช้ (อ่านอย่างเดียว · แก้ที่จัดการแม่แบบ)
  const [briefFrom, setBriefFrom] = useState(""); // ชื่อแม่แบบ
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!templateId) return; listContentTemplates().then((ts) => { const tp = ts.find((x) => x.id === templateId); setBrief((tp?.note as string) ?? ""); setBriefFrom(tp?.title ?? ""); }).catch(() => {}); }, [templateId]);
  // เติมค่าเริ่มต้นจาก "หมายเหตุแพลตฟอร์ม (ทั่วไป)" ให้ช่องที่ยังว่าง (แก้เฉพาะงานได้)
  const prefillFromDefaults = useCallback(() => {
    getPlatformSettings().then((ps) => setNotes((n) => {
      const next = { ...n }; let changed = false;
      for (const p of platforms) { if (!next[p]?.trim() && ps[p]?.note?.trim()) { next[p] = ps[p]!.note as string; changed = true; } }
      if (changed) setPrefilled(true);
      return next;
    })).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { prefillFromDefaults(); }, [prefillFromDefaults]);
  const save = async () => {
    setBusy(true);
    try { await updateSubtask(taskId, sub.id, { config: { ...(sub.config ?? {}), platform_notes: notes } }); await reload(); pushToast("success", t("บันทึกแล้ว", "Saved")); onClose(); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} size="md" title={t("รายละเอียดงาน — ต่อแพลตฟอร์ม", "Work details — per platform")}>
      <div className="space-y-3">
        {brief.trim() && (
          <div className="rounded-lg bg-amber-50/70 border border-amber-200 p-2.5">
            <p className="text-[11px] font-semibold text-amber-700 mb-1">📋 {t("บรีฟงาน", "Work brief")}{briefFrom ? ` · ${briefFrom}` : ""}</p>
            <pre className="text-[11px] font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">{brief}</pre>
          </div>
        )}
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] text-slate-400 flex-1">{t("หมายเหตุ/สิ่งที่ต้องเตรียม ของคอนเทนต์นี้ แยกต่อแพลตฟอร์ม (คนทำงานเปิดดูได้)", "Notes / requirements for this content, per platform (visible to workers)")}</p>
          <button onClick={() => setShowDefaults(true)} className="shrink-0 h-7 px-2.5 text-[11px] text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">⚙️ {t("ตั้งค่า default", "Set defaults")}</button>
        </div>
        {prefilled && <p className="text-[11px] text-amber-600">✎ {t("เติมค่าเริ่มต้นจากหมายเหตุแพลตฟอร์มให้แล้ว — แก้เฉพาะงานนี้ได้", "Prefilled from platform defaults — edit for this content")}</p>}
        {platforms.length === 0 && <p className="text-sm text-slate-400 italic">{t("คอนเทนต์นี้ยังไม่ได้เลือกแพลตฟอร์ม", "This content has no platforms yet")}</p>}
        {platforms.map((p) => (
          <div key={p}>
            <div className="mb-1"><PlatformChip code={p} /></div>
            <textarea value={notes[p] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [p]: e.target.value }))} rows={4} placeholder={t("หมายเหตุ/สิ่งที่ต้องแนบ เช่น รูป 1:1 อย่างน้อย 5 รูป", "Notes / what to attach, e.g. 1:1 images, at least 5")} className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-mono leading-relaxed resize-y bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-violet-300" />
          </div>
        ))}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
          <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{busy ? "..." : t("บันทึก", "Save")}</button>
        </div>
        {showDefaults && (
          <PlatformDefaultsModal platforms={platforms} pushToast={pushToast} onSaved={prefillFromDefaults} onClose={() => setShowDefaults(false)} />
        )}
      </div>
    </ERPModal>
  );
}

// ป๊อปตั้งค่า "หมายเหตุเริ่มต้น (ทั่วไป)" ต่อแพลตฟอร์ม — ค่ากลางที่ทุกคอนเทนต์ดึงไปเติมให้เมื่อยังไม่กรอกเฉพาะงาน
export function PlatformDefaultsModal({ platforms, pushToast, onSaved, onClose }: {
  platforms: string[]; pushToast: PushToast; onSaved: () => void; onClose: () => void;
}) {
  const t = useT();
  const [all, setAll] = useState<PlatformSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getPlatformSettings().then(setAll).catch(() => setAll({})); }, []);
  const setNote = (p: string, v: string) => setAll((a) => ({ ...(a ?? {}), [p]: { ...((a ?? {})[p] ?? {}), note: v } }));
  const save = async () => {
    if (!all) return;
    setBusy(true);
    try { await savePlatformSettings(all); pushToast("success", t("บันทึกค่าเริ่มต้นแล้ว", "Defaults saved")); onSaved(); onClose(); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} size="md" title={t("ตั้งค่าหมายเหตุเริ่มต้น (ทั่วไป)", "Default platform notes (global)")}>
      <div className="space-y-3">
        <p className="text-[11px] text-slate-400">{t("ค่ากลางนี้ใช้กับ 'ทุกคอนเทนต์' ที่ลงแพลตฟอร์มนั้น — ระบบจะเติมให้อัตโนมัติเมื่อยังไม่ได้กรอกหมายเหตุเฉพาะงาน", "These global defaults apply to every content on that platform — auto-filled when the per-content note is empty.")}</p>
        {all === null ? (
          <p className="text-sm text-slate-400">{t("กำลังโหลด...", "Loading...")}</p>
        ) : platforms.length === 0 ? (
          <p className="text-sm text-slate-400 italic">{t("คอนเทนต์นี้ยังไม่ได้เลือกแพลตฟอร์ม", "This content has no platforms yet")}</p>
        ) : platforms.map((p) => (
          <div key={p}>
            <div className="mb-1"><PlatformChip code={p} /></div>
            <textarea value={all[p]?.note ?? ""} onChange={(e) => setNote(p, e.target.value)} rows={4} placeholder={t("หมายเหตุเริ่มต้นของแพลตฟอร์มนี้ เช่น รูป 1:1 อย่างน้อย 5 รูป", "Default note for this platform, e.g. 1:1 images, at least 5")} className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-mono leading-relaxed resize-y bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-violet-300" />
          </div>
        ))}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={save} disabled={busy || all === null} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{busy ? "..." : t("บันทึกค่าเริ่มต้น", "Save defaults")}</button>
        </div>
      </div>
    </ERPModal>
  );
}

// ป๊อปส่งงาน "คอนเทนต์" — เฉพาะทาง: แนบรูป + path (Drive) + ลิงก์วิดีโอ · ไม่มี Parent SKU / ดันรูปเข้าสินค้า
export function ContentSubmitModal({ sub, taskId, reload, pushToast, canSubmit, onClose }: {
  sub: CreativeSubtask; taskId: string; reload: () => Promise<void>; pushToast: PushToast; canSubmit: boolean; onClose: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkKind, setLinkKind] = useState<"path" | "video" | "link">("path");
  const imageAtts = (sub.attachments ?? []).filter((a) => a.kind === "image" && a.r2_key);
  const linkAtts = (sub.attachments ?? []).filter((a) => a.kind !== "image");
  const addLink = async () => {
    const u = linkUrl.trim(); if (!u) return;
    try { await addAttachment(taskId, { kind: "drive_link", url: u, label: linkKind, subtask_id: sub.id }); setLinkUrl(""); await reload(); }
    catch (e) { pushToast("error", (e as Error).message); }
  };
  const submit = async () => {
    setBusy(true);
    try { await updateSubtask(taskId, sub.id, { status: "submitted" }); await reload(); pushToast("success", t("ส่งงานแล้ว", "Submitted")); onClose(); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };
  const linkLabel = (k?: string | null) => k === "video" ? t("วิดีโอ", "Video") : k === "path" ? "Path" : t("ลิงก์", "Link");
  return (
    <ERPModal open onClose={onClose} size="md" title={t("ส่งงานคอนเทนต์ — แนบรูป / path / ลิงก์วิดีโอ", "Submit content — images / path / video links")}>
      <div className="space-y-4">
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("รูปแนบงาน (ย่อ ≤1500px)", "Work images (resized ≤1500px)")}</p>
          <ImageAttach images={imageAtts.map((a) => ({ id: a.id, r2_key: a.r2_key, file_name: a.file_name }))}
            onAttach={async (r) => { await addAttachment(taskId, { kind: "image", subtask_id: sub.id, ...r }); await reload(); }}
            onDelete={async (aid) => { try { await deleteAttachment(taskId, aid); await reload(); } catch (e) { pushToast("error", (e as Error).message); } }}
            pushToast={pushToast} maxSize={1500} />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("path (โฟลเดอร์/ไฟล์) · ลิงก์วิดีโอ", "Path (folder/file) · video links")}</p>
          <div className="flex items-center gap-1.5 mb-1.5">
            <select value={linkKind} onChange={(e) => setLinkKind(e.target.value as "path" | "video" | "link")} className="h-9 border border-slate-200 rounded-lg px-2 text-sm bg-white shrink-0">
              <option value="path">Path</option>
              <option value="video">{t("วิดีโอ", "Video")}</option>
              <option value="link">{t("ลิงก์อื่น", "Other")}</option>
            </select>
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLink()} placeholder={linkKind === "path" ? t("พาธโฟลเดอร์/ไฟล์ (เช่น ลิงก์ Google Drive)", "Folder/file path (e.g. Google Drive link)") : t("วางลิงก์...", "Paste link...")} className="flex-1 min-w-0 h-9 border border-slate-200 rounded-lg px-3 text-sm" />
            <button onClick={addLink} className="h-9 px-3 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 shrink-0">＋ {t("เพิ่ม", "Add")}</button>
          </div>
          <div className="space-y-1">
            {linkAtts.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs border border-slate-200 rounded-md px-2 py-1">
                <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded px-1 shrink-0">{linkLabel(a.label)}</span>
                <a href={a.url ?? "#"} target="_blank" rel="noopener" className="flex-1 truncate text-violet-600 hover:underline">{a.url}</a>
                <button onClick={async () => { try { await deleteAttachment(taskId, a.id); await reload(); } catch (e) { pushToast("error", (e as Error).message); } }} className="text-slate-300 hover:text-red-500 shrink-0">✕</button>
              </div>
            ))}
            {linkAtts.length === 0 && <p className="text-xs text-slate-400 italic">{t("ยังไม่มี path/ลิงก์", "No path/links yet")}</p>}
          </div>
        </div>
        <div className="flex justify-end items-center gap-2">
          {canSubmit && (imageAtts.length + linkAtts.length) === 0 && <span className="text-[11px] text-amber-600 mr-auto">⚠️ {t("แนบรูป หรือ path/ลิงก์ ก่อนอย่างน้อย 1 รายการ ถึงจะส่งงานได้", "Attach at least one image or path/link before submitting")}</span>}
          <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
          {canSubmit && <button onClick={submit} disabled={busy || (imageAtts.length + linkAtts.length) === 0} className="h-9 px-4 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">{busy ? "..." : `✅ ${t("ยืนยันส่งงาน", "Confirm submit")}`}</button>}
        </div>
      </div>
    </ERPModal>
  );
}
