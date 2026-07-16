import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  loadState,
  mergeStates,
  saveStateRaw,
  type ProgressState,
} from "./progress";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const syncAvailable: boolean = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!syncAvailable) return null;
  client ??= createClient(url!, anonKey!);
  return client;
}

export interface SyncResult {
  ok: boolean;
  message: string;
}

/**
 * pull → マージ → ローカル保存 → push の順で同期する。
 * 同期コードが一致する端末同士が同じデータに収束する。
 */
export async function syncNow(): Promise<SyncResult> {
  if (!syncAvailable) {
    return {
      ok: false,
      message:
        "クラウド同期は未設定です。.env に VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。",
    };
  }
  const state = loadState();
  const code = state.settings.syncCode;
  if (!code) {
    return { ok: false, message: "同期コードが未設定です(設定画面で発行できます)。" };
  }
  const c = getClient()!;
  const { data, error } = await c
    .from("progress")
    .select("data")
    .eq("sync_code", code)
    .maybeSingle();
  if (error) {
    return { ok: false, message: `サーバーからの取得に失敗しました: ${error.message}` };
  }
  let merged = state;
  if (data?.data) {
    merged = mergeStates(state, data.data as ProgressState);
  }
  saveStateRaw(merged);
  const { error: upError } = await c.from("progress").upsert({
    sync_code: code,
    data: merged,
    updated_at: new Date().toISOString(),
  });
  if (upError) {
    return { ok: false, message: `サーバーへの送信に失敗しました: ${upError.message}` };
  }
  return { ok: true, message: "同期が完了しました。" };
}

/** アプリ起動時のバックグラウンド同期(失敗しても無視) */
export function syncInBackground(): void {
  if (!syncAvailable) return;
  if (!loadState().settings.syncCode) return;
  void syncNow().catch(() => undefined);
}
