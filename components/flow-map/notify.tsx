"use client";

/**
 * แผนผังการทำงาน — แท็บ "แจ้งเตือน": ระบบแจ้งเรื่องอะไร · ทางไหน (กระดิ่ง ERP / LINE / อีเมล / อื่น ๆ) · ถึงคนจริงไหม
 * เนื้อหาจากทะเบียน lib/flow-map-notify.ts · สถานะสดจาก /api/flow-map/notify · ตารางกลาง MiniTable · ตั้งกลุ่ม LINE ผ่าน LineConsole กลาง
 * ใช้ที่ components/flow-map/index.tsx (แท็บ + กระดิ่งบนกล่อง + หัวข้อในแผงรายละเอียดกล่อง)
 * แอดมินกด ✎ ท้ายแถว / ปุ่ม "แก้ไข" ในแผงรายละเอียด → ป๊อปแก้การแจ้งเตือน (components/flow-map/notify-edit · onEdit)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ErrorState, LoadingState } from "@/components/state-views";
import { FLOW_NODES } from "@/lib/flow-map";
import {
  NOTIFY_AREAS, NOTIFY_AREA_ORDER, NOTIFY_CHANNELS, NOTIFY_DAYS, NOTIFY_STATES, NOTIFY_TOPICS,
  notifyAllTopics, notifyChannelOf, notifyGapNodes, notifyGhostRules, notifyGroupLabel, notifyRemark, notifyTopicCells, notifyTopicState, notifyTopicStat,
  type NotifyArea, type NotifyChannel, type NotifyLive, type NotifyState, type NotifyTopic,
} from "@/lib/flow-map-notify";

const CH: NotifyChannel[] = ["erp", "line", "email", "other"];
const fmtNum = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

/** สถานะสด 1 ชุดต่อหน้า — ใช้ทั้งแท็บแจ้งเตือนและกระดิ่งบนกล่อง */
export function useFlowNotify() {
  const [live, setLive] = useState<NotifyLive | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch("/api/flow-map/notify").then((r) => r.json());
      if (j?.error || !j?.data) { setErr(String(j?.error ?? "โหลดไม่สำเร็จ")); return; }
      setLive(j.data as NotifyLive); setAt((j.at as string) ?? null); setFailed((j.failed as string[]) ?? []);
    } catch { setErr("โหลดสถานะแจ้งเตือนไม่สำเร็จ"); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { live, at, failed, err, reload };
}
export type FlowNotifyApi = ReturnType<typeof useFlowNotify>;

/** สีของกระดิ่งบนกล่อง: เขียว = ถึงคนครบ · เหลือง = มีบางทางเงียบ · เทา = ยังโหลด */
export function notifyNodeColor(topics: NotifyTopic[], live: NotifyLive | null): string {
  if (!live) return "#94a3b8";
  return topics.some((t) => notifyTopicState(t, live).silent > 0) ? NOTIFY_STATES.warn.color : NOTIFY_STATES.ok.color;
}

