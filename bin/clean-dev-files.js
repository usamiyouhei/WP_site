#!/usr/bin/env node

/**
 * 本番環境用ビルド後のクリーンアップスクリプト
 * - 開発環境専用ファイル（manifest.dev.json など）を削除
 * - 過去ビルドの古いハッシュ付き JS/CSS を削除（テーマ直下が outDir のため
 *   Vite の emptyOutDir が使えず、放置すると成果物が溜まり続けるため）
 */

import { existsSync, rmSync, unlinkSync, statSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { paths } from "./utils/paths.js";
import { log, success, error } from "./utils/logger.js";

const themeDir = paths.themeDir;

// 削除対象のファイル（manifest.dev.jsonのみ）
const filesToRemove = [join(themeDir, "manifest.dev.json")];

log("clean-dev-files", `クリーンアップを開始: ${themeDir}`);

let removedCount = 0;

// ファイル・ディレクトリを削除
filesToRemove.forEach(path => {
  if (existsSync(path)) {
    try {
      const stats = statSync(path);
      if (stats.isDirectory()) {
        // ディレクトリの場合は再帰的に削除
        rmSync(path, { recursive: true, force: true });
        removedCount++;
        success("clean-dev-files", `削除: ${path}/ (ディレクトリ)`);
      } else {
        // ファイルの場合は削除
        unlinkSync(path);
        removedCount++;
        success("clean-dev-files", `削除: ${path}`);
      }
    } catch (err) {
      error("clean-dev-files", `削除失敗: ${path} - ${err.message}`);
    }
  }
});

// 古いハッシュ付きビルド成果物の削除（現在の manifest に載っていない JS/CSS）
const manifestPath = join(themeDir, ".vite", "manifest.json");
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const referenced = new Set();
    Object.values(manifest).forEach(entry => {
      if (entry.file) referenced.add(entry.file);
      (entry.css || []).forEach(file => referenced.add(file));
      (entry.assets || []).forEach(file => referenced.add(file));
    });

    ["assets/js", "assets/styles"].forEach(dir => {
      const absDir = join(themeDir, dir);
      if (!existsSync(absDir)) return;
      readdirSync(absDir).forEach(file => {
        const relPath = `${dir}/${file}`;
        if (referenced.has(relPath)) return;
        try {
          unlinkSync(join(absDir, file));
          removedCount++;
          success("clean-dev-files", `旧ビルド成果物を削除: ${relPath}`);
        } catch (err) {
          error("clean-dev-files", `削除失敗: ${relPath} - ${err.message}`);
        }
      });
    });
  } catch (err) {
    log("clean-dev-files", `manifest の読み込みに失敗（旧成果物の削除をスキップ）: ${err.message}`, "warn");
  }
}

if (removedCount > 0) {
  success("clean-dev-files", `完了: ${removedCount}個のファイル/ディレクトリを削除しました`);
} else {
  log("clean-dev-files", "削除対象のファイルは見つかりませんでした");
}
