<?php
/*
Template Name: Contact
*/
get_header(); ?>
<main class="l-main" id="main">
  <section class="p-contact">
    <div class="p-contact__inner l-inner">
      <div class="p-contact__title">
        <?php get_template_part("template-parts/section-title", null, [
          "main" => "CONTACT",
          "sub" => "お問い合わせ",
          "align" => "center",
          "tag" => "h2",
        ]); ?>
      </div>
      <div class="p-contact__form">
        <?php // フォームは「特典SQLのフォーム（ハッシュ一致）→ 最初の公開フォーム」の順で自動解決される


        $contact_form_shortcode = get_theme_contact_form_shortcode();
        if ($contact_form_shortcode) {
          echo do_shortcode($contact_form_shortcode);
        } else {
          echo '<p class="p-contact__notice">' . esc_html__("お問い合わせフォームが未設定です。Contact Form 7 でフォームを作成すると、ここに自動的に表示されます。", "wp-template") . "</p>";
        }
        ?>
      </div>
    </div>
  </section>
</main>
<?php get_footer(); ?>
