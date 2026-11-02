import { Badge } from '@/components/ui';
import { useT } from '../i18n';
import type { InvoiceProvider } from '../types';

/** "Billed by Paddle": the invoice belongs to a merchant of record, which retries it on its own schedule. */
export function ProviderTag({ provider }: { provider: InvoiceProvider }) {
  const t = useT();
  const name = t(`provider.names.${provider}`);
  return (
    <Badge xs tag title={t('provider.managedThere', { name })}>
      {t('provider.billedBy', { name })}
    </Badge>
  );
}
