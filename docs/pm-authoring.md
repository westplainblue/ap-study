---
tags: [リファレンス, データ作成]
aliases: [午後問題の追加手順]
---

# 午後問題の追加手順

> [!info] [[ホーム]] › 午後問題の収録手順。午前は [[am-authoring|午前問題の作成マニュアル]]。

午後(記述式)の問題データを収録するための手順。午前(`*.am.json`)と違い、
長文の本文・設問・IPA公表の解答例をセットで転記する。

## 前提: 出典はIPA公式PDFのみ

午後問題は**実在する過去問**を収録する。本文・設問・解答例は必ず
[IPA公式の過去問題ページ](https://www.ipa.go.jp/shiken/mondai-kaiotu/)で公表されている
PDF(`<code>_ap_pm_qs.pdf` / `<code>_ap_pm_ans.pdf`)から転記すること。
推測や生成で補完してはならない(学習者が本番と異なる内容を覚えてしまうため)。

解説にあたる `note` はアプリ独自のコメントなので自作でよい。

## 1. PDFを取得する

```bash
npm run fetch-exam -- 2025r07h https://www.ipa.go.jp/shiken/mondai-kaiotu/2025r07.html
```

`data-src/pdf/` に4種類(午前/午後 × 問題/解答例)がダウンロードされる。
午後PDFの本文はテキスト層があることが多いので、`pdftotext`(poppler)で抽出できる。

```bash
pdftotext -layout data-src/pdf/2025r07h_ap_pm_qs.pdf - | less
```

テキスト層がない場合は `pdftoppm -png -r 200` でページ画像化して読み取る。

## 2. JSONを作る

`src/data/exams/<code>.pm.json` を作成する。形は
[`src/data/types.ts`](../src/data/types.ts) の `PmQuestion` に従う。

```jsonc
{
  "examId": "2025r07h",
  "pm": [
    {
      "id": "2025r07h-pm-01",       // 必ず <examId>-pm-<2桁番号>
      "examId": "2025r07h",
      "number": 1,
      "field": "情報セキュリティ",   // 出題分野
      "title": "…(必須問題)",        // 題材の一行説明
      "sections": [                  // 本文。画面では見出し単位で開閉できる
        {
          "heading": "前文(◯社の概要)",
          "body": "…本文…",
          "figure": "figures/2025r07h/pm-q01-fig1.png"  // 任意
        }
      ],
      "setumon": [
        {
          "label": "設問1",
          "parts": [
            {
              "label": "空欄a",            // 設問内で一意(進捗の保存キーになる)
              "question": "本文中の【 a 】に…\n解答群: ア … / イ …",
              "answer": "ク(境界防御)",     // IPA公表の解答例。必須
              "note": "…アプリ独自の補足…"  // 任意
            }
          ]
        }
      ]
    }
  ]
}
```

注意点:

- `id` は `<examId>-pm-<2桁>`。ズレるとテストで落ちる。
- `label` は `設問N` と `空欄a` / `(1)` のように、**問題内で重複しない**こと。
  進捗は `` `${設問label}:${partLabel}` `` をキーに保存するため、重複すると採点が混ざる。
- `answer` は自己採点とAI採点の基準になるので空にしない。
- 図表は `public/figures/<code>/` に置き、`figure` には `figures/…` からの相対パスを書く。

## 3. アプリに取り込む

`src/data/index.ts` で import して `normalize` に渡す(午前と同じ要領)。

```ts
import r2025hPm from "./exams/2025r07h.pm.json";
// …
export const EXAMS: ExamData[] = [
  normalize(r2025a, r2025aPm.pm),
  normalize(r2025h, r2025hPm.pm),   // ← 第2引数に渡す(渡し忘れると0問扱い)
  // …
];
```

## 4. 検証する

```bash
npm test          # tests/pmData.test.mjs が構造を検証する
npm run typecheck
npm run build
```

`tests/pmData.test.mjs` は次を自動チェックする。

- IDの一意性と形式、`examId` が収録済みの試験回と一致するか
- `field` / `title` / `body` / `question` / `answer` が空でないか
- 設問キー(`設問N:空欄a`)の重複
- `figure` で参照した画像ファイルの実在
- **JSONにある問題数とアプリに読み込まれた問題数の一致**(手順3の渡し忘れ検出)

画面の確認は午後タブ(`/pm`)から。AI採点は設定でAIを登録していれば設問ごとに使える。
