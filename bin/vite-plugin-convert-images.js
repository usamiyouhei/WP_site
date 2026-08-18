import path from "path";
import sharp from "sharp";
import { watch } from "chokidar";
import { resolve, relative, basename, dirname } from "path";
import { globSync } from "glob";
import fs from "fs";
import { THEME_NAME, paths, projectRoot, toPosixPath } from "./utils/paths.js";

/**
 * 画像の変換・最適化・ビルド統合 Vite プラグイン
 * 開発環境: PNG/JPEG → WebP/AVIF変換 + 最適化 + 変換対象外画像のコピー（ファイル監視あり）
 * 本番環境（ビルド時）: buildStart で既存画像を一括変換（ファイル監視なし）
 *
 * @param {Object} options - プラグインオプション
 * @param {string} options.format - 変換形式 ('webp' | 'avif' | 'both')
 * @param {boolean} options.copyOriginal - 元画像も WordPress ディレクトリにコピーするか（開発環境のみ）
 * @param {Object} options.optimize - 最適化設定
 * @param {number} options.optimize.png - PNG品質 (0-100)
 * @param {number} options.optimize.jpeg - JPEG品質 (0-100)
 * @param {number} options.optimize.webp - WebP品質 (0-100)
 * @param {number} options.optimize.avif - AVIF品質 (0-100)
 * @param {boolean} options.isDev - 開発環境かどうか
 * @param {string} options.root - Viteのrootディレクトリ
 * @param {string} options.themeDir - WordPressテーマディレクトリ
 * @returns {Object} Vite プラグインオブジェクト
 */
