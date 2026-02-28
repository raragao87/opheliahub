import { QueryClient } from "@tanstack/react-query";

let clientQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === "undefined") {
    return new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000 } },
    });
  }
  if (!clientQueryClient) {
    clientQueryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000 } },
    });
  }
  return clientQueryClient;
}
