import { resolve } from "path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { log, success, error } from "./utils/logger.js";
import { projectRoot } from "./utils/paths.js";
import { isWordPressEnvRunning, runWpCli } from "./utils/wp-env.js";

const MODULE_NAME = "export-contents";
const UPLOADS_HOST_PATH = resolve(projectRoot, "wordpress/uploads/backup.sql");
const EXPORT_CONTAINER_PATH = "/var/www/html/wp-content/uploads/backup.sql";

// sanitize 後に配布用として想定する admin ユーザー（@wordpress/env の既定と同一）
// パスワードハッシュは "password" の bcrypt（$wp$ プレフィックスの WordPress 6.8+ 形式）
const SANITIZED_ADMIN_USER_ROW = "(1,'admin','$wp$2y$10$6A3FKEQasXhVYtScNgSwf.5tHMb2tVcjgPzx/IIl60KlAltJmNZWS','admin','wordpress@example.com','http://localhost:8888','2020-01-01 00:00:00','',0,'admin')";

/**
 * 指定テーブルの INSERT 文（`INSERT INTO \`table\` ... ;` の複数行ブロック）を
 * SQL テキストから走査し、コールバックで各ブロックを変換する。
 * mysqldump の extended-insert 形式（VALUES の後に改行して複数レコード）に対応。
 * @param {string} sql - 対象 SQL テキスト
 * @param {string} table - テーブル名（バッククォートなし）
 * @param {(block: string) => string|null} transform - ブロックを受け取り、置換後の文字列を返す（null で削除）
 * @returns {string} 変換後の SQL
 */
function transformInsertBlocks(sql, table, transform) {
  const marker = `INSERT INTO \`${table}\``;
  const lines = sql.split("\n");
  const output = [];
  let block = null;

  for (const line of lines) {
    if (block === null && line.startsWith(marker)) {
      block = [line];
      // 同一行内で ; まで閉じている場合はその場で確定する
      if (/;\s*$/.test(line)) {
        const replaced = transform(block.join("\n"));
        if (replaced !== null) output.push(replaced);
        block = null;
      }
      continue;
    }

    if (block !== null) {
      block.push(line);
      if (/;\s*$/.test(line)) {
        const replaced = transform(block.join("\n"));
        if (replaced !== null) output.push(replaced);
        block = null;
      }
      continue;
    }

    output.push(line);
  }

  // 閉じられていないブロックが残った場合は安全側でそのまま戻す
  if (block !== null) {
    output.push(block.join("\n"));
  }

  return output.join("\n");
}

/**
 * SQL 内の wp_options / wp_usermeta の INSERT ブロックから、
 * 指定した除外条件に一致するレコード（`(...)` 単位）を取り除く。
 * @param {string} block - INSERT ブロック全体
 * @param {(record: string) => boolean} shouldDrop - true を返すとそのレコードを除外
 * @returns {string|null} フィルタ後のブロック。全レコードが消えたら null
 */
