# infra — AWS 構築手順(S3 + CloudFront)

[docs/aws-build-plan.md](../docs/aws-build-plan.md) の計画をコード化したもの。**あなたのAWSアカウントで以下のコマンドを実行**すれば構築できる(この構成物自体は課金されない。実リソース作成時のみ、無料枠内で 0 円運用)。

## 構成物

| ファイル | 役割 |
|---|---|
| `hosting.yaml` | S3(非公開)+ CloudFront + OAC + バケットポリシー。**これだけで公開できる** |
| `github-oidc.yaml` | GitHub Actions 用のキーレス(OIDC)デプロイロール |
| `../scripts/deploy.sh` | 手元からの手動デプロイ(ビルド→S3同期→キャッシュ無効化) |
| `../.github/workflows/deploy-aws.yml` | push で自動デプロイ(OIDC)。既定は無効(手動起動のみ) |

> 既存の `deploy.yml`(GitHub Pages)はそのまま残してある。AWS へ移行後は不要なら削除/無効化してよい。

## 前提

- AWS CLI v2 で認証済み(`aws configure` か SSO)
- Node.js(このリポジトリをビルドできる環境)
- リージョンは東京(`ap-northeast-1`)を想定

---

## 手順

### 1. ホスティング基盤を作成(★これだけで公開可)

```bash
aws cloudformation deploy \
  --template-file infra/hosting.yaml \
  --stack-name ap-study-hosting \
  --region ap-northeast-1
```

作成された値(バケット名・ディストリビューションID・URL)を取得:

```bash
aws cloudformation describe-stacks --stack-name ap-study-hosting \
  --query "Stacks[0].Outputs" --output table
```

### 2. 初回デプロイ(アプリを配置)

```bash
HOSTING_STACK=ap-study-hosting ./scripts/deploy.sh
```

`SiteURL`(`https://xxxx.cloudfront.net`)をブラウザで開いて確認する。
CloudFront の初回反映は数分〜十数分かかることがある。

**確認**: トップ表示 / 演習で図表PNG表示 / リロードで404にならない(HashRouter)/ HTTPがHTTPSにリダイレクト。

> ここまでで「HTTPS公開」は完了。以降(3〜4)は自動デプロイと予算監視で任意。

### 3. 自動デプロイ(GitHub Actions / OIDC)

3-1. デプロイロールを作成(手順1の出力 BucketArn / DistributionArn を渡す):

```bash
aws cloudformation deploy \
  --template-file infra/github-oidc.yaml \
  --stack-name ap-study-github-oidc \
  --capabilities CAPABILITY_IAM \
  --region ap-northeast-1 \
  --parameter-overrides \
    GitHubOrg=westplainblue \
    GitHubRepo=ap-study \
    GitHubBranch=main \
    BucketArn=<手順1のBucketArn> \
    DistributionArn=<手順1のDistributionArn>
    # 既に GitHub の OIDC プロバイダがある場合は末尾に CreateOIDCProvider=false を追加
```

出力の `DeployRoleArn` を取得:

```bash
aws cloudformation describe-stacks --stack-name ap-study-github-oidc \
  --query "Stacks[0].Outputs[?OutputKey=='DeployRoleArn'].OutputValue" --output text
```

3-2. GitHub リポジトリに Secrets を登録(Settings → Secrets and variables → Actions):

| Secret 名 | 値 |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | 上の DeployRoleArn |
| `S3_BUCKET` | 手順1の BucketName |
| `CF_DISTRIBUTION_ID` | 手順1の DistributionId |
| `VITE_SUPABASE_URL` | (任意)Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | (任意)Supabase anon キー |

3-3. `.github/workflows/deploy-aws.yml` の `push:` トリガーのコメントを外して有効化 → `main` に push すると自動デプロイされる。

### 4. 予算アラート(推奨)

想定外課金の早期検知。`ACCOUNT_ID` と通知先メールを置き換える:

```bash
aws budgets create-budget --account-id ACCOUNT_ID \
  --budget '{"BudgetName":"ap-study-monthly","BudgetLimit":{"Amount":"1","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}' \
  --notifications-with-subscribers '[{"Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":80},"Subscribers":[{"SubscriptionType":"EMAIL","Address":"you@example.com"}]}]'
```

---

## 独自ドメイン(任意)

`hosting.yaml` は既定で `cloudfront.net` ドメイン。独自ドメインを使う場合の追加手順は
[docs/aws-build-plan.md](../docs/aws-build-plan.md) の「フェーズ3」を参照(ACM を us-east-1 で発行し、CloudFront に Alternate domain name と証明書を設定、Route 53 で ALIAS)。

---

## 撤去(teardown)

```bash
# 先にバケットを空にする(Retain 設定のため中身が残っていると削除できない)
aws s3 rm "s3://<BucketName>" --recursive
aws cloudformation delete-stack --stack-name ap-study-github-oidc
aws cloudformation delete-stack --stack-name ap-study-hosting
# SiteBucket は DeletionPolicy: Retain のため、不要なら最後に手動削除
aws s3 rb "s3://<BucketName>"
```
