"use client";
/**
 * กฎที่เก็บไฟล์กลาง (ของกลาง) — ไฟล์หมวดไหนเก็บที่ R2 / Supabase / Google Drive
 *   <StorageRulesManager />            — หน้าเต็ม /master/storage-rules (ดูได้ = assets.view · แก้ได้ = assets.manage)
 *   <StorageProviderBadge provider />  — ป้ายบอกที่เก็บ ใช้ซ้ำได้ทุกที่ (การ์ดคลัง / หน้ารายละเอียด / การ์ดพื้นที่)
 * กฎ/ชนิดข้อมูล: lib/storage-policy.ts · API: /api/storage-rules · คู่มือ docs/storage-policy.md
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { LoadingState, ErrorState, EmptyState } from "@/components/state-views";
import { formatBytes } from "@/lib/assets";
import {
  STORAGE_PROVIDERS, STORAGE_PROVIDER_KEYS, isRuleLocked, ruleStatus, validateRulePatch, maxBytesLabel, fileTypesLabel,
  type StorageProvider, type StorageRule, type OtherStorageUsage,
} from "@/lib/storage-policy";

// ── ป้ายที่เก็บ (ของกลาง) ──
export function StorageProviderBadge({ provider, href, title, small }: { provider: StorageProvider; href?: string | null; title?: string; small?: boolean }) {
  const p = STORAGE_PROVIDERS[provider];
  const cls = `inline-flex items-center gap-1 rounded border font-medium whitespace-nowrap ${p.badge} ${small ? "px-1 py-0 text-[10px]" : "px-1.5 py-0.5 text-[11px]"}`;
  const body = <><Icon value={`i:${p.icon}`} />{p.label}</>;
  if (href) return <a href={href} target="_blank" rel="noreferrer" title={title} onClick={(e) => e.stopPropagation()} className={`${cls} hover:underline`}>{body}</a>;
  return <span title={title} className={cls}>{body}</span>;
}

type R2Usage = { total_bytes: number; total_objects: number; computed_at: string } | null;

function StatusChip({ rule }: { rule: StorageRule }) {
  const t = useT();
  const s = ruleStatus(rule);
  if (s.kind === "follows") return <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><Icon name="done" />{t("ทำตามกฎนี้อัตโนมัติ", "Follows this rule")}</span>;
  if (s.kind === "matches") return <span className="inline-flex items-center gap-1 text-[11px] text-slate-600"><Icon name="done" className="text-emerald-600" />{t("ตรงกับกฎ", "Matches")} · <StorageProviderBadge provider={s.actual} small /></span>;
  if (s.kind === "mismatch")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-amber-700" title={t("ช่องอัปยังตั้งไว้ในโค้ด — จะทำตามกฎเมื่อเชื่อมเฟส 2", "The upload slot is still set in code — it will follow the rule once phase 2 connects it")}>
        <Icon name="warning" />{t("ยังส่งไป", "Still goes to")} <StorageProviderBadge provider={s.actual} small />
      </span>
    );
  return <span className="text-[11px] text-slate-400">{t("ยังไม่มีช่องอัปที่ใช้หมวดนี้", "No upload slot uses this yet")}</span>;
}

export function StorageRulesManager() {
  const t = useT();
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can("assets.manage" as Parameters<typeof can>[0]);
  const [rules, setRules] = useState<StorageRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [r2, setR2] = useState<R2Usage>(null);
  const [others, setOthers] = useState<OtherStorageUsage | null>(null);
  const [editing, setEditing] = useState<StorageRule | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const j = await apiFetch("/api/storage-rules").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRules(j.data as StorageRule[]);
    } catch (e) { setError((e as Error).message || t("โหลดกฎไม่สำเร็จ", "Could not load rules")); }
    finally { setLoading(false); }
    // พื้นที่ที่ใช้ — ไม่บล็อกตาราง โหลดไม่ได้ก็แค่ไม่โชว์ตัวเลข
    apiFetch("/api/assets/storage").then((r) => r.json()).then((j) => { setR2((j.data as R2Usage) ?? null); setOthers((j.others as OtherStorageUsage) ?? null); }).catch(() => {});
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  const usageText = (p: StorageProvider): string | null => {
    if (p === "r2") return r2 ? `${formatBytes(r2.total_bytes)} · ${r2.total_objects.toLocaleString()} ${t("ไฟล์", "files")}` : null;
    if (p === "supabase") return others?.supabase ? `${formatBytes(others.supabase.total_bytes)} · ${others.supabase.total_objects.toLocaleString()} ${t("ไฟล์", "files")}` : null;
    const d = others?.drive;
    return d ? t(`ผูกไว้ในคลัง ${d.asset_links.toLocaleString()} รายการ · โฟลเดอร์งาน ${d.task_folders.toLocaleString()}`, `${d.asset_links.toLocaleString()} library links · ${d.task_folders.toLocaleString()} task folders`) : null;
  };

  const mismatchCount = useMemo(() => rules.filter((r) => ruleStatus(r).kind === "mismatch").length, [rules]);
  const followsCount = useMemo(() => rules.filter((r) => ruleStatus(r).kind === "follows").length, [rules]);

  const columns: MiniColumn<StorageRule>[] = [
    {
      key: "label", header: t("หมวดไฟล์", "File category"), width: "2.2fr",
      cell: (r) => (
        <div className="min-w-0 py-0.5">
          <p className="text-[13px] font-medium text-slate-800">{t(r.label, r.label_en ?? r.label)}</p>
          {r.description && <p className="text-[11px] text-slate-400 leading-snug">{r.description}</p>}
        </div>
      ),
      sortValue: (r) => r.sort_order, sortLabel: t("ลำดับเดิม", "Default order"),
    },
    { key: "types", header: t("ชนิดไฟล์", "File types"), width: "1.2fr", cell: (r) => <span className="text-[11px] text-slate-500">{fileTypesLabel(r.file_types) ?? t("ทุกชนิด", "Any")}</span> },
    {
      key: "provider", header: t("เก็บที่", "Stored in"), width: "1.3fr",
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <StorageProviderBadge provider={r.provider} />
          {isRuleLocked(r) && <span title={r.lock_reason ?? t("ล็อกไว้", "Locked")} className="text-slate-400"><Icon name="lock" title={t("ล็อก", "Locked")} /></span>}
        </span>
      ),
      sortValue: (r) => STORAGE_PROVIDERS[r.provider].label, sortLabel: t("ที่เก็บ", "Storage"),
    },
    { key: "max", header: t("ขนาดสูงสุด", "Max size"), width: "6rem", align: "right", cell: (r) => <span className="text-[11px] text-slate-500">{maxBytesLabel(r.max_bytes) ?? "—"}</span>, sortValue: (r) => r.max_bytes ?? 0 },
    { key: "status", header: t("ตอนนี้ระบบส่งไปที่", "Where uploads go now"), width: "1.6fr", cell: (r) => <StatusChip rule={r} />, sortValue: (r) => ruleStatus(r).kind },
    ...(canEdit ? [{
      key: "edit", header: "", width: "4.5rem", align: "right" as const,
      cell: (r: StorageRule) => (
        <button type="button" onClick={() => setEditing(r)} className="inline-flex items-center gap-1 h-7 px-2 text-[11px] border border-slate-200 rounded-md hover:bg-slate-50 text-slate-600">
          <Icon name="edit" />{t("แก้", "Edit")}
        </button>
      ),
    }] : []),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Icon value="i:database" />{t("กฎที่เก็บไฟล์", "File storage rules")}</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">{t("ไฟล์แต่ละหมวดเก็บที่ไหน — R2 / Supabase / Google Drive · ตั้งที่เดียว ทุกช่องอัปทำตาม", "Where each kind of file is stored — R2 / Supabase / Google Drive · set once, every upload slot follows")}</p>
        </div>
        <Link href="/master/assets" className="inline-flex items-center gap-1 h-9 px-3 text-[13px] border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"><Icon name="library" />{t("ไปคลังไฟล์กลาง", "Go to file library")}</Link>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[13px] text-amber-900 flex gap-2.5">
        <Icon name="info" className="mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p className="font-medium">{followsCount > 0
            ? t(`กฎบังคับใช้แล้ว ${followsCount} หมวด — หมวดอื่นยังตั้งไว้ในโค้ด`, `${followsCount} categories follow their rule — the rest are still set in code`)
            : t("ตอนนี้กฎยังไม่บังคับช่องอัปไฟล์", "Rules don't control upload slots yet")}</p>
          <p className="text-[12px] text-amber-800">{t("หมวดที่ขึ้น “ทำตามกฎนี้อัตโนมัติ” = เปลี่ยนกฎแล้วไฟล์ใหม่ไปที่ใหม่ทันที · หมวดอื่นช่องอัปยังส่งไฟล์ตามที่ตั้งไว้ในโค้ด (คอลัมน์ “ตอนนี้ระบบส่งไปที่” บอกตามจริง) · เปลี่ยนกฎแล้วไฟล์เดิมไม่ย้าย", "Categories showing “Follows this rule” switch new files immediately when you change the rule · other slots still send files where the code says (the “Where uploads go now” column shows the truth) · changing a rule never moves existing files")}</p>
          {mismatchCount > 0 && <p className="text-[12px] font-medium">{t(`${mismatchCount} หมวดยังไม่ตรงกับกฎ`, `${mismatchCount} categories don't match their rule yet`)}</p>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {STORAGE_PROVIDER_KEYS.map((p) => {
          const info = STORAGE_PROVIDERS[p];
          const usage = usageText(p);
          return (
            <div key={p} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <StorageProviderBadge provider={p} />
                <span className="text-[11px] text-slate-400">{rules.filter((r) => r.provider === p).length} {t("หมวด", "categories")}</span>
              </div>
              <p className="mt-2 text-[12px] text-slate-700"><span className="text-emerald-600 font-medium">{t("เก่ง:", "Good at:")}</span> {t(info.goodAt, info.goodAtEn)}</p>
              <p className="mt-0.5 text-[12px] text-slate-500"><span className="text-rose-500 font-medium">{t("ไม่เหมาะ:", "Not for:")}</span> {t(info.notFor, info.notForEn)}</p>
              <p className="mt-2 text-[11px] text-slate-400">{usage ?? t("ยังไม่มีตัวเลขพื้นที่", "No usage figures yet")}</p>
            </div>
          );
        })}
      </div>

      {loading ? <LoadingState />
        : error ? <ErrorState title={t("โหลดกฎที่เก็บไฟล์ไม่สำเร็จ", "Could not load storage rules")} hint={error} onRetry={load} />
        : rules.length === 0 ? <EmptyState title={t("ยังไม่มีกฎที่เก็บไฟล์", "No storage rules yet")} />
        : (
          <MiniTable
            rows={rules} rowKey={(r) => r.id} columns={columns}
            searchText={(r) => `${r.label} ${r.label_en ?? ""} ${r.description ?? ""} ${r.file_types.join(" ")} ${STORAGE_PROVIDERS[r.provider].label}`}
            searchPlaceholder={t("ค้นหาหมวด / ชนิดไฟล์…", "Search category / file type…")}
            groupBy={(r) => STORAGE_PROVIDERS[r.provider].label} groupLabel={t("ที่เก็บ", "Storage")} defaultGrouped={false}
            countUnit={t("หมวด", "categories")}
            footnote={<span className="inline-flex items-center gap-1"><Icon name="lock" />{t("= ล็อกไว้ เปลี่ยนที่เก็บไม่ได้ (ชี้ที่ไอคอนเพื่อดูเหตุผล)", "= locked, storage can't be changed (hover the icon for the reason)")}</span>}
          />
        )}

      {editing && (
        <StorageRuleEditModal rule={editing} onClose={() => setEditing(null)}
          onSaved={(r) => { setRules((rs) => rs.map((x) => (x.id === r.id ? r : x))); setEditing(null); toast.success(t("บันทึกกฎแล้ว", "Rule saved")); }} />
      )}
    </div>
  );
}

export function StorageRuleEditModal({ rule, onClose, onSaved }: { rule: StorageRule; onClose: () => void; onSaved: (r: StorageRule) => void }) {
  const t = useT();
  const toast = useToast();
  const [provider, setProvider] = useState<StorageProvider>(rule.provider);
  const [maxMb, setMaxMb] = useState(rule.max_bytes ? String(Math.round((rule.max_bytes / 1024 / 1024) * 10) / 10) : "");
  const [saving, setSaving] = useState(false);
  const locked = isRuleLocked(rule);

  const input = { provider, max_bytes: maxMb.trim() === "" ? null : Number(maxMb) * 1024 * 1024 };
  const checked = validateRulePatch(rule, input);
  const dirty = !!checked.patch && Object.keys(checked.patch).length > 0;
  const status = ruleStatus({ rule_key: rule.rule_key, provider });

  const save = async () => {
    if (checked.error) { toast.error(checked.error); return; }
    if (!dirty) { onClose(); return; }
    setSaving(true);
    try {
      const j = await apiFetch(`/api/storage-rules/${rule.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(checked.patch) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      onSaved(j.data as StorageRule);
    } catch (e) { toast.error((e as Error).message || t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="md" title={t(rule.label, rule.label_en ?? rule.label)} description={rule.description ?? undefined}
      hasUnsavedChanges={dirty} loading={saving}
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <button type="button" onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" onClick={save} disabled={saving || !!checked.error} className="h-9 px-5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{t("บันทึก", "Save")}</button>
        </div>
      }>
      <div className="space-y-4">
        <div>
          <p className="text-[12px] font-medium text-slate-600 mb-1.5">{t("เก็บที่", "Store in")}</p>
          {(locked || rule.lock_reason) && (
            <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] text-slate-600">
              <Icon name={locked ? "lock" : "info"} className="mt-0.5 shrink-0" />
              {locked ? `${t("หมวดนี้ล็อกไว้", "This category is locked")}${rule.lock_reason ? ` — ${rule.lock_reason}` : ""}` : rule.lock_reason}
            </p>
          )}
          <div className="space-y-1.5">
            {STORAGE_PROVIDER_KEYS.map((p) => {
              const allowed = rule.allowed_providers.includes(p);
              const info = STORAGE_PROVIDERS[p];
              return (
                <label key={p} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${provider === p ? "border-indigo-400 bg-indigo-50/50" : "border-slate-200"} ${allowed && !locked ? "cursor-pointer hover:bg-slate-50" : "opacity-50 cursor-not-allowed"}`}>
                  <input type="radio" name="provider" className="mt-1" checked={provider === p} disabled={!allowed || locked} onChange={() => setProvider(p)} />
                  <span className="min-w-0">
                    <StorageProviderBadge provider={p} />
                    <span className="block mt-1 text-[11px] text-slate-500">{t(info.goodAt, info.goodAtEn)}</span>
                    {!allowed && <span className="block text-[11px] text-slate-400">{t("หมวดนี้เลือกไม่ได้", "Not available for this category")}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[12px] font-medium text-slate-600 mb-1">{t("ขนาดไฟล์สูงสุด (MB)", "Max file size (MB)")}</p>
          <input type="number" min={0} step="0.1" inputMode="decimal" value={maxMb} onChange={(e) => setMaxMb(e.target.value)}
            placeholder={t("เว้นว่าง = ไม่กำหนด", "Leave blank = no limit")}
            className="w-40 h-9 px-3 text-sm border border-slate-200 rounded-lg" />
          <p className="mt-1 text-[11px] text-slate-400">{status.kind === "follows"
            ? t("ใช้ตรวจตอนอัปแล้ว · ถ้าเก็บที่ R2 ช่องอัปรับได้ไม่เกิน 4 MB", "Checked at upload · uploads to R2 are capped at 4 MB")
            : t("ใช้ตรวจตอนอัปเมื่อเชื่อมช่องอัปกับกฎแล้ว", "Checked at upload once the slot is connected to rules")}</p>
        </div>

        {checked.error && <p className="text-[12px] text-rose-600">{checked.error}</p>}

        {provider !== rule.provider && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 space-y-0.5">
            <p>{t("ไฟล์เดิมไม่ย้าย — มีผลกับไฟล์ใหม่เท่านั้น", "Existing files are not moved — this applies to new files only")}</p>
            {status.kind === "follows" && <p>{t("ช่องอัปหมวดนี้ทำตามกฎแล้ว — ไฟล์ใหม่ไปที่", "This category's upload slot follows the rule — new files go to")} <b>{STORAGE_PROVIDERS[provider].label}</b> {t("ทันทีที่บันทึก", "as soon as you save")}</p>}
            {status.kind === "follows" && provider === "r2" && <p>{t("R2: ลิงก์ไฟล์เปิดได้โดยไม่ต้อง login และรับไฟล์ได้ไม่เกิน 4 MB", "R2: file links open without login and uploads are capped at 4 MB")}</p>}
            {status.kind === "mismatch" && <p>{t("ช่องอัปของหมวดนี้ยังส่งไป", "This category's upload slot still sends to")} <b>{STORAGE_PROVIDERS[status.actual].label}</b> {t("จนกว่าจะเชื่อมกับกฎ", "until it is connected to the rule")}</p>}
          </div>
        )}

        {rule.updated_by && (
          <p className="text-[11px] text-slate-400">{t("แก้ล่าสุดโดย", "Last changed by")} {rule.updated_by} · {new Date(rule.updated_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</p>
        )}
      </div>
    </ERPModal>
  );
}
