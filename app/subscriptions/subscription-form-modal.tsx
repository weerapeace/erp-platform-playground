"use client";

/**
 * ป๊อปอัปเพิ่ม/แก้ไข subscription — ใช้ ERPModal กลาง + validation + เตือน unsaved changes
 *
 * จัดลำดับความสำคัญ (ตัวเด่น → ตัวจาง):
 *   1) หัว: โลโก้ (หาโลโก้ได้) + ชื่อตัวใหญ่ + หมวด/ประเภท + ปุ่มสถานะ
 *   2) กล่องค่าใช้จ่าย: ราคาตัวใหญ่ + สรุป ≈/เดือน + ต่ออายุอีกกี่วัน
 *   3) ผู้ใช้ในแพ็กนี้
 *   4) รายละเอียดเพิ่มเติม (พับไว้): กลุ่ม บัตร ชื่อในบิลบัตร ลิงก์บิล หมายเหตุ
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { AppLogo, LogoPicker } from "@/components/logo-picker";
import {
  CYCLE_LABEL, TYPE_LABEL, PRICE_MODE_LABEL, CURRENCY_SYMBOL, SUB_STATUSES, SUB_STATUS_BADGE,
  validateSubInput, subStatusLabel, nextRenewal, daysUntil,
  memberFromSub, normalizeMembers, membersTotal, memberLabel, newMemberId,
  type BillingCycle, type Currency, type SubInput, type SubType, type Subscription, type StreamingService,
  type SubMember, type PriceMode,
} from "@/lib/subscriptions";

const INP = "w-full h-10 px-3 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white";
const INP_SM = "h-7 px-2 text-xs border border-slate-200 rounded-md outline-none focus:border-indigo-400 bg-white text-slate-600";

const EMPTY: SubInput = {
  name: "", category: "", billing_cycle: "monthly", cost: 0, currency: "THB",
  billing_date: null, chrome_profile: "", chrome_profile_url: "", chrome_profile_dir: "", invoice_url: "",
  notes: "", active: true, type: "work", account_email: "", card_last4: "", card_statement_name: "",
  pending_cancel: false, want_to_buy: false, owner_id: null, streaming: [], group_name: "",
  members: [], price_mode: "total", logo_url: "",
};

function fromSub(s: Subscription): SubInput {
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = s;
  return { ...EMPTY, ...rest };
}

/** ผู้ใช้ในฟอร์ม: มี members ≥2 ใช้ตามนั้น · ไม่มี = คนเดียวจากช่องบนแถว */
function usersFromInput(f: SubInput): SubMember[] {
  const ms = normalizeMembers(f.members);
  return ms.length >= 2 ? ms : [memberFromSub(f)];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** แบ่งยอดรวมให้คนที่ใช้งานอยู่เท่า ๆ กัน (เศษสตางค์ไปคนสุดท้าย) — ใช้ตอนสลับเป็นแยกราคารายคน */
function splitEvenly(users: SubMember[], total: number): SubMember[] {
  const act = users.filter((u) => u.active);
  if (!act.length) return users;
  const each = round2(total / act.length);
  const lastId = act[act.length - 1].id;
  return users.map((u) => !u.active ? u : { ...u, price: u.id === lastId ? round2(total - each * (act.length - 1)) : each });
}

/** "2026-11-01" → "1 พ.ย. 69" */
function thaiShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

export function SubscriptionFormModal({ open, editing, categories, groups, saving, defaults, streamingServices, onQuickAddStreaming, onClose, onSave }: {
  open: boolean;
  editing: Subscription | null;
  categories: string[];
  /** ชื่อกลุ่มที่เคยใช้ (ไว้แนะนำใน datalist กันสะกดไม่ตรง) */
  groups?: string[];
  saving: boolean;
  defaults?: Partial<SubInput> | null;
  /** ถ้าส่งมา (ไม่ null) = โหมดส่วนตัว → โชว์ section เลือก streaming */
  streamingServices?: StreamingService[] | null;
  /** เพิ่ม streaming ใหม่เข้าคลัง (คืน service ที่สร้าง) — หน้าเรียก API เอง */
  onQuickAddStreaming?: (name: string) => Promise<StreamingService | null>;
  onClose: () => void;
  onSave: (input: SubInput) => void;
}) {
  const [form, setForm] = useState<SubInput>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newStreaming, setNewStreaming] = useState("");
  const [addingStreaming, setAddingStreaming] = useState(false);
  const [users, setUsers] = useState<SubMember[]>(() => usersFromInput(EMPTY));
  const [openUsers, setOpenUsers] = useState<Set<string>>(new Set());
  const [focusUserId, setFocusUserId] = useState<string | null>(null); // ผู้ใช้ที่เพิ่งเพิ่ม → โฟกัสช่องชื่อ
  const [showLogo, setShowLogo] = useState(false);   // แผงหาโลโก้
  const [showMore, setShowMore] = useState(false);   // รายละเอียดเพิ่มเติม (พับไว้)
  const multi = users.length >= 2;
  const perMember = multi && form.price_mode === "per_member";
  const activeUsers = users.filter((u) => u.active).length;
  const sym = CURRENCY_SYMBOL[form.currency] ?? "";
  const money = (n: number) => `${sym}${round2(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const set = <K extends keyof SubInput>(k: K, v: SubInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const patchUser = (id: string, patch: Partial<SubMember>) => {
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    setDirty(true);
  };
  const toggleUserOpen = (id: string) => setOpenUsers((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  /** เพิ่มผู้ใช้ใหม่ (copyFrom = คัดลอกโปรไฟล์/ลิงก์จากคนเดิม แต่ล้างชื่อ/อีเมล/โฟลเดอร์ให้ใส่ใหม่) */
  const addUser = (copyFrom?: SubMember) => {
    const u: SubMember = {
      id: newMemberId(), name: "", account_email: "", chrome_profile: "", chrome_profile_dir: "",
      chrome_profile_url: copyFrom?.chrome_profile_url ?? "", active: true, price: copyFrom?.price ?? 0,
    };
    setUsers((us) => [...us, u]);
    setOpenUsers(new Set([u.id]));
    setFocusUserId(u.id);
    setDirty(true);
  };
  const removeUser = (id: string) => {
    if (users.length <= 1) return;
    const rest = users.filter((u) => u.id !== id);
    // เหลือคนเดียวจากโหมดแยกรายคน → ราคาของรายการ = ราคาคนที่เหลือ
    if (rest.length === 1 && form.price_mode === "per_member") { set("cost", round2(rest[0].price)); set("price_mode", "total"); }
    setUsers(rest);
    setDirty(true);
  };
  const setPriceMode = (mode: PriceMode) => {
    if (mode === form.price_mode) return;
    if (mode === "per_member") {
      // สลับเป็นแยกรายคน → แบ่งยอดเดิมให้เท่า ๆ กัน (ยอดรวมไม่กระโดด)
      // ยกเว้นเคยตั้งราคารายคนไว้แล้วครบทุกคนและรวมได้เท่ายอดเดิม → คงไว้
      setUsers((us) => {
        const keep = round2(membersTotal(us)) === round2(form.cost) && us.every((u) => !u.active || u.price > 0);
        return keep ? us : splitEvenly(us, form.cost);
      });
    } else {
      set("cost", round2(membersTotal(users)));
    }
    set("price_mode", mode);
  };
  /** ปุ่มสถานะ → ตั้ง active/pending_cancel/want_to_buy พร้อมกัน (ชุดเดียวกับคอลัมน์บอร์ด) */
  const setStatus = (key: string) => {
    const s = SUB_STATUSES.find((x) => x.key === key);
    if (!s) return;
    setForm((f) => ({ ...f, ...s.patch }));
    setDirty(true);
  };

  const toggleStreaming = (id: string) => {
    setForm((f) => {
      const has = f.streaming.includes(id);
      return { ...f, streaming: has ? f.streaming.filter((x) => x !== id) : [...f.streaming, id] };
    });
    setDirty(true);
  };

  const quickAddStreaming = async () => {
    const name = newStreaming.trim();
    if (!name || !onQuickAddStreaming) return;
    setAddingStreaming(true);
    try {
      const svc = await onQuickAddStreaming(name);
      if (svc) { setForm((f) => ({ ...f, streaming: [...f.streaming, svc.id] })); setDirty(true); setNewStreaming(""); }
    } finally { setAddingStreaming(false); }
  };

  // เติมฟอร์มเมื่อเปิด
  useEffect(() => {
    if (open) {
      const f = editing ? fromSub(editing) : { ...EMPTY, ...(defaults ?? {}) };
      const us = usersFromInput(f);
      setForm(f); setUsers(us); setOpenUsers(new Set(us.length === 1 ? [us[0].id] : [])); setFocusUserId(null);
      setShowLogo(false); setShowMore(false);
      setDirty(false); setErr(null); setNewStreaming("");
    }
  }, [open, editing, defaults]);

  const submit = () => {
    // คนเดียว → เขียนกลับช่องบนแถว (members ว่าง) · หลายคน → ส่ง members (lib/toSubRow mirror คนแรกให้เอง)
    const first = users[0];
    const input: SubInput = multi
      ? { ...form, members: users, cost: perMember ? round2(membersTotal(users)) : form.cost }
      : {
          ...form, members: [], price_mode: "total",
          account_email: first.account_email, chrome_profile: first.chrome_profile,
          chrome_profile_dir: first.chrome_profile_dir, chrome_profile_url: first.chrome_profile_url,
        };
    const e = validateSubInput(input, true);
    if (e) { setErr(e); return; }
    setErr(null);
    onSave(input);
  };

  const catOptions = useMemo(() => Array.from(new Set(categories.filter(Boolean))).sort(), [categories]);
  const groupOptions = useMemo(() => Array.from(new Set((groups ?? []).filter(Boolean))).sort(), [groups]);

  const statusLabel = subStatusLabel(form);
  const renewal = nextRenewal(form);
  const renewDays = daysUntil(renewal);
  const totalCost = perMember ? membersTotal(users) : Number(form.cost) || 0;
  const perMonth = form.billing_cycle === "monthly" ? totalCost : form.billing_cycle === "yearly" ? totalCost / 12 : null;
  const moreFilled = [form.group_name, form.card_last4, form.card_statement_name, form.invoice_url, form.notes].filter((v) => String(v ?? "").trim()).length;

  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="subs-form"
      hasUnsavedChanges={dirty && !saving}
      title={editing ? "แก้ไขรายการ" : "เพิ่มรายการใหม่"}
      description="Subscription / บริการที่สมัครใช้งาน"
      footer={
        <>
          <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="h-9 px-5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}
          </button>
        </>
      }>
      <div className="space-y-4">
        {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {err}</div>}

        {/* ── 1) หัว: โลโก้ + ชื่อ + หมวด/ประเภท + สถานะ ── */}
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => setShowLogo((v) => !v)} title="เปลี่ยนโลโก้" className="rounded-xl hover:ring-2 hover:ring-indigo-200">
              <AppLogo src={form.logo_url} name={form.name || "?"} size={60} />
            </button>
            <button type="button" onClick={() => setShowLogo((v) => !v)}
              className={`h-6 px-2 text-[11px] rounded-md border transition ${showLogo ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              🔍 หาโลโก้
            </button>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="ชื่อรายการ เช่น Claude MAX, Adobe Photoshop" aria-label="ชื่อรายการ"
              className="w-full h-11 px-2 text-lg font-semibold text-slate-800 border border-transparent hover:border-slate-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 rounded-lg outline-none bg-white"
              autoFocus />
            <div className="flex flex-wrap items-center gap-1.5 px-1">
              <input value={form.category} onChange={(e) => set("category", e.target.value)} list="subs-cat-list" placeholder="หมวดหมู่" aria-label="หมวดหมู่"
                className={`${INP_SM} w-32`} />
              <datalist id="subs-cat-list">{catOptions.map((c) => <option key={c} value={c} />)}</datalist>
              <select value={form.type} onChange={(e) => set("type", e.target.value as SubType)} aria-label="ประเภท" className={INP_SM}>
                {(["work", "personal"] as SubType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
              {multi && <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">👥 {users.length} ผู้ใช้</span>}
            </div>
            <div className="flex flex-wrap gap-1.5 px-1" role="radiogroup" aria-label="สถานะ">
              {SUB_STATUSES.map((s) => {
                const on = s.label === statusLabel;
                return (
                  <button key={s.key} type="button" role="radio" aria-checked={on} onClick={() => setStatus(s.key)}
                    className={`h-7 px-3 text-xs rounded-full border transition ${on ? `${SUB_STATUS_BADGE[s.label]} border-current font-medium` : "border-slate-200 text-slate-500 bg-white hover:bg-slate-50"}`}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {showLogo && (
          <LogoPicker value={form.logo_url} name={form.name} url={form.invoice_url}
            onChange={(logo) => set("logo_url", logo)} />
        )}

        {/* ── 2) ค่าใช้จ่าย (เด่นรองจากหัว) ── */}
        <div className="rounded-xl border border-slate-300 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-700">🧾 ค่าใช้จ่าย</span>
            {multi && (
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden" aria-label={`วิธีคิดราคา (${users.length} ผู้ใช้)`}>
                {(["total", "per_member"] as PriceMode[]).map((m) => (
                  <button key={m} type="button" onClick={() => setPriceMode(m)}
                    className={`h-7 px-3 text-xs transition ${form.price_mode === m ? "bg-indigo-50 text-indigo-700 font-medium" : "bg-white text-slate-600 hover:bg-slate-50"} ${m === "per_member" ? "border-l border-slate-200" : ""}`}>
                    {PRICE_MODE_LABEL[m]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-[1.4fr_0.8fr_1fr_1.1fr] gap-3 items-end">
            <Field label={perMember ? "ราคารวม (บวกจากรายคน)" : multi ? "ราคารวมทั้งแพ็ก" : "ราคา"} required className="col-span-2 md:col-span-1">
              {perMember ? (
                <div className="w-full h-11 px-3 flex items-center text-xl font-semibold tabular-nums text-slate-800 bg-slate-50 border border-slate-200 rounded-lg">{money(totalCost)}</div>
              ) : (
                <input type="number" step="0.01" min="0" value={form.cost}
                  onChange={(e) => set("cost", e.target.value === "" ? 0 : Number(e.target.value))}
                  className="w-full h-11 px-3 text-xl font-semibold tabular-nums text-slate-800 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white" />
              )}
            </Field>
            <Field label="สกุลเงิน">
              <select value={form.currency} onChange={(e) => set("currency", e.target.value as Currency)} className={`${INP} h-11`}>
                {(["THB", "USD", "EUR"] as Currency[]).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="รอบบิล">
              <select value={form.billing_cycle} onChange={(e) => set("billing_cycle", e.target.value as BillingCycle)} className={`${INP} h-11`}>
                {(["monthly", "yearly", "one-time"] as BillingCycle[]).map((c) => <option key={c} value={c}>{CYCLE_LABEL[c]}</option>)}
              </select>
            </Field>
            <Field label={form.billing_cycle === "one-time" ? "วันที่ซื้อ/ครบกำหนด" : "วันต่ออายุ"}>
              <input type="date" value={form.billing_date ?? ""} onChange={(e) => set("billing_date", e.target.value || null)} className={`${INP} h-11`} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {perMonth !== null && (
              <span className="text-slate-500">≈ <b className="font-semibold text-slate-800 tabular-nums">{money(perMonth)}</b> / เดือน</span>
            )}
            {multi && (
              <span className="text-slate-500">
                {perMember
                  ? `รวมเฉพาะคนที่ใช้งานอยู่ ${activeUsers} คน — แก้ราคาที่ผู้ใช้แต่ละคน`
                  : activeUsers ? `ตกคนละ ${money(totalCost / activeUsers)} (${activeUsers} คนที่ใช้งาน)` : "ยังไม่มีผู้ใช้ที่เปิดใช้งาน"}
              </span>
            )}
            {form.billing_cycle !== "one-time" && (
              renewal && renewDays !== null
                ? <span className={renewDays <= 7 ? "text-amber-600" : "text-slate-500"}>⏰ ต่ออายุ{renewDays === 0 ? "วันนี้" : `อีก ${renewDays} วัน`} ({thaiShortDate(renewal)})</span>
                : <span className="text-slate-400">ยังไม่ใส่วันต่ออายุ — จะไม่มีแจ้งเตือน</span>
            )}
          </div>
        </div>

        {/* ── 3) ผู้ใช้ในแพ็กนี้ ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            👥 ผู้ใช้ในแพ็กนี้
            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-medium">{users.length}</span>
          </div>
          {users.map((u, i) => {
            const isOpen = openUsers.has(u.id);
            const label = multi ? (u.name || u.account_email || `ผู้ใช้คนที่ ${i + 1}`) : (u.account_email || "ผู้ใช้หลัก");
            return (
              <div key={u.id} className="rounded-lg border border-slate-200 bg-white">
                <button type="button" onClick={() => toggleUserOpen(u.id)} className="w-full flex items-center gap-3 px-3 py-2 text-left">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium flex items-center justify-center">
                    {(memberLabel(u).trim()[0] ?? "?").toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800 truncate">
                      {label}
                      {multi && i === 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-normal">คนหลัก</span>}
                    </span>
                    <span className="block text-[11px] text-slate-400 truncate">
                      {[multi && u.name ? u.account_email : "", u.chrome_profile, u.chrome_profile_dir].filter(Boolean).join(" · ") || "ยังไม่ใส่อีเมล/โปรไฟล์"}
                    </span>
                  </span>
                  {perMember && <span className="text-sm tabular-nums text-slate-700">{money(u.price)}</span>}
                  {multi && (
                    <span className={`text-[11px] px-2 py-0.5 rounded ${u.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{u.active ? "ใช้งาน" : "ปิด"}</span>
                  )}
                  <span className={`text-slate-400 text-xs transition ${isOpen ? "rotate-180" : ""}`}>▾</span>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 px-3 pt-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                    {multi && (
                      <Field label="ชื่อผู้ใช้ (ไว้เรียก)">
                        <input value={u.name} onChange={(e) => patchUser(u.id, { name: e.target.value })} placeholder="เช่น Gogo, ทีมกราฟิก" className={INP}
                          autoFocus={u.id === focusUserId} />
                      </Field>
                    )}
                    <Field label="อีเมลบัญชี">
                      <input value={u.account_email} onChange={(e) => patchUser(u.id, { account_email: e.target.value })} placeholder="อีเมลที่ใช้สมัคร" className={INP} />
                    </Field>
                    {perMember && (
                      <Field label={`ราคาของคนนี้ (${form.currency})`}>
                        <input type="number" step="0.01" min="0" value={u.price}
                          onChange={(e) => patchUser(u.id, { price: e.target.value === "" ? 0 : Number(e.target.value) })} className={`${INP} tabular-nums`} />
                      </Field>
                    )}
                    <Field label="โปรไฟล์ Chrome (ชื่อเล่น)">
                      <input value={u.chrome_profile} onChange={(e) => patchUser(u.id, { chrome_profile: e.target.value })} className={INP} />
                    </Field>
                    <Field label="โฟลเดอร์โปรไฟล์ Chrome (สำหรับปุ่มเปิด Chrome)">
                      <input value={u.chrome_profile_dir} onChange={(e) => patchUser(u.id, { chrome_profile_dir: e.target.value })} placeholder="เช่น Profile 3, Default" className={INP} />
                      <span className="mt-1 block text-[11px] text-slate-400">ดูได้ที่ Chrome → เปิดโปรไฟล์นั้น → พิมพ์ chrome://version ที่ช่อง URL → ดูบรรทัด &quot;Profile Path&quot; (ท้ายสุดคือชื่อโฟลเดอร์)</span>
                    </Field>
                    <Field label="ลิงก์โปรไฟล์ Chrome">
                      <input value={u.chrome_profile_url} onChange={(e) => patchUser(u.id, { chrome_profile_url: e.target.value })} placeholder="https://…" className={INP} />
                    </Field>
                    <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2">
                      {multi ? <Check label="ผู้ใช้นี้ยังใช้งานอยู่" checked={u.active} onChange={(v) => patchUser(u.id, { active: v })} /> : <span />}
                      <span className="flex gap-1.5">
                        <button type="button" onClick={() => addUser(u)} className="h-8 px-3 text-xs border border-slate-200 rounded-lg hover:bg-slate-50">⧉ คัดลอกเป็นคนใหม่</button>
                        {multi && (
                          <button type="button" onClick={() => removeUser(u.id)} className="h-8 px-3 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50">เอาออก</button>
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" onClick={() => addUser()}
            className="w-full h-9 text-sm text-indigo-700 border border-dashed border-indigo-200 rounded-lg hover:bg-indigo-50/50">
            ＋ เพิ่มผู้ใช้อีกคน
          </button>
          {multi && (
            <p className="text-[11px] text-slate-400">บิลเดียวหลายผู้ใช้ · ปุ่มเปิด Chrome / หาในเมล / บิลขาด ใช้ข้อมูลของ &quot;คนหลัก&quot; (คนแรก)</p>
          )}
        </div>

        {/* Streaming ที่ได้ (เฉพาะโหมดส่วนตัว = ส่ง streamingServices มา) */}
        {streamingServices && (
          <div className="rounded-lg bg-violet-50/60 border border-violet-100 px-3 py-2.5 space-y-2">
            <div className="text-xs font-medium text-violet-700">📺 Streaming ที่ได้จากรายการนี้</div>
            {streamingServices.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {streamingServices.map((s) => {
                  const on = form.streaming.includes(s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => toggleStreaming(s.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${on ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                      {on ? "✓ " : ""}{s.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">ยังไม่มีบริการในคลัง — เพิ่มด้านล่าง หรือที่มุมมอง 📺 Streaming</p>
            )}
            {onQuickAddStreaming && (
              <div className="flex items-center gap-1.5">
                <input value={newStreaming} onChange={(e) => setNewStreaming(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); quickAddStreaming(); } }}
                  placeholder="เพิ่มบริการใหม่ เช่น iQIYI, WeTV, Netflix"
                  className="flex-1 h-8 px-2.5 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-violet-400" />
                <button type="button" onClick={quickAddStreaming} disabled={!newStreaming.trim() || addingStreaming}
                  className="h-8 px-3 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
                  {addingStreaming ? "…" : "＋ เพิ่ม"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── 4) รายละเอียดเพิ่มเติม (จาง + พับไว้) ── */}
        <div>
          <button type="button" onClick={() => setShowMore((v) => !v)}
            className="w-full flex items-center justify-between gap-2 h-9 px-3 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">
            <span className="truncate">
              ⚙ รายละเอียดเพิ่มเติม
              <span className="text-slate-400"> · กลุ่ม บัตร ชื่อในบิลบัตร ลิงก์บิล หมายเหตุ{moreFilled ? ` (กรอกแล้ว ${moreFilled})` : ""}</span>
            </span>
            <span className={`text-xs transition ${showMore ? "rotate-180" : ""}`}>▾</span>
          </button>
          {showMore && (
            <div className="mt-2 rounded-lg bg-slate-50 border border-slate-100 p-3 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
              <Field label="ชื่อกลุ่มบนบอร์ด (รวมหลายรายการเป็นการ์ดเดียว)" className="md:col-span-2" muted>
                <input value={form.group_name} onChange={(e) => set("group_name", e.target.value)} list="subs-group-list"
                  placeholder="เช่น Adobe — เว้นว่างถ้าไม่ต้องรวม" className={`${INP} h-9`} />
                <datalist id="subs-group-list">{groupOptions.map((g) => <option key={g} value={g} />)}</datalist>
              </Field>
              <Field label="บัตร 4 ตัวท้าย" muted>
                <input value={form.card_last4} onChange={(e) => set("card_last4", e.target.value)} placeholder="เช่น 1234" maxLength={4} className={`${INP} h-9`} />
              </Field>
              <Field label="ชื่อในบิลบัตรเครดิต (ไว้เทียบสเตทเมนต์)" muted>
                <input value={form.card_statement_name} onChange={(e) => set("card_statement_name", e.target.value)} placeholder="เช่น ADOBE *PHOTOSHOP, GOOGLE *Cloud" className={`${INP} h-9`} />
              </Field>
              <Field label="ลิงก์หน้าใบเสร็จ/บิล" className="md:col-span-2" muted>
                <input value={form.invoice_url} onChange={(e) => set("invoice_url", e.target.value)} placeholder="https://…" className={`${INP} h-9`} />
              </Field>
              <Field label="หมายเหตุ" className="md:col-span-2" muted>
                <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={`${INP} h-auto py-2 resize-none`} />
              </Field>
            </div>
          )}
        </div>
      </div>
    </ERPModal>
  );
}

function Field({ label, required, className, muted, children }: { label: string; required?: boolean; className?: string; muted?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className={`block mb-1 ${muted ? "text-[11px] text-slate-400" : "text-xs font-medium text-slate-600"}`}>{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
      {label}
    </label>
  );
}
