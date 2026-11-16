"use client";

// ป๊อปผูกกล่อง "ที่เก็บ" กับกฎที่เก็บจริง (ใช้ภายใน components/flowchart-board)
// กฎมาจาก /api/storage-rules (ตาราง erp_storage_rules · หน้าแก้ /master/storage-rules) — ป๊อปนี้แค่เลือก ไม่ได้แก้กฎ
// ผูกแล้ว กระดานเทียบแผนกับกฎ (lib/storage-policy planRuleCheck) แล้วขึ้นป้ายใต้กล่อง

import { useEffect, useState } from "react";
import Link from "next/link";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { LoadingState, ErrorState } from "@/components/state-views";
import { StorageProviderBadge } from "@/components/storage-rules";
import { apiFetch } from "@/lib/api";
import { fileTypesLabel, type StorageRule } from "@/lib/storage-policy";

/** โหลดกฎที่เก็บไฟล์ครั้งเดียวต่อกระดาน (โหลดเฉพาะเมื่อมีกล่องผูกกฎ หรือเปิดป๊อป) */
export function useStorageRules(enabled: boolean): { rules: StorageRule[] | null; error: string | null; reload: () => void } {
  const [rules, setRules] = useState<StorageRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (!enabled || (rules && key === 0)) return;
    let alive = true;
    setError(null);
    apiFetch("/api/storage-rules").then((r) => r.json().then((j) => ({ ok: r.ok, j }))).then(({ ok, j }) => {
      if (!alive) return;
      if (!ok || j?.error) { setError(j?.error || "โหลดกฎที่เก็บไฟล์ไม่สำเร็จ"); setRules([]); return; }
      setRules((j?.data ?? []) as StorageRule[]);
    }).catch(() => { if (alive) { setError("โหลดกฎที่เก็บไฟล์ไม่สำเร็จ"); setRules([]); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
  return { rules, error, reload: () => setKey((k) => k + 1) };
}

export function StorageRuleModal({ open, current, rules, error, onReload, onClose, onPick }: {
  open: boolean;
  current: string | null;
  rules: StorageRule[] | null;
  error: string | null;
  onReload: () => void;
  onClose: () => void;
  /** "" = เลิกผูก */
  onPick: (ruleKey: string) => void;
}) {
  const t = useT();
  const row = (on: boolean) => `flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${on ? "border-violet-500 bg-violet-50 ring-1 ring-violet-300" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`;
  return (
    <ERPModal open={open} onClose={onClose} title={t("ผูกกับกฎที่เก็บจริง", "Link to a storage rule")} size="lg">
      <p className="mb-2 text-[12px] text-slate-500">
        {t("เลือกหมวดไฟล์ที่กล่องนี้หมายถึง — ถ้าแผนไม่ตรงกับที่ระบบเก็บจริง กล่องจะขึ้นป้ายสีส้ม · แก้กฎได้ที่ ", "Pick the file category this box means — boxes turn amber when the plan differs from the real rule · edit rules at ")}
        <Link href="/master/storage-rules" target="_blank" className="text-violet-700 underline">{t("กฎที่เก็บไฟล์", "Storage rules")} ↗</Link>
      </p>
      {rules === null ? <LoadingState className="h-40 text-sm" />
        : error ? <ErrorState title={t("โหลดกฎไม่สำเร็จ", "Could not load rules")} hint={error} onRetry={onReload} />
        : (
          <div className="grid gap-2 sm:grid-cols-2">
            {rules.map((r) => (
              <button key={r.id} type="button" className={row(current === r.rule_key)} onClick={() => onPick(r.rule_key)}>
                <span className="mt-0.5 text-violet-600"><Icon value="i:shield-check" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-slate-800">{t(r.label, r.label_en || r.label)}</span>
                    <StorageProviderBadge provider={r.provider} small />
                  </span>
                  {r.description && <span className="block text-[11px] leading-snug text-slate-500">{r.description}</span>}
                  {fileTypesLabel(r.file_types) && <span className="block text-[10.5px] text-slate-400">{fileTypesLabel(r.file_types)}</span>}
                </span>
              </button>
            ))}
            {current && (
              <button type="button" className={row(false)} onClick={() => onPick("")}>
                <span className="mt-0.5 text-slate-400"><Icon value="i:x" /></span>
                <span className="text-[13px] text-slate-600">{t("เลิกผูกกฎ", "Unlink")}</span>
              </button>
            )}
          </div>
        )}
    </ERPModal>
  );
}
