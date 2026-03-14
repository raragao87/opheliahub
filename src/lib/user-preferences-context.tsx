"use client";
import { createContext, useContext, useEffect, ReactNode } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import type { Language } from "./translations";

interface UserPreferences {
  locale: string;
  language: Language;
  defaultVisibility: "SHARED" | "PERSONAL";
  theme: string;
}

interface UserPreferencesContextValue {
  preferences: UserPreferences;
  isLoading: boolean;
  updatePreferences: (patch: Partial<UserPreferences>) => void;
}

const defaultPreferences: UserPreferences = {
  locale: "nl-NL",
  language: "en",
  defaultVisibility: "SHARED",
  theme: "system",
};

const UserPreferencesContext = createContext<UserPreferencesContextValue>({
  preferences: defaultPreferences,
  isLoading: true,
  updatePreferences: () => {},
});

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { setTheme } = useTheme();

  const { data, isLoading } = useQuery({
    ...trpc.auth.getPreferences.queryOptions(),
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation(
    trpc.auth.updateProfile.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(trpc.auth.getPreferences.queryOptions());
      },
    })
  );

  const preferences: UserPreferences = {
    locale: data?.locale ?? "nl-NL",
    language: (data?.language ?? "en") as Language,
    defaultVisibility: (data?.defaultVisibility ?? "SHARED") as "SHARED" | "PERSONAL",
    theme: data?.theme ?? "system",
  };

  // Sync theme with next-themes whenever it changes
  useEffect(() => {
    if (data?.theme) {
      setTheme(data.theme);
    }
  }, [data?.theme, setTheme]);

  const updatePreferences = (patch: Partial<UserPreferences>) => {
    mutation.mutate({
      ...patch,
      theme: patch.theme as "light" | "dark" | "system" | undefined,
    });
  };

  return (
    <UserPreferencesContext.Provider value={{ preferences, isLoading, updatePreferences }}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  return useContext(UserPreferencesContext);
}
