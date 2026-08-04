/**
 * 画面まわりの表示設定(端末内のみ・クラウド同期の対象外)。
 *
 * 学習データ(ap-study:v1)と別キーにしているのは、サイドバーの開閉のような
 * **端末ごとに違って当然の状態**を同期で往復させないため。画面サイズも
 * 使い方も端末ごとに違うので、他端末の都合で勝手に畳まれるのは事故になる。
 */
const KEY = "ap-study:ui";

interface UiState {
  /** PCの左サイドバーを畳んでいるか */
  navCollapsed?: boolean;
}

function load(): UiState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as UiState) : {};
  } catch {
    return {};
  }
}

function save(s: UiState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できなくても表示自体は動くので黙って諦める
  }
}

export function navCollapsed(): boolean {
  return load().navCollapsed === true;
}

export function setNavCollapsed(v: boolean): void {
  save({ ...load(), navCollapsed: v });
}
