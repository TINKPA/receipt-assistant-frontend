import React, { useState } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onAddTransaction: () => void;
  rightSlot?: React.ReactNode;
  showSearch?: boolean;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export default function Layout({
  children,
  activeTab,
  onTabChange,
  onAddTransaction,
  rightSlot,
  showSearch,
  searchQuery,
  onSearchChange,
}: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        onAddTransaction={onAddTransaction}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
      <div className="flex-1 lg:ml-64 flex flex-col">
        <TopBar
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          sidebarOpen={sidebarOpen}
          rightSlot={rightSlot}
          showSearch={showSearch}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
        />
        <main className="flex-1 pt-24 pb-12 px-6 lg:px-10 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
