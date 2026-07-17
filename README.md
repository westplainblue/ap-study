# AP Study — 応用情報技術者試験 学習アプリ

応用情報技術者試験(AP)の初学者向け学習Webアプリ。IPA公開の過去問を収録し、スマホ/PCのブラウザで動作します。要件の経緯は [docs/requirements.md](docs/requirements.md) を参照。

## 機能

- **分野別演習(午前)** — シラバス中分類で分野を選び、5/10/20問を演習。1問ごとに即時判定+初学者向け解説
- **復習(間隔反復)** — 間違えた問題を簡易Leitner方式(翌日→3日→7日→14日)で再出題。「あとで復習」の手動追加も可
- **分析** — 大分類/中分類別の正答率、弱点トピック(そのまま演習開始可)、直近14日の学習量
- **模試モード** — 80問150分のタイマー付き通し演習。中断再開、合格ライン(60%)判定、分野別内訳
- **午後演習** — 問題文のセクション折りたたみ読解+設問ごとの自己採点(○△×)。IPA公表の解答例と補足解説つき
- **設定** — 試験日カウントダウン、進捗のJSONエクスポート/インポート、クラウド同期

## 収録データ

| 回 | 午前 | 午後 |
|---|---|---|
| 令和7年度 秋期 | 80問(全問、図表つき) | 問1 情報セキュリティ |
| 令和7年度 春期 | 80問(全問、図表つき) | −(未収録) |

出典: 応用情報技術者試験 過去問題(独立行政法人情報処理推進機構)。IPAの規約に基づき各問題に出典を明記しています。**解説・初学者ポイントはIPA公表物ではなく本アプリ独自のものです。**

## 起動

```bash
npm install
npm run dev        # 開発サーバー
npm run build      # 本番ビルド(dist/)
```

## 過去問の追加手順(データパイプライン)

1. **PDF取得+ページ画像化**(要 poppler: `brew install poppler`)

   ```bash
   npm run fetch-exam -- 2025r07h https://www.ipa.go.jp/shiken/mondai-kaiotu/2025r07.html
   ```

2. **転記チャンクの作成** — 午前問題PDFはテキスト層のない画像PDFのため、`data-src/pages/am-<code>/` のページ画像を見ながら、`data-src/work/am_chunks-<code>/*.json` に問題文・選択肢・分野タグ・解説を書き起こす(Claude Codeに依頼するのを想定。既存チャンクが書式サンプル)。図表は `figure: {page, top, bottom}` でページ内の縦位置(割合)を指定すると自動で切り出される。

3. **組み立て** — 公式解答例PDFから正答を突合し、検証つきでJSONを生成:

   ```bash
   npm run extract-am -- 2025r07h "令和7年度 春期"
   ```

4. `src/data/index.ts` に生成された `<code>.am.json` のimportを1行追加。

午後は `src/data/exams/<code>.pm.json` に問題文・設問・IPA解答例を構造化して追加する(`2025r07a.pm.json` が書式サンプル。解答例PDFはテキスト抽出可能: `pdftotext -layout data-src/pdf/<code>_ap_pm_ans.pdf -`)。

## クラウド同期(任意)

未設定でもローカル保存(localStorage)で完全に動作します。スマホとPCで進捗を同期したい場合:

1. [Supabase](https://supabase.com) で無料プロジェクトを作成
2. SQL Editor で `supabase/schema.sql` を実行
3. `.env` を作成(`.env.example` 参照)し、プロジェクトのURLとanonキーを設定してビルド
4. アプリの設定画面で「同期コードを発行」→ 他端末で同じコードを入力 →「今すぐ同期」

注意: 認証なしの同期コード方式です。anonキーを知る人は理論上他コードのデータも読めるため、学習履歴のみを保存する本アプリの用途に限った割り切り構成です(詳細は `supabase/schema.sql` のコメント)。

## AIチャット(任意)

画面右上の✨ボタンから、いま解いている問題を踏まえてAIに質問できます(演習・模試・午後の問題文が自動で共有されます)。接続先は設定画面で選べます。

| プロバイダ | 方式 | 備考 |
|---|---|---|
| Codex(ChatGPTサブスク) | ローカルブリッジ経由 | APIキー不要。ChatGPTプランのCodex枠を消費 |
| OpenAI / Claude / Grok | 自分のAPIキー(BYOK) | 従量課金。スマホ単体でも使える |

### Codexブリッジの使い方(ChatGPTサブスク枠)

前提: [Codex CLI](https://developers.openai.com/codex/cli) がインストール済みで、`codex login`(ChatGPTサインイン)が完了していること。

```bash
npm run codex-bridge
```

を起動したまま、アプリの設定 → AIチャット → 「Codex(ChatGPTサブスク/ローカル)」を選ぶだけです(既定URL `http://127.0.0.1:8399/v1`)。内部では公式CLIの `codex exec` を読み取り専用サンドボックス+空ディレクトリで呼び出し、CLIの保存済み認証(サブスク枠)を利用します。

- スマホから使う場合: `npm run codex-bridge -- --host 0.0.0.0 --token <好きな合言葉>` で起動し、設定のブリッジURLに `http://<MacのIP>:8399/v1`、APIキー欄相当としてブリッジのトークンを設定します(同一Wi-Fi内のみ)。
- **注意(規約)**: ChatGPTサブスク認証の第三者的な利用についてOpenAIは明示的に許可も禁止もしていません(2026年7月時点の調査)。自分専用・ローカル完結の範囲で自己責任で使ってください。心配な場合はAPIキー方式を使ってください。
- 応答はAPI直叩きより遅めです(1回あたり10〜30秒程度。`codex exec` の起動を伴うため)。
- ブラウザの注意: 公開サイト(HTTPS)からローカルブリッジ(HTTP)への接続は、Chrome / Edge / Firefox では localhost 例外により動作します(実測確認済み)。**Safariにはこの例外がないため**、Safariで使う場合は `npm run dev` で起動したローカル版(http://localhost:5273)から利用してください。同じ理由でiPhoneのSafariからのブリッジ利用は不可のため、**スマホではAPIキー方式を推奨**します。

### APIキー方式(OpenAI / Claude / Grok)

設定 → AIチャットでプロバイダを選び、自分のAPIキーを入力します。

**セキュリティの設計**:
- キーは端末のブラウザ内(localStorage)にのみ保存され、クラウド同期・JSONエクスポートには**含まれません**
- キーの送信先は各社の公式APIエンドポイントのみ(本アプリにサーバーはありません)
- AIの応答はプレーンテキストとして描画され、HTMLは実行されません
- 推奨: 支出上限付き・権限を絞ったキー(OpenAIならProjectスコープキー)を使い、共有端末では保存しないでください

## デプロイ

静的サイトとしてどこにでも置けます(`vite.config.ts` で相対パス設定済み、ルーティングはHashRouter)。

- **GitHub Pages**: `npm run build` → `dist/` を公開(Actionsを使う場合は環境変数に同期用キーを設定)
- **Vercel/Netlify**: リポジトリを接続し、ビルドコマンド `npm run build`・出力 `dist` を指定

## 技術構成

Vite + React + TypeScript(SPA)。問題データは静的JSONとしてバンドルに同梱し、ランタイムのAI API等は不要。進捗は localStorage(キー `ap-study:v1`)+任意でSupabase同期。
