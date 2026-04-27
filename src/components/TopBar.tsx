import React from 'react';
import { Search, Bell, UserCircle, Menu } from 'lucide-react';

interface TopBarProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export default function TopBar({ onToggleSidebar, sidebarOpen }: TopBarProps) {
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
        <div className="relative w-full group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" size={18} />
          <input
            className="w-full bg-surface-container-lowest border-none rounded-xl pl-10 pr-4 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary/40 transition-all"
            placeholder="Search transactions, assets, or reports..."
            type="text"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-6 shrink-0">
        <div className="flex items-center gap-2 sm:gap-4">
          <button className="text-on-surface-variant hover:text-white transition-colors relative w-11 h-11 flex items-center justify-center">
            <Bell size={20} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-background"></span>
          </button>
          <button className="text-on-surface-variant hover:text-white transition-colors w-11 h-11 flex items-center justify-center">
            <UserCircle size={20} />
          </button>
        </div>
        <span className="hidden sm:inline text-base lg:text-lg font-black text-white font-headline tracking-tight whitespace-nowrap">Financial Gallery</span>
      </div>
    </header>
  );
}
