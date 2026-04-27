import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  ReceiptText,
  CalendarDays,
  CalendarRange,
  FileStack,
  Settings,
  Plus,
} from 'lucide-react';
import { cn } from '../lib/utils';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onAddTransaction: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export default function Sidebar({
  activeTab,
  onTabChange,
  onAddTransaction,
  sidebarOpen,
  setSidebarOpen,
}: SidebarProps) {
  const drawerRef = useRef<HTMLElement>(null);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transactions', icon: ReceiptText },
    { id: 'batches', label: 'Uploads', icon: FileStack },
    { id: 'monthly', label: 'Monthly Review', icon: CalendarDays },
    { id: 'yearly', label: 'Yearly Review', icon: CalendarRange },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleNavClick = (tabId: string) => {
    onTabChange(tabId);
    setSidebarOpen(false);
  };

  const handleAddClick = () => {
    onAddTransaction();
    setSidebarOpen(false);
  };

  // Body scroll lock + focus trap + Escape-to-close, only while drawer is open on small viewports.
  // The `(min-width: 1024px)` query matches Tailwind's `lg` breakpoint — at and above it the
  // sidebar is persistent and these effects must NOT run.
  useEffect(() => {
    if (!sidebarOpen) return;
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const drawer = drawerRef.current;
    const focusables = drawer
      ? Array.from(
          drawer.querySelectorAll<HTMLElement>(
            'a, button, [tabindex]:not([tabindex="-1"]), input, select, textarea',
          ),
        ).filter((el) => !el.hasAttribute('disabled'))
      : [];
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        return;
      }
      if (e.key !== 'Tab' || focusables.length === 0) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [sidebarOpen, setSidebarOpen]);

  return (
    <>
      {/* Scrim — only renders < lg while drawer is open */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="sidebar-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm lg:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <aside
        ref={drawerRef}
        id="sidebar-drawer"
        aria-label="Primary navigation"
        className={cn(
          "h-screen w-64 fixed left-0 top-0 bg-background flex flex-col py-8 px-4 border-r border-outline-variant/15 z-50",
          "transition-transform duration-300 ease-out",
          "lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-10 px-2">
          <h1 className="text-xl font-bold text-primary tracking-tight font-headline">Wealth Management</h1>
          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mt-1 opacity-60">Private Banking</p>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 scale-95 active:scale-90",
                activeTab === item.id
                  ? "text-primary font-bold border-r-2 border-primary bg-surface-container-high"
                  : "text-on-surface-variant font-medium hover:bg-surface-container-high hover:text-primary"
              )}
            >
              <item.icon size={20} />
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto px-2">
          <button
            onClick={handleAddClick}
            className="w-full py-3 bg-gradient-to-br from-primary to-on-primary-container text-on-primary rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/10 hover:opacity-90 transition-opacity"
          >
            <Plus size={18} />
            <span className="text-sm">Add Transaction</span>
          </button>

          <div className="mt-6 flex items-center gap-3 pt-6 border-t border-outline-variant/15">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-primary/20">
              <img
                src="https://picsum.photos/seed/executive/100/100"
                alt="User"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-white truncate">Julian Vance</p>
              <p className="text-[10px] text-on-surface-variant truncate">Platinum Member</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