export default function convertAndOptimizeImages(options = {}) {
  const {
    format: imageFormat = "webp",
    copyOriginal = false,
    optimize = {
      png: 80,
      jpeg: 80,
      jpg: 80,
      webp: 80,
      avif: 80,
    },
    isDev = false,
    root = projectRoot,
    themeDir = paths.themeDir,
  } = options;

  // 画像を最適化する関数
  const optimizeImage = async (sourcePath, outputPath, targetFormat) => {
    let sharpInstance = sharp(sourcePath);

    if (targetFormat === "png") {
      sharpInstance = sharpInstance.png({ quality: optimize.png });
    } else if (targetFormat === "jpeg" || targetFormat === "jpg") {
      sharpInstance = sharpInstance.jpeg({ quality: optimize.jpeg });
    } else if (targetFormat === "webp") {
      sharpInstance = sharpInstance.webp({ quality: optimize.webp });
    } else if (targetFormat === "avif") {
      sharpInstance = sharpInstance.avif({ quality: optimize.avif });
    } else {
      // 形式が指定されていない場合は元の形式を維持して最適化
      const ext = path.extname(sourcePath).toLowerCase();
      if (ext === ".png") {
        sharpInstance = sharpInstance.png({ quality: optimize.png });
      } else if (ext === ".jpg" || ext === ".jpeg") {
        sharpInstance = sharpInstance.jpeg({ quality: optimize.jpeg });
      } else if (ext === ".webp") {
        sharpInstance = sharpInstance.webp({ quality: optimize.webp });
      } else if (ext === ".avif") {
        sharpInstance = sharpInstance.avif({ quality: optimize.avif });
      }
    }

    await sharpInstance.toFile(outputPath);
  };

  // 画像を変換して src と WordPress ディレクトリの両方に出力する関数
  const convertAndCopyImages = async sourcePath => {
    if (!/\.(png|jpe?g)$/.test(sourcePath)) {
      return;
    }

    const relativePath = relative(paths.srcImagesDir, sourcePath);
    const relativeDir = path.dirname(relativePath);
    const base = path.basename(sourcePath, path.extname(sourcePath));
    const ext = path.extname(sourcePath);

    // src 用の出力先ディレクトリ
    const srcOutputDir = relativeDir === "." ? paths.srcImagesDir : resolve(paths.srcImagesDir, relativeDir);
    // WordPress用の出力先ディレクトリ
    const wpOutputDir = relativeDir === "." ? paths.wpImagesDir : resolve(paths.wpImagesDir, relativeDir);

    // 出力先ディレクトリが存在しない場合は作成
    if (!fs.existsSync(srcOutputDir)) {
      fs.mkdirSync(srcOutputDir, { recursive: true });
    }
    if (!fs.existsSync(wpOutputDir)) {
      fs.mkdirSync(wpOutputDir, { recursive: true });
    }

    const srcWebpPath = resolve(srcOutputDir, `${base}.webp`);
    const srcAvifPath = resolve(srcOutputDir, `${base}.avif`);
    const wpWebpPath = resolve(wpOutputDir, `${base}.webp`);
    const wpAvifPath = resolve(wpOutputDir, `${base}.avif`);
    const wpOriginalPath = resolve(wpOutputDir, `${base}${ext}`);

    try {
      if (imageFormat === "webp" || imageFormat === "both") {
        // src に出力（最適化付き）
        await optimizeImage(sourcePath, srcWebpPath, "webp");
        console.log(`[image-plugin] Converted: ${relativePath} -> src/assets/images/${relativeDir ? relativeDir + "/" : ""}${base}.webp`);
        // WordPress ディレクトリにも出力（最適化付き）
        await optimizeImage(sourcePath, wpWebpPath, "webp");
        console.log(`[image-plugin] Converted: ${relativePath} -> wordpress/themes/${THEME_NAME}/assets/images/${relativeDir ? relativeDir + "/" : ""}${base}.webp`);
      }

      if (imageFormat === "avif" || imageFormat === "both") {
        // src に出力（最適化付き）
        await optimizeImage(sourcePath, srcAvifPath, "avif");
        console.log(`[image-plugin] Converted: ${relativePath} -> src/assets/images/${relativeDir ? relativeDir + "/" : ""}${base}.avif`);
        // WordPress ディレクトリにも出力（最適化付き）
        await optimizeImage(sourcePath, wpAvifPath, "avif");
        console.log(`[image-plugin] Converted: ${relativePath} -> wordpress/themes/${THEME_NAME}/assets/images/${relativeDir ? relativeDir + "/" : ""}${base}.avif`);
      }

      // 元画像もコピーする設定の場合（WordPress ディレクトリのみ、最適化付き）
      if (copyOriginal) {
        await optimizeImage(sourcePath, wpOriginalPath, ext.slice(1));
        console.log(`[image-plugin] Copied original: ${relativePath} -> wordpress/themes/${THEME_NAME}/assets/images/${relativeDir ? relativeDir + "/" : ""}${base}${ext}`);
      }
    } catch (err) {
      console.error(`[image-plugin] Conversion error for ${sourcePath}:`, err);
      // ビルド時は握りつぶさず失敗させる（画像が欠けたまま本番ビルドが成功するのを防ぐ）
      if (!isDev) {
        throw err;
      }
    }
  };

  // 既存画像の一括変換・コピーを行う関数（開発・ビルドの両方から呼ばれる。ファイル監視は行わない）
  // 戻り値: { srcImagesDir, wpImagesDir, copyToWordPress, conversionPromise } / ソースディレクトリが無ければ null
  const convertExistingImages = () => {
    // rootは既にsrcディレクトリなので、そのままassets/imagesを追加
    const srcImagesDir = resolve(root, "assets/images");
    const wpImagesDir = resolve(themeDir, "assets/images");

    console.log(`[image-plugin] Initializing image processing...`);
    console.log(`[image-plugin] srcImagesDir: ${srcImagesDir}`);
    console.log(`[image-plugin] wpImagesDir: ${wpImagesDir}`);
    console.log(`[image-plugin] isDev: ${isDev}`);

    if (!fs.existsSync(srcImagesDir)) {
      console.warn(`[image-plugin] Source images directory not found: ${srcImagesDir}`);
      return null;
    }

    if (!fs.existsSync(wpImagesDir)) {
      fs.mkdirSync(wpImagesDir, { recursive: true });
      console.log(`[image-plugin] Created directory: ${wpImagesDir}`);
    }

    // 既存のPNG/JPEG画像を変換
    const existingImages = globSync(`${toPosixPath(srcImagesDir)}/**/*.{png,jpg,jpeg}`);
    console.log(`[image-plugin] Found ${existingImages.length} existing images to convert`);

    // Promise.allで並列処理（エラー処理は呼び出し側に委ねる: devはログのみ、ビルドは失敗させる）
    const conversionPromise = Promise.all(existingImages.map(filePath => convertAndCopyImages(filePath)));

    // 変換対象外の画像（svg, gif, 単体webp）をWordPressディレクトリにコピー
    const copyToWordPress = filePath => {
      if (/\.(png|jpe?g)$/.test(filePath)) return;
      // 同名の png/jpg が存在する webp は変換で生成されるためコピー対象外
      // （png/jpg 未変換の単体 webp ソースのみコピーする）
      if (/\.webp$/.test(filePath)) {
        const base = filePath.replace(/\.webp$/, "");
        if (fs.existsSync(`${base}.png`) || fs.existsSync(`${base}.jpg`) || fs.existsSync(`${base}.jpeg`)) {
          return;
        }
      }
      const relativePath = relative(srcImagesDir, filePath);
      const outputDir = resolve(wpImagesDir, dirname(relativePath));
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      fs.copyFileSync(filePath, resolve(outputDir, basename(filePath)));
      console.log(`[image-plugin] Copied: ${relativePath}`);
    };

    // 既存のSVG/GIF/単体WebP画像をコピー
    const existingCopyTargets = globSync(`${toPosixPath(srcImagesDir)}/**/*.{svg,gif,webp}`);
    console.log(`[image-plugin] Found ${existingCopyTargets.length} existing SVG/GIF/WebP images to copy`);
    existingCopyTargets.forEach(copyToWordPress);

    return { srcImagesDir, wpImagesDir, copyToWordPress, conversionPromise };
  };

  // ファイル監視を開始する関数（開発環境のみ呼ばれる）
  const startImageWatchers = ({ srcImagesDir, copyToWordPress }) => {
    // PNG/JPEG変換の監視
    const convertWatcher = watch(`${toPosixPath(srcImagesDir)}/**/*.{png,jpg,jpeg}`, {
      persistent: true,
      ignoreInitial: true,
    });

    convertWatcher.on("add", async filePath => {
      await convertAndCopyImages(filePath);
    });

    convertWatcher.on("change", async filePath => {
      await convertAndCopyImages(filePath);
    });

    // SVG/GIF/単体WebPの監視（同名 png/jpg を持つ webp は copyToWordPress 側でスキップ）
    watch(`${toPosixPath(srcImagesDir)}/**/*.{svg,gif,webp}`, { persistent: true, ignoreInitial: true })
      .on("add", copyToWordPress)
      .on("change", copyToWordPress);
  };

  // 開発環境での画像処理を初期化する関数（一括変換 + ファイル監視）
  const initDevImageProcessing = () => {
    const result = convertExistingImages();
    if (!result) return;
    // dev では変換エラーで開発サーバーを止めない（ログのみ）
    result.conversionPromise.catch(err => {
      console.error(`[image-plugin] Error processing existing images:`, err);
    });
    startImageWatchers(result);
  };

  return {
    name: "convert-and-optimize-images",
    enforce: "pre",
    async buildStart() {
      if (isDev) {
        initDevImageProcessing();
      } else {
        // ビルド時も初期一括変換を実行する（監視はしない）。
        // 変換完了を待たずにビルドが進むと画像が欠けるため、完了を待機する。
        const result = convertExistingImages();
        if (result && result.conversionPromise) {
          await result.conversionPromise;
        }
      }
    },
    configureServer() {
      if (isDev) {
        initDevImageProcessing();
      }
    },
    async transform(src, id) {
      // 開発環境: PNG/JPEGを変換
      if (isDev && /\.(png|jpe?g)$/.test(id)) {
        const absolutePath = path.isAbsolute(id) ? id : resolve(projectRoot, id);
        if (fs.existsSync(absolutePath)) {
          await convertAndCopyImages(absolutePath);
        }
        return null;
      }
    },
  };
}
