"use client";

/**
 * ป๊อป "แก้การแจ้งเตือน" ของแท็บแจ้งเตือนในแผนผัง (/master/flow-map) — กดแถว ✎ / ปุ่มแก้ไขในแผงรายละเอียด
 *
 * แก้ได้ตามชนิดปลายทาง (ใช้ API เดิมทั้งหมด ไม่มีตารางใหม่ · ทุกการแก้ลงประวัติที่ API ปลายทาง):
 *   🔔 กระดิ่งที่ส่งตามกฎ (rule)   → คนรับ (ตำแหน่ง / รายคน) + เปิด/ปิด   — /api/admin/notification-rules (erp_notification_rules)
 *   🔔 กระดิ่งถึง "คนที่เกี่ยวข้อง" → ล็อก (ส่งตามเอกสาร เปลี่ยนคนรับไม่ได้)
 *   💬 LINE กลุ่ม                  → สวิตช์เปิด/ปิด + ตั้งกลุ่มให้ช่องที่ยังไม่ตั้ง (กลุ่มล่าสุดที่บอทเห็น) — /api/admin/line-console (ค่าเดียวกับศูนย์ LINE)
 *   ⏰ รายงานตามเวลา               → เปิด/ปิด · เวลา · วัน · ช่องทาง — /api/admin/email-reports/:id (ส่งทั้งชุด emailReportToInput)
 *   ทางอื่น (LINE ส่วนตัว / LINE OA / อีเมลร้าน …) → โชว์สถานะ + สิ่งที่ต้องทำ (ตั้งที่หน้าของมัน)
 *   📝 หมายเหตุ (ทุกเรื่อง)        → โชว์ใต้ป้ายแจ้งเตือนในแผงกล่อง + แผงรายละเอียด — /api/flow-map/notify/remarks (ว่าง = ไม่โชว์)
 * สิทธิ์: เปิดได้เฉพาะ canAdmin (admin.users) · API แต่ละตัวตรวจสิทธิ์ของตัวเองซ้ำ
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { ToggleSwitch } from "@/components/toggle-switch";
import { UserPicker } from "@/components/pickers";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { DAY_LABELS, emailReportToInput, type EmailReport, type EmailReportInput } from "@/lib/email-report/shared";
import {
  NOTIFY_CHANNELS, NOTIFY_REMARK_MAX, NOTIFY_STATES, notifyBellSwitchable, notifyChannelOf, notifyGroupLabel, notifyRemark, notifyTopicCells,
  type NotifyGroup, type NotifyLive, type NotifyTarget, type NotifyTopic,
} from "@/lib/flow-map-notify";

type Recipient = { type: string; value?: string };
type Rule = {
  id: string; event_type: string; name: string; description: string | null; recipients: Recipient[];
  title_template: string; body_template: string | null; link_pattern: string | null; priority: string;
  exclude_actor: boolean; active: boolean; sort_order: number; notes: string | null;
};
type RuleDraft = { rule: Rule; recipients: Recipient[]; active: boolean; names: Record<string, string> };
type LineData = { groups: Record<string, string>; disabled_events: Record<string, boolean>; captured: string };
type ReportDraft = { is_enabled: boolean; send_time: string; days: number[]; email: boolean; popup: boolean; line: boolean; discord: boolean };

const OTHER_WORD: Record<string, string> = { approvers: "ผู้อนุมัติของเอกสาร", requester: "ผู้ขอของเอกสาร", mentioned: "คนที่ถูกแท็ก" };

/**
 * สวิตช์เปิด/ปิดทั้งเรื่องแบบด่วน (แผงกระดิ่งบนกล่อง components/flow-map/node-notify) — เขียนที่เดียวกับป๊อปนี้:
 *   กฎกระดิ่ง → /api/admin/notification-rules (อ่านกฎเต็มก่อน แล้วส่งกลับทั้งก้อนพร้อม active ใหม่ · API เป็น upsert)
 *   สวิตช์ LINE → /api/admin/line-console { event, enabled }
 * rules/events มาจาก notifyTopicSwitch() · คืนรายการที่ล้ม (ว่าง = สำเร็จหมด) · ทุก API ลงประวัติเอง
 */
