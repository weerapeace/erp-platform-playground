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
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ERPModal } from "@/components/modal";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { useRefresh } from "@/lib/refresh-bus";
import { isStandaloneAppPath, openInStandaloneApp } from "@/lib/app-go";
import { TaskLinkList } from "@/components/record-tasks/task-links";
import type { WorkPopupFlag, WorkPopupItem, WorkPopupPayload, WorkPopupTask } from "@/lib/email-report/popup";
// หน้าที่ไม่ใช่การทำงานใน ERP (ล็อกอิน / พิมพ์ / ลิงก์สาธารณะ) → ไม่เด้ง (รายการกลาง lib/chromeless-routes)
import { isChromelessPath } from "@/lib/chromeless-routes";
import { WORK_POPUP_HIDE_HINT, WorkPopupFloatCard, useFloatScreen, useWorkPopupFloatPref } from "./float";
const RECHECK_MS = 30 * 60_000;
const UUID = /^[0-9a-f-]{36}$/i;

const thDate = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const seenKey = (uid: string) => `work-popup-seen:${uid}:${thDate()}`;
function readSeen(uid: string): string[] {
  try { const v = JSON.parse(sessionStorage.getItem(seenKey(uid)) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function markSeen(uid: string, id: string) {
  try { sessionStorage.setItem(seenKey(uid), JSON.stringify([...new Set([...readSeen(uid), id])])); } catch { /* ignore */ }
}

const TONE: Record<WorkPopupFlag["tone"], string> = { danger: "text-rose-600", warn: "text-amber-600", muted: "text-slate-500", good: "text-emerald-600" };

function Thumb({ src }: { src: string | null }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-md border border-slate-200 object-cover" />
    : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-200 text-slate-300">🎨</div>;
}

/** 1 ใบงานในป๊อป — โชว์ตามช่องที่เลือก (data.fields) · ของรอ = ช่องติ๊ก (ติ๊กไม่ได้ = จางพร้อมบอกเหตุผล) */
function ItemCard({ it, fields, tasks, canTick, onTick, onOpen, done, strong }: {
  it: WorkPopupItem; fields: Set<string>; tasks: WorkPopupTask[];
  canTick: (t: WorkPopupTask) => boolean; onTick?: (taskId: string, done: boolean) => void; onOpen?: (path: string) => void;
  done?: Set<string>; strong?: boolean;
}) {
  const meta = [fields.has("brand") ? it.brand : null, fields.has("status") ? it.status : null, fields.has("due") ? it.due : null].filter(Boolean);
  return (
    <div className="flex gap-2.5">
      {fields.has("img") && <Thumb src={it.imageUrl} />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <button type="button" disabled={!onOpen} onClick={() => onOpen?.(it.path)} className="min-w-0 text-left hover:underline disabled:hover:no-underline">
            <span className={`text-sm text-slate-800 ${strong ? "font-medium" : ""}`}>{fields.has("code") && it.code && <span className="mr-1 text-slate-400">{it.code}</span>}{it.title}</span>
          </button>
          {fields.has("flag") && <span className={`shrink-0 text-xs ${TONE[it.flag.tone]}`}>{it.flag.text}</span>}
        </div>
        {meta.length > 0 && <div className="text-xs text-slate-500">{meta.join(" · ")}</div>}
        {fields.has("note") && it.note && <div className="mt-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">📝 {it.note}</div>}
        {tasks.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {tasks.map((t) => {
              const ok = !!done?.has(t.id);
              const can = !!onTick && canTick(t);
              return (
                <li key={t.id}>
                  <label title={onTick && !can ? "ติ๊กได้เฉพาะผู้รับผิดชอบข้อนี้ / คนที่แก้ใบงานได้" : undefined}
                    className={`inline-flex items-center gap-2 text-sm ${can ? "cursor-pointer" : ""} ${ok ? "text-slate-400 line-through" : "text-slate-700"}`}>
                    <input type="checkbox" checked={ok} disabled={!can} onChange={(e) => onTick?.(t.id, e.target.checked)} className={`h-4 w-4 accent-indigo-600 ${!can && onTick ? "opacity-40" : ""}`} />
                    <span>⏳ {t.title}{fields.has("who") && t.who && <span className="text-slate-400"> — {t.who}</span>}</span>
                  </label>
                  {!ok && <TaskLinkList links={t.links} className="ml-6 mt-0.5" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** เนื้อในป๊อป (ไม่มีกรอบ) — ใช้ทั้งป๊อปจริงและตัวอย่างในหน้าตั้งค่า (preview = ติ๊กไม่ได้) */
export function WorkPopupBody({ data, onOpen, onTick, done, preview }: {
  data: WorkPopupPayload;
  onOpen?: (path: string) => void;
  onTick?: (taskId: string, done: boolean) => void;
  done?: Set<string>;
  preview?: boolean;
}) {
  const s = data.stats;
  const fields = new Set<string>(data.fields ?? []);
  const canTick = (t: WorkPopupTask) => t.mine || data.can_tick_all;
  const mineOpen = data.mine.reduce((n, m) => n + m.tasks.filter((t) => !done?.has(t.id)).length, 0);
  return (
    <div className="space-y-4">
      {data.audience === "all" && data.show_stats !== false && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {s.overdue > 0 && <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">เกินกำหนด {s.overdue}</span>}
          {s.due_soon > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">ใกล้กำหนด {s.due_soon}</span>}
          {s.waiting > 0 && <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">⏳ มีของรอ {s.waiting} ใบ</span>}
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">ค้างทั้งหมด {s.total}</span>
        </div>
      )}

      {/* 👤 งานของคุณ — ขึ้นก่อน · ข้อของคุณติ๊กได้เสมอ */}
      {data.mine.length > 0 && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
          <h3 className="mb-2 text-sm font-semibold text-indigo-900">👤 งานของคุณ <span className="font-normal text-indigo-700">({mineOpen > 0 ? `เหลือ ${mineOpen} ข้อ` : "ครบแล้ว 🎉"})</span></h3>
          <div className="space-y-2">
            {data.mine.map((m) => (
              <div key={m.id} className="rounded-lg bg-white p-2 shadow-sm">
                <ItemCard it={m} fields={fields} tasks={m.tasks} canTick={() => true} onTick={onTick} onOpen={onOpen} done={done} strong />
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-indigo-700/80">ติ๊กเมื่อทำเสร็จ — ทีมเห็นในใบงานทันที</p>
        </section>
      )}

      {/* 🔥 ต้องตามวันนี้ (หรือทุกงานเรียงด่วนก่อน — urgent_label) · ของรอติ๊กได้ตามสิทธิ์ (can_tick_all / ข้อของตัวเอง) */}
      {data.audience === "all" && data.urgent.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-semibold text-slate-800">{data.urgent_label}</h3>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {data.urgent.map((u) => (
              <div key={u.id} className="p-2">
                <ItemCard it={u} fields={fields} tasks={fields.has("wait") ? u.tasks : []} canTick={canTick} onTick={onTick} onOpen={onOpen} done={done} />
              </div>
            ))}
          </div>
          {data.more > 0 && <p className="mt-1.5 text-xs text-slate-500">และอีก {data.more} งาน — กด "ดูทั้งหมด"</p>}
        </section>
      )}

      {data.mine.length === 0 && (data.audience === "mine" || data.urgent.length === 0) && (
        <p className="rounded-xl bg-emerald-50 p-4 text-center text-sm text-emerald-700">ไม่มีงานที่ต้องตามตอนนี้ เยี่ยมมาก 🎉</p>
      )}
      {data.audience === "mine" && data.mine.length > 0 && !preview && (
        <p className="text-[11px] text-slate-400">คุณเห็นป๊อปนี้เพราะมีข้อในเช็กลิสต์ "รออะไรอยู่" ที่ใส่ชื่อคุณไว้</p>
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
      if (!quiet && list.some((p) => p.due)) setExpanded(true);
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
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [uid, skip, check, wide]);

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
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      {cur.view_all && cur.audience === "all" && (
        <button onClick={() => open(cur, cur.view_all!, pending ? "ack" : "later")} className="mr-auto h-9 rounded-lg px-3 text-sm font-medium text-blue-700 hover:bg-blue-50">ดูทั้งหมด →</button>
      )}
      {pending && <button onClick={() => finish(cur, "later")} className="h-9 rounded-lg border border-slate-300 px-4 text-sm text-slate-600 hover:bg-slate-50">ไว้ทีหลัง</button>}
      {!pending && cur.acked
        ? <span className="h-9 inline-flex items-center rounded-lg bg-emerald-50 px-3 text-sm text-emerald-700">✓ รับทราบแล้ววันนี้</span>
        : <button onClick={() => finish(cur, "ack")} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">✓ รับทราบ</button>}
    </div>
  );

  return (
    <>
      <Suspense fallback={null}>{uid && <PopupParam onParam={(id) => { setForced((s) => new Set(s).add(id)); void check(id); }} />}</Suspense>
      {visible && cur && (wide ? (
        <WorkPopupFloatCard pref={floatPref} minimized={!expanded} title={title} subtitle={subtitle} pill={pill} footer={footer}
          onMinimize={collapse}
          onExpand={() => { setExpanded(true); void check(undefined, true); }}>
          <WorkPopupBody data={cur} done={done} onTick={(id, d) => void tick(id, d)} onOpen={(path) => open(cur, path, "later")} />
        </WorkPopupFloatCard>
      ) : (
        <ERPModal open onClose={() => finish(cur, "later")} size="lg" defaultExpanded={false} storageKey="work-popup" zIndex={300}
          closeOnBackdrop={!cur.require_ack}
          title={`🔔 ${title}`}
          description={subtitle}
          footer={footer}>
          <WorkPopupBody data={cur} done={done} onTick={(id, d) => void tick(id, d)} onOpen={(path) => open(cur, path, "later")} />
          <p className="mt-3 text-[11px] text-slate-400">💡 {WORK_POPUP_HIDE_HINT} แล้วปิดสวิตช์</p>
        </ERPModal>
      ))}
    </>
  );
}
