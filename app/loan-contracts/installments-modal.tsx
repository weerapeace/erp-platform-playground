"use client";

/**
 * ป๊อปอัป "ดูงวดทั้งหมด" ของสัญญาเงินกู้
 * --------------------------------------------------------------------------
 * เดิมปุ่มนี้เปิดแท็บใหม่ไปหน้า /loan-installments — เจ้าของขอให้เป็นป๊อปอัป
 * (ดูแล้วปิด กลับมาที่สัญญาเดิมได้ทันที ไม่หลุดออกจากหน้า)
 *
 * โหมดแก้ไข (✏️ แก้ยอดรายงวด) ทำได้ 3 อย่าง — เพราะตารางจริงของธนาคาร
 * "บางงวดเงินต้นกับดอกเบี้ยไม่เท่ากัน" สูตรอัตโนมัติคิดไม่ตรง:
 *   1. พิมพ์ยอดจริงรายงวด (เงินต้น / ดอกเบี้ย / วันครบกำหนด)
 *   2. ➕ เพิ่มงวด · 🗑 ลบงวด  (ระบบเรียงเลขงวดใหม่ให้เอง)
 *   3. 📋 วางทั้งใบจาก Excel  (คัดลอกตารางผ่อนของธนาคารมาแปะทีเดียว)
 * บันทึกแล้วระบบคิดเงินต้นคงเหลือต่อเนื่องใหม่ทั้งตาราง + ตัดยอดการจ่ายใหม่ให้เอง
 *
 * ใช้ของกลาง: ERPModal · MiniTable · MoneyInput (ช่องเงินมีลูกน้ำ) · DateInput
 *             lib/paste-table (อ่านตารางที่วางจาก Excel)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { MoneyInput } from "@/components/money-input";
import { DateInput } from "@/components/date-input";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { parsePastedTable, dropHeaderRow, parseNumberCell, parseDateCell, isDateCell } from "@/lib/paste-table";

/** แถวในตาราง — ใช้ทั้งโหมดดูและโหมดแก้ (ยอดเก็บเป็น string เพื่อให้พิมพ์ได้ลื่น) */
type Row = {
  key: string;
  id: string | null;        // null = งวดใหม่ที่ยังไม่บันทึก
  due_date: string;         // "YYYY-MM-DD" หรือ ""
  principal: string;
  interest: string;
  fee: number;
  penalty: number;
  paid: number;             // จ่ายแล้ว (ระบบตัดให้ — แก้ที่นี่ไม่ได้)
  status: string;
};

