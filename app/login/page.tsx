"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth";

export default function LoginPage() {
  const { login, loginError, user, ready } = useAuth();
  const router = useRouter();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);

  // ถ้า login อยู่แล้ว → เด้งเข้า dashboard
  useEffect(() => { if (ready && user) router.push("/dashboard"); }, [ready, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(email.trim(), password);
    setLoading(false);
    if (ok) router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white text-2xl mb-3">🏢</div>
          <h1 className="text-2xl font-bold text-slate-900">ERP Platform</h1>
          <p className="text-slate-500 mt-1 text-sm">เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">อีเมล</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="you@example.com" autoComplete="email"
              className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">รหัสผ่าน</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••" autoComplete="current-password"
              className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {loginError && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {loginError}</div>
          )}

          <button type="submit" disabled={loading || !email || !password}
            className="w-full h-10 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
          💡 ใช้บัญชีจริงจาก Supabase Auth — ถ้ายังไม่มี user ให้สร้างใน Supabase Dashboard → Authentication → Add user
          แล้วเพิ่ม role ในตาราง user_profiles
        </div>
      </div>
    </div>
  );
}
