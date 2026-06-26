import { redirect } from "next/navigation";

// route เดิม — ย้ายไป /master/design-dashboard (โมดูลจริง) แล้ว
export default function Page() {
  redirect("/master/design-dashboard");
}
