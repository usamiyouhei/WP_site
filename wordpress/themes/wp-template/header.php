<!DOCTYPE html>
<html <?php language_attributes(); ?>>

<head>
  <meta charset="<?php bloginfo("charset"); ?>" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <?php include_once "template-parts/adjust-admin-bar.php"; ?>
  <?php wp_head(); ?>
</head>

<body <?php body_class(); ?>>
  <a class="c-skip-link" href="#main"><?php esc_html_e("本文へスキップ", "wp-template"); ?></a>
  <?php get_template_part("template-parts/header"); ?>