function Dot({ state }: { state: NotifyState }) {
  return <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: NOTIFY_STATES[state].color }} aria-hidden="true" />;
}
/** ชิปปลายทางในช่องตาราง (สั้น) — ชี้ดูเหตุผลเต็ม */
function TargetChips({ topic, live, ch }: { topic: NotifyTopic; live: NotifyLive; ch: NotifyChannel }) {
  const cells = notifyTopicCells(topic, live);
  const items = topic.send.map((s, i) => ({ s, c: cells[i] })).filter((x) => notifyChannelOf(x.s) === ch);
  if (!items.length) return <span className="text-slate-300">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map(({ s, c }, i) => (
        <span key={i} title={c.text} className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md border whitespace-nowrap ${NOTIFY_STATES[c.state].chip}`}>
          <Dot state={c.state} />{c.short ?? (s.kind === "dm" ? "LINE ส่วนตัว" : s.kind === "oa" ? "LINE OA" : s.to)}
        </span>
      ))}
    </span>
  );
}
export function NotifyLegend() {
  const t = useT();
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
      {(Object.keys(NOTIFY_STATES) as NotifyState[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1"><Dot state={k} />{NOTIFY_STATES[k].label}</span>
      ))}
      <span>— = {t("ไม่มีช่องทางนี้", "no such channel")}</span>
    </span>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${warn ? "text-amber-700" : "text-slate-800"}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

/** ฝั่งซ้ายของแท็บ: การ์ดสรุป · ตัวกรองฝ่าย · ตาราง · ขั้นที่ยังไม่มีแจ้งเตือน · กฎที่ไม่มีโค้ดยิง */
export function FlowNotifyBoard({ api, selected, onSelect, canAdmin, onOpenLine, onEdit }: {
  api: FlowNotifyApi; selected: string | null; onSelect: (id: string | null) => void; canAdmin: boolean; onOpenLine: () => void;
  /** แอดมิน: เปิดป๊อปแก้การแจ้งเตือนของเรื่องนี้ */
  onEdit?: (id: string) => void;
}) {
  const t = useT();
  const { live, at, failed, err, reload } = api;
  const [area, setArea] = useState<NotifyArea | "all">("all");
  const [silentOnly, setSilentOnly] = useState(false);
  const topics = useMemo(() => notifyAllTopics(live), [live]);

  if (err && !live) return <div className="rounded-xl border border-slate-200 bg-white p-4"><ErrorState title={err} onRetry={() => void reload()} /></div>;
  if (!live) return <div className="rounded-xl border border-slate-200 bg-white p-4"><LoadingState label={t("กำลังตรวจช่องทางแจ้งเตือน…", "Checking channels…")} /></div>;

  const states = new Map(topics.map((x) => [x.id, notifyTopicState(x, live)]));
  const reach = topics.filter((x) => states.get(x.id)?.state === "ok").length;
  const silentAll = topics.filter((x) => states.get(x.id)?.state === "warn").length;
  const groupsUsed = [...new Set(NOTIFY_TOPICS.flatMap((x) => x.send.flatMap((s) => (s.kind === "group" ? s.groups.filter((g) => g !== "main") : []))))];
  const groupsSet = groupsUsed.filter((g) => live.line.groups[g]).length;
  const rows = topics.filter((x) => (area === "all" || x.area === area) && (!silentOnly || (states.get(x.id)?.silent ?? 0) > 0));
  const ghosts = notifyGhostRules(live);
  const gapAreas = NOTIFY_AREA_ORDER.filter((a) => (area === "all" || a === area) && notifyGapNodes(a).length > 0);

  const columns: MiniColumn<NotifyTopic>[] = [
    { key: "label", header: t("เรื่อง", "Topic"), width: "1.6fr", sortValue: (r) => r.label, sortLabel: t("ชื่อเรื่อง", "Topic"),
      cell: (r) => (
        <span className="block min-w-0">
          <span className="flex items-center gap-1.5 text-[13px] text-slate-800"><Dot state={states.get(r.id)?.state ?? "off"} />{r.label}</span>
          <span className="block text-[11px] text-slate-500 truncate" title={r.when}>{r.when}</span>
        </span>
      ) },
    ...CH.map((c): MiniColumn<NotifyTopic> => ({
      key: c, header: <span className="inline-flex items-center gap-1"><Icon value={NOTIFY_CHANNELS[c].icon} />{c === "erp" ? "ERP" : NOTIFY_CHANNELS[c].label}</span>,
      label: NOTIFY_CHANNELS[c].label, width: c === "line" ? "1.25fr" : "1fr",
      sortValue: (r) => notifyTopicCells(r, live).filter((x, i) => notifyChannelOf(r.send[i]) === c && x.state === "ok").length,
      cell: (r) => <TargetChips topic={r} live={live} ch={c} />,
    })),
    { key: "n", header: t(`${NOTIFY_DAYS} วัน`, `${NOTIFY_DAYS} d`), width: "5.5rem", align: "right",
      sortValue: (r) => notifyTopicStat(r, live)?.n ?? -1, sortLabel: t("จำนวนครั้ง 90 วัน", "Count 90 d"),
      cell: (r) => {
        const s = notifyTopicStat(r, live);
        if (!s) return <span className="text-slate-300" title={t("ไม่ลงกระดิ่ง จึงไม่มีสถิติ", "Not in the bell")}>—</span>;
        return (
          <span className="block text-right">
            <span className={`text-[13px] tabular-nums ${s.n === 0 ? "text-amber-700" : "text-slate-800"}`}>{fmtNum(s.n)}</span>
            {s.n > 0 && <span className="block text-[10px] text-slate-400">{t(`อ่าน ${Math.round((s.read / s.n) * 100)}%`, `${Math.round((s.read / s.n) * 100)}% read`)}</span>}
          </span>
        );
      } },
    ...(canAdmin && onEdit ? [{
      key: "edit", header: "", label: t("แก้ไข", "Edit"), width: "4.5rem", align: "right" as const,
      cell: (r: NotifyTopic) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(r.id); }} title={t("แก้คนรับ / เปิด-ปิด / กลุ่ม LINE / เวลา", "Edit recipients / on-off / LINE group / time")}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11.5px] text-slate-600 hover:border-indigo-300 hover:text-indigo-700">
          <Icon value="i:edit" size={12} />{t("แก้ไข", "Edit")}
        </button>
      ),
    } satisfies MiniColumn<NotifyTopic>] : []),
  ];

  const pill = (k: NotifyArea | "all", label: string, n: number) => (
    <button key={k} type="button" onClick={() => setArea(k)}
      className={`h-7 px-2.5 text-[12px] rounded-lg border ${area === k ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
      {label} <span className={`tabular-nums ${area === k ? "text-white/70" : "text-slate-400"}`}>{n}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat label={t("เรื่องที่แจ้งเตือน", "Topics")} value={fmtNum(topics.length)} sub={t(`ถึงคนจริง ${reach} · เงียบ ${silentAll}`, `${reach} reach · ${silentAll} silent`)} />
        <Stat label={t("กลุ่ม LINE ตั้งแล้ว", "LINE groups set")} value={`${groupsSet}/${groupsUsed.length}`} warn={groupsSet < groupsUsed.length}
          sub={live.line.token ? t("บอท LINE พร้อม", "Bot ready") : t("ยังไม่ได้ตั้งบอท", "No bot")} />
        <Stat label={t("พนักงานผูก LINE", "Staff on LINE")} value={`${fmtNum(live.staff.linked)}/${fmtNum(live.staff.active)}`} warn={live.staff.linked * 2 < live.staff.active}
          sub={t("ใช้ส่ง LINE ส่วนตัวช่าง", "For personal LINE")} />
        <Stat label={t("มือถือรับแจ้งเตือน", "Phones with push")} value={`${fmtNum(live.push)} ${t("เครื่อง", "")}`} warn={live.push === 0} sub={t("เด้งเตือนบนมือถือจากกระดิ่ง", "Push from the bell")} />
        <Stat label={t("ระบบส่งอีเมล", "Email")} value={live.email ? t("พร้อม", "Ready") : t("ยังไม่ตั้ง", "Not set")} warn={!live.email}
          sub={t(`ร้านเปิดอีเมลลูกค้า ${live.shops.email}/${live.shops.total}`, `Shops on: ${live.shops.email}/${live.shops.total}`)} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {pill("all", t("ทุกฝ่าย", "All"), topics.length)}
        {NOTIFY_AREA_ORDER.map((a) => { const n = topics.filter((x) => x.area === a).length; return n ? pill(a, NOTIFY_AREAS[a].label, n) : null; })}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        <button type="button" aria-pressed={silentOnly} onClick={() => setSilentOnly((s) => !s)}
          className={`h-7 px-2.5 inline-flex items-center gap-1.5 text-[12px] rounded-lg border ${silentOnly ? "bg-amber-400 text-amber-950 border-amber-400" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
          <Dot state="warn" />{t("เฉพาะที่มีทางเงียบ", "Only with silent channels")}
        </button>
        {canAdmin && (
          <button type="button" onClick={onOpenLine} className="ml-auto h-7 px-2.5 inline-flex items-center gap-1.5 text-[12px] rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
            <Icon value="💬" />{t("ตั้งกลุ่ม LINE", "Set LINE groups")}
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-2">
        <MiniTable<NotifyTopic>
          rows={rows} rowKey={(r) => r.id} columns={columns} dense
          searchText={(r) => `${r.label} ${r.when} ${r.send.map((s) => s.to).join(" ")} ${NOTIFY_AREAS[r.area].label}`}
          searchPlaceholder={t("ค้นเรื่อง / ผู้รับ / กลุ่ม…", "Search topic / recipient…")}
          groupBy={(r) => NOTIFY_AREAS[r.area].label} groupLabel={t("แยกตามฝ่าย", "Group by area")} defaultGrouped
          groupOrder={(g) => NOTIFY_AREA_ORDER.findIndex((a) => NOTIFY_AREAS[a].label === g)}
          onRowClick={(r) => onSelect(selected === r.id ? null : r.id)}
          activeCell={(r) => (r.id === selected ? "label" : null)}
          countUnit={t("เรื่อง", "topics")}
          emptyText={t("ไม่มีเรื่องที่ตรงกับตัวกรอง", "No topics match")}
          footnote={<NotifyLegend />}
        />
      </div>

      {gapAreas.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[12px] font-medium text-slate-700">{t("ขั้นในแผนผังที่ยังไม่มีแจ้งเตือนเลย", "Steps with no notifications")}</div>
          {gapAreas.map((a) => (
            <div key={a} className="mt-1 text-[12.5px] text-slate-600">
              <span className="text-slate-400">{NOTIFY_AREAS[a].label}:</span> {notifyGapNodes(a).map((n) => FLOW_NODES[n]?.label ?? n).join(" · ")}
            </div>
          ))}
        </div>
      )}

      {ghosts.length > 0 && (area === "all") && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-medium text-slate-700">{t(`กฎกระดิ่งที่ไม่มีโค้ดไหนยิง ${ghosts.length} ข้อ`, `${ghosts.length} bell rules nothing fires`)}</span>
            {canAdmin && <Link href="/admin/notification-rules" className="text-[12px] text-indigo-600 hover:underline">{t("เปิดหน้าตั้งกฎแจ้งเตือน", "Open rules")} ↗</Link>}
          </div>
          <div className="mt-1 text-[12px] text-slate-500">{t("ส่วนใหญ่ค้างจากระบบเก่า — เปิดอยู่แต่ไม่เคยเด้ง ควรลบ หรือผูกกับขั้นตอนจริง", "Mostly left from the old system — delete or wire up")}</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {ghosts.map((g) => <span key={g.event} title={g.event} className="text-[11px] px-1.5 py-0.5 rounded-md border border-slate-200 bg-white text-slate-600">{g.name}</span>)}
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        {t("อ่านจากทะเบียนกลาง lib/flow-map-notify.ts + สถานะจริงของระบบ", "From lib/flow-map-notify.ts + live system state")}
        {at ? t(` · ณ ${new Date(at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`, ` · as of ${new Date(at).toLocaleTimeString()}`) : ""}
        {failed.length ? t(` · อ่านไม่สำเร็จ: ${failed.join(", ")}`, ` · failed: ${failed.join(", ")}`) : ""}
      </p>
    </div>
  );
}

/** ฝั่งขวา: รายละเอียดเรื่องที่เลือก (ส่งทางไหน · ถึงไหม · ต้องทำอะไร · สถิติ) หรือคำอธิบาย + เรื่องที่ยังเงียบ */
export function FlowNotifyPanel({ api, selected, onSelect, onOpenNode, canAdmin, onOpenLine, onEdit }: {
  api: FlowNotifyApi; selected: string | null; onSelect: (id: string | null) => void;
  onOpenNode: (node: string) => void; canAdmin: boolean; onOpenLine: () => void;
  onEdit?: (id: string) => void;
}) {
  const t = useT();
  const { live } = api;
  const topics = useMemo(() => notifyAllTopics(live), [live]);
  const topic = selected ? topics.find((x) => x.id === selected) : undefined;

  if (!live) return <div className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-500">{api.err ? t("ยังโหลดสถานะแจ้งเตือนไม่ได้", "Could not load notification status") : t("กำลังโหลด…", "Loading…")}</div>;

  if (!topic) {
    const silent = topics.filter((x) => notifyTopicState(x, live).silent > 0);
    return (
      <div className="space-y-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-600 leading-relaxed">
          <div className="font-medium text-slate-800 flex items-center gap-1.5"><Icon value="🔔" />{t("อ่านแท็บนี้ยังไง", "How to read")}</div>
          <div className="mt-1">{t("แต่ละแถว = เรื่องที่ระบบแจ้งเตือน · ช่องสีบอกว่าแจ้งทางไหน และถึงคนจริงไหม · กดแถวเพื่อดูว่าส่งถึงใคร และถ้าเงียบต้องตั้งค่าอะไร", "Each row is a notification · colours show if it reaches people · click a row for details")}</div>
          <div className="mt-2"><NotifyLegend /></div>
          <div className="mt-2 text-[12px] text-slate-500">{t("กล่องในแผนผังที่มีรูปกระดิ่ง = ขั้นนั้นมีแจ้งเตือน (เขียว = ถึงคนครบ · เหลือง = บางทางยังเงียบ)", "Boxes with a bell have notifications")}</div>
        </div>
        {silent.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-2">
            <div className="px-2 pt-1 pb-1.5 text-[12px] font-medium text-amber-800">{t(`เรื่องที่มีทางยังเงียบ ${silent.length} เรื่อง`, `${silent.length} topics with silent channels`)}</div>
            {silent.map((x) => {
              const cells = notifyTopicCells(x, live);
              return (
                <button key={x.id} type="button" onClick={() => onSelect(x.id)} className="w-full text-left px-2 py-1.5 border-t border-amber-100 hover:bg-amber-50 rounded-md">
                  <span className="block text-[13px] text-slate-800">{x.label}</span>
                  <span className="block text-[11.5px] text-amber-800">{cells.filter((c) => c.state === "warn").map((c) => c.text).join(" · ")}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const cells = notifyTopicCells(topic, live);
  const stat = notifyTopicStat(topic, live);
  const fixes = [...new Set(cells.flatMap((c) => (c.state !== "ok" && c.fix ? [c.fix] : [])))];
  const lineSilent = topic.send.some((s, i) => s.kind === "group" && cells[i].state !== "ok");
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] leading-relaxed">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] text-slate-800">{topic.label}</div>
          <div className="text-[11px] text-slate-500">{NOTIFY_AREAS[topic.area].label}{topic.node && FLOW_NODES[topic.node] ? ` · ${FLOW_NODES[topic.node].label}` : ""}</div>
        </div>
        {canAdmin && onEdit && (
          <button type="button" onClick={() => onEdit(topic.id)} className="shrink-0 h-8 px-3 inline-flex items-center gap-1 text-[12px] rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
            <Icon value="i:edit" size={13} />{t("แก้ไข", "Edit")}
          </button>
        )}
        {topic.node && FLOW_NODES[topic.node] && (
          <button type="button" onClick={() => onOpenNode(topic.node!)} className="shrink-0 h-8 px-3 inline-flex items-center gap-1 text-[12px] rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
            {t("ดูในแผนผัง", "Show on map")}
          </button>
        )}
      </div>
      <div className="mt-2 text-[11px] text-slate-500">{t("เกิดเมื่อไร", "When")}</div>
      <div className="text-slate-800">{topic.when}</div>

      <div className="mt-2 text-[11px] text-slate-500">{t("ส่งทางไหน · ถึงใคร", "Channels · recipients")}</div>
      <div className="mt-1 space-y-1.5">
        {topic.send.map((s, i) => {
          const c = cells[i], ch = notifyChannelOf(s);
          return (
            <div key={i} className={`rounded-lg border px-2.5 py-1.5 ${NOTIFY_STATES[c.state].chip}`}>
              <div className="flex items-center gap-1.5 text-[12.5px]">
                <Icon value={NOTIFY_CHANNELS[ch].icon} />
                <span className="font-medium">{s.kind === "bell" ? t("กระดิ่ง ERP", "ERP bell") : s.kind === "popup" ? t("ป๊อปอัป ERP", "ERP popup") : s.kind === "group" ? "LINE กลุ่ม" : s.kind === "dm" ? t("LINE ส่วนตัว", "Personal LINE") : s.kind === "oa" ? "LINE OA" : s.kind === "email" ? t("อีเมล", "Email") : "Discord"}</span>
                <span className="ml-auto text-[11px]">{NOTIFY_STATES[c.state].label}</span>
              </div>
              <div className="text-[12px] mt-0.5">{c.text}</div>
              {s.kind === "group" && s.groups.length > 1 && <div className="text-[11px] opacity-80">{t("ลำดับกลุ่มที่ลองส่ง", "Fallback order")}: {s.groups.map(notifyGroupLabel).join(" → ")}</div>}
            </div>
          );
        })}
      </div>

      {fixes.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5">
          <div className="text-[12px] font-medium text-amber-800">{t("ต้องทำอะไรให้ถึงคน", "To make it reach people")}</div>
          {fixes.map((f) => <div key={f} className="flex gap-1.5 text-[12.5px] text-amber-900 mt-0.5"><span aria-hidden="true">•</span>{f}</div>)}
          {lineSilent && canAdmin && (
            <button type="button" onClick={onOpenLine} className="mt-2 h-8 px-3 inline-flex items-center gap-1.5 text-[12px] rounded-lg border border-amber-300 bg-white text-amber-900 hover:bg-amber-50">
              <Icon value="💬" />{t("เปิดศูนย์ LINE", "Open LINE console")}
            </button>
          )}
        </div>
      )}

      <div className="mt-3 text-[11px] text-slate-500">{t(`กระดิ่ง ${NOTIFY_DAYS} วันล่าสุด`, `Bell, last ${NOTIFY_DAYS} days`)}</div>
      {stat ? (
        <div className="grid grid-cols-3 gap-2 mt-1">
          <div><div className={`text-[15px] font-semibold tabular-nums ${stat.n === 0 ? "text-amber-700" : "text-slate-800"}`}>{fmtNum(stat.n)}</div><div className="text-[11px] text-slate-500">{t("ครั้ง", "times")} · {fmtNum(stat.users)} {t("คน", "people")}</div></div>
          <div><div className="text-[15px] font-semibold tabular-nums text-slate-800">{stat.n ? `${Math.round((stat.read / stat.n) * 100)}%` : "—"}</div><div className="text-[11px] text-slate-500">{t("เปิดอ่าน", "read")}</div></div>
          <div><div className="text-[15px] font-semibold text-slate-800">{stat.last ? shortDate(stat.last) : "—"}</div><div className="text-[11px] text-slate-500">{t("ล่าสุด", "last")}</div></div>
        </div>
      ) : <div className="text-[12.5px] text-slate-500">{t("เรื่องนี้ไม่ลงกระดิ่ง จึงไม่มีสถิติในระบบ", "Not sent to the bell — no stats")}</div>}
      {(() => {
        const remark = notifyRemark(topic, live);   // ที่แอดมินเขียนในป๊อปแก้ไข · ยังไม่เคยเขียน = ข้อสังเกตในทะเบียน
        return remark ? (
          <div className="mt-2 text-[12.5px] text-slate-700">
            <div className="text-[11px] text-slate-500">{t("หมายเหตุ", "Remark")}</div>
            <div className="whitespace-pre-line">{remark}</div>
          </div>
        ) : null;
      })()}

      <details className="mt-3 text-[12px] text-slate-500">
        <summary className="cursor-pointer select-none">{t("สำหรับทีมพัฒนา", "For developers")}</summary>
        <div className="mt-1 font-mono break-all">{topic.files.join(" · ")}</div>
        {topic.events?.length ? <div className="mt-1 font-mono break-all">event_type: {topic.events.join(", ")}</div> : null}
      </details>
      <button type="button" onClick={() => onSelect(null)} className="mt-3 h-8 px-3 text-[12px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">{t("ดูภาพรวม", "Overview")}</button>
    </div>
  );
}

/** หัวข้อ "แจ้งเตือนของขั้นนี้" ในแผงรายละเอียดกล่อง — กดแล้วไปแท็บแจ้งเตือนที่เรื่องนั้น */
export function NodeNotifyList({ topics, live, onPick }: { topics: NotifyTopic[]; live: NotifyLive | null; onPick: (id: string) => void }) {
  const t = useT();
  if (!topics.length) return null;
  return (
    <div className="mt-2">
      <div className="text-[11px] text-slate-500">{t("แจ้งเตือนของขั้นนี้ (กดดูรายละเอียด)", "Notifications here (click for details)")}</div>
      {topics.map((x) => {
        const cells = live ? notifyTopicCells(x, live) : null;
        return (
          <button key={x.id} type="button" onClick={() => onPick(x.id)} className="w-full text-left rounded-md px-1 -mx-1 py-0.5 hover:bg-slate-50">
            <span className="flex items-center gap-1.5 text-[13px] text-slate-700"><Icon value="🔔" />{x.label}</span>
            <span className="flex flex-wrap gap-1 mt-0.5 ml-5">
              {x.send.map((s, i) => (
                <span key={i} title={cells?.[i].text} className={`inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded border ${cells ? NOTIFY_STATES[cells[i].state].chip : "border-slate-200 text-slate-500"}`}>
                  {cells && <Dot state={cells[i].state} />}{NOTIFY_CHANNELS[notifyChannelOf(s)].label.split(" ")[0]} · {s.kind === "dm" ? t("ส่วนตัว", "personal") : s.to}
                </span>
              ))}
            </span>
            {(() => { const remark = notifyRemark(x, live); return remark ? <span className="block ml-5 mt-1 text-[11.5px] leading-snug text-slate-500 whitespace-pre-line">{t("หมายเหตุ", "Remark")}: {remark}</span> : null; })()}
          </button>
        );
      })}
    </div>
  );
}
