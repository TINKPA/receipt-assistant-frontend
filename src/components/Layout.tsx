import React from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onAddTransaction: () => void;
}

export default function Layout({ children, activeTab, onTabChange, onAddTransaction }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={onTabChange} 
        onAddTransaction={onAddTransaction} 
      />
      <div className="flex-1 ml-64 flex flex-col">
        <TopBar />
        <main className="flex-1 pt-24 pb-12 px-10 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
