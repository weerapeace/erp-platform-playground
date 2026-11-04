"use client";

/**
 * SellerBillIntake (ของกลาง) — "โยนรูปบิลร้าน → ออกใบสำคัญรับ" ในป๊อป ＋ ออกใบสำคัญรับ
 *   วาง / ลาก / Ctrl+V / ถ่ายรูปบิล (หลายรูป = หลายหน้าของบิลเดียวกัน · PDF ได้) → AI อ่านรอบเดียว
 *   → บิลแยกตามร้าน + ร้านในทะเบียนที่น่าจะใช่ (เหตุผล + %) → คนยืนยันร้าน (เปลี่ยน / เพิ่มร้านใหม่ได้)
 *   → กดสร้าง = ใบสำคัญร่างที่เติมร้าน/สกุล/วันที่/เรท + รายการจับคู่กับใบสั่งซื้อของร้านนั้นรอเช็ก (แผงบิลร้านในหน้าใบ)
 * ใช้: <SellerBillIntake onCreated={(ids) => …} onManual={() => …} />
 * API: /api/purchasing/seller-bills/intake · /create · logic lib/seller-bill-intake.ts · เอกสาร docs/seller-bill-match.md
 */
import { useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { useFileDrop, FileDropHint } from "@/components/file-drop";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { useFileRefUrls } from "@/components/file-ref";
import { SupplierPicker, usePartnerSuppliers } from "@/components/supplier-picker";
import { SupplierWizard } from "@/components/supplier-wizard";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { isPdfRef } from "@/lib/file-ref";
import { uploadFileByRule } from "@/lib/file-upload";
import type { SellerBillLine } from "@/lib/seller-bill-match";
import type { ShopCandidate } from "@/lib/seller-bill-shop";

type IntakeBill = {
  idx: number; is_bill: boolean;
  seller_text: string | null; seller_phone: string | null; seller_account: string | null;
  bill_no: string | null; bill_date: string | null; currency: "RMB" | "THB" | "USD"; total_amount: number | null; fx_rate: number | null;
  lines: SellerBillLine[]; fee_total: number;
  candidates: ShopCandidate[]; picked: ShopCandidate | null;
  duplicates: { partner_id: string | null; voucher_id: string; pv_no: string | null; status: string }[];
};
type Sel = { include: boolean; partner_id: string; partner_name: string; remember: boolean; dup_ok: boolean };
type FileItem = { ref: string; name: string };

const MAX_FILES = 6;
const n2 = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d }));
const sym = (c: string) => (c === "THB" ? "฿" : c === "USD" ? "$" : "¥");
const chip = "inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap";
const C_OK = `${chip} bg-emerald-50 text-emerald-700 border-emerald-200`;
const C_WARN = `${chip} bg-amber-50 text-amber-700 border-amber-200`;
const C_NEU = `${chip} bg-slate-50 text-slate-600 border-slate-200`;
const C_BAD = `${chip} bg-red-50 text-red-700 border-red-200`;

