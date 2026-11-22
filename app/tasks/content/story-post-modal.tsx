"use client";

// ============================================================
// 📲 ลง Story (Facebook + Instagram) — ปุ่มในลิ้นชักคอนเทนต์ (เจ้าของขอ 2026-11-20)
//   ลง Story "เพิ่ม" จากโพสต์ปกติ: เลือกรูป/คลิป 1 ไฟล์ + ติ๊ก FB / IG → ลงทันที (Story ตั้งเวลาไม่ได้)
//   ผลเก็บแยกที่ post_status["facebook_story" / "instagram_story"] → ไม่ทับสถานะโพสต์ปกติ
//   ตัวยิงจริง = ของกลาง lib/social-publish/meta (format "story") ผ่าน publishToPlatform
//   ⚠ ลงแล้วดึงกลับจากระบบไม่ได้ (ลบได้ในแอป FB/IG เท่านั้น) → ป๊อปนี้คือหน้ายืนยัน
// ============================================================
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { r2ImageUrl } from "@/lib/r2-image";
import { publishToPlatform } from "../data";
import type { PostImage } from "./post-confirm-modal";
import { Icon } from "@/components/icon";

type Plat = "facebook" | "instagram";
const LABEL: Record<Plat, string> = { facebook: "Facebook", instagram: "Instagram" };

export function StoryPostModal({ open, contentId, media, canPost, storyStatus, onClose, onDone, pushToast }: {
  open: boolean;
  contentId: string;
  media: PostImage[];
  canPost: Record<Plat, boolean>;             // เชื่อมบัญชีแล้ว + ใช้ได้
  storyStatus: Record<string, string>;        // post_status ทั้งก้อน (ดู facebook_story / instagram_story)
  onClose: () => void;
  onDone: () => void;
  pushToast: (kind: "success" | "error" | "info", msg: string) => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [plats, setPlats] = useState<Record<Plat, boolean>>({ facebook: true, instagram: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setPick(media[0]?.key ?? null); setErr(null);
    setPlats({ facebook: canPost.facebook, instagram: canPost.instagram });
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = (Object.keys(plats) as Plat[]).filter((p) => plats[p] && canPost[p]);
  const m = media.find((x) => x.key === pick) ?? null;

  const submit = async () => {
    if (!m) { setErr("เลือกรูปหรือคลิปที่จะลง Story ก่อน"); return; }
    if (!chosen.length) { setErr("ติ๊กอย่างน้อย 1 แพลตฟอร์ม"); return; }
    setBusy(true); setErr(null);
    const ok: string[] = [], fail: string[] = [];
    for (const p of chosen) {
      try {
        // ต้นฉบับบน Drive (ถ้ามี) ชัดกว่า · รูปย่อในระบบเป็นตัวสำรอง
        await publishToPlatform(contentId, p, "", [{ key: m.original ?? m.key, type: m.type ?? "image", fallback: m.original ? m.key : null }], 0, "story", { extraStory: true });
        ok.push(LABEL[p]);
      } catch (e) { fail.push(`${LABEL[p]}: ${(e as Error).message}`); }
    }
    setBusy(false);
    if (ok.length) pushToast("success", `ลง Story แล้ว: ${ok.join(" + ")}`);
    if (fail.length) { setErr(fail.join(" · ")); onDone(); return; }
    onDone(); onClose();
  };

  return (
    <ERPModal open={open} onClose={onClose} size="md" title="ลง Story" closeOnBackdrop={!busy}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ยกเลิก</button>
        <button type="button" onClick={() => void submit()} disabled={busy} className="h-9 rounded-lg bg-pink-600 px-4 text-sm font-medium text-white hover:bg-pink-700 disabled:opacity-50">
          {busy ? "กำลังลง…" : `ลง Story ${chosen.map((p) => LABEL[p]).join(" + ") || ""}`}
        </button>
      </>}>
      <div className="space-y-3 text-sm">
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">เลือกรูป / คลิป 1 ไฟล์ <span className="font-normal text-slate-400">(แนวตั้ง 9:16 สวยสุด · Story ไม่โชว์แคปชั่น ใส่ข้อความในรูปแทน)</span></div>
          {media.length === 0 ? (
            <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-4 text-center text-xs text-amber-700">ยังไม่มีรูปหรือคลิปในโพสต์นี้ — เพิ่มที่การ์ด "รูป/วิดีโอ" ก่อน</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {media.map((x) => {
                const src = x.src ?? (x.key.startsWith("drive:") ? null : r2ImageUrl(x.key, 200));
                return (
                  <button key={x.key} type="button" onClick={() => setPick(x.key)} title={x.label ?? ""}
                    className={`relative aspect-[9/16] overflow-hidden rounded-lg border-2 bg-slate-100 ${pick === x.key ? "border-pink-500" : "border-transparent hover:border-slate-300"}`}>
                    {src && x.type !== "video"
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={src} alt="" className="h-full w-full object-cover" />
                      : <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">{x.type === "video" ? <><Icon value="i:movie" className="mr-1" />คลิป</> : "Drive"}</span>}
                    {pick === x.key && <span className="absolute right-1 top-1 h-5 w-5 rounded-full bg-pink-600 text-center text-xs leading-5 text-white">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          {(Object.keys(LABEL) as Plat[]).map((p) => (
            <label key={p} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${canPost[p] ? "border-slate-200" : "border-slate-100 bg-slate-50 text-slate-400"}`}>
              <input type="checkbox" checked={plats[p] && canPost[p]} disabled={!canPost[p] || busy} onChange={(e) => setPlats((s) => ({ ...s, [p]: e.target.checked }))} />
              <span className="font-medium">{LABEL[p]} Story</span>
              {storyStatus[`${p}_story`] === "posted" && <span className="rounded-full bg-emerald-100 px-2 py-px text-[11px] text-emerald-700">เคยลง Story แล้ว</span>}
              {!canPost[p] && <span className="ml-auto text-[11px]">ยังไม่ได้เชื่อม{p === "instagram" ? " IG กับเพจ" : "เพจ"}ของแบรนด์นี้</span>}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">ลงทันที (Story ตั้งเวลาไม่ได้) · ลงแล้วระบบดึงกลับไม่ได้ ถ้าจะลบต้องลบในแอป Facebook / Instagram · Story อยู่ 24 ชม.</p>
        {err && <p className="text-sm text-rose-600">{err}</p>}
      </div>
    </ERPModal>
  );
}
