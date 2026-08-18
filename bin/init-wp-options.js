import fs from "fs";
import { resolve } from "path";
import { exists, readJson, ensureDir, writeFile } from "./utils/fs-utils.js";
import { log, success, error } from "./utils/logger.js";
import { projectRoot, THEME_NAME } from "./utils/paths.js";
import { isWordPressEnvRunning, ensureCliContainerRunning, runWpCli } from "./utils/wp-env.js";

const MODULE_NAME = "init-wp-options";
const UPLOADS_DIR = resolve(projectRoot, "wordpress/uploads");
const DATA_JSON_PATH = resolve(UPLOADS_DIR, "tmp-init-options.json");
const EVAL_PHP_PATH = resolve(UPLOADS_DIR, "tmp-init-options.php");
const CONTAINER_DATA_JSON_PATH = "/var/www/html/wp-content/uploads/tmp-init-options.json";
const CONTAINER_EVAL_PHP_PATH = "/var/www/html/wp-content/uploads/tmp-init-options.php";

const DEFAULT_CONFIG = {
  options: {
    timezone_string: "Asia/Tokyo",
    date_format: "Y-m-d",
    time_format: "H:i",
    start_of_week: 1,
  },
  front_page: {
    slug: "top",
    title: "Top",
    content: "",
  },
  posts_page: null,
  pages: [
    {
      slug: "contact",
      title: "お問い合わせ",
      content: "",
    },
  ],
  seed_posts_json: "post-data/posts-sample.json",
  seed_posts_if_empty: true,
  permalink_structure: "/%postname%/",
  category_base: "",
  tag_base: "",
};

