# AWS構成図(draw.io / CloudFormationから自動生成)

`infra/` のCloudFormationテンプレートから **cfn-diagram** で自動生成した、AWS公式アイコンつきの構成図(draw.io形式)。**テンプレートと図が一致**するのが利点(コードが正、図はそこから生成)。

| ファイル | 元テンプレート | 含まれるリソース |
|---|---|---|
| [`hosting.drawio`](./hosting.drawio) | `infra/hosting.yaml` | S3・CloudFront・OAC・バケットポリシー |
| [`sync.drawio`](./sync.drawio) | `infra/sync.yaml` | Lambda・Lambda Function URL・DynamoDB・IAMロール/ポリシー |

> システム全体を俯瞰した図(利用者・配信・同期・デプロイを1枚に)は [`../architecture.md`](../architecture.md)(Mermaid)を参照。こちらの `.drawio` は**スタックごとの詳細**で、自由に編集できます。

## 開き方(インストール不要)

- **ブラウザ**: [app.diagrams.net](https://app.diagrams.net)(draw.io)を開き、`.drawio` ファイルをドラッグ&ドロップ、または File → Open from → Device
- **VS Code**: 拡張機能「Draw.io Integration」を入れると、`.drawio` をエディタ内で直接表示・編集できる
- 編集したら PNG/SVG に書き出して資料に貼るのも簡単(draw.io の File → Export as)

## 再生成する方法(テンプレート更新時)

テンプレートを変更したら、同じコマンドで図も作り直せる:

```bash
# hosting スタックの図
npx -p @mhlabs/cfn-diagram cfn-dia draw.io \
  -t infra/hosting.yaml -o docs/diagrams/hosting.drawio -c

# sync スタックの図
npx -p @mhlabs/cfn-diagram cfn-dia draw.io \
  -t infra/sync.yaml -o docs/diagrams/sync.drawio -c
```

- `-t` … 入力テンプレート / `-o` … 出力先 / `-c` … 対話プロンプトを省略(全リソースを対象)
- ツール: [cfn-diagram](https://github.com/ljacobsson/cfn-diagram)(`@mhlabs/cfn-diagram`)

## 補足

- 自動生成図は「テンプレート内のリソースと参照関係」を機械的に描く**リソースレベル**の図です。プレゼン用に整えたい場合は、draw.ioで開いて配置・グルーピングを手直しするのがおすすめ(「ベースを自動生成→細部を手動調整」が定石)。
- スタックが2つ(hosting / sync)に分かれているため図も2枚です。1枚に統合したい場合はdraw.io上で結合できます。
