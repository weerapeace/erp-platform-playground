"use client";

/**
 * แผงกระดิ่งบนกล่อง — กดกระดิ่งบนกล่องในแผนผัง (/master/flow-map) → แผงขวา "กล่องนี้แจ้งเตือนอะไรบ้าง" โดยผังยังอยู่ (ไม่สลับแท็บ)
 * เจ้าของเลือกแบบ A (2026-11-10) จาก widget: ทุกเรื่องของกล่องในที่เดียว + จัดการได้ทันที
 *
 * แต่ละเรื่อง: เปิด/ปิดทั้งเรื่อง · ส่งทางไหน ถึงใคร (ถึงจริงไหม) · ตัวเลข 7 วัน · ตัวอย่างข้อความ · หมายเหตุ · ทดสอบส่ง
 *   เปิด/ปิด     → saveNotifyTopicSwitch (notify-edit) = กฎกระดิ่ง + สวิตช์ศูนย์ LINE ที่เดิม (ไม่มีที่เก็บใหม่)
 *   แก้คนรับ ฯลฯ → ป๊อปแก้การแจ้งเตือนเดิม (NotifyEditModal ผ่าน onEdit)
 *   ทดสอบกระดิ่ง → /api/flow-map/notify/test (ส่งถึงคนกดคนเดียว) · ทดสอบ LINE → /api/admin/line-console { slot, test } (กินโควตา → ถามก่อน)
 *   ข้อเสนอ "ควรมี" (NOTIFY_NODE_SUGGEST) → ใส่ตะกร้าขอให้ทำของแผนผัง (useFlowBasket)
 * ทะเบียน/ข้อความตัวอย่าง: lib/flow-map-notify.ts · จัดการได้เฉพาะ canAdmin (admin.users) · คนอื่นดูอย่างเดียว
 */
import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { ToggleSwitch } from "@/components/toggle-switch";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { askConfirm } from "@/components/modal/ask-dialog";
import { FLOW_NODES } from "@/lib/flow-map";
import { LINE_SLOTS } from "@/lib/line-registry";
import {
  NOTIFY_CHANNELS, NOTIFY_NODE_SUGGEST, NOTIFY_RECENT_DAYS, NOTIFY_SAMPLES, NOTIFY_STATES,
  notifyChannelOf, notifyRemark, notifyTestGroup, notifyTopicCells, notifyTopicStat, notifyTopicSwitch, notifyTopicsOfNode,
  type NotifyTarget, type NotifyTopic,
} from "@/lib/flow-map-notify";
import { saveNotifyTopicSwitch } from "./notify-edit";
import type { FlowNotifyApi } from "./notify";
import type { FlowBasket } from "./request";

const fmtNum = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const KIND_LABEL: Record<NotifyTarget["kind"], string> = { bell: "ในแอป (กระดิ่ง)", group: "LINE กลุ่ม", dm: "LINE ส่วนตัว", oa: "LINE OA", email: "อีเมล", popup: "ป๊อปอัป", discord: "Discord" };

