"use client";

import { useState, useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { initErrorCapture } from "@/lib/error-capture";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { TRPCProvider } from "@/trpc/client";
import type { AppRouter } from "@/trpc/router";
import { OwnershipProvider } from "@/lib/ownership-context";
import { UserPreferencesProvider } from "@/lib/user-preferences-context";
import { Toaster } from "sonner";
import { OpheliaChatProvider } from "@/lib/ophelia/chat-context";
import superjson from "superjson";

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => { initErrorCapture(); }, []);

  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } })
  );

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: `${getBaseUrl()}/api/trpc`, transformer: superjson })],
    })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
          <OwnershipProvider>
            <UserPreferencesProvider>
              <OpheliaChatProvider>
                {children}
              </OpheliaChatProvider>
              <Toaster position="bottom-right" richColors closeButton />
            </UserPreferencesProvider>
          </OwnershipProvider>
        </TRPCProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
