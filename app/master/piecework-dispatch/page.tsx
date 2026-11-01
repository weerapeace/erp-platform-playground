"use client";

/**
 * ผลิต → จ่ายงานเหมา (/master/piecework-dispatch) — เจ้าของขอ 2026-11-01 "เอาจ่ายงานเหมาไปเป็นเมนูย่อยใน ผลิตด้วยสิ"
 * ใช้หน้าต่างตัวเดียวกับบอร์ด (PieceworkDispatch asPage) — ไม่มีข้อมูลบอร์ด เลยโหลดใบที่เลือกได้ + รายชื่อคนเอง
 *   ?mo=MO-1,MO-2 = เปิดมาพร้อมใบ · ?tab=recv = เปิดแท็บรับงานคืน
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePermission } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { PieceworkDispatch, type PwCandidate } from "../work-board/piecework-dispatch";
import type { Assignee } from "@/app/api/mo/assignees/route";

function Inner() {
  const sp = useSearchParams();
  const canEdit = usePermission("products.edit");
  const moNos = useMemo(() => (sp.get("mo") ?? "").split(",").map((s) => s.trim()).filter(Boolean), [sp]);
  const tab = sp.get("tab") === "recv" ? "recv" : "send";
  const [candidates, setCandidates] = useState<PwCandidate[]>([]);
  const [craftsmen, setCraftsmen] = useState<Assignee[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  const loadCandidates = () => apiFetch("/api/mo/piecework/batch?candidates=1").then((r) => r.json()).then((j) => setCandidates((j.data ?? []) as PwCandidate[])).catch(() => {});
  useEffect(() => {
    void loadCandidates();
    apiFetch("/api/mo/assignees").then((r) => r.json()).then((j) => { setCraftsmen(j.craftsmen ?? []); setDepartments(j.departments ?? []); }).catch(() => {});
  }, []);

  return (
    <PieceworkDispatch asPage open onClose={() => {}} moNos={moNos} startTab={tab}
      candidates={candidates} craftsmen={craftsmen} departments={departments} canEdit={canEdit} onDone={() => void loadCandidates()} />
  );
}

export default function PieceworkDispatchPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><Inner /></Suspense>;
}
