"use client";

/**
 * WebsiteInfoPanel — แท็บ "🏪 ข้อมูลร้าน" ในหน้า /website/<slug>
 *
 * คำโปรย/คำอธิบายร้าน · ช่องทางติดต่อ · ค่าส่ง + ช่องทางชำระเงิน + ตัวย่อเลขออเดอร์
 * ฟอร์มวาดจากนิยามฟิลด์ที่ API ส่งมา (lib/website-site-info.ts) — เพิ่มช่องใหม่ที่ lib ที่เดียว หน้านี้ขึ้นเอง
 * ข้อมูล: /api/website/settings (guardApi + audit)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";

type FieldDef = {
  key: string;
  label: string;
  hint?: string;
  group: string;
  type: "text" | "textarea" | "number" | "bool";
  isPublic: boolean;
  placeholder?: string;
};
type GroupDef = { key: string; label: string; hint: string };
type Info = Record<string, string | number | boolean>;

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";
const cardCls = "rounded-xl border border-slate-200 bg-white p-4";

export function WebsiteInfoPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [groups, setGroups] = useState<GroupDef[]>([]);
  const [saved, setSaved] = useState<Info>({});
  const [info, setInfo] = useState<Info>({});
  const [prefix, setPrefix] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/website/settings?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json();
      if (j.error) {
        toast.error(j.error);
        return;
      }
      setFields(j.fields ?? []);
      setGroups(j.groups ?? []);
      setSaved(j.info ?? {});
      setInfo(j.info ?? {});
      setPrefix(j.effectiveOrderPrefix ?? "");
    } catch {
      toast.error("โหลดข้อมูลร้านไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [shopSlug, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(info), [saved, info]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await apiFetch("/api/website/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, info }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setSaved(j.info);
      setInfo(j.info);
      setPrefix(j.effectiveOrderPrefix ?? "");
      toast.success("บันทึกข้อมูลร้านแล้ว — เว็บจะอัปเดตภายใน 1 นาที");
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const set = (k: string, v: string | number | boolean) => setInfo((p) => ({ ...p, [k]: v }));

  if (loading) return <p className="text-sm text-slate-500 py-8 text-center">กำลังโหลดข้อมูลร้าน…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          ข้อมูลพวกนี้ขึ้นที่ท้ายเว็บ หน้า /contact และหน้าชำระเงินของเว็บร้าน · เว้นว่างช่องไหน เว็บจะไม่โชว์ช่องนั้น
        </p>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={() => setInfo(saved)}
              className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
            >
              ละทิ้งการเปลี่ยนแปลง
            </button>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => {
          const list = fields.filter((f) => f.group === g.key);
          if (!list.length) return null;
          return (
            <section key={g.key} className={`${cardCls} ${g.key === "contact" ? "lg:row-span-2" : ""}`}>
              <h3 className="text-sm font-semibold text-slate-800">{g.label}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 mb-3">{g.hint}</p>
              <div className={`grid gap-3 ${g.key === "contact" ? "sm:grid-cols-2" : ""}`}>
                {list.map((f) => (
                  <Field key={f.key} f={f} value={info[f.key]} onChange={(v) => set(f.key, v)} />
                ))}
              </div>
              {g.key === "order" && (
                <p className="text-[11px] text-slate-500 mt-3 rounded-lg bg-slate-50 px-3 py-2">
                  เลขที่ออเดอร์ของร้านนี้จะขึ้นต้นด้วย <span className="font-mono font-semibold text-slate-800">{prefix}-</span>{" "}
                  ตามด้วยปี พ.ศ. + เดือน และลำดับ 5 หลัก เช่น {prefix}-{new Date().getFullYear() + 543}
                  {String(new Date().getMonth() + 1).padStart(2, "0")}-00001
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Field({
  f,
  value,
  onChange,
}: {
  f: FieldDef;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
}) {
  if (f.type === "bool") {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-800 py-1 cursor-pointer">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />
        <span>{f.label}</span>
        {f.hint && <span className="text-[11px] text-slate-400">— {f.hint}</span>}
      </label>
    );
  }
  const wide = f.type === "textarea" ? "sm:col-span-2" : "";
  return (
    <div className={wide}>
      <label className={labelCls}>{f.label}</label>
      {f.type === "textarea" ? (
        <textarea
          rows={3}
          className={inputCls}
          value={String(value ?? "")}
          placeholder={f.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={f.type === "number" ? "number" : "text"}
          inputMode={f.type === "number" ? "decimal" : undefined}
          min={f.type === "number" ? 0 : undefined}
          className={inputCls}
          value={String(value ?? "")}
          placeholder={f.placeholder}
          onChange={(e) => onChange(f.type === "number" ? e.target.value : e.target.value)}
        />
      )}
      {f.hint && <p className="text-[11px] text-slate-400 mt-1">{f.hint}</p>}
    </div>
  );
}
