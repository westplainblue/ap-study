/**
 * 画面まわりの表示設定(端末内のみ・クラウド同期の対象外)。
 *
 * 学習データ(ap-study:v1)と別キーにしているのは、サイドバーの開閉のような
 * **端末ごとに違って当然の状態**を同期で往復させないため。画面サイズも
 * 使い方も端末ごとに違うので、他端末の都合で勝手に畳まれるのは事故になる。
 */
const KEY = "ap-study:ui";

/** 配色。auto = OSの設定に追従(既定) */
export type Theme = "auto" | "light" | "dark";

interface UiState {
  /** PCの左サイドバーを畳んでいるか */
  navCollapsed?: boolean;
  theme?: Theme;
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

export function theme(): Theme {
  return load().theme ?? "auto";
}

/**
 * 配色を適用する。auto は属性を外して OS 設定(prefers-color-scheme)に委ねる。
 * CSS 側で `:root[data-theme="dark"]` が OS 追従の後に書いてあるので、
 * 手動指定が必ず勝つ。
 */
export function applyTheme(t: Theme): void {
  const el = document.documentElement;
  if (t === "auto") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", t);
}

export function setTheme(t: Theme): void {
  save({ ...load(), theme: t });
  applyTheme(t);
}
