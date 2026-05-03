import { useState } from "react";
import { Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { login } from "@/lib/auth";

interface LoginScreenProps {
  onSuccess: () => void;
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(email, password)) {
      onSuccess();
      toast.success("Login realizado com sucesso!");
    } else {
      toast.error("Email ou senha incorretos.");
      setPassword(""); // Clear password on error
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg overflow-hidden">
        <div className="p-8">
          <div className="flex justify-center mb-6">
            <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Lock className="h-8 w-8 text-primary" />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-center mb-2 text-foreground">
            Acesso Restrito
          </h2>
          <p className="text-sm text-center text-muted-foreground mb-8">
            Digite suas credenciais para acessar o painel do WhatsApp.
          </p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-input border-border"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-input border-border"
              />
            </div>

            <Button type="submit" className="w-full mt-4" size="lg">
              <LogIn className="w-4 h-4 mr-2" />
              Entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
