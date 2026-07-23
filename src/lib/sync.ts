import { reconcile } from "./achievements";
import {
  loadState,
  mergeStates,
  saveStateRaw,
  type ProgressState,
} from "./progress";

// AWS(DynamoDB + Lambda Function URL)で構築した同期API。
// infra/sync.yaml の出力 SyncApiUrl を .env の VITE_SYNC_API_URL に設定する。
// 未設定でもアプリはローカル保存のみで完全に動作する。
const apiUrl = import.meta.env.VITE_SYNC_API_URL as string | undefined;

export const syncAvailable: boolean = Boolean(apiUrl);

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
  const state = loadState();
  const code = state.settings.syncCode;
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
    let merged = state;
    if (remote?.data) {
      merged = mergeStates(state, remote.data);
    }
    // 相手端末の履歴を含めて実績を再判定してから保存・送信する
    reconcile(merged, { silent: true, emit: false });
    saveStateRaw(merged);
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
