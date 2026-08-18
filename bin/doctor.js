#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { getNodeStatus, getYarnStatus } from "./utils/check-env.js";
import { log } from "./utils/logger.js";
import { projectRoot, THEME_NAME, validateThemeSlug } from "./utils/paths.js";
import { resolveThemeConfig } from "./utils/project-config.js";
import { isWordPressEnvRunning } from "./utils/wp-env.js";
import { getPluginSyncDiff } from "./sync-wp-plugins.js";

const MODULE = "doctor";
const args = process.argv.slice(2);
const is_json = args.includes("--json");

function create_result(name, status, message, hint = "") {
  return {
    name,
    status,
    message,
    hint,
  };
}

function write_json(data) {
  process.stdout.write(JSON.stringify(data));
}

function check_theme_slug() {
  try {
    const theme_config = resolveThemeConfig();
    validateThemeSlug(theme_config.themeSlug);

    return create_result("theme_slug", "ok", `themeSlug は有効です: ${theme_config.themeSlug}`);
  } catch (err) {
    return create_result("theme_slug", "error", "themeSlug が無効です", err.message);
  }
}

function check_node() {
  const node_status = getNodeStatus();

  if (node_status.ok) {
    return create_result("node", "ok", `Node.js v${node_status.current}`);
  }

  return create_result("node", "error", `Node.js v${node_status.current}`, `Node.js v${node_status.required} 以上に切り替えてください`);
}

function check_yarn() {
  const yarn_status = getYarnStatus();

  if (yarn_status.ok) {
    return create_result("yarn", "ok", yarn_status.detail);
  }

  return create_result("yarn", "error", yarn_status.detail, "corepack enable を実行してから yarn をやり直してください");
}

function check_docker() {
  const docker_result = spawnSync("docker", ["info"], {
    stdio: "ignore",
  });

  if (docker_result.status === 0) {
    return create_result("docker", "ok", "Docker は起動しています");
  }

  return create_result("docker", "error", "Docker が起動していません", "Docker Desktop を起動してから再実行してください");
}

function check_docker_compose() {
  const compose_result = spawnSync("docker", ["compose", "version"], {
    stdio: "ignore",
  });

  if (compose_result.status === 0) {
    return create_result("docker_compose", "ok", "Docker Compose V2 を検出しました");
  }

  return create_result("docker_compose", "warn", "Docker Compose V2 を検出できません", "Docker Desktop を最新版に更新してください");
}

function check_port(port) {
  const lsof_result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
    stdio: "pipe",
  });

  if (lsof_result.error) {
    return create_result(`port_${port}`, "warn", `port ${port}: lsof を実行できないため確認をスキップしました`, "必要に応じて手動でポート使用状況を確認してください");
  }

  const stdout = lsof_result.stdout ? String(lsof_result.stdout).trim() : "";
  if (stdout) {
    return create_result(`port_${port}`, "warn", `port ${port}: 使用中です`, `不要なプロセスを停止するか、関連サービスを終了してください`);
  }

  return create_result(`port_${port}`, "ok", `port ${port}: 空いています`);
}

function find_style_theme_dirs() {
  const themes_dir = resolve(projectRoot, "wordpress/themes");

  if (!existsSync(themes_dir)) {
    return [];
  }

  return readdirSync(themes_dir).filter(entry => {
    const entry_path = resolve(themes_dir, entry);
    const style_path = resolve(entry_path, "style.css");

    return statSync(entry_path).isDirectory() && existsSync(style_path);
  });
}

