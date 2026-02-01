import { useEffect, type ReactNode } from "react";

import { AdminSidebar } from "@/components/admin/layout/AdminSidebar";
import { AdminTopbar } from "@/components/admin/layout/AdminTopbar";
import { cleanupStaleRadixScrollLock } from "@/lib/radixScrollLockCleanup";

export function AdminLayout(props: { children: ReactNode; onSignOut: () => void }) {
  // Cleanup any stale dialog overlays on initial mount
  useEffect(() => {
    cleanupStaleRadixScrollLock();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-screen-2xl">
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] min-h-screen">
          <div className="hidden md:block p-4">
            <AdminSidebar />
          </div>

          <div className="min-w-0">
            <AdminTopbar onSignOut={props.onSignOut} />
            <main className="px-4 py-5 lg:px-6">
              {props.children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
