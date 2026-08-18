# デプロイガイド

本番公開前のビルド、アップロード対象、プラグイン判断、移行後チェックをまとめます。

## ビルド

```bash
yarn build:wp
```

`yarn build:wp` は Vite の WordPress 用ビルドを実行し、`wordpress/themes/{THEME_NAME}/assets/` に JS / CSS / 画像を出力します。JS / CSS はハッシュ付きファイル名になり、`.vite/manifest.json` もテーマ内に生成されます。

`{THEME_NAME}` は `config/project.json` の `themeSlug` が正本です。未作成時のみプロジェクトフォルダ名へフォールバックします。テーマスラッグとして使える文字は半角英数字・ハイフン・アンダースコア・ドットのみで、先頭は英数字です。

## アセット読み込みの仕組み

テーマのアセット読み込みは `functions-lib/func-helpers.php` と `functions-lib/func-enqueue.php` で判定しています。

- `WP_DEBUG=true` かつ `manifest.dev.json` の URL が `localhost` / `127.0.0.1` の場合だけ、Vite dev server から `@vite/client` と開発用 JS を読み込みます。
- `WP_DEBUG=false` の場合は開発モードにならず、`wordpress/themes/{THEME_NAME}/.vite/manifest.json` からビルド済み JS / CSS を読み込みます。
- manifest がない場合はフォールバックとして `assets/js/script.js` と `assets/styles/style.css` を探します。ただし通常運用では `yarn build:wp` 後の manifest 読み込みを前提にします。

本番では `WP_DEBUG=false` にし、Vite dev server ではなくビルド済み assets が読まれていることを確認してください。

## サーバーへ上げるもの

- `wordpress/themes/{THEME_NAME}/` 一式
- `wordpress/themes/{THEME_NAME}/assets/`
- `wordpress/themes/{THEME_NAME}/.vite/manifest.json`
- `wordpress/themes/{THEME_NAME}/acf-json/`
- 必要なテンプレート、`functions.php`、`functions-lib/`、`template-parts/`、`style.css`

## サーバーへ上げないもの

- `node_modules/`
- `src/`
- `bin/`
- `doc/`
- `skills/`
- `post-data/`
- `wordpress/uploads/*.sql` や `wordpress/uploads/**/*.sql`
- `wordpress/uploads/tmp-*`
- `.git/`、`.github/`、エージェント設定ファイル

DB や uploads の移行はテーマアップロードとは別に行います。`wordpress/uploads/backup.sql` は開発環境の DB 同期用であり、本番サーバーへそのまま置かないでください。顧客の個人情報・本番ユーザーを含む SQL はコミットしません。

## プラグイン本番判断

| プラグイン | 本番 | 判断 |
|------------|------|------|
| WP Multibyte Patch | 残す | 日本語サイトの文字化け対策として有効 |
| SEO Simple Pack | 残す | メタタグ・SEO 設定で使用 |
| Advanced Custom Fields | 残す | テーマのカスタムフィールド表示に必要 |
| Custom Post Type UI | 残す | DB 側で投稿タイプ・タクソノミーを管理する場合に必要 |
| Contact Form 7 | 残す | お問い合わせフォームを使う場合に必要 |
| Breadcrumb NavXT | 残す | パンくずリスト表示・構造化データで使用 |
| Show Current Template | 外す | 開発確認用。本番では不要 |
| WPvivid Backup Plugin | 任意 | 本番バックアップ運用で使う場合のみ残す |

## 移行後チェックリスト

- `WP_DEBUG=false` になっている。
- ページソースで `localhost:5173` が出ていない。
- CSS / JS が `assets/` 配下のハッシュ付きファイルから読み込まれている。
- `.vite/manifest.json` が本番テーマ内に存在する。
- トップページ、固定ページ、投稿詳細、アーカイブ、404 が表示できる。
- お問い合わせフォームが送信できる。
- パンくず、メタタグ、OGP、favicon が意図通り。
- ACF フィールドが反映されている。
- パーマリンク設定を保存し直し、一覧・詳細 URL が 404 にならない。
- 不要な開発用プラグインが無効化または削除されている。
- DB 移行後、管理ユーザー・メールアドレス・サイト URL を本番用に確認済み。
