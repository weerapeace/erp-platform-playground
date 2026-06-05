"use client";

/**
 * โปรไฟล์ของฉัน — ผู้ใช้ทุกคนแก้ชื่อ + รูปของตัวเองได้
 * ใช้ของกลาง: /api/admin/upload (R2) + PATCH /api/admin/users (RPC erp_admin_users_update_profile อนุญาตเจ้าของบัญชี)
 */

import { useState, useEffect, useRef } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, roleLabel, roleColor } from "@/components/auth";
import { apiFetch } from "@/lib/api";

function avatarSrc(v: string | null): string | null {
  if (!v) return null;
  return v.startsWith("http") ? v : `/api/r2-image?key=${encodeURIComponent(v)}`;
}

export default function ProfilePage() {
  const { user, ready, refreshProfile } = useAuth();
  const [name, setName]       = useState("");
  const [avatar, setAvatar]   = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [msg, setMsg]         = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seeded = useRef(false);

  // seed จาก user (ครั้งแรกที่โหลดเสร็จ)
  useEffect(() => {
    if (user && !seeded.current) {
      seeded.current = true;
      setName(user.name ?? "");
      setAvatar(user.avatar ?? null);
    }
  }, [user]);

  const uploadAvatar = async (file: File) => {
    if (!file.type.startsWith("image/")) { setError("ไฟล์ต้องเป็นรูปภาพ"); return; }
    setUploadBusy(true); setError(null); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "avatars");
      const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setAvatar(json.r2_key);
    } catch (err) { setError(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ"); }
    finally { setUploadBusy(false); }
  };

  const save = async () => {
    if (!user) return;
    setBusy(true); setError(null); setMsg(null);
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, display_name: name.trim(), avatar_url: avatar ?? "", actor: user.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      await refreshProfile();
      setMsg("บันทึกแล้ว");
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  if (!ready) return <PlaygroundShell><div className="p-10 text-center text-slate-400">กำลังโหลด...</div></PlaygroundShell>;
  if (!user) return <PlaygroundShell><div className="p-10 text-center text-slate-400">ยังไม่ได้เข้าสู่ระบบ</div></PlaygroundShell>;

  const src = avatarSrc(avatar);

  return (
    <PlaygroundShell>
      <div className="max-w-lg mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-slate-800">โปรไฟล์ของฉัน</h1>
        <p className="text-sm text-slate-500 mt-0.5 mb-6">แก้ชื่อแสดงผล และอัปโหลดรูปโปรไฟล์ของคุณ</p>

        {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}
        {msg && <div className="mb-4 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">✓ {msg}</div>}

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          {/* รูป */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="w-20 h-20 rounded-full object-cover border border-slate-200" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-2xl font-semibold">
                  {(name || user.email).charAt(0).toUpperCase()}
                </div>
              )}
              {uploadBusy && <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center text-white text-[10px]">กำลังโหลด</div>}
            </div>
            <div className="flex flex-col gap-1.5">
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); e.target.value = ""; }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadBusy || busy}
                className="h-9 px-4 text-sm font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {uploadBusy ? "กำลังอัปโหลด..." : src ? "เปลี่ยนรูป" : "＋ อัปโหลดรูป"}
              </button>
              {src && (
                <button type="button" onClick={() => setAvatar(null)} disabled={uploadBusy || busy}
                  className="h-7 px-4 text-xs text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 text-left">ลบรูป</button>
              )}
            </div>
          </div>

          {/* ชื่อ */}
          <label className="block">
            <span className="text-xs font-medium text-slate-600">ชื่อแสดงผล</span>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy}
              placeholder={user.email.split("@")[0]}
              className="w-full h-10 mt-1 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60" />
          </label>

          <div className="text-xs text-slate-500 space-y-0.5">
            <div>อีเมล: <span className="text-slate-700">{user.email}</span></div>
            <div>สิทธิ์: <span className={`inline-block text-[10px] px-1.5 rounded-full border ${roleColor(user.role)}`}>{roleLabel(user.role)}</span></div>
          </div>

          <button onClick={save} disabled={busy || uploadBusy}
            className="w-full h-10 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {busy ? "กำลังบันทึก..." : "💾 บันทึก"}
          </button>
        </div>
      </div>
    </PlaygroundShell>
  );
}
