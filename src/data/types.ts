export type Major = "T" | "M" | "S";

export const MAJOR_LABEL: Record<Major, string> = {
  T: "テクノロジ",
  M: "マネジメント",
  S: "ストラテジ",
};

// シラバス準拠の中分類(演習の分野選択と分析の集計単位)
export const MIDDLES_BY_MAJOR: Record<Major, string[]> = {
  T: [
    "基礎理論",
    "アルゴリズムとプログラミング",
    "コンピュータ構成要素",
    "システム構成要素",
    "ソフトウェア",
    "ハードウェア",
    "ユーザーインタフェース",
    "マルチメディア",
    "データベース",
    "ネットワーク",
    "セキュリティ",
    "開発技術",
  ],
  M: ["プロジェクトマネジメント", "サービスマネジメント", "システム監査"],
  S: [
    "システム戦略",
    "システム企画",
    "経営戦略",
    "技術戦略",
    "ビジネスインダストリ",
    "企業活動",
    "法務",
  ],
};

export interface AmQuestion {
  id: string; // 例: "2025r07a-am-01"
  examId: string;
  number: number; // 問番号 1-80
  text: string;
  choices: string[]; // ア・イ・ウ・エの順
  answer: number; // 正解の添字 0-3
  major: Major;
  middle: string;
  figure?: string; // 図表画像のパス(public/figures/ 配下)
  choicesInFigure?: boolean; // 選択肢自体が図表に含まれる場合 true
  explanation: string;
  point?: string; // 初学者ポイント
}

export interface PmPart {
  label: string; // 例: "(1)" "a"
  question: string;
  answer: string; // IPA公式解答例
  note?: string; // 解答の補足・採点観点
}

export interface PmSetumon {
  label: string; // 例: "設問1"
  parts: PmPart[];
}

export interface PmSection {
  heading?: string;
  body: string; // 本文(プレーンテキスト)
  figure?: string;
}

export interface PmQuestion {
  id: string; // 例: "2025r07a-pm-01"
  examId: string;
  number: number; // 問番号(1, 2, 9, 10, 11)
  field: string; // 例: "情報セキュリティ"
  title: string; // 題材の説明
  sections: PmSection[];
  setumon: PmSetumon[];
}

export interface ExamData {
  examId: string;
  label: string; // 例: "令和7年度 秋期"
  source: string; // 出典表記
  am: AmQuestion[];
  pm: PmQuestion[];
}
