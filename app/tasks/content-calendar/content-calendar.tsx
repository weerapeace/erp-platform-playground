"use client";

// ============================================================
// ปฏิทินคอนเทนต์ + ปฏิทินงาน (หน้าเดียว สลับโหมดได้)
// ของกลาง: StandaloneShell, ERPModal, ContentDrawer, ContentCreateModal, TaskDetailDrawer, CreateTaskModal, listContent/listTasks, listBrands
// เฟส 2: ปฏิทินรายเดือน + แท็บแบรนด์ (สีแบรนด์) + คลิกการ์ดเปิด drawer
// เฟส 3: คลิกช่องวัน=ป๊อปเลือก (สร้างใหม่/หยิบจากค้าง) · กล่อง "ยังไม่ลงวันที่" · ลากวางเปลี่ยนวัน
// เฟส 4 (2026-10-07): โหมด "งาน" — ปฏิทินเดียวกัน ใช้กำหนดส่ง (due_date) · การ์ดมีรูปปก · ลากเปลี่ยนกำหนดส่ง
//   ทุกอย่างทำงานบน CalEntry (รูปกลาง) → แผงปฏิทิน/กล่องค้าง/ป๊อปวัน ใช้โค้ดชุดเดียวทั้ง 2 โหมด
// ============================================================

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useSWRLite } from "@/lib/swr-lite";
import { StandaloneShell } from "@/components/standalone-shell";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import {
  listContent, listBrands, listCampaigns, listBrandCalStyles, updateContent, getRecommendedTimes, type RecommendedTimes,
  CONTENT_STATUS_META, contentStatusLabel, type BrandCalStyle, type ContentStatus,
  listTasks, updateTask, deleteTask, isOverdue, type CreativeTask,
} from "../data";
import { ContentDrawer } from "../content/content";
import { ContentCreateModal } from "../content/content-create-modal";
import { TaskDetailDrawer } from "../task-detail-drawer";
import { CreateTaskModal } from "../create-task-modal";
import { applyTaskTransition } from "../task-actions";
import { statusMeta, statusLabel, isTerminal, useCreativeStatuses } from "../use-statuses";
import { BrandStyleModal } from "./brand-style-modal";
import { platformLabel, useCreativeOptions } from "../use-options";
import { r2ImageUrl } from "@/lib/r2-image";

type Toast = { id: number; type: "success" | "error" | "info"; message: string };
type CalMode = "content" | "task";
/** รายการบนปฏิทิน (รูปกลางของทั้งคอนเทนต์และงาน) — แผงปฏิทินไม่ต้องรู้ว่าเป็นชนิดไหน */
type CalEntry = {
  id: string; kind: CalMode; title: string;
  dateKey: string | null;      // YYYY-MM-DD (คอนเทนต์ = วันตั้งโพสต์ · งาน = กำหนดส่ง)
  time: string | null;         // HH:MM (เฉพาะคอนเทนต์)
  brand_id: string | null; brand_label: string | null;
  status: string; statusLabel: string; statusCls: string; statusDot: string;
  thumb: string | null;        // รูปเล็ก (ปกงาน / รูปสินค้า)
  sub: string | null;          // บรรทัดรอง (ชื่องานที่ผูก / เลขงาน)
  meta: string | null;         // บรรทัดสาม (รหัสสินค้า · แบรนด์ / ผู้รับผิดชอบ)
  platforms: string[]; overdue: boolean;
  hideInBacklog: boolean;      // ยกเลิก/จบแล้ว → ไม่โชว์ในกล่องค้าง (เว้นแต่กรองสถานะนั้นอยู่)
};