// wp-init から実行するPHP。同ディレクトリのJSONを読み込み、テーマ有効化・オプション適用・
// パーマリンク設定・フロントページ設定・投稿シードをまとめて実行する
// （create-post.js と同じ eval-file パターン）。
// 注意: PHP側の変数展開は `{$var}` 形式のみを使用すること。
// `${var}` 形式（レガシー構文）はこのJSテンプレートリテラルの補間と衝突するため使用禁止。
const EVAL_PHP_CONTENT = `<?php
$path = '${CONTAINER_DATA_JSON_PATH}';
if (!file_exists($path)) {
  WP_CLI::error('Init options JSON not found.');
}
$raw = file_get_contents($path);
$data = json_decode($raw, true);
if (!is_array($data)) {
  WP_CLI::error('Invalid init options data.');
}

/**
 * カテゴリ指定（ID・名前・スラッグ混在可）をカテゴリIDの配列に解決する
 */
function resolve_category_ids($categories) {
  if (empty($categories)) {
    return array();
  }
  if (!is_array($categories)) {
    $categories = array_filter(array_map('trim', explode(',', (string) $categories)));
  }
  $ids = array();
  foreach ($categories as $category) {
    if (is_numeric($category)) {
      $ids[] = intval($category);
      continue;
    }
    $term = get_term_by('name', $category, 'category');
    if (!$term) {
      $term = get_term_by('slug', $category, 'category');
    }
    if ($term && !is_wp_error($term)) {
      $ids[] = intval($term->term_id);
    } else {
      WP_CLI::log("  - カテゴリが見つかりません（スキップ）: {$category}");
    }
  }
  return $ids;
}

/**
 * slug から固定ページIDを取得（存在しなければ null）
 */
function find_page_id_by_slug($slug) {
  $query = new WP_Query(array(
    'post_type' => 'page',
    'name' => $slug,
    'post_status' => 'any',
    'posts_per_page' => 1,
    'fields' => 'ids',
    'no_found_rows' => true,
  ));
  $id = !empty($query->posts) ? intval($query->posts[0]) : null;
  wp_reset_postdata();
  return $id;
}

/**
 * 固定ページを作成（既存の場合は既存IDを返す。冪等性を担保）
 */
function ensure_page($page_config) {
  if (empty($page_config) || empty($page_config['slug'])) {
    return null;
  }
  $existing_id = find_page_id_by_slug($page_config['slug']);
  if ($existing_id) {
    WP_CLI::log("固定ページは既に存在します（スキップ）: {$page_config['slug']} (ID: {$existing_id})");
    return $existing_id;
  }
  if (empty($page_config['title'])) {
    WP_CLI::log("固定ページの作成をスキップしました（titleが未指定）: {$page_config['slug']}");
    return null;
  }
  $post_id = wp_insert_post(array(
    'post_title' => $page_config['title'],
    'post_content' => isset($page_config['content']) ? $page_config['content'] : '',
    'post_status' => 'publish',
    'post_type' => 'page',
    'post_name' => $page_config['slug'],
    'post_author' => 1,
  ), true);
  if (is_wp_error($post_id)) {
    WP_CLI::log("固定ページの作成に失敗しました: {$page_config['slug']} - " . $post_id->get_error_message());
    return null;
  }
  WP_CLI::log("固定ページを作成しました: {$page_config['slug']} (ID: {$post_id})");
  return $post_id;
}

// 1. テーマ有効化（最初に実行）
$theme_slug = isset($data['theme_slug']) ? $data['theme_slug'] : '';
if ($theme_slug !== '') {
  $target_theme = wp_get_theme($theme_slug);
  $current_theme = wp_get_theme();
  if (!$target_theme->exists()) {
    WP_CLI::log("テーマが見つかりません（有効化をスキップ）: {$theme_slug}");
  } elseif ($current_theme && $current_theme->get_stylesheet() === $theme_slug) {
    WP_CLI::log("テーマは既に有効です（スキップ）: {$theme_slug}");
  } else {
    switch_theme($theme_slug);
    WP_CLI::log("テーマを有効化しました: {$theme_slug}");
  }
}

// 2. オプション更新（null と空文字列のみスキップ。false や 0 は有効な値として適用する）
if (!empty($data['options']) && is_array($data['options'])) {
  foreach ($data['options'] as $key => $value) {
    if ($value === null) {
      continue;
    }
    if (is_string($value) && trim($value) === '') {
      WP_CLI::log("Option update: {$key} - skip (empty)");
      continue;
    }
    update_option($key, $value);
    WP_CLI::log("Option update: {$key}");
  }
}

// 3. パーマリンク設定
global $wp_rewrite;
$should_flush = false;

if (isset($data['permalink_structure']) && trim((string) $data['permalink_structure']) !== '') {
  $wp_rewrite->set_permalink_structure($data['permalink_structure']);
  WP_CLI::log("Permalink structure updated: {$data['permalink_structure']}");
  $should_flush = true;
}

if (isset($data['category_base']) && trim((string) $data['category_base']) !== '') {
  $wp_rewrite->set_category_base(trim($data['category_base']));
  WP_CLI::log('Category base updated: ' . trim($data['category_base']));
  $should_flush = true;
}

if (isset($data['tag_base']) && trim((string) $data['tag_base']) !== '') {
  $wp_rewrite->set_tag_base(trim($data['tag_base']));
  WP_CLI::log('Tag base updated: ' . trim($data['tag_base']));
  $should_flush = true;
}

if ($should_flush) {
  // 注意: CLI コンテキストではホスト情報が不完全なため、ハードフラッシュ（true）で
  // .htaccess を書き込むと RewriteBase が壊れる。ソフトフラッシュでルールを再生成させる
  flush_rewrite_rules(false);
  WP_CLI::log('Rewrite rules flushed.');
}

// 4. フロントページ設定
$front_page_id = ensure_page(isset($data['front_page']) ? $data['front_page'] : null);
$posts_page_id = ensure_page(isset($data['posts_page']) ? $data['posts_page'] : null);

// 4-2. 追加の固定ページ作成（テンプレートは page-{slug}.php がスラッグ一致で自動適用される）
if (!empty($data['pages']) && is_array($data['pages'])) {
  foreach ($data['pages'] as $page_config) {
    ensure_page($page_config);
  }
}

if ($front_page_id) {
  update_option('show_on_front', 'page');
  update_option('page_on_front', $front_page_id);
  update_option('page_for_posts', $posts_page_id ? $posts_page_id : 0);
  WP_CLI::log('Front page settings updated.');
} else {
  update_option('show_on_front', 'posts');
  update_option('page_on_front', 0);
  update_option('page_for_posts', 0);
  WP_CLI::log('Front page settings: using posts as front page.');
}

// 5. シード投稿の作成（seed_posts_if_empty が true かつ公開投稿が0件のときのみ）
$seed_posts_if_empty = !empty($data['seed_posts_if_empty']);
$seed_posts = isset($data['seed_posts']) && is_array($data['seed_posts']) ? $data['seed_posts'] : array();

// WordPress標準の「Hello world!」（slug: hello-world）は既存投稿として数えない
// （新規インストールでは必ず存在するため、数えるとシードが一度も実行されない）
$existing_published = get_posts(array(
  'post_type' => 'post',
  'post_status' => 'publish',
  'numberposts' => -1,
  'fields' => 'ids',
));
$default_post_ids = array();
$user_post_count = 0;
foreach ($existing_published as $existing_id) {
  $existing_post = get_post($existing_id);
  if ($existing_post && $existing_post->post_name === 'hello-world') {
    $default_post_ids[] = $existing_id;
    continue;
  }
  $user_post_count++;
}
$has_existing_posts = $user_post_count > 0;

if ($seed_posts_if_empty && $has_existing_posts) {
  WP_CLI::log('既存の公開投稿があるため、投稿シードをスキップします。');
} elseif (empty($seed_posts)) {
  WP_CLI::log('投稿シードデータがないため、スキップします。');
} else {
  // シードで置き換えるため、標準の「Hello world!」はゴミ箱へ移動
  foreach ($default_post_ids as $default_id) {
    wp_trash_post($default_id);
    WP_CLI::log("標準の投稿「Hello world!」をゴミ箱へ移動しました (ID: {$default_id})");
  }
  WP_CLI::log('投稿を作成します...');
  foreach ($seed_posts as $post_data) {
    if (empty($post_data['title'])) {
      WP_CLI::log('  ✗ タイトルがないためスキップしました。');
      continue;
    }
    $postarr = array(
      'post_title' => $post_data['title'],
      'post_content' => isset($post_data['content']) ? $post_data['content'] : '',
      'post_status' => isset($post_data['status']) ? $post_data['status'] : 'publish',
      'post_type' => isset($post_data['postType']) ? $post_data['postType'] : 'post',
      'post_author' => isset($post_data['author']) ? intval($post_data['author']) : 1,
    );
    $post_id = wp_insert_post($postarr, true);
    if (is_wp_error($post_id)) {
      WP_CLI::log("  ✗ 作成エラー: {$post_data['title']} - " . $post_id->get_error_message());
      continue;
    }
    $category_ids = resolve_category_ids(isset($post_data['categories']) ? $post_data['categories'] : array());
    if (!empty($category_ids)) {
      wp_set_post_categories($post_id, $category_ids);
    }
    $tags = isset($post_data['tags']) ? $post_data['tags'] : array();
    if (is_string($tags)) {
      $tags = array_filter(array_map('trim', explode(',', $tags)));
    }
    if (!empty($tags)) {
      wp_set_post_tags($post_id, $tags);
    }
    WP_CLI::log("  ✓ 作成成功: {$post_data['title']} (ID: {$post_id})");
  }
}

WP_CLI::success('WordPress init options applied.');
`;

