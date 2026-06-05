"use client";

/**
 * ตั้งรหัสผ่าน — ปลายทางของ:
 *   1) ลิงก์ "รับคำเชิญ" (invite) — ผู้ใช้ใหม่ตั้งรหัสผ่านครั้งแรก
 *   2) ลิงก์ "ลืมรหัสผ่าน" (recovery) — ผู้ใช้เดิมตั้งรหัสผ่านใหม่
 *
 * Supabase (detectSessionInUrl=true) อ่าน token จาก URL ให้อัตโนมัติ → ได้ session ชั่วคราว
 * หน้านี้แค่ให้กรอกรหัสผ่านใหม่ แล้วเรียก updateUser({ password })
 *
 * เป็นหน้า "เดี่ยว" (ไม่ครอบ PlaygroundShell) จึงไม่ติด guard บังคับ login
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Phase = "checking" | "form" | "expired" | "done";

export default function SetPasswordPage() {
  const router = useRouter();
  // จับ hash ตั้งแต่ render แรก (ก่อน Supabase ล้างทิ้ง) — ใช้ดูว่าลิงก์ error/หมดอายุไหม
  const [initialHash] = useState(() => (typeof window !== "undefined" ? window.location.hash : ""));
  const [phase, setPhase] = useState<Phase>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- ตรวจ session จากลิงก์ ----
  useEffect(() => {
    // ลิงก์มี error (เช่น otp_expired) → หมดอายุ/ไม่ถูกต้อง
    if (initialHash.includes("error") || initialHash.includes("error_code")) {
      setPhase("expired");
      return;
    }
    let settled = false;
    const onReady = (userEmail: string | null) => {
      if (settled) return;
      settled = true;
      setEmail(userEmail);
      setPhase("form");
    };
    // ฟัง event (invite/recovery จะ fire SIGNED_IN / PASSWORD_RECOVERY)
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, session) => {
      if (session?.user) onReady(session.user.email ?? null);
    });
    // เผื่อ Supabase ตั้ง session ไปก่อนหน้านี้แล้ว — เช็คซ้ำเป็นระยะ
    let tries = 0;
    const poll = async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      if (data.session?.user) { onReady(data.session.user.email ?? null); return; }
      if (++tries >= 8) { if (!settled) { settled = true; setPhase("expired"); } return; }
      setTimeout(poll, 400);
    };
    poll();
    return () => { settled = true; sub.subscription.unsubscribe(); };
  }, [initialHash]);

  // ---- บันทึกรหัสผ่านใหม่ ----
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw1.length < 8) { setError("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร"); return; }
    if (pw1 !== pw2) { setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน"); return; }
    setSaving(true);
    const { error: upErr } = await supabaseBrowser.auth.updateUser({ password: pw1 });
    setSaving(false);
    if (upErr) {
      setError(upErr.message.includes("New password should be different")
        ? "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม"
        : upErr.message);
      return;
    }
    setPhase("done");
    setTimeout(() => router.replace("/apps"), 1600);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white text-2xl mb-3 shadow-lg shadow-orange-500/30">
            🔑
          </div>
          <h1 className="text-2xl font-bold text-slate-900">ตั้งรหัสผ่าน</h1>
          <p className="text-slate-500 mt-1 text-sm">สร้างรหัสผ่านสำหรับเข้าสู่ระบบ</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          {/* ============= กำลังตรวจสอบลิงก์ ============= */}
          {phase === "checking" && (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto border-3 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm text-slate-500">กำลังตรวจสอบลิงก์...</p>
            </div>
          )}

          {/* ============= ลิงก์หมดอายุ/ไม่ถูกต้อง ============= */}
          {phase === "expired" && (
            <div className="text-center py-6">
              <div className="w-14 h-14 mx-auto bg-red-100 rounded-full flex items-center justify-center text-2xl mb-3">⌛</div>
              <h2 className="font-semibold text-slate-900">ลิงก์หมดอายุหรือไม่ถูกต้อง</h2>
              <p className="text-sm text-slate-600 mt-2">
                ลิงก์ตั้งรหัสผ่านมีอายุจำกัด<br />
                กรุณาขอลิงก์ใหม่ หรือให้ผู้ดูแลระบบเชิญอีกครั้ง
              </p>
              <a
                href="/login"
                className="inline-block mt-5 w-full h-10 leading-10 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg hover:from-orange-600 hover:to-amber-600 transition-all"
              >
                ไปหน้าเข้าสู่ระบบ
              </a>
            </div>
          )}

          {/* ============= ฟอร์มตั้งรหัสผ่าน ============= */}
          {phase === "form" && (
            <form onSubmit={submit} className="space-y-3">
              {email && (
                <div className="px-3 py-2 bg-orange-50 border border-orange-100 rounded-lg text-xs text-orange-700 text-center">
                  บัญชี: <strong>{email}</strong>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">รหัสผ่านใหม่</label>
                <input
                  type={show ? "text" : "password"} value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  required placeholder="อย่างน้อย 8 ตัวอักษร" autoComplete="new-password" autoFocus
                  className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">ยืนยันรหัสผ่านอีกครั้ง</label>
                <input
                  type={show ? "text" : "password"} value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  required placeholder="พิมพ์รหัสผ่านซ้ำ" autoComplete="new-password"
                  className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-500 select-none cursor-pointer">
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="rounded border-slate-300" />
                แสดงรหัสผ่าน
              </label>

              {error && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠️ {error}</div>
              )}

              <button
                type="submit" disabled={saving || !pw1 || !pw2}
                className="w-full h-10 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 transition-all shadow-sm"
              >
                {saving ? "กำลังบันทึก..." : "บันทึกรหัสผ่าน"}
              </button>
            </form>
          )}

          {/* ============= สำเร็จ ============= */}
          {phase === "done" && (
            <div className="text-center py-6">
              <div className="w-14 h-14 mx-auto bg-emerald-100 rounded-full flex items-center justify-center text-2xl mb-3">✅</div>
              <h2 className="font-semibold text-slate-900">ตั้งรหัสผ่านสำเร็จ!</h2>
              <p className="text-sm text-slate-600 mt-1">กำลังพาเข้าสู่ระบบ...</p>
            </div>
          )}
        </div>

        <p className="mt-6 text-xs text-slate-400 text-center">
          เพื่อความปลอดภัย อย่าแชร์รหัสผ่านกับผู้อื่น
        </p>
      </div>
    </div>
  );
}
