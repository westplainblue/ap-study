import { HashRouter, Route, Routes } from "react-router-dom";
import TabBar from "./components/TabBar";
import Home from "./pages/Home";
import MockExam from "./pages/MockExam";
import MockRun from "./pages/MockRun";
import PmDetail from "./pages/PmDetail";
import PmList from "./pages/PmList";
import PracticeRun from "./pages/PracticeRun";
import PracticeSetup from "./pages/PracticeSetup";
import ReviewRun from "./pages/ReviewRun";
import Settings from "./pages/Settings";
import Stats from "./pages/Stats";

export default function App() {
  return (
    <HashRouter>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/practice" element={<PracticeSetup />} />
          <Route path="/practice/run" element={<PracticeRun />} />
          <Route path="/review/run" element={<ReviewRun />} />
          <Route path="/mock" element={<MockExam />} />
          <Route path="/mock/run" element={<MockRun />} />
          <Route path="/pm" element={<PmList />} />
          <Route path="/pm/:id" element={<PmDetail />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <TabBar />
    </HashRouter>
  );
}
