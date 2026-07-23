# 応用情報学習アプリ 実績(アチーブメント)システム 最終設計書

## エグゼクティブサマリ

- **真実源は `attempts`(追記専用・剪定なし)**、判定は毎回そこから純関数導出。保存するのは `achievements: Record<AchvId, {unlockedAt, seen, progress}>` の最小メタのみ(永続化キー `KEY="ap-study:v1"` は据え置き=マイグレーション不要)。
- **中核は「リベンジ(誤答→正答)」と「量」**。XP・ガチャは不採用、正答率は主役にしない。MVPは**到達可能性を実データで検証済みの約16実績**に厳選し、カタログは最大42まで段階解放。
- **批評で判明した3つの破綻を修正済み**:(1) 午後実績はPM母集団(1問/8パーツ)を超えるしきい値が永久不能 → データ駆動クランプ、(2) リベンジ種類数(定義C)は**非単調**なのでグリッド表示を「保存済み OR 再導出」の論理和に、(3) `sync.ts` への `reconcile` 配線漏れと **PUT順序バグ** を配線図に明記。
- 追加でリベンジ/量の**単一問題ファーム**に上限を入れ、`excludeCalc` とマスタリー分母の相互作用を明文化した。
- 末尾に**順序付きMVP実装ステップ**と**あなたに決めてほしい4つの選択肢(推奨付き)**を置く。

---

## 0. 前提と設計判断

### 0.1 データ3レイヤの性質(実績設計の土台)

| レイヤ | 実体 | merge挙動(`mergeStates` L224-247) | 実績での扱い |
|---|---|---|---|
| `attempts: Attempt[]` | `{q,t,ok,mode}` 追記専用履歴 | `` `${q}:${t}:${mode}` `` で和集合dedup + `t`昇順ソート、失われない | **真実源** |
| `review: Record<qid,{box,due}>` | Leitner現在スナップショット。卒業で `delete` | `{...older.review, ...newer.review}`(新しい方優先) | 原則使わない |
| `pm?: PmRecords` | 午後の現在スナップショット(`setPmGrade` 上書き) | part単位で新しい方優先 | 現在分布のみ |

**結論**:単調で頑健な `attempts` を土台にする。Leitner卒業ログ・模試スコア厳密値・午後の×→○履歴は**現データから原理的に出せない**ため初期非採用(Phase2)。

### 0.2 主要な設計判断

- **保存方式=ハイブリッドC**:判定は `attempts` からの純関数導出を真実源とし、`achievements` はキャッシュ+演出メタ(`unlockedAt`/`seen`)に留める。
- **単調性の訂正(批評反映)**:累計 `TOTAL`・カバレッジ・最長streak・リベンジ延べ(定義B)は `attempts` に対し**単調非減少**で巻き戻らない。**ただしリベンジ種類数(定義C)は非単調**(§3参照)。よって「単調だからちらつかない」保証は定義Cには適用しない。グリッドの解除表示は後述の**論理和**で救う。
- **XP/レベル/ガチャ不採用**:`attempts` は同一問題周回で無限に稼げるため外発通貨は破綻。「カバレッジ%」「分野マスタリー」「ユニーク正答数」が事実上のレベルを担う。

---

## 1. コンセプト(3本柱)

1. **リベンジ最重点**:誤答を「損失」でなく「リベンジ権の獲得」に再定義。Leitner復習(誤答→`review` box1→`dueReviewIds()` で再出題→正答)がリベンジの発生装置。
2. **量を手厚く**:累計(`TOTAL`)とユニーク(`UNIQ`)の2軸で階段を密に。ユーザ最優先。
3. **静かな祝福**:バッジは評価でなく「あなたはこれを達成した」という情報の鏡。文言は事実記述。

---

## 2. データモデル

### 2.1 型拡張(`src/data/types.ts`)

```ts
export type AchvId = string; // 例 "revenge-10", "streak-7"
export interface AchievementRecord {
  unlockedAt: number;   // 初回解除の epoch ms(再導出不能なので保存)
  seen: boolean;        // トースト提示済み(二重発火防止)
  progress?: number;    // 達成時点の値(非単調指標の後退救済にも使う)
}
export type Achievements = Record<AchvId, AchievementRecord>;
```

