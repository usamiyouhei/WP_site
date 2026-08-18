<?php
if (!defined("ABSPATH")) {
  exit();
}

/**
 * func-comments
 * コメント機能を明示的に無効化する
 */

/**
 * 投稿・固定ページのコメント／トラックバックのサポートを解除
 */
function disable_comments_post_types_support()
{
  remove_post_type_support("post", "comments");
  remove_post_type_support("post", "trackbacks");
  remove_post_type_support("page", "comments");
  remove_post_type_support("page", "trackbacks");
}
add_action("init", "disable_comments_post_types_support", 100);

/**
 * コメント・トラックバックの受付を強制的に閉じる
 */
add_filter("comments_open", "__return_false", 20, 2);
add_filter("pings_open", "__return_false", 20, 2);

/**
 * 既存コメントの出力を強制的に空にする
 */
add_filter("comments_array", "__return_empty_array", 10, 2);

/**
 * 管理画面メニューから「コメント」を削除
 */
function remove_comments_admin_menu()
{
  remove_menu_page("edit-comments.php");
}
add_action("admin_menu", "remove_comments_admin_menu");

/**
 * 管理バーからコメントアイコンを削除
 */
function remove_comments_admin_bar_menu($wp_admin_bar)
{
  $wp_admin_bar->remove_node("comments");
}
add_action("admin_bar_menu", "remove_comments_admin_bar_menu", 999);
