import readline from "readline";
import { basename, resolve } from "path";
import { exists, readFile, writeJson } from "./utils/fs-utils.js";
import { log, success, error } from "./utils/logger.js";
import { projectRoot } from "./utils/paths.js";
import { createThemeName, validateThemeSlug } from "./utils/project-config.js";

const MODULE_NAME = "init-project";
const PROJECT_CONFIG_PATH = resolve(projectRoot, "config/project.json");
const MAX_INPUT_COUNT = 3;

/**
 * ユーザー入力を受け取る
 * @param {readline.Interface} rl - readlineインターフェース
 * @param {string} question - 質問文
 * @returns {Promise<string>} ユーザーの入力
 */
function askQuestion(rl, question) {
  return new Promise(resolve_answer => {
    rl.question(question, answer => {
      resolve_answer(answer.trim());
    });
  });
}

function hasYesFlag() {
  return process.argv.slice(2).includes("--yes");
}

function isInteractive(yes_flag) {
  return process.stdin.isTTY && !yes_flag;
}

function getDefaultThemeSlug() {
  const default_theme_slug = basename(projectRoot);

  try {
    validateThemeSlug(default_theme_slug);
    return default_theme_slug;
  } catch {
    return "";
  }
}

async function confirmOverwrite(rl) {
  log(MODULE_NAME, "既に config/project.json があります");
  log(MODULE_NAME, readFile(PROJECT_CONFIG_PATH).trim());

  const answer = await askQuestion(rl, "上書きしますか？ (y/N): ");
  return answer.toLowerCase() === "y";
}

async function askValidatedValue(rl, question, default_value) {
  for (let input_count = 1; input_count <= MAX_INPUT_COUNT; input_count += 1) {
    const answer = await askQuestion(rl, question);
    const value = answer || default_value;

    try {
      return validateThemeSlug(value);
    } catch (err) {
      error(MODULE_NAME, err.message);
    }
  }

  error(MODULE_NAME, "入力回数の上限を超えました");
  process.exit(1);
}

async function buildProjectConfig(rl, interactive) {
  const default_theme_slug = getDefaultThemeSlug();

  if (!interactive) {
    if (!default_theme_slug) {
      error(MODULE_NAME, "themeSlug を対話で指定するか config/project.json を手動作成してください");
      process.exit(1);
    }

    return {
      themeSlug: default_theme_slug,
      themeName: createThemeName(default_theme_slug),
      textDomain: default_theme_slug,
    };
  }

  const theme_slug_question = default_theme_slug ? `テーマスラッグ（半角英数・ハイフン・アンダースコア、例: my-site）[デフォルト: ${default_theme_slug}]: ` : "テーマスラッグ（半角英数・ハイフン・アンダースコア、例: my-site）: ";
  const theme_slug = await askValidatedValue(rl, theme_slug_question, default_theme_slug);
  const default_theme_name = createThemeName(theme_slug);
  const theme_name_answer = await askQuestion(rl, `テーマ表示名 [デフォルト: ${default_theme_name}]: `);
  const theme_name = theme_name_answer || default_theme_name;
  const text_domain = await askValidatedValue(rl, `テキストドメイン [デフォルト: ${theme_slug}]: `, theme_slug);

  return {
    themeSlug: theme_slug,
    themeName: theme_name,
    textDomain: text_domain,
  };
}

async function main() {
  const yes_flag = hasYesFlag();
  const interactive = isInteractive(yes_flag);

  if (exists(PROJECT_CONFIG_PATH) && !interactive) {
    log(MODULE_NAME, "既に config/project.json があります");
    process.exit(0);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    if (exists(PROJECT_CONFIG_PATH)) {
      const should_overwrite = await confirmOverwrite(rl);
      if (!should_overwrite) {
        log(MODULE_NAME, "中止しました");
        process.exit(0);
      }
    }

    const project_config = await buildProjectConfig(rl, interactive);
    writeJson(PROJECT_CONFIG_PATH, project_config);

    success(MODULE_NAME, "config/project.json を作成しました");
    log(MODULE_NAME, "テーマディレクトリ名・style.css・DB に反映するには `yarn update:wp-config` を実行してください（WordPress 起動中なら DB も更新されます）");
  } catch (err) {
    error(MODULE_NAME, err.message, err);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
