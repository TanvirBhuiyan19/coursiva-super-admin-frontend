// Amounts in a given currency (the platform `billing_currency`), following the active locale.
import { intlLocale } from '@/lib/i18n';

const format = (currency: string, o: Intl.NumberFormatOptions = {}) => {
  try {
    return new Intl.NumberFormat(intlLocale(), { style: 'currency', currency, ...o });
  } catch {
    // Unknown code from the API: fall back to plain numbers with the code alongside.
    return null;
  }
};

/** Minor units → "$0.50" / "€1.25" (the code when Intl doesn't know it: "0.50 XYZ"). */
export function formatMinor(minor: number, currency: string) {
  const f = format(currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return f ? f.format(minor / 100) : `${(minor / 100).toFixed(2)} ${currency}`;
}

/** "$", "€", "CA$"… or the ISO code itself. */
export function currencySymbol(currency: string) {
  return (
    format(currency)
      ?.formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? currency
  );
}
