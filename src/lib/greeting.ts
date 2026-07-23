/**
 * ホーム画面に出す「一言」。時間帯(朝/昼/夜/深夜)ごとの大きなプールから選び、
 * 曜日ネタや学習状況(連続日数・復習・試験日など)に応じた文言もときどき混ぜる。
 * 口調はゆるめ・カジュアルで、クスッと笑える一言を狙う。
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
    "おはよ。とりあえず1問、いっとく?",
    "起きた?えらい。はい1問。",
    "二度寝の誘惑に勝てたら、あなた天才。",
    "朝から勉強とか、見どころしかない。",
    "おはよ〜。目、まだ半分閉じてない?",
    "顔洗った?じゃあ次、脳も起こそ。",
    "朝の脳、意外とキレッキレらしいよ。",
    "おはよ。今日のあなた、なんか勝てそうな顔。",
    "まだ眠い?問題も寝ぼけてる今がチャンス。",
    "朝活とか意識高すぎでは?(ほめてる)",
    "布団の中で見てるでしょ。バレてるよ、1問だけ。",
    "コーヒーのついでに、1問も流し込も。",
  ],
  noon: [
    "昼メシ前に1問。頭ごしらえってやつ。",
    "眠い午後きた〜。手ぇ動かして起きよ。",
    "SNS開く前に、1問だけ。ね?",
    "進捗どう?盛って報告してもバレないよ。",
    "午後の眠気、ラスボス級。1問で挑め。",
    "ランチ後の1問、デザート感覚でどうぞ。",
    "サボりたい気持ち、よ〜くわかる。でも1問。",
    "昼寝する?その前に1問、寝落ち前提でOK。",
    "5分ある?なら1問。ない?なら作ろ。",
    "午後もぼちぼち。飛ばしすぎ注意ね。",
    "お昼だ〜。脳にもランチ(問題)あげて。",
    "まぶた重い?重力に負けんな。",
  ],
  evening: [
    "おつかれ〜。今日もよくやった。あと1問だけ。",
    "今日どんな日だった?まあ1問やって忘れよ。",
    "夜は復習タイム。間違えた問題と和解しよ。",
    "一日の締めに1問。シメパフェ的なやつ。",
    "疲れてる?わかる。でも寝る前の1問、効くのよ。",
    "こんばんは。今日の自分、ちょっとは褒めた?",
    "寝る前の1問、なぜか記憶に焼きつくやつ。",
    "あと1問。ね?ね?(圧)",
    "今日も1問積んだあなた、そこそこ偉い。",
    "夜ふかし前に1問。言い訳、進呈します。",
    "ダラける前に、1問だけ人質にもらうね。",
    "今日のミスは明日の伸びしろ。夜に仕込も。",
  ],
  night: [
    "こんな時間に起きてるの、あなたと私だけかもね。",
    "夜ふかしさん、こんばんは。1問だけ共犯しよ。",
    "眠れないなら1問、眠いなら寝ろ。以上!",
    "深夜テンションで解くと、朝ビックリするやつ。",
    "そろそろ寝よ?…と言いつつ1問差し出す。",
    "目が冴えてるなら1問。冴えてないなら即寝。",
    "静かな夜は、実は集中の穴場スポット。",
    "夜フクロウさん、ほどほどにね?心配だからさ。",
    "明日の自分に丸投げ、それも立派な戦略。おやすみ。",
    "スマホもあなたも、そろそろ充電しよ。",
  ],
};

// 曜日スペシャル(0=日 … 6=土)。その日の曜日のぶんだけ候補に加わる。
const WEEKDAY: Record<number, string[]> = {
  0: [
    "日曜の夜、サザエさん症候群には1問が効くらしい。",
    "日曜だ。今週の総ざらい、してみる?",
    "明日からまた1週間か…って顔してるね。1問で気そらそ。",
  ],
  1: [
    "月曜。はい、みんな眠い。あなただけじゃないよ。",
    "今週も始まったね〜。まあぼちぼちいこ。",
  ],
  2: ["火曜。エンジンかかってきた?まだ?焦らず。"],
  3: ["水曜、折り返し!勢いで乗り切ろ。"],
  4: ["木曜。週末の匂いがしてきた。あと少し。"],
  5: [
    "花金!…の前に1問だけ、ね?",
    "今週おつかれ〜。ラスト1問で週末なだれ込も。",
  ],
  6: [
    "週末きた〜。今日はゆる〜く1問で。",
    "土曜。いつもよりじっくり派?",
  ],
};

const ANYTIME: string[] = [
  "調子どう?",
  "今日は何問いっとく?",
  "間違えた数だけ強くなる。ドラクエかよ。",
  "完璧じゃなくてOK。てか完璧とか無理。まず1問。",
  "アプリ開いただけで、もう勝ち。",
  "「あとで復習」の“あとで”、来たためしある?今やろ。",
  "ちりつも合格。ほんとに積もるから侮れない。",
  "苦手分野も、いつか“元カレ”みたいに笑い話に。",
  "解けたら全力でガッツポーズしていいよ。",
  "迷ったら手を動かす。考えるな、感じ…るのはやめとこ。",
  "詰まったら深呼吸。人も再起動で直ることある。",
  "わからん問題、ぬいぐるみに説明すると解けるらしい。マジで。",
  "あなたの学習曲線、こっそり右肩上がりよ。",
  "「あ、これ見たことある!」を増やしにいこ。",
  "今日の1問は、試験当日の自分への仕送り。感謝されるよ。",
  "やる気、待っててもこない。始めると勝手にくる。",
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
    msgs.push("はじめまして!とりあえず1問、ノリでいこ。");
    return msgs; // 初回はこれだけ
  }
  if (stats.streak === 0) msgs.push("おかえり〜。ちょっと寂しかったよ(演出)。");
  if (stats.streak >= 7) msgs.push(`${stats.streak}日連続て。それもう才能だよ。`);
  else if (stats.streak >= 3) msgs.push(`${stats.streak}日連続!もう趣味の域では?`);
  if (due >= 1) msgs.push(`復習が${due}問。今が解き頃、食べ頃。`);

  const exam = state.settings.examDate;
  if (exam) {
    const left = daysUntil(exam);
    if (left >= 0 && left <= 7)
      msgs.push(`試験まであと${left}日!ここまで来たら笑って行こ。`);
    else if (left > 7 && left <= 30)
      msgs.push(`試験まであと${left}日。焦らんでいい、でも止まるな。`);
  }
  return msgs;
}

const LAST_KEY = "ap-greet-last";

/** ホームの一言を1つ返す(時間帯プール + 曜日 + 汎用 + 状況メッセージから抽選) */
export function pickGreeting(state: ProgressState, now = new Date()): string {
  const b = bucketOf(now.getHours());
  const wd = WEEKDAY[now.getDay()] ?? [];
  const ctx = contextMessages(state);
  // 曜日と状況メッセージは少し重み付け(2回入れる)して、ときどき出す
  const candidates = [...POOLS[b], ...ANYTIME, ...wd, ...wd, ...ctx, ...ctx];

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
