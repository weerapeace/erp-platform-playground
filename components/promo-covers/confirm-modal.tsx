"use client";
/**
 * 🖼 หน้ายืนยันก่อนตั้งเวลาส่งปกโปรขึ้นร้านจริง — ดูปกก่อน/หลังรายรุ่น + จำนวนรายการต่อร้าน + เรื่องที่ต้องรู้ แล้วติ๊กยืนยัน
 *   รายการเยอะ (> 100) ต้องพิมพ์ "ยืนยัน" (กติกาแก้หลายรายการ CLAUDE.md §18)
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { PLATFORM_LABEL, REVIEW_PLATFORMS, thTime } from "@/lib/promo-cover";
import { confirmCampaign, imgUrl, previewCampaign, type Full, type Preview } from "./api";
import { Pill, Thumb } from "./parts";

export function ConfirmPromoModal({ open, full, preview: initial, onClose, onDone }: {
  open: boolean; full: Full; preview: Preview | null; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const c = full.campaign;
  const [pv, setPv] = useState<Preview | null>(initial);
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setAck(false); setTyped(""); setPv(initial);
    previewCampaign(c.id).then(setPv).catch((e) => toast.error((e as Error).message));
  }, [open, c.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const ready = pv?.targets.filter((t) => t.ready && full.items.find((i) => i.id === t.item_id)?.promo_key) ?? [];
  const byItem = useMemo(() => {
    const m = new Map<string, { platforms: Set<string>; shopCover: string | null }>();
    for (const t of ready) { const x = m.get(t.item_id) ?? { platforms: new Set<string>(), shopCover: null }; x.platforms.add(PLATFORM_LABEL[t.platform]); x.shopCover ??= t.before_cover_url; m.set(t.item_id, x); }
    return m;
  }, [ready]);   // eslint-disable-line react-hooks/exhaustive-deps
  const noImg = full.items.filter((i) => !i.promo_key);
  const big = ready.length > 100;
  const review = c.platforms.filter((p) => REVIEW_PLATFORMS.has(p as never));
  const canGo = !!pv && ready.length > 0 && ack && (!big || typed.trim() === "ยืนยัน") && !busy;

  const go = async () => {
    setBusy(true);
    try {
      const r = await confirmCampaign(c.id, { ack: true });
      toast.success(`ยืนยันแล้ว — ${r.created ?? 0} รายการ${c.starts_at && Date.parse(c.starts_at) > Date.now() ? ` จะส่งตอน ${thTime(c.starts_at)}` : " พร้อมส่ง (กด \"ทำเดี๋ยวนี้\" หรือรอตัวตั้งเวลา ≤ 15 นาที)"}`);
      onDone();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} size="xl" title={`ยืนยันเปลี่ยนปกโปร "${c.name}"`} description="ตรวจปกก่อน/หลัง แล้วติ๊กยืนยัน — ระบบจะเปลี่ยนรูปบนร้านจริงตอนถึงเวลา"
      footer={(
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700">ยกเลิก</button>
          <button type="button" disabled={!canGo} onClick={() => void go()} className="h-9 rounded-lg bg-sky-600 px-4 text-sm text-white disabled:opacity-50">{busy ? "กำลังยืนยัน…" : `ยืนยัน ${ready.length.toLocaleString()} รายการ`}</button>
        </div>
      )}>
      {!pv ? <p className="py-6 text-center text-sm text-slate-500">กำลังเช็กร้าน…</p> : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-[12px] text-slate-500">รุ่น</p><p className="text-lg font-medium">{full.items.length}</p></div>
            <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-[12px] text-slate-500">รายการที่จะเปลี่ยน</p><p className="text-lg font-medium">{ready.length.toLocaleString()}</p></div>
            <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-[12px] text-slate-500">เริ่ม</p><p className="text-[13px] font-medium">{c.starts_at ? thTime(c.starts_at) : "ทันทีที่ยืนยัน"}</p></div>
            <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-[12px] text-slate-500">จบ / ย้อนปกเดิม</p><p className="text-[13px] font-medium">{c.ends_at ? `${thTime(c.ends_at)}${c.auto_revert ? " (ย้อนเอง)" : ""}` : "กดย้อนเอง"}</p></div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {pv.summary.map((s) => <Pill key={s.platform} tone={s.ready ? (s.blocked.length ? "warn" : "ok") : "bad"}>{PLATFORM_LABEL[s.platform]} {s.ready}{s.blocked.length ? ` · ${s.blocked.join(", ")}` : ""}</Pill>)}
          </div>

          <ul className="list-disc space-y-1 pl-5 text-[13px] text-slate-600">
            <li>ปกโปรจะ <b className="font-medium">แทนที่รูปแรก</b> ของสินค้าบนร้าน รูปอื่นคงเดิม · ระบบจดปกเดิมไว้ + เก็บสำเนาไว้ในคลังรูปเรา</li>
            {review.length > 0 && <li>{review.map((p) => PLATFORM_LABEL[p as keyof typeof PLATFORM_LABEL]).join(" / ")} ต้องรอร้านตรวจรูป → ส่งก่อนเวลาเริ่ม {c.early_hours} ชม. (ระหว่างตรวจยังโชว์ปกเดิม)</li>}
            {c.auto_revert && c.ends_at && <li>ถึงเวลาจบ ระบบย้อนเป็นปกเดิมให้เอง — ถ้ามีคนเปลี่ยนปกเองระหว่างโปร ระบบจะไม่ทับ และแจ้งเตือนให้ดู</li>}
            {noImg.length > 0 && <li className="text-amber-700">ยังไม่มีปกโปร {noImg.length} รุ่น ({noImg.slice(0, 5).map((i) => i.code).join(", ")}{noImg.length > 5 ? "…" : ""}) — จะข้ามรุ่นนี้</li>}
            <li>ส่ง/ย้อนไม่ผ่าน → แจ้งกระดิ่ง · ดูผลรายร้านและกดลองใหม่ได้ในหน้านี้</li>
          </ul>

          <div>
            <p className="mb-2 text-[13px] font-medium text-slate-700">ปกก่อน → หลัง</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {full.items.filter((i) => i.promo_key).slice(0, 40).map((i) => {
                const x = byItem.get(i.id);
                return (
                  <div key={i.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                    <Thumb src={x?.shopCover ?? imgUrl(i.cover_key, 160)} label="ปกเดิม" />
                    <span className="text-slate-400">→</span>
                    <Thumb src={imgUrl(i.promo_key, 160)} accent />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{i.code}</p>
                      <p className="text-[11px] text-slate-500">{x ? [...x.platforms].join(", ") : <span className="text-amber-700">ไม่มีร้านที่ส่งได้</span>}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {full.items.filter((i) => i.promo_key).length > 40 && <p className="mt-1 text-[12px] text-slate-500">…และอีก {full.items.filter((i) => i.promo_key).length - 40} รุ่น</p>}
          </div>

          <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-[13px] text-amber-900">
            <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            เข้าใจแล้วว่าจะเปลี่ยนรูปปกบนร้านจริง {ready.length.toLocaleString()} รายการ ตามเวลาที่ตั้ง
          </label>
          {big && (
            <div>
              <p className="mb-1 text-[12px] text-slate-600">รายการเยอะ — พิมพ์คำว่า <b className="font-medium">ยืนยัน</b> เพื่อไปต่อ</p>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} className="h-9 w-40 rounded-lg border border-slate-300 px-2 text-sm" placeholder="ยืนยัน" />
            </div>
          )}
        </div>
      )}
    </ERPModal>
  );
}
