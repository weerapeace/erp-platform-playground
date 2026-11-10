"use client";

/**
 * ✂ หน้าแพทเทิร์นจากตีราคา — เปิดจากใบงานออกแบบ (เมนู พิมพ์ / แท็บตีราคา → เครื่องมือ) · เจ้าของขอ 2026-11-07
 *   ภาพรวม: รายการชิ้น (P1, P2, …) + ภาพชิ้นทั้งหมด + วางบนผ้า (ตัววางผ้าตัวเดียวกับเครื่องคิดเลขผ้า)
 *   ขนาดจริง (A4): หน้าแรก = วิธีต่อ + กรอบทดสอบ 5 ซม. + แผนผังหน้า · หน้าถัดไป = ชิ้นขนาดจริง 1:1 แบ่งหน้า A4 ทับกัน 1 ซม.
 *   ดาวน์โหลด DXF (เครื่องตัด · หน่วยมม.) / SVG (Illustrator)
 *   ?parent= = แท็บตีราคาที่กำลังดู (ไซส์/เวอร์ชัน) · ชิ้นเป็นสี่เหลี่ยมตามกว้าง×ยาวในตาราง
 * หน้านี้ = โหลดใบงาน + เลือกแท็บ · ตัวหน้าพิมพ์ = ของกลาง PatternPrintView (components/pattern-sheet/print-view — ใช้ร่วมกับแอปสตูดิโอแพทเทิร์น)
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { usePrintLog } from "@/components/report/use-print-log";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import { costTabLabel, generalLabelOf } from "@/lib/design-sheet-cost-labels";
import type { CostLine } from "@/app/api/design-sheets/[id]/cost-lines/route";
import { PatternPrintView } from "@/components/pattern-sheet/print-view";

type Sheet = { id?: string; code?: string; name?: string; cost_general_label?: string | null; parent_sku_codes?: string[]; parent_sku_drafts?: string[] };
const pkey = (s: string | null | undefined) => s ?? "";

export default function PrintDesignSheetPatternPage() {
  const { id } = useParams<{ id: string }>();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [lines, setLines] = useState<CostLine[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string>("");
  const [selReady, setSelReady] = useState(false);
  // อ่าน ?parent= ตอนเปิดหน้า (ใน effect — ตอนเปลี่ยนหน้าแบบไม่โหลดใหม่ URL อาจยังไม่เปลี่ยนตอนเรนเดอร์แรก)
  useEffect(() => { setSel(new URLSearchParams(window.location.search).get("parent") ?? ""); setSelReady(true); }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch(`/api/design-sheets/${id}`).then((r) => r.json()),
      apiFetch(`/api/design-sheets/${id}/cost-lines`).then((r) => r.json()),
    ]).then(([s, l]) => {
      if (!alive) return;
      if (s?.error) throw new Error(s.error);
      setSheet((s?.data ?? null) as Sheet | null);
      setLines(Array.isArray(l?.data) ? (l.data as CostLine[]) : []);
    }).catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  const generalLabel = generalLabelOf(sheet?.cost_general_label);
  // แท็บที่มีบรรทัดอยู่จริง (ทั่วไป + ไซส์/เวอร์ชัน) — เรียงตามใบงาน
  const tabs = useMemo(() => {
    const keys = new Set(lines.map((l) => pkey(l.parent_code)));
    const order = ["", ...(sheet?.parent_sku_codes ?? []), ...(sheet?.parent_sku_drafts ?? [])];
    const out = order.filter((k, i) => keys.has(k) && order.indexOf(k) === i);
    for (const k of keys) if (!out.includes(k)) out.push(k);
    return out.map((k) => ({ key: k, label: costTabLabel(k, generalLabel), n: lines.filter((l) => pkey(l.parent_code) === k).length }));
  }, [lines, sheet, generalLabel]);
  useEffect(() => { if (selReady && tabs.length && !tabs.some((t) => t.key === sel)) setSel(tabs[0].key); }, [tabs, sel, selReady]);

  const tabLines = useMemo(() => lines.filter((l) => pkey(l.parent_code) === sel).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [lines, sel]);

  const code = sheet?.code ?? "";
  const tabLabel = costTabLabel(sel, generalLabel);
  const fileName = docFileName("แพทเทิร์น", `${code}${sel ? `-${sel}` : ""}`);
  usePrintLog("ds_pattern", id ? [{ doc_id: String(id), doc_no: code || null }] : []);

  if (loading) return <div className="p-10 text-center text-sm text-slate-400">กำลังโหลด…</div>;
  if (err) return <div className="p-10 text-center text-sm text-rose-600">{err}</div>;

  return (
    <PatternPrintView lines={tabLines} fileName={fileName}
      eyebrow={`แพทเทิร์นจากตีราคา · ${tabLabel}`} title={`${code} ${sheet?.name ?? ""}`} footCode={`${code} · ${tabLabel}`}
      emptyText={<>แท็บ “{tabLabel}” ยังไม่มีบรรทัดที่กรอก กว้าง × ยาว — กรอกขนาดชิ้นในตารางตีราคาก่อน แล้วเปิดหน้านี้ใหม่</>}
      controls={tabs.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <button key={t.key || "__gen__"} type="button" onClick={() => setSel(t.key)}
              className={`h-7 rounded-md border px-2.5 text-xs ${sel === t.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{t.label} <span className="opacity-70">{t.n}</span></button>
          ))}
        </div>
      ) : undefined} />
  );
}
