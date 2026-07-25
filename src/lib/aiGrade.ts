/**
 * 午後(記述式)のAI採点。既存のAIチャット基盤(streamChat + aiConfig)を流用し、
 * サーバーを介さずユーザー自身のプロバイダで採点する。
 * IPAの模範解答・採点の観点を基準に、キーワードの一致/不足で客観的に評価する。
 */
import { streamChat } from "./aiChat";
import { activeModel, loadAiConfig, type AiConfig } from "./aiConfig";
import type { PmGrade } from "./progress";

export interface PmGradeInput {
  question: string;
  modelAnswer: string;
  note?: string;
  userAnswer: string;
}

export interface PmGradeResult {
  grade?: PmGrade; // ○=o / △=d / ×=x(応答から判定できなければ undefined)
  feedback: string; // 画面表示用の講評(整形せずそのまま表示)
}

export interface GradeOptions extends PmGradeInput {
  config?: AiConfig;
  onDelta?: (full: string) => void; // 逐次の累積テキスト(ストリーミング表示用)
  signal?: AbortSignal;
}

const SYSTEM =
  "あなたは応用情報技術者試験(午後)の記述式解答の採点者です。" +
  "IPAの模範解答と採点の観点を基準に、受験者の解答を客観的に採点します。" +
  "IPA午後はキーワードの有無で部分点が決まるため、要素キーワードの一致・不足を重視してください。" +
  "甘すぎず辛すぎず、根拠を示して評価します。模範解答の丸写しではなく、受験者の解答との差分を具体的に指摘してください。";

function buildUserPrompt(i: PmGradeInput): string {
  return [
    "次の記述式解答を採点してください。",
    "",
    "【設問】",
    i.question,
    "",
    "【IPA模範解答】",
    i.modelAnswer,
    "",
    "【採点の観点】",
    i.note?.trim() || "(特になし。模範解答の要素との一致で判断してください)",
    "",
    "【受験者の解答】",
    i.userAnswer,
    "",
    "以下の形式で、日本語・プレーンテキストで出力してください(見出し記号や装飾は不要):",
    "評価: ○ / △ / × のいずれか1文字",
    "一致: 模範解答と合致した要素(なければ「なし」)",
    "不足: 足りない・誤っている要素(なければ「なし」)",
    "講評: 1〜2文の総評",
    "次の一手: 次に意識するとよい一言",
  ].join("\n");
}

/** 応答テキストから評価(○/△/×)を取り出す。「評価:」行を最優先で見る。 */
export function parseGrade(text: string): PmGrade | undefined {
  const line = text.match(/評価[\s:：]*([○◯△▲×✕ｘxX])/);
  const c = line?.[1] ?? text.match(/[○◯△▲×✕]/)?.[0];
  if (c === "○" || c === "◯") return "o";
  if (c === "△" || c === "▲") return "d";
  if (c === "×" || c === "✕" || c === "ｘ" || c === "x" || c === "X") return "x";
  return undefined;
}

/** 1つの設問(part)をAIで採点する。streamChat をそのまま利用。 */
export async function gradePmPart(opts: GradeOptions): Promise<PmGradeResult> {
  const config = opts.config ?? loadAiConfig();
  let full = "";
  await streamChat({
    provider: config.provider,
    apiKey: config.apiKeys[config.provider] ?? "",
    model: activeModel(config),
    baseUrl: config.codexBaseUrl,
    system: SYSTEM,
    messages: [{ role: "user", content: buildUserPrompt(opts) }],
    signal: opts.signal,
    onDelta: (t) => {
      full += t;
      opts.onDelta?.(full);
    },
  });
  return { grade: parseGrade(full), feedback: full.trim() };
}
