"use client";

/**
 * ตัวนับถอยหลังขึ้นเว็บ — โชว์ว่าเว็บจริงจะอัปเดตอีกกี่นาที (หน้า /admin/deploy + หน้าต่างลอยมุมจอ)
 *   ขั้น: รอรวมงาน (นับแม่น — รู้เวลาเริ่มรอบจาก GitHub) → กำลังส่งขึ้นเว็บ → กำลัง build (ค่าประมาณ ~4.5 นาที) → ขึ้นเว็บแล้ว
 *   ข้อมูล: GET /api/admin/deploy (server ถาม GitHub + แคชกลาง) · ถามใหม่ตามที่ server แนะนำ (15–60 วิ) · ตัวเลขเดินเองทุกวินาทีในเครื่อง
 *   กติกาคิดขั้น/เวลา = lib/deploy-queue.ts (deployPhase) · docs/deploy-batch.md
 * ของกลางที่ใช้: Icon · apiFetch · pip-window (timerHost — ตัวจับเวลาไม่โดนหน่วงตอนแท็บหลักอยู่เบื้องหลัง)
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { timerHost } from "@/components/pip-window";
import { apiFetch } from "@/lib/api";
import { DEPLOY_WORKFLOW_PAGE, deployPhase, formatCountdown, type DeployPhase, type DeployStatus } from "@/lib/deploy-queue";

/** เวลาปัจจุบัน เดินทุก `ms` — ตั้งบนหน้าต่างลอยถ้ามี (ไม่โดนเบราว์เซอร์หน่วงตอนแท็บหลักซ่อน) */
export function useNow(ms: number, win?: Window | null): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const host = timerHost(win);
    const t = host.setInterval(() => setNow(new Date()), ms);
    return () => host.clearInterval(t);
  }, [ms, win]);
  return now;
}

/** ดึงสถานะขึ้นเว็บเป็นระยะ (ใช้ตัวเดียวทั้งหน้าและหน้าต่างลอย — ถามครั้งเดียวได้ทั้งคู่) */
export function useDeployStatus(enabled: boolean, win?: Window | null) {
  const [status, setStatus] = useState<DeployStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const r = await apiFetch("/api/admin/deploy", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || `ดูสถานะไม่ได้ (${r.status})`);
      setStatus(j as DeployStatus);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดูสถานะไม่ได้");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  const every = Math.min(60, Math.max(15, status?.refreshSeconds ?? 30));
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  useEffect(() => {
    if (!enabled) return;
    const host = timerHost(win);
    const t = host.setInterval(() => void load(), every * 1000);
    return () => host.clearInterval(t);
  }, [enabled, load, every, win]);

  return { status, error, loading, reload: load };
}

const TONE: Record<DeployPhase["tone"], { text: string; soft: string }> = {
  blue: { text: "text-blue-700", soft: "bg-blue-50" },
  amber: { text: "text-amber-700", soft: "bg-amber-50" },
  green: { text: "text-emerald-700", soft: "bg-emerald-50" },
  red: { text: "text-rose-700", soft: "bg-rose-50" },
  slate: { text: "text-slate-600", soft: "bg-slate-100" },
};
const PHASE_ICON: Record<DeployPhase["key"], string> = {
  round: "clock", promoting: "upload", queued: "waiting", building: "build", idle: "done", failed: "warning",
};
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

