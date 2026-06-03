"use client";

/**
 * แอปเดี่ยว (standalone) "โอนเงินจีน" — mobile-first สำหรับมือถือ/iPad
 * เปิดผ่าน /app/china-pay · เห็นแค่โมดูลนี้ ไม่มี sidebar/โมดูลอื่น
 * reuse data layer กลาง: /api/master-v2/china-bills + RelationPicker + FileInput + toast
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { RelationPicker, type RelationConfig } from "@/components/relation-picker";
import { FileMultiInput } from "@/components/file-multi-input";

const SUPPLIER_CFG: RelationConfig = {
  target_table: "partners_v2", target_module_key: "partners-v2",
  target_label_field: "name_th", target_search_fields: ["name_th", "name_en"], allow_create: false,
  filter: { column: "shop_country", value: "จีน" },   // โชว์เฉพาะร้านจีน
} as RelationConfig;

// บริษัทสำหรับบิล CTW — เฉพาะที่ติ๊ก "ซื้อบิล" (buy_bill = true)
const CTW_PARTNER_CFG: RelationConfig = {
  target_table: "partners_v2", target_module_key: "partners-v2",
  target_label_field: "name_th", target_search_fields: ["name_th", "name_en"], allow_create: false,
  filter: { column: "buy_bill", value: "true" },
} as RelationConfig;

// ---------------- Animation "บันทึกสำเร็จ" (ของกลางใน china-pay) ----------------
type CelebrateFn = (msg?: string, opts?: { confetti?: boolean }) => void;
const CelebrateCtx = createContext<CelebrateFn>(() => {});
const useCelebrate = () => useContext(CelebrateCtx);

function CelebrateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ id: number; msg: string; confetti: boolean } | null>(null);
  const fire = useCallback<CelebrateFn>((msg = "บันทึกสำเร็จ", opts) => {
    setState(s => ({ id: (s?.id ?? 0) + 1, msg, confetti: !!opts?.confetti }));
  }, []);
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(null), state.confetti ? 1900 : 1300);
    return () => clearTimeout(t);
  }, [state]);
  // กระดาษโปรย (สุ่มตำแหน่ง/สี ครั้งเดียวต่อการแสดง)
  const pieces = useMemo(() => {
    if (!state?.confetti) return [];
    const colors = ["#fb923c", "#34d399", "#60a5fa", "#fbbf24", "#f472b6", "#a78bfa"];
    return Array.from({ length: 30 }, (_, i) => ({
      left: ((i * 37) % 100),
      delay: (i % 8) * 55,
      dur: 1100 + (i % 5) * 200,
      color: colors[i % colors.length],
    }));
  }, [state?.id, state?.confetti]);

  return (
    <CelebrateCtx.Provider value={fire}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/10 cpok-bg" />
          <div className="cpok-card relative flex flex-col items-center gap-3">
            <svg viewBox="0 0 80 80" className="w-24 h-24 drop-shadow-lg">
              <circle cx="40" cy="40" r="37" fill="#10b981" />
              <path d="M24 41 L35 53 L57 28" className="cpok-check" />
            </svg>
            <div className="text-white font-semibold text-lg drop-shadow">{state.msg}</div>
          </div>
          {state.confetti && (
            <div className="absolute inset-0 overflow-hidden">
              {pieces.map((p, i) => (
                <span key={i} className="cpok-confetti"
                  style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}ms`, animationDuration: `${p.dur}ms` }} />
              ))}
            </div>
          )}
        </div>
      )}
    </CelebrateCtx.Provider>
  );
}

const VAT_RATE = 0.07;   // ภาษี 7%

const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : 0; };
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 4 });
const today = () => new Date().toISOString().slice(0, 10);

// ค่าโอน (¥) ตามชั้นยอด
const FEE_TABLE = [
  { label: "1 – 4,999", fee: 3 }, { label: "5,000 – 9,999", fee: 5 },
  { label: "10,000 – 29,999", fee: 10 }, { label: "30,000 – 49,999", fee: 30 },
  { label: "50,000 ขึ้นไป", fee: 50 },
];
function feeFor(amt: number): number {
  if (amt <= 0) return 0;
  if (amt <= 4999) return 3;
  if (amt <= 9999) return 5;
  if (amt <= 29999) return 10;
  if (amt <= 49999) return 30;
  return 50;
}
// เรทตามชั้นยอด — กรอกแค่ R1, R2-R4 = R1 ลบส่วนต่างคงที่
const RATE_OFFSET = { r2: 0.035, r3: 0.075, r4: 0.08 };
const RATE_TABLE = [
  { tier: "R1", label: "1 – 5,000", off: 0 }, { tier: "R2", label: "5,001 – 99,999", off: RATE_OFFSET.r2 },
  { tier: "R3", label: "100,000 – 399,999", off: RATE_OFFSET.r3 }, { tier: "R4", label: "400,000 ขึ้นไป", off: RATE_OFFSET.r4 },
];
function rateFor(amt: number, r1: number): number {
  if (!r1) return 0;
  if (amt <= 5000) return r1;
  if (amt <= 99999) return +(r1 - RATE_OFFSET.r2).toFixed(4);
  if (amt <= 399999) return +(r1 - RATE_OFFSET.r3).toFixed(4);
  return +(r1 - RATE_OFFSET.r4).toFixed(4);
}

type Tab = "dashboard" | "bill" | "transfer" | "all" | "rate" | "ctw" | "menusettings";

const STATUS_STYLE: Record<string, string> = {
  "รอโอน": "bg-amber-100 text-amber-700", "โอนแล้ว": "bg-emerald-100 text-emerald-700", "ยกเลิก": "bg-slate-100 text-slate-500",
};

const MENU: { k: Tab; icon: string; label: string }[] = [
  { k: "dashboard", icon: "📊", label: "Dashboard" },
  { k: "bill", icon: "💴", label: "ลงบิลจีน" },
  { k: "transfer", icon: "💰", label: "โอนเข้าจีน" },
  { k: "all", icon: "📋", label: "บิลจีนทั้งหมด" },
  { k: "rate", icon: "💱", label: "เรท" },
  { k: "ctw", icon: "📑", label: "บิลจาก CTW" },
];
const ALL_TAB_KEYS = MENU.map(m => m.k);

// บทบาทที่ตั้งสิทธิ์เมนูได้ (admin เห็นทุกเมนูเสมอ)
const ROLE_OPTS: { key: string; label: string }[] = [
  { key: "manager", label: "ผู้จัดการ" },
  { key: "ops", label: "ฝ่ายปฏิบัติการ" },
  { key: "staff", label: "พนักงาน" },
  { key: "editor", label: "ผู้แก้ไข" },
  { key: "viewer", label: "ดูอย่างเดียว" },
  { key: "marketplace", label: "มาร์เก็ตเพลส" },
];

export default function ChinaPayApp() {
  const { user, ready } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuCfg, setMenuCfg] = useState<Record<string, string[]>>({});
  const [preselect, setPreselect] = useState<string[]>([]);   // บิลจีนที่เลือกจากหน้า "ทั้งหมด" → ส่งไปหน้าโอน

  // โหลดสิทธิ์เมนูตาม role
  useEffect(() => {
    apiFetch("/api/master-v2/china-app-settings?limit=5").then(r => r.json()).then(j => {
      const row = (j.data ?? []).find((x: Record<string, unknown>) => x.skey === "menu_roles");
      if (row && row.sval && typeof row.sval === "object") setMenuCfg(row.sval as Record<string, string[]>);
    }).catch(() => {});
  }, []);

  if (!ready) return <Center>กำลังโหลด…</Center>;
  if (!user) return (
    <Center>
      <div className="text-slate-500 mb-3">กรุณาเข้าสู่ระบบก่อนใช้งาน</div>
      <Link href="/login?next=/app/china-pay" className="h-10 px-5 leading-10 bg-blue-600 text-white rounded-lg font-medium">เข้าสู่ระบบ</Link>
    </Center>
  );

  const isAdmin = user.role === "admin";
  const allowed = isAdmin ? ALL_TAB_KEYS : (menuCfg[user.role] ?? ALL_TAB_KEYS);
  const navMenu: { k: Tab; icon: string; label: string }[] = MENU.filter(m => allowed.includes(m.k));
  if (isAdmin) navMenu.push({ k: "menusettings", icon: "⚙️", label: "ตั้งค่าเมนู" });

  const renderTab: Tab = navMenu.some(m => m.k === tab) ? tab : (navMenu[0]?.k ?? "dashboard");
  const current = navMenu.find(m => m.k === renderTab);
  const go = (k: Tab) => { setTab(k); setMenuOpen(false); };

  // แถบล่าง: โชว์ไม่เกิน 4 + ปุ่ม "⋯ เพิ่มเติม" ถ้ามีมากกว่า
  const bottomItems = navMenu.slice(0, 4);
  const hasMore = navMenu.length > bottomItems.length;
  const cols = bottomItems.length + (hasMore ? 1 : 0);

  return (
    <CelebrateProvider>
    <div className="min-h-screen bg-slate-100">
      <style>{`
        @keyframes cpRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
        .cp-anim{animation:cpRise .42s ease both}
        @keyframes cpSpin{to{transform:rotate(360deg)}}
        .cp-spin{display:inline-block;animation:cpSpin 1.1s linear infinite}
        @keyframes cpFloat{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(18px,-22px) scale(1.08)}66%{transform:translate(-16px,12px) scale(.95)}}
        .cp-bg{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
        .cp-bg i{position:absolute;border-radius:50%;filter:blur(34px);opacity:.45;animation:cpFloat 14s ease-in-out infinite}
        .cp-bg .b1{width:200px;height:200px;background:#fdba74;top:18%;left:-50px;animation-delay:0s}
        .cp-bg .b2{width:240px;height:240px;background:#fed7aa;top:45%;right:-70px;animation-delay:-4s}
        .cp-bg .b3{width:180px;height:180px;background:#fcd34d;bottom:8%;left:30%;animation-delay:-8s;opacity:.3}
        /* บันทึกสำเร็จ */
        @keyframes cpokIn{0%{opacity:0;transform:scale(.6)}55%{opacity:1;transform:scale(1.1)}100%{opacity:1;transform:scale(1)}}
        .cpok-card{animation:cpokIn .4s cubic-bezier(.2,.8,.3,1.5) both}
        @keyframes cpokFade{from{opacity:0}to{opacity:1}}
        .cpok-bg{animation:cpokFade .25s ease both}
        .cpok-check{fill:none;stroke:#fff;stroke-width:7;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:64;stroke-dashoffset:64;animation:cpokDraw .45s .2s ease forwards}
        @keyframes cpokDraw{to{stroke-dashoffset:0}}
        @keyframes cpokFall{0%{transform:translateY(-12vh) rotate(0);opacity:1}100%{transform:translateY(112vh) rotate(560deg);opacity:.85}}
        .cpok-confetti{position:absolute;top:0;width:9px;height:14px;border-radius:2px;animation-name:cpokFall;animation-timing-function:linear;animation-fill-mode:forwards}
      `}</style>
      <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-sm relative overflow-hidden">
        <div className="cp-bg" aria-hidden><i className="b1"></i><i className="b2"></i><i className="b3"></i></div>
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-gradient-to-br from-orange-400 to-orange-600 text-white px-4 pt-3 pb-5 rounded-b-3xl shadow-lg shadow-orange-500/20 overflow-hidden">
          <div className="pointer-events-none absolute -right-8 -top-10 w-40 h-40 bg-white/10 rounded-full" />
          <div className="pointer-events-none absolute right-10 top-6 w-20 h-20 bg-white/10 rounded-full" />
          <div className="relative flex items-center gap-3">
            <button onClick={() => setMenuOpen(true)} aria-label="เมนู"
              className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 text-xl active:scale-95 transition">☰</button>
            <div className="font-bold text-lg flex-1 truncate">{current ? `${current.icon} ${current.label}` : "💸 โอนเงินจีน"}</div>
            <div className="flex items-center gap-2 bg-white/20 rounded-full pl-1 pr-3 py-1 text-xs">
              <span className="w-6 h-6 rounded-full bg-white text-orange-600 flex items-center justify-center font-bold">{(user.name || "?").slice(0, 1).toUpperCase()}</span>
              <span className="truncate max-w-[90px]">{user.name}</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main key={renderTab} className="cp-anim relative z-10 flex-1 overflow-y-auto p-4 pb-28">
          {renderTab === "dashboard" && <Dashboard onGo={go} />}
          {renderTab === "bill" && <BillForm />}
          {renderTab === "all" && <AllList onTransfer={(ids) => { setPreselect(ids); go("transfer"); }} />}
          {renderTab === "rate" && <RateTab />}
          {renderTab === "ctw" && <CtwList />}
          {renderTab === "transfer" && <TransferPage preselect={preselect} onConsumePreselect={() => setPreselect([])} />}
          {renderTab === "menusettings" && isAdmin && <MenuSettings onSaved={setMenuCfg} />}
        </main>

        {/* แถบเมนูล่าง */}
        {cols > 0 && (
          <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-100 grid z-20 px-1 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(0,0,0,0.06)]"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
            {bottomItems.map(m => {
              const on = renderTab === m.k;
              return (
                <button key={m.k} onClick={() => go(m.k)}
                  className={`py-1.5 flex flex-col items-center gap-1 text-[10px] transition ${on ? "text-orange-600 font-semibold" : "text-slate-400"}`}>
                  <span className={`text-lg leading-none px-3 py-1 rounded-2xl transition ${on ? "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md shadow-orange-500/40" : ""}`}>{m.icon}</span>{m.label}
                </button>
              );
            })}
            {hasMore && (
              <button onClick={() => setMenuOpen(true)}
                className="py-1.5 flex flex-col items-center gap-1 text-[10px] text-slate-400">
                <span className="text-lg leading-none px-3 py-1">⋯</span>เพิ่มเติม
              </button>
            )}
          </nav>
        )}
      </div>

      {/* เมนูทั้งหมด (เด้งจากปุ่ม ☰) */}
      {menuOpen && (
        <div className="fixed inset-0 z-[120] bg-black/40" onClick={() => setMenuOpen(false)}>
          <div className="absolute left-0 top-0 h-full w-72 max-w-[80%] bg-white shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-orange-400 to-orange-600 text-white px-4 py-4">
              <div className="font-semibold text-lg">💸 โอนเงินจีน</div>
              <div className="text-xs opacity-90 mt-0.5">{user.name}</div>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {navMenu.map(m => (
                <button key={m.k} onClick={() => go(m.k)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left ${renderTab === m.k ? "bg-orange-50 text-orange-700 font-semibold" : "text-slate-700 hover:bg-slate-50"}`}>
                  <span className="text-xl w-7 text-center">{m.icon}</span>{m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
    </CelebrateProvider>
  );
}

