import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { resolve } from "path";
import { checkNode } from "./utils/check-env.js";
import { projectRoot, THEME_NAME, paths } from "./utils/paths.js";
import { resolveThemeConfig } from "./utils/project-config.js";
import { log, success, error } from "./utils/logger.js";
import { exists, readJson, writeJson, readFile, writeFile, ensureDir, renameDir } from "./utils/fs-utils.js";
import { isWordPressEnvRunning, runWpCli } from "./utils/wp-env.js";
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from "fs";

checkNode();

// コマンドライン引数を取得
const args = process.argv.slice(2);
const yes = args.includes("--yes");
const actionArgs = args.filter(arg => arg !== "--yes");
const updateWpEnv = actionArgs.includes("--wp-env") || actionArgs.includes("--config") || actionArgs.length === 0;
const updateDb = actionArgs.includes("--db") || actionArgs.includes("--theme") || actionArgs.length === 0;
const updateStyleCss = actionArgs.includes("--style-css") || actionArgs.length === 0;

/**
 * config/project.json が存在しない場合に現在の解決値から作成
 * @returns {boolean} 成功したかどうか
 */
function ensureProjectConfig() {
  const projectConfigPath = resolve(projectRoot, "config/project.json");

  if (exists(projectConfigPath)) {
    return true;
  }

  try {
    const themeConfig = resolveThemeConfig();
    writeJson(projectConfigPath, {
      themeSlug: themeConfig.themeSlug,
      themeName: themeConfig.themeName,
      textDomain: themeConfig.textDomain,
    });
    success("update-wp-config", "config/project.json を作成しました");
    return true;
  } catch (err) {
    error("update-wp-config", "config/project.json の作成に失敗しました", err);
    return false;
  }
}

/**
 * 既存のテーマディレクトリ名を検出
 * wordpress/themes/ 内の style.css が存在するディレクトリを探す
 * @returns {string|null} テーマディレクトリ名、見つからない場合は null
 */
