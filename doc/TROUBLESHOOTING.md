# トラブルシューティング

開発中によくある問題と解決方法をまとめています。ここに無い問題は [bin/README.md](../bin/README.md)（スクリプトの詳細）もあわせて確認してください。

困ったらまず `yarn doctor` を実行してください。Node / Yarn / Docker / ポート / テーマ設定の状態をまとめて確認できます。

---

## Docker Compose V2が必要です

**症状**: `yarn wp-start`を実行すると`docker-compose`コマンドが見つからない、またはエラーが出る

**原因**: このプロジェクトは`@wordpress/env` 11を使用しており、**Docker Compose V2が必要**です。Docker Compose V1は2023年7月に更新が停止され、現在はサポートされていません。

**解決方法**:

1. **Docker Desktopを最新版にアップデート**
   - [Docker Desktop公式サイト](https://www.docker.com/products/docker-desktop/)から最新版をダウンロード・インストール
   - Docker Desktop 4.4.2以降には、Docker Compose V2が標準で含まれています
   - インストール後、Docker Desktopを再起動してください

2. **Docker Compose V2がインストールされているか確認**

   ```bash
   docker compose version
   ```

   - 正常に動作する場合: `Docker Compose version v2.x.x` と表示されます
   - エラーが出る場合: Docker Desktopを最新版にアップデートしてください

3. **注意事項**
   - Docker Compose V2では、コマンドが`docker-compose`（ハイフンあり）から`docker compose`（スペース区切り）に変更されました
   - ただし、Docker Desktop 4.4.2以降では、`docker-compose`コマンドが自動的に`docker compose`にエイリアスされるため、既存のスクリプトでも動作します
   - `@wordpress/env`は内部で`docker compose`コマンドを使用するため、特に設定変更は不要です

## WordPress環境が起動しない

**症状**: `yarn wp-start`を実行してもエラーが出る

まず `yarn doctor` を実行し、Docker・Docker Compose・ポート8888・テーマ設定の診断結果を確認してください。

**エラーメッセージ例**:

```
✖ Error while running docker compose command.
unable to get image 'mariadb:lts': Cannot connect to the Docker daemon at unix:///Users/.../.docker/run/docker.sock. Is the docker daemon running?
```

**解決方法**:

1. **Docker Desktopが起動しているか確認**
   - Docker Desktopアプリを起動してください
   - ステータスバー（Mac）またはタスクトレイ（Windows）に`running`と表示されていることを確認
   - 起動していない場合は、Docker Desktopアプリを起動してから数秒待ってから再度`yarn wp-start`を実行

2. **Docker Compose V2がインストールされているか確認**（上記の「Docker Compose V2が必要です」を参照）

3. **ポート8888が使用されていないか確認**

   ```bash
   # Mac/Linux
   lsof -i :8888

   # Windows (PowerShell)
   netstat -ano | findstr :8888
   ```

   - 他のプロセスが使用している場合は、そのプロセスを停止するか、`yarn wp-stop`を実行

4. **Windows環境での特別な対処法**
   - `yarn wp-start`が正しく動作しない場合、`.wp-env.json`の`plugins`配列を一時的に削除して再実行してみてください
   - 手順：
     1. `.wp-env.json`を開く
     2. `"plugins": [...]`の部分を削除または空配列`[]`に変更
     3. `yarn wp-start`を実行
     4. 起動に成功したら、必要に応じてプラグイン設定を戻す
   - これはWindows環境でのDocker Compose実行時の問題によるものです

5. **一度`yarn wp-stop`を実行してから、再度`yarn wp-start`を実行**

6. **それでも解決しない場合**
   - Docker Desktopを再起動
   - `yarn wp-stop`を実行してから、Docker Desktopを再起動し、再度`yarn wp-start`を実行

## wp-initが失敗する

**症状**: `yarn wp-init`を実行すると「WordPress が起動しませんでした」というエラーが出る

**解決方法**:

1. **WordPress環境が起動しているか確認**

   ```bash
   yarn wp-start
   ```

   - 起動に時間がかかる場合があります（初回は5-10分程度）

2. **少し待ってから再実行**

   ```bash
   yarn wp-init
   ```

   - 初回起動時は時間がかかる場合があります

3. **それでも失敗する場合**
   - Docker Desktopを再起動
   - `yarn wp-stop` → `yarn wp-start` を再度実行
   - 数分待ってから `yarn wp-init` を再実行

## テーマが表示されない

**症状**: WordPress管理画面でテーマが表示されない

**解決方法**:

1. `yarn wp-start`実行時にテーマパスが正しく更新されているか確認
2. `wordpress/themes/{THEME_NAME}/style.css`が存在するか確認
3. `yarn wp-init`を実行してテーマを自動有効化（手動操作不要）
4. それでも表示されない場合は、管理画面の「外観」→「テーマ」で手動有効化

## SCSSの変更が反映されない

**症状**: SCSSファイルを編集しても変更が反映されない

**解決方法**:

1. `yarn dev`が起動しているか確認
2. `bin/watch-scss-globs.js`がバックグラウンドで実行されているか確認
3. Viteサーバーを再起動

## PHPファイルの変更が反映されない、または反映が遅い

**症状**: PHPファイルを編集しても変更が反映されない、または反映が遅い

**解決方法**:

1. **監視対象の確認**: `vite.config.js` で監視対象が正しく設定されているか確認
   - ルートPHPファイル（`*.php`）
   - テンプレートパーツ（`template-parts/**/*.php`）
   - 機能別関数ファイル（`functions-lib/**/*.php`、ただし`functions-lib/lib/`は除外）
2. **パフォーマンス改善**:
   - ライブラリファイル（`functions-lib/lib/`）は監視対象外のため、変更してもリロードされません。必要に応じて手動リロードしてください
3. **キャッシュクリアと再起動**:
   - ブラウザのキャッシュをクリアして再読み込み
   - `yarn dev`を停止してから、`yarn`で依存関係を再インストール
   - `yarn dev`を再度起動して確認
4. **Viteサーバーの再起動**: 上記で解決しない場合は、`yarn dev`を再起動

## Sassの警告が出る

**症状**: `@use "layouts/**";` などで `The default namespace "**" is not a valid Sass identifier.` が表示される

**説明**:

- `vite-plugin-sass-glob-import` が解決するため実害はありません
- **警告は無視してOK** という運用です

## 画像が表示されない

**症状**: 画像が表示されない、または404エラーが出る

**解決方法**:

1. 画像の配置場所を確認: `src/assets/images/`
2. WordPress開発時は、PHPから画像を読み込む場合は`img_path()`関数を使用
3. ビルド後に画像が出力されているか確認（`wordpress/themes/{THEME_NAME}/assets/images/`）

## プラグインがインストールされない

**症状**: `yarn wp-start`実行後、プラグインがインストールされない

**解決方法**:

1. `.wp-env.json`の`plugins`配列を確認
2. プラグインのURLが正しいか確認
3. 初回起動時はプラグインのダウンロードに時間がかかります（5-10分程度）
4. ネットワーク接続を確認

## お問い合わせフォームが表示されない

**症状**: お問い合わせページに「お問い合わせフォームが未設定です」と表示される

**説明**: フォームは「特典SQLのフォーム → Contact Form 7 の最初の公開フォーム」の順で自動的に解決されます。

**解決方法**:

1. Contact Form 7 プラグインが有効か確認
2. 管理画面の「お問い合わせ」でフォームを1つ作成（作成すると自動的に表示されます）
3. 特典SQLを利用する場合は `yarn wp-contents:import` でインポート

## wp-contents:import の SQL が見つからない

**症状**: `yarn wp-contents:import` でバックアップファイルが見つからない

**解決方法**:

1. `wordpress/uploads/backup.sql` が存在するか確認
2. 作業中の DB を戻したい場合は `yarn wp-contents:export` で作成
3. 共有された DB を使う場合は、コミットされた `wordpress/uploads/backup.sql` を取得

`yarn wp-contents:import` は `wordpress/uploads/backup.sql` を使います。実行前に確認プロンプトが出ます。AIエージェントは自分の判断で `--yes` を付けません。

> ⚠️ 顧客の個人情報・顧客情報・本番ユーザーを含む SQL はコミットしないでください。配布・共有用は `yarn wp-contents:export:sanitized` で無害化し、内容を確認してください。

インポート前には現在の DB が `wordpress/uploads/tmp-pre-import-YYYYMMDD-HHmmss.sql` に自動退避されます。復元が必要な場合は、完了ログに表示された `wp-env run cli wp db import ...` の例を使ってください。
