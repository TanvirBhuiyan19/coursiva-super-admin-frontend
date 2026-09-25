import { Badge, Card, Seg, Select } from '@/components/ui';
import { getLocale, LOCALES, setLocale, type Locale } from '@/lib/i18n';
import { useT as useCommonT } from '@/lib/i18n/common';
import { toast, useUi } from '@/store/ui';
import { swatch, THEMES, type UiMode } from '@/theme/themes';
import { useT } from '../i18n';

type ThemeName = 'Royal purple' | 'Indigo' | 'Sapphire' | 'Emerald' | 'Teal' | 'Bronze';

/** Personal appearance: stored on this device only (Zustand + localStorage), never sent to the API. */
export function AppearanceCard() {
  const brand = useUi((s) => s.brand);
  const uiMode = useUi((s) => s.uiMode);
  const setBrand = useUi((s) => s.setBrand);
  const setUiMode = useUi((s) => s.setUiMode);
  const t = useT();
  const tc = useCommonT();
  const themeName = (name: string) => t(`appearance.themes.${name as ThemeName}`);
  // The pseudo-locale (accented, expanded text) is a QA tool for spotting hard-coded or truncated strings.
  const locales = LOCALES.filter((l) => !('qa' in l) || import.meta.env.DEV).map((l) => [l.id, l.label] as const);

  return (
    <Card title={t('appearance.title')} right={<Badge tone="info">{t('appearance.badge')}</Badge>}>
      <p className="t-sm muted" style={{ marginTop: 0, lineHeight: 1.5 }}>
        {t('appearance.intro')}
      </p>
      <div className="field-label" id="brand-colour-label">
        {t('appearance.brandColour')}
      </div>
      <div className="hstack wrap" role="group" aria-labelledby="brand-colour-label" style={{ gap: 10 }}>
        {THEMES.map((th) => {
          const on = th[0] === brand;
          return (
            <button
              key={th[0]}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setBrand(th[0]);
                toast(t('appearance.brandSet', { name: themeName(th[0]) }));
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '14px 10px',
                width: 104,
                border: `1.5px solid ${on ? 'var(--ac)' : 'var(--bd)'}`,
                borderRadius: 10,
                cursor: 'pointer',
                background: on ? 'var(--acT)' : 'var(--card)',
                color: 'var(--tx)',
                font: 'inherit',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: swatch(th),
                  boxShadow: 'inset 0 0 0 3px var(--card), 0 0 0 1px var(--bd)',
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'center' }}>{themeName(th[0])}</span>
            </button>
          );
        })}
      </div>
      <div className="field-label">{t('appearance.theme')}</div>
      <div style={{ width: 180 }}>
        <Seg<UiMode>
          label={t('appearance.theme')}
          options={[
            ['Light', t('appearance.light')],
            ['Dark', t('appearance.dark')],
          ]}
          value={uiMode}
          onChange={setUiMode}
        />
      </div>
      <label className="field-label" htmlFor="console-language">
        {tc('language.label')}
      </label>
      <div style={{ width: 260 }}>
        <Select<Locale> id="console-language" value={getLocale()} options={locales} onChange={(l) => void setLocale(l)} />
      </div>
      <p className="t-xs muted" style={{ margin: '6px 0 0' }}>
        {tc('language.hint')}
      </p>
    </Card>
  );
}
