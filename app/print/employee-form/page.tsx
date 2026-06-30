"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { buildEmployeeFormHtml, type EmployeeFormLang } from "@/lib/employee-form-print";

const LANGS: { key: EmployeeFormLang; label: string }[] = [
  { key: "th", label: "ไทย" },
  { key: "en", label: "English" },
  { key: "my", label: "พม่า / မြန်မာ" },
];

export default function EmployeeFormPrintPage() {
  const router = useRouter();
  const [lang, setLang] = useState<EmployeeFormLang>("th");
  const html = useMemo(() => buildEmployeeFormHtml(lang), [lang]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} />
      <div className="mx-auto max-w-[860px] px-4 pb-10">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">ภาษาฟอร์ม:</span>
          {LANGS.map((l) => (
            <button
              key={l.key}
              onClick={() => setLang(l.key)}
              className={`h-9 rounded-lg border px-3 text-sm font-medium transition ${
                lang === l.key
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {l.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-400">กดปุ่ม “พิมพ์” ด้านบนเพื่อพิมพ์ หรือบันทึกเป็น PDF</span>
        </div>
        <PrintFrame html={html} />
      </div>
    </div>
  );
}
