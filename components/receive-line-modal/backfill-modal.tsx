"use client";

/**
 * ของกลาง — 🧹 เคลียร์ของค้างรับเก่า (ป๊อปเดียวจบ)
 * โหลดรายการรอรับ + หลักฐาน (/api/purchasing/receivable?insights=1) แล้วให้เลือกต่อรายการ:
 *   ✅ มาแล้ว → รับย้อนหลัง: /api/purchasing/receive source="backfill" (ไม่บังคับแนบ · บังคับเหตุผล · บวกสต๊อกได้/ไม่ได้ · ไม่แจ้งไลน์)
 *   ❌ ไม่มา  → ยกเลิกยอดที่ค้าง: /api/purchasing/cancel-line ตัวเดิม (เหตุผลเดียวกัน)
 *   ⏸ ยังรอ  → ไม่ทำอะไร
 * คำแนะนำตั้งต้น: น่าจะซ้ำ (dup_of) → ไม่มา · สต๊อกวัตถุดิบติดลบ (ถูกเบิกไปใช้แล้ว) → มาแล้ว · นอกนั้น → ยังรอ
 * สิทธิ์: po.receive_backfill (เจ้าของอนุมัติ 2026-10-25 · admin/manager) · ใช้ที่หน้ารับสินค้า + โหมดรับของหน้าสั่งซื้อ
 *
 *   <ReceiveBackfillModal onClose={…} onDone={() => reload()} />
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { HoverPreview } from "@/components/hover-image";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";

type Item = {
  id: string; po_id: string; po_no: string; seller_name: string; item_name: string; code: string; image_url: string | null;
  uom: string; remaining: number; order_date: string | null;
  raw_balance: number | null; linked_sku: boolean; dup_of: string | null;
};
type Act = "arrived" | "cancel" | "wait";
type Result = { grs: number; cancelled: number; errors: string[] };

const AGE_OPTIONS = [30, 60, 90];
const REASONS = ["ของมาก่อนเริ่มกดรับในระบบ", "หาบิลไม่เจอแล้ว", "ใบซ้ำจากการย้ายข้อมูล"];
const stripCode = (name: string) => name?.replace(/^\s*\[[^\]]*\]\s*/, "").trim() || name;
const fmt = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString("th-TH", { maximumFractionDigits: 3 });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/** สั่งมาแล้วกี่วัน (นับวันตามปฏิทินเครื่อง) */
const ageDays = (d: string | null) => {
  if (!d) return 0;
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  if (!y || !m || !dd) return 0;
  const t = new Date();
  return Math.round((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - Date.UTC(y, m - 1, dd)) / 86400000);
};
const suggest = (it: Item): Act => (it.dup_of ? "cancel" : it.raw_balance != null && it.raw_balance < 0 ? "arrived" : "wait");

