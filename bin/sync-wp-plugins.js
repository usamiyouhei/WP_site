#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { log, error } from "./utils/logger.js";
import { projectRoot, paths } from "./utils/paths.js";

const MODULE = "sync-wp-plugins";
const WP_PLUGINS_DIR = resolve(projectRoot, "wordpress/plugins");
const WP_ORG_DOWNLOAD_BASE = "https://downloads.wordpress.org/plugin/";
const WP_ORG_API_BASE = "https://api.wordpress.org/plugins/info/1.0/";

/**
 * plugins エントリから slug を抽出する。
 * wp.org 形式（バージョン付きも対応）のみ対象。それ以外は null を返す。
 */
function extractSlugFromEntry(entry) {
  const match = entry.match(/\/plugin\/(.+?)(?:\.[\d.]+)?\.zip$/);
  return match ? match[1] : null;
}

/**
 * .wp-env.json の plugins 配列から slug を抽出する。
 * wp.org 形式（バージョン付きも対応）のみ対象。それ以外はスキップ。
 */
function extractCoveredSlugs(plugins) {
  const covered = new Set();
  for (const entry of plugins) {
    const slug = extractSlugFromEntry(entry);
    if (slug) {
      covered.add(slug);
    }
  }
  return covered;
}

/**
 * wordpress/plugins/ 直下のディレクトリ名（隠しディレクトリ除外）を返す
 */
function getInstalledSlugs() {
  try {
    return readdirSync(WP_PLUGINS_DIR).filter(name => {
      if (name.startsWith(".")) return false;
      return statSync(resolve(WP_PLUGINS_DIR, name)).isDirectory();
    });
  } catch {
    return [];
  }
}

/**
 * wp.org API でプラグインの存在確認
 * @returns {Promise<boolean>}
 */
async function existsOnWpOrg(slug) {
  try {
    const res = await fetch(`${WP_ORG_API_BASE}${slug}.json`);
    if (!res.ok) return false;
    const json = await res.json();
    return json !== null && !json.error;
  } catch {
    return false;
  }
}

/**
 * プラグイン同期の差分を副作用なしで取得する
 * @returns {Promise<{config: object, plugins: string[], coveredSlugs: string[], installedSlugs: string[], toAdd: string[], orphanSlugs: string[], wpOrgSlugs: string[], customSlugs: string[]}>}
 */
export async function getPluginSyncDiff({ verify_wp_org = false } = {}) {
  const raw = readFileSync(paths.wpEnvConfig, "utf-8");
  const config = JSON.parse(raw);
  const plugins = config.plugins ?? [];

  const coveredSlugs = extractCoveredSlugs(plugins);
  const installedSlugs = getInstalledSlugs();

  if (installedSlugs.length === 0) {
    throw new Error("wordpress/plugins/ が空か存在しません。wp-env が未起動（またはクローン直後）の可能性があります。`yarn wp-start` で環境を起動してから再実行してください");
  }

  // 追加候補: インストール済みだが未記載
  const toAdd = installedSlugs.filter(slug => !coveredSlugs.has(slug));

  // 孤児候補: plugins 配列にあるが wordpress/plugins/ にディレクトリがない
  const installedSet = new Set(installedSlugs);
  const orphanSlugs = [...coveredSlugs].filter(slug => !installedSet.has(slug));
  const wpOrgSlugs = [];
  const customSlugs = [];

  if (verify_wp_org) {
    for (const slug of toAdd) {
      const exists = await existsOnWpOrg(slug);
      if (exists) {
        wpOrgSlugs.push(slug);
      } else {
        customSlugs.push(slug);
      }
    }
  }

  return {
    config,
    plugins,
    coveredSlugs: [...coveredSlugs],
    installedSlugs,
    toAdd,
    orphanSlugs,
    wpOrgSlugs,
    customSlugs,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const isPrune = args.includes("--prune");
  const { config, plugins, toAdd, orphanSlugs, wpOrgSlugs, customSlugs } = await getPluginSyncDiff({ verify_wp_org: true });

  let changed = false;
  const newPlugins = [...plugins];

  // 追加候補を wp.org API で検証
  for (const slug of toAdd) {
    log(MODULE, `wp.org API 確認中: ${slug}`);
    if (wpOrgSlugs.includes(slug)) {
      const url = `${WP_ORG_DOWNLOAD_BASE}${slug}.zip`;
      if (isDryRun) {
        log(MODULE, `[dry-run] 追加予定: ${url}`);
      } else {
        newPlugins.push(url);
        log(MODULE, `追加: ${url}`);
      }
      changed = true;
    } else if (customSlugs.includes(slug)) {
      log(MODULE, `警告: ${slug} はカスタム/有料プラグインのため自動同期不可。手動で .wp-env.json に追加するか、配布物に含めてください`, "warn");
    }
  }

  // 孤児エントリの処理
  if (orphanSlugs.length > 0) {
    for (const slug of orphanSlugs) {
      if (isPrune) {
        if (isDryRun) {
          log(MODULE, `[dry-run] 削除予定 (--prune): ${slug}`);
        } else {
          const idx = newPlugins.findIndex(entry => extractSlugFromEntry(entry) === slug);
          if (idx !== -1) newPlugins.splice(idx, 1);
          log(MODULE, `削除 (--prune): ${slug}`);
        }
        changed = true;
      } else {
        log(MODULE, `警告: plugins 配列に記載があるが wordpress/plugins/${slug}/ が存在しません（削除するには --prune を指定）`, "warn");
      }
    }
  }

  if (!changed) {
    log(MODULE, "同期済み、変更なし");
    return;
  }

  if (isDryRun) {
    log(MODULE, "[dry-run] 書き込みは行っていません。適用するには --dry-run なしで再実行してください");
    return;
  }

  config.plugins = newPlugins;
  writeFileSync(paths.wpEnvConfig, JSON.stringify(config, null, 2) + "\n", "utf-8");
  log(MODULE, ".wp-env.json を更新しました");
}

const currentFile = fileURLToPath(import.meta.url);
const scriptFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (currentFile === scriptFile) {
  main().catch(err => {
    error(MODULE, err.message, err);
    process.exit(1);
  });
}
