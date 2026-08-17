"use client";
/**
 * ป๊อปบันทึกการจ่ายเงินกู้ — ใช้เป็น customCreate ของหน้า /loan-payments
 * และเปิดจากหมวด "ความคืบหน้าการผ่อน" ในหน้าสัญญาได้ด้วย
 *
 * แยกยอดตามใบเสร็จธนาคารได้ (เจ้าของขอ): เงินต้น · ดอกเบี้ย · ดอกเบี้ยผิดนัดชำระ · ค่าธรรมเนียม
 *   - แยกแล้ว → ระบบตัดตามช่องที่กรอก (ผลรวมต้องเท่ากับยอดจ่ายรวม)
 *   - ไม่แยก  → ระบบตัดดอกเบี้ยก่อนแล้วเงินต้นให้เอง (พฤติกรรมเดิม)
 * ช่องเงินใช้ของกลาง MoneyInput (มีลูกน้ำ) · ป้ายสัญญาโชว์เลขที่บัญชีด้วย
 * แนบรูปใบเสร็จแล้วกด "อ่านจากรูป" ให้ AI กรอกยอดให้ได้ (ตัวช่วย — ต้องตรวจก่อนบันทึกเสมอ)
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPFormField, ERPInput, ERPSelect } from "@/components/form";
import { MoneyInput } from "@/components/money-input";
import { ImageInput } from "@/components/image-input";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/money";

type ContractOpt = { id: string; loan_code: string; loan_name: string; contract_no: string; lender_name: string; outstanding: number; payment_method: string };

/** วิธีจ่าย — ป้ายเดียวกับทะเบียนฟิลด์ (options.labels ของ payment_method) */
const METHOD_OPTS = [
  { value: "auto_debit", label: "หักบัญชีอัตโนมัติ" },
  { value: "transfer",   label: "โอนเงิน" },
  { value: "counter",    label: "จ่ายที่เคาน์เตอร์ธนาคาร" },
  { value: "cheque",     label: "เช็ค" },
  { value: "cash",       label: "เงินสด" },
  { value: "other",      label: "อื่น ๆ" },
];

/** ประเภทรายการจ่ายที่ตั้งไว้ที่ /loan-charge-types (แต่ละธนาคารมีไม่เหมือนกัน) */
type ChargeType = { id: string; name: string; bucket: string; lender_name: string; sort_order: number };

/** แถวรายการเพิ่มเติมในป๊อป (มาจากประเภทที่ตั้งไว้ หรือผู้ใช้พิมพ์เอง) */
type ExtraLine = { key: string; charge_type_id: string | null; label: string; bucket: string; amount: string };

const BUCKET_OPTS = [
  { value: "fee",       label: "ค่าธรรมเนียม" },
  { value: "interest",  label: "ดอกเบี้ย" },
  { value: "penalty",   label: "ดอกเบี้ยผิดนัดชำระ" },
  { value: "principal", label: "เงินต้น" },
  { value: "other",     label: "อื่น ๆ (ไม่ตัดเข้างวด)" },
];
const bucketLabel = (b: string) => BUCKET_OPTS.find((x) => x.value === b)?.label ?? b;

const n2 = (v: string) => { const n = Number(v); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };

/** ป้ายสัญญา: รหัส — ชื่อ · เลขที่บัญชี (เจ้าของขอให้เห็นเลขบัญชีด้วย) */
const contractLabel = (c: ContractOpt) =>
  `${c.loan_code} — ${c.loan_name}${c.contract_no ? ` · บัญชี ${c.contract_no}` : ""}`;

const SPLIT_FIELDS = [
  { key: "principal", label: "เงินต้น", hint: "ส่วนที่ตัดเงินต้น" },
  { key: "interest",  label: "ดอกเบี้ย", hint: "ดอกเบี้ยตามปกติ" },
  { key: "penalty",   label: "ดอกเบี้ยผิดนัดชำระ", hint: "ดอกเบี้ยปรับกรณีจ่ายช้า" },
  { key: "fee",       label: "ค่าธรรมเนียม", hint: "ค่าธรรมเนียมที่เก็บพร้อมงวด" },
] as const;

type SplitKey = typeof SPLIT_FIELDS[number]["key"];

const EMPTY = {
  contract_id: "", payment_date: "", amount: "", paid_from: "", reference: "",
  principal: "", interest: "", penalty: "", fee: "",
  receipt_no: "", payment_method: "",
};

