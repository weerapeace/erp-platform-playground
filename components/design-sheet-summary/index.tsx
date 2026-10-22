"use client";

// ============================================================
// 📋 ป๊อปจัดสรุปงาน (ใบงานออกแบบ) — ของกลาง
// ซ้าย: ชื่อ · ฉบับลูกค้า/ภายใน · ข้อมูลที่โชว์ · ต่อใบงาน: เลือกรูป + "แยกเป็นรายการตามรูป" + ชื่อ/หมายเหตุต่อแถว
// ขวา: ตัวอย่างจริง (หน้าตาเดียวกับพิมพ์/รูป) + 🖨 พิมพ์/PDF · 🖼 คัดลอกเป็นรูป · ⬇ ดาวน์โหลดรูป
// บันทึก/แก้/ลบ ผ่าน /api/design-sheet-summaries (audit) · ข้อมูลใบงานดึงสดจาก /api/design-sheets?ids=
// ใช้: <DesignSheetSummaryBuilder open summaryId={id|null} initialSheetIds={[...]} onClose onChanged />
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPInput } from "@/components/form";
import { PrintDocLinkButton } from "@/components/report";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { tr } from "@/lib/lang";
import { useT } from "@/components/i18n";
import { withImageWidth } from "@/lib/r2-image";
import { buildStatusMeta, type StatusMeta, type WfStatusRow } from "@/lib/design-sheets-meta";
import { htmlToPngBlob } from "@/lib/html-to-png";
import { canCopyImage, copyBlobToClipboard, downloadBlob } from "@/lib/image-clipboard";
import { UserPicker } from "@/components/pickers";
import { EMAIL_RE } from "@/lib/email-report/shared";
import {
  AUDIENCE_LABEL, DEFAULT_SUMMARY_COLUMNS, SUMMARY_COLUMNS, normalizeSummaryDoc, renderSummaryBody, renderSummaryHtml,
  type SavedSummary, type SummaryAudience, type SummaryDoc, type SummaryItem, type SummarySheetInfo,
} from "@/lib/design-sheet-summary";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import type { DesignSheetImage } from "@/app/api/design-sheets/[id]/images/route";

const PREF_KEY = "ds_summary_columns";
const todayLabel = () => new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
const emptyItem = (sheet_id: string): SummaryItem => ({ sheet_id, images: [], split: false, labels: [], notes: [] });