export async function saveNotifyTopicSwitch(rules: string[], events: string[], enabled: boolean, actor: string | null, bells: string[] = []): Promise<string[]> {
  const fails: string[] = [];
  const send = async (label: string, url: string, method: string, body: unknown) => {
    try {
      const r = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) fails.push(`${label}: ${j?.error ?? "บันทึกไม่สำเร็จ"}`);
    } catch { fails.push(`${label}: บันทึกไม่สำเร็จ`); }
  };
  for (const k of rules) {
    try {
      const j = await apiFetch(`/api/admin/notification-rules?event_type=${encodeURIComponent(k)}`).then((r) => r.json());
      const rule = ((j?.data ?? []) as Rule[])[0];
      if (!rule) { fails.push(`กระดิ่ง: ไม่พบกฎ “${k}”`); continue; }
      if (rule.active === enabled) continue;
      await send(`กระดิ่ง (${rule.name})`, "/api/admin/notification-rules", "PATCH", { ...rule, active: enabled, actor });
    } catch { fails.push("กระดิ่ง: อ่านกฎเดิมไม่สำเร็จ"); }
  }
  for (const ev of events) await send("สวิตช์ LINE", "/api/admin/line-console", "POST", { event: ev, enabled });
  // กระดิ่งที่โค้ดส่งตรง (ไม่มีกฎ) → สวิตช์ก้อนเดียว lib/bell-switch
  if (bells.length) await send("กระดิ่งในแอป", "/api/admin/bell-switches", "POST", { events: bells, enabled });
  return fails;
}
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const box = "rounded-lg border border-slate-200 bg-white px-3 py-2.5";

