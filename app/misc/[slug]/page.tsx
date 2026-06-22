"use client";

/**
 * /misc/[slug] — แอปเปล่าใน Portal "งานอื่นๆ" (ยังไม่มีฟังก์ชัน)
 * โชว์ชื่อ+ไอคอนของแอป (อ่านจากทะเบียนเมนู) + ข้อความ "เร็วๆ นี้"
 * ฟังก์ชันจริงจะถูกเติมด้วยโค้ดทีหลัง
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";

type MenuItem = { label: string; href: string; icon: string | null; icon_url: string | null };
const imgUrl = (key: string | null) => (key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null);

export default function MiscAppPlaceholder() {
  const slug = String(useParams().slug ?? "");
  const [item, setItem] = useState<MenuItem | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch("/api/menu").then((r) => r.json()).then((j) => {
      if (!alive) return;
      const found = ((j.data ?? []) as MenuItem[]).find((m) => m.href === `/misc/${slug}`) ?? null;
      setItem(found); setLoaded(true);
    }).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [slug]);

  return (
    <PlaygroundShell>
      <div className="min-h-full bg-gradient-to-b from-pink-50 to-rose-50/40 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          {imgUrl(item?.icon_url ?? null)
            ? <img src={imgUrl(item!.icon_url)!} alt="" className="w-20 h-20 rounded-3xl object-cover border border-pink-100 mx-auto mb-4" />
            : <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center text-4xl mx-auto mb-4">{item?.icon ?? "🧩"}</div>}
          <h1 className="text-xl font-bold text-rose-600 mb-1">{loaded ? (item?.label ?? "แอปนี้") : "กำลังโหลด…"}</h1>
          <p className="text-sm text-rose-400 mb-5">แอปนี้ยังว่างอยู่ — ฟังก์ชันกำลังจะมา เร็วๆ นี้ 🌸<br />แจ้งทีมพัฒนาเพื่อเพิ่มฟีเจอร์ในแอปนี้ได้เลย</p>
          <Link href="/misc" className="inline-block h-10 px-5 leading-10 rounded-full bg-white border border-pink-200 text-rose-500 text-sm font-medium hover:bg-pink-50">← กลับหน้ารวมแอป</Link>
        </div>
      </div>
    </PlaygroundShell>
  );
}
