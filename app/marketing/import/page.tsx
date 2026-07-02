"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { MOCK_SHOPEE_SALES } from "@/lib/marketing/mock-data";

const nf = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const baht = (n: number) => "฿" + n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

const SAMPLE_FILE = "louismontini_officialshop.shopee-shop-stats.20260630-20260630.xlsx";

const STEPS = [
  { n: 1, label: "เลือกแหล่งข้อมูล" },
  { n: 2, label: "อัปไฟล์" },
  { n: 3, label: "พรีวิว" },
  { n: 4, label: "จับคู่คอลัมน์" },
  { n: 5, label: "ตรวจข้อมูล" },
  { n: 6, label: "ยืนยัน & ผลลัพธ์" },
];

// column mapping ตัวอย่างจาก header จริงในไฟล์ Shopee
const MAPPING: { excel: string; field: string; status: "ok" | "unknown" }[] = [
  { excel: "วันที่ / เวลา", field: "date", status: "ok" },
  { excel: "ยอดขายทั้งหมด (THB)", field: "gross_sales", status: "ok" },
  { excel: "ยอดขายที่ไม่รวมส่วนลดจาก Shopee", field: "sales_excl_shopee_discount", status: "ok" },
  { excel: "คำสั่งซื้อทั้งหมด", field: "orders", status: "ok" },
  { excel: "ยอดขายเฉลี่ยต่อคำสั่งซื้อ", field: "aov", status: "ok" },
  { excel: "จำนวนคลิก", field: "clicks", status: "ok" },
  { excel: "จำนวนผู้เยี่ยมชม", field: "visitors", status: "ok" },
  { excel: "อัตราการซื้อสินค้า", field: "conversion_rate", status: "ok" },
  { excel: "คำสั่งซื้อที่ยกเลิก", field: "cancelled_orders", status: "ok" },
  { excel: "# ผู้ที่อาจจะซื้อ", field: "— (ยังไม่ใช้)", status: "unknown" },
];

