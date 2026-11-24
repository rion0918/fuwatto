# ADR 0010: Android リリースビルドで R8（DEX 最適化・難読化・縮小）を有効化する

Date: 2026-11-24

## Status

Accepted

採用確認: ユーザーがチャットで 1.1.1 リリース準備および採用を承認。

## Context

Google Play Console の製品版 `1.1.0 (60)` において、以下の品質警告とサイズ課題が発生している。

1. **DEX コードの最適化がしきい値を下回っています**: 難読化率 `3%`・最適化率 `-`・縮小率 `-`（Play Console の認知度や公開機能に影響するしきい値 `25%` を下回り、修正期限の警告対象）。
2. **大きなインストールサイズ**: 非圧縮 DEX 合計が `57.5 MB` に達しており、新規インストールサイズ `102 MB`（推定ダウンロード `56` 秒）の一因になっている。

一方、`react-native-android-widget` と `@shopify/react-native-skia` はランタイムで `Resources.getIdentifier()` による動的リソース参照を行うため、リソース縮小を同時に有効化すると必要な drawable / layout リソースが誤削除されるリスクがある。また、`react-native-android-widget` はライブラリ側で `consumerProguardFiles` を同梱していないため、AppWidgetProvider や WorkManager からリフレクション起動されるクラス群が R8 によって削除・難読化されないよう明示的に保持する必要がある。

## Decision

1. **R8 の有効化 (`android/gradle.properties`)**:
   - `android.enableMinifyInReleaseBuilds=true` を設定し、リリースビルドで R8 によるコード縮小・最適化・難読化を有効にする。
   - `android.enableShrinkResourcesInReleaseBuilds=false` を明示維持し、`Resources.getIdentifier()` を使う Widget / Skia リソースの誤削除を防ぐ。
2. **最適化対応 ProGuard ルールの採用 (`android/app/build.gradle`)**:
   - `getDefaultProguardFile("proguard-android.txt")`（`-dontoptimize` を含む）から `getDefaultProguardFile("proguard-android-optimize.txt")` へ切り替える。
3. **最小限の Keep ルール (`android/app/proguard-rules.pro`)**:
   - `PopReminderWidget`、および `react-native-android-widget` の公開入口・WorkManager 起動対象（`RNWidgetProvider`, `RNWidgetBackgroundTaskWorker`, `RNWidgetCollectionService`, `RNWidgetImageProvider`, `RNWidgetConfigurationActivity`, `AndroidWidgetModule`, `AndroidWidgetPackage`, `HeadlessJsTaskWorker` コンストラクタ）を保持する。
   - 難読化率・最適化率を下げる `-dontobfuscate`・`-dontoptimize` や広範な `-keep class **` は使用しない。
4. **AAB 検証の強化 (`scripts/verify-android-aab.mjs`)**:
   - Moonshine モデルの整合性検査に加えて、AAB 内に `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map` が非空で含まれること、および `base/dex/*.dex` の非圧縮サイズ合計を確認する。

見送った選択肢:

- **`proguard-android.txt` のまま `minifyEnabled` のみ有効化する案**: `-dontoptimize` により Play Console の最適化率改善や十分な DEX 縮小が得られないため見送った。
- **`android.enableShrinkResourcesInReleaseBuilds=true` を同時に有効化する案**: `Resources.getIdentifier()` に対する `keep.xml` の網羅確認前の有効化は描画・アイコン欠損リスクが高いため、まずは DEX 最適化と切り分けて見送った。
- **アプリや主要ライブラリ全体を広範な `-keep` で保護する案**: 難読化率 25% 未満の警告が解消できず、DEX 削減効果も薄れるため見送った。

## Consequences

- 利点:
  - Play Console の「DEX コードの最適化」警告（25% 未満）の解消と、DEX サイズ・ダウンロードサイズの削減が期待できる。
  - AAB 内に `proguard.map` が自動同梱され、Play Console 上のクラッシュ難読化解除とリリース検査（`verify:android:aab`）の両方が機能する。
- 受け入れる欠点:
  - Android Release ビルドの実行時間が増加する。
  - リフレクション・JNI・動的リソース参照を行うネイティブ依存関係を追加・更新する際は、ProGuard ルールの確認と Release 相当ビルドでの実機 QA が必須になる。

関連資料:

- [リリース手順: Android 内部テストから iOS まで](../RELEASE_ANDROID_IOS.md)
- [Development Build QA チェックリスト](../QA_DEVELOPMENT_BUILD.md)
- [Android 公開前の最終確認](../ANDROID_RELEASE_READINESS.md)
