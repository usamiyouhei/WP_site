---
name: wp-env-setup
description: このプロジェクトの @wordpress/env ローカル環境を扱うときに必ず使う。環境の起動/停止、WordPress初期設定、投稿一括作成、DBエクスポート/インポート、.wp-env.json へのプラグイン同期を案内・実行する。トリガー: セットアップ / 環境構築 / wp-env / 投稿作成 / プラグイン追加 / エクスポート / インポート
metadata:
  dependencies: Docker Desktop（起動必須）/ Node.js（package.json の engines 準拠）/ yarn 4
---

# wp-env-setup

WordPress ローカル開発環境（@wordpress/env / Docker）のセットアップ・運用スキル。
Claude Code / Codex / Cursor など、どの AI エージェントからでも同じ手順で使える（ツール固有の機能には依存しない）。

## 前提条件

- **Docker Desktop が起動していること**（起動していないと `yarn wp-start` が失敗する）
- Node.js（必要バージョンは `package.json` の `engines` を参照）/ yarn（`npm` は使用禁止）
- 初回はネットワーク接続必須（WordPress コア・プラグインのダウンロードが走る）

## クイックスタート（初回 or 環境を作り直すとき）

Step 0: `yarn doctor --json` で Node / Yarn / Docker / ポート / テーマ設定を診断する。
初回セットアップで themeSlug を変えたい場合は、`yarn wp-start` の前に `yarn init:project` を案内する。

```bash
yarn              # 依存インストール（初回のみ）
yarn wp-start     # Docker 起動 + .wp-env.json のテーマパス同期
yarn wp-init      # WordPress 初期設定（オプション・固定ページ・シード投稿）
yarn dev          # Vite 開発サーバー起動（別ターミナル）
```

#### 完了条件

- Docker Desktop が起動していることを確認するまで `yarn wp-start` を実行してはならない
- `yarn wp-start` の成功（`✔ Done!` 表示）と http://localhost:8888 の応答を確認するまで `yarn wp-init` に進んではならない

**`backup.sql` が手元にある場合のショートカット**：`wordpress/uploads/backup.sql` をインポートすると、CPT UI の works 登録・サンプル投稿・各種設定が入った状態になる。

このファイルはテンプレートに同梱されていない。`yarn wp-contents:export`（配布・共有用は `yarn wp-contents:export:sanitized`）で生成するか、チームがコミットしたものを取得する。新規 clone の初期状態では存在しないため、この経路は使えない（上記の `yarn wp-start` → `yarn wp-init` が正規のセットアップ手順）。

```bash
# 前提: wordpress/uploads/backup.sql が存在すること
yarn wp-start && yarn wp-contents:import
```

- `wp-contents:import` は実行時に確認プロンプトが出る（`yes` 入力で続行）。AIエージェントは自分の判断で `--yes` を付けない
- WordPress: http://localhost:8888（管理画面: /wp-admin、admin/password）
- Vite: http://localhost:5173

## セットアップ完了後に必ず聞くこと

Quick Start が終わったら、ユーザーに以下を必ず確認する（初回セットアップ時のみ）：

> 既存のプロジェクトや使い慣れているテンプレートに合わせて、`src/assets/styles/` の foundation / global を調整しますか？
> もし調整する場合、参照したいプロジェクトの `src/` があるパスを教えてください。

- 「はい」/ パスが提示された場合 → `adapt-styles` スキル（正本: `skills/adapt-styles/SKILL.md`）へ引き継ぐ
- 「いいえ」/ 参照元なし → このテンプレートのデフォルト構成のまま続行

## コマンドリファレンス

| コマンド | 説明 |
|---|---|
| `yarn wp-start` | 環境起動（update-wp-config も自動実行） |
| `yarn wp-stop` | 環境停止 |
| `yarn wp-init` | WordPress 初期設定（フロント/お問い合わせ固定ページ作成を含む） |
| `yarn wp-post:create` | 投稿作成（対話 or JSON 指定） |
| `yarn wp-contents:export` | DB を SQL にエクスポート |
| `yarn wp-contents:import` | DB を自動退避してからリセットし、SQL からインポート（確認プロンプトあり、`--yes` はユーザー明示時のみ） |
| `yarn wp-plugins:sync` | 管理画面で追加したプラグインを `.wp-env.json` に同期 |
| `yarn update:wp-config` | `.wp-env.json` / `style.css` / DB のテーマ名を同期 |

## 投稿一括作成

```bash
yarn wp-post:create                            # 対話形式
yarn wp-post:create post-data/posts-news.json  # JSON から一括作成
```

### JSON フォーマット（`post-data/*.json`）

```json
[
  {
    "title": "投稿タイトル",
    "content": "本文",
    "status": "publish",
    "postType": "post",
    "categories": [],
    "tags": "タグ1,タグ2"
  }
]
```

- `status`: `publish` / `draft` / `pending`
- `postType`: `post`（通常）/ `works`（制作実績）

**注意**: `works` は CPT UI プラグインで DB に登録されるカスタム投稿タイプのため、フレッシュな `wp-init` 直後には存在しない。`wordpress/uploads/backup.sql`（export で生成・共有されたもの）がある場合は `yarn wp-contents:import` を実行するか、管理画面の CPT UI で works を登録してから使うこと。

