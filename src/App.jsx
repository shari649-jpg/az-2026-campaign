import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "./components/AppShell";
import HomePage from "./components/HomePage";
import ResearchPage from "./tools/research/ResearchPage";
import MessagingPage from "./tools/messaging/MessagingPage";
import RebuttalPage from "./tools/rebuttal/RebuttalPage";
import RapidResponsePage from "./tools/rapid-response/RapidResponsePage";
import ResourcesPage from "./tools/resources/ResourcesPage";
import LibraryPage from "./tools/library/LibraryPage";
import MediaPage from "./tools/media/MediaPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/research" element={<ResearchPage />} />
          <Route path="/messaging" element={<MessagingPage />} />
          <Route path="/rebuttal" element={<RebuttalPage />} />
          <Route path="/rapid-response" element={<RapidResponsePage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/media" element={<MediaPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
