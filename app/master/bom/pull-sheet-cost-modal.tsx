"use client";

/**
 * PullSheetCostModal — "ดึงสูตรจาก Design Sheet" เข้าสูตร BOM ที่กำลังทำ
 *
 * ทิศกลับกับปุ่มในใบงานออกแบบ (bom-from-cost-wizard): ที่นั่นสร้าง BOM ใหม่จากตีราคา
 * ที่นี่ = ฟอร์ม BOM เปิดอยู่แล้ว → เลือกใบ Design Sheet + แท็บตีราคา → ดึงบรรทัด (กว้าง/ยาว/จำนวน/ชนิด)
 * เข้ามาเป็นบรรทัดวัตถุดิบ (component เว้นว่าง = เติมวัตถุดิบจริงทีหลัง) เหมือนปุ่ม "คัดลอก BOM"
 *
 * ใช้ของกลาง: ERPModal · /api/design-sheets (ค้นหาใบ) · /api/design-sheets/[id]/cost-lines
 * คืนบรรทัดผ่าน onImport(EditorLine[]) → หน้า BOM เอาไปต่อท้าย form.lines เอง
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { HoverImage } from "@/components/hover-image";
import { emptyLine, type EditorLine } from "./line-editor";

// cover_url = รูปแรกของใบงาน (API /api/design-sheets ส่งมาให้อยู่แล้ว)
type SheetRow = { id: string; code: string; name: string; status?: string | null; cover_url?: string | null };
type CostLine = {
  item_name: string | null; group_name: string | null; parent_code?: string | null;
  width_cm: number | null; length_cm: number | null; pieces: number | null;
  face_width_cm: number | null; waste_percent: number | null; qty: number | null; uom: string | null;
};

const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("th-TH", { maximumFractionDigits: 4 }));
const tabLabel = (k: string) => (k === "" ? "ทั่วไป" : k);

export function PullSheetCostModal({
  open, onClose, onImport, defaultSearch,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (lines: EditorLine[]) => void;
  defaultSearch?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SheetRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [sheet, setSheet] = useState<SheetRow | null>(null);
  const [lines, setLines] = useState<CostLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [tab, setTab] = useState<string>("");
  const [include, setInclude] = useState<Record<number, boolean>>({});

  // รีเซ็ตทุกครั้งที่เปิด
  useEffect(() => {
    if (open) { setQ(defaultSearch ?? ""); setResults([]); setSheet(null); setLines([]); setTab(""); setInclude({}); }
  }, [open, defaultSearch]);

  // ค้นหาใบ (debounce) — ยังไม่เลือกใบ
  useEffect(() => {
    if (!open || sheet) return;
    let alive = true; setSearching(true);
    const t = setTimeout(() => {
      apiFetch(`/api/design-sheets?search=${encodeURIComponent(q)}&limit=15`).then((r) => r.json())
        .then((j) => { if (alive) setResults((j.data ?? []) as SheetRow[]); })
        .catch(() => {}).finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open, sheet]);

  const pickSheet = async (s: SheetRow) => {
    setSheet(s); setLoadingLines(true); setLines([]);
    try {
      const j = await apiFetch(`/api/design-sheets/${s.id}/cost-lines`).then((r) => r.json());
      const cl = (j.data ?? []) as CostLine[];
      setLines(cl);
      const keys = [...new Set(cl.map((l) => l.parent_code ?? ""))];
      setTab(keys.includes("") || keys.length === 0 ? "" : keys[0]);
    } catch { /* โหลดไม่ได้ */ } finally { setLoadingLines(false); }
  };

  const tabs = useMemo(() => {
    const keys = [...new Set(lines.map((l) => l.parent_code ?? ""))];
    if (!keys.includes("")) keys.unshift("");   // โชว์ "ทั่วไป" เสมอ
    return keys;
  }, [lines]);

  const curLines = useMemo(() => lines.filter((l) => (l.parent_code ?? "") === tab), [lines, tab]);

  // ตั้ง include = ติ๊กทุกบรรทัดของแท็บนี้
  useEffect(() => { setInclude(Object.fromEntries(curLines.map((_, i) => [i, true]))); }, [curLines]);

  const chosen = curLines.filter((_, i) => include[i] ?? true);

  const doImport = () => {
    const editorLines: EditorLine[] = chosen.map((r) => ({
      ...emptyLine(),
      component_name: r.item_name ?? "",       // ชื่อวัสดุจากตีราคา = ตัวช่วยจำ (วัตถุดิบจริงเลือกทีหลัง)
      material_type: r.group_name ?? "",
      qty: r.qty ?? r.pieces ?? 0,
      uom: r.uom ?? "หลา",
      waste_percent: r.waste_percent ?? 0,
      pieces: r.pieces ?? 1,
      cut_width: r.width_cm ?? 0,
      cut_length: r.length_cm ?? 0,
      face_width_cm: r.face_width_cm ?? 0,
      source: "design_cost",
    }));
    onImport(editorLines);
    onClose();
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" title="🧬 ดึงสูตรจาก Design Sheet">
      <div className="p-1 space-y-3">
        {/* ==== สเต็ป 1: เลือกใบ Design Sheet ==== */}
        {!sheet ? (
          <div>
            <div className="text-sm font-medium text-slate-700 mb-1">1) เลือกใบงานออกแบบที่จะดึงตีราคา</div>
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="ค้นหารหัส/ชื่อใบงาน เช่น DS-2026-0012, กระเป๋า…"
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="mt-2 max-h-72 overflow-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
              {searching && <div className="px-3 py-4 text-sm text-slate-400">กำลังค้นหา…</div>}
              {!searching && results.length === 0 && <div className="px-3 py-4 text-sm text-slate-400">ไม่พบใบงาน</div>}
              {results.map((s) => (
                <button key={s.id} type="button" onClick={() => void pickSheet(s)}
                  className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center gap-3">
                  {/* รูปใบงาน — ชี้ที่รูปเพื่อดูใหญ่ (ของกลาง HoverImage) */}
                  <span className="shrink-0"><HoverImage url={s.cover_url ?? null} size={40} previewSize={320} fallback="📐" /></span>
                  <code className="text-[11px] text-slate-400 font-mono shrink-0">{s.code}</code>
                  <span className="text-sm text-slate-700 truncate flex-1">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* หัว: ใบที่เลือก + เปลี่ยนใบ */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <HoverImage url={sheet.cover_url ?? null} size={32} previewSize={320} fallback="📐" />
              <code className="text-[11px] text-slate-400 font-mono">{sheet.code}</code>
              <span className="text-sm text-slate-700 truncate flex-1">{sheet.name}</span>
              <button type="button" onClick={() => { setSheet(null); setLines([]); }}
                className="text-xs text-blue-600 hover:underline shrink-0">เปลี่ยนใบ</button>
            </div>

            {/* แท็บตีราคา (ทั่วไป / Parent) */}
            {tabs.length > 1 && (
              <div className="flex flex-wrap items-center gap-1">
                {tabs.map((k) => {
                  const n = lines.filter((l) => (l.parent_code ?? "") === k).length;
                  const active = tab === k;
                  return (
                    <button key={k || "__gen__"} type="button" onClick={() => setTab(k)}
                      className={`h-7 px-2.5 text-xs rounded-md inline-flex items-center gap-1 border ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                      {tabLabel(k)}
                      {n > 0 && <span className={`text-[10px] rounded-full px-1 ${active ? "bg-white/25" : "bg-slate-100 text-slate-500"}`}>{n}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="px-3 py-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
              ดึงมาแค่ <b>ขนาด (กว้าง/ยาว)</b>, <b>จำนวน</b>, <b>ชนิด</b> — ส่วน <b>วัตถุดิบตัวจริง</b> ค่อยเลือกในบรรทัดทีหลัง
            </div>

            {/* ตารางบรรทัด */}
            {loadingLines ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400">กำลังโหลดตีราคา…</div>
            ) : curLines.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">แท็บ “{tabLabel(tab)}” ไม่มีบรรทัดตีราคา</div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                      <th className="w-8 px-2 py-1.5"></th>
                      <th className="px-2 py-1.5 text-left font-medium">ชนิด / วัสดุ</th>
                      <th className="px-2 py-1.5 text-right font-medium">กว้าง</th>
                      <th className="px-2 py-1.5 text-right font-medium">ยาว</th>
                      <th className="px-2 py-1.5 text-right font-medium">จำนวน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {curLines.map((r, i) => {
                      const on = include[i] ?? true;
                      return (
                        <tr key={i} className={on ? "" : "opacity-40"}>
                          <td className="px-2 py-1.5 text-center">
                            <input type="checkbox" checked={on}
                              onChange={(e) => setInclude((a) => ({ ...a, [i]: e.target.checked }))} />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="text-slate-700 truncate">{r.item_name || "—"}</div>
                            <div className="text-[11px] text-slate-400 truncate">{r.group_name || "ไม่ระบุชนิด"}</div>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmt(r.width_cm)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmt(r.length_cm)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmt(r.qty)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 mt-2">
              <button type="button" onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
              <button type="button" onClick={doImport} disabled={chosen.length === 0}
                className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                ดึงเข้าสูตร ({chosen.length} บรรทัด)
              </button>
            </div>
          </>
        )}
      </div>
    </ERPModal>
  );
}
