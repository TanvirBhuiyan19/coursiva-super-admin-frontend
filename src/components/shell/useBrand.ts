import { useBranding } from '@/features/auth/api';
import { useUi } from '@/store/ui';

/**
 * The platform name and the logo to show on a surface. `dark` surfaces (the sidebar, dark in both themes) and the dark
 * theme prefer the logo for dark backgrounds. While branding loads or if it fails, `fallbackName` and no logo.
 */
export function useBrand(fallbackName: string, surface: 'dark' | 'theme' = 'theme') {
  const branding = useBranding();
  const dark = useUi((s) => s.uiMode === 'Dark') || surface === 'dark';
  return {
    name: branding?.name || fallbackName,
    logo: (dark && branding?.logoDarkUrl) || branding?.logoUrl || null,
  };
}
