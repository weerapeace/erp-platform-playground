"use client";

// ============================================================
// ผูกบัญชี LINE เข้ากับ "ผู้ใช้ของฉัน" — เพื่ออนุมัติงานผ่านหน้าเล็กใน LINE
// (user อาจไม่ใช่พนักงาน · ผูกที่ระดับ user โดยตรง)
// ต้องตั้ง env NEXT_PUBLIC_LINE_LIFF_ID · ต้องล็อกอิน ERP อยู่
// ============================================================
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type LiffSdk = { init: (o: { liffId: string }) => Promise<void>; isLoggedIn: () => boolean; login: (o?: { redirectUri?: string }) => void; getIDToken: () => string | null };
const getLiff = () => (typeof window !== "undefined" ? (window as unknown as { liff?: LiffSdk }).liff : undefined);
const LIFF_SCRIPT = "https://static.line-scdn.net/liff/edge/2/sdk.js";
const liffId = () => process.env.NEXT_PUBLIC_LINE_LIFF_ID || process.env.NEXT_PUBLIC_LIFF_ID || "2010621559-NELkN0OU";

function loadLiff() {
  return new Promise<void>((resolve, reject) => {
    if (getLiff()) return resolve();
    const s = document.createElement("script"); s.src = LIFF_SCRIPT; s.async = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error("โหลด LINE LIFF ไม่สำเร็จ"));
    document.head.appendChild(s);
  });
}

export default function AccountLinePage() {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const loadStatus = useCallback(async () => {
    try { const j = await fetch("/api/account/line-link").then((r) => r.json()); if (j.error) setErr(j.error); else setLinked(!!j.linked); }
    catch { setErr("โหลดสถานะไม่สำเร็จ"); }
  }, []);
  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const link = async () => {
    setErr(""); setMsg(""); setBusy(true);
    try {
      const id = liffId();
      if (!id) { setErr("ยังไม่ได้ตั้งค่า LIFF (NEXT_PUBLIC_LINE_LIFF_ID) — แจ้งแอดมิน"); return; }
      await loadLiff();
      const lf = getLiff();
      if (!lf) throw new Error("ไม่พบ LINE LIFF SDK");
      await lf.init({ liffId: id });
      if (!lf.isLoggedIn()) { lf.login({ redirectUri: window.location.href }); return; }
      const tk = lf.getIDToken();
      if (!tk) throw new Error("อ่าน LINE ID token ไม่ได้");
      const r = await fetch("/api/account/line-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id_token: tk }) });
      const j = await r.json();
      if (!r.ok || j.error) { setErr(j.error || "ผูกไม่สำเร็จ"); return; }
      setMsg("ผูกบัญชี LINE สำเร็จ ✓ ตอนนี้กดอนุมัติงานผ่าน LINE ได้แล้ว"); setLinked(true);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const unlink = async () => {
    if (!window.confirm("ยกเลิกการผูก LINE?")) return;
    setBusy(true); setErr(""); setMsg("");
    try { const r = await fetch("/api/account/line-link", { method: "DELETE" }); const j = await r.json(); if (!r.ok || j.error) setErr(j.error || "ยกเลิกไม่สำเร็จ"); else { setLinked(false); setMsg("ยกเลิกการผูกแล้ว"); } }
    catch { setErr("ยกเลิกไม่สำเร็จ"); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <Link href="/account" className="text-sm text-slate-500 hover:underline">← บัญชีของฉัน</Link>
        <h1 className="text-xl font-bold text-slate-900 mt-2">ผูกบัญชี LINE</h1>
        <p className="text-sm text-slate-500 mt-1">ผูกแล้วจะกด <b>อนุมัติงานผ่าน LINE</b> ได้เลย โดยไม่ต้องเข้าระบบทุกครั้ง (ระบบจะรู้ว่าเป็นคุณจากบัญชี LINE)</p>

        {err && <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        {msg && <p className="mt-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</p>}

        <div className="mt-5">
          {linked === null ? <p className="text-slate-400 text-sm">กำลังโหลด...</p>
            : linked ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ ผูกบัญชี LINE แล้ว</div>
                <button onClick={unlink} disabled={busy} className="h-11 w-full rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">{busy ? "..." : "ยกเลิกการผูก"}</button>
              </div>
            ) : (
              <button onClick={link} disabled={busy} className="h-12 w-full rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">{busy ? "กำลังผูก..." : "🔗 ผูกบัญชี LINE"}</button>
            )}
        </div>
        <p className="mt-4 text-[11px] text-slate-400">แนะนำ: เปิดหน้านี้ในมือถือที่มีแอป LINE เพื่อผูกได้ราบรื่นที่สุด</p>
      </div>
    </div>
  );
}
