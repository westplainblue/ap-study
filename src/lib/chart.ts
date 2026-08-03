/**
 * チャートの座標計算(純粋関数)。
 * 描画コンポーネントから切り出しているのは、端・範囲外・データ1点といった
 * 境界条件がバグの温床で、Reactを起動せずに単体テストしたいため。
 */

/**
 * プロット領域内のX座標から、最も近い点の添字を返す。
 *
 * 折れ線チャートのホバーで「2pxの点を狙わせない」ための最近傍スナップに使う。
 * 点は plotW を count-1 等分した位置に並ぶ前提(AccuracyTrend の xOf と同じ)。
 * 範囲外のX(軸ラベル上など)は両端にクランプする。
 *
 * @param px      プロット左端を基準にしないSVG座標系のX(padLeft込み)
 * @param padLeft プロット領域の左オフセット
 * @param plotW   プロット領域の幅
 * @param count   点の数
 * @returns 0..count-1 の添字。count<=0 なら -1(選択なし)
 */
export function nearestIndex(
  px: number,
  padLeft: number,
  plotW: number,
  count: number
): number {
  if (count <= 0) return -1;
  // 点が1つのときは中央に描かれるので、どこを指しても唯一の点を選ぶ
  // (count-1 での除算も避ける)
  if (count === 1) return 0;
  if (plotW <= 0) return 0;
  const t = Math.min(1, Math.max(0, (px - padLeft) / plotW));
  return Math.min(count - 1, Math.max(0, Math.round(t * (count - 1))));
}
