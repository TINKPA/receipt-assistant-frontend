import React from 'react';
import { Search, Bell, UserCircle } from 'lucide-react';

export default function TopBar() {
  return (
    <header className="fixed top-0 right-0 left-64 h-16 z-40 bg-background/70 backdrop-blur-xl flex justify-between items-center px-8 border-b border-outline-variant/15">
      <div className="flex items-center gap-6 flex-1 max-w-md">
        <div className="relative w-full group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" size={18} />
          <input 
            className="w-full bg-surface-container-lowest border-none rounded-xl pl-10 pr-4 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary/40 transition-all" 
            placeholder="Search transactions, assets, or reports..." 
            type="text"
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4">
          <button className="text-on-surface-variant hover:text-white transition-colors relative">
            <Bell size={20} />
            <span className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full border-2 border-background"></span>
          </button>
          <button className="text-on-surface-variant hover:text-white transition-colors">
            <UserCircle size={20} />
          </button>
        </div>
        <span className="text-lg font-black text-white font-headline tracking-tight">Financial Gallery</span>
      </div>
    </header>
  );
}
