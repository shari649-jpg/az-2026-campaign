import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import AuthGuard from "./components/AuthGuard";
import AppShell from "./components/AppShell";
import HomePage from "./components/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AuthActionPage from "./pages/AuthActionPage";
import WaitlistPage from "./pages/WaitlistPage";
import AdminPage from "./pages/AdminPage";
import ProfilePage from "./pages/ProfilePage";
import AnnouncementsPage from "./pages/AnnouncementsPage";
import MessagingPage from "./tools/messaging/MessagingPage";
import RebuttalPage from "./tools/rebuttal/RebuttalPage";
import RapidResponsePage from "./tools/rapid-response/RapidResponsePage";
import ResourcesPage from "./tools/resources/ResourcesPage";
import LibraryPage from "./tools/library/LibraryPage";
import MediaPage from "./tools/media/MediaPage";
import QuickStartPage from "./tools/quick-start/QuickStartPage";
import ManualPage from "./tools/manual/ManualPage";
import MisinfoMonitorPage from "./tools/misinfo-monitor/MisinfoMonitorPage";
import StormsHubPage from "./tools/storms/StormsHubPage";
import PublicStormPage from "./pages/PublicStormPage";
import PublicStormsListPage from "./pages/PublicStormsListPage";
import VoterLookupPage from "./pages/VoterLookupPage";
import PromptSandboxPage from "./tools/sandbox/PromptSandboxPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          {/* Owned replacement for Firebase's default hosted auth-action
              page (Aug 2026, TODO #1) — handles password reset, email
              verification, and email-change-revert links. This route only
              actually gets hit once Firebase Console's "Customize action
              URL" is set for the Password reset and Email address
              verification templates (Authentication → Templates → pencil
              icon) to point here — see AuthActionPage.jsx's header comment. */}
          <Route path="/auth-action" element={<AuthActionPage />} />
          <Route path="/waitlist" element={<WaitlistPage />} />
          <Route path="/storm/:token" element={<PublicStormPage />} />
          <Route path="/storms/public" element={<PublicStormsListPage />} />
          <Route path="/voter-lookup" element={<VoterLookupPage />} />

          {/* Protected routes */}
          <Route element={
            <AuthGuard>
              <AppShell />
            </AuthGuard>
          }>
            <Route path="/"                element={<HomePage />} />
            {/* /research renders nothing here — AppShell keeps a
                persistent <ResearchPage /> mounted itself (see its header
                comment) so navigating away and back doesn't reset it. This
                route stays registered so the auth guard, layout, direct
                links, and back/forward navigation still work correctly. */}
            <Route path="/research"        element={null} />
            <Route path="/messaging"       element={<MessagingPage />} />
            <Route path="/rebuttal"        element={<RebuttalPage />} />
            <Route path="/rapid-response"  element={<RapidResponsePage />} />
            <Route path="/resources"       element={<ResourcesPage />} />
            <Route path="/library"         element={<LibraryPage />} />
            <Route path="/media"           element={<MediaPage />} />
            <Route path="/admin"           element={<AdminPage />} />
            <Route path="/profile"         element={<ProfilePage />} />
            <Route path="/announcements"   element={<AnnouncementsPage />} />
            <Route path="/quick-start"     element={<QuickStartPage />} />
            <Route path="/manual"          element={<ManualPage />} />
            <Route path="/misinfo-monitor" element={<MisinfoMonitorPage />} />
            <Route path="/storms"          element={<StormsHubPage />} />
            <Route path="/sandbox"         element={<PromptSandboxPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
