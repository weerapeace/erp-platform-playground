"use client";

/**
 * SellerBillPanel (ของกลาง) — "บิลจากร้าน (ภาษาจีน)" ในใบสำคัญรับ
 *   อัปโหลดรูป/PDF บิลร้าน → AI อ่านชื่อจีน + แปลไทย + จำนวน + ราคา ¥ → จับคู่กับบรรทัดใบสั่งซื้อ "ของร้านนี้เท่านั้น"
 *   → คนเช็กทีละแถว (ใช่ / เปลี่ยน / เลือกจับคู่เอง / ข้าม) → ใส่ลงใบสำคัญ (ผูก PO + ราคาจากบิล) + จำคู่ไว้ครั้งหน้า
 * ใช้: <SellerBillPanel voucherId readonly onApplied />  · API /api/purchasing/vouchers/<id>/seller-bills
 * กติกาจับคู่: lib/seller-bill-match.ts · เอกสาร docs/seller-bill-match.md
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { FileInput } from "@/components/file-input";
import { HoverPreview } from "@/components/hover-image";
import { useFileRefUrls } from "@/components/file-ref";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { isPdfRef } from "@/lib/file-ref";
import { applyGroupToLine, checkBillMath, undecidedCount, type PoGroup, type SellerBillLine } from "@/lib/seller-bill-match";

type Bill = {
  id: string; r2_key: string; gr_id: string | null; bill_no: string | null; bill_date: string | null; seller_text: string | null;
  total_amount: number | null; currency: string | null; lines: SellerBillLine[]; status: string; applied_at: string | null; created_at: string;
};
type Candidate = { gr_id: string; gr_no: string; kind: "receipt" | "bill"; r2_key: string };

const n2 = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d }));
const inp = "h-7 px-1.5 text-xs border border-slate-200 rounded-md bg-white text-right tabular-nums disabled:bg-transparent disabled:border-transparent disabled:text-slate-700";
const chip = "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap";
const CHIP_OK = `${chip} bg-emerald-50 text-emerald-700 border-emerald-200`;
const CHIP_WARN = `${chip} bg-amber-50 text-amber-700 border-amber-200`;
const CHIP_NEU = `${chip} bg-slate-50 text-slate-600 border-slate-200`;

function LevelBadge({ l }: { l: SellerBillLine }) {
  if (l.level === "fee") return <span className={CHIP_NEU}>ไม่ใช่สินค้า</span>;
  if (!l.match_key) return <span className={`${chip} bg-red-50 text-red-700 border-red-200`}>ไม่เจอใน PO ร้านนี้</span>;
  if (l.manual) return <span className={`${chip} bg-blue-50 text-blue-700 border-blue-200`}>เลือกเอง</span>;
  const pct = Math.round((l.score || 0) * 100);
  return l.level === "ok" ? <span className={CHIP_OK}>มั่นใจ {pct}%</span> : <span className={CHIP_WARN}>ให้เช็ก {pct}%</span>;
}

export function SellerBillPanel({ voucherId, readonly, onApplied }: { voucherId: string; readonly: boolean; onApplied: () => void | Promise<void> }) {
  const toast = useToast();
  const [bills, setBills] = useState<Bill[]>([]);
  const [groups, setGroups] = useState<PoGroup[]>([]);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [hasPartner, setHasPartner] = useState(true);
  const [draft, setDraft] = useState<Record<string, SellerBillLine[]>>({});
  const [uploadKey, setUploadKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);   // "parse" | bill id
  const [remember, setRemember] = useState(true);
  const [open, setOpen] = useState(true);
  const [pickFor, setPickFor] = useState<{ billId: string; idx: number } | null>(null);
  const [pickQ, setPickQ] = useState("");
  const [delBill, setDelBill] = useState<Bill | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const fileUrls = useFileRefUrls([...cands.map((c) => c.r2_key), ...bills.map((b) => b.r2_key)]);
  const gByKey = useMemo(() => new Map(groups.map((g) => [g.key, g])), [groups]);

  const load = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/purchasing/vouchers/${voucherId}/seller-bills`).then((r) => r.json());
      const rows = (j.data ?? []) as Bill[];
      setBills(rows); setGroups((j.groups ?? []) as PoGroup[]); setCands((j.candidates ?? []) as Candidate[]); setHasPartner(j.has_partner !== false);
      setDraft((p) => { const nx = { ...p }; for (const b of rows) if (!nx[b.id]) nx[b.id] = b.lines ?? []; return nx; });
    } catch { /* แผงเสริม — เงียบ */ }
  }, [voucherId]);
  useEffect(() => { void load(); }, [load]);

  const setLines = (billId: string, fn: (ls: SellerBillLine[]) => SellerBillLine[]) => { setDraft((p) => ({ ...p, [billId]: fn(p[billId] ?? []) })); setMsg((m) => ({ ...m, [billId]: "" })); };
  const setLine = (billId: string, idx: number, patch: Partial<SellerBillLine>) => setLines(billId, (ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const parse = async (r2_key: string, gr_id?: string) => {
    setBusy("parse");
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${voucherId}/seller-bills`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ r2_key, gr_id: gr_id ?? null }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      const b = j.data as Bill;
      const ok = b.lines.filter((l) => l.level === "ok").length, mid = b.lines.filter((l) => l.level === "mid").length, no = b.lines.filter((l) => l.level === "no").length;
      toast.success(`อ่านบิลแล้ว ${b.lines.length} รายการ — มั่นใจ ${ok} · ให้เช็ก ${mid} · ไม่เจอ ${no} · ตรวจแล้วกดยืนยันทีละแถว`);
      setUploadKey(null);
      setDraft((p) => ({ ...p, [b.id]: b.lines }));
      await load();
    } catch (e) { toast.error("อ่านบิลไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };

  const patch = async (billId: string, mode: "save" | "rematch" | "apply") => {
    const lines = draft[billId] ?? [];
    if (mode === "apply") {
      const left = undecidedCount(lines);
      if (left > 0) { setMsg((m) => ({ ...m, [billId]: `ยังเหลือ ${left} แถวที่ยังไม่ได้เช็ก — กด ใช่ / เลือกจับคู่เอง / ข้าม ให้ครบก่อน` })); return; }
    }
    setBusy(billId);
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${voucherId}/seller-bills`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bill_id: billId, lines, rematch: mode === "rematch", apply: mode === "apply", remember }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      const b = j.data as Bill;
      setDraft((p) => ({ ...p, [billId]: b.lines }));
      if (mode === "apply" && j.applied) {
        const a = j.applied as { inserted: number; updated: number; expenses: number; remembered: number };
        toast.success(`ใส่ลงใบสำคัญแล้ว — เพิ่ม ${a.inserted} · ใส่ราคา ${a.updated}${a.expenses ? ` · ค่าใช้จ่าย ${a.expenses}` : ""}${a.remembered ? ` · จำคู่ไว้ ${a.remembered}` : ""}`);
        await onApplied();
      } else toast.success(mode === "rematch" ? "จับคู่ใหม่แล้ว" : "บันทึกแล้ว");
      await load();
    } catch (e) { toast.error((mode === "apply" ? "ใส่ลงใบไม่สำเร็จ: " : "บันทึกไม่สำเร็จ: ") + String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };

  const removeBill = async () => {
    if (!delBill) return;
    setBusy(delBill.id);
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${voucherId}/seller-bills?bill_id=${delBill.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      setDelBill(null); await load();
    } catch (e) { toast.error("ลบไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };

  const pickLine = pickFor ? draft[pickFor.billId]?.[pickFor.idx] : null;
  const pickList = useMemo(() => {
    const q = pickQ.trim().toLowerCase();
    return groups.filter((g) => !q || `${g.code} ${g.item_name} ${g.po_no}`.toLowerCase().includes(q)).slice(0, 200);
  }, [groups, pickQ]);
  const choose = (g: PoGroup) => {
    if (!pickFor) return;
    setLines(pickFor.billId, (ls) => ls.map((l, i) => (i === pickFor.idx ? { ...applyGroupToLine({ ...l, is_fee: false }, g, groups, [], true), decision: "confirmed" } : l)));
    setPickFor(null); setPickQ("");
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5">
          {open ? "▾" : "▸"} <Icon value="🧾" /> บิลจากร้าน (ภาษาจีน) {bills.length > 0 && <span className="font-normal text-slate-400">· {bills.length} ใบ</span>}
        </button>
        <span className="text-[11px] text-slate-400">อัปโหลดบิล → AI อ่านจีน + แปลไทย → จับคู่กับใบสั่งซื้อของร้านนี้เท่านั้น → เช็กทีละแถว → ใส่ลงใบ (ราคา ¥ จากบิล)</span>
      </div>
      {open && (
        <div className="mt-3 space-y-4">
          {!hasPartner && <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">ใบนี้ยังไม่ได้ผูกร้าน (คู่ค้า) — จับคู่ได้จากชื่อร้านในใบ และระบบจะยังไม่จำคู่ไว้ใช้ครั้งหน้า</div>}
          {groups.length === 0 && <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">ร้านนี้ไม่มีใบสั่งซื้อที่ยังค้าง (สกุลเดียวกับใบนี้) — บิลร้านจับคู่ได้เฉพาะของที่อยู่ในใบสั่งซื้อ</div>}
          {!readonly && (
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-64"><FileInput label="รูปหรือ PDF บิลร้าน" value={uploadKey} onChange={setUploadKey} folder="seller-bills" category="supplier_bills" /></div>
              <button onClick={() => uploadKey && void parse(uploadKey)} disabled={!uploadKey || busy === "parse"} className="h-9 px-4 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 inline-flex items-center gap-1.5">
                <Icon value="🔍" /> {busy === "parse" ? "กำลังอ่าน + จับคู่… (10-30 วิ)" : "อ่านบิล + จับคู่"}
              </button>
              {cands.filter((c) => !bills.some((b) => b.r2_key === c.r2_key)).map((c) => (
                <button key={`${c.gr_id}-${c.kind}`} onClick={() => void parse(c.r2_key, c.gr_id)} disabled={busy === "parse"} title="ไฟล์ที่แนบไว้ตอนรับของ — ให้ AI อ่านได้เลย ไม่ต้องอัปโหลดซ้ำ"
                  className="h-9 px-3 text-xs rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40">
                  อ่านจาก{c.kind === "bill" ? "บิล" : "ใบรับของ"} {c.gr_no}
                </button>
              ))}
            </div>
          )}
          {bills.length === 0 && <div className="text-xs text-slate-300 text-center py-3 border border-dashed border-slate-200 rounded-lg">— ยังไม่มีบิลร้าน —</div>}

          {bills.map((b) => {
            const lines = draft[b.id] ?? b.lines;
            const math = checkBillMath(lines, b.total_amount);
            const decided = lines.length - undecidedCount(lines);
            const url = fileUrls[b.r2_key] ?? undefined;
            const pdf = isPdfRef(b.r2_key);
            const ro = readonly || busy === b.id;
            return (
              <div key={b.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex items-start gap-3 px-3 py-2 bg-slate-50 flex-wrap">
                  {pdf
                    ? <a href={url} target="_blank" rel="noreferrer" className="w-12 h-14 rounded border border-slate-200 bg-white flex items-center justify-center text-[10px] font-semibold text-red-600">PDF</a>
                    : <HoverPreview url={url} previewW={560}><a href={url} target="_blank" rel="noreferrer" className="block w-12 h-14 rounded overflow-hidden border border-slate-200 bg-white">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt="" className="w-full h-full object-cover" /></a></HoverPreview>}
                  <div className="flex-1 min-w-[14rem]">
                    <div className="text-sm text-slate-800 font-medium">บิลร้าน {b.bill_no ? <span className="font-mono text-xs">No. {b.bill_no}</span> : null} <span className="text-xs font-normal text-slate-400">{b.bill_date ? `· ${formatDate(b.bill_date)}` : ""}</span>
                      <span className={`ml-2 ${b.status === "applied" ? CHIP_OK : CHIP_WARN}`}>{b.status === "applied" ? `ใส่ลงใบแล้ว ${b.applied_at ? formatDate(b.applied_at) : ""}` : "ยังไม่ได้ใส่ลงใบ"}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">ร้านในบิล: {b.seller_text ?? "—"}</div>
                    <div className="flex gap-1.5 flex-wrap mt-1.5">
                      <span className={CHIP_NEU}>อ่านได้ {lines.length} แถว</span>
                      {math.totalOk === true && <span className={CHIP_OK}>จำนวน × ราคา = ยอดรวมบิล ¥{n2(b.total_amount)} ตรง</span>}
                      {math.totalOk === false && <span className={CHIP_WARN}>รวมรายการ ¥{n2(math.sum)} ≠ ยอดบิล ¥{n2(b.total_amount)} — เช็กตัวเลข</span>}
                      {math.totalOk === null && <span className={CHIP_NEU}>รวม ¥{n2(math.sum)} (บิลไม่มียอดรวม)</span>}
                      {math.rowsBad.length > 0 && <span className={CHIP_WARN}>{math.rowsBad.length} แถว จำนวน × ราคา ≠ ยอด</span>}
                      <span className={CHIP_NEU}>ค้นใน PO ร้านนี้ {groups.length} รายการ</span>
                    </div>
                  </div>
                  {!readonly && <button onClick={() => setDelBill(b)} disabled={busy === b.id} title="ถอดบิลนี้" className="h-8 w-8 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50"><Icon value="🗑️" /></button>}
                </div>

                <div className="hidden md:grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1.2fr)_7.5rem] gap-2 px-3 py-1.5 text-[11px] text-slate-400 border-b border-slate-100">
                  <div>ในบิล (จีน → ไทย)</div><div /><div>จับคู่กับบรรทัดใบสั่งซื้อ</div><div className="text-right">เช็ก</div>
                </div>
                <div className="divide-y divide-slate-100">
                  {lines.map((l, i) => {
                    const g = l.match_key ? gByKey.get(l.match_key) : undefined;
                    const openLines = g ? g.lines.filter((x) => !x.from_gr).length : 0;
                    const done = l.decision === "confirmed" || l.decision === "skip" || l.decision === "expense";
                    const bad = math.rowsBad.includes(i);
                    return (
                      <div key={i} className={`grid md:grid-cols-[minmax(0,1fr)_16px_minmax(0,1.2fr)_7.5rem] gap-2 px-3 py-2 items-center ${done ? "bg-emerald-50/30" : l.level === "no" ? "bg-red-50/30" : ""} ${l.decision === "skip" ? "opacity-60" : ""}`}>
                        <div className="min-w-0">
                          <div className="text-sm text-slate-800 truncate" title={`${l.name_cn ?? ""} ${l.spec_cn ?? ""}`}>{l.name_cn ?? "—"} {l.spec_cn && <span className="text-slate-500">{l.spec_cn}</span>}</div>
                          <div className="text-[11px] text-slate-500 truncate">{[l.name_th, l.spec_th].filter(Boolean).join(" ") || "—"}</div>
                          <div className="flex items-center gap-1 mt-1 text-xs text-slate-600">
                            <input type="number" inputMode="decimal" step="any" min={0} value={l.qty ?? ""} disabled={ro} onChange={(e) => { const q = e.target.value === "" ? null : Number(e.target.value); setLine(b.id, i, { qty: q, amount: q != null && l.unit_price != null ? Math.round(q * l.unit_price * 100) / 100 : l.amount }); }} className={`${inp} w-16 ${bad ? "border-amber-300" : ""}`} title="จำนวนในบิล (แก้ได้ถ้า AI อ่านผิด)" />
                            <span>{l.unit ?? ""} × ¥</span>
                            <input type="number" inputMode="decimal" step="any" min={0} value={l.unit_price ?? ""} disabled={ro} onChange={(e) => { const p = e.target.value === "" ? null : Number(e.target.value); setLine(b.id, i, { unit_price: p, amount: p != null && l.qty != null ? Math.round(l.qty * p * 100) / 100 : l.amount }); }} className={`${inp} w-16 ${bad ? "border-amber-300" : ""}`} title="ราคาต่อหน่วยในบิล" />
                            <span>= <b className="font-medium text-slate-800">¥{n2(l.amount ?? (l.qty ?? 0) * (l.unit_price ?? 0))}</b></span>
                          </div>
                        </div>
                        <span className="hidden md:block text-slate-300 text-center">→</span>
                        <div className="min-w-0">
                          <LevelBadge l={l} />
                          {l.level === "fee" ? (
                            <div className="text-[11px] text-slate-500 mt-1">ค่าใช้จ่ายในบิล ไม่จับกับใบสั่งซื้อ — ข้าม หรือเพิ่มเป็นรายการค่าใช้จ่ายในใบ</div>
                          ) : g ? (
                            <div className="mt-1">
                              <div className="flex items-center gap-2 min-w-0">
                                {g.image_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={g.image_url} alt="" className="w-7 h-7 rounded object-cover border border-slate-100 shrink-0" />}
                                <div className="min-w-0">
                                  <div className="text-xs text-slate-800 truncate"><span className="font-mono text-[11px] text-slate-500 mr-1">{g.code || "—"}</span>{g.item_name}</div>
                                  <div className="text-[11px] text-slate-500 truncate">{g.po_no} · ค้าง {n2(g.remaining)} {g.uom ?? ""} · {g.unit_price != null ? `¥${n2(g.unit_price, 4)}` : "PO ไม่มีราคา"}{openLines > 1 && !g.lines.some((x) => x.from_gr) ? ` · แบ่งลง ${openLines} บรรทัด (ใบสั่งผลิตเก่าก่อน)` : ""}{g.lines.some((x) => x.from_gr) ? " · มาจากใบรับในใบนี้ (ใส่ราคาอย่างเดียว)" : ""}</div>
                                </div>
                              </div>
                              <div className="flex gap-1 flex-wrap mt-1">
                                {l.reasons.map((r) => <span key={r} className={CHIP_OK}>{r}</span>)}
                                {l.warns.map((w) => <span key={w} className={CHIP_WARN}>{w}</span>)}
                              </div>
                            </div>
                          ) : (
                            <div className="text-[11px] text-red-600 mt-1">ไม่พบในใบสั่งซื้อของร้านนี้ — เลือกจับคู่เองจากรายการ PO หรือข้าม</div>
                          )}
                        </div>
                        <div className="flex md:flex-col items-end gap-1">
                          {l.level === "fee" ? (<>
                            <button disabled={ro} onClick={() => setLine(b.id, i, { decision: l.decision === "expense" ? null : "expense" })} className={`h-7 px-2 text-[11px] rounded-md border ${l.decision === "expense" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"} disabled:opacity-50`}>{l.decision === "expense" ? "✓ เป็นค่าใช้จ่าย" : "เพิ่มเป็นค่าใช้จ่าย"}</button>
                            <button disabled={ro} onClick={() => setLine(b.id, i, { decision: l.decision === "skip" ? null : "skip" })} className="h-7 px-2 text-[11px] rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">{l.decision === "skip" ? "ยกเลิกข้าม" : "ข้าม"}</button>
                          </>) : (<>
                            {g && <button disabled={ro} onClick={() => setLine(b.id, i, { decision: l.decision === "confirmed" ? null : "confirmed" })} className={`h-7 px-2.5 text-[11px] font-medium rounded-md border ${l.decision === "confirmed" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-700 hover:bg-slate-50"} disabled:opacity-50`}>{l.decision === "confirmed" ? "✓ ยืนยันแล้ว" : "✓ ใช่"}</button>}
                            <button disabled={ro} onClick={() => { setPickFor({ billId: b.id, idx: i }); setPickQ(""); }} className={`h-7 px-2 text-[11px] rounded-md border ${g ? "border-slate-200 text-slate-600" : "border-blue-300 bg-blue-50 text-blue-700"} hover:bg-slate-50 disabled:opacity-50`}>{g ? "เปลี่ยน" : "เลือกจับคู่เอง"}</button>
                            <button disabled={ro} onClick={() => setLine(b.id, i, { decision: l.decision === "skip" ? null : "skip" })} className="h-6 px-1.5 text-[10px] text-slate-400 hover:text-slate-600 disabled:opacity-50">{l.decision === "skip" ? "ยกเลิกข้าม" : "ข้าม"}</button>
                          </>)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!readonly && (
                  <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-t border-slate-100 bg-slate-50/60">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-slate-300" /> จำคู่ที่ยืนยันไว้ ครั้งหน้าจับให้เอง</label>
                    <button onClick={() => void patch(b.id, "rematch")} disabled={busy === b.id} title="จับคู่ใหม่เฉพาะแถวที่ยังไม่ได้ตัดสิน (หลังแก้ตัวเลข/เพิ่ม PO)" className="h-8 px-2.5 text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40">จับคู่ใหม่</button>
                    <span className="flex-1" />
                    <button onClick={() => setLines(b.id, (ls) => ls.map((l) => (l.level === "ok" && l.match_key && !l.decision ? { ...l, decision: "confirmed" } : l)))} disabled={busy === b.id} className="h-8 px-2.5 text-xs rounded-md border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">ยืนยันทุกแถวที่มั่นใจสูง</button>
                    <button onClick={() => void patch(b.id, "save")} disabled={busy === b.id} className="h-8 px-2.5 text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40">บันทึก</button>
                    <button onClick={() => void patch(b.id, "apply")} disabled={busy === b.id} className="h-8 px-3 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                      {busy === b.id ? "กำลังบันทึก…" : `${b.status === "applied" ? "ใส่ลงใบอีกครั้ง" : "ใส่ลงใบสำคัญรับ"} (${decided}/${lines.length})`}
                    </button>
                    {msg[b.id] && <div className="basis-full text-[11px] text-red-600">{msg[b.id]}</div>}
                    <div className="basis-full text-[11px] text-slate-400">ใส่ลงใบ = ราคา ¥ จากบิล + ผูกบรรทัดใบสั่งซื้อ · ตอนกดยืนยันใบ ราคาจะเขียนกลับ PO / ราคาต่อร้าน ตามเดิม · รายการที่ไม่ได้มาจากใบรับของ จะยังไม่เข้าสต๊อกจนกว่าจะรับของ</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ป๊อปเลือกจับคู่เอง — เฉพาะบรรทัดใบสั่งซื้อที่ยังค้างของร้านนี้ */}
      {pickFor && pickLine && (
        <ERPModal open onClose={() => setPickFor(null)} size="lg" storageKey="pv-seller-bill-pick"
          title={`เลือกจับคู่: ${pickLine.name_cn ?? ""} ${pickLine.spec_cn ?? ""}`.trim()}
          description={`${[pickLine.name_th, pickLine.spec_th].filter(Boolean).join(" ")} · ${n2(pickLine.qty)} × ¥${n2(pickLine.unit_price, 4)}`}
          footer={<button onClick={() => setPickFor(null)} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ปิด</button>}>
          <p className="text-[11px] text-slate-500 mb-2">แสดงเฉพาะบรรทัดใบสั่งซื้อที่ยังค้างของร้านนี้ — สร้างสินค้าใหม่หรือเลือกของนอกใบสั่งซื้อไม่ได้</p>
          <input autoFocus value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder="ค้นรหัส ชื่อ หรือเลข PO" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg mb-2" />
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[55vh] overflow-y-auto">
            {pickList.map((g) => {
              const on = pickLine.match_key === g.key;
              return (
                <button key={g.key} onClick={() => choose(g)} className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm ${on ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                  <span className="w-9 h-9 rounded bg-slate-50 border border-slate-100 overflow-hidden shrink-0 flex items-center justify-center">{g.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={g.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-xs">—</span>}</span>
                  <span className="font-mono text-xs text-slate-500 w-28 shrink-0 truncate">{g.code || "—"}</span>
                  <span className="flex-1 min-w-0"><span className="block truncate text-slate-800">{g.item_name}</span><span className="block text-[11px] text-slate-400">{g.po_no}{g.order_date ? ` · ${formatDate(g.order_date)}` : ""}{g.lines.length > 1 ? ` · ${g.lines.length} บรรทัด` : ""}{g.in_voucher ? " · อยู่ในใบนี้แล้ว" : ""}</span></span>
                  <span className="text-xs text-slate-500 tabular-nums shrink-0 w-20 text-right">ค้าง {n2(g.remaining)}</span>
                  <span className="text-xs text-slate-700 tabular-nums shrink-0 w-16 text-right">{g.unit_price != null ? `¥${n2(g.unit_price, 4)}` : "—"}</span>
                </button>
              );
            })}
            {pickList.length === 0 && <div className="px-3 py-6 text-center text-xs text-slate-400">ไม่พบ ลองค้นคำอื่น (ค้นได้เฉพาะใบสั่งซื้อของร้านนี้)</div>}
          </div>
        </ERPModal>
      )}

      <ConfirmDialog open={!!delBill} onClose={() => setDelBill(null)} onConfirm={() => void removeBill()} variant="danger" loading={!!delBill && busy === delBill.id}
        title="ถอดบิลร้านนี้?" message="ผลที่ AI อ่านและการจับคู่ของบิลนี้จะหายไป · รายการที่ใส่ลงใบสำคัญแล้วยังอยู่ (ลบได้ที่ตารางรายการ)" confirmText="ถอดบิล" />
    </div>
  );
}
