import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isCaretOnFirstLine,
  isCaretOnLastLine,
  loadHistory,
  pushInto,
  saveHistory,
} from "../src/lib/aiHistory.ts";

test("pushInto: 末尾に追加し、前後の空白は落とす", () => {
  assert.deepEqual(pushInto([], "質問1"), ["質問1"]);
  assert.deepEqual(pushInto(["質問1"], "  質問2  \n"), ["質問1", "質問2"]);
});

test("pushInto: 空文字・空白のみは積まない(同じ配列を返す)", () => {
  const list = ["質問1"];
  assert.equal(pushInto(list, ""), list);
  assert.equal(pushInto(list, "   \n\t"), list);
});

test("pushInto: 直前と同一の入力は積まない(同じ配列を返す)", () => {
  const list = ["質問1", "質問2"];
  assert.equal(pushInto(list, "質問2"), list);
  assert.equal(pushInto(list, " 質問2 "), list); // trim後の比較
  // 直前でなければ重複しても積む(ターミナルと同じ挙動)
  assert.deepEqual(pushInto(list, "質問1"), ["質問1", "質問2", "質問1"]);
});

test("pushInto: 上限を超えたら古い方から捨てる", () => {
  const list = Array.from({ length: 50 }, (_, i) => `q${i}`);
  const next = pushInto(list, "new");
  assert.equal(next.length, 50);
  assert.equal(next[0], "q1"); // q0 が押し出される
  assert.equal(next[49], "new");

  const small = pushInto(["a", "b", "c"], "d", 3);
  assert.deepEqual(small, ["b", "c", "d"]);
});

test("caret判定: 1行だけの入力ではどの位置でも先頭行かつ最終行", () => {
  const v = "一行だけの入力";
  for (const pos of [0, 3, v.length]) {
    assert.equal(isCaretOnFirstLine(v, pos), true);
    assert.equal(isCaretOnLastLine(v, pos), true);
  }
});

test("caret判定: 複数行では行の位置で切り替わる", () => {
  const v = "1行目\n2行目\n3行目";
  const line2 = v.indexOf("2行目");
  const line3 = v.indexOf("3行目");
  // 1行目(改行の手前まで)は先頭行、最終行ではない
  assert.equal(isCaretOnFirstLine(v, 3), true);
  assert.equal(isCaretOnLastLine(v, 3), false);
  // 中間行はどちらでもない
  assert.equal(isCaretOnFirstLine(v, line2 + 1), false);
  assert.equal(isCaretOnLastLine(v, line2 + 1), false);
  // 最終行は最終行のみ
  assert.equal(isCaretOnFirstLine(v, line3 + 1), false);
  assert.equal(isCaretOnLastLine(v, line3 + 1), true);
  assert.equal(isCaretOnLastLine(v, v.length), true);
});

// node環境にはlocalStorageが無いので、最小限のスタブで保存系を検証する
function withLocalStorage(store, fn) {
  const stub = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      if (store.__throw) throw new Error("QuotaExceededError");
      store[k] = String(v);
    },
  };
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: stub, configurable: true });
  try {
    return fn();
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete globalThis.localStorage;
  }
}

test("loadHistory/saveHistory: 保存して読み戻せる", () => {
  const store = {};
  withLocalStorage(store, () => {
    saveHistory(["質問1", "質問2"]);
    assert.deepEqual(loadHistory(), ["質問1", "質問2"]);
  });
});

test("loadHistory: 壊れたデータ・型違いは空配列/文字列のみに落とす", () => {
  withLocalStorage({ "ap-study:ai-history": "{bad json" }, () => {
    assert.deepEqual(loadHistory(), []);
  });
  withLocalStorage({ "ap-study:ai-history": '{"not":"array"}' }, () => {
    assert.deepEqual(loadHistory(), []);
  });
  withLocalStorage({ "ap-study:ai-history": '["ok",123,null,"ok2"]' }, () => {
    assert.deepEqual(loadHistory(), ["ok", "ok2"]);
  });
  withLocalStorage({}, () => {
    assert.deepEqual(loadHistory(), []);
  });
});

test("saveHistory: 保存に失敗しても例外を投げない", () => {
  withLocalStorage({ __throw: true }, () => {
    assert.doesNotThrow(() => saveHistory(["q"]));
  });
});
