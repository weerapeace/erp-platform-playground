"use client";

/**
 * Auth callback — handles redirect after Magic Link / OAuth login
 *
 * Supabase JS auto-parses URL (hash for magic link, ?code= for OAuth)
 * เซต session ให้ → onAuthStateChange ใน AuthProvider จะ fire
 * → page นี้แค่รอ user แล้ว redirect ไป /apps
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth";

export default function AuthCallbackPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    // รอ 1 tick ให้ Supabase JS process URL params
    const t = setTimeout(() => {
      if (user) router.replace("/apps");
      else router.replace("/login?error=callback");
    }, 1500);
    return () => clearTimeout(t);
  }, [ready, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-orange-100 mb-4">
          <div className="w-7 h-7 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800">กำลังเข้าสู่ระบบ...</h2>
        <p className="text-sm text-slate-500 mt-1">รอสักครู่</p>
      </div>
    </div>
  );
}
