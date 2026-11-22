"use client";

// ชิ้นส่วนหน้าเล็กในไลน์ (LIFF /a) ใช้ร่วมกัน — กล่องข้อความสถานะ + โครงรอโหลด · ใช้ที่ self-view (พนักงาน) · customer-view (ลูกค้า)

export function Box({ tone, title, body, action }: { tone: "danger" | "warning" | "muted" | "success"; title: string; body: string; action?: { label: string; onClick: () => void } }) {
  const cls = { danger: "border-rose-200 bg-rose-50 text-rose-800", warning: "border-amber-200 bg-amber-50 text-amber-800", muted: "border-slate-200 bg-white text-slate-700", success: "border-emerald-200 bg-emerald-50 text-emerald-800" }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <div className="font-semibold">{title}</div>
      <p className="mt-1 text-sm opacity-90">{body}</p>
      {action && <button type="button" onClick={action.onClick} className="mt-3 h-10 rounded-lg border border-current px-4 text-sm">{action.label}</button>}
    </div>
  );
}

export function Skeleton() {
  return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-200/70" />)}</div>;
}
