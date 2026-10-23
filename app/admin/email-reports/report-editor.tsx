"use client";

// ============================================================
// ป๊อปตั้งค่ารายงานอีเมล (เพิ่ม / แก้ไข) — ฟอร์มซ้าย + ตัวอย่างอีเมลจริงขวา (อัปเดตเองเมื่อเปลี่ยนตัวกรอง)
// ใช้ของกลาง: ERPModal · ERPInput/ERPTextarea/ERPTime24 · UserPicker · FieldChipsPicker · กฎตรวจค่า normalizeReportInput (ตัวเดียวกับ API)
// "โชว์อะไรในอีเมล" อ่านรายการที่เลือกได้จากแหล่งข้อมูล (EMAIL_REPORT_SOURCES) — ไม่มีรายการตายตัวในหน้านี้
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPInput, ERPTextarea, ERPTime24 } from "@/components/form";
import { UserPicker } from "@/components/pickers";
import { FieldChipsPicker } from "@/components/field-chips-picker";
import { apiFetch } from "@/lib/api";
import { isOwnBrandJob, buildStatusMeta, type WfStatusRow } from "@/lib/design-sheets-meta";
import {
  COMMON_SUBJECT_TOKENS, DAY_LABELS, DEFAULT_DAYS, DISCORD_MENTION_LABEL, EMAIL_RE, EMAIL_REPORT_SOURCES, INTRO_MAX, SUBJECT_MAX,
  normalizeReportDiscord, normalizeReportInput, normalizeReportOptions, sourceDef,
  type BrandGroupFilter, type EmailRecipient, type EmailReport, type EmailReportDiscord, type EmailReportInput,
} from "@/lib/email-report/shared";

type Brand = { id: string; name: string; color: string | null; is_customer_job?: boolean | null };
type DiscordMeta = { ready: { bot: boolean; buttons: boolean; link: boolean }; channels: { id: string; name: string; guild: string }[]; roles: { id: string; name: string; guild: string }[]; error: string | null };

export const emptyReportInput = (): EmailReportInput => ({
  name: "", source_key: EMAIL_REPORT_SOURCES[0].key,
  filters: { brand_group: "all", brand_ids: [], statuses: [] },
  options: normalizeReportOptions(EMAIL_REPORT_SOURCES[0].key, {}),
  days: [...DEFAULT_DAYS], send_time: "08:00", recipients: [], discord: normalizeReportDiscord({}), skip_if_empty: true, is_enabled: false,
});

export function toInput(r: EmailReport): EmailReportInput {
  return {
    name: r.name, source_key: r.source_key,
    filters: { brand_group: r.filters.brand_group ?? "all", brand_ids: r.filters.brand_ids ?? [], statuses: r.filters.statuses ?? [] },
    options: normalizeReportOptions(r.source_key, r.options),   // รายงานเก่า = เติมค่าเริ่มต้น (หน้าตาเดิม)
    days: r.days, send_time: r.send_time, recipients: r.recipients, discord: normalizeReportDiscord(r.discord),
    skip_if_empty: r.skip_if_empty, is_enabled: r.is_enabled,
  };
}

const GROUPS: { v: BrandGroupFilter; label: string }[] = [
  { v: "all", label: "ทุกแบรนด์" }, { v: "customer", label: "👤 งานลูกค้า" }, { v: "own", label: "🏷️ แบรนด์เรา" },
];

