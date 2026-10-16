"use client";
/**
 * ✏️ แก้หลายรายการ (หน้า "สินค้าบนเว็บ" → แถบล่างตอนติ๊กหลายรุ่น)
 * ช่องทั้งหมดวาดจากทะเบียนกลาง lib/website-listing-fields (BULK_FIELDS) — ไม่ฝังช่องไว้ในหน้าจอ
 * ตัวแก้ต่อชนิด: choice · price (ตั้ง/ล้าง) · categories (เพิ่ม/เอาออก/แทนทั้งชุด + ป๊อปเลือกหมวด) · badge (รายการป้ายของร้าน) · text · clear
 * กันพลาด (CLAUDE.md §18): บอกจำนวนที่กระทบ · ช่องที่จะเปลี่ยน · เกิน 20 รุ่นพิมพ์ CONFIRM · ตรวจค่าก่อนส่ง · audit (ฝั่ง API) · สรุปสำเร็จ/ไม่สำเร็จ
 * API: POST /api/website/listings action bulk (patch เดียวกันทุกรุ่น) + setCategories (หมวดคิดต่อรุ่น)
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { FieldChipsPicker } from "@/components/field-chips-picker";
import { CardBadgeSelect } from "@/components/website-card-badges";
import { BULK_FIELDS, applyCategoriesOp, massEditPlan, type CategoriesOp, type ListingFieldKey, type MassEditValues, type PriceOp } from "@/lib/website-listing-fields";

type Row = { parentId: string; categories: string[] };
const CONFIRM_OVER = 20;
const inputCls = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-orange-400 bg-white";
const seg = (on: boolean) => `px-2.5 py-1 text-xs rounded-md border ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;

export function WebsiteListingsMassEdit({
  open,
  onClose,
  shopId,
  rows,
  shopCategories,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  /** รุ่นที่ติ๊กไว้ (หมวดปัจจุบันไว้คิดเพิ่ม/เอาออกต่อรุ่น) */
  rows: Row[];
  shopCategories: { key: string; label: string; icon?: string }[];
  onDone: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [on, setOn] = useState<Set<ListingFieldKey>>(new Set());
  const [vals, setVals] = useState<MassEditValues>({});
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setOn(new Set());
    setVals({ published: "on", featured: "on", price: { mode: "set" }, categories: { mode: "add", keys: [] }, badge: "", stockStatus: "in", unit: "", name: true, description: true });
    setTyped("");
    setErr(null);
    setResult(null);
  }, [open]);

  const n = rows.length;
  const needConfirm = n > CONFIRM_OVER;
  const toggle = (k: ListingFieldKey) =>
    setOn((s) => {
      const x = new Set(s);
      if (x.has(k)) x.delete(k);
      else x.add(k);
      return x;
    });
  const setV = <K extends keyof MassEditValues>(k: K, v: MassEditValues[K]) => {
    setErr(null);
    setVals((o) => ({ ...o, [k]: v }));
  };
  const picked = (): MassEditValues => Object.fromEntries([...on].map((k) => [k, vals[k]])) as MassEditValues;

  const apply = async () => {
    const plan = massEditPlan(picked());
    if (!plan.ok) return setErr(plan.error);
    if (needConfirm && typed !== "CONFIRM") return setErr("พิมพ์ CONFIRM เพื่อยืนยันแก้จำนวนมาก");
    setBusy(true);
    let ok = 0;
    let failed = 0;
    const post = async (body: Record<string, unknown>) => (await apiFetch("/api/website/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
    try {
      const ids = rows.map((r) => r.parentId);
      if (Object.keys(plan.patch).length) {
        const j = await post({ shopId, action: "bulk", parentIds: ids, patch: plan.patch });
        if (!j.ok) throw new Error(j.error ?? "บันทึกไม่สำเร็จ");
        ok = j.count ?? ids.length;
        failed = j.failed ?? 0;
      }
      if (plan.categories) {
        const op = plan.categories;
        const items = rows.map((r) => ({ parentId: r.parentId, categories: applyCategoriesOp(r.categories, op) }));
        const j = await post({ shopId, action: "setCategories", items, category: `mass:${op.mode}:${op.keys.join(",")}` });
        if (!Object.keys(plan.patch).length) ok = j.ok ? j.count ?? items.length : 0;
        if (!j.ok) {
          const m = String(j.error ?? "").match(/(\d+)\/(\d+)/);
          failed = Math.max(failed, m ? Number(m[2]) - Number(m[1]) : items.length);
          if (!m) throw new Error(j.error ?? "จัดหมวดไม่สำเร็จ");
        }
      }
      setResult({ ok, failed });
      if (failed) toast.error(`แก้ไม่สำเร็จ ${failed} รุ่น — ลองอีกครั้ง`);
      else toast.success(`แก้ ${ok} รุ่นแล้ว`);
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const editor = (k: ListingFieldKey) => {
    const f = BULK_FIELDS.find((x) => x.key === k)!;
    switch (f.kind) {
      case "choice":
        return (
          <div className="flex flex-wrap gap-1.5">
            {f.choices!.map((c) => (
              <button key={c.value} type="button" className={seg(vals[k] === c.value)} onClick={() => setV(k as "published", c.value)}>
                {c.label}
              </button>
            ))}
          </div>
        );
      case "price": {
        const p = (vals.price ?? { mode: "set" }) as PriceOp;
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={seg(p.mode === "set")} onClick={() => setV("price", { ...p, mode: "set" })}>
              ตั้งราคา
            </button>
            <button type="button" className={seg(p.mode === "clear")} onClick={() => setV("price", { mode: "clear" })}>
              ล้าง (ใช้ราคา ERP)
            </button>
            {p.mode === "set" && <input type="number" min={1} value={p.value ?? ""} onChange={(e) => setV("price", { mode: "set", value: Number(e.target.value) || undefined })} placeholder="890" className={`${inputCls} w-28`} />}
          </div>
        );
      }
      case "categories": {
        const c = (vals.categories ?? { mode: "add", keys: [] }) as CategoriesOp;
        return (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["add", "เพิ่มหมวด"],
                  ["remove", "เอาหมวดออก"],
                  ["replace", "แทนทั้งชุด"],
                ] as const
              ).map(([m, l]) => (
                <button key={m} type="button" className={seg(c.mode === m)} onClick={() => setV("categories", { ...c, mode: m })}>
                  {l}
                </button>
              ))}
            </div>
            <FieldChipsPicker
              value={c.keys}
              onChange={(keys) => setV("categories", { ...c, keys })}
              fields={shopCategories.map((x) => ({ key: x.key, label: x.label, icon: x.icon || undefined }))}
              title="เลือกหมวด"
              description={c.mode === "replace" ? "ทุกรุ่นที่เลือกจะอยู่เฉพาะหมวดเหล่านี้ · ★ = หมวดหลัก" : c.mode === "add" ? "เพิ่มต่อท้ายหมวดเดิมของแต่ละรุ่น (หมวดหลักเดิมไม่เปลี่ยน)" : "เอาหมวดเหล่านี้ออกจากทุกรุ่นที่เลือก"}
              addLabel="＋ เลือกหมวด"
              searchPlaceholder="ค้นหาหมวด…"
              unit="หมวด"
              showKeys={false}
              markFirst={c.mode === "replace" ? "หมวดหลัก" : undefined}
              compact
            />
          </div>
        );
      }
      case "badge":
        return <CardBadgeSelect shopId={shopId} value={String(vals.badge ?? "")} onChange={(v) => setV("badge", v)} />;
      case "text":
        return <input value={String(vals[k as "unit"] ?? "")} onChange={(e) => setV(k as "unit", e.target.value)} placeholder={f.hint} className={inputCls} />;
      case "clear":
        return <span className="text-xs text-slate-500">{f.hint}</span>;
    }
  };

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={`✏️ แก้หลายรายการ — ${n} รุ่น`}
      description="ติ๊กช่องที่จะเปลี่ยน · ช่องที่ไม่ติ๊ก = ไม่แตะ · ทุกการแก้ถูกบันทึกประวัติว่าใครแก้"
      size="lg"
      hasUnsavedChanges={on.size > 0 && !result}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[12rem] text-xs">
            {err ? (
              <span className="text-rose-600">{err}</span>
            ) : result ? (
              <span className={result.failed ? "text-amber-700" : "text-emerald-700"}>
                สำเร็จ {result.ok} รุ่น{result.failed ? ` · ไม่สำเร็จ ${result.failed} รุ่น` : ""}
              </span>
            ) : (
              <span className="text-slate-500">{on.size ? `จะเปลี่ยน ${on.size} ช่อง × ${n} รุ่น` : "ยังไม่ได้ติ๊กช่องที่จะแก้"}</span>
            )}
          </div>
          {needConfirm && !result && (
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="พิมพ์ CONFIRM" className="h-9 w-36 rounded-lg border border-rose-300 px-2 text-sm font-mono" />
          )}
          {result ? (
            <button type="button" onClick={onClose} className="h-9 rounded-lg bg-slate-800 px-4 text-sm text-white">
              ปิด
            </button>
          ) : (
            <button type="button" onClick={() => void apply()} disabled={!on.size || busy || (needConfirm && typed !== "CONFIRM")} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
              {busy ? "กำลังบันทึก…" : on.size ? `บันทึก ${on.size} ช่อง × ${n} รุ่น` : "บันทึก"}
            </button>
          )}
        </div>
      }
    >
      <div className="divide-y divide-slate-100">
        {BULK_FIELDS.map((f) => {
          const checked = on.has(f.key);
          return (
            <div key={f.key} className="grid grid-cols-[1.5rem_8.5rem_minmax(0,1fr)] items-start gap-2 py-2.5">
              <input type="checkbox" checked={checked} onChange={() => toggle(f.key)} className="mt-1 w-4 h-4 accent-blue-600" aria-label={f.label} />
              <button type="button" onClick={() => toggle(f.key)} className="text-left text-sm text-slate-800 mt-0.5">
                {f.label}
              </button>
              <div className={checked ? "" : "pointer-events-none opacity-35"}>{editor(f.key)}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">ไม่เปิดแก้หลายรายการ: รูป · รูปรายสี · แบนเนอร์ · ปั๊มชื่อ · รายละเอียดเฉพาะรุ่น (เป็นของแต่ละรุ่น — แก้ในหน้าต่างสินค้า)</p>
      {needConfirm && !result && <p className="mt-1 text-[11px] text-rose-600">⚠️ แก้ {n} รุ่นพร้อมกัน — ต้องพิมพ์ CONFIRM ที่แถบล่างก่อนบันทึก</p>}
    </ERPModal>
  );
}
