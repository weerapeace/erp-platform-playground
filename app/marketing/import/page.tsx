"use client";

import { useState, useRef, type ReactNode } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import type { OrderStatusKey, StatusData } from "@/lib/marketing/mock-data";

const nf = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const baht = (n: number) => "฿" + n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

const STEPS = [
  { n: 1, label: "เลือกแหล่งข้อมูล" },
  { n: 2, label: "อัปไฟล์" },
  { n: 3, label: "พรีวิว" },
  { n: 4, label: "จับคู่คอลัมน์" },
  { n: 5, label: "ตรวจข้อมูล" },
  { n: 6, label: "ยืนยัน & ผลลัพธ์" },
];

// column mapping ตัวอย่างจาก header จริงในไฟล์ Shopee (แม่แบบ shopee_shop_stats_v1)
const MAPPING: { excel: string; field: string; status: "ok" | "unknown" }[] = [
  { excel: "วันที่ / เวลา", field: "date / hour", status: "ok" },
  { excel: "ยอดขายทั้งหมด (THB)", field: "gross_sales", status: "ok" },
  { excel: "ยอดขายที่ไม่รวมส่วนลดจาก Shopee", field: "sales_excl_shopee_discount", status: "ok" },
  { excel: "คำสั่งซื้อทั้งหมด", field: "orders", status: "ok" },
  { excel: "ยอดขายเฉลี่ยต่อคำสั่งซื้อ", field: "aov", status: "ok" },
  { excel: "จำนวนคลิก / ผู้เยี่ยมชม", field: "clicks / visitors", status: "ok" },
  { excel: "อัตราการซื้อสินค้า", field: "conversion_rate", status: "ok" },
  { excel: "รหัสสินค้า + ผลิตภัณฑ์", field: "products[]", status: "ok" },
  { excel: "# ผู้ที่อาจจะซื้อ", field: "— (ยังไม่ใช้)", status: "unknown" },
];

interface PreviewData {
  file_name: string;
  shop: string;
  platform: string;
  date: string | null;
  period_start: string | null;
  period_end: string | null;
  statuses: OrderStatusKey[];
  counts: { daily: number; hourly: number; products: number };
  warnings: string[];
  byStatus: Partial<Record<OrderStatusKey, StatusData>>;
}
interface CommitResult {
  import_id: string;
  shop: string;
  date: string;
  counts: { daily: number; hourly: number; products: number };
  replaced: number;
  warnings: string[];
}

