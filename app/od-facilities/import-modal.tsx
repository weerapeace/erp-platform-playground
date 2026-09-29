"use client";
// ปุ่ม + Modal นำเข้า Statement OD — วางข้อมูลจาก Excel (date, รายละเอียด, เงินเข้า, เงินออก, ยอดคงเหลือ)
// นำเข้าผิดไฟล์/ผิดวงเงิน → "ประวัติการนำเข้า" ด้านล่าง กด ↩ ยกเลิกการนำเข้ารอบนั้นได้
import { useCallback, useEffect, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { formatDate } from "@/lib/date";
import type { OdImportBatch } from "@/app/api/od-statement/import/route";
import { ERPFormField, ERPSelect } from "@/components/form";
import { apiFetch } from "@/lib/api";
import { parsePastedTable, dropHeaderRow, parseNumberCell, parseDateCell } from "@/lib/paste-table";

type FacilityOpt = { id: string; od_code: string; lender_name: string };
type ParsedRow = { date: string; description: string; money_in: number; money_out: number; balance: number };

// อ่านตารางที่วางมาจาก Excel ผ่านของกลาง lib/paste-table
// (รับวันที่ได้หลายแบบแล้ว: 2026-09-05 · 05/09/2026 · 5 ก.ย. 2569 · ตัวเลขมีลูกน้ำ/วงเล็บติดลบ)
function parse(text: string): { rows: ParsedRow[]; bad: number } {
  const grid = dropHeaderRow(parsePastedTable(text), /วันที่|date|รายละเอียด|description/i);
  const rows: ParsedRow[] = [];
  let bad = 0;
  for (const cols of grid) {
    if (cols.length < 5) { bad++; continue; }
    const date = parseDateCell(cols[0]);
    if (!date) { bad++; continue; }
    rows.push({
      date,
      description: (cols[1] ?? "").trim(),
      money_in: parseNumberCell(cols[2]),
      money_out: parseNumberCell(cols[3]),
      balance: parseNumberCell(cols[4]),
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
  // ประวัติการนำเข้า + ยกเลิกรอบที่นำเข้าผิด
  const [batches, setBatches] = useState<OdImportBatch[]>([]);
  const [undoTarget, setUndoTarget] = useState<OdImportBatch | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [changed, setChanged] = useState(false);   // ยกเลิกรอบไปแล้ว → ปิดหน้าต่างต้องรีเฟรชยอด
  const [msg, setMsg] = useState("");

  const loadBatches = useCallback(async (fid: string) => {
    if (!fid) { setBatches([]); return; }
    try {
      const j = await apiFetch(`/api/od-statement/import?facility_id=${fid}`).then((r) => r.json());
      setBatches((j?.data ?? []) as OdImportBatch[]);
    } catch { setBatches([]); }
  }, []);
  useEffect(() => { void loadBatches(facilityId); }, [facilityId, loadBatches]);

  const undo = async () => {
    const b = undoTarget; if (!b) return;
    setUndoing(true); setErr(""); setMsg("");
    try {
      const res = await apiFetch(`/api/od-statement/import?facility_id=${facilityId}&batch_id=${b.batch_id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) throw new Error(j?.error || "ยกเลิกไม่สำเร็จ");
      setMsg(`ยกเลิกการนำเข้า ${j.removed} รายการแล้ว — ระบบคิดยอดใช้ OD ใหม่ให้แล้ว`);
      setChanged(true);
      await loadBatches(facilityId);
    } catch (e) { setErr(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ"); }
    finally { setUndoing(false); setUndoTarget(null); }
  };
  const closeModal = () => { onClose(); if (changed && typeof window !== "undefined") window.location.reload(); };

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
    <>
    <ERPModal
      open
      onClose={closeModal}
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
            <button onClick={closeModal} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{changed ? "ปิด (รีเฟรช)" : "ยกเลิก"}</button>
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
          {msg && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">✓ {msg}</div>}

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

          {/* ประวัติการนำเข้า — นำเข้าผิดไฟล์/ผิดวงเงิน กดยกเลิกรอบนั้นได้ */}
          {facilityId && (
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs font-medium text-slate-600 mb-1.5">🕘 ประวัติการนำเข้าของวงเงินนี้</p>
              {batches.length === 0 ? (
                <p className="text-xs text-slate-400">ยังไม่เคยนำเข้า</p>
              ) : (
                <div className="max-h-44 overflow-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {batches.map((b) => (
                    <div key={b.batch_id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="text-slate-700">นำเข้าเมื่อ {formatDate(b.imported_at)} · {b.count} รายการ</div>
                        <div className="text-[11px] text-slate-400">รายการวันที่ {formatDate(b.date_from)}{b.date_to !== b.date_from ? ` – ${formatDate(b.date_to)}` : ""} · เข้า {THB(b.money_in)} · ออก {THB(b.money_out)}</div>
                      </div>
                      <button onClick={() => setUndoTarget(b)} className="shrink-0 h-7 px-2 rounded-md border border-red-200 text-red-600 hover:bg-red-50">↩ ยกเลิกการนำเข้า</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </ERPModal>
    <ConfirmDialog open={undoTarget !== null} onClose={() => { if (!undoing) setUndoTarget(null); }} onConfirm={() => void undo()} loading={undoing}
      variant="danger" title="ยกเลิกการนำเข้ารอบนี้?" confirmText="↩ ยกเลิกการนำเข้า" cancelText="ไม่ยกเลิก"
      message={undoTarget ? `รายการ ${undoTarget.count} รายการ (วันที่ ${formatDate(undoTarget.date_from)} – ${formatDate(undoTarget.date_to)}) จะถูกเอาออกจากการคิดยอดใช้ OD และดอกเบี้ยประมาณการ — นำเข้าไฟล์ที่ถูกต้องใหม่ได้ทันที` : ""} />
    </>
  );
}
