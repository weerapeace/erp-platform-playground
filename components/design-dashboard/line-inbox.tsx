"use client";

/**
 * กล่อง "งานจากไลน์" บน Design Dashboard — ปุ่ม (ป้ายจำนวน) + ลิ้นชักรายการร่าง
 *
 * ร่างมาจากกลุ่มไลน์ "ส่งงานออกแบบ" (บอทรับ + AI เดาชื่อ/แบรนด์/วันส่ง · server: lib/design-line-inbox)
 *   รอเปิดใบงาน → กด "เปิดใบงาน" = ฟอร์มสร้างใบงานเดิม กรอกให้แล้ว (หน้าแม่เปิด DesignSheetsDetail createMode + prefill)
 *   ไม่ใช่งาน   → กู้คืนได้ · เปิดใบงานแล้ว → กดเปิดดูใบงาน
 * มี "วางเอง" (ข้อความ + รูป) เป็นทางสำรองตอนไลน์มีปัญหา · แอดมินเลือกกลุ่มไลน์ได้ในลิ้นชักเลย (ของกลาง LineGroupSetup)
 * API: /api/design-sheets/line-inbox · เปิดใบงานจริง = POST /api/design-sheets + line_inbox_id
 */
import { useCallback, useEffect, useState, type ClipboardEvent } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { Drawer } from "@/components/modal";
import { Icon } from "@/components/icon";
import { HoverImage } from "@/components/hover-image";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { LineGroupSetup } from "@/components/line-group-setup";
import { LineConsole } from "@/components/line-console";
import { LINE_INBOX_TAB_LABEL, type LineInboxItem, type LineInboxTab } from "@/lib/design-line-inbox-shared";

const API = "/api/design-sheets/line-inbox";
const TABS: LineInboxTab[] = ["pending", "rejected", "converted"];

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const shortDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }) : null;

/** จำนวนร่างที่รอเปิดใบงาน + ตั้งกลุ่มไลน์แล้วหรือยัง (โหลดเบา ๆ สำหรับป้ายบนปุ่ม) */
export function useLineInboxCount(reloadKey: number): { pending: number; groupReady: boolean } {
  const [state, setState] = useState({ pending: 0, groupReady: true });
  useEffect(() => {
    let alive = true;
    apiFetch(`${API}?count=1`).then((r) => r.json()).then((j) => {
      if (alive && !j?.error) setState({ pending: Number(j.pending) || 0, groupReady: !!j.group_ready });
    }).catch(() => { /* ป้ายไม่ขึ้นก็ใช้บอร์ดได้ */ });
    return () => { alive = false; };
  }, [reloadKey]);
  return state;
}