`ProgressState` に `achievements?: Achievements;`(optionalで後方互換)。`loadState()` に `s.achievements ??= {};` を `s.review ??= {}` の隣に1行追加。

### 2.2 mergeStates への追加(現状 L240-246 の return に `achievements` が無い=最重要修正)

`mergeStates` の戻り値に必ず含める。union + `unlockedAt` は min + `seen` は OR:

```ts
const achievements: Achievements = {};
const aAch = a.achievements ?? {}, bAch = b.achievements ?? {};
for (const id of new Set([...Object.keys(aAch), ...Object.keys(bAch)])) {
  const x = aAch[id], y = bAch[id];
  achievements[id] = (x && y)
    ? { unlockedAt: Math.min(x.unlockedAt, y.unlockedAt),
        seen: x.seen || y.seen,
        progress: Math.max(x.progress ?? 0, y.progress ?? 0) } // 0でも保持(定義Cの後退救済)
    : (x ?? y)!;
}
// return {...} に achievements を追加
```

> 批評反映:元設計の `Math.max(...) || undefined` は両0でundefined化し、定義Cの後退progressを保存で救う設計と矛盾するため `|| undefined` を外す。

union のみ・削除しないので**二重解除は1エントリに畳まれ、巻き戻りも起きない**(`review` の上書き挙動は持ち込まない)。

---

## 3. リベンジ回数の定義と算出(明記)

### 3.1 定義

- **定義B(主・延べ)= `revengeCount`**:各問題 `q` を `t` 昇順に走査し、**「直前が `ok===false` → 今回 `ok===true`」の遷移回数**の総和。誤→正→誤→正 は2回。UIの物語「間違えた問題を後日やり直して正解」に最も忠実で、Leitner運用と1対1対応。**単調増加**(過去の遷移は消えない)。
- **定義C(補・種類)= `overcomeQuestions`**:「一度でも誤答し、**最後の誤答以降に正答がある**問題の種類数」。「◯問克服」バッジ用。**非単調**:克服後に再誤答すると外れる。

### 3.2 算出(単一走査 O(n)、`src/lib/achievements.ts`)

**都度計算(純関数)を採用。増分カウンタ(`state.revengeCount++`)は不採用** — `mergeStates` のunionに同期せず二重加算・欠落が起きるため。

批評反映で**単一問題ファーム対策の per-q クランプ**を追加(定義Bは同一問題からの寄与を `REVENGE_PER_Q_CAP=3` で頭打ち。`review` モードで誤→正を繰り返す無限供給を封じる):

```ts
export interface RevengeStats {
  revengeCount: number;      // 定義B(per-qクランプ後)
  overcomeQuestions: number; // 定義C(非単調)
  firstRevengeAt?: number;
}
const REVENGE_PER_Q_CAP = 3;

export function revengeStats(state: ProgressState): RevengeStats {
  const sorted = [...state.attempts].sort((a, b) => a.t - b.t); // merge済なら既に昇順
  const prevOk = new Map<string, boolean>();
  const perQ = new Map<string, number>();               // 問題別リベンジ寄与
  const everWrong = new Set<string>();
  const wrongSinceLastRight = new Set<string>();
  let revengeCount = 0, firstRevengeAt: number | undefined;
  for (const a of sorted) {
    if (a.ok && prevOk.get(a.q) === false) {            // 定義B
      const c = perQ.get(a.q) ?? 0;
      if (c < REVENGE_PER_Q_CAP) {                      // ★ファーム上限
        revengeCount++; perQ.set(a.q, c + 1);
        if (firstRevengeAt === undefined) firstRevengeAt = a.t;
      }
    }
    if (!a.ok) { everWrong.add(a.q); wrongSinceLastRight.add(a.q); }
    else if (everWrong.has(a.q)) wrongSinceLastRight.delete(a.q);
    prevOk.set(a.q, a.ok);
  }
  let overcome = 0;
  for (const q of everWrong) if (!wrongSinceLastRight.has(q)) overcome++;
  return { revengeCount, overcomeQuestions: overcome, firstRevengeAt };
}
```

