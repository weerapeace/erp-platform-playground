"use client";

// ============================================================
// "เหลือทำอะไร" ของงาน — กล่องชี้การ์ดบอร์ดงาน (เจ้าของขอ 2026-11-22)
//  • โหลดตอนกล่องเปิดเท่านั้น (ไม่ถ่วงบอร์ด) · จำผลต่องาน 60 วิ (ชี้ซ้ำไม่โหลดใหม่)
//  • คอนเทนต์ที่ยังไม่พร้อม + ข้อเช็กความพร้อมสินค้าที่ไม่ผ่าน (ตัวคำนวณเดียวกับแถบความพร้อมในลิ้นชัก lib/task-readiness)
//  • ข้อ "ลงครบทุก Platform" ต้องดึงสถานะร้าน (หนัก) → ไม่นับในกล่องนี้ ดูในลิ้นชักงาน
//  • อ่านอย่างเดียว
// ============================================================
import { useEffect, useState } from "react";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { readinessKeysFor, taskReadiness, type ReadinessParent } from "@/lib/task-readiness";
import { CONTENT_DONE, contentStatusLabel, getTaskQuickCheck, listContent, type CreativeTask } from "./data";
import { loadReadinessRules } from "./task-readiness-bar";

type Line = { ok: boolean; text: string };
const cache = new Map<string, { at: number; lines: Line[] }>();

async function loadRemaining(task: CreativeTask): Promise<Line[]> {
  const hit = cache.get(task.id);
  if (hit && Date.now() - hit.at < 60_000) return hit.lines;
  const [contents, parents, rules] = await Promise.all([
    listContent({ task_id: task.id }).catch(() => []),
    getTaskQuickCheck(task.id).catch(() => [] as unknown[]),
    loadReadinessRules(),
  ]);
  const lines: Line[] = [];
  for (const c of contents) {
    if (c.status === "cancelled") continue;
    const ok = CONTENT_DONE.has(c.status);
    lines.push({ ok, text: ok ? c.title : `${c.title} — ${contentStatusLabel(c.status)}` });
  }
  const ps = parents as ReadinessParent[];
  if (ps.length) {
    const keys = readinessKeysFor(rules, task.task_type ?? null).filter((k) => k !== "platform");
    for (const it of taskReadiness(ps, keys, {})) {
      if (it.pending) continue;
      const label = tr(it.label, it.label_en);
      lines.push({ ok: it.ok, text: it.ok ? label : `${label}${it.issues[0] ? ` — ${it.issues[0]}` : ""}` });
    }
  }
  cache.set(task.id, { at: Date.now(), lines });
  return lines;
}

export function TaskRemaining({ task }: { task: CreativeTask }) {
  const t = useT();
  const [lines, setLines] = useState<Line[] | null>(() => cache.get(task.id)?.lines ?? null);
  useEffect(() => { let live = true; loadRemaining(task).then((l) => { if (live) setLines(l); }).catch(() => { if (live) setLines([]); }); return () => { live = false; }; }, [task]);
  if (!lines) return <div className="h-10 rounded bg-slate-100 animate-pulse" />;
  if (!lines.length) return <p className="text-[11.5px] text-slate-400">{t("ยังไม่มีคอนเทนต์และยังไม่ได้ผูกสินค้า", "No content or linked product yet")}</p>;
  const left = lines.filter((l) => !l.ok);
  return (
    <div className="border-t border-slate-100 pt-1.5">
      <p className="mb-0.5 text-[11px] text-slate-400">{left.length ? t(`เหลือทำ ${left.length} อย่าง`, `${left.length} left to do`) : t("ครบทุกอย่างแล้ว", "Everything is done")}</p>
      <ul className="space-y-0.5 text-[12px] leading-snug">
        {left.slice(0, 7).map((l, i) => <li key={i} className="text-rose-700">✕ {l.text}</li>)}
        {left.length > 7 && <li className="text-slate-400">{t(`…อีก ${left.length - 7} อย่าง`, `…${left.length - 7} more`)}</li>}
        {lines.length - left.length > 0 && <li className="text-emerald-700">✓ {t(`ครบแล้ว ${lines.length - left.length} อย่าง`, `${lines.length - left.length} done`)}</li>}
      </ul>
    </div>
  );
}
