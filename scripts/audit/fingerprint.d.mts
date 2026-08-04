export function computeFingerprint(root?: string): { fingerprint: string; files: number };
export function gitHead(root?: string): {
  commit: string | null;
  short: string | null;
  committedAt: string | null;
  subject: string | null;
};
