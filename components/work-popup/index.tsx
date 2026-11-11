"use client";
/**
 * 🔔 ป๊อปเตือนงานตอนเข้า ERP (ของกลาง) — WorkPopupHost mount ครั้งเดียวใน app/layout
 *   ถามเซิร์ฟเวอร์ครั้งเดียวต่อแท็บ (หลังหน้าโหลด ~2.5 วิ) + ถามใหม่เมื่อกลับมาที่แท็บเกิน 30 นาที
 *   ใคร/เมื่อไหร่/รับทราบแล้ว ตัดสินที่เซิร์ฟเวอร์ (lib/email-report/popup) · ตั้งค่าที่ หน้าส่งอีเมลรายงาน → 🔔 เด้งป๊อปตอนเข้า ERP
 *   "งานของคุณ" ขึ้นก่อนเสมอ ติ๊กเสร็จในป๊อปได้ (PATCH /api/record-tasks/[id] — ผู้รับผิดชอบติ๊กข้อตัวเองได้)
 *   ปุ่ม: รับทราบ (วันละครั้ง = ไม่เด้งอีกวันนี้) · ไว้ทีหลัง (ปิด + ใส่กระดิ่งให้กดกลับมาเปิด) · เปิดใบงาน = ไว้ทีหลัง
 *   กระดิ่งลิงก์ ?popup=<id> → เปิดป๊อปนั้นทันทีไม่ว่าหน้าไหน (แม้ผู้ใช้ซ่อนป๊อปไว้)
 *   จอคอม (≥1280) = การ์ดลอยมุมขวาล่าง/ขวาบน ย่อ/ซ่อนได้ (./float) · ปุ่มเล็กอยู่ทั้งวัน (?all=1) กางเองเมื่อ due · จอเล็ก = หน้าต่างกลางจอแบบเดิม
 *   ซ่อน/เปิด + มุมจอ = เมนูโปรไฟล์ → 🔔 ป๊อปเตือนงาน (user_ui_prefs work_popup_float · ปิด = ไม่ถาม ไม่เด้ง)
 * WorkPopupBody = เนื้อในป๊อป (หน้าตั้งค่าใช้แสดงตัวอย่าง)
 */
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ERPModal } from "@/components/modal";
import { useAuth, usePermission } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { useRefresh } from "@/lib/refresh-bus";
import { isStandaloneAppPath, openInStandaloneApp } from "@/lib/app-go";
import { TaskLinkList, TaskLinksButton } from "@/components/record-tasks/task-links";
import { Icon } from "@/components/icon";
import type { WorkPopupFlag, WorkPopupItem, WorkPopupPayload, WorkPopupTask } from "@/lib/email-report/popup";
// หน้าที่ไม่ใช่การทำงานใน ERP (ล็อกอิน / พิมพ์ / ลิงก์สาธารณะ) → ไม่เด้ง (รายการกลาง lib/chromeless-routes)
import { isChromelessPath } from "@/lib/chromeless-routes";
import { FloatViewContext, WORK_POPUP_HIDE_HINT, WorkPopupFloatCard, useFloatScreen, useFloatView, useWorkPopupFloatPref, type FloatTab } from "./float";
import type { FloatLevel } from "./float-pref";
import { GifInbox, type GifPoke } from "./gif-inbox";
import { LineInboxTab, linePendingCount } from "./line-inbox-tab";
import type { LinePendingPayload } from "@/lib/line-pending";
import { inboxCount, type InboxItem, type InboxPayload } from "@/lib/task-inbox";
import { groupMyPlan, planPetCount, planPetNews } from "@/lib/team-plan-pet";
import type { PlanItem } from "@/lib/team-plan";
import { BellTab } from "./bell-tab";
import { useNotificationFeed } from "@/components/notification-bell/feed";
import { useNotifyPrefs } from "@/components/notify-settings";
import { WatchesTab, useMyWatches, useMyWatchesData } from "@/components/my-watches";
import { bellSourceOf, inQuietHours, notifyOn } from "@/lib/notify-sources";
import { petBadge, petMood } from "@/lib/floating-pet";
import { useDeployStatus } from "@/components/deploy-countdown";
import { deployPetNews } from "@/lib/deploy-queue";
import type { UserPickerValue } from "@/components/pickers";
import dynamic from "next/dynamic";
// หน้าต่างส่ง GIF (ของแอปจัดการงาน) — โหลดเฉพาะตอนกดตอบกลับ/ส่ง
const GifPokeModal = dynamic(() => import("@/app/tasks/gif-poke-modal").then((m) => m.GifPokeModal), { ssr: false });
// แท็บ Task (งาน Task Manager ที่รอฉัน) + แผงตรวจเร็ว — โหลดเฉพาะตอนมีงาน/เปิดดู (ไม่ถ่วงทุกหน้า)
const TaskInboxTab = dynamic(() => import("./task-inbox").then((m) => m.TaskInboxTab), { ssr: false });
const TaskInboxQuickCheck = dynamic(() => import("./task-inbox").then((m) => m.TaskInboxQuickCheck), { ssr: false });
// แท็บ แผนงาน (แผนงานทีมของฉัน) + ป๊อปแก้งาน — โหลดเฉพาะตอนมีงาน/เปิดดู
const PlanTab = dynamic(() => import("./plan-tab").then((m) => m.PlanTab), { ssr: false });
const PlanItemEditor = dynamic(() => import("./plan-tab").then((m) => m.PlanItemEditor), { ssr: false });
// แท็บ ขึ้นเว็บ (ผู้ดูแลระบบ) — โหลดเฉพาะตอนเปิดดู
const DeployTab = dynamic(() => import("./deploy-tab").then((m) => m.DeployTab), { ssr: false });
const RECHECK_MS = 30 * 60_000;
const POKE_POLL_MS = 3 * 60_000;
const pokeSeenKey = (uid: string) => `fpet-pokes-seen:${uid}`;
function readPokeSeen(uid: string): Set<string> {
  try { const v = JSON.parse(localStorage.getItem(pokeSeenKey(uid)) ?? "[]"); return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []); } catch { return new Set(); }
}
// "เห็นแล้ว" ของแท็บ LINE / กระดิ่ง (ตัว Pet เด้งเฉพาะของใหม่ที่ยังไม่เคยเห็น) — จำในเครื่อง
function readIds(key: string): Set<string> {
  try { const v = JSON.parse(localStorage.getItem(key) ?? "[]"); return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []); } catch { return new Set(); }
}
function saveIds(key: string, ids: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...ids].slice(-300))); } catch { /* ignore */ }
}
const UUID = /^[0-9a-f-]{36}$/i;