## DB エクスポート / インポート

```bash
# エクスポート（Docker 内の uploads/ に作業用 backup.sql を生成）
yarn wp-contents:export

# インポート（現在のDBを自動退避し、DB を完全リセットしてから import。**既存データは消える**）
# 実行時に確認プロンプトが出る（"yes" 入力で続行）
yarn wp-contents:import

# 確認プロンプトをスキップする場合（ユーザーが明示した自動実行・非対話向け）
yarn wp-contents:import --yes
```

エクスポートされる SQL の Docker 内パス: `/var/www/html/wp-content/uploads/backup.sql`  
ホスト側パス: `wordpress/uploads/backup.sql`

`yarn wp-contents:import` は `wordpress/uploads/backup.sql` を使う。DB を共有する場合はこのファイルをコミットする。顧客の個人情報・顧客情報・本番ユーザーを含む SQL はコミットせず、配布・共有用は `yarn wp-contents:export:sanitized` で無害化して内容を確認する。

インポート前には現在の DB が `wordpress/uploads/tmp-pre-import-YYYYMMDD-HHmmss.sql` に自動退避される。退避に失敗した場合は reset/import へ進まない。

## 投稿の複製（プラグイン不要・CLI で完結）

「投稿 X を複製して」と言われたら、複製プラグインを提案せず WP-CLI で実行する。

```bash
# 基本複製（タイトル・本文・抜粋のみ。--porcelain で新 ID だけ取得）
wp-env run cli wp post create --from-post=<SRC_ID> --post_status=draft --porcelain
```

**ACF の入力値（post meta）やタクソノミーも複製する場合**は、上記で得た新 ID に対して続けて実行：

```bash
# meta 一覧を取得（_edit_lock / _edit_last は除外してコピーする）
wp-env run cli wp post meta list <SRC_ID> --format=json

# 取得した各 meta を新しい投稿に設定（エージェントが JSON をパースしてループ実行）
wp-env run cli wp post meta update <NEW_ID> <meta_key> '<meta_value>'

# タクソノミーのコピー（例: works_category）
wp-env run cli wp post term list <SRC_ID> <taxonomy> --field=slug
wp-env run cli wp post term set <NEW_ID> <taxonomy> <slug...>
```

テスト投稿の量産が目的なら複製ではなく `yarn wp-post:create post-data/*.json` を使う方が適切。

## プラグインの同期（管理画面で追加した後）

管理画面からインストールしたプラグインは `wordpress/plugins/` に入るが gitignore されているため、リポジトリをクローンした人には引き継がれない。`.wp-env.json` に同期しておくと `wp-env start` で自動インストールされ再現可能になる。

```bash
yarn wp-plugins:sync --dry-run  # 変更内容の確認のみ
yarn wp-plugins:sync            # .wp-env.json に追記
yarn wp-plugins:sync --prune    # 削除済みプラグインのエントリも掃除
```

- WordPress.org にあるプラグインのみ自動同期される
- 有料/カスタムプラグインは警告が出るので手動対応（`.wp-env.json` に直接 URL/パスを書くか配布物に含める）
- **管理画面でプラグインを追加・削除したら実行する習慣にする**とテンプレの再現性が保たれる

## wp-init の設定（`config/wp-options.json`）

```json
{
  "options": { "timezone_string": "Asia/Tokyo", ... },
  "front_page": { "slug": "top", "title": "Top" },
  "posts_page": null,
  "pages": [{ "slug": "contact", "title": "お問い合わせ" }],
  "seed_posts_json": "post-data/posts-sample.json",
  "seed_posts_if_empty": true,
  "permalink_structure": "/%postname%/"
}
```

`pages` 配列に指定した固定ページも `front_page` と併せて作成される（デフォルトでは contact お問い合わせページ）。テンプレートは `page-{slug}.php` がスラッグ一致で自動適用される。

`seed_posts_if_empty: true` の場合、公開投稿が無いときのみシードを作成する（標準の Hello world! はカウントされず、シード実行時にゴミ箱へ移動する）。

## よくある問題

| 症状 | 対処 |
|---|---|
| `yarn wp-init` がハングする | CLI コンテナ未起動。`yarn wp-start` 後 30 秒待ってから再実行 |
| テーマが反映されない | `yarn update:wp-config` を実行して `.wp-env.json` を同期 |
| プロジェクト名を変えた後に崩れる | `yarn update:wp-config` → `yarn wp-start` → `yarn wp-init` の順で再初期化 |
| `wp-contents:import` 後に管理画面にログインできない | インポート元 DB のユーザー情報が引き継がれる（admin/password ではなくなることがある） |

その他のトラブルはプロジェクトルートの `doc/TROUBLESHOOTING.md` を参照。

## 自己完了確認（作業終了前に必ずチェック）

- [ ] 環境が起動し http://localhost:8888 が応答することを確認した
- [ ] 初回セットアップでは `yarn wp-init` を実行し、テーマ有効化まで確認した
- [ ] 初回セットアップでは adapt-styles への調整質問をユーザーにした
- [ ] DB を上書きする操作（`wp-contents:import`）の前に、既存データが消えることと自動退避されることをユーザーに伝えた
- [ ] ユーザーが明示していない限り `wp-contents:import --yes` を使っていない
