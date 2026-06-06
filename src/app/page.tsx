import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";

export default async function Home() {
  const s = await getSessao();
  redirect(s ? "/painel" : "/login");
}
