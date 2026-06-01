import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes, Tag, ChevronRight } from 'lucide-react';
import BuildInfoPanel from './BuildInfoPanel';
import { fetchBackendBuildInfo } from '../lib/api';
import { qk } from '../lib/queryKeys';

interface SettingsProps {
  /** Open the Products catalog screen (route: /settings/products). */
  onOpenProducts: () => void;
  /** Open the Brands registry screen (route: /settings/brands). */
  onOpenBrands: () => void;
}

/**
 * Settings landing screen. Extracted verbatim from the old App.tsx switch
 * arm when the app moved from state-based navigation to TanStack Router —
 * each catalog card now drives a real route via the injected callbacks.
 */
export default function Settings({ onOpenProducts, onOpenBrands }: SettingsProps) {
  const { data: backendBuildInfo = null } = useQuery({
    queryKey: qk.buildInfo,
    queryFn: fetchBackendBuildInfo,
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-display text-3xl italic font-medium tracking-tight">Settings</h2>
        <p className="text-[color:var(--color-ink-muted)] max-w-2xl">
          Catalog management and deployment metadata.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <SettingsCard
          icon={<Boxes size={18} />}
          title="Products"
          subtitle="Catalog SSOT, owned items, merge duplicates"
          onClick={onOpenProducts}
        />
        <SettingsCard
          icon={<Tag size={18} />}
          title="Brands"
          subtitle="Brand registry + icon asset picker"
          onClick={onOpenBrands}
        />
      </div>

      <div className="space-y-2 pt-4">
        <h3 className="font-display text-xl italic font-medium tracking-tight">Build &amp; Deploy</h3>
        <p className="text-[color:var(--color-ink-muted)] text-sm">
          Which frontend / backend build is currently deployed.
        </p>
      </div>
      <BuildInfoPanel backendBuildInfo={backendBuildInfo} />
    </div>
  );
}

function SettingsCard({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-[18px] border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-5 py-4 flex items-center gap-4 hover:bg-[color:var(--color-paper-deep)]/30 transition-colors"
    >
      <div className="shrink-0 w-10 h-10 rounded-full bg-[color:var(--color-paper-deep)] flex items-center justify-center text-[color:var(--color-ink)]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-[15px]">{title}</div>
        <div className="text-[12px] text-[color:var(--color-ink-muted)] mt-0.5">{subtitle}</div>
      </div>
      <ChevronRight size={16} className="text-[color:var(--color-ink-muted)]" />
    </button>
  );
}
