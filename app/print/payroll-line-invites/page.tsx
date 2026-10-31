"use client";

/**
 * หน้าพิมพ์บัตร QR "สมัครรับสลิปทาง LINE" — HR พิมพ์แจกพนักงานทีละคน (A4 ได้ 8 ใบ ตัดตามเส้นประ)
 * เปิดจากหน้า LINE พนักงาน: /print/payroll-line-invites?ids=<employee_id,...>
 * บัตรออกใหม่ทุกครั้งที่เปิดหน้านี้ (อายุ 14 วัน) · ออกให้เฉพาะคนที่ทำงานอยู่และยังไม่ผูก LINE
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { PrintToolbar } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";

type Invite = {
  employee_id: string;
  employee_code: string;
  full_name: string;
  nickname: string;
  language: "th" | "en";
  link: string;
  expires_at: string;
};
type Skipped = { employee_id: string; reason: "not_found" | "inactive" | "linked" };

const PER_SHEET = 8;
const SKIP_LABEL: Record<Skipped["reason"], string> = { linked: "ผูก LINE แล้ว", inactive: "ไม่ได้ทำงานแล้ว", not_found: "ไม่พบข้อมูล" };

const CARD_TEXT = {
  th: {
    title: "สมัครรับสลิปเงินเดือนทาง LINE",
    steps: ["เปิดแอป LINE แล้วสแกน QR นี้", "ตรวจชื่อแล้วกด \"ยืนยัน\"", "เพิ่มเพื่อน LINE \"ฝ่ายบุคคล\""],
    foot: "ใช้ได้ครั้งเดียว · ห้ามให้คนอื่นสแกน · ใช้ได้ถึง",
    other: "Get your payslip on LINE",
  },
  en: {
    title: "Get your payslip on LINE",
    steps: ["Open LINE and scan this QR", "Check your name, tap \"Confirm\"", "Add \"HR\" LINE as a friend"],
    foot: "One use only · Do not let others scan · Valid until",
    other: "สมัครรับสลิปเงินเดือนทาง LINE",
  },
} as const;

function formatDate(iso: string, lang: "th" | "en") {
  try {
    return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "th-TH", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function InviteCard({ invite, qr }: { invite: Invite; qr?: string }) {
  const c = CARD_TEXT[invite.language];
  return (
    <div className="invite-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div className="qr">{qr ? <img src={qr} alt="" /> : null}</div>
      <div className="body">
        <div className="title">{c.title}</div>
        <div className="other">{c.other}</div>
        <div className="who">{invite.nickname || invite.full_name || "-"}</div>
        <div className="code">{invite.employee_code}{invite.nickname && invite.full_name ? ` · ${invite.full_name}` : ""}</div>
        <ol>{c.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <div className="foot">{c.foot} {formatDate(invite.expires_at, invite.language)}</div>
      </div>
    </div>
  );
}

function LineInvitesPrint() {
  const params = useSearchParams();
  const ids = useMemo(() => (params.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean), [params]);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ids.length) { setError("ยังไม่ได้เลือกพนักงาน — กลับไปเลือกที่หน้า LINE พนักงาน"); return; }
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch("/api/payroll/line-invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_ids: ids }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.error) throw new Error(json.error || "ออกบัตร QR ไม่สำเร็จ");
        const list = (json.data?.invites ?? []) as Invite[];
        const pairs = await Promise.all(list.map(async (inv) =>
          [inv.employee_id, await QRCode.toDataURL(inv.link, { errorCorrectionLevel: "M", margin: 1, width: 320 })] as const));
        if (!alive) return;
        setInvites(list);
        setSkipped((json.data?.skipped ?? []) as Skipped[]);
        setQrs(Object.fromEntries(pairs));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "ออกบัตร QR ไม่สำเร็จ");
      }
    })();
    return () => { alive = false; };
  }, [ids]);

  const sheets = useMemo(() => {
    const list = invites ?? [];
    const out: Invite[][] = [];
    for (let i = 0; i < list.length; i += PER_SHEET) out.push(list.slice(i, i + PER_SHEET));
    return out;
  }, [invites]);

  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!invites) return <div className="p-8 text-sm text-slate-500">กำลังออกบัตร QR...</div>;

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <PrintToolbar fileName={docFileName("บัตรสมัคร LINE", `${invites.length} คน`)} />
      <div className="no-print mx-auto max-w-[210mm] px-2 pt-4 text-sm text-slate-600">
        <p>
          ออกบัตร <b>{invites.length}</b> ใบ · บัตรใช้ได้ 14 วัน และใช้ได้คนละครั้ง · ตัดตามเส้นประแล้วแจกให้พนักงานด้วยตัวเอง
        </p>
        {skipped.length > 0 && (
          <p className="mt-1 text-amber-700">
            ข้าม {skipped.length} คน ({Object.entries(skipped.reduce<Record<string, number>>((acc, s) => {
              acc[SKIP_LABEL[s.reason]] = (acc[SKIP_LABEL[s.reason]] ?? 0) + 1;
              return acc;
            }, {})).map(([k, n]) => `${k} ${n}`).join(" · ")})
          </p>
        )}
        {!invites.length && <p className="mt-3 text-slate-500">ไม่มีบัตรให้พิมพ์ — ทุกคนที่เลือกผูก LINE แล้วหรือไม่ได้ทำงานแล้ว</p>}
      </div>
      {sheets.map((sheet, i) => (
        <div key={i} className="sheet">
          {sheet.map((inv) => <InviteCard key={inv.employee_id} invite={inv} qr={qrs[inv.employee_id]} />)}
        </div>
      ))}
      <style>{`
        .sheet { width: 210mm; min-height: 297mm; margin: 12px auto; background: #fff; padding: 8mm;
          display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 70mm; box-sizing: border-box;
          box-shadow: 0 1px 3px rgba(0,0,0,.08); }
        .invite-card { border: 0.4mm dashed #b8b8b8; margin: -0.2mm; padding: 4mm; display: flex; gap: 3.5mm;
          box-sizing: border-box; color: #111; font-family: inherit; overflow: hidden; }
        .invite-card .qr { flex: none; width: 34mm; display: flex; align-items: center; }
        .invite-card .qr img { width: 34mm; height: 34mm; }
        .invite-card .body { min-width: 0; display: flex; flex-direction: column; }
        .invite-card .title { font-size: 10.5pt; font-weight: 700; line-height: 1.2; }
        .invite-card .other { font-size: 7.5pt; color: #666; }
        .invite-card .who { margin-top: 2mm; font-size: 15pt; font-weight: 700; line-height: 1.1; }
        .invite-card .code { font-size: 8pt; color: #444; font-family: ui-monospace, monospace;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .invite-card ol { margin: 2mm 0 0; padding-left: 4.5mm; font-size: 8pt; line-height: 1.45; }
        .invite-card .foot { margin-top: auto; font-size: 7pt; color: #555; }
        @page { size: A4 portrait; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          .sheet { margin: 0; box-shadow: none; page-break-after: always; break-after: page; }
          .sheet:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>
    </div>
  );
}

export default function PayrollLineInvitesPrintPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">กำลังโหลดหน้าพิมพ์...</div>}>
      <LineInvitesPrint />
    </Suspense>
  );
}
