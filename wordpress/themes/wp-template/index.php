<?php
/**
 * 汎用フォールバックテンプレート
 * より優先度の高いテンプレートが存在しない場合に使用される。
 * メインクエリの標準ループを archive 系パーツで表示する。
 */
get_header(); ?>

<main class="l-main" id="main">
  <section class="p-archive">
    <div class="p-archive__inner l-inner">
      <?php get_template_part("template-parts/archive/archive-list"); ?>
    </div>
  </section>
</main>

<?php get_footer(); ?>
