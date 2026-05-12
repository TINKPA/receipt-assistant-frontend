import React from 'react';
import Layout from './components/Layout';
import type { DockDestination } from './components/FloatingDock';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import MonthlyReview from './components/MonthlyReview';
import YearlyReview from './components/YearlyReview';
import Batches from './components/Batches';
import BatchDetail from './components/BatchDetail';
import Capture from './components/Capture';
import ProcessingToast from './components/ProcessingToast';
import { useProcessingJobs } from './components/useProcessingJobs';
import ReceiptDetail from './components/ReceiptDetail';
import MerchantDetail from './components/MerchantDetail';
import BuildInfoPanel from './components/BuildInfoPanel';
import { fetchBackendBuildInfo, type BuildInfo } from './lib/api';

type ActiveTab =
  | 'dashboard'
  | 'transactions'
  | 'batches'
  | 'monthly'
  | 'yearly'
  | 'settings'
  | 'add';

/** Map App.tsx's fine-grained tab state onto the 3-pill dock. */
function dockDestinationFor(tab: ActiveTab): DockDestination {
  if (tab === 'add') return 'add';
  if (tab === 'monthly' || tab === 'yearly') return 'review';
  // dashboard / transactions / batches / settings → Books
  return 'books';
}

export default function App() {
  const [activeTab, setActiveTab] = React.useState<ActiveTab>('dashboard');
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [selectedReceiptId, setSelectedReceiptId] = React.useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = React.useState<string | null>(null);
  const [selectedMerchantBrandId, setSelectedMerchantBrandId] = React.useState<string | null>(null);
  const [backendBuildInfo, setBackendBuildInfo] = React.useState<BuildInfo | null>(null);
  const [transactionsSearch, setTransactionsSearch] = React.useState('');
  const { jobs, addJob, removeJob } = useProcessingJobs();

  React.useEffect(() => {
    fetchBackendBuildInfo().then(setBackendBuildInfo).catch(() => setBackendBuildInfo(null));
  }, []);

  const handleUploadComplete = (job: { batchId: string; ingestId: string; filename: string }) => {
    addJob(job);
    setRefreshKey((k) => k + 1);
    // After upload, drop back to Books so the user sees their entry processing.
    goToTab('dashboard');
  };

  const goToTab = (tab: ActiveTab) => {
    setSelectedReceiptId(null);
    setSelectedBatchId(null);
    setSelectedMerchantBrandId(null);
    setTransactionsSearch('');
    setActiveTab(tab);
  };

  const handleDockNavigate = (dest: 'books' | 'review') => {
    if (dest === 'books') {
      goToTab('dashboard');
    } else {
      goToTab('monthly');
    }
  };

  const handleSelectReceipt = (receiptId: string) => setSelectedReceiptId(receiptId);
  const handleBackFromDetail = () => setSelectedReceiptId(null);
  const handleSelectBatch = (batchId: string) => setSelectedBatchId(batchId);
  const handleBackFromBatch = () => setSelectedBatchId(null);
  const handleSelectMerchant = (brandId: string) => {
    setSelectedReceiptId(null);
    setSelectedMerchantBrandId(brandId);
  };
  const handleBackFromMerchant = () => setSelectedMerchantBrandId(null);

  const renderContent = () => {
    if (activeTab === 'add') {
      return (
        <Capture
          onCancel={() => goToTab('dashboard')}
          onComplete={handleUploadComplete}
        />
      );
    }

    if (selectedReceiptId) {
      return (
        <ReceiptDetail
          receiptId={selectedReceiptId}
          onBack={handleBackFromDetail}
          onSelectMerchant={handleSelectMerchant}
          onAfterMutation={() => setRefreshKey((k) => k + 1)}
        />
      );
    }

    if (selectedMerchantBrandId) {
      return (
        <MerchantDetail
          key={selectedMerchantBrandId}
          brandId={selectedMerchantBrandId}
          onBack={handleBackFromMerchant}
          onSelectReceipt={handleSelectReceipt}
        />
      );
    }

    if (activeTab === 'batches' && selectedBatchId) {
      return (
        <BatchDetail
          batchId={selectedBatchId}
          onBack={handleBackFromBatch}
          onSelectTransaction={handleSelectReceipt}
        />
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            key={refreshKey}
            onSelectReceipt={handleSelectReceipt}
            onSelectMerchant={handleSelectMerchant}
            onViewAllTransactions={() => setActiveTab('transactions')}
          />
        );
      case 'transactions':
        return (
          <Transactions
            key={refreshKey}
            onSelectReceipt={handleSelectReceipt}
            onSelectMerchant={handleSelectMerchant}
            searchQuery={transactionsSearch}
            onSearchChange={setTransactionsSearch}
            onClearSearch={() => setTransactionsSearch('')}
          />
        );
      case 'batches':
        return <Batches key={refreshKey} onSelectBatch={handleSelectBatch} />;
      case 'monthly':
        return <MonthlyReview />;
      case 'yearly':
        return <YearlyReview />;
      case 'settings':
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="font-display text-3xl italic font-medium tracking-tight">Build &amp; Deploy</h2>
              <p className="text-[color:var(--color-ink-muted)] max-w-2xl">
                Verify which frontend and backend build is currently deployed.
              </p>
            </div>
            <BuildInfoPanel backendBuildInfo={backendBuildInfo} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Layout
        dockActive={dockDestinationFor(activeTab)}
        onDockNavigate={handleDockNavigate}
        onAddTransaction={() => goToTab('add')}
        dockHidden={activeTab === 'add'}
      >
        {renderContent()}
      </Layout>

      <ProcessingToast
        jobs={jobs}
        onJobDone={removeJob}
        onRefresh={() => setRefreshKey((k) => k + 1)}
      />
    </>
  );
}