export function NodeNotifyPanel({ node, api, canAdmin, basket, onEdit, onOpenLine, onOpenAll, onBack }: {
  node: string; api: FlowNotifyApi; canAdmin: boolean; basket: FlowBasket;
  /** เปิดป๊อปแก้การแจ้งเตือนเดิมของเรื่องนี้ */
  onEdit: (id: string) => void;
  onOpenLine: () => void;
  /** ไปแท็บแจ้งเตือน (ภาพรวมทุกเรื่อง) */
  onOpenAll: () => void;
  /** กลับไปแผงรายละเอียดกล่อง */
  onBack: () => void;
}) {
  const t = useT();
  const { user } = useAuth();
  const toast = useToast();
  const { live } = api;
  const [busy, setBusy] = useState<string | null>(null);
  const n = FLOW_NODES[node];
  const topics = notifyTopicsOfNode(node);
  const suggest = NOTIFY_NODE_SUGGEST[node] ?? [];
  if (!n) return null;

  const toggle = async (topic: NotifyTopic, on: boolean) => {
    if (!live) return;
    const sw = notifyTopicSwitch(topic, live);
    const msg = sw.fixed.length
      ? t(`จะปิด: ${sw.switched.join(" · ")}\nยังส่งต่อ (ยังไม่มีสวิตช์): ${sw.fixed.join(" · ")}\nเปิดกลับได้ทุกเมื่อ`, `Turns off: ${sw.switched.join(", ")}. Still sent: ${sw.fixed.join(", ")}`)
      : t(`จะปิด: ${sw.switched.join(" · ")} — คนที่เคยได้รับจะไม่ได้รับเรื่องนี้อีก จนกว่าจะเปิดใหม่ (เปิดกลับได้ทุกเมื่อ)`, "Recipients stop getting this until it is turned back on");
    if (!on && !(await askConfirm({ title: t(`ปิดแจ้งเตือน “${topic.label}”?`, `Turn off “${topic.label}”?`), message: <span className="whitespace-pre-line">{msg}</span>, confirmText: t("ปิดแจ้งเตือน", "Turn off") }))) return;
    setBusy(topic.id);
    const fails = await saveNotifyTopicSwitch(sw.rules, sw.events, on, user?.email ?? null, sw.bells);
    setBusy(null);
    await api.reload();
    if (fails.length) toast.error(fails.join(" · "));
    else toast.success(on ? t("เปิดแจ้งเตือนแล้ว", "Turned on") : t("ปิดแจ้งเตือนแล้ว", "Turned off"));
  };

  const testBell = async (topic: NotifyTopic) => {
    setBusy(`${topic.id}:bell`);
    try {
      const r = await apiFetch("/api/flow-map/notify/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: topic.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) toast.error(String(j?.error ?? "ส่งทดสอบไม่สำเร็จ"));
      else toast.success(t("ส่งเข้ากระดิ่งของคุณแล้ว — ดูที่รูปกระดิ่งมุมบน (ถึงคุณคนเดียว)", "Sent to your bell"));
    } catch { toast.error(t("ส่งทดสอบไม่สำเร็จ", "Test failed")); }
    setBusy(null);
  };

  const testLine = async (topic: NotifyTopic, slot: string) => {
    const label = LINE_SLOTS[slot as keyof typeof LINE_SLOTS]?.label ?? slot;
    const ok = await askConfirm({
      title: t(`ส่งข้อความทดสอบเข้า${label}?`, `Send a test to ${label}?`),
      message: t("ข้อความจะเข้ากลุ่ม LINE จริง ทุกคนในกลุ่มเห็น · กินโควตา LINE เท่าจำนวนคนในกลุ่ม (แพ็กเกจฟรี 300 ข้อความ/เดือน ใช้ร่วมทั้งระบบ)", "Goes to the real group and uses LINE quota per member"),
      confirmText: t("ส่งทดสอบ", "Send test"),
    });
    if (!ok) return;
    setBusy(`${topic.id}:line`);
    try {
      const r = await apiFetch("/api/admin/line-console", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot, test: true }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) toast.error(String(j?.error ?? "ส่งทดสอบไม่สำเร็จ"));
      else toast.success(t(`ส่งเข้า${label}แล้ว`, `Sent to ${label}`));
    } catch { toast.error(t("ส่งทดสอบไม่สำเร็จ", "Test failed")); }
    setBusy(null);
  };

  const inBasket = (s: string) => basket.items.some((x) => x.kind === "n" && x.ref === node && x.text === `เพิ่มแจ้งเตือน: ${s}`);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] leading-relaxed">
        <div className="flex items-start gap-2">
          <Icon value="i:bell" size={18} className="mt-0.5 text-slate-500" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[15px] text-slate-800">{n.label}</div>
            <div className="text-[11px] text-slate-500">{topics.length ? t(`แจ้งเตือน ${topics.length} เรื่อง`, `${topics.length} notifications`) : t("ยังไม่มีแจ้งเตือน", "No notifications yet")}</div>
          </div>
          <button type="button" onClick={onBack} className="shrink-0 h-8 px-2.5 inline-flex items-center gap-1 text-[12px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Icon value="i:arrow-left" size={13} />{t("รายละเอียดกล่อง", "Box details")}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
          <button type="button" onClick={onOpenAll} className="text-indigo-600 hover:underline">{t("ภาพรวมแจ้งเตือนทุกเรื่อง", "All notifications")}</button>
          {canAdmin && <>
            <Link href="/admin/notification-rules" className="text-indigo-600 hover:underline">{t("ตั้งกฎกระดิ่ง", "Bell rules")} ↗</Link>
            <button type="button" onClick={onOpenLine} className="text-indigo-600 hover:underline">{t("ศูนย์ LINE", "LINE console")}</button>
          </>}
        </div>
        {live && topics.some((x) => x.send.some((s) => s.kind === "bell")) && (
          <div className="mt-2 flex gap-1.5 text-[11.5px] text-slate-500">
            <Icon value="i:device-mobile" size={13} className="mt-0.5 shrink-0" />
            {t(`กระดิ่งเด้งบนมือถือได้ด้วย เฉพาะคนที่เปิดรับในแอปแจ้งเตือน — ตอนนี้เปิดรับ ${fmtNum(live.push)} เครื่อง`, `Bell also pushes to phones that opted in — ${live.push} devices now`)}
          </div>
        )}
        {!live && <div className="mt-2 text-[12px] text-slate-400">{api.err ? t("โหลดสถานะแจ้งเตือนไม่สำเร็จ", "Could not load status") : t("กำลังตรวจช่องทางแจ้งเตือน…", "Checking channels…")}</div>}
      </div>

      {live && topics.map((topic) => {
        const cells = notifyTopicCells(topic, live);
        const stat = notifyTopicStat(topic, live);
        const sw = notifyTopicSwitch(topic, live);
        const sample = NOTIFY_SAMPLES[topic.id];
        const remark = notifyRemark(topic, live);
        const fixes = [...new Set(cells.flatMap((c) => (c.state === "warn" && c.fix ? [c.fix] : [])))];
        const lineSilent = topic.send.some((s, i) => (s.kind === "group" || s.kind === "dm") && cells[i].state === "warn");
        const testSlot = canAdmin ? notifyTestGroup(topic, live) : null;
        const off = sw.can && !sw.on;
        return (
          <div key={topic.id} className={`rounded-xl border bg-white p-3.5 text-[13px] leading-relaxed ${off ? "border-slate-200 bg-slate-50/60" : "border-slate-200"}`}>
            <div className="flex items-start gap-2.5">
              <div className="pt-0.5">
                {canAdmin && sw.can
                  ? <ToggleSwitch size="sm" on={sw.on} disabled={busy === topic.id} onChange={(v) => void toggle(topic, v)}
                      title={`${sw.on ? t("ปิด", "Turn off") : t("เปิด", "Turn on")}: ${sw.switched.join(" · ")}${sw.fixed.length ? t(` (${sw.fixed.join(" · ")} ยังไม่มีสวิตช์)`, "") : ""}`} />
                  : <span title={sw.can ? undefined : t("เรื่องนี้ส่งทุกครั้ง ยังไม่มีสวิตช์เปิด/ปิด", "Always sent — no switch yet")} className="inline-flex h-5 items-center"><Icon value={sw.can ? "i:bell" : "i:lock"} size={14} className="text-slate-400" /></span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800">{topic.label}{off && <span className="ml-1.5 text-[11px] font-normal text-slate-500">{sw.fixed.length ? t(`(ปิด ${sw.switched.join(" · ")} · ${sw.fixed.join(" · ")} ยังส่ง)`, "(partly off)") : t("(ปิดอยู่)", "(off)")}</span>}</div>
                <div className="text-[12px] text-slate-500">{topic.when}</div>
              </div>
              <div className="shrink-0 text-right">
                {stat ? (
                  <>
                    <div className={`text-[12.5px] font-semibold tabular-nums ${stat.n7 ? "text-slate-800" : "text-slate-400"}`}>{t(`${NOTIFY_RECENT_DAYS} วัน: ${fmtNum(stat.n7 ?? 0)} ครั้ง`, `${NOTIFY_RECENT_DAYS} d: ${stat.n7 ?? 0}`)}</div>
                    <div className="text-[11px] text-slate-400">{stat.n7 ? t(`อ่าน ${Math.round(((stat.read7 ?? 0) / stat.n7) * 100)}%`, `${Math.round(((stat.read7 ?? 0) / stat.n7) * 100)}% read`) : t(`90 วัน ${fmtNum(stat.n)} ครั้ง`, `90 d: ${stat.n}`)}</div>
                  </>
                ) : <div className="text-[11px] text-slate-400 max-w-[7rem]">{t("ไม่ลงกระดิ่ง จึงนับไม่ได้", "Not in the bell — no count")}</div>}
              </div>
            </div>

            <div className="mt-2 text-[11px] text-slate-500">{t("ส่งทางไหน · ถึงใคร", "Channels · recipients")}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {topic.send.map((s, i) => {
                const c = cells[i];
                return (
                  <span key={i} title={c.text} className={`inline-flex items-start gap-1 max-w-full text-[11.5px] leading-snug px-2 py-1 rounded-lg border ${NOTIFY_STATES[c.state].chip}`}>
                    <Icon value={NOTIFY_CHANNELS[notifyChannelOf(s)].icon} size={12} className="mt-px shrink-0" />
                    <span className="font-medium whitespace-nowrap shrink-0">{KIND_LABEL[s.kind]}</span>
                    <span className="min-w-0">· {c.state === "off" ? `${c.short ?? s.to} — ${t("ปิดไว้", "off")}` : c.short ?? (c.state === "ok" ? s.to : c.text)}</span>
                  </span>
                );
              })}
            </div>

            {fixes.length > 0 && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-[12px] text-amber-900">
                <div className="flex items-center gap-1 font-medium"><Icon value="i:alert-triangle" size={13} />{t("ทางสีเหลืองยังไม่ถึงใคร", "Amber channels reach no one")}</div>
                {fixes.map((f) => <div key={f} className="flex gap-1.5 mt-0.5"><span aria-hidden="true">•</span>{f}</div>)}
                {lineSilent && canAdmin && (
                  <button type="button" onClick={onOpenLine} className="mt-1.5 h-7 px-2.5 inline-flex items-center gap-1 text-[11.5px] rounded-md border border-amber-300 bg-white hover:bg-amber-50">
                    <Icon value="i:message-circle" size={12} />{t("เปิดศูนย์ LINE ตั้งกลุ่ม", "Open LINE console")}
                  </button>
                )}
              </div>
            )}

            {remark && (
              <div className="mt-2 flex gap-1.5 text-[12px] text-slate-600">
                <Icon value="i:info-circle" size={13} className="mt-0.5 shrink-0 text-slate-400" /><span className="whitespace-pre-line">{remark}</span>
              </div>
            )}

            {sample && (sample.bell || sample.line) && (
              <details className="mt-2">
                <summary className="cursor-pointer select-none text-[12px] text-slate-500">{t("ตัวอย่างข้อความ", "Sample message")}</summary>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  {sample.bell && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <div className="text-[10.5px] text-slate-400">{t("กระดิ่งในแอป", "In-app bell")}</div>
                      <div className="text-[12.5px] font-medium text-slate-800">{sample.bell[0]}</div>
                      <div className="text-[12px] text-slate-600 whitespace-pre-line">{sample.bell[1]}</div>
                    </div>
                  )}
                  {sample.line && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-2">
                      <div className="text-[10.5px] text-emerald-700">LINE</div>
                      <div className="text-[12px] text-emerald-900 whitespace-pre-line">{sample.line}</div>
                    </div>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">{t("คำใน { } = ค่าจริงตอนส่ง", "{ } = filled in when sent")}</div>
              </details>
            )}

            {canAdmin && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => onEdit(topic.id)} className="h-7 px-2.5 inline-flex items-center gap-1 text-[11.5px] rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                  <Icon value="i:edit" size={12} />{t("แก้คนรับ / หมายเหตุ", "Edit recipients / remark")}
                </button>
                {sample?.bell && (
                  <button type="button" disabled={busy === `${topic.id}:bell`} onClick={() => void testBell(topic)} className="h-7 px-2.5 inline-flex items-center gap-1 text-[11.5px] rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    <Icon value="i:send" size={12} />{busy === `${topic.id}:bell` ? t("กำลังส่ง…", "Sending…") : t("ทดสอบส่งเข้ากระดิ่งของฉัน", "Test to my bell")}
                  </button>
                )}
                {testSlot && (
                  <button type="button" disabled={busy === `${topic.id}:line`} onClick={() => void testLine(topic, testSlot)} className="h-7 px-2.5 inline-flex items-center gap-1 text-[11.5px] rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    <Icon value="i:message-circle" size={12} />{busy === `${topic.id}:line` ? t("กำลังส่ง…", "Sending…") : t(`ทดสอบเข้า${LINE_SLOTS[testSlot].label}`, `Test to ${LINE_SLOTS[testSlot].label}`)}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {live && !topics.length && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-[13px] text-slate-500">
          {t("ขั้นนี้ยังไม่มีแจ้งเตือน — ทำงานในขั้นนี้แล้วระบบยังไม่บอกใคร", "No notifications at this step yet")}
        </div>
      )}

      {suggest.length > 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3.5 text-[13px]">
          <div className="flex items-center gap-1.5 font-medium text-slate-700"><Icon value="i:bulb" size={14} />{t("แนะนำให้มีเพิ่ม", "Suggested")}</div>
          {suggest.map((s) => {
            const added = inBasket(s);
            return (
              <div key={s} className="mt-1.5 flex items-start gap-2">
                <span className="flex-1 text-[12.5px] text-slate-600">{s}</span>
                <button type="button" disabled={added} onClick={() => basket.add([{ kind: "n", ref: node, text: `เพิ่มแจ้งเตือน: ${s}` }])}
                  className="shrink-0 h-7 px-2.5 inline-flex items-center gap-1 text-[11.5px] rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:text-emerald-700 disabled:border-emerald-200 disabled:bg-emerald-50">
                  <Icon value={added ? "i:check" : "i:plus"} size={12} />{added ? t("อยู่ในตะกร้าแล้ว", "In basket") : t("ใส่ตะกร้าขอให้ทำ", "Add to basket")}
                </button>
              </div>
            );
          })}
          <div className="mt-1.5 text-[11px] text-slate-400">{t("ตะกร้า (ปุ่มมุมบน) สร้างคำสั่งงานให้คัดลอกไปสั่งทำ หรือส่งเป็นคำขอแก้ไข", "The basket turns these into a prompt or a change request")}</div>
        </div>
      )}
    </div>
  );
}
