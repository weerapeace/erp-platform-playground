"use client";

/**
 * ⭐ แต้ม/ระดับสมาชิก ฝั่ง ERP (ใช้ในแท็บ 👥 สมาชิก)
 *   MemberPointsModal = ประวัติแต้มของสมาชิก 1 คน + ร้านปรับแต้มเอง (ต้องมีเหตุผล · audit ฝั่ง API)
 *   MemberTiersModal  = ตั้งระดับสมาชิกของร้าน (ชื่อ · ยอดซื้อ 12 เดือนขั้นต่ำ · ตัวคูณแต้ม · สี)
 * ของกลาง: ERPModal · MoneyInput · ColorInput · กฎตรวจ lib/member-points (sanitizeTiers) ใช้ร่วมกับ API
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { ColorInput } from "@/components/color-picker";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { sanitizeTiers, SUGGESTED_TIERS, type MemberTier } from "@/lib/member-points";

type LedgerEntry = { id: string; delta: number; kind: string; label: string; note: string; orderNo: string | null; createdAt: string };

const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const pts = (n: number) => n.toLocaleString("th-TH");

export function MemberPointsModal({ member, onClose, onChanged }: { member: { id: string; name: string } | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<{ balance: number; history: LedgerEntry[] } | null>(null);
  const [mode, setMode] = useState<"add" | "sub">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!member) return;
    setData(null);
    setAmount("");
    setNote("");
    apiFetch(`/api/website/members/points?id=${encodeURIComponent(member.id)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? toast.error(j.error) : setData(j)))
      .catch(() => toast.error("โหลดประวัติแต้มไม่สำเร็จ"));
  }, [member, toast]);

  const n = Math.floor(Number(amount.replace(/,/g, "")) || 0);
  // เรียงจากเรื่องที่ต้องแก้ก่อน: จำนวน → หักเกินที่มี → เหตุผล
  const problem = !n ? "ใส่จำนวนแต้ม" : mode === "sub" && data && n > data.balance ? `หักได้ไม่เกิน ${pts(data.balance)} แต้ม` : note.trim().length < 3 ? "ใส่เหตุผล (อย่างน้อย 3 ตัวอักษร)" : null;

  const save = async () => {
    if (!member || problem) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/website/members/points", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: member.id, delta: mode === "add" ? n : -n, note }) });
      const j = await r.json();
      if (!j.ok) toast.error(j.error ?? "ปรับแต้มไม่สำเร็จ");
      else {
        toast.success(`${mode === "add" ? "เพิ่ม" : "หัก"} ${pts(n)} แต้มแล้ว · คงเหลือ ${pts(j.balance)} แต้ม`);
        onChanged();
        onClose();
      }
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ERPModal
      open={!!member}
      onClose={onClose}
      title={`⭐ แต้มของ ${member?.name ?? ""}`}
      description="ได้แต้มเมื่อออเดอร์ “สำเร็จ” · ใช้แต้มลดราคาตอนสั่ง · ร้านปรับเองได้ (บันทึกประวัติว่าใครปรับ)"
      size="md"
      defaultExpanded={false}
      hasUnsavedChanges={!!amount || !!note}
      loading={busy}
      footer={
        <div className="flex items-center justify-end gap-2">
          {problem && (amount || note) && <span className="mr-auto text-xs text-amber-700">{problem}</span>}
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg border border-slate-200 text-sm">ปิด</button>
          <button type="button" disabled={!!problem || busy} onClick={() => void save()} className="h-9 px-4 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-40">
            {mode === "add" ? "เพิ่มแต้ม" : "หักแต้ม"}
          </button>
        </div>
      }
    >
      {!data ? (
        <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</div>
      ) : (
        <div className="space-y-4" data-member-points>
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <div className="text-xs text-amber-700">แต้มคงเหลือ</div>
            <div className="text-2xl font-semibold text-amber-900 tabular-nums" data-balance>{pts(data.balance)} แต้ม</div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="text-sm font-medium text-slate-800">ปรับแต้ม</div>
            <div className="flex gap-2">
              {(["add", "sub"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={`h-8 px-3 rounded-lg text-sm border ${mode === m ? (m === "add" ? "bg-emerald-600 border-emerald-600 text-white" : "bg-red-600 border-red-600 text-white") : "border-slate-200 text-slate-600"}`}>
                  {m === "add" ? "＋ เพิ่ม" : "－ หัก"}
                </button>
              ))}
              <MoneyInput value={amount} onChange={setAmount} placeholder="จำนวนแต้ม" className="h-8 w-32 px-2 rounded-lg border border-slate-200 text-sm text-right" />
            </div>
            <input aria-label="เหตุผลที่ปรับแต้ม" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="เหตุผล เช่น ชดเชยของชำรุด / แก้แต้มที่คิดผิด" className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm" />
          </div>

          <div>
            <div className="text-sm font-medium text-slate-800 mb-1">ประวัติแต้ม</div>
            {!data.history.length ? (
              <p className="text-xs text-slate-400 py-3">ยังไม่มีรายการ</p>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg max-h-72 overflow-auto">
                {data.history.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block text-slate-800">
                        {h.label}
                        {h.orderNo && <span className="text-slate-400"> · {h.orderNo}</span>}
                      </span>
                      <span className="block text-[11px] text-slate-400 truncate">
                        {when(h.createdAt)}
                        {h.kind === "adjust" && h.note && ` · ${h.note}`}
                      </span>
                    </span>
                    <span className={`tabular-nums font-medium ${h.delta > 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {h.delta > 0 ? "+" : ""}
                      {pts(h.delta)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </ERPModal>
  );
}

type TierDraft = { key: string; name: string; minSpend: string; earnMultiplier: string; color: string; discountPct: string; freeShipping: boolean };
const toDraft = (t: MemberTier): TierDraft => ({ key: t.key, name: t.name, minSpend: String(t.minSpend), earnMultiplier: String(t.earnMultiplier), color: t.color, discountPct: t.discountPct ? String(t.discountPct) : "", freeShipping: t.freeShipping === true });
const fromDraft = (d: TierDraft) => ({ key: d.key || undefined, name: d.name, minSpend: Number(d.minSpend.replace(/,/g, "")), earnMultiplier: Number(d.earnMultiplier), color: d.color, discountPct: d.discountPct.trim() === "" ? 0 : Number(d.discountPct), freeShipping: d.freeShipping });

export function MemberTiersModal({ open, shopSlug, onClose, onSaved }: { open: boolean; shopSlug: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<TierDraft[] | null>(null);
  const [orig, setOrig] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRows(null);
    apiFetch(`/api/website/members/tiers?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) return toast.error(j.error);
        const d = ((j.tiers ?? []) as MemberTier[]).map(toDraft);
        setRows(d);
        setOrig(JSON.stringify(d));
      })
      .catch(() => toast.error("โหลดระดับไม่สำเร็จ"));
  }, [open, shopSlug, toast]);

  const check = useMemo(() => (rows ? sanitizeTiers(rows.map(fromDraft)) : null), [rows]);
  const dirty = !!rows && JSON.stringify(rows) !== orig;
  const set = (i: number, patch: Partial<TierDraft>) => setRows((r) => (r ? r.map((x, j) => (j === i ? { ...x, ...patch } : x)) : r));

  const save = async () => {
    if (!rows || !check?.ok) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/website/members/tiers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop: shopSlug, tiers: rows.map(fromDraft) }) });
      const j = await r.json();
      if (!j.ok) toast.error(j.error ?? "บันทึกไม่สำเร็จ");
      else {
        toast.success(rows.length ? `บันทึก ${rows.length} ระดับแล้ว` : "ปิดระดับสมาชิกแล้ว (ทุกคนได้แต้มเท่ากัน)");
        onSaved();
        onClose();
      }
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title="⭐ ระดับสมาชิก"
      description="คิดจากยอดซื้อ 12 เดือนล่าสุด (ออเดอร์สำเร็จ ไม่รวมค่าส่ง) · ถึงยอดไหนได้ระดับนั้น · ระดับสูงได้แต้มคูณ"
      size="lg"
      defaultExpanded={false}
      hasUnsavedChanges={dirty}
      loading={busy}
      footer={
        <div className="flex items-center justify-end gap-2">
          {check && !check.ok && <span className="mr-auto text-xs text-red-600">{check.error}</span>}
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg border border-slate-200 text-sm">ยกเลิก</button>
          <button type="button" disabled={!dirty || !check?.ok || busy} onClick={() => void save()} className="h-9 px-4 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-40">
            บันทึก
          </button>
        </div>
      }
    >
      {!rows ? (
        <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</div>
      ) : (
        <div className="space-y-3" data-tier-editor>
          {!rows.length && (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center">
              <p className="text-sm text-slate-600">ยังไม่มีระดับ — สมาชิกทุกคนได้แต้มเท่ากัน</p>
              <button type="button" onClick={() => setRows(SUGGESTED_TIERS.map(toDraft))} className="mt-2 h-8 px-3 rounded-lg bg-amber-500 text-white text-sm">
                ใช้ระดับแนะนำ (Member · Silver ฿5,000 · Gold ฿15,000)
              </button>
            </div>
          )}
          {rows.length > 0 && (
            <div className="grid grid-cols-[2.5rem_minmax(7rem,1fr)_8rem_4.5rem_4.5rem_3.5rem_2rem] gap-2 items-center text-[11px] text-slate-500">
              <span>สี</span>
              <span>ชื่อระดับ</span>
              <span className="text-right">ยอดซื้อ 12 เดือน ≥ (฿)</span>
              <span className="text-right">ได้แต้ม ×</span>
              <span className="text-right" title="ลด % ทุกออเดอร์ (จากยอดหลังโปร ก่อนคูปอง)">🎁 ลด %</span>
              <span className="text-center">ส่งฟรี</span>
              <span />
            </div>
          )}
          {rows.map((t, i) => (
            <div key={i} className="grid grid-cols-[2.5rem_minmax(7rem,1fr)_8rem_4.5rem_4.5rem_3.5rem_2rem] gap-2 items-center" data-tier-row>
              <ColorInput value={t.color} onChange={(c) => set(i, { color: c })} allowText={false} />
              <input aria-label="ชื่อระดับ" value={t.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={30} placeholder="ชื่อระดับ เช่น Gold" className="h-9 px-3 rounded-lg border border-slate-200 text-sm" />
              <MoneyInput value={t.minSpend} onChange={(v) => set(i, { minSpend: v })} placeholder="0" title="ยอดซื้อ 12 เดือนขั้นต่ำ (บาท)" className="h-9 w-full px-2 rounded-lg border border-slate-200 text-sm text-right" />
              <input aria-label="ตัวคูณแต้ม" type="number" step="0.1" min={1} max={10} value={t.earnMultiplier} onChange={(e) => set(i, { earnMultiplier: e.target.value })} className="h-9 w-full px-2 rounded-lg border border-slate-200 text-sm text-right" />
              <input aria-label="ส่วนลดสมาชิก %" type="number" step="1" min={0} max={50} value={t.discountPct} placeholder="0" onChange={(e) => set(i, { discountPct: e.target.value })} className="h-9 w-full px-2 rounded-lg border border-slate-200 text-sm text-right" />
              <label className="flex justify-center"><input aria-label="ส่งฟรี" type="checkbox" checked={t.freeShipping} onChange={(e) => set(i, { freeShipping: e.target.checked })} className="w-4 h-4 accent-amber-500" /></label>
              <button type="button" aria-label={`ลบระดับ ${t.name}`} onClick={() => setRows((r) => (r ? r.filter((_, j) => j !== i) : r))} className="h-8 w-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">
                ✕
              </button>
            </div>
          ))}
          {rows.length > 0 && rows.length < 10 && (
            <button type="button" onClick={() => setRows((r) => [...(r ?? []), { key: "", name: "", minSpend: "", earnMultiplier: "1", color: "#9CA3AF", discountPct: "", freeShipping: false }])} className="h-8 px-3 rounded-lg border border-dashed border-slate-300 text-sm text-slate-600">
              ＋ เพิ่มระดับ
            </button>
          )}
          <p className="text-[11px] text-slate-400">ควรมีระดับที่ยอด ฿0 (ระดับเริ่มต้น) · เปลี่ยนระดับแล้วมีผลกับแต้มของออเดอร์ที่สำเร็จหลังจากนี้ (แต้มที่ได้ไปแล้วไม่เปลี่ยน)</p>
          <p className="text-[11px] text-slate-400">🎁 สิทธิ์ (ลด % / ส่งฟรี) ใช้กับออเดอร์ใหม่ของสมาชิกที่ล็อกอินสั่ง ขณะเปิดระบบแต้ม · ลดจากยอดหลังโปรโมชัน ก่อนคูปอง · ใบออเดอร์มีบรรทัด "สิทธิ์สมาชิก …"</p>
        </div>
      )}
    </ERPModal>
  );
}
