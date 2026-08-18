<?php

/**
 * searchform.php
 * 検索フォームテンプレート（get_search_form() から自動的に読み込まれる）
 */
$search_form_id = wp_unique_id("search-form-"); ?>
<form role="search" method="get" class="c-search-form" action="<?php echo esc_url(home_url("/")); ?>">
  <label for="<?php echo esc_attr($search_form_id); ?>" class="u-sr-only"><?php esc_html_e("検索", "wp-template"); ?></label>
  <input type="search" id="<?php echo esc_attr($search_form_id); ?>" class="c-search-form__input" name="s" value="<?php echo esc_attr(get_search_query()); ?>" placeholder="<?php echo esc_attr__("キーワードで検索", "wp-template"); ?>">
  <button type="submit" class="c-search-form__button"><?php esc_html_e("検索", "wp-template"); ?></button>
</form>
