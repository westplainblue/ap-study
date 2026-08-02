import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import AchievementToast from "./components/AchievementToast";
import AiChat from "./components/AiChat";
import TabBar from "./components/TabBar";
import { loadTermsData } from "./data/terms";
import { reconcileSilent } from "./lib/achievements";
import { repairReviewFromStorage } from "./lib/progress";
import { syncInBackground } from "./lib/sync";
import { reconcileVocabFromStorage } from "./lib/vocab";
import CalcRun from "./pages/CalcRun";
import CalcSetup from "./pages/CalcSetup";
import DrillRun from "./pages/DrillRun";
import DrillSetup from "./pages/DrillSetup";
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
import VocabList from "./pages/VocabList";
import VocabRun from "./pages/VocabRun";

export default function App() {
  useEffect(() => {
    reconcileSilent(); // 既存の学習履歴から実績を遡及解除(トーストなし)
    // 過去のマージ欠陥で復活した「卒業済みのはずの復習」を墓標化する(冪等)
    repairReviewFromStorage();
    syncInBackground();
    // 用語辞書を読み込み、過去の誤答からことば帳を導出する(冪等・変更なしなら保存しない)
    loadTermsData().then(() => reconcileVocabFromStorage());
  }, []);

  return (
    <HashRouter>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/practice" element={<PracticeSetup />} />
          <Route path="/practice/run" element={<PracticeRun />} />
          <Route path="/drill" element={<DrillSetup />} />
          <Route path="/drill/run" element={<DrillRun />} />
          <Route path="/calc" element={<CalcSetup />} />
          <Route path="/calc/run" element={<CalcRun />} />
          <Route path="/review/run" element={<ReviewRun />} />
          <Route path="/mock" element={<MockExam />} />
          <Route path="/mock/run" element={<MockRun />} />
          <Route path="/pm" element={<PmList />} />
          <Route path="/pm/:id" element={<PmDetail />} />
          <Route path="/vocab" element={<VocabList />} />
          <Route path="/vocab/run" element={<VocabRun />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <AchievementToast />
      <AiChat />
      <TabBar />
    </HashRouter>
  );
}
