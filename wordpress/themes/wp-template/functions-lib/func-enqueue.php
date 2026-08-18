<?php
if (!defined("ABSPATH")) {
  exit();
}

/**
 * Vite対応のスクリプトとスタイル読み込み処理
 * 環境変数（WP_DEBUG）とmanifestファイルを活用した環境判定
 */
function add_vite_scripts()
{
  $environment = get_asset_environment();

  switch ($environment) {
    case "dev":
      enqueue_dev_assets();
      return;

    case "manifest":
      enqueue_production_assets_from_manifest();
      break;

    case "fallback":
      enqueue_production_assets_fallback();
      break;
  }

  // Google Fonts（開発環境以外で読み込み）
  wp_enqueue_style("google-fonts", "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@100..900&family=Noto+Serif+JP:wght@200..900&display=swap", false);
}

/**
 * 開発環境のアセットを読み込み
 */
function enqueue_dev_assets()
{
  $dev_manifest = get_vite_manifest();
  if ($dev_manifest === false || !isset($dev_manifest["url"])) {
    return;
  }

  $baseUrl = $dev_manifest["url"];
  wp_enqueue_script("vite-client", $baseUrl . "@vite/client", [], null, true);

  if (isset($dev_manifest["inputs"]["script"])) {
    wp_enqueue_script("theme-scripts", $baseUrl . $dev_manifest["inputs"]["script"], [], null, true);
  }
}

/**
 * manifest.jsonを使用した本番環境のアセットを読み込み
 */
function enqueue_production_assets_from_manifest()
{
  $root = get_template_directory_uri();
  $build_manifest = get_build_manifest();

  if ($build_manifest === false) {
    return;
  }

  // ライブラリCSS（JS関連CSS）を先に読み込み
  $library_css_handles = [];
  $script_entry = $build_manifest["assets/js/script.js"] ?? null;

  if ($script_entry && isset($script_entry["file"])) {
    // JS関連CSS（ライブラリCSS、例：Splide）を先に読み込み
    if (isset($script_entry["css"]) && is_array($script_entry["css"])) {
      foreach ($script_entry["css"] as $index => $css_file) {
        $handle = "theme-script-css-" . $index;
        $library_css_handles[] = $handle;
        wp_enqueue_style($handle, $root . "/" . $css_file, [], null, false);
      }
    }
    // メインJSを読み込み
    wp_enqueue_script("theme-scripts", $root . "/" . $script_entry["file"], [], null, true);
  }

  // メインCSSを最後に読み込み（ライブラリCSSの後に確実に読み込まれるように依存関係を指定）
  $style_entry = $build_manifest["assets/styles/style.scss"] ?? null;
  if ($style_entry && isset($style_entry["file"])) {
    wp_enqueue_style("theme-styles", $root . "/" . $style_entry["file"], $library_css_handles, null, false);
  }
}

/**
 * フォールバック方式で本番環境のアセットを読み込み
 * manifest.jsonが存在しない場合の安全策
 */
function enqueue_production_assets_fallback()
{
  $root = get_template_directory_uri();
  $assets_dir = get_template_directory() . "/assets";

  // ライブラリCSS（style.css 以外）を先に読み込む
  $library_css_handles = [];
  $css_files = glob($assets_dir . "/styles/*.css");

  if (is_array($css_files)) {
    foreach ($css_files as $css_file) {
      if (!is_file($css_file) || !is_readable($css_file)) {
        continue;
      }

      $filename = basename($css_file, ".css");
      if ($filename === "style") {
        continue;
      }

      $version = get_file_version($css_file);
      if ($version !== null) {
        $handle = "theme-" . $filename;
        $library_css_handles[] = $handle;
        wp_enqueue_style($handle, $root . "/assets/styles/" . basename($css_file), [], $version, false);
      }
    }
  }

  // メインJSを読み込み
  $script_file = $assets_dir . "/js/script.js";
  $version = get_file_version($script_file);
  if ($version !== null) {
    wp_enqueue_script("theme-scripts", $root . "/assets/js/script.js", [], $version, true);
  }

  // メインCSSを最後に読み込み（ライブラリCSSの後に確実に読み込まれるように依存関係を指定）
  $style_file = $assets_dir . "/styles/style.css";
  $version = get_file_version($style_file);
  if ($version !== null) {
    wp_enqueue_style("theme-styles", $root . "/assets/styles/style.css", $library_css_handles, $version, false);
  }
}

add_action("wp_enqueue_scripts", "add_vite_scripts", 10);

/**
 * global-styles-inline-cssを無効化
 */
function disable_global_styles()
{
  wp_dequeue_style("global-styles");
  wp_deregister_style("global-styles");
  remove_action("wp_enqueue_scripts", "wp_enqueue_global_styles");
  remove_action("wp_footer", "wp_enqueue_global_styles", 1);
}
add_action("wp_enqueue_scripts", "disable_global_styles", 100);

/**
 * after_setup_themeでglobal-stylesを無効化
 */
function disable_global_styles_on_setup()
{
  remove_action("wp_enqueue_scripts", "wp_enqueue_global_styles");
  remove_action("wp_footer", "wp_enqueue_global_styles", 1);
}
add_action("after_setup_theme", "disable_global_styles_on_setup", 100);

/**
 * ES Modules対応（type="module"属性を追加）
 */
function add_vite_module_attribute($tag, $handle, $src)
{
  if (in_array($handle, ["theme-scripts", "vite-client"])) {
    $tag = '<script type="module" src="' . esc_url($src) . '"></script>';
  }
  return $tag;
}
add_filter("script_loader_tag", "add_vite_module_attribute", 10, 3);

/**
 * Google Fonts最適化（プリコネクト）
 */
function add_font_preconnect($html, $handle)
{
  if ("google-fonts" === $handle) {
    $html = <<<EOT
    <link rel='preconnect' href='https://fonts.googleapis.com'>
    <link rel='preconnect' href='https://fonts.gstatic.com' crossorigin>
    $html
    EOT;
  }
  return $html;
}
add_filter("style_loader_tag", "add_font_preconnect", 10, 2);
