"use client";
/**
 * 🖨 ลายรีดในออเดอร์เว็บ (แท็บออเดอร์ › รายละเอียด › รายการสินค้า)
 * ภาพจำลองบนรูปสินค้า + ตารางขนาด/ระยะ ซม. (วัดจากขอบส่วนพิมพ์) + ไฟล์ลูกค้า (ลิงก์ชั่วคราว) + ตรวจลาย อนุมัติ/ขอรูปใหม่/ปฏิเสธ
 * ข้อมูล: GET/PATCH /api/website/print-designs · ของกลาง: CopyButton · useToast
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { CopyButton } from "@/components/copy-button";
import type { PrintPlacement, PrintZone } from "@/lib/website-print-design";

type ZoneView = PrintZone & { imageUrl: string | null };
type PlacementView = PrintPlacement & {
  tier: "S" | "M" | "L";
  previewUrl: string | null;
  fileUrl: string | null;
  printFile: { assetTitle: string; hasPrintPng: boolean } | null;
  quality: { level: "ok" | "warn" | "bad"; dpi: number; goodCm: number } | null;
};
type Resp = {
  design: {
    id: string;
    code: string;
    method: string;
    extra: number;
    hasUpload: boolean;
    status: string;
    reviewStatus: "pending" | "approved" | "reupload" | "rejected" | null;
    reviewLabel: string | null;
    reviewNote: string | null;
    reviewedAt: string | null;
    orderRef: string | null;
    uploadsPurged: boolean;
  };
  zones: ZoneView[];
  placements: PlacementView[];
};

const REVIEW_TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-700",
  reupload: "bg-sky-100 text-sky-700",
  rejected: "bg-rose-100 text-rose-700",
};
const Q_TONE = { ok: "bg-emerald-50 text-emerald-700", warn: "bg-amber-50 text-amber-800", bad: "bg-rose-50 text-rose-700" } as const;
const Q_LABEL = { ok: "คมชัด", warn: "พอใช้", bad: "ไม่ชัด" } as const;
const REASONS = ["รูปไม่ชัด พิมพ์ออกมาจะแตก", "ลายติดลิขสิทธิ์ (ตัวการ์ตูน/โลโก้แบรนด์)", "รูปมีพื้นหลัง ขอไฟล์ PNG พื้นใส", "ลายเล็ก/บางเกินไป พิมพ์ไม่ติด"];
const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export function PrintDesignOrderPanel({ shopSlug, designId, onChanged }: { shopSlug: string; designId: string; onChanged?: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState<"reupload" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch(`/api/website/print-designs?shop=${encodeURIComponent(shopSlug)}&id=${encodeURIComponent(designId)}`).then((r) => r.json());
      if (j.error) setErr(j.error);
      else setData(j as Resp);
    } catch {
      setErr("โหลดลายไม่สำเร็จ");
    }
  }, [shopSlug, designId]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: "approve" | "reupload" | "reject" | "pending") => {
    if ((action === "reupload" || action === "reject") && !note.trim()) {
      toast.error("ใส่เหตุผลให้ลูกค้าก่อน");
      return;
    }
    setBusy(true);
    try {
      const j = await apiFetch("/api/website/print-designs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop: shopSlug, id: designId, action, note: note.trim() }),
      }).then((r) => r.json());
      if (j.error) toast.error(j.error);
      else {
        toast.success(j.reviewLabel ?? "บันทึกแล้ว");
        setAsk(null);
        await load();
        onChanged?.();
      }
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  if (err) return <p className="mt-1 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700">🖨 {err}</p>;
  if (!data) return <p className="mt-1 text-xs text-slate-400">🖨 กำลังโหลดลาย…</p>;
  const d = data.design;
  const zoneOf = (id: string) => data.zones.find((z) => z.id === id);
  const groups = [...new Set(data.zones.map((z) => z.imageUrl ?? ""))];
  const msg =
    ask && note.trim()
      ? `ออเดอร์ ${d.orderRef ?? ""}: ร้าน${ask === "reject" ? "ขออภัย ไม่สามารถพิมพ์ลายนี้ได้" : "ขอรูปใหม่สำหรับลายรีด"} เพราะ${note.trim()}${ask === "reupload" ? " — ส่งรูปใหม่ทาง LINE หรืออีเมลของร้านได้เลยค่ะ" : " — ร้านจะคืนเงินส่วนนี้ให้ค่ะ"}`
      : "";

  return (
    <div className="mt-1.5 space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-violet-900">🖨 ลายรีด {d.method}</b>
        <span className="font-mono text-slate-600">{d.code}</span>
        {d.reviewStatus && <span className={`rounded-full px-2 py-0.5 ${REVIEW_TONE[d.reviewStatus]}`}>{d.reviewLabel}</span>}
        <span className="text-slate-500">{d.hasUpload ? "มีรูปลูกค้าอัปเอง" : "ลายจากคลังร้านทั้งหมด"}</span>
        {d.uploadsPurged && <span className="text-slate-400">· ลบรูปลูกค้าแล้ว (ครบวันเก็บ)</span>}
      </div>
      {d.reviewNote && <p className="text-slate-600">เหตุผล: {d.reviewNote}</p>}

      <div className="grid gap-2 sm:grid-cols-2">
        {groups.map((url) => (
          <div key={url} className="relative overflow-hidden rounded-md bg-white">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="block w-full" />
            ) : (
              <div className="aspect-square" />
            )}
            {data.zones
              .filter((z) => (z.imageUrl ?? "") === url)
              .map((z) => (
                <div key={z.id} className="absolute border border-dashed border-violet-500" style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%`, transform: z.rot ? `rotate(${z.rot}deg)` : undefined }}>
                  {data.placements.map((p, i) =>
                    p.zone !== z.id ? null : (
                      <div
                        key={i}
                        className="absolute"
                        style={{
                          left: `${(p.x / z.widthCm) * 100}%`,
                          top: `${(p.y / z.heightCm) * 100}%`,
                          width: `${(p.w / z.widthCm) * 100}%`,
                          height: `${(p.h / z.heightCm) * 100}%`,
                          transform: `translate(-50%, -50%) rotate(${p.rot}deg)`,
                        }}
                      >
                        {p.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.previewUrl} alt="" className="h-full w-full object-fill" />
                        ) : (
                          <div className="h-full w-full bg-violet-200/60" />
                        )}
                        <span className="absolute -left-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-violet-600 text-[9px] font-semibold text-white" style={{ transform: `rotate(${-p.rot}deg)` }}>
                          {i + 1}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full min-w-[620px] text-left">
          <thead className="bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th className="px-2 py-1">#</th>
              <th className="px-2 py-1">ลาย</th>
              <th className="px-2 py-1">ส่วน</th>
              <th className="px-2 py-1">ขนาด ซม.</th>
              <th className="px-2 py-1">กึ่งกลางห่างขอบซ้าย / บน</th>
              <th className="px-2 py-1">หมุน</th>
              <th className="px-2 py-1">ไฟล์</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.placements.map((p, i) => {
              const z = zoneOf(p.zone);
              return (
                <tr key={i}>
                  <td className="px-2 py-1 font-mono">{i + 1}</td>
                  <td className="px-2 py-1">
                    <span className="flex items-center gap-1.5">
                      {p.previewUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.previewUrl} alt="" className="h-7 w-7 rounded border border-slate-200 object-contain" />
                      )}
                      <span className="max-w-[10rem] truncate">{p.name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1">{z?.label ?? p.zone}</td>
                  <td className="px-2 py-1 font-mono">
                    {f1(p.w)} × {f1(p.h)} <span className="text-slate-400">({p.tier})</span>
                  </td>
                  <td className="px-2 py-1 font-mono">
                    {f1(p.x)} / {f1(p.y)}
                  </td>
                  <td className="px-2 py-1 font-mono">{p.rot}°</td>
                  <td className="px-2 py-1">
                    {p.kind === "upload" ? (
                      <span className="flex flex-wrap items-center gap-1">
                        {p.fileUrl ? (
                          <a href={p.fileUrl} target="_blank" rel="noopener" className="text-blue-700 hover:underline">
                            เปิดไฟล์ลูกค้า
                          </a>
                        ) : (
                          <span className="text-slate-400">ไม่มีไฟล์แล้ว</span>
                        )}
                        <span className="text-slate-400">{p.upload ? `${p.upload.w}×${p.upload.h}px${p.upload.alpha ? " · พื้นใส" : " · มีพื้นหลัง"}` : ""}</span>
                        {p.quality && <span className={`rounded px-1 ${Q_TONE[p.quality.level]}`}>{Q_LABEL[p.quality.level]} {p.quality.dpi} DPI</span>}
                      </span>
                    ) : (
                      <span className={p.printFile?.hasPrintPng ? "text-emerald-700" : "text-amber-700"}>
                        {p.printFile?.hasPrintPng ? "✓ ไฟล์พิมพ์ PNG ในคลัง" : "ยังไม่มีไฟล์พิมพ์ PNG ในคลัง"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">ระยะวัดจากขอบซ้าย/บนของ "ส่วนพิมพ์" ที่ตั้งไว้ในหลังบ้าน (กรอบเส้นประบนภาพ) · ไฟล์ลูกค้าเปิดได้ 15 นาที กดใหม่เพื่อขอลิงก์ใหม่</p>

      {d.status === "ordered" && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {d.reviewStatus !== "approved" && (
              <button type="button" disabled={busy} onClick={() => void act("approve")} className="rounded-md bg-emerald-600 px-2.5 py-1 text-white hover:bg-emerald-700 disabled:opacity-50">
                ✓ อนุมัติลาย
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => setAsk(ask === "reupload" ? null : "reupload")} className="rounded-md border border-sky-300 bg-white px-2.5 py-1 text-sky-700 hover:bg-sky-50">
              ขอรูปใหม่
            </button>
            <button type="button" disabled={busy} onClick={() => setAsk(ask === "reject" ? null : "reject")} className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-rose-700 hover:bg-rose-50">
              ปฏิเสธลาย
            </button>
            {d.reviewStatus && d.reviewStatus !== "pending" && (
              <button type="button" disabled={busy} onClick={() => void act("pending")} className="rounded-md px-2 py-1 text-slate-500 hover:text-slate-800">
                กลับเป็นรอตรวจ
              </button>
            )}
          </div>
          {ask && (
            <div className="space-y-1.5 rounded-md border border-slate-200 bg-white p-2">
              <div className="flex flex-wrap gap-1">
                {REASONS.map((r) => (
                  <button key={r} type="button" onClick={() => setNote(r)} className={`rounded-full border px-2 py-0.5 ${note === r ? "border-slate-700 bg-slate-800 text-white" : "border-slate-200 text-slate-600"}`}>
                    {r}
                  </button>
                ))}
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="เหตุผลที่ลูกค้าจะเห็น" className="h-8 w-full rounded-md border border-slate-300 px-2" />
              {msg && (
                <div className="flex items-start gap-2 rounded bg-slate-50 px-2 py-1 text-slate-600">
                  <span className="flex-1">ข้อความแจ้งลูกค้า: {msg}</span>
                  <CopyButton value={msg} title="คัดลอกข้อความแจ้งลูกค้า" />
                </div>
              )}
              <button type="button" disabled={busy || !note.trim()} onClick={() => void act(ask)} className={`rounded-md px-3 py-1 text-white disabled:opacity-50 ${ask === "reject" ? "bg-rose-600 hover:bg-rose-700" : "bg-sky-600 hover:bg-sky-700"}`}>
                {ask === "reject" ? "ยืนยันปฏิเสธลาย" : "ยืนยันขอรูปใหม่"}
              </button>
              <p className="text-[11px] text-slate-400">ระบบยังไม่ส่งข้อความหาลูกค้าเอง — คัดลอกข้อความด้านบนไปส่งทาง LINE/โทร · ปฏิเสธแล้วคืนเงินผ่านขั้นตอนเดิมของร้าน</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
