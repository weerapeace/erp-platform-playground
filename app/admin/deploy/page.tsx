"use client";

// ============================================================
// 🚀 ขึ้นเว็บ — งานที่ส่งมาแล้วแต่ยังไม่ขึ้นเว็บจริง + ปุ่ม "ขึ้นเว็บทันที" (เจ้าของขอ 2026-11-10 "10 นาที แต่มีปุ่มขึ้นทันทีด้วย")
//   เว็บจริงอัปเดตเป็นรอบทุก ~10 นาที (GitHub Actions deploy-batch.yml) เพื่อลดค่า build ของ Vercel
//   ข้อมูลคิว: GitHub API สาธารณะ (เบราว์เซอร์เรียกเอง) · ปุ่ม: POST /api/admin/deploy (ยังไม่ตั้งกุญแจ = เปิดหน้า GitHub ให้กด Run workflow)
// ของกลาง: PlaygroundShell · LoadingState/ErrorState · Icon · useToast · กติกา lib/deploy-queue.ts · docs/deploy-batch.md
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import {
  buildStateText, DEPLOY_REPO, DEPLOY_WORKFLOW, DEPLOY_WORKFLOW_PAGE, minutesToNextRound, PROD_BRANCH, queueFromCompare, ROUND_MINUTES, WORK_BRANCH,
  type DeployQueue,
} from "@/lib/deploy-queue";

type Live = { sha: string; message: string; date: string | null; state: string | null };
type Run = { status: string; conclusion: string | null; created_at: string; event: string };

const GH = `https://api.github.com/repos/${DEPLOY_REPO}`;
const gh = async (path: string) => {
  const r = await fetch(`${GH}${path}`, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
  if (!r.ok) throw new Error(r.status === 403 ? "GitHub จำกัดจำนวนครั้งที่ดูได้ต่อชั่วโมง — ลองใหม่อีกสักครู่" : `อ่านข้อมูลจาก GitHub ไม่ได้ (${r.status})`);
  return r.json();
};
const timeText = (s: string | null) => (s ? new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export default function DeployPage() {
  return <PlaygroundShell><DeployView /></PlaygroundShell>;
}

function DeployView() {
  const canUse = usePermission("admin.users");
  const toast = useToast();
  const [queue, setQueue] = useState<DeployQueue | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cmp, prod, runs] = await Promise.all([
        gh(`/compare/${PROD_BRANCH}...${encodeURIComponent(WORK_BRANCH)}`),
        gh(`/commits/${PROD_BRANCH}`),
        gh(`/actions/workflows/${DEPLOY_WORKFLOW}/runs?per_page=1`).catch(() => null),
      ]);
      const st = await gh(`/commits/${prod.sha}/status`).catch(() => null);
      setQueue(queueFromCompare(cmp));
      setLive({ sha: prod.sha, message: String(prod.commit?.message ?? "").split("\n")[0], date: prod.commit?.author?.date ?? null, state: st?.state ?? null });
      const r = runs?.workflow_runs?.[0];
      setRun(r ? { status: r.status, conclusion: r.conclusion, created_at: r.created_at, event: r.event } : null);
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canUse) void load(); }, [canUse, load]);
  useEffect(() => { if (!canUse) return; const t = setInterval(() => void load(), 30000); return () => clearInterval(t); }, [canUse, load]);

  const deployNow = async () => {
    setPushing(true);
    try {
      const r = await apiFetch("/api/admin/deploy", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (j.needsSetup) {
        window.open(j.url || DEPLOY_WORKFLOW_PAGE, "_blank", "noopener");
        toast.success("เปิดหน้า GitHub แล้ว — กดปุ่ม “Run workflow” สีเขียว อีก 1 ครั้ง");
      } else if (!r.ok || j.error) throw new Error(j.error || "สั่งขึ้นเว็บไม่สำเร็จ");
      else { toast.success("สั่งขึ้นเว็บแล้ว — เว็บจริงอัปเดตในราว 5 นาที"); setTimeout(() => void load(), 15000); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "สั่งขึ้นเว็บไม่สำเร็จ"); }
    finally { setPushing(false); }
  };

  if (!canUse) return <AccessDenied message="หน้านี้สำหรับผู้ดูแลระบบ" />;
  const waiting = queue?.waiting ?? [];
  const bs = buildStateText(live?.state);
  const toneCls = { ok: "bg-emerald-50 text-emerald-700", wait: "bg-amber-50 text-amber-700", bad: "bg-rose-50 text-rose-700", none: "bg-slate-100 text-slate-500" }[bs.tone];
  const running = run && run.status !== "completed";

  return (
    <div className="max-w-[860px] mx-auto px-5 py-5 space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-800"><Icon value="🚀" /> ขึ้นเว็บ</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          งานที่ทำเสร็จจะขึ้นเว็บจริงเป็นรอบ ทุก ~{ROUND_MINUTES} นาที (ประหยัดค่า build) · งานด่วนกด “ขึ้นเว็บทันที”
        </p>
      </div>

      {err ? <ErrorState title="ดูสถานะไม่ได้" hint={err} onRetry={() => void load()} retrying={loading} />
        : !queue || !live ? <LoadingState label="กำลังดูสถานะ…" />
        : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-500">งานที่รอขึ้นเว็บ</div>
                <div className="text-3xl font-semibold text-slate-800">{waiting.length.toLocaleString("th-TH")} <span className="text-base font-normal text-slate-500">งาน</span></div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {waiting.length ? `รอบถัดไปในราว ${minutesToNextRound()} นาที (GitHub อาจช้ากว่านี้เล็กน้อย)` : "เว็บจริงเป็นงานล่าสุดแล้ว"}
                  {running ? " · กำลังส่งขึ้นเว็บอยู่" : ""}
                </div>
              </div>
              <button type="button" onClick={() => void deployNow()} disabled={pushing || !waiting.length}
                className="h-11 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 inline-flex items-center gap-2"
                title={waiting.length ? "ไม่รอรอบ — ส่งขึ้นเว็บจริงเดี๋ยวนี้" : "ไม่มีงานรอ"}>
                <Icon name="refresh" /> {pushing ? "กำลังสั่ง…" : "ขึ้นเว็บทันที"}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">เว็บจริงตอนนี้</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${toneCls}`}>{bs.text}</span>
              </div>
              <div className="text-sm text-slate-800 truncate">{live.message || "—"}</div>
              <div className="text-xs text-slate-400"><span className="font-mono">{live.sha.slice(0, 8)}</span> · {timeText(live.date)}</div>
            </div>

            {queue.diverged && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                สาขาเว็บจริงไม่ตรงกับสาขางานแบบปกติ — กด “ขึ้นเว็บทันที” เพื่อให้ตรงกัน หรือบอกทีมดูแลระบบ
              </div>
            )}

            {waiting.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 text-xs font-medium text-slate-500">งานที่รอ (ใหม่สุดก่อน)</div>
                <div className="divide-y divide-slate-100">
                  {waiting.slice(0, 50).map((c) => (
                    <div key={c.sha} className="px-4 py-2">
                      <div className="text-sm text-slate-800 break-words">{c.message}</div>
                      <div className="text-[11px] text-slate-400"><span className="font-mono">{c.sha.slice(0, 8)}</span> · {timeText(c.date)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
    </div>
  );
}