const PAY_STATUS: Record<string, [string, string]> = {
  unpaid:  ["ยังไม่จ่าย", "bg-slate-100 text-slate-500 border-slate-200"],
  partial: ["จ่ายบางส่วน", "bg-amber-50 text-amber-700 border-amber-200"],
  paid:    ["จ่ายครบ", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  overdue: ["เกินกำหนด", "bg-red-50 text-red-700 border-red-200"],
};

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const n2 = (v: string) => Math.round(num(v) * 100) / 100;
const money = (v: number) => v ? <span className="tabular-nums">{formatAmount(v)}</span> : <span className="text-slate-300">—</span>;
const inputCls = "w-full h-8 px-2 text-sm text-right tabular-nums border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500";
const btnSm = "h-8 px-3 text-xs font-medium rounded-lg border transition-colors disabled:opacity-40";

/** แปลงตารางที่วางมาจาก Excel → งวดผ่อน (คอลัมน์: [งวดที่] วันครบกำหนด เงินต้น ดอกเบี้ย) */
function parseSchedulePaste(text: string): { rows: Row[]; bad: number } {
  const grid = dropHeaderRow(parsePastedTable(text), /งวด|วันที่|ครบกำหนด|เงินต้น|ดอกเบี้ย|date|principal|interest/i);
  const rows: Row[] = [];
  let bad = 0;
  grid.forEach((cells, i) => {
    // มีคอลัมน์ "งวดที่" นำหน้าไหม → ดูว่าช่องแรกไม่ใช่วันที่ แต่ช่องที่สองเป็นวันที่
    const o = !isDateCell(cells[0]) && isDateCell(cells[1]) ? 1 : 0;
    const due = parseDateCell(cells[o]);
    if (!due) { bad++; return; }
    rows.push({
      key: `paste-${i}`,
      id: null,
      due_date: due,
      principal: String(parseNumberCell(cells[o + 1])),
      interest: String(parseNumberCell(cells[o + 2])),
      fee: 0, penalty: 0, paid: 0, status: "unpaid",
    });
  });
  return { rows, bad };
}

export function InstallmentsModal({
  open, onClose, contractId, contractLabel, canEdit = true, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  contractId: string;
  contractLabel?: string;
  /** ให้แก้ยอดรายงวดได้ไหม (สิทธิ์ loan_schedules.edit ตรวจซ้ำที่ API เสมอ) */
  canEdit?: boolean;
  /** บันทึกแล้ว → ให้หน้าสัญญาโหลดตัวเลขความคืบหน้าใหม่ */
  onSaved?: () => Promise<void> | void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<Row[]>([]);          // ค่าที่โหลดมา (ของจริงในฐานข้อมูล)
  const [draft, setDraft] = useState<Row[] | null>(null); // ค่าที่กำลังแก้ (null = ไม่ได้อยู่โหมดแก้)
  const [basePrincipal, setBasePrincipal] = useState(0);
  const [versionId, setVersionId] = useState("");
  const [versionNo, setVersionNo] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [confirmPaste, setConfirmPaste] = useState<{ rows: Row[]; bad: number } | null>(null);

  const editing = draft !== null;
  const shown = draft ?? rows;

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      // 1) ตารางผ่อนเวอร์ชันที่ใช้อยู่ (active) ของสัญญานี้
      const vFilter = encodeURIComponent(JSON.stringify({
        loan_contract_id: { type: "text", value: contractId },
        status: { type: "select", selected: ["active"] },
      }));
      const vr = await apiFetch(`/api/master-v2/loan-schedule-versions?filters=${vFilter}&sort_by=version_no&sort_dir=desc&limit=5`);
      const vj = await vr.json();
      const ver = ((vj?.data ?? []) as Record<string, unknown>[])[0];
      if (!ver) { setRows([]); setVersionId(""); setVersionNo(null); setLoading(false); return; }
      setVersionId(String(ver.id));
      setVersionNo(Number(ver.version_no) || null);

      // 2) งวดของเวอร์ชันนั้น (ไม่เอาของเวอร์ชันเก่าที่ถูกแทนที่ไปแล้ว)
      const iFilter = encodeURIComponent(JSON.stringify({
        schedule_version_id: { type: "text", value: String(ver.id) },
      }));
      const ir = await apiFetch(`/api/master-v2/loan-installments?filters=${iFilter}&sort_by=installment_no&sort_dir=asc&limit=2000`);
      const ij = await ir.json();
      const raw = ((ij?.data ?? []) as Record<string, unknown>[])
        .sort((a, b) => num(a.installment_no) - num(b.installment_no));
      setBasePrincipal(num(raw[0]?.opening_principal));
      setRows(raw.map((r) => ({
        key: String(r.id),
        id: String(r.id),
        due_date: (r.due_date as string) ?? "",
        principal: String(num(r.principal_due)),
        interest: String(num(r.interest_due)),
        fee: num(r.fee_due),
        penalty: num(r.penalty_due),
        paid: num(r.total_paid),
        status: String(r.payment_status ?? "unpaid"),
      })));
    } catch {
      setErr("โหลดงวดผ่อนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    if (!open) return;
    setDraft(null); setPasteOpen(false); setPasteText(""); setConfirmPaste(null);
    load();
  }, [open, load]);

  // ── โหมดแก้ ─────────────────────────────────────────────────────────
  const startEdit = () => setDraft(rows.map((r) => ({ ...r })));
  const cancelEdit = () => { setDraft(null); setPasteOpen(false); setPasteText(""); };

  const setCell = (key: string, patch: Partial<Row>) =>
    setDraft((p) => p && p.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRow = () => setDraft((p) => {
    const list = p ?? [];
    const last = list[list.length - 1];
    // วันครบกำหนดของงวดใหม่ = เดือนถัดจากงวดสุดท้าย (เดาให้ แก้ต่อได้)
    let due = "";
    if (last?.due_date) {
      const [y, m, d] = last.due_date.split("-").map(Number);
      const nx = new Date(Date.UTC(y, m, 1));           // เดือนถัดไป (m คือ index เดือนถัดไปพอดี)
      const dim = new Date(Date.UTC(nx.getUTCFullYear(), nx.getUTCMonth() + 1, 0)).getUTCDate();
      due = `${nx.getUTCFullYear()}-${String(nx.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, dim)).padStart(2, "0")}`;
    }
    return [...list, {
      key: `new-${Date.now()}-${list.length}`, id: null, due_date: due,
      principal: last?.principal ?? "0", interest: last?.interest ?? "0",
      fee: 0, penalty: 0, paid: 0, status: "unpaid",
    }];
  });

  const removeRow = (key: string) => setDraft((p) => (p ? p.filter((r) => r.key !== key) : p));

  const applyPaste = () => {
    const parsed = parseSchedulePaste(pasteText);
    if (parsed.rows.length === 0) { setErr("อ่านตารางที่วางมาไม่ได้ — ตรวจว่ามีคอลัมน์วันครบกำหนดอยู่ด้วย"); return; }
    setErr("");
    setConfirmPaste(parsed);
  };

  // เงินต้นคงเหลือ + ยอดรวมต่องวด คำนวณสด (โชว์ผลทันทีตอนแก้ ก่อนกดบันทึก)
  const calc = useMemo(() => {
    const map = new Map<string, { no: number; total: number; closing: number }>();
    let open = basePrincipal;
    shown.forEach((r, i) => {
      const pri = n2(r.principal);
      const total = Math.round((pri + n2(r.interest) + r.fee + r.penalty) * 100) / 100;
      const closing = Math.round((open - pri) * 100) / 100;
      open = closing;
      map.set(r.key, { no: i + 1, total, closing });
    });
    return map;
  }, [shown, basePrincipal]);

  const sum = useMemo(() => shown.reduce((a, r) => ({
    principal: a.principal + n2(r.principal),
    interest:  a.interest + n2(r.interest),
    due:       a.due + (calc.get(r.key)?.total ?? 0),
    paid:      a.paid + r.paid,
  }), { principal: 0, interest: 0, due: 0, paid: 0 }), [shown, calc]);

  // เปลี่ยนจากของเดิมไหม (กันปิดทิ้งโดยไม่ตั้งใจ)
  const dirty = useMemo(() => {
    if (!draft) return false;
    if (draft.length !== rows.length) return true;
    return draft.some((d, i) => {
      const o = rows[i];
      return !o || d.id !== o.id || d.due_date !== o.due_date
        || n2(d.principal) !== n2(o.principal) || n2(d.interest) !== n2(o.interest);
    });
  }, [draft, rows]);

  const save = async () => {
    if (!versionId || !draft) return;
    if (draft.length === 0) { setErr("ต้องมีอย่างน้อย 1 งวด"); return; }
    setSaving(true); setErr("");
    try {
      const res = await apiFetch("/api/loan-schedule/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version_id: versionId,
          mode: "replace",
          rows: draft.map((r) => ({
            ...(r.id ? { id: r.id } : {}),
            due_date: r.due_date || "",
            principal_due: n2(r.principal),
            interest_due: n2(r.interest),
          })),
        }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) { setErr(j?.error || "บันทึกไม่สำเร็จ"); setSaving(false); return; }
      setDraft(null); setPasteOpen(false); setPasteText("");
      await load();
      await onSaved?.();
    } catch {
      setErr("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setSaving(false);
    }
  };

  // ── คอลัมน์ ─────────────────────────────────────────────────────────
  const columns: MiniColumn<Row>[] = useMemo(() => {
    // ตอนแก้ไม่ให้เรียงลำดับ — ลำดับแถวบนจอ = ลำดับงวดที่จะบันทึก ห้ามสลับ
    const sv = <T,>(fn: (r: Row) => T) => (editing ? undefined : fn);
    const cols: MiniColumn<Row>[] = [
      {
        key: "no", header: "งวดที่", width: "3.5rem", align: "center",
        sortValue: sv((r) => calc.get(r.key)?.no ?? 0), sortLabel: "งวดที่",
        cell: (r) => <span className="text-sm font-medium text-slate-600 tabular-nums">{calc.get(r.key)?.no ?? ""}</span>,
      },
      {
        key: "due_date", header: "ครบกำหนด", width: "8rem",
        sortValue: sv((r) => r.due_date), sortLabel: "วันครบกำหนด",
        cell: (r) => editing
          ? <DateInput value={r.due_date} onChange={(iso) => setCell(r.key, { due_date: iso })} />
          : <span className="text-sm tabular-nums text-slate-700">{r.due_date ? formatDate(r.due_date) : "—"}</span>,
      },
      {
        key: "principal", header: "เงินต้น", width: "1fr", align: "right",
        sortValue: sv((r) => n2(r.principal)), sortLabel: "เงินต้น",
        cell: (r) => editing
          ? <MoneyInput value={r.principal} onChange={(raw) => setCell(r.key, { principal: raw })} className={inputCls} />
          : money(n2(r.principal)),
      },
      {
        key: "interest", header: "ดอกเบี้ย", width: "1fr", align: "right",
        sortValue: sv((r) => n2(r.interest)), sortLabel: "ดอกเบี้ย",
        cell: (r) => editing
          ? <MoneyInput value={r.interest} onChange={(raw) => setCell(r.key, { interest: raw })} className={inputCls} />
          : money(n2(r.interest)),
      },
      {
        key: "total", header: "รวมต้องจ่าย", width: "1fr", align: "right",
        sortValue: sv((r) => calc.get(r.key)?.total ?? 0), sortLabel: "รวมต้องจ่าย",
        cell: (r) => <span className={`text-sm font-medium ${editing ? "text-blue-600" : "text-slate-800"}`}>{money(calc.get(r.key)?.total ?? 0)}</span>,
      },
      {
        key: "paid", header: "จ่ายแล้ว", width: "1fr", align: "right",
        sortValue: sv((r) => r.paid), sortLabel: "จ่ายแล้ว",
        cell: (r) => money(r.paid),
      },
      {
        key: "closing", header: "เงินต้นคงเหลือ", width: "1.1fr", align: "right",
        sortValue: sv((r) => calc.get(r.key)?.closing ?? 0), sortLabel: "เงินต้นคงเหลือ",
        cell: (r) => <span className="text-sm text-slate-500">{money(calc.get(r.key)?.closing ?? 0)}</span>,
      },
      {
        key: "status", header: "สถานะ", width: "6.5rem", align: "center",
        sortValue: sv((r) => r.status), sortLabel: "สถานะ",
        cell: (r) => {
          if (!r.id) return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border bg-blue-50 text-blue-600 border-blue-200">งวดใหม่</span>;
          const m = PAY_STATUS[r.status];
          return m
            ? <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${m[1]}`}>{m[0]}</span>
            : <span className="text-xs text-slate-300">{r.status || "—"}</span>;
        },
      },
    ];
    if (editing) {
      cols.push({
        key: "del", header: "", width: "2.5rem", align: "center",
        cell: (r) => (
          <button type="button" onClick={() => removeRow(r.key)} title="ลบงวดนี้"
            className="w-6 h-6 rounded text-slate-300 hover:text-red-600 hover:bg-red-50">🗑</button>
        ),
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, calc]);

  const hasSchedule = rows.length > 0 || editing;

  return (
    <>
      {/* hasUnsavedChanges: ERPModal กลางจะถามเอง ถ้ายังแก้ค้างแล้วกดปิด/Escape */}
      <ERPModal
        open={open}
        onClose={onClose}
        hasUnsavedChanges={dirty}
        title={`งวดผ่อนทั้งหมด${contractLabel ? ` — ${contractLabel}` : ""}`}
        description={
          versionNo
            ? `ตารางผ่อนที่ใช้อยู่ (เวอร์ชัน ${versionNo}) · ${shown.length} งวด${editing ? " · กำลังแก้ — กด “บันทึกตารางผ่อน” เมื่อเสร็จ" : ""}`
            : "ยังไม่มีตารางผ่อนที่ใช้อยู่ — กดปุ่ม 🧾 สร้างตารางผ่อน ในหน้าสัญญาก่อน"
        }
        size="xl"
        resizable
        storageKey="loan-installments-modal"
        footer={
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[11px] text-slate-500 tabular-nums">
              รวมเงินต้น <b className="text-slate-700">{formatAmount(sum.principal)}</b>
              <span className="mx-1.5 text-slate-300">·</span>
              รวมดอกเบี้ย <b className="text-slate-700">{formatAmount(sum.interest)}</b>
              <span className="mx-1.5 text-slate-300">·</span>
              รวมต้องจ่าย <b className="text-slate-700">{formatAmount(sum.due)}</b>
              <span className="mx-1.5 text-slate-300">·</span>
              จ่ายแล้ว <b className="text-emerald-600">{formatAmount(sum.paid)}</b>
            </div>
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <button onClick={cancelEdit} disabled={saving}
                    className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                    ยกเลิกการแก้
                  </button>
                  <button onClick={save} disabled={saving || !dirty}
                    className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? "กำลังบันทึก..." : `บันทึกตารางผ่อน (${shown.length} งวด)`}
                  </button>
                </>
              ) : (
                <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {err}</div>}

          {editing && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              พิมพ์ยอดจริงตามใบของธนาคารได้เลย — แต่ละงวดเงินต้นกับดอกเบี้ยไม่เท่ากันก็ได้ · เพิ่ม/ลบงวดได้ ระบบเรียงเลขงวดใหม่ให้เอง ·
              เมื่อบันทึก ระบบจะคิด “เงินต้นคงเหลือ” ต่อเนื่องใหม่ทั้งตาราง และตัดยอดการจ่ายที่บันทึกไว้แล้วใหม่ให้อัตโนมัติ
            </div>
          )}

          {/* แผงวางตารางจาก Excel */}
          {editing && pasteOpen && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
              <div className="text-[11px] text-slate-600">
                คัดลอกตารางผ่อนจาก Excel แล้ววางในช่องนี้ · คอลัมน์ตามลำดับ:
                <b className="ml-1">[งวดที่] · วันครบกำหนด · เงินต้น · ดอกเบี้ย</b>
                <span className="text-slate-400"> (คอลัมน์ “งวดที่” มีหรือไม่มีก็ได้ · มีหัวตารางติดมาก็ได้)</span>
                <br />วันที่รับได้หลายแบบ: <span className="tabular-nums">2026-09-05</span> · <span className="tabular-nums">05/09/2026</span> · <span className="tabular-nums">5/9/2569</span> · 5 ก.ย. 2569 · ตัวเลขมีลูกน้ำได้
                <br /><b className="text-amber-700">⚠ การวางจะแทนที่งวดทั้งหมดในตารางนี้</b>
                <span className="text-slate-400"> — ถ้าอยากเก็บตารางเดิมไว้เป็นประวัติ ให้กด 🧾 สร้างตารางผ่อน (ได้เวอร์ชันใหม่ ของเดิมเก็บไว้) ก่อนแล้วค่อยวาง</span>
              </div>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6}
                placeholder={"1\t05/09/2026\t70,292.30\t28,125.00\n2\t05/10/2026\t70,703.51\t27,713.79"}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <div className="flex items-center gap-2">
                <button onClick={applyPaste} disabled={!pasteText.trim()}
                  className={`${btnSm} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}>
                  ตรวจแล้วใส่ลงตาราง
                </button>
                <button onClick={() => { setPasteOpen(false); setPasteText(""); }}
                  className={`${btnSm} border-slate-200 text-slate-600 hover:bg-white`}>ปิดแผงนี้</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">กำลังโหลดงวดผ่อน...</div>
          ) : (
            /* จอแคบ → เลื่อนตารางไปทางข้างได้ (ไม่ให้คอลัมน์ถูกบีบจนอ่านไม่ออก) */
            <div className="overflow-x-auto">
            <div className="min-w-[820px]">
            <MiniTable
              rows={shown}
              columns={columns}
              rowKey={(r) => r.key}
              searchText={editing ? undefined : (r) => `${r.due_date} ${PAY_STATUS[r.status]?.[0] ?? r.status}`}
              searchPlaceholder="ค้นหางวด / วันที่…"
              countUnit="งวด"
              dense
              maxHeightClass="max-h-[52vh]"
              emptyText="ยังไม่มีงวดผ่อน — สร้างตารางผ่อนก่อน"
              actions={
                <div className="flex items-center gap-2">
                  {canEdit && hasSchedule && !editing && (
                    <button onClick={startEdit} className={`${btnSm} border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100`}>
                      ✏️ แก้ยอดรายงวด
                    </button>
                  )}
                  {editing && (
                    <>
                      <button onClick={addRow} className={`${btnSm} border-slate-200 text-slate-600 hover:bg-slate-50`}>➕ เพิ่มงวด</button>
                      <button onClick={() => setPasteOpen((v) => !v)}
                        className={`${btnSm} ${pasteOpen ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                        📋 วางจาก Excel
                      </button>
                    </>
                  )}
                  {!editing && (
                    <a href={`/loan-installments?flt=${encodeURIComponent(JSON.stringify({ loan_contract_id: contractId }))}`}
                      target="_blank" rel="noopener noreferrer"
                      className={`${btnSm} border-slate-200 text-slate-500 hover:bg-slate-50 inline-flex items-center`}>
                      เปิดหน้าเต็ม ↗
                    </a>
                  )}
                </div>
              }
              footnote={editing
                ? "เงินต้นคงเหลือคำนวณสดจากยอดที่พิมพ์ (ยังไม่บันทึก) · งวดที่ลบไปแล้ว เงินที่เคยตัดเข้างวดนั้นจะถูกนำไปตัดงวดอื่นใหม่ให้อัตโนมัติ"
                : "เงินต้นคงเหลือของแต่ละงวด = ยอดหลังหักเงินต้นงวดนั้น · ยอด “จ่ายแล้ว” มาจากใบบันทึกการจ่าย ระบบตัดให้เอง"}
            />
            </div>
            </div>
          )}
        </div>
      </ERPModal>

      <ConfirmDialog
        open={!!confirmPaste}
        onClose={() => setConfirmPaste(null)}
        onConfirm={() => {
          if (confirmPaste) { setDraft(confirmPaste.rows); setPasteOpen(false); setPasteText(""); }
          setConfirmPaste(null);
        }}
        title="ใส่ตารางที่วางมาแทนของเดิม"
        message={confirmPaste
          ? `อ่านได้ ${confirmPaste.rows.length} งวด${confirmPaste.bad ? ` (ข้าม ${confirmPaste.bad} บรรทัดที่อ่านวันที่ไม่ได้)` : ""} · จะแทนที่งวดทั้งหมด ${rows.length} งวดในตาราง — ยังไม่บันทึกลงระบบจนกว่าจะกด “บันทึกตารางผ่อน”`
          : ""}
        confirmText="ใส่ลงตาราง"
        cancelText="ยกเลิก"
        variant="danger"
      />
    </>
  );
}
