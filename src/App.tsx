import React from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import MonthlyReview from './components/MonthlyReview';
import YearlyReview from './components/YearlyReview';
import Batches from './components/Batches';
import BatchDetail from './components/BatchDetail';
import AddTransactionModal from './components/AddTransactionModal';
import ProcessingToast from './components/ProcessingToast';
import { useProcessingJobs } from './components/useProcessingJobs';
import ReceiptDetail from './components/ReceiptDetail';
import BuildInfoPanel from './components/BuildInfoPanel';
import { buildInfo as frontendBuildInfo } from './generated/buildInfo';
import { fetchBackendBuildInfo, type BuildInfo } from './lib/api';

export default function App() {
  const [activeTab, setActiveTab] = React.useState('dashboard');
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [selectedReceiptId, setSelectedReceiptId] = React.useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = React.useState<string | null>(null);
  const [backendBuildInfo, setBackendBuildInfo] = React.useState<BuildInfo | null>(null);
  const { jobs, addJob, removeJob } = useProcessingJobs();

  React.useEffect(() => {
    fetchBackendBuildInfo().then(setBackendBuildInfo).catch(() => setBackendBuildInfo(null));
  }, []);

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

  const handleSelectBatch = (batchId: string) => {
    setSelectedBatchId(batchId);
  };

  const handleBackFromBatch = () => {
    setSelectedBatchId(null);
  };

  const renderContent = () => {
    // Receipt detail view takes priority — can be opened from anywhere.
    if (selectedReceiptId) {
      return <ReceiptDetail receiptId={selectedReceiptId} onBack={handleBackFromDetail} />;
    }

    // Batch detail takes priority within the Uploads tab.
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
        return <Dashboard key={refreshKey} onSelectReceipt={handleSelectReceipt} />;
      case 'transactions':
        return <Transactions key={refreshKey} onSelectReceipt={handleSelectReceipt} />;
      case 'batches':
        return <Batches key={refreshKey} onSelectBatch={handleSelectBatch} />;
      case 'monthly':
        return <MonthlyReview />;
      case 'yearly':
        return <YearlyReview />;
      case 'settings':
        return (
          <div className="space-y-6 animate-in fade-in duration-700">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white font-headline">Build & Deploy Info</h2>
              <p className="text-on-surface-variant max-w-2xl">Use this to verify exactly which frontend and backend build is currently deployed.</p>
            </div>
            <BuildInfoPanel backendBuildInfo={backendBuildInfo} />
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
          setSelectedBatchId(null);
          setActiveTab(tab);
        }}
        onAddTransaction={() => setIsModalOpen(true)}
        rightSlot={
          <span className="hidden xl:inline rounded-full border border-primary/20 bg-surface-container-high px-3 py-1 text-xs font-medium text-on-surface-variant">
            {frontendBuildInfo.gitShortSha}
          </span>
        }
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