export default function MarketingImportPage() {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const data = MOCK_SHOPEE_SALES;
  const paid = data.byStatus.paid;

  const canNext = step === 2 ? !!fileName : true;
  const next = () => setStep((s) => Math.min(6, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3 max-w-4xl">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
                ⬆️ นำเข้าไฟล์ Marketing
              </h1>
              <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-xs font-medium">
                ตัวอย่าง (Mock)
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              อัปไฟล์รายงานจาก Shopee / Lazada / TikTok เข้าระบบ
            </p>
          </div>
          <Link
            href="/marketing/dashboard"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← กลับ Dashboard
          </Link>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 max-w-4xl">
        {/* Stepper */}
        <div className="flex items-center gap-1 sm:gap-2 mb-6 overflow-x-auto pb-1">
          {STEPS.map((st, i) => (
            <div key={st.n} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  step === st.n
                    ? "bg-blue-600 text-white"
                    : step > st.n
                      ? "bg-blue-50 text-blue-700"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                <span className="tabular-nums">{step > st.n ? "✓" : st.n}</span>
                <span className="hidden sm:inline">{st.label}</span>
              </div>
              {i < STEPS.length - 1 ? (
                <div className={`w-3 sm:w-6 h-px ${step > st.n ? "bg-blue-300" : "bg-slate-200"}`} />
              ) : null}
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
                  <FakeSelect value="louismontini_officialshop" />
                </Field>
                <Field label="ประเภทรายงาน">
                  <FakeSelect value="ยอดขาย (Shop Stats)" />
                </Field>
                <Field label="แม่แบบแปลงไฟล์ (Template)">
                  <FakeSelect value="Shopee Shop Stats v1" />
                </Field>
              </div>
              <p className="text-xs text-slate-400">
                * รอบตัวอย่างล็อกค่าเป็น Shopee ยอดขายไว้ก่อน ของจริงจะเลือกได้ทุกช่องทาง
              </p>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-800">อัปโหลดไฟล์</h2>
              <button
                onClick={() => setFileName(SAMPLE_FILE)}
                className="w-full rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/40 transition-colors py-10 text-center"
              >
                <div className="text-3xl mb-2">📄</div>
                <div className="text-sm font-medium text-slate-600">
                  ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์
                </div>
                <div className="text-xs text-slate-400 mt-1">รองรับ .xlsx / .csv (สูงสุด 10 MB)</div>
              </button>
              {fileName ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5">
                  <span className="text-emerald-600">✓</span>
                  <span className="text-sm text-emerald-800 truncate flex-1">{fileName}</span>
                  <button
                    onClick={() => setFileName(null)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    ลบ
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-400">คลิกกล่องด้านบนเพื่อจำลองการเลือกไฟล์ตัวอย่าง</p>
              )}
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-800">พรีวิวข้อมูลที่อ่านได้</h2>
              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="ชีตที่พบ" value="12 ชีต" />
                <MiniStat label="ชีตที่จะใช้" value="ยอดขาย 3 สถานะ" />
                <MiniStat label="แถวข้อมูล" value="~81 แถว" />
              </div>
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
                    {paid.hourly.slice(7, 15).map((h) => (
                      <tr key={h.hour}>
                        <td className="px-3 py-1.5 text-slate-600">
                          {String(h.hour).padStart(2, "0")}:00
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">
                          {baht(h.gross_sales)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                          {nf(h.orders)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                          {nf(h.clicks)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                          {nf(h.visitors)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400">แสดงตัวอย่าง 8 แถว (07:00–14:00) ของสถานะ &quot;ชำระเงินแล้ว&quot;</p>
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-800">จับคู่คอลัมน์ (Mapping)</h2>
              <p className="text-xs text-slate-400">
                ระบบเดาการจับคู่ให้อัตโนมัติจากแม่แบบ — แก้ได้ถ้าไม่ตรง
              </p>
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
                          {m.status === "ok" ? (
                            <span className="text-emerald-600">✓ จับคู่แล้ว</span>
                          ) : (
                            <span className="text-slate-400">ข้าม</span>
                          )}
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
                <CheckRow tone="ok" text="วันที่อ่านได้ครบ 24 ชั่วโมง + 1 สรุปรายวัน" />
                <CheckRow tone="ok" text="ยอดขาย/ออเดอร์เป็นตัวเลขถูกต้องทั้งหมด (81 แถว)" />
                <CheckRow tone="ok" text="อ่านสินค้าขายดีได้ 5 รายการ" />
                <CheckRow
                  tone="warn"
                  text="สินค้า 5 รายการยังไม่ผูกกับรหัสสินค้าในระบบ (รหัส Shopee) — บันทึกได้ แต่ควรผูกภายหลัง"
                />
                <CheckRow tone="info" text="พบคอลัมน์ใหม่ &quot;# ผู้ที่อาจจะซื้อ&quot; ที่ระบบยังไม่ใช้" />
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2">
                <MiniStat label="ผ่าน" value="81 แถว" tone="ok" />
                <MiniStat label="เตือน" value="5 รายการ" tone="warn" />
                <MiniStat label="ผิดพลาด" value="0 แถว" tone="ok" />
              </div>
            </div>
          )}

          {/* Step 6 */}
          {step === 6 && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="text-4xl mb-2">🎉</div>
                <h2 className="font-semibold text-slate-800 text-lg">นำเข้าสำเร็จ (ตัวอย่าง)</h2>
                <p className="text-sm text-slate-500 mt-1">
                  ในระบบจริง ข้อมูลนี้จะถูกบันทึกและอัปเดตขึ้น Dashboard ทันที
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-1.5 text-sm">
                <SummaryRow k="ไฟล์" v={SAMPLE_FILE} />
                <SummaryRow k="ร้าน" v="Shopee · louismontini_officialshop" />
                <SummaryRow k="ช่วงวันที่" v="30 มิ.ย. 2026 (1 วัน)" />
                <SummaryRow k="บันทึก" v="รายวัน 1 + รายชั่วโมง 24 + สินค้า 5 × 3 สถานะ" />
                <SummaryRow k="ข้อมูลซ้ำ" v="ไม่พบข้อมูลวันนี้เดิม — บันทึกใหม่ได้เลย" />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Link
                  href="/marketing/dashboard"
                  className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
                >
                  ดู Dashboard →
                </Link>
                <button
                  onClick={() => {
                    setStep(1);
                    setFileName(null);
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
              disabled={step === 1}
              className="rounded-lg border border-slate-200 text-slate-600 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← ย้อนกลับ
            </button>
            <button
              onClick={next}
              disabled={!canNext}
              className="rounded-lg bg-blue-600 text-white px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step === 5 ? "ยืนยันนำเข้า" : "ถัดไป →"}
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
function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const c =
    tone === "ok"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-slate-800";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${c}`}>{value}</div>
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
