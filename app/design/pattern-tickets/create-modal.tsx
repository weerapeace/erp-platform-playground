"use client";

/**
 * ป๊อปเปิดตั๋วงาน Pattern (ของกลาง ERPModal)
 *   ประเภทงาน → ชื่องาน/รุ่นสินค้า → รายละเอียดไทย (+ แปลอังกฤษอัตโนมัติ แก้ได้) → ด่วน/กำหนดส่ง → มอบหมายช่าง (ไม่ใส่ = ใครก็กดรับได้)
 *   ไฟล์แนบ (AI/PSD/PNG/PDF/DXF ไฟล์ใหญ่ได้) อัปขึ้น Drive หลังสร้างตั๋ว
 */
import { useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { useFileDrop, FileDropHint } from "@/components/file-drop";
import { ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import { UserPicker, type UserPickerValue } from "@/components/pickers/master";
import { apiFetch } from "@/lib/api";
import { translateContent } from "@/lib/content-translate";
import { typeColorCls } from "@/lib/pattern-tickets";
import { fmtBytes, uploadTicketFile } from "./upload";
import type { TicketType } from "./types";

export function CreateTicketModal({ types, initialType, onClose, onCreated }: {
  types: TicketType[];
  /** ประเภทที่เลือกไว้ให้ก่อน (กดจากแผ่นประเภทงานบนหน้า) — เปลี่ยนในป๊อปได้ */
  initialType?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useT();
  const toast = useToast();
  const active = useMemo(() => types.filter((x) => x.is_active), [types]);
  const startType = initialType && active.some((x) => x.key === initialType) ? initialType : "";
  const [typeKey, setTypeKey] = useState(startType);
  const [title, setTitle] = useState("");
  const [sku, setSku] = useState<ParentSkuPickerValue | null>(null);
  const [descTh, setDescTh] = useState("");
  const [descEn, setDescEn] = useState("");
  const [enEdited, setEnEdited] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState<UserPickerValue | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = !!(typeKey !== startType || title || sku || descTh || files.length);
  const ty = active.find((x) => x.key === typeKey);

  const addFiles = (list: File[]) => setFiles((cur) => [...cur, ...list.filter((f) => f.size > 0 && !cur.some((c) => c.name === f.name && c.size === f.size))]);
  const drop = useFileDrop((fs) => addFiles(fs), { disabled: saving, onBusy: () => toast.info(t("รอให้บันทึกเสร็จก่อน", "Wait for saving to finish")) });

  const translate = async (): Promise<string> => {
    if (!descTh.trim()) return "";
    setTranslating(true);
    try {
      const [en] = await translateContent([descTh], "en");
      if (en) { setDescEn(en); setEnEdited(false); }
      return en ?? "";
    } catch (e) {
      toast.warning(t(`แปลอัตโนมัติไม่สำเร็จ: ${(e as Error).message}`, `Auto-translate failed: ${(e as Error).message}`));
      return "";
    } finally { setTranslating(false); }
  };

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!typeKey) errs.type = t("เลือกประเภทงาน", "Pick a job type");
    if (!title.trim()) errs.title = t("ใส่ชื่องาน", "Enter a title");
    if (!descTh.trim()) errs.desc = t("ใส่รายละเอียดงาน", "Describe the job");
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const en = descEn.trim() || (await translate());   // ยังไม่ได้แปล → แปลให้ก่อนบันทึก
      const res = await apiFetch("/api/pattern-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type_key: typeKey, title: title.trim(),
          sku_code: sku?.code ?? null, parent_sku_id: sku?.id ?? null,
          description_th: descTh.trim(), description_en: en, en_edited: enEdited,
          priority: urgent ? "urgent" : "normal", due_date: due || null,
          assignee_id: assignee?.id ?? null, assignee_name: assignee?.name ?? null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error || !j.data?.id) throw new Error(j.error || `HTTP ${res.status}`);
      const id = j.data.id as string;

      // อัปไฟล์แนบขึ้น Drive ทีละไฟล์ (ตั๋วถูกสร้างแล้ว — ไฟล์ไหนพลาดแนบซ้ำทีหลังในตั๋วได้)
      const failed: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setUp({ name: f.name, size: f.size, pct: 0, label: t("กำลังอัปขึ้น Drive", "Uploading to Drive"), count: { current: i + 1, total: files.length } });
        try { await uploadTicketFile(id, f, (pct) => setUp((u) => u ? { ...u, pct } : u)); }
        catch { failed.push(f.name); }
      }
      setUp(null);
      if (failed.length) toast.warning(t(`สร้างตั๋วแล้ว แต่อัปไฟล์ไม่สำเร็จ ${failed.length} ไฟล์ — แนบใหม่ในตั๋วได้`, `Ticket created, but ${failed.length} file(s) failed — re-attach in the ticket`));
      else toast.success(t(`เปิดตั๋ว ${j.data.ticket_no ?? ""} แล้ว`, `Ticket ${j.data.ticket_no ?? ""} created`));
      onCreated(id);
    } catch (e) {
      toast.error(t(`เปิดตั๋วไม่สำเร็จ: ${(e as Error).message}`, `Couldn't create ticket: ${(e as Error).message}`));
    } finally { setSaving(false); setUp(null); }
  };

  return (
    <ERPModal open onClose={onClose} title={t("เปิดตั๋วงานช่าง Pattern", "New pattern ticket")} size="lg" storageKey="pattern-ticket-create"
      hasUnsavedChanges={dirty && !saving} loading={saving} defaultExpanded={false}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" onClick={() => void submit()} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {saving ? t("กำลังบันทึก…", "Saving…") : t("เปิดตั๋ว", "Create ticket")}
          </button>
        </div>
      }>
      <div className="flex flex-col gap-4 p-1" {...drop.guard}>
        {/* ประเภทงาน */}
        <section>
          <Label>{t("ประเภทงาน", "Job type")} *</Label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {active.map((x) => (
              <button key={x.key} type="button" onClick={() => { setTypeKey(x.key); setErrors((e) => ({ ...e, type: "" })); }}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition ${typeKey === x.key ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200" : "border-slate-200 hover:border-slate-300"}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${typeColorCls(x.color)}`}><Icon value={x.icon} /></span>
                <span className="min-w-0 leading-tight"><span className="block truncate font-medium text-slate-700">{x.label_th}</span><span className="block truncate text-[11px] text-slate-400">{x.label_en}</span></span>
              </button>
            ))}
          </div>
          {errors.type && <Err>{errors.type}</Err>}
          {ty && (ty.checklist.length > 0 || ty.deliverables.length > 0) && (
            <p className="mt-1.5 text-xs text-slate-500">
              {t("เช็กลิสต์ตั้งต้น", "Starter checklist")} {ty.checklist.length} {t("ข้อ", "items")}
              {ty.deliverables.length ? ` · ${t("ช่างต้องส่งไฟล์", "Maker delivers")} ${ty.deliverables.join(", ")}` : ""}
            </p>
          )}
        </section>

        {/* ชื่องาน + รุ่นสินค้า */}
        <section className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t("ชื่องาน", "Title")} *</Label>
            <input value={title} onChange={(e) => { setTitle(e.target.value); setErrors((x) => ({ ...x, title: "" })); }} placeholder={t("กระเป๋าหนังทรงกล่อง หน้าเลเซอร์โลโก้", "Box bag — laser logo front panel")}
              className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
            {errors.title && <Err>{errors.title}</Err>}
          </div>
          <div>
            <Label>{t("รุ่นสินค้า (ถ้ามี)", "Product model (optional)")}</Label>
            <ParentSkuPicker value={sku} onChange={(v) => { setSku(v); if (v && !title.trim()) setTitle(v.name); }} disableCreate />
          </div>
        </section>

        {/* รายละเอียด 2 ภาษา */}
        <section className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t("รายละเอียดงาน (ภาษาไทย)", "Details (Thai)")} *</Label>
            <textarea value={descTh} onChange={(e) => { setDescTh(e.target.value); setErrors((x) => ({ ...x, desc: "" })); }} rows={6}
              placeholder={t("ขนาด วัสดุ ตำแหน่ง จุดที่ต้องระวัง…", "Size, material, position, things to watch…")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            {errors.desc && <Err>{errors.desc}</Err>}
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600">English</span>
              <span className="text-[11px] text-slate-400">{enEdited ? t("แก้เองแล้ว", "edited") : t("แปลอัตโนมัติ", "auto")}</span>
              <button type="button" onClick={() => void translate()} disabled={translating || !descTh.trim()}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                <Icon name="ai" /> {translating ? t("กำลังแปล…", "Translating…") : t("แปลเป็นอังกฤษ", "Translate")}
              </button>
            </div>
            <textarea value={descEn} onChange={(e) => { setDescEn(e.target.value); setEnEdited(true); }} rows={6}
              placeholder={t("กด \"แปลเป็นอังกฤษ\" หรือเว้นไว้ ระบบแปลให้ตอนบันทึก", "Press Translate, or leave empty — it's translated on save")}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:bg-white" />
          </div>
        </section>

        {/* ด่วน / กำหนดส่ง / ช่าง */}
        <section className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>{t("ความด่วน", "Priority")}</Label>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setUrgent(false)} className={`flex-1 rounded-lg border px-3 py-2 text-sm ${!urgent ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>{t("ปกติ", "Normal")}</button>
              <button type="button" onClick={() => setUrgent(true)} className={`flex-1 rounded-lg border px-3 py-2 text-sm ${urgent ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}>{t("ด่วน", "Urgent")}</button>
            </div>
          </div>
          <div>
            <Label>{t("กำหนดส่ง", "Due date")}</Label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
          </div>
          <div>
            <Label>{t("มอบหมายช่าง (ไม่ใส่ = ใครก็รับได้)", "Assign maker (optional)")}</Label>
            <UserPicker value={assignee} onChange={setAssignee} disableCreate />
          </div>
        </section>

        {/* ไฟล์แนบ */}
        <section>
          <Label>{t("ไฟล์แนบ (เก็บใน Google Drive)", "Attachments (stored in Google Drive)")}</Label>
          <div {...drop.zone("files")} className="relative rounded-lg border border-dashed border-slate-300 p-3">
            <FileDropHint show={drop.over === "files"} label={t("วางไฟล์ตรงนี้", "Drop files here")} />
            {files.length > 0 && (
              <ul className="mb-2 flex flex-col gap-1">
                {files.map((f) => (
                  <li key={`${f.name}-${f.size}`} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1 text-sm">
                    <ExtBadge name={f.name} />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-slate-400">{fmtBytes(f.size)}</span>
                    {!saving && <button type="button" aria-label={t("เอาออก", "Remove")} onClick={() => setFiles((cur) => cur.filter((c) => c !== f))} className="text-slate-400 hover:text-red-600"><Icon name="cancel" /></button>}
                  </li>
                ))}
              </ul>
            )}
            {up ? <UploadProgress {...up} /> : (
              <div className="flex flex-wrap items-center justify-center gap-2 text-center text-xs text-slate-500">
                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-600 hover:bg-slate-50"><Icon name="upload" /> {t("เลือกไฟล์", "Choose files")}</button>
                <span>{t("หรือลากไฟล์มาวาง · AI PSD PNG PDF DXF ไฟล์ใหญ่ได้ถึง 5GB", "or drag files here · AI PSD PNG PDF DXF up to 5GB")}</span>
              </div>
            )}
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          </div>
        </section>
      </div>
    </ERPModal>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <div className="mb-1 text-xs font-medium text-slate-600">{children}</div>;
const Err = ({ children }: { children: React.ReactNode }) => <p className="mt-1 text-xs text-red-600">{children}</p>;

/** ป้ายนามสกุลไฟล์ (AI/PSD/PDF…) */
export function ExtBadge({ name }: { name: string }) {
  const ext = (name.match(/\.([^.]+)$/)?.[1] ?? "").toUpperCase().slice(0, 4) || "FILE";
  const cls = ({ AI: "bg-amber-50 text-amber-800", EPS: "bg-amber-50 text-amber-800", PSD: "bg-blue-50 text-blue-800", PSB: "bg-blue-50 text-blue-800", PNG: "bg-violet-50 text-violet-800", JPG: "bg-violet-50 text-violet-800", JPEG: "bg-violet-50 text-violet-800", PDF: "bg-red-50 text-red-800", DXF: "bg-teal-50 text-teal-800", SVG: "bg-teal-50 text-teal-800" } as Record<string, string>)[ext] ?? "bg-slate-100 text-slate-600";
  return <span className={`min-w-[38px] rounded px-1.5 py-0.5 text-center font-mono text-[10px] ${cls}`}>{ext}</span>;
}