function loadConfig() {
  const configPath = resolve(projectRoot, "config/wp-options.json");
  if (!exists(configPath)) {
    return DEFAULT_CONFIG;
  }
  try {
    const userConfig = readJson(configPath);
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      options: {
        ...DEFAULT_CONFIG.options,
        ...(userConfig.options || {}),
      },
    };
  } catch (err) {
    error(MODULE_NAME, "config/wp-options.json の読み込みに失敗しました", err);
    return DEFAULT_CONFIG;
  }
}

async function waitForWpReady(retries = 20, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      // wp core is-installed は、インストール済みの場合のみ成功（終了コード0）
      // インストールされていない場合は終了コード1で失敗する
      runWpCli(["core", "is-installed"]);
      log(MODULE_NAME, "WordPress の準備が完了しました。");
      return true;
    } catch (err) {
      // リトライ中はエラーを無視して待機
      if (i < retries - 1) {
        log(MODULE_NAME, `WordPress の起動を待機中... (${i + 1}/${retries})`);
        await new Promise(resolveWait => setTimeout(resolveWait, delayMs));
      } else {
        // 最後のリトライでも失敗した場合、エラー詳細をログに出力
        error(MODULE_NAME, "WordPress の起動確認に失敗しました。", err);
      }
    }
  }
  return false;
}