const moneyCls = "w-full h-9 px-3 text-sm tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500";

export function RecordPaymentModal({
  open, onClose, onCreated, contractId,
}: {
  open: boolean; onClose: () => void; onCreated: () => void;
  /** ล็อกสัญญาไว้ล่วงหน้า (เปิดจากในหน้าสัญญา) — ไม่ต้องให้ผู้ใช้เลือกซ้ำ */
  contractId?: string | null;
}) {
  const [contracts, setContracts] = useState<ContractOpt[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ ...EMPTY });
  const [chargeTypes, setChargeTypes] = useState<ChargeType[]>([]);
  const [extra, setExtra] = useState<ExtraLine[]>([]);
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState("");

  // เปิดจากหน้าสัญญา → ตั้งสัญญาให้เลย
  useEffect(() => {
    if (open && contractId) setF((p) => ({ ...p, contract_id: contractId }));
  }, [open, contractId]);

  useEffect(() => {
    if (!open) return;
    setErr("");
    setLoadingList(true);
    apiFetch("/api/master-v2/loan-contracts?limit=500")
      .then((r) => r.json())
      .then((j) => {
        const rows = (j?.data ?? []) as Record<string, unknown>[];
        setContracts(rows.map((r) => ({
          id: String(r.id), loan_code: String(r.loan_code ?? ""), loan_name: String(r.loan_name ?? ""),
          contract_no: String(r.contract_no ?? ""),
          lender_name: String(r.lender_name ?? ""),
          outstanding: Number(r.outstanding_principal ?? 0),
          payment_method: String(r.payment_method ?? ""),
        })));
      })
      .catch(() => setErr("โหลดรายชื่อสัญญาไม่สำเร็จ"))
      .finally(() => setLoadingList(false));

    // ประเภทรายการจ่ายที่ตั้งไว้ (ตั้งค่าเพิ่มเองได้ที่ /loan-charge-types)
    apiFetch("/api/master-v2/loan-charge-types?limit=200&sort_by=sort_order&sort_dir=asc")
      .then((r) => r.json())
      .then((j) => {
        const rows = (j?.data ?? []) as Record<string, unknown>[];
        setChargeTypes(rows.map((r) => ({
          id: String(r.id), name: String(r.name ?? ""), bucket: String(r.bucket ?? "fee"),
          lender_name: String(r.lender_name ?? ""), sort_order: Number(r.sort_order ?? 100),
        })));
      })
      .catch(() => { /* ไม่มีก็ยังบันทึกได้ตามปกติ */ });
  }, [open]);

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const selected = contracts.find((c) => c.id === f.contract_id);

  // เลือกสัญญาแล้ว + ยังไม่ได้เลือกวิธีจ่าย → ใช้วิธีจ่ายประจำของสัญญานั้น
  useEffect(() => {
    if (selected?.payment_method && !f.payment_method) set("payment_method", selected.payment_method);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // ผลรวมของช่องที่แยก เทียบกับยอดจ่ายรวม
  const total = n2(f.amount);
  const extraTotal = useMemo(
    () => Math.round(extra.reduce((a, l) => a + n2(l.amount), 0) * 100) / 100,
    [extra],
  );
  const split = useMemo(
    () => Math.round((SPLIT_FIELDS.reduce((a, s) => a + n2(f[s.key]), 0) + extraTotal) * 100) / 100,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.principal, f.interest, f.penalty, f.fee, extraTotal],
  );
  const hasSplit = split > 0;
  const diff = Math.round((total - split) * 100) / 100;
  const splitBad = hasSplit && Math.abs(diff) > 0.01;

  // ประเภทรายการที่ใช้ได้กับสัญญานี้ = ของธนาคารนั้น + ของกลาง (เว้นชื่อธนาคารว่าง)
  const lender = (selected?.lender_name ?? "").trim();
  const usableTypes = useMemo(
    () => chargeTypes
      .filter((t) => !t.lender_name.trim() || t.lender_name.trim() === lender)
      .filter((t) => !extra.some((l) => l.charge_type_id === t.id))
      .sort((a, b) => a.sort_order - b.sort_order),
    [chargeTypes, lender, extra],
  );

  const addLine = (t?: ChargeType) => setExtra((p) => [...p, {
    key: `x-${Date.now()}-${p.length}`,
    charge_type_id: t?.id ?? null,
    label: t?.name ?? "",
    bucket: t?.bucket ?? "fee",
    amount: "",
  }]);
  const setLine = (key: string, patch: Partial<ExtraLine>) =>
    setExtra((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setExtra((p) => p.filter((l) => l.key !== key));

  /** เติมส่วนที่ยังขาดลงช่องเงินต้น (ธนาคารมักบอกดอกเบี้ยมา ที่เหลือคือเงินต้น) */
  const fillRest = () => {
    if (diff <= 0) return;
    set("principal", String(Math.round((n2(f.principal) + diff) * 100) / 100));
  };

  /** ให้ AI อ่านรูปใบเสร็จแล้วกรอกช่องให้ — ผู้ใช้ตรวจ/แก้ก่อนกดบันทึกเสมอ */
  const readReceipt = async () => {
    if (!imageKey) return;
    setReading(true); setErr(""); setReadNote("");
    try {
      const res = await apiFetch("/api/loan-payment/read-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: imageKey }),
      });
      const j = await res.json();
      if (j?.error) { setReadNote(`อ่านรูปไม่ได้: ${j.error} — กรอกเองได้เลย`); setReading(false); return; }

      const num = (v: unknown) => (Number(v) > 0 ? String(Number(v)) : "");
      setF((p) => ({
        ...p,
        amount:      num(j.total)     || p.amount,
        principal:   num(j.principal) || p.principal,
        interest:    num(j.interest)  || p.interest,
        penalty:     num(j.penalty)   || p.penalty,
        fee:         num(j.fee)       || p.fee,
        payment_date: (j.payment_date as string) || p.payment_date,
        receipt_no:   (j.receipt_no as string)   || p.receipt_no,
      }));

      const got = [
        Number(j.total) > 0 ? "ยอดรวม" : "",
        Number(j.principal) > 0 ? "เงินต้น" : "",
        Number(j.interest) > 0 ? "ดอกเบี้ย" : "",
        Number(j.penalty) > 0 ? "ดอกผิดนัด" : "",
        Number(j.fee) > 0 ? "ค่าธรรมเนียม" : "",
        j.payment_date ? "วันที่" : "",
        j.receipt_no ? "เลขที่ใบเสร็จ" : "",
      ].filter(Boolean);
      setReadNote(got.length
        ? `อ่านได้: ${got.join(" · ")} — กรุณาตรวจตัวเลขก่อนบันทึก${j.split_matches === false ? " ⚠ ยอดแยกรวมไม่ตรงกับยอดรวมที่อ่านได้" : ""}`
        : "อ่านตัวเลขจากรูปนี้ไม่ได้ — กรอกเองได้เลย");
    } catch {
      setReadNote("อ่านรูปไม่สำเร็จ — กรอกเองได้เลย");
    } finally {
      setReading(false);
    }
  };

  const submit = async () => {
    setErr("");
    if (!f.contract_id) { setErr("กรุณาเลือกสัญญาเงินกู้"); return; }
    if (total <= 0) { setErr("กรุณาระบุยอดจ่าย"); return; }
    if (splitBad) { setErr(`ยอดที่แยก ${formatAmount(split)} ไม่เท่ากับยอดจ่ายรวม ${formatAmount(total)}`); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/loan-payment/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract_id: f.contract_id,
          payment_date: f.payment_date || null,
          amount: total,
          paid_from: f.paid_from,
          reference: f.reference,
          principal: n2(f.principal), interest: n2(f.interest),
          penalty: n2(f.penalty), fee: n2(f.fee),
          receipt_no: f.receipt_no, receipt_image: imageKey ?? "",
          payment_method: f.payment_method,
          lines: extra
            .filter((l) => n2(l.amount) > 0)
            .map((l) => ({ charge_type_id: l.charge_type_id, label: l.label, bucket: l.bucket, amount: n2(l.amount) })),
        }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) { setErr(j?.error || "บันทึกไม่สำเร็จ"); setSaving(false); return; }
      setSaving(false);
      setF({ ...EMPTY, contract_id: contractId ?? "" });
      setImageKey(null); setReadNote(""); setExtra([]);
      onCreated();
    } catch {
      setErr("เกิดข้อผิดพลาดในการเชื่อมต่อ");
      setSaving(false);
    }
  };

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title="บันทึกการจ่ายเงินกู้"
      description="ใส่ยอดรวมอย่างเดียวก็ได้ (ระบบตัดดอกเบี้ยก่อนแล้วเงินต้นให้) หรือแยกตามใบเสร็จธนาคารก็ได้"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={submit} disabled={saving || splitBad} className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "บันทึก + ตัดยอด"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {err}</div>}

        {contractId ? (
          <ERPFormField label="สัญญาเงินกู้">
            <div className="h-9 flex items-center px-3 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg">
              {selected ? contractLabel(selected) : "กำลังโหลด..."}
            </div>
          </ERPFormField>
        ) : (
          <ERPFormField label="สัญญาเงินกู้" required>
            <ERPSelect
              value={f.contract_id}
              onChange={(e) => set("contract_id", e.target.value)}
              options={contracts.map((c) => ({ value: c.id, label: contractLabel(c) }))}
              placeholder={loadingList ? "กำลังโหลด..." : "— เลือกสัญญา —"}
            />
          </ERPFormField>
        )}

        {selected && (
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            เงินต้นคงเหลือปัจจุบัน: <b className="text-slate-700 tabular-nums">{formatAmount(selected.outstanding)}</b>
            {selected.contract_no && <span className="ml-2 text-slate-400">· เลขที่บัญชี {selected.contract_no}</span>}
          </div>
        )}

        {/* รูปใบเสร็จ + ให้ AI อ่านยอดให้ */}
        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700">📎 รูปใบเสร็จ / สลิป</span>
            <button type="button" onClick={readReceipt} disabled={!imageKey || reading}
              className="h-8 px-3 text-xs font-medium rounded-lg border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-40 disabled:cursor-not-allowed"
              title={imageKey ? "ให้ระบบอ่านยอดจากรูปมากรอกให้" : "แนบรูปก่อน"}>
              {reading ? "กำลังอ่านรูป..." : "✨ อ่านจากรูป"}
            </button>
          </div>
          <ImageInput value={imageKey} onChange={setImageKey} folder="loan-payments" />
          {readNote && (
            <div className={`text-[11px] rounded-md px-2.5 py-1.5 border ${
              readNote.startsWith("อ่านได้") ? "bg-violet-50 border-violet-200 text-violet-700" : "bg-amber-50 border-amber-200 text-amber-700"
            }`}>{readNote}</div>
          )}
          <p className="text-[11px] text-slate-400">
            ระบบอ่านให้เป็น &ldquo;ตัวช่วยกรอก&rdquo; เท่านั้น — ตรวจตัวเลขทุกช่องก่อนกดบันทึกเสมอ
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ERPFormField label="ยอดจ่ายรวมทั้งหมด" required hint="ยอดที่จ่ายจริงทั้งก้อน">
            <MoneyInput value={f.amount} onChange={(raw) => set("amount", raw)} placeholder="0.00" className={moneyCls} />
          </ERPFormField>
          <ERPFormField label="วันที่จ่าย" hint="เว้นว่าง = วันนี้">
            <ERPInput type="date" value={f.payment_date} onChange={(e) => set("payment_date", e.target.value)} />
          </ERPFormField>
        </div>

        {/* แยกยอดตามใบเสร็จธนาคาร */}
        <div className="rounded-lg border border-slate-200 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700">แยกยอดจ่าย (ไม่บังคับ)</span>
            <span className="text-[11px] text-slate-400">เว้นว่างทั้งหมด = ให้ระบบตัดดอกเบี้ยก่อนแล้วเงินต้น</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {SPLIT_FIELDS.map((s) => (
              <ERPFormField key={s.key} label={s.label} hint={s.hint}>
                <MoneyInput value={f[s.key as SplitKey]} onChange={(raw) => set(s.key, raw)} placeholder="0.00" className={moneyCls} />
              </ERPFormField>
            ))}
          </div>

          {/* รายการเพิ่มเติมของธนาคารนี้ (ตั้งค่าที่ /loan-charge-types) */}
          {extra.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-slate-100">
              {extra.map((l) => (
                <div key={l.key} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-5">
                    <ERPInput value={l.label} onChange={(e) => setLine(l.key, { label: e.target.value })}
                      placeholder="ชื่อรายการ เช่น ค่าอากรแสตมป์" />
                  </div>
                  <div className="col-span-3">
                    <ERPSelect value={l.bucket} onChange={(e) => setLine(l.key, { bucket: e.target.value })} options={BUCKET_OPTS} />
                  </div>
                  <div className="col-span-3">
                    <MoneyInput value={l.amount} onChange={(raw) => setLine(l.key, { amount: raw })} placeholder="0.00" className={moneyCls} />
                  </div>
                  <div className="col-span-1 flex justify-center pt-1.5">
                    <button type="button" onClick={() => removeLine(l.key)} title="ลบรายการนี้"
                      className="w-6 h-6 rounded text-slate-300 hover:text-red-600 hover:bg-red-50">🗑</button>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-slate-400">
                “อื่น ๆ” = บันทึกว่าจ่ายจริงแต่ไม่ตัดเข้างวดผ่อน (เช่น ค่าอากรแสตมป์)
              </p>
            </div>
          )}

          {/* ปุ่มเพิ่มรายการ — ดึงจากประเภทที่ตั้งไว้สำหรับธนาคารนี้ */}
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-100">
            <span className="text-[11px] text-slate-400">เพิ่มรายการของธนาคารนี้:</span>
            {usableTypes.slice(0, 8).map((t) => (
              <button key={t.id} type="button" onClick={() => addLine(t)}
                title={`จัดเข้ากลุ่ม: ${bucketLabel(t.bucket)}`}
                className="h-7 px-2.5 text-[11px] rounded-full border border-slate-200 text-slate-600 bg-white hover:bg-slate-50">
                + {t.name}
              </button>
            ))}
            <button type="button" onClick={() => addLine()}
              className="h-7 px-2.5 text-[11px] rounded-full border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50">
              ➕ รายการอื่น (พิมพ์เอง)
            </button>
            <a href="/loan-charge-types" target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-blue-600 hover:underline ml-auto">ตั้งค่ารายการของแต่ละธนาคาร ↗</a>
          </div>

          {hasSplit && (
            <div className={`text-[11px] rounded-md px-2.5 py-1.5 flex items-center justify-between gap-2 flex-wrap ${
              splitBad ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
            }`}>
              <span>
                แยกแล้ว <b className="tabular-nums">{formatAmount(split)}</b> จากยอดรวม <b className="tabular-nums">{formatAmount(total)}</b>
                {splitBad && (diff > 0
                  ? <> · <b>ยังขาดอีก {formatAmount(diff)}</b></>
                  : <> · <b>เกินไป {formatAmount(-diff)}</b></>)}
                {!splitBad && " · ครบพอดี ✓"}
              </span>
              {splitBad && diff > 0 && (
                <button type="button" onClick={fillRest}
                  className="h-6 px-2 text-[11px] rounded border border-red-300 bg-white text-red-700 hover:bg-red-100">
                  เติมส่วนที่เหลือให้เงินต้น
                </button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ERPFormField label="วิธีจ่าย" hint={selected?.payment_method ? "ค่าตั้งต้นมาจากวิธีจ่ายประจำของสัญญา" : "จ่ายด้วยวิธีไหน"}>
            <ERPSelect value={f.payment_method} onChange={(e) => set("payment_method", e.target.value)}
              options={METHOD_OPTS} placeholder="— เลือกวิธีจ่าย —" />
          </ERPFormField>
          <ERPFormField label="เลขที่ใบเสร็จรับเงิน" hint="เลขที่ใบเสร็จที่ธนาคารออกให้">
            <ERPInput value={f.receipt_no} onChange={(e) => set("receipt_no", e.target.value)} placeholder="เช่น RC-2569-000123" />
          </ERPFormField>
          <ERPFormField label="จ่ายจากบัญชี">
            <ERPInput value={f.paid_from} onChange={(e) => set("paid_from", e.target.value)} placeholder="เช่น KBANK 123-4-56789-0" />
          </ERPFormField>
          <ERPFormField label="เลขอ้างอิง">
            <ERPInput value={f.reference} onChange={(e) => set("reference", e.target.value)} placeholder="เลขอ้างอิงการโอน" />
          </ERPFormField>
        </div>

        <p className="text-xs text-slate-400">
          หมายเหตุ: บันทึกนี้จะเป็นสถานะ &ldquo;ยืนยันแล้ว&rdquo; และตัดยอดทันที · แก้ยอด/ลบได้ ระบบจะคำนวณใหม่จากต้นทางให้เสมอ
        </p>
      </div>
    </ERPModal>
  );
}
