import { useMemo } from "react";
import { Link } from "wouter";
import { Plus, User, Tag, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Client, AiDiscussion } from "@shared/schema";

export function DiscussionSidebar({
  discussions, clients, selectedId, onNew, filter, setFilter,
}: {
  discussions: AiDiscussion[]; clients: Client[]; selectedId: number | null;
  onNew: () => void; filter: string; setFilter: (v: string) => void;
}) {
  const clientName = useMemo(() => {
    const m = new Map<number, string>();
    clients.forEach((c) => m.set(c.id, `${c.firstName} ${c.lastName}`));
    return m;
  }, [clients]);

  const f = filter.trim().toLowerCase();
  const match = (d: AiDiscussion) =>
    !f || d.title.toLowerCase().includes(f) || (d.theme || "").toLowerCase().includes(f) ||
    (d.clientId != null && (clientName.get(d.clientId) || "").toLowerCase().includes(f));

  const byClient = new Map<number, AiDiscussion[]>();
  const byTheme = new Map<string, AiDiscussion[]>();
  for (const d of discussions.filter(match)) {
    if (d.clientId != null) {
      if (!byClient.has(d.clientId)) byClient.set(d.clientId, []);
      byClient.get(d.clientId)!.push(d);
    } else {
      const key = d.theme || "Non classé";
      if (!byTheme.has(key)) byTheme.set(key, []);
      byTheme.get(key)!.push(d);
    }
  }

  function item(d: AiDiscussion) {
    const active = d.id === selectedId;
    return (
      <Link key={d.id} href={`/app/chat/${d.id}`} data-testid={`discussion-${d.id}`}
        className={`block truncate text-sm rounded-[10px] px-2 py-1.5 ml-5 ${active ? "bg-secondary text-primary font-medium" : "text-muted-foreground hover:bg-secondary/60"}`}>
        {d.title}
      </Link>
    );
  }

  return (
    <aside className="w-60 shrink-0 border-r border-border flex flex-col gap-4 p-3 overflow-y-auto">
      <Button onClick={onNew} className="rounded-[12px] w-full justify-center" data-testid="button-new-discussion">
        <Plus className="h-4 w-4 mr-1" /> Nouvelle discussion
      </Button>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer…"
        className="h-9 rounded-[10px] border border-border px-3 text-sm" data-testid="input-filter-discussions" />

      <div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><User className="h-3.5 w-3.5" /> Par cliente</p>
        {Array.from(byClient.entries()).map(([cid, list]) => (
          <div key={cid} className="mb-1">
            <p className="text-sm font-medium px-1 truncate">{clientName.get(cid) || "Cliente"}</p>
            {list.map(item)}
          </div>
        ))}
        {byClient.size === 0 && <p className="text-xs text-muted-foreground/70 px-1">Aucune</p>}
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Tag className="h-3.5 w-3.5" /> Par thématique</p>
        {Array.from(byTheme.entries()).map(([theme, list]) => (
          <div key={theme} className="mb-1">
            <p className="text-sm font-medium px-1 truncate">{theme}</p>
            {list.map(item)}
          </div>
        ))}
        {byTheme.size === 0 && <p className="text-xs text-muted-foreground/70 px-1">Aucune</p>}
      </div>
    </aside>
  );
}
