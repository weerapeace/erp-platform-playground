"use client";

/**
 * 💳 SlipReviewBox — สลิปที่ลูกค้าแนบ (ในรายละเอียดออเดอร์ แท็บ 🧾 ออเดอร์ ของ /website/<slug>)
 *   ดูรูปสลิป (ลิงก์ชั่วคราว 15 นาที) · ผลตรวจอัตโนมัติ (EasySlip) · ยอด/วันเวลา/ผู้โอน/ผู้รับ/เลขอ้างอิงที่อ่านได้
 *   ✓ ยืนยันรับเงิน (ออเดอร์ → ชำระแล้ว) · ✕ สลิปไม่ถูกต้อง (ต้องเลือกเหตุผล — ลูกค้าเห็นในหน้าติดตามออเดอร์)
 * ของกลาง: ConfirmDialog · กติกา lib/website-payments · API PATCH /api/website/orders { slipId, slipAction, reason }
 */
import { useState } from "react";
import { ConfirmDialog } from "@/components/modal";

export type SlipView = {
  id: string;
  status: "pending" | "verified" | "rejected";
  autoResult: string | null;
  autoNote: string | null;
  transRef: string | null;
  slipAmount: number | null;
  slipDate: string | null;
  sender: string | null;
  receiver: string | null;
  uploadedAt: string | null;
  rejectReason: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  url: string | null;
};
export type SlipMeta = {
  statuses: Record<string, { label: string; tone: string }>;
  autoResults: Record<string, { th: string; tone: string }>;
  rejectReasons: { key: string; th: string }[];
};

const money = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("th-TH", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export function SlipReviewBox({
  slips,
  meta,
  orderTotal,
  busy,
  onDecide,
}: {
  slips: SlipView[];
  meta: SlipMeta;
  orderTotal: number;
  busy: boolean;
  onDecide: (slipId: string, action: "approve" | "reject", reason?: string) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState<{ slip: SlipView; action: "approve" | "reject" } | null>(null);
  const [reason, setReason] = useState("");

  if (!slips.length) return null;
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/30 p-3 space-y-2" data-slip-review>
      <h4 className="text-xs font-semibold text-slate-600">📎 สลิปที่ลูกค้าแนบ ({slips.length})</h4>
      <ul className="space-y-2">
        {slips.map((s) => {
          const st = meta.statuses[s.status] ?? { label: s.status, tone: "bg-slate-100 text-slate-600" };
          const ar = s.autoResult ? meta.autoResults[s.autoResult] : null;
          const amountOff = s.slipAmount != null && Math.abs(s.slipAmount - orderTotal) > 0.01;
          return (
            <li key={s.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-2.5">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer" title="เปิดรูปสลิปเต็ม" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.url} alt="สลิป" className="h-28 w-20 rounded-md border border-slate-200 bg-slate-50 object-contain" />
                </a>
              ) : (
                <div className="h-28 w-20 shrink-0 rounded-md border border-dashed border-slate-200 text-[10px] text-slate-400 flex items-center justify-center text-center">ดูรูปไม่ได้</div>
              )}
              <div className="min-w-0 flex-1 space-y-1 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.tone}`}>{st.label}</span>
                  {ar && <span className={`rounded px-1.5 py-0.5 text-[11px] ${ar.tone}`}>{ar.th}</span>}
                  <span className="ml-auto text-[11px] text-slate-400">แนบเมื่อ {when(s.uploadedAt)}</span>
                </div>
                {s.autoNote && <p className="text-[11px] text-slate-500">{s.autoNote}</p>}
                {(s.slipAmount != null || s.slipDate || s.sender || s.receiver || s.transRef) && (
                  <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-0.5 text-[11.5px]">
                    {s.slipAmount != null && (<><dt className="text-slate-400">ยอดในสลิป</dt><dd className={amountOff ? "font-semibold text-rose-600" : "font-semibold text-slate-800"}>{money(s.slipAmount)}{amountOff ? ` (ออเดอร์ ${money(orderTotal)})` : ""}</dd></>)}
                    {s.slipDate && (<><dt className="text-slate-400">โอนเมื่อ</dt><dd className="text-slate-700">{when(s.slipDate)}</dd></>)}
                    {s.sender && (<><dt className="text-slate-400">ผู้โอน</dt><dd className="text-slate-700">{s.sender}</dd></>)}
                    {s.receiver && (<><dt className="text-slate-400">ผู้รับ</dt><dd className="text-slate-700">{s.receiver}</dd></>)}
                    {s.transRef && (<><dt className="text-slate-400">เลขอ้างอิง</dt><dd className="font-mono text-[11px] text-slate-500">{s.transRef}</dd></>)}
                  </dl>
                )}
                {s.status === "rejected" && s.rejectReason && (
                  <p className="text-[11px] text-rose-700">เหตุผล: {meta.rejectReasons.find((r) => r.key === s.rejectReason)?.th ?? s.rejectReason}</p>
                )}
                {s.status !== "pending" && s.verifiedByName && <p className="text-[11px] text-slate-400">โดย {s.verifiedByName} · {when(s.verifiedAt)}</p>}
                {s.status === "pending" && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button type="button" disabled={busy} onClick={() => setConfirm({ slip: s, action: "approve" })}
                      className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
                      ✓ ยืนยันรับเงิน
                    </button>
                    <button type="button" disabled={busy} onClick={() => { setReason(""); setConfirm({ slip: s, action: "reject" }); }}
                      className="rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-40">
                      ✕ สลิปไม่ถูกต้อง
                    </button>
                    <span className="self-center text-[11px] text-slate-400">เช็กเงินเข้าในแอปธนาคารก่อนกดยืนยัน</span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        loading={busy}
        variant={confirm?.action === "reject" ? "danger" : "default"}
        title={confirm?.action === "approve" ? "ยืนยันว่าได้รับเงินแล้ว?" : "สลิปนี้ไม่ถูกต้อง?"}
        confirmText={confirm?.action === "approve" ? "ยืนยันรับเงิน" : "แจ้งลูกค้าว่าสลิปไม่ถูกต้อง"}
        message={
          confirm?.action === "approve" ? (
            <span>ออเดอร์จะเปลี่ยนเป็น <b>ชำระแล้ว</b> และลูกค้าเห็นทันทีในหน้าติดตามคำสั่งซื้อ (+ อีเมลแจ้ง ถ้าร้านเปิดไว้)</span>
          ) : (
            <span className="block space-y-2">
              <span className="block">ลูกค้าจะเห็นเหตุผลนี้ และแนบสลิปใหม่ได้ · ออเดอร์กลับเป็น "ยังไม่ชำระ" ถ้าไม่มีสลิปอื่นรอตรวจ</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
                <option value="">— เลือกเหตุผล —</option>
                {meta.rejectReasons.map((r) => <option key={r.key} value={r.key}>{r.th}</option>)}
              </select>
              {!reason && <span className="block text-xs text-rose-600">เลือกเหตุผลก่อน</span>}
            </span>
          )
        }
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.action === "reject" && !reason) return;
          void onDecide(confirm.slip.id, confirm.action, reason || undefined).then(() => setConfirm(null));
        }}
      />
    </section>
  );
}
