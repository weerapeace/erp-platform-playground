"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth";
import { internalEmail } from "@/lib/internal-users";

// รับเฉพาะ path ภายในเว็บ (กัน redirect ออกนอกเว็บ)
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/apps";
}

function LoginInner() {
  const { login, loginWithMagicLink, loginWithGoogle, loginError, user, ready } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = safeNext(params.get("next"));

  const [mode,     setMode]     = useState<"magic" | "google" | "password" | "pin">("magic");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [uname,    setUname]    = useState("");
  const [pin,      setPin]      = useState("");
  const [loading,  setLoading]  = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(internalEmail(uname), pin);
    setLoading(false);
    if (ok) router.push(nextPath);
  };

  // ถ้า login อยู่แล้ว → เด้งกลับหน้าที่มา (next) ถ้าไม่มีก็ /apps
  useEffect(() => { if (ready && user) router.replace(nextPath); }, [ready, user, router, nextPath]);

  const submitMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (typeof window !== "undefined") sessionStorage.setItem("login_next", nextPath);
    const ok = await loginWithMagicLink(email.trim());
    setLoading(false);
    if (ok) setMagicSent(true);
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(email.trim(), password);
    setLoading(false);
    if (ok) router.push(nextPath);
  };

  const handleGoogle = async () => {
    setLoading(true);
    if (typeof window !== "undefined") sessionStorage.setItem("login_next", nextPath);
    await loginWithGoogle();
    // redirect ทำโดย Supabase — ไม่ต้อง setLoading(false)
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white text-2xl mb-3 shadow-lg shadow-orange-500/30">
            🏢
          </div>
          <h1 className="text-2xl font-bold text-slate-900">ERP Platform</h1>
          <p className="text-slate-500 mt-1 text-sm">เข้าสู่ระบบเพื่อใช้งาน</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          {/* ============= MAGIC LINK SENT ============= */}
          {magicSent ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 mx-auto bg-emerald-100 rounded-full flex items-center justify-center text-2xl mb-3">📧</div>
              <h2 className="font-semibold text-slate-900">ส่ง Link แล้ว!</h2>
              <p className="text-sm text-slate-600 mt-1">
                เช็ค email ที่ <strong>{email}</strong><br />
                คลิก link ในอีเมล → login เสร็จทันที
              </p>
              <button
                onClick={() => { setMagicSent(false); setEmail(""); }}
                className="mt-4 text-xs text-orange-600 hover:underline"
              >
                ← กลับไปหน้า login
              </button>
            </div>
          ) : (
            <>
              {/* ============= Google button (Phase B — ต้อง setup) ============= */}
              <button
                type="button"
                onClick={handleGoogle}
                disabled={loading}
                className="w-full h-11 flex items-center justify-center gap-3 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z" fill="#4285F4"/>
                  <path d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z" fill="#34A853"/>
                  <path d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z" fill="#FBBC05"/>
                  <path d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z" fill="#EA4335"/>
                </svg>
                เข้าสู่ระบบด้วย Google
              </button>

              {/* Divider */}
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-slate-400">หรือ</span>
                </div>
              </div>

              {/* ============= MAGIC LINK FORM ============= */}
              {mode === "magic" && (
                <form onSubmit={submitMagicLink} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">อีเมล</label>
                    <input
                      type="email" value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required placeholder="you@example.com" autoComplete="email"
                      className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>

                  {loginError && (
                    <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                      ⚠️ {loginError}
                    </div>
                  )}

                  <button
                    type="submit" disabled={loading || !email}
                    className="w-full h-10 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 transition-all shadow-sm"
                  >
                    {loading ? "กำลังส่ง..." : "📧 ส่ง Magic Link เข้า Email"}
                  </button>

                  <div className="flex items-center justify-center gap-3 text-xs">
                    <button type="button" onClick={() => setMode("password")} className="text-slate-500 hover:text-slate-700">ใช้รหัสผ่านแทน</button>
                    <span className="text-slate-300">·</span>
                    <button type="button" onClick={() => setMode("pin")} className="text-orange-600 hover:underline font-medium">เข้าด้วยรหัสพนักงาน</button>
                  </div>
                </form>
              )}

              {/* ============= PIN FORM (ผู้ใช้ภายใน — username + PIN) ============= */}
              {mode === "pin" && (
                <form onSubmit={submitPin} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">ชื่อผู้ใช้ (username)</label>
                    <input
                      type="text" value={uname}
                      onChange={(e) => setUname(e.target.value)}
                      required placeholder="เช่น somchai" autoComplete="username" autoCapitalize="none"
                      className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">PIN (6 หลัก)</label>
                    <input
                      type="password" inputMode="numeric" pattern="\d*" maxLength={6} value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      required placeholder="••••••" autoComplete="current-password"
                      className="w-full h-10 px-3 text-sm tracking-[0.4em] text-center border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>

                  {loginError && (
                    <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠️ {loginError}</div>
                  )}

                  <button
                    type="submit" disabled={loading || !uname || pin.length < 6}
                    className="w-full h-10 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 transition-all"
                  >
                    {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                  </button>

                  <button type="button" onClick={() => setMode("magic")} className="w-full text-xs text-slate-500 hover:text-slate-700">← กลับไปหน้าหลัก</button>
                </form>
              )}

              {/* ============= PASSWORD FORM (legacy) ============= */}
              {mode === "password" && (
                <form onSubmit={submitPassword} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">อีเมล</label>
                    <input
                      type="email" value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required placeholder="you@example.com" autoComplete="email"
                      className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">รหัสผ่าน</label>
                    <input
                      type="password" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required placeholder="••••••••" autoComplete="current-password"
                      className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>

                  {loginError && (
                    <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                      ⚠️ {loginError}
                    </div>
                  )}

                  <button
                    type="submit" disabled={loading || !email || !password}
                    className="w-full h-10 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 transition-all"
                  >
                    {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode("magic")}
                    className="w-full text-xs text-slate-500 hover:text-slate-700"
                  >
                    ← ใช้ Magic Link แทน
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        {/* Footer hint */}
        <p className="mt-6 text-xs text-slate-400 text-center">
          ระบบจะส่ง email ยืนยันเพื่อรักษาความปลอดภัย
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginInner /></Suspense>;
}
