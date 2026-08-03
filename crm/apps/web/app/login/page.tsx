import { getCurrentSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-brand-dark">Mabres CRM</h1>
        <p className="mb-6 text-sm text-slate-500">Entre com seu e-mail e senha corporativos.</p>
        <LoginForm />
      </div>
    </main>
  );
}
