"use client";

/**
 * หน้ารวมโมดูลเป็นแท็บเดียว (Module Group) — /master/group/<ชื่อกลุ่ม>
 *
 * รวมทุกโมดูลที่ตั้ง "กลุ่ม (group_label)" ตรงกัน มาแสดงเป็นแท็บในหน้าเดียว
 * (เหมือน "ข้อมูลตั้งต้น" แต่ไม่ฮาร์ดโค้ด — ตั้งกลุ่มได้เองที่หน้าตั้งค่าโมดูล)
 * ใช้ของกลาง MasterPage ทุกแท็บ + จำแท็บผ่าน ?tab=
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ShellPresentContext } from "@/components/playground-shell";
import { MasterPage } from "@/components/master-page";
import { apiFetch } from "@/lib/api";

type Mod = { key: string; label: string; group_label: string | null; icon: string | null };

export default function ModuleGroupPage() {
  const groupParam = decodeURIComponent(String(useParams().group ?? ""));
  const [mods, setMods] = useState<Mod[] | null>(null);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    apiFetch("/api/admin/modules").then((r) => r.json()).then((j) => {
      const all = ((j.data ?? []) as Mod[]).filter((m) => (m.group_label ?? "") === groupParam);
      setMods(all);
    }).catch(() => setMods([]));
  }, [groupParam]);

  // จำแท็บผ่าน URL (?tab=) — กดเข้าตั้งค่าฟิลด์แล้วย้อนกลับไม่เด้งแท็บแรก
  useEffect(() => {
    if (!mods || mods.length === 0) return;
    let initial = mods[0].key;
    if (typeof window !== "undefined") {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t && mods.some((m) => m.key === t)) initial = t;
    }
    setActive(initial);
  }, [mods]);

  const selectTab = (k: string) => {
    setActive(k);
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", k);
      window.history.replaceState(null, "", u.toString());
    }
  };

  const cur = useMemo(() => mods?.find((m) => m.key === active) ?? mods?.[0], [mods, active]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 pt-4">
        <h1 className="text-xl font-bold text-slate-900">🗂️ {groupParam || "กลุ่มโมดูล"}</h1>
        <p className="text-sm text-slate-500 mt-0.5">รวมหลายตารางไว้ในหน้าเดียว — เลือกแท็บด้านล่าง</p>
        <div className="flex gap-1 mt-3 -mb-px overflow-x-auto">
          {(mods ?? []).map((m) => (
            <button key={m.key} onClick={() => selectTab(m.key)}
              className={`h-10 px-4 text-sm whitespace-nowrap border-b-2 transition-colors ${
                active === m.key ? "border-blue-600 text-blue-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}>
              {m.icon ? `${m.icon} ` : ""}{m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1">
        {mods === null ? (
          <div className="text-sm text-slate-400 py-16 text-center">กำลังโหลด…</div>
        ) : mods.length === 0 ? (
          <div className="text-sm text-slate-400 py-16 text-center">
            ยังไม่มีโมดูลในกลุ่ม “{groupParam}”<br />
            <span className="text-xs">ไปที่ตั้งค่าโมดูล → ใส่ชื่อกลุ่มนี้ในช่อง “กลุ่ม”</span>
          </div>
        ) : cur ? (
          <ShellPresentContext.Provider value={true}>
            <MasterPage key={cur.key} apiPath={cur.key} moduleKey={cur.key} title={cur.label} icon={cur.icon ?? undefined} />
          </ShellPresentContext.Provider>
        ) : null}
      </div>
    </div>
  );
}
