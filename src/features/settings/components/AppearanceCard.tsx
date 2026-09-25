import { Badge, Card, Seg } from '@/components/ui';
import { toast, useUi } from '@/store/ui';
import { swatch, THEMES, type UiMode } from '@/theme/themes';

/** Personal appearance: stored on this device only (Zustand + localStorage), never sent to the API. */
export function AppearanceCard() {
  const brand = useUi((s) => s.brand);
  const uiMode = useUi((s) => s.uiMode);
  const setBrand = useUi((s) => s.setBrand);
  const setUiMode = useUi((s) => s.setUiMode);

  return (
    <Card title="Appearance" right={<Badge tone="info">Only you · this device</Badge>}>
      <p className="t-sm muted" style={{ marginTop: 0, lineHeight: 1.5 }}>
        Sets the accent used across buttons, navigation, charts and selected states in your console. Applies instantly and doesn’t change
        anything for other staff.
      </p>
      <div className="field-label" id="brand-colour-label">
        Brand colour
      </div>
      <div className="hstack wrap" role="group" aria-labelledby="brand-colour-label" style={{ gap: 10 }}>
        {THEMES.map((t) => {
          const on = t[0] === brand;
          return (
            <button
              key={t[0]}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setBrand(t[0]);
                toast(`Brand colour set to ${t[0]} — only on this device`);
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
                  background: swatch(t),
                  boxShadow: 'inset 0 0 0 3px var(--card), 0 0 0 1px var(--bd)',
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'center' }}>{t[0]}</span>
            </button>
          );
        })}
      </div>
      <div className="field-label">Interface theme</div>
      <div style={{ width: 180 }}>
        <Seg<UiMode> label="Interface theme" options={['Light', 'Dark']} value={uiMode} onChange={setUiMode} />
      </div>
    </Card>
  );
}
