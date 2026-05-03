import { Link, useRouterState } from "@tanstack/react-router";
import { MessageCircle, Smartphone, Send, History, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/auth";

const items = [
  { to: "/", label: "Conversas", icon: MessageCircle },
  { to: "/chips", label: "Chips", icon: Smartphone },
  { to: "/disparos", label: "Disparos", icon: Send },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/configuracoes", label: "Config", icon: Settings },
] as const;

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="w-16 md:w-20 bg-sidebar border-r border-border flex flex-col items-center py-4 shrink-0 h-full">
      <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center mb-4 shrink-0">
        <MessageCircle className="h-5 w-5 text-primary-foreground" />
      </div>
      
      <div className="flex-1 flex flex-col items-center gap-2 w-full overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const active = path === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors group relative shrink-0",
                active
                  ? "bg-accent text-primary"
                  : "text-sidebar-foreground hover:bg-accent/50 hover:text-foreground",
              )}
              title={item.label}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[9px] font-medium hidden md:block">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-auto pt-4 shrink-0 w-full flex justify-center">
        <button
          onClick={logout}
          className="w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors text-muted-foreground hover:bg-destructive/10 hover:text-destructive group"
          title="Sair"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-[9px] font-medium hidden md:block group-hover:text-destructive">Sair</span>
        </button>
      </div>
    </aside>
  );
}
