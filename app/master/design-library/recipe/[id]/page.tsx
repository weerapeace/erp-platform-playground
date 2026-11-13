"use client";
import { useParams } from "next/navigation";
import { RecipeEditor } from "@/components/design-library/recipe-editor";

// 📚 Design Library — หน้าปรับสูตร (จุดบนรูป · วัสดุ/สี · ช่อง · prompt · รูปจาก GPT)
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <RecipeEditor id={id} />;
}
