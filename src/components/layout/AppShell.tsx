import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";

export function AppShell({ username }: { username: string }) {
  return (
    <div className="flex h-full">
      <Sidebar username={username} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
