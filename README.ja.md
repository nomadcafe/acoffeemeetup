<div align="center">

# ACoffee

**ふたりの真ん中で、いいコーヒーを。**

住所を2〜3つ入れるだけ。ACoffee が全員にとって公平で、評価の高いカフェを探します。
地図上の中間点ではなく、一人ひとりの実際の移動時間で選びます。

[**acoffee.com**](https://acoffee.com) · 無料 · 登録不要 · オープンソース

[English](README.md) · 日本語 · [简体中文](README.zh-CN.md)

<img src="public/og/home-ja.png" alt="ACoffee — ふたりの真ん中で、いいコーヒーを。" width="720" />

</div>

## なぜ作ったか

「どこで会う？」は、たいてい片方だけが倍の距離を移動して終わります。地図上の中間点もあまり役に立ちません。公園や川の上だったり、どちらかにとって乗り換えが多い駅だったりします。ACoffee はグループの真ん中あたりを検索し、移動の負担がいちばん均等になる実在のカフェを順に並べます。

## 機能

- **2〜3人の公平な待ち合わせ場所。** 一人ひとりの実際の公共交通機関での移動時間で順位付けし、移動がどれだけ均等かを公平スコアで表示します。
- **検索モード：** 🤝 公平 · ⚡ 最速（合計移動時間が最短） · ✨ 雰囲気 · 🌙 静か · 🕐 今すぐ。
- **会う時間を指定できる。** 「土曜 15時」と入れると、各カフェがその時間に営業しているかをカード上に表示します。カフェの現地時間で判定するので、旅行先の計画にも使えます。
- **レビューの要約。** Google のレビューから、雰囲気・席・Wi-Fi・混み具合を2行にまとめます。
- **提案を送る。** カフェと時間を入れたリンクを送ると、相手は承諾・時間の変更・別のカフェへの変更ができます。どちらもアカウント不要です。
- **あいまいな住所に強い。** 「Central Park, New York」のようなあいまいな地名は、検索エンジンの世界的な一位ではなく、相手の近くの候補で解決します。
- **現在地の近く。** 今いる場所の周りで評価の高いカフェを探せます。
- **コーヒーパスポート。** 行ったカフェにスタンプを押し、メモや評価を残し、マップや連続記録を見られます。アカウントなしで使え、サインインすると端末間で同期します。
- **公開プロフィール** `acoffee.com/yourname`（任意）。お気に入りのカフェやワンタップのコーヒー予約を載せられます。
- **English・日本語・简体中文** に対応。PWA としてインストールできます。

## 技術スタック

| レイヤー | 技術 |
| --- | --- |
| フロントエンド | React 19, TypeScript, Vite, CSS Modules, PWA (vite-plugin-pwa) |
| バックエンド | Cloudflare Pages Functions |
| データ | Cloudflare D1 (SQLite) + Drizzle ORM · KV（API キャッシュ） · R2（アバター、店舗写真） |
| 認証 | Better Auth — メールのマジックリンク（Resend）、Google ログイン（任意） |
| 地図 | Google Maps Platform — Maps JS, Places (New), Geocoding, Routes |
| AI | DeepSeek V4 Flash（Vercel AI SDK 経由、レビュー要約） |

## はじめかた

必要なもの：Node.js 22（CI と同じバージョン）、Google Maps Platform の API キー。API を動かす場合は Wrangler CLI（dev 依存関係に含まれています）。

```bash
git clone https://github.com/nomadcafe/acoffeemeetup.git
cd acoffeemeetup
npm install

cp .env.example .env              # ブラウザ側のキー（VITE_*）
cp .dev.vars.example .dev.vars    # wrangler 用のサーバー側シークレット

# ローカルの D1 テーブルを作成
npx wrangler d1 migrations apply acoffee-dev --local
```

次のどちらかを実行します：

```bash
npm run dev        # UI のみ（Vite）。検索・地図・パスポートは動きますが /api は動きません
npm run pages:dev  # UI + API：:5173 の Vite が /api を :8788 の wrangler に転送します
```

**http://localhost:5173** を開きます。Maps キーを HTTP リファラーで制限している場合は `localhost:5173` を許可してください。

### 環境変数

**ブラウザ側（`.env`）**

| 名前 | 必須 | 用途 |
| --- | --- | --- |
| `VITE_GOOGLE_MAPS_API_KEY` | はい | Maps JS, Places (New), Geocoding |
| `VITE_GOOGLE_MAPS_MAP_ID` | 推奨 | 地図のマーカー表示（Advanced Markers）に必要 |
| `VITE_AUTH_ENABLED` | いいえ | `true` でサインインとパスポート同期を有効化 |
| `VITE_GA_MEASUREMENT_ID` | いいえ | Google Analytics 4 |

**サーバー側（ローカルは `.dev.vars`、本番は Cloudflare Pages の環境変数）**

| 名前 | 必須 | 用途 |
| --- | --- | --- |
| `GOOGLE_MAPS_SERVER_KEY` | 移動時間・写真に必要 | Routes, Places, Geocoding 用のサーバーキー（未設定ならブラウザ用キーを使用） |
| `DEEPSEEK_API_KEY` | 要約に必要 | レビュー要約。`AI_SUMMARY_MODEL` でモデルを変更可能 |
| `AUTH_SECRET`, `AUTH_BASE_URL` | サインインに必要 | Better Auth のセッション署名とコールバック先 |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | サインインに必要 | マジックリンクと予約メールの送信 |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | いいえ | Google ログイン |
| `CRON_SECRET` | いいえ | クリーンアップ用 cron エンドポイントの保護 |
| `ROUTES_DAILY_ELEMENT_CAP`, `PLACE_PHOTO_DAILY_CAP` | いいえ | 公開 Google プロキシの1日あたりの利用上限（既定値 10,000 / 2,000） |

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | Vite 開発サーバー（UI のみ） |
| `npm run pages:dev` | Vite + `wrangler pages dev`（UI と API） |
| `npm run build` | 型チェックして `dist/` にビルド |
| `npm run typecheck` | アプリと Pages Functions の型チェック |
| `npm run lint` | ESLint |

## ディレクトリ構成

```
src/            React アプリ — components, context（アプリ + i18n）, i18n/locales（en / ja / zh）, utils
functions/      Cloudflare Pages Functions
  api/          REST エンドポイント（places, ai, auth, account, passport, proposals, bookings など）
  _lib/         認証, D1 スキーマとマイグレーション, Google Maps クライアント, レート制限, 利用上限
  _middleware.ts  言語別の SEO / リンクプレビュー用タグ、プロフィールの Open Graph
public/         静的ファイル, _headers（CSP）, シェア用画像
```

## デプロイ

Cloudflare Pages で動きます（ビルド `npm run build`、出力 `dist/`）。バインディングは `wrangler.toml` に定義されています：`DB`（D1）、`ROUTES_CACHE`（KV）、`AVATARS` と `PLACE_PHOTOS`（R2）。上記のサーバー側変数を Pages のダッシュボードで設定し、本番にマイグレーションを適用します：

```bash
npx wrangler d1 migrations apply <your-prod-db> --remote --env production
```

ご自身の Google Cloud プロジェクトでは、Places API (New) の1日あたりのクォータ（`GetPlaceRequest`、`SearchNearbyRequest`）と、請求の予算アラートを設定しておくことをおすすめします。

## コントリビュート

Issue と Pull Request を歓迎します。PR を出す前に `npm run lint`、`npm run typecheck`、`npm run build` を実行してください。CI でも同じ3つを実行します。

## ライセンス

[MIT](LICENSE) © nomadcafe
