"use client";

// การ์ด "พื้นที่ที่ใช้ใน R2" — ตัวเลขจริงจากบัคเก็ต (นับด้วย ListObjectsV2 ฝั่ง server)
// โชว์ผลที่นับไว้ล่าสุด (เร็ว) + ปุ่มนับใหม่ (งานหนัก → วิ่งเบื้องหลังผ่าน runBackgroundTask)
// แยกยอดตามโฟลเดอร์ชั้นแรก → เห็นว่าอะไรกินพื้นที่

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatBytes } from "@/lib/assets";
import { useT } from "@/components/i18n";
import { runBackgroundTask } from "@/lib/background-tasks";

type Usage = {
  bucket: string;
  total_bytes: number;
  total_objects: number;
  folders: { prefix: string; bytes: number; count: number }[];
  computed_at: string;
  truncated: boolean;
};

// ชื่อโฟลเดอร์ให้อ่านง่าย (เท่าที่รู้จัก) — ที่เหลือโชว์ชื่อ prefix ตรง ๆ
const FOLDER_LABEL: Record<string, [string, string]> = {
  products: ["รูปสินค้า", "Product images"],
  "creative-tasks": ["ไฟล์แนบงาน", "Task attachments"],
  "parent-skus": ["รูปสินค้า (Parent)", "Parent SKU images"],
  artwork: ["Artwork", "Artwork"],
  avatars: ["รูปโปรไฟล์", "Avatars"],
  "app-icons": ["ไอคอนแอป", "App icons"],
  "platform-icons": ["ไอคอนแพลตฟอร์ม", "Platform icons"],
  trash: ["ถังขยะ", "Trash"],
  "(root)": ["ไม่อยู่โฟลเดอร์", "No folder"],
};

export function StorageCard({ canManage, pushToast }: { canManage: boolean; pushToast: (type: "success" | "error" | "info", m: string) => void }) {
  const t = useT();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);   // กางรายละเอียดรายโฟลเดอร์

  const load = useCallback(async () => {
    setLoading(true);
    try { const j = await apiFetch("/api/assets/storage").then((r) => r.json()); setUsage((j.data as Usage) ?? null); }
    catch { /* เงียบ — ไม่ให้พังหน้าคลัง */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const recount = () => {
    runBackgroundTask({
      label: t("นับพื้นที่ที่ใช้ใน R2", "Counting R2 storage"),
      run: async () => {
        const r = await apiFetch("/api/assets/storage?refresh=1");
        const j = await r.json();
        if (j.error) throw new Error(j.error);
        const u = j.data as Usage;
        setUsage(u);
        return { ok: u.total_objects, message: t(`นับเสร็จ — ใช้ไป ${formatBytes(u.total_bytes)} (${u.total_objects.toLocaleString()} ไฟล์)`, `Done — ${formatBytes(u.total_bytes)} used (${u.total_objects.toLocaleString()} files)`) };
      },
    });
    pushToast("info", t("กำลังนับพื้นที่เบื้องหลัง — ดูความคืบหน้าที่มุมขวาล่าง", "Counting in the background — see the corner for progress"));
  };

  if (loading) return null;

  const when = usage?.computed_at ? new Date(usage.computed_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : null;
  const label = (p: string) => { const m = FOLDER_LABEL[p]; return m ? t(m[0], m[1]) : p; };
  const max = usage?.folders?.[0]?.bytes || 1;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-400 text-[11px]">💾 {t("พื้นที่ที่ใช้ (R2)", "Storage used (R2)")}</span>
        {usage ? (
          <>
            <b className="text-slate-800">{formatBytes(usage.total_bytes)}</b>
            <span className="text-[11px] text-slate-400">· {usage.total_objects.toLocaleString()} {t("ไฟล์", "files")}</span>
            <button type="button" onClick={() => setOpen((s) => !s)} className="text-[11px] text-violet-600 hover:underline">{open ? t("ย่อ ▲", "Hide ▲") : t("ดูรายโฟลเดอร์ ▾", "By folder ▾")}</button>
            {when && <span className="text-[10px] text-slate-300">{t("นับเมื่อ", "as of")} {when}</span>}
          </>
        ) : (
          <span className="text-[11px] text-slate-400">{t("ยังไม่เคยนับ", "Not counted yet")}</span>
        )}
        {canManage && <button type="button" onClick={recount} className="ml-auto text-[11px] text-slate-500 hover:text-violet-700 border border-slate-200 rounded px-2 py-0.5">🔄 {t("นับใหม่", "Recount")}</button>}
      </div>
      {usage?.truncated && <p className="mt-1 text-[10px] text-amber-600">⚠ {t("ไฟล์เยอะมาก — ตัวเลขนี้ยังนับไม่ครบทั้งหมด", "Very many files — this total is not complete")}</p>}
      {open && usage && (
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {usage.folders.map((f) => (
            <div key={f.prefix} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-[11px] text-slate-600" title={f.prefix}>{label(f.prefix)}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400 rounded-full" style={{ width: `${Math.max(2, Math.round((f.bytes / max) * 100))}%` }} /></div>
              <span className="w-20 shrink-0 text-right text-[11px] font-medium text-slate-700">{formatBytes(f.bytes)}</span>
              <span className="w-16 shrink-0 text-right text-[10px] text-slate-400">{f.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
