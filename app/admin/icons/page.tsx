"use client";

import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { IconsAdmin } from "./icons-admin";

export default function AdminIconsPage() {
  const allowed = usePermission("admin.users");
  return <PlaygroundShell>{allowed ? <IconsAdmin /> : <AccessDenied />}</PlaygroundShell>;
}
