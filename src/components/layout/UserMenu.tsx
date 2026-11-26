import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { useNavigate } from "react-router";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout } from "@/features/auth/hooks";
import { routes } from "@/lib/routes";

export function UserMenu({ username }: { username: string }) {
  const navigate = useNavigate();
  const logout = useLogout();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-200 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-brand-500 data-[state=open]:bg-white/10">
        <Avatar name={username} />
        <span className="flex-1 truncate font-medium">{username}</span>
        <ChevronsUpDown className="size-4 text-slate-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-3">
          <Avatar name={username} />
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{username}</p>
            <p className="text-xs text-slate-500">Administrador</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate(routes.settings())}>
          <Settings /> Configuración
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          danger
          onSelect={() => {
            // Al volver a entrar, se empieza desde Inicio.
            navigate(routes.home());
            logout.mutate();
          }}
        >
          <LogOut /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