export function ContentCalendarView() {
  const t = useT();
  const { platforms } = useCreativeOptions();
  const { statuses: taskStatuses } = useCreativeStatuses();
  // โหมดปฏิทิน: คอนเทนต์ (วันตั้งโพสต์) / งาน (กำหนดส่ง) — จำใน URL ?cal=task
  const [mode, setModeState] = useState<CalMode>("content");
  const setMode = (m: CalMode) => {
    setModeState(m); setStatusFilter("all"); setCancelAsk(null);
    try { const u = new URL(window.location.href); if (m === "task") u.searchParams.set("cal", "task"); else u.searchParams.delete("cal"); window.history.replaceState(null, "", u.toString()); } catch { /* noop */ }
  };
  const [detail, setDetail] = useState<{ kind: CalMode; id: string } | null>(null);
  const [brandFilter, setBrandFilter] = useState<string>("all");   // "all" | brandId
  const [platformFilter, setPlatformFilter] = useState<string>("all");   // "all" | platform value
  const [statusFilter, setStatusFilter] = useState<string>("all");   // "all" | สถานะ (ตามโหมด)
  const [offset, setOffset] = useState(0);                          // เลื่อนเดือน (0 = เดือนนี้)
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<string | null>(null);   // วันตั้งโพสต์ prefill (จากช่องที่คลิก)
  // ลากวาง: จำ id + เวลาเดิมของการ์ดที่กำลังลาก + ช่องที่เมาส์ลอยอยู่
  const dragRef = useRef<{ id: string; time: string | null } | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  // หมุนลูกกลิ้งเมาส์บนตารางปฏิทิน = เปลี่ยนเดือน (ลง = เดือนถัดไป · ขึ้น = เดือนก่อน)
  // ใช้ listener แบบ passive:false เพื่อกันหน้าเลื่อนตาม · หน่วง 500ms + สะสม delta กันกระโดดทีละหลายเดือน (ทัชแพดยิงถี่)
  // ใช้ callback ref เพราะการ์ดปฏิทินโผล่หลังโหลดเสร็จ (useEffect ครั้งแรก ref ยังว่าง → ไม่เคยผูก listener)
  const calWheelCleanup = useRef<(() => void) | null>(null);
  const calRef = useCallback((el: HTMLDivElement | null) => {
    calWheelCleanup.current?.(); calWheelCleanup.current = null;
    if (!el) return;
    let acc = 0; let lockUntil = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;   // ปัดแนวนอน ไม่เกี่ยว
      e.preventDefault();
      const now = Date.now(); if (now < lockUntil) return;
      acc += e.deltaY;
      if (Math.abs(acc) < 40) return;
      setOffset((o) => o + (acc > 0 ? 1 : -1)); acc = 0; lockUntil = now + 500;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    calWheelCleanup.current = () => el.removeEventListener("wheel", onWheel);
  }, []);

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 3500);
  }, []);

  // ใช้ cache ร่วมกับหน้าคอนเทนต์/หน้างาน (key เดียวกัน) — เข้าหน้านี้เห็นทันที · งานโหลดเฉพาะตอนอยู่โหมดงาน
  const itemsSWR = useSWRLite("creative:content", () => listContent());
  const tasksSWR = useSWRLite(mode === "task" ? "creative:tasks:all" : null, () => listTasks({ sort_by: "updated_at", sort_dir: "desc" }), { refreshMs: 20000, timeoutMs: 15000 });
  const brandsSWR = useSWRLite("creative:brands", () => listBrands());
  const campaignsSWR = useSWRLite("creative:campaigns", () => listCampaigns());
  const stylesSWR = useSWRLite("creative:brand-cal-styles", () => listBrandCalStyles());
  const items = useMemo(() => itemsSWR.data ?? [], [itemsSWR.data]);
  const tasks = useMemo(() => tasksSWR.data ?? [], [tasksSWR.data]);
  const brands = brandsSWR.data ?? [];
  const campaigns = campaignsSWR.data ?? [];
  const styleMap = useMemo(() => Object.fromEntries((stylesSWR.data ?? []).map((s) => [s.brand_id, s])) as Record<string, BrandCalStyle>, [stylesSWR.data]);
  const loading = mode === "content" ? itemsSWR.loading : tasksSWR.loading;
  const loadError = mode === "content" ? (!!itemsSWR.error && items.length === 0) : (!!tasksSWR.error && tasks.length === 0);   // โหลดพลาด + ไม่มีข้อมูลเก่า → โชว์หน้าผิดพลาด
  const [styleBrandId, setStyleBrandId] = useState<string | null>(null);   // แบรนด์ที่กำลังแต่งหน้า
  const reload = useCallback(() => { void itemsSWR.revalidate(true); if (mode === "task") void tasksSWR.revalidate(true); }, [itemsSWR, tasksSWR, mode]);
  // เปิด drawer จากลิงก์ ?content=<id> / ?task=<id> · โหมดจาก ?cal=task
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const cid = sp.get("content"); const tid = sp.get("task");
    if (sp.get("cal") === "task" || tid) setModeState("task");
    if (cid) setDetail({ kind: "content", id: cid }); else if (tid) setDetail({ kind: "task", id: tid });
  }, []);

  // ───── แปลงเป็นรูปกลาง (CalEntry) ─────
  const entries = useMemo<CalEntry[]>(() => {
    if (mode === "content") {
      return items.filter((c) => !c.is_template).map((c) => {
        const m = CONTENT_STATUS_META[c.status] ?? CONTENT_STATUS_META.draft;
        return {
          id: c.id, kind: "content" as const, title: c.title ?? "",
          dateKey: c.scheduled_at ? c.scheduled_at.slice(0, 10) : null, time: c.scheduled_at ? c.scheduled_at.slice(11, 16) : null,
          brand_id: c.brand_id ?? null, brand_label: c.brand_label ?? null,
          status: c.status, statusLabel: contentStatusLabel(c.status), statusCls: m.cls, statusDot: m.dot,
          thumb: c.task_cover_url ?? null, sub: c.task_label ? `📋 ${c.task_label}` : null,
          meta: [c.parent_sku_code || c.sku_code || null, c.brand_label].filter(Boolean).join(" · ") || null,
          platforms: c.platforms ?? [], overdue: false, hideInBacklog: c.status === "cancelled",
        };
      });
    }
    return tasks.filter((tk) => tk.is_active !== false).map((tk) => {
      const m = statusMeta(tk.status);
      const key = tk.cover_image_r2_key ?? tk.sku_image_key ?? tk.parent_sku_image_key ?? null;
      const who = (tk.assignees && tk.assignees.length ? tk.assignees.map((a) => a.label).join(", ") : tk.assignee_label) || null;
      return {
        id: tk.id, kind: "task" as const, title: tk.title,
        dateKey: tk.due_date ? String(tk.due_date).slice(0, 10) : null, time: null,
        brand_id: tk.brand_id, brand_label: tk.brand_label,
        status: tk.status, statusLabel: m.label, statusCls: m.cls, statusDot: m.dot,
        thumb: key ? r2ImageUrl(key, 96) : null, sub: tk.task_no ? `#${tk.task_no}${tk.sku_code ? ` · ${tk.parent_sku_code || tk.sku_code}` : ""}` : null,
        meta: [who ? `👤 ${who}` : null, tk.brand_label].filter(Boolean).join(" · ") || null,
        platforms: tk.platforms ?? [], overdue: isOverdue(tk), hideInBacklog: isTerminal(tk.status),
      };
    });
  }, [mode, items, tasks]);

  // กรองตามแบรนด์ + แพลตฟอร์ม + สถานะที่เลือก
  const filtered = useMemo(
    () => entries.filter((e) =>
      (brandFilter === "all" || e.brand_id === brandFilter)
      && (platformFilter === "all" || e.platforms.includes(platformFilter))
      && (statusFilter === "all" || e.status === statusFilter),
    ),
    [entries, brandFilter, platformFilter, statusFilter],
  );
  const hasFilter = brandFilter !== "all" || platformFilter !== "all" || statusFilter !== "all";

  // เดือนที่กำลังดู
  const base = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + offset, 1); }, [offset]);
  const year = base.getFullYear(), month = base.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthName = base.toLocaleDateString(t("th-TH", "en-US"), { month: "long", year: "numeric" });
  const todayKey = new Date().toISOString().slice(0, 10);
  // ตัวเลขบนชิปตัวกรอง: นับเฉพาะรายการ "ของเดือนที่เปิดอยู่" — แบรนด์นับทั้งเดือน · แพลตฟอร์ม/สถานะนับในแบรนด์ที่เลือก
  const counts = useMemo(() => {
    const all = entries.filter((e) => e.dateKey && e.dateKey.slice(0, 7) === ym);
    const inBrand = all.filter((e) => brandFilter === "all" || e.brand_id === brandFilter);
    const brand: Record<string, number> = {}; const plat: Record<string, number> = {}; const stat: Record<string, number> = {};
    for (const e of all) { const k = e.brand_id ?? "_"; brand[k] = (brand[k] ?? 0) + 1; }
    for (const e of inBrand) { for (const p of e.platforms) plat[p] = (plat[p] ?? 0) + 1; stat[e.status] = (stat[e.status] ?? 0) + 1; }
    return { total: all.length, inBrand: inBrand.length, brand, plat, stat };
  }, [entries, brandFilter, ym]);

  // จัดเข้าแต่ละวัน + กล่องค้าง (ยังไม่ลงวันที่ / ยังไม่กำหนดส่ง)
  const byDay = useMemo(() => {
    const map: Record<string, CalEntry[]> = {};
    for (const e of filtered) { if (!e.dateKey) continue; (map[e.dateKey] ??= []).push(e); }
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || a.title.localeCompare(b.title, "th", { numeric: true }));
    return map;
  }, [filtered]);
  const unscheduled = useMemo(
    () => filtered.filter((e) => !e.dateKey && (statusFilter !== "all" || !e.hideInBacklog)).sort((a, b) => {
      // เรียงตามบรรทัดรอง (ชื่องานที่ผูก/เลขงาน) — งานเดียวกันอยู่ติดกัน, ไม่มีไว้ท้ายสุด, เลขเรียงแบบธรรมชาติ
      const ta = (a.sub ?? "").trim(), tb = (b.sub ?? "").trim();
      if (!ta !== !tb) return ta ? -1 : 1;
      const bySub = ta.localeCompare(tb, "th", { numeric: true });
      return bySub !== 0 ? bySub : a.title.localeCompare(b.title, "th", { numeric: true });
    }),
    [filtered, statusFilter],
  );
  const scheduledThisMonth = useMemo(() => filtered.filter((e) => e.dateKey && e.dateKey.slice(0, 7) === ym).length, [filtered, ym]);

  // รายการสถานะสำหรับตัวกรอง (ตามโหมด)
  const statusChips = useMemo<{ key: string; label: string; dot: string }[]>(() =>
    mode === "content"
      ? (Object.keys(CONTENT_STATUS_META) as ContentStatus[]).map((k) => ({ key: k, label: contentStatusLabel(k), dot: CONTENT_STATUS_META[k].dot }))
      : taskStatuses.map((s) => ({ key: s.key, label: statusLabel(s.key), dot: statusMeta(s.key).dot })),
  [mode, taskStatuses]);

  // ───── เปลี่ยนวัน (ลากวาง / หยิบจากค้าง) — optimistic แล้วบันทึกจริง · error = คืนค่าเดิม ─────
  const reschedule = useCallback(async (entry: CalEntry, dayKey: string | null, time?: string | null) => {
    if (entry.kind === "content") {
      const newAt = dayKey ? `${dayKey}T${time || "10:00"}` : null;
      const cur = items;
      itemsSWR.mutate(cur.map((c) => c.id === entry.id ? { ...c, scheduled_at: newAt } : c));
      try { await updateContent(entry.id, { scheduled_at: newAt }); pushToast("success", newAt ? t("ย้ายวันโพสต์แล้ว", "Rescheduled") : t("ย้ายไปกล่องยังไม่ลงวันที่แล้ว", "Moved to backlog")); }
      catch (e) { itemsSWR.mutate(cur); pushToast("error", (e as Error).message); }
      finally { void itemsSWR.revalidate(true); }
    } else {
      const cur = tasks;
      tasksSWR.mutate(cur.map((tk) => tk.id === entry.id ? { ...tk, due_date: dayKey } : tk));
      try { await updateTask(entry.id, { due_date: dayKey }); pushToast("success", dayKey ? t("เปลี่ยนกำหนดส่งแล้ว", "Due date changed") : t("เอากำหนดส่งออกแล้ว", "Due date cleared")); }
      catch (e) { tasksSWR.mutate(cur); pushToast("error", (e as Error).message); }
      finally { void tasksSWR.revalidate(true); }
    }
  }, [items, itemsSWR, tasks, tasksSWR, pushToast, t]);

  // ปุ่ม ✕ บนการ์ดค้าง — เคลียร์งานเก่า: ยืนยันในการ์ดก่อน · คอนเทนต์ = สถานะ "ยกเลิก" · งาน = เดินสถานะไป "ยกเลิก" ผ่านของกลาง applyTaskTransition
  const [cancelAsk, setCancelAsk] = useState<string | null>(null);
  const cancelEntry = useCallback(async (entry: CalEntry) => {
    setCancelAsk(null);
    if (entry.kind === "content") {
      const cur = items;
      itemsSWR.mutate(cur.map((c) => c.id === entry.id ? { ...c, status: "cancelled" as ContentStatus } : c));
      try { await updateContent(entry.id, { status: "cancelled" }); pushToast("success", t("ยกเลิกแล้ว — ไม่โพสต์คอนเทนต์นี้ (ดูได้ที่ตัวกรองสถานะ “ยกเลิก”)", "Cancelled — won't be posted (see status filter “Cancelled”)")); }
      catch (e) { itemsSWR.mutate(cur); pushToast("error", (e as Error).message); }
      finally { void itemsSWR.revalidate(true); }
    } else {
      const task = tasks.find((x) => x.id === entry.id); if (!task) return;
      const ok = await applyTaskTransition(task, "cancelled", { pushToast });
      if (ok) { pushToast("success", t("ยกเลิกงานแล้ว", "Task cancelled")); void tasksSWR.revalidate(true); }
    }
  }, [items, itemsSWR, tasks, tasksSWR, pushToast, t]);

  const brandColor = (id: string | null | undefined) => brands.find((b) => b.id === id)?.color || "#cbd5e1";
  const activeStyle = brandFilter !== "all" ? (styleMap[brandFilter] ?? null) : null;   // สไตล์ของแบรนด์ที่เลือก (แบนเนอร์)
  const weekdays = [t("อา", "Sun"), t("จ", "Mon"), t("อ", "Tue"), t("พ", "Wed"), t("พฤ", "Thu"), t("ศ", "Fri"), t("ส", "Sat")];
  const entryById = (id: string) => filtered.find((e) => e.id === id) ?? entries.find((e) => e.id === id) ?? null;

  const onDropDay = (dayKey: string) => {
    setOverKey(null);
    const d = dragRef.current; dragRef.current = null;
    if (!d) return;
    const e = entryById(d.id); if (!e) return;
    void reschedule(e, dayKey, d.time || defaultTimeFor(dayKey));
  };
  const onDropBacklog = () => {
    setOverKey(null);
    const d = dragRef.current; dragRef.current = null;
    if (!d) return;
    const e = entryById(d.id); if (e) void reschedule(e, null);
  };
  const startDrag = (e: CalEntry) => { dragRef.current = { id: e.id, time: e.time }; };

  // สร้างใหม่ (ตามโหมด) — คอนเทนต์เติมวันให้ · งานเปิดฟอร์มงาน (ใส่กำหนดส่งในฟอร์ม)
  const openCreate = (date: string | null) => {
    if (mode === "content") { setCreateDate(date); setCreateOpen(true); return; }
    setTaskCreateOpen(true);
    if (date) pushToast("info", t(`ตั้งกำหนดส่งในฟอร์มเป็น ${new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}`, `Set due date to ${date} in the form`));
  };
  // กดช่องวัน → ป๊อปให้เลือก: สร้างใหม่วันนี้ หรือ หยิบจากกล่องค้างมาลงวันนี้ (คอนเทนต์: เวลา = เวลาแนะนำของวันนั้น ไม่มีก็ 10:00)
  const [dayPick, setDayPick] = useState<string | null>(null);
  const [recTimes, setRecTimes] = useState<RecommendedTimes>({});
  useEffect(() => { getRecommendedTimes().then(setRecTimes).catch(() => {}); }, []);
  const defaultTimeFor = (dayKey: string) => { const day = new Date(`${dayKey}T00:00:00`).getDay(); return (recTimes[String(day)] ?? [])[0]?.time || "10:00"; };
  const pickIntoDay = (e: CalEntry, dayKey: string) => { setDayPick(null); void reschedule(e, dayKey, defaultTimeFor(dayKey)); };
  const dayPickLabel = dayPick ? new Date(`${dayPick}T00:00:00`).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "";

  // ป้ายคำตามโหมด
  const L = mode === "content" ? {
    title: t("ปฏิทินคอนเทนต์", "Content Calendar"), icon: "🗓️",
    desc: t("คอนเทนต์ทุกแบรนด์รวมที่เดียว · เรียงตามวันตั้งโพสต์ · ลากวางเปลี่ยนวันได้", "All content in one place · by scheduled date · drag to reschedule"),
    backlog: t("ยังไม่ลงวันที่", "Unscheduled"), backlogHint: t("ลากการ์ดไปวางในวันที่ต้องการโพสต์ · ลากจากปฏิทินมาที่นี่เพื่อเอาวันออก · กด ✕ = ไม่โพสต์แล้ว (เคลียร์งานเก่า)", "Drag a card onto a day · drop here to clear its date · ✕ = cancel"),
    create: t("สร้างคอนเทนต์", "Create content"), createDay: t("สร้างคอนเทนต์ใหม่ลงวันนี้", "Create new content on this day"),
    cancelQ: t("ไม่โพสต์คอนเทนต์นี้แล้ว?", "Cancel this content?"), cancelTip: t("ไม่โพสต์แล้ว (ยกเลิก) — เคลียร์งานเก่า", "Won't post (cancel)"),
    pick: t("หรือหยิบจาก “ยังไม่ลงวันที่”", "Or pick from “Unscheduled”"), addTip: t("เพิ่มคอนเทนต์วันนี้", "Add content"),
    legend: t("คลิกช่องวัน = เพิ่ม/หยิบจากค้าง · ลากการ์ดข้ามวัน = เปลี่ยนวัน · จุดสี = แบรนด์", "Click a day = add/pick · drag a card = reschedule · color dot = brand"),
    countTip: t("นับเฉพาะคอนเทนต์ที่ตั้งวันโพสต์ในเดือนนี้ (ไม่รวมกล่องยังไม่ลงวันที่)", "Only content scheduled in this month"),
  } : {
    title: t("ปฏิทินงาน", "Task Calendar"), icon: "📋",
    desc: t("งาน Creative ทุกแบรนด์ · เรียงตามกำหนดส่ง · ลากวางเปลี่ยนกำหนดส่งได้ · สีแดง = เลยกำหนด", "All creative tasks · by due date · drag to change due date · red = overdue"),
    backlog: t("ยังไม่กำหนดส่ง", "No due date"), backlogHint: t("ลากการ์ดไปวางในวันกำหนดส่ง · ลากจากปฏิทินมาที่นี่เพื่อเอากำหนดส่งออก · กด ✕ = ยกเลิกงาน", "Drag a card onto a due day · drop here to clear · ✕ = cancel task"),
    create: t("สร้างงาน", "Create task"), createDay: t("สร้างงานใหม่ (กำหนดส่งวันนี้)", "Create new task due this day"),
    cancelQ: t("ยกเลิกงานนี้?", "Cancel this task?"), cancelTip: t("ยกเลิกงาน — เคลียร์งานเก่า", "Cancel task"),
    pick: t("หรือหยิบจาก “ยังไม่กำหนดส่ง”", "Or pick from “No due date”"), addTip: t("เพิ่มงานกำหนดส่งวันนี้", "Add task"),
    legend: t("คลิกช่องวัน = เพิ่ม/หยิบจากค้าง · ลากการ์ดข้ามวัน = เปลี่ยนกำหนดส่ง · ขอบแดง = เลยกำหนด · รูป = ปกงาน", "Click a day = add/pick · drag = change due · red = overdue"),
    countTip: t("นับเฉพาะงานที่กำหนดส่งในเดือนนี้ (ไม่รวมงานที่ยังไม่กำหนดส่ง)", "Only tasks due in this month"),
  };

  const tabCls = (active: boolean) =>
    `inline-flex items-center gap-2 h-9 pl-3 pr-2 rounded-full text-sm font-medium border transition-colors ${
      active ? "bg-violet-600 text-white border-violet-600 shadow-sm" : "bg-white text-slate-700 border-slate-200 hover:border-violet-300 hover:bg-violet-50"
    }`;
  const segCls = (active: boolean) =>
    `inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
      active ? "bg-slate-800 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
    }`;
  const countBadge = (n: number | undefined, active: boolean) => (
    <span className={`min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full text-[10px] tabular-nums ${active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>{n ?? 0}</span>
  );

  // รูปเล็กของรายการ (ปกงาน/รูปสินค้า) · ไม่มี = จุดสีแบรนด์
  const Thumb = ({ e, size }: { e: CalEntry; size: "xs" | "sm" }) => {
    const cls = size === "xs" ? "h-5 w-5 rounded" : "h-9 w-9 rounded";
    return e.thumb
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={e.thumb} alt="" className={`${cls} object-cover border border-slate-200 shrink-0`} />
      : size === "xs"
        ? <span className="h-2 w-2 rounded-full shrink-0" style={{ background: brandColor(e.brand_id) }} />
        : <span className={`${cls} bg-slate-100 flex items-center justify-center shrink-0`}><span className="h-2.5 w-2.5 rounded-full" style={{ background: brandColor(e.brand_id) }} /></span>;
  };

  // การ์ดในช่องวัน (ใช้ร่วม 2 โหมด) — งาน: มีรูปปก + ขอบแดงถ้าเลยกำหนด
  const Chip = ({ e }: { e: CalEntry }) => {
    const tip = [e.title, e.sub, e.meta, e.platforms.slice(0, 3).map((p) => platformLabel(p)).join(" · "), e.statusLabel].filter(Boolean).join(" · ");
    return (
      <button draggable onDragStart={() => startDrag(e)} onDragEnd={() => { dragRef.current = null; setOverKey(null); }}
        onClick={(ev) => { ev.stopPropagation(); setDetail({ kind: e.kind, id: e.id }); }} title={tip}
        className={`w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded border flex items-center gap-1.5 cursor-pointer ${e.overdue ? "bg-red-50 border-red-300 text-red-700" : e.statusCls}`}>
        <Thumb e={e} size="xs" />
        <span className="truncate">{e.time ? `${e.time} ` : ""}{e.title}</span>
      </button>
    );
  };

  return (
    <StandaloneShell title={L.title} icon={L.icon} accent="violet">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{L.icon} {L.title}</h1>
              {/* สลับโหมด คอนเทนต์ ⇄ งาน (ปฏิทินเดียวกัน) */}
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label={t("เลือกปฏิทิน", "Choose calendar")}>
                <button onClick={() => setMode("content")} className={`h-8 px-3 rounded-md text-sm font-medium transition ${mode === "content" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>🗓️ {t("คอนเทนต์", "Content")}</button>
                <button onClick={() => setMode("task")} className={`h-8 px-3 rounded-md text-sm font-medium transition ${mode === "task" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>📋 {t("งาน", "Tasks")}</button>
              </div>
            </div>
            <p className="text-slate-500 mt-1">{L.desc}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {mode === "content"
              ? <a href="/tasks/content" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">📋 {t("รายการคอนเทนต์", "Content list")}</a>
              : <a href="/tasks?view=kanban" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">🗂 {t("บอร์ดงาน", "Task board")}</a>}
            <button onClick={() => openCreate(null)} className="h-10 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {L.create}</button>
          </div>
        </div>

        {/* ───── แถวแบรนด์: แท็บใหญ่ + จำนวน (สี = ที่แต่งไว้ต่อแบรนด์) ───── */}
        <div className="flex items-center gap-2 flex-wrap mt-5">
          <button onClick={() => setBrandFilter("all")} className={tabCls(brandFilter === "all")}>{t("ทุกแบรนด์", "All brands")}{countBadge(counts.total, brandFilter === "all")}</button>
          {brands.map((b) => {
            const st = styleMap[b.id];
            const active = brandFilter === b.id;
            const accent = st?.accent_color || b.color || "#cbd5e1";
            return (
              <button key={b.id} onClick={() => setBrandFilter(b.id)} className={tabCls(active)}
                style={active && st?.accent_color ? { background: st.accent_color, borderColor: st.accent_color, color: "#fff" } : undefined}>
                <span className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white/70" style={{ background: active ? "#fff" : accent }} />
                {b.name}{countBadge(counts.brand[b.id], active)}
              </button>
            );
          })}
          {brandFilter !== "all" && !(activeStyle?.accent_color || activeStyle?.bg_image_key) && (
            <button onClick={() => setStyleBrandId(brandFilter)} className="inline-flex items-center gap-1 h-9 px-3 rounded-full text-sm text-slate-400 border border-dashed border-slate-300 hover:border-violet-300 hover:text-violet-700">🎨 {t("แต่งหน้าแบรนด์", "Style")}</button>
          )}
        </div>

        {/* ───── แถวตัวกรอง: แพลตฟอร์ม | สถานะ อยู่ในกล่องเดียว แบ่งส่วนชัด + ตัวเลข + ปุ่มล้าง ───── */}
        <div className="mt-3 flex items-center gap-x-4 gap-y-2 flex-wrap rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide shrink-0">{t("แพลตฟอร์ม", "Platform")}</span>
            <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 flex-wrap">
              <button onClick={() => setPlatformFilter("all")} className={segCls(platformFilter === "all")}>{t("ทั้งหมด", "All")}</button>
              {platforms.map((p) => {
                const img = p.icon_key ? r2ImageUrl(p.icon_key, 32) : null;
                const active = platformFilter === p.value;
                return (
                  <button key={p.value} onClick={() => setPlatformFilter(active ? "all" : p.value)} className={segCls(active)} title={`${p.label} · ${counts.plat[p.value] ?? 0} ${t("รายการ", "items")}`}>
                    {img ? <img src={img} alt="" className="h-4 w-4 rounded-sm object-contain" /> : p.icon ? <span className="leading-none text-sm">{p.icon}</span> : null}
                    <span className="hidden md:inline">{p.label}</span>
                    {(counts.plat[p.value] ?? 0) > 0 && <span className={`text-[10px] tabular-nums ${active ? "text-white/80" : "text-slate-400"}`}>{counts.plat[p.value]}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="hidden sm:block h-6 w-px bg-slate-200" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide shrink-0">{t("สถานะ", "Status")}</span>
            <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 flex-wrap">
              <button onClick={() => setStatusFilter("all")} className={segCls(statusFilter === "all")}>{t("ทั้งหมด", "All")}</button>
              {statusChips.map((st) => {
                const active = statusFilter === st.key;
                return (
                  <button key={st.key} onClick={() => setStatusFilter(active ? "all" : st.key)} className={segCls(active)} title={`${st.label} · ${counts.stat[st.key] ?? 0} ${t("รายการ", "items")}`}>
                    <span className={`h-2 w-2 rounded-full ${st.dot} ${active ? "ring-2 ring-white/60" : ""}`} />{st.label}
                    {(counts.stat[st.key] ?? 0) > 0 && <span className={`text-[10px] tabular-nums ${active ? "text-white/80" : "text-slate-400"}`}>{counts.stat[st.key]}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            <span title={L.countTip}>{t("เดือนนี้แสดง", "This month showing")} <b className="text-slate-700 tabular-nums">{scheduledThisMonth}</b> / {counts.total} {t("รายการ", "items")}</span>
            {hasFilter && (
              <button onClick={() => { setBrandFilter("all"); setPlatformFilter("all"); setStatusFilter("all"); }} className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-100">✕ {t("ล้างตัวกรอง", "Clear")}</button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-6">
        {/* สถานะโหลด/ผิดพลาด — โหลดพลาดต้องไม่โชว์เป็นปฏิทินว่าง */}
        {loading && <div className="py-16 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>}
        {!loading && loadError && (
          <div className="bg-white rounded-xl border border-red-200 p-12 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-slate-700 font-medium">{t("โหลดข้อมูลไม่สำเร็จ", "Failed to load")}</p>
            <p className="text-slate-400 text-sm mt-1">{t("เชื่อมต่อไม่ได้หรือเครือข่ายมีปัญหา", "Connection or network problem")}</p>
            <button onClick={reload} className="mt-4 h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">↻ {t("ลองใหม่", "Retry")}</button>
          </div>
        )}
        {!loading && !loadError && (<>
        {/* แบนเนอร์แบรนด์ (แต่งหน้า) */}
        {activeStyle && (activeStyle.accent_color || activeStyle.bg_image_key) && (() => {
          const accent = activeStyle.accent_color || "#7c3aed";
          const bg = activeStyle.bg_image_key ? r2ImageUrl(activeStyle.bg_image_key, 800) : null;
          return (
            <div className="rounded-xl overflow-hidden border border-slate-200 mb-4" style={{ background: accent }}>
              <div className="h-16 flex items-center justify-between px-4 relative" style={bg ? { backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
                <div className="absolute inset-0" style={{ background: bg ? `linear-gradient(to top, ${accent}cc, ${accent}33)` : "transparent" }} />
                <span className="relative text-white font-semibold text-lg drop-shadow">{brands.find((b) => b.id === brandFilter)?.name}</span>
                <button onClick={() => setStyleBrandId(brandFilter)} className="relative text-white/90 hover:text-white text-xs border border-white/40 rounded-full px-2.5 py-1">🎨 {t("แต่งหน้า", "Edit style")}</button>
              </div>
            </div>
          );
        })()}

        {/* แถบเดือน + สรุป */}
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={() => setOffset((o) => o - 1)} aria-label={t("เดือนก่อน", "Previous month")} className="h-9 w-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">‹</button>
            <h2 title={t("หมุนลูกกลิ้งเมาส์บนปฏิทินเพื่อเปลี่ยนเดือน", "Scroll the mouse wheel over the calendar to change month")} className="text-lg font-semibold text-slate-800 min-w-[150px] text-center">{monthName}</h2>
            <button onClick={() => setOffset((o) => o + 1)} aria-label={t("เดือนถัดไป", "Next month")} className="h-9 w-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">›</button>
            {offset !== 0 && <button onClick={() => setOffset(0)} className="h-9 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">{t("วันนี้", "Today")}</button>}
            <span className="hidden lg:inline text-[11px] text-slate-300 ml-1">🖱 {t("หมุนลูกกลิ้งบนปฏิทิน = เปลี่ยนเดือน", "Wheel over calendar = change month")}</span>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100 text-xs">{L.icon} {t("เดือนนี้", "This month")} {scheduledThisMonth}</span>
        </div>

        <div className="flex gap-4 items-start flex-col lg:flex-row">
          {/* ตารางปฏิทิน */}
          <div ref={calRef} className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-slate-400 mb-1.5">
              {weekdays.map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: days }).map((_, i) => {
                const day = i + 1;
                const key = `${ym}-${String(day).padStart(2, "0")}`;
                const list = byDay[key] ?? [];
                const isToday = key === todayKey;
                const isOver = overKey === key;
                return (
                  <div key={day} onClick={() => setDayPick(key)}
                    onDragOver={(e) => { e.preventDefault(); if (overKey !== key) setOverKey(key); }}
                    onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
                    onDrop={() => onDropDay(key)}
                    className={`group relative min-h-[104px] rounded-lg border p-1.5 align-top cursor-pointer transition-colors ${isOver ? "border-violet-400 bg-violet-50 ring-1 ring-violet-300" : isToday ? "border-violet-300 bg-violet-50/40" : "border-slate-100 hover:bg-slate-50"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs px-0.5 ${isToday ? "font-semibold text-violet-700" : "text-slate-400"}`}>
                        {isToday ? <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-violet-600 text-white">{day}</span> : day}
                      </span>
                      <span className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-violet-600 text-sm leading-none" title={L.addTip}>＋</span>
                    </div>
                    <div className="space-y-1">
                      {list.slice(0, 4).map((e) => <Chip key={e.id} e={e} />)}
                      {list.length > 4 && <div className="text-[10px] text-slate-400 pl-0.5">+{list.length - 4} {t("อื่น ๆ", "more")}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">💡 {L.legend}</p>
          </div>

          {/* กล่องค้าง "ยังไม่ลงวันที่ / ยังไม่กำหนดส่ง" — ลากไปวางในวันได้ */}
          <div onDragOver={(e) => { e.preventDefault(); if (overKey !== "backlog") setOverKey("backlog"); }}
            onDragLeave={() => setOverKey((k) => (k === "backlog" ? null : k))}
            onDrop={onDropBacklog}
            className={`w-full lg:w-[260px] shrink-0 rounded-xl border p-3 ${overKey === "backlog" ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-slate-700">📥 {L.backlog}</span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{unscheduled.length}</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">{L.backlogHint}</p>
            {unscheduled.length === 0 ? (
              <div className="text-center text-xs text-slate-300 py-6">{t("ไม่มีงานค้าง 🎉", "All scheduled 🎉")}</div>
            ) : (
              <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-0.5">
                {unscheduled.map((e) => (
                  <div key={e.id} draggable onDragStart={() => startDrag(e)} onDragEnd={() => { dragRef.current = null; setOverKey(null); }}
                    onClick={() => setDetail({ kind: e.kind, id: e.id })}
                    className={`bg-white border rounded-lg p-1.5 cursor-pointer hover:border-violet-300 flex items-center gap-2 ${e.overdue ? "border-red-200" : "border-slate-200"}`}>
                    <span className="text-slate-300 shrink-0" title={t("ลากเพื่อจัดวัน", "Drag to schedule")}>⠿</span>
                    <Thumb e={e} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-700 truncate">{e.title}</div>
                      {e.sub && <div className="text-[10px] text-violet-500 truncate">{e.sub}</div>}
                      {e.meta && <div className="text-[10px] text-slate-400 truncate">{e.meta}</div>}
                      {cancelAsk === e.id && (
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap" onClick={(ev) => ev.stopPropagation()}>
                          <span className="text-[11px] text-rose-700">{L.cancelQ}</span>
                          <button type="button" onClick={() => void cancelEntry(e)} className="h-6 px-2 rounded-md bg-rose-600 text-white text-[11px] font-medium hover:bg-rose-700">{t("ใช่ ยกเลิก", "Yes, cancel")}</button>
                          <button type="button" onClick={() => setCancelAsk(null)} className="h-6 px-2 rounded-md border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50">{t("กลับ", "Back")}</button>
                        </div>
                      )}
                    </div>
                    {!e.hideInBacklog && cancelAsk !== e.id && (
                      <button type="button" onClick={(ev) => { ev.stopPropagation(); setCancelAsk(e.id); }} title={L.cancelTip}
                        className="h-7 w-7 shrink-0 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 text-sm leading-none">✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </>)}
      </div>

      {/* ป๊อปเลือกว่าจะทำอะไรกับวันที่กด */}
      <ERPModal open={!!dayPick} onClose={() => setDayPick(null)} size="sm" title={`${L.icon} ${dayPickLabel}`}>
        {dayPick && (
          <div className="space-y-3">
            {(byDay[dayPick] ?? []).length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-600">📌 {t("มีอยู่แล้วในวันนี้", "Already on this day")}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{(byDay[dayPick] ?? []).length}</span>
                </div>
                <div className="space-y-1.5 max-h-[30vh] overflow-y-auto pr-0.5">
                  {(byDay[dayPick] ?? []).map((e) => (
                    <button key={e.id} type="button" onClick={() => { setDayPick(null); setDetail({ kind: e.kind, id: e.id }); }} title={t("กดเพื่อเปิดดู/แก้", "Open")}
                      className="w-full text-left bg-white border border-slate-200 rounded-lg p-2 hover:border-violet-400 hover:bg-violet-50 flex items-center gap-2">
                      {e.time ? <span className="text-[11px] font-mono text-slate-500 shrink-0 w-11">{e.time}</span> : null}
                      <Thumb e={e} size="xs" />
                      <span className="min-w-0 flex-1 text-xs font-medium text-slate-700 truncate">{e.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${e.overdue ? "bg-red-50 text-red-700 border-red-200" : e.statusCls}`}>{e.overdue ? t("เลยกำหนด", "Overdue") : e.statusLabel}</span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-slate-100 mt-3" />
              </div>
            )}
            <button type="button" onClick={() => { const k = dayPick; setDayPick(null); openCreate(k); }}
              className="w-full h-11 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 flex items-center justify-center gap-2">＋ {L.createDay}</button>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-600">📥 {L.pick}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{unscheduled.length}</span>
              </div>
              {unscheduled.length === 0 ? (
                <p className="text-xs text-slate-300 text-center py-4">{t("ไม่มีงานค้าง 🎉", "All scheduled 🎉")}</p>
              ) : (
                <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-0.5">
                  {unscheduled.map((e) => (
                    <button key={e.id} type="button" onClick={() => pickIntoDay(e, dayPick)} title={t("กดเพื่อลงวันนี้", "Click to schedule on this day")}
                      className="w-full text-left bg-white border border-slate-200 rounded-lg p-2 hover:border-violet-400 hover:bg-violet-50 flex items-center gap-2">
                      <Thumb e={e} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-700 truncate">{e.title}</div>
                        {(e.sub || e.meta) && <div className="text-[10px] text-slate-400 truncate">{[e.sub, e.meta].filter(Boolean).join(" · ")}</div>}
                      </div>
                      <span className="text-[11px] text-violet-700 shrink-0">{t("ลงวันนี้", "Schedule")}{mode === "content" ? ` ${defaultTimeFor(dayPick)}` : ""} →</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </ERPModal>

      {detail?.kind === "content" && <ContentDrawer contentId={detail.id} brands={brands} onClose={() => setDetail(null)} onChanged={reload} pushToast={pushToast} />}
      {detail?.kind === "task" && (
        <TaskDetailDrawer taskId={detail.id} brands={brands} campaigns={campaigns} onClose={() => setDetail(null)} onChanged={() => tasksSWR.revalidate(true)}
          onMove={async (task, toKey) => { const ok = await applyTaskTransition(task, toKey, { pushToast }); if (ok) await tasksSWR.revalidate(true); }}
          onDelete={async (id) => { try { await deleteTask(id); pushToast("info", t("ลบงานแล้ว", "Task deleted")); setDetail(null); await tasksSWR.revalidate(true); } catch (e) { pushToast("error", (e as Error).message); } }}
          pushToast={pushToast} />
      )}

      <ContentCreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); reload(); }}
        brands={brands} campaigns={campaigns}
        defaultBrandId={brandFilter === "all" ? null : brandFilter} defaultDate={createDate} pushToast={pushToast} />
      <CreateTaskModal open={taskCreateOpen} onClose={() => setTaskCreateOpen(false)} onCreated={() => { setTaskCreateOpen(false); void tasksSWR.revalidate(true); }} pushToast={pushToast} />

      {styleBrandId && (() => {
        const b = brands.find((x) => x.id === styleBrandId);
        return b ? (
          <BrandStyleModal brand={b} current={styleMap[styleBrandId] ?? null} onClose={() => setStyleBrandId(null)}
            onSaved={(s) => {
              const rest = (stylesSWR.data ?? []).filter((x) => x.brand_id !== s.brand_id);
              stylesSWR.mutate((s.accent_color || s.bg_image_key) ? [...rest, s] : rest);
              setStyleBrandId(null);
            }} pushToast={pushToast} />
        ) : null;
      })()}

      <div className="fixed bottom-6 right-6 z-[70] flex flex-col gap-2">
        {toasts.map((x) => <div key={x.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${x.type === "success" ? "bg-emerald-600" : x.type === "error" ? "bg-red-600" : "bg-slate-800"}`}>{x.message}</div>)}
      </div>
    </StandaloneShell>
  );
}
