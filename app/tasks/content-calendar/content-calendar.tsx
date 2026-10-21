"use client";

// ============================================================
// ปฏิทินคอนเทนต์ + ปฏิทินงาน (หน้าเดียว สลับโหมดได้)
// ของกลาง: StandaloneShell, ERPModal, ContentDrawer, ContentCreateModal, TaskDetailDrawer, CreateTaskModal, listContent/listTasks, listBrands
// เฟส 2: ปฏิทินรายเดือน + แท็บแบรนด์ (สีแบรนด์) + คลิกการ์ดเปิด drawer
// เฟส 3: คลิกช่องวัน=ป๊อปเลือก (สร้างใหม่/หยิบจากค้าง) · กล่อง "ยังไม่ลงวันที่" · ลากวางเปลี่ยนวัน
// เฟส 4 (2026-10-07): โหมด "งาน" — ปฏิทินเดียวกัน ใช้กำหนดส่ง (due_date) · การ์ดมีรูปปก · ลากเปลี่ยนกำหนดส่ง
//   ทุกอย่างทำงานบน CalEntry (รูปกลาง) → แผงปฏิทิน/กล่องค้าง/ป๊อปวัน ใช้โค้ดชุดเดียวทั้ง 2 โหมด
// 2026-10-13: แท็บ "วางแผน" (?cal=plan) = หน้าวางแผนคอนเทนต์ (ContentPlanView embedded) ย้ายมารวมที่นี่
//   + ตัวเลข 🔔 บนแท็บ = รอบเปลี่ยนที่ต้องเตรียม (เลยรอบ/ยังไม่เคยทำ/ใกล้ถึงรอบ)
// ============================================================

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useSWRLite } from "@/lib/swr-lite";
import { StandaloneShell } from "@/components/standalone-shell";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { todayBangkok } from "@/lib/date";   // วันนี้ตามเวลาไทย (ไม่ใช่เวลาสากล)
import {
  listContent, listBrands, listCampaigns, listBrandCalStyles, updateContent, getRecommendedTimes, type RecommendedTimes,
  CONTENT_STATUS_META, contentStatusLabel, type BrandCalStyle, type ContentStatus,
  listTasks, updateTask, deleteTask, isOverdue, type CreativeTask,
  getPlatformSettings, PLATFORM_SETTINGS_SWR_KEY, type PlatformSettings,
} from "../data";
import { platformReadiness, type PlatReady } from "@/lib/content-readiness";
import { loadCaptionTexts } from "../content/caption-assemble";
import { copyText } from "@/components/copy-button";
import type { ContentCreatePreset } from "../content/content-create-modal";
import { StoryQuickModal } from "./story-quick-modal";
import { applyTaskTransition } from "../task-actions";
import { statusMeta, statusLabel, isTerminal, useCreativeStatuses } from "../use-statuses";
import { BrandStyleModal } from "./brand-style-modal";
import { platformLabel, platformMeta, useCreativeOptions } from "../use-options";
import { PlatformIcon } from "@/components/platform-icon";
import { useCanHover } from "@/lib/use-can-hover";
import { createPortal } from "react-dom";
import { r2ImageUrl } from "@/lib/r2-image";
import { useAuth } from "@/components/auth";
import dynamic from "next/dynamic";
import { useRefreshRules } from "@/app/marketing/content-plan/plan-refresh";
import { refreshStatuses, bangkokDateKey, REFRESH_ALERT_STATES } from "@/lib/marketing/content-plan";
import { usePushToast } from "@/components/toast";
import { ErrorState, LoadingState } from "@/components/state-views";

// แท็บวางแผน โหลดเมื่อกดเข้า (ไม่ถ่วงแท็บคอนเทนต์/งาน)
const ContentPlanView = dynamic(() => import("@/app/marketing/content-plan/view").then((m) => m.ContentPlanView), {
  ssr: false, loading: () => <div className="px-4 sm:px-8 py-5 space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div>,
});
// drawer/ป๊อปที่มีตัวพิมพ์ข้อความ (rich text) — โหลดเมื่อเปิดใช้จริง (เดิมลากโค้ดคอนเทนต์ ~2,400 บรรทัด + drawer งาน มาตอนเปิดหน้า)
const ContentDrawer = dynamic(() => import("../content/content").then((m) => m.ContentDrawer), { ssr: false });
const ContentCreateModal = dynamic(() => import("../content/content-create-modal").then((m) => m.ContentCreateModal), { ssr: false });
const TaskDetailDrawer = dynamic(() => import("../task-detail-drawer").then((m) => m.TaskDetailDrawer), { ssr: false });
const CreateTaskModal = dynamic(() => import("../create-task-modal").then((m) => m.CreateTaskModal), { ssr: false });

type CalMode = "content" | "task" | "plan";
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
  // ความพร้อมต่อแพลตฟอร์ม (เฉพาะคอนเทนต์) — ไว้ทำไอคอนสี + quick view
  captionPlatforms: string[];                 // แพลตฟอร์มที่มีแคปชั่นแล้ว
  platformImages: Record<string, string[]>;   // รูปที่เลือกต่อแพลตฟอร์ม (r2_key) — ว่าง = ใช้รูปทั้งหมด
  imageKeys: string[]; imageCount: number;    // รูปแนบทั้งหมด (ตัวอย่าง ≤6) + จำนวน
  postStatus: Record<string, string>;         // posted / scheduled / skip ต่อแพลตฟอร์ม
  isStory: boolean;                           // โพสต์แบบ Story (platform_formats มี "story") — โหมด Story ของปฏิทิน
  fileCount: number;                          // ไฟล์แนบทุกชนิด (รูป/วิดีโอ/ลิงก์) — 0 = ยังไม่มีไฟล์
  formats: Record<string, string>;            // รูปแบบโพสต์ต่อแพลตฟอร์ม (story/reels/…) — Story ไม่ต้องมีแคปชั่น
};

