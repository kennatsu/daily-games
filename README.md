# daily-games

日次ブラウザゲームのスイート。小さく出荷して、計測しながら育てる。

## ゲーム一覧

| # | ゲーム | 状態 |
|---|--------|------|
| 1 | [チャート当て](https://kennatsu.github.io/daily-games/chart-guess/) | 公開中 |
| 2 | AIチャレンジ（説得/攻略デイリー） | 構想中 |
| 3 | AIエージェント学習アプリ | 構想中 |

## 方針

- 毎日1問のデイリー形式・結果シェア導線を標準装備
- まず静的ホスティングで出荷し、必要になってからバックエンドを足す

## データ更新

チャート当ての株価データは Yahoo Finance から取得する。銘柄マスタは `scripts/stocks-catalog.mjs`、問題生成は `scripts/build-puzzles.mjs`、データ取得は `scripts/fetch-data.mjs`。

```bash
# 銘柄を追加した場合
node scripts/build-puzzles.mjs
node scripts/fetch-data.mjs

# データだけ更新する場合
node scripts/fetch-data.mjs
```

毎月2日 03:00 JST に GitHub Actions が自動更新する（`.github/workflows/update-stock-data.yml`）。

### ヒントの再生成（Fable 5 推奨）

1. `node scripts/export-for-hints.mjs` — チャート変動ポイントを抽出
2. Fable 5 に `scripts/hints-input.json` を渡して `hints-batch-*.json` を生成
3. `node scripts/merge-fable-hints.mjs` — マージ
4. `node scripts/build-puzzles.mjs` — puzzles.js 更新

手動（Fable なし）の場合は `node scripts/build-smart-hints.mjs` で sector ベースの解説を生成。
