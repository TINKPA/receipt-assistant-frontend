import { buildInfo as frontendBuildInfo } from '@/generated/buildInfo';

export interface BuildInfoShape {
  service: string;
  version: string;
  gitSha: string;
  gitShortSha: string;
  gitBranch: string;
  builtAt: string;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

/**
 * Build & Deploy receipt (board screen 24 build-card): an ink-dark
 * status line — the exact frontend + backend commit currently live,
 * plus the host and extractor health rows that frame Settings as the
 * engine room rather than a preferences page.
 */
export default function BuildInfoPanel({ backendBuildInfo }: { backendBuildInfo: BuildInfoShape | null }) {
  const fe = frontendBuildInfo as BuildInfoShape;
  const backendUp = backendBuildInfo != null;

  return (
    <div className="rounded-[14px] bg-[var(--color-ink)] px-4 py-3.5 text-[var(--color-paper)]">
      <p className="mb-2.5 flex items-center gap-1.5 font-mono text-[7.5px] uppercase tracking-[0.18em] text-[var(--color-paper-fold)]">
        <span
          className="h-1.5 w-1.5 rounded-full animate-pulse"
          style={{ background: backendUp ? '#8FA468' : 'var(--color-accent)' }}
        />
        Build &amp; Deploy · live on mini
      </p>
      <BuildRow label="frontend" value={`${fe.gitShortSha} · ${fmtDate(fe.builtAt)}`} />
      <BuildRow
        label="backend"
        value={backendBuildInfo ? `${backendBuildInfo.gitShortSha} · ${fmtDate(backendBuildInfo.builtAt)}` : '—'}
      />
      <BuildRow label="host" value="mini · orbstack · tailscale" />
      <BuildRow label="extractor" value={backendUp ? 'claude worker · healthy' : 'unreachable'} />
    </div>
  );
}

function BuildRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 font-mono text-[9px] tracking-[0.03em] text-[var(--color-ink-faint)]">
      <span>{label}</span>
      <span className="text-[var(--color-paper)]">{value}</span>
    </div>
  );
}
