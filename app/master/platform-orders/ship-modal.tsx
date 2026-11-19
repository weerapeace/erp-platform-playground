"use client";

// 🚚 จัดส่งผ่าน SHIPPOP — เทียบราคาทุกขนส่ง → เลือก → ยืนยัน → เลขพัสดุเติมลงออเดอร์
// โหมดตามเซิร์ฟเวอร์ (sim = จำลอง · sandbox = ระบบทดลอง SHIPPOP ไม่เสียเงิน · prod = จริง เสียเงิน) — เฟส 1 2026-11-19
// ขนส่งตั้งต้น: ค่าที่แบรนด์ตั้ง → เจ้าที่ใช้ล่าสุดในเครื่องนี้ → ถูกสุด · กล่องจากสินค้า (เตือนถ้าไม่มี/หลายชิ้น)
// ข้อมูล/กติกา: /api/platform-orders/ship + lib/order-shipping · ออเดอร์แพลตฟอร์ม/จากเมล ระบบแยกออกพร้อมเหตุผล

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { ERPInput } from "@/components/form";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";

type Quote = { courierCode: string; courierName: string; price: number; available: boolean; estimate: string };
type ShipOrder = { id: string; order_no?: string; grams: number; missing: number; cod?: number; box?: string; boxName?: string | null; boxFromProduct?: boolean; boxMissing?: number; multi?: boolean };
type BoxOpt = { name: string; dims: string; used: number };
type QuoteRes = { mode: string; demo?: boolean; quotes: Quote[]; defaultCourier?: string | null; boxes?: BoxOpt[]; orders: ShipOrder[]; blocked: { id: string; order_no: string; reason: string }[]; sender?: { name: string; province: string } };
const money = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const LAST_COURIER_KEY = "platform-orders.ship.last-courier";
const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* เก็บไม่ได้ = ข้าม */ } };
const MODE_NOTE: Record<string, { cls: string; icon: string; text: string }> = {
  sim: { cls: "bg-amber-50 text-amber-800", icon: "i:flask", text: "โหมดจำลอง — ราคา/เลขพัสดุเป็นตัวอย่าง ไม่เรียกขนส่งจริง ไม่เสียเงิน (ยังไม่ได้ใส่กุญแจ SHIPPOP)" },
  sandbox: { cls: "bg-sky-50 text-sky-800", icon: "i:flask", text: "ระบบทดลองของ SHIPPOP — ราคาจริงจาก SHIPPOP แต่ไม่เสียเงิน ขนส่งไม่มารับ ใบปะหน้าใช้ส่งจริงไม่ได้" },
  prod: { cls: "bg-rose-50 text-rose-800", icon: "i:alert-triangle", text: "โหมดจริง — จองแล้วเสียค่าส่งจริง ยกเลิกได้จนกว่าขนส่งจะมารับพัสดุเท่านั้น" },
};

/** "20x30x10" → [20,30,10] (ไม่ครบ = ช่องว่าง) */
const splitDims = (s: string | undefined) => { const m = String(s ?? "").match(/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/); return m ? [m[1], m[2], m[3]] : ["", "", ""]; };

