import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl">🐨</div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">Koala Turismo</h1>
          <p className="text-sm text-stone-500">Central comercial</p>
        </div>
        {erro === "sem-acesso" && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Seu usuário ainda não tem acesso liberado. Fale com o Piero.
          </p>
        )}
        <LoginForm />
      </div>
    </div>
  );
}