**自然な律速(批評で判明・追い風)**:`recordAnswer`(L109)は誤答時 `due: addDaysStr(todayStr(), 1)`=翌日、`dueReviewIds` は `due <= today` で**同日再出題されない**。よって1問あたりのリベンジ供給は自然に約1回/日。per-qクランプはこれを補強し、端末時計を進める抜け道も塞ぐ。

---

## 4. 実績体系(一覧)

### 4.1 判定信号(略号)

| 略号 | 実体 |
|---|---|
| `TOTAL` | `attempts.length`(=`studyStats().total`) |
| `UNIQ` | `new Set(attempts.map(a=>a.q).filter(id=>amQuestion(id))).size` ※古い問題IDをクランプ(批評反映) |
| `COV` | `UNIQ / AM_QUESTIONS.length`(640) |
| `REVENGE_B` / `REVENGE_C` | §3の `revengeCount` / `overcomeQuestions` |
| `STREAK` / 最長 | `studyStats().streak` / `longestStreak()` |
| `MID_DONE` | ある middle のユニーク正答数 == `countByMiddle().get(middle)`(**計算問題込みの分母**) |
| `MODE(x)` | `attempts.filter(a=>a.mode===x).length` |
| `COMBO` | 全attempts `t`昇順で `ok` 連続の最大長 |
| `PM_KEYS`/`PM_O` | `Object.keys(pm).length` / 全 `pm[id][part].grade==="o"` 数 |

### 4.2 カテゴリ一覧

| カテゴリ | 軸 | MVP数 | カタログ上限 | 荒稼ぎ耐性 |
|---|---|---|---|---|
| A. 量(Volume) | 累計+ユニーク | 4 | 9 | 累計はファーム可 → 最上位は `UNIQ` とAND |
| B. リベンジ(Revenge) | 延べB+種類C | 3 | 10 | per-qクランプ+定義Cが周回無効 |
| C. 継続(Streak) | 最長+延べ日数 | 3 | 6 | 日単位で耐性あり |
| D. カバレッジ(Coverage) | ユニーク到達 | 1 | 4 | 周回無効(構造的に強い) |
| E. マスタリー(Mastery) | middle完答 | 1 | 4+動的 | 周回無効 |
| F. 正確さ(Accuracy) | 補助(主役にしない) | 0 | 4 | 母数下限必須 |
| G. 午後(PM) | pm現在分布 | 2 | 4(**クランプ**) | — |
| H. 挑戦(Challenge) | 時間帯/mode | 0 | 5 | — |
| I. 初回(First) | 存在判定 | 3 | 3 | — |

### 4.3 MVP公開実績(★=約16個。到達可能性を実データで検証済み)

| 名称 | 解除条件 | 信号 | ティア |
|---|---|---|---|
| はじめの一問 | `TOTAL >= 1` | I | Br |
| 初正解 | `attempts.some(a=>a.ok)` | I | Br |
| 初リベンジ | `REVENGE_B >= 1` | I | Br |
| 千里の一歩 | `TOTAL >= 100` | A累計 | Br |
| 反復の徒 | `TOTAL >= 500` | A累計 | Si |
| 初見ハンター | `UNIQ >= 50` | Aユニーク | Br |
| 開拓者 | `UNIQ >= 200` | Aユニーク | Si |
| 雪辱の一撃 | `REVENGE_B >= 10` | B延べ | Br |
| 七転八起 | `REVENGE_B >= 50` | B延べ | Si |
| 弱点撃破 | `REVENGE_C >= 10` | B種類 | Br |
| 三日坊主返上 | 最長 `STREAK >= 3` | C | Br |
| 一週間皆勤 | 最長 `STREAK >= 7` | C | Si |
| 継続は力 | 最長 `STREAK >= 30` | C | Go |
| 折り返し地点 | `COV >= 0.5` | D | Si |
| 分野制覇 | いずれかの middle で `MID_DONE` | E | Si |
| 午後デビュー | `PM_KEYS >= 1` | G | Br |
| 完答者 | ある `pmId` で採点済パーツ数 == 当該 `PmQuestion` の全parts数(`sections.flatMap(...parts)`) | G | Si |

