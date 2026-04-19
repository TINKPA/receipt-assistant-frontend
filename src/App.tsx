import React from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import MonthlyReview from './components/MonthlyReview';
import YearlyReview from './components/YearlyReview';
import AddTransactionModal from './components/AddTransactionModal';
import ProcessingToast from './components/ProcessingToast';
import { useProcessingJobs } from './components/useProcessingJobs';
import ReceiptDetail from './components/ReceiptDetail';

export default function App() {
  const [activeTab, setActiveTab] = React.useState('dashboard');
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [selectedReceiptId, setSelectedReceiptId] = React.useState<string | null>(null);
  const { jobs, addJob, removeJob } = useProcessingJobs();

  const handleUploadComplete = (job: { batchId: string; ingestId: string; filename: string }) => {
    addJob(job);
    setRefreshKey((k) => k + 1);
  };

  const handleSelectReceipt = (receiptId: string) => {
    setSelectedReceiptId(receiptId);
  };

  const handleBackFromDetail = () => {
    setSelectedReceiptId(null);
  };

  const renderContent = () => {
    // Receipt detail view takes priority
    if (selectedReceiptId) {
      return <ReceiptDetail receiptId={selectedReceiptId} onBack={handleBackFromDetail} />;
    }

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard key={refreshKey} onSelectReceipt={handleSelectReceipt} />;
      case 'transactions':
        return <Transactions key={refreshKey} onSelectReceipt={handleSelectReceipt} />;
      case 'monthly':
        return <MonthlyReview />;
      case 'yearly':
        return <YearlyReview />;
      case 'settings':
        return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4 animate-in fade-in duration-700">
            <div className="w-20 h-20 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <h2 className="text-2xl font-bold text-white font-headline">Account Settings</h2>
            <p className="text-on-surface-variant max-w-md">Customize your private banking experience, manage security protocols, and configure AI-driven insights.</p>
            <button className="px-6 py-2 bg-surface-container-high text-primary font-bold rounded-xl border border-primary/20 hover:bg-surface-container-highest transition-all">
              Configure Profile
            </button>
          </div>
        );
      default:
        return <Dashboard key={refreshKey} onSelectReceipt={handleSelectReceipt} />;
    }
  };

  return (
    <>
      <Layout
        activeTab={activeTab}
        onTabChange={(tab) => {
          setSelectedReceiptId(null);
          setActiveTab(tab);
        }}
        onAddTransaction={() => setIsModalOpen(true)}
      >
        {renderContent()}
      </Layout>

      <AddTransactionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onComplete={handleUploadComplete}
      />

      <ProcessingToast
        jobs={jobs}
        onJobDone={removeJob}
        onRefresh={() => setRefreshKey((k) => k + 1)}
      />
    </>
  );
}
