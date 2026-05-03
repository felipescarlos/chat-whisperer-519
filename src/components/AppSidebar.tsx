import { Link, useRouterState } from "@tanstack/react-router";
import { MessageCircle, Smartphone, Send, History, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <aside className="w-16 md:w-20 bg-sidebar border-r border-border flex flex-col items-center py-4 gap-2 shrink-0">
      <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center mb-4">
        <MessageCircle className="h-5 w-5 text-primary-foreground" />
      </div>
      {items.map((item) => {
        const Icon = item.icon;
        const active = path === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors group relative",
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
    </aside>
  );
}
