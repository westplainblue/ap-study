/**
 * ホーム画面に出す「一言」。時間帯ごとの大きなプールから選び、
 * 学習状況(連続日数・復習・試験日など)に応じた文言もときどき混ぜる。
 */
import { dueReviewIds, studyStats, type ProgressState } from "./progress";

type Bucket = "morning" | "noon" | "evening" | "night";

function bucketOf(hour: number): Bucket {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "noon";
  if (hour >= 17 && hour < 23) return "evening";
  return "night"; // 23:00〜4:59
}

const POOLS: Record<Bucket, string[]> = {
  morning: [
    "おはようございます。今日の一問目、いきましょう。",
    "朝は記憶のゴールデンタイム。1問がよく染みます。",
    "コーヒーと過去問で、いい一日の始まりを。",
    "おはよう。脳のウォームアップに1問どうぞ。",
    "朝活、えらい。今日のあなたは一歩リードです。",
    "新しい一日は、新しい1問から。",
    "早起きは三問の徳。",
    "目覚めの脳に、ちょっとしたアルゴリズムを。",
    "おはようございます。まずは軽く肩慣らしを。",
    "今朝の1問が、夜の自信になります。",
  ],
  noon: [
    "こんにちは。スキマ時間に1問いかがですか。",
    "ランチ後の1問で、午後もシャキッと。",
    "お昼休みの5分、過去問に投資してみます?",
    "こんにちは。今日の進捗、いい感じですか?",
    "昼下がりの復習は、記憶の中間コミット。",
    "休憩がてら、軽く1問だけ。",
    "午後の眠気には、手を動かす演習を。",
    "こんにちは。無理せず、でも一歩は前へ。",
    "お昼の1問、午後の集中力に効きます。",
  ],
  evening: [
    "こんばんは。今日の学びを1問振り返りましょう。",
    "1日の終わりに、間違えた問題をひとつ復習。",
    "こんばんは。今日のあなたは、昨日より賢い。",
    "夜は復習向き。記憶は眠る間に定着します。",
    "お疲れさまです。ラスト1問で今日を締めくくり。",
    "今日の頑張り、ログにしっかり刻まれています。",
    "夜のひととき、静かに1問と向き合う時間を。",
    "こんばんは。5分だけ、未来の自分に投資を。",
    "今日も1問、積み上げましたね。",
  ],
  night: [
    "夜更かしですね。無理は禁物、でも1問だけなら…",
    "深夜の演習、お疲れさまです。ほどほどに。",
    "こんな時間まで、えらい。でも睡眠も立派な学習。",
    "静かな夜は、難問と向き合う好機かも。",
    "夜フクロウさん、根を詰めすぎないで。",
    "今日はもう休んで、明日の脳に任せるのも手です。",
    "深夜テンション、嫌いじゃないです。1問いきます?",
    "夜は更けても、知識は裏切りません。",
  ],
};

const ANYTIME: string[] = [
  "エラーは友達。間違えた数だけ強くなれます。",
  "正答率より継続率。今日も1コミット。",
  "「あとで復習」は最強の記憶術です。",
  "知識も複利で増える。今日の1問が合格点に。",
  "積み上げが大事。ヒープもスタックも人生も。",
  "小さな一問、大きな一歩。",
  "昨日の自分に、今日の1問で差をつけよう。",
  "迷ったら手を動かす。演習は最高の教科書。",
  "ローマは一日にして成らず、合格も一問ずつ。",
  "継続は力なり。バッジもきっと待っています。",
  "解けなくても大丈夫。解けるようになれば勝ち。",
  "今日のあなたの自己ベスト、更新しにいきましょう。",
];

function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86400000);
}

function contextMessages(state: ProgressState): string[] {
  const stats = studyStats(state);
  const due = dueReviewIds(state).length;
  const msgs: string[] = [];

  if (stats.total === 0) {
    msgs.push("はじめまして。まずは気軽に1問どうぞ。");
    return msgs; // 初回はこれだけ
  }
  if (stats.streak === 0) msgs.push("おかえりなさい。今日からまた1問ずつ。");
  if (stats.streak >= 7) msgs.push(`${stats.streak}日連続、もはや習慣ですね。`);
  else if (stats.streak >= 3) msgs.push(`${stats.streak}日連続、その調子です!`);
  if (due >= 1) msgs.push(`復習が${due}問、いまが定着のチャンスです。`);

  const exam = state.settings.examDate;
  if (exam) {
    const left = daysUntil(exam);
    if (left >= 0 && left <= 7) msgs.push(`試験まであと${left}日。積み重ねを信じて。`);
    else if (left > 7 && left <= 30) msgs.push(`試験まであと${left}日。ラストスパート。`);
  }
  return msgs;
}

const LAST_KEY = "ap-greet-last";

/** ホームの一言を1つ返す(時間帯プール + 汎用 + 状況メッセージから抽選) */
export function pickGreeting(state: ProgressState, now = new Date()): string {
  const b = bucketOf(now.getHours());
  const ctx = contextMessages(state);
  // 状況メッセージは少し重み付け(2回入れる)して、ときどき出す
  const candidates = [...POOLS[b], ...ANYTIME, ...ctx, ...ctx];

  let last: string | null = null;
  try {
    last = sessionStorage.getItem(LAST_KEY);
  } catch {
    last = null;
  }

  let pick = candidates[Math.floor(Math.random() * candidates.length)];
  for (let i = 0; i < 4 && pick === last && candidates.length > 1; i++) {
    pick = candidates[Math.floor(Math.random() * candidates.length)];
  }
  try {
    sessionStorage.setItem(LAST_KEY, pick);
  } catch {
    /* noop */
  }
  return pick;
}
