"use client";
/**
 * แท็บ "ขึ้นเว็บ" ในศูนย์แจ้งเตือน (ผู้ดูแลระบบ · สิทธิ์ admin.users) — เจ้าของขอ 2026-11-11
 *   "อยากให้ไปอยู่ในศูนย์แจ้งเตือน ทำเป็นเหมือนคำพูดของ GIF · เด้งเลยตอนที่มี build และคอยบอกสถานะ"
 *
 *   ข้อมูล = ตัวเดียวกับหน้า /admin/deploy (useDeployStatus) — WorkPopupHost เป็นคนถาม (เนื้อในการ์ดถูกถอดตอนย่อ)
 *   คำพูดของตัว Pet = deployPetNews (lib/deploy-queue) คิดใน WorkPopupHost · ตั้งเปิด/ปิด = ทะเบียน lib/notify-sources (key "deploy")
 * ของกลางที่ใช้: DeployCountdown · requestDeployNow · หน้าต่างลอยนับถอยหลัง (deploy-countdown/pip-app) · pip-window · Icon
 */
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { DeployCountdown, requestDeployNow, useNow } from "@/components/deploy-countdown";
import { openPipWindow, pipSupported } from "@/components/pip-window";
import { DEPLOY_PIP_SIZE, type DeployStatus } from "@/lib/deploy-queue";

const MAX_JOBS = 8;
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "");

export function DeployTab({ status, error, onReload }: {
  status: DeployStatus | null;
  error: string | null;
  onReload: () => void;
}) {
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!status) {
    return error ? (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
        <div className="font-medium">ดูสถานะขึ้นเว็บไม่ได้</div>
        <div className="mt-0.5 text-xs text-rose-600">{error}</div>
        <button type="button" onClick={onReload} className="mt-2 h-7 rounded-md border border-rose-300 bg-white px-2.5 text-xs text-rose-700 hover:bg-rose-100">
          <Icon name="refresh" /> ลองใหม่
        </button>
      </div>
    ) : <div className="py-6 text-center text-sm text-slate-400">กำลังดูสถานะขึ้นเว็บ…</div>;
  }

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 8000); };
  const deployNow = async () => {
    setBusy(true);
    const r = await requestDeployNow();
    setBusy(false);
    flash(r.message);
    if (r.ok && !r.openedGitHub) setTimeout(onReload, 15000);
  };
  // หน้าต่างลอยมุมจอ (ตัวเดิมของเมนูโปรไฟล์) — ต้องเปิดในจังหวะกด · ไม่รองรับ = บอกให้ใช้ Chrome/Edge
  const popOut = async () => {
    try {
      const w = pipSupported() ? await openPipWindow(DEPLOY_PIP_SIZE) : null;
      if (!w) { flash("เบราว์เซอร์นี้เปิดหน้าต่างลอยไม่ได้ — ใช้ Chrome หรือ Edge บนคอมพิวเตอร์"); return; }
      const { mountDeployCountdownPip } = await import("@/components/deploy-countdown/pip-app");
      mountDeployCountdownPip(w);
    } catch { flash("เปิดหน้าต่างลอยไม่ได้ ลองกดอีกครั้ง"); }
  };

  const jobs = status.waiting;
  const btn = "h-7 px-2.5 text-xs font-medium rounded-md inline-flex items-center gap-1 disabled:opacity-40";
  return (
    <div className="space-y-3">
      {/* ปุ่มอยู่แถวล่าง (การ์ดกว้างแค่ 400px — วางข้างตัวเลขแล้วข้อความหักบรรทัดจนอ่านยาก) */}
      <DeployCountdown status={status} now={now} variant="page" />
      <div className="flex flex-wrap items-center gap-2">
        {jobs.length > 0 && (
          <button type="button" onClick={() => void deployNow()} disabled={busy} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
            {busy ? "กำลังสั่ง…" : "ขึ้นเว็บทันที"}
          </button>
        )}
        <button type="button" onClick={() => void popOut()} className={`${btn} border border-slate-300 text-slate-600 hover:bg-slate-50`}>
          <Icon name="open" /> ลอยมุมจอ
        </button>
        <Link href="/admin/deploy" className="ml-auto inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
          ดูหน้าขึ้นเว็บ <Icon name="link" />
        </Link>
      </div>
      {msg && <div className="rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">{msg}</div>}

      {jobs.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-slate-500">งานที่รอขึ้นเว็บ ({jobs.length.toLocaleString("th-TH")})</div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {jobs.slice(0, MAX_JOBS).map((j) => (
              <li key={j.sha} className="px-2.5 py-1.5">
                <div className="truncate text-xs text-slate-700" title={j.message}>{j.message || j.sha.slice(0, 7)}</div>
                <div className="text-[11px] text-slate-400">{[j.author, hhmm(j.date)].filter(Boolean).join(" · ")}</div>
              </li>
            ))}
          </ul>
          {jobs.length > MAX_JOBS && <div className="mt-1 text-[11px] text-slate-400">และอีก {(jobs.length - MAX_JOBS).toLocaleString("th-TH")} งาน</div>}
        </div>
      )}
    </div>
  );
}