配分:量4/リベンジ3/継続3/カバレッジ1/マスタリー1/午後2/初回3。リベンジと量を最厚に。

### 4.4 表示・母集団に関する3つの明示(批評反映)

1. **午後のしきい値クランプ**:`PM_QUESTIONS`(=`EXAMS.flatMap(e=>e.pm)`)は現状 `2025r07a` 由来の**1問・8パーツのみ**。よって `PM_KEYS>=10` や `PM_O>=20` は**永久に不能**。カタログ生成時に `min(希望値, PM_QUESTIONS.length)` / `min(希望値, 総パーツ数)` で**データ駆動クランプ**する。MVPの午後2件(`PM_KEYS>=1` / 完答者)は到達可能で問題なし。他の午後実績はPM問題が増えるまでPhase2非公開。

2. **`excludeCalc` とマスタリー/カバレッジの相互作用**:`PracticeSetup.tsx` の `excludeCalc`(既定false)をONにすると `questionsByMiddle(..., {excludeCalc})` で計算問題が出題プールから消える。一方 `MID_DONE`/`COV` の分母は `countByMiddle()`(引数なし=計算込み全640)。**計算問題を避け続けると基礎理論などで分母に永久に届かない**。これは「難問回避への逆インセンティブ」として意図的に残すが、UIヒントに「マスタリーは計算問題も必要」と明記する。`完全走破 COV` は末尾のobscure問まで要求され死にバッジ化しやすいので**しきい値は選択肢§9で決定**。

3. **グリッド表示の解除判定=論理和(定義Cの非単調対策)**:`AchievementGrid` の解除/未解除は「**保存済み `achievements[id]` が存在 OR `evaluate()` で unlocked**」で描く。`evaluate()` 直読みだと `REVENGE_C` が閾値を割った瞬間に既解除バッジが再ロックされ**ちらつく**ため。進捗バーは `progress = Math.max(保存値, 現在値)` を採用し、後退で萎えさせない。

---

## 5. 判定エンジンと同期整合

### 5.1 共有コンテキスト(N実績×全走査を避ける)

`evaluate()` は必ず単一 `EvalContext`(`stats`/`byQuestion`/`revenge`/`longestStreak`/`coveredMiddles`/`masteredMiddles`)を共有し、**各 `AchvDef.eval` は独自の全走査をしない**ことを実装規約とする。`Stats.tsx` が既に持つ `byMiddle`/`overallRate`/`daily`/`last7Agg` に相乗り。

### 5.2 reconcile(解除は追加のみ・削除なし)

```ts
function reconcile(state, { silent, emit }: { silent: boolean; emit: boolean }): AchvId[] {
  const now = Date.now();
  const result = evaluate(buildContext(state));
  const ach = { ...(state.achievements ?? {}) };
  const newly: AchvId[] = [];
  for (const [id, r] of result) {
    if (r.unlocked && !ach[id]) {                 // add-only(巻き戻り不変条件)
      ach[id] = { unlockedAt: r.at ?? now, seen: silent, progress: r.progress };
      if (!silent) newly.push(id);
    } else if (ach[id] && r.progress !== undefined) {
      ach[id].progress = Math.max(ach[id].progress ?? 0, r.progress); // 後退救済
    }
  }
  state.achievements = ach;
  if (emit && !silent && newly.length) window.dispatchEvent(new CustomEvent("achv:unlock", { detail: newly }));
  return newly;
}
```

- **初回遡及**(`Object.keys(state.achievements??{}).length===0` かつ `attempts.length>0`):`silent:true, emit:false`(大量トースト暴発を防止、`seen:true` で刻む)。
- **逐次解答**(`recordAnswer` 経由):`silent:false, emit:true`。
- **mockバッチ**(`recordAnswersBatch` 経由):`silent:false, emit:false`(批評反映=二重演出ガード)。`MockRun` の結果画面が戻り値の `AchvId[]` を自前で一括表示。

### 5.3 sync.ts への配線と PUT順序修正(最重要・批評反映)

