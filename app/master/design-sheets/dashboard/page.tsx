const brands = [
  { name: "Luna Atelier", code: "LA", color: "#8b5cf6", total: 18, urgent: 4, active: 12 },
  { name: "Mira Bag", code: "MB", color: "#0ea5e9", total: 14, urgent: 2, active: 9 },
  { name: "Orchid House", code: "OH", color: "#10b981", total: 11, urgent: 1, active: 7 },
  { name: "Velvet Studio", code: "VS", color: "#f59e0b", total: 9, urgent: 3, active: 5 },
  { name: "Rose Vale", code: "RV", color: "#f43f5e", total: 7, urgent: 2, active: 4 },
];

const stages = [
  {
    key: "design",
    title: "ออกแบบ",
    color: "#64748b",
    count: 8,
    cards: [
      { code: "DS-1042", brand: "LA", name: "กระเป๋าทรง bucket", due: "วันนี้", tone: "danger" },
      { code: "DS-1038", brand: "OH", name: "ซองแว่นผ้าปัก", due: "2 วัน", tone: "warn" },
    ],
  },
  {
    key: "sent",
    title: "ส่งลูกค้าดู",
    color: "#3b82f6",
    count: 5,
    cards: [
      { code: "DS-1035", brand: "MB", name: "tote canvas mini", due: "รอ feedback", tone: "normal" },
    ],
  },
  {
    key: "revise",
    title: "แก้ไข",
    color: "#f59e0b",
    count: 6,
    cards: [
      { code: "DS-1031", brand: "VS", name: "ปรับหูหิ้ว + โลโก้", due: "พรุ่งนี้", tone: "warn" },
    ],
  },
  {
    key: "cost",
    title: "ตีราคา",
    color: "#a855f7",
    count: 4,
    cards: [
      { code: "DS-1028", brand: "RV", name: "set pouch 3 size", due: "วันนี้", tone: "danger" },
    ],
  },
  {
    key: "quote",
    title: "เสนอราคา",
    color: "#6366f1",
    count: 3,
    cards: [
      { code: "DS-1026", brand: "LA", name: "ใบเสนอราคา V2", due: "ส่งแล้ว", tone: "normal" },
    ],
  },
  {
    key: "approved",
    title: "อนุมัติ",
    color: "#10b981",
    count: 5,
    cards: [
      { code: "DS-1021", brand: "OH", name: "รอตั้ง Parent SKU", due: "พร้อมต่อ", tone: "good" },
    ],
  },
  {
    key: "sku",
    title: "ตั้ง SKU แล้ว",
    color: "#7c3aed",
    count: 12,
    cards: [
      { code: "DS-1019", brand: "MB", name: "เข้า master แล้ว", due: "จบงาน", tone: "done" },
    ],
  },
];

const statusQueue = [
  { code: "DS-1042", brand: "Luna Atelier", from: "ออกแบบ", to: "ส่งลูกค้าดู", reason: "รูปครบแล้ว เหลือกดส่งลูกค้า", level: "ด่วน" },
  { code: "DS-1028", brand: "Rose Vale", from: "ตีราคา", to: "เสนอราคา", reason: "มีต้นทุนครบ รอคนตรวจราคา", level: "ตรวจ" },
  { code: "DS-1021", brand: "Orchid House", from: "อนุมัติ", to: "ตั้ง SKU แล้ว", reason: "ลูกค้าอนุมัติแบบและราคา", level: "ต่อขั้น" },
];

const auditRows = [
  { time: "10:42", actor: "May", text: "ย้าย DS-1031 จาก ส่งลูกค้าดู เป็น แก้ไข", note: "ลูกค้าขอปรับโลโก้" },
  { time: "09:18", actor: "Ploy", text: "ย้าย DS-1028 เข้า ตีราคา", note: "รายละเอียดวัสดุครบแล้ว" },
  { time: "เมื่อวาน", actor: "Admin", text: "เพิ่มสถานะ ตั้ง SKU แล้ว", note: "ใช้กับงานที่ผ่านราคาแล้ว" },
];

