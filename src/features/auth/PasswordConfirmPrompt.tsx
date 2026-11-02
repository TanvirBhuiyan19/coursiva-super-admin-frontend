import { Suspense, useEffect, useState } from 'react';
import { onPasswordConfirmationRequired } from '@/lib/api/client';
import { lazyWithPreload, whenIdle } from '@/lib/lazy';

// The dialog is off the critical path: fetched when the browser is idle, so it still opens instantly on a 423.
const PromptDialog = lazyWithPreload(() => import('./PasswordConfirmDialog'));

/**
 * Step-up authentication: when a sensitive change answers 423 (password not entered recently), the API client
 * waits on this prompt. Confirming retries the change once; cancelling fails it with the original error.
 */
export function PasswordConfirmPrompt() {
  const [resolve, setResolve] = useState<((ok: boolean) => void) | null>(null);

  useEffect(() => whenIdle(() => void PromptDialog.preload()), []);
  useEffect(
    () =>
      onPasswordConfirmationRequired(
        () =>
          new Promise<boolean>((done) => {
            setResolve(() => done);
          }),
      ),
    [],
  );

  if (!resolve) return null;
  const finish = (ok: boolean) => {
    resolve(ok);
    setResolve(null);
  };
  return (
    <Suspense fallback={null}>
      <PromptDialog onConfirmed={() => finish(true)} onCancel={() => finish(false)} />
    </Suspense>
  );
}
