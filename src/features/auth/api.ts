import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, bumpSessionEpoch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { Resource } from '@/lib/api/types';
import { useUi } from '@/store/ui';
import { rememberPermissions } from './permissionHint';
import { announceSession } from './tabSync';
import { resetIdleLock } from './useIdleLock';
import type {
  Branding,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  LoginResult,
  PasswordResetDone,
  PasswordResetSent,
  PasswordUpdated,
  RecoveryCodes,
  ResetPasswordInput,
  TwoFactorSetup,
  User,
} from './types';

export const authKeys = {
  me: ['auth', 'me'] as const,
  branding: ['platform', 'branding'] as const,
};

/** Public data that belongs to no one (kept across sign-ins). */
const isPublicKey = (key: readonly unknown[]) => key[0] === authKeys.branding[0] && key[1] === authKeys.branding[1];
const isMeKey = (key: readonly unknown[]) => key[0] === authKeys.me[0] && key[1] === authKeys.me[1];

/**
 * Starts over for a new identity: on every sign-in and sign-out (including an expired session), everything cached
 * belongs to the previous person and must never be shown to the next. Cancels and drops every query except the session
 * itself (set to `user`, so guards re-render at once) and public branding, resets per-user UI state and the
 * permission hint. `announce` tells the other tabs of this browser (they share the session cookie).
 */
export function resetSessionState(qc: QueryClient, user: User | null, { announce = true }: { announce?: boolean } = {}) {
  bumpSessionEpoch();
  rememberPermissions(user);
  const others = { predicate: (q: { queryKey: readonly unknown[] }) => !isMeKey(q.queryKey) && !isPublicKey(q.queryKey) };
  void qc.cancelQueries(others);
  qc.removeQueries(others);
  qc.getMutationCache().clear();
  qc.setQueryData(authKeys.me, user);
  useUi.getState().set({ cmdOpen: false });
  if (announce) announceSession({ userId: user?.id ?? null });
}

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

/** Public platform branding — cached 5 min like the API's `Cache-Control`; failures are silent (the built-in mark shows). */
export const brandingQuery = queryOptions({
  queryKey: authKeys.branding,
  queryFn: () => api.get<Resource<Branding>>('/platform/branding').then((r) => r.data),
  staleTime: 5 * 60_000,
  retry: false,
});

/** Platform name and brand images, or `undefined` while loading / on error. Never blocks rendering. */
export const useBranding = () => useQuery(brandingQuery).data;

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<Resource<LoginResult>>('/auth/login', input).then((r) => r.data),
    onSuccess: (res) => {
      if (res.user) {
        resetIdleLock();
        resetSessionState(qc, res.user);
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
      resetSessionState(qc, user);
    },
    meta: { errorToast: false },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<undefined>('/auth/logout'),
    onSettled: () => {
      resetIdleLock();
      resetSessionState(qc, null);
    },
  });
}

// ---------- Credential self-service (staff-security routes, shared with the tenant dashboard) ----------

/** Public: emails a reset link. Always "sent" (no account enumeration). */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) => api.post<Resource<PasswordResetSent>>('/auth/forgot-password', input).then((r) => r.data),
    meta: { errorToast: false },
  });
}

/** Public: sets a new password from an emailed reset link or staff invitation (activates an invited member). */
export function useResetPassword() {
  return useMutation({
    mutationFn: (input: ResetPasswordInput) => api.post<Resource<PasswordResetDone>>('/auth/reset-password', input).then((r) => r.data),
    meta: { errorToast: false },
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => api.put<Resource<PasswordUpdated>>('/auth/password', input).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['audit'] }),
    meta: { errorToast: false },
  });
}

/** Step 1 of 2FA enrolment: an unconfirmed secret (423 → password prompt when not confirmed in the last 15 min). */
export function useEnableTwoFactor() {
  return useMutation({
    mutationFn: () => api.post<Resource<TwoFactorSetup>>('/auth/two-factor').then((r) => r.data),
  });
}

/** Everything a 2FA change affects: the session (`twoFactorEnabled`, setup requirement), staff coverage, audit. */
const onTwoFactorChanged = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: authKeys.me });
  void qc.invalidateQueries({ queryKey: ['staff'] });
  void qc.invalidateQueries({ queryKey: ['audit'] });
};

/** Step 2: verifies a code from the app; 2FA takes effect and the recovery codes come back (shown once). */
export function useConfirmTwoFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post<Resource<RecoveryCodes>>('/auth/two-factor/confirm', { code }).then((r) => r.data),
    onSuccess: () => onTwoFactorChanged(qc),
    meta: { errorToast: false },
  });
}

export function useDisableTwoFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<undefined>('/auth/two-factor'),
    onSuccess: () => onTwoFactorChanged(qc),
  });
}

export function useRegenerateRecoveryCodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Resource<RecoveryCodes>>('/auth/two-factor/recovery-codes').then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['audit'] }),
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
