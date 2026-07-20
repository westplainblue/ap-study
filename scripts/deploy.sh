#!/usr/bin/env bash
# ap-study を S3 + CloudFront へ手動デプロイする。
#
# 使い方:
#   # A) CloudFormation スタック名から自動解決(推奨)
#   HOSTING_STACK=ap-study-hosting ./scripts/deploy.sh
#
#   # B) 値を直接指定
#   BUCKET=xxx DIST_ID=XXXX ./scripts/deploy.sh
#
# 前提: AWS CLI v2 で認証済み(aws configure / SSO)。Node.js でビルド可能なこと。
set -euo pipefail

HOSTING_STACK="${HOSTING_STACK:-}"
BUCKET="${BUCKET:-}"
DIST_ID="${DIST_ID:-}"

# --- スタックから出力を解決(BUCKET/DIST_ID 未指定時) ---
if [[ -z "$BUCKET" || -z "$DIST_ID" ]]; then
  if [[ -z "$HOSTING_STACK" ]]; then
    echo "エラー: HOSTING_STACK か、BUCKET と DIST_ID を環境変数で指定してください。" >&2
    exit 1
  fi
  echo "==> CloudFormation スタック '$HOSTING_STACK' から出力を取得..."
  outputs=$(aws cloudformation describe-stacks --stack-name "$HOSTING_STACK" \
    --query "Stacks[0].Outputs" --output json)
  BUCKET=$(echo "$outputs" | python3 -c "import sys,json;print(next(o['OutputValue'] for o in json.load(sys.stdin) if o['OutputKey']=='BucketName'))")
  DIST_ID=$(echo "$outputs" | python3 -c "import sys,json;print(next(o['OutputValue'] for o in json.load(sys.stdin) if o['OutputKey']=='DistributionId'))")
fi

echo "==> Bucket=$BUCKET  Distribution=$DIST_ID"

# --- ビルド ---
echo "==> npm run build"
npm run build

# --- アップロード(キャッシュ戦略ごとに 3 段階) ---
# 1) ハッシュ付き資産(assets/*)= 長期 immutable。index.html は次段で個別に。
echo "==> sync assets (immutable)"
aws s3 sync dist/ "s3://$BUCKET" --delete \
  --exclude "index.html" \
  --cache-control "public,max-age=31536000,immutable"

# 2) 図表 PNG は名前固定のため 1 日キャッシュに上書き(更新は invalidation で反映)
if [[ -d dist/figures ]]; then
  echo "==> re-set Cache-Control on figures (1 day)"
  aws s3 cp dist/figures "s3://$BUCKET/figures" --recursive \
    --cache-control "public,max-age=86400" \
    --metadata-directive REPLACE
fi

# 3) index.html は毎回検証(no-cache)+ 明示的な Content-Type
echo "==> upload index.html (no-cache)"
aws s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --cache-control "no-cache" \
  --content-type "text/html; charset=utf-8"

# --- キャッシュ無効化(月 1,000 パスまで無料) ---
echo "==> CloudFront invalidation"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" >/dev/null

echo "==> 完了。数分でエッジに反映されます。"
