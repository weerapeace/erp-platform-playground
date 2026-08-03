"use client";

/**
 * SupplierWizard — ของกลาง: เพิ่มคู่ค้า (partners_v2) แบบวิซาร์ดหลายหน้า
 *
 * เจ้าของสั่ง (2026-08-03): "อยากให้ลงได้ครบ ๆ ทุกช่องด้วย แยกเป็นหน้า ๆ ก็ได้"
 *   หน้า 1 ข้อมูลร้าน   — ชื่อ/รหัส/ประเภท(ลูกค้า-ผู้จำหน่าย-บริษัท)/Taobao/ประเทศ/สกุลเงิน/นามบัตร
 *   หน้า 2 ติดต่อ       — โทร/มือถือ/อีเมล/LINE/เว็บ/โน้ต
 *   หน้า 3 ที่อยู่+ภาษี  — ชื่อบริษัท/ที่อยู่เต็ม/เลขผู้เสียภาษี+สาขา  (ใช้บนใบสั่งซื้อ)
 *   หน้า 4 การค้า/เงิน  — เครดิตจ่าย/lead time/วงเงิน/ซื้อบิล/ส่งก่อนจ่าย/บัญชีธนาคาร/แท็ก
 *
 * กรอกแค่ "ชื่อร้าน" ก็บันทึกได้ — ช่องอื่นเว้นไว้เติมทีหลังที่ /master/partners ได้
 * onCreated(partner) คืน { id, name } ของคู่ค้าที่สร้าง (signature เดิม — ที่เรียกใช้อยู่ 4 จุดไม่ต้องแก้)
 */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { PurchaseCreditTermInput } from "@/components/purchase-credit-term-input";
import { PurchaseLeadTimeInput } from "@/components/purchase-lead-time-input";
import { BankPicker, useBanks } from "@/components/bank-picker";
import { ImageAttachKeys } from "@/components/image-attach";

const COUNTRIES = ["ไทย", "จีน", "ฮ่องกง", "อื่นๆ"];
const STEPS = ["ข้อมูลร้าน", "ติดต่อ", "ที่อยู่ + ภาษี", "การค้า / การเงิน"] as const;
type Step = 1 | 2 | 3 | 4;