function filterInsertRecords(block, shouldDrop) {
  // "INSERT INTO `x` VALUES\n" の先頭部と、末尾の ";" を分離する
  const headMatch = block.match(/^(INSERT INTO `[^`]+` VALUES\s*)/);
  if (!headMatch) {
    return block;
  }

  const head = headMatch[1];
  const body = block.slice(head.length).replace(/;\s*$/, "");

  // トップレベルの "),(" 区切りでレコードを分割する（文字列内のカンマは考慮不要な範囲で単純分割）
  const records = splitTopLevelRecords(body);
  const kept = records.filter(record => !shouldDrop(record));

  if (kept.length === 0) {
    return null;
  }

  return `${head}${kept.join(",")};`;
}

/**
 * "(...),(...)" 形式のレコード列を、括弧の対応と文字列リテラルを考慮して分割する。
 * @param {string} body - VALUES 以降・末尾セミコロンを除いた本体
 * @returns {string[]} 各レコード（前後空白付きの `(...)`）
 */
function splitTopLevelRecords(body) {
  const records = [];
  let depth = 0;
  let inString = false;
  let current = "";

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    current += char;

    if (inString) {
      if (char === "\\") {
        // エスケープ文字：次の1文字をそのまま取り込む
        if (i + 1 < body.length) {
          current += body[i + 1];
          i += 1;
        }
      } else if (char === "'") {
        inString = false;
      }
      continue;
    }

    if (char === "'") {
      inString = true;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      // レコード区切り：直前までを1レコードとして確定（末尾のカンマは除く）
      records.push(current.slice(0, -1).trim());
      current = "";
    }
  }

  if (current.trim()) {
    records.push(current.trim());
  }

  return records;
}

/**
 * エクスポート済み SQL テキストを配布用に無害化する。
 * - wp_users: admin/password のみに正規化（実ユーザーのハッシュ・メールを除去）
 * - wp_usermeta: session_tokens（ログインセッション）を除去
 * - wp_comments / wp_commentmeta: 全レコード削除
 * - wp_options: transient 系キャッシュと secret_key を除去
 * @param {string} sql
 * @returns {string}
 */
function sanitizeSql(sql) {
  let result = sql;

  // wp_users を admin/password の1行だけに置換する
  result = transformInsertBlocks(result, "wp_users", () => `INSERT INTO \`wp_users\` VALUES ${SANITIZED_ADMIN_USER_ROW};`);

  // wp_usermeta の session_tokens を除去する
  result = transformInsertBlocks(result, "wp_usermeta", block => filterInsertRecords(block, record => /'session_tokens'/.test(record)));

  // コメント関連は全削除する
  result = transformInsertBlocks(result, "wp_comments", () => null);
  result = transformInsertBlocks(result, "wp_commentmeta", () => null);

  // wp_options の transient 系キャッシュと secret_key を除去する
  result = transformInsertBlocks(result, "wp_options", block => filterInsertRecords(block, record => /'(_transient_|_transient_timeout_|_site_transient_|_site_transient_timeout_)/.test(record) || /,'secret_key',/.test(record)));

  return result;
}

function main() {
  const args = process.argv.slice(2);
  const sanitized = args.includes("--sanitized");

  if (!isWordPressEnvRunning()) {
    error(MODULE_NAME, "WordPress環境が起動していません。先に yarn wp-start を実行してください。");
    process.exit(1);
  }

  try {
    log(MODULE_NAME, "データベースをエクスポートしています...");
    runWpCli(["db", "export", EXPORT_CONTAINER_PATH], { stdio: "inherit" });

    if (!existsSync(UPLOADS_HOST_PATH)) {
      error(MODULE_NAME, `エクスポートファイルが見つかりません: ${UPLOADS_HOST_PATH}`);
      process.exit(1);
    }

    if (sanitized) {
      log(MODULE_NAME, "配布用に無害化しています（ユーザー情報・コメント・キャッシュ・シークレットを除去）...");
      const original = readFileSync(UPLOADS_HOST_PATH, "utf8");
      const cleaned = sanitizeSql(original);
      writeFileSync(UPLOADS_HOST_PATH, cleaned);
      success(MODULE_NAME, "無害化が完了しました。");
      log(MODULE_NAME, "配布・共有する場合は、顧客の個人情報を含まないことを確認してからコミットしてください。");
    } else {
      success(MODULE_NAME, "エクスポートが完了しました。");
      log(MODULE_NAME, "配布用に無害化する場合は yarn wp-contents:export --sanitized を使ってください。");
    }

    log(MODULE_NAME, `出力先（ホスト）: ${UPLOADS_HOST_PATH}`);
  } catch (err) {
    error(MODULE_NAME, "エクスポート処理に失敗しました。", err);
    process.exit(1);
  }
}

// スクリプトとして直接実行された場合のみ main() を実行する
// （sanitize ロジックを import して再利用・テストできるように副作用を分離）
const currentFile = fileURLToPath(import.meta.url);
const scriptFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (scriptFile && currentFile === scriptFile) {
  main();
}

// テスト・再利用のため sanitize ロジックを export する（副作用なし）
export { sanitizeSql, transformInsertBlocks, filterInsertRecords, splitTopLevelRecords };
