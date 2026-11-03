"use client";

/**
 * กราฟเงินรายสัปดาห์ / รายเดือน ของหน้ากระแสเงินสด (/cashflow)
 * แท่งเขียว = เงินเข้า · แท่งแดง = เงินออก · เส้นน้ำเงิน = เงินคงเหลือสิ้นช่วง · เส้นประม่วง = เพดานวงเงิน OD ที่ยังใช้ได้
 * ช่วงคิดจาก lib/cashflow bucketSeries (ของกลาง) · กดแท่ง = เลือกช่วงนั้น (หน้าแม่เอาไปกรองตาราง)
 */
import { THB, THBShort, type CashflowBucket } from "@/lib/cashflow";

export function CashflowPeriodChart({
  buckets, startBalance, odHeadroom, picked, onPick,
}: {
  buckets: CashflowBucket[];
  startBalance: number;
  /** วงเงิน OD ที่ยังเบิกได้ (null = ไม่รู้ / ไม่มีสิทธิ์ดู) — วาดเป็นเส้นพื้นใต้ศูนย์ */
  odHeadroom: number | null;
  picked: string | null;
  onPick: (b: CashflowBucket | null) => void;
}) {
  if (!buckets.length) return null;
  const W = 900, H = 250, L = 62, R = 16, T = 16, B = 34;
  const slot = (W - L - R) / buckets.length;
  const floor = odHeadroom && odHeadroom > 0 ? -odHeadroom : 0;
  const vals = [startBalance, floor, ...buckets.flatMap((b) => [b.balance, b.in, b.out])];
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const y = (v: number) => T + ((max - v) / (max - min || 1)) * (H - T - B);
  const zero = y(0);
  const bw = Math.max(2, Math.min(22, slot * 0.32));
  const pts = [`${L},${y(startBalance)}`, ...buckets.map((b, i) => `${L + slot * (i + 1)},${y(b.balance)}`)].join(" ");
  const ticks = [max, max / 2, 0, ...(min < 0 ? [min] : [])];

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" style={{ height: H }} role="img" aria-label="กราฟเงินเข้า เงินออก และเงินคงเหลือ">
        {min < 0 && <rect x={L} y={zero} width={W - L - R} height={y(min) - zero} fill="#fee2e2" opacity={0.45} />}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#94a3b8" : "#e2e8f0"} strokeWidth={v === 0 ? 1 : 0.75} />
            <text x={L - 6} y={y(v)} textAnchor="end" dominantBaseline="central" fontSize={10} fill="#94a3b8">{THBShort(v)}</text>
          </g>
        ))}
        {floor < 0 && (
          <g>
            <line x1={L} x2={W - R} y1={y(floor)} y2={y(floor)} stroke="#7c3aed" strokeWidth={1.25} strokeDasharray="5 4" />
            <text x={W - R - 4} y={y(floor) - 7} textAnchor="end" fontSize={10} fill="#7c3aed">วงเงิน OD ที่ยังเบิกได้ {THBShort(odHeadroom ?? 0)}</text>
          </g>
        )}
        {buckets.map((b, i) => {
          const cx = L + slot * i + slot / 2, on = picked === b.start;
          return (
            <g key={b.start} className="cursor-pointer" onClick={() => onPick(on ? null : b)}>
              <title>{`${b.label}: เข้า ${THB(b.in)} · ออก ${THB(b.out)} · คงเหลือสิ้นช่วง ${THB(b.balance)} — กดเพื่อดูรายการ`}</title>
              <rect x={L + slot * i} y={T} width={slot} height={H - T - B} fill={on ? "#dbeafe" : "transparent"} />
              <rect x={cx - bw - 1} y={y(b.in)} width={bw} height={Math.max(1, zero - y(b.in))} fill="#10b981" rx={2} />
              <rect x={cx + 1} y={y(b.out)} width={bw} height={Math.max(1, zero - y(b.out))} fill="#f43f5e" opacity={0.85} rx={2} />
              {(buckets.length <= 16 || i % Math.ceil(buckets.length / 16) === 0) && (
                <text x={cx} y={H - 14} textAnchor="middle" fontSize={10.5} fill={on ? "#1d4ed8" : "#64748b"} fontWeight={on ? 700 : 400}>{b.label}</text>
              )}
            </g>
          );
        })}
        <polyline points={pts} fill="none" stroke="#2563eb" strokeWidth={2} />
        {buckets.map((b, i) => (
          <circle key={b.start} cx={L + slot * (i + 1)} cy={y(b.balance)} r={3.5} fill={b.balance < 0 ? "#dc2626" : "#2563eb"} pointerEvents="none" />
        ))}
      </svg>
    </div>
  );
}
