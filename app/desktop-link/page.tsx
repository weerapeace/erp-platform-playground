"use client";

/**
 * เชื่อมโปรแกรมบนเครื่อง (เช่น Louis Batch) กับบัญชี ERP
 *
 * โปรแกรมเปิดหน้านี้ในเบราว์เซอร์ที่ล็อกอินอยู่แล้ว (?app=&return=http://127.0.0.1:<port>/erp-linked&state=)
 * → คนกด "อนุญาต" → /api/desktop-link ออกการเข้าสู่ระบบชุดใหม่ของโปรแกรม → ส่งกลับไปที่โปรแกรมทางส่วน # ของลิงก์
 * ใช้ได้กับทุกวิธีล็อกอิน (ลิงก์อีเมล / Google / รหัสผ่าน / PIN) เพราะใช้การล็อกอินที่มีอยู่ในเบราว์เซอร์
 *
 * หน้าเดี่ยว (ไม่ครอบ PlaygroundShell) · คู่มือ docs/desktop-link.md
 */

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { knownApp, returnHash, safeReturnUrl, safeState } from "@/lib/desktop-link";

const btn = "w-full h-10 text-sm font-medium rounded-lg transition-all disabled:opacity-50";

function DesktopLinkInner() {
  const params = useSearchParams();
  const { user, ready } = useAuth();
  const app = knownApp(params.get("app"));
  const back = safeReturnUrl(params.get("return"));
  const state = safeState(params.get("state"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<"allowed" | "denied" | null>(null);

  const allow = async () => {
    if (!back || !state || !app) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/desktop-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app }) });
      const j = await res.json().catch(() => null) as { data?: { access_token: string; refresh_token: string; expires_at: number | null; email: string; name: string }; error?: string } | null;
      if (!res.ok || !j?.data) throw new Error(j?.error || "เชื่อมไม่สำเร็จ — ลองใหม่อีกครั้ง");
      setSent("allowed");
      const d = j.data;
      window.location.href = back + returnHash({ state, at: d.access_token, rt: d.refresh_token, exp: d.expires_at, email: d.email, name: d.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const deny = () => {
    if (!back || !state) return;
    setSent("denied");
    window.location.href = back + returnHash({ state, denied: 1 });
  };

  const here = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/desktop-link";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-slate-900">เชื่อมโปรแกรมกับ ERP</h1>
          <p className="text-slate-500 mt-1 text-sm">ให้โปรแกรมบนเครื่องนี้ใช้บัญชีของคุณ</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          {(!app || !back || !state) && (
            <div className="text-center text-sm text-slate-600 py-4">
              <p className="font-semibold text-slate-900">ลิงก์ไม่ถูกต้อง</p>
              <p className="mt-2">กดปุ่ม &quot;เชื่อม ERP&quot; ในโปรแกรมอีกครั้ง เพื่อเปิดลิงก์ใหม่</p>
            </div>
          )}

          {app && back && state && !ready && <p className="text-center text-sm text-slate-500 py-6">กำลังตรวจการเข้าสู่ระบบ…</p>}

          {app && back && state && ready && !user && (
            <div className="text-center text-sm text-slate-600 space-y-4 py-2">
              <p>เข้าสู่ระบบ ERP ก่อน แล้วระบบจะพากลับมาหน้านี้</p>
              <a href={`/login?next=${encodeURIComponent(here)}`} className={`${btn} inline-block leading-10 text-white bg-gradient-to-r from-orange-500 to-amber-500`}>
                ไปหน้าเข้าสู่ระบบ
              </a>
            </div>
          )}

          {app && back && state && ready && user && !sent && (
            <>
              <p className="text-sm text-slate-700 leading-relaxed">
                <strong>{app}</strong> บนเครื่องนี้ขอใช้บัญชี
                <span className="block mt-1 px-3 py-2 bg-orange-50 border border-orange-100 rounded-lg text-orange-800 text-center font-medium">{user.email}</span>
              </p>
              <ul className="text-xs text-slate-500 list-disc pl-5 space-y-1">
                <li>ใช้ส่งรูปเข้า SAMPLE Images ในชื่อของคุณ — ทำได้เท่าที่สิทธิ์ของคุณทำได้</li>
                <li>เบราว์เซอร์นี้ยังล็อกอินอยู่ตามเดิม</li>
                <li>ยกเลิกได้ที่โปรแกรม (ปุ่ม &quot;เลิกเชื่อม&quot;)</li>
              </ul>
              {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
              <div className="space-y-2">
                <button type="button" onClick={allow} disabled={busy} className={`${btn} text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-sm`}>
                  {busy ? "กำลังเชื่อม…" : "อนุญาต"}
                </button>
                <button type="button" onClick={deny} disabled={busy} className={`${btn} text-slate-600 border border-slate-200 hover:bg-slate-50`}>
                  ไม่อนุญาต
                </button>
              </div>
            </>
          )}

          {sent && (
            <div className="text-center text-sm text-slate-600 py-4">
              <p className="font-semibold text-slate-900">{sent === "allowed" ? "ส่งกลับไปที่โปรแกรมแล้ว" : "ไม่อนุญาตแล้ว"}</p>
              <p className="mt-2">กลับไปที่ {app} ได้เลย — ปิดแท็บนี้ได้</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DesktopLinkPage() {
  return <Suspense fallback={null}><DesktopLinkInner /></Suspense>;
}
