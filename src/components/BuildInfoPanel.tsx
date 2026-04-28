import React from 'react';
import { buildInfo as frontendBuildInfo } from '@/generated/buildInfo';

export interface BuildInfoShape {
  service: string;
  version: string;
  gitSha: string;
  gitShortSha: string;
  gitBranch: string;
  builtAt: string;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-outline-variant/10 last:border-b-0">
      <span className="text-sm text-on-surface-variant">{label}</span>
      <code className="text-sm text-white text-right break-all">{value}</code>
    </div>
  );
}

export default function BuildInfoPanel({ backendBuildInfo }: { backendBuildInfo: BuildInfoShape | null }) {
  const cards = [
    { title: 'Frontend', info: frontendBuildInfo },
    { title: 'Backend', info: backendBuildInfo },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2 w-full max-w-5xl">
      {cards.map((card) => (
        <section key={card.title} className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-5 text-left">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-bold text-white">{card.title}</h3>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-container-high text-primary border border-primary/20">
              {card.info ? `${card.info.version} (${card.info.gitShortSha})` : 'Unavailable'}
            </span>
          </div>
          {card.info ? (
            <div>
              <InfoRow label="Service" value={card.info.service} />
              <InfoRow label="Branch" value={card.info.gitBranch} />
              <InfoRow label="Commit" value={card.info.gitSha} />
              <InfoRow label="Built at" value={new Date(card.info.builtAt).toLocaleString()} />
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">Backend build info unavailable.</p>
          )}
        </section>
      ))}
    </div>
  );
}
