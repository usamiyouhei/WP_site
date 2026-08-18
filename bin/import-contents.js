import readline from "readline";
import { resolve } from "path";
import { existsSync, lstatSync, readdirSync, statSync, unlinkSync } from "fs";
import { exists } from "./utils/fs-utils.js";
import { log, success, error } from "./utils/logger.js";
import { projectRoot } from "./utils/paths.js";
import { isWordPressEnvRunning, runWpCli } from "./utils/wp-env.js";

const MODULE_NAME = "import-contents";
const UPLOADS_BACKUP_HOST_PATH = resolve(projectRoot, "wordpress/uploads/backup.sql");
const BACKUP_CONTAINER_PATH = "/var/www/html/wp-content/uploads/backup.sql";
const UPLOADS_HOST_DIR = resolve(projectRoot, "wordpress/uploads");
const PRE_IMPORT_PREFIX = "tmp-pre-import-";
const PRE_IMPORT_SUFFIX = ".sql";
const PRE_IMPORT_BACKUP_PATTERN = /^tmp-pre-import-\d{8}-\d{6}-\d+\.sql$/;
const MAX_PRE_IMPORT_BACKUPS = 5;

/**
 * ユーザー入力を受け取る
 * @param {readline.Interface} rl - readlineインターフェース
 * @param {string} question - 質問文
 * @returns {Promise<string>} ユーザーの入力
 */
function askQuestion(rl, question) {
  return new Promise(resolveAnswer => {
    rl.question(question, answer => {
      resolveAnswer(answer.trim());
    });
  });
}

/**
 * インポート実行前の確認を行う
 * @param {boolean} skipConfirm - --yes フラグが指定されている場合は確認をスキップ
 * @returns {Promise<boolean>} 続行してよい場合は true
 */
async function confirmImport(skipConfirm) {
  if (skipConfirm) {
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    log(MODULE_NAME, "現在のデータベースを完全にリセットして backup.sql をインポートします。よろしいですか？");
    const answer = await askQuestion(rl, '続行するには "yes" と入力してください: ');
    return answer.toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

/**
 * インポート元 SQL の存在を確認する
 * @returns {{hostPath: string, containerPath: string, source: string}}
 */
function resolveImportSource() {
  if (exists(UPLOADS_BACKUP_HOST_PATH)) {
    return {
      hostPath: UPLOADS_BACKUP_HOST_PATH,
      containerPath: BACKUP_CONTAINER_PATH,
      source: "wordpress/uploads/backup.sql",
    };
  }

  error(MODULE_NAME, "バックアップファイルが見つかりません。");
  log(MODULE_NAME, `確認したパス: ${UPLOADS_BACKUP_HOST_PATH}`);
  log(MODULE_NAME, "yarn wp-contents:export でバックアップを作成してください。");
  process.exit(1);
}

/**
 * tmp-pre-import-*.sql を最大件数に保つ
 */
function cleanupPreImportBackups() {
  if (!exists(UPLOADS_HOST_DIR)) return;

  const backupFiles = readdirSync(UPLOADS_HOST_DIR)
    .filter(file => PRE_IMPORT_BACKUP_PATTERN.test(file))
    .sort();

  const deleteCount = backupFiles.length - MAX_PRE_IMPORT_BACKUPS;
  if (deleteCount <= 0) return;

  for (const file of backupFiles.slice(0, deleteCount)) {
    const backupPath = resolve(UPLOADS_HOST_DIR, file);
    if (lstatSync(backupPath).isFile()) {
      unlinkSync(backupPath);
    }
  }
}

/**
 * 現在のDBをインポート前に退避する
 * @returns {{hostPath: string, containerPath: string}}
 */
function exportPreImportBackup() {
  const now = new Date();
  const pad = value => String(value).padStart(2, "0");
  const timestamp = [`${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`, `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`].join("-");
  const filename = `${PRE_IMPORT_PREFIX}${timestamp}-${process.pid}${PRE_IMPORT_SUFFIX}`;
  const hostPath = resolve(UPLOADS_HOST_DIR, filename);
  const containerPath = `/var/www/html/wp-content/uploads/${filename}`;

  log(MODULE_NAME, "現在のデータベースをインポート前に退避しています...");
  runWpCli(["db", "export", containerPath], { stdio: "inherit" });
  if (!existsSync(hostPath) || statSync(hostPath).size === 0) {
    throw new Error("インポート前のDB退避に失敗しました（退避ファイルが生成されていないか空です）。安全のため中止します。");
  }
  cleanupPreImportBackups();
  success(MODULE_NAME, "現在のデータベースを退避しました。");

  return { hostPath, containerPath };
}

async function main() {
  const args = process.argv.slice(2);
  const skipConfirm = args.includes("--yes");

  if (!isWordPressEnvRunning()) {
    error(MODULE_NAME, "WordPress環境が起動していません。先に yarn wp-start を実行してください。");
    process.exit(1);
  }

  const importSource = resolveImportSource();
  const confirmed = await confirmImport(skipConfirm);
  if (!confirmed) {
    log(MODULE_NAME, "インポートを中止しました。");
    process.exit(0);
  }

  let preImportBackup = null;
  let importFailed = false;

  try {
    log(MODULE_NAME, `インポート元: ${importSource.source}`);

    preImportBackup = exportPreImportBackup();

    log(MODULE_NAME, "データベースをリセットしています...");
    runWpCli(["db", "reset", "--yes"], { stdio: "inherit" });
    success(MODULE_NAME, "データベースをリセットしました。");

    log(MODULE_NAME, "バックアップをインポートしています...");
    runWpCli(["db", "import", importSource.containerPath], { stdio: "inherit" });
    success(MODULE_NAME, "バックアップのインポートが完了しました。");
    log(MODULE_NAME, `インポート前DB退避: ${preImportBackup.hostPath}`);
    log(MODULE_NAME, `復元例: wp-env run cli wp db import ${preImportBackup.containerPath}`);
  } catch (err) {
    error(MODULE_NAME, "インポート処理に失敗しました。", err);
    importFailed = true;
  }

  if (importFailed) {
    process.exit(1);
  }
}

main().catch(err => {
  error(MODULE_NAME, err.message, err);
  process.exit(1);
});
