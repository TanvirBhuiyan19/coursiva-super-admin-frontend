import type { ReactNode } from 'react';
import { BrandMark } from '@/components/shell/BrandMark';
import { useBrand } from '@/components/shell/useBrand';
import { useT } from './i18n';

/** Brand name until the platform name loads (data, not copy). */
const BRAND = 'Coursiva';

/** The signed-out card shared by forgot-password and reset-password (same frame as the sign-in screen). */
export function AuthCard({ children }: { children: ReactNode }) {
  const t = useT();
  const brand = useBrand(BRAND);
  return (
    <div className="auth-page">
      <main className="auth-card card" aria-labelledby="auth-title">
        <div className="hstack" style={{ gap: 10, marginBottom: 22 }}>
          <BrandMark logo={brand.logo} name={brand.name} />
          <div>
            {!brand.logo && <div style={{ fontWeight: 700 }}>{brand.name}</div>}
            <div className="t-xs muted">{t('login.product')}</div>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
