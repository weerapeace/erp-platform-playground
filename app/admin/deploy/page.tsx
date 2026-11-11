"use client";

// ============================================================
// 🚀 ขึ้นเว็บ — นับถอยหลังว่าเว็บจริงจะอัปเดตเมื่อไร + งานที่รอ + ปุ่ม "ขึ้นเว็บทันที" (เจ้าของขอ 2026-11-10 "10 นาที แต่มีปุ่มขึ้นทันทีด้วย")
//   เว็บจริงอัปเดตเป็นรอบ: ทุก push → deploy-round.yml รอรวมงาน ~9 นาที → เลื่อน prod → Vercel build (~4.5 นาที)
//   ปุ่ม "ลอยไว้มุมจอ" (เจ้าของขอ 2026-11-11) = หน้าต่างนับถอยหลังจิ๋วลอยทับทุกโปรแกรม (Chrome/Edge) — เปิดหน้านี้ทิ้งไว้ ไปทำงานแท็บอื่นได้
//   ข้อมูล: GET /api/admin/deploy (server ถาม GitHub + แคชกลาง — เดิมเบราว์เซอร์ถามเองจนโดน GitHub บล็อก) · ปุ่ม: POST /api/admin/deploy
// ของกลาง: PlaygroundShell · LoadingState/ErrorState · Icon · useToast · pip-window · deploy-countdown · กติกา lib/deploy-queue.ts · docs/deploy-batch.md
// ============================================================

import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { PipPortal, usePipWindow } from "@/components/pip-window";
import { DeployCountdown, DeployMiniPanel, requestDeployNow, useDeployStatus, useNow } from "@/components/deploy-countdown";
import { DEPLOY_PIP_SIZE, ROUND_MINUTES } from "@/lib/deploy-queue";

const timeText = (s: string | null) => (s ? new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export default function DeployPage() {
  return <PlaygroundShell><DeployView /></PlaygroundShell>;
}

function DeployView() {
  const canUse = usePermission("admin.users");
  const toast = useToast();
  const pip = usePipWindow();
  const { status, error, loading, reload } = useDeployStatus(canUse, pip.win);
  const now = useNow(1000, pip.win);
  const [pushing, setPushing] = useState(false);

  const deployNow = async () => {
    setPushing(true);
    const r = await requestDeployNow();
    setPushing(false);
    if (r.ok) toast.success(r.message); else toast.error(r.message);
    if (r.ok && !r.openedGitHub) setTimeout(() => void reload(), 15000);
  };

  const popOut = async () => {
    try { await pip.open(DEPLOY_PIP_SIZE); }
    catch { toast.error("เปิดหน้าต่างลอยไม่ได้ในเบราว์เซอร์นี้ — ใช้ Chrome หรือ Edge บนคอมพิวเตอร์ แล้วลองกดอีกครั้ง"); }
  };

  if (!canUse) return <AccessDenied message="หน้านี้สำหรับผู้ดูแลระบบ" />;
  const waiting = status?.waiting ?? [];
  const btn = "h-10 px-4 text-sm font-medium rounded-lg inline-flex items-center gap-2 disabled:opacity-40";

  return (
    <div className="max-w-[860px] mx-auto px-5 py-5 space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-800"><Icon value="🚀" /> ขึ้นเว็บ</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          งานที่ทำเสร็จจะรวมขึ้นเว็บจริงเป็นรอบ ~{ROUND_MINUTES} นาทีหลังงานแรกเข้ามา แล้ว build อีก ~4-5 นาที (ประหยัดค่า build) · งานด่วนกด “ขึ้นเว็บทันที”
        </p>
      </div>

      {error && !status ? <ErrorState title="ดูสถานะไม่ได้" hint={error} onRetry={() => void reload()} retrying={loading} />
        : !status ? <LoadingState label="กำลังดูสถานะ…" />
        : (
          <>
            <DeployCountdown status={status} now={now} variant="page" actions={<>
              <button type="button" onClick={() => void deployNow()} disabled={pushing || !waiting.length}
                className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}
                title={waiting.length ? "ไม่รอรอบ — ส่งขึ้นเว็บจริงเดี๋ยวนี้" : "ไม่มีงานรอ"}>
                <Icon name="refresh" /> {pushing ? "กำลังสั่ง…" : "ขึ้นเว็บทันที"}
              </button>
              {pip.win
                ? <button type="button" onClick={pip.close} className={`${btn} border border-slate-200 text-slate-600 hover:bg-slate-50`}><Icon name="back" /> เอาหน้าต่างลอยกลับ</button>
                : <button type="button" onClick={() => void popOut()} disabled={!pip.supported}
                    className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}
                    title={pip.supported ? "เปิดตัวนับถอยหลังเป็นหน้าต่างจิ๋วลอยทับทุกโปรแกรม" : "ใช้ได้ใน Chrome หรือ Edge บนคอมพิวเตอร์"}>
                    <Icon name="pin" /> ลอยไว้มุมจอ
                  </button>}
            </>} />

            {pip.win && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                ตัวนับถอยหลังลอยอยู่มุมจอแล้ว (ลากย้าย/ย่อขยายได้) — <b>เปิดหน้านี้ทิ้งไว้</b> ไปทำงานแท็บอื่นหรือโปรแกรมอื่นได้ ปิดหน้านี้ = หน้าต่างลอยปิดตาม
              </div>
            )}
            {error && <div className="text-xs text-amber-700">อัปเดตล่าสุดไม่สำเร็จ: {error}</div>}

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
              <div className="text-sm text-slate-500">เว็บจริงตอนนี้</div>
              <div className="text-sm text-slate-800 truncate">{status.live.message || "—"}</div>
              <div className="text-xs text-slate-400"><span className="font-mono">{status.live.sha.slice(0, 8)}</span> · {timeText(status.live.date)}</div>
            </div>

            {status.diverged && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                สาขาเว็บจริงไม่ตรงกับสาขางานแบบปกติ — กด “ขึ้นเว็บทันที” เพื่อให้ตรงกัน หรือบอกทีมดูแลระบบ
              </div>
            )}

            {waiting.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 text-xs font-medium text-slate-500">งานที่รอ {waiting.length.toLocaleString("th-TH")} งาน (ใหม่สุดก่อน)</div>
                <div className="divide-y divide-slate-100">
                  {waiting.map((c) => (
                    <div key={c.sha} className="px-4 py-2">
                      <div className="text-sm text-slate-800 break-words">{c.message}</div>
                      <div className="text-[11px] text-slate-400"><span className="font-mono">{c.sha.slice(0, 8)}</span> · {timeText(c.date)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <PipPortal win={pip.win}>
              <DeployMiniPanel status={status} now={now} win={pip.win} onDeployed={() => void reload()} />
            </PipPortal>
          </>
        )}
    </div>
  );
}
