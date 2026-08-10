/**
 * FSRS-4.5(Free Spaced Repetition Scheduler)の純関数実装。
 *
 * Leitner(全問一律 1→3→7→14日)と違い、問題ごとに
 * - S: 安定度 … 思い出せる確率が90%まで落ちるのにかかる日数
 * - D: 難易度 … 1(易)〜10(難)。難しい問題ほど安定度が伸びにくい
 * を推定し、「思い出せる確率が目標(90%)を割る直前」に次回を組む。
 * 同じ定着率をより少ない復習回数で維持できる(Anki が標準採用している方式)。
 *
 * 重みは FSRS-4.5 の公式デフォルト17個。個人最適化(重みの学習)はしない。
 * 数式: https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
 */

export const FSRS_W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
] as const;

const DECAY = -0.5;
const FACTOR = 19 / 81; // R(S, S) = 0.9 になる定数

/** 目標保持率。「9割は思い出せる」タイミングで次回を出題する */
export const DESIRED_RETENTION = 0.9;

/** 評価。1=Again(誤答・まぐれ) / 2=Hard / 3=Good(正解) / 4=Easy */
export type FsrsRating = 1 | 2 | 3 | 4;

export interface FsrsState {
  /** 安定度(日) */
  s: number;
  /** 難易度 1〜10 */
  d: number;
}

const clampD = (d: number) => Math.min(10, Math.max(1, d));
const clampS = (s: number) => Math.max(0.1, s);

/** 前回から t 日後に思い出せる確率(理論値) */
export function retrievability(t: number, s: number): number {
  return Math.pow(1 + FACTOR * (Math.max(0, t) / s), DECAY);
}

/** 保持率が r を割るまでの日数 = 次回間隔。r=0.9 なら安定度そのもの(最低1日) */
export function intervalDays(s: number, r = DESIRED_RETENTION): number {
  return Math.max(1, Math.round((s / FACTOR) * (Math.pow(r, 1 / DECAY) - 1)));
}

/** 初回評価から作る状態。S0(G)=w[G-1], D0(G)=w4-(G-3)*w5 */
export function initialState(g: FsrsRating): FsrsState {
  return {
    s: clampS(FSRS_W[g - 1]),
    d: clampD(FSRS_W[4] - (g - 3) * FSRS_W[5]),
  };
}

/**
 * 2回目以降: 前回から elapsed 日後に評価 g が付いたときの次状態。
 * - 難易度: D' = w7*D0(3) + (1-w7)*(D - w6*(g-3))(Good を目標に平均回帰)
 * - 成功:   S' = S * (e^w8 * (11-D) * S^-w9 * (e^(w10*(1-R))-1) * 罰/ボーナス + 1)
 * - 失敗:   S' = w11 * D^-w12 * ((S+1)^w13 - 1) * e^(w14*(1-R))(元のSを超えない)
 */
export function nextState(prev: FsrsState, elapsed: number, g: FsrsRating): FsrsState {
  const r = retrievability(elapsed, prev.s);
  const d = clampD(
    FSRS_W[7] * FSRS_W[4] + (1 - FSRS_W[7]) * (prev.d - FSRS_W[6] * (g - 3))
  );
  if (g === 1) {
    const sf =
      FSRS_W[11] *
      Math.pow(prev.d, -FSRS_W[12]) *
      (Math.pow(prev.s + 1, FSRS_W[13]) - 1) *
      Math.exp((1 - r) * FSRS_W[14]);
    return { s: clampS(Math.min(sf, prev.s)), d };
  }
  const hard = g === 2 ? FSRS_W[15] : 1;
  const easy = g === 4 ? FSRS_W[16] : 1;
  const inc =
    Math.exp(FSRS_W[8]) *
    (11 - prev.d) *
    Math.pow(prev.s, -FSRS_W[9]) *
    (Math.exp((1 - r) * FSRS_W[10]) - 1) *
    hard *
    easy;
  return { s: clampS(prev.s * (1 + inc)), d };
}
