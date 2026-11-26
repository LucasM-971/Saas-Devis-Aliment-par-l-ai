import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { PageTransition } from '@/components/PageTransition';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AuthLayout from '@/layouts/AuthLayout';
import DashboardLayout from '@/layouts/DashboardLayout';
import Landing from '@/pages/Landing';
import DemoEntry from '@/pages/DemoEntry';
import HostedChat from '@/pages/HostedChat';
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import ForgotPassword from '@/pages/auth/ForgotPassword';
import ResetPassword from '@/pages/auth/ResetPassword';
import VerifyEmail from '@/pages/auth/VerifyEmail';
import AcceptInvite from '@/pages/auth/AcceptInvite';
import Dashboard from '@/pages/Dashboard';
import Onboarding from '@/pages/Onboarding';
import CompanyNew from '@/pages/CompanyNew';
import Quotes from '@/pages/Quotes';
import QuoteTemplate from '@/pages/QuoteTemplate';
import Leads from '@/pages/Leads';
import Members from '@/pages/Members';
import Audit from '@/pages/Audit';
import Settings from '@/pages/Settings';
import Subscription from '@/pages/Subscription';
import ChatAI from '@/pages/ChatAI';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Authentification */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
          </Route>

          {/* Espace applicatif protégé */}
          <Route element={<ProtectedRoute />}>
            {/* Onboarding post-inscription : plein écran, hors chrome dashboard */}
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/app" element={<DashboardLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="companies/new" element={<CompanyNew />} />
              <Route path="quotes" element={<Quotes />} />
              <Route path="quote-template" element={<QuoteTemplate />} />
              <Route path="leads" element={<Leads />} />
              <Route path="members" element={<Members />} />
              <Route path="audit" element={<Audit />} />
              <Route path="chat" element={<ChatAI />} />
              <Route path="subscription" element={<Subscription />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>

          {/* Chat hébergé — lien partageable donné aux clients (sans site web) */}
          <Route path="/c/:publicId" element={<HostedChat />} />

          {/* Page d'accueil publique */}
          <Route path="/" element={<PageTransition><Landing /></PageTransition>} />
          <Route path="/demo" element={<PageTransition><DemoEntry /></PageTransition>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
