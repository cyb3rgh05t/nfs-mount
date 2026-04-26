import { QueryClient } from "@tanstack/react-query";

/**
 * Single shared React-Query client.
 *
 * Defaults are tuned for an admin dashboard:
 *   - data is considered fresh for 10 s (no extra refetch on remount)
 *   - cached for 5 min after last consumer unmounts
 *   - background polling pauses automatically when the tab is hidden
 *     (`refetchIntervalInBackground: false`)
 *   - one silent retry on transient failures
 *   - 401 responses are NOT retried – the auth context will log the user out
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      refetchIntervalInBackground: false,
      retry: (failureCount, error) => {
        const msg = String(error?.message || "");
        if (
          msg.includes("Invalid token") ||
          msg.includes("Not authenticated")
        ) {
          return false;
        }
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