/** แผงเลือกเพิ่มใบงานลงสรุป — มีรูป · ค้นหา · ติ๊กได้หลายใบ · เฉพาะใบที่ยังไม่ปิดและยังไม่อยู่ในสรุป */
function AddSheetsPanel({ meta, existing, onAdd, onClose }: {
  meta: StatusMeta;
  existing: Set<string>;
  onAdd: (ids: string[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [list, setList] = useState<DesignSheetListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { boxRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, []);
  useEffect(() => {
    let alive = true;
    apiFetch("/api/design-sheets?limit=500&archived=0&sort_by=updated_at&sort_dir=desc")
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (alive) setList((j.data ?? []) as DesignSheetListItem[]); })
      .catch(() => { if (alive) setError(tr("โหลดรายการใบงานไม่สำเร็จ กรุณาลองใหม่", "Couldn't load design sheets. Try again.")); });
    return () => { alive = false; };
  }, []);
  const term = q.trim().toLowerCase();
  const rows = (list ?? []).filter((s) => !meta.finished.has(s.status) && !existing.has(s.id)
    && (!term || `${s.code} ${s.name} ${s.brand_name ?? ""}`.toLowerCase().includes(term)));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div ref={boxRef} className="mb-2 rounded-lg border border-teal-200 bg-teal-50/40 p-2">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("🔍 ค้นหาเลขที่ / ชื่องาน / แบรนด์...", "🔍 Search no. / job name / brand...")}
        className="mb-2 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
      <div className="max-h-72 space-y-1 overflow-auto">
        {error ? (
          <div className="py-4 text-center text-xs text-rose-600">⚠ {error}</div>
        ) : list === null ? (
          [0, 1, 2].map((i) => <div key={i} className="h-11 animate-pulse rounded-md bg-white" />)
        ) : rows.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-400">{term ? t("ไม่พบใบงานที่ตรงคำค้น", "No sheets match your search") : t("ใบงานที่ยังไม่ปิดอยู่ในสรุปครบแล้ว", "All open sheets are already in this summary")}</div>
        ) : rows.map((s) => {
          const on = picked.includes(s.id);
          const color = meta.colorHex[s.status] ?? "#94a3b8";
          const cover = withImageWidth(s.cover_url, 80);
          return (
            <button key={s.id} type="button" onClick={() => toggle(s.id)}
              className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left ${on ? "border-teal-500 bg-white ring-1 ring-teal-400" : "border-transparent bg-white hover:border-slate-200"}`}>
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300"}`}>{on ? "✓" : ""}</span>
              {cover
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={cover} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded border border-slate-100 bg-slate-50 object-cover" />
                : <span className="h-9 w-9 shrink-0 rounded bg-slate-100" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-slate-800"><span className="font-mono text-[10px] text-slate-400">{s.code}</span> {s.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                  <span className="rounded-full px-1.5" style={{ color, backgroundColor: `${color}1a` }}>{meta.map[s.status]?.label ?? s.status}</span>
                  {s.brand_name && <span className="truncate">{s.brand_name}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-slate-500">{picked.length ? t(`เลือกไว้ ${picked.length} ใบ`, `${picked.length} selected`) : t("กดเพื่อเลือก (หลายใบได้)", "Click to select (multiple allowed)")}</span>
        <button type="button" onClick={onClose} className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-600">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" onClick={() => onAdd(picked)} disabled={picked.length === 0}
          className="h-8 rounded-lg bg-teal-600 px-3 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-40">＋ {t(`เพิ่ม ${picked.length || ""} ใบ`, `Add ${picked.length || ""}`)}</button>
      </div>
    </div>
  );
}

type MailTo = { type: "user"; id: string; name: string; email: string | null } | { type: "email"; email: string };

/** ✉️ แผงส่งสรุปทางอีเมล — ผู้รับ (คนในระบบ / พิมพ์อีเมล) · หัวเรื่อง · ข้อความ (หลายบรรทัด) → /api/design-sheet-summaries/send
 *  ส่งแยกทีละคน · ผู้รับกดตอบกลับ = ถึงอีเมลคนที่กดส่ง · ใช้ค่าที่ตั้งอยู่ตอนนี้ (ยังไม่บันทึกก็ส่งได้) */
function SendEmailPanel({ doc, summaryId, onSent }: { doc: SummaryDoc; summaryId: string | null; onSent: () => void }) {
  const t = useT();
  const toast = useToast();
  const [to, setTo] = useState<MailTo[]>([]);
  const [typed, setTyped] = useState("");
  const [typedErr, setTypedErr] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);   // null = ใช้ชื่อสรุป
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = (r: MailTo) => (r.type === "user" ? r.name || r.email || t("ผู้ใช้", "User") : r.email);

  const addTyped = () => {
    const email = typed.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setTypedErr(t("อีเมลไม่ถูกต้อง เช่น name@gmail.com", "Invalid email, e.g. name@gmail.com")); return; }
    if (to.some((r) => (r.type === "email" ? r.email : r.email?.toLowerCase()) === email)) { setTypedErr(t("มีอีเมลนี้แล้ว", "Already added")); return; }
    setTo((l) => [...l, { type: "email", email }]); setTyped(""); setTypedErr(null);
  };
  const send = async () => {
    if (busy) return;
    if (typed.trim()) { setTypedErr(t("กด \"เพิ่ม\" อีเมลที่พิมพ์ไว้ก่อน", "Press \"Add\" for the typed email first")); return; }
    if (to.length === 0) { setError(t("ใส่ผู้รับอย่างน้อย 1 คน", "Add at least 1 recipient")); return; }
    setBusy(true); setError(null);
    try {
      const res = await apiFetch("/api/design-sheet-summaries/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc, summary_id: summaryId, subject: subject ?? doc.title, message, recipients: to.map((r) => (r.type === "user" ? { type: "user", id: r.id } : r)) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || t("ส่งอีเมลไม่สำเร็จ", "Couldn't send the email"));
      toast.success(t(`ส่งอีเมลแล้ว ${j.sent}/${j.total} คน`, `Email sent to ${j.sent}/${j.total}`));
      if (j.failed?.length) toast.warning(t(`ส่งไม่ถึง: ${j.failed.map((f: { email: string }) => f.email).join(", ")}`, `Not delivered: ${j.failed.map((f: { email: string }) => f.email).join(", ")}`));
      if (j.skipped?.length) toast.warning(t(`ข้าม: ${j.skipped.join(", ")}`, `Skipped: ${j.skipped.join(", ")}`));
      onSent();
    } catch (e) { setError(e instanceof Error ? e.message : t("ส่งอีเมลไม่สำเร็จ", "Couldn't send the email")); }
    finally { setBusy(false); }
  };

  return (
    <div className="mb-2 space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
      <div>
        <div className="mb-1 text-xs font-medium text-slate-600">{t("ถึง", "To")} <span className="font-normal text-slate-400">{t("(ส่งแยกทีละคน ผู้รับไม่เห็นกัน)", "(sent one by one — recipients don't see each other)")}</span></div>
        {to.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {to.map((r, i) => {
              const noEmail = r.type === "user" && !r.email;
              return (
                <span key={`${r.type}-${r.type === "user" ? r.id : r.email}`} className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-2 pr-1 text-xs ${noEmail ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700"}`}>
                  {r.type === "user" ? "👤" : "✉️"} {label(r)}{noEmail && t(" (ไม่มีอีเมล)", " (no email)")}
                  <button type="button" onClick={() => setTo((l) => l.filter((_, x) => x !== i))} aria-label={t(`เอา ${label(r)} ออก`, `Remove ${label(r)}`)} className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200">✕</button>
                </span>
              );
            })}
          </div>
        )}
        <div className="grid gap-1.5 sm:grid-cols-2">
          <UserPicker value={null} placeholder={t("＋ เลือกคนในระบบ...", "＋ Pick a user...")}
            onChange={(u) => { if (u && !to.some((r) => r.type === "user" && r.id === u.id)) setTo((l) => [...l, { type: "user", id: u.id, name: u.name, email: u.email ?? null }]); }} />
          <div>
            <div className="flex gap-1.5">
              <input value={typed} onChange={(e) => { setTyped(e.target.value); setTypedErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTyped(); } }}
                inputMode="email" placeholder={t("อีเมลลูกค้า เช่น name@gmail.com", "Customer email, e.g. name@gmail.com")}
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={addTyped} className="h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">{t("เพิ่ม", "Add")}</button>
            </div>
            {typedErr && <p className="mt-1 text-xs text-rose-600">{typedErr}</p>}
          </div>
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-slate-600">{t("หัวเรื่อง", "Subject")}</div>
        <input value={subject ?? doc.title} onChange={(e) => setSubject(e.target.value)}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-slate-600">{t("ข้อความถึงผู้รับ", "Message")} <span className="font-normal text-slate-400">{t("(ถ้ามี · อยู่เหนือสรุป)", "(optional · shown above the summary)")}</span></div>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
          placeholder={t("เช่น เรียนคุณเต้ง แนบสรุปงานล่าสุดครับ ใบใหญ่เสร็จแล้ว รอคอนเฟิร์มสีใบเล็ก", "e.g. Hi, here is the latest summary of your order...")}
          className="w-full resize-y rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-[11px] text-slate-500">{t("ผู้รับกด \"ตอบกลับ\" = ถึงอีเมลของคุณ · ส่งตามหน้าตาตัวอย่างด้านล่าง", "Replies go to your email · sends what the preview shows")}</span>
        {error && <span className="text-xs text-rose-600">⚠ {error}</span>}
        <button type="button" onClick={() => void send()} disabled={busy}
          className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? t("กำลังส่ง...", "Sending...") : t(`✉️ ส่งอีเมล${to.length ? ` (${to.length})` : ""}`, `✉️ Send${to.length ? ` (${to.length})` : ""}`)}</button>
      </div>
    </div>
  );
}

