"use client";

// ============================================================
// 💬 ผูกบัญชี Discord เข้ากับ "ผู้ใช้ของฉัน" — กดปุ่มติ๊กเช็กลิสต์ในข้อความของบอท ERP ได้ (ระบบรู้ว่าเป็นใคร + เช็กสิทธิ์)
// ยืนยันกับ Discord (สิทธิ์แค่ "รู้ว่าคุณคือใคร" ไม่อ่านแชท) · แบบเดียวกับหน้าผูก LINE (/account/line)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const ERR: Record<string, string> = {
  "not-ready": "ระบบยังไม่ได้ตั้งค่าบอท Discord — แจ้งแอดมิน",
  cancelled: "ยกเลิกที่หน้า Discord แล้ว — กดผูกใหม่ได้",
  expired: "ลิงก์ผูกบัญชีหมดอายุ — กดผูกใหม่อีกครั้ง",
  discord: "ยืนยันกับ Discord ไม่สำเร็จ — ลองใหม่อีกครั้ง",
  taken: "บัญชี Discord นี้ผูกกับผู้ใช้ ERP คนอื่นอยู่แล้ว — ให้คนนั้นยกเลิกก่อน หรือแจ้งแอดมิน",
  save: "บันทึกการผูกไม่สำเร็จ — ลองใหม่อีกครั้ง",
};

export default function AccountDiscordPage() {
  const [state, setState] = useState<{ linked: boolean; discord_username: string | null; ready: { link: boolean; buttons: boolean } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [needLogin, setNeedLogin] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/account/discord-link");
      if (r.status === 401) { setNeedLogin(true); return; }
      const j = await r.json();
      if (j.error) setErr((e) => e || j.error); else setState(j);
    } catch { setErr((e) => e || "โหลดสถานะไม่สำเร็จ"); }
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("ok")) setMsg("ผูกบัญชี Discord สำเร็จ ✓ กดปุ่มติ๊กในข้อความของบอทได้เลย");
    const e = q.get("err"); if (e) setErr(ERR[e] ?? "ผูกไม่สำเร็จ");
    if (q.get("ok") || e) window.history.replaceState(null, "", window.location.pathname);
    void load();
  }, [load]);

  const unlink = async () => {
    if (!window.confirm("ยกเลิกการผูก Discord? (กดติ๊กในแชทไม่ได้จนกว่าจะผูกใหม่)")) return;
    setBusy(true); setErr(""); setMsg("");
    try { const r = await fetch("/api/account/discord-link", { method: "DELETE" }); const j = await r.json(); if (!r.ok || j.error) setErr(j.error || "ยกเลิกไม่สำเร็จ"); else { setMsg("ยกเลิกการผูกแล้ว"); await load(); } }
    catch { setErr("ยกเลิกไม่สำเร็จ"); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">← กลับหน้าหลัก</Link>
        <h1 className="mt-2 text-xl font-bold text-slate-900">ผูกบัญชี Discord</h1>
        <p className="mt-1 text-sm text-slate-500">ผูกแล้วกด <b>ปุ่มติ๊ก "รออะไรอยู่"</b> ในข้อความของบอท ERP ได้เลย — ระบบจะบันทึกว่าคุณเป็นคนติ๊ก และใช้สิทธิ์ตามบัญชี ERP ของคุณ</p>
        {err && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
        {msg && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
        <div className="mt-5">
          {needLogin ? (
            <a href={`/login?next=${encodeURIComponent("/account/discord")}`} className="block h-12 w-full rounded-xl bg-slate-900 text-center text-sm font-bold leading-[3rem] text-white hover:bg-slate-800">เข้าสู่ระบบ ERP ก่อน</a>
          ) : state === null ? <p className="text-sm text-slate-400">กำลังโหลด...</p>
            : state.linked ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ ผูกกับ Discord <b>{state.discord_username ?? ""}</b> แล้ว</div>
                <a href="/api/account/discord-link/start" className="block h-10 w-full rounded-xl border border-slate-200 text-center text-sm font-medium leading-10 text-slate-600 hover:bg-slate-50">ผูกกับบัญชี Discord อื่นแทน</a>
                <button onClick={() => void unlink()} disabled={busy} className="h-10 w-full rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">{busy ? "..." : "ยกเลิกการผูก"}</button>
              </div>
            ) : !state.ready.link ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">ระบบยังไม่ได้ตั้งค่าบอท Discord — แจ้งแอดมินให้ตั้งตามคู่มือก่อน</p>
            ) : (
              <a href="/api/account/discord-link/start" className="block h-12 w-full rounded-xl bg-[#5865f2] text-center text-sm font-bold leading-[3rem] text-white hover:bg-[#4752c4]">🔗 ผูกบัญชี Discord</a>
            )}
        </div>
        <p className="mt-4 text-[11px] text-slate-400">Discord จะถามยืนยัน — ระบบขอแค่ "รู้ว่าคุณคือใคร" ไม่อ่านแชทหรือส่งข้อความแทนคุณ</p>
      </div>
    </div>
  );
}
