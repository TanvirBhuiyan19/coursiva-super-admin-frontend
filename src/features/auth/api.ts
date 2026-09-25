import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { Resource } from '@/lib/api/types';
import { rememberPermissions } from './permissionHint';
import { resetIdleLock } from './useIdleLock';
import type { LoginInput, LoginResult, User } from './types';

export const authKeys = {
  me: ['auth', 'me'] as const,
};

async function fetchMe(): Promise<User | null> {
  try {
    const res = await api.get<Resource<User>>('/auth/me');
    rememberPermissions(res.data);
    return res.data;
  } catch (err) {
    if (err instanceof ApiError && err.isUnauthenticated) {
      rememberPermissions(null);
      return null;
    }
    throw err;
  }
}

/** Session query definition — shared by `useSession` and route preloading. */
export const sessionQuery = queryOptions({ queryKey: authKeys.me, queryFn: fetchMe, staleTime: 5 * 60_000, retry: false });

/** The signed-in staff user, or `null` when signed out. */
export function useSession() {
  return useQuery(sessionQuery);
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<Resource<LoginResult>>('/auth/login', input).then((r) => r.data),
    onSuccess: (res) => {
      if (res.user) {
        resetIdleLock();
        rememberPermissions(res.user);
        qc.setQueryData(authKeys.me, res.user);
      }
    },
    meta: { errorToast: false },
  });
}

export function useTwoFactorChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post<Resource<User>>('/auth/two-factor-challenge', { code }).then((r) => r.data),
    onSuccess: (user) => {
      resetIdleLock();
      rememberPermissions(user);
      qc.setQueryData(authKeys.me, user);
    },
    meta: { errorToast: false },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<undefined>('/auth/logout'),
    onSettled: () => {
      rememberPermissions(null);
      resetIdleLock();
      qc.clear();
      qc.setQueryData(authKeys.me, null);
    },
  });
}

/** Re-enters the password to unlock an idle-locked console (Fortify `POST /user/confirm-password` equivalent). */
export function useConfirmPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => api.post<undefined>('/auth/confirm-password', { password }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['audit'] }),
    meta: { errorToast: false },
  });
}
