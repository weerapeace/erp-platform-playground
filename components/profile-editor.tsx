"use client";

/**
 * ProfileEditor (ของกลาง) — เนื้อหาแก้โปรไฟล์ตัวเอง (ชื่อ/รูป/ลิงก์ GIF + เปลี่ยนรหัสผ่าน/PIN)
 * ใช้ได้ทั้งในหน้า /profile และในป๊อปอัป (AccountMenu) — ไม่มี shell/หัวข้อในตัว
 */
import { useState, useEffect, useRef } from "react";
import { useAuth, roleLabel, roleColor } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase-browser";

function avatarSrc(v: string | null): string | null {
  if (!v) return null;
  return v.startsWith("http") ? v : `/api/r2-image?key=${encodeURIComponent(v)}`;
}

export function ProfileEditor() {
  const { user, refreshProfile } = useAuth();
  const [name, setName]       = useState("");
  const [avatar, setAvatar]   = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [msg, setMsg]         = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seeded = useRef(false);

  const isPin = !!user?.email?.endsWith("@pin.local");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  useEffect(() => {
    if (user && !seeded.current) {
      seeded.current = true;
      setName(user.name ?? "");
      setAvatar(user.avatar ?? null);
    }
  }, [user]);

  const changePassword = async () => {
    setPwMsg(null); setPwErr(null);
    if (isPin) { if (!/^\d{6}$/.test(pw1)) { setPwErr("PIN ต้องเป็นตัวเลข 6 หลัก"); return; } }
    else if (pw1.length < 6) { setPwErr("รหัสผ่านอย่างน้อย 6 ตัวอักษร"); return; }
    if (pw1 !== pw2) { setPwErr("ยืนยันไม่ตรงกัน"); return; }
    setPwBusy(true);
    const { error: e } = await supabaseBrowser.auth.updateUser({ password: pw1 });
    if (e) setPwErr(e.message);
    else { setPwMsg(isPin ? "เปลี่ยน PIN แล้ว" : "เปลี่ยนรหัสผ่านแล้ว"); setPw1(""); setPw2(""); }
    setPwBusy(false);
  };

  const uploadAvatar = async (file: File) => {
    if (!file.type.startsWith("image/")) { setError("ไฟล์ต้องเป็นรูปภาพ"); return; }
    setUploadBusy(true); setError(null); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("folder", "avatars");
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

  if (!user) return <div className="p-6 text-center text-slate-400 text-sm">ยังไม่ได้เข้าสู่ระบบ</div>;
  const src = avatarSrc(avatar);

  return (
    <div className="space-y-5">
      {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}
      {msg && <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">✓ {msg}</div>}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        {/* รูป */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            {src
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={src} alt="" className="w-20 h-20 rounded-full object-cover border border-slate-200" />
              : <div className="w-20 h-20 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-2xl font-semibold">{(name || user.email).charAt(0).toUpperCase()}</div>}
            {uploadBusy && <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center text-white text-[10px]">กำลังโหลด</div>}
          </div>
          <div className="flex flex-col gap-1.5">
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); e.target.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadBusy || busy}
              className="h-9 px-4 text-sm font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {uploadBusy ? "กำลังอัปโหลด..." : src ? "เปลี่ยนรูป" : "＋ อัปโหลดรูป"}
            </button>
            {src && <button type="button" onClick={() => setAvatar(null)} disabled={uploadBusy || busy}
              className="h-7 px-4 text-xs text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 text-left">ลบรูป</button>}
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">หรือวางลิงก์รูป (รองรับ GIF)</span>
          <input value={avatar?.startsWith("http") ? avatar : ""} disabled={busy || uploadBusy}
            onChange={(e) => setAvatar(e.target.value.trim() || null)} placeholder="https://…/avatar.gif"
            className="w-full h-9 mt-1 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60" />
          <span className="block text-[11px] text-slate-400 mt-0.5">วางลิงก์รูป/GIF จากเว็บ — เว้นว่างถ้าใช้รูปที่อัปโหลด</span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">ชื่อแสดงผล</span>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder={user.email.split("@")[0]}
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

      {/* เปลี่ยนรหัสผ่าน / PIN */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="text-sm font-semibold text-slate-800">{isPin ? "🔑 เปลี่ยน PIN" : "🔑 เปลี่ยนรหัสผ่าน"}</div>
        {pwErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {pwErr}</div>}
        {pwMsg && <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">✓ {pwMsg}</div>}
        <input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} disabled={pwBusy}
          inputMode={isPin ? "numeric" : "text"} placeholder={isPin ? "PIN ใหม่ (6 หลัก)" : "รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)"}
          className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60" />
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} disabled={pwBusy}
          inputMode={isPin ? "numeric" : "text"} placeholder={isPin ? "ยืนยัน PIN ใหม่" : "ยืนยันรหัสผ่านใหม่"}
          className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60" />
        <button onClick={changePassword} disabled={pwBusy || !pw1 || !pw2}
          className="w-full h-10 text-sm font-semibold bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50">
          {pwBusy ? "กำลังเปลี่ยน..." : (isPin ? "เปลี่ยน PIN" : "เปลี่ยนรหัสผ่าน")}
        </button>
      </div>
    </div>
  );
}
