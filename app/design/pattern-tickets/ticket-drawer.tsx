"use client";

/**
 * ลิ้นชักรายละเอียดตั๋ว Pattern (ของกลาง Drawer)
 *   หัว: ประเภท · เลขตั๋ว · สถานะ · ผู้สั่ง/ช่าง/กำหนดส่ง
 *   รายละเอียด ไทย / ไทย+EN / EN (แก้ได้เฉพาะผู้สั่ง/ผู้จัดการ)
 *   เช็กลิสต์ตามประเภทงาน · ไฟล์ที่ต้องส่งกลับ
 *   ไฟล์แนบ = โฟลเดอร์ Drive ของตั๋ว (ของกลาง DriveFolderFiles) + อัปไฟล์ใหญ่ + ลิงก์ที่วางเอง
 *   คุยงาน = ของกลาง CommentThread (entity pattern_tickets)
 *   ท้าย: ปุ่มเปลี่ยนสถานะตามกติกา lib/pattern-tickets (API คืนมาให้)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer, ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { LoadingState, ErrorState } from "@/components/state-views";
import { DriveFolderFiles } from "@/components/drive-folder-files";
import { CommentThread } from "@/components/comment-thread";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { useFileDrop, FileDropHint } from "@/components/file-drop";
import { UserPicker, type UserPickerValue } from "@/components/pickers/master";
import { apiFetch } from "@/lib/api";
import { translateContent } from "@/lib/content-translate";
import { fmtDate, isOverdue, patternStatus, todayBangkok, typeColorCls, type ChecklistItem, type PatternAction, type TicketLink } from "@/lib/pattern-tickets";
import { uploadTicketFile } from "./upload";
import { ExtBadge } from "./create-modal";
import type { TicketDetail, TicketType } from "./types";

type Lang = "th" | "both" | "en";

export function TicketDrawer({ id, types, onClose, onChanged }: {
  id: string;
  types: TicketType[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [d, setD] = useState<TicketDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<Lang>(() => { try { return (localStorage.getItem("pattern-ticket-lang") as Lang) || "both"; } catch { return "both"; } });
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PatternAction | null>(null);   // ปุ่มที่ต้องใส่เหตุผล
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const [filesKey, setFilesKey] = useState(0);
  const [linkUrl, setLinkUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch(`/api/pattern-tickets/${id}`);
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setD(j as TicketDetail);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { try { localStorage.setItem("pattern-ticket-lang", lang); } catch { /* ไม่มี storage */ } }, [lang]);

  const patch = async (body: Record<string, unknown>, okMsg?: string): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/pattern-tickets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      if (okMsg) toast.success(okMsg);
      await load(); onChanged();
      return true;
    } catch (e) { toast.error((e as Error).message); return false; }
    finally { setBusy(false); }
  };

  const runAction = (a: PatternAction) => {
    if (a.needNote) { setPending(a); setNote(""); return; }
    void patch({ action: "transition", key: a.key }, t(`${a.th} แล้ว`, `${a.en} — done`));
  };

  const uploadFiles = async (files: File[]) => {
    const list = files.filter((f) => f.size > 0);
    if (!list.length) return;
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      setUp({ name: f.name, size: f.size, pct: 0, label: t("กำลังอัปขึ้น Drive", "Uploading to Drive"), count: { current: i + 1, total: list.length } });
      try { await uploadTicketFile(id, f, (pct) => setUp((u) => u ? { ...u, pct } : u)); ok++; }
      catch (e) { toast.error(t(`อัป ${f.name} ไม่สำเร็จ: ${(e as Error).message}`, `Upload of ${f.name} failed: ${(e as Error).message}`)); }
    }
    setUp(null);
    if (ok) { toast.success(t(`อัปขึ้น Drive แล้ว ${ok} ไฟล์`, `Uploaded ${ok} file(s) to Drive`)); setFilesKey((k) => k + 1); await load(); onChanged(); }
  };
  const drop = useFileDrop((fs) => void uploadFiles(fs), { disabled: !!up, onBusy: () => toast.info(t("รออัปไฟล์ก่อนหน้าให้เสร็จก่อน", "Wait for the current upload to finish")) });

  const tk = d?.data;
  const ty = tk ? types.find((x) => x.key === tk.type_key) : undefined;
  const st = tk ? patternStatus(tk.status) : null;
  const late = tk ? isOverdue(tk.due_date, tk.status, todayBangkok()) : false;

  const toggleCheck = (i: number) => {
    if (!tk || !d?.can_work) return;
    const next: ChecklistItem[] = tk.checklist.map((c, j) => j === i ? { ...c, done: !c.done } : c);
    setD({ ...d, data: { ...tk, checklist: next } });   // ติ๊กแล้วเห็นทันที
    void patch({ action: "checklist", checklist: next });
  };

  const addLink = () => {
    if (!tk) return;
    const url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) { toast.warning(t("วางลิงก์ที่ขึ้นต้นด้วย https://", "Paste a link starting with https://")); return; }
    const links: TicketLink[] = [...(tk.links ?? []), { url, label: "" }];
    void patch({ action: "links", links }).then((ok) => { if (ok) setLinkUrl(""); });
  };
  const removeLink = (i: number) => { if (tk) void patch({ action: "links", links: tk.links.filter((_, j) => j !== i) }); };

  return (
    <Drawer open onClose={onClose} size="lg" storageKey="pattern-ticket-drawer"
      title={tk ? `${tk.ticket_no ?? ""} ${tk.title}`.trim() : t("ตั๋วงาน", "Ticket")}
      description={ty ? `${ty.label_th} / ${ty.label_en}` : undefined}
      footer={tk && d ? (
        <div className="flex w-full flex-wrap items-center gap-2">
          {tk.drive_folder_url && (
            <a href={tk.drive_folder_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
              <Icon name="folder-open" /> {t("เปิดโฟลเดอร์ Drive", "Open Drive folder")}
            </a>
          )}
          <span className="flex-1" />
          {d.actions.map((a) => (
            <button key={a.key} type="button" disabled={busy} onClick={() => runAction(a)}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium disabled:opacity-60 ${a.primary ? "bg-blue-600 text-white hover:bg-blue-700" : a.danger ? "border border-red-200 text-red-600 hover:bg-red-50" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
              {t(a.th, a.en)}
            </button>
          ))}
        </div>
      ) : undefined}>
      {loading && !d ? <LoadingState label={t("กำลังโหลดตั๋ว…", "Loading ticket…")} />
        : err ? <ErrorState title={t("โหลดตั๋วไม่สำเร็จ", "Couldn't load the ticket")} hint={err} onRetry={() => void load()} />
        : tk && d && st ? (
        <div className="flex flex-col gap-5" {...drop.guard}>
          {/* หัว */}
          <div className="flex items-start gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl ${typeColorCls(ty?.color)}`}><Icon value={ty?.icon ?? "i:file"} /></span>
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${st.cls}`}>{t(st.th, st.en)}</span>
                {tk.priority === "urgent" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">{t("ด่วน", "Urgent")}</span>}
                {tk.sku_code && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">SKU {tk.sku_code}</span>}
              </div>
              <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-slate-500 sm:grid-cols-2">
                <span><Icon name="user" /> {t("ผู้สั่ง", "Requested by")} <b className="font-medium text-slate-700">{tk.requester_name ?? "—"}</b>{tk.requester_dept ? ` (${tk.requester_dept})` : ""}</span>
                <span className={late ? "font-medium text-red-600" : ""}><Icon name="clock" /> {t("กำหนดส่ง", "Due")} {tk.due_date ? fmtDate(tk.due_date) : "—"}{late ? ` · ${t("เลยกำหนด", "overdue")}` : ""}</span>
                <AssigneeLine tk={tk} canAssign={d.can_assign} busy={busy} onAssign={(v) => void patch({ action: "assign", assignee_id: v?.id ?? null, assignee_name: v?.name ?? null }, t("มอบหมายแล้ว", "Assigned"))} />
              </div>
            </div>
          </div>

          {tk.last_note && (tk.status === "fix" || tk.status === "cancelled" || tk.status === "doing") && (
            <div className={`rounded-lg px-3 py-2 text-sm ${tk.status === "fix" ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"}`}>
              <Icon name="chat" /> {tk.status === "fix" ? t("ผู้สั่งตีกลับ:", "Sent back:") : t("หมายเหตุล่าสุด:", "Last note:")} {tk.last_note}
            </div>
          )}

          {/* รายละเอียด */}
          <section>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <h3 className="text-sm font-semibold text-slate-700">{t("รายละเอียดงาน", "Job details")}</h3>
              {d.can_edit && <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-blue-600 hover:bg-blue-50"><Icon name="edit" /> {t("แก้ไข", "Edit")}</button>}
              <span className="flex-1" />
              {(["th", "both", "en"] as Lang[]).map((l) => (
                <button key={l} type="button" onClick={() => setLang(l)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${lang === l ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}>
                  {l === "th" ? "ไทย" : l === "en" ? "EN" : "ไทย + EN"}
                </button>
              ))}
            </div>
            {lang !== "en" && <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{tk.description_th || t("ไม่มีรายละเอียด", "No details")}</p>}
            {lang !== "th" && (
              <div className={`${lang === "both" ? "mt-2" : ""} rounded-lg bg-slate-50 px-3 py-2`}>
                <div className="mb-0.5 text-[11px] text-slate-400"><Icon name="web" /> English · {tk.en_edited ? t("แก้คำแปลแล้ว", "edited") : t("แปลอัตโนมัติ", "auto-translated")}</div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{tk.description_en || (tk.description_th ? t("(ยังไม่มีคำแปล)", "(no translation yet)") : t("No details", "No details"))}</p>
              </div>
            )}
          </section>

          {/* เช็กลิสต์ */}
          {(tk.checklist.length > 0 || (ty?.deliverables.length ?? 0) > 0) && (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-slate-700">
                {t("เช็กลิสต์", "Checklist")} <span className="font-normal text-slate-400">({tk.checklist.filter((c) => c.done).length}/{tk.checklist.length})</span>
              </h3>
              <div className="flex flex-col">
                {tk.checklist.map((c, i) => (
                  <label key={i} className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-sm ${d.can_work ? "cursor-pointer hover:bg-slate-50" : ""}`}>
                    <input type="checkbox" checked={c.done} disabled={!d.can_work || busy} onChange={() => toggleCheck(i)} className="h-4 w-4 accent-blue-600" />
                    <span className={c.done ? "text-slate-400 line-through" : "text-slate-700"}>{c.label}</span>
                  </label>
                ))}
              </div>
              {(ty?.deliverables.length ?? 0) > 0 && (
                <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                  {t("ไฟล์ที่ต้องส่งกลับ:", "Deliver as:")} {ty!.deliverables.map((x) => <ExtBadge key={x} name={`f.${x}`} />)}
                </p>
              )}
            </section>
          )}

          {/* ไฟล์แนบ (Drive) */}
          <section>
            <h3 className="mb-1.5 text-sm font-semibold text-slate-700">{t("ไฟล์แนบ (Google Drive)", "Attachments (Google Drive)")}</h3>
            {tk.drive_folder_url
              ? <DriveFolderFiles folder={tk.drive_folder_url} title={t("ไฟล์ในโฟลเดอร์ตั๋ว", "Files in this ticket's folder")} reloadKey={filesKey} />
              : <p className="mb-2 text-xs text-slate-400">{t("ยังไม่มีไฟล์ — แนบไฟล์แรกแล้วระบบสร้างโฟลเดอร์ใน Drive ให้", "No files yet — the Drive folder is created with the first upload")}</p>}

            {(tk.links?.length ?? 0) > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {tk.links.map((l, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1 text-sm">
                    <Icon name="link" />
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-blue-600 hover:underline">{l.label || l.url}</a>
                    {d.can_work && <button type="button" aria-label={t("เอาลิงก์ออก", "Remove link")} onClick={() => removeLink(i)} className="text-slate-400 hover:text-red-600"><Icon name="cancel" /></button>}
                  </li>
                ))}
              </ul>
            )}

            {(d.can_work || d.can_edit) && tk.status !== "cancelled" && (
              <div {...drop.zone("files")} className="relative mt-2 rounded-lg border border-dashed border-slate-300 p-3">
                <FileDropHint show={drop.over === "files"} label={t("วางไฟล์เพื่ออัปขึ้น Drive", "Drop to upload to Drive")} />
                {up ? <UploadProgress {...up} /> : (
                  <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
                    <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-600 hover:bg-slate-50"><Icon name="upload" /> {t("แนบไฟล์", "Attach files")}</button>
                    <span>{t("หรือลากมาวาง · AI PSD PNG PDF DXF ถึง 5GB", "or drag here · AI PSD PNG PDF DXF up to 5GB")}</span>
                  </div>
                )}
                <input ref={fileRef} type="file" multiple hidden onChange={(e) => { void uploadFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                <div className="mt-2 flex gap-1.5">
                  <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addLink(); }}
                    placeholder={t("หรือวางลิงก์ไฟล์/โฟลเดอร์ Drive ที่มีอยู่แล้ว", "Or paste an existing Drive file/folder link")}
                    className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-blue-400" />
                  <button type="button" onClick={addLink} disabled={busy || !linkUrl.trim()} className="rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">{t("เพิ่มลิงก์", "Add link")}</button>
                </div>
              </div>
            )}
          </section>

          {/* คุยงาน */}
          <section>
            <CommentThread entityType="pattern_tickets" entityId={tk.id} title={t("คุยงาน", "Discussion")} maxHeight={360} />
          </section>
        </div>
      ) : null}

      {/* เหตุผล (ตีกลับ / ยกเลิก / เปิดใหม่) */}
      {pending && (
        <ERPModal open onClose={() => setPending(null)} title={t(pending.th, pending.en)} size="sm" hasUnsavedChanges={!!note.trim()}
          footer={
            <div className="flex w-full justify-end gap-2">
              <button type="button" onClick={() => setPending(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">{t("กลับ", "Back")}</button>
              <button type="button" disabled={busy || !note.trim()}
                onClick={() => void patch({ action: "transition", key: pending.key, note: note.trim() }, t(`${pending.th} แล้ว`, `${pending.en} — done`)).then((ok) => { if (ok) setPending(null); })}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${pending.danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}>
                {t("ยืนยัน", "Confirm")}
              </button>
            </div>
          }>
          <label className="block text-sm text-slate-600">
            {pending.key === "reject" ? t("บอกช่างว่าต้องแก้ตรงไหน", "Tell the maker what to fix") : t("เหตุผล", "Reason")} *
            <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
          </label>
        </ERPModal>
      )}

      {editing && tk && (
        <EditTicketModal tk={tk} onClose={() => setEditing(false)}
          onSave={async (fields) => { const ok = await patch({ action: "update", fields }, t("บันทึกแล้ว", "Saved")); if (ok) setEditing(false); }} />
      )}
    </Drawer>
  );
}

function AssigneeLine({ tk, canAssign, busy, onAssign }: { tk: TicketDetail["data"]; canAssign: boolean; busy: boolean; onAssign: (v: UserPickerValue | null) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (open && canAssign) {
    return (
      <span className="col-span-full flex items-center gap-1.5">
        <span className="min-w-0 flex-1"><UserPicker value={tk.assignee_id ? { id: tk.assignee_id, code: null, name: tk.assignee_name ?? "" } : null} onChange={(v) => { setOpen(false); onAssign(v); }} disableCreate /></span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500">{t("ปิด", "Close")}</button>
      </span>
    );
  }
  return (
    <span>
      <Icon name="tool" /> {t("ช่าง", "Maker")} <b className="font-medium text-slate-700">{tk.assignee_name ?? t("ยังไม่มีคนรับ", "Unassigned")}</b>
      {canAssign && <button type="button" disabled={busy} onClick={() => setOpen(true)} className="ml-1 text-blue-600 hover:underline">{t("เปลี่ยน", "Change")}</button>}
    </span>
  );
}

function EditTicketModal({ tk, onClose, onSave }: { tk: TicketDetail["data"]; onClose: () => void; onSave: (fields: Record<string, unknown>) => Promise<void> }) {
  const t = useT();
  const toast = useToast();
  const [title, setTitle] = useState(tk.title);
  const [th, setTh] = useState(tk.description_th);
  const [en, setEn] = useState(tk.description_en);
  const [enEdited, setEnEdited] = useState(tk.en_edited);
  const [due, setDue] = useState(tk.due_date ?? "");
  const [urgent, setUrgent] = useState(tk.priority === "urgent");
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const dirty = title !== tk.title || th !== tk.description_th || en !== tk.description_en || due !== (tk.due_date ?? "") || urgent !== (tk.priority === "urgent");

  const translate = async () => {
    setTranslating(true);
    try { const [x] = await translateContent([th], "en"); if (x) { setEn(x); setEnEdited(false); } }
    catch (e) { toast.warning((e as Error).message); }
    finally { setTranslating(false); }
  };
  const save = async () => {
    if (!title.trim()) { toast.warning(t("ชื่องานห้ามว่าง", "Title can't be empty")); return; }
    setSaving(true);
    // แก้ไทยแต่ไม่ได้แตะคำแปลเอง → แปลใหม่ให้ตรงกัน
    let enOut = en;
    if (th !== tk.description_th && !enEdited && th.trim()) {
      try { const [x] = await translateContent([th], "en"); if (x) enOut = x; } catch { /* ใช้คำแปลเดิม */ }
    }
    await onSave({ title: title.trim(), description_th: th, description_en: enOut, en_edited: enEdited, due_date: due || null, priority: urgent ? "urgent" : "normal" });
    setSaving(false);
  };

  return (
    <ERPModal open onClose={onClose} title={t("แก้ไขตั๋ว", "Edit ticket")} size="lg" hasUnsavedChanges={dirty && !saving} loading={saving} defaultExpanded={false}
      footer={
        <div className="flex w-full justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" disabled={saving || !dirty} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
        </div>
      }>
      <div className="flex flex-col gap-3 p-1">
        <label className="text-xs font-medium text-slate-600">{t("ชื่องาน", "Title")}
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">{t("รายละเอียด (ไทย)", "Details (Thai)")}
            <textarea value={th} onChange={(e) => setTh(e.target.value)} rows={7} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-blue-400" />
          </label>
          <div className="text-xs font-medium text-slate-600">
            <div className="flex items-center gap-2">English
              <button type="button" onClick={() => void translate()} disabled={translating || !th.trim()} className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 font-normal text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                <Icon name="ai" /> {translating ? t("กำลังแปล…", "Translating…") : t("แปลใหม่", "Re-translate")}
              </button>
            </div>
            <textarea value={en} onChange={(e) => { setEn(e.target.value); setEnEdited(true); }} rows={7} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal outline-none focus:border-blue-400 focus:bg-white" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">{t("กำหนดส่ง", "Due date")}
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" />
          </label>
          <div className="text-xs font-medium text-slate-600">{t("ความด่วน", "Priority")}
            <div className="mt-1 flex gap-1.5">
              <button type="button" onClick={() => setUrgent(false)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-normal ${!urgent ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>{t("ปกติ", "Normal")}</button>
              <button type="button" onClick={() => setUrgent(true)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-normal ${urgent ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}>{t("ด่วน", "Urgent")}</button>
            </div>
          </div>
        </div>
      </div>
    </ERPModal>
  );
}
