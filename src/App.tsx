import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Layout } from './components/Layout';
import { ToastContainer } from './components/ui/Toast';
import { HomePage } from './pages/HomePage';
import { BillPage } from './pages/BillPage';
import { ScanPage } from './pages/ScanPage';
import { ReviewPage } from './pages/ReviewPage';
import { ResultsPage } from './pages/ResultsPage';
import { FriendPage } from './pages/FriendPage';

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/bill" element={<BillPage />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="/s/:code" element={<FriendPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
        <ToastContainer />
      </HashRouter>
    </AppProvider>
  );
}
