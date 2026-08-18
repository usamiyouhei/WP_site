<?php
if (!defined("ABSPATH")) {
  exit();
}

/**
 * func-security
 *  セキュリティ対策
 *
 */

/**
 * wordpressバージョン情報の削除
 * @see　https://digitalnavi.net/wordpress/6921/
 */
remove_action("wp_head", "wp_generator");

/**
 * 投稿者一覧ページを自動で生成されないようにする
 * WordPressの is_author() を使用してより安全に判定
 * @see　https://mucca-design.com/auther-archive-ineffective/
 */
function disable_author_archive()
{
  if (!is_admin() && is_author()) {
    wp_safe_redirect(home_url("/"), 301);
    exit();
  }
}
add_action("template_redirect", "disable_author_archive");

/**
 * XML-RPCを無効化（総当たり攻撃・DDoS等の攻撃対象を削減）
 * xmlrpc_enabled は認証系メソッドのみ対象のため、xmlrpc_methods も空にして全メソッドを無効化する
 */
add_filter("xmlrpc_enabled", "__return_false");
add_filter("xmlrpc_methods", "__return_empty_array");

/**
 * REST APIのユーザー列挙対策：未ログイン時は /wp/v2/users 系ルートを除去（CF7等の他REST APIは維持）
 */
function restrict_rest_user_endpoints($endpoints)
{
  if (is_user_logged_in()) {
    return $endpoints;
  }

  foreach ($endpoints as $route => $endpoint) {
    if (preg_match("#^/wp/v2/users#", $route)) {
      unset($endpoints[$route]);
    }
  }

  return $endpoints;
}
add_filter("rest_endpoints", "restrict_rest_user_endpoints");

/**
 * RSDリンク（XML-RPC検出用）の出力を削除
 */
remove_action("wp_head", "rsd_link");

/**
 * Windows Live Writer用マニフェストリンクの出力を削除
 */
remove_action("wp_head", "wlwmanifest_link");

/**
 * ショートリンクの出力を削除
 */
remove_action("wp_head", "wp_shortlink_wp_head");

/**
 * oEmbed検出リンク（<link rel="alternate" type="application/json+oembed">）の出力を削除
 */
remove_action("wp_head", "wp_oembed_add_discovery_links");

/**
 * oEmbed埋め込み用JavaScriptの出力を削除
 */
remove_action("wp_head", "wp_oembed_add_host_js");