/** Story ที่ลงแผนไว้ก่อน ยังไม่ได้ใส่ไฟล์ (รูป/วิดีโอ/ลิงก์) → ขึ้นป้าย "ยังไม่มีไฟล์" ให้รู้ว่าต้องกลับมาใส่ */
const storyNoFile = (e: CalEntry) => e.isStory && e.fileCount === 0;
/**
 * Story "โพสต์แล้ว" — คอนเทนต์ไม่มีสถานะชื่อ "posted" (มีแค่ ร่าง/พร้อม/ตั้งเวลา/เผยแพร่/ยกเลิก)
 * การติ๊ก ☐ โพสต์แล้ว เก็บรายแพลตฟอร์มใน post_status → ถือว่าโพสต์แล้วเมื่อทุกแพลตฟอร์มที่เป็น Story ติ๊กครบ (หรือสถานะเผยแพร่)
 * (เดิมเช็ก e.status === "posted" ซึ่งไม่มีจริง → ✓ ไม่เคยขึ้น)
 */
function storyPosted(e: CalEntry): boolean {
  if (e.status === "published") return true;
  const ps = e.postStatus ?? {};
  const storyPlats = Object.entries(e.formats ?? {}).filter(([, f]) => f === "story").map(([p]) => p);
  const targets = storyPlats.length ? storyPlats : Object.keys(ps);
  return targets.length > 0 && targets.every((p) => ps[p] === "posted");
}
function NoFileBadge() {
  return (
    <span title="Story นี้ยังไม่มีไฟล์ — กดเปิด แล้วใส่ไฟล์ที่การ์ด 🖼 รูป/วิดีโอ (＋ เพิ่ม / จัดการ)"
      className="shrink-0 text-[9px] leading-none text-amber-600">ไม่มีไฟล์</span>
  );
}

/** ความพร้อมของแพลตฟอร์มหนึ่ง ๆ บนการ์ด: โพสต์แล้ว / ข้าม / พร้อม / ขาดอะไร — กติกาอยู่ที่ของกลาง lib/content-readiness
 *  (ไม่ต้องมีแคปชั่น: แพลตฟอร์มที่ ⚙️ ตั้ง "ไม่ใช้แคปชั่น" เช่น Shopee/Lazada · แพลตฟอร์มที่ลงเป็น Story → มีรูปก็พร้อมโพสต์) */
const platReadiness = (e: CalEntry, pset?: PlatformSettings | null): PlatReady[] => platformReadiness(e, pset);
const READY_RING: Record<PlatReady["state"], string> = {
  posted: "ring-emerald-500 bg-emerald-50", scheduled: "ring-blue-500 bg-blue-50", ready: "ring-emerald-400 bg-white", missing: "ring-amber-400 bg-amber-50", skip: "ring-slate-300 bg-slate-100 opacity-50",
};
const READY_LABEL: Record<PlatReady["state"], string> = { posted: "โพสต์แล้ว", scheduled: "ตั้งเวลาแล้ว", ready: "พร้อมโพสต์", missing: "ยังขาด", skip: "ข้าม" };
const MISSING_LABEL = { caption: "แคปชั่น", image: "รูป" } as const;

/** แถวไอคอนแพลตฟอร์มเล็ก ๆ บนการ์ด — วงสีบอกความพร้อม (เขียว=พร้อม/โพสต์แล้ว · เหลือง=ยังขาดแคปชั่นหรือรูป · เทา=ข้าม) */
function PlatIcons({ list, size = 12 }: { list: PlatReady[]; size?: number }) {
  if (!list.length) return null;
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      {list.slice(0, 6).map((p) => (
        <span key={p.code} title={`${platformLabel(p.code)}: ${READY_LABEL[p.state]}${p.missing.length ? ` ${p.missing.map((m) => MISSING_LABEL[m]).join("+")}` : ""}`}
          className={`inline-flex items-center justify-center rounded-full ring-1 ${READY_RING[p.state]}`} style={{ width: size + 4, height: size + 4 }}>
          <PlatformIcon code={p.code} iconKey={platformMeta(p.code)?.icon_key ?? null} size={size} />
        </span>
      ))}
      {list.length > 6 && <span className="text-[9px] text-slate-400">+{list.length - 6}</span>}
    </span>
  );
}

/**
 * Quick view ของคอนเทนต์ — ชี้เมาส์ค้าง (จอที่มีเมาส์) หรือแตะ ⓘ (จอสัมผัส): รูปที่จะลง + ต่อแพลตฟอร์มว่าขาดอะไร (แคปชั่น/รูป)
 * วางแบบ fixed ผ่าน portal (ไม่โดนช่องวันตัด) — แบบเดียวกับ Popover ของกลาง แต่เปิดด้วย hover
 */
