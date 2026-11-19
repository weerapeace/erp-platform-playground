"use client";

/**
 * 📣 กล่องประกาศจากหัวหน้า (แอปพนักงาน รอบ 3) — โชว์บนหน้าแรกแอป + แท็บ "ประกาศ" ในตัวช่วยสร้าง (manage)
 * ข้อมูล: /api/staff-apps/announcements · กฎ lib/staff-app-extras · เขียนได้ด้วยสิทธิ์ staff_apps.announce
 * แก้ได้ทุกช่อง · ลบ = เก็บไว้ก่อน + ปุ่มย้อนกลับ · ตั้งวันเริ่ม/วันหมดอายุได้ (หมดอายุแล้วหายเอง)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { ERPDateTime24 } from "@/components/form";
import { Icon } from "@/components/icon";
import { announcementActive, type Announcement } from "@/lib/staff-app-extras";

type Form = { id?: string; title: string; body: string; level: Announcement["level"]; starts_at: string; expires_at: string; pinned: boolean };
const EMPTY: Form = { title: "", body: "", level: "info", starts_at: "", expires_at: "", pinned: false };

/** ISO → ค่าของช่องวันเวลา (YYYY-MM-DDTHH:mm เวลาเครื่อง) */
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const toIso = (local: string) => (local && local.length >= 16 ? new Date(local).toISOString() : null);

const TONE: Record<Announcement["level"], string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  urgent: "border-rose-200 bg-rose-50 text-rose-900",
};

async function send(method: string, url: string, body?: unknown) {
  const r = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export function AppAnnouncements({ appKey, manage = false }: { appKey: string; manage?: boolean }) {
  const t = useT();
  const toast = useToast();
  const [list, setList] = useState<Announcement[] | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [rev, setRev] = useState(0);
  const reload = useCallback(() => setRev((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    apiFetch(`/api/staff-apps/announcements?app=${encodeURIComponent(appKey)}${manage ? "&manage=1" : ""}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      setList((j.data ?? []) as Announcement[]); setCanWrite(!!j.canWrite);
    }).catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [appKey, manage, rev]);

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const payload = { title: form.title, body: form.body, level: form.level, starts_at: toIso(form.starts_at), expires_at: toIso(form.expires_at), pinned: form.pinned };
      if (form.id) await send("PATCH", "/api/staff-apps/announcements", { id: form.id, ...payload });
      else await send("POST", "/api/staff-apps/announcements", { app_key: appKey, ...payload });
      toast.success(form.id ? t("แก้ประกาศแล้ว", "Announcement updated") : t("ลงประกาศแล้ว", "Announcement posted"));
      setForm(null); reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Couldn't save")); }
    finally { setBusy(false); }
  };
  const remove = async (a: Announcement) => {
    try {
      await send("DELETE", `/api/staff-apps/announcements?id=${encodeURIComponent(a.id)}`);
      reload();
      toast.undo(t(`ลบประกาศ “${a.title}” แล้ว`, `Deleted “${a.title}”`), async () => { await send("POST", "/api/staff-apps/announcements", { action: "restore", id: a.id }); reload(); });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Couldn't delete")); }
  };

  if (!list) return manage ? <div className="h-16 animate-pulse rounded-xl bg-slate-100" /> : null;
  if (!list.length && !canWrite) return manage ? <p className="py-8 text-center text-sm text-slate-500">{t("ยังไม่มีประกาศ", "No announcements")}</p> : null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="px-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><Icon name="speakerphone" /> {t("ประกาศ", "Announcements")}</h2>
        {canWrite && (
          <button type="button" onClick={() => setForm({ ...EMPTY })} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50">
            <Icon name="plus" /> {t("ลงประกาศ", "Post")}
          </button>
        )}
      </div>
      {list.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 px-3 py-3 text-center text-xs text-slate-500">{t("ยังไม่มีประกาศ — กด “ลงประกาศ” เพื่อแจ้งทีม", "No announcements yet")}</p>}
      {list.map((a) => {
        const live = announcementActive(a);
        return (
          <div key={a.id} className={`rounded-xl border px-3 py-2.5 ${TONE[a.level]} ${live ? "" : "opacity-60"}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                  {a.pinned && <Icon name="pin" />}{a.title}
                  {!live && <span className="rounded bg-white/70 px-1.5 text-[10px] font-normal">{a.expires_at && new Date(a.expires_at) <= new Date() ? t("หมดอายุแล้ว", "Expired") : t("ยังไม่ถึงวันแสดง", "Scheduled")}</span>}
                </div>
                {a.body && <p className="mt-0.5 whitespace-pre-line text-sm opacity-90">{a.body}</p>}
                <div className="mt-1 text-[11px] opacity-70">
                  {a.created_by_name ?? ""} · {new Date(a.created_at).toLocaleDateString("th-TH")}
                  {a.expires_at && ` · ${t("ถึง", "until")} ${new Date(a.expires_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}`}
                </div>
              </div>
              {canWrite && (
                <div className="flex shrink-0 gap-0.5">
                  <button type="button" onClick={() => setForm({ id: a.id, title: a.title, body: a.body ?? "", level: a.level, starts_at: toLocal(a.starts_at), expires_at: toLocal(a.expires_at), pinned: a.pinned })}
                    aria-label={t("แก้ประกาศ", "Edit")} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/60"><Icon name="edit" /></button>
                  <button type="button" onClick={() => void remove(a)} aria-label={t("ลบประกาศ", "Delete")} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/60"><Icon name="trash" /></button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {form && (
        <ERPModal open onClose={() => setForm(null)} title={form.id ? t("แก้ประกาศ", "Edit announcement") : t("ลงประกาศ", "New announcement")} size="md" defaultExpanded={false}
          hasUnsavedChanges={!!form.title.trim()}
          footer={<div className="flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            <button type="button" onClick={() => void save()} disabled={busy || !form.title.trim()} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
          </div>}>
          <div className="space-y-3 text-sm">
            <label className="block"><span className="mb-1 block text-slate-600">{t("หัวข้อ", "Title")} *</span>
              <input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus className="h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-400" />
            </label>
            <label className="block"><span className="mb-1 block text-slate-600">{t("รายละเอียด", "Details")}</span>
              <textarea value={form.body} maxLength={2000} rows={4} onChange={(e) => setForm({ ...form, body: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-400" />
            </label>
            <div className="flex flex-wrap gap-3">
              {(["info", "warn", "urgent"] as const).map((l) => (
                <label key={l} className="inline-flex cursor-pointer items-center gap-1.5">
                  <input type="radio" checked={form.level === l} onChange={() => setForm({ ...form, level: l })} />
                  {l === "info" ? t("ทั่วไป", "Info") : l === "warn" ? t("สำคัญ", "Important") : t("ด่วน", "Urgent")}
                </label>
              ))}
              <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> {t("ปักไว้บนสุด", "Pin to top")}</label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><div className="mb-1 text-slate-600">{t("เริ่มแสดง (ไม่ใส่ = ทันที)", "Show from (blank = now)")}</div><ERPDateTime24 value={form.starts_at} onChange={(v) => setForm({ ...form, starts_at: v })} defaultTime="08:00" /></div>
              <div><div className="mb-1 text-slate-600">{t("หมดอายุ (ไม่ใส่ = ไม่หมด)", "Expires (blank = never)")}</div><ERPDateTime24 value={form.expires_at} onChange={(v) => setForm({ ...form, expires_at: v })} defaultTime="18:00" /></div>
            </div>
          </div>
        </ERPModal>
      )}
    </section>
  );
}
