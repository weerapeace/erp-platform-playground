"use client";

// ============================================================
// JoinView — สมัครรับสลิปทาง LINE ด้วยบัตร QR (HR พิมพ์แจก) · เปิดผ่าน LIFF /a?join=<token>
// ขั้นตอน: พรีวิวบัตร (ของใคร) → ยืนยัน LINE (id_token) → ผูก → เตือนให้เพิ่มเพื่อน LINE ฝ่ายบุคคล
// ภาษาตาม "ภาษาสลิป" ของพนักงาน (th / en)
// ============================================================
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { initLiffIdToken, type LiffProfile, type LiffSdk } from "@/lib/liff-client";

type Preview = {
  status: "ready" | "linked";
  employee_code: string;
  nickname: string;
  first_name: string;
  language: "th" | "en";
  expires_at: string;
};

const COPY = {
  th: {
    title: "สมัครรับสลิปเงินเดือนทาง LINE",
    cardOf: "บัตรนี้เป็นของ",
    notYou: "ถ้าไม่ใช่คุณ อย่ากดยืนยัน และแจ้ง HR",
    lineAs: "จะผูกกับบัญชี LINE นี้",
    confirm: "ยืนยัน ผูก LINE นี้",
    saving: "กำลังผูก...",
    loading: "กำลังโหลด...",
    waitLine: "กำลังเชื่อมต่อ LINE...",
    doneTitle: "ผูก LINE เรียบร้อย",
    doneText: "ต่อไปสลิปเงินเดือนจะส่งมาทาง LINE ของคุณ",
    addFriend: "อย่าลืมเพิ่มเพื่อน LINE \"ฝ่ายบุคคล\" ไม่งั้นจะไม่ได้รับสลิป",
    close: "ปิดหน้านี้",
    usedTitle: "บัตรนี้ถูกใช้แล้ว",
    usedText: "ถ้าคุณผูกเองแล้ว ไม่ต้องทำอะไรเพิ่ม · ถ้าไม่ใช่คุณ แจ้ง HR ทันที",
    check: "ตรวจว่าเป็น LINE ของฉันไหม",
    expires: "บัตรใช้ได้ถึง",
    noToken: "ไม่พบรหัสบัตร — สแกน QR จากบัตรอีกครั้ง",
  },
  en: {
    title: "Get your payslip on LINE",
    cardOf: "This card belongs to",
    notYou: "If this is not you, do not confirm. Tell HR.",
    lineAs: "Will be linked to this LINE account",
    confirm: "Confirm and link this LINE",
    saving: "Linking...",
    loading: "Loading...",
    waitLine: "Connecting to LINE...",
    doneTitle: "LINE linked",
    doneText: "Your payslips will now be sent to this LINE account.",
    addFriend: "Remember to add the \"HR\" LINE account as a friend, or you won't receive payslips.",
    close: "Close",
    usedTitle: "This card has already been used",
    usedText: "If you linked it yourself, you're done. If not, tell HR right away.",
    check: "Check if it's my LINE",
    expires: "Card valid until",
    noToken: "Card code not found — scan the QR on your card again.",
  },
} as const;

