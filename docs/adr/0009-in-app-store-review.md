# ADR 0009: アプリ内ストアレビュー依頼の設計と表示条件

Date: 2026-11-24

## Status

Accepted

採用確認: ユーザーがチャットで 1.1.1 リリース準備および採用を承認。

## Context

ストア上の評価数・平均評価を増やすため、満足度の高い利用タイミングでアプリ内ストアレビュー（Google Play In-App Review / iOS SKStoreReviewController）を呼ぶ仕組みを導入したい。

一方で、次のような制約とリスクがある。

- 追加直後の通知権限エラー表示や、初回「傾けて声メモ」オンボーディング直後にレビューダイアログを出すと体験を損ねる。
- リマインダータイトルや日時などの本文データを外部へ送らないプライバシー方針（`docs/ANALYTICS.md`）を維持する必要がある。
- 期限切れ（過去）リマインダーの整理削除は、日々の予定達成というより片付け操作であり、ポジティブな完了体験とは限らない。
- `AppSettings` 同期用テーブルではなく端末ローカルの状態だけで管理し、既存の DB マイグレーション版（version 8）と整合させる必要がある。

## Decision

`expo-store-review`（`~9.0.9`）を採用し、`store-review` 機能モジュールを追加して以下の条件・構造でアプリ内レビューを要求する。

1. **Hexagonal 構成の維持**
   - ドメイン層（`src/features/store-review/domain/storeReviewPolicy.ts`）は純粋な判定ロジックのみを持ち、外部 SDK や DB に依存しない。
   - アプリケーション層（`src/features/store-review/application/storeReviewService.ts`）はシリアライズキューで状態更新と表示要求を直列化し、リポジトリとゲートウェイの Port のみに依存する。
   - ネイティブ呼び出しは `src/lib/store-review/expoStoreReviewGateway.ts` に閉じ込め、`src/bootstrap/appServices.ts` で注入する。

2. **ローカル SQLite による状態保持**
   - `store_review_state` テーブル（`id`, `first_seen_at`, `success_count`, `prompt_count`, `last_prompt_at`）を `src/db/schema.ts` に追加し、`src/db/client.ts` の起動時互換初期化で `CREATE TABLE IF NOT EXISTS` を行う。
   - 起動時のデータ準備（`prepareAppData`）で `ensureFirstSeen()` を呼び、初回利用基準時刻を記録する。

3. **表示条件（`storeReviewPolicy.ts`）**
   - 累計成功アクション（`success_count`）が `3` 回以上
   - 初回利用（`first_seen_at`）から `48` 時間以上経過
   - 前回要求（`last_prompt_at`）から `90` 日以上経過
   - 累計要求回数（`prompt_count`）が `3` 回未満
   - 通知警告アラート・通知権限イントロ・傾けて声メモ較正中ではない（`eligibleToPrompt: true`）ときのみ要求する。

4. **発火タイミング**
   - **Quick Add の正常完了時**: 1 件以上リマインダーを作成し、警告アラートを出さずにシートを閉じたタイミングで `recordQuickAddCompleted` を呼ぶ。
   - **アクティブなバブルの削除完了時**: 期限前のアクティブなリマインダーを削除し、破裂モーションが終わったタイミングで `recordBubbleCompleted` を呼ぶ。期限切れリマインダーや一括削除では呼ばない。
   - `gateway.requestReview()` 呼び出し前に `prompt_count` と `last_prompt_at` を保存し、例外が起きてもリマインダー保存・削除操作を失敗させない。

5. **分析計測**
   - `store review requested` イベント（`trigger`, `prompt_count` のみ、本文なし）を許可イベント一覧（`analyticsService.ts`）と `docs/ANALYTICS.md` に追加する。

### 見送った代替案

- **独自「アプリを気に入りましたか？」ダイアログを挟む案（Review Gating）**: Google Play / Apple App Store のガイドラインで否定的な回答をレビュー導線から除外する実装が禁じられる・審査リスクがあるため不採用とし、OS 標準の Review API を直接呼ぶ。
- **`AppSettings` テーブルにレビュー状態列を追加する案**: 設定ドメインの責務（ユーザー設定とオンボーディング状態）から外れるため、専用の `store_review_state` テーブルに分離した。

## Consequences

- 利点:
  - 使い始めてすぐやエラー直後にレビュー依頼を出さず、達成感のある操作後に絞って評価獲得を狙える。
  - OS 側（Play In-App Review / StoreKit）のクォータ制限に加えてアプリ側でも 90 日クールダウン・最大 3 回上限を持つため、過剰な呼び出しを防げる。
  - ドメイン・アプリケーション・インフラが分離されているため、ネイティブ環境なしでもユニットテストと SQLite 結合テストで検証できる。
- 受け入れる欠点:
  - OS の仕様上、`requestReview()` を呼んでも実際にダイアログが表示されたかをアプリ側から観測できない（`prompt_count` は要求回数として扱う）。
  - `expo-store-review` のネイティブモジュールを含むため、実機検証には Development Build またはリリースビルドが必要。
- 関連資料:
  - [STORE_LISTING_DRAFT.md](../STORE_LISTING_DRAFT.md)
  - [ANALYTICS.md](../ANALYTICS.md)