現状 `syncNow()`(`sync.ts` L46-55)は `merged=mergeStates(...)` → `saveStateRaw(merged)` → `PUT {data: merged}`。ここに `reconcile` を素朴に挿すと(a) reconcile後に再保存が無く `unlockedAt` がローカルに残らない、(b) PUTが reconcile前の `merged` を送るため遡及解除がサーバに乗らず**毎回やり直し**になる。正しい順序に修正:

```
merge(mergeStates: achievements union込み)
  → reconcile(merged, { silent:true, emit:false })   // 相手端末attemptsからの遡及解除
  → saveStateRaw(merged)                              // reconcile後を保存
  → PUT { data: merged }                              // reconcile後を push
```

`saveStateRaw` を使うのは、演出フラグ(`seen`)や同期由来の更新で `updatedAt` を進めると sync優先が乱れるため。§7の実装ファイル表に **`src/lib/sync.ts` を必ず追加**する。

---

## 6. UX配置と演出

配置は **分析タブ主軸 + ホームサマリ + 解除トースト** の3点。専用画面 `/achievements` はPhase2(タブは `TabBar.tsx` の5枠固定、増やさない)。

### 6.1 再利用資産
- **CSS(`global.css`)**:`.card`(`--surface`/`--border`/`--radius-lg`)、`.chip`、`.chip-toggle(.on)`(フィルタ)、`.bar-track`/`.bar-fill(.warn)`(進捗)、`.heat-0..4`(`color-mix` 濃淡=ティアのレアリティを単色相表現)、`.choice-dim`(`opacity:0.55`=未解除)、`.ai-panel`/`.ai-fab`(トースト作法)。**色は生の16進を書かず必ず `var(--*)`**(`:root` と `@media (prefers-color-scheme: dark)` で自動ダーク対応)。
- **コンポーネント**:`ContributionGraph`(`heat-cell`)、`AccuracyTrend`(円弧メダルの手本)、`Icons.tsx` の `svgProps(size)`・`IconStar`/`IconSparkle`。必要なら `IconFlame`/`IconMedal` を `svgProps()` 準拠で追加。

### 6.2 分析タブ `Stats.tsx`(グリッド本命)
末尾に `<AchievementGrid/>` を新設。解除済=`background:var(--accent-bg)`+`borderColor:var(--accent)`、未解除=`.card`+`opacity:0.55`+`hint` を `.muted.small`+`.bar-track`/`.bar-fill`(「あと◯問」)。フィルタは `.chip-toggle`(全て/解除済み/未解除)。解除判定は§4.4の**論理和**。
> 注意:`total===0` の**早期return(L70)**があるためグリッドはデータありユーザにのみ表示。初回ユーザ向けはHomeサマリ(§6.3)で担保する。

### 6.3 ホーム `Home.tsx`(サマリ・初回導線)
3連メトリクスカード(`stats.streak/total/today`)付近に「最新解除1件 + 獲得数 `.chip`」の小カードを1枚、`Link className="card"` で `/stats` へ誘導。
> 批評反映:**分母は「その時点で見せている集合(=MVP16)」に固定**(カタログ42を分母にすると `n/42` の大量未解放で萎える)。**`total===0` でもこのカードは出す**(`0/16`「最初の1問で解除」)ことで初回導線を確保。

### 6.4 解除トースト `AchievementToast.tsx`
`App.tsx` 直下に常設、`achv:unlock` を購読しキュー方式で表示。**1解答で複数解除でも1枚に集約**。`.ai-panel` スライドイン(モバイル `translateY`/PC `translateX`、`transition:transform 0.25s ease`)、祝福色 `--success-bg`/`--success-text`、`z-index` は60〜70帯(`.tabbar`=50 と `.ai-panel`=80 の間)、`bottom` は `calc(var(--tabbar-h) + env(safe-area-inset-bottom) + …)`。表示後 `seen=true` を **`saveStateRaw`** で刻む。音・振動は既定OFF(`settings` で任意ON)。見逃してもグリッドで回収。

### 6.5 ブリッジ文言
誤答時の `banner-ng` に「復習リストに追加。次で取り返そう」を添えてリベンジ導線へ橋渡し。

---

## 7. 不採用メカニクスと主要リスク対策

