import assert from "node:assert/strict";
import { test } from "node:test";
import { nearestIndex } from "../src/lib/chart.ts";

// 正解率の推移グラフのホバー(最近傍スナップ)の境界条件。
// 点は padLeft から plotW を count-1 等分した位置に並ぶ前提。

const PAD = 30;
const W = 300;

test("nearestIndex: 各点の真上ではその点を選ぶ", () => {
  // 5点なら 30, 105, 180, 255, 330 の位置に並ぶ
  for (let i = 0; i < 5; i++) {
    const x = PAD + (W * i) / 4;
    assert.equal(nearestIndex(x, PAD, W, 5), i, `点${i}の真上`);
  }
});

test("nearestIndex: 点と点の間は近い方に丸める", () => {
  // 2点なら 30 と 330。中間(180)より手前は0、奥は1
  assert.equal(nearestIndex(179, PAD, W, 2), 0);
  assert.equal(nearestIndex(181, PAD, W, 2), 1);
  // ちょうど中間は Math.round の仕様で奥側(1)へ
  assert.equal(nearestIndex(180, PAD, W, 2), 1);
});

test("nearestIndex: プロット範囲外は両端にクランプする", () => {
  // 左の軸ラベル上や右の余白でも、必ず有効な添字を返す
  assert.equal(nearestIndex(0, PAD, W, 5), 0);
  assert.equal(nearestIndex(-500, PAD, W, 5), 0);
  assert.equal(nearestIndex(PAD + W + 100, PAD, W, 5), 4);
  assert.equal(nearestIndex(99999, PAD, W, 5), 4);
});

test("nearestIndex: データが1点なら常に0(ゼロ除算を避ける)", () => {
  // 1点のときは中央に描かれるので、どこを指してもその点
  assert.equal(nearestIndex(PAD, PAD, W, 1), 0);
  assert.equal(nearestIndex(PAD + W / 2, PAD, W, 1), 0);
  assert.equal(nearestIndex(-100, PAD, W, 1), 0);
});

test("nearestIndex: データ0件は -1(選択なし)", () => {
  assert.equal(nearestIndex(100, PAD, W, 0), -1);
});

test("nearestIndex: 幅0(初回レンダリング直後)でも壊れない", () => {
  assert.equal(nearestIndex(100, PAD, 0, 5), 0);
});

test("nearestIndex: 高密度でも全添字が到達可能", () => {
  // 90日ぶんでも、各点の真上を指せばその点が選ばれる(点の半径2pxとは無関係)
  const count = 90;
  const seen = new Set();
  for (let i = 0; i < count; i++) {
    seen.add(nearestIndex(PAD + (W * i) / (count - 1), PAD, W, count));
  }
  assert.equal(seen.size, count, "重複や取りこぼしなく全点を選択できる");
});

test("nearestIndex: 返り値は常に 0..count-1 に収まる", () => {
  const count = 7;
  for (let px = -50; px <= PAD + W + 50; px += 3) {
    const i = nearestIndex(px, PAD, W, count);
    assert.ok(i >= 0 && i < count, `px=${px} で範囲外の添字 ${i}`);
  }
});