/**
 * 投稿シードデータを読み込む（見つからない/空の場合は空配列を返し、PHP側でスキップされる）
 * @param {Object} config - 設定オブジェクト
 * @returns {Array} 投稿データ配列
 */
function loadSeedPosts(config) {
  if (!config.seed_posts_json) return [];

  const jsonPath = resolve(projectRoot, config.seed_posts_json);
  if (!exists(jsonPath)) {
    error(MODULE_NAME, `投稿データが見つかりません: ${config.seed_posts_json}`);
    return [];
  }

  const posts = readJson(jsonPath);
  if (!Array.isArray(posts) || posts.length === 0) {
    error(MODULE_NAME, "投稿データが空です。");
    return [];
  }

  log(MODULE_NAME, `投稿データを読み込みました: ${config.seed_posts_json} (${posts.length}件)`);
  return posts;
}

/**
 * Node側で組み立てた設定・投稿データをJSONにまとめる
 * @param {Object} config - 設定オブジェクト
 * @returns {Object} PHPへ渡すペイロード
 */
function buildPayload(config) {
  return {
    options: config.options || {},
    permalink_structure: config.permalink_structure || "",
    category_base: config.category_base || "",
    tag_base: config.tag_base || "",
    front_page: config.front_page || null,
    posts_page: config.posts_page || null,
    pages: Array.isArray(config.pages) ? config.pages : [],
    seed_posts_if_empty: !!config.seed_posts_if_empty,
    seed_posts: loadSeedPosts(config),
    theme_slug: THEME_NAME,
  };
}

function writeTmpFiles(payload) {
  ensureDir(UPLOADS_DIR);
  writeFile(DATA_JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  writeFile(EVAL_PHP_PATH, EVAL_PHP_CONTENT);
}

function cleanupTmpFiles() {
  [DATA_JSON_PATH, EVAL_PHP_PATH].forEach(filePath => {
    if (exists(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        log(MODULE_NAME, `一時ファイルの削除に失敗しました: ${filePath}`, "warn");
      }
    }
  });
}

/**
 * PHP側のWP_CLI::log/successの出力をそのままNode側に表示する
 * @param {string} output - eval-file実行結果の標準出力
 */
function printPhpOutput(output) {
  String(output)
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .forEach(line => log(MODULE_NAME, line));
}

async function main() {
  log(MODULE_NAME, "WordPress 初期設定を適用します...");

  if (!isWordPressEnvRunning()) {
    error(MODULE_NAME, "WordPress環境が起動していません。先に yarn wp-start を実行してください。");
    process.exit(1);
  }

  // CLIコンテナを確実に起動する（wp-env 10では、wp-env startだけではCLIコンテナが起動しない場合がある）
  log(MODULE_NAME, "CLIコンテナの起動を確認中...");
  let cliStarted = false;
  for (let i = 0; i < 5; i++) {
    cliStarted = ensureCliContainerRunning();
    if (cliStarted) {
      log(MODULE_NAME, "CLIコンテナが起動しました。");
      break;
    }
    if (i < 4) {
      log(MODULE_NAME, `CLIコンテナの起動を試行中... (${i + 1}/5)`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  if (!cliStarted) {
    error(MODULE_NAME, "CLIコンテナの起動に失敗しました。");
    error(MODULE_NAME, "手動で以下のコマンドを実行してください: yarn wp-start");
    process.exit(1);
  }

  const ready = await waitForWpReady();
  if (!ready) {
    error(MODULE_NAME, "WordPress が起動しませんでした。少し待ってから再実行してください。");
    error(MODULE_NAME, "もしくは、yarn wp-start を実行してWordPress環境を起動してください。");
    process.exit(1);
  }

  const config = loadConfig();
  const payload = buildPayload(config);

  try {
    writeTmpFiles(payload);
    const output = runWpCli(["eval-file", CONTAINER_EVAL_PHP_PATH]);
    printPhpOutput(output);
    success(MODULE_NAME, "初期設定の適用が完了しました。");
  } catch (err) {
    error(MODULE_NAME, "初期設定の適用に失敗しました。", err);
    process.exitCode = 1;
  } finally {
    cleanupTmpFiles();
  }
}

main().catch(err => {
  error(MODULE_NAME, err.message, err);
  process.exit(1);
});
