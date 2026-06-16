"use client";

/**
 * AccountMenu (ของกลาง) — คลิกชื่อผู้ใช้ → popup จัดการบัญชี
 *  - แก้ไขโปรไฟล์ (ลิงก์ /profile) · เปลี่ยนสีธีม (accent) · เปลี่ยนรหัสผ่าน · ออกจากระบบ
 *  - ฝัง <ThemeSync/> ให้สีธีมโหลด/บันทึกอัตโนมัติ
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, roleLabel } from "@/components/auth";
import { ThemeSync } from "@/components/theme-sync";
import { getTheme, setTheme } from "@/lib/theme";

const SWATCHES = ["#7c3aed", "#2563eb", "#0891b2", "#059669", "#ea580c", "#e11d48", "#475569"];

export function AccountMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState<string | null>(getTheme());
  if (!user) return null;

  const pick = (c: string | null) => { setTheme(c); setCur(getTheme()); };
  const avatar = user.avatar ? (user.avatar.startsWith("http") ? user.avatar : `/api/r2-image?key=${encodeURIComponent(user.avatar)}`) : null;

  return (
    <div className="relative">
      <ThemeSync />
      <button onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-9 pl-1.5 pr-2 rounded-lg hover:bg-slate-50 transition-colors">
        {avatar
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={avatar} alt="" className="w-7 h-7 rounded-full object-cover border border-slate-200" />
          : <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-semibold">{(user.name || user.email).charAt(0).toUpperCase()}</span>}
        <span className="leading-tight text-right hidden sm:block">
          <span className="block text-xs font-medium text-slate-700 truncate max-w-[120px]">{user.name}</span>
          <span className="block text-[10px] text-slate-400">{roleLabel(user.role)}</span>
        </span>
        <span className="text-slate-400 text-xs">⋯</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1">
            <div className="px-3 py-2 border-b border-slate-100 text-xs text-slate-500 truncate">{user.email}</div>
            <button type="button" onClick={() => { setOpen(false); router.push("/profile"); }}
              className="block w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">👤 โปรไฟล์ของฉัน (แก้ชื่อ/รูป)</button>

            {/* สีธีม (accent) */}
            <div className="px-3 py-2 border-t border-slate-100">
              <div className="text-[11px] text-slate-500 mb-1.5">🎨 สีธีม (ส่วนตัว)</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" onClick={() => pick(c)} title={c}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-full border-2 ${cur === c ? "border-slate-700" : "border-white shadow-sm"}`} />
                ))}
                <label title="เลือกสีอื่น"
                  className="w-6 h-6 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-[11px] cursor-pointer hover:border-slate-400">
                  ＋<input type="color" className="sr-only" onChange={(e) => pick(e.target.value)} />
                </label>
                <button type="button" onClick={() => pick(null)} className="ml-1 text-[10px] text-slate-400 hover:text-slate-600">รีเซ็ต</button>
              </div>
            </div>

            <button type="button" onClick={() => { setOpen(false); router.push("/profile"); }}
              className="block w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 border-t border-slate-100">🔑 เปลี่ยนรหัสผ่าน/PIN</button>
            <button onClick={async () => { setOpen(false); await logout(); router.push("/login"); }}
              className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-t border-slate-100">ออกจากระบบ</button>
          </div>
        </>
      )}
    </div>
  );
}