export function ReceiveBackfillModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [minAge, setMinAge] = useState(60);
  const [shop, setShop] = useState("");
  const [q, setQ] = useState("");
  const [acts, setActs] = useState<Record<string, Act>>({});
  const [reason, setReason] = useState("");
  const [addStock, setAddStock] = useState(true);
  const [dateMode, setDateMode] = useState<"today" | "order">("today");
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr(null);
    try {
      const j = await apiFetch("/api/purchasing/receivable?insights=1").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const list = (j.data ?? []) as Item[];
      setItems(list);
      setActs(Object.fromEntries(list.map((it) => [it.id, suggest(it)])));
    } catch (e) { setLoadErr(String((e as Error)?.message ?? e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const aged = useMemo(() => items.filter((it) => ageDays(it.order_date) > minAge), [items, minAge]);
  const ageCount = useMemo(() => Object.fromEntries(AGE_OPTIONS.map((a) => [a, items.filter((it) => ageDays(it.order_date) > a).length])), [items]);
  const shops = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of aged) m.set(it.seller_name, (m.get(it.seller_name) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [aged]);
  const shown = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return aged
      .filter((it) => (!shop || it.seller_name === shop) && (!qq || it.item_name.toLowerCase().includes(qq) || it.code.toLowerCase().includes(qq) || it.po_no.toLowerCase().includes(qq)))
      .sort((a, b) => String(a.order_date ?? "").localeCompare(String(b.order_date ?? "")) || a.po_no.localeCompare(b.po_no));
  }, [aged, shop, q]);
  const stats = useMemo(() => ({
    neg: aged.filter((it) => it.raw_balance != null && it.raw_balance < 0).length,
    dup: aged.filter((it) => it.dup_of).length,
    noSku: aged.filter((it) => !it.linked_sku).length,
  }), [aged]);
  // ทำเฉพาะรายการที่มองเห็น (ตัวกรองอายุ/ร้าน/คำค้น) — กันเผลอปิดยอดของที่ถูกซ่อน
  const picked = useMemo(() => ({
    arrived: shown.filter((it) => acts[it.id] === "arrived"),
    cancel: shown.filter((it) => acts[it.id] === "cancel"),
  }), [shown, acts]);
  const arrivedPos = useMemo(() => new Set(picked.arrived.map((it) => it.po_id)).size, [picked.arrived]);
  const setAll = (a: Act | "suggest") => setActs((cur) => { const n = { ...cur }; for (const it of shown) n[it.id] = a === "suggest" ? suggest(it) : a; return n; });

  const run = async () => {
    setErr(null);
    const why = reason.trim();
    if (why.length < 3) { setErr("ใส่เหตุผลก่อน — ระบบเก็บเหตุผลนี้ลงประวัติทุกรายการ"); return; }
    if (picked.arrived.length + picked.cancel.length === 0) { setErr("ยังไม่ได้เลือก \"มาแล้ว\" หรือ \"ไม่มา\" สักรายการ"); return; }
    const byPo = new Map<string, Item[]>();
    for (const it of picked.arrived) byPo.set(it.po_id, [...(byPo.get(it.po_id) ?? []), it]);
    const cancelChunks: Item[][] = [];   // ยกเลิกทีละ 100 บรรทัด (กันคำขอยาวเกิน)
    for (let i = 0; i < picked.cancel.length; i += 100) cancelChunks.push(picked.cancel.slice(i, i + 100));
    const total = byPo.size + cancelChunks.length;
    const out: Result = { grs: 0, cancelled: 0, errors: [] };
    setRunning({ done: 0, total });
    let done = 0;
    for (const [poId, list] of byPo) {
      try {
        const res = await apiFetch("/api/purchasing/receive", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            po_id: poId, source: "backfill", reason: why, skip_stock: !addStock, receiver: user?.name,
            receive_date: dateMode === "order" ? (list[0].order_date || today()) : today(),
            lines: list.map((it) => ({ po_line_id: it.id, qty_received: it.remaining, qty_defective: 0, case_type: "full" })),
          }),
        });
        const j = (await res.json().catch(() => ({}))) as { gr_no?: string; error?: string };
        if (!res.ok || j.error || !j.gr_no) out.errors.push(`${list[0].po_no}: ${j.error ?? `HTTP ${res.status}`}`); else out.grs += 1;
      } catch (e) { out.errors.push(`${list[0].po_no}: ${String((e as Error)?.message ?? e)}`); }
      setRunning({ done: ++done, total });
    }
    for (const chunk of cancelChunks) {
      try {
        const res = await apiFetch("/api/purchasing/cancel-line", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ po_line_ids: chunk.map((it) => it.id), reason: why, actor: user?.name }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok || j.error) out.errors.push(`ยกเลิก ${chunk.length} รายการ: ${j.error ?? `HTTP ${res.status}`}`); else out.cancelled += chunk.length;
      } catch (e) { out.errors.push(`ยกเลิก: ${String((e as Error)?.message ?? e)}`); }
      setRunning({ done: ++done, total });
    }
    setRunning(null);
    setResult(out);
    if (out.grs || out.cancelled) { toast.success(`เคลียร์แล้ว: รับย้อนหลัง ${out.grs} ใบรับ · ยกเลิก ${out.cancelled} รายการ`); onDone(); void load(); }
  };

  const busy = !!running;
  const actBtn = (it: Item, a: Act, label: string, onCls: string) => (
    <button type="button" onClick={() => setActs((c) => ({ ...c, [it.id]: a }))} disabled={busy}
      className={`h-7 px-2 text-[11px] border-l first:border-l-0 border-slate-200 ${acts[it.id] === a ? onCls : "bg-white text-slate-500 hover:bg-slate-50"}`}>{label}</button>
  );

  return (
    <ERPModal open onClose={() => !busy && onClose()} size="xl" storageKey="recv-backfill"
      title="🧹 เคลียร์ของค้างรับเก่า"
      description="เลือกต่อรายการ: มาแล้ว (รับย้อนหลัง ไม่ต้องแนบเอกสาร) · ไม่มา (ยกเลิกยอดค้าง) · ยังรอ — ต้องใส่เหตุผล ระบบเก็บลงประวัติทุกรายการ"
      footer={<>
        <span className="mr-auto text-[11px] text-slate-500">
          {running ? `กำลังบันทึก ${running.done}/${running.total}…` : `รับย้อนหลัง ${picked.arrived.length} รายการ (${arrivedPos} ใบรับ) · ยกเลิก ${picked.cancel.length} · ทำเฉพาะที่เห็นในรายการ`}
        </span>
        <button onClick={onClose} disabled={busy} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ปิด</button>
        <button onClick={() => void run()} disabled={busy || loading} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
          {busy ? "กำลังบันทึก…" : `✓ ปิดยอดที่เลือก (${picked.arrived.length + picked.cancel.length})`}
        </button>
      </>}>
      {loading ? <div className="py-16 text-center text-sm text-slate-400">กำลังโหลดรายการค้างรับ…</div>
      : loadErr ? <div className="py-16 text-center text-sm text-red-500">⚠ โหลดไม่สำเร็จ: {loadErr} <button onClick={() => void load()} className="underline ml-2">ลองใหม่</button></div>
      : (
        <>
          {/* ภาพรวม (ตามตัวกรองอายุ) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="bg-slate-50 rounded-lg px-3 py-2"><div className="text-[11px] text-slate-500">ค้างเกิน {minAge} วัน</div><div className="text-lg font-semibold text-slate-800">{aged.length.toLocaleString()} <span className="text-xs font-normal text-slate-400">รายการ</span></div></div>
            <div className="bg-slate-50 rounded-lg px-3 py-2"><div className="text-[11px] text-slate-500">สต๊อกวัตถุดิบติดลบ</div><div className="text-lg font-semibold text-red-600">{stats.neg}</div></div>
            <div className="bg-slate-50 rounded-lg px-3 py-2"><div className="text-[11px] text-slate-500">น่าจะเป็นใบซ้ำ</div><div className="text-lg font-semibold text-amber-600">{stats.dup}</div></div>
            <div className="bg-slate-50 rounded-lg px-3 py-2"><div className="text-[11px] text-slate-500">ไม่ผูก SKU (ไม่บวกสต๊อก)</div><div className="text-lg font-semibold text-slate-700">{stats.noSku}</div></div>
          </div>

          {result && (
            <div className={`mb-3 px-3 py-2 rounded-lg border text-sm ${result.errors.length ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>
              ✅ รับย้อนหลัง {result.grs} ใบรับ · ยกเลิก {result.cancelled} รายการ
              {result.errors.length > 0 && <div className="mt-1 text-xs">ไม่สำเร็จ {result.errors.length} รายการ: {result.errors.join(" · ")}</div>}
            </div>
          )}

          {/* ตัวกรอง + ตั้งทั้งหมด */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-xs text-slate-500">ค้างเกิน</span>
            {AGE_OPTIONS.map((a) => (
              <button key={a} onClick={() => setMinAge(a)} className={`h-7 px-2.5 text-xs rounded-full border ${minAge === a ? "bg-blue-50 border-blue-300 text-blue-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{a} วัน ({ageCount[a] ?? 0})</button>
            ))}
            <select value={shop} onChange={(e) => setShop(e.target.value)} className="h-8 px-2 text-xs border border-slate-200 rounded-md bg-white max-w-[220px]">
              <option value="">ทุกร้าน ({aged.length})</option>
              {shops.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
            </select>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 สินค้า / รหัส / PO…" className="h-8 px-2 text-xs border border-slate-200 rounded-md flex-1 min-w-[140px]" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mb-2 text-[11px]">
            <span className="text-slate-400">ตั้งทุกรายการที่เห็น ({shown.length}):</span>
            <button onClick={() => setAll("suggest")} disabled={busy} className="h-7 px-2 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">💡 ตามคำแนะนำ</button>
            <button onClick={() => setAll("arrived")} disabled={busy} className="h-7 px-2 rounded-md border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">✅ มาแล้ว</button>
            <button onClick={() => setAll("cancel")} disabled={busy} className="h-7 px-2 rounded-md border border-red-200 text-red-700 bg-red-50 hover:bg-red-100">❌ ไม่มา</button>
            <button onClick={() => setAll("wait")} disabled={busy} className="h-7 px-2 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">⏸ ยังรอ</button>
          </div>

          {/* รายการ */}
          <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 max-h-[42vh] overflow-y-auto">
            {shown.map((it) => {
              const hint = it.dup_of
                ? { text: `น่าจะซ้ำกับ ${it.dup_of}`, cls: "bg-amber-50 text-amber-700 border-amber-200" }
                : it.raw_balance != null && it.raw_balance < 0
                  ? { text: `ถูกเบิกไปใช้แล้ว ${fmt(Math.abs(it.raw_balance))} → ของน่าจะมาแล้ว`, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
                  : { text: "ไม่มีหลักฐาน — ถามคลังก่อน", cls: "bg-slate-50 text-slate-500 border-slate-200" };
              return (
                <div key={it.id} className="flex items-center gap-3 px-3 py-2 flex-wrap sm:flex-nowrap">
                  <HoverPreview url={it.image_url} previewW={240}>
                    <div className="w-9 h-9 rounded bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100 shrink-0">
                      {it.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.image_url} alt="" loading="lazy" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-sm">📦</span>}
                    </div>
                  </HoverPreview>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-800 truncate" title={it.item_name}>{stripCode(it.item_name)}</div>
                    <div className="text-[11px] text-slate-400 truncate">{it.code ? `${it.code} · ` : ""}{it.seller_name} · {it.po_no} · ค้าง {ageDays(it.order_date)} วัน{!it.linked_sku && " · ไม่ผูก SKU"}</div>
                    <span className={`inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded border ${hint.cls}`}>{hint.text}</span>
                  </div>
                  <div className="shrink-0 text-right leading-tight w-28">
                    <div className="text-xs text-slate-500">รอรับ <b className="text-slate-800 tabular-nums">{fmt(it.remaining)}</b> <span className="text-[10px] text-slate-400">{it.uom}</span></div>
                    <div className={`text-[11px] ${it.raw_balance != null && it.raw_balance < 0 ? "text-red-600" : "text-slate-400"}`}>สต๊อกวัตถุดิบ {it.raw_balance == null ? "ยังไม่มี" : fmt(it.raw_balance)}</div>
                  </div>
                  <div className="inline-flex rounded-md border border-slate-200 overflow-hidden shrink-0">
                    {actBtn(it, "arrived", "มาแล้ว", "bg-emerald-50 text-emerald-700 font-medium")}
                    {actBtn(it, "cancel", "ไม่มา", "bg-red-50 text-red-700 font-medium")}
                    {actBtn(it, "wait", "ยังรอ", "bg-slate-100 text-slate-700 font-medium")}
                  </div>
                </div>
              );
            })}
            {shown.length === 0 && <div className="py-10 text-center text-xs text-slate-300">— ไม่มีของค้างตามตัวกรองนี้ —</div>}
          </div>

          {/* เหตุผล + ตัวเลือก */}
          <div className="mt-3 p-3 border border-slate-200 rounded-lg bg-slate-50/50">
            <div className="text-xs font-medium text-slate-700 mb-1.5">เหตุผล (บังคับ) <span className="font-normal text-slate-400">— เก็บลงประวัติ + ใบรับทุกใบ</span></div>
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {REASONS.map((r) => (
                <button key={r} type="button" onClick={() => { setReason(r); setErr(null); }} className={`h-7 px-2.5 text-xs rounded-full border ${reason === r ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{r}</button>
              ))}
            </div>
            <input value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} placeholder="หรือพิมพ์เหตุผลเอง"
              className={`w-full h-9 px-3 text-sm border rounded-md bg-white ${err && reason.trim().length < 3 ? "border-red-300" : "border-slate-200"}`} />
            <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-slate-600">
              <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={addStock} onChange={(e) => setAddStock(e.target.checked)} className="rounded border-slate-300" /> บวกสต๊อกเข้าคลังวัตถุดิบ (WH-RAW) — แก้ยอดติดลบ</label>
              <label className="inline-flex items-center gap-1.5">วันที่รับย้อนหลัง
                <select value={dateMode} onChange={(e) => setDateMode(e.target.value as "today" | "order")} className="h-7 px-1.5 text-xs border border-slate-200 rounded-md bg-white">
                  <option value="today">วันนี้</option>
                  <option value="order">ใช้วันที่สั่ง</option>
                </select>
              </label>
            </div>
            <div className="mt-2 text-[11px] text-slate-400">ใบรับที่ได้จะมีป้าย &quot;ย้อนหลัง · ไม่มีเอกสาร&quot; ไม่แจ้งไลน์ และไม่โผล่ในคิวออกใบสำคัญ (เปิดดูได้ที่หน้าใบสำคัญ) · หาบิลเจอทีหลังแนบเพิ่มในใบรับได้ · แนะนำนับสต๊อกจริงอีกรอบหลังเคลียร์</div>
            {err && <div className="mt-2 text-xs text-red-600">⚠️ {err}</div>}
          </div>
        </>
      )}
    </ERPModal>
  );
}
