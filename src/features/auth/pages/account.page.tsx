import { Screen, SkeletonRows } from '@/components/ui';
import { useSession } from '../api';
import { PasswordCard } from '../components/PasswordCard';
import { TwoFactorCard } from '../components/TwoFactorCard';
import { useT } from '../i18n';

/**
 * Account → Security: the signed-in member's own 2FA and password. Also where the console sends a member while the
 * platform requires staff 2FA and they have none (every other route answers 403 `two_factor_setup_required`).
 */
export default function AccountPage() {
  const t = useT();
  const { data: user } = useSession();
  if (!user)
    return (
      <Screen max={760}>
        <SkeletonRows rows={4} />
      </Screen>
    );
  return (
    <Screen max={760} label={t('account.screenLabel')}>
      {user.twoFactorSetupRequired && (
        <div className="callout" role="alert" style={{ display: 'block' }}>
          {t('account.setupRequired')}
        </div>
      )}
      <TwoFactorCard user={user} />
      <PasswordCard />
    </Screen>
  );
}
