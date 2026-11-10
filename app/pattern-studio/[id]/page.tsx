"use client";

import { useParams } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { PatternProjectEditor } from "./editor";

/** /pattern-studio/<id> — สตูดิโอของแพทเทิร์น 1 ใบ (วาดชิ้น + ภาพ 3D + เครื่องมือเย็บ) */
export default function PatternProjectPage() {
  const params = useParams<{ id: string }>();
  return (
    <PlaygroundShell>
      <PatternProjectEditor id={String(params?.id ?? "")} />
    </PlaygroundShell>
  );
}