function detectExistingThemeName() {
  const themesBaseDir = resolve(projectRoot, "wordpress/themes");

  // themesディレクトリが存在しない場合は null を返す
  if (!exists(themesBaseDir)) {
    return null;
  }

  try {
    // themesディレクトリ内の既存ディレクトリを検索
    const entries = readdirSync(themesBaseDir);
    const existingThemeDirs = entries.filter(entry => {
      const entryPath = resolve(themesBaseDir, entry);
      return statSync(entryPath).isDirectory();
    });

    // style.cssが存在するディレクトリを探す（実際のテーマディレクトリ）
    for (const dir of existingThemeDirs) {
      const styleCssPath = resolve(themesBaseDir, dir, "style.css");
      if (exists(styleCssPath)) {
        return dir;
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}

/**
 * 配列を並び順に依存しない比較用に整形する
 * @param {string[]} values
 * @returns {string}
 */
function normalizeStringArray(values) {
  return JSON.stringify([...values].sort());
}

/**
 * 現在のテーマ側 style.css パスを取得する
 * @returns {string}
 */
function getCurrentStyleCssPath() {
  const existingThemeName = detectExistingThemeName();

  if (existingThemeName && existingThemeName !== THEME_NAME) {
    return resolve(projectRoot, `wordpress/themes/${existingThemeName}/style.css`);
  }

  return resolve(projectRoot, `wordpress/themes/${THEME_NAME}/style.css`);
}

/**
 * style.css の標準ヘッダーを生成する
 * @param {{ themeName: string, textDomain: string }} themeConfig
 * @returns {string}
 */
function createDefaultStyleCssContent(themeConfig) {
  return `/*!
Theme Name: ${themeConfig.themeName}
Description: テンプレート
Version: 1.0.0
Author:
Text Domain: ${themeConfig.textDomain}
*/`;
}

/**
 * style.css のヘッダー値を取得する
 * @param {string} content
 * @returns {{ validHeader: boolean, themeName: string|null, textDomain: string|null }}
 */
function parseStyleCssHeader(content) {
  return {
    validHeader: content.trim().startsWith("/*!"),
    themeName: content.match(/^Theme Name:\s*(.*)$/m)?.[1]?.trim() || null,
    textDomain: content.match(/^Text Domain:\s*(.*)$/m)?.[1]?.trim() || null,
  };
}

/**
 * style.css の変更プレビューを取得する
 * @returns {string|null}
 */
function getStyleCssChangePreview() {
  const themeConfig = resolveThemeConfig();
  const styleCssPath = getCurrentStyleCssPath();

  if (!exists(styleCssPath)) {
    return `style.css: 未作成のため Theme Name \`${themeConfig.themeName}\`, Text Domain \`${themeConfig.textDomain}\` で作成`;
  }

  const content = readFile(styleCssPath);
  const header = parseStyleCssHeader(content);

  if (!header.validHeader) {
    return `style.css: ヘッダー不正のため Theme Name \`${themeConfig.themeName}\`, Text Domain \`${themeConfig.textDomain}\` で書き換え`;
  }

  if (header.themeName !== themeConfig.themeName || header.textDomain !== themeConfig.textDomain) {
    return `style.css: Theme Name \`${header.themeName || "未設定"}\`→\`${themeConfig.themeName}\`, Text Domain \`${header.textDomain || "未設定"}\`→\`${themeConfig.textDomain}\``;
  }

  return null;
}

/**
 * .wp-env.json の変更内容を副作用なしで算出する
 * @returns {{ ok: boolean, changed: boolean, config?: object, messages: string[], errorMessage?: string, errorDetail?: Error }}
 */
function getWpEnvConfigUpdate() {
  try {
    if (!exists(paths.wpEnvConfig)) {
      return {
        ok: false,
        changed: false,
        messages: [],
        errorMessage: ".wp-env.json not found",
      };
    }

    const config = readJson(paths.wpEnvConfig);
    const messages = [];
    let configUpdated = false;

    if (!config.mappings || !config.mappings["wp-content/themes"]) {
      const themePath = `./wordpress/themes/${THEME_NAME}`;
      if (!config.themes || !Array.isArray(config.themes) || config.themes[0] !== themePath) {
        config.themes = [themePath];
        configUpdated = true;
        messages.push(`themes array: ${themePath}`);
      }
    } else {
      messages.push(`themes: using mappings (${config.mappings["wp-content/themes"]})`);
    }

    const existingThemeName = detectExistingThemeName();
    const themeDirName = exists(resolve(projectRoot, `wordpress/themes/${THEME_NAME}`)) ? THEME_NAME : existingThemeName || THEME_NAME;
    const themeDir = resolve(projectRoot, `wordpress/themes/${themeDirName}`);
    const pluginsJsonPath = resolve(themeDir, "config/plugins.json");
    if (exists(pluginsJsonPath)) {
      try {
        const pluginsData = readJson(pluginsJsonPath);
        if (pluginsData.plugins && Array.isArray(pluginsData.plugins)) {
          const pluginSources = pluginsData.plugins.map(plugin => plugin.source).filter(source => source);
          const currentPlugins = config.plugins || [];
          const pluginsChanged = normalizeStringArray(currentPlugins) !== normalizeStringArray(pluginSources);

          if (pluginsChanged) {
            config.plugins = pluginSources;
            configUpdated = true;
            messages.push(`plugins: ${pluginSources.length} plugins`);
          }
        }
      } catch (err) {
        return {
          ok: false,
          changed: configUpdated,
          config,
          messages,
          errorMessage: "Failed to read config/plugins.json",
          errorDetail: err,
        };
      }
    } else {
      messages.push("config/plugins.json not found, skipping plugin update");
    }

    return {
      ok: true,
      changed: configUpdated,
      config,
      messages,
    };
  } catch (err) {
    return {
      ok: false,
      changed: false,
      messages: [],
      errorMessage: "Failed to update .wp-env.json",
      errorDetail: err,
    };
  }
}

/**
 * 実行前の変更プレビューを作成する
 * @returns {string[]}
 */
function getChangePreviewItems() {
  const items = [];
  const existingThemeName = detectExistingThemeName();

  if (existingThemeName && existingThemeName !== THEME_NAME) {
    const targetThemeDir = resolve(projectRoot, "wordpress/themes", THEME_NAME);
    const operation = exists(targetThemeDir) ? "マージ" : "リネーム";
    items.push(`テーマディレクトリ: \`${existingThemeName}\` → \`${THEME_NAME}\`（${operation}）`);
  }

  if (updateStyleCss) {
    const styleCssChange = getStyleCssChangePreview();
    if (styleCssChange) {
      items.push(styleCssChange);
    }
  }

  if (updateDb && isWordPressEnvRunning()) {
    items.push(`WordPress DB のテーマ名を \`${THEME_NAME}\` に更新`);
  }

  if (updateWpEnv) {
    const wpEnvUpdate = getWpEnvConfigUpdate();
    if (wpEnvUpdate.changed) {
      items.push(".wp-env.json: テーマ/プラグイン設定を更新");
    }
  }

  return items;
}

/**
 * 変更確認プロンプトを表示する
 * @param {string[]} items
 * @returns {Promise<boolean>}
 */
async function confirmChanges(items) {
  if (yes || !process.stdin.isTTY || items.length === 0) {
    return true;
  }

  log("update-wp-config", "変更予定:");
  for (const item of items) {
    log("update-wp-config", `  - ${item}`);
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question("続行しますか？ (y/N): ");
    return ["y", "yes"].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

/**
 * .wp-env.json の設定を更新
 * config/plugins.json からプラグイン設定も読み込んで更新
 *
 * 注意: mappings を使用している場合は themes 配列は不要です
 */
function updateWpEnvConfig() {
  if (!updateWpEnv) return;

  log("update-wp-config", `Updating .wp-env.json configuration`);

  const wpEnvUpdate = getWpEnvConfigUpdate();

  if (!wpEnvUpdate.ok) {
    error("update-wp-config", wpEnvUpdate.errorMessage || "Failed to update .wp-env.json", wpEnvUpdate.errorDetail || null);
    return false;
  }

  if (wpEnvUpdate.changed) {
    writeJson(paths.wpEnvConfig, wpEnvUpdate.config);
    success("update-wp-config", `Updated .wp-env.json`);
  } else {
    success("update-wp-config", ".wp-env.json is already correct");
  }

  if (wpEnvUpdate.config.themes) {
    log("update-wp-config", `  - themes: ${wpEnvUpdate.config.themes[0]}`);
  } else if (wpEnvUpdate.config.mappings && wpEnvUpdate.config.mappings["wp-content/themes"]) {
    log("update-wp-config", `  - themes: using mappings (${wpEnvUpdate.config.mappings["wp-content/themes"]})`);
  }
  if (wpEnvUpdate.config.plugins) {
    log("update-wp-config", `  - plugins: ${wpEnvUpdate.config.plugins.length} plugins`);
  }

  return true;
}

/**
 * ディレクトリの中身を移動先へマージ
 * 既存ファイルは上書きせず、衝突した場合は移動元を残す
 * @param {string} source_dir - 移動元ディレクトリ
 * @param {string} target_dir - 移動先ディレクトリ
 * @returns {boolean} 衝突せずにマージできたかどうか
 */
function mergeDirectoryContents(source_dir, target_dir) {
  let merged_without_conflicts = true;

  mkdirSync(target_dir, { recursive: true });

  const entries = readdirSync(source_dir);
  for (const entry of entries) {
    const source_path = resolve(source_dir, entry);
    const target_path = resolve(target_dir, entry);
    const source_stats = statSync(source_path);

    if (!exists(target_path)) {
      renameSync(source_path, target_path);
      continue;
    }

    if (source_stats.isDirectory() && statSync(target_path).isDirectory()) {
      const child_merged = mergeDirectoryContents(source_path, target_path);
      merged_without_conflicts = merged_without_conflicts && child_merged;

      try {
        rmSync(source_path, { recursive: false });
      } catch (err) {
        merged_without_conflicts = false;
        log("update-wp-config", `移動元ディレクトリを残しました: ${source_path}`, "warn");
      }
      continue;
    }

    merged_without_conflicts = false;
    log("update-wp-config", `既存ファイルと衝突したため上書きせず残しました: ${target_path}`, "warn");
  }

  return merged_without_conflicts;
}

/**
 * 既存のテーマディレクトリを themeSlug に合わせる
 */
function renameThemeDirectory() {
  const themesBaseDir = resolve(projectRoot, "wordpress/themes");

  // themesディレクトリが存在しない場合はスキップ
  if (!exists(themesBaseDir)) {
    return true;
  }

  try {
    const targetThemeDir = resolve(themesBaseDir, THEME_NAME);
    const existingThemeName = detectExistingThemeName();

    if (!existingThemeName) {
      log("update-wp-config", "style.css を持つテーマディレクトリが見つからないため、リネームをスキップします");
      return true;
    }

    if (existingThemeName === THEME_NAME) {
      return true;
    }

    const oldPath = resolve(themesBaseDir, existingThemeName);

    if (!exists(targetThemeDir)) {
      log("update-wp-config", `テーマディレクトリをリネームします: ${existingThemeName} → ${THEME_NAME}`);
      renameDir(oldPath, targetThemeDir);
      success("update-wp-config", `テーマディレクトリをリネームしました: ${existingThemeName} → ${THEME_NAME}`);
      return true;
    }

    log("update-wp-config", `既存の ${THEME_NAME} ディレクトリへテーマ本体をマージします`);
    const merged_without_conflicts = mergeDirectoryContents(oldPath, targetThemeDir);

    if (merged_without_conflicts) {
      rmSync(oldPath, { recursive: true, force: true });
      success("update-wp-config", `テーマディレクトリをマージしました: ${existingThemeName} → ${THEME_NAME}`);
      return true;
    }

    log("update-wp-config", `衝突があるため移動元ディレクトリを残しました: ${existingThemeName}`, "warn");
    return true;
  } catch (err) {
    error("update-wp-config", "Failed to rename theme directory", err);
    return false;
  }
}

/**
 * style.css の Theme Name を更新
 * Vite プラグインからも使用可能
 */
export function updateStyleCssFile() {
  try {
    const themeConfig = resolveThemeConfig();
    // テーマ名に基づいて style.css のパスを決定
    const styleCssPath = resolve(projectRoot, `wordpress/themes/${THEME_NAME}/style.css`);

    // style.css が存在しない場合は作成
    if (!exists(styleCssPath)) {
      ensureDir(resolve(styleCssPath, ".."));

      // デフォルトの style.css を作成
      const defaultContent = createDefaultStyleCssContent(themeConfig);
      writeFile(styleCssPath, defaultContent);
      log("update-wp-config", `Created: wordpress/themes/${THEME_NAME}/style.css`);
      return true;
    }

    // 既存の style.css を読み込み
    let content = readFile(styleCssPath);

    // コメントブロックが /*! で始まっているか確認
    if (!content.trim().startsWith("/*!")) {
      // コメントブロックがない、または /* で始まっている場合は完全に書き換え
      const defaultContent = createDefaultStyleCssContent(themeConfig);
      writeFile(styleCssPath, defaultContent);
      log("update-wp-config", "Rewrote style.css with proper header");
      return true;
    }

    // Theme Name を更新（既存の Theme Name を置換）
    const themeNameRegex = /Theme Name:\s*.*/;
    if (themeNameRegex.test(content)) {
      content = content.replace(themeNameRegex, `Theme Name: ${themeConfig.themeName}`);
    } else {
      // Theme Name が見つからない場合は追加
      const headerMatch = content.match(/\/\*!\s*\n/);
      if (headerMatch) {
        const insertPosition = headerMatch.index + headerMatch[0].length;
        content = content.slice(0, insertPosition) + `Theme Name: ${themeConfig.themeName}\n` + content.slice(insertPosition);
      }
    }

    const textDomainRegex = /Text Domain:\s*.*/;
    if (textDomainRegex.test(content)) {
      content = content.replace(textDomainRegex, `Text Domain: ${themeConfig.textDomain}`);
    } else {
      const closePosition = content.indexOf("*/");
      if (closePosition !== -1) {
        content = content.slice(0, closePosition) + `Text Domain: ${themeConfig.textDomain}\n` + content.slice(closePosition);
      }
    }

    const currentContent = readFile(styleCssPath);
    if (content !== currentContent) {
      writeFile(styleCssPath, content);
      success("update-wp-config", `style.css を更新しました: Theme Name=${themeConfig.themeName}, Text Domain=${themeConfig.textDomain}`);
    }

    return true;
  } catch (err) {
    error("update-wp-config", "Failed to update style.css", err);
    return false;
  }
}

/**
 * WordPress のデータベース内のテーマ名を更新
 */
function updateWordPressDatabase() {
  if (!updateDb) return;

  log("update-wp-config", `Updating WordPress database theme name to: ${THEME_NAME}`);

  // WordPress環境が起動しているかチェック
  if (!isWordPressEnvRunning()) {
    log("update-wp-config", "⚠ WordPress environment is not running.");
    log("update-wp-config", "  Skipping database update. Run `yarn wp-start` first if you want to update the database.");
    log("update-wp-config", "  Note: This is optional - .wp-env.json and style.css have been updated successfully.");
    return true; // エラーではなく、スキップとして扱う
  }

  try {
    // WordPress のデータベースでテーマ名を更新
    const commands = [
      { label: `wp option update template ${THEME_NAME}`, args: ["option", "update", "template", THEME_NAME] },
      { label: `wp option update stylesheet ${THEME_NAME}`, args: ["option", "update", "stylesheet", THEME_NAME] },
    ];

    let successCount = 0;

    for (const cmd of commands) {
      try {
        log("update-wp-config", `Executing: ${cmd.label}`);
        runWpCli(cmd.args, { stdio: "inherit" });
        success("update-wp-config", `Success: ${cmd.label}`);
        successCount++;
      } catch (err) {
        error("update-wp-config", `Error executing: ${cmd.label}`, err);
      }
    }

    if (successCount > 0) {
      log("update-wp-config", "");
      success("update-wp-config", "WordPress database theme name updated successfully!");
      log("update-wp-config", "Please refresh your WordPress admin panel.");
      return true;
    } else {
      error("update-wp-config", "Failed to update WordPress database.");
      return false;
    }
  } catch (err) {
    error("update-wp-config", "Failed to update WordPress database", err);
    return false;
  }
}

// メイン処理
async function main() {
  log("update-wp-config", `Theme name: ${THEME_NAME}\n`);

  const previewItems = getChangePreviewItems();
  const confirmed = await confirmChanges(previewItems);
  if (!confirmed) {
    log("update-wp-config", "中止しました");
    process.exit(0);
  }

  if (!ensureProjectConfig()) {
    process.exit(1);
  }

  let wpEnvSuccess = true;
  let dbSuccess = true;
  let styleCssSuccess = true;
  let renameSuccess = true;

  // まず既存のテーマディレクトリを themeSlug に合わせる
  renameSuccess = renameThemeDirectory();

  if (updateWpEnv) {
    wpEnvSuccess = updateWpEnvConfig();
  }

  if (updateStyleCss) {
    styleCssSuccess = updateStyleCssFile();
  }

  if (updateDb) {
    dbSuccess = updateWordPressDatabase();
  }

  // 結果をまとめて表示
  log("update-wp-config", "");
  log("update-wp-config", "Summary:");
  if (renameSuccess !== undefined) {
    log("update-wp-config", `  Theme directory: ${renameSuccess ? "✓ Updated" : "✗ Failed"}`);
  }
  if (updateWpEnv) {
    log("update-wp-config", `  .wp-env.json: ${wpEnvSuccess ? "✓ Updated" : "✗ Failed"}`);
  }
  if (updateStyleCss) {
    log("update-wp-config", `  style.css: ${styleCssSuccess ? "✓ Updated" : "✗ Failed"}`);
  }
  if (updateDb) {
    log("update-wp-config", `  WordPress DB: ${dbSuccess ? "✓ Updated" : "✗ Failed"}`);
  }

  // エラーがある場合は終了コード1で終了
  if (!renameSuccess || (updateWpEnv && !wpEnvSuccess) || (updateStyleCss && !styleCssSuccess) || (updateDb && !dbSuccess)) {
    process.exit(1);
  }
}

/**
 * Viteプラグインとして使用する場合
 * vite-plugin-update-style-css.js の代替として使用可能
 */
export default function vitePluginUpdateStyleCss() {
  return {
    name: "update-style-css",
    enforce: "pre",
    buildStart() {
      // ビルド開始時に style.css を更新
      updateStyleCssFile();
    },
    configureServer() {
      // 開発サーバー起動時にも更新
      updateStyleCssFile();
    },
  };
}

// スクリプトとして直接実行された場合のみ main() を実行
// import.meta.url を file:// から通常のパスに変換して比較
const currentFile = fileURLToPath(import.meta.url);
const scriptFile = resolve(process.argv[1]);
if (currentFile === scriptFile) {
  main().catch(err => {
    error("update-wp-config", err.message || "update-wp-config failed", err);
    process.exit(1);
  });
}