export function ShipModal({ ids, onClose, onBooked, onOpenSettings }: { ids: string[]; onClose: () => void; onBooked: (ids: string[]) => void; onOpenSettings: () => void }) {
  const toast = useToast();
  const [res, setRes] = useState<QuoteRes | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<QuoteRes["blocked"]>([]);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState("");
  const [grams, setGrams] = useState("");
  const [box, setBox] = useState("");
  const [dims, setDims] = useState<string[]>(["", "", ""]);   // กว้าง/ยาว/สูง ที่โชว์ในช่อง (เลือกกล่องจากรายการ = เติมให้ · แก้เองได้)
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ done: number; failed: { order_no: string; error: string }[]; ids: string[] } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const single = ids.length === 1;

  const quote = useCallback(async (override?: { box?: string }) => {
    setLoading(true); setErr(null);
    try {
      const body: Record<string, unknown> = { action: "quote", ids };
      const useBox = (override?.box ?? box).trim();
      if (single && Number(grams) > 0) body.grams = Number(grams);
      if (single && useBox) body.box = useBox;
      const j = await apiFetch("/api/platform-orders/ship", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
      if (j.error) { setErr(j.error); setBlocked(j.blocked ?? []); setRes(null); return; }
      setRes(j as QuoteRes); setBlocked(j.blocked ?? []);
      if (!grams && single && j.orders?.[0]) setGrams(String(j.orders[0].grams));
      if (single && j.orders?.[0]?.box && !override?.box && !box) setDims(splitDims(j.orders[0].box));
      setPick((p) => {
        if (p) return p;
        const avail = ((j.quotes ?? []) as Quote[]).filter((q) => q.available);
        const want = [j.defaultCourier, safeGet(LAST_COURIER_KEY)].find((c) => c && avail.some((q) => q.courierCode === c));
        return want ?? avail[0]?.courierCode ?? "";
      });
    } catch { setErr("ดูราคาไม่สำเร็จ กรุณาลองใหม่"); } finally { setLoading(false); }
  }, [ids, single, grams, box]);
  useEffect(() => { void quote(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- ดูราคาครั้งแรกตอนเปิด · เปลี่ยนน้ำหนัก/กล่องแล้วกด คำนวณใหม่

  const book = async () => {
    if (!pick) { setErr("เลือกขนส่งก่อน"); return; }
    setConfirming(false); setBusy(true); setErr(null);
    try {
      const shipIds = res?.orders.map((o) => o.id) ?? ids;
      const body: Record<string, unknown> = { action: "book", ids: shipIds, courier: pick };
      if (single && Number(grams) > 0) body.grams = Number(grams);
      if (single && box.trim()) body.box = box.trim();
      const j = await apiFetch("/api/platform-orders/ship", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
      if (j.error) { setErr(j.error); return; }
      setDone({ done: j.done ?? 0, failed: j.failed ?? [], ids: shipIds });
      if (j.done) onBooked(shipIds);
      if (j.done) safeSet(LAST_COURIER_KEY, pick);
      if (j.done) toast.success(j.demo ? "โหมดทดลอง — แสดงผลตัวอย่าง ไม่ได้จองจริง" : j.mode === "prod" ? `จองแล้ว ${j.done} ออเดอร์ — ขนส่งจะมารับพัสดุ` : j.mode === "sandbox" ? `จองในระบบทดลองแล้ว ${j.done} ออเดอร์ (ไม่เสียเงิน)` : `จองแล้ว ${j.done} ออเดอร์ (จำลอง — ยังไม่เรียกขนส่งจริง)`);
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
  const note = MODE_NOTE[res?.demo ? "sim" : res?.mode ?? "sim"] ?? MODE_NOTE.sim;
  const boxMissing = shippable.reduce((a, o) => a + (o.boxMissing ?? 0), 0);
  const multiBox = shippable.filter((o) => o.multi && o.boxFromProduct).length;
  const one = single ? shippable[0] : undefined;
  const curDims = dims.every((d) => Number(d) > 0) ? dims.map((d) => String(Number(d))).join("x") : "";
  const boxes = res?.boxes ?? [];
  const pickBox = (b: BoxOpt) => { setDims(splitDims(b.dims)); setBox(b.dims); void quote({ box: b.dims }); };
  const setDim = (i: number, v: string) => setDims((d) => d.map((x, j) => (j === i ? v.replace(/[^\d.]/g, "").slice(0, 6) : x)));
  const applyDims = () => { if (!curDims) { setErr("กรอกกว้าง/ยาว/สูง ให้ครบ (ซม.)"); return; } setBox(curDims); void quote({ box: curDims }); };

  return (
    <ERPModal open onClose={onClose} title={`จัดส่ง ${ids.length} ออเดอร์`} size="lg" defaultExpanded={false} storageKey="platform-order-ship"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {done && done.done > 0 && <a href={`/print/platform-orders?kind=label&ids=${encodeURIComponent(printIds)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"><Icon value="i:printer" />พิมพ์ใบปะหน้า</a>}
          <div className="flex-1" />
          <button onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">{done ? "ปิด" : "ยกเลิก"}</button>
          {!done && <button onClick={() => (pick ? setConfirming(true) : setErr("เลือกขนส่งก่อน"))} disabled={busy || !res || !pick} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy ? "กำลังจอง…" : chosen ? `เรียก ${chosen.courierName} เข้ารับ (${money(chosen.price)})` : "เรียกขนส่งเข้ารับ"}</button>}
        </div>
      }>
      <div className="space-y-4 text-sm">
        <p className={`rounded-lg px-3 py-2 text-xs ${note.cls}`}><Icon value={note.icon} className="mr-1" />{note.text}</p>

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
                {boxMissing > 0 && <p className="text-xs text-amber-700"><Icon name="warning" className="mr-1" />{boxMissing} รายการไม่มีขนาดกล่อง — ใช้กล่องตั้งต้นของจุดส่งของแทน (ตั้ง "ขนาดพัสดุ" ที่ Parent SKU ให้ราคาแม่นขึ้น)</p>}
                {multiBox > 0 && <p className="text-xs text-slate-500"><Icon value="i:box" className="mr-1" />{multiBox} ออเดอร์มีหลายชิ้น — ใช้กล่องใหญ่สุดของสินค้าในออเดอร์ ตรวจว่าใส่พอไหม</p>}
                {!single && shippable.length > 1 && (
                  <ul className="max-h-40 space-y-0.5 overflow-auto rounded-lg border border-slate-100 px-3 py-2 text-xs text-slate-600">
                    {shippable.map((o) => <li key={o.id} className="flex flex-wrap justify-between gap-x-3"><span className="font-mono text-slate-500">{o.order_no ?? ""}</span><span>{o.boxName ? `${o.boxName} · ` : ""}{o.box ?? "-"} ซม. · {o.grams.toLocaleString("th-TH")} ก.{o.cod ? ` · COD ${money(o.cod)}` : ""}</span></li>)}
                  </ul>
                )}
                {single && (
                  <div className="space-y-2">
                    {boxes.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs text-slate-500">กล่อง — ระบบเลือกตามสินค้าให้แล้ว (กดเปลี่ยนได้ · ไม่มีขนาดที่ต้องการ = แก้ตัวเลขด้านล่างเอง)</p>
                        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="เลือกกล่อง">
                          {boxes.map((b) => {
                            const on = curDims === b.dims;
                            const fromProduct = !!one?.boxFromProduct && one.box === b.dims;
                            return (
                              <button key={b.name} type="button" role="radio" aria-checked={on} onClick={() => pickBox(b)} disabled={loading}
                                className={`rounded-lg border px-2.5 py-1 text-xs ${on ? "border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-200" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                                <span className="font-medium">{b.name}</span> <span className="text-slate-500">{b.dims.replace(/x/g, "×")}</span>
                                {fromProduct && <span className="ml-1 rounded bg-emerald-50 px-1 text-[10px] text-emerald-700">จากสินค้า</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
                      {(["กว้าง", "ยาว", "สูง"] as const).map((l, i) => (
                        <label key={l} className="block"><span className="mb-1 block text-xs text-slate-500">{l} (ซม.)</span><ERPInput value={dims[i]} onChange={(e) => setDim(i, e.target.value)} inputMode="decimal" className="sm:w-20" /></label>
                      ))}
                      <label className="block"><span className="mb-1 block text-xs text-slate-500">น้ำหนัก (กรัม)</span><ERPInput value={grams} onChange={(e) => setGrams(e.target.value)} inputMode="numeric" className="sm:w-28" /></label>
                      <button type="button" onClick={applyDims} disabled={loading} className="col-span-2 h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">{loading ? "กำลังคำนวณ…" : "คำนวณราคาใหม่"}</button>
                    </div>
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
      <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} onConfirm={() => void book()} loading={busy}
        variant={res?.mode === "prod" ? "danger" : "default"}
        title={`ยืนยันจอง ${chosen?.courierName ?? pick} · ${shippable.length} พัสดุ`}
        message={<>
          <span className="block">ค่าส่งรวม <b>{money(chosen?.price ?? 0)}</b>{cod > 0 ? ` · เก็บเงินปลายทาง ${money(cod)}` : ""}{res?.mode === "prod" ? " · เสียเงินจริง" : res?.mode === "sandbox" ? " · ระบบทดลอง ไม่เสียเงิน" : " · จำลอง ไม่เสียเงิน"}</span>
          <span className="mt-1 block">ยกเลิกได้จนกว่าขนส่งจะมารับพัสดุ — หลังรับแล้วยกเลิกไม่ได้ (ต้องติดต่อ SHIPPOP)</span>
        </>}
        confirmText="ยืนยันจอง" cancelText="กลับไปแก้" />
    </ERPModal>
  );
}
