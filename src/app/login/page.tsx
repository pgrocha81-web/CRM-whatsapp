/**
 * PENDENTE: formulário funcional de login (Supabase Auth — email/senha ou magic link).
 * Placeholder de estrutura para o Sprint 1 (auth). Sem lógica de submit ainda,
 * evitando implicar que o login já funciona sem um projeto Supabase real.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Koala WhatsApp CRM</h1>
        <p className="mb-6 text-sm text-gray-500">
          Login pendente de configuração do Supabase Auth.
        </p>
        <div className="space-y-3">
          <input
            type="email"
            placeholder="seu@email.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            disabled
          />
          <input
            type="password"
            placeholder="senha"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            disabled
          />
          <button
            disabled
            className="w-full rounded-lg bg-gray-300 px-3 py-2 text-sm font-medium text-white"
          >
            Entrar (pendente de credenciais Supabase)
          </button>
        </div>
      </div>
    </div>
  );
}
