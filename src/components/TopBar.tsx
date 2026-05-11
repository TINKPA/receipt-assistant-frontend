import React from 'react';
import { Search, Menu } from 'lucide-react';

interface TopBarProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  rightSlot?: React.ReactNode;
  showSearch?: boolean;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export default function TopBar({
  onToggleSidebar,
  sidebarOpen,
  rightSlot,
  showSearch = false,
  searchQuery = '',
  onSearchChange,
}: TopBarProps) {
  return (
    <header
      className="fixed top-0 right-0 left-0 lg:left-64 h-16 z-40 bg-background/70 backdrop-blur-xl flex justify-between items-center gap-4 px-4 lg:px-8 border-b border-outline-variant/15"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-3 flex-1 md:max-w-md min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={sidebarOpen}
          aria-controls="sidebar-drawer"
          className="lg:hidden flex items-center justify-center w-11 h-11 -ml-2 rounded-xl text-on-surface-variant hover:text-white hover:bg-surface-container-high transition-colors"
        >
          <Menu size={22} />
        </button>
        {showSearch && (
          <div className="relative w-full group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" size={18} />
            <input
              data-testid="topbar-search"
              className="w-full bg-surface-container-lowest border-none rounded-xl pl-10 pr-4 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary/40 transition-all"
              placeholder="Search transactions…"
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {rightSlot}
        <span className="hidden sm:inline text-base lg:text-lg font-black text-white font-headline tracking-tight whitespace-nowrap">Financial Gallery</span>
      </div>
    </header>
  );
}