// ---------------- ตั้งค่าเมนูตาม role (เฉพาะแอดมิน) ----------------
function MenuSettings({ onSaved }: { onSaved: (c: Record<string, string[]>) => void }) {
  const toast = useToast();
  const [local, setLocal] = useState<Record<string, string[]>>({});
  const [rowId, setRowId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/api/master-v2/china-app-settings?limit=5").then(r => r.json()).then(j => {
      const row = (j.data ?? []).find((x: Record<string, unknown>) => x.skey === "menu_roles");
      if (row) { setRowId(String(row.id)); if (row.sval && typeof row.sval === "object") setLocal(row.sval as Record<string, string[]>); }
    }).catch(() => {});
  }, []);

  const isOn = (role: string, k: string) => (local[role] ?? ALL_TAB_KEYS).includes(k);
  const toggle = (role: string, k: string) => setLocal(prev => {
    const cur = prev[role] ?? ALL_TAB_KEYS;
    const next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k];
    return { ...prev, [role]: next };
  });
  const save = async () => {
    if (!rowId) { toast.error("ยังโหลดไม่เสร็จ ลองใหม่"); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/master-v2/china-app-settings/${rowId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sval: local, actor: "china-app" }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      toast.success("บันทึกสิทธิ์เมนูแล้ว"); onSaved(local);
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-500">เลือกว่าแต่ละบทบาทเห็นเมนูไหนได้บ้าง — แอดมินเห็นทุกเมนูเสมอ</div>
      {ROLE_OPTS.map(role => (
        <Card key={role.key}>
          <div className="font-semibold text-slate-800 mb-2">{role.label} <span className="text-xs text-slate-400">({role.key})</span></div>
          <div className="grid grid-cols-2 gap-2">
            {MENU.map(m => {
              const on = isOn(role.key, m.k);
              return (
                <button key={m.k} onClick={() => toggle(role.key, m.k)}
                  className={`flex items-center gap-1.5 p-2 rounded-lg border text-sm ${on ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-400"}`}>
                  <span>{on ? "✓" : "○"}</span><span className="truncate">{m.icon} {m.label}</span>
                </button>
              );
            })}
          </div>
        </Card>
      ))}
      <button onClick={save} disabled={saving}
        className="w-full h-12 bg-orange-600 text-white rounded-xl font-semibold disabled:opacity-50">
        {saving ? "กำลังบันทึก…" : "บันทึกสิทธิ์เมนู"}
      </button>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center text-center p-6">{children}</div>;
}

// ---------------- Dashboard ----------------
function Dashboard({ onGo }: { onGo: (k: Tab) => void }) {
  const [pending, setPending] = useState<Record<string, unknown>[]>([]);
  const [doneMonth, setDoneMonth] = useState<{ count: number; thb: number }>({ count: 0, thb: 0 });
  const [rate, setRate] = useState<Record<string, unknown> | null>(null);
  const [ctwCount, setCtwCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ym = today().slice(0, 7); // YYYY-MM
    const fPending = encodeURIComponent(JSON.stringify({ status: { type: "text", value: "รอโอน" } }));
    const fDone = encodeURIComponent(JSON.stringify({ status: { type: "text", value: "โอนแล้ว" } }));
    Promise.all([
      apiFetch(`/api/master-v2/china-bills?limit=200&filters=${fPending}`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`/api/master-v2/china-bills?limit=500&filters=${fDone}`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`/api/master-v2/daily-rates?limit=1&sort_by=rate_date&sort_dir=desc`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`/api/master-v2/ctw-bills?limit=500`).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([p, d, rt, c]) => {
      setPending(p.data ?? []);
      const doneRows = (d.data ?? []).filter((r: Record<string, unknown>) => String(r.transfer_date ?? "").slice(0, 7) === ym);
      setDoneMonth({
        count: doneRows.length,
        thb: doneRows.reduce((a: number, r: Record<string, unknown>) => a + (num(r.amount_rmb) + num(r.fee_rmb)) * num(r.rate), 0),
      });
      setRate((rt.data ?? [])[0] ?? null);
      setCtwCount((c.data ?? []).length);
    }).finally(() => setLoading(false));
  }, []);

  const pendingRmb = pending.reduce((a, r) => a + num(r.amount_rmb) + num(r.fee_rmb), 0);
  const r1 = num(rate?.rate);

  if (loading) return <div className="text-center text-slate-400 py-10">กำลังโหลด…</div>;

  return (
    <div className="space-y-4">
      {/* บิลรอโอน */}
      <button onClick={() => onGo("all")} className="block w-full text-left rounded-2xl bg-gradient-to-br from-orange-500 to-orange-500 text-white p-4 shadow-sm active:scale-[0.99] transition-transform">
        <div className="text-sm opacity-90">บิลจีนรอโอน</div>
        <div className="flex items-end justify-between mt-1">
          <div className="text-3xl font-bold">{pending.length} <span className="text-base font-normal opacity-90">บิล</span></div>
          <div className="text-xl font-semibold">¥{fmt(pendingRmb)}</div>
        </div>
      </button>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="โอนแล้วเดือนนี้" main={`${doneMonth.count} บิล`} sub={`฿${fmt(doneMonth.thb)}`} onClick={() => onGo("all")} />
        <StatCard label="เรทล่าสุด (R1)" main={r1 ? fmt(r1) : "—"} sub={r1 ? `R4 ${fmt(+(r1 - RATE_OFFSET.r4).toFixed(4))}` : "ยังไม่ตั้ง"} onClick={() => onGo("rate")} />
      </div>

      <StatCard label="บิลจาก CTW" main={`${ctwCount} บิล`} sub="ดูรายการ" onClick={() => onGo("ctw")} wide />

      {/* ปุ่มลัด */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button onClick={() => onGo("bill")} className="h-12 bg-orange-600 text-white rounded-xl font-semibold">+ ลงบิลจีน</button>
        <button onClick={() => onGo("ctw")} className="h-12 border border-slate-300 text-slate-700 rounded-xl font-semibold">+ บิล CTW</button>
      </div>
    </div>
  );
}

function StatCard({ label, main, sub, onClick, wide }: { label: string; main: string; sub?: string; onClick?: () => void; wide?: boolean }) {
  return (
    <button onClick={onClick} className={`text-left bg-white rounded-xl border border-slate-200 p-3 active:scale-[0.99] transition-transform ${wide ? "w-full flex items-center justify-between" : ""}`}>
      <div>
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-xl font-bold text-slate-800 mt-0.5">{main}</div>
      </div>
      {sub && <div className={`text-xs text-slate-500 ${wide ? "" : "mt-0.5"}`}>{sub}</div>}
    </button>
  );
}

// ---------------- ลงบิล (ไม่ใส่เรท — เรทมาตอนโอน) ----------------
function BillForm() {
  const toast = useToast();
  const celebrate = useCelebrate();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [sup, setSup] = useState<Record<string, unknown> | null>(null);
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [transferDate, setTransferDate] = useState(today());
  const [files, setFiles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [feeInfo, setFeeInfo] = useState(false);

  // ค่าโอนอัตโนมัติตามยอด (แก้มือทับได้)
  useEffect(() => {
    const a = num(amount);
    setFee(a > 0 ? String(feeFor(a)) : "");
  }, [amount]);

  // ดึงข้อมูลร้านเมื่อเลือก
  useEffect(() => {
    if (!supplierId) { setSup(null); return; }
    apiFetch(`/api/master-v2/partners/${supplierId}`).then(r => r.json()).then(j => setSup(j.data ?? null)).catch(() => setSup(null));
  }, [supplierId]);

  const totalRmb = num(amount) + num(fee);

  const save = async () => {
    if (!supplierId) { toast.error("เลือกร้านค้าก่อน"); return; }
    if (num(amount) <= 0) { toast.error("กรอกยอดรวม (¥)"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/master-v2/china-bills", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: supplierId, amount_rmb: num(amount), fee_rmb: num(fee),
          transfer_date: transferDate || null,
          attachments: files, status: "รอโอน", actor: "china-app",
        }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      celebrate("บันทึกบิลแล้ว");
      // reset
      setSupplierId(null); setSup(null); setAmount(""); setFee(""); setTransferDate(today());
      setFiles([]);
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <Label>ร้านค้า (จีน)</Label>
        <RelationPicker value={supplierId} onChange={(id) => setSupplierId(id)} config={SUPPLIER_CFG} />
        {sup && (
          <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
            {!!sup.name_en && <div className="text-slate-700 font-medium">{String(sup.name_en)}</div>}
            <Row label="ธนาคาร" v={sup.bank_name_brief} />
            <Row label="เลขบัญชี" v={sup.account_number} />
            <Row label="ชื่อบัญชี" v={sup.bank_account_name} />
            <Row label="โทร" v={sup.phone} />
          </div>
        )}
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>ยอดรวม (¥)</Label><Num value={amount} onChange={setAmount} /></div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-500">ค่าโอน (¥)</span>
              <button type="button" onClick={() => setFeeInfo(v => !v)} className="text-[11px] text-blue-500">ⓘ ตาราง</button>
            </div>
            <Num value={fee} onChange={setFee} />
          </div>
        </div>
        {feeInfo && (
          <div className="mt-2 rounded-lg bg-pink-50 border border-pink-200 p-3 text-xs">
            <div className="font-semibold text-slate-700 mb-1">ค่าธรรมเนียมการโอน</div>
            {FEE_TABLE.map(t => <div key={t.label} className="flex justify-between"><span className="text-slate-500">{t.label}</span><span className="text-slate-700">{t.fee} หยวน</span></div>)}
          </div>
        )}
        <div className="mt-3"><Label>วันที่วางบิล</Label>
          <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)}
            className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" /></div>
        {/* สรุปยอด ¥ (เรทมาตอนโอน) */}
        <div className="mt-3 rounded-lg bg-orange-50 border border-orange-100 p-3 flex justify-between items-center">
          <div className="text-sm text-slate-600">ยอดโอนรวม</div>
          <div className="text-lg font-bold text-orange-600">¥{fmt(totalRmb)}</div>
        </div>
        <div className="mt-1 text-[11px] text-slate-400 text-center">* เรท/ยอดเงินบาทจะคำนวณตอน “โอนเข้าจีน”</div>
      </Card>

      <Card>
        <FileMultiInput label="📎 ไฟล์แนบ (ใบรับ/บิล, สลิป WeChat ฯลฯ)" value={files} onChange={setFiles} folder="china-bills" />
      </Card>

      <button onClick={save} disabled={saving}
        className="w-full h-12 bg-orange-600 text-white rounded-xl font-semibold text-base disabled:opacity-50 active:scale-[0.99] transition-transform">
        {saving ? "กำลังบันทึก…" : "บันทึกบิล"}
      </button>
    </div>
  );
}

// ---------------- บิลจีนทั้งหมด (รวมหน้ารอโอนเดิม) ----------------
const ALL_FILTERS = ["รอโอน", "โอนแล้ว", "ยกเลิก", "ทั้งหมด"] as const;
function AllList({ onTransfer }: { onTransfer: (ids: string[]) => void }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("รอโอน");   // default = รอโอน
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [tsel, setTsel] = useState<Set<string>>(new Set());   // ติ๊กเลือกไปโอน
  const tToggle = (id: string) => setTsel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const load = useCallback(() => {
    setLoading(true);
    let url = "/api/master-v2/china-bills?limit=200&sort_by=bill_date&sort_dir=desc";
    if (filter !== "ทั้งหมด") {
      const flt = encodeURIComponent(JSON.stringify({ status: { type: "text", value: filter } }));
      url += `&filters=${flt}`;
    }
    apiFetch(url).then(r => r.json()).then(j => setRows(j.data ?? [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => rows.reduce((a, r) => a + (num(r.amount_rmb) + num(r.fee_rmb)), 0), [rows]);

  const onPrinted = (id: string, at: string) =>
    setRows(p => p.map(r => String(r.id) === id ? { ...r, printed_at: at } : r));

  return (
    <div className="space-y-3">
      {/* ตัวกรองสถานะ */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {ALL_FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-shrink-0 h-8 px-3 rounded-full text-sm border ${filter === f ? "bg-orange-600 text-white border-orange-600 font-medium" : "bg-white text-slate-500 border-slate-200"}`}>
            {f}
          </button>
        ))}
      </div>

      {/* สรุปยอด */}
      {!loading && rows.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 p-3 flex justify-between items-center">
          <span className="text-sm text-slate-500">{filter} {rows.length} บิล</span>
          <span className="font-bold text-orange-600">¥{fmt(total)}</span>
        </div>
      )}

      {/* ติ๊กเลือก → โอนเข้าจีน */}
      {tsel.size > 0 && (
        <button onClick={() => onTransfer([...tsel])}
          className="w-full h-12 bg-emerald-600 text-white rounded-xl font-semibold shadow-md shadow-emerald-500/30 active:scale-[0.99] transition">
          💰 โอนเข้าจีน ({tsel.size} บิล) →
        </button>
      )}

      {loading ? (
        <div className="text-center text-slate-400 py-10">กำลังโหลด…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-slate-300 py-10">— ไม่มีรายการ —</div>
      ) : (
        rows.map((r) => {
          const id = String(r.id), st = String(r.status ?? "—"), rate = num(r.rate);
          const isPending = st === "รอโอน";
          const fullRmb = num(r.amount_rmb) + num(r.fee_rmb);
          const remainRmb = Math.max(0, fullRmb - num(r.paid_rmb));
          return (
            <Card key={id}>
              <div className="flex items-start gap-2">
                {isPending && (
                  <button onClick={() => tToggle(id)}
                    className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 ${tsel.has(id) ? "bg-emerald-600 text-white" : "border border-slate-300"}`}>{tsel.has(id) ? "✓" : ""}</button>
                )}
                <button onClick={() => isPending ? tToggle(id) : setDetail(r)} className="flex-1 min-w-0 text-left flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 truncate">{String(r.supplier_label ?? r.supplier_id ?? "—")}</div>
                    <div className="text-xs text-slate-400">{String(r.transfer_date ?? r.bill_date ?? "—")}</div>
                    {r.printed_at ? <PrintedBadge /> : null}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-bold text-orange-600">¥{fmt(remainRmb)}</div>
                    <div className="text-[11px] text-slate-400">เต็ม ¥{fmt(fullRmb)}{rate > 0 ? ` · ฿${fmt(remainRmb * rate)}` : ""}</div>
                    <span className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[st] ?? "bg-slate-100 text-slate-500"}`}>{st}</span>
                  </div>
                </button>
              </div>
              {isPending && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => setReport(r)}
                    className="h-10 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">🖨️ พิมพ์</button>
                  <button onClick={() => setDetail(r)}
                    className="h-10 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">👁 ดูข้อมูล</button>
                </div>
              )}
            </Card>
          );
        })
      )}
      {detail && <BillDetail bill={detail} onClose={() => setDetail(null)} onPrinted={onPrinted} onChanged={load} />}
      {report && <ReportPopup bill={report} onClose={() => setReport(null)} onPrinted={onPrinted} />}
    </div>
  );
}

// ---------------- ประวัติการตัด/โอน (ดึงจาก china_transfers.lines) — แก้ไข/ลบได้ (คืนยอด) ----------------
function TransferHistory({ bill, kind, onChanged }: { bill: Record<string, unknown>; kind: "china" | "ctw"; onChanged?: () => void }) {
  const toast = useToast();
  const billId = String(bill.id);
  const billTotal = kind === "china" ? num(bill.amount_rmb) + num(bill.fee_rmb) : num(bill.net_amount);
  const curStatus = String(bill.status ?? "");
  const [raw, setRaw] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);   // tid ที่กำลังแก้จำนวน
  const [editVal, setEditVal] = useState("");
  const [delId, setDelId] = useState<string | null>(null);     // tid ที่กำลังยืนยันลบ

  const load = useCallback(() => {
    apiFetch("/api/master-v2/china-transfers?limit=500&sort_by=transfer_date&sort_dir=desc")
      .then(r => r.json()).then(j => setRaw(j.data ?? [])).catch(() => setRaw([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const linesOf = (t: Record<string, unknown>) => Array.isArray(t.lines) ? (t.lines as Record<string, unknown>[]) : [];

  // รายการประวัติของบิลนี้
  const items = raw.flatMap((t) => {
    const lines = linesOf(t);
    const idx = lines.findIndex(l => String(l.bill_id) === billId && l.kind === kind);
    const no = t.transfer_no ? String(t.transfer_no) : (t.ref_no ? String(t.ref_no) : "—");
    const date = String(t.transfer_date ?? "");
    if (idx >= 0) {
      const mine = lines[idx];
      // ดูบิลจีน → โชว์เลขบิล CTW ที่ตัดพร้อมกันในการโอนนั้น
      const ctwDocs = kind === "china" ? lines.filter(l => l.kind === "ctw").map(l => String(l.doc_number ?? "")).filter(Boolean) : [];
      return [{
        tid: String(t.id), no, date, editable: true,
        amt: kind === "china" ? num(mine.paid_rmb) : num(mine.paid_thb),
        cur: kind === "china" ? "¥" : "฿",
        note: ctwDocs.length ? `ตัดพร้อม CTW: ${ctwDocs.join(", ")}` : "",
      }];
    }
    if (kind === "china" && Array.isArray(t.bill_ids) && (t.bill_ids as unknown[]).map(String).includes(billId)) {
      return [{ tid: String(t.id), no, date, editable: false, amt: 0, cur: "¥", note: "(รายการเก่า)" }];
    }
    return [];
  });

  // คำนวณยอดจ่ายรวมของบิลนี้ใหม่จากทุกการโอน (= source of truth)
  const recomputeBillPaid = (transfers: Record<string, unknown>[]) =>
    transfers.reduce((sum, t) => {
      const mine = linesOf(t).find(l => String(l.bill_id) === billId && l.kind === kind);
      return mine ? sum + (kind === "china" ? num(mine.paid_rmb) : num(mine.paid_thb)) : sum;
    }, 0);

  // แก้ไข (newVal != null) หรือ ลบ (newVal == null) รายการในการโอน tid
  const apply = async (tid: string, newVal: number | null) => {
    const t = raw.find(x => String(x.id) === tid);
    if (!t) return;
    setBusy(true);
    try {
      const rate = num(t.rate);
      const lines = linesOf(t).map(l => ({ ...l }));
      const idx = lines.findIndex(l => String(l.bill_id) === billId && l.kind === kind);
      if (idx < 0) throw new Error("ไม่พบรายการ");

      if (newVal == null) lines.splice(idx, 1);                       // ลบรายการ
      else if (kind === "china") { lines[idx].paid_rmb = +newVal.toFixed(2); lines[idx].paid_thb = +(newVal * rate).toFixed(2); }
      else lines[idx].paid_thb = +newVal.toFixed(2);

      // ---- จัดการ record การโอน (คง leftover เดิม → ยอดคงเหลือบัญชีจีนไม่เพี้ยน) ----
      const chinaThb = lines.filter(l => l.kind === "china").reduce((a, l) => a + num(l.paid_thb), 0);
      const leftoverThb = num(t.leftover_thb);
      if (lines.length === 0) {
        await apiFetch(`/api/master-v2/china-transfers/${tid}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: false, actor: "china-app" }),     // ไม่เหลือรายการ → ปิดการโอนนี้
        });
      } else {
        await apiFetch(`/api/master-v2/china-transfers/${tid}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines, bills_total_thb: +chinaThb.toFixed(2), amount_transferred_thb: +(chinaThb + leftoverThb).toFixed(2), actor: "china-app" }),
        });
      }

      // ---- คืนยอดบิล: คำนวณ paid รวมใหม่จากสถานะหลังแก้ ----
      const after = raw
        .map(x => String(x.id) === tid ? { ...x, lines, is_active: lines.length === 0 ? false : x.is_active } : x)
        .filter(x => x.is_active !== false);
      const paidSum = recomputeBillPaid(after);

      if (kind === "china") {
        const body: Record<string, unknown> = { paid_rmb: +paidSum.toFixed(2), actor: "china-app" };
        if (curStatus !== "ยกเลิก") body.status = paidSum >= billTotal - 0.001 ? "โอนแล้ว" : "รอโอน";
        await apiFetch(`/api/master-v2/china-bills/${billId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        const cleared = Math.min(billTotal, paidSum);
        await apiFetch(`/api/master-v2/ctw-bills/${billId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cleared_amount: +cleared.toFixed(2), cleared_at: cleared >= billTotal - 0.001 ? new Date().toISOString() : null, actor: "china-app" }),
        });
      }

      toast.success(newVal == null ? "ลบรายการ + คืนยอดแล้ว" : "แก้ไขรายการแล้ว");
      setEditId(null); setDelId(null);
      load(); onChanged?.();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  if (items.length === 0) return null;
  return (
    <div>
      <Label>ประวัติการตัด/โอน ({items.length})</Label>
      <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-2">
        {items.map((it) => (
          <div key={it.tid} className="border-b border-slate-100 last:border-0 pb-2 last:pb-0">
            <div className="flex justify-between gap-2 items-start">
              <span className="text-slate-500">{it.date} · เลขโอน {it.no}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {it.amt > 0 && <span className="font-medium text-slate-700">{it.cur}{fmt(it.amt)}</span>}
                {it.editable && (
                  <>
                    <button onClick={() => { setEditId(it.tid); setEditVal(String(it.amt)); setDelId(null); }} className="text-slate-400 hover:text-blue-500" title="แก้ไขจำนวน">✎</button>
                    <button onClick={() => { setDelId(it.tid); setEditId(null); }} className="text-slate-400 hover:text-red-500" title="ลบ (คืนยอด)">🗑</button>
                  </>
                )}
              </div>
            </div>
            {it.note && <div className="text-[11px] text-slate-400 mt-0.5">{it.note}</div>}
            {editId === it.tid && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-500">{it.cur}</span>
                <div className="flex-1"><Money value={editVal} onChange={setEditVal} /></div>
                <button disabled={busy} onClick={() => apply(it.tid, num(editVal))} className="h-9 px-3 bg-emerald-600 text-white rounded-lg text-xs font-medium disabled:opacity-50">บันทึก</button>
                <button disabled={busy} onClick={() => setEditId(null)} className="h-9 px-3 border border-slate-200 rounded-lg text-xs">ยกเลิก</button>
              </div>
            )}
            {delId === it.tid && (
              <div className="mt-2 rounded-lg bg-red-50 border border-red-100 p-2 text-xs">
                <div className="text-red-600 mb-2">ลบรายการนี้? ระบบจะคืนยอดบิลกลับ (ยอดคงเหลือบัญชีจีนไม่เปลี่ยน)</div>
                <div className="flex gap-2">
                  <button disabled={busy} onClick={() => apply(it.tid, null)} className="h-9 px-3 bg-red-600 text-white rounded-lg font-medium disabled:opacity-50">ลบ + คืนยอด</button>
                  <button disabled={busy} onClick={() => setDelId(null)} className="h-9 px-3 border border-slate-200 rounded-lg">ยกเลิก</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- รายละเอียดบิล ----------------
function BillDetail({ bill, onClose, onPrinted, onChanged }: { bill: Record<string, unknown>; onClose: () => void; onPrinted?: (id: string, at: string) => void; onChanged?: () => void }) {
  const toast = useToast();
  const [sup, setSup] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const supplierId = bill.supplier_id ? String(bill.supplier_id) : null;
  useEffect(() => {
    if (!supplierId) return;
    apiFetch(`/api/master-v2/partners/${supplierId}`).then(r => r.json()).then(j => setSup(j.data ?? null)).catch(() => setSup(null));
  }, [supplierId]);

  const amount = num(bill.amount_rmb), fee = num(bill.fee_rmb), totalRmb = amount + fee, rate = num(bill.rate);
  const thb = totalRmb * rate;
  const st = String(bill.status ?? "—");
  const r2Url = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
  // ไฟล์แนบใหม่ (array) + รวมไฟล์เก่า bill_image/wechat_image ของบิลเดิม
  const atts = Array.isArray(bill.attachments) ? (bill.attachments as unknown[]).map(String) : [];
  const legacy = [bill.bill_image, bill.wechat_image].filter(Boolean).map(String);
  const allFiles = [...atts, ...legacy.filter((k) => !atts.includes(k))];
  const isPdf = (k: string) => k.toLowerCase().endsWith(".pdf");
  const canPrint = rate > 0;                       // พิมพ์ได้เมื่อมีเรทแล้ว
  const canCancel = st !== "ยกเลิก" && st !== "โอนแล้ว";

  const cancelBill = async () => {
    setBusy(true); setAskCancel(false);
    try {
      const res = await apiFetch(`/api/master-v2/china-bills/${String(bill.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ยกเลิก", actor: "china-app" }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      toast.success("ยกเลิกบิลแล้ว"); onChanged?.(); onClose();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <div className="font-semibold text-slate-800">รายละเอียดบิล</div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[st] ?? "bg-slate-100 text-slate-500"}`}>{st}</span>
            <button onClick={onClose} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-lg leading-none">×</button>
          </div>
        </div>

        <div className="p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-4">
          {/* ร้านค้า + ธนาคาร */}
          <div>
            <div className="font-medium text-slate-800">{String(bill.supplier_label ?? sup?.name_th ?? bill.supplier_id ?? "—")}</div>
            {!!sup?.name_en && <div className="text-sm text-slate-500">{String(sup.name_en)}</div>}
            <div className="mt-2 rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
              <Row label="ธนาคาร" v={sup?.bank_name_brief} />
              <Row label="เลขบัญชี" v={sup?.account_number} />
              <Row label="ชื่อบัญชี" v={sup?.bank_account_name} />
              <Row label="โทร" v={sup?.phone} />
            </div>
          </div>

          {/* ยอดเงิน */}
          <div className="rounded-lg bg-orange-50 border border-orange-100 p-3 text-sm space-y-1">
            <Row label="ยอด (¥)" v={fmt(amount)} />
            <Row label="ค่าโอน (¥)" v={fmt(fee)} />
            <div className="flex justify-between border-t border-orange-200/60 pt-1 mt-1"><span className="text-slate-500">ยอดโอนรวม</span><span className="font-semibold text-slate-800">¥{fmt(totalRmb)}</span></div>
            <Row label="เรท" v={rate ? fmt(rate) : "—"} />
            <div className="flex justify-between"><span className="text-slate-500">เป็นเงินบาท</span>
              {canPrint
                ? <span className="font-bold text-orange-600">฿{fmt(thb)}</span>
                : <span className="font-medium text-amber-600">รอเรทเงิน</span>}
            </div>
          </div>

          {/* วันที่ */}
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
            <Row label="วันที่โอน" v={bill.transfer_date} />
            <Row label="วันที่ลงบิล" v={bill.bill_date} />
            {bill.printed_at ? <Row label="พิมพ์เมื่อ" v={String(bill.printed_at).slice(0, 16).replace("T", " ")} /> : null}
          </div>

          <TransferHistory bill={bill} kind="china" onChanged={() => onChanged?.()} />

          {/* ปุ่มพิมพ์/ใบสรุป — พิมพ์ได้เมื่อมีเรทแล้ว */}
          <button onClick={() => canPrint && setReport(true)} disabled={!canPrint}
            className="w-full h-11 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
            🖨️ พิมพ์ / ใบสรุป
          </button>
          {!canPrint && <div className="-mt-2 text-[11px] text-amber-600 text-center">* ใส่เรทก่อนถึงพิมพ์ได้ (เรทจะมาตอนตัดโอนเข้าจีน)</div>}

          {/* แนบไฟล์ */}
          {allFiles.length > 0 && (
            <div>
              <Label>ไฟล์แนบ ({allFiles.length})</Label>
              <div className="grid grid-cols-3 gap-2">
                {allFiles.map((k) => (
                  <a key={k} href={r2Url(k)} target="_blank" rel="noreferrer"
                    className="block rounded-md border border-slate-200 overflow-hidden bg-slate-50">
                    {isPdf(k) ? (
                      <div className="flex flex-col items-center justify-center h-24 text-slate-600">
                        <span className="text-3xl">📄</span>
                        <span className="text-[10px] truncate w-full px-1 text-center">{k.split("/").pop()}</span>
                      </div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={r2Url(k)} alt="" className="w-full h-24 object-cover" />
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ยกเลิกบิล */}
          {canCancel && (
            <button onClick={() => setAskCancel(true)} disabled={busy}
              className="w-full h-11 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50">
              ✕ ยกเลิกบิลนี้
            </button>
          )}
        </div>
      </div>
      {report && <ReportPopup bill={{ ...bill, _sup: sup }} onClose={() => setReport(false)} onPrinted={onPrinted} />}
      {askCancel && (
        <ConfirmPopup title="ยกเลิกบิลนี้?" message={`${String(bill.supplier_label ?? bill.supplier_id ?? "บิลนี้")} · ¥${fmt(totalRmb)}`}
          confirmText="ยกเลิกบิล" tone="rose" onCancel={() => setAskCancel(false)} onConfirm={cancelBill} />
      )}
    </div>
  );
}

// ---------------- เรท ----------------
function RateTab() {
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [date, setDate] = useState(today());
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [delRow, setDelRow] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(() => {
    apiFetch("/api/master-v2/daily-rates?limit=20&sort_by=rate_date&sort_dir=desc")
      .then(r => r.json()).then(j => setRows(j.data ?? [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveEdit = async (id: string) => {
    if (num(editVal) <= 0) { toast.error("กรอกเรท R1"); return; }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/master-v2/daily-rates/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: num(editVal), actor: "china-app" }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      toast.success("แก้ไขเรทแล้ว");
      setRows(p => p.map(r => String(r.id) === id ? { ...r, rate: num(editVal) } : r));
      setEditId(null);
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  const doDelete = async (id: string) => {
    setBusy(true); setDelRow(null);
    try {
      const res = await apiFetch(`/api/master-v2/daily-rates/${id}?hard=1`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (j.error) { toast.error(j.error); return; }
      toast.success("ลบเรทแล้ว");
      setRows(p => p.filter(r => String(r.id) !== id));
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (num(rate) <= 0) { toast.error("กรอกเรท"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/master-v2/daily-rates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate_date: date, rate: num(rate), actor: "china-app" }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      toast.success("บันทึกเรทแล้ว"); setRate(""); load();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <Label>เพิ่มเรท R1 ของวัน (กรอกแค่ R1 — R2-R4 คำนวณให้)</Label>
        <div className="grid grid-cols-2 gap-3">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" />
          <Num value={rate} onChange={setRate} placeholder="R1 เช่น 4.97" />
        </div>
        {num(rate) > 0 && (
          <div className="mt-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs space-y-1">
            {RATE_TABLE.map(t => <div key={t.tier} className="flex justify-between"><span className="text-slate-500">{t.tier} · {t.label}</span><span className="font-medium text-slate-700">{fmt(+(num(rate) - t.off).toFixed(4))}</span></div>)}
          </div>
        )}
        <button onClick={save} disabled={saving} className="mt-3 w-full h-11 bg-orange-600 text-white rounded-lg font-medium disabled:opacity-50">
          {saving ? "กำลังบันทึก…" : "บันทึกเรท"}
        </button>
      </Card>
      <div className="space-y-2">
        {rows.map((r) => {
          const id = String(r.id);
          const editing = editId === id;
          return (
            <div key={id} className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-500 flex-shrink-0">{String(r.rate_date)}</span>
              {editing ? (
                <div className="flex items-center gap-1.5 flex-1 justify-end">
                  <span className="text-slate-400 text-xs">R1</span>
                  <input type="number" inputMode="decimal" step="any" value={editVal} autoFocus
                    onChange={e => setEditVal(e.target.value)}
                    className="w-24 h-9 px-2 text-base text-right border border-orange-300 rounded-lg" />
                  <button onClick={() => saveEdit(id)} disabled={busy}
                    className="w-9 h-9 rounded-lg bg-emerald-600 text-white disabled:opacity-50">✓</button>
                  <button onClick={() => setEditId(null)} disabled={busy}
                    className="w-9 h-9 rounded-lg border border-slate-200 text-slate-500">✕</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-1 justify-end">
                  <span className="text-slate-700">R1 <b>{fmt(num(r.rate))}</b> <span className="text-slate-400">· R4 {fmt(+(num(r.rate) - RATE_OFFSET.r4).toFixed(4))}</span></span>
                  <button onClick={() => { setEditId(id); setEditVal(String(num(r.rate))); }}
                    className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">✎</button>
                  <button onClick={() => setDelRow(r)}
                    className="w-8 h-8 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50">🗑</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {delRow && (
        <ConfirmPopup
          title="ลบเรทนี้?"
          message={`${String(delRow.rate_date)} · R1 ${fmt(num(delRow.rate))}`}
          confirmText="ลบ" tone="rose"
          onCancel={() => setDelRow(null)} onConfirm={() => doDelete(String(delRow.id))}
        />
      )}
    </div>
  );
}

// ---------------- บิลจาก CTW ----------------
function CtwList() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"list" | "form">("list");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch("/api/master-v2/ctw-bills?limit=200&sort_by=doc_date&sort_dir=desc")
      .then(r => r.json()).then(j => setRows(j.data ?? [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (mode === "form") return <CtwForm onCancel={() => setMode("list")} onSaved={() => { setMode("list"); load(); }} />;

  const ctwRemain = (r: Record<string, unknown>) => Math.max(0, num(r.net_amount) - num(r.cleared_amount));
  const unpaid = rows.filter(r => !r.cleared_at);
  const unclearedTotal = unpaid.reduce((a, r) => a + ctwRemain(r), 0);

  return (
    <div className="space-y-3">
      <button onClick={() => setMode("form")} className="w-full h-12 bg-orange-600 text-white rounded-xl font-semibold active:scale-[0.99] transition-transform">+ เพิ่มบิล CTW</button>
      {!loading && rows.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white p-4 shadow-sm">
          <div className="text-sm opacity-90">ยอดคงเหลือยังไม่ตัด ({unpaid.length} บิล)</div>
          <div className="text-3xl font-bold mt-1">฿{fmt(unclearedTotal)}</div>
        </div>
      )}
      {loading ? (
        <div className="text-center text-slate-400 py-10">กำลังโหลด…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-slate-300 py-10">— ยังไม่มีบิล CTW —</div>
      ) : (
        rows.map((r) => {
          const paid = num(r.cleared_amount), cleared = !!r.cleared_at;
          return (
          <Card key={String(r.id)}>
            <button onClick={() => setDetail(r)} className="w-full text-left flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="font-medium text-slate-800 truncate">{String(r.company_name ?? "—")}</div>
                <div className="text-xs text-slate-400">เลขที่ {String(r.doc_number ?? "—")} · {String(r.doc_date ?? "—")}{paid > 0 && !cleared ? ` · จ่ายแล้ว ฿${fmt(paid)}` : ""}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-semibold text-slate-800">฿{fmt(cleared ? num(r.net_amount) : ctwRemain(r))}</div>
                {cleared
                  ? <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">ตัดแล้ว</span>
                  : <div className="text-[11px] text-slate-400">เต็ม ฿{fmt(num(r.net_amount))}</div>}
              </div>
            </button>
          </Card>
          );
        })
      )}
      {detail && <CtwDetail bill={detail} onClose={() => setDetail(null)} onChanged={load} onDeleted={(id) => { setRows(p => p.filter(r => String(r.id) !== id)); setDetail(null); }} />}
    </div>
  );
}

function CtwForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const toast = useToast();
  const celebrate = useCelebrate();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [docNo, setDocNo] = useState("");
  const [docDate, setDocDate] = useState(today());
  const [beforeTax, setBeforeTax] = useState("");
  const [net, setNet] = useState("");
  const [account, setAccount] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // เลือกบริษัท → ดึงชื่อ + เลขบัญชีจาก Partners
  useEffect(() => {
    if (!supplierId) return;
    apiFetch(`/api/master-v2/partners/${supplierId}`).then(r => r.json()).then(j => {
      const p = j.data ?? {};
      setCompany(String(p.name_th ?? p.display_name ?? ""));
      setAccount(String(p.account_number ?? ""));
    }).catch(() => {});
  }, [supplierId]);

  // ยอดสุทธิ = ยอดก่อนภาษี + 7% (เติมอัตโนมัติ แก้ทับได้)
  useEffect(() => {
    const b = num(beforeTax);
    setNet(b > 0 ? String(+(b * (1 + VAT_RATE)).toFixed(2)) : "");
  }, [beforeTax]);

  const save = async () => {
    if (!supplierId || !company.trim()) { toast.error("เลือกบริษัทก่อน"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/master-v2/ctw-bills", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: company, doc_number: docNo || null, doc_date: docDate || null,
          amount_before_tax: num(beforeTax) || null, net_amount: num(net) || null,
          account_number: account || null, attachments: files, actor: "china-app",
        }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      celebrate("บันทึกบิล CTW แล้ว"); onSaved();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <Label>ชื่อบริษัท (เลือกจากที่ติ๊ก “ซื้อบิล”)</Label>
        <RelationPicker value={supplierId} onChange={(id) => setSupplierId(id)} config={CTW_PARTNER_CFG} />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div><Label>เลขที่เอกสาร</Label>
            <input value={docNo} onChange={e => setDocNo(e.target.value)} placeholder="เช่น IV260410015"
              className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" /></div>
          <div><Label>วันที่เอกสาร</Label>
            <input type="date" value={docDate} onChange={e => setDocDate(e.target.value)}
              className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" /></div>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>ยอดรวมก่อนภาษี</Label><Num value={beforeTax} onChange={setBeforeTax} /></div>
          <div><Label>ยอดเงินสุทธิ (+7%)</Label><Num value={net} onChange={setNet} /></div>
        </div>
        <div className="mt-3"><Label>เลขที่บัญชี (ดึงจาก Partners)</Label>
          <input value={account} onChange={e => setAccount(e.target.value)} placeholder="เลือกบริษัทแล้วเติมให้อัตโนมัติ"
            className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" /></div>
      </Card>

      <Card>
        <FileMultiInput label="📎 ไฟล์แนบ (PDF บิล ฯลฯ)" value={files} onChange={setFiles} folder="ctw-bills" />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onCancel} disabled={saving} className="h-12 border border-slate-200 text-slate-700 rounded-xl font-medium">ยกเลิก</button>
        <button onClick={save} disabled={saving} className="h-12 bg-orange-600 text-white rounded-xl font-semibold disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึกบิล"}</button>
      </div>
    </div>
  );
}

function CtwDetail({ bill, onClose, onDeleted, onChanged }: { bill: Record<string, unknown>; onClose: () => void; onDeleted: (id: string) => void; onChanged?: () => void }) {
  const toast = useToast();
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const r2Url = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
  const atts = Array.isArray(bill.attachments) ? (bill.attachments as unknown[]).map(String) : [];
  const isPdf = (k: string) => k.toLowerCase().endsWith(".pdf");

  const doDelete = async () => {
    setBusy(true); setDel(false);
    try {
      const res = await apiFetch(`/api/master-v2/ctw-bills/${String(bill.id)}?hard=1`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (j.error) { toast.error(j.error); return; }
      toast.success("ลบบิลแล้ว"); onDeleted(String(bill.id));
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <div className="font-semibold text-slate-800">บิลจาก CTW</div>
          <button onClick={onClose} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-lg leading-none">×</button>
        </div>
        <div className="p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-4">
          <div>
            <div className="font-medium text-slate-800 text-lg">{String(bill.company_name ?? "—")}</div>
            <div className="text-sm text-slate-400">เลขที่เอกสาร {String(bill.doc_number ?? "—")}</div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
            <Row label="วันที่เอกสาร" v={bill.doc_date} />
            <Row label="เลขที่บัญชี" v={bill.account_number} />
          </div>
          <div className="rounded-lg bg-orange-50 border border-orange-100 p-3 text-sm space-y-1">
            <Row label="ยอดรวมก่อนภาษี" v={"฿" + fmt(num(bill.amount_before_tax))} />
            <div className="flex justify-between border-t border-orange-200/60 pt-1 mt-1"><span className="text-slate-500">ยอดเงินสุทธิ</span><span className="font-bold text-orange-600">฿{fmt(num(bill.net_amount))}</span></div>
            {num(bill.cleared_amount) > 0 && <Row label="ตัดไปแล้ว" v={"฿" + fmt(num(bill.cleared_amount))} />}
          </div>

          <TransferHistory bill={bill} kind="ctw" onChanged={() => onChanged?.()} />
          {atts.length > 0 && (
            <div>
              <Label>ไฟล์แนบ ({atts.length})</Label>
              <div className="grid grid-cols-3 gap-2">
                {atts.map((k) => (
                  <a key={k} href={r2Url(k)} target="_blank" rel="noreferrer" className="block rounded-md border border-slate-200 overflow-hidden bg-slate-50">
                    {isPdf(k) ? (
                      <div className="flex flex-col items-center justify-center h-24 text-slate-600"><span className="text-3xl">📄</span><span className="text-[10px] truncate w-full px-1 text-center">{k.split("/").pop()}</span></div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={r2Url(k)} alt="" className="w-full h-24 object-cover" />
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}
          <button onClick={() => setDel(true)} disabled={busy}
            className="w-full h-11 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50">🗑 ลบบิลนี้</button>
        </div>
      </div>
      {del && (
        <ConfirmPopup title="ลบบิล CTW นี้?" message={`${String(bill.company_name ?? "")} · เลขที่ ${String(bill.doc_number ?? "—")}`}
          confirmText="ลบ" tone="rose" onCancel={() => setDel(false)} onConfirm={doDelete} />
      )}
    </div>
  );
}

// ---------------- โอนเข้าบัญชีจีน ----------------
function TransferPage({ preselect = [], onConsumePreselect }: { preselect?: string[]; onConsumePreselect?: () => void }) {
  const toast = useToast();
  const celebrate = useCelebrate();
  const [pending, setPending] = useState<Record<string, unknown>[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pay, setPay] = useState<Record<string, string>>({});   // จำนวนที่โอนต่อบิล (¥) รอบนี้
  const [useBalance, setUseBalance] = useState(false);          // สวิตช์ใช้ยอดคงเหลือบัญชีจีน
  const [amount, setAmount] = useState("");
  const [refNo, setRefNo] = useState("");                       // หมายเลข/เลขอ้างอิงการโอน
  const [rate, setRate] = useState("");
  const [transferDate, setTransferDate] = useState(today());
  const [rateInfo, setRateInfo] = useState(false);
  const [slip, setSlip] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState<{ thb: number; rmb: number }>({ thb: 0, rmb: 0 });
  const [loading, setLoading] = useState(true);

  // CTW ที่ยังไม่ตัด (รองรับตัดบางส่วน)
  const [ctw, setCtw] = useState<Record<string, unknown>[]>([]);
  const [ctwSel, setCtwSel] = useState<Set<string>>(new Set());
  const [ctwPay, setCtwPay] = useState<Record<string, string>>({});

  const loadAll = useCallback(() => {
    setLoading(true);
    const fPending = encodeURIComponent(JSON.stringify({ status: { type: "text", value: "รอโอน" } }));
    Promise.all([
      apiFetch(`/api/master-v2/china-bills?limit=200&filters=${fPending}&sort_by=bill_date&sort_dir=desc`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`/api/master-v2/china-transfers?limit=500`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`/api/master-v2/ctw-bills?limit=500&sort_by=doc_date&sort_dir=desc`).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([p, t, c]) => {
      setPending(p.data ?? []);
      const tr = t.data ?? [];
      setBalance({
        thb: tr.reduce((a: number, r: Record<string, unknown>) => a + num(r.leftover_thb), 0),
        rmb: tr.reduce((a: number, r: Record<string, unknown>) => a + num(r.leftover_rmb), 0),
      });
      setCtw((c.data ?? []).filter((r: Record<string, unknown>) => !r.cleared_at));
    }).finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  // โหลดเรท R1 ตาม "วันที่โอน" (ถ้าไม่มีเรทวันนั้น → ว่าง = รอเรทเงิน)
  useEffect(() => {
    if (!transferDate) { setRate(""); return; }
    apiFetch("/api/master-v2/daily-rates?limit=90&sort_by=rate_date&sort_dir=desc")
      .then(r => r.json()).then(j => {
        const row = (j.data ?? []).find((x: Record<string, unknown>) => String(x.rate_date) === transferDate);
        setRate(row ? String(num(row.rate)) : "");
      }).catch(() => {});
  }, [transferDate]);

  const r1 = num(rate);
  const hasRate = r1 > 0;
  // ยอดต่อบิล (¥) — รวม+ค่าโอน, หักที่โอนแล้วสะสม = คงเหลือ
  const billTotalRmb = (r: Record<string, unknown>) => num(r.amount_rmb) + num(r.fee_rmb);
  const billRemainRmb = (r: Record<string, unknown>) => Math.max(0, billTotalRmb(r) - num(r.paid_rmb));

  // มาจากหน้า "บิลจีนทั้งหมด" (กดโอน) → เลือกบิลให้อัตโนมัติ
  useEffect(() => {
    if (!preselect.length || pending.length === 0) return;
    const valid = pending.filter(r => preselect.includes(String(r.id)));
    if (valid.length) {
      setSel(new Set(valid.map(r => String(r.id))));
      setPay(Object.fromEntries(valid.map(r => [String(r.id), String(Math.max(0, num(r.amount_rmb) + num(r.fee_rmb) - num(r.paid_rmb)))])));
    }
    onConsumePreselect?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect, pending]);

  const toggle = (id: string, remainRmb: number) => setSel(s => {
    const n = new Set(s);
    if (n.has(id)) { n.delete(id); setPay(p => { const q = { ...p }; delete q[id]; return q; }); }
    else { n.add(id); setPay(p => ({ ...p, [id]: String(remainRmb) })); }   // default = ยอดคงเหลือของบิล (¥) แก้ตัดบางส่วนได้
    return n;
  });
  // ยอด ¥ ที่จะตัดรอบนี้ (จากช่องต่อบิล)
  const selectedRmb = useMemo(() => [...sel].reduce((a, id) => a + num(pay[id]), 0), [sel, pay]);
  // หักยอดคงเหลือบัญชีจีน (ถ้าเปิดสวิตช์) → เหลือ ¥ ที่ต้องโอนจริง
  const netRmb = Math.max(0, selectedRmb - (useBalance ? balance.rmb : 0));
  // เรท/ชั้น — เปิดสวิตช์: คิดชั้นจาก "เหลือที่ต้องโอน" / ปิด: คิดจากยอดรวมบิล
  const tierBasis = useBalance ? netRmb * r1 : selectedRmb * r1;
  const effRate = hasRate ? rateFor(tierBasis, r1) : 0;
  const selectedSum = selectedRmb * effRate;          // ยอดบิลที่เลือก (฿)
  const netThb = netRmb * effRate;                    // เหลือที่ต้องโอนจริง (฿) เมื่อหักยอดคงเหลือ
  const balanceUsedRmb = useBalance ? balance.rmb : 0;       // ¥ ที่ดึงจากยอดคงเหลือมาช่วย
  const balanceUsedThb = balanceUsedRmb * effRate;          // แปลงเป็นบาท (สำหรับโชว์)
  // โอนจริง = กรอกเองเสมอ; ขั้นต่ำ = เปิดสวิตช์→netThb / ปิด→ยอดรวม
  const transferred = num(amount);
  const minTransfer = useBalance ? netThb : selectedSum;
  const belowMin = hasRate && selectedSum > 0 && transferred < minTransfer - 0.001;
  // ส่วนต่างที่บันทึกลงบัญชี (ledger) = โอนจริง − ยอดบิล (ติดลบ = ดึงยอดคงเหลือออก) — ห้ามแก้สูตรนี้
  const leftover = transferred - selectedSum;
  const leftoverRmb = effRate ? leftover / effRate : 0;
  // เข้าบัญชีจีน (โชว์) = โอนจริง + ยอดคงเหลือที่ใช้ − ยอดบิล → ส่วนเกินที่เข้าจริง (ห้ามติดลบ)
  const chinaIn = Math.max(0, transferred + balanceUsedThb - selectedSum);
  const chinaInRmb = effRate ? chinaIn / effRate : 0;
  const activeTier = tierBasis <= 5000 ? "R1" : tierBasis <= 99999 ? "R2" : tierBasis <= 399999 ? "R3" : "R4";

  // ตัด/เคลียร์ บิล CTW (ตัดบางส่วนได้: cleared_amount สะสม)
  const ctwRemain = (r: Record<string, unknown>) => Math.max(0, num(r.net_amount) - num(r.cleared_amount));
  const ctwToggle = (id: string, remain: number) => setCtwSel(s => {
    const n = new Set(s);
    if (n.has(id)) { n.delete(id); setCtwPay(p => { const q = { ...p }; delete q[id]; return q; }); }
    else { n.add(id); setCtwPay(p => ({ ...p, [id]: String(num(amount) > 0 ? num(amount) : remain) })); }   // default = จำนวนเงินที่โอนจริง (ว่าง → ยอดคงเหลือบิล)
    return n;
  });
  const ctwTotal = useMemo(() => ctw.reduce((a, r) => a + ctwRemain(r), 0), [ctw]);

  // ปุ่มเดียว: ตัดบิลจีน + ตัดบิล CTW พร้อมกัน (+ เก็บประวัติ lines/เลขโอน)
  const save = async () => {
    if (sel.size === 0 && ctwSel.size === 0) { toast.error("เลือกบิลที่จะตัดก่อน"); return; }
    if (sel.size > 0 && !hasRate) { toast.error("รอเรทเงิน — ใส่เรท R1 ก่อน"); return; }
    if (sel.size > 0 && belowMin) { toast.error(`จำนวนเงินที่โอนจริงต้องไม่น้อยกว่า ฿${fmt(minTransfer)}`); return; }
    setSaving(true);
    try {
      const chinaIds = [...sel], ctwIds = [...ctwSel];
      // รายการย่อย (เก็บว่าการโอนนี้ตัดบิลอะไร จำนวนเท่าไหร่)
      const lines = [
        ...chinaIds.map(id => {
          const b = pending.find(p => String(p.id) === id);
          const paidRmb = num(pay[id]);
          return { kind: "china", bill_id: id, label: String(b?.supplier_label ?? b?.supplier_id ?? ""), paid_rmb: paidRmb, paid_thb: +(paidRmb * effRate).toFixed(2) };
        }),
        ...ctwIds.map(id => {
          const r = ctw.find(x => String(x.id) === id);
          return { kind: "ctw", bill_id: id, label: String(r?.company_name ?? ""), doc_number: String(r?.doc_number ?? ""), paid_thb: Math.max(0, num(ctwPay[id])) };
        }),
      ];
      // บันทึก transfer 1 รายการ (ครอบทั้งจีน + CTW) เก็บเลขโอน + lines
      const res = await apiFetch("/api/master-v2/china-transfers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transfer_date: transferDate || today(), bill_ids: chinaIds, bills_total_thb: +selectedSum.toFixed(2),
          amount_transferred_thb: sel.size > 0 ? +transferred.toFixed(2) : 0,
          rate: sel.size > 0 ? effRate : null,
          leftover_thb: sel.size > 0 ? +leftover.toFixed(2) : 0,
          leftover_rmb: sel.size > 0 ? +leftoverRmb.toFixed(2) : 0,
          ref_no: refNo || null, lines, attachments: slip, note: note || null, actor: "china-app",
        }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); setSaving(false); return; }
      // ตัดบิลจีน → สะสม paid_rmb
      await Promise.all(chinaIds.map(id => {
        const b = pending.find(p => String(p.id) === id);
        const total = num(b?.amount_rmb) + num(b?.fee_rmb);
        const newPaid = +(num(b?.paid_rmb) + num(pay[id])).toFixed(2);
        const done = newPaid >= total - 0.001;
        return apiFetch(`/api/master-v2/china-bills/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paid_rmb: newPaid, status: done ? "โอนแล้ว" : "รอโอน", rate: effRate, transfer_date: transferDate || today(), actor: "china-app" }),
        });
      }));
      // ตัดบิล CTW → สะสม cleared_amount
      await Promise.all(ctwIds.map(id => {
        const r = ctw.find(x => String(x.id) === id);
        const net = num(r?.net_amount), already = num(r?.cleared_amount);
        const p = Math.max(0, num(ctwPay[id]));
        const newCleared = Math.min(net, already + p);
        return apiFetch(`/api/master-v2/ctw-bills/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cleared_amount: newCleared, cleared_at: newCleared >= net ? new Date().toISOString() : null, actor: "china-app" }),
        });
      }));
      celebrate("โอนสำเร็จ 🎉", { confetti: true });
      setSel(new Set()); setPay({}); setCtwSel(new Set()); setCtwPay({}); setUseBalance(false);
      setAmount(""); setRefNo(""); setSlip([]); setNote("");
      loadAll();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-center text-slate-400 py-10">กำลังโหลด…</div>;

  return (
    <div className="space-y-4">
      {/* ยอดคงเหลือบัญชีจีน */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-4 shadow-sm">
        <div className="text-sm opacity-90">💰 ยอดคงเหลือในบัญชีจีน</div>
        <div className="flex items-end justify-between mt-1">
          <div className="text-3xl font-bold">฿{fmt(balance.thb)}</div>
          <div className="text-lg font-semibold opacity-95">≈ ¥{fmt(balance.rmb)}</div>
        </div>
      </div>

      {/* ทำรายการโอน */}
      <Card>
        <div className="font-semibold text-slate-800 mb-2">เลือกบิลที่จะตัด (รอโอน)</div>
        {pending.length === 0 ? (
          <div className="text-center text-slate-300 py-6 text-sm">— ไม่มีบิลรอโอน —</div>
        ) : (
          <div className="space-y-2">
            {pending.map((r) => {
              const id = String(r.id), on = sel.has(id);
              const remain = billRemainRmb(r), paid = num(r.paid_rmb);
              const remainThb = remain * effRate;
              return (
                <div key={id} className={`rounded-lg border ${on ? "border-emerald-400 bg-emerald-50" : "border-slate-200"}`}>
                  <button onClick={() => toggle(id, remain)} className="w-full flex items-center gap-3 p-2.5 text-left">
                    <span className={`w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 ${on ? "bg-emerald-600 text-white" : "border border-slate-300"}`}>{on ? "✓" : ""}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-800 truncate">{String(r.supplier_label ?? r.supplier_id ?? "—")}</span>
                      <span className="block text-xs text-slate-400">{hasRate ? `฿${fmt(remainThb)}` : "รอเรท"} · {String(r.transfer_date ?? "—")}{paid > 0 ? ` · จ่ายแล้ว ¥${fmt(paid)}` : ""}</span>
                    </span>
                    <span className="text-right flex-shrink-0">
                      <span className="block font-bold text-slate-800">¥{fmt(remain)}</span>
                      {paid > 0 && <span className="block text-[10px] text-slate-400">เต็ม ¥{fmt(billTotalRmb(r))}</span>}
                    </span>
                  </button>
                  {on && (
                    <div className="px-2.5 pb-2.5 flex items-center gap-2">
                      <span className="text-xs text-slate-500 flex-shrink-0">จำนวนที่โอน (¥)</span>
                      <Money value={pay[id] ?? ""} onChange={(v) => setPay(p => ({ ...p, [id]: v }))}
                        className="flex-1 h-9 px-2 text-base text-right border border-emerald-300 rounded-lg" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {sel.size > 0 && (
          <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-100 p-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">เลือก {sel.size} บิล · ยอดที่ตัดรอบนี้</span>
              <span className="text-right">
                <span className="font-bold text-slate-800">¥{fmt(selectedRmb)}</span>
                {hasRate && <span className="block text-[11px] text-slate-400">≈ ฿{fmt(selectedSum)}</span>}
              </span>
            </div>
            {hasRate && selectedSum > 0 && (
              <>
                <label className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-white border border-emerald-300 px-3 py-2 cursor-pointer">
                  <span className="text-sm text-emerald-700 font-medium">ใช้ยอดคงเหลือบัญชีจีน (¥{fmt(balance.rmb)})</span>
                  <span className="relative inline-flex flex-shrink-0">
                    <input type="checkbox" checked={useBalance} onChange={e => setUseBalance(e.target.checked)} className="sr-only peer" />
                    <span className="w-10 h-6 bg-slate-200 rounded-full peer-checked:bg-emerald-500 transition" />
                    <span className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition peer-checked:translate-x-4" />
                  </span>
                </label>
                {useBalance && (
                  <div className="mt-2 flex justify-between items-center text-sm">
                    <span className="text-slate-600 font-medium">เหลือที่ต้องโอน (หักยอดคงเหลือ)</span>
                    <span className="text-right">
                      <span className="font-bold text-emerald-700">¥{fmt(netRmb)}</span>
                      <span className="block text-[11px] text-slate-400">≈ ฿{fmt(netThb)}</span>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>จำนวนเงินที่โอนจริง (฿)</Label>
            <Money value={amount} onChange={setAmount} />
            {belowMin && (
              <div className="mt-1 text-[11px] text-red-500">
                * ต้องไม่น้อยกว่า{useBalance ? "เหลือที่ต้องโอน" : "ยอดรวม"} ฿{fmt(minTransfer)}
              </div>
            )}
          </div>
          <div><Label>วันที่โอน</Label>
            <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)}
              className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" /></div>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-slate-500">เรท R1 (ตามวันที่โอน)</span>
            <button type="button" onClick={() => setRateInfo(v => !v)} className="text-[11px] text-blue-500">ⓘ R1–R4</button>
          </div>
          <Num value={rate} onChange={setRate} placeholder="เช่น 5.08" />
          {!hasRate && <div className="mt-1 text-[11px] text-amber-600">* ยังไม่มีเรทของวันนี้ — ใส่เอง หรือไปตั้งในแท็บ “เรท”</div>}
          {!hasRate && (
            <button type="button"
              onClick={() => window.open(`https://line.me/R/share?text=${encodeURIComponent("ขอเรทเงินวันนี้ด้วยค่ะ 🙏")}`, "_blank")}
              className="mt-2 w-full h-10 bg-[#06C755] text-white rounded-lg text-sm font-semibold active:scale-[0.99] transition flex items-center justify-center gap-1.5">
              📩 ขอเรทเงินวันนี้ (ส่งเข้า LINE)
            </button>
          )}
        </div>
        {rateInfo && hasRate && (
          <div className="mt-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs space-y-1">
            <div className="font-semibold text-slate-700 mb-1">เรตตามชั้นยอด (R1 = {fmt(r1)}) — เลือกตามยอดที่โอน</div>
            {RATE_TABLE.map(t => {
              const on = transferred > 0 && t.tier === activeTier;
              return <div key={t.tier} className={`flex justify-between px-1.5 py-0.5 rounded ${on ? "bg-blue-200/70 font-semibold text-blue-900" : ""}`}>
                <span className={on ? "" : "text-slate-500"}>{t.tier} · {t.label}{on ? " ✓" : ""}</span>
                <span className={on ? "" : "font-medium text-slate-700"}>{fmt(+(r1 - t.off).toFixed(4))}</span>
              </div>;
            })}
          </div>
        )}
        {/* สรุปส่วนต่าง */}
        <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm space-y-1">
          {hasRate && transferred > 0 && (
            <div className="flex justify-between"><span className="text-slate-500">เรทที่ใช้ (ชั้น {activeTier})</span><span className="font-semibold text-emerald-700">{fmt(effRate)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-slate-500">ยอดบิลที่ตัด</span><span className="text-slate-700">{hasRate ? `฿${fmt(selectedSum)}` : "รอเรทเงิน"}</span></div>
          {useBalance && hasRate && balanceUsedRmb > 0 && (
            <div className="flex justify-between"><span className="text-slate-500">ใช้ยอดคงเหลือบัญชีจีน</span>
              <span className="text-orange-600">−฿{fmt(balanceUsedThb)}<span className="text-slate-400 font-normal"> ≈ ¥{fmt(balanceUsedRmb)}</span></span></div>
          )}
          <div className="flex justify-between"><span className="text-slate-500">โอนจริง</span><span className="text-slate-700">฿{fmt(transferred)}</span></div>
          <div className="flex justify-between border-t border-emerald-200/60 pt-1 mt-1">
            <span className="text-slate-600 font-medium">เข้าบัญชีจีน (ส่วนต่าง)</span>
            {hasRate
              ? <span className="font-bold text-emerald-700">฿{fmt(chinaIn)}<span className="text-slate-400 font-normal"> ≈ ¥{fmt(chinaInRmb)}</span></span>
              : <span className="font-medium text-amber-600">รอเรทเงิน</span>}
          </div>
        </div>
        <div className="mt-3"><Label>หมายเลขโอน / เลขอ้างอิง</Label>
          <input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="เช่น เลขอ้างอิงจากสลิป"
            className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" /></div>
        <div className="mt-3"><FileMultiInput label="📎 แนบสลิปการโอน" value={slip} onChange={setSlip} folder="china-transfers" /></div>
        <button onClick={save} disabled={saving}
          className="mt-3 w-full h-12 bg-emerald-600 text-white rounded-xl font-semibold disabled:opacity-50 active:scale-[0.99] transition-transform">
          {saving ? "กำลังบันทึก…" : "บันทึกการโอน + ตัดบิล"}
        </button>
      </Card>

      {/* บิล CTW ที่ยังไม่ตัด — ยอดคงเหลือสีส้ม + ตัดบางส่วนได้ */}
      <Card>
        <div className="flex justify-between items-center mb-2">
          <div className="font-semibold text-slate-800">บิล CTW ที่ยังไม่ตัด</div>
          <div className="text-right">
            <div className="text-[11px] text-slate-400">ยอดคงเหลือยังไม่ตัด ({ctw.length} บิล)</div>
            <div className="font-bold text-orange-500 text-xl">฿{fmt(ctwTotal)}</div>
          </div>
        </div>
        {ctw.length === 0 ? (
          <div className="text-center text-slate-300 py-4 text-sm">— ตัดครบแล้ว —</div>
        ) : (
          <>
            <div className="space-y-2">
              {ctw.map((r) => {
                const id = String(r.id), on = ctwSel.has(id), remain = ctwRemain(r), paid = num(r.cleared_amount);
                return (
                  <div key={id} className={`rounded-lg border ${on ? "border-orange-400 bg-orange-50" : "border-slate-200"}`}>
                    <button onClick={() => ctwToggle(id, remain)} className="w-full flex items-center gap-3 p-2.5 text-left">
                      <span className={`w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 ${on ? "bg-orange-600 text-white" : "border border-slate-300"}`}>{on ? "✓" : ""}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-slate-800 truncate">{String(r.company_name ?? "—")}</span>
                        <span className="block text-xs text-slate-400">เลขที่ {String(r.doc_number ?? "—")} · {String(r.doc_date ?? "—")}{paid > 0 ? ` · จ่ายแล้ว ฿${fmt(paid)}` : ""}</span>
                      </span>
                      <span className="text-right flex-shrink-0">
                        <span className="block font-semibold text-slate-800">฿{fmt(remain)}</span>
                        {paid > 0 && <span className="block text-[10px] text-slate-400">เต็ม ฿{fmt(num(r.net_amount))}</span>}
                      </span>
                    </button>
                    {on && (
                      <div className="px-2.5 pb-2.5 flex items-center gap-2">
                        <span className="text-xs text-slate-500 flex-shrink-0">ยอดที่โอนรอบนี้</span>
                        <Money value={ctwPay[id] ?? ""} onChange={(v) => setCtwPay(p => ({ ...p, [id]: v }))}
                          className="flex-1 h-9 px-2 text-base text-right border border-orange-300 rounded-lg" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {ctwSel.size > 0 && (
              <div className="mt-3 flex justify-between items-center rounded-lg bg-orange-50 border border-orange-100 p-2.5 text-sm">
                <span className="text-slate-500">เลือกตัด {ctwSel.size} บิล</span>
                <span className="font-bold text-orange-600">฿{fmt([...ctwSel].reduce((a, id) => a + num(ctwPay[id]), 0))}</span>
              </div>
            )}
            <div className="mt-2 text-[11px] text-slate-400 text-center">กด “บันทึกการโอน + ตัดบิล” ด้านบน เพื่อตัดทั้งบิลจีน + CTW พร้อมกัน</div>
          </>
        )}
      </Card>
    </div>
  );
}

// ---------------- ป้าย "พิมพ์แล้ว" ----------------
function PrintedBadge() {
  return <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">🖨️ พิมพ์แล้ว</span>;
}

// ---------------- Popup ยืนยัน (ของกลางเล็กๆ) ----------------
function ConfirmPopup({ title, message, confirmText = "ยืนยัน", tone = "rose", onCancel, onConfirm }: {
  title: string; message?: string; confirmText?: string; tone?: "rose" | "emerald"; onCancel: () => void; onConfirm: () => void;
}) {
  const btn = tone === "emerald" ? "bg-emerald-600" : "bg-orange-600";
  return (
    <div className="fixed inset-0 z-[210] bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-xs p-5 text-center" onClick={e => e.stopPropagation()}>
        <div className="text-lg font-semibold text-slate-800">{title}</div>
        {message && <div className="mt-1 text-sm text-slate-500">{message}</div>}
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="flex-1 h-11 border border-slate-200 rounded-lg text-slate-700">ยกเลิก</button>
          <button onClick={onConfirm} className={`flex-1 h-11 ${btn} text-white rounded-lg font-medium`}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- ใบสรุป (report) → บันทึกรูป / ส่ง LINE ----------------
function ReportPopup({ bill, onClose, onPrinted }: {
  bill: Record<string, unknown>; onClose: () => void; onPrinted?: (id: string, at: string) => void;
}) {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sup, setSup] = useState<Record<string, unknown> | null>((bill._sup as Record<string, unknown>) ?? null);
  const [busy, setBusy] = useState(false);
  const [printedLabel] = useState(() => new Date().toLocaleString("th-TH"));

  const supplierId = bill.supplier_id ? String(bill.supplier_id) : null;
  useEffect(() => {
    if (sup || !supplierId) return;
    apiFetch(`/api/master-v2/partners/${supplierId}`).then(r => r.json()).then(j => setSup(j.data ?? null)).catch(() => {});
  }, [supplierId, sup]);

  const amount = num(bill.amount_rmb), fee = num(bill.fee_rmb), totalRmb = amount + fee, rate = num(bill.rate);
  const thb = totalRmb * rate;
  const st = String(bill.status ?? "—");
  const supName = String(bill.supplier_label ?? sup?.name_th ?? bill.supplier_id ?? "—");

  // วาดใบสรุปลง canvas
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    type Line = { l: string; r: string; bold?: boolean; color?: string; big?: boolean; sep?: boolean };
    const lines: Line[] = [
      { l: "ร้านค้า", r: supName, bold: true },
      ...(sup?.name_en ? [{ l: "", r: String(sup.name_en) } as Line] : []),
      { l: "ธนาคาร", r: sup?.bank_name_brief ? String(sup.bank_name_brief) : "—" },
      { l: "เลขบัญชี", r: sup?.account_number ? String(sup.account_number) : "—" },
      { l: "ชื่อบัญชี", r: sup?.bank_account_name ? String(sup.bank_account_name) : "—" },
      { l: "", r: "", sep: true },
      { l: "ยอด (¥)", r: fmt(amount) },
      { l: "ค่าโอน (¥)", r: fmt(fee) },
      { l: "ยอดโอนรวม", r: "¥" + fmt(totalRmb), bold: true },
      { l: "เรท", r: rate ? fmt(rate) : "—" },
      { l: "เป็นเงินบาท", r: "฿" + fmt(thb), bold: true, color: "#e11d48", big: true },
      { l: "", r: "", sep: true },
      { l: "วันที่โอน", r: String(bill.transfer_date ?? "—") },
      { l: "วันที่ลงบิล", r: String(bill.bill_date ?? "—") },
      { l: "สถานะ", r: String(bill.status ?? "—") },
    ];
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const W = 680, headerH = 120, rowH = 56, padX = 40, padTop = 30, padBottom = 40;
    const H = headerH + padTop + lines.length * rowH + padBottom;
    cv.width = W * DPR; cv.height = H * DPR;
    cv.style.width = "100%"; cv.style.height = "auto";
    const ctx = cv.getContext("2d"); if (!ctx) return;
    ctx.scale(DPR, DPR);
    const FONT = "'Noto Sans Thai', 'Sarabun', -apple-system, 'Segoe UI', sans-serif";
    const LABEL_SIZE = 20, VAL_SIZE = 23, BIG_SIZE = 32;

    // พื้นหลัง
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    // header gradient
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "#e11d48"); grad.addColorStop(1, "#f97316");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, headerH);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = `bold 34px ${FONT}`; ctx.fillText("💸 ใบสรุปการโอนเงินจีน", padX, 50);
    ctx.font = `18px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(`พิมพ์เมื่อ ${printedLabel}`, padX, 90);

    // วาดค่าแบบย่อฟอนต์อัตโนมัติให้พอดี (กันข้อความยาวล้นขอบ)
    const drawValueFit = (text: string, baseSize: number, bold: boolean, color: string, yy: number, leftBound: number) => {
      const maxW = (W - padX) - leftBound;
      let size = baseSize;
      ctx.fillStyle = color; ctx.textAlign = "right";
      do { ctx.font = `${bold ? "bold " : ""}${size}px ${FONT}`; if (ctx.measureText(text).width <= maxW) break; size -= 1; } while (size > 11);
      ctx.fillText(text, W - padX, yy);
    };

    // body
    let y = headerH + padTop + rowH / 2;
    for (const ln of lines) {
      if (ln.sep) {
        ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(W - padX, y); ctx.stroke();
        y += rowH; continue;
      }
      // label
      ctx.textAlign = "left"; ctx.fillStyle = "#64748b"; ctx.font = `${LABEL_SIZE}px ${FONT}`;
      const labelW = ln.l ? ctx.measureText(ln.l).width : 0;
      if (ln.l) ctx.fillText(ln.l, padX, y);
      // value (ย่อให้พอดี โดยเว้นพื้นที่ label + ช่องว่าง 16)
      drawValueFit(ln.r, ln.big ? BIG_SIZE : VAL_SIZE, !!ln.bold, ln.color ?? "#1e293b", y, padX + labelW + 16);
      y += rowH;
    }
  }, [sup, supName, amount, fee, totalRmb, rate, thb, bill, printedLabel]);

  const filename = `china-bill-${supName}-${String(bill.transfer_date ?? today())}.png`.replace(/[\\/:*?"<>|]/g, "_");

  const markPrinted = async () => {
    const at = new Date().toISOString();
    try {
      await apiFetch(`/api/master-v2/china-bills/${String(bill.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printed_at: at, actor: "china-app" }),
      });
      onPrinted?.(String(bill.id), at);
    } catch { /* best-effort */ }
  };

  const getBlob = (): Promise<Blob | null> =>
    new Promise((resolve) => { const cv = canvasRef.current; if (!cv) return resolve(null); cv.toBlob(resolve, "image/png"); });

  const saveImage = async () => {
    setBusy(true);
    try {
      const blob = await getBlob(); if (!blob) { toast.error("สร้างรูปไม่สำเร็จ"); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("บันทึกรูปแล้ว"); await markPrinted();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  const shareImage = async () => {
    setBusy(true);
    try {
      const blob = await getBlob(); if (!blob) { toast.error("สร้างรูปไม่สำเร็จ"); return; }
      const file = new File([blob], filename, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: "ใบสรุปการโอนเงินจีน", text: `${supName} · ฿${fmt(thb)}` });
        await markPrinted();
      } else {
        toast.error("อุปกรณ์นี้แชร์รูปไม่ได้ — ใช้ปุ่มบันทึกรูปแทน"); await saveImage();
      }
    } catch (e) {
      // ผู้ใช้กดยกเลิกแชร์ ไม่ต้องแจ้ง error
      if ((e as Error).name !== "AbortError") toast.error(String((e as Error).message ?? e));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[210] bg-black/50 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <div className="font-semibold text-slate-800">ใบสรุป</div>
          <button onClick={onClose} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-lg leading-none">×</button>
        </div>
        <div className="p-4">
          {/* พรีวิว (HTML — responsive ไม่ถูกตัดบนมือถือ) */}
          <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
            <div className="bg-gradient-to-r from-orange-600 to-orange-500 text-white px-4 py-3">
              <div className="font-bold text-base">💸 ใบสรุปการโอนเงินจีน</div>
              <div className="text-[11px] opacity-90 mt-0.5">พิมพ์เมื่อ {printedLabel}</div>
            </div>
            <div className="p-4 text-sm space-y-2">
              <SlipRow l="ร้านค้า" r={supName} bold />
              {sup?.name_en ? <SlipRow l="" r={String(sup.name_en)} /> : null}
              <SlipRow l="ธนาคาร" r={sup?.bank_name_brief} />
              <SlipRow l="เลขบัญชี" r={sup?.account_number} />
              <SlipRow l="ชื่อบัญชี" r={sup?.bank_account_name} />
              <div className="border-t border-slate-100 my-1" />
              <SlipRow l="ยอด (¥)" r={fmt(amount)} />
              <SlipRow l="ค่าโอน (¥)" r={fmt(fee)} />
              <SlipRow l="ยอดโอนรวม" r={"¥" + fmt(totalRmb)} bold />
              <SlipRow l="เรท" r={rate ? fmt(rate) : "—"} />
              <div className="flex justify-between items-center gap-3">
                <span className="text-slate-500 flex-shrink-0">เป็นเงินบาท</span>
                <span className="text-2xl font-bold text-orange-600 text-right break-all">฿{fmt(thb)}</span>
              </div>
              <div className="border-t border-slate-100 my-1" />
              <SlipRow l="วันที่โอน" r={bill.transfer_date} />
              <SlipRow l="วันที่ลงบิล" r={bill.bill_date} />
              <SlipRow l="สถานะ" r={st} />
            </div>
          </div>
          {/* canvas ซ่อน — ใช้สร้างรูปตอนบันทึก/แชร์เท่านั้น */}
          <canvas ref={canvasRef} className="hidden" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={saveImage} disabled={busy}
              className="h-12 border border-slate-300 text-slate-700 rounded-xl font-medium disabled:opacity-50">💾 บันทึกรูป</button>
            <button onClick={shareImage} disabled={busy}
              className="h-12 bg-orange-600 text-white rounded-xl font-medium disabled:opacity-50">📤 แชร์ / ส่ง LINE</button>
          </div>
          <div className="mt-2 text-center text-[11px] text-slate-400">เมื่อบันทึก/แชร์ ระบบจะทำเครื่องหมาย “พิมพ์แล้ว” ให้</div>
        </div>
      </div>
    </div>
  );
}

// ---------------- ชิ้นเล็ก ----------------
function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm shadow-slate-200/60">{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-slate-500 mb-1">{children}</div>;
}
function Num({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="number" inputMode="decimal" step="any" value={value} placeholder={placeholder}
    onChange={e => onChange(e.target.value)} className="w-full h-11 px-3 text-base text-right border border-slate-200 rounded-lg" />;
}
// ช่องจำนวนเงิน — โชว์ลูกน้ำคั่นหลักพัน (เก็บค่าจริงไม่มีลูกน้ำ)
function Money({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const display = (() => {
    const s = String(value ?? "");
    if (s === "" || !/[0-9]/.test(s)) return s;
    const [i, ...d] = s.split(".");
    const intf = (i || "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return d.length ? `${intf}.${d.join("")}` : (s.endsWith(".") ? `${intf}.` : intf);
  })();
  const handle = (raw: string) => {
    let cleaned = raw.replace(/,/g, "").replace(/[^0-9.]/g, "");
    const p = cleaned.split(".");
    if (p.length > 2) cleaned = p[0] + "." + p.slice(1).join("");
    onChange(cleaned);
  };
  return <input type="text" inputMode="decimal" value={display} placeholder={placeholder}
    onChange={e => handle(e.target.value)} onFocus={e => e.currentTarget.select()}
    className={className ?? "w-full h-11 px-3 text-base text-right border border-slate-200 rounded-lg"} />;
}
function Row({ label, v }: { label: string; v: unknown }) {
  if (v == null || v === "") return null;
  return <div className="flex justify-between"><span className="text-slate-400">{label}</span><span className="text-slate-700">{String(v)}</span></div>;
}
function SlipRow({ l, r, bold }: { l: string; r: unknown; bold?: boolean }) {
  if (r == null || r === "") return null;
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500 flex-shrink-0">{l}</span>
      <span className={`text-right break-all ${bold ? "font-bold text-slate-900" : "text-slate-800"}`}>{String(r)}</span>
    </div>
  );
}
