"use client";
/**
 * 🎨 ตัวอย่าง (playground) แต่งหน้าแรก /apps — ชั้นพื้นหลัง + ของตกแต่ง + แผงแต่ง
 * ค่าอยู่ในหน้านี้อย่างเดียว ไม่แตะข้อมูลจริง · ของจริงอยู่ที่ app/apps/page.tsx
 * ดูในเครื่อง: ก๊อปไป app/zz-launcher-theme-preview/ ชั่วคราว (โฟลเดอร์ _demos ไม่เป็นหน้าเว็บ) · รูปตัวอย่างต้องมี .env.local (R2)
 */
import { useState } from "react";
import { LauncherBackdrop } from "@/components/launcher-theme/backdrop";
import { LauncherThemePanel } from "@/components/launcher-theme/panel";
import { DEFAULT_LAUNCHER_THEME, fontCssOf, pageBgStyle, resolveLauncherTheme, type LauncherDecor, type LauncherTheme } from "@/lib/launcher-theme";

const SAMPLE: LauncherTheme = {
  ...DEFAULT_LAUNCHER_THEME,
  bgImage: "launcher-bg/b1fc3a72-8100-4648-bdd4-d590706d94d1/1793331968013-61982.jpg",
  bgOpacity: 45,
  bgPos: "right top",
  decor: [
    { id: "a", key: "overview-theme/56da41c8-92bb-410b-96c2-a74cd4899d2a/1783070937324-73428.gif", x: 88, y: 24, w: 7, rotate: 0, opacity: 100, anim: "float", front: false, mobile: false },
    { id: "b", key: "library/1793092328916-7dp35d.png", x: 9, y: 78, w: 9, rotate: -10, opacity: 90, anim: "sway", front: true, mobile: false },
  ],
};

export default function LauncherThemePreview() {
  const [mine, setMine] = useState<LauncherTheme>(SAMPLE);
  const [open, setOpen] = useState(true);
  const [sel, setSel] = useState<string | null>("a");
  const theme = resolveLauncherTheme(null, mine);
  const patch = (p: Partial<LauncherTheme>) => setMine((m) => ({ ...m, ...p }));
  const move = (id: string, xy: Pick<LauncherDecor, "x" | "y">) => setMine((m) => ({ ...m, decor: (m.decor ?? []).map((d) => (d.id === id ? { ...d, ...xy } : d)) }));
  const font = fontCssOf(theme);
  return (
    <div className="relative isolate min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30" style={{ ...pageBgStyle(theme), ...(font ? { fontFamily: font } : {}) }}>
      <LauncherBackdrop theme={theme} editing={open} selectedId={sel} onSelect={setSel} onChange={move} />
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-6 text-sm font-bold text-slate-900">ERP Platform · ตัวอย่างแต่งหน้าแรก</div>
      </header>
      <section className="mx-auto max-w-7xl px-6 pt-12 text-center">
        <h1 className="text-3xl font-bold text-slate-900" style={theme.accent ? { color: theme.accent } : undefined}>สวัสดีตอนเช้า</h1>
        <p className="mt-1 text-slate-500">ตัวอย่างหน้าแรก — ลากของตกแต่งได้ตอนเปิดแผง</p>
      </section>
      <main className="mx-auto max-w-7xl px-6 pb-16">
        <div className="mb-4 flex justify-end">
          <div className="relative">
            <button type="button" onClick={() => setOpen((o) => !o)} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">แต่งหน้าแรก</button>
            {open && (
              <LauncherThemePanel value={theme} onPatch={patch} onReset={() => setMine({ ...DEFAULT_LAUNCHER_THEME })} onClose={() => setOpen(false)}
                scope="mine" onScope={() => {}} canTeam={false} ownBg ownDecor onUseTeam={() => {}}
                teamDirty={false} savingTeam={false} onSaveTeam={() => {}} onCancelTeam={() => {}} selectedId={sel} onSelect={setSel} />
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {["จัดการงาน", "จัดซื้อ", "ผลิต", "เว็บไซต์", "ขาย", "บัญชี", "คลังสินค้า", "ตั้งค่า"].map((n) => (
            <div key={n} className="flex h-28 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm">{n}</div>
          ))}
        </div>
      </main>
    </div>
  );
}
