"use client";

// ============================================================
// 🔔 รายงานและแจ้งเตือนอัตโนมัติ (ตั้งค่า) — ส่งอะไร ทางไหน (Gmail / Discord / ป๊อปตอนเข้า ERP) ถึงใคร วันไหน กี่โมง + ประวัติ + คู่มือ
// สวิตช์ช่องทาง 2 ชั้น: ทั้งระบบ (การ์ดบนสุด · erp_report_channels) + รายรายงาน (ป้ายในแถว) · 📄 คัดลอกรายงาน
// เปิดได้ 2 ทาง: เมนู ⚙️ Settings ใหญ่ · แท็บใน ⚙️ ตั้งค่าแอปจัดการงาน/ออกแบบ (ฝังกรอบ ?embed=1 — components/app-settings-panel)
// ของกลาง: ERPModal/ConfirmDialog · ป๊อปตั้งค่า ./report-editor · ข้อมูล/อีเมล lib/email-report · doc: docs/email-reports.md
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ConfirmDialog } from "@/components/modal";
import { usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import {
  describeDays, sourceLabel, normalizeReportChannels, reportChannelOn, REPORT_CHANNELS, RUN_STATUS_LABEL, RUN_TRIGGER_LABEL,
  type EmailReport, type EmailReportInput, type EmailReportRun, type ReportChannelKey, type ReportChannels,
} from "@/lib/email-report/shared";
import { ReportEditor, toInput } from "./report-editor";
import { EmailSetupGuide } from "./email-setup-guide";
import { DiscordSetupGuide } from "./discord-setup-guide";

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
const GROUP_TEXT: Record<string, string> = { all: "ทุกแบรนด์", customer: "งานลูกค้า", own: "แบรนด์เรา" };
type PopupAck = { report_id: string; action: "ack" | "later"; acked_at: string; name: string };
const nameList = (xs: PopupAck[]) => `${xs.slice(0, 4).map((a) => a.name).join(", ")}${xs.length > 4 ? ` +${xs.length - 4}` : ""}`;

export default function EmailReportsPage() {
  const canManage = usePermission("admin.email_reports");
  const toast = useToast();
  const [reports, setReports] = useState<EmailReport[]>([]);
  const [runs, setRuns] = useState<EmailReportRun[]>([]);
  const [acks, setAcks] = useState<PopupAck[]>([]);
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
  const [channels, setChannels] = useState<ReportChannels | null>(null);   // สวิตช์ทั้งระบบ
  const [discordReady, setDiscordReady] = useState(false);
  const [chanBusy, setChanBusy] = useState<ReportChannelKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/admin/email-reports");
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setReports(j.data as EmailReport[]); setRuns(j.runs as EmailReportRun[]); setAcks((j.popup_acks ?? []) as PopupAck[]); setEmailReady(!!j.email_ready);
      setEmailInfo({ provider: j.email_provider ?? null, sender: j.email_sender ?? null, scheduler: !!j.scheduler_active });
      setChannels(normalizeReportChannels(j.channels)); setDiscordReady(!!j.discord_ready);
    } catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canManage) void load(); }, [canManage, load]);

  const openEditor = (r: EmailReport | null) => { setEditing(r); setEditorOpen(true); };

  // แก้รายงานจากแถว (สวิตช์เปิดใช้ / ป้ายช่องทาง) = บันทึกทั้งชุดผ่าน PATCH (กฎตรวจเดียวกับฟอร์ม)
  const patchReport = async (r: EmailReport, change: Partial<EmailReportInput>, okMsg: string) => {
    setToggling(r.id);
    try {
      const res = await apiFetch(`/api/admin/email-reports/${r.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...toInput(r), ...change }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setReports((list) => list.map((x) => (x.id === r.id ? (j.data as EmailReport) : x)));
      toast.success(okMsg);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setToggling(null); }
  };
  const toggle = (r: EmailReport) => patchReport(r, { is_enabled: !r.is_enabled }, r.is_enabled ? `ปิดรายงาน "${r.name}" แล้ว` : `เปิดรายงาน "${r.name}" แล้ว`);

  // ป้ายช่องทางในแถว = เปิด/ปิดช่องนั้นเฉพาะรายงานนี้ · ยังไม่ได้ตั้งค่าที่จำเป็น (ผู้รับ/ห้อง) = เปิดหน้าแก้ไขให้ตั้งก่อน
  const toggleChannel = (r: EmailReport, k: ReportChannelKey) => {
    const on = !reportChannelOn(r, k);
    const label = REPORT_CHANNELS.find((c) => c.key === k)?.label ?? k;
    if (on && k === "email" && r.recipients.length === 0) { toast.warning("ใส่ผู้รับอีเมลก่อน แล้วติ๊ก Gmail ในหน้าแก้ไข"); openEditor(r); return; }
    if (on && k === "discord" && !r.discord.channel_id) { toast.warning("เลือกห้อง Discord ก่อน แล้วติ๊ก Discord ในหน้าแก้ไข"); openEditor(r); return; }
    const change: Partial<EmailReportInput> = k === "email" ? { email_enabled: on } : k === "discord" ? { discord: { ...r.discord, enabled: on } } : { popup: { ...r.popup, enabled: on } };
    void patchReport(r, change, `${on ? "เปิด" : "ปิด"} ${label} ของ "${r.name}" แล้ว`);
  };

  // 📄 คัดลอกรายงาน → สร้างใหม่แบบปิดไว้ก่อน แล้วเปิดหน้าแก้ไขให้ปรับ (เช่น ทำฉบับแยกแบรนด์)
  const copyReport = async (r: EmailReport) => {
    setToggling(r.id);
    try {
      const res = await apiFetch("/api/admin/email-reports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...toInput(r), name: `${r.name} (สำเนา)`.slice(0, 120), is_enabled: false }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "คัดลอกไม่สำเร็จ");
      const copy = j.data as EmailReport;
      setReports((list) => [...list, copy]);
      toast.success("คัดลอกแล้ว — ปิดไว้ก่อน ปรับแล้วค่อยเปิดใช้");
      openEditor(copy);
    } catch (e) { toast.error(e instanceof Error ? e.message : "คัดลอกไม่สำเร็จ"); }
    finally { setToggling(null); }
  };

  // 🔌 สวิตช์ช่องทางทั้งระบบ
  const setGlobal = async (k: ReportChannelKey, on: boolean) => {
    setChanBusy(k);
    try {
      const res = await apiFetch("/api/admin/email-reports/channels", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [k]: on }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setChannels(normalizeReportChannels(j.data));
      const label = REPORT_CHANNELS.find((c) => c.key === k)?.label ?? k;
      toast.success(on ? `เปิด ${label} ทั้งระบบแล้ว` : `ปิด ${label} ทั้งระบบแล้ว — ทุกรายงานหยุดใช้ช่องนี้`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setChanBusy(null); }
  };

  // ✉️ ส่งทดสอบถึงฉัน / 📤 ส่งเดี๋ยวนี้ (ทุกผู้รับ) — ผลลงประวัติการส่งเสมอ
  // 🔌 ลองเข้าสู่ระบบ Gmail จริงโดยไม่ส่งอีเมล — ตรวจว่ารหัสผ่านสำหรับแอปใช้ได้
  const [checking, setChecking] = useState(false);
  const checkConnection = async () => {
    setChecking(true);
    try {
      const j = await apiFetch("/api/admin/email-reports?check=1").then((r) => r.json());
      if (j.email_check?.ok) toast.success("เชื่อมต่อระบบส่งอีเมลได้ ✅ — กด ✉️ ทดสอบ เพื่อลองส่งจริงเข้าอีเมลของคุณ");
      else toast.error(j.email_check?.error || j.error || "เชื่อมต่อไม่สำเร็จ");
    } catch { toast.error("ตรวจการเชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setChecking(false); }
  };

  const send = async (r: EmailReport, mode: "test" | "now") => {
    setSending(`${r.id}:${mode}`);
    try {
      const res = await apiFetch(`/api/admin/email-reports/${r.id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
      const j = await res.json().catch(() => ({}));
      const msg: string = j.result?.message || j.error || "ส่งไม่สำเร็จ";
      if (res.ok && j.ok) toast.success(mode === "test" ? `ส่งทดสอบแล้ว — เช็กอีเมล${r.discord?.enabled ? " / DM ใน Discord" : ""}ของคุณ (${msg})` : msg);
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

  if (!canManage) return <PlaygroundShell><AccessDenied message="หน้านี้สำหรับผู้มีสิทธิ์ จัดการรายงานและแจ้งเตือนอัตโนมัติ (admin.email_reports)" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">🔔 รายงานและแจ้งเตือนอัตโนมัติ</h1>
            <p className="mt-0.5 text-sm text-slate-500">ตั้งว่ารายงานไหน ส่งทางไหน (Gmail / Discord / ป๊อปตอนเข้า ERP) ถึงใคร วันไหน กี่โมง — ระบบทำให้เองตามเวลา</p>
          </div>
          <button onClick={() => openEditor(null)} className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">＋ เพิ่มรายงาน</button>
        </div>

        {/* 🔌 ช่องทางทั้งระบบ — สถานะพร้อมใช้ + สวิตช์ (ปิด = ทุกรายงานหยุดใช้ช่องนั้น) */}
        {!loading && channels && (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-800">ช่องทางทั้งระบบ <span className="font-normal text-slate-500">— ปิดตรงนี้ = ทุกรายงานหยุดใช้ช่องนั้นทันที (ส่งทดสอบยังได้)</span></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {REPORT_CHANNELS.map((c) => {
                const on = channels[c.key];
                const used = reports.filter((r) => reportChannelOn(r, c.key)).length;
                const ackToday = new Set(acks.filter((a) => a.action === "ack").map((a) => a.name)).size;
                const status = c.key === "email"
                  ? (emailReady ? { ok: true, text: `พร้อมใช้ · ${emailInfo.provider === "gmail" ? "Gmail" : "Resend"}${emailInfo.sender ? ` ${emailInfo.sender}` : ""}` } : { ok: false, text: "ยังไม่ได้ตั้งระบบส่งอีเมล — ดูคู่มือด้านล่าง" })
                  : c.key === "discord"
                    ? (discordReady ? { ok: true, text: "บอทพร้อมใช้" } : { ok: false, text: "ยังไม่ได้ตั้งบอท — ดูคู่มือด้านล่าง" })
                    : { ok: true, text: `พร้อมใช้ · วันนี้รับทราบ ${ackToday} คน` };
                return (
                  <div key={c.key} className={`rounded-xl border p-3 ${on ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium ${on ? "text-slate-800" : "text-slate-400"}`}>{c.icon} {c.label}</span>
                      <button role="switch" aria-checked={on} aria-label={`${on ? "ปิด" : "เปิด"} ${c.label} ทั้งระบบ`} title={on ? "ปิดทั้งระบบ" : "เปิดทั้งระบบ"}
                        onClick={() => void setGlobal(c.key, !on)} disabled={chanBusy === c.key}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-emerald-500" : "bg-slate-300"} disabled:opacity-50`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
                      </button>
                    </div>
                    <div className={`mt-1 text-xs ${!on ? "text-slate-500" : status.ok ? "text-emerald-700" : "text-amber-700"}`}>
                      {!on ? "ปิดทั้งระบบอยู่ — ไม่ส่ง/ไม่เด้ง" : `${status.ok ? "✅" : "⚠️"} ${status.text}`}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">ใช้อยู่ {used} รายงาน</div>
                    {c.key === "email" && emailReady && on && (
                      <button type="button" onClick={() => void checkConnection()} disabled={checking}
                        className="mt-2 inline-flex h-7 items-center rounded-md border border-emerald-300 bg-white px-2 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
                        {checking ? "กำลังตรวจ..." : "🔌 ตรวจการเชื่อมต่อ"}</button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {emailInfo.scheduler
                ? "⏰ ตัวตั้งเวลาทำงานอยู่ — เช็กทุก 15 นาที ส่งตามวันและเวลาที่ตั้ง (ส่งได้ภายใน 2 ชม.หลังเวลาที่ตั้ง · วันละครั้ง)"
                : "⏰ ตัวตั้งเวลายังไม่ทำงาน — ส่งทดสอบ / ส่งเดี๋ยวนี้ ใช้ได้ แต่ยังไม่ส่งเองตามเวลา"}
            </div>
          </section>
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
                      {/* ป้ายช่องทาง: กด = เปิด/ปิดเฉพาะรายงานนี้ */}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {REPORT_CHANNELS.map((c) => {
                          const on = reportChannelOn(r, c.key);
                          const offAll = !!channels && !channels[c.key];
                          const detail = c.key === "email" ? (names.length ? `${names.length} คน` : "ยังไม่มีผู้รับ")
                            : c.key === "discord" ? (r.discord.channel_name ? `#${r.discord.channel_name}` : "ยังไม่เลือกห้อง")
                            : `${r.popup.from}–${r.popup.to} น.${r.popup.frequency === "every" ? " ทุกครั้ง" : ""}`;
                          const tip = c.key === "email" && names.length ? `ผู้รับ: ${names.join(", ")}` : "";
                          return (
                            <button key={c.key} type="button" onClick={() => toggleChannel(r, c.key)} disabled={toggling === r.id}
                              title={`${tip ? `${tip}\n` : ""}${on ? "กดเพื่อปิด" : "กดเพื่อเปิด"} ${c.label} เฉพาะรายงานนี้${offAll ? " (ตอนนี้ปิดทั้งระบบอยู่)" : ""}`}
                              className={`inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs transition disabled:opacity-50 ${
                                !on ? "border border-dashed border-slate-300 text-slate-400 hover:bg-slate-50"
                                : offAll ? "border border-slate-200 bg-slate-100 text-slate-500"
                                : "border border-emerald-200 bg-emerald-50 font-medium text-emerald-800 hover:bg-emerald-100"}`}>
                              {on ? "✓" : "＋"} {c.icon} {c.label}{on && <span className="font-normal opacity-80">· {detail}</span>}
                              {on && offAll && <span className="font-normal text-amber-700">(ปิดทั้งระบบ)</span>}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        ส่งล่าสุด: {lastRun ? <>{fmtDateTime(lastRun.ran_at)} <span className={`rounded px-1.5 py-0.5 text-[10px] ${RUN_STATUS_LABEL[lastRun.status]?.cls ?? ""}`}>{RUN_STATUS_LABEL[lastRun.status]?.label ?? lastRun.status}</span></> : "ยังไม่เคยส่ง"}
                        {r.popup?.enabled && (() => {
                          const mine = acks.filter((a) => a.report_id === r.id);
                          const ok = mine.filter((a) => a.action === "ack"); const later = mine.filter((a) => a.action === "later");
                          return (
                            <>
                              {" · "}🔔 ป๊อปวันนี้: {ok.length ? <span title={ok.map((a) => a.name).join(", ")}>รับทราบ {ok.length} คน ({nameList(ok)})</span> : "ยังไม่มีใครรับทราบ"}
                              {later.length > 0 && <span title={later.map((a) => a.name).join(", ")}> · ไว้ทีหลัง {later.length} คน ({nameList(later)})</span>}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button role="switch" aria-checked={r.is_enabled} aria-label={r.is_enabled ? "ปิดรายงานนี้" : "เปิดรายงานนี้"} title={r.is_enabled ? "ปิดรายงานนี้ (หยุดส่งตามเวลา + หยุดเด้งป๊อป)" : "เปิดใช้รายงานนี้"}
                        onClick={() => void toggle(r)} disabled={toggling === r.id}
                        className={`relative h-6 w-11 rounded-full transition ${r.is_enabled ? "bg-emerald-500" : "bg-slate-300"} disabled:opacity-50`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${r.is_enabled ? "left-[22px]" : "left-0.5"}`} />
                      </button>
                      <button onClick={() => void send(r, "test")} disabled={!!sending} title={`ส่งเข้าอีเมลของคุณคนเดียว (หัวเรื่องขึ้นต้น [ทดสอบ])${r.discord?.enabled ? " + DM ใน Discord ของคุณ (ต้องผูกบัญชี)" : ""}`}
                        className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                        {sending === `${r.id}:test` ? "กำลังส่ง..." : "✉️ ทดสอบ"}</button>
                      {(() => {
                        const canSend = (r.email_enabled !== false && r.recipients.length > 0) || r.discord?.enabled;
                        return (
                          <button onClick={() => setSendNowTarget(r)} disabled={!!sending || !canSend} title={canSend ? "ส่งถึงผู้รับทุกคน (และห้อง Discord) เดี๋ยวนี้" : "ยังไม่ได้เปิด Gmail (มีผู้รับ) หรือ Discord"}
                            className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                            {sending === `${r.id}:now` ? "กำลังส่ง..." : "📤 ส่งเดี๋ยวนี้"}</button>
                        );
                      })()}
                      <button onClick={() => openEditor(r)} className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">✏️ แก้ไข / ดูตัวอย่าง</button>
                      <button onClick={() => void copyReport(r)} disabled={toggling === r.id} title="คัดลอกเป็นรายงานใหม่ (ปิดไว้ก่อน) เช่น ทำฉบับแยกแบรนด์"
                        className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">📄 คัดลอก</button>
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
        {!loading && <DiscordSetupGuide />}
      </div>

      <ReportEditor open={editorOpen} editing={editing} channels={channels} onClose={() => setEditorOpen(false)}
        onSaved={(saved) => {
          setReports((list) => (list.some((x) => x.id === saved.id) ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved]));
          setEditorOpen(false);
          toast.success(editing ? "บันทึกการแก้ไขแล้ว" : "เพิ่มรายงานแล้ว");
        }} />

      <ConfirmDialog open={sendNowTarget !== null} onClose={() => setSendNowTarget(null)} onConfirm={() => { if (sendNowTarget) void send(sendNowTarget, "now"); }}
        loading={!!sending} title="ส่งรายงานนี้เดี๋ยวนี้?" confirmText="📤 ส่งเลย"
        message={(() => {
          const t = sendNowTarget;
          const viaEmail = !!t && t.email_enabled !== false && t.recipients.length > 0 && channels?.email !== false;
          const viaDiscord = !!t?.discord?.enabled && channels?.discord !== false;
          return <>ส่ง <b>{t?.name}</b>{viaEmail ? <> ถึงผู้รับอีเมล {t?.recipients.length} คน</> : null}{viaEmail && viaDiscord ? " และ" : ""}{viaDiscord ? <> เข้าห้อง Discord <b>#{t?.discord.channel_name ?? ""}</b></> : null}{!viaEmail && !viaDiscord ? " — ช่องทางที่รายงานนี้ใช้ถูกปิดทั้งระบบอยู่ จะไม่ได้ส่ง" : " ทันที"} · ไม่กระทบรอบส่งตามเวลาของวันนี้</>;
        })()} />

      <ConfirmDialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} onConfirm={() => void doDelete()} loading={deleting}
        variant="danger" title="ลบรายงานนี้?" confirmText="ลบรายงาน"
        message={<>รายงาน <b>{deleteTarget?.name}</b> จะหยุดส่งและหายจากรายการ · ประวัติการส่งที่ผ่านมายังเก็บไว้</>} />
    </PlaygroundShell>
  );
}