/** ปุ่ม "จากไลน์ (n)" — วางข้างปุ่มเพิ่มงาน */
export function LineInboxButton({ count, onClick, className = "" }: { count: number; onClick: () => void; className?: string }) {
  const t = useT();
  return (
    <button type="button" data-gg-action onClick={onClick} title={t("งานที่ส่งมาจากกลุ่มไลน์ รอเปิดใบงาน", "Jobs sent from the LINE group, waiting to be opened")}
      className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium shadow-sm ${count > 0 ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-slate-200 bg-white/85 text-slate-600 hover:bg-white"} ${className}`}>
      <Icon name="chat" />
      {t("จากไลน์", "From LINE")}
      {count > 0 && <span className="rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold leading-5 text-white">{count}</span>}
    </button>
  );
}

export function LineInboxDrawer({ open, onClose, canEdit, isAdmin, onConvert, onOpenSheet, onChanged }: {
  open: boolean; onClose: () => void; canEdit: boolean; isAdmin: boolean;
  /** กด "เปิดใบงาน" — หน้าแม่เปิดฟอร์มสร้างใบงาน (กรอกจากร่าง) */
  onConvert: (item: LineInboxItem) => void;
  onOpenSheet: (sheetId: string) => void;
  /** จำนวนในกล่องเปลี่ยน (ตีตก/กู้คืน/วางเอง) — ให้หน้าแม่โหลดป้ายใหม่ */
  onChanged: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [tab, setTab] = useState<LineInboxTab>("pending");
  const [items, setItems] = useState<LineInboxItem[]>([]);
  const [counts, setCounts] = useState<Record<LineInboxTab, number>>({ pending: 0, rejected: 0, converted: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [setupKey, setSetupKey] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await apiFetch(`${API}?tab=${tab}`);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || t("โหลดไม่สำเร็จ", "Load failed"));
      setItems((j.items ?? []) as LineInboxItem[]);
      if (j.counts) setCounts(j.counts);
    } catch (e) { setError(e instanceof Error ? e.message : t("โหลดไม่สำเร็จ", "Load failed")); }
    finally { setLoading(false); }
  }, [tab, t]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const act = async (item: LineInboxItem, action: "reject" | "restore" | "reread") => {
    setBusyId(item.id);
    try {
      const r = await apiFetch(API, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, action }) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || t("ทำรายการไม่สำเร็จ", "Action failed"));
      if (action === "reject") toast.success(t("ย้ายไป \"ไม่ใช่งาน\" แล้ว — กู้คืนได้", "Moved to \"Not a job\" — can be restored"));
      if (action === "restore") toast.success(t("กู้คืนเข้ากล่องแล้ว", "Restored to the inbox"));
      if (action === "reread") j.ai_error ? toast.error(String(j.ai_error)) : toast.success(t("AI อ่านใหม่แล้ว", "AI re-read done"));
      await load(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ทำรายการไม่สำเร็จ", "Action failed")); }
    finally { setBusyId(null); }
  };

  return (
    <>
      <Drawer open={open} onClose={onClose} size="lg" storageKey="design-line-inbox"
        title={t("งานจากไลน์", "Jobs from LINE")}
        description={t("ข้อความ + รูปที่ส่งในกลุ่มไลน์ส่งงานออกแบบ — ตรวจแล้วกดเปิดใบงาน", "Messages + images sent in the design LINE group — review, then open a design sheet")}
        headerActions={() => (
          <button type="button" onClick={() => void load()} title={t("รีเฟรช", "Refresh")} aria-label={t("รีเฟรช", "Refresh")}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><Icon name="refresh" /></button>
        )}>
        <div className="space-y-3">
          {isAdmin && (
            <LineGroupSetup slot="design_intake" setupUrl={`${API}?setup=1`} reloadKey={setupKey}
              onOpenConsole={() => setConsoleOpen(true)} onChanged={onChanged}
              text={{
                purpose: "ส่งงานออกแบบ",
                readyNote: "ส่งข้อความ + รูปในกลุ่มนี้ได้เลย ของคนเดิมภายใน 5 นาทีรวมเป็นงานเดียว บอทตอบกลับให้ (ไม่เสียโควตา) · ข้อความคุยเล่นบอทเงียบและย้ายไป \"ไม่ใช่งาน\" ให้เอง",
                pickHint: "แนะนำกลุ่มที่ใช้ส่งงานออกแบบอย่างเดียว — ทุกข้อความและรูปในกลุ่มที่เลือกจะเข้ากล่องนี้",
                busyWarn: "กลุ่มนี้ใช้กับระบบอื่นอยู่ — ข้อความ/รูปเรื่องอื่นจะเข้ากล่องงานออกแบบด้วย",
              }} />
          )}

          <div className="flex gap-1.5">
            {TABS.map((k) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`h-8 rounded-full border px-3 text-xs font-medium ${tab === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                {t(LINE_INBOX_TAB_LABEL[k], k === "pending" ? "Waiting" : k === "rejected" ? "Not a job" : "Opened")}
                <span className="ml-1 opacity-70">{counts[k]}</span>
              </button>
            ))}
          </div>
          {tab !== "pending" && <p className="text-[11px] text-slate-400">{t("แสดง 30 วันล่าสุด", "Last 30 days")}</p>}

          {loading && items.length === 0 ? <LoadingState />
            : error ? <ErrorState hint={error} onRetry={() => void load()} />
            : items.length === 0 ? (
              <EmptyState icon={<Icon name="chat" />}
                title={tab === "pending" ? t("ยังไม่มีงานรอเปิดใบงาน", "No jobs waiting") : t("ไม่มีรายการ", "Nothing here")}
                hint={tab === "pending" ? t("ส่งข้อความ + รูปในกลุ่มไลน์ส่งงานออกแบบ แล้วงานจะโผล่ที่นี่", "Send a message + images in the design LINE group and it shows up here") : undefined} />
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {items.map((it) => (
                  <InboxRow key={it.id} it={it} canEdit={canEdit} busy={busyId === it.id}
                    expanded={!!expanded[it.id]} onToggle={() => setExpanded((m) => ({ ...m, [it.id]: !m[it.id] }))}
                    onConvert={() => onConvert(it)} onAct={(a) => void act(it, a)} onOpenSheet={onOpenSheet} />
                ))}
              </ul>
            )}

          {canEdit && tab === "pending" && <ManualDraft onDone={() => { void load(); onChanged(); }} />}
        </div>
      </Drawer>
      {isAdmin && consoleOpen && <LineConsole open={consoleOpen} onClose={() => { setConsoleOpen(false); setSetupKey((k) => k + 1); }} />}
    </>
  );
}

function InboxRow({ it, canEdit, busy, expanded, onToggle, onConvert, onAct, onOpenSheet }: {
  it: LineInboxItem; canEdit: boolean; busy: boolean; expanded: boolean; onToggle: () => void;
  onConvert: () => void; onAct: (a: "reject" | "restore" | "reread") => void; onOpenSheet: (id: string) => void;
}) {
  const t = useT();
  const deadline = shortDate(it.deadline);
  const longText = (it.text ?? "").length > 90 || (it.text ?? "").includes("\n");
  return (
    <li className="px-3 py-2.5">
      <div className="flex gap-3">
        <div className="flex shrink-0 gap-1">
          {it.images.length === 0
            ? <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-300"><Icon name="image" size={20} /></span>
            : it.images.slice(0, 2).map((u) => <HoverImage key={u} url={u} size={48} previewSize={360} rounded="rounded-lg" />)}
          {it.images.length > 2 && <span className="self-end text-[11px] text-slate-400">+{it.images.length - 2}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-slate-800">{it.name ?? t("(ยังไม่มีชื่องาน)", "(No job name yet)")}</span>
            {it.source === "manual" && <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">{t("วางเอง", "Manual")}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            <span>{it.brand_name ?? t("ไม่ระบุแบรนด์", "No brand")}</span>
            <span>·</span>
            <span>{deadline ? `${t("ส่ง", "Due")} ${deadline}` : t("ไม่มีวันส่ง", "No due date")}</span>
            <span>·</span>
            <span>{it.images.length} {t("รูป", "img")}</span>
            <span>·</span>
            <span>{it.sender_name ?? t("ไม่ทราบชื่อ", "Unknown")} {when(it.last_message_at)}</span>
          </div>
          {it.text && (
            <p className={`mt-1 whitespace-pre-line text-xs text-slate-600 ${expanded ? "" : "line-clamp-2"}`}>{it.text}</p>
          )}
          {it.text && longText && (
            <button type="button" onClick={onToggle} className="text-[11px] text-slate-400 underline">{expanded ? t("ย่อ", "Less") : t("ดูข้อความทั้งหมด", "Show all")}</button>
          )}
          {it.ai_error && (
            <p className="mt-1 text-[11px] text-rose-600"><Icon name="ai" /> {t("AI อ่านไม่สำเร็จ", "AI read failed")}: {it.ai_error}</p>
          )}
          {it.dups.map((d, i) => (
            <p key={i} className="mt-1 text-[11px] text-amber-700">
              <Icon name="warning" /> {t("อาจซ้ำ", "Possible duplicate")}: {d.sheet_id
                ? <button type="button" className="underline" onClick={() => onOpenSheet(d.sheet_id as string)}>{d.label}</button>
                : d.label}
            </p>
          ))}
          {it.status === "converted" && (
            <p className="mt-1 text-xs text-emerald-700">
              <Icon name="done" /> {t("เปิดใบงานแล้ว", "Opened as")} {it.sheet
                ? <button type="button" className="font-medium underline" onClick={() => onOpenSheet(it.sheet!.id)}>{it.sheet.code ?? t("ใบงาน", "sheet")}</button>
                : null}
              {it.converted_by_name ? ` · ${it.converted_by_name}` : ""} {when(it.converted_at)}
            </p>
          )}
          {it.status === "rejected" && (
            <p className="mt-1 text-xs text-slate-500">
              {t("ไม่ใช่งาน", "Not a job")} · {it.rejected_by === "AI" ? t("AI ย้ายให้ (ข้อความคุยเล่น)", "moved by AI (chit-chat)") : it.rejected_by}
              {it.reject_reason && it.rejected_by !== "AI" ? ` · ${it.reject_reason}` : ""} {when(it.rejected_at)}
            </p>
          )}
        </div>
      </div>
      {canEdit && it.status !== "converted" && (
        <div className="mt-2 flex flex-wrap justify-end gap-1.5">
          {it.status === "pending" && (
            <>
              {it.ai_error && (
                <button type="button" disabled={busy} onClick={() => onAct("reread")}
                  className="h-8 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Icon name="ai" /> {t("AI อ่านใหม่", "Re-read")}</button>
              )}
              <button type="button" disabled={busy} onClick={() => onAct("reject")}
                className="h-8 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">{t("ไม่ใช่งาน", "Not a job")}</button>
              <button type="button" disabled={busy} onClick={onConvert}
                className="h-8 rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"><Icon name="add" /> {t("เปิดใบงาน", "Open sheet")}</button>
            </>
          )}
          {it.status === "rejected" && (
            <button type="button" disabled={busy} onClick={() => onAct("restore")}
              className="h-8 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Icon name="back" /> {t("กู้คืน", "Restore")}</button>
          )}
        </div>
      )}
    </li>
  );
}

/** วางเอง (สำรองตอนไลน์มีปัญหา / ทดสอบ): ข้อความ + รูป (เลือก/ลาก/Ctrl+V) → AI อ่าน → เข้ากล่อง */
function ManualDraft({ onDone }: { onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [sending, setSending] = useState(false);

  const addFiles = (list: FileList | File[]) => {
    const imgs = Array.from(list).filter((f) => /^image\/(jpeg|png|webp|gif)$/.test(f.type));
    if (imgs.length < Array.from(list).length) toast.error(t("รับเฉพาะรูป jpg/png/webp", "Images only (jpg/png/webp)"));
    setFiles((cur) => [...cur, ...imgs.map((f) => ({ file: f, url: URL.createObjectURL(f) }))].slice(0, 6));
  };
  const onPaste = (e: ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData.files ?? []);
    if (imgs.length) { e.preventDefault(); addFiles(imgs); }
  };
  const reset = () => { files.forEach((f) => URL.revokeObjectURL(f.url)); setFiles([]); setText(""); };

  const send = async () => {
    if (!text.trim() && files.length === 0) { toast.error(t("ใส่ข้อความหรือรูปอย่างน้อย 1 อย่าง", "Add text or at least one image")); return; }
    const big = files.find((f) => f.file.size > 4 * 1024 * 1024);
    if (big) { toast.error(t(`"${big.file.name}" ใหญ่เกิน 4MB`, `"${big.file.name}" is over 4MB`)); return; }
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("text", text);
      files.forEach((f) => fd.append("images", f.file));
      const r = await apiFetch(API, { method: "POST", body: fd });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Save failed"));
      toast.success(t("เพิ่มเข้ากล่องแล้ว", "Added to the inbox"));
      reset(); setOpen(false); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setSending(false); }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-slate-500 underline">
        {t("วางข้อความ/รูปเอง (สำรองตอนไลน์มีปัญหา)", "Paste text/images manually (backup)")}
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-slate-300 p-3"
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}>
      <p className="text-xs font-medium text-slate-600">{t("วางเอง — ข้อความสั่งงาน + รูป (ลาก/วาง/Ctrl+V ได้)", "Manual — job text + images (drag/drop/Ctrl+V)")}</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} onPaste={onPaste} rows={3}
        placeholder={t("เช่น งานใหม่ กระเป๋าผ้าลายแมว Pixie Dustie ส่งลูกค้าดู 15 พ.ย.", "e.g. New job: cat-print tote, Pixie Dustie, show customer Nov 15")}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      <div className="flex flex-wrap items-center gap-1.5">
        {files.map((f, i) => (
          <span key={f.url} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt="" className="h-12 w-12 rounded-lg border border-slate-200 object-cover" />
            <button type="button" aria-label={t("เอาออก", "Remove")} onClick={() => setFiles((cur) => cur.filter((_, k) => k !== i))}
              className="absolute -right-1 -top-1 h-5 w-5 rounded-full border border-slate-200 bg-white text-[10px] text-rose-600">✕</button>
          </span>
        ))}
        <label className="inline-flex h-12 cursor-pointer items-center rounded-lg border border-slate-200 px-3 text-xs text-slate-500 hover:bg-slate-50">
          <Icon name="image" /> <span className="ml-1">{t("เลือกรูป", "Pick images")}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = ""; } }} />
        </label>
      </div>
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={() => { reset(); setOpen(false); }} className="h-8 rounded-md border border-slate-200 px-3 text-xs text-slate-600">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" disabled={sending} onClick={() => void send()}
          className="h-8 rounded-md bg-slate-900 px-3 text-xs font-medium text-white disabled:opacity-50">{sending ? t("กำลังให้ AI อ่าน…", "AI reading…") : t("เพิ่มเข้ากล่อง", "Add to inbox")}</button>
      </div>
    </div>
  );
}
