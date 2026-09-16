/**
 * PENDENTE (Sprint 3): inbox real com 3 colunas (lista de conversas,
 * conversa, ficha rápida do CRM), alimentada por public.conversations
 * e public.messages via Supabase. Placeholder estrutural por enquanto.
 */
export default function InboxPage() {
  return (
    <div className="grid h-screen grid-cols-[320px_1fr_320px]">
      <aside className="border-r border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-500">CONVERSAS</h2>
        <p className="mt-4 text-sm text-gray-400">
          Nenhuma conversa ainda — aguardando integração com WhatsApp Cloud API.
        </p>
      </aside>
      <main className="flex flex-col items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Selecione uma conversa</p>
      </main>
      <aside className="border-l border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-500">FICHA DO CLIENTE</h2>
      </aside>
    </div>
  );
}
