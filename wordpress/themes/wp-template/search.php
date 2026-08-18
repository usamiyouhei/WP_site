<?php
/**
 * 検索結果テンプレート
 * 検索キーワード・ヒット件数を表示し、投稿タイプに応じたカードで一覧表示する。
 * メインクエリの標準ループを使用（WP_Query を新規発行しない）。
 */
get_header();

global $wp_query;
$search_query = get_search_query();
$found_posts = (int) $wp_query->found_posts;
?>
<main class="l-main" id="main">
  <section class="p-archive">
    <div class="p-archive__inner l-inner">
      <header class="p-archive__header">
        <div class="p-archive__title">
          <hgroup class="c-section-title" data-align="center">
            <h1 class="c-section-title__main">
              <?php printf(
                /* translators: %s: 検索キーワード */
                esc_html__("「%s」の検索結果", "wp-template"),
                esc_html($search_query),
              ); ?>
            </h1>
            <p class="c-section-title__sub">
              <?php printf(
                /* translators: %d: 検索結果の件数 */
                esc_html__("%d件見つかりました", "wp-template"),
                $found_posts,
              ); ?>
            </p>
          </hgroup>
        </div>
      </header>

      <?php if (have_posts()): ?>
        <div class="p-archive__list">
          <?php while (have_posts()):
            the_post();
            switch (get_post_type()) {
              case "works":
                get_template_part("template-parts/archive/works-card");
                break;
              case "post":
                get_template_part("template-parts/archive/news-card");
                break;
              default:
                get_template_part("template-parts/archive/archive-card");
                break;
            }
          endwhile; ?>
        </div>
        <div class="p-archive__pagination">
          <?php get_template_part("template-parts/pagination"); ?>
        </div>
      <?php else: ?>
        <div class="p-archive__empty">
          <p><?php esc_html_e("お探しの条件に一致するコンテンツは見つかりませんでした。別のキーワードで再度お試しください。", "wp-template"); ?></p>
          <?php get_search_form(); ?>
        </div>
      <?php endif; ?>
    </div>
  </section>
</main>

<?php get_footer(); ?>
