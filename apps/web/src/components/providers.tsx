"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, signOut, useSession } from "next-auth/react";
import { Toaster } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import { clearTokenCache } from "@/lib/api";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

/** Signs the user out when refresh-token rotation has failed server-side. */
function SessionErrorWatcher() {
  const { data: session } = useSession();
  React.useEffect(() => {
    if (session?.error === "RefreshTokenExpired") {
      clearTokenCache();
      void signOut({ callbackUrl: "/login" });
    }
  }, [session?.error]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <SessionErrorWatcher />
          {children}
          <Toaster richColors position="top-right" closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
