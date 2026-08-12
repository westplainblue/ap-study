/**
 * 模試の受験履歴。
 *
 * 受験結果を別に保存するのではなく、解答履歴(progress の attempts)から受験回の
 * まとまりを復元する。模試の採点は recordAnswersBatch が全問を1ミリ秒刻みの
 * 連続した t でまとめて記録するので、この復元は元の受験と一致する。
 * 保存を増やさないぶん、この機能より前に解いた模試もそのまま履歴に出せる。
 */
import type { Attempt } from "./progress";

/** 合格ライン(本試験の午前は60%) */
export const PASS_RATE = 0.6;

/**
 * 同じ受験とみなす解答間隔の上限。一括記録なので実際の間隔は問題数×1ミリ秒だが、
 * 「同じ回を解き直したら別受験として分かれる」ことだけ担保できればよいので広く取る。
 */
const SESSION_GAP_MS = 5 * 60 * 1000;

export interface MockSession {
  examId: string;
  /** 採点した時刻(最初の解答記録の t) */
  at: number;
  /** 出題順の問題ID */
  qids: string[];
  /** qids と同じ並びの正誤 */
  results: boolean[];
  total: number;
  correct: number;
}

export interface Agg {
  n: number;
  ok: number;
}

/** 問題ID("2025r07a-am-01")から試験回ID("2025r07a")を取り出す */
export function examIdOfQuestion(qid: string): string | null {
  const i = qid.indexOf("-am-");
  return i > 0 ? qid.slice(0, i) : null;
}

/** 合格ラインに達しているか(必要正答数は切り上げ。80問なら48問) */
export function isPass(correct: number, total: number): boolean {
  return correct >= Math.ceil(total * PASS_RATE);
}

/** 正答率(%)。0問なら null */
export function rateOf(correct: number, total: number): number | null {
  return total > 0 ? Math.round((correct / total) * 100) : null;
}

/**
 * 解答履歴から模試の受験回を新しい順に復元する。
 * 同じ試験回の解答が SESSION_GAP_MS 以内に続いていれば1回の受験とみなす。
 * 模試以外のモードと、試験回を特定できない問題IDは無視する。
 */
export function mockSessions(attempts: Attempt[]): MockSession[] {
  const mock = attempts
    .filter((a) => a.mode === "mock" && examIdOfQuestion(a.q) !== null)
    .sort((x, y) => x.t - y.t);
  const sessions: MockSession[] = [];
  let cur: MockSession | null = null;
  let lastT = 0;
  for (const a of mock) {
    const examId = examIdOfQuestion(a.q)!;
    if (!cur || cur.examId !== examId || a.t - lastT > SESSION_GAP_MS) {
      cur = { examId, at: a.t, qids: [], results: [], total: 0, correct: 0 };
      sessions.push(cur);
    }
    cur.qids.push(a.q);
    cur.results.push(a.ok);
    cur.total += 1;
    if (a.ok) cur.correct += 1;
    lastT = a.t;
  }
  return sessions.reverse(); // 新しい順
}

/**
 * 受験1回ぶんの分類別集計。分類は問題データを知る呼び出し側が渡す
 * (このモジュールは問題データに依存しない)。undefined を返した問題は除く。
 */
export function aggByGroup(
  session: MockSession,
  groupOf: (qid: string) => string | undefined
): Map<string, Agg> {
  const out = new Map<string, Agg>();
  session.qids.forEach((qid, i) => {
    const g = groupOf(qid);
    if (g === undefined) return;
    const cur = out.get(g) ?? { n: 0, ok: 0 };
    cur.n += 1;
    if (session.results[i]) cur.ok += 1;
    out.set(g, cur);
  });
  return out;
}
