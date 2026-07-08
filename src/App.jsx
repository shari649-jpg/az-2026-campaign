import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import AuthGuard from "./components/AuthGuard";
import AppShell from "./components/AppShell";
import HomePage from "./components/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import WaitlistPage from "./pages/WaitlistPage";
import AdminPage from "./pages/AdminPage";
import ProfilePage from "./pages/ProfilePage";
import AnnouncementsPage from "./pages/AnnouncementsPage";
import ResearchPage from "./tools/research/ResearchPage";
import MessagingPage from "./tools/messaging/MessagingPage";
import RebuttalPage from "./tools/rebuttal/RebuttalPage";
import RapidResponsePage from "./tools/rapid-response/RapidResponsePage";
import ResourcesPage from "./tools/resources/ResourcesPage";
import LibraryPage from "./tools/library/LibraryPage";
import MediaPage from "./tools/media/MediaPage";
import QuickStartPage from "./tools/quick-start/QuickStartPage";
import MisinfoMonitorPage from "./tools/misinfo-monitor/MisinfoMonitorPage";
import StormsHubPage from "./tools/storms/StormsHubPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/waitlist" element={<WaitlistPage />} />

          {/* Protected routes */}
          <Route element={
            <AuthGuard>
              <AppShell />
            </AuthGuard>
          }>
            <Route path="/"                element={<HomePage />} />
            <Route path="/research"        element={<ResearchPage />} />
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
            <Route path="/misinfo-monitor" element={<MisinfoMonitorPage />} />
            <Route path="/storms"          element={<StormsHubPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