/** การ์ดนับถอยหลัง · variant "mini" = หน้าต่างลอยมุมจอ (เต็มหน้าต่างเล็ก) · "page" = การ์ดในหน้า /admin/deploy */
export function DeployCountdown({ status, now, variant, actions, message }: {
  status: DeployStatus;
  now: Date;
  variant: "mini" | "page";
  /** ปุ่มด้านล่าง/ด้านข้าง (ขึ้นทันที · ลอยไว้มุมจอ) */
  actions?: ReactNode;
  /** ข้อความผลกดปุ่ม (หน้าต่างลอยไม่เห็น Toast ของหน้าหลัก) */
  message?: string | null;
}) {
  const p = deployPhase(status, now);
  const tone = TONE[p.tone];
  const old = status.stale || now.getTime() - Date.parse(status.fetchedAt) > Math.max(3 * status.refreshSeconds, 180) * 1000;
  const foot = old ? "ข้อมูลอาจไม่อัปเดต" : `อัปเดต ${hhmm(status.fetchedAt)}`;
  const big = p.secondsLeft != null ? `${p.approx ? "≈ " : ""}${formatCountdown(p.secondsLeft)}` : null;

  if (variant === "mini") {
    return (
      <div className="h-screen w-full flex flex-col justify-center gap-1 px-4 py-3 bg-white select-none overflow-hidden">
        <div className={`flex items-center gap-1.5 text-xs font-medium ${tone.text}`}>
          <Icon name={PHASE_ICON[p.key]} /> <span className="truncate">{p.title}</span>
        </div>
        {big
          ? <div className={`text-4xl font-semibold tabular-nums leading-tight ${tone.text}`}>{big}</div>
          : <div className={`text-lg font-semibold leading-snug ${tone.text}`}>{p.key === "idle" ? "ล่าสุดแล้ว" : p.title}</div>}
        {p.detail && <div className="text-[11px] text-slate-500 truncate" title={p.detail}>{p.detail}</div>}
        <div className="flex items-center gap-2 pt-1 min-h-[24px]">
          {actions}
          <span className={`ml-auto text-[10px] ${old ? "text-amber-600" : "text-slate-400"}`} title={status.note ?? undefined}>{message || foot}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-4">
      <div className={`h-12 w-12 rounded-xl flex items-center justify-center text-2xl ${tone.soft} ${tone.text}`}>
        <Icon name={PHASE_ICON[p.key]} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium ${tone.text}`}>{p.title}</div>
        {big && <div className={`text-3xl font-semibold tabular-nums ${tone.text}`}>{big}</div>}
        {p.detail && <div className="text-xs text-slate-500 mt-0.5 break-words">{p.detail}</div>}
        <div className={`text-[11px] mt-0.5 ${old ? "text-amber-600" : "text-slate-400"}`}>
          {foot}{status.note ? ` · ${status.note}` : ""}{p.approx && big ? " · เวลา build เป็นค่าประมาณ" : ""}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * กด "ขึ้นเว็บทันที" (POST /api/admin/deploy · สิทธิ์ + audit อยู่ฝั่ง server)
 *   fromWin = หน้าต่างที่กดปุ่ม (หน้าต่างลอยต้องเปิดหน้า GitHub จากตัวมันเอง ไม่งั้นเบราว์เซอร์บล็อกป๊อปอัป)
 */
export async function requestDeployNow(fromWin?: Window | null): Promise<{ ok: boolean; message: string; openedGitHub?: boolean }> {
  try {
    const r = await apiFetch("/api/admin/deploy", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (j.needsSetup) {
      (fromWin ?? window).open(j.url || DEPLOY_WORKFLOW_PAGE, "_blank", "noopener");
      return { ok: true, openedGitHub: true, message: "เปิดหน้า GitHub แล้ว — กดปุ่ม “Run workflow” สีเขียว อีก 1 ครั้ง" };
    }
    if (!r.ok || j.error) return { ok: false, message: j.error || "สั่งขึ้นเว็บไม่สำเร็จ" };
    return { ok: true, message: "สั่งขึ้นเว็บแล้ว — เว็บจริงอัปเดตในราว 5 นาที" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "สั่งขึ้นเว็บไม่สำเร็จ" };
  }
}

/** เนื้อหาหน้าต่างลอย (ตัวเลข + ปุ่มขึ้นทันทีเมื่อมีงานรอ + ข้อความผลกด) — ใช้ทั้งหน้า /admin/deploy และเมนูโปรไฟล์ */
export function DeployMiniPanel({ status, error, now, win, onDeployed }: {
  status: DeployStatus | null;
  error?: string | null;
  now: Date;
  /** หน้าต่างลอยที่วางอยู่ (ใช้เปิดหน้า GitHub) */
  win: Window | null;
  onDeployed?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!status) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-1 px-4 bg-white text-center">
        <div className={`text-sm font-medium ${error ? "text-rose-700" : "text-slate-500"}`}>{error ? "ดูสถานะไม่ได้" : "กำลังดูสถานะ…"}</div>
        {error && <div className="text-[11px] text-slate-500">{error}</div>}
      </div>
    );
  }
  const deploy = async () => {
    setBusy(true);
    const r = await requestDeployNow(win);
    setBusy(false);
    setMsg(r.openedGitHub ? "เปิดหน้า GitHub แล้ว กด Run workflow" : r.ok ? "สั่งขึ้นเว็บแล้ว" : r.message);
    if (r.ok && !r.openedGitHub) setTimeout(() => onDeployed?.(), 15000);
    setTimeout(() => setMsg(null), 8000);
  };
  return (
    <DeployCountdown status={status} now={now} variant="mini" message={msg} actions={status.waiting.length > 0 && (
      <button type="button" onClick={() => void deploy()} disabled={busy}
        className="h-6 px-2 text-[11px] font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
        {busy ? "กำลังสั่ง…" : "ขึ้นทันที"}
      </button>
    )} />
  );
}