export function SellerBillIntake({ onCreated, onManual }: { onCreated: (voucherIds: string[]) => void | Promise<void>; onManual: () => void }) {
  const toast = useToast();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const [reading, setReading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [bills, setBills] = useState<IntakeBill[] | null>(null);
  const [unreadable, setUnreadable] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<number, Sel>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [wizardFor, setWizardFor] = useState<number | null>(null);
  const [blankShop, setBlankShop] = useState<{ id: string; name: string } | null>(null);
  const [openLines, setOpenLines] = useState<Record<number, boolean>>({});
  const [suppliers, setSuppliers] = usePartnerSuppliers(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = useFileRefUrls(files.map((f) => f.ref));
  const busy = !!up || reading || creating;

  // ── แนบไฟล์ (ปุ่ม / ลากวาง / Ctrl+V) → อัปตามกฎที่เก็บไฟล์ (หมวดบิลซัพพลายเออร์) → อ่านอัตโนมัติ ──
  const addFiles = async (list: File[]) => {
    const ok = list.filter((f) => /^image\//.test(f.type) || f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (ok.length === 0) { toast.error("แนบได้เฉพาะรูป (JPG/PNG/WebP) หรือ PDF"); return; }
    const room = MAX_FILES - files.length;
    if (room <= 0) { toast.error(`แนบได้ครั้งละไม่เกิน ${MAX_FILES} ไฟล์`); return; }
    const take = ok.slice(0, room);
    const added: FileItem[] = [];
    for (const [i, file] of take.entries()) {
      setUp({ name: file.name, size: file.size, pct: null, count: take.length > 1 ? { current: i + 1, total: take.length } : undefined });
      try {
        const ref = await uploadFileByRule({ category: "supplier_bills", file, r2Folder: "seller-bills", onProgress: (pct) => setUp((u) => u && { ...u, pct }) });
        added.push({ ref, name: file.name });
      } catch (e) {
        if (!(e as { aborted?: boolean }).aborted) toast.error(`อัปโหลด ${file.name} ไม่สำเร็จ: ${String((e as Error).message ?? e)}`);
      }
    }
    setUp(null);
    if (added.length === 0) return;
    const next = [...files, ...added];
    setFiles(next);
    await read(next);
  };
  const drop = useFileDrop((list) => void addFiles(list), { accept: ["image/", "application/pdf"], disabled: busy, onReject: () => toast.error("แนบได้เฉพาะรูปหรือ PDF"), onBusy: () => toast.info("รอให้งานเดิมเสร็จก่อน") });
  const onPaste = (e: React.ClipboardEvent) => {
    const list = Array.from(e.clipboardData?.files ?? []);
    if (list.length && !busy) { e.preventDefault(); void addFiles(list); }
  };

  // ── AI อ่านไฟล์ทั้งหมดรอบเดียว ──
  const read = async (list: FileItem[] = files) => {
    if (list.length === 0) return;
    setReading(true); setMsg(null); setUnreadable(null);
    try {
      const res = await apiFetch("/api/purchasing/seller-bills/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refs: list.map((f) => f.ref) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      const bs = (j.bills ?? []) as IntakeBill[];
      setBills(bs);
      setUnreadable(bs.length ? null : String(j.unreadable_reason ?? "อ่านไม่ได้"));
      const s: Record<number, Sel> = {};
      for (const b of bs) s[b.idx] = { include: true, partner_id: b.picked?.partner_id ?? "", partner_name: b.picked?.name ?? "", remember: true, dup_ok: false };
      setSel(s);
    } catch (e) { setBills(null); setUnreadable(String((e as Error).message ?? e)); }
    finally { setReading(false); }
  };
  const reset = () => { setFiles([]); setBills(null); setUnreadable(null); setSel({}); setMsg(null); setBlankShop(null); };
  const setS = (idx: number, p: Partial<Sel>) => { setSel((m) => ({ ...m, [idx]: { ...m[idx], ...p } })); setMsg(null); };

  const chosen = useMemo(() => (bills ?? []).filter((b) => sel[b.idx]?.include), [bills, sel]);
  const dupOf = (b: IntakeBill) => b.duplicates.find((d) => d.partner_id && d.partner_id === sel[b.idx]?.partner_id) ?? null;

  // ── สร้างใบสำคัญ (1 บิล = 1 ใบ) ──
  const create = async (items: Record<string, unknown>[]) => {
    setCreating(true);
    try {
      const res = await apiFetch("/api/purchasing/seller-bills/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      const created = (j.created ?? []) as { voucher_id: string; ok: number; mid: number; no: number; shop_filled: string[] }[];
      const sum = created.reduce((a, c) => ({ ok: a.ok + c.ok, mid: a.mid + c.mid, no: a.no + c.no }), { ok: 0, mid: 0, no: 0 });
      const filled = [...new Set(created.flatMap((c) => c.shop_filled))];
      toast.success(`สร้างใบสำคัญรับ ${created.length} ใบ — รายการมั่นใจ ${sum.ok} · ให้เช็ก ${sum.mid} · ไม่เจอ ${sum.no}${filled.length ? ` · จำ${filled.join("/")}ของร้านไว้แล้ว` : ""}`);
      if ((j.errors ?? []).length) toast.error(`บางใบสร้างไม่สำเร็จ — ${(j.errors as string[]).join(" · ")}`);
      await onCreated(created.map((c) => c.voucher_id));
    } catch (e) { toast.error("สร้างใบไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setCreating(false); }
  };
  const createAll = () => {
    if (chosen.length === 0) { setMsg("ติ๊กเลือกบิลที่จะออกใบอย่างน้อย 1 ใบ"); return; }
    const noShop = chosen.find((b) => !sel[b.idx]?.partner_id);
    if (noShop) { setMsg(`บิล "${noShop.seller_text ?? `ที่ ${noShop.idx + 1}`}" ยังไม่ได้เลือกร้าน — เลือกจากทะเบียน หรือเพิ่มร้านใหม่`); return; }
    const dup = chosen.find((b) => dupOf(b) && !sel[b.idx]?.dup_ok);
    if (dup) { setMsg(`บิล No. ${dup.bill_no} ของร้านนี้เคยออกใบสำคัญแล้ว — เปิดใบเดิม หรือติ๊ก "ออกใหม่อยู่ดี"`); return; }
    void create(chosen.map((b) => ({
      partner_id: sel[b.idx].partner_id, refs: files.map((f) => f.ref), currency: b.currency, bill_no: b.bill_no, bill_date: b.bill_date,
      seller_text: b.seller_text, seller_phone: b.seller_phone, seller_account: b.seller_account, total_amount: b.total_amount, lines: b.lines, remember_shop: sel[b.idx].remember,
    })));
  };
  const createBlank = () => {
    if (!blankShop) { setMsg("เลือกร้านก่อน"); return; }
    void create([{ partner_id: blankShop.id, refs: files.map((f) => f.ref), currency: "RMB", lines: [], remember_shop: false }]);
  };

  const wizBill = wizardFor != null ? (bills ?? []).find((b) => b.idx === wizardFor) ?? null : null;

  return (
    <div className="space-y-3" onPaste={onPaste} {...drop.guard}>
      {/* ช่องแนบ */}
      <div {...drop.zone("bill")} onClick={() => !busy && inputRef.current?.click()}
        className={`relative rounded-xl border border-dashed px-4 py-4 text-center cursor-pointer transition ${drop.over === "bill" ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:bg-slate-50"} ${busy ? "pointer-events-none opacity-70" : ""}`}>
        <FileDropHint show={drop.over === "bill"} label="วางรูปบิลที่นี่" />
        <div className="text-2xl text-slate-400"><Icon value="📷" /></div>
        <div className="text-sm text-slate-700 mt-1">ลาก / วาง (Ctrl+V) / กดเพื่อเลือกหรือถ่ายรูปบิล</div>
        <div className="text-[11px] text-slate-400">หลายรูปได้ (หลายหน้าของบิลเดียวกัน · ไม่เกิน {MAX_FILES}) · PDF ได้ · AI อ่านร้าน สกุล วันที่ รายการ ให้เอง</div>
        <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ""; if (l.length) void addFiles(l); }} />
      </div>
      {up && <UploadProgress {...up} />}

      {files.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {files.map((f) => (
            <div key={f.ref} className="relative w-14 h-16 rounded border border-slate-200 bg-white overflow-hidden">
              {isPdfRef(f.ref) ? <div className="w-full h-full flex items-center justify-center text-[10px] font-semibold text-red-600">PDF</div>
                : /* eslint-disable-next-line @next/next/no-img-element */ <img src={urls[f.ref] ?? undefined} alt="" className="w-full h-full object-cover" />}
              {!busy && <button type="button" title="เอาไฟล์นี้ออก" onClick={() => { setFiles((l) => l.filter((x) => x.ref !== f.ref)); setBills(null); setUnreadable(null); }} className="absolute top-0 right-0 w-5 h-5 bg-white/90 text-slate-500 hover:text-red-600 text-xs">✕</button>}
            </div>
          ))}
          {!busy && <button type="button" onClick={() => void read()} className="h-8 px-3 text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">อ่านอีกครั้ง</button>}
          {!busy && <button type="button" onClick={reset} className="h-8 px-3 text-xs rounded-md text-slate-400 hover:text-slate-600">เริ่มใหม่</button>}
        </div>
      )}
      {reading && <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">กำลังอ่านบิล + หาร้านในทะเบียน… (10–40 วินาที)</div>}

      {/* อ่านไม่ได้ / ไม่ใช่บิล */}
      {unreadable && !reading && (
        <div className="border border-red-200 bg-red-50/40 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap"><span className={C_BAD}>อ่านไม่ได้</span><span className="text-xs text-slate-600">{unreadable}</span></div>
          <div className="text-[11px] text-slate-500">ลองถ่ายให้ตรง/ชัดขึ้นแล้วอ่านอีกครั้ง หรือสร้างใบเปล่าแล้วพิมพ์เอง — รูปที่แนบไว้จะเก็บไว้ในใบ</div>
          {files.length > 0 && (
            <div className="flex items-end gap-2 flex-wrap">
              <div className="w-72"><label className="block text-[11px] text-slate-500 mb-0.5">ร้าน</label>
                <SupplierPicker value={blankShop?.id ?? ""} suppliers={suppliers} onChange={(id, name) => setBlankShop(id ? { id, name } : null)} placeholder="— เลือกร้านจากทะเบียน —" /></div>
              <button type="button" onClick={createBlank} disabled={creating} className="h-9 px-3 text-xs rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">{creating ? "กำลังสร้าง…" : "สร้างเปล่า (แนบรูปนี้ไว้)"}</button>
              <button type="button" onClick={onManual} className="h-9 px-2 text-xs text-slate-500 hover:text-slate-700">หรือไปแท็บสร้างเปล่า</button>
            </div>
          )}
        </div>
      )}

      {/* ผลอ่าน: 1 บิล = 1 การ์ด (รูปเดียวหลายร้าน = หลายการ์ด) */}
      {bills && bills.length > 0 && !reading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={C_OK}>อ่านแล้ว {files.length} ไฟล์ = {bills.length} บิล</span>
            {bills.length > 1 && <span className={C_WARN}>พบ {bills.length} ร้าน — แยกเป็นใบสำคัญร้านละใบ (ติ๊กเลือกได้)</span>}
          </div>
          {bills.map((b) => {
            const s = sel[b.idx] ?? { include: true, partner_id: "", partner_name: "", remember: true, dup_ok: false };
            const dup = dupOf(b);
            const items = b.lines.filter((l) => !l.is_fee);
            const sum = b.total_amount ?? b.lines.reduce((a, l) => a + Number(l.amount ?? (l.qty ?? 0) * (l.unit_price ?? 0)), 0);
            return (
              <div key={b.idx} className={`border rounded-lg p-3 ${s.include ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-70"}`}>
                <div className="flex items-start gap-2">
                  {bills.length > 1 && <input type="checkbox" checked={s.include} onChange={(e) => setS(b.idx, { include: e.target.checked })} className="mt-1 rounded border-slate-300" title="ออกใบนี้" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-slate-400">ร้านในบิล</div>
                    <div className="text-sm text-slate-800">{b.seller_text ?? "— (บิลไม่ได้พิมพ์ชื่อร้าน)"}{b.seller_phone && <span className="text-[11px] text-slate-500 ml-2">โทร {b.seller_phone}</span>}{b.seller_account && <span className="text-[11px] text-slate-500 ml-2">บัญชี {b.seller_account}</span>}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{b.bill_no ? `No. ${b.bill_no} · ` : ""}{b.bill_date ? `${formatDate(b.bill_date)} · ` : ""}{items.length} รายการ · รวม {sym(b.currency)}{n2(sum)}</div>

                    {/* ร้านที่น่าจะใช่ — กดเลือก · คนยืนยันเสมอ */}
                    <div className="mt-2 space-y-1">
                      {!b.picked && b.candidates.length > 0 && (
                        <div className="text-[11px] text-amber-700">ระบบไม่แน่ใจพอจะเลือกให้ — กดเลือกร้านที่ถูกเอง{b.candidates.length > 1 && b.candidates[1].score >= 0.5 ? " · ทะเบียนอาจมีร้านซ้ำ (ชื่อคล้ายกันหลายร้าน)" : ""}</div>
                      )}
                      {b.candidates.map((c) => {
                        const on = s.partner_id === c.partner_id;
                        const sure = b.picked?.partner_id === c.partner_id;   // "มั่นใจ" เฉพาะร้านที่ระบบเลือกให้ (ทิ้งห่างร้านอื่นพอ)
                        return (
                          <button key={c.partner_id} type="button" onClick={() => setS(b.idx, { partner_id: c.partner_id, partner_name: c.name })}
                            className={`w-full text-left flex items-center gap-1.5 flex-wrap px-2 py-1.5 rounded-md border text-xs ${on ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                            <span className={`w-3.5 h-3.5 rounded-full border ${on ? "border-blue-600 bg-blue-600" : "border-slate-300"}`} />
                            <b className="font-medium text-slate-800">{c.name}</b>
                            <span className={sure ? C_OK : C_WARN}>{sure ? "มั่นใจ" : "อาจใช่"} {Math.round(c.score * 100)}%</span>
                            {c.reasons.map((r) => <span key={r} className={C_NEU}>{r}</span>)}
                          </button>
                        );
                      })}
                      {b.candidates.length === 0 && <div className="flex items-center gap-2"><span className={C_BAD}>ไม่เจอในทะเบียนร้าน</span><span className="text-[11px] text-slate-500">เลือกจากทะเบียน หรือเพิ่มร้านใหม่</span></div>}
                      <div className="flex items-end gap-2 flex-wrap pt-1">
                        <div className="w-72"><SupplierPicker value={s.partner_id} suppliers={suppliers} onChange={(id, name) => setS(b.idx, { partner_id: id, partner_name: name })} onAddNew={() => setWizardFor(b.idx)} placeholder="เปลี่ยนร้าน — เลือกจากทะเบียน" /></div>
                        <button type="button" onClick={() => setWizardFor(b.idx)} className="h-9 px-3 text-xs rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">＋ เพิ่มร้านใหม่</button>
                      </div>
                      {s.partner_id && <div className="text-[11px] text-emerald-700">ออกใบให้ร้าน: <b className="font-medium">{s.partner_name || suppliers.find((x) => x.id === s.partner_id)?.name || "—"}</b></div>}
                    </div>

                    <div className="flex gap-1.5 flex-wrap mt-2">
                      <span className={C_NEU}>สกุล {b.currency === "RMB" ? "¥ หยวน" : b.currency === "THB" ? "฿ บาท" : b.currency} (จากบิล)</span>
                      {b.currency !== "THB" && <span className={C_NEU}>เรท {b.fx_rate != null ? n2(b.fx_rate, 3) : "— (ยังไม่มีเรท)"} {b.bill_date ? "(วันที่บิล)" : "(ล่าสุด)"}</span>}
                      {b.fee_total > 0 && <span className={C_NEU}>ค่าส่งในจีน/ค่ากล่อง {sym(b.currency)}{n2(b.fee_total)} → เลือกในหน้าใบว่าข้ามหรือเป็นค่าใช้จ่าย</span>}
                    </div>
                    {dup && (
                      <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
                        <span className={C_WARN}>บิลนี้เคยออกใบสำคัญแล้ว</span>
                        <span className="text-slate-600">No. {b.bill_no} → {dup.pv_no ?? "ใบร่าง"}</span>
                        <a href={`/purchasing/vouchers/${dup.voucher_id}`} className="text-blue-600 hover:underline">เปิดใบเดิม</a>
                        <label className="flex items-center gap-1 text-slate-600"><input type="checkbox" checked={s.dup_ok} onChange={(e) => setS(b.idx, { dup_ok: e.target.checked })} className="rounded border-slate-300" /> ออกใหม่อยู่ดี</label>
                      </div>
                    )}
                    <button type="button" onClick={() => setOpenLines((m) => ({ ...m, [b.idx]: !m[b.idx] }))} className="mt-2 text-[11px] text-slate-500 hover:text-slate-700">{openLines[b.idx] ? "▾" : "▸"} ดูรายการที่อ่านได้ ({b.lines.length})</button>
                    {openLines[b.idx] && (
                      <div className="mt-1 border border-slate-100 rounded-md divide-y divide-slate-100 max-h-48 overflow-y-auto">
                        {b.lines.map((l, i) => (
                          <div key={i} className="flex items-center gap-2 px-2 py-1 text-[11px]">
                            <span className="flex-1 min-w-0 truncate text-slate-800">{l.name_cn} {l.spec_cn}<span className="text-slate-400 ml-1">{[l.name_th, l.spec_th].filter(Boolean).join(" ")}</span></span>
                            {l.is_fee && <span className={C_NEU}>ค่าใช้จ่าย</span>}
                            <span className="tabular-nums text-slate-600 shrink-0">{n2(l.qty)} × {sym(b.currency)}{n2(l.unit_price, 4)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 mt-2" title="เติมเฉพาะช่องที่ยังว่างในทะเบียนร้าน (ไม่ทับของเดิม) — ครั้งหน้าจับร้านจากบิลได้ทันที และใช้ต่อที่แอปโอนเงินจีน">
                      <input type="checkbox" checked={s.remember} onChange={(e) => setS(b.idx, { remember: e.target.checked })} className="rounded border-slate-300" /> จำชื่อจีน / เบอร์ / เลขบัญชีของร้านนี้ไว้ (เติมเฉพาะช่องที่ยังว่าง)
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
          {msg && <div className="text-[11px] text-red-600">{msg}</div>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <span className="text-[11px] text-slate-400 mr-auto">สร้างแล้วจะเปิดหน้าใบสำคัญ — รายการจับคู่กับใบสั่งซื้อของร้านนั้นรอให้เช็ก</span>
            <button type="button" onClick={createAll} disabled={creating} className="h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {creating ? "กำลังสร้าง + จับคู่… (10–30 วิ)" : chosen.length > 1 ? `สร้างใบสำคัญรับ ${chosen.length} ใบ →` : "สร้างใบสำคัญรับ + จับคู่รายการ →"}
            </button>
          </div>
        </div>
      )}

      {/* เพิ่มร้านใหม่ — ตัวช่วยเดิม เติมข้อมูลที่ AI อ่านได้ให้ */}
      {wizBill && (
        <SupplierWizard onClose={() => setWizardFor(null)} role="supplier" initialName={wizBill.seller_text ?? ""}
          prefill={{ company_name: wizBill.seller_text ?? undefined, phone: wizBill.seller_phone ?? undefined, account_number: wizBill.seller_account?.replace(/\s+/g, "") || undefined, shop_country: "จีน", currency: "RMB", notes: wizBill.bill_no ? `เพิ่มจากบิลร้าน No. ${wizBill.bill_no}` : "เพิ่มจากบิลร้าน" }}
          onCreated={(p) => { setSuppliers((l) => [...l, { id: p.id, name: p.name, cn: true }]); setS(wizBill.idx, { partner_id: p.id, partner_name: p.name }); setWizardFor(null); toast.success(`เพิ่มร้าน ${p.name} แล้ว`); }} />
      )}
    </div>
  );
}
