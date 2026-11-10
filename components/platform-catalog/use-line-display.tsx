"use client";
/**
 * เปิด/ปิดขายสินค้าบน LINE (ใช้ร่วม: แท็บจับคู่ · มุมมองหน้าร้าน · ลิ้นชักสินค้าบนร้าน)
 *
 *   const disp = useLineDisplay((results) => …อัปเดตหน้า…);
 *   disp.request(["listingId"], "hide", ["WHB08"])   // เด้งถามก่อน → ส่งขึ้นร้านจริง
 *   {disp.dialog}
 *
 * ส่งขึ้นร้านจริงทุกครั้ง → ถามก่อนเสมอ · เกิน 20 รายการต้องพิมพ์ "ยืนยัน" · ส่งทีละ 200 · มีประวัติ (audit) ฝั่ง API
 * API: POST /api/line-shopping/listing-display (products.platforms.publish)
 */
import { useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";

export type LineDisplayResult = { listing_id: string; ok: boolean; display: boolean | null; error?: string };
const TYPED_OVER = 20;
const CHUNK = 200;

export function useLineDisplay(onDone: (results: LineDisplayResult[]) => void): {
  request: (ids: string[], status: "onsale" | "hide", names?: string[]) => void;
  dialog: ReactNode;
  busy: boolean;
} {
  const toast = useToast();
  const [ask, setAsk] = useState<{ ids: string[]; status: "onsale" | "hide"; names: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!ask) return;
    setBusy(true);
    const all: LineDisplayResult[] = [];
    try {
      for (let i = 0; i < ask.ids.length; i += CHUNK) {
        const r = await apiFetch("/api/line-shopping/listing-display", { method: "POST", body: JSON.stringify({ listing_ids: ask.ids.slice(i, i + CHUNK), status: ask.status }) });
        const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        if (!Array.isArray(j.results)) throw new Error(j.error || `HTTP ${r.status}`);
        all.push(...(j.results as LineDisplayResult[]));
      }
      const ok = all.filter((x) => x.ok).length;
      const verb = ask.status === "onsale" ? "เปิดขาย" : "ปิดขาย";
      const fails = all.filter((x) => !x.ok);
      if (fails.length === 0) toast.success(`${verb}บน LINE แล้ว ${ok.toLocaleString()} รายการ`);
      else toast.error(`${verb}สำเร็จ ${ok.toLocaleString()} · ไม่สำเร็จ ${fails.length.toLocaleString()} — ${fails[0].error ?? ""}`);
      setAsk(null);
    } catch (e) {
      toast.error(`ส่งไป LINE ไม่สำเร็จ${all.length ? ` (ทำไปแล้ว ${all.filter((x) => x.ok).length})` : ""}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (all.length) onDone(all);
    }
  };

  const n = ask?.ids.length ?? 0;
  const verb = ask?.status === "onsale" ? "เปิดขาย" : "ปิดขาย";
  const dialog = (
    <ConfirmDialog
      open={!!ask} onClose={() => { if (!busy) setAsk(null); }} onConfirm={() => void run()} loading={busy}
      title={`${verb} ${n.toLocaleString()} รายการบน LINE?`}
      confirmText={`${verb} ${n.toLocaleString()} รายการ`}
      requireTyped={n > TYPED_OVER ? "ยืนยัน" : undefined}
      variant={ask?.status === "hide" ? "danger" : undefined}
      message={(
        <div className="space-y-2 text-sm">
          <p>{ask?.status === "hide" ? "ลูกค้าจะมองไม่เห็นและสั่งซื้อไม่ได้ทันที" : "ลูกค้าจะเห็นและสั่งซื้อได้ทันที (ถ้ามีสต๊อก)"} — ส่งขึ้นร้าน LINE จริง · มีประวัติว่าใครกด</p>
          {!!ask?.names.length && (
            <ul className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-0.5">
              {ask.names.slice(0, 8).map((x, i) => <li key={i} className="truncate">{x}</li>)}
              {ask.names.length > 8 && <li className="text-slate-400">… และอีก {(ask.names.length - 8).toLocaleString()} รายการ</li>}
            </ul>
          )}
        </div>
      )}
    />
  );
  return { request: (ids, status, names = []) => { if (ids.length) setAsk({ ids, status, names }); }, dialog, busy };
}
