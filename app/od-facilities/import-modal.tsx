"use client";
// ปุ่ม + Modal นำเข้า Statement OD — วางข้อมูลจาก Excel (date, รายละเอียด, เงินเข้า, เงินออก, ยอดคงเหลือ)
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPFormField, ERPSelect } from "@/components/form";
import { apiFetch } from "@/lib/api";

type FacilityOpt = { id: string; od_code: string; lender_name: string };
type ParsedRow = { date: string; description: string; money_in: number; money_out: number; balance: number };

const num = (s: string) => Number((s ?? "").replace(/[,\s฿]/g, "")) || 0;

function parse(text: string): { rows: ParsedRow[]; bad: number } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: ParsedRow[] = [];
  let bad = 0;
  for (const line of lines) {
    const cols = line.includes("\t") ? line.split("\t") : line.split(",");
    if (cols.length < 5) { bad++; continue; }
    const date = (cols[0] ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { bad++; continue; }
    rows.push({
      date,
      description: (cols[1] ?? "").trim(),
      money_in: num(cols[2]),
      money_out: num(cols[3]),
      balance: num(cols[4]),
    });
  }
  return { rows, bad };
}

const THB = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

export function ODImportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="h-9 px-4 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">
        ⬆️ นำเข้า Statement
      </button>
      {open && <ImportModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const [facilities, setFacilities] = useState<FacilityOpt[]>([]);
  const [facilityId, setFacilityId] = useState("");
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ inserted: number; skipped: number } | null>(null);

  useEffect(() => {
    apiFetch("/api/master-v2/od-facilities?limit=200")
      .then((r) => r.json())
      .then((j) => {
        const rows = (j?.data ?? []) as Record<string, unknown>[];
        const opts = rows.map((r) => ({ id: String(r.id), od_code: String(r.od_code ?? ""), lender_name: String(r.lender_name ?? "") }));
        setFacilities(opts);
        if (opts.length === 1) setFacilityId(opts[0].id);
      })
      .catch(() => setErr("โหลดรายชื่อวงเงินไม่สำเร็จ"));
  }, []);

  const parsed = parse(raw);

  const submit = async () => {
    setErr("");
    if (!facilityId) { setErr("กรุณาเลือกวงเงิน OD"); return; }
    if (parsed.rows.length === 0) { setErr("ไม่มีข้อมูลที่อ่านได้ — ตรวจรูปแบบวันที่ (YYYY-MM-DD) และคอลัมน์"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/od-statement/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facility_id: facilityId, rows: parsed.rows }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) { setErr(j?.error || "นำเข้าไม่สำเร็จ"); setSaving(false); return; }
      setDone({ inserted: j.inserted, skipped: j.skipped });
      setSaving(false);
    } catch {
      setErr("เกิดข้อผิดพลาดในการเชื่อมต่อ");
      setSaving(false);
    }
  };

  return (
    <ERPModal
      open
      onClose={onClose}
      title="นำเข้า Statement ธนาคาร (OD)"
      description="วางข้อมูลจาก Excel — 5 คอลัมน์: วันที่ | รายละเอียด | เงินเข้า | เงินออก | ยอดคงเหลือ"
      size="lg"
      footer={
        done ? (
          <div className="flex justify-end">
            <button onClick={() => { onClose(); if (typeof window !== "undefined") window.location.reload(); }} className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">เสร็จสิ้น (รีเฟรช)</button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={submit} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {saving ? "กำลังนำเข้า..." : `นำเข้า ${parsed.rows.length} รายการ`}
            </button>
          </div>
        )
      }
    >
      {done ? (
        <div className="text-center py-8">
          <p className="text-4xl mb-2">✅</p>
          <p className="font-semibold text-slate-800">นำเข้าสำเร็จ</p>
          <p className="text-sm text-slate-600 mt-1">เพิ่มใหม่ {done.inserted} รายการ · ข้ามรายการซ้ำ {done.skipped} รายการ</p>
          <p className="text-xs text-slate-400 mt-2">ระบบคิดยอดใช้ OD รายวัน + utilization ให้แล้ว</p>
        </div>
      ) : (
        <div className="space-y-4">
          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {err}</div>}

          <ERPFormField label="วงเงิน OD" required>
            <ERPSelect value={facilityId} onChange={(e) => setFacilityId(e.target.value)}
              options={facilities.map((f) => ({ value: f.id, label: `${f.od_code} — ${f.lender_name}` }))}
              placeholder="— เลือกวงเงิน —" />
          </ERPFormField>

          <ERPFormField label="วางข้อมูล Statement" hint="1 บรรทัด/รายการ · คั่นด้วย Tab (จาก Excel) หรือ comma · ยอดติดลบ = ใช้ OD">
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={7}
              placeholder={"2026-07-01\tยอดยกมา\t0\t0\t-1520000\n2026-07-02\tรับโอน\t350000\t0\t-1170000"}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </ERPFormField>

          {raw.trim() && (
            <div>
              <p className="text-xs text-slate-500 mb-1">
                อ่านได้ {parsed.rows.length} รายการ{parsed.bad > 0 && <span className="text-amber-600"> · ข้าม {parsed.bad} บรรทัด (รูปแบบไม่ถูก)</span>}
              </p>
              <div className="max-h-52 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-slate-500">
                      <th className="text-left px-2 py-1.5">วันที่</th>
                      <th className="text-left px-2 py-1.5">รายละเอียด</th>
                      <th className="text-right px-2 py-1.5">เงินเข้า</th>
                      <th className="text-right px-2 py-1.5">เงินออก</th>
                      <th className="text-right px-2 py-1.5">คงเหลือ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 100).map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-2 py-1 text-slate-600">{r.date}</td>
                        <td className="px-2 py-1 text-slate-700">{r.description}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-emerald-600">{r.money_in ? THB(r.money_in) : "—"}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-red-600">{r.money_out ? THB(r.money_out) : "—"}</td>
                        <td className={`px-2 py-1 text-right tabular-nums ${r.balance < 0 ? "text-red-600 font-medium" : "text-slate-700"}`}>{THB(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-400">ระบบจะกันรายการซ้ำอัตโนมัติ (จากวันที่+จำนวนเงิน+ยอดคงเหลือ+รายละเอียด)</p>
        </div>
      )}
    </ERPModal>
  );
}
