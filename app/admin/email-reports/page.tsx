"use client";

// ============================================================
// 📧 ส่งอีเมลรายงาน (ตั้งค่า) — รายงานอีเมลอัตโนมัติ: ส่งอะไร ถึงใคร วันไหน กี่โมง + ประวัติการส่ง + คู่มือ Resend
// รอบ 1: ตั้งค่า + ดูตัวอย่าง (ยังไม่ส่งจริง) · รอบ 2: ส่งทดสอบ + ตัวตั้งเวลา (pg_cron)
// ของกลาง: ERPModal/ConfirmDialog · ป๊อปตั้งค่า ./report-editor · ข้อมูล/อีเมล lib/email-report · doc: docs/email-reports.md
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ConfirmDialog } from "@/components/modal";
import { usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import {
  describeDays, sourceLabel, RUN_STATUS_LABEL, RUN_TRIGGER_LABEL,
  type EmailReport, type EmailReportRun,
} from "@/lib/email-report/shared";
import { ReportEditor, toInput } from "./report-editor";
import { EmailSetupGuide } from "./email-setup-guide";

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
const GROUP_TEXT: Record<string, string> = { all: "ทุกแบรนด์", customer: "งานลูกค้า", own: "แบรนด์เรา" };

export default function EmailReportsPage() {
  const canManage = usePermission("admin.email_reports");
  const toast = useToast();
  const [reports, setReports] = useState<EmailReport[]>([]);
  const [runs, setRuns] = useState<EmailReportRun[]>([]);
  const [emailReady, setEmailReady] = useState(false);
  const [emailInfo, setEmailInfo] = useState<{ provider: "resend" | "gmail" | null; sender: string | null; scheduler: boolean }>({ provider: null, sender: null, scheduler: false });
  const [sending, setSending] = useState<string | null>(null);              // `${id}:test` / `${id}:now`
  const [sendNowTarget, setSendNowTarget] = useState<EmailReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<EmailReport | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailReport | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/admin/email-reports");
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setReports(j.data as EmailReport[]); setRuns(j.runs as EmailReportRun[]); setEmailReady(!!j.email_ready);
      setEmailInfo({ provider: j.email_provider ?? null, sender: j.email_sender ?? null, scheduler: !!j.scheduler_active });
    } catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canManage) void load(); }, [canManage, load]);

  const openEditor = (r: EmailReport | null) => { setEditing(r); setEditorOpen(true); };

  // สวิตช์เปิด/ปิด = บันทึกทั้งชุดผ่าน PATCH (กฎตรวจเดียวกับฟอร์ม เช่น ไม่มีผู้รับ = เปิดไม่ได้)
  const toggle = async (r: EmailReport) => {
    setToggling(r.id);
    try {
      const res = await apiFetch(`/api/admin/email-reports/${r.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...toInput(r), is_enabled: !r.is_enabled }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setReports((list) => list.map((x) => (x.id === r.id ? (j.data as EmailReport) : x)));
      toast.success(r.is_enabled ? `ปิดรายงาน "${r.name}" แล้ว` : `เปิดรายงาน "${r.name}" แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setToggling(null); }
  };

  // ✉️ ส่งทดสอบถึงฉัน / 📤 ส่งเดี๋ยวนี้ (ทุกผู้รับ) — ผลลงประวัติการส่งเสมอ
  const send = async (r: EmailReport, mode: "test" | "now") => {
    setSending(`${r.id}:${mode}`);
    try {
      const res = await apiFetch(`/api/admin/email-reports/${r.id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
      const j = await res.json().catch(() => ({}));
      const msg: string = j.result?.message || j.error || "ส่งไม่สำเร็จ";
      if (res.ok && j.ok) toast.success(mode === "test" ? `ส่งทดสอบแล้ว — เช็กกล่องอีเมลของคุณ (${msg})` : msg);
      else toast.error(msg);
      if (j.result?.skipped?.length) toast.warning(`ข้ามผู้รับ: ${j.result.skipped.join(", ")}`);
    } catch { toast.error("ส่งไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setSending(null); setSendNowTarget(null); void load(); }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/admin/email-reports/${deleteTarget.id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "ลบไม่สำเร็จ");
      setReports((list) => list.filter((x) => x.id !== deleteTarget.id));
      toast.success(`ลบรายงาน "${deleteTarget.name}" แล้ว`);
      setDeleteTarget(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setDeleting(false); }
  };

  if (!canManage) return <PlaygroundShell><AccessDenied message="หน้านี้สำหรับผู้มีสิทธิ์ จัดการส่งอีเมลรายงาน" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">📧 ส่งอีเมลรายงาน</h1>
            <p className="mt-0.5 text-sm text-slate-500">ตั้งว่ารายงานไหน ส่งถึงใคร วันไหน กี่โมง — ระบบส่งอีเมลให้เองตามเวลา</p>
          </div>
          <button onClick={() => openEditor(null)} className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">＋ เพิ่มรายงาน</button>
        </div>

        {/* สถานะระบบ */}
        {!loading && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${emailReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {emailReady
              ? <>✅ <b>ระบบส่งอีเมลพร้อมแล้ว</b> — ส่งผ่าน {emailInfo.provider === "gmail" ? "Gmail" : "Resend (โดเมนบริษัท)"}{emailInfo.sender ? <> จาก <b>{emailInfo.sender}</b></> : null}</>
              : <>⚠️ <b>ระบบส่งอีเมลยังไม่พร้อม</b> — ต้องตั้ง Gmail ที่จะใช้ส่งก่อน ทำตามคู่มือด้านล่าง (~5 นาที) · ระหว่างนี้ตั้งค่าและดูตัวอย่างอีเมลได้ตามปกติ</>}
            <div className="mt-1 text-xs opacity-80">
              {emailInfo.scheduler
                ? "⏰ ตัวตั้งเวลาทำงานอยู่ — เช็กทุก 15 นาที ส่งตามวันและเวลาที่ตั้ง (ส่งได้ภายใน 2 ชม.หลังเวลาที่ตั้ง · วันละครั้ง)"
                : "⏰ ตัวตั้งเวลายังไม่ทำงาน — ส่งทดสอบ / ส่งเดี๋ยวนี้ ใช้ได้ แต่ยังไม่ส่งเองตามเวลา"}
            </div>
          </div>
        )}

        {/* รายการรายงาน */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">รายงานทั้งหมด</div>
          {loading ? (
            <div className="space-y-2 p-4">{[0, 1].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}</div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-rose-700">
              ⚠ {error}
              <button onClick={() => void load()} className="h-8 rounded-lg border border-slate-300 px-3 text-xs text-slate-700 hover:bg-slate-50">ลองใหม่</button>
            </div>
          ) : reports.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">ยังไม่มีรายงาน — กด <b>＋ เพิ่มรายงาน</b> เพื่อเริ่ม</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {reports.map((r) => {
                const lastRun = runs.find((x) => x.report_id === r.id);
                const names = r.recipients.map((x) => (x.type === "user" ? x.name || x.email || "ผู้ใช้" : x.email));
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-800">{r.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${r.is_enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{r.is_enabled ? "เปิดอยู่" : "ปิดอยู่"}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {sourceLabel(r.source_key)} · {GROUP_TEXT[r.filters.brand_group ?? "all"]}{r.filters.brand_ids?.length ? ` (${r.filters.brand_ids.length} แบรนด์)` : ""}
                        {" · "}<b className="font-medium text-slate-700">{describeDays(r.days)} · {r.send_time} น.</b>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        ผู้รับ: {names.length ? `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` และอีก ${names.length - 3} คน` : ""}` : <span className="text-amber-700">ยังไม่มีผู้รับ</span>}
                        {" · "}ส่งล่าสุด: {lastRun ? <>{fmtDateTime(lastRun.ran_at)} <span className={`rounded px-1.5 py-0.5 text-[10px] ${RUN_STATUS_LABEL[lastRun.status]?.cls ?? ""}`}>{RUN_STATUS_LABEL[lastRun.status]?.label ?? lastRun.status}</span></> : "ยังไม่เคยส่ง"}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button role="switch" aria-checked={r.is_enabled} aria-label={r.is_enabled ? "ปิดรายงานนี้" : "เปิดรายงานนี้"} title={r.is_enabled ? "ปิดการส่งอัตโนมัติ" : "เปิดการส่งอัตโนมัติ"}
                        onClick={() => void toggle(r)} disabled={toggling === r.id}
                        className={`relative h-6 w-11 rounded-full transition ${r.is_enabled ? "bg-emerald-500" : "bg-slate-300"} disabled:opacity-50`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${r.is_enabled ? "left-[22px]" : "left-0.5"}`} />
                      </button>
                      <button onClick={() => void send(r, "test")} disabled={!!sending} title="ส่งอีเมลนี้เข้าอีเมลของคุณคนเดียว (หัวเรื่องขึ้นต้น [ทดสอบ])"
                        className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                        {sending === `${r.id}:test` ? "กำลังส่ง..." : "✉️ ทดสอบ"}</button>
                      <button onClick={() => setSendNowTarget(r)} disabled={!!sending || r.recipients.length === 0} title={r.recipients.length ? "ส่งถึงผู้รับทุกคนเดี๋ยวนี้" : "ยังไม่มีผู้รับ"}
                        className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                        {sending === `${r.id}:now` ? "กำลังส่ง..." : "📤 ส่งเดี๋ยวนี้"}</button>
                      <button onClick={() => openEditor(r)} className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">✏️ แก้ไข / ดูตัวอย่าง</button>
                      <button onClick={() => setDeleteTarget(r)} title="ลบรายงานนี้" aria-label={`ลบ ${r.name}`} className="h-8 w-8 rounded-lg text-rose-500 hover:bg-rose-50">🗑</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ประวัติการส่ง */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">ประวัติการส่ง <span className="font-normal text-slate-400">(30 ครั้งล่าสุด)</span></div>
          {loading ? (
            <div className="h-16 animate-pulse rounded-b-xl bg-slate-50" />
          ) : runs.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">ยังไม่เคยส่ง — ประวัติจะขึ้นที่นี่เมื่อเริ่มส่งจริงในรอบ 2</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr><th className="px-4 py-2 font-medium">เวลา</th><th className="px-2 py-2 font-medium">รายงาน</th><th className="px-2 py-2 font-medium">ส่งแบบ</th><th className="px-2 py-2 font-medium">ผล</th><th className="px-2 py-2 text-right font-medium">งาน</th><th className="px-4 py-2 text-right font-medium">ผู้รับ</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {runs.map((x) => (
                    <tr key={x.id}>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-600">{fmtDateTime(x.ran_at)}</td>
                      <td className="px-2 py-2 text-slate-800">{x.report_name ?? "—"}{x.error && <div className="text-xs text-rose-600">{x.error}</div>}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600">{RUN_TRIGGER_LABEL[x.trigger] ?? x.trigger}{x.actor_name ? ` · ${x.actor_name}` : ""}</td>
                      <td className="px-2 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${RUN_STATUS_LABEL[x.status]?.cls ?? ""}`}>{RUN_STATUS_LABEL[x.status]?.label ?? x.status}</span></td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-600">{x.item_count ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{x.sent_count ?? 0}/{x.recipient_count ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {!loading && <EmailSetupGuide ready={emailReady} />}
      </div>

      <ReportEditor open={editorOpen} editing={editing} onClose={() => setEditorOpen(false)}
        onSaved={(saved) => {
          setReports((list) => (list.some((x) => x.id === saved.id) ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved]));
          setEditorOpen(false);
          toast.success(editing ? "บันทึกการแก้ไขแล้ว" : "เพิ่มรายงานแล้ว");
        }} />

      <ConfirmDialog open={sendNowTarget !== null} onClose={() => setSendNowTarget(null)} onConfirm={() => { if (sendNowTarget) void send(sendNowTarget, "now"); }}
        loading={!!sending} title="ส่งรายงานนี้เดี๋ยวนี้?" confirmText="📤 ส่งเลย"
        message={<>ส่ง <b>{sendNowTarget?.name}</b> ถึงผู้รับทั้ง {sendNowTarget?.recipients.length ?? 0} คนทันที · ไม่กระทบรอบส่งตามเวลาของวันนี้</>} />

      <ConfirmDialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} onConfirm={() => void doDelete()} loading={deleting}
        variant="danger" title="ลบรายงานนี้?" confirmText="ลบรายงาน"
        message={<>รายงาน <b>{deleteTarget?.name}</b> จะหยุดส่งและหายจากรายการ · ประวัติการส่งที่ผ่านมายังเก็บไว้</>} />
    </PlaygroundShell>
  );
}