const thDate = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const seenKey = (uid: string) => `work-popup-seen:${uid}:${thDate()}`;
function readSeen(uid: string): string[] {
  try { const v = JSON.parse(sessionStorage.getItem(seenKey(uid)) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function markSeen(uid: string, id: string) {
  try { sessionStorage.setItem(seenKey(uid), JSON.stringify([...new Set([...readSeen(uid), id])])); } catch { /* ignore */ }
}

// สีป้ายเตือนต่อใบ (ไม่ขยับ X วัน / เกินกำหนด …) — พื้นอ่อน + ตัวเข้ม · สีเดียวกันทุกขนาดการ์ด
const TONE: Record<WorkPopupFlag["tone"], string> = { danger: "bg-rose-50 text-rose-700", warn: "bg-amber-50 text-amber-700", muted: "bg-slate-100 text-slate-500", good: "bg-emerald-50 text-emerald-700" };

type PopupTab = "today" | "waiting" | "all";
/** ตัดอีโมจิ/สัญลักษณ์หน้าหัวข้อจากเซิร์ฟเวอร์ (เช่น "🔥 ต้องตามวันนี้") — หน้าจอใส่ไอคอนกลางเอง · ไม่มีอีโมจิ = คงเดิม */
const plainLabel = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, "").trim() || s;

/** คอลัมน์แบบกว้าง (1 บรรทัดต่องาน) — หัวคอลัมน์กับทุกแถวใช้ชุดเดียวกัน คอลัมน์จึงตรงกัน */
const wideCols = (img: boolean, code: boolean) => `${img ? "28px " : ""}${code ? "92px " : ""}minmax(0,1.3fr) minmax(0,.9fr) minmax(0,1.3fr) 104px`;

function Thumb({ src, size }: { src: string | null; size: number }) {
  const st = { width: size, height: size };
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" loading="lazy" style={st} className="shrink-0 rounded-md border border-slate-200 object-cover" />
    : <div style={st} className="flex shrink-0 items-center justify-center rounded-md border border-dashed border-slate-200 text-slate-300"><Icon name="design" /></div>;
}

/** 1 ใบงานในป๊อป — ยิ่งกว้างยิ่งเตี้ย (level จากความกว้างการ์ด · เจ้าของสั่ง 2026-11-11):
 *    แคบ = 3 บรรทัด (ชื่อ+ป้าย / เลขที่·สถานะ / ของรอข้อแรก) · กลาง = 2 บรรทัด (ของรอย้ายไปขวา) · กว้าง = 1 บรรทัดแบบตาราง
 *  ของรอ: โชว์ข้อแรกที่ยังไม่เสร็จ (ติ๊กได้เลย) + ปุ่ม "+N" กางดูทุกข้อ/ลิงก์/โน้ต · ช่องไหนโชว์ = data.fields เหมือนเดิม
 *  ติ๊กไม่ได้ = จางพร้อมบอกเหตุผล (ชี้ค้าง) */
function ItemRow({ it, fields, tasks, canTick, onTick, onOpen, done, strong, level, img }: {
  it: WorkPopupItem; fields: Set<string>; tasks: WorkPopupTask[];
  canTick: (t: WorkPopupTask) => boolean; onTick?: (taskId: string, done: boolean) => void; onOpen?: (path: string) => void;
  done?: Set<string>; strong?: boolean; level: FloatLevel; img: boolean;
}) {
  const [open, setOpen] = useState(false);
  const meta = [fields.has("brand") ? it.brand : null, fields.has("status") ? it.status : null, fields.has("due") ? it.due : null].filter(Boolean).join(" · ");
  const hasCode = fields.has("code");
  const code = hasCode ? it.code : null;
  const showImg = img && fields.has("img");
  const note = fields.has("note") ? it.note : null;
  const left = tasks.filter((t) => !done?.has(t.id));
  const first = left[0];
  const more = Math.max(0, left.length - 1);
  const canExpand = tasks.length > 1 || !!note || tasks.some((t) => !!t.links?.length);
  const who = (t: WorkPopupTask) => (fields.has("who") && t.who ? t.who : null);
  const tickBox = (t: WorkPopupTask) => {
    const ok = !!done?.has(t.id);
    const can = !!onTick && canTick(t);
    return (
      <input type="checkbox" checked={ok} disabled={!can} onChange={(e) => onTick?.(t.id, e.target.checked)} aria-label={`ทำเสร็จ: ${t.title}`}
        title={onTick && !can ? "ติ๊กได้เฉพาะผู้รับผิดชอบข้อนี้ / คนที่แก้ใบงานได้" : undefined}
        className={`h-3.5 w-3.5 shrink-0 accent-indigo-600 ${can ? "cursor-pointer" : onTick ? "opacity-40" : ""}`} />
    );
  };
  const titleBtn = (cls: string) => (
    <button type="button" disabled={!onOpen} onClick={() => onOpen?.(it.path)} title={it.title}
      className={`min-w-0 truncate text-left text-[13px] leading-snug text-slate-800 hover:underline disabled:hover:no-underline ${strong ? "font-semibold" : "font-medium"} ${cls}`}>{it.title}</button>
  );
  const flag = fields.has("flag") && it.flag.text
    ? <span title={it.flag.text} className={`inline-block max-w-full truncate whitespace-nowrap rounded-full px-2 py-px align-middle text-[11px] leading-4 ${TONE[it.flag.tone]}`}>{it.flag.text}</span>
    : null;
  const subLine = (code || meta) && (
    <div className="truncate text-[11px] leading-snug text-slate-500">
      {code && <span className="font-mono text-slate-400">{code}</span>}{code && meta && " · "}{meta}
    </div>
  );
  const expandBtn = canExpand && (
    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} title={open ? "ย่อ" : "ดูทุกข้อ / ลิงก์ / โน้ต"}
      className="inline-flex h-[18px] shrink-0 items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 text-[11px] text-slate-500 hover:bg-slate-50">
      {more > 0 && `+${more}`}<Icon value={open ? "i:chevron-up" : "i:chevron-down"} />
    </button>
  );
  // บรรทัด "ต้องทำต่อ": ข้อแรกที่ยังไม่เสร็จ · ติ๊กครบแล้ว = ข้อสุดท้ายขีดฆ่า (ยังติ๊กกลับได้ กันกดพลาด) · ไม่มีของรอแต่มีโน้ต = โน้ตแทน
  const lineTask = first ?? tasks[tasks.length - 1];
  const taskLine = lineTask ? (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-700">
      {tickBox(lineTask)}
      <span className={`min-w-0 truncate ${first ? "" : "text-slate-400 line-through"}`} title={lineTask.title}>{lineTask.title}</span>
      {!first && <span className="inline-flex shrink-0 items-center gap-0.5 text-emerald-600"><Icon name="done" /> ครบแล้ว</span>}
      {first && who(first) && <span title={who(first)!} className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-semibold text-indigo-700">{who(first)!.slice(0, 1).toUpperCase()}</span>}
      {first && !open && !!first.links?.length && <TaskLinksButton links={first.links} />}
      {expandBtn}
    </div>
  ) : note ? (
    <div className="flex min-w-0 items-center gap-1 text-xs text-amber-700" title={note}><Icon name="note" /><span className="min-w-0 truncate">{note}</span></div>
  ) : null;
  const expanded = open && (
    <div className="space-y-1 pb-0.5 pt-1">
      {note && <div className="flex items-start gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800"><Icon name="note" /><span>{note}</span></div>}
      {tasks.map((t) => {
        const ok = !!done?.has(t.id);
        return (
          <div key={t.id}>
            <label className={`flex items-center gap-1.5 text-xs ${ok ? "text-slate-400 line-through" : "text-slate-700"}`}>
              {tickBox(t)}<span className="min-w-0">{t.title}{who(t) && <span className="text-slate-400"> — {who(t)}</span>}</span>
            </label>
            {!ok && <TaskLinkList links={t.links} className="ml-5 mt-0.5" />}
          </div>
        );
      })}
    </div>
  );

  if (level === 3) return (
    <div className="px-3 py-1 hover:bg-slate-50/80">
      <div className="grid items-center gap-x-2.5" style={{ gridTemplateColumns: wideCols(showImg, hasCode) }}>
        {showImg && <Thumb src={it.imageUrl} size={28} />}
        {hasCode && <span className="truncate font-mono text-[11px] text-slate-400" title={code ?? undefined}>{code ?? ""}</span>}
        {titleBtn("")}
        <span className="truncate text-xs text-slate-500" title={meta || undefined}>{meta}</span>
        <div className="min-w-0">{taskLine}</div>
        <div className="flex min-w-0 justify-end">{flag}</div>
      </div>
      {expanded && <div style={{ paddingLeft: (showImg ? 38 : 0) + (hasCode ? 102 : 0) }}>{expanded}</div>}
    </div>
  );
  if (level === 2) return (
    <div className="px-3 py-1.5 hover:bg-slate-50/80">
      <div className="flex items-center gap-2.5">
        {showImg && <Thumb src={it.imageUrl} size={32} />}
        <div className="min-w-0 flex-[1.15]">{titleBtn("block w-full")}{subLine}</div>
        <div className="min-w-0 flex-1">{taskLine}</div>
        {flag && <div className="max-w-[112px] shrink-0">{flag}</div>}
      </div>
      {expanded && <div style={{ paddingLeft: showImg ? 42 : 0 }}>{expanded}</div>}
    </div>
  );
  return (
    <div className="flex gap-2.5 px-3 py-2 hover:bg-slate-50/80">
      {showImg && <Thumb src={it.imageUrl} size={36} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">{titleBtn("flex-1")}{flag && <div className="max-w-[45%] shrink-0">{flag}</div>}</div>
        {subLine}
        {taskLine && <div className="mt-0.5">{taskLine}</div>}
        {expanded}
      </div>
    </div>
  );
}

/** เนื้อในป๊อป (ไม่มีกรอบ · แถวชิดขอบ) — ใช้ทั้งป๊อปจริงและตัวอย่างในหน้าตั้งค่า (preview = ติ๊กไม่ได้)
 *  ความกว้าง/รูป มาจากการ์ด (FloatViewContext) · นอกการ์ด = แบบแคบ */
export function WorkPopupBody({ data, onOpen, onTick, done, preview }: {
  data: WorkPopupPayload;
  onOpen?: (path: string) => void;
  onTick?: (taskId: string, done: boolean) => void;
  done?: Set<string>;
  preview?: boolean;
}) {
  const { level, hideImg } = useFloatView();
  const img = !hideImg;
  const s = data.stats;
  const fields = new Set<string>(data.fields ?? []);
  const canTick = (t: WorkPopupTask) => t.mine || data.can_tick_all;
  const mineOpen = data.mine.reduce((n, m) => n + m.tasks.filter((t) => !done?.has(t.id)).length, 0);
  // ปุ่มสลับรายการในป๊อป (ต้องตามวันนี้ / มีของรอ / ค้างทั้งหมด) — ข้อมูลเก่าที่ไม่มี all = ป้ายตัวเลขเฉย ๆ แบบเดิม
  const [tab, setTab] = useState<PopupTab>("today");
  const tabs = data.audience === "all" && !!data.all;
  const tabList = !tabs || tab === "today" ? null : (data.all ?? []).filter((i) => tab === "all" || i.waiting);
  const showStats = data.show_stats !== false;
  const row = (it: WorkPopupItem, tasks: WorkPopupTask[], ct: (t: WorkPopupTask) => boolean, strong?: boolean) => (
    <ItemRow key={it.id} it={it} fields={fields} tasks={tasks} canTick={ct} onTick={onTick} onOpen={onOpen} done={done} strong={strong} level={level} img={img} />
  );
  const seg = (k: PopupTab, label: string, n: number) => (
    <button type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
      className={`h-6 whitespace-nowrap rounded-md px-2 text-xs ${tab === k ? "bg-white font-medium text-slate-800 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`}>
      {label} <span className="text-slate-400">{n}</span>
    </button>
  );
  const stat = (cls: string, label: string) => <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>;
  const band = (icon: string, label: string, extra?: ReactNode, indigo?: boolean, hint?: string) => (
    <div title={hint} className={`flex items-center gap-1.5 border-y px-3 py-1 text-[11px] font-medium ${indigo ? "border-indigo-100 bg-indigo-50/70 text-indigo-800" : "border-slate-100 bg-slate-50 text-slate-600"}`}>
      <Icon name={icon} /><span className="min-w-0 truncate">{label}</span>{extra}
    </div>
  );
  const moreNote = (n: number) => <p className="px-3 py-1.5 text-[11px] text-slate-500">และอีก {n} งาน — กด &quot;ดูทั้งหมด&quot;</p>;
  const empty = (text: string) => (
    <p className="m-3 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-700"><Icon name="celebrate" /> {text}</p>
  );
  const hasRows = tabList ? tabList.length > 0 : data.mine.length > 0 || (data.audience === "all" && data.urgent.length > 0);
  // แบบกว้าง: หัวคอลัมน์ครั้งเดียวบนสุด
  const colHead = level === 3 && hasRows && (
    <div className="grid items-center gap-x-2.5 px-3 pb-0.5 pt-1 text-[11px] text-slate-400" style={{ gridTemplateColumns: wideCols(img && fields.has("img"), fields.has("code")) }}>
      {img && fields.has("img") && <span />}
      {fields.has("code") && <span>เลขที่</span>}
      <span>ชื่องาน</span><span>สถานะ</span><span>ต้องทำต่อ</span><span className="text-right">เตือน</span>
    </div>
  );
  return (
    <div className="pb-1">
      {data.audience === "all" && (showStats || tabs) && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5">
          {tabs && (
            <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-0.5">
              {seg("today", plainLabel(data.urgent_label), data.mine.length + data.urgent.length + data.more)}
              {s.waiting > 0 && seg("waiting", "มีของรอ", s.waiting)}
              {seg("all", "ค้างทั้งหมด", s.total)}
            </div>
          )}
          {showStats && s.overdue > 0 && stat("bg-rose-50 text-rose-700", `เกินกำหนด ${s.overdue}`)}
          {showStats && s.due_soon > 0 && stat("bg-amber-50 text-amber-700", `ใกล้กำหนด ${s.due_soon}`)}
          {!tabs && showStats && s.waiting > 0 && stat("bg-blue-50 text-blue-700", `มีของรอ ${s.waiting} ใบ`)}
          {!tabs && showStats && stat("bg-slate-100 text-slate-600", `ค้างทั้งหมด ${s.total}`)}
        </div>
      )}
      {colHead}

      {/* รายการ มีของรอ / ค้างทั้งหมด — จาก data.all (ด่วนก่อน) · ติ๊กของรอได้ตามสิทธิ์เหมือนเดิม */}
      {tabList && (
        <section>
          {band(tab === "all" ? "list" : "waiting", tab === "all" ? "ค้างทั้งหมด (ด่วนก่อน)" : "ใบที่มีของรอ", <span className="font-normal text-slate-400">{tabList.length}</span>)}
          {tabList.length > 0
            ? <div className="divide-y divide-slate-100">{tabList.map((u) => row(u, fields.has("wait") ? u.tasks : [], canTick))}</div>
            : empty("ไม่มีรายการในแท็บนี้")}
          {tab === "all" && s.total > tabList.length && moreNote(s.total - tabList.length)}
        </section>
      )}
      {!tabList && (<>
        {/* งานของคุณ — ขึ้นก่อน · ข้อของคุณติ๊กได้เสมอ */}
        {data.mine.length > 0 && (
          <section>
            {band("user", "งานของคุณ", <span className="font-normal text-indigo-600">· {mineOpen > 0 ? `เหลือ ${mineOpen} ข้อ` : "ครบแล้ว"}</span>, true, "ติ๊กเมื่อทำเสร็จ — ทีมเห็นในใบงานทันที")}
            <div className="divide-y divide-slate-100">{data.mine.map((m) => row(m, m.tasks, () => true, true))}</div>
          </section>
        )}
        {/* ต้องตามวันนี้ (หรือทุกงานเรียงด่วนก่อน — urgent_label) · ของรอติ๊กได้ตามสิทธิ์ (can_tick_all / ข้อของตัวเอง) */}
        {data.audience === "all" && data.urgent.length > 0 && (
          <section>
            {band("hot", plainLabel(data.urgent_label), <span className="font-normal text-slate-400">{data.urgent.length}</span>)}
            <div className="divide-y divide-slate-100">{data.urgent.map((u) => row(u, fields.has("wait") ? u.tasks : [], canTick))}</div>
            {data.more > 0 && moreNote(data.more)}
          </section>
        )}
        {data.mine.length === 0 && (data.audience === "mine" || data.urgent.length === 0) && empty("ไม่มีงานที่ต้องตามตอนนี้ เยี่ยมมาก")}
      </>)}
      {data.audience === "mine" && data.mine.length > 0 && !preview && (
        <p className="px-3 pt-1.5 text-[11px] text-slate-400">คุณเห็นป๊อปนี้เพราะมีข้อในเช็กลิสต์ &quot;รออะไรอยู่&quot; ที่ใส่ชื่อคุณไว้</p>
      )}
    </div>
  );
}


/** อ่าน ?popup=<id> (ลิงก์จากกระดิ่ง) — แยกเป็นตัวลูกใน Suspense ตามกฎ useSearchParams ของ Next */
function PopupParam({ onParam }: { onParam: (id: string) => void }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const id = sp?.get("popup") ?? "";
  useEffect(() => {
    if (!UUID.test(id)) return;
    onParam(id);
    const next = new URLSearchParams(sp?.toString() ?? "");
    next.delete("popup");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return null;
}

export function WorkPopupHost() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [queue, setQueue] = useState<WorkPopupPayload[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const lastCheck = useRef(0);
  const uid = user?.id ?? null;
  // หน้าที่ฝังในกรอบ (เช่น แท็บตั้งค่าแอป ?embed=1) ไม่เด้ง — ให้หน้าหลักเด้งที่เดียว ไม่ซ้อน 2 ป๊อป
  const inFrame = typeof window !== "undefined" && window.self !== window.top;
  const skip = inFrame || isChromelessPath(pathname);
  // ลอยมุมจอ (จอคอม) / ซ่อน — ค่าตั้งต่อคนจากเมนูโปรไฟล์ (./float) · ปิดอยู่ = ไม่ถาม ไม่เด้ง (ยกเว้นกดลิงก์ ?popup= จากกระดิ่งเอง)
  const [floatPref] = useWorkPopupFloatPref();
  const wide = useFloatScreen();
  const [forced, setForced] = useState<Set<string>>(new Set());
  const enabled = floatPref.enabled;

  // จอคอม = ปุ่มลอยอยู่ทั้งวัน: ขอป๊อปของวันนี้ทั้งหมด (?all=1) · กางเองเฉพาะที่ "ถึงเวลา" (due) และยังไม่ปิดในแท็บนี้
  const [expanded, setExpanded] = useState(false);
  const collapse = useCallback(() => setExpanded(false), []);   // ค่าคงที่ — การ์ดผูกตัวฟัง "กดข้างนอก" ครั้งเดียว
  const [tab, setTab] = useState<"work" | "gif" | "line" | "bell" | "watches" | "tasks" | "plan" | "deploy">("work");
  // ตั้งค่าการแจ้งเตือนต่อคน (หน้าต่างตัว Pet → การแจ้งเตือน · lib/notify-sources): โชว์ในศูนย์ / ตัว Pet เด้งบอก / ห้ามรบกวน
  const [notifyPrefs] = useNotifyPrefs();
  const showIn = (key: string) => notifyOn(notifyPrefs, key, "center");
  const bounceOn = (key: string) => notifyOn(notifyPrefs, key, "bounce");
  const quietNow = inQuietHours(notifyPrefs.quiet);   // ห้ามรบกวน: ตัว Pet ไม่เด้ง (ยังเปิดดูได้)
  // แท็บที่ผู้ใช้ปิดไว้ในหน้า "จัดศูนย์แจ้งเตือน" (work_popup_float.tabHidden) = ไม่โชว์ ไม่นับบนตัว Pet ไม่เด้ง (และไม่ถามข้อมูลแท็บนั้น)
  const hiddenTabs = new Set(floatPref.tabHidden ?? []);
  const tabOn = (k: string) => !hiddenTabs.has(k);
  const workShown = showIn("work") && tabOn("work");
  const workShownRef = useRef(workShown);
  workShownRef.current = workShown;
  const quietRef = useRef(quietNow);   // ห้ามรบกวน = ไม่กางการ์ดเอง (ป๊อปยังอยู่ในตัว Pet)
  quietRef.current = quietNow;

  // ── แท็บ GIF: กล่องรับ "ส่ง GIF ให้เพื่อน" (จอคอมเท่านั้น — ตัว Pet อยู่บนจอคอม) ──
  const [pokes, setPokes] = useState<GifPoke[]>([]);
  const [pokeSeen, setPokeSeen] = useState<Set<string>>(new Set());
  const [gifModal, setGifModal] = useState<{ reply: GifPoke | null } | null>(null);
  useEffect(() => { if (uid) setPokeSeen(readPokeSeen(uid)); }, [uid]);
  const loadPokes = useCallback(async () => {
    if (!uid) return;
    try {
      const r = await apiFetch("/api/gif-poke");
      if (!r.ok) return;
      const j = (await r.json()) as { data?: GifPoke[] };
      setPokes(Array.isArray(j.data) ? j.data : []);
    } catch { /* เงียบ */ }
  }, [uid]);
  useEffect(() => {
    if (!uid || skip || !enabled || !wide) return;
    const first = setTimeout(() => void loadPokes(), 3000);
    const iv = window.setInterval(() => { if (document.visibilityState === "visible") void loadPokes(); }, POKE_POLL_MS);
    return () => { clearTimeout(first); window.clearInterval(iv); };
  }, [uid, skip, enabled, wide, loadPokes]);
  // ── แท็บ LINE: ของจากกลุ่มไลน์ที่ยังรอคนจัดการ (งานออกแบบ / คำสั่งซื้อ — ตามสิทธิ์) · โหลดพร้อมรอบ GIF ──
  const [linePending, setLinePending] = useState<LinePendingPayload | null>(null);
  const loadLine = useCallback(async () => {
    if (!uid) return;
    try {
      const r = await apiFetch("/api/line/pending");
      if (!r.ok) return;
      const j = (await r.json()) as { data?: LinePendingPayload };
      setLinePending(j.data ?? null);
    } catch { /* เงียบ */ }
  }, [uid]);
  useEffect(() => {
    if (!uid || skip || !enabled || !wide) return;
    const first = setTimeout(() => void loadLine(), 3500);
    const iv = window.setInterval(() => { if (document.visibilityState === "visible") void loadLine(); }, POKE_POLL_MS);
    return () => { clearTimeout(first); window.clearInterval(iv); };
  }, [uid, skip, enabled, wide, loadLine]);
  useRefresh(() => { if (wide && enabled && !skip) void loadLine(); });
  const lineShown: LinePendingPayload | null = linePending && tabOn("line") ? {
    design: showIn("line_design") ? linePending.design : undefined,
    order: showIn("line_order") ? linePending.order : undefined,
  } : null;
  const lineCount = linePendingCount(lineShown);

  // ── แท็บ Task: งาน Task Manager ที่รอฉัน (รอตรวจ / ต้องแก้ / มอบให้ — GET /api/creative-tasks/inbox · lib/task-inbox) ──
  // ถามทุก 3 นาที เหมือนแท็บ LINE · ปิด "โชว์ในศูนย์" ของเรื่องนี้ = ไม่ถามเลย · ตัวนับ = รอตรวจ + ต้องแก้
  const tasksOn = enabled && showIn("tasks") && tabOn("tasks");
  const tasksOnRef = useRef(tasksOn);
  tasksOnRef.current = tasksOn;
  const [inbox, setInbox] = useState<InboxPayload | null>(null);
  const [qc, setQc] = useState<{ item: InboxItem; mode?: "revise" } | null>(null);   // แผงตรวจเร็ว (วางนอกการ์ด)
  const loadInbox = useCallback(async () => {
    if (!uid) return;
    try {
      const r = await apiFetch("/api/creative-tasks/inbox");
      if (!r.ok) return;   // ไม่มีสิทธิ์ดูงาน = แท็บไม่ขึ้น
      const j = (await r.json()) as { data?: InboxPayload };
      setInbox(j.data ?? null);
    } catch { /* เงียบ */ }
  }, [uid]);
  useEffect(() => {
    if (!uid || skip || !tasksOn || !wide) { if (!tasksOn) setInbox(null); return; }
    const first = setTimeout(() => void loadInbox(), 4000);
    const iv = window.setInterval(() => { if (document.visibilityState === "visible") void loadInbox(); }, POKE_POLL_MS);
    return () => { clearTimeout(first); window.clearInterval(iv); };
  }, [uid, skip, tasksOn, wide, loadInbox]);
  useRefresh(() => { if (wide && tasksOn && !skip) void loadInbox(); });
  const taskCount = tasksOn ? inboxCount(inbox) : 0;
  const taskTabOn = tasksOn && !!inbox && (inbox.review.length + inbox.revision.length + inbox.assigned.length) > 0;
  const taskSeenKey = uid ? `fpet-task-seen:${uid}` : "";
  const [taskSeen, setTaskSeen] = useState<Set<string>>(new Set());
  useEffect(() => { if (taskSeenKey) setTaskSeen(readIds(taskSeenKey)); }, [taskSeenKey]);
  // งานใหม่ที่ยังไม่เคยเห็น (รอตรวจ/ต้องแก้ · จำเป็น id+สถานะ: ถูกตีกลับรอบใหม่ = นับเป็นของใหม่)
  const newTasks = tasksOn && bounceOn("tasks") && inbox
    ? [...inbox.review, ...inbox.revision].filter((it) => !taskSeen.has(`${it.id}:${it.status}`))
    : [];

  // ── แท็บ แผนงาน: งานแผนงานทีมของฉัน (GET /api/team-plan?mine=1 · กลุ่ม/คำพูด lib/team-plan-pet) ──
  // ถามทุก 3 นาที · นาฬิกาในเครื่องเดินทุก 1 นาที (ถึงเวลาเตือน/เลยกำหนด → ตัว Pet พูดได้ทันที ไม่ต้องรอถามเซิร์ฟเวอร์)
  // ตัวนับ = เกินกำหนด + ครบวันนี้ · เปิดแท็บนี้อยู่ → เรื่องแผนงานในแท็บกระดิ่งไม่ขึ้นซ้ำ (เด้งที่เครื่องยังเหมือนเดิม)
  const planOn = enabled && showIn("plan") && tabOn("plan");
  const planOnRef = useRef(planOn);
  planOnRef.current = planOn;
  const [planItems, setPlanItems] = useState<PlanItem[] | null>(null);
  const [planEdit, setPlanEdit] = useState<PlanItem | null>(null);   // ป๊อปแก้งาน (วางนอกการ์ด)
  const [planNow, setPlanNow] = useState(() => Date.now());
  const loadPlan = useCallback(async () => {
    if (!uid) return;
    try {
      const r = await apiFetch("/api/team-plan?mine=1");
      if (!r.ok) return;   // ไม่มีสิทธิ์ดูงาน = แท็บไม่ขึ้น
      const j = (await r.json()) as { data?: PlanItem[] };
      setPlanItems(Array.isArray(j.data) ? j.data : []);
    } catch { /* เงียบ */ }
  }, [uid]);
  useEffect(() => {
    if (!uid || skip || !planOn || !wide) { if (!planOn) setPlanItems(null); return; }
    const first = setTimeout(() => void loadPlan(), 4500);
    const iv = window.setInterval(() => { if (document.visibilityState === "visible") void loadPlan(); }, POKE_POLL_MS);
    const tick = window.setInterval(() => setPlanNow(Date.now()), 60_000);
    return () => { clearTimeout(first); window.clearInterval(iv); window.clearInterval(tick); };
  }, [uid, skip, planOn, wide, loadPlan]);
  useRefresh(() => { if (wide && planOn && !skip) void loadPlan(); });
  const planGroups = planOn && planItems && uid ? groupMyPlan(planItems, uid, new Date(planNow)) : null;
  const planCount = planPetCount(planGroups);
  const planTabOn = !!planGroups && Object.values(planGroups).some((l) => l.length > 0);
  const planSeenKey = uid ? `fpet-plan-seen:${uid}` : "";
  const [planSeen, setPlanSeen] = useState<Set<string>>(new Set());
  useEffect(() => { if (planSeenKey) setPlanSeen(readIds(planSeenKey)); }, [planSeenKey]);
  const newPlan = planOn && bounceOn("plan") && planItems && uid
    ? planPetNews(planItems, uid, new Date(planNow)).filter((n) => !planSeen.has(n.key))
    : [];

  // ── แท็บ ของฉัน: การเตือนที่ตั้งเอง (components/my-watches · GET /api/my-watches) — โหลดพร้อมรอบ GIF ──
  const watchesOn = enabled && showIn("watches") && tabOn("watches");
  const [watchPref] = useMyWatches();
  const hasWatches = watchPref.list.some((w) => w.on);
  const { data: watchData, reload: reloadWatches } = useMyWatchesData(wide && !skip && watchesOn && hasWatches && !!uid);
  useEffect(() => {
    if (!uid || skip || !watchesOn || !hasWatches || !wide) return;
    const iv = window.setInterval(() => { if (document.visibilityState === "visible") void reloadWatches(); }, POKE_POLL_MS);
    return () => window.clearInterval(iv);
  }, [uid, skip, watchesOn, hasWatches, wide, reloadWatches]);
  const watchList = watchesOn && hasWatches ? watchData?.watches ?? [] : [];
  const watchCount = watchesOn && hasWatches ? watchData?.unique ?? 0 : 0;
  const watchSeenKey = uid ? `fpet-watch-seen:${uid}` : "";
  const [watchSeen, setWatchSeen] = useState<Set<string>>(new Set());
  useEffect(() => { if (watchSeenKey) setWatchSeen(readIds(watchSeenKey)); }, [watchSeenKey]);
  const bounceWatchIds = new Set(watchPref.list.filter((w) => w.on && w.bounce).map((w) => w.id));
  const newWatch = bounceOn("watches")
    ? [...new Map(watchList.filter((w) => bounceWatchIds.has(w.id)).flatMap((w) => w.items.map((it) => [it.id, { ...it, watch: w.label }] as const))).values()].filter((it) => !watchSeen.has(it.id))
    : [];
  useEffect(() => {
    if (!expanded || !uid || tab !== "watches" || !newWatch.length) return;
    const n = new Set([...watchSeen, ...newWatch.map((x) => x.id)]); setWatchSeen(n); saveIds(watchSeenKey, n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, tab, uid, newWatch.length]);
  const lineSeenKey = uid ? `fpet-line-seen:${uid}` : "";
  const [lineSeen, setLineSeen] = useState<Set<string>>(new Set());
  useEffect(() => { if (lineSeenKey) setLineSeen(readIds(lineSeenKey)); }, [lineSeenKey]);
  const newLine = [
    ...(lineShown?.design && bounceOn("line_design") ? lineShown.design.items : []),
    ...(lineShown?.order && bounceOn("line_order") ? lineShown.order.items : []),
  ].filter((it) => !lineSeen.has(it.id));

  // ── แท็บ ขึ้นเว็บ: สถานะขึ้นเว็บจริง (ผู้ดูแลระบบ · GET /api/admin/deploy ตัวเดียวกับหน้า /admin/deploy) ──
  //   ตัว Pet พูดเมื่อมี "เรื่องใหม่" (มีงานรอรอบ / ส่งขึ้นเว็บ / กำลัง build / ขึ้นแล้ว / build ล้ม — deployPetNews) · เปิดแท็บดู = เห็นแล้ว
  const canDeploy = usePermission("admin.users");
  const deployOn = enabled && wide && !skip && !!uid && canDeploy && showIn("deploy") && tabOn("deploy");
  const { status: deployStatus, error: deployError, reload: reloadDeploy } = useDeployStatus(deployOn);
  const [deployClock, setDeployClock] = useState(() => new Date());
  useEffect(() => { setDeployClock(new Date()); }, [deployStatus?.fetchedAt]);
  const deployNews = deployOn && deployStatus ? deployPetNews(deployStatus, deployClock) : null;
  // ตัวเลขในคำพูด ("อีกราว N นาที") + หมดเวลาพูด "ขึ้นเว็บแล้ว" — เดินทุก 15 วิ เฉพาะตอนมีเรื่อง (ไม่ re-render ทั้งศูนย์ทุกวินาที)
  const hasDeployNews = !!deployNews;
  useEffect(() => {
    if (!hasDeployNews) return;
    const t = window.setInterval(() => setDeployClock(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, [hasDeployNews]);
  const deploySeenKey = uid ? `fpet-deploy-seen:${uid}` : "";
  const [deploySeen, setDeploySeen] = useState<Set<string>>(new Set());
  useEffect(() => { if (deploySeenKey) setDeploySeen(readIds(deploySeenKey)); }, [deploySeenKey]);
  const newDeploy = deployNews && bounceOn("deploy") && !deploySeen.has(deployNews.key) ? deployNews : null;
  // กำลังขึ้นเว็บอยู่ (รอรอบ / ส่ง / build) = ตัว Pet พูดค้างจนเสร็จ แม้เปิดแท็บดูแล้ว — ตื่น (ลอยเบา ๆ) แต่ไม่กระโดด
  const stickyDeploy = deployNews?.sticky && bounceOn("deploy") ? deployNews : null;
  const deployCount = deployOn ? deployStatus?.waiting.length ?? 0 : 0;
  useEffect(() => {
    if (!expanded || tab !== "deploy" || !deployNews || !deploySeenKey || deploySeen.has(deployNews.key)) return;
    const n = new Set([...deploySeen, deployNews.key]); setDeploySeen(n); saveIds(deploySeenKey, n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, tab, deployNews?.key, deploySeenKey]);

  // ── แท็บ กระดิ่ง: แจ้งเตือนที่ยังไม่อ่าน (ตัวดึงกลางเดียวกับกระดิ่งบนแถบ) เฉพาะประเภทที่เปิดโชว์ในศูนย์ ──
  const feed = useNotificationFeed(wide && enabled && !skip && tabOn("bell") ? uid : null);
  const bellItems = !tabOn("bell") ? [] : feed.items.filter((n) => { const k = bellSourceOf(n.event_type); return !n.read_at && k !== "work" && showIn(k) && !(k === "bell.team_plan" && planOn); });
  const bellSeenKey = uid ? `fpet-bell-seen:${uid}` : "";
  const [bellSeen, setBellSeen] = useState<Set<string>>(new Set());
  useEffect(() => { if (bellSeenKey) setBellSeen(readIds(bellSeenKey)); }, [bellSeenKey]);
  const newBell = bellItems.filter((n) => !bellSeen.has(n.id) && bounceOn(bellSourceOf(n.event_type)));
  // เปิดแท็บ LINE / กระดิ่ง ดูแล้ว = เห็นแล้ว (ตัว Pet เลิกเด้งเพราะเรื่องนั้น)
  useEffect(() => {
    if (!expanded || !uid) return;
    if (tab === "line" && newLine.length) { const n = new Set([...lineSeen, ...newLine.map((x) => x.id)]); setLineSeen(n); saveIds(lineSeenKey, n); }
    if (tab === "bell" && newBell.length) { const n = new Set([...bellSeen, ...newBell.map((x) => x.id)]); setBellSeen(n); saveIds(bellSeenKey, n); }
    if (tab === "tasks" && newTasks.length) { const n = new Set([...taskSeen, ...newTasks.map((x) => `${x.id}:${x.status}`)]); setTaskSeen(n); saveIds(taskSeenKey, n); }
    if (tab === "plan" && newPlan.length) { const n = new Set([...planSeen, ...newPlan.map((x) => x.key)]); setPlanSeen(n); saveIds(planSeenKey, n); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, tab, uid, newLine.length, newBell.length, newTasks.length, newPlan.length]);
  const dismissPoke = (id: string) => {
    setPokes((ps) => ps.filter((p) => p.id !== id));
    void apiFetch("/api/gif-poke", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
  };
  const newPokes = pokes.filter((p) => !pokeSeen.has(p.id));
  // เปิดแท็บ GIF ดูแล้ว = เห็นแล้ว (ตัว Pet เลิกกระโดดเพราะ GIF)
  useEffect(() => {
    if (!uid || !expanded || tab !== "gif" || !newPokes.length) return;
    const next = new Set([...pokeSeen, ...pokes.map((p) => p.id)]);
    setPokeSeen(next);
    try { localStorage.setItem(pokeSeenKey(uid), JSON.stringify([...next].slice(-200))); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, expanded, tab, newPokes.length]);

  // quiet = โหลดข้อมูลใหม่เงียบ ๆ (หลังมีการแก้ / กดกาง / กลับมาที่แท็บ) — ไม่เด้งกางเอง
  const check = useCallback(async (reportId?: string, quiet = false) => {
    if (!uid) return;
    if (!reportId && !enabled) return;
    lastCheck.current = Date.now();
    const allDay = wide && !reportId;
    try {
      const r = await apiFetch(`/api/popups/active${reportId ? `?report=${reportId}` : allDay ? "?all=1" : ""}`);
      if (!r.ok) return;
      const j = (await r.json()) as { data?: WorkPopupPayload[] };
      const seen = reportId ? [] : readSeen(uid);
      const list = (j.data ?? [])
        .filter((p) => allDay || !seen.includes(p.report_id))
        .map((p) => ({ ...p, due: !!reportId || (p.due !== false && !seen.includes(p.report_id)) }));
      if (allDay) setQueue(list);   // ทั้งวัน = แทนทั้งชุด (ของที่หมดวัน/ปิดรายงานแล้วหายไปด้วย)
      else if (list.length) setQueue((q) => [...q.filter((x) => !list.some((y) => y.report_id === x.report_id)), ...list]);
      setDone(new Set());   // ข้อมูลใหม่จากเซิร์ฟเวอร์ = ความจริงล่าสุด (ข้อที่ติ๊กแล้วหายไปเอง)
      if (!quiet && workShownRef.current && !quietRef.current && list.some((p) => p.due)) { setExpanded(true); setTab("work"); }
    } catch { /* เงียบ — ป๊อปไม่ขึ้นไม่ทำให้หน้าพัง */ }
  }, [uid, enabled, wide]);

  // ถามครั้งแรกหลังหน้าโหลด (ไม่แย่งโหลดเนื้อหาหลัก)
  useEffect(() => {
    if (!uid || skip || !enabled || lastCheck.current) return;
    const t = setTimeout(() => void check(), 2500);
    return () => clearTimeout(t);
  }, [uid, skip, enabled, check]);
  // เปิดกลับจากเมนูโปรไฟล์ → ถามใหม่ทันที (ป๊อปที่ยังไม่รับทราบวันนี้กลับมา)
  const prevEnabled = useRef(enabled);
  useEffect(() => {
    // ยังไม่เคยถาม (เปิดหน้าแรกด้วยค่าเก่า "ปิด") = ให้ตัวถามครั้งแรกด้านบนทำ ไม่ถามซ้ำ 2 รอบ
    if (enabled && !prevEnabled.current && uid && !skip && lastCheck.current) void check();
    prevEnabled.current = enabled;
  }, [enabled, uid, skip, check]);
  // มีการบันทึก/แก้ข้อมูลในระบบ (กริ่งกลาง refresh-bus) → ป๊อปลอยโหลดใหม่เงียบ ๆ
  const queueLenRef = useRef(0);
  queueLenRef.current = queue.length;
  useRefresh(() => { if (wide && enabled && queueLenRef.current > 0 && !skip) void check(undefined, true); });
  // การ์ดกางค้างไว้ → โหลดใหม่ทุก 2 นาที (แก้จากหน้าในกรอบแอปเดี่ยว / เครื่องอื่น กริ่งด้านบนไม่ได้ยิน)
  useEffect(() => {
    if (!wide || !enabled || !expanded || skip || !uid) return;
    const t = window.setInterval(() => { if (document.visibilityState === "visible" && queueLenRef.current > 0) void check(undefined, true); }, 2 * 60_000);
    return () => window.clearInterval(t);
  }, [wide, enabled, expanded, skip, uid, check]);
  // เปิดแท็บค้างไว้ทั้งวัน → กลับมาที่แท็บเกิน 30 นาที ถามใหม่ (เผื่อเพิ่งเข้าช่วงเวลาเด้ง)
  // ป๊อปลอย (จอคอม) มีอยู่แล้ว → กลับมาที่แท็บเกิน 1 นาที = โหลดข้อมูลใหม่เงียบ ๆ (งานที่แก้จากที่อื่นอัปเดตตาม)
  useEffect(() => {
    if (!uid) return;
    const onVis = () => {
      if (document.visibilityState !== "visible" || !lastCheck.current || skip) return;
      const age = Date.now() - lastCheck.current;
      if (age > RECHECK_MS) void check();
      else if (wide && queueLenRef.current > 0 && age > 60_000) void check(undefined, true);
      if (wide && age > 60_000) { void loadPokes(); void loadLine(); if (tasksOnRef.current) void loadInbox(); if (planOnRef.current) void loadPlan(); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [uid, skip, check, wide, loadPokes, loadLine, loadInbox, loadPlan]);

  // จอคอม: แสดงตัวที่ถึงเวลาก่อน ไม่มีก็ตัวแรก (เป็นปุ่มเล็ก) · จอเล็ก: เฉพาะตัวที่ถึงเวลา (หน้าต่างกลางจอแบบเดิม)
  const cur = (wide ? (queue.find((x) => x.due) ?? queue[0]) : queue.find((x) => x.due !== false)) ?? null;
  const finish = (p: WorkPopupPayload, action: "ack" | "later") => {
    if (uid) markSeen(uid, p.report_id);
    if (wide) {
      // ลอย: ไม่หายไป แค่ยุบเป็นปุ่มเล็ก (กดดูได้ทั้งวัน)
      setQueue((q) => q.map((x) => (x.report_id === p.report_id ? { ...x, due: false, acked: x.acked || action === "ack" } : x)));
      setExpanded(queue.some((x) => x.report_id !== p.report_id && x.due));
    } else {
      setQueue((q) => q.filter((x) => x.report_id !== p.report_id));
    }
    void apiFetch("/api/popups/ack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report_id: p.report_id, action }) }).catch(() => {});
  };
  // อยู่ในแอปเดี่ยว (/app/<key>) → เปิดในแท็บเมนูของแอปนั้น · แอปนั้นไม่มีเมนูหน้านี้ → ERP เต็มในแท็บใหม่ (หน้าแอปเดิมยังอยู่)
  const open = (p: WorkPopupPayload, path: string, action: "ack" | "later") => {
    finish(p, action);
    if (openInStandaloneApp(path)) return;
    if (isStandaloneAppPath(pathname)) { window.open(path, "_blank", "noopener"); return; }
    router.push(path);
  };
  // ปุ่มในแท็บ LINE → หน้าที่จัดการรายการนั้น (แอปเดี่ยว = เปิดในแท็บเมนูของแอป · หน้าเดียวกันอยู่แล้ว = โหลดใหม่ให้เปิดรายการ)
  const go = (href: string) => {
    if (openInStandaloneApp(href)) return;
    if (isStandaloneAppPath(pathname)) { window.open(href, "_blank", "noopener"); return; }
    if (href.split("?")[0] === pathname) { window.location.assign(href); return; }
    router.push(href);
  };
  const tick = async (taskId: string, isDone: boolean) => {
    setDone((s) => { const n = new Set(s); if (isDone) n.add(taskId); else n.delete(taskId); return n; });
    try {
      const r = await apiFetch(`/api/record-tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: isDone ? "resolved" : "open", actor: user?.name }) });
      if (!r.ok) throw new Error();
    } catch {
      setDone((s) => { const n = new Set(s); if (isDone) n.delete(taskId); else n.add(taskId); return n; });
      toast.error("ติ๊กไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  };

  // ปิดถาวรทำได้ที่เดียว = เมนูโปรไฟล์ (สวิตช์ในนั้นตั้ง enabled) · ✕ บนการ์ด = แค่ซ่อนเป็นปุ่มเล็ก (collapse)
  const visible = !!cur && !skip && (enabled || forced.has(cur.report_id));
  const title = cur ? `${cur.audience === "mine" ? "งานที่รอคุณอยู่" : cur.heading}` : "";
  const subtitle = cur
    ? `${new Date(`${cur.date}T00:00:00Z`).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}${queue.length > 1 ? ` · ป๊อป ${queue.length} รายการ` : ""}`
    : "";
  const mineOpen = cur ? cur.mine.reduce((n, m) => n + m.tasks.filter((t) => !done.has(t.id)).length, 0) : 0;
  const pill = !cur ? "" : cur.audience === "mine"
    ? `งานของคุณ ${mineOpen}`
    : `งานค้าง ${cur.stats.total}${mineOpen > 0 ? ` · ของคุณ ${mineOpen}` : ""}`;
  // ยังไม่ถึงเวลา/รับทราบแล้ว (เปิดดูเองจากปุ่มลอย) → ไม่ต้องมี "ไว้ทีหลัง" · รับทราบแล้วบอกไว้
  const pending = !!cur && cur.due !== false;
  const footer = cur && (
    <div className="flex w-full flex-wrap items-center justify-end gap-1.5">
      {cur.view_all && cur.audience === "all" && (
        <button onClick={() => open(cur, cur.view_all!, pending ? "ack" : "later")} className="mr-auto inline-flex h-8 items-center rounded-md px-2 text-xs font-medium text-blue-700 hover:bg-blue-50">ดูทั้งหมด →</button>
      )}
      {pending && <button onClick={() => finish(cur, "later")} className="h-8 rounded-md border border-slate-300 px-3 text-xs text-slate-600 hover:bg-slate-50">ไว้ทีหลัง</button>}
      {!pending && cur.acked
        ? <span className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-50 px-2.5 text-xs text-emerald-700"><Icon value="i:check" /> รับทราบแล้ววันนี้</span>
        : <button onClick={() => finish(cur, "ack")} className="inline-flex h-8 items-center gap-1 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"><Icon value="i:check" /> รับทราบ</button>}
    </div>
  );

  // ── ศูนย์แจ้งเตือน (จอคอม): ตัว Pet + แท็บ งาน / LINE / กระดิ่ง / GIF — โชว์ตามตั้งค่าการแจ้งเตือน (lib/notify-sources) ──
  // กดลิงก์ ?popup= เอง = เปิดป๊อปนั้นเสมอ แม้ปิด "โชว์ในศูนย์" ของป๊อปเตือนงานไว้
  const workTabOn = !!cur && visible && (workShown || forced.has(cur.report_id));
  const workCount = workTabOn && cur ? (cur.audience === "mine" ? mineOpen : cur.stats.total) : 0;
  const gifOn = enabled && showIn("gif") && tabOn("gif");
  const gifCount = gifOn ? pokes.length : 0;
  const bellCount = enabled ? bellItems.length : 0;
  const floatOn = wide && !skip && (enabled || workTabOn) && (workTabOn || (enabled && (gifCount > 0 || lineCount > 0 || bellCount > 0 || watchCount > 0 || taskTabOn || planTabOn || deployOn)));
  const tabs: FloatTab[] = [
    ...(workTabOn && cur ? [{
      key: "work", label: "งาน", icon: "list", count: workCount, subtitle: `${title} · ${subtitle}`, footer, flush: true,
      content: <WorkPopupBody data={cur} done={done} onTick={(id, d) => void tick(id, d)} onOpen={(path) => open(cur, path, "later")} />,
    }] : []),
    ...(taskTabOn ? [{
      key: "tasks", label: "Task", icon: "inspect", count: taskCount, subtitle: "งาน Task Manager ที่รอคุณ",
      content: <TaskInboxTab data={inbox} onGo={go} onQuickCheck={(item, mode) => setQc({ item, mode })} onChanged={() => void loadInbox()} />,
    }] : []),
    ...(planTabOn && uid ? [{
      key: "plan", label: "แผนงาน", icon: "calendar", count: planCount, subtitle: "แผนงานทีม · งานของฉัน",
      content: <PlanTab items={planItems} me={uid} onChanged={() => void loadPlan()} onOpen={setPlanEdit} onGo={go} />,
    }] : []),
    ...(enabled && lineCount > 0 ? [{
      key: "line", label: "LINE", icon: "chat", count: lineCount, subtitle: "ส่งเข้ากลุ่มไลน์แล้ว รอคนจัดการ",
      content: <LineInboxTab data={lineShown} onGo={go} />,
    }] : []),
    ...(bellCount > 0 ? [{
      key: "bell", label: "กระดิ่ง", icon: "notify", count: bellCount, subtitle: "แจ้งเตือนที่ยังไม่อ่าน",
      content: <BellTab items={bellItems} onOpen={(n) => { void feed.markRead(n); if (n.link_url) go(n.link_url); }} onReadAll={() => void feed.markAllRead()} />,
    }] : []),
    ...(watchCount > 0 ? [{
      key: "watches", label: "ของฉัน", icon: "star", count: watchCount, subtitle: "การเตือนที่คุณตั้งเอง",
      content: <WatchesTab watches={watchList} onGo={go} />,
    }] : []),
    ...(gifOn ? [{
      key: "gif", label: "GIF", icon: "gift", count: gifCount, subtitle: "GIF ที่เพื่อนส่งมา",
      content: <GifInbox pokes={pokes} newIds={new Set(newPokes.map((p) => p.id))} onDismiss={dismissPoke}
        onReply={(p) => setGifModal({ reply: p })} onSend={() => setGifModal({ reply: null })} />,
    }] : []),
    ...(deployOn ? [{
      key: "deploy", label: "ขึ้นเว็บ", icon: "build", count: deployCount, subtitle: "สถานะขึ้นเว็บจริง (รวมงานเป็นรอบ ~10 นาที)",
      content: <DeployTab status={deployStatus} error={deployError} onReload={() => void reloadDeploy()} />,
    }] : []),
  ];
  const activeTab = tabs.some((x) => x.key === tab) ? tab : (tabs[0]?.key ?? "work");
  // ตัว Pet เด้งบอก: เฉพาะเรื่องที่เปิด "Pet เด้งบอก" และไม่อยู่ในช่วงห้ามรบกวน
  const alertWork = workTabOn && pending && bounceOn("work");
  const alertGif = gifOn && bounceOn("gif") && newPokes.length > 0;
  const alertLine = enabled && newLine.length > 0;
  const alertBell = enabled && newBell.length > 0;
  const alertWatch = watchCount > 0 && newWatch.length > 0;
  const alertTasks = taskTabOn && newTasks.length > 0;
  const alertPlan = planTabOn && newPlan.length > 0;
  const alertDeploy = !!newDeploy;
  const petAlert = !quietNow && (alertWork || alertGif || alertLine || alertBell || alertWatch || alertTasks || alertPlan || alertDeploy);
  // ตัวเลขบนตัว Pet ไม่นับงานรอขึ้นเว็บ (ไม่ใช่งานของคน) — แต่ตอนมีเรื่องขึ้นเว็บใหม่ ตัว Pet ต้องตื่นมาพูด
  const total = workCount + gifCount + lineCount + bellCount + watchCount + taskCount + planCount;
  // ฟองค้าง = ไม่มีเรื่องใหม่อื่นให้พูด แต่ยังกำลังขึ้นเว็บอยู่ → พูดสถานะขึ้นเว็บต่อ (ไม่กระโดด)
  const stickyTalk = !quietNow && !petAlert && !!stickyDeploy;
  const petState = {
    mood: petMood({ total: total + (alertDeploy || stickyDeploy ? 1 : 0), alert: petAlert }),
    badge: petBadge(total),
    stickyBubble: stickyTalk,
    bubble: quietNow ? null
      : stickyTalk && stickyDeploy ? stickyDeploy.text
      : alertWork ? pill
      : alertDeploy && newDeploy ? newDeploy.text
      : alertPlan && newPlan[0].kind === "overdue" ? newPlan[0].text
      : alertTasks ? `${newTasks[0].status === "revision" ? "งานถูกตีกลับ" : "งานรอคุณตรวจ"}: ${newTasks[0].task_no ?? ""} ${newTasks[0].title}`.trim()
      : alertPlan ? newPlan[0].text
      : alertBell ? newBell[0].title
      : alertWatch ? `${newWatch[0].watch}: ${newWatch[0].title}`
      : alertLine ? `ไลน์: ${newLine[0].title}`
      : alertGif ? `${newPokes[newPokes.length - 1].from_name ?? "เพื่อน"} ส่ง GIF มา` : null,
  };

  return (
    <>
      <Suspense fallback={null}>{uid && <PopupParam onParam={(id) => { setForced((s) => new Set(s).add(id)); void check(id); }} />}</Suspense>
      {wide ? (floatOn && tabs.length > 0 && (
        <WorkPopupFloatCard pref={floatPref} minimized={!expanded} tabs={tabs} tab={activeTab} onTab={(k) => setTab(k === "gif" || k === "line" || k === "bell" || k === "watches" || k === "tasks" || k === "plan" || k === "deploy" ? k : "work")} pet={petState}
          onMinimize={collapse}
          onExpand={() => {
            setExpanded(true);
            // เปิดแท็บของเรื่องที่ทำให้ตัว Pet เด้งก่อน
            setTab(alertWork ? "work" : alertDeploy ? "deploy" : alertPlan && newPlan[0].kind === "overdue" ? "plan" : alertTasks ? "tasks" : alertPlan ? "plan" : alertBell ? "bell" : alertWatch ? "watches" : alertLine ? "line" : alertGif ? "gif" : workTabOn ? "work" : taskCount > 0 ? "tasks" : planCount > 0 ? "plan" : watchCount > 0 ? "watches" : lineCount > 0 ? "line" : bellCount > 0 ? "bell" : taskTabOn ? "tasks" : planTabOn ? "plan" : "gif");
            if (cur) void check(undefined, true);
            void loadPokes();
            void loadLine();
            if (tasksOn) void loadInbox();
            if (planOn) void loadPlan();
            void feed.refresh();
            if (hasWatches) void reloadWatches();
            if (deployOn) void reloadDeploy();
          }} />
      )) : visible && cur && (workShown || forced.has(cur.report_id)) && (
        <ERPModal open onClose={() => finish(cur, "later")} size="lg" defaultExpanded={false} storageKey="work-popup" zIndex={300}
          closeOnBackdrop={!cur.require_ack}
          title={`🔔 ${title}`}
          description={subtitle}
          footer={footer}>
          <FloatViewContext.Provider value={{ level: 2, hideImg: !!floatPref.hideImg }}>
            <WorkPopupBody data={cur} done={done} onTick={(id, d) => void tick(id, d)} onOpen={(path) => open(cur, path, "later")} />
          </FloatViewContext.Provider>
          <p className="mt-3 text-[11px] text-slate-400">💡 {WORK_POPUP_HIDE_HINT} แล้วปิดสวิตช์</p>
        </ERPModal>
      )}
      {/* แผงตรวจเร็วของงานจากแท็บ Task — อยู่นอกการ์ด (การ์ดยุบตอนกดข้างนอก แผงยังเปิดอยู่) */}
      {qc && <TaskInboxQuickCheck item={qc.item} mode={qc.mode} onClose={() => setQc(null)} onDone={() => void loadInbox()} />}
      {/* ป๊อปแก้งานแผนงาน (ตัวเดิมของหน้าแผนงาน) — อยู่นอกการ์ดเหมือนกัน */}
      {planEdit && uid && <PlanItemEditor item={planEdit} me={uid} onClose={() => setPlanEdit(null)} onDone={() => void loadPlan()} />}
      {gifModal && (
        <GifPokeModal open onClose={() => setGifModal(null)} onSent={() => { setGifModal(null); toast.success("ส่ง GIF แล้ว"); }} isAdmin={user?.role === "admin"}
          prefillRecipient={gifModal.reply ? ({ id: gifModal.reply.from_user_id, name: gifModal.reply.from_name ?? "", code: null } as unknown as UserPickerValue) : null} />
      )}
    </>
  );
}
