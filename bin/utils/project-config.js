/**
 * プロジェクト設定の読み込みユーティリティ
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve, basename } from "path";
import { existsSync, readFileSync } from "fs";
import { log } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const project_root = resolve(__dirname, "..", "..");
const project_config_path = resolve(project_root, "config/project.json");

/**
 * テーマスラッグとして使える名前か検証する
 * @param {string} name - テーマスラッグ
 * @returns {string} 検証済みのテーマスラッグ
 */
export function validateThemeSlug(name) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    throw new Error(`テーマスラッグ「${name}」は使用できません（半角英数・ハイフン・アンダースコア・ドットのみ、先頭は英数字）。config/project.json の themeSlug を修正してください。`);
  }

  if (/[A-Z]/.test(name)) {
    log("project-config", `テーマスラッグ「${name}」に大文字が含まれています。WordPress のテーマスラッグは小文字を推奨します。`, "warn");
  }

  return name;
}

/**
 * themeSlug から表示用テーマ名を生成する
 * @param {string} theme_slug - テーマスラッグ
 * @returns {string} 表示用テーマ名
 */
export function createThemeName(theme_slug) {
  return theme_slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * config/project.json を読み込む
 * @returns {object|null} project.json の内容。存在しない場合は null
 */
export function loadProjectConfig() {
  if (!existsSync(project_config_path)) {
    return null;
  }

  return JSON.parse(readFileSync(project_config_path, "utf8"));
}

/**
 * テーマ設定を解決する
 * @returns {{ themeSlug: string, themeName: string, textDomain: string, source: "config"|"basename" }}
 */
export function resolveThemeConfig() {
  const project_config = loadProjectConfig();

  if (project_config) {
    if (!project_config.themeSlug) {
      throw new Error("config/project.json の themeSlug は必須です。");
    }

    const theme_slug = validateThemeSlug(project_config.themeSlug);

    return {
      themeSlug: theme_slug,
      themeName: project_config.themeName || createThemeName(theme_slug),
      textDomain: project_config.textDomain || theme_slug,
      source: "config",
    };
  }

  const theme_slug = validateThemeSlug(basename(project_root));

  return {
    themeSlug: theme_slug,
    themeName: theme_slug,
    textDomain: theme_slug,
    source: "basename",
  };
}