export function SupplierWizard({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (p: { id: string; name: string }) => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const banks = useBanks("TH");

  // ---- หน้า 1: ข้อมูลร้าน ----
  const [displayName, setDisplayName] = useState("");
  const [nameTh, setNameTh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [code, setCode] = useState("");
  const [isSupplier, setIsSupplier] = useState(true);
  const [isCustomer, setIsCustomer] = useState(false);
  const [isCompany, setIsCompany] = useState(true);
  const [isTaobao, setIsTaobao] = useState(false);
  const [shopCountry, setShopCountry] = useState("");
  const [currency, setCurrency] = useState("RMB");
  const [nameCard, setNameCard] = useState<string[]>([]);

  // ---- หน้า 2: ติดต่อ ----
  const [phone, setPhone] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [lineId, setLineId] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");

  // ---- หน้า 3: ที่อยู่ + ภาษี ----
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [subDistrict, setSubDistrict] = useState("");
  const [district, setDistrict] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("TH");
  const [taxId, setTaxId] = useState("");
  const [taxBranch, setTaxBranch] = useState("00000");

  // ---- หน้า 4: การค้า / การเงิน ----
  const [creditTerm, setCreditTerm] = useState<string | null>(null);
  const [leadTime, setLeadTime] = useState<string | null>(null);
  const [creditDays, setCreditDays] = useState("");
  const [supplierLeadDays, setSupplierLeadDays] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [shipBeforePay, setShipBeforePay] = useState(false);
  const [buyBill, setBuyBill] = useState(false);
  const [bankName, setBankName] = useState("");
  const [bankBrief, setBankBrief] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [tags, setTags] = useState("");

  const toggleTaobao = (v: boolean) => {
    setIsTaobao(v);
    if (v) { setShopCountry("จีน"); setCurrency("RMB"); setCountry("CN"); }
  };

  const bankId = useMemo(
    () => banks.find((b) => b.name === bankName)?.id ?? null,
    [banks, bankName],
  );

  const cls = "w-full h-9 px-3 text-sm border border-slate-200 rounded-md";
  const lbl = "block text-xs font-medium text-slate-600 mb-1";
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const txt = (s: string) => (s.trim() === "" ? null : s.trim());

  const save = async () => {
    if (!displayName.trim()) { setStep(1); setErr("กรุณาใส่ชื่อร้าน"); return; }
    if (!isSupplier && !isCustomer) { setStep(1); setErr("ต้องติ๊กอย่างน้อย 1 อย่าง: ผู้จำหน่าย หรือ ลูกค้า"); return; }
    setSaving(true); setErr(null);
    try {
      const body = {
        // ส่งครบทั้ง 3 ช่องเสมอ — ทะเบียน field ตั้งเป็น "จำเป็น" ถ้าไม่ส่งจะติด "กรอกข้อมูลไม่ครบ"
        is_supplier: isSupplier, is_customer: isCustomer, is_company: isCompany, is_active: true,
        display_name: displayName.trim(),
        name_th: (nameTh.trim() || displayName.trim()),
        name_en: txt(nameEn),
        code: txt(code),
        is_taobao: isTaobao,
        shop_country: txt(shopCountry),
        default_currency: currency,
        name_card: nameCard[0] ?? null,

        phone: txt(phone), mobile: txt(mobile), email: txt(email),
        line_id: txt(lineId), website: txt(website), notes: txt(notes),

        company_name: txt(companyName),
        address_line: txt(address), sub_district: txt(subDistrict), district: txt(district),
        province: txt(province), postal_code: txt(postalCode), country: txt(country),
        tax_id: txt(taxId), tax_branch: txt(taxBranch),

        purchase_credit_term: creditTerm, purchase_lead_time: leadTime,
        payment_terms_days: num(creditDays),
        supplier_lead_time_days: num(supplierLeadDays),
        credit_limit: num(creditLimit),
        ship_before_pay: shipBeforePay, buy_bill: buyBill,
        bank_name: bankId, bank_name_brief: txt(bankBrief),
        bank_account_name: txt(bankAccountName), account_number: txt(accountNumber),
        tags: tags.trim() ? tags.split(",").map((s) => s.trim()).filter(Boolean) : null,
      };
      const res = await apiFetch(`/api/master-v2/partners`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error || !j.data?.id) { setErr("บันทึกไม่สำเร็จ: " + (j.error ?? `HTTP ${res.status}`)); return; }
      onCreated({ id: String(j.data.id), name: displayName.trim() });
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  const go = (s: Step) => { if (!displayName.trim() && s !== 1) { setErr("กรุณาใส่ชื่อร้านก่อน"); return; } setErr(null); setStep(s); };

  const Chk = ({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) => (
    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded border-slate-300" />
      {children}
    </label>
  );

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[560px] max-w-[94vw] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-800">➕ เพิ่มคู่ค้า / ผู้จำหน่าย</h3>
            <div className="text-[11px] text-slate-400">กรอกแค่ชื่อร้านก็บันทึกได้ — ช่องอื่นเติมทีหลังได้</div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>

        {/* แถบขั้นตอน — กดข้ามไปหน้าไหนก็ได้ */}
        <div className="flex gap-1 px-4 pt-3">
          {STEPS.map((s, i) => {
            const n = (i + 1) as Step;
            const active = step === n;
            return (
              <button key={s} type="button" onClick={() => go(n)}
                className={`flex-1 text-[11px] py-1.5 px-1 rounded-md border transition-colors ${active
                  ? "bg-blue-50 border-blue-300 text-blue-700 font-medium"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                {n}. {s}
              </button>
            );
          })}
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {step === 1 && (
            <>
              <div><label className={lbl}>ชื่อร้าน (Display) *</label>
                <input value={displayName} autoFocus onChange={(e) => setDisplayName(e.target.value)} className={cls} placeholder="เช่น ร้านซิปเมืองจีน" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>ชื่อไทย</label>
                  <input value={nameTh} onChange={(e) => setNameTh(e.target.value)} className={cls} placeholder="เว้นว่าง = ใช้ชื่อร้าน" /></div>
                <div><label className={lbl}>ชื่ออังกฤษ</label>
                  <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={cls} placeholder="(ถ้ามี)" /></div>
              </div>
              <div><label className={lbl}>รหัสร้าน (Code)</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} className={cls} placeholder="เว้นว่าง = ระบบไม่ตั้งให้" /></div>

              <div className="border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                <div className="text-xs font-medium text-slate-500">คู่ค้ารายนี้เป็น</div>
                <Chk checked={isSupplier} onChange={setIsSupplier}>ผู้จำหน่าย (เราซื้อจากเขา)</Chk>
                <Chk checked={isCustomer} onChange={setIsCustomer}>ลูกค้า (เขาซื้อจากเรา)</Chk>
                <Chk checked={isCompany} onChange={setIsCompany}>เป็นนิติบุคคล / บริษัท</Chk>
                <div className="text-[11px] text-slate-400">ติ๊กได้ทั้งคู่ถ้าเป็นทั้งลูกค้าและผู้จำหน่าย</div>
              </div>

              <Chk checked={isTaobao} onChange={toggleTaobao}>เป็นร้าน Taobao (ติ๊กแล้วตั้งประเทศ = จีน, สกุลเงิน = RMB)</Chk>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>ประเทศร้าน</label>
                  <select value={shopCountry}
                    onChange={(e) => { const c = e.target.value; setShopCountry(c); if (c === "ไทย") { setCurrency("THB"); setCountry("TH"); } else if (c === "จีน") { setCurrency("RMB"); setCountry("CN"); } }}
                    className={cls + " bg-white"}>
                    <option value="">— เลือก —</option>
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div><label className={lbl}>สกุลเงินตั้งต้น</label>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={cls + " bg-white"}>
                    <option value="THB">THB (บาท)</option>
                    <option value="RMB">RMB (หยวน)</option>
                    <option value="USD">USD</option>
                  </select></div>
              </div>
              <div><label className={lbl}>รูปนามบัตร</label>
                <ImageAttachKeys value={nameCard} onChange={(k) => setNameCard(k.slice(0, 1))} folder="partners" /></div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>เบอร์โทร</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className={cls} placeholder="02-xxx-xxxx" /></div>
                <div><label className={lbl}>มือถือ</label>
                  <input value={mobile} onChange={(e) => setMobile(e.target.value)} className={cls} placeholder="08x-xxx-xxxx" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>อีเมล</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} className={cls} placeholder="(ถ้ามี)" /></div>
                <div><label className={lbl}>Line ID</label>
                  <input value={lineId} onChange={(e) => setLineId(e.target.value)} className={cls} placeholder="เช่น @shop" /></div>
              </div>
              <div><label className={lbl}>เว็บไซต์ / ลิงก์ร้าน</label>
                <input value={website} onChange={(e) => setWebsite(e.target.value)} className={cls} placeholder="https://…" /></div>
              <div><label className={lbl}>หมายเหตุ</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" placeholder="(ถ้ามี)" /></div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1.5">
                ข้อมูลหน้านี้จะขึ้นบน <b>ใบสั่งซื้อที่ส่งให้ซัพ</b> (ช่องผู้จำหน่าย)
              </div>
              <div><label className={lbl}>ชื่อบริษัท (เต็ม)</label>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={cls} placeholder="เช่น บริษัท ... จำกัด (สำนักงานใหญ่)" /></div>
              <div><label className={lbl}>ที่อยู่</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className={cls} placeholder="บ้านเลขที่ / ถนน" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>ตำบล / แขวง</label>
                  <input value={subDistrict} onChange={(e) => setSubDistrict(e.target.value)} className={cls} /></div>
                <div><label className={lbl}>อำเภอ / เขต</label>
                  <input value={district} onChange={(e) => setDistrict(e.target.value)} className={cls} /></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2"><label className={lbl}>จังหวัด</label>
                  <input value={province} onChange={(e) => setProvince(e.target.value)} className={cls} /></div>
                <div><label className={lbl}>รหัสไปรษณีย์</label>
                  <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={cls} /></div>
              </div>
              <div><label className={lbl}>ประเทศ (รหัส)</label>
                <input value={country} onChange={(e) => setCountry(e.target.value)} className={cls} placeholder="TH / CN" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2"><label className={lbl}>เลขประจำตัวผู้เสียภาษี</label>
                  <input value={taxId} onChange={(e) => setTaxId(e.target.value)} className={cls} placeholder="13 หลัก" /></div>
                <div><label className={lbl}>สาขา</label>
                  <input value={taxBranch} onChange={(e) => setTaxBranch(e.target.value)} className={cls} placeholder="00000" /></div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div><label className={lbl}>เครดิตการจ่าย</label>
                <PurchaseCreditTermInput value={creditTerm} onChange={setCreditTerm} />
                <div className="text-[11px] text-slate-400 mt-1">ตั้งแล้วปฏิทินจัดซื้อจะคิดวันครบกำหนดจ่ายให้เอง</div></div>
              <div><label className={lbl}>ระยะเวลาส่งของ (Lead Time)</label>
                <PurchaseLeadTimeInput value={leadTime} onChange={setLeadTime} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className={lbl}>เครดิต (วัน)</label>
                  <input type="number" value={creditDays} onChange={(e) => setCreditDays(e.target.value)} className={cls} placeholder="30" /></div>
                <div><label className={lbl}>ส่งของ (วัน)</label>
                  <input type="number" value={supplierLeadDays} onChange={(e) => setSupplierLeadDays(e.target.value)} className={cls} placeholder="14" /></div>
                <div><label className={lbl}>วงเงินเครดิต</label>
                  <input type="number" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} className={cls} placeholder="0" /></div>
              </div>
              <div className="border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                <Chk checked={shipBeforePay} onChange={setShipBeforePay}>ส่งของก่อนจ่าย (ไม่ต้องรอจ่ายเงิน)</Chk>
                <Chk checked={buyBill} onChange={setBuyBill}>ซื้อบิล (ร้านนี้ออกบิลให้)</Chk>
              </div>
              <div className="border border-slate-200 rounded-lg p-2.5 space-y-2">
                <div className="text-xs font-medium text-slate-500">บัญชีธนาคาร (สำหรับโอนจ่าย)</div>
                <BankPicker value={bankName} onChange={(nm) => setBankName(nm)} />
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={lbl}>ชื่อบัญชี</label>
                    <input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} className={cls} /></div>
                  <div><label className={lbl}>เลขบัญชี</label>
                    <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={cls} /></div>
                </div>
                <div><label className={lbl}>ชื่อธนาคารแบบย่อ</label>
                  <input value={bankBrief} onChange={(e) => setBankBrief(e.target.value)} className={cls} placeholder="เช่น SCB / KBANK" /></div>
              </div>
              <div><label className={lbl}>แท็ก (คั่นด้วยจุลภาค)</label>
                <input value={tags} onChange={(e) => setTags(e.target.value)} className={cls} placeholder="เช่น ผ้า, ซิป, ด่วน" /></div>
            </>
          )}

          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1.5">{err}</div>}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-100">
          {step > 1
            ? <button type="button" onClick={() => setStep((step - 1) as Step)} className="h-9 px-3 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">← ย้อนกลับ</button>
            : <span />}
          <div className="flex gap-2">
            {step < 4 && (
              <button type="button" onClick={save} disabled={saving || !displayName.trim()}
                className="h-9 px-3 text-sm border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                บันทึกเลย
              </button>
            )}
            {step < 4 ? (
              <button type="button" onClick={() => go((step + 1) as Step)}
                className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700">ถัดไป →</button>
            ) : (
              <button type="button" onClick={save} disabled={saving}
                className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                {saving ? "กำลังบันทึก…" : "✓ บันทึกคู่ค้า"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