/** ปุ่มในการ์ดลอย (ต่อแพลตฟอร์ม): 📋 คัดลอกแคปชั่น · ☐ โพสต์แล้ว — texts = ข้อความที่ประกอบแล้ว (undefined = กำลังโหลด) */
type QvActions = { texts: Record<string, string> | "error" | undefined; busy: string | null; onCopy: (code: string) => void; onTogglePosted: (code: string) => void };
function QuickView({ e, plats, open, anchor, rect, actions, onClose, onOpen }: { e: CalEntry; plats: PlatReady[]; open: boolean; anchor: HTMLElement | null; rect?: DOMRect | null; actions?: QvActions; onClose: () => void; onOpen: () => void }) {
  if (!open || !anchor || typeof document === "undefined") return null;
  // การ์ดในปฏิทินถูกสร้างใหม่ทุกครั้งที่หน้าอัปเดต (เช่น หลังติ๊กโพสต์แล้ว/ขึ้นแจ้งเตือน) → ปุ่มเดิมหลุดจากหน้า ใช้ตำแหน่งที่จำไว้ตอนเปิดแทน
  const r = anchor.isConnected || !rect ? anchor.getBoundingClientRect() : rect;
  const W = actions ? 340 : 300; const left = Math.min(Math.max(8, r.left), window.innerWidth - W - 8);
  const above = window.innerHeight - r.bottom < 300 && r.top > 300;
  const style: React.CSSProperties = above ? { position: "fixed", left, bottom: window.innerHeight - r.top + 4, width: W, zIndex: 80 } : { position: "fixed", left, top: r.bottom + 4, width: W, zIndex: 80 };
  const missingAny = plats.filter((p) => p.state === "missing");
  const shown = e.imageKeys.slice(0, 4);
  if (e.isStory) {
    const sw = 230; const st: React.CSSProperties = { ...style, left: Math.min(Math.max(8, r.left), window.innerWidth - sw - 8), width: sw };
    return createPortal(
      <div style={st} className="rounded-lg border border-slate-200 bg-white shadow-lg p-2 text-[11px]" onMouseEnter={onOpen} onMouseLeave={onClose}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${e.statusDot}`} />
          <span className="truncate font-medium text-slate-700">📖 {e.title}</span>
          <span className="ml-auto shrink-0 text-[10px] text-slate-400">{e.statusLabel}</span>
        </div>
        {shown.length > 0 && (
          <div className="mt-1.5 flex gap-1">
            {shown.map((k) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={k} src={r2ImageUrl(k, 120) ?? ""} alt="" className="h-10 w-10 rounded object-cover border border-slate-200" />
            ))}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
          <PlatIcons list={plats} size={10} />
          <span className={e.fileCount ? "text-slate-400" : "text-amber-600"}>{e.fileCount ? `📎 ${e.fileCount} ไฟล์` : "ยังไม่มีไฟล์"}</span>
          <span className="ml-auto text-slate-400">คลิกเพื่อเปิด</span>
        </div>
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div style={style} className="rounded-xl border border-slate-200 bg-white shadow-xl p-2.5 text-xs" onMouseEnter={onOpen} onMouseLeave={onClose}
      onClick={(ev) => ev.stopPropagation()}>
      <div className="flex items-start gap-2">
        <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${e.statusDot}`} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-800 leading-snug line-clamp-2">{e.title}</div>
          <div className="text-[10px] text-slate-400">{e.time ? `${e.time} · ` : ""}{e.brand_label ?? ""}{e.meta ? ` · ${e.meta}` : ""} · {e.statusLabel}</div>
        </div>
      </div>
      {/* รูปที่จะลง */}
      {shown.length > 0 ? (
        <div className={`mt-2 grid gap-1 ${shown.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {shown.map((k, i) => (
            <div key={k} className={`relative overflow-hidden rounded-md bg-slate-100 ${shown.length === 1 ? "aspect-[4/3]" : "aspect-square"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r2ImageUrl(k, 300) ?? ""} alt="" className="w-full h-full object-cover" />
              {i === 3 && e.imageCount > 4 && <span className="absolute inset-0 bg-black/50 text-white flex items-center justify-center text-base font-semibold">+{e.imageCount - 4}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 rounded-md border border-dashed border-amber-300 bg-amber-50 px-2 py-2 text-center text-[11px] text-amber-700">🖼 ยังไม่มีรูปที่จะลง</div>
      )}
      {/* ต่อแพลตฟอร์ม */}
      {plats.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {plats.map((p) => (
            <div key={p.code} className="flex items-center gap-1.5">
              <PlatformIcon code={p.code} iconKey={platformMeta(p.code)?.icon_key ?? null} size={13} />
              <span className="text-slate-700 w-[72px] truncate">{platformLabel(p.code)}</span>
              {/* โพสต์แล้ว + มีปุ่มติ๊ก = ปุ่มเขียวทำหน้าที่เป็นป้ายแทน (ไม่ให้ซ้ำ) */}
              {!(actions && p.state === "posted") && (
                <span className={`text-[10px] px-1.5 py-px rounded-full ${p.state === "posted" ? "bg-emerald-100 text-emerald-700" : p.state === "scheduled" ? "bg-blue-100 text-blue-700" : p.state === "ready" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : p.state === "skip" ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-800"}`}>
                  {p.state === "missing" ? `ขาด ${p.missing.map((m) => MISSING_LABEL[m]).join(" + ")}` : READY_LABEL[p.state]}
                </span>
              )}
              {p.captionOff && p.state !== "skip" && <span className="text-[10px] text-slate-400" title={p.isStory ? "ลงเป็น Story — ไม่ต้องมีแคปชั่น" : "ตั้งไว้ที่ ⚙️ ตั้งค่าแพลตฟอร์ม — แพลตฟอร์มนี้ลงแค่รูป"}>{p.isStory ? "Story" : "ไม่ใช้แคปชั่น"}</span>}
              <span className="ml-auto flex items-center gap-1 shrink-0">
                {p.images.length > 0 && e.platformImages[p.code]?.length ? <span className="text-[10px] text-slate-400">🖼 {e.platformImages[p.code].length}</span> : null}
                {/* 📋 คัดลอกแคปชั่นที่จะโพสต์ (ข้อความเดียวกับปุ่ม 📋 ใน drawer) */}
                {actions && !p.captionOff && p.state !== "skip" && (() => {
                  const tx = actions.texts; const text = tx && tx !== "error" ? (tx[p.code] ?? "") : "";
                  const loading = tx === undefined;
                  return (
                    <button type="button" onClick={() => actions.onCopy(p.code)} disabled={loading || tx === "error" || !text}
                      title={loading ? "กำลังเตรียมแคปชั่น…" : tx === "error" ? "โหลดแคปชั่นไม่สำเร็จ — เปิดการ์ดเพื่อคัดลอก" : text ? `คัดลอกแคปชั่น ${platformLabel(p.code)}` : "ยังไม่มีแคปชั่น — คลิกการ์ดเพื่อเขียน"}
                      className="h-5 w-6 rounded border border-slate-200 text-[10px] text-slate-500 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200 disabled:opacity-40">{loading ? "…" : "📋"}</button>
                  );
                })()}
                {/* ☐ โพสต์แล้ว (บันทึกทันที · กดซ้ำ = ยกเลิก) — ข้าม/ตั้งเวลาแล้ว ไม่มีปุ่ม (เหมือนใน drawer) */}
                {actions && (p.state === "posted" || p.state === "ready" || p.state === "missing") && (() => {
                  const posted = p.state === "posted"; const busy = actions.busy === p.code;
                  return (
                    <button type="button" onClick={() => actions.onTogglePosted(p.code)} disabled={busy}
                      title={posted ? "โพสต์แล้ว — กดอีกครั้งเพื่อยกเลิก" : "โพสต์เสร็จแล้ว → ติ๊กที่นี่ (บันทึกทันที)"}
                      className={`h-5 inline-flex items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium disabled:opacity-60 ${posted ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700" : "bg-white text-slate-500 border-slate-300 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"}`}>
                      <span className={`inline-flex h-3 w-3 items-center justify-center rounded-sm border text-[8px] leading-none ${posted ? "bg-white text-emerald-600 border-white" : "bg-white border-slate-400"}`}>{busy ? "…" : posted ? "✓" : ""}</span>
                      โพสต์แล้ว
                    </button>
                  );
                })()}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
        <span>{missingAny.length ? `⚠ ยังขาด ${missingAny.length}/${plats.length} แพลตฟอร์ม` : plats.length ? "✓ ครบทุกแพลตฟอร์ม" : "ยังไม่เลือกแพลตฟอร์ม"}</span>
        <span>คลิกการ์ดเพื่อเปิดแก้</span>
      </div>
    </div>,
    document.body,
  );
}

export function ContentCalendarView() {
  const t = useT();
  const { platforms } = useCreativeOptions();
  const { statuses: taskStatuses } = useCreativeStatuses();
  // โหมดปฏิทิน: คอนเทนต์ (วันตั้งโพสต์) / งาน (กำหนดส่ง) / วางแผน — จำใน URL ?cal=task | ?cal=plan
  const [mode, setModeState] = useState<CalMode>("content");
  const setMode = (m: CalMode) => {
    setModeState(m); setStatusFilter("all"); setCancelAsk(null);
    try { const u = new URL(window.location.href); if (m !== "content") u.searchParams.set("cal", m); else u.searchParams.delete("cal"); window.history.replaceState(null, "", u.toString()); } catch { /* noop */ }
  };
  const [detail, setDetail] = useState<{ kind: CalMode; id: string } | null>(null);
  const [brandFilter, setBrandFilter] = useState<string>("all");   // "all" | brandId
  const [platformFilter, setPlatformFilter] = useState<string>("all");   // "all" | platform value
  const [statusFilter, setStatusFilter] = useState<string>("all");   // "all" | สถานะ (ตามโหมด)
  const [notReady, setNotReady] = useState(false);   // ⚠ ยังไม่พร้อม = โพสต์ที่ยังขาดแคปชั่นหรือรูปในแพลตฟอร์มใดแพลตฟอร์มหนึ่ง (ใช้ร่วมกับตัวกรองอื่นได้)
  const [offset, setOffset] = useState(0);                          // เลื่อนเดือน (0 = เดือนนี้)
  const [createOpen, setCreateOpen] = useState(false);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<string | null>(null);   // วันตั้งโพสต์ prefill (จากช่องที่คลิก)
  const [createPreset, setCreatePreset] = useState<ContentCreatePreset | null>(null);   // ค่าตั้งต้นฟอร์ม (โหมด Story)
  // 📖 โหมด Story: แถบเล็กใต้ทุกวันบอกว่า "ทำ Story ของวันนี้รึยัง" (เจ้าของลง Story ทุกวัน) — จำค่าไว้ในเครื่อง
  const [storyMode, setStoryMode] = useState<boolean>(() => typeof window !== "undefined" && window.localStorage.getItem("content-calendar-story") === "1");
  const toggleStory = () => setStoryMode((v) => { try { window.localStorage.setItem("content-calendar-story", v ? "0" : "1"); } catch { /* ignore */ } return !v; });
  // ＋ ในแถบ Story → ป๊อปเล็ก (หัวข้อ/ประเภท/ที่อยู่ไฟล์) ไม่ใช่ฟอร์มคอนเทนต์เต็ม (เจ้าของขอ) — story-quick-modal.tsx
  const [storyDay, setStoryDay] = useState<string | null>(null);
  const openStoryCreate = (dayKey: string) => setStoryDay(dayKey);
  void setCreatePreset;
  // ลากวาง: จำ id + เวลาเดิมของการ์ดที่กำลังลาก + ช่องที่เมาส์ลอยอยู่
  const dragRef = useRef<{ id: string; time: string | null } | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  // quick view ของการ์ดคอนเทนต์ (ชี้ค้าง/แตะ ⓘ) — เก็บ id + ปุ่มที่ยึดตำแหน่ง
  const [quickView, setQuickView] = useState<{ id: string; anchor: HTMLElement; rect: DOMRect } | null>(null);
  const qvTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canHover = useCanHover();
  useEffect(() => { if (!canHover) return; const off = () => setQuickView(null); window.addEventListener("scroll", off, true); return () => window.removeEventListener("scroll", off, true); }, [canHover]);
  // (เอาออก 2026-10-14) เดิมหมุนลูกกลิ้งบนปฏิทิน = เปลี่ยนเดือน — เจ้าของขอให้เลื่อนหน้าธรรมดา ใช้ปุ่ม ‹ › เปลี่ยนเดือนแทน

  const pushToast = usePushToast();   // แจ้งเตือนผ่าน toast กลาง (components/toast)

  // ใช้ cache ร่วมกับหน้าคอนเทนต์/หน้างาน (key เดียวกัน) — เข้าหน้านี้เห็นทันที · งานโหลดเฉพาะตอนอยู่โหมดงาน
  const itemsSWR = useSWRLite("creative:content", () => listContent());
  const tasksSWR = useSWRLite(mode === "task" ? "creative:tasks:all" : null, () => listTasks({ sort_by: "updated_at", sort_dir: "desc" }), { refreshMs: 20000, timeoutMs: 15000 });
  const brandsSWR = useSWRLite("creative:brands", () => listBrands());
  const campaignsSWR = useSWRLite("creative:campaigns", () => listCampaigns());
  const stylesSWR = useSWRLite("creative:brand-cal-styles", () => listBrandCalStyles());
  // ⚙️ ตั้งค่าแพลตฟอร์ม (เช่น Shopee/Lazada "ไม่ใช้แคปชั่น") — ใช้ตัดสินว่าพร้อมโพสต์หรือยัง · key เดียวกับ drawer (แก้ตั้งค่าแล้วปฏิทินเปลี่ยนตามทันที)
  const psetSWR = useSWRLite(PLATFORM_SETTINGS_SWR_KEY, () => getPlatformSettings());
  const pset = psetSWR.data;
  const isNotReady = useCallback((e: CalEntry) => e.kind === "content" && e.status !== "cancelled" && platReadiness(e, pset).some((p) => p.state === "missing"), [pset]);
  const items = useMemo(() => itemsSWR.data ?? [], [itemsSWR.data]);
  const tasks = useMemo(() => tasksSWR.data ?? [], [tasksSWR.data]);
  const brands = brandsSWR.data ?? [];
  // 🔔 รอบเปลี่ยนที่ต้องเตรียม → ตัวเลขบนแท็บวางแผน (กฎ = แคชร่วมกับแท็บวางแผน)
  const { can } = useAuth();
  const { rules: refreshRules } = useRefreshRules();
  const refreshAlerts = useMemo(() => refreshStatuses(refreshRules, items.filter((c) => !c.is_template), bangkokDateKey(new Date()))
    .filter((s) => REFRESH_ALERT_STATES.includes(s.state)).length, [refreshRules, items]);
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
    else if (sp.get("cal") === "plan" && !cid) setModeState("plan");
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
          captionPlatforms: c.caption_platforms ?? [], platformImages: c.platform_images ?? {}, imageKeys: c.image_keys ?? [], imageCount: c.image_count ?? 0, postStatus: c.post_status ?? {},
          isStory: Object.values(c.platform_formats ?? {}).includes("story"),
          fileCount: c.file_count ?? c.image_count ?? 0, formats: c.platform_formats ?? {},
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
        captionPlatforms: [], platformImages: {}, imageKeys: [], imageCount: 0, postStatus: {}, isStory: false, fileCount: 0, formats: {},
      };
    });
  }, [mode, items, tasks]);

  // กรองตามแบรนด์ + แพลตฟอร์ม + สถานะที่เลือก
  const filtered = useMemo(
    () => entries.filter((e) =>
      (brandFilter === "all" || e.brand_id === brandFilter)
      && (platformFilter === "all" || e.platforms.includes(platformFilter))
      && (statusFilter === "all" || e.status === statusFilter)
      && (!notReady || isNotReady(e)),
    ),
    [entries, brandFilter, platformFilter, statusFilter, notReady, isNotReady],
  );
  const hasFilter = brandFilter !== "all" || platformFilter !== "all" || statusFilter !== "all" || notReady;

  // เดือนที่กำลังดู
  const base = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + offset, 1); }, [offset]);
  const year = base.getFullYear(), month = base.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthName = base.toLocaleDateString(t("th-TH", "en-US"), { month: "long", year: "numeric" });
  const todayKey = todayBangkok();
  // ตัวเลขบนชิปตัวกรอง: นับเฉพาะรายการ "ของเดือนที่เปิดอยู่" — แบรนด์นับทั้งเดือน · แพลตฟอร์ม/สถานะนับในแบรนด์ที่เลือก
  const counts = useMemo(() => {
    const all = entries.filter((e) => e.dateKey && e.dateKey.slice(0, 7) === ym);
    const inBrand = all.filter((e) => brandFilter === "all" || e.brand_id === brandFilter);
    const brand: Record<string, number> = {}; const plat: Record<string, number> = {}; const stat: Record<string, number> = {};
    for (const e of all) { const k = e.brand_id ?? "_"; brand[k] = (brand[k] ?? 0) + 1; }
    for (const e of inBrand) { for (const p of e.platforms) plat[p] = (plat[p] ?? 0) + 1; stat[e.status] = (stat[e.status] ?? 0) + 1; }
    const notReadyN = inBrand.filter(isNotReady).length;   // ยังขาดแคปชั่น/รูป (เดือนนี้ ในแบรนด์ที่เลือก)
    return { total: all.length, inBrand: inBrand.length, brand, plat, stat, notReady: notReadyN };
  }, [entries, brandFilter, ym, isNotReady]);

  // Story ต่อวัน (ตามตัวกรองแบรนด์เท่านั้น — ไม่สนแพลตฟอร์ม/สถานะ/ยังไม่พร้อม เพื่อให้แถบ Story คงที่)
  const storyByDay = useMemo(() => {
    const map: Record<string, CalEntry[]> = {};
    for (const e of entries) { if (!e.isStory || !e.dateKey || e.status === "cancelled") continue; if (brandFilter !== "all" && e.brand_id !== brandFilter) continue; (map[e.dateKey] ??= []).push(e); }
    return map;
  }, [entries, brandFilter]);
  const storyDaysInMonth = useMemo(() => Object.keys(storyByDay).filter((k) => k.slice(0, 7) === ym).length, [storyByDay, ym]);

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
  // 📋 ข้อความแคปชั่นของการ์ดลอย — โหลดตอนเปิดการ์ด (ให้กดคัดลอกได้ทันที) · ประกอบด้วยของกลางตัวเดียวกับ drawer · แคชตามเวลาแก้ล่าสุดของโพสต์
  const [qvTexts, setQvTexts] = useState<Record<string, Record<string, string> | "error">>({});
  const qvLoading = useRef(new Set<string>());
  const textKeyOf = useCallback((id: string) => { const c = items.find((x) => x.id === id); return c ? `${c.id}|${c.updated_at}` : null; }, [items]);
  const qvKey = mode === "content" && quickView ? textKeyOf(quickView.id) : null;
  useEffect(() => {
    if (!qvKey || qvTexts[qvKey] || qvLoading.current.has(qvKey)) return;
    qvLoading.current.add(qvKey);
    loadCaptionTexts(qvKey.split("|")[0], pset)
      .then((tx) => setQvTexts((m) => ({ ...m, [qvKey]: tx })))
      .catch(() => setQvTexts((m) => ({ ...m, [qvKey]: "error" })))
      .finally(() => qvLoading.current.delete(qvKey));
  }, [qvKey, qvTexts, pset]);
  const qvCopy = useCallback(async (id: string, code: string) => {
    const k = textKeyOf(id); const tx = k ? qvTexts[k] : undefined;
    const text = tx && tx !== "error" ? tx[code] : "";
    if (!text) { pushToast("info", t(`ยังไม่มีแคปชั่นของ ${platformLabel(code)} — คลิกการ์ดเพื่อเขียน`, `No ${platformLabel(code)} caption yet`)); return; }
    const ok = await copyText(text);
    pushToast(ok ? "success" : "error", ok ? t(`คัดลอกแคปชั่น ${platformLabel(code)} แล้ว`, `Copied ${platformLabel(code)} caption`) : t("คัดลอกไม่สำเร็จ", "Copy failed"));
  }, [textKeyOf, qvTexts, pushToast, t]);
  // ☐ โพสต์แล้ว จากการ์ดลอย — บันทึกทันที (เหมือนปุ่มใน drawer: เปลี่ยนเฉพาะ post_status) · โชว์ผลก่อนแล้วค่อยยิง (พลาด = ย้อนกลับ)
  const [qvBusy, setQvBusy] = useState<string | null>(null);   // "contentId|platform" ที่กำลังบันทึก
  const togglePosted = useCallback(async (id: string, code: string) => {
    const cur = items; const it = cur.find((c) => c.id === id); if (!it) return;
    const prev = (it.post_status ?? {}) as Record<string, string>;
    const willPost = prev[code] !== "posted";
    const next = { ...prev }; if (willPost) next[code] = "posted"; else delete next[code];
    setQvBusy(`${id}|${code}`);
    itemsSWR.mutate(cur.map((c) => c.id === id ? { ...c, post_status: next } : c));
    try {
      await updateContent(id, { post_status: next });
      pushToast("success", willPost ? t(`ติ๊ก ${platformLabel(code)} โพสต์แล้ว`, `${platformLabel(code)} marked posted`) : t(`ยกเลิก “โพสต์แล้ว” ของ ${platformLabel(code)}`, `${platformLabel(code)} unmarked`));
    } catch (e) { itemsSWR.mutate(cur); pushToast("error", (e as Error).message); }
    finally { setQvBusy(null); void itemsSWR.revalidate(true); }
  }, [items, itemsSWR, pushToast, t]);

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
    const plats = e.kind === "content" ? platReadiness(e, pset) : [];
    const story = e.kind === "content" && e.isStory;   // Story = การ์ดเล็กจาง ๆ ไม่ให้เด่นกว่าโพสต์ปกติ
    const isQv = quickView?.id === e.id;
    const openQv = (el: HTMLElement) => { if (qvTimer.current) clearTimeout(qvTimer.current); qvTimer.current = setTimeout(() => setQuickView({ id: e.id, anchor: el, rect: el.getBoundingClientRect() }), 350); };
    const closeQv = () => { if (qvTimer.current) clearTimeout(qvTimer.current); qvTimer.current = setTimeout(() => setQuickView((q) => (q?.id === e.id ? null : q)), 200); };
    return (
      <div className="relative group"
        onMouseEnter={(ev) => { if (canHover && e.kind === "content") openQv(ev.currentTarget); }}
        onMouseLeave={() => { if (canHover) closeQv(); }}>
        <button draggable onDragStart={() => { setQuickView(null); startDrag(e); }} onDragEnd={() => { dragRef.current = null; setOverKey(null); }}
          onClick={(ev) => { ev.stopPropagation(); setQuickView(null); setDetail({ kind: e.kind, id: e.id }); }} title={canHover ? undefined : tip}
          className={story
            ? "w-full text-left text-[9px] leading-tight px-1 py-px rounded border border-pink-100 bg-pink-50/50 text-pink-700/80 flex items-center gap-1 cursor-pointer hover:border-pink-300"
            : `w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded border flex items-center gap-1.5 cursor-pointer ${e.overdue ? "bg-red-50 border-red-300 text-red-700" : e.statusCls}`}>
          {story ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: brandColor(e.brand_id) }} />
              <span className="truncate flex-1 min-w-0">📖 {e.title}</span>
              {storyNoFile(e) && <NoFileBadge />}
              {storyPosted(e) && <span className="shrink-0 text-emerald-600">✓</span>}
            </>
          ) : (
            <>
              <Thumb e={e} size="xs" />
              <span className="truncate flex-1 min-w-0">{e.time ? `${e.time} ` : ""}{e.title}</span>
              {/* ไอคอนแพลตฟอร์ม วงสี = พร้อม/ขาด/โพสต์แล้ว */}
              <PlatIcons list={plats} />
            </>
          )}
        </button>
        {/* จอสัมผัส: ปุ่ม ⓘ เปิด quick view (จอเมาส์ใช้ชี้ค้างแทน) · Story ไม่ต้องมี (การ์ดเล็ก แตะ = เปิดเลย) */}
        {!canHover && e.kind === "content" && !story && (
          <button type="button" onClick={(ev) => { ev.stopPropagation(); setQuickView(isQv ? null : { id: e.id, anchor: ev.currentTarget, rect: ev.currentTarget.getBoundingClientRect() }); }}
            className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-white border border-slate-300 text-[9px] text-slate-500 shadow-sm">ⓘ</button>
        )}
        <QuickView e={e} plats={plats} open={isQv} anchor={quickView?.anchor ?? null} rect={isQv ? quickView?.rect : null} onClose={closeQv}
          actions={e.kind === "content" && !story ? {
            texts: (() => { const k = textKeyOf(e.id); return k ? qvTexts[k] : undefined; })(),
            busy: qvBusy?.startsWith(`${e.id}|`) ? qvBusy.slice(e.id.length + 1) : null,
            onCopy: (code) => void qvCopy(e.id, code), onTogglePosted: (code) => void togglePosted(e.id, code),
          } : undefined} onOpen={() => { if (qvTimer.current) clearTimeout(qvTimer.current); }} />
      </div>
    );
  };

  const modeBtn = (m: CalMode) => `h-8 px-3 rounded-md text-sm font-medium transition inline-flex items-center gap-1.5 ${mode === m ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`;
  const modeSwitch = (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label={t("เลือกปฏิทิน", "Choose calendar")}>
      <button onClick={() => setMode("content")} className={modeBtn("content")}>🗓️ {t("คอนเทนต์", "Content")}</button>
      <button onClick={() => setMode("task")} className={modeBtn("task")}>📋 {t("งาน", "Tasks")}</button>
      <button onClick={() => setMode("plan")} className={modeBtn("plan")} title={refreshAlerts ? t(`มี ${refreshAlerts} ที่ต้องเตรียม (ถึงรอบเปลี่ยน)`, `${refreshAlerts} to prepare`) : undefined}>
        🧭 {t("วางแผน", "Plan")}
        {refreshAlerts > 0 && <span className="min-w-[1.25rem] rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold leading-5 text-white">🔔{refreshAlerts}</span>}
      </button>
    </div>
  );

  // แท็บวางแผน = หน้าวางแผนคอนเทนต์ทั้งหน้า (ข้อมูลชุดเดียวกัน · สิทธิ์ชุดเดิม tasks.* / แนว+ตั้งค่า = marketing.label.manage)
  if (mode === "plan") {
    return (
      <StandaloneShell title={t("วางแผนคอนเทนต์", "Content Plan")} icon="🧭" accent="violet">
        <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-6">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">🧭 {t("วางแผนคอนเทนต์", "Content Plan")}</h1>
            {modeSwitch}
          </div>
          <p className="text-slate-500 mt-1">{t("จะลงอะไร แนวไหน ลงที่ไหน · 🔔 เตือนว่าที่ไหนถึงรอบต้องเปลี่ยน · ข้อมูลชุดเดียวกับแท็บคอนเทนต์", "What, which pillar, where · reminders for recurring refreshes")}</p>
        </div>
        <ContentPlanView embedded canCreate={can("tasks.create" as never)} canEdit={can("tasks.edit" as never)} canPillars={can("marketing.label.manage" as never)} />
      </StandaloneShell>
    );
  }

  return (
    <StandaloneShell title={L.title} icon={L.icon} accent="violet">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{L.icon} {L.title}</h1>
              {/* สลับโหมด คอนเทนต์ ⇄ งาน (ปฏิทินเดียวกัน) */}
              {modeSwitch}
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
            {/* ⚠ ยังไม่พร้อม — กรองโพสต์ที่ยังขาดแคปชั่น/รูป (ใช้ซ้อนกับแบรนด์/แพลตฟอร์ม/สถานะได้) · เฉพาะโหมดคอนเทนต์ */}
            {mode === "content" && (
              <button onClick={() => setNotReady((v) => !v)} title={t("โพสต์ที่ยังขาดแคปชั่นหรือรูปในแพลตฟอร์มใดแพลตฟอร์มหนึ่ง (ชี้การ์ดดูว่าขาดอะไร)", "Posts missing caption or images on some platform")}
                className={`h-7 px-2.5 rounded-md text-xs font-medium border inline-flex items-center gap-1 ${notReady ? "bg-amber-500 border-amber-500 text-white shadow-sm" : counts.notReady > 0 ? "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100" : "bg-white border-slate-200 text-slate-400"}`}>
                ⚠ {t("ยังไม่พร้อม", "Not ready")}
                {counts.notReady > 0 && <span className={`text-[10px] tabular-nums ${notReady ? "text-white/80" : "text-amber-600"}`}>{counts.notReady}</span>}
              </button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            <span title={L.countTip}>{t("เดือนนี้แสดง", "This month showing")} <b className="text-slate-700 tabular-nums">{scheduledThisMonth}</b> / {counts.total} {t("รายการ", "items")}</span>
            {hasFilter && (
              <button onClick={() => { setBrandFilter("all"); setPlatformFilter("all"); setStatusFilter("all"); setNotReady(false); }} className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-100">✕ {t("ล้างตัวกรอง", "Clear")}</button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-6">
        {/* สถานะโหลด/ผิดพลาด — โหลดพลาดต้องไม่โชว์เป็นปฏิทินว่าง */}
        {loading && <LoadingState />}
        {!loading && loadError && (
          <ErrorState onRetry={reload} />
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
            <h2 className="text-lg font-semibold text-slate-800 min-w-[150px] text-center">{monthName}</h2>
            <button onClick={() => setOffset((o) => o + 1)} aria-label={t("เดือนถัดไป", "Next month")} className="h-9 w-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">›</button>
            {mode === "content" && (
              <button onClick={toggleStory} title={t("โหมด Story: แถบเล็กใต้ทุกวันบอกว่าทำ Story ของวันนั้นแล้วหรือยัง (กด ＋ สร้าง Story ลงวันนั้นได้เลย)", "Story mode: a strip under each day shows whether a Story exists")}
                className={`h-9 px-3 rounded-lg border text-sm font-medium inline-flex items-center gap-1.5 ${storyMode ? "bg-pink-600 border-pink-600 text-white shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                📖 Story{storyMode && <span className={`text-[11px] tabular-nums ${storyDaysInMonth >= days ? "text-white/90" : "text-white/80"}`}>{storyDaysInMonth}/{days} {t("วัน", "days")}</span>}
              </button>
            )}
            {offset !== 0 && <button onClick={() => setOffset(0)} className="h-9 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">{t("วันนี้", "Today")}</button>}
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100 text-xs">{L.icon} {t("เดือนนี้", "This month")} {scheduledThisMonth}</span>
        </div>

        <div className="flex gap-4 items-start flex-col lg:flex-row">
          {/* ตารางปฏิทิน */}
          <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-4">
            {/* 📱 มือถือ (จอแคบ) — รายการตามวัน (เฉพาะวันที่มีของ) แทนตาราง 7 ช่องที่แคบจนอ่านไม่ออก · กดหัววัน = เพิ่มลงวันนั้น */}
            <div className="sm:hidden divide-y divide-slate-100">
              {(() => {
                const filled = Array.from({ length: days }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`).filter((k) => (byDay[k] ?? []).length > 0);
                if (!filled.length) return <p className="py-8 text-center text-sm text-slate-400">{t("เดือนนี้ยังไม่มีรายการ", "Nothing scheduled this month")}</p>;
                return filled.map((key) => (
                  <div key={key} className="py-2">
                    <button type="button" onClick={() => setDayPick(key)} className={`mb-1 text-xs font-semibold ${key === todayKey ? "text-violet-700" : "text-slate-500"}`}>
                      {weekdays[(first + Number(key.slice(8, 10)) - 1) % 7]} {Number(key.slice(8, 10))}{key === todayKey ? ` · ${t("วันนี้", "Today")}` : ""} <span className="text-slate-300">＋</span>
                    </button>
                    <div className="space-y-1">{(byDay[key] ?? []).map((e) => <Chip key={e.id} e={e} />)}</div>
                  </div>
                ));
              })()}
            </div>
            <div className="hidden sm:grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-slate-400 mb-1.5">
              {weekdays.map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="hidden sm:grid grid-cols-7 gap-1.5">
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
                    {/* 📖 แถบ Story ของวัน: มีแล้ว = จุดสีแบรนด์ (✓ ถ้าโพสต์แล้ว) · ยังไม่มี = ปุ่ม ＋ สร้าง Story ลงวันนี้ · วันที่ผ่านมาแล้วและไม่มี = ขีดแดงจาง */}
                    {mode === "content" && storyMode && (() => {
                      const st = storyByDay[key] ?? [];
                      const past = key < todayKey;
                      const noFile = st.filter(storyNoFile).length;   // Story ที่ยังไม่มีไฟล์ (ลงแผนไว้ก่อน)
                      return (
                        <div className={`mt-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] ${st.length ? "bg-pink-50 text-pink-700" : past ? "bg-rose-50 text-rose-400" : "bg-slate-50 text-slate-400"}`}
                          title={st.length ? st.map((e) => `${e.brand_label ?? ""} ${e.title}${storyPosted(e) ? " ✓" : ""}${storyNoFile(e) ? ` (${t("ยังไม่มีไฟล์", "no file yet")})` : ""}`).join(" · ") : (past ? t("วันนี้ไม่ได้ทำ Story", "No story this day") : t("ยังไม่มี Story ของวันนี้", "No story yet"))}>
                          <span>📖</span>
                          {st.length ? (
                            <span className="flex items-center gap-0.5 flex-1 min-w-0">
                              {st.slice(0, 5).map((e) => (
                                <button key={e.id} type="button" onClick={(ev) => { ev.stopPropagation(); setDetail({ kind: "content", id: e.id }); }} title={`${e.brand_label ?? ""} · ${e.title} · ${e.statusLabel}${storyNoFile(e) ? ` · ${t("ยังไม่มีไฟล์ — กดเพื่อใส่", "no file yet — click to add")}` : ""}`}
                                  className={`h-3.5 min-w-3.5 px-0.5 rounded-full ring-1 ring-white text-[8px] leading-none text-white flex items-center justify-center ${storyPosted(e) ? "" : "opacity-60"}`} style={{ background: brandColor(e.brand_id) }}>
                                  {storyPosted(e) ? "✓" : ""}
                                </button>
                              ))}
                              {st.length > 5 && <span>+{st.length - 5}</span>}
                              {noFile > 0
                                ? <span className="ml-auto truncate text-amber-600">{t("ยังไม่มีไฟล์", "No file yet")}{st.length > 1 ? ` ${noFile}` : ""}</span>
                                : <span className="ml-auto truncate">{st.every(storyPosted) ? t("โพสต์แล้ว", "Posted") : t(`${st.length} Story`, `${st.length} story`)}</span>}
                            </span>
                          ) : (
                            <span className="flex-1 truncate">{past ? t("ไม่มี Story", "No story") : t("ยังไม่มี Story", "No story yet")}</span>
                          )}
                          {!past || !st.length ? (
                            <button type="button" onClick={(ev) => { ev.stopPropagation(); openStoryCreate(key); }} title={t("สร้าง Story ลงวันนี้", "Create a story for this day")}
                              className="h-4 w-4 rounded-full bg-white border border-pink-300 text-pink-600 leading-none hover:bg-pink-100">＋</button>
                          ) : null}
                        </div>
                      );
                    })()}
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
                      <div className="flex items-center gap-1"><span className="text-xs font-medium text-slate-700 truncate">{e.title}</span>{storyNoFile(e) && <NoFileBadge />}</div>
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

      <StoryQuickModal open={storyDay !== null} onClose={() => setStoryDay(null)} day={storyDay} brands={brands} defaultBrandId={brandFilter === "all" ? null : brandFilter}
        onCreated={() => { setStoryDay(null); reload(); }} pushToast={pushToast} />
      <ContentCreateModal open={createOpen} onClose={() => { setCreateOpen(false); setCreatePreset(null); }} onCreated={() => { setCreateOpen(false); setCreatePreset(null); reload(); }} preset={createPreset}
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

    </StandaloneShell>
  );
}