| メカニクス/リスク | 判定・対策 |
|---|---|
| XP/レベル/ガチャ | **不採用**(周回で無限稼ぎ、内発動機のアンダーマイニング) |
| 同一問題の周回で荒稼ぎ | 量最上位は `UNIQ` とAND、リベンジは per-qクランプ(§3)+定義C併記 |
| 正答率のための難問回避 | 正答率を主要KPI・解除条件の主役にしない。指標は「触れた数」「克服した数」 |
| リベンジ延べのファーム(`review` で誤→正連打) | per-qクランプ=1問3回上限 + 翌日due の自然律速 |
| 午後の不能バッジ | PM母集団(1問/8パーツ)で**データ駆動クランプ**(§4.4) |
| 定義Cの非単調・グリッドちらつき | 解除表示を**論理和**、progressは `Math.max` 保存(§4.4/5.2) |
| sync配線漏れ・PUT順序 | `sync.ts` に reconcile を merge→reconcile→save→PUT の順で(§5.3) |
| mock二重演出 | `reconcile(emit:false)`、結果画面が自前表示(§5.2) |
| 遡及解除のトースト暴発 | 初回は `silent:true, emit:false` |
| ストリーク全損での離脱 | 最長ストリーク保持で全損に見せない(緩和の扱いは§9で選択) |
| `キュー完走`(`review` 空)の例外 | この実績のみ真実源が `attempts` でなく `review` 派生スナップショット。`unlockedAt` は導出不能で `now` 固定になる旨を明記。MVP非公開推奨 |

---

## 8. MVPの実装ステップ(順序付き)

1. **型追加**(`src/data/types.ts`):`AchvId`/`AchievementRecord`/`Achievements`、`ProgressState.achievements?`。
2. **永続化の下地**(`src/lib/progress.ts`):`loadState` に `s.achievements ??= {}`。`mergeStates` の戻り値に **achievements union を追加**(§2.2、現状 L240-246 に無い=最優先)。
3. **判定ライブラリ新規**(`src/lib/achievements.ts`):`revengeStats`(per-qクランプ込み・§3)/`longestStreak`/`buildContext`/`evaluate`、`AchvDef` と `ACHIEVEMENTS` 配列(`tierize` でしきい値量産、`PM_QUESTIONS.length`・総パーツ数・`countByMiddle()` を読んで**しきい値をクランプ**、`UNIQ` は `amQuestion(id)` でフィルタ)。
4. **reconcile 実装**(`progress.ts`):`{silent, emit}` 版(§5.2)。`recordAnswer` の `saveState` 直前に `reconcile(s,{silent:false,emit:true})`、`recordAnswersBatch` は `{silent:false,emit:false}` で戻り値 `AchvId[]` を返す。既存呼び出し側は戻り値無視で従来動作(後方互換)。
5. **同期配線**(`src/lib/sync.ts`):`syncNow()` を merge→`reconcile({silent:true,emit:false})`→`saveStateRaw`→PUT の順に修正(§5.3)。
6. **グリッド**(`src/components/AchievementGrid.tsx` 新規):`evaluate(buildContext(loadState()))` + **保存済みとの論理和**、`.card`/`.chip`/`.bar-*`/`heat-*`、`.chip-toggle` フィルタ。`Stats.tsx` 末尾に配置。
7. **トースト**(`src/components/AchievementToast.tsx` 新規):`achv:unlock` 購読・集約・`.ai-panel`、表示後 `seen` を `saveStateRaw`。`App.tsx` 直下に常設。
8. **ホームサマリ**(`Home.tsx`):獲得数 `.chip`(分母=MVP16)+ 最新1件、`total===0` でも表示。
9. **mock結果画面**(`MockRun.tsx`):`recordAnswersBatch` の戻り `AchvId[]` を一括表示。
10. **アイコン**(`Icons.tsx`):必要なら `IconFlame`/`IconMedal`。
11. **通し確認**:遡及(既存attempts→silent)、単一問題連打(per-qクランプ確認)、2端末sync(union・遡及解除がPUTに乗る)。

Phase2:専用画面 `/achievements`、Leitner卒業(`graduated: string[]`)、模試スコア(`mockResults[]`)、午後×→○履歴(`PmPartRecord.history`)、午後・正確さ・挑戦カテゴリの下位ティア解放。

---

