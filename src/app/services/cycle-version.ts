// Pure semver helper for auto-assigned cycle versions. When a human omits the
// version at create time, the service derives the next one: the semver-max of
// the project's existing cycle versions with patch +1; no cycles yet → v0.0.1.
// (2-axis note: auto = patch bump; the human overrides for minor/major.)

const VERSION_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

type Semver = readonly [major: number, minor: number, patch: number];

const parse = (raw: string): Semver | undefined => {
  const m = VERSION_RE.exec(raw);
  if (!m) return undefined;
  return [Number(m[1]), Number(m[2]), Number(m[3])] as const;
};

/** Lexicographic semver compare: positive when `a` is greater. */
const compare = (a: Semver, b: Semver): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * Next auto version for a project: semver-max of `versions` with patch +1.
 * Non-`vX.Y.Z` entries are ignored. Empty (or all-invalid) → "v0.0.1".
 */
export const nextVersion = (versions: readonly string[]): string => {
  const parsed = versions
    .map(parse)
    .filter((v): v is Semver => v !== undefined);
  if (parsed.length === 0) return "v0.0.1";
  const max = parsed.reduce((acc, v) => (compare(v, acc) > 0 ? v : acc));
  return `v${max[0]}.${max[1]}.${max[2] + 1}`;
};