function check_theme_dir_match() {
  const wp_env_path = resolve(projectRoot, ".wp-env.json");
  const target_style_path = resolve(projectRoot, "wordpress/themes", THEME_NAME, "style.css");
  let mapping_ok = false;

  if (!existsSync(wp_env_path)) {
    return create_result("theme_dir_match", "error", ".wp-env.json が見つかりません", "yarn update:wp-config を実行してください");
  }

  try {
    const wp_env_config = JSON.parse(readFileSync(wp_env_path, "utf8"));
    mapping_ok = wp_env_config.mappings?.["wp-content/themes"] === "./wordpress/themes";
  } catch (err) {
    return create_result("theme_dir_match", "error", ".wp-env.json を読み込めません", err.message);
  }

  if (!mapping_ok) {
    return create_result("theme_dir_match", "warn", ".wp-env.json のテーマ mappings が想定と異なります", "wp-content/themes を ./wordpress/themes に合わせてください");
  }

  const style_theme_dirs = find_style_theme_dirs();
  if (!existsSync(target_style_path)) {
    const found = style_theme_dirs.length > 0 ? style_theme_dirs.join(", ") : "なし";
    return create_result("theme_dir_match", "warn", `テーマディレクトリが themeSlug と一致していません（検出: ${found} / 期待: ${THEME_NAME}）`, "yarn update:wp-config を実行してください");
  }

  const mismatched_dirs = style_theme_dirs.filter(dir => dir !== THEME_NAME);
  if (mismatched_dirs.length > 0) {
    return create_result("theme_dir_match", "warn", `style.css を持つ別テーマディレクトリがあります: ${mismatched_dirs.join(", ")}`, "yarn update:wp-config を実行してください");
  }

  return create_result("theme_dir_match", "ok", `テーマディレクトリは一致しています: ${THEME_NAME}`);
}

async function check_plugin_sync() {
  if (!isWordPressEnvRunning()) {
    return create_result("plugin_sync", "warn", "skip: WordPress 環境が未起動のためプラグイン同期差分を確認していません", "必要な場合のみ yarn wp-start 後に yarn doctor を再実行してください");
  }

  try {
    const plugin_diff = await getPluginSyncDiff();
    const diff_count = plugin_diff.toAdd.length + plugin_diff.orphanSlugs.length;

    if (diff_count === 0) {
      return create_result("plugin_sync", "ok", "プラグイン設定は同期済みです");
    }

    return create_result("plugin_sync", "warn", `プラグイン同期差分があります（追加候補 ${plugin_diff.toAdd.length}, 孤児 ${plugin_diff.orphanSlugs.length}）`, "yarn wp-plugins:sync --dry-run で確認してください");
  } catch (err) {
    return create_result("plugin_sync", "warn", "プラグイン同期差分を確認できません", err.message);
  }
}

async function collect_results() {
  return [check_theme_slug(), check_node(), check_yarn(), check_docker(), check_docker_compose(), check_port("8888"), check_port("5173"), check_theme_dir_match(), await check_plugin_sync()];
}

function summarize(results) {
  return {
    ok: results.filter(result => result.status === "ok").length,
    warn: results.filter(result => result.status === "warn").length,
    error: results.filter(result => result.status === "error").length,
  };
}

function print_results(results) {
  const icon_map = {
    ok: "✅",
    warn: "⚠️",
    error: "❌",
  };

  for (const result of results) {
    log(MODULE, `${icon_map[result.status]} ${result.message}`);
    if ((result.status === "warn" || result.status === "error") && result.hint) {
      log(MODULE, `  hint: ${result.hint}`);
    }
  }

  const summary = summarize(results);
  log(MODULE, `summary: ok ${summary.ok}, warn ${summary.warn}, error ${summary.error}`);
}

async function main() {
  const results = await collect_results();

  if (is_json) {
    write_json({ summary: summarize(results), checks: results });
  } else {
    print_results(results);
  }

  if (results.some(result => result.status === "error")) {
    process.exit(1);
  }
}

main().catch(err => {
  const results = [create_result("doctor", "error", "doctor の実行に失敗しました", err.message)];
  if (is_json) {
    write_json({ summary: summarize(results), checks: results });
  } else {
    log(MODULE, `❌ doctor の実行に失敗しました`, "error");
    log(MODULE, `  hint: ${err.message}`, "error");
  }
  process.exit(1);
});
