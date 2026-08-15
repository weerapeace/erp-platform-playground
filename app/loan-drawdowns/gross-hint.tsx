"use client";

/**
 * บรรทัด "เบิกได้อีกเท่าไหร่" ใต้ช่องยอดเบิก (Gross) ในฟอร์มการเบิกเงินกู้
 * --------------------------------------------------------------------------
 * เจ้าของถาม: "ยอดเบิก อยากให้มีโชว์จำนวนคงเหลือว่าเบิกได้เท่าไหร่ด้วย"
 *
 * คิดจาก: วงเงินตามสัญญา − เบิกไปแล้ว(ที่ยืนยันแล้ว) = เบิกได้อีก
 *   - วงเงิน = เงินต้นตามสัญญา ถ้าไม่ได้ใส่ใช้วงเงินอนุมัติ (สูตรเดียวกับที่ DB ใช้คิด)
 *   - ตอน "แก้ใบเดิม" จะบวกยอดของใบนี้กลับเข้าไปก่อน (ไม่งั้นจะเห็นว่าเบิกเกินทั้งที่เป็นยอดตัวเอง)
 *
 * เสียบผ่านของกลาง `MasterCRUDConfig.fieldHints` — ไม่ได้แก้ฟอร์มกลาง
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/money";

type Info = { limit: number; drawn: number; ownGross: number; label: string };

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export function DrawdownGrossHint({
  value, contractId, recordId,
}: {
  value: unknown;
  contractId: string;
  recordId: string | null;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!contractId) { setInfo(null); return; }
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const [cRes, dRes] = await Promise.all([
          apiFetch(`/api/master-v2/loan-contracts/${contractId}`),
          // แก้ใบเดิม → ต้องรู้ยอดที่ใบนี้เบิกไว้ (เพราะถูกนับรวมใน "เบิกไปแล้ว" ไปแล้ว)
          recordId ? apiFetch(`/api/master-v2/loan-drawdowns/${recordId}`) : Promise.resolve(null),
        ]);
        const c = (await cRes.json())?.data as Record<string, unknown> | undefined;
        if (!alive || !c) { setInfo(null); return; }
        const own = dRes ? ((await dRes.json())?.data as Record<string, unknown> | undefined) : undefined;
        const ownCounted = own && String(own.status ?? "") === "confirmed" && own.is_active !== false;
        setInfo({
          limit: num(c.contracted_principal) > 0 ? num(c.contracted_principal) : num(c.approved_limit),
          drawn: num(c.total_drawn_amount),
          ownGross: ownCounted ? num(own?.gross_amount) : 0,
          label: String(c.loan_code ?? ""),
        });
      } catch {
        if (alive) setInfo(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [contractId, recordId]);

  if (!contractId) {
    return <div className="text-[11px] text-slate-400 mt-1">เลือกสัญญาเงินกู้ก่อน แล้วระบบจะบอกว่าเบิกได้อีกเท่าไหร่</div>;
  }
  if (loading && !info) {
    return <div className="text-[11px] text-slate-300 mt-1">กำลังคิดยอดคงเหลือ…</div>;
  }
  if (!info) return null;

  if (info.limit <= 0) {
    return (
      <div className="text-[11px] text-amber-600 mt-1">
        สัญญานี้ยังไม่ได้ใส่เงินต้น/วงเงินอนุมัติ — ระบบจึงบอกยอดคงเหลือไม่ได้
      </div>
    );
  }

  const drawnOther = Math.max(info.drawn - info.ownGross, 0);   // เบิกไปแล้วโดยใบอื่น
  const remaining = Math.round((info.limit - drawnOther) * 100) / 100;
  const typed = num(value);
  const over = typed > remaining + 0.005;
  const left = Math.round((remaining - typed) * 100) / 100;

  return (
    <div className="text-[11px] mt-1 leading-relaxed">
      <span className="text-slate-400">
        วงเงินตามสัญญา <b className="text-slate-600 tabular-nums">{formatAmount(info.limit)}</b>
        <span className="mx-1">·</span>
        เบิกไปแล้ว <b className="text-slate-600 tabular-nums">{formatAmount(drawnOther)}</b>
        <span className="mx-1">·</span>
      </span>
      <span className={over ? "text-red-600" : "text-emerald-700"}>
        เบิกได้อีก <b className="tabular-nums">{formatAmount(remaining)}</b>
      </span>
      {typed > 0 && !over && (
        <span className="text-slate-400"> · ใส่ยอดนี้แล้วจะเหลือ <b className="text-slate-600 tabular-nums">{formatAmount(left)}</b></span>
      )}
      {over && (
        <span className="text-red-600"> · ⚠ ยอดที่กรอกเกินวงเงินอยู่ <b className="tabular-nums">{formatAmount(typed - remaining)}</b></span>
      )}
      <span className="block text-slate-300">นับเฉพาะใบเบิกที่สถานะ “ยืนยันแล้ว”</span>
    </div>
  );
}
