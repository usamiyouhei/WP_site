---
name: adapt-styles
description: このプロジェクトの SCSS 基盤（foundation/global）を参照プロジェクトの流儀に合わせるときに必ず使う。reset・変数・breakpoints の差し替えまで実施する。wp-env-setup 完了後の初期調整、または「既存プロジェクトに合わせて」「自分のテンプレに寄せて」と依頼され参照プロジェクトの src/ パスが提示されたときに起動する。
---

# adapt-styles

このテンプレートの SCSS 基盤（`foundation/` と `global/`）を、ユーザーが指定した参照プロジェクトのスタイル仕様に寄せる。**ドキュメントベースの案内 + 実ファイル差し替え**まで担当する（自動変換スクリプトは提供しない）。
Claude Code / Codex / Cursor など、どの AI エージェントからでも同じ手順で使える（ツール固有の機能には依存しない）。

## いつ使うか

- `wp-env-setup` セットアップ完了後、ユーザーが参照プロジェクトのパスを提示した時
- ユーザーが「既存プロジェクトに合わせて」「自分のテンプレの reset/変数/breakpoint を使いたい」と言った時

**使わない状況：**
- 参照元が Tailwind / styled-components / CSS Modules 等、SCSS ではない → 「対応不可」と伝えて手動対応を案内
- 参照元が FLOCSS と全く違う設計思想（Atomic Design 完全準拠等） → 部分適用に留めるか、無理に寄せない

## 参照プロジェクトから読み取る対象

参照 `src/assets/styles/`（またはそれに相当するディレクトリ）から以下を読む：

| 読み取り対象 | 確認するポイント |
|---|---|
| フォルダ構成 | `foundation` / `global` / `layouts` / `components` 等の層の名前 |
| `_reset.scss` | reset の流派（modern-css-reset / normalize.css / 独自） |
| `_variables.scss` | SCSS 変数（`$color-primary`）か CSS 変数（`--color-primary`）か、命名規則 |
| `_breakpoints.scss` | ブレイクポイントの値と `mq()` mixin の使い方（`@include mq(md)` の引数形式など） |
| `_base.scss` | typography / box-sizing / body / element 初期スタイル |
| メインエントリ（`style.scss`） | `@use` の書き方（glob か明示か）、インポート順 |

## このテンプレートで差し替え対象になるファイル

| ファイル | 扱い |
|---|---|
| `src/assets/styles/foundation/_reset.scss` | 差し替え |
| `src/assets/styles/foundation/_base.scss` | 差し替え or マージ |
| `src/assets/styles/foundation/_index.scss` | foundation 内のファイル構成を変えた場合に `@use` を更新 |
| `src/assets/styles/global/_variables.scss` | 差し替え |
| `src/assets/styles/global/_breakpoints.scss` | 差し替え（`mq()` 定義含む） |
| `src/assets/styles/global/_index.scss` | global 内のファイル構成を変えた場合に `@forward` を更新 |
| `src/assets/styles/style.scss` | 層名を変える場合のみ `@use "..."` の path を更新 |
| `bin/watch-scss-globs.js` | 監視対象ディレクトリ（`TARGET_DIRS`）を層名に合わせて更新 |

**重要**: `foundation` と `global` は glob（`/**`）ではなく `_index.scss` 経由の明示読み込み。ファイルを追加・分割・リネームしたら対応する `_index.scss` の更新が**必須**（glob 層と挙動が違う点に注意）。

`layouts` / `components` / `projects` / `utilities` の**中身**は差し替えない（案件固有のスタイルなので）。

## 作業フロー

参照元の解析が完了し、差し替え対象がユーザーと合意できるまで、ファイルの差し替えを開始してはならない。

1. **参照元の解析**
   - 参照 `src/` を `ls` / `Read` で走査
   - 上の「参照から読み取る対象」を1つずつ確認
   - 参照元が SCSS ではない or 構造が全然違う場合 → 中止して手動対応を案内
2. **差分の提示**
   - 差し替え候補ファイルごとに「参照側の内容」と「テンプレ側の内容」を比較して要約
   - ユーザーに「このファイルは差し替える？」を1つずつ確認（`_reset` は差し替え、`_variables` は残す、等の細かい選択を許可）
3. **層名の確認**
   - 参照元とテンプレの層名（`foundation` / `global` / `layouts` / `components` / `projects` / `utilities`）が違う場合、以下を提示：
     - リネーム候補（例：`projects/` → `pages/`）
     - リネームすると影響する箇所（`style.scss` の `@use`、`watch-scss-globs.js` の `TARGET_DIRS`、既存の `_p-*.scss` のファイル名プレフィックス）
   - **層名変更は影響が大きいので、デフォルトは「変更しない」を推奨**
4. **適用**
   - 選ばれたファイルのみ差し替え（Edit / Write）
   - 参照元にない値は既存を残す（マージ判断が必要な場合は都度確認）
5. **検証**
   - `yarn dev` を実行してビルドが通ることを確認するようユーザーに案内
   - エラーが出た場合は `@use` のパス、mixin シグネチャ、変数名の参照ズレを疑う

## style.scss の glob 対応（層名を変える場合）

現状：

```scss
@use "foundation";
@use "global";
@use "layouts/**";
@use "components/**";
@use "projects/**";
@use "utilities/**";
```

層名を変えた場合はここも合わせて更新する。glob（`/**`）を使っているのは Vite の `vite-plugin-sass-glob-import` によるもので、ワイルドカード展開時に `bin/watch-scss-globs.js` がファイル追加/削除を検知して `style.scss` の mtime を更新する仕組み。層のディレクトリ名を変えたら **必ず `TARGET_DIRS` も更新**する必要がある。

## やらないこと

- 参照元プロジェクトを直接変更する（テンプレ側だけを触る）
- `layouts` / `components` / `projects` / `utilities` の中身を書き換える
- 参照元にないファイルをテンプレに新規追加する（別作業として案内）
- FLOCSS 以外の CSS 設計への機械的変換

## よくある判断ポイント

| 状況 | 推奨判断 |
|---|---|
| 参照元が `$color-primary` 変数、テンプレが `--color-primary` を使っている | 参照側に合わせて `global/_variables.scss` を書き換え。`base.scss` や `components/` で参照名が変わっていないかも確認 |
| 参照元の mq() が `@include mq($lg)` テンプレが `@include mq(lg)` | breakpoints.scss の mixin シグネチャに合わせて、`components/` `projects/` 側で使われている呼び出しも grep して調整（変更箇所を提示のみ、自動書き換えはユーザー承認後） |
| 参照元に `_typography.scss` がある、テンプレは `_base.scss` にまとめている | 参照側に合わせて `foundation/` を分割するかテンプレの構成を維持するかを聞く。デフォルトはテンプレの構成維持 |

## 自己完了確認（作業終了前に必ずチェック）

- [ ] 参照元が SCSS ベースであることを確認した（違う場合は中止して案内した）
- [ ] 差し替えるファイルを1つずつユーザーに確認してから適用した
- [ ] `_index.scss` の `@use` / `@forward` を差し替え内容に合わせて更新した
- [ ] 層名を変更した場合は `style.scss` と `bin/watch-scss-globs.js` の `TARGET_DIRS` も更新した
- [ ] `yarn dev` でビルドが通ることの確認をユーザーに案内した
