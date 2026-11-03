"use client";

/**
 * กล่อง "งานจากไลน์" บน Design Dashboard — ปุ่ม (ป้ายจำนวน) + ลิ้นชักรายการร่าง
 *
 * ร่างมาจากกลุ่มไลน์ "ส่งงานออกแบบ" (บอทรับ + AI เดาชื่อ/แบรนด์/วันส่ง · server: lib/design-line-inbox)
 *   รอเปิดใบงาน → กด "เปิดใบงาน" = ฟอร์มสร้างใบงานเดิม กรอกให้แล้ว (หน้าแม่เปิด DesignSheetsDetail createMode + prefill)
 *   ไม่ใช่งาน   → กู้คืนได้ · เปิดใบงานแล้ว → กดเปิดดูใบงาน
 * มี "วางเอง" (ข้อความ + รูป) เป็นทางสำรองตอนไลน์มีปัญหา · แอดมินเลือกกลุ่มไลน์ได้ในลิ้นชักเลย (ของกลาง LineGroupSetup)
 * "รวมกับงาน…" = รูปที่ส่งช้าเกิน 5 นาที / คนอื่นส่งช่วย → ย้ายไปร่างอื่น หรือแนบเข้าใบงานที่มีแล้ว (ใบงานจากรายการบนบอร์ด)
 * API: /api/design-sheets/line-inbox · เปิดใบงานจริง = POST /api/design-sheets + line_inbox_id
 */
import { useCallback, useEffect, useMemo, useState, type ClipboardEvent } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { Drawer, ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { HoverImage } from "@/components/hover-image";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { LineGroupSetup } from "@/components/line-group-setup";
import { LineConsole } from "@/components/line-console";
import {
  LINE_INBOX_TAB_LABEL, type LineInboxItem, type LineInboxTab, type MergeSheetOption,
} from "@/lib/design-line-inbox-shared";

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

export function LineInboxDrawer({ open, onClose, canEdit, isAdmin, sheets, onConvert, onOpenSheet, onChanged }: {
  open: boolean; onClose: () => void; canEdit: boolean; isAdmin: boolean;
  /** ใบงานบนบอร์ด (ใหม่สุดก่อน) — ให้เลือกตอน "รวมกับงาน…" แนบรูปเข้าใบที่มีแล้ว */
  sheets: MergeSheetOption[];
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
  const [mergeFrom, setMergeFrom] = useState<LineInboxItem | null>(null);

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

  /** รวมร่าง mergeFrom เข้าร่างอื่น / ใบงานที่มีแล้ว — คืน true = สำเร็จ (ปิดป๊อป) */
  const merge = async (target: { inboxId?: string; sheetId?: string }): Promise<boolean> => {
    if (!mergeFrom) return false;
    setBusyId(mergeFrom.id);
    try {
      const r = await apiFetch(API, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mergeFrom.id, action: "merge", target_inbox_id: target.inboxId, target_sheet_id: target.sheetId }),
      });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || t("รวมงานไม่สำเร็จ", "Merge failed"));
      toast.success(target.sheetId
        ? t(`แนบรูป ${j.images} รูปเข้าใบงาน ${j.target_label} แล้ว`, `Attached ${j.images} image(s) to ${j.target_label}`)
        : t(`รวมเข้ากับ "${j.target_label}" แล้ว`, `Merged into "${j.target_label}"`));
      setMergeFrom(null);
      await load(); onChanged();
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : t("รวมงานไม่สำเร็จ", "Merge failed")); return false; }
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
                readyNote: "ส่งข้อความ + รูปกี่รูปก็ได้ในกลุ่มนี้ ของคนเดิมภายใน 5 นาทีรวมเป็นงานเดียว บอทตอบครั้งเดียวหลังรูปครบ (ไม่เสียโควตา) · ส่งงานถัดไปทันที พิมพ์ \"งานใหม่\" นำหน้า · ข้อความคุยเล่นบอทเงียบและย้ายไป \"ไม่ใช่งาน\" ให้เอง",
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
                    onConvert={() => onConvert(it)} onAct={(a) => void act(it, a)} onMerge={() => setMergeFrom(it)} onOpenSheet={onOpenSheet} />
                ))}
              </ul>
            )}

          {canEdit && tab === "pending" && <ManualDraft onDone={() => { void load(); onChanged(); }} />}
        </div>
      </Drawer>
      {mergeFrom && (
        <MergeDialog from={mergeFrom} drafts={items.filter((x) => x.status === "pending" && x.id !== mergeFrom.id)} sheets={sheets}
          busy={busyId === mergeFrom.id} onClose={() => setMergeFrom(null)} onMerge={merge} />
      )}
      {isAdmin && consoleOpen && <LineConsole open={consoleOpen} onClose={() => { setConsoleOpen(false); setSetupKey((k) => k + 1); }} />}
    </>
  );
}