export default function MarketingImportPage() {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitErr, setCommitErr] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function acceptFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setPreviewErr(null);
  }

  async function runPreview(f: File) {
    setPreviewLoading(true);
    setPreviewErr(null);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await apiFetch("/api/marketing/import/preview", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok || j.error) setPreviewErr(j.error || "อ่านไฟล์ไม่สำเร็จ");
      else setPreview(j.data as PreviewData);
    } catch (e) {
      setPreviewErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runCommit() {
    if (!file) return;
    setCommitting(true);
    setCommitErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await apiFetch("/api/marketing/import/commit", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok && r.status !== 207) {
        setCommitErr(j.error || "บันทึกไม่สำเร็จ");
        setCommitting(false);
        return;
      }
      setResult(j.data as CommitResult);
      if (j.error) setCommitErr(j.error);
      setStep(6);
    } catch (e) {
      setCommitErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setCommitting(false);
    }
  }

  function goNext() {
    if (step === 2) {
      setStep(3);
      if (file) runPreview(file);
      return;
    }
    if (step === 5) {
      runCommit();
      return;
    }
    setStep((s) => Math.min(6, s + 1));
  }
  const back = () => setStep((s) => Math.max(1, s - 1));

  const canNext =
    step === 2 ? !!file : step === 3 ? !!preview && !previewLoading && !previewErr : true;

  const sampleStatus = preview?.statuses.includes("paid") ? "paid" : preview?.statuses[0];
  const sample = sampleStatus ? preview?.byStatus[sampleStatus] : undefined;

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3 max-w-4xl mx-auto">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">⬆️ นำเข้าไฟล์ Marketing</h1>
            <p className="text-sm text-slate-500 mt-1">อัปไฟล์รายงานยอดขายจาก Shopee เข้าระบบ</p>
          </div>
          <Link href="/marketing/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
            ← กลับ Dashboard
          </Link>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 max-w-4xl mx-auto">
        {/* Stepper */}
        <div className="flex items-center gap-1 sm:gap-2 mb-6 overflow-x-auto pb-1">
          {STEPS.map((st, i) => (
            <div key={st.n} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  step === st.n ? "bg-blue-600 text-white" : step > st.n ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-400"
                }`}
              >
                <span className="tabular-nums">{step > st.n ? "✓" : st.n}</span>
                <span className="hidden sm:inline">{st.label}</span>
              </div>
              {i < STEPS.length - 1 ? <div className={`w-3 sm:w-6 h-px ${step > st.n ? "bg-blue-300" : "bg-slate-200"}`} /> : null}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 min-h-[320px]">
          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-800">เลือกแหล่งข้อมูล</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="ช่องทาง (Platform)">
                  <FakeSelect value="🛍️ Shopee" />
                </Field>
                <Field label="ร้าน / บัญชี">
                  <FakeSelect value="อ่านอัตโนมัติจากชื่อไฟล์" />
                </Field>
                <Field label="ประเภทรายงาน">
                  <FakeSelect value="ยอดขาย (Shop Stats)" />
                </Field>
                <Field label="แม่แบบแปลงไฟล์ (Template)">
                  <FakeSelect value="Shopee Shop Stats v1" />
                </Field>
              </div>
              <p className="text-xs text-slate-400">* รอบนี้รองรับ Shopee ยอดขายก่อน ช่องทางอื่นจะเพิ่มภายหลัง</p>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-800">อัปโหลดไฟล์</h2>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
              />
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0] ?? null;
                  if (f) acceptFile(f);
                }}
                className={`w-full rounded-xl border-2 border-dashed transition-colors py-10 text-center cursor-pointer ${
                  dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/40"
                }`}
              >
                <div className="text-3xl mb-2">{dragging ? "📥" : "📄"}</div>
                <div className="text-sm font-medium text-slate-600">
                  {dragging ? "วางไฟล์ที่นี่ได้เลย" : "ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์ Shopee"}
                </div>
                <div className="text-xs text-slate-400 mt-1">รองรับ .xlsx / .csv (สูงสุด 15 MB)</div>
              </div>
              {file ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5">
                  <span className="text-emerald-600">✓</span>
                  <span className="text-sm text-emerald-800 truncate flex-1">
                    {file.name} <span className="text-emerald-500">({(file.size / 1024).toFixed(0)} KB)</span>
                  </span>
                  <button onClick={() => setFile(null)} className="text-xs text-slate-400 hover:text-slate-600">
                    ลบ
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-400">เลือกไฟล์ที่ export จาก Shopee Seller Centre (ข้อมูลธุรกิจ → ภาพรวม)</p>
              )}
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-800">พรีวิวข้อมูลที่อ่านได้</h2>
              {previewLoading ? (
                <div className="py-10 text-center text-sm text-slate-400">⏳ กำลังอ่านไฟล์...</div>
              ) : previewErr ? (
                <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{previewErr}</div>
              ) : preview ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <MiniStat label="ร้าน" value={preview.shop || "-"} />
                    <MiniStat label="วันที่" value={preview.date || "-"} />
                    <MiniStat label="สถานะที่พบ" value={`${preview.statuses.length} สถานะ`} />
                    <MiniStat label="แถวข้อมูล" value={`${preview.counts.daily + preview.counts.hourly + preview.counts.products}`} />
                  </div>
                  {sample ? (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium">เวลา</th>
                            <th className="text-right px-3 py-2 font-medium">ยอดขาย</th>
                            <th className="text-right px-3 py-2 font-medium">ออเดอร์</th>
                            <th className="text-right px-3 py-2 font-medium">คลิก</th>
                            <th className="text-right px-3 py-2 font-medium">ผู้เข้าชม</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sample.hourly.slice(7, 15).map((h) => (
                            <tr key={h.hour}>
                              <td className="px-3 py-1.5 text-slate-600">{String(h.hour).padStart(2, "0")}:00</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{baht(h.gross_sales)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{nf(h.orders)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{nf(h.clicks)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{nf(h.visitors)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <p className="text-xs text-slate-400">แสดงตัวอย่างรายชั่วโมงของสถานะ &quot;{sample?.label ?? "-"}&quot;</p>
                </>
              ) : null}
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-800">จับคู่คอลัมน์ (Mapping)</h2>
              <p className="text-xs text-slate-400">แม่แบบ Shopee Shop Stats v1 จับคู่ให้อัตโนมัติ</p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">คอลัมน์ในไฟล์ Excel</th>
                      <th className="text-left px-3 py-2 font-medium">→ ช่องกลางในระบบ</th>
                      <th className="text-center px-3 py-2 font-medium">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {MAPPING.map((m) => (
                      <tr key={m.excel}>
                        <td className="px-3 py-2 text-slate-700">{m.excel}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{m.field}</td>
                        <td className="px-3 py-2 text-center">
                          {m.status === "ok" ? <span className="text-emerald-600">✓ จับคู่แล้ว</span> : <span className="text-slate-400">ข้าม</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 5 */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-800">ตรวจข้อมูลก่อนบันทึก</h2>
              <div className="space-y-2">
                <CheckRow tone="ok" text={`อ่านยอดสรุปรายวันได้ ${preview?.counts.daily ?? 0} รายการ (ตามสถานะ)`} />
                <CheckRow tone="ok" text={`อ่านรายชั่วโมงได้ ${preview?.counts.hourly ?? 0} แถว`} />
                <CheckRow tone="ok" text={`อ่านสินค้าขายดีได้ ${preview?.counts.products ?? 0} รายการ`} />
                {(preview?.warnings ?? []).map((w, i) => (
                  <CheckRow key={i} tone="warn" text={w} />
                ))}
                <CheckRow tone="info" text={`ถ้าเคยนำเข้าข้อมูลวันที่ ${preview?.date ?? "-"} ของร้านนี้แล้ว ระบบจะแทนที่ด้วยข้อมูลใหม่`} />
              </div>
              {commitErr ? <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{commitErr}</div> : null}
            </div>
          )}

          {/* Step 6 */}
          {step === 6 && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="text-4xl mb-2">🎉</div>
                <h2 className="font-semibold text-slate-800 text-lg">นำเข้าสำเร็จ</h2>
                <p className="text-sm text-slate-500 mt-1">ข้อมูลถูกบันทึกและพร้อมแสดงบน Dashboard แล้ว</p>
              </div>
              {commitErr ? <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-700">{commitErr}</div> : null}
              {result ? (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-1.5 text-sm">
                  <SummaryRow k="ร้าน" v={`Shopee · ${result.shop || "(ไม่ระบุ)"}`} />
                  <SummaryRow k="วันที่" v={result.date} />
                  <SummaryRow k="บันทึก" v={`รายวัน ${result.counts.daily} · รายชั่วโมง ${result.counts.hourly} · สินค้า ${result.counts.products}`} />
                  <SummaryRow k="ข้อมูลซ้ำ" v={result.replaced > 0 ? `แทนที่ข้อมูลเดิมของวันนี้ (${result.replaced} รายการ)` : "ไม่พบข้อมูลเดิม — บันทึกใหม่"} />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-2">
                <Link href={`/marketing/dashboard`} className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700">
                  ดู Dashboard →
                </Link>
                <button
                  onClick={() => {
                    setStep(1);
                    setFile(null);
                    setPreview(null);
                    setResult(null);
                    setCommitErr(null);
                    setPreviewErr(null);
                  }}
                  className="rounded-lg border border-slate-200 text-slate-600 px-4 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  นำเข้าไฟล์อีก
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Nav buttons */}
        {step < 6 && (
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={back}
              disabled={step === 1 || committing}
              className="rounded-lg border border-slate-200 text-slate-600 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← ย้อนกลับ
            </button>
            <button
              onClick={goNext}
              disabled={!canNext || committing}
              className="rounded-lg bg-blue-600 text-white px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {committing ? "กำลังบันทึก..." : step === 5 ? "ยืนยันนำเข้า" : "ถัดไป →"}
            </button>
          </div>
        )}
      </div>
    </PlaygroundShell>
  );
}

/* ---------- small helpers ---------- */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
function FakeSelect({ value }: { value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      <span>{value}</span>
      <span className="text-slate-300">▾</span>
    </div>
  );
}
function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const c = tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-slate-800";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 truncate ${c}`}>{value}</div>
    </div>
  );
}
function CheckRow({ tone, text }: { tone: "ok" | "warn" | "info"; text: string }) {
  const map = {
    ok: { icon: "✓", cls: "text-emerald-600" },
    warn: { icon: "⚠️", cls: "text-amber-600" },
    info: { icon: "ℹ️", cls: "text-slate-400" },
  }[tone];
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={`flex-shrink-0 ${map.cls}`}>{map.icon}</span>
      <span className="text-slate-600">{text}</span>
    </div>
  );
}
function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <span className="text-slate-400 w-24 flex-shrink-0">{k}</span>
      <span className="text-slate-700 flex-1 break-all">{v}</span>
    </div>
  );
}
