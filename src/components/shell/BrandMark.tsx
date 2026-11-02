/** The uploaded platform logo, or the built-in "C" square when there is none (decorative: the name shows beside it). */
export function BrandMark({ logo, name }: { logo: string | null; name: string }) {
  return logo ? (
    <img className="brand-logo" src={logo} alt={name} />
  ) : (
    <div className="sb-logo" aria-hidden="true">
      C
    </div>
  );
}
