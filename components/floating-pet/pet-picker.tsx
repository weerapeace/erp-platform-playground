"use client";
/**
 * หน้าต่างเลือกตัว Pet (ต่อคน) — ตัวในระบบ · คลัง GIF (คลังเดียวกับ "ส่ง GIF ให้เพื่อน") · ของฉัน (อัป GIF / Lottie .json หรือวางลิงก์)
 * เลือกแล้วใช้ทันที (บันทึกใน user_ui_prefs floating_pet — ตามไปทุกเครื่อง) · อัปไฟล์ ≤ 4MB ผ่าน /api/admin/upload (สิทธิ์อัปไฟล์)
 */
import { useEffect, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { UploadProgress } from "@/components/upload-progress";
import { apiFetch } from "@/lib/api";
import { avatarSrc } from "@/lib/r2-image";
import { BUILTIN_PETS, PET_PX, parsePetSource, type PetMood, type PetSize, type PetSource } from "@/lib/floating-pet";
import { PetArt, useFloatingPetPref } from "./index";
import { NotifySettings } from "@/components/notify-settings";
import { MyWatchesSettings } from "@/components/my-watches";

type LibGif = { id: string; gif_url: string | null; gif_key: string | null; title: string | null; category: string | null };
const MAX_UPLOAD = 4 * 1024 * 1024;   // เส้นทางอัปของระบบรับได้ราว 4.5MB ต่อครั้ง
const same = (a: PetSource, b: PetSource) => a.kind === b.kind && (a.kind === "builtin" ? a.id === (b as { id?: string }).id : a.src === (b as { src?: string }).src);

export function PetPickerModal({ open, onClose, initialTab = "pet" }: { open: boolean; onClose: () => void; initialTab?: "pet" | "notify" | "watches" }) {
  const [pref, setPref] = useFloatingPetPref();
  // แท็บ: ตัว Pet / การแจ้งเตือน (ตั้งว่าอยากให้เตือนเรื่องไหน แบบไหน — components/notify-settings)
  const [view, setView] = useState<"pet" | "notify" | "watches">(initialTab);
  const [lib, setLib] = useState<LibGif[] | null>(null);
  const [libErr, setLibErr] = useState(false);
  const [link, setLink] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [up, setUp] = useState<{ name: string; size: number } | null>(null);
  const [mood, setMood] = useState<PetMood>("idle");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || lib || view !== "pet") return;
    apiFetch("/api/gif-poke/library").then((r) => r.json()).then((j) => setLib(Array.isArray(j.data) ? j.data : [])).catch(() => setLibErr(true));
  }, [open, lib, view]);

  const pick = (source: PetSource) => { setErr(null); setPref({ ...pref, source }); };
  const setSize = (size: PetSize) => setPref({ ...pref, size });

  const upload = async (f: File) => {
    const isLottie = f.name.toLowerCase().endsWith(".json") || f.type === "application/json";
    if (!isLottie && f.type !== "image/gif" && !f.type.startsWith("image/")) { setErr("รองรับไฟล์ GIF / รูป / Lottie (.json) เท่านั้น"); return; }
    if (f.size > MAX_UPLOAD) { setErr("ไฟล์ใหญ่เกิน 4MB — ลองย่อไฟล์ หรือวางลิงก์แทน"); return; }
    setErr(null); setUp({ name: f.name, size: f.size });
    try {
      const fd = new FormData(); fd.append("file", f); fd.append("folder", "pets");
      const j = await apiFetch("/api/admin/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (j.error || !j.r2_key) throw new Error(j.error || "อัปโหลดไม่สำเร็จ");
      pick({ kind: isLottie ? "lottie" : "gif", src: String(j.r2_key), name: f.name.replace(/\.[^.]+$/, "").slice(0, 80) });
    } catch (e) { setErr((e as Error).message); }
    finally { setUp(null); }
  };
  const applyLink = () => {
    const url = link.trim();
    const kind = /\.json(\?|#|$)/i.test(url) ? "lottie" : "gif";
    const src = parsePetSource({ kind, src: url });
    if (!src || !/^https:\/\//i.test(url)) { setErr("ลิงก์ต้องขึ้นต้นด้วย https:// (ไฟล์ .gif / รูป หรือ Lottie .json)"); return; }
    pick(src); setLink("");
  };

  const tile = (on: boolean) => `relative flex flex-col items-center justify-center gap-1 rounded-xl border p-2 text-[11px] transition-colors ${on ? "border-indigo-400 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200"}`;
  const anim = mood === "alert" ? "ov-pet-alert" : mood === "idle" ? "ov-pet-float" : "fpet-sleep";

  return (
    <ERPModal open={open} onClose={onClose} size="lg" defaultExpanded={false} title="ตัว Pet และการแจ้งเตือน" description="ตัวการ์ตูนลอยมุมจอ กดที่ตัวเพื่อเปิดศูนย์แจ้งเตือน · เลือกได้ว่าอยากให้เตือนเรื่องไหน แบบไหน (เฉพาะของคุณ)"
      footer={<div className="flex w-full justify-end"><button type="button" onClick={onClose} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700">เสร็จ</button></div>}>
      <div className="mb-3 flex gap-5 border-b border-slate-200 text-sm">
        {([["pet", "star", "ตัว Pet"], ["notify", "notify", "การแจ้งเตือน"], ["watches", "add", "การเตือนของฉัน"]] as const).map(([k, ic, l]) => (
          <button key={k} type="button" onClick={() => setView(k)} aria-pressed={view === k}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-2 ${view === k ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            <Icon name={ic} /> {l}
          </button>
        ))}
      </div>
      {view === "notify" ? <NotifySettings /> : view === "watches" ? <MyWatchesSettings /> : (
      <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
        {/* ตัวอย่าง */}
        <div className="flex flex-col items-center gap-2 rounded-xl bg-slate-50 p-3">
          <div className="flex h-[120px] items-end justify-center">
            <span className={`fpet block ${anim}`}><PetArt source={pref.source} size={PET_PX[pref.size]} /></span>
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-[11px]">
            {([["alert", "มีงานใหม่"], ["idle", "ปกติ"], ["sleep", "ว่าง"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMood(k)} className={`h-7 px-2 ${mood === k ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            ขนาด
            {(["s", "m", "l"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSize(s)} className={`h-7 w-8 rounded-md border ${pref.size === s ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 bg-white hover:bg-slate-50"}`}>{s === "s" ? "เล็ก" : s === "m" ? "กลาง" : "ใหญ่"}</button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <section>
            <h3 className="mb-1.5 text-xs font-semibold text-slate-600">ตัวในระบบ</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {BUILTIN_PETS.map((p) => {
                const src: PetSource = { kind: "builtin", id: p.id };
                return <button key={p.id} type="button" onClick={() => pick(src)} className={tile(same(pref.source, src))}><PetArt source={src} size={52} />{p.th}</button>;
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-1.5 text-xs font-semibold text-slate-600">คลัง GIF <span className="font-normal text-slate-400">(คลังเดียวกับ "ส่ง GIF ให้เพื่อน")</span></h3>
            {libErr ? <p className="text-xs text-rose-600">โหลดคลัง GIF ไม่สำเร็จ</p>
              : !lib ? <p className="text-xs text-slate-400">กำลังโหลด…</p>
              : lib.length === 0 ? <p className="text-xs text-slate-400">ยังไม่มี GIF ในคลัง</p>
              : (
                <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
                  {lib.map((g) => {
                    const s = g.gif_url || g.gif_key; if (!s) return null;
                    const src: PetSource = { kind: "gif", src: s, name: g.title ?? undefined };
                    return (
                      <button key={g.id} type="button" onClick={() => pick(src)} title={g.title ?? ""} className={tile(same(pref.source, src))}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={avatarSrc(s) ?? ""} alt="" loading="lazy" className="h-14 w-14 object-contain" />
                        <span className="w-full truncate text-center">{g.title ?? "GIF"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
          </section>

          <section>
            <h3 className="mb-1.5 text-xs font-semibold text-slate-600">ของฉัน <span className="font-normal text-slate-400">(GIF หรือไฟล์ขยับได้ Lottie .json ไม่เกิน 4MB)</span></h3>
            <input ref={fileRef} type="file" accept="image/gif,image/png,image/webp,.json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
            {up ? <UploadProgress name={up.name} size={up.size} pct={null} /> : (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"><Icon name="upload" /> อัปโหลดไฟล์</button>
                <div className="flex min-w-[240px] flex-1 gap-1.5">
                  <input value={link} onChange={(e) => { setLink(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") applyLink(); }}
                    placeholder="https://… .gif หรือ .json" className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-xs" />
                  <button type="button" onClick={applyLink} disabled={!link.trim()} className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40">ใช้ลิงก์นี้</button>
                </div>
              </div>
            )}
            {(pref.source.kind === "gif" || pref.source.kind === "lottie") && !lib?.some((g) => (g.gif_url || g.gif_key) === (pref.source as { src: string }).src) && (
              <p className="mt-1.5 text-[11px] text-emerald-700">ใช้อยู่: {pref.source.name || (pref.source.kind === "lottie" ? "ไฟล์ Lottie ของคุณ" : "GIF ของคุณ")}</p>
            )}
            {err && <p className="mt-1.5 text-[11px] text-rose-600">{err}</p>}
          </section>
        </div>
      </div>
      )}
    </ERPModal>
  );
}
