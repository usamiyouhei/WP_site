<?php
if (!defined("ABSPATH")) {
  exit();
}

/**
 * func-helpers
 * 共通ヘルパー関数
 * 複数のファイルで使用される共通処理を集約
 */

/**
 * Vite manifestファイルを読み込む（開発環境用）
 *
 * @return array|false manifest配列（開発環境のみ）、失敗時はfalse
 */
function get_vite_manifest()
{
  static $manifest = null;

  if ($manifest !== null) {
    return $manifest;
  }

  $devManifestPath = get_template_directory() . "/manifest.dev.json";
  if (file_exists($devManifestPath)) {
    $manifest_content = file_get_contents($devManifestPath);
    if ($manifest_content !== false) {
      $manifest = json_decode($manifest_content, true);
      if (json_last_error() === JSON_ERROR_NONE && $manifest !== null) {
        if (isset($manifest["url"])) {
          $url = $manifest["url"];
          $parsed_url = parse_url($url);
          $host = isset($parsed_url["host"]) ? strtolower($parsed_url["host"]) : "";

          if ($host === "localhost" || $host === "127.0.0.1" || $host === "") {
            return $manifest;
          }
        }
      }
    }
  }

  return false;
}

/**
 * ビルド済みmanifest.jsonを読み込む（本番環境用）
 *
 * @return array|false manifest配列（本番環境のみ）、失敗時はfalse
 */
function get_build_manifest()
{
  static $manifest = null;

  if ($manifest !== null) {
    return $manifest;
  }

  // ビルド済みmanifest.jsonを読み込み
  $manifestPath = get_template_directory() . "/.vite/manifest.json";
  if (file_exists($manifestPath)) {
    $manifest_content = file_get_contents($manifestPath);
    if ($manifest_content !== false) {
      $manifest = json_decode($manifest_content, true);
      if (json_last_error() === JSON_ERROR_NONE && $manifest !== null) {
        return $manifest;
      }
    }
  }

  return false;
}

/**
 * Vite開発環境かどうかを判定
 * WP_DEBUGとmanifest.dev.jsonの両方をチェックして、より確実に開発環境を判定
 *
 * @return bool 開発環境の場合true、それ以外はfalse
 */
function is_vite_dev_mode()
{
  // WP_DEBUGがfalseの場合は開発環境ではない
  if (!defined("WP_DEBUG") || !WP_DEBUG) {
    return false;
  }

  // manifest.dev.jsonが存在し、かつlocalhostであることを確認
  $dev_manifest = get_vite_manifest();
  return $dev_manifest !== false && isset($dev_manifest["url"]);
}

/**
 * アセット読み込み環境を判定
 * 優先順位: 開発環境 > manifest.json > フォールバック
 *
 * @return string 'dev' | 'manifest' | 'fallback'
 */
function get_asset_environment()
{
  if (is_vite_dev_mode()) {
    return "dev";
  }

  $build_manifest = get_build_manifest();
  if ($build_manifest !== false) {
    return "manifest";
  }

  return "fallback";
}

/**
 * ファイルの更新日時をバージョン番号として取得
 *
 * @param string $file_path ファイルパス
 * @return int|null ファイルの更新日時（失敗時はnull）
 */
function get_file_version($file_path)
{
  if (!file_exists($file_path) || !is_readable($file_path)) {
    if (defined("WP_DEBUG") && WP_DEBUG) {
      error_log("[get_file_version] File not found or not readable: " . $file_path);
    }
    return null;
  }

  $version = filemtime($file_path);
  return $version !== false ? $version : null;
}

/**
 * アーカイブページのタイトル文言・ラベルを取得
 *
 * @return array{title_text: string, title_label: string}
 */
function get_archive_title_parts()
{
  $post_type = get_post_type();
  $title_text = "";
  $title_label = "";

  if (is_category()) {
    $title_text = single_cat_title("", false);
    $title_label = "CATEGORY";
  } elseif (is_post_type_archive()) {
    $title_text = post_type_archive_title("", false);
    $title_label = strtoupper($post_type);
  } elseif (is_tag()) {
    $title_text = single_tag_title("", false);
    $title_label = "TAG";
  } elseif (is_date()) {
    if (is_year()) {
      $title_text = get_the_date("Y年");
      $title_label = "YEAR";
    } elseif (is_month()) {
      $title_text = get_the_date("Y年n月");
      $title_label = "MONTH";
    } elseif (is_day()) {
      $title_text = get_the_date("Y年n月j日");
      $title_label = "DAY";
    }
  } else {
    $title_text = $post_type === "post" ? "ニュース" : get_post_type_object($post_type)->labels->name;
    $title_label = $post_type === "post" ? "NEWS" : strtoupper($post_type);
  }

  return ["title_text" => $title_text, "title_label" => $title_label];
}

/**
 * お問い合わせフォーム（Contact Form 7）のショートコードを解決する
 * 優先順位: 指定ハッシュのフォーム → 最初の公開フォーム → 空文字（未設定）
 * デフォルトのハッシュは販売特典SQLに含まれるフォームを指す。
 * 別のフォームを使う場合は theme_cf7_form_hash フィルタで上書きできる。
 */
function get_theme_contact_form_shortcode()
{
  if (!class_exists("WPCF7_ContactForm")) {
    return "";
  }

  $preferred_hash = apply_filters("theme_cf7_form_hash", "c86f2bc");

  $forms = get_posts([
    "post_type" => "wpcf7_contact_form",
    "post_status" => "publish",
    "numberposts" => -1,
  ]);
  if (empty($forms)) {
    return "";
  }

  $target = $forms[0];
  foreach ($forms as $form) {
    $hash = get_post_meta($form->ID, "_hash", true);
    if ($hash && strpos($hash, $preferred_hash) === 0) {
      $target = $form;
      break;
    }
  }

  return sprintf('[contact-form-7 id="%d" title="%s"]', (int) $target->ID, esc_attr($target->post_title));
}
