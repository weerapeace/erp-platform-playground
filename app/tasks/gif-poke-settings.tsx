"use client";

// ============================================================
// GifPokeSettings — ตั้งค่าการ "รับ" GIF ของตัวเอง (ทุกคน)
// ปิดรับทั้งหมด / เปิด-ปิดเสียง / บล็อกรับจากบางคน · เก็บใน user_ui_prefs key=gif_poke_mute
// ============================================================

import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { MultiUserPicker } from "./multi-user-picker";
import type { UserPickerValue } from "@/components/pickers";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";

type BlockedUser = { id: string; name?: string | null };
type MuteVal = { muted_all?: boolean; sound?: boolean; blocked?: BlockedUser[] };

export function GifPokeSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [mutedAll, setMutedAll] = useState(false);
  const [sound, setSound] = useState(true);
  const [blocked, setBlocked] = useState<UserPickerValue[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    apiFetch("/api/user-prefs?key=gif_poke_mute").then((r) => r.json()).then((j) => {
      const v = (j?.value ?? {}) as MuteVal;
      setMutedAll(!!v.muted_all); setSound(v.sound !== false);
      setBlocked(Array.isArray(v.blocked) ? v.blocked.filter((b) => b && b.id).map((b) => ({ id: b.id, code: null, name: b.name ?? "" })) : []);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [open]);

  // เซฟทันทีที่เปลี่ยน (หลังโหลดเสร็จ) — เหมือนแต่ง drawer
  useEffect(() => {
    if (!open || !loaded) return;
    const value: MuteVal = { muted_all: mutedAll, sound, blocked: blocked.map((b) => ({ id: b.id, name: b.name })) };
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "gif_poke_mute", value }) });
  }, [mutedAll, sound, blocked, open, loaded]);

  const Toggle = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button onClick={onClick} className={`relative w-11 h-6 rounded-full transition-colors ${on ? "bg-violet-600" : "bg-slate-300"}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
    </button>
  );

  return (
    <ERPModal open={open} onClose={onClose} size="md" title={t("⚙ ตั้งค่าการรับ GIF", "⚙ GIF settings")}
      description={t("ปรับว่าจะรับ GIF จากเพื่อนแบบไหน", "Control how you receive GIFs")}
      footer={<button onClick={onClose} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">{t("เสร็จ", "Done")}</button>}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-sm font-medium text-slate-800">{t("ปิดรับ GIF ทั้งหมด", "Mute all GIFs")}</p>
            <p className="text-xs text-slate-500">{t("จะไม่มี GIF วิ่งบนจอเลย", "No GIFs will appear")}</p></div>
          <Toggle on={mutedAll} onClick={() => setMutedAll((v) => !v)} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-sm font-medium text-slate-800">{t("เสียงเด้งตอนมี GIF ใหม่", "Sound on new GIF")}</p>
            <p className="text-xs text-slate-500">{t("เล่นเสียงป๊อปเบา ๆ", "Soft pop sound")}</p></div>
          <Toggle on={sound} onClick={() => setSound((v) => !v)} />
        </div>
        <div className={mutedAll ? "opacity-40 pointer-events-none" : ""}>
          <p className="text-sm font-medium text-slate-800 mb-1">{t("บล็อกรับจากบางคน", "Block from specific people")}</p>
          <p className="text-xs text-slate-500 mb-1.5">{t("คนที่เลือกจะส่ง GIF หาคุณไม่ได้", "Selected people can't send you GIFs")}</p>
          <MultiUserPicker value={blocked} onChange={setBlocked} disableCreate />
        </div>
      </div>
    </ERPModal>
  );
}