function InboxRow({ it, canEdit, busy, expanded, onToggle, onConvert, onAct, onMerge, onOpenSheet }: {
  it: LineInboxItem; canEdit: boolean; busy: boolean; expanded: boolean; onToggle: () => void;
  onConvert: () => void; onAct: (a: "reject" | "restore" | "reread") => void; onMerge: () => void; onOpenSheet: (id: string) => void;
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
              <button type="button" disabled={busy} onClick={onMerge}
                title={t("รูปส่งช้าเกิน 5 นาที / คนอื่นส่งช่วย — ย้ายไปรวมกับงานอื่นหรือแนบเข้าใบงานที่มีแล้ว", "Images sent late / by someone else — merge into another job or an existing sheet")}
                className="h-8 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Icon name="link" /> {t("รวมกับงาน…", "Merge…")}</button>
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

type MergePick = { kind: "draft"; item: LineInboxItem } | { kind: "sheet"; sheet: MergeSheetOption };

/**
 * "รวมกับงาน…" — เลือกปลายทาง: ร่างอื่นที่รอเปิดใบงาน หรือใบงานที่มีแล้ว (ใบงานบนบอร์ด ค้นด้วยเลข DS/ชื่อ/แบรนด์)
 * งานที่ระบบเดาว่าซ้ำ (รูปเดียวกัน / ชื่อคล้าย) ขึ้นก่อนพร้อมป้าย "แนะนำ"
 */
function MergeDialog({ from, drafts, sheets, busy, onClose, onMerge }: {
  from: LineInboxItem; drafts: LineInboxItem[]; sheets: MergeSheetOption[]; busy: boolean;
  onClose: () => void; onMerge: (target: { inboxId?: string; sheetId?: string }) => Promise<boolean>;
}) {
  const t = useT();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<MergePick | null>(null);
  const query = q.trim().toLowerCase();
  const sugSheets = useMemo(() => new Set(from.dups.map((d) => d.sheet_id).filter(Boolean) as string[]), [from]);
  const sugDrafts = useMemo(() => new Set(from.dups.map((d) => d.inbox_id).filter(Boolean) as string[]), [from]);

  const draftList = useMemo(() => {
    const m = drafts.filter((d) => !query || [d.name, d.text, d.sender_name, d.brand_name].some((v) => (v ?? "").toLowerCase().includes(query)));
    return [...m.filter((d) => sugDrafts.has(d.id)), ...m.filter((d) => !sugDrafts.has(d.id))];
  }, [drafts, query, sugDrafts]);
  const sheetList = useMemo(() => {
    const m = sheets.filter((s) => !query || `${s.code} ${s.name} ${s.brand_name ?? ""}`.toLowerCase().includes(query));
    return [...m.filter((s) => sugSheets.has(s.id)), ...m.filter((s) => !sugSheets.has(s.id))].slice(0, query ? 30 : 12);
  }, [sheets, query, sugSheets]);

  const n = from.images.length;
  const summary = !pick ? null
    : pick.kind === "draft"
      ? t(`ย้ายรูป ${n} รูป${from.text ? " + ข้อความ" : ""} ไปต่อท้าย "${pick.item.name ?? "ร่างที่เลือก"}" · งานนี้จะหายจากกล่อง (มีประวัติเก็บไว้)`,
        `Move ${n} image(s)${from.text ? " + text" : ""} into "${pick.item.name ?? "selected draft"}" · this draft leaves the inbox (kept in history)`)
      : t(`แนบรูป ${n} รูปเข้าใบงาน ${pick.sheet.code} · งานนี้ย้ายไป "เปิดใบงานแล้ว" (ข้อความไม่แตะรายละเอียดใบงาน)`,
        `Attach ${n} image(s) to ${pick.sheet.code} · this draft moves to "Opened" (sheet details unchanged)`);

  const confirm = () => {
    if (!pick) { toast.error(t("เลือกงานที่จะรวมก่อน", "Pick a job to merge into")); return; }
    if (pick.kind === "sheet" && n === 0) { toast.error(t("งานนี้ไม่มีรูปให้แนบ", "This draft has no images to attach")); return; }
    void onMerge(pick.kind === "draft" ? { inboxId: pick.item.id } : { sheetId: pick.sheet.id });
  };

  const rowCls = (on: boolean) =>
    `flex w-full items-center gap-2.5 px-3 py-2 text-left ${on ? "bg-emerald-50 ring-1 ring-inset ring-emerald-300" : "hover:bg-slate-50"}`;
  const sugTag = <span className="rounded bg-amber-100 px-1.5 text-[10px] font-medium text-amber-800">{t("แนะนำ", "Suggested")}</span>;

  return (
    <ERPModal open onClose={onClose} size="md" defaultExpanded={false} storageKey="design-line-inbox-merge"
      title={t("รวมกับงาน…", "Merge into…")}
      description={t(`"${from.name ?? "ร่างนี้"}" · ${n} รูป — เลือกงานที่จะรวมด้วย`, `"${from.name ?? "This draft"}" · ${n} image(s) — pick where it belongs`)}
      footer={(
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {summary && <p className="mr-auto min-w-0 flex-1 text-xs text-slate-600">{summary}</p>}
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-600">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" disabled={busy} onClick={confirm}
            className="h-9 rounded-md bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50">
            {busy ? t("กำลังรวม…", "Merging…") : pick?.kind === "sheet" ? t("แนบเข้าใบงาน", "Attach to sheet") : t("รวมงาน", "Merge")}
          </button>
        </div>
      )}>
      <div className="space-y-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
            placeholder={t("ค้นเลข DS / ชื่องาน / แบรนด์ / คนส่ง", "Search DS no. / name / brand / sender")}
            className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-sm" />
        </div>

        <section>
          <p className="mb-1 text-xs font-medium text-slate-500">{t("ร่างอื่นที่รอเปิดใบงาน", "Other drafts waiting")}</p>
          {draftList.length === 0
            ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">{t("ไม่มีร่างอื่นในกล่อง", "No other drafts")}</p>
            : (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                {draftList.map((d) => (
                  <li key={d.id}>
                    <button type="button" className={rowCls(pick?.kind === "draft" && pick.item.id === d.id)} onClick={() => setPick({ kind: "draft", item: d })}>
                      {d.images[0]
                        ? <HoverImage url={d.images[0]} size={36} previewSize={280} rounded="rounded-md" />
                        : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-300"><Icon name="image" /></span>}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm text-slate-800"><span className="truncate">{d.name ?? t("(ยังไม่มีชื่องาน)", "(No name yet)")}</span>{sugDrafts.has(d.id) && sugTag}</span>
                        <span className="block truncate text-[11px] text-slate-500">{d.images.length} {t("รูป", "img")} · {d.sender_name ?? t("ไม่ทราบชื่อ", "Unknown")} {when(d.last_message_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section>
          <p className="mb-1 text-xs font-medium text-slate-500">{t("ใบงานที่มีแล้ว (แนบรูปเข้าใบ)", "Existing sheets (attach images)")}</p>
          {sheetList.length === 0
            ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">{t("ไม่พบใบงาน ลองค้นด้วยเลข DS", "No sheets found — try a DS number")}</p>
            : (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                {sheetList.map((s) => (
                  <li key={s.id}>
                    <button type="button" className={rowCls(pick?.kind === "sheet" && pick.sheet.id === s.id)} onClick={() => setPick({ kind: "sheet", sheet: s })}>
                      {s.cover_url
                        ? <HoverImage url={s.cover_url} size={36} previewSize={280} rounded="rounded-md" />
                        : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-300"><Icon name="image" /></span>}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm text-slate-800">
                          <span className="shrink-0 font-medium">{s.code}</span><span className="truncate">{s.name}</span>{sugSheets.has(s.id) && sugTag}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">{s.brand_name ?? t("ไม่ระบุแบรนด์", "No brand")}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          {!query && sheets.length > sheetList.length && (
            <p className="mt-1 text-[11px] text-slate-400">{t("แสดงใบที่แก้ล่าสุด — พิมพ์ค้นเพื่อหาใบอื่น", "Showing recently updated — type to search others")}</p>
          )}
        </section>
      </div>
    </ERPModal>
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