export function ReportEditor({ open, editing, onClose, onSaved }: {
  open: boolean;
  /** null = เพิ่มใหม่ */
  editing: EmailReport | null;
  onClose: () => void;
  onSaved: (r: EmailReport) => void;
}) {
  const initial = useMemo(() => (editing ? toInput(editing) : emptyReportInput()), [editing]);
  const [form, setForm] = useState<EmailReportInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extEmail, setExtEmail] = useState("");
  const [extErr, setExtErr] = useState<string | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [statusRows, setStatusRows] = useState<WfStatusRow[]>([]);
  const [preview, setPreview] = useState<{ subject: string; html: string; total: number; shown: number; fill?: Record<string, number> } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const previewSeq = useRef(0);

  useEffect(() => { if (open) { setForm(initial); setError(null); setExtEmail(""); setExtErr(null); } }, [open, initial]);
  useEffect(() => {
    if (!open) return;
    apiFetch("/api/brands").then((r) => r.json()).then((j) => { if (Array.isArray(j.data)) setBrands(j.data as Brand[]); }).catch(() => {});
    apiFetch("/api/design-sheets/statuses").then((r) => r.json()).then((j) => { if (Array.isArray(j.data)) setStatusRows(j.data as WfStatusRow[]); }).catch(() => {});
  }, [open]);

  // 💬 Discord: ห้อง/บทบาทที่บอทเห็น (โหลดเมื่อเปิด Discord ในรายงานนี้)
  const [dmeta, setDmeta] = useState<DiscordMeta | null>(null);
  const discordOn = form.discord.enabled;
  useEffect(() => {
    if (!open || !discordOn || dmeta) return;
    apiFetch("/api/admin/email-reports/discord").then((r) => r.json()).then((j) => setDmeta(j as DiscordMeta))
      .catch(() => setDmeta({ ready: { bot: false, buttons: false, link: false }, channels: [], roles: [], error: "โหลดห้อง Discord ไม่สำเร็จ" }));
  }, [open, discordOn, dmeta]);

  // 👁 รูปรายงานที่จะส่งเข้า Discord (วาดบนเซิร์ฟเวอร์จริง · ดูได้แม้ยังไม่ตั้งบอท)
  const [img, setImg] = useState<{ url: string | null; busy: boolean; err: string | null }>({ url: null, busy: false, err: null });
  useEffect(() => () => { if (img.url) URL.revokeObjectURL(img.url); }, [img.url]);
  useEffect(() => { if (!open) setImg((s) => ({ ...s, url: null, err: null })); }, [open]);
  const showImage = async () => {
    setImg((s) => ({ ...s, busy: true, err: null }));
    try {
      const r = await apiFetch("/api/admin/email-reports/preview?format=png", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok || !(r.headers.get("content-type") ?? "").startsWith("image/")) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "วาดรูปไม่สำเร็จ");
      }
      const url = URL.createObjectURL(await r.blob());
      setImg({ url, busy: false, err: null });
    } catch (e) { setImg({ url: null, busy: false, err: e instanceof Error ? e.message : "วาดรูปไม่สำเร็จ" }); }
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (p: Partial<EmailReportInput>) => { setForm((f) => ({ ...f, ...p })); setError(null); };
  const setFilters = (p: Partial<EmailReportInput["filters"]>) => set({ filters: { ...form.filters, ...p } });
  const setOptions = (p: Partial<EmailReportInput["options"]>) => set({ options: { ...form.options, ...p } });
  const setDiscord = (p: Partial<EmailReportDiscord>) => set({ discord: { ...form.discord, ...p } });
  const src = sourceDef(form.source_key);
  const opt = form.options;
  // ใส่ {คำ} ต่อท้ายหัวเรื่อง
  const addToken = (key: string) => {
    const base = (opt.subject_template ?? "").trim();
    setOptions({ subject_template: `${base ? `${base} ` : ""}{${key}}`.slice(0, SUBJECT_MAX) });
  };

  // สถานะที่ยังไม่ปิด (ตัวเลือกกรอง) — ไม่ติ๊กเลย = ทุกสถานะ
  const pendingStatuses = useMemo(() => {
    const meta = buildStatusMeta(statusRows);
    return meta.opts.filter(([k]) => !meta.finished.has(k)).map(([k, l]) => ({ key: k, label: l, color: meta.colorHex[k] ?? "#94a3b8" }));
  }, [statusRows]);
  const statuses = form.filters.statuses ?? [];
  const toggleStatus = (k: string) => {
    const cur = statuses.length ? statuses : pendingStatuses.map((s) => s.key);
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    setFilters({ statuses: next.length === pendingStatuses.length ? [] : next });
  };
  const groupBrands = brands.filter((b) => form.filters.brand_group === "all" || isOwnBrandJob(b) === (form.filters.brand_group === "own"));
  const brandIds = form.filters.brand_ids ?? [];
  const toggleBrand = (id: string) => setFilters({ brand_ids: brandIds.includes(id) ? brandIds.filter((x) => x !== id) : [...brandIds, id] });

  // ตัวอย่างอีเมล: โหลดใหม่เองหลังหยุดแก้ 0.6 วิ (ไม่รวมผู้รับ — ไม่กระทบหน้าตาอีเมล)
  const previewKey = JSON.stringify({ n: form.name, s: form.source_key, f: form.filters, o: form.options, d: form.days, t: form.send_time });
  useEffect(() => {
    if (!open) return;
    const seq = ++previewSeq.current;
    const timer = setTimeout(() => {
      setPreviewLoading(true); setPreviewErr(null);
      apiFetch("/api/admin/email-reports/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
        .then((r) => r.json())
        .then((j) => { if (seq !== previewSeq.current) return; if (j.error) setPreviewErr(j.error); else setPreview(j); })
        .catch(() => { if (seq === previewSeq.current) setPreviewErr("โหลดตัวอย่างไม่สำเร็จ"); })
        .finally(() => { if (seq === previewSeq.current) setPreviewLoading(false); });
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, previewKey]);

  const addUser = (u: { id: string; name: string; email?: string | null } | null) => {
    if (!u) return;
    if (form.recipients.some((r) => r.type === "user" && r.id === u.id)) return;
    set({ recipients: [...form.recipients, { type: "user", id: u.id, name: u.name, email: u.email ?? null }] });
  };
  const addEmail = () => {
    const email = extEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setExtErr("อีเมลไม่ถูกต้อง เช่น name@gmail.com"); return; }
    if (form.recipients.some((r) => (r.type === "email" ? r.email : r.email?.toLowerCase()) === email)) { setExtErr("มีอีเมลนี้ในรายชื่อแล้ว"); return; }
    set({ recipients: [...form.recipients, { type: "email", email }] });
    setExtEmail(""); setExtErr(null);
  };
  const removeRecipient = (i: number) => set({ recipients: form.recipients.filter((_, idx) => idx !== i) });

  const save = async () => {
    if (saving) return;
    const parsed = normalizeReportInput(form);           // กฎเดียวกับ API — เตือนก่อนยิง
    if ("error" in parsed) { setError(parsed.error); return; }
    setSaving(true); setError(null);
    try {
      const res = await apiFetch(editing ? `/api/admin/email-reports/${editing.id}` : "/api/admin/email-reports", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.value),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      onSaved(j.data as EmailReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally { setSaving(false); }
  };

  const label = "block text-xs font-medium text-slate-600 mb-1";
  const chip = (on: boolean) => `h-8 rounded-lg border px-2.5 text-xs font-medium transition ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  const recipientLabel = (r: EmailRecipient) => (r.type === "user" ? r.name || r.email || "ผู้ใช้" : r.email);

  return (
    <ERPModal open={open} onClose={onClose} size="xl" storageKey="email-report-editor" hasUnsavedChanges={dirty}
      title={editing ? `แก้ไขรายงาน — ${editing.name}` : "เพิ่มรายงานอีเมล"}
      description="ตั้งว่าจะส่งข้อมูลอะไร ถึงใคร วันไหน กี่โมง · ด้านขวาคือหน้าตาอีเมลจริงจากข้อมูลตอนนี้"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {error && <span className="mr-auto text-sm text-rose-600">⚠ {error}</span>}
          <button onClick={onClose} disabled={saving} className="h-9 rounded-lg border border-slate-300 px-4 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button onClick={() => void save()} disabled={saving} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "💾 บันทึก"}</button>
        </div>
      }>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* ── ฟอร์ม ── */}
        <div className="space-y-4">
          <div>
            <label className={label}>ชื่อรายงาน</label>
            <ERPInput value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="เช่น งานออกแบบที่ค้าง (ทุกแบรนด์)" />
          </div>
          <div>
            <label className={label}>ข้อมูลที่ส่ง</label>
            <select value={form.source_key} onChange={(e) => set({ source_key: e.target.value, options: normalizeReportOptions(e.target.value, form.options) })}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {EMAIL_REPORT_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">{EMAIL_REPORT_SOURCES.find((s) => s.key === form.source_key)?.description}</p>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-700">กรองเฉพาะ</div>
            <label className={label}>กลุ่มแบรนด์</label>
            <div className="flex flex-wrap gap-1">
              {GROUPS.map((g) => (
                <button key={g.v} type="button" onClick={() => setFilters({ brand_group: g.v, brand_ids: [] })} className={chip((form.filters.brand_group ?? "all") === g.v)}>{g.label}</button>
              ))}
            </div>
            {groupBrands.length > 0 && (
              <div className="mt-2">
                <label className={label}>เฉพาะแบรนด์ <span className="font-normal text-slate-400">(ไม่เลือก = ทุกแบรนด์ในกลุ่ม)</span></label>
                <div className="flex flex-wrap gap-1">
                  {groupBrands.map((b) => (
                    <button key={b.id} type="button" onClick={() => toggleBrand(b.id)} className={chip(brandIds.includes(b.id))}>
                      <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: b.color && /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : "#94a3b8" }} />{b.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {pendingStatuses.length > 0 && (
              <div className="mt-2">
                <label className={label}>สถานะ <span className="font-normal text-slate-400">(ส่งเฉพาะงานที่ยังไม่ปิด)</span></label>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {pendingStatuses.map((s) => (
                    <label key={s.key} className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
                      <input type="checkbox" checked={statuses.length === 0 || statuses.includes(s.key)} onChange={() => toggleStatus(s.key)} className="h-3.5 w-3.5" />
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />{s.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <label className={label}>วันส่ง</label>
              <div className="flex flex-wrap gap-1">
                {DAY_LABELS.map((d) => {
                  const on = form.days.includes(d.n);
                  return (
                    <button key={d.n} type="button" title={d.full} onClick={() => set({ days: on ? form.days.filter((x) => x !== d.n) : [...form.days, d.n].sort((a, b) => a - b) })}
                      className={`h-9 w-10 rounded-lg border text-xs font-medium ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{d.short}</button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className={label}>เวลา (ไทย)</label>
              <ERPTime24 value={form.send_time} onChange={(v) => set({ send_time: v })} />
            </div>
          </div>

          <div>
            <label className={label}>ผู้รับ <span className="font-normal text-slate-400">(ทุกคนได้อีเมลฉบับเดียวกัน)</span></label>
            {form.recipients.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {form.recipients.map((r, i) => {
                  const noEmail = r.type === "user" && !r.email;
                  return (
                    <span key={`${r.type}-${r.type === "user" ? r.id : r.email}`} title={r.type === "user" ? r.email ?? "ผู้ใช้นี้ยังไม่มีอีเมลในระบบ" : "อีเมลนอกระบบ"}
                      className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-2 pr-1 text-xs ${noEmail ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                      {r.type === "user" ? "👤" : "✉️"} {recipientLabel(r)}{noEmail && " (ไม่มีอีเมล)"}
                      <button type="button" onClick={() => removeRecipient(i)} aria-label={`เอา ${recipientLabel(r)} ออก`} className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700">✕</button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="mb-2 text-xs text-slate-400">ยังไม่มีผู้รับ — เลือกผู้ใช้ในระบบ หรือพิมพ์อีเมลนอกระบบ</p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <UserPicker value={null} onChange={(u) => addUser(u)} placeholder="＋ เลือกผู้ใช้ในระบบ..." />
              <div>
                <div className="flex gap-1.5">
                  <input value={extEmail} onChange={(e) => { setExtEmail(e.target.value); setExtErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
                    placeholder="อีเมลนอกระบบ เช่น partner@gmail.com" inputMode="email"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={addEmail} className="h-9 shrink-0 rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">เพิ่ม</button>
                </div>
                {extErr && <p className="mt-1 text-xs text-rose-600">{extErr}</p>}
              </div>
            </div>
          </div>

          {/* 💬 ส่งเข้า Discord: ภาพรวม + รูปรายงาน + การ์ดเฉพาะใบที่มีของรอ (ปุ่มติ๊ก) — lib/email-report/discord */}
          <div className={`rounded-lg border p-3 text-sm ${discordOn ? "border-indigo-200 bg-indigo-50/30" : "border-slate-200"}`}>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={discordOn} onChange={(e) => setDiscord({ enabled: e.target.checked })} className="h-4 w-4" />
              💬 ส่งเข้า Discord ด้วย <span className="font-normal text-slate-400">(รูปรายงาน + การ์ดเฉพาะใบที่มีของรอ พร้อมปุ่มติ๊ก)</span>
            </label>
            {discordOn && (
              !dmeta ? <p className="mt-2 text-xs text-slate-400">กำลังโหลดห้อง Discord…</p>
              : !dmeta.ready.bot ? <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">ยังไม่ได้ตั้งบอท Discord — ทำตาม "คู่มือตั้งบอท Discord" ในหน้านี้ก่อน (ตั้งค่าไว้ก่อนได้ แต่ยังส่งไม่ได้)</p>
              : (
                <div className="mt-2 space-y-2">
                  {dmeta.error && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{dmeta.error}</p>}
                  {!dmeta.ready.buttons && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">ปุ่มติ๊กยังใช้ไม่ได้ (ยังไม่ได้ใส่ DISCORD_PUBLIC_KEY + ลิงก์รับปุ่ม) — การ์ดจะมีแค่ปุ่ม "เปิดใบงาน"</p>}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className={label}>ห้อง</label>
                      <select value={form.discord.channel_id ?? ""} onChange={(e) => { const c = dmeta.channels.find((x) => x.id === e.target.value); setDiscord({ channel_id: c?.id ?? null, channel_name: c?.name ?? null }); }}
                        className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">— เลือกห้อง —</option>
                        {form.discord.channel_id && !dmeta.channels.some((c) => c.id === form.discord.channel_id) && <option value={form.discord.channel_id}>#{form.discord.channel_name ?? form.discord.channel_id} (บอทมองไม่เห็นแล้ว)</option>}
                        {dmeta.channels.map((c) => <option key={c.id} value={c.id}>#{c.name}{new Set(dmeta.channels.map((x) => x.guild)).size > 1 ? ` · ${c.guild}` : ""}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={label}>แท็กบทบาท <span className="font-normal text-slate-400">(ไม่บังคับ)</span></label>
                      <select value={form.discord.role_id ?? ""} onChange={(e) => { const r = dmeta.roles.find((x) => x.id === e.target.value); setDiscord({ role_id: r?.id ?? null, role_name: r?.name ?? null }); }}
                        className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">— ไม่แท็ก —</option>
                        {dmeta.roles.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}
                      </select>
                    </div>
                  </div>
                  {form.discord.role_id && (
                    <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600">แท็ก @{form.discord.role_name}
                      {(["overdue", "always"] as const).map((m) => <button key={m} type="button" onClick={() => setDiscord({ mention: m })} className={chip(form.discord.mention === m)}>{DISCORD_MENTION_LABEL[m]}</button>)}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-700">
                    <span className="inline-flex items-center gap-1">งานในรูป
                      {[10, 15, 20].map((n) => <button key={n} type="button" onClick={() => setDiscord({ image_rows: n })} className={chip(form.discord.image_rows === n)}>{n}</button>)}
                    </span>
                    <label className="inline-flex items-center gap-1.5">การ์ด "ต้องติ๊ก" สูงสุด
                      <input type="number" min={0} max={15} value={form.discord.max_cards} onChange={(e) => setDiscord({ max_cards: Number(e.target.value) })}
                        className="h-8 w-14 rounded-lg border border-slate-200 px-2 text-center text-sm" /> ใบ</label>
                  </div>
                  <p className="text-[11px] text-slate-400">ส่งทดสอบ = ส่งเข้า DM ของคุณ (ต้องผูกบัญชี Discord ที่เมนูบัญชีก่อน) · ส่งเดี๋ยวนี้/ตามเวลา = ส่งเข้าห้องที่เลือก</p>
                </div>
              )
            )}
            {discordOn && (
              <div className="mt-2">
                <button type="button" onClick={() => void showImage()} disabled={img.busy}
                  className="h-8 rounded-lg border border-indigo-200 bg-white px-3 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                  {img.busy ? "กำลังวาดรูป…" : img.url ? "↻ วาดรูปใหม่" : "👁 ดูรูปที่จะส่งเข้า Discord"}</button>
                {img.err && <p className="mt-1 text-xs text-rose-600">⚠ {img.err}</p>}
                {img.url && (
                  <a href={img.url} target="_blank" rel="noreferrer" title="เปิดรูปขนาดเต็ม" className="mt-2 block max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="รูปรายงานที่จะส่งเข้า Discord" className="w-full" />
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="mb-2 text-xs font-semibold text-slate-700">ตัวเลือก</div>
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <div className="space-y-2 text-xs text-slate-700">
                <label className="flex items-center gap-1.5">โชว์ในอีเมลสูงสุด
                  <input type="number" min={5} max={100} value={opt.max_rows ?? 50} onChange={(e) => setOptions({ max_rows: Number(e.target.value) })}
                    className="h-8 w-16 rounded-lg border border-slate-200 px-2 text-center text-sm" /> งาน</label>
                <label className="flex items-center gap-1.5">เตือนสีส้มเมื่อไม่ขยับเกิน
                  <input type="number" min={1} max={60} value={opt.stale_days ?? 7} onChange={(e) => setOptions({ stale_days: Number(e.target.value) })}
                    className="h-8 w-14 rounded-lg border border-slate-200 px-2 text-center text-sm" /> วัน</label>
                <label className="flex items-center gap-1.5">เตือนใกล้กำหนดล่วงหน้า
                  <input type="number" min={0} max={30} value={opt.due_soon_days ?? 3} onChange={(e) => setOptions({ due_soon_days: Number(e.target.value) })}
                    className="h-8 w-14 rounded-lg border border-slate-200 px-2 text-center text-sm" /> วัน</label>
              </div>
              <div className="space-y-2">
                <div>
                  <label className={label}>จัดกลุ่มตาม</label>
                  <div className="flex flex-wrap gap-1">
                    {src.groupBy.map((c) => <button key={c.key} type="button" onClick={() => setOptions({ group_by: c.key })} className={chip((opt.group_by ?? src.groupBy[0]?.key) === c.key)}>{c.label}</button>)}
                  </div>
                </div>
                <div>
                  <label className={label}>เรียงงานตาม</label>
                  <select value={opt.sort_by ?? src.sortBy[0]?.key} onChange={(e) => setOptions({ sort_by: e.target.value })}
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {src.sortBy.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>ส่งงานไหนบ้าง</label>
                  <div className="flex flex-wrap gap-1">
                    <button type="button" onClick={() => setOptions({ only_flagged: false })} className={chip(!opt.only_flagged)}>ทุกงาน</button>
                    <button type="button" onClick={() => setOptions({ only_flagged: true })} className={chip(!!opt.only_flagged)}>เฉพาะงานที่มีป้ายเตือน</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={form.skip_if_empty} onChange={(e) => set({ skip_if_empty: e.target.checked })} className="h-4 w-4" />
                วันที่ไม่มีงานค้าง ไม่ต้องส่ง
              </label>
              <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={form.is_enabled} onChange={(e) => set({ is_enabled: e.target.checked })} className="h-4 w-4" />
                เปิดส่งอัตโนมัติตามวันและเวลาด้านบน
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="mb-2 text-xs font-semibold text-slate-700">โชว์อะไรในอีเมล</div>
            <label className={label}>ตัวเลขสรุปด้านบน <span className="font-normal text-slate-400">(กดเปิด/ปิด)</span></label>
            <div className="flex flex-wrap gap-1">
              {src.stats.map((c) => {
                const on = (opt.stats ?? []).includes(c.key);
                return (
                  <button key={c.key} type="button" className={chip(on)}
                    onClick={() => setOptions({ stats: on ? (opt.stats ?? []).filter((k) => k !== c.key) : src.stats.map((x) => x.key).filter((k) => k === c.key || (opt.stats ?? []).includes(k)) })}>
                    {on ? "✓ " : ""}{c.label.replace("{stale_days}", String(opt.stale_days ?? 7))}
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              <label className={label}>ข้อมูลของแต่ละงาน <span className="font-normal text-slate-400">(เรียงตามลำดับที่เลือก · ชื่องานโชว์เสมอ)</span></label>
              <FieldChipsPicker compact showKeys={false}
                value={opt.row_fields ?? []} onChange={(v) => setOptions({ row_fields: v })}
                fields={src.rowFields.map((c) => ({
                  key: c.key, label: c.label,
                  hint: preview?.fill && preview.fill[c.key] !== undefined ? `มีข้อมูล ${preview.fill[c.key]}/${preview.total}` : undefined,
                }))}
                title="เลือกข้อมูลที่จะโชว์ในแต่ละงาน"
                description="ติ๊กตามลำดับที่อยากให้โชว์ (อยากสลับ ให้เอาออกแล้วติ๊กใหม่) · ตัวเลขด้านขวา = งานในรายงานนี้ที่มีข้อมูลช่องนั้นจริงตอนนี้"
                addLabel="＋ เลือกข้อมูล…" searchPlaceholder="ค้นหาชื่อข้อมูล…" unit="อย่าง" emptyText="โชว์แค่ชื่องาน" />
            </div>
            <div className="mt-3">
              <label className={label}>หัวเรื่องอีเมล <span className="font-normal text-slate-400">(เว้นว่าง = แบบเดิม)</span></label>
              <ERPInput value={opt.subject_template ?? ""} maxLength={SUBJECT_MAX} placeholder={src.defaultSubject}
                onChange={(e) => setOptions({ subject_template: e.target.value })} />
              <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                ใส่คำ:
                {[...src.subjectTokens, ...COMMON_SUBJECT_TOKENS].map((t) => (
                  <button key={t.key} type="button" title={t.label} onClick={() => addToken(t.key)}
                    className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:bg-slate-50">{`{${t.key}}`}</button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <label className={label}>ข้อความเกริ่นบนสุด <span className="font-normal text-slate-400">(ไม่บังคับ)</span></label>
              <ERPTextarea rows={2} maxLength={INTRO_MAX} value={opt.intro ?? ""} placeholder="เช่น ฝากทีมเช็กงานที่ป้ายแดงก่อนเที่ยง"
                onChange={(e) => setOptions({ intro: e.target.value })} />
            </div>
          </div>
        </div>

        {/* ── ตัวอย่างอีเมล (ข้อมูลจริงตอนนี้) ── */}
        <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-700">ตัวอย่างอีเมล</div>
            <span className="text-[11px] text-slate-400">{previewLoading ? "กำลังโหลด..." : preview ? `พบ ${preview.total} งาน · โชว์ ${preview.shown}` : ""}</span>
          </div>
          {preview && <div className="mb-1.5 truncate rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600" title={preview.subject}>หัวเรื่อง: <b>{preview.subject}</b></div>}
          {previewErr ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">⚠ {previewErr}</div>
          ) : preview ? (
            <iframe title="ตัวอย่างอีเมล" srcDoc={preview.html} sandbox="allow-popups allow-popups-to-escape-sandbox"
              className={`h-[560px] w-full rounded-lg border border-slate-200 bg-slate-100 transition-opacity ${previewLoading ? "opacity-60" : ""}`} />
          ) : (
            <div className="flex h-[560px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">กำลังเตรียมตัวอย่าง...</div>
          )}
          <p className="mt-1.5 text-[11px] text-slate-400">รูปในอีเมลจริงจะโหลดจากระบบ · Gmail โชว์ทันที · Outlook บางเครื่องถามก่อนโหลดรูป</p>
        </div>
      </div>
    </ERPModal>
  );
}
