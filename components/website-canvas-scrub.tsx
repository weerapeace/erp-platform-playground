"use client";

/**
 * 🎞 ปุ่ม "เตรียมคลิปให้เลื่อนลื่น" — ชิ้นวิดีโอที่ตั้ง "คลิปเล่นตามการเลื่อน" ในฉากค้าง (แผงขวาของหน้าแก้ผืนเต็มจอ)
 * แปลงคลิปเป็นภาพทีละเฟรม (lib/website-scrub-frames) แล้วใส่ช่อง scrubKey/scrubCount/scrubExt ให้ชิ้น
 * ทำแล้วเปลี่ยนคลิป = ต้องกดเตรียมใหม่ (ระบบเตือนเองถ้าคลิปไม่ตรงชุดที่เตรียม)
 */
import { useRef, useState } from "react";
import { buildScrubFrames } from "@/lib/website-scrub-frames";

export function CanvasScrubPrep({ item, onPatch }: { item: Record<string, unknown>; onPatch: (p: Record<string, unknown>) => void }) {
  const [busy, setBusy] = useState<null | { stage: "read" | "upload"; done: number; total: number }>(null);
  const [err, setErr] = useState("");
  const abort = useRef<AbortController | null>(null);
  const videoKey = String(item.videoKey ?? "");
  const count = Number(item.scrubCount) || 0;
  const ready = !!item.scrubKey && count > 1;
  // เตรียมไว้กับคลิปไหน (เปลี่ยนคลิปแล้วต้องเตรียมใหม่)
  const stale = ready && String(item.scrubFor ?? "") !== "" && item.scrubFor !== videoKey;

  const run = async () => {
    if (!videoKey) return;
    setErr("");
    const ac = new AbortController();
    abort.current = ac;
    setBusy({ stage: "read", done: 0, total: 0 });
    try {
      const r = await buildScrubFrames(videoKey, (stage, done, total) => setBusy({ stage, done, total }), { signal: ac.signal });
      onPatch({ scrubKey: r.key, scrubCount: r.count, scrubExt: r.ext, scrubFor: videoKey });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เตรียมคลิปไม่สำเร็จ");
    } finally {
      setBusy(null);
      abort.current = null;
    }
  };

  if (!videoKey) return <p className="text-[10px] text-slate-500">ใส่คลิปก่อน แล้วค่อยกดเตรียมให้เลื่อนลื่น</p>;
  return (
    <div className="space-y-1.5">
      {busy ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-violet-800">
            <span>{busy.stage === "read" ? "กำลังดึงภาพทีละเฟรม" : "กำลังอัปขึ้นเว็บ"}…</span>
            <span className="tabular-nums">
              {busy.done}/{busy.total || "?"}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-violet-100 overflow-hidden">
            <div className="h-full bg-violet-500 transition-[width]" style={{ width: `${busy.total ? (busy.done / busy.total) * 100 : 3}%` }} />
          </div>
          <button onClick={() => abort.current?.abort()} className="text-[11px] text-slate-500 hover:text-red-600">
            ยกเลิก
          </button>
        </div>
      ) : (
        <button onClick={run} className="w-full rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs text-violet-700 hover:bg-violet-100">
          🎞 {ready ? "เตรียมใหม่" : "เตรียมคลิปให้เลื่อนลื่น"}
        </button>
      )}
      {ready && !busy && <p className={`text-[10px] ${stale ? "text-amber-700" : "text-emerald-700"}`}>{stale ? "⚠️ เปลี่ยนคลิปแล้ว — กดเตรียมใหม่" : `✓ เตรียมแล้ว ${count} เฟรม — มือถือเลื่อนลื่น`}</p>}
      {!ready && !busy && <p className="text-[10px] text-slate-500">แปลงคลิปเป็นภาพทีละเฟรม (แบบเว็บ Apple) ใช้เวลาไม่กี่วินาที–1 นาที · ไม่เตรียม = เลื่อนเวลาคลิปตรง ๆ (มือถือบางรุ่นกระตุก)</p>}
      {err && <p className="text-[10px] text-red-600">{err}</p>}
    </div>
  );
}