function formatDate(iso: string, lang: "th" | "en") {
  try {
    return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "th-TH", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export function JoinView({ token }: { token: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [liff, setLiff] = useState<LiffSdk | null>(null);
  const [idToken, setIdToken] = useState("");
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [liffErr, setLiffErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState("");
  const [done, setDone] = useState(false);
  const [isFriend, setIsFriend] = useState<boolean | null>(null);
  const lang = preview?.language ?? "th";
  const t = COPY[lang];

  // พรีวิวบัตร
  useEffect(() => {
    if (!token) return;
    fetch(`/api/line-join?t=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => { if (j.error) setLoadErr(j.error); else setPreview(j.data); })
      .catch(() => setLoadErr("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"));
  }, [token]);

  // ยืนยันตัวตน LINE
  useEffect(() => {
    let alive = true;
    initLiffIdToken()
      .then(async (r) => {
        if (!r || !alive) return;
        setLiff(r.liff);
        setIdToken(r.idToken);
        const p = await r.liff.getProfile().catch(() => null);
        if (alive) setProfile(p);
      })
      .catch((e: Error) => { if (alive) setLiffErr(e.message); });
    return () => { alive = false; };
  }, []);

  const link = async () => {
    if (!idToken) { setActErr(liffErr || t.waitLine); return; }
    setBusy(true);
    setActErr("");
    try {
      const r = await fetch("/api/line-join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, id_token: idToken }),
      });
      const j = await r.json();
      if (!r.ok || j.error) { setActErr(j.error || "ทำรายการไม่สำเร็จ"); return; }
      setDone(true);
      // เช็กว่าเป็นเพื่อน LINE ฝ่ายบุคคลแล้วหรือยัง (ทำได้เมื่อ LINE Login ผูกกับ OA แล้ว · ไม่ได้ = ไม่รู้ ก็เตือนไว้ก่อน)
      const fs = await liff?.getFriendship?.().catch(() => null);
      setIsFriend(fs ? fs.friendFlag : null);
    } catch {
      setActErr("ทำรายการไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  };

  const wrap = (children: ReactNode) => (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center px-3 py-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-5">{children}</div>
    </div>
  );

  if (!token) return wrap(<p className="py-10 text-center text-slate-500">{t.noToken}</p>);
  if (loadErr) return wrap(
    <div className="py-8 text-center">
      <Icon name="warning" size={36} className="mx-auto text-amber-500" />
      <p className="mt-3 text-slate-700">{loadErr}</p>
    </div>
  );
  if (!preview) return wrap(<p className="py-10 text-center text-slate-400">{t.loading}</p>);

  if (done) return wrap(
    <div className="py-6 text-center">
      <Icon name="success" size={44} className="mx-auto text-emerald-600" />
      <p className="mt-3 text-lg font-bold text-slate-900">{t.doneTitle}</p>
      <p className="mt-1 text-sm text-slate-600">{t.doneText}</p>
      {isFriend !== true && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{t.addFriend}</p>
      )}
      {liff?.closeWindow && (
        <button onClick={() => liff.closeWindow?.()} className="mt-5 h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-700">
          {t.close}
        </button>
      )}
    </div>
  );

  const name = preview.nickname || preview.first_name;
  return wrap(
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900 leading-snug">{t.title}</h1>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs text-slate-500">{t.cardOf}</p>
        <p className="mt-0.5 text-xl font-bold text-slate-900">{name || "-"}</p>
        <p className="font-mono text-sm text-slate-500">{preview.employee_code}</p>
        <p className="mt-2 text-xs text-slate-400">{t.expires} {formatDate(preview.expires_at, lang)}</p>
      </div>

      {preview.status === "linked" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="font-semibold text-amber-800">{t.usedTitle}</p>
          <p className="mt-1 text-sm text-amber-700">{t.usedText}</p>
        </div>
      ) : (
        <p className="text-sm text-red-600">{t.notYou}</p>
      )}

      <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
        {profile?.pictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.pictureUrl} alt="" className="h-10 w-10 rounded-full border border-slate-200 object-cover" />
        ) : (
          <span className="h-10 w-10 rounded-full bg-emerald-50" />
        )}
        <div className="min-w-0">
          <p className="text-xs text-slate-500">{t.lineAs}</p>
          <p className="truncate font-semibold text-slate-800">{profile?.displayName || (liffErr ? "-" : t.waitLine)}</p>
        </div>
      </div>
      {liffErr && <p className="text-sm text-red-600">{liffErr}</p>}

      <button
        onClick={() => void link()}
        disabled={busy || !idToken}
        className={`h-12 w-full rounded-xl text-base font-semibold disabled:opacity-50 ${
          preview.status === "linked" ? "border border-slate-200 text-slate-700" : "bg-emerald-600 text-white"
        }`}
      >
        {busy ? t.saving : preview.status === "linked" ? t.check : t.confirm}
      </button>
      {actErr && <p className="text-sm text-red-600">{actErr}</p>}
    </div>
  );
}
