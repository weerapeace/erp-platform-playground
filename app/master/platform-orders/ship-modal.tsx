"use client";

// 🚚 จัดส่งผ่าน SHIPPOP — เทียบราคาทุกขนส่ง → เลือก → เรียกเข้ารับ → เลขพัสดุเติมลงออเดอร์ (ขั้น 1 = โหมดจำลอง ไม่เรียกขนส่งจริง)
// ข้อมูล/กติกา: /api/platform-orders/ship + lib/order-shipping · ออเดอร์แพลตฟอร์ม/จากเมล ระบบแยกออกพร้อมเหตุผล

import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPInput } from "@/components/form";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";

type Quote = { courierCode: string; courierName: string; price: number; available: boolean; estimate: string };
type QuoteRes = { mode: string; demo?: boolean; quotes: Quote[]; orders: { id: string; grams: number; missing: number; cod?: number }[]; blocked: { id: string; order_no: string; reason: string }[]; sender?: { name: string; province: string } };
const money = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

export function ShipModal({ ids, onClose, onBooked, onOpenSettings }: { ids: string[]; onClose: () => void; onBooked: () => void; onOpenSettings: () => void }) {
  const toast = useToast();
  const [res, setRes] = useState<QuoteRes | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<QuoteRes["blocked"]>([]);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState("");
  const [grams, setGrams] = useState("");
  const [box, setBox] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ done: number; failed: { order_no: string; error: string }[]; ids: string[] } | null>(null);
  const single = ids.length === 1;

  const quote = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const body: Record<string, unknown> = { action: "quote", ids };
      if (single && Number(grams) > 0) body.grams = Number(grams);
      if (single && box.trim()) body.box = box.trim();
      const j = await apiFetch("/api/platform-orders/ship", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
      if (j.error) { setErr(j.error); setBlocked(j.blocked ?? []); setRes(null); return; }
      setRes(j as QuoteRes); setBlocked(j.blocked ?? []);
      if (!grams && single && j.orders?.[0]) setGrams(String(j.orders[0].grams));
      setPick((p) => p || (j.quotes?.find((q: Quote) => q.available)?.courierCode ?? ""));
    } catch { setErr("ดูราคาไม่สำเร็จ กรุณาลองใหม่"); } finally { setLoading(false); }
  }, [ids, single, grams, box]);
  useEffect(() => { void quote(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- ดูราคาครั้งแรกตอนเปิด · เปลี่ยนน้ำหนัก/กล่องแล้วกด คำนวณใหม่

  const book = async () => {
    if (!pick) { setErr("เลือกขนส่งก่อน"); return; }
    setBusy(true); setErr(null);
    try {
      const shipIds = res?.orders.map((o) => o.id) ?? ids;
      const body: Record<string, unknown> = { action: "book", ids: shipIds, courier: pick };
      if (single && Number(grams) > 0) body.grams = Number(grams);
      if (single && box.trim()) body.box = box.trim();
      const j = await apiFetch("/api/platform-orders/ship", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
      if (j.error) { setErr(j.error); return; }
      setDone({ done: j.done ?? 0, failed: j.failed ?? [], ids: shipIds });
      if (j.done) toast.success(j.demo ? "โหมดทดลอง — แสดงผลตัวอย่าง ไม่ได้จองจริง" : `จองแล้ว ${j.done} ออเดอร์ (จำลอง — ยังไม่เรียกขนส่งจริง)`);
      onBooked();
    } catch { setErr("จองไม่สำเร็จ กรุณาลองใหม่"); } finally { setBusy(false); }
  };

  const shippable = res?.orders ?? [];
  const totalG = shippable.reduce((a, o) => a + o.grams, 0);
  const missing = shippable.reduce((a, o) => a + o.missing, 0);
  const cod = shippable.reduce((a, o) => a + (o.cod ?? 0), 0);
  const avail = (res?.quotes ?? []).filter((q) => q.available);
  const cheapest = avail.length ? Math.min(...avail.map((q) => q.price)) : null;
  const chosen = res?.quotes.find((q) => q.courierCode === pick);
  const printIds = done?.ids.join(",") ?? "";

  return (
    <ERPModal open onClose={onClose} title={`จัดส่ง ${ids.length} ออเดอร์`} size="lg" defaultExpanded={false} storageKey="platform-order-ship"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {done && done.done > 0 && <a href={`/print/platform-orders?kind=label&ids=${encodeURIComponent(printIds)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"><Icon value="i:printer" />พิมพ์ใบปะหน้า</a>}
          <div className="flex-1" />
          <button onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">{done ? "ปิด" : "ยกเลิก"}</button>
          {!done && <button onClick={() => void book()} disabled={busy || !res || !pick} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy ? "กำลังจอง…" : chosen ? `เรียก ${chosen.courierName} เข้ารับ (${money(chosen.price)})` : "เรียกขนส่งเข้ารับ"}</button>}
        </div>
      }>
      <div className="space-y-4 text-sm">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><Icon value="i:flask" className="mr-1" />ขั้น 1 โหมดจำลอง — ราคา/เลขพัสดุเป็นตัวอย่าง ไม่เรียกขนส่งจริง ไม่เสียเงิน (เปิดจริงเมื่อมีบัญชี SHIPPOP และเจ้าของอนุมัติขั้น 2)</p>

        {done ? (
          <div className="space-y-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800"><Icon value="i:circle-check" className="mr-1.5" />จองแล้ว {done.done} ออเดอร์ · สถานะออเดอร์เป็น "แพ็กแล้ว รอขนส่ง" · เลขพัสดุเติมลงออเดอร์แล้ว</div>
            {done.failed.length > 0 && <ul className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{done.failed.map((f, i) => <li key={i}>{f.order_no}: {f.error}</li>)}</ul>}
          </div>
        ) : (
          <>
            {blocked.length > 0 && (
              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="mb-1 text-xs font-medium text-slate-700">ส่งผ่าน SHIPPOP ไม่ได้ {blocked.length} ออเดอร์</p>
                <ul className="space-y-0.5 text-xs text-slate-600">{blocked.map((b) => <li key={b.id}><span className="font-mono">{b.order_no}</span> — {b.reason}</li>)}</ul>
              </div>
            )}
            {err && (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
                {err}
                {err.includes("ตั้งค่าการส่ง") && <button type="button" onClick={onOpenSettings} className="ml-2 underline">ตั้งค่าการส่ง</button>}
              </div>
            )}
            {res && (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
                  <span>ส่ง {shippable.length} ออเดอร์</span>
                  <span>น้ำหนักรวม {(totalG / 1000).toLocaleString("th-TH", { maximumFractionDigits: 2 })} กก.</span>
                  {cod > 0 && <span>เก็บเงินปลายทาง {money(cod)}</span>}
                  {res.sender && <span>ผู้ส่ง {res.sender.name} ({res.sender.province})</span>}
                </div>
                {missing > 0 && <p className="text-xs text-amber-700"><Icon name="warning" className="mr-1" />{missing} รายการไม่มีน้ำหนักสินค้า — ใช้น้ำหนักตั้งต้นของจุดส่งของแทน (เติมน้ำหนักที่ Parent SKU ให้ราคาแม่นขึ้น)</p>}
                {single && (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block"><span className="mb-1 block text-xs text-slate-500">น้ำหนักพัสดุ (กรัม)</span><ERPInput value={grams} onChange={(e) => setGrams(e.target.value)} inputMode="numeric" className="w-32" /></label>
                    <label className="block"><span className="mb-1 block text-xs text-slate-500">กล่อง กว้างxยาวxสูง (ซม.)</span><ERPInput value={box} onChange={(e) => setBox(e.target.value)} placeholder="ตามค่าตั้งต้น" className="w-40" /></label>
                    <button type="button" onClick={() => void quote()} disabled={loading} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">คำนวณใหม่</button>
                  </div>
                )}
                <div className="space-y-1.5" role="radiogroup" aria-label="เลือกขนส่ง">
                  {res.quotes.map((q) => (
                    <label key={q.courierCode} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${pick === q.courierCode ? "border-blue-500 ring-1 ring-blue-200" : "border-slate-200 hover:bg-slate-50"} ${q.available ? "" : "opacity-50"}`}>
                      <input type="radio" name="courier" checked={pick === q.courierCode} disabled={!q.available} onChange={() => setPick(q.courierCode)} />
                      <span className="min-w-0 flex-1">{q.courierName}{q.price === cheapest && q.available && <span className="ml-1.5 rounded bg-emerald-50 px-1.5 text-[11px] text-emerald-700">ถูกสุด</span>}{!q.available && <span className="ml-1.5 text-[11px] text-slate-400">ไม่ให้บริการ</span>}</span>
                      <span className="text-xs text-slate-500">{q.estimate}</span>
                      <span className="w-20 text-right font-medium">{money(q.price)}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            {loading && !res && <p className="py-6 text-center text-slate-400">กำลังดูราคา…</p>}
          </>
        )}
      </div>
    </ERPModal>
  );
}
