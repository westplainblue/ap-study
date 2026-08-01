import { reconcile } from "./achievements";
import {
  loadState,
  mergeStates,
  repairReviewFromStorage,
  saveStateRaw,
  type ProgressState,
} from "./progress";
import { reconcileVocabFromStorage } from "./vocab";

// AWS(DynamoDB + Lambda Function URL)で構築した同期API。
// infra/sync.yaml の出力 SyncApiUrl を .env の VITE_SYNC_API_URL に設定する。
// 未設定でもアプリはローカル保存のみで完全に動作する。
// (node のテスト実行では import.meta.env が無いので typeof で守る)
let apiUrl: string | undefined =
  typeof import.meta.env === "undefined"
    ? undefined
    : (import.meta.env.VITE_SYNC_API_URL as string | undefined);

export let syncAvailable: boolean = Boolean(apiUrl);

/** テスト用: API URL の差し替え(Vite外の実行では env が無いため) */
export function __setSyncApiUrlForTest(u: string | undefined): void {
  apiUrl = u;
  syncAvailable = Boolean(u);
}

export interface SyncResult {
  ok: boolean;
  message: string;
}

/**
 * pull(GET) → マージ → ローカル保存 → push(PUT) の順で同期する。
 * 同じ同期コードの端末同士が同じデータに収束する。
 * データの統合はここ(クライアント側)で行い、サーバーは読み書きのみ。
 */
export async function syncNow(): Promise<SyncResult> {
  if (!syncAvailable) {
    return {
      ok: false,
      message: "クラウド同期は未設定です。.env に VITE_SYNC_API_URL を設定してください。",
    };
  }
  const code = loadState().settings.syncCode;
  if (!code) {
    return { ok: false, message: "同期コードが未設定です(設定画面で発行できます)。" };
  }
  // Function URL は末尾スラッシュ付き。二重スラッシュを避けて正規化する。
  const base = apiUrl!.replace(/\/+$/, "");
  try {
    // pull: 同期コードに紐づく最新データを取得
    const res = await fetch(`${base}/?code=${encodeURIComponent(code)}`);
    if (!res.ok) {
      return { ok: false, message: `サーバーからの取得に失敗しました: HTTP ${res.status}` };
    }
    const remote = (await res.json()) as { data?: ProgressState | null };
    // 取得を待つ間に起きたローカルの書込み(解答・ことば帳の導出など)を
    // 失わないよう、マージにはfetch後に読み直した状態を使う。
    // fetch前のスナップショットで上書きすると、その間の記録が黙って消える。
    const local = loadState();
    let merged = local;
    if (remote?.data) {
      merged = mergeStates(local, remote.data);
    }
    // 相手端末の履歴を含めて実績を再判定してから保存・送信する
    reconcile(merged, { silent: true, emit: false });
    saveStateRaw(merged);
    // 相手端末から取り込んだ誤答のことば(用語)もここで導出しておく
    // (辞書が未ロードなら no-op。導出できたら送信データにも含める)
    if (reconcileVocabFromStorage()) merged = loadState();
    // 取り込んだ履歴で「本来は卒業済み」と分かった復習エントリも墓標化して送る
    if (repairReviewFromStorage()) merged = loadState();
    // push: マージ結果を保存
    const put = await fetch(`${base}/`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sync_code: code, data: merged }),
    });
    if (!put.ok) {
      return { ok: false, message: `サーバーへの送信に失敗しました: HTTP ${put.status}` };
    }
    return { ok: true, message: "同期が完了しました。" };
  } catch (e) {
    return {
      ok: false,
      message: `同期に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** アプリ起動時のバックグラウンド同期(失敗しても無視) */
export function syncInBackground(): void {
  if (!syncAvailable) return;
  if (!loadState().settings.syncCode) return;
  void syncNow().catch(() => undefined);
}