function CardDeadline({ tone, label }: { tone: string; label: string }) {
  const cls =
    tone === "danger" ? "bg-rose-500 text-rose-700" :
    tone === "warn" ? "bg-amber-500 text-amber-700" :
    tone === "good" ? "bg-emerald-500 text-emerald-700" :
    tone === "done" ? "bg-violet-500 text-violet-700" :
    "bg-slate-300 text-slate-500";
  const [dot, text] = cls.split(" ");
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

export default function DesignSheetsDashboardPage() {
  const totalJobs = brands.reduce((sum, brand) => sum + brand.total, 0);
  const urgentJobs = brands.reduce((sum, brand) => sum + brand.urgent, 0);
  const activeJobs = brands.reduce((sum, brand) => sum + brand.active, 0);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fef3c7_0,#f8fafc_28%,#eef2ff_100%)]">
      <div className="mx-auto max-w-[1500px] px-5 py-5 lg:px-7 lg:py-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-amber-200 bg-white/75 px-2.5 py-1 text-xs font-medium text-amber-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.8)]" />
              Fantasy workflow preview
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">แผนที่ภารกิจงานออกแบบ</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Dashboard ทดลองสำหรับดูงานหลายแบรนด์ เปลี่ยนสถานะบ่อย และเห็นงานที่ควรเลื่อนขั้นแบบไม่ต้องเปิดทีละใบ
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/master/design-sheets" className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white/85 px-3 text-sm font-medium text-slate-600 shadow-sm hover:bg-white">
              กลับ Design Sheets
            </a>
            <button className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white shadow-sm hover:bg-slate-800">
              อัปเดตหลายงาน
            </button>
          </div>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          {[
            ["งานทั้งหมด", totalJobs, "ทุกแบรนด์ในเดือนนี้"],
            ["กำลังเดินงาน", activeJobs, "ยังไม่จบหรือยกเลิก"],
            ["ใกล้ครบกำหนด", urgentJobs, "ควรไล่สถานะวันนี้"],
          ].map(([label, value, hint]) => (
            <div key={label} className="rounded-lg border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
              <div className="text-xs font-medium text-slate-400">{label}</div>
              <div className="mt-1 text-3xl font-semibold text-slate-900">{value}</div>
              <div className="mt-1 text-xs text-slate-500">{hint}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_310px]">
          <aside className="rounded-lg border border-white/70 bg-white/82 p-3 shadow-sm backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">แบรนด์</h2>
                <p className="text-xs text-slate-400">เหมือนอาณาจักรบนแผนที่</p>
              </div>
              <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">5 แบรนด์</span>
            </div>
            <div className="space-y-2">
              {brands.map((brand) => (
                <div key={brand.code} className="rounded-lg border border-slate-200 bg-white p-3 shadow-[3px_3px_0_rgba(148,163,184,0.16)]">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold text-white shadow-sm" style={{ backgroundColor: brand.color }}>
                      {brand.code}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{brand.name}</div>
                      <div className="text-xs text-slate-400">{brand.active} งานกำลังเดิน</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-slate-50 px-2 py-1.5">
                      <div className="text-slate-400">งานค้าง</div>
                      <div className="font-semibold text-slate-700">{brand.total}</div>
                    </div>
                    <div className="rounded-md bg-rose-50 px-2 py-1.5">
                      <div className="text-rose-400">ใกล้ครบ</div>
                      <div className="font-semibold text-rose-700">{brand.urgent}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section className="min-w-0 rounded-lg border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">เส้นทางสถานะ</h2>
                <p className="text-xs text-slate-400">เวอร์ชันทดลอง: การ์ดคือใบงาน, ประตูคือสถานะ</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> ด่วน</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> ใกล้ครบ</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> พร้อมต่อ</span>
              </div>
            </div>

            <div className="overflow-x-auto pb-2">
              <div className="grid min-w-[980px] grid-cols-7 gap-3">
                {stages.map((stage, index) => (
                  <div key={stage.key} className="relative">
                    {index < stages.length - 1 && (
                      <div className="absolute left-[62%] top-8 h-px w-[76%] bg-gradient-to-r from-amber-300 via-amber-200 to-transparent shadow-[0_0_12px_rgba(245,158,11,0.45)]" />
                    )}
                    <div className="relative mb-3 rounded-lg border border-amber-200/80 bg-gradient-to-b from-white to-amber-50/70 px-2 py-2 text-center shadow-sm">
                      <div className="mx-auto mb-1 h-3 w-3 rounded-full shadow-[0_0_16px_rgba(245,158,11,0.65)]" style={{ backgroundColor: stage.color }} />
                      <div className="text-xs font-semibold text-slate-800">{stage.title}</div>
                      <div className="text-[11px] text-slate-400">{stage.count} งาน</div>
                    </div>
                    <div className="space-y-2">
                      {stage.cards.map((card) => {
                        const brand = brands.find((b) => b.code === card.brand);
                        return (
                          <div key={card.code} className="rounded-lg border border-slate-200 bg-white p-2 shadow-[3px_3px_0_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-amber-300">
                            <div className="mb-2 h-14 rounded-md border border-slate-100 bg-[linear-gradient(135deg,#f8fafc,#fef3c7)]" />
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand?.color ?? "#cbd5e1" }} />
                              <span className="font-mono text-[11px] text-slate-400">{card.code}</span>
                            </div>
                            <div className="mt-0.5 line-clamp-2 min-h-[32px] text-xs font-semibold text-slate-800">{card.name}</div>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-[11px] text-slate-400">{card.brand}</span>
                              <CardDeadline tone={card.tone} label={card.due} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-lg border border-white/70 bg-white/82 p-4 shadow-sm backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">คิวเปลี่ยนสถานะ</h2>
                  <p className="text-xs text-slate-400">ไม่มีระบบอัตโนมัติ แค่ช่วยชี้งานที่ควรกดต่อ</p>
                </div>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">manual</span>
              </div>
              <div className="space-y-2">
                {statusQueue.map((item) => (
                  <div key={item.code} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-xs font-semibold text-slate-700">{item.code}</div>
                        <div className="text-xs text-slate-400">{item.brand}</div>
                      </div>
                      <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">{item.level}</span>
                    </div>
                    <div className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                      {item.from} → <b>{item.to}</b>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{item.reason}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-white/70 bg-slate-900 p-4 text-white shadow-sm">
              <h2 className="text-sm font-semibold">ประวัติการเปลี่ยนสถานะ</h2>
              <p className="mt-1 text-xs text-slate-300">ตามย้อนหลังว่าใครย้ายงาน เพราะอะไร</p>
              <div className="mt-3 space-y-3">
                {auditRows.map((row) => (
                  <div key={`${row.time}-${row.text}`} className="flex gap-2">
                    <div className="pt-1">
                      <span className="block h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.8)]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-white">{row.text}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">{row.time} · {row.actor} · {row.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