/** หมายเหตุหลายบรรทัด (Enter = ขึ้นบรรทัดใหม่) — สูงตามจำนวนบรรทัด 2–6 · ลากขยายเองได้ */
function NoteBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const lines = (value.match(/\n/g)?.length ?? 0) + 1;
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={Math.min(6, Math.max(2, lines))}
      placeholder={t("หมายเหตุ (ถ้ามี) · กด Enter ขึ้นบรรทัดใหม่ได้", "Note (optional) · Enter for a new line")}
      className="w-full resize-y rounded-md border border-slate-200 px-2 py-1.5 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500" />
  );
}

function toInfo(s: DesignSheetListItem, meta: StatusMeta): SummarySheetInfo {
  return {
    id: s.id, code: s.code, name: s.name, brand_name: s.brand_name, brand_color: s.brand_color,
    status: s.status, status_label: meta.map[s.status]?.label ?? s.status, status_color: meta.colorHex[s.status] ?? "#94a3b8",
    closed: meta.finished.has(s.status), deadline: s.deadline, updated_at: s.updated_at, note: s.note, detail_excerpt: s.detail_excerpt,
  };
}

export function DesignSheetSummaryBuilder({ open, summaryId, initialSheetIds = [], onClose, onChanged }: {
  open: boolean;
  /** เปิดสรุปที่บันทึกไว้ (null = สรุปใหม่จาก initialSheetIds) */
  summaryId: string | null;
  initialSheetIds?: string[];
  onClose: () => void;
  /** หลังบันทึก/ลบ — ให้หน้าแม่โหลดรายการใหม่ */
  onChanged?: () => void;
}) {
  const t = useT();
  const canEdit = usePermission("products.edit");
  const toast = useToast();
  const [savedId, setSavedId] = useState<string | null>(summaryId);
  const [doc, setDoc] = useState<SummaryDoc>({ title: "", audience: "internal", columns: DEFAULT_SUMMARY_COLUMNS.internal, items: [], note: "" });
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [meta, setMeta] = useState<StatusMeta>(() => buildStatusMeta(null));
  const [sheetRows, setSheetRows] = useState<Record<string, DesignSheetListItem>>({});
  const [images, setImages] = useState<Record<string, DesignSheetImage[] | "loading" | "error">>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imgBusy, setImgBusy] = useState<"copy" | "download" | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);   // แผงส่งอีเมลสรุป
  const [addOpen, setAddOpen] = useState(false);   // แผงเลือกเพิ่มใบงาน
  const isNew = !savedId;
  const defaultsApplied = useRef<Set<string>>(new Set());

  // ── โหลดสรุป (หรือเริ่มใหม่) + สถานะ + ข้อมูลใบงาน ──
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSavedId(summaryId); setTouched(false); setError(null); setConfirmDelete(false); setLoadErr(null); setLoading(true);
    defaultsApplied.current = new Set();
    (async () => {
      const stJson = await apiFetch("/api/design-sheets/statuses").then((r) => r.json()).catch(() => ({ data: [] }));
      if (alive) setMeta(buildStatusMeta((stJson.data ?? []) as WfStatusRow[]));
      let next: SummaryDoc;
      if (summaryId) {
        const j = await apiFetch(`/api/design-sheet-summaries/${summaryId}`).then((r) => r.json());
        if (j.error || !j.data) throw new Error(j.error || tr("ไม่พบสรุปนี้", "Summary not found"));
        const s = j.data as SavedSummary;
        next = { title: s.title, audience: s.audience, columns: s.columns, items: s.items, note: s.note };
        s.items.forEach((it) => defaultsApplied.current.add(it.sheet_id));   // สรุปเก่า: ไม่เติมรูปให้เอง
      } else {
        const pref = await apiFetch(`/api/user-prefs?key=${PREF_KEY}`).then((r) => r.json()).catch(() => null);
        const cols = Array.isArray(pref?.value) && pref.value.length ? (pref.value as string[]) : DEFAULT_SUMMARY_COLUMNS.internal;
        next = { title: `สรุปงาน ${todayLabel()}`, audience: "internal", columns: cols, items: [...new Set(initialSheetIds)].map(emptyItem), note: "" };
      }
      if (!alive) return;
      setDoc(next);
      await loadSheets(next.items.map((i) => i.sheet_id));
    })().catch((e) => { if (alive) setLoadErr(e instanceof Error ? e.message : tr("โหลดไม่สำเร็จ", "Couldn't load")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, summaryId]);

  async function loadSheets(ids: string[]) {
    const need = ids.filter((id) => !sheetRows[id]);
    if (need.length) {
      const res = await apiFetch(`/api/design-sheets?ids=${need.join(",")}&limit=${need.length}`);
      if (!res.ok) throw new Error(t("โหลดข้อมูลใบงานไม่สำเร็จ กรุณาลองใหม่", "Couldn't load sheet data. Try again."));
      const j = await res.json();
      const add: Record<string, DesignSheetListItem> = {};
      for (const s of (j.data ?? []) as DesignSheetListItem[]) add[s.id] = s;
      setSheetRows((m) => ({ ...m, ...add }));
    }
    // รูปของแต่ละใบ (ทีละ 6 ใบ ไม่ยิงพร้อมกันหมด)
    const queue = ids.filter((id) => !images[id]);
    setImages((m) => { const n = { ...m }; for (const id of queue) n[id] = "loading"; return n; });
    for (let i = 0; i < queue.length; i += 6) {
      await Promise.all(queue.slice(i, i + 6).map(async (id) => {
        try {
          const res = await apiFetch(`/api/design-sheets/${id}/images`);
          if (!res.ok) throw new Error(String(res.status));
          const j = await res.json();
          setImages((m) => ({ ...m, [id]: Array.isArray(j.data) ? (j.data as DesignSheetImage[]) : [] }));
        } catch { setImages((m) => ({ ...m, [id]: "error" })); }
      }));
    }
  }

  // สรุปใหม่: ใบที่ยังไม่เลือกรูป → เลือกรูปแรกให้ 1 รูป (เปลี่ยนได้)
  useEffect(() => {
    setDoc((d) => {
      let changed = false;
      const items = d.items.map((it) => {
        const imgs = images[it.sheet_id];
        if (defaultsApplied.current.has(it.sheet_id) || !Array.isArray(imgs)) return it;
        defaultsApplied.current.add(it.sheet_id);
        if (it.images.length || imgs.length === 0) return it;
        changed = true;
        return { ...it, images: [imgs[0].url] };
      });
      return changed ? { ...d, items } : d;
    });
  }, [images]);

  const sheets = useMemo(() => {
    const m = new Map<string, SummarySheetInfo>();
    for (const [id, s] of Object.entries(sheetRows)) m.set(id, toInfo(s, meta));
    return m;
  }, [sheetRows, meta]);
  const html = useMemo(() => renderSummaryHtml(doc, sheets), [doc, sheets]);

  const edit = (fn: (d: SummaryDoc) => SummaryDoc) => { setDoc((d) => fn(d)); setTouched(true); setError(null); };
  const editItem = (sheetId: string, fn: (it: SummaryItem) => SummaryItem) => edit((d) => ({ ...d, items: d.items.map((it) => (it.sheet_id === sheetId ? fn(it) : it)) }));
  const toggleImage = (sheetId: string, url: string) => editItem(sheetId, (it) => {
    const p = it.images.indexOf(url);
    if (p >= 0) {
      const images = it.images.filter((_, i) => i !== p);
      const drop = <T,>(a: T[]) => a.filter((_, i) => i !== p);
      return { ...it, images, labels: it.split ? drop(it.labels) : it.labels, notes: it.split ? drop(it.notes) : it.notes, split: it.split && images.length >= 2 };
    }
    return { ...it, images: [...it.images, url] };
  });
  // ชื่อสินค้า: ยังไม่แก้ = โชว์ชื่อใบงาน (หรือชื่อแบบเก่า labels[0]) ในช่องให้แก้ต่อได้เลย · แก้แล้ว = item.title (ลบหมดได้ระหว่างพิมพ์)
  const titleValue = (it: SummaryItem, s: SummarySheetInfo | undefined) =>
    it.title !== undefined ? it.title : ((!it.split && it.labels[0]?.trim()) || s?.name || "");
  const titleEdited = (it: SummaryItem, s: SummarySheetInfo | undefined) => {
    const v = titleValue(it, s).trim();
    return !!v && !!s && v !== s.name;
  };
  const setTitle = (sheetId: string, v: string) => editItem(sheetId, (it) => ({ ...it, title: v, labels: it.split ? it.labels : [] }));
  const resetTitle = (sheetId: string) => editItem(sheetId, (it) => {
    const { title: _drop, ...rest } = it; void _drop;
    return { ...rest, labels: it.split ? it.labels : [] };
  });
  const setSplit = (sheetId: string, split: boolean) => editItem(sheetId, (it) => ({ ...it, split, labels: [], notes: split ? [] : it.notes.slice(0, 1) }));
  const setText = (sheetId: string, field: "labels" | "notes", i: number, v: string) => editItem(sheetId, (it) => {
    const arr = [...it[field]]; while (arr.length <= i) arr.push(""); arr[i] = v; return { ...it, [field]: arr };
  });
  const moveItem = (idx: number, dir: -1 | 1) => edit((d) => {
    const j = idx + dir; if (j < 0 || j >= d.items.length) return d;
    const items = [...d.items]; [items[idx], items[j]] = [items[j], items[idx]]; return { ...d, items };
  });
  const removeItem = (sheetId: string) => edit((d) => ({ ...d, items: d.items.filter((it) => it.sheet_id !== sheetId) }));
  const toggleColumn = (key: string) => edit((d) => ({ ...d, columns: d.columns.includes(key) ? d.columns.filter((c) => c !== key) : [...d.columns, key] }));

  // ＋ เพิ่มใบงาน (ลืมใส่ตอนติ๊กบนบอร์ด) — เลือกได้หลายใบ เฉพาะที่ยังไม่ปิด
  const addSheets = (ids: string[]) => {
    const fresh = ids.filter((id) => !doc.items.some((it) => it.sheet_id === id));
    if (fresh.length === 0) return;
    edit((d) => ({ ...d, items: [...d.items, ...fresh.map(emptyItem)] }));
    loadSheets(fresh).catch((e) => toast.error(e instanceof Error ? e.message : t("โหลดข้อมูลใบงานไม่สำเร็จ", "Couldn't load sheet data")));
    toast.success(t(`เพิ่ม ${fresh.length} ใบงานลงสรุปแล้ว`, `Added ${fresh.length} sheets to the summary`));
    setAddOpen(false);
  };

  const save = async () => {
    if (saving || !canEdit) return;
    // ชื่อที่ไม่ได้เปลี่ยนจากชื่อใบงาน = ไม่เก็บ (เปลี่ยนชื่อใบงานทีหลัง สรุปตามชื่อใหม่)
    const parsed = normalizeSummaryDoc({
      ...doc,
      items: doc.items.map((it) => (it.title !== undefined && it.title.trim() === sheets.get(it.sheet_id)?.name ? { ...it, title: "" } : it)),
    });
    if ("error" in parsed) { setError(parsed.error); return; }
    setSaving(true); setError(null);
    try {
      const res = await apiFetch(savedId ? `/api/design-sheet-summaries/${savedId}` : "/api/design-sheet-summaries", {
        method: savedId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.value),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Couldn't save"));
      const s = j.data as SavedSummary;
      setSavedId(s.id); setTouched(false);
      // จำ "ข้อมูลที่โชว์" ไว้ใช้กับสรุปใหม่ครั้งหน้า (รายคน)
      void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: PREF_KEY, value: s.columns }) }).catch(() => {});
      toast.success(isNew ? t("บันทึกสรุปแล้ว — เปิดอีกครั้งได้จากปุ่ม 📋 สรุปงาน", "Summary saved — reopen it from the 📋 Summary button") : t("บันทึกการแก้ไขแล้ว", "Changes saved"));
      onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ กรุณาลองใหม่", "Couldn't save. Try again.")); }
    finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (!savedId) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/design-sheet-summaries/${savedId}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || t("ลบไม่สำเร็จ", "Couldn't delete"));
      toast.success(t(`ลบสรุป "${doc.title}" แล้ว`, `Deleted summary "${doc.title}"`));
      onChanged?.(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Couldn't delete")); }
    finally { setSaving(false); setConfirmDelete(false); }
  };

  // รูปสรุป — เรียก copy ทันทีใน onClick (ส่ง Promise ให้ clipboard) เพื่อคงสิทธิ์ของการกด
  const fileBase = (doc.title || "สรุปงาน").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60);
  const makePng = () => htmlToPngBlob(renderSummaryBody(doc, sheets), { width: 960 });
  const copyImage = async () => {
    setImgBusy("copy");
    try { await copyBlobToClipboard(makePng()); toast.success(t("คัดลอกรูปสรุปแล้ว — ไปวาง (Ctrl+V) ใน LINE ได้เลย", "Summary image copied — paste it (Ctrl+V) into LINE")); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("คัดลอกรูปไม่สำเร็จ ลองดาวน์โหลดแทน", "Couldn't copy the image — try downloading instead")); }
    finally { setImgBusy(null); }
  };
  const downloadImage = async () => {
    setImgBusy("download");
    try { downloadBlob(await makePng(), `${fileBase}.png`); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("สร้างรูปไม่สำเร็จ", "Couldn't create the image")); }
    finally { setImgBusy(null); }
  };

  const chip = (on: boolean) => `h-8 rounded-lg border px-2.5 text-xs font-medium transition ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  const label = "block text-xs font-medium text-slate-600 mb-1";
  const actBtn = "inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
  const customer = doc.audience === "customer";

  return (
    <ERPModal open={open} onClose={onClose} size="xl" storageKey="ds-summary-builder" hasUnsavedChanges={touched}
      title={isNew ? t("📋 สรุปงาน (ใหม่)", "📋 Job summary (new)") : `📋 ${t("สรุปงาน", "Job summary")} — ${doc.title || t("ไม่มีชื่อ", "Untitled")}`}
      description={t("เลือกข้อมูลและรูปที่จะโชว์ · ใบที่มีหลายชิ้นแยกเป็นหลายแถวได้ · ด้านขวาคือหน้าตาจริงตอนพิมพ์/ทำรูป", "Choose the info and images to show · sheets with several pieces can be split into rows · the right side is the real print/image preview")}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {canEdit && savedId && (confirmDelete ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-rose-700">
              {t("ลบสรุปนี้?", "Delete this summary?")}
              <button onClick={() => void doDelete()} disabled={saving} className="h-8 rounded-lg bg-rose-600 px-3 text-xs font-medium text-white hover:bg-rose-700">{t("ลบเลย", "Delete")}</button>
              <button onClick={() => setConfirmDelete(false)} className="h-8 rounded-lg border border-slate-300 px-3 text-xs text-slate-600">{t("ไม่ลบ", "Keep")}</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="h-8 rounded-lg px-2 text-xs text-rose-600 hover:bg-rose-50">🗑 {t("ลบสรุปนี้", "Delete summary")}</button>
          ))}
          <span className="ml-auto" />
          {error && <span className="text-sm text-rose-600">⚠ {error}</span>}
          {!canEdit && <span className="text-xs text-slate-400">{t("ดูได้อย่างเดียว (ไม่มีสิทธิ์แก้ใบงาน)", "View only (no permission to edit sheets)")}</span>}
          <button onClick={onClose} disabled={saving} className="h-9 rounded-lg border border-slate-300 px-4 text-sm text-slate-600 hover:bg-slate-50">{t("ปิด", "Close")}</button>
          {canEdit && (
            <button onClick={() => void save()} disabled={saving || loading} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? t("กำลังบันทึก...", "Saving...") : t("💾 บันทึกสรุป", "💾 Save summary")}</button>
          )}
        </div>
      }>
      {loadErr ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">⚠ {loadErr}</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* ── ตั้งค่า ── */}
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <label className={label}>{t("ชื่อสรุป", "Summary name")}</label>
                <ERPInput value={doc.title} onChange={(e) => edit((d) => ({ ...d, title: e.target.value }))} placeholder={t("เช่น สรุปส่งคุณเต้ง 21 ต.ค.", "e.g. Summary for Teng, 21 Oct")} />
              </div>
              <div>
                <label className={label}>{t("ฉบับ", "Version")}</label>
                <div className="flex gap-1">
                  {(["internal", "customer"] as SummaryAudience[]).map((a) => (
                    <button key={a} type="button" onClick={() => edit((d) => ({ ...d, audience: a }))} className={chip(doc.audience === a)}>
                      {a === "customer" ? "👤 " : "🏠 "}{AUDIENCE_LABEL[a]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {customer && (
              <div className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">👤 {t("ฉบับลูกค้า: ระบบซ่อน \"ไม่ขยับกี่วัน\" · \"โน้ตภายใน\" · \"รายละเอียดงาน\" ให้เอง และไม่มีต้นทุน/ราคาในสรุปนี้เลย", "Customer version: \"days idle\", \"internal note\" and \"job details\" are hidden automatically, and no cost/price appears in this summary")}</div>
            )}

            <div>
              <label className={label}>{t("ข้อมูลที่โชว์", "Info to show")} <span className="font-normal text-slate-400">{t("(ระบบจำไว้ใช้ครั้งหน้า)", "(remembered for next time)")}</span></label>
              <div className="flex flex-wrap gap-1">
                {SUMMARY_COLUMNS.map((c) => {
                  const hidden = customer && c.internalOnly;
                  return (
                    <button key={c.key} type="button" onClick={() => toggleColumn(c.key)} title={hidden ? t("ฉบับลูกค้าไม่โชว์ข้อมูลนี้", "Not shown in the customer version") : c.hint}
                      className={`${chip(doc.columns.includes(c.key) && !hidden)} ${hidden ? "line-through opacity-50" : ""}`}>{c.label}</button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className={label}>{t("ข้อความหัวเอกสาร", "Header text")} <span className="font-normal text-slate-400">{t("(ถ้ามี)", "(optional)")}</span></label>
              <textarea value={doc.note} onChange={(e) => edit((d) => ({ ...d, note: e.target.value }))} rows={2} placeholder={t("เช่น อัปเดตงานประจำสัปดาห์ · ขอคอนเฟิร์มสีภายในวันศุกร์", "e.g. Weekly update · please confirm colors by Friday")}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-600">{t("ใบงานในสรุป", "Sheets in summary")} ({doc.items.length})</label>
                {canEdit && (
                  <button type="button" onClick={() => setAddOpen((o) => !o)}
                    className={`h-7 rounded-lg border px-2.5 text-xs font-medium ${addOpen ? "border-slate-900 bg-slate-900 text-white" : "border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100"}`}>
                    {addOpen ? t("✕ ปิดตัวเลือก", "✕ Close picker") : t("＋ เพิ่มใบงาน", "＋ Add sheets")}
                  </button>
                )}
              </div>
              {addOpen && canEdit && (
                <AddSheetsPanel meta={meta} existing={new Set(doc.items.map((it) => it.sheet_id))} onAdd={addSheets} onClose={() => setAddOpen(false)} />
              )}
              {loading && doc.items.length === 0 ? (
                <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100" />)}</div>
              ) : (
                <div className="space-y-2">
                  {doc.items.map((it, idx) => {
                    const s = sheets.get(it.sheet_id);
                    const imgs = images[it.sheet_id];
                    const canSplit = it.images.length >= 2;
                    return (
                      <div key={it.sheet_id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-slate-800">{s ? <><span className="font-mono text-[11px] text-slate-400">{s.code}</span> {s.name}</> : t("กำลังโหลด...", "Loading...")}</div>
                            {s && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                <span className="rounded-full px-1.5 py-0.5" style={{ color: s.status_color, backgroundColor: `${s.status_color}1a` }}>{s.status_label}</span>
                                {s.brand_name && <span>{s.brand_name}</span>}
                                {s.closed && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{t("ปิดงานแล้ว", "Closed")}</span>}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5 text-slate-400">
                            <button type="button" onClick={() => moveItem(idx, -1)} disabled={idx === 0} title={t("เลื่อนขึ้น", "Move up")} className="h-7 w-7 rounded hover:bg-slate-100 disabled:opacity-30">▲</button>
                            <button type="button" onClick={() => moveItem(idx, 1)} disabled={idx === doc.items.length - 1} title={t("เลื่อนลง", "Move down")} className="h-7 w-7 rounded hover:bg-slate-100 disabled:opacity-30">▼</button>
                            <button type="button" onClick={() => removeItem(it.sheet_id)} title={t("เอาใบนี้ออกจากสรุป", "Remove this sheet from the summary")} aria-label={t("เอาออก", "Remove")} className="h-7 w-7 rounded text-rose-500 hover:bg-rose-50">✕</button>
                          </div>
                        </div>

                        <div className="mt-2">
                          {imgs === "loading" || imgs === undefined ? (
                            <div className="flex gap-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-14 w-14 animate-pulse rounded-md bg-slate-100" />)}</div>
                          ) : imgs === "error" ? (
                            <div className="text-xs text-rose-600">{t("โหลดรูปไม่สำเร็จ", "Couldn't load images")}</div>
                          ) : imgs.length === 0 ? (
                            <div className="text-xs text-slate-400">{t("ใบงานนี้ยังไม่มีรูป", "This sheet has no images yet")}</div>
                          ) : (
                            <>
                              <div className="mb-1 text-[11px] text-slate-400">{t(`กดรูปเพื่อเลือก (${imgs.length} รูป · เลือก ${it.images.length})`, `Click images to select (${imgs.length} images · ${it.images.length} selected)`)}</div>
                              <div className="flex flex-wrap gap-1.5">
                                {imgs.map((im) => {
                                  const order = it.images.indexOf(im.url);
                                  return (
                                    <button key={im.key} type="button" onClick={() => toggleImage(it.sheet_id, im.url)} title={im.source_label}
                                      className={`relative h-14 w-14 overflow-hidden rounded-md border-2 ${order >= 0 ? "border-blue-500" : "border-transparent opacity-70 hover:opacity-100"}`}>
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={withImageWidth(im.url, 120) ?? im.url} alt="" loading="lazy" className="h-full w-full bg-slate-50 object-cover" />
                                      {order >= 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">{order + 1}</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>

                        {/* ชื่อสินค้า — เติมชื่อใบงานไว้ให้ แก้ได้เลย (เฉพาะในสรุปนี้ ไม่เปลี่ยนชื่อใบงานจริง) */}
                        <div className="mt-2">
                          <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span>{t("ชื่อสินค้า", "Product name")}{it.split ? t(" (ชื่อหลัก)", " (main name)") : ""} <span className="text-slate-400">· {t("แก้เฉพาะในสรุปนี้ ชื่อใบงานจริงไม่เปลี่ยน", "edits apply to this summary only; the sheet name stays the same")}</span></span>
                            {titleEdited(it, s) && <button type="button" onClick={() => resetTitle(it.sheet_id)} className="shrink-0 text-blue-600 hover:underline">↺ {t("ใช้ชื่อเดิม", "Use original name")}</button>}
                          </div>
                          <input value={titleValue(it, s)} onChange={(e) => setTitle(it.sheet_id, e.target.value)} placeholder={s?.name ?? t("ชื่อสินค้า", "Product name")}
                            className="h-8 w-full rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>

                        <label className={`mt-2 flex items-center gap-2 text-xs ${canSplit ? "cursor-pointer text-slate-700" : "text-slate-400"}`} title={canSplit ? "" : t("เลือกรูปอย่างน้อย 2 รูปก่อน", "Select at least 2 images first")}>
                          <input type="checkbox" checked={it.split} disabled={!canSplit} onChange={(e) => setSplit(it.sheet_id, e.target.checked)} className="h-4 w-4" />
                          {t("แยกเป็นรายการตามรูป", "Split into rows by image")} <span className="text-slate-400">{t("(1 รูป = 1 แถว เช่น กระเป๋า 3 ใบในงานเดียว)", "(1 image = 1 row, e.g. 3 bags in one job)")}</span>
                        </label>

                        {it.split ? (
                          <div className="mt-2 space-y-2">
                            {it.images.map((url, i) => (
                              <div key={url} className="grid grid-cols-[28px_minmax(0,1fr)] gap-1.5">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={withImageWidth(url, 80) ?? url} alt="" className="h-7 w-7 rounded border border-slate-200 object-cover" />
                                <div className="space-y-1">
                                  <input value={it.labels[i] ?? ""} onChange={(e) => setText(it.sheet_id, "labels", i, e.target.value)} placeholder={t(`ชื่อชิ้นที่ ${i + 1} (ต่อท้ายชื่อหลัก)`, `Piece ${i + 1} name (appended to the main name)`)}
                                    className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                  <NoteBox value={it.notes[i] ?? ""} onChange={(v) => setText(it.sheet_id, "notes", i, v)} />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2">
                            <NoteBox value={it.notes[0] ?? ""} onChange={(v) => setText(it.sheet_id, "notes", 0, v)} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {canEdit && !addOpen && (
                    <button type="button" onClick={() => setAddOpen(true)}
                      className="w-full rounded-lg border border-dashed border-teal-300 bg-teal-50/40 py-2 text-xs font-medium text-teal-800 hover:bg-teal-50">
                      ＋ {t("เพิ่มใบงานลงสรุป (ลืมเลือกตอนติ๊กบนบอร์ด)", "Add sheets to the summary (missed while picking on the board)")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── ตัวอย่าง + พิมพ์ / รูป ── */}
          <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="mr-auto text-xs font-semibold text-slate-700">{t("ตัวอย่าง", "Preview")} ({AUDIENCE_LABEL[doc.audience]})</span>
              <PrintDocLinkButton html={html} fileName={fileBase} className={actBtn}>🖨 {t("พิมพ์ / PDF", "Print / PDF")}</PrintDocLinkButton>
              {canCopyImage() && (
                <button type="button" onClick={() => void copyImage()} disabled={!!imgBusy || doc.items.length === 0} className={actBtn}>
                  {imgBusy === "copy" ? t("กำลังทำรูป...", "Creating image...") : t("🖼 คัดลอกเป็นรูป", "🖼 Copy as image")}</button>
              )}
              <button type="button" onClick={() => void downloadImage()} disabled={!!imgBusy || doc.items.length === 0} className={actBtn}>
                {imgBusy === "download" ? t("กำลังทำรูป...", "Creating image...") : t("⬇ ดาวน์โหลดรูป", "⬇ Download image")}</button>
              {canEdit && (
                <button type="button" onClick={() => setEmailOpen((o) => !o)} disabled={doc.items.length === 0}
                  className={`${actBtn} ${emailOpen ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800" : ""}`}>
                  {emailOpen ? t("✕ ปิดส่งอีเมล", "✕ Close email") : t("✉️ ส่งอีเมล", "✉️ Email")}</button>
              )}
            </div>
            {emailOpen && canEdit && (
              <SendEmailPanel doc={doc} summaryId={savedId} onSent={() => setEmailOpen(false)} />
            )}
            <iframe title={t("ตัวอย่างสรุปงาน", "Summary preview")} srcDoc={html} className="h-[600px] w-full rounded-lg border border-slate-200 bg-slate-100" />
            <p className="mt-1.5 text-[11px] text-slate-400">{t("พิมพ์ / PDF / รูป ใช้ค่าที่ตั้งอยู่ตอนนี้ได้เลย (ยังไม่บันทึกก็ได้) · คัดลอกรูปแล้ววางใน LINE ด้วย Ctrl+V", "Print / PDF / image use the current settings (no need to save first) · copy the image and paste it into LINE with Ctrl+V")}</p>
          </div>
        </div>
      )}
    </ERPModal>
  );
}