## 9. ユーザーに決めてほしい選択肢(推奨付き)

1. **ストリーク緩和(週1フリーズ)をMVPに入れるか**
   現状の `studyStats().streak`(L136-141)は1日空くと0リセットの厳格実装で、Home表示にも直結。緩和は未実装。
   - A: `streakWithGrace(state, graceDaysPerWeek=1)` を achievements専用に新設し、Home表示の `studyStats().streak` とは分離。
   - B: 緩和はPhase2に降格し、MVPは厳格ストリーク+最長ストリーク保持のみ。
   - **推奨=B**(実装コスト・Home表示への影響を避け、まず「全損に見せない」だけで足りる)。

2. **`完全走破`(全問到達)のしきい値**
   `COV>=1.0` は末尾のobscure問まで要求され、計算問題を避けると永久不能(§4.4)。
   - A: `COV>=1.0` を維持(超ハードなPt)。
   - B: `COV>=0.95` に緩和。
   - **推奨=B**(死にバッジ回避。UIヒントに「計算問題も含む」と明記)。

3. **量・リベンジ最上位のファーム対策の強度**
   `問題殲滅者 TOTAL>=3000` と `不屈の覇者 REVENGE_B>=300` は単一問題ループで埋まりうる。
   - A: per-qクランプ(§3、`REVENGE_PER_Q_CAP=3`)だけ入れる(軽量)。
   - B: さらに最上位を `TOTAL>=3000 かつ UNIQ>=500`、`REVENGE_B かつ REVENGE_C>=一定` のANDにする。
   - **推奨=A+最上位のみB**(per-qクランプは全体に効かせ、Ptバッジだけ「学習の実体」に接地させる)。

4. **午後実績のPhase2しきい値の扱い**
   PM母集団は現状1問/8パーツ(§4.4)。
   - A: `min(希望値, 母集団)` でデータ駆動クランプし、PM問題が増えたら自動で上限が伸びる。
   - B: 午後はMVP2件(`PM_KEYS>=1`/完答者)のみとし、他はPM問題追加まで完全非公開。
   - **推奨=A**(コード変更なしでデータ追加に追随。死にバッジも出ない)。

---

## 参照した実ファイル(絶対パス)
- `/home/user/ap-study/src/lib/progress.ts`(`KEY="ap-study:v1"` L39、`saveState` L77/`saveStateRaw` L83、`recordAnswer` L88-109、`studyStats` L133-147、`recordAnswersBatch` L167-、`mergeStates` L224-247=**achievements 未返却**)
- `/home/user/ap-study/src/lib/sync.ts`(`syncNow` L25-、`mergeStates`→`saveStateRaw(merged)` L50→`PUT {data: merged}` L52-55=**PUT順序修正対象**)
- `/home/user/ap-study/src/data/index.ts`(`EXAMS`=`normalize(r2025a, r2025aPm.pm)` のみPM有り・他7本 `[]` L24-31、`AM_QUESTIONS` L34/`PM_QUESTIONS` L35、`isCalcQuestion` L131、`questionsByMiddle`/`excludeCalc` L139-147、`countByMiddle` L151-158、`amQuestion`)
- `/home/user/ap-study/src/data/exams/2025r07a.pm.json`(**PM=1問・8パーツ**を実測)
- `/home/user/ap-study/src/data/types.ts`(`ProgressState`・`MIDDLES_BY_MAJOR`・`AmQuestion.middle`)
- `/home/user/ap-study/src/pages/Stats.tsx`(`total===0` 早期return L70-82、`byMiddle`/`overallRate`/`daily`/`last7Agg`)
- `/home/user/ap-study/src/pages/Home.tsx`(3連メトリクスカード・`Link className="card"`)、`PracticeSetup.tsx`(`excludeCalc`)、`MockRun.tsx`、`App.tsx`、`TabBar.tsx`(5枠固定)
- `/home/user/ap-study/src/styles/global.css`(`.card`/`.chip`/`.chip-toggle`/`.bar-*`/`.heat-*`/`.ai-panel`/`.ai-fab`/CSS変数)、`Icons.tsx`、`ContributionGraph.tsx`、`AccuracyTrend.tsx`
