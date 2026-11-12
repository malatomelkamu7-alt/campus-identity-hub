import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicState } from "@/lib/exam.functions";

/** Shared exam status, refreshed every few seconds so every screen stays in sync. */
export function usePublicState() {
  const fn = useServerFn(getPublicState);
  return useQuery({ queryKey: ["public-state"], queryFn: () => fn(), refetchInterval: 3000 });
}