export function NotifyEditModal({ topic, live, open, onClose, onSaved, onOpenLine }: {
  topic: NotifyTopic | null; live: NotifyLive | null; open: boolean;
  onClose: () => void; onSaved: () => void; onOpenLine: () => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const reportId = topic?.id.startsWith("report:") ? topic.id.slice(7) : null;
  // ผูกกับ id ของเรื่อง (ไม่ใช่ตัว object) — แถวรายงานถูกสร้างใหม่ทุกครั้งที่หน้าวาดใหม่ ไม่งั้นโหลดซ้ำ/ร่างหายเอง
  const topicId = topic?.id ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ruleKeys = useMemo(() => [...new Set((topic?.send ?? []).flatMap((s) => (s.kind === "bell" && s.rule ? [s.rule] : [])))], [topicId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lineTargets = useMemo(() => (topic?.send ?? []).filter((s): s is Extract<NotifyTarget, { kind: "group" }> => s.kind === "group"), [topicId]);

  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [roles, setRoles] = useState<{ key: string; label: string }[]>([]);
  const [rules, setRules] = useState<Record<string, RuleDraft | null>>({});   // null = ยังไม่มีกฎของเรื่องนี้
  const [lineData, setLineData] = useState<LineData | null>(null);
  const [lineOff, setLineOff] = useState<Record<string, boolean>>({});          // event → ปิด (ร่าง)
  const [assign, setAssign] = useState<Set<string>>(new Set());                 // slot ที่จะตั้งเป็นกลุ่มล่าสุดที่บอทเห็น
  const [report, setReport] = useState<EmailReport | null>(null);
  const [rep, setRep] = useState<ReportDraft | null>(null);
  const [remark, setRemark] = useState("");   // หมายเหตุ (ร่าง)
  const remark0 = topic ? notifyRemark(topic, live) : "";
  // กระดิ่งที่โค้ดส่งตรง (ไม่มีกฎ) — สวิตช์ lib/bell-switch ต่อ event ของเรื่อง · เปิด = มีอย่างน้อย 1 event ไม่ได้ปิด
  const bellSw = !!topic && notifyBellSwitchable(topic);
  const bellOn0 = bellSw && !!topic && (topic.events ?? []).some((e) => !live?.bellOff?.[e]);
  const [bellOn, setBellOn] = useState(bellOn0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // โหลดค่าปัจจุบันของทุกส่วนที่เรื่องนี้ใช้
  useEffect(() => {
    if (!open || !topic) return;
    let alive = true;
    setLoading(true); setLoadErr(null); setErr(null); setAssign(new Set()); setRemark(notifyRemark(topic, live)); setBellOn(bellOn0);
    const jobs: Promise<void>[] = [];
    if (ruleKeys.length) {
      jobs.push(apiFetch("/api/admin/roles").then((r) => r.json()).then((j) => {
        const list = ((j?.roles ?? []) as { key: string; label: string; active?: boolean }[]).filter((x) => x.active !== false);
        if (alive) setRoles(list.length ? list : [{ key: "admin", label: "แอดมิน" }, { key: "manager", label: "ผู้จัดการ" }, { key: "staff", label: "พนักงาน" }]);
      }).catch(() => { if (alive) setRoles([{ key: "admin", label: "แอดมิน" }, { key: "manager", label: "ผู้จัดการ" }, { key: "staff", label: "พนักงาน" }]); }));
      jobs.push(Promise.all(ruleKeys.map(async (k) => {
        const j = await apiFetch(`/api/admin/notification-rules?event_type=${encodeURIComponent(k)}`).then((r) => r.json());
        if (j?.error) throw new Error(String(j.error));
        const rule = ((j?.data ?? []) as Rule[])[0];
        return [k, rule ? { rule, recipients: [...(rule.recipients ?? [])], active: rule.active, names: {} } : null] as const;
      })).then(async (pairs) => {
        // ชื่อคนรับรายคน (โชว์ในชิป)
        const ids = [...new Set(pairs.flatMap(([, d]) => (d?.recipients ?? []).filter((x) => x.type === "user" && x.value).map((x) => String(x.value))))];
        let names: Record<string, string> = {};
        if (ids.length) {
          const j = await apiFetch(`/api/creative-users?ids=${ids.map(encodeURIComponent).join(",")}`).then((r) => r.json()).catch(() => null);
          names = Object.fromEntries((((j?.data ?? []) as { id: string; name?: string; display_name?: string }[])).map((u) => [u.id, u.name || u.display_name || "ผู้ใช้"]));
        }
        if (alive) setRules(Object.fromEntries(pairs.map(([k, d]) => [k, d ? { ...d, names } : null])));
      }));
    } else setRules({});
    if (lineTargets.length) {
      jobs.push(apiFetch("/api/admin/line-console").then((r) => r.json()).then((j) => {
        if (j?.error) throw new Error(String(j.error));
        const d: LineData = { groups: j.groups ?? {}, disabled_events: j.disabled_events ?? {}, captured: String(j.captured ?? "") };
        if (alive) { setLineData(d); setLineOff({ ...d.disabled_events }); }
      }));
    } else setLineData(null);
    if (reportId) {
      jobs.push(apiFetch("/api/admin/email-reports").then((r) => r.json()).then((j) => {
        if (j?.error) throw new Error(String(j.error));
        const r = ((j?.data ?? []) as EmailReport[]).find((x) => x.id === reportId) ?? null;
        if (!r) throw new Error("ไม่พบรายงานนี้ (อาจถูกลบไปแล้ว)");
        if (alive) {
          setReport(r);
          setRep({ is_enabled: r.is_enabled, send_time: r.send_time, days: [...r.days], email: r.email_enabled !== false, popup: !!r.popup?.enabled, line: !!r.line?.enabled, discord: !!r.discord?.enabled });
        }
      }));
    } else { setReport(null); setRep(null); }
    Promise.all(jobs).catch((e) => { if (alive) setLoadErr(e instanceof Error ? e.message : "โหลดค่าปัจจุบันไม่สำเร็จ"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, topicId]);

  if (!topic) return null;
  const cells = live ? notifyTopicCells(topic, live) : [];

  // ---- ร่างที่เปลี่ยน ----
  const dirtyRules = Object.entries(rules).filter(([, d]) => d && (d.active !== d.rule.active || !sameJson(d.recipients, d.rule.recipients)));
  const lineEvents = [...new Set(lineTargets.flatMap((t) => (t.event && !t.manual ? [t.event] : [])))];
  const dirtyEvents = lineData ? lineEvents.filter((ev) => !!lineOff[ev] !== !!lineData.disabled_events[ev]) : [];
  const repDirty = !!(report && rep && (rep.is_enabled !== report.is_enabled || rep.send_time !== report.send_time || !sameJson([...rep.days].sort(), [...report.days].sort())
    || rep.email !== (report.email_enabled !== false) || rep.popup !== !!report.popup?.enabled || rep.line !== !!report.line?.enabled || rep.discord !== !!report.discord?.enabled));
  const remarkDirty = remark.trim() !== remark0.trim();
  const bellDirty = bellSw && bellOn !== bellOn0;
  const dirty = dirtyRules.length > 0 || dirtyEvents.length > 0 || assign.size > 0 || repDirty || remarkDirty || bellDirty;

  const setRule = (k: string, patch: Partial<RuleDraft>) => setRules((s) => (s[k] ? { ...s, [k]: { ...s[k]!, ...patch } } : s));

  const save = async () => {
    // ตรวจก่อน: กฎที่เปิดอยู่ต้องมีคนรับอย่างน้อย 1
    for (const [, d] of dirtyRules) if (d!.active && !d!.recipients.length) { setErr(`“${d!.rule.name}” ยังไม่มีคนรับ — เพิ่มอย่างน้อย 1 หรือปิดกฎ`); return; }
    if (rep && repDirty && rep.is_enabled && !rep.days.length) { setErr("เลือกวันที่ส่งรายงานอย่างน้อย 1 วัน"); return; }
    if (remark.trim().length > NOTIFY_REMARK_MAX) { setErr(`หมายเหตุยาวเกิน ${NOTIFY_REMARK_MAX} ตัวอักษร`); return; }
    setSaving(true); setErr(null);
    const fails: string[] = [];
    const call = async (label: string, url: string, method: string, body: unknown) => {
      try {
        const r = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j?.error) fails.push(`${label}: ${j?.error ?? "บันทึกไม่สำเร็จ"}`);
      } catch { fails.push(`${label}: บันทึกไม่สำเร็จ`); }
    };
    for (const [, d] of dirtyRules) {
      const r = d!.rule;
      await call(`กระดิ่ง (${r.name})`, "/api/admin/notification-rules", "PATCH", { ...r, recipients: d!.recipients, active: d!.active, actor: user?.email ?? null });
    }
    for (const ev of dirtyEvents) await call("สวิตช์ LINE", "/api/admin/line-console", "POST", { event: ev, enabled: !lineOff[ev] });
    for (const slot of assign) await call(`กลุ่ม LINE (${notifyGroupLabel(slot as NotifyGroup)})`, "/api/admin/line-console", "POST", { slot, group_id: lineData?.captured });
    if (remarkDirty) await call("หมายเหตุ", "/api/flow-map/notify/remarks", "PATCH", { id: topic.id, text: remark.trim() });
    if (bellDirty) await call("กระดิ่งในแอป", "/api/admin/bell-switches", "POST", { events: topic.events ?? [], enabled: bellOn });
    if (report && rep && repDirty) {
      const change: Partial<EmailReportInput> = {
        is_enabled: rep.is_enabled, send_time: rep.send_time, days: [...rep.days].sort((a, b) => a - b), email_enabled: rep.email,
        popup: { ...report.popup, enabled: rep.popup }, line: { ...report.line, enabled: rep.line }, discord: { ...report.discord, enabled: rep.discord },
      };
      await call("รายงาน", `/api/admin/email-reports/${report.id}`, "PATCH", { ...emailReportToInput(report), ...change });
    }
    setSaving(false);
    if (fails.length) { setErr(fails.join(" · ")); onSaved(); return; }
    toast.success("บันทึกการแจ้งเตือนแล้ว");
    onSaved();
    onClose();
  };

  // ---- ส่วนย่อย ----
  const bellBlock = (s: Extract<NotifyTarget, { kind: "bell" }>, i: number) => {
    if (!s.rule) {
      return (
        <div key={i} className={box}>
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800">
            <Icon value="🔔" />กระดิ่ง ERP
            {bellSw && <span className="ml-auto"><ToggleSwitch size="sm" on={bellOn} onChange={setBellOn} label={bellOn ? "เปิด" : "ปิด"} /></span>}
          </div>
          <div className="mt-1 flex gap-1.5 text-[12.5px] text-slate-600"><Icon value="i:lock" size={13} className="mt-0.5 shrink-0 text-slate-400" />
            ส่งถึง “{s.to}” ของเรื่องนั้น — เปลี่ยนคนรับไม่ได้ (ตามเอกสาร){bellSw ? " · ปิดได้ทั้งเรื่อง" : " · เรื่องนี้ปิดไม่ได้"}</div>
        </div>
      );
    }
    const d = rules[s.rule];
    if (d === undefined) return <div key={i} className={`${box} text-[12.5px] text-slate-400`}>กำลังโหลดกฎกระดิ่ง…</div>;
    if (d === null) {
      return (
        <div key={i} className={`${box} text-[12.5px] text-amber-800`}>
          <div className="flex items-center gap-1.5 text-[13px] font-medium"><Icon value="🔔" />กระดิ่ง ERP</div>
          ยังไม่มีกฎ “{s.rule}” — เพิ่มที่หน้าตั้งกฎแจ้งเตือน (/admin/notification-rules)
        </div>
      );
    }
    const roleLabel = (k?: string) => roles.find((r) => r.key === k)?.label ?? k ?? "";
    const removeAt = (idx: number) => setRule(s.rule!, { recipients: d.recipients.filter((_, j) => j !== idx) });
    const add = (x: Recipient) => { if (!d.recipients.some((y) => y.type === x.type && y.value === x.value)) setRule(s.rule!, { recipients: [...d.recipients, x] }); };
    return (
      <div key={i} className={box}>
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800">
          <Icon value="🔔" />กระดิ่ง ERP
          <span className="ml-auto"><ToggleSwitch size="sm" on={d.active} onChange={(v) => setRule(s.rule!, { active: v })} label={d.active ? "เปิด" : "ปิด"} /></span>
        </div>
        <div className="mt-2 text-[11.5px] text-slate-500">ส่งถึง</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {d.recipients.map((x, idx) => {
            const fixed = x.type !== "role" && x.type !== "user";
            return (
              <span key={`${x.type}:${x.value ?? idx}`} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[12px] text-slate-700">
                <Icon value={x.type === "user" ? "i:user" : "i:users"} size={12} />
                {x.type === "role" ? `ตำแหน่ง: ${roleLabel(x.value)}` : x.type === "user" ? (d.names[String(x.value)] ?? "ผู้ใช้") : OTHER_WORD[x.type] ?? x.type}
                {!fixed && <button type="button" onClick={() => removeAt(idx)} aria-label="เอาออก" className="ml-0.5 text-slate-400 hover:text-red-600"><Icon value="i:x" size={12} /></button>}
              </span>
            );
          })}
          {!d.recipients.length && <span className="text-[12px] text-red-600">ยังไม่มีคนรับ</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value="" onChange={(e) => { if (e.target.value) add({ type: "role", value: e.target.value }); }} aria-label="เพิ่มตำแหน่ง"
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12.5px]">
            <option value="">＋ เพิ่มตำแหน่ง</option>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <div className="min-w-[200px] flex-1">
            <UserPicker value={null} placeholder="＋ เพิ่มรายคน…"
              onChange={(u) => { if (u) { setRule(s.rule!, { names: { ...d.names, [u.id]: u.name } }); add({ type: "user", value: u.id }); } }} />
          </div>
        </div>
        {topic.id === "cashflow_low_cash" && <div className="mt-1.5 text-[11.5px] text-amber-700">เรื่องเงิน — เพิ่มเฉพาะคนที่ควรเห็นตัวเลขเงินของบริษัท</div>}
      </div>
    );
  };

  const lineBlock = (s: Extract<NotifyTarget, { kind: "group" }>, i: number) => {
    const hasSwitch = !!s.event && !s.manual;
    const off = hasSwitch ? !!lineOff[s.event!] : false;
    return (
      <div key={i} className={box}>
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800">
          <Icon value="💬" />LINE กลุ่ม · {s.to}
          {hasSwitch && lineData && <span className="ml-auto"><ToggleSwitch size="sm" on={!off} onChange={(v) => setLineOff((m) => ({ ...m, [s.event!]: !v }))} label={off ? "ปิด" : "เปิด"} /></span>}
        </div>
        {!hasSwitch && <div className="mt-1 text-[11.5px] text-slate-500">{s.manual ? "คนกดส่งเองจากหน้าของมัน — ไม่มีสวิตช์เปิด/ปิด" : "เรื่องนี้ไม่มีสวิตช์เปิด/ปิด (ส่งทุกครั้ง)"}</div>}
        <div className="mt-2 space-y-1">
          {s.groups.map((g, gi) => {
            const isMain = g === "main";
            const set = isMain ? !!live?.line.main : !!lineData?.groups[g];
            const willSet = assign.has(g);
            return (
              <div key={g} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="text-slate-400 w-4 text-right">{gi + 1}.</span>
                <span className="text-slate-700">{notifyGroupLabel(g)}</span>
                <span className={set || willSet ? "text-emerald-700" : "text-amber-700"}>{set ? "ตั้งแล้ว" : willSet ? "จะตั้งเป็นกลุ่มล่าสุดที่บอทเห็น" : "ยังไม่ตั้ง"}</span>
                {!isMain && !set && lineData?.captured && (
                  <button type="button" onClick={() => setAssign((a) => { const n = new Set(a); if (n.has(g)) n.delete(g); else n.add(g); return n; })}
                    className="h-7 rounded-md border border-slate-200 px-2 text-[11.5px] text-slate-600 hover:bg-slate-50">
                    {willSet ? "ไม่ตั้ง" : "ใช้กลุ่มล่าสุดที่บอทเห็น"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {s.groups.length > 1 && <div className="mt-1 text-[11px] text-slate-400">ส่งเข้ากลุ่มแรกที่ตั้งไว้ตามลำดับ · กลุ่มเดียวกันใช้กับหลายเรื่อง — เปลี่ยนกลุ่ม = ทุกเรื่องที่ใช้ช่องนี้เปลี่ยนตาม</div>}
        <button type="button" onClick={onOpenLine} className="mt-2 inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11.5px] text-slate-600 hover:bg-slate-50">
          <Icon value="💬" size={12} />เปิดศูนย์ LINE (เปลี่ยนกลุ่ม / ส่งทดสอบ)
        </button>
      </div>
    );
  };

  const reportBlock = () => {
    if (!report || !rep) return <div className={`${box} text-[12.5px] text-slate-400`}>กำลังโหลดรายงาน…</div>;
    const set = (p: Partial<ReportDraft>) => setRep({ ...rep, ...p });
    return (
      <div className="space-y-2">
        <div className={box}>
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800">
            <Icon value="i:clock" size={14} />ส่งเมื่อไร
            <span className="ml-auto"><ToggleSwitch size="sm" on={rep.is_enabled} onChange={(v) => set({ is_enabled: v })} label={rep.is_enabled ? "เปิดรายงาน" : "ปิดรายงาน"} /></span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input type="time" value={rep.send_time.slice(0, 5)} onChange={(e) => set({ send_time: e.target.value })} aria-label="เวลาส่ง"
              className="h-8 w-28 rounded-lg border border-slate-200 px-2 text-[12.5px]" />
            {DAY_LABELS.map((d) => {
              const on = rep.days.includes(d.n);
              return (
                <button key={d.n} type="button" onClick={() => set({ days: on ? rep.days.filter((x) => x !== d.n) : [...rep.days, d.n] })} aria-pressed={on} title={d.full}
                  className={`h-8 min-w-[2.25rem] rounded-lg border px-2 text-[12px] ${on ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-500"}`}>{d.short}</button>
              );
            })}
          </div>
        </div>
        <div className={box}>
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800"><Icon value="i:send" size={14} />ช่องทาง</div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            <ToggleSwitch size="sm" on={rep.email} onChange={(v) => set({ email: v })} label="อีเมล" />
            <ToggleSwitch size="sm" on={rep.popup} onChange={(v) => set({ popup: v })} label="ป๊อปอัป ERP" />
            <ToggleSwitch size="sm" on={rep.line} onChange={(v) => set({ line: v })} label="LINE" />
            <ToggleSwitch size="sm" on={rep.discord} onChange={(v) => set({ discord: v })} label="Discord" />
          </div>
          <div className="mt-1.5 text-[11.5px] text-slate-500">คนรับ · กลุ่ม LINE · ห้อง Discord · หน้าตารายงาน แก้ต่อที่ <a href="/admin/email-reports" className="text-indigo-600 hover:underline">หน้ารายงานอีเมล ↗</a></div>
        </div>
      </div>
    );
  };

  const infoBlock = (s: NotifyTarget, i: number) => {
    const c = cells[i];
    const ch = notifyChannelOf(s);
    const name = s.kind === "popup" ? "ป๊อปอัป ERP" : s.kind === "dm" ? "LINE ส่วนตัว" : s.kind === "oa" ? "LINE OA" : s.kind === "email" ? "อีเมล" : "Discord";
    return (
      <div key={i} className={`rounded-lg border px-3 py-2 ${c ? NOTIFY_STATES[c.state].chip : "border-slate-200"}`}>
        <div className="flex items-center gap-1.5 text-[13px] font-medium"><Icon value={NOTIFY_CHANNELS[ch].icon} />{name}
          {c && <span className="ml-auto text-[11px] font-normal">{NOTIFY_STATES[c.state].label}</span>}</div>
        <div className="mt-0.5 text-[12.5px]">{c?.text ?? s.to}</div>
        {c?.fix && c.state !== "ok" && <div className="mt-0.5 text-[11.5px]">ต้องทำ: {c.fix}</div>}
        <div className="mt-0.5 text-[11px] opacity-70">ทางนี้ตั้งค่าที่หน้าของมัน — แก้จากที่นี่ไม่ได้</div>
      </div>
    );
  };

  return (
    <ERPModal open={open} onClose={onClose} title={`แก้การแจ้งเตือน — ${topic.label}`} size="md" storageKey="flow-notify-edit"
      loading={saving} hasUnsavedChanges={dirty && !saving} defaultExpanded={false}
      footer={<>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
        <button type="button" onClick={() => void save()} disabled={!dirty || saving || loading}
          className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
      </>}>
      <div className="space-y-2 text-[13px]">
        <div className="text-[12px] text-slate-500">{topic.when}</div>
        {loadErr && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{loadErr}</div>}
        {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{err}</div>}
        <div className={box}>
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800"><Icon value="i:notes" size={14} />หมายเหตุ</div>
          <textarea value={remark} onChange={(e) => { setRemark(e.target.value); setErr(null); }} maxLength={NOTIFY_REMARK_MAX} rows={2}
            placeholder="เช่น ผู้ตรวจ = หัวหน้าทีมครีเอทีฟ · ถ้าลาให้เปลี่ยนเป็นคุณบี"
            className="mt-1.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] leading-relaxed outline-none focus:border-indigo-300" />
          <div className="mt-0.5 flex text-[11px] text-slate-400">
            <span className="flex-1">โชว์ใต้ป้ายแจ้งเตือนในแผนผัง · ว่าง = ไม่โชว์ · ไม่ส่งไปกับแจ้งเตือน · ทุกคนที่เปิดแผนผังเห็น (ห้ามใส่ตัวเลขเงิน/รหัส)</span>
            <span className="tabular-nums">{remark.trim().length}/{NOTIFY_REMARK_MAX}</span>
          </div>
        </div>
        {reportId && reportBlock()}
        {topic.send.map((s, i) => (
          s.kind === "bell" ? bellBlock(s, i)
            : s.kind === "group" ? lineBlock(s, i)
            : reportId ? null   // รายงาน: ช่องทางแก้ในกล่อง "ช่องทาง" ด้านบนแล้ว
            : infoBlock(s, i)
        ))}
        {loading && <div className="text-[12px] text-slate-400">กำลังโหลดค่าปัจจุบัน…</div>}
        <div className="pt-1 text-[11px] text-slate-400">ทุกการแก้บันทึกประวัติ (ใครแก้ · ก่อน/หลัง) · ค่าเดียวกับหน้าตั้งกฎแจ้งเตือน / ศูนย์ LINE / หน้ารายงานอีเมล</div>
      </div>
    </ERPModal>
  );
}
