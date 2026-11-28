import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readLegalPage(path: string) {
  return readFileSync(resolve(repositoryRoot, path), 'utf8');
}

test('GitHub Pages entry point links to the app legal documents', () => {
  const index = readLegalPage('docs/index.html');

  assert.match(index, /<meta name="viewport"/);
  assert.match(index, /ふわっと。/);
  assert.match(index, /href="\.\/terms\/"/);
  assert.match(index, /href="\.\/privacy\/"/);
});

test('published privacy policy documents local data, analytics, and purchases', () => {
  const privacy = readLegalPage('docs/privacy/index.html');

  assert.match(privacy, /<meta name="viewport"/);
  assert.match(privacy, /プライバシーポリシー/);
  assert.match(privacy, /最終更新日：2026年11月28日/);
  assert.match(privacy, /端末内に保存/);
  assert.match(privacy, /PostHog US\s+Cloud/);
  assert.match(privacy, /RevenueCat/);
  assert.match(privacy, /マイクとモーション/);
  assert.match(privacy, /音声認識はOS標準の音声認識機能/);
  assert.match(
    privacy,
    /開発者が音声、録音、文字起こし、モーション値を保存、分析、収集することはありません/,
  );
  assert.doesNotMatch(privacy, /近接センサー|近接情報/);
  assert.match(privacy, /タイトルと日時の候補/);
  assert.match(privacy, /AndroidとiOSの間で購入権利は共有されません/);
  assert.match(privacy, /href="\.\.\/terms\/"/);
});

test('published terms document the lifetime Pro purchase contract', () => {
  const terms = readLegalPage('docs/terms/index.html');

  assert.match(terms, /<meta name="viewport"/);
  assert.match(terms, /利用規約/);
  assert.match(terms, /最終更新日：2026年11月28日/);
  assert.match(terms, /同時に6件まで/);
  assert.match(terms, /買い切り商品/);
  assert.match(terms, /忘れたくないことを無制限に追加できる/);
  assert.doesNotMatch(terms, /アクティブなリマインダー件数を無制限/);
  assert.match(terms, /自動更新はありません/);
  assert.match(terms, /同じストアアカウントで復元/);
  assert.match(terms, /返金や取消/);
  assert.match(
    terms,
    /OSのバックアップ設定によっては端末バックアップの対象となり、復元される場合があります/,
  );
  assert.match(terms, /href="\.\.\/privacy\/"/);
});

test('privacy disclosures cover OS surfaces, voice preparation, and purchase startup traffic', () => {
  for (const path of [
    'docs/privacy/index.html',
    'docs/PRIVACY_POLICY.md',
    'src/features/settings/screens/SettingsScreen.tsx',
  ]) {
    const privacy = readLegalPage(path);
    for (const disclosure of [
      /ロック画面/,
      /Widget/,
      /タイトルと日時の候補/,
      /認識用モデルのダウンロード/,
      /イベントの発生時刻/,
      /購入前でもアプリ起動時/,
      /分析への同意とは別/,
      /IPアドレス/,
      /HTTPS/,
      /Rion（個人開発）/,
      /rion\.developer\.apps@gmail\.com/,
      /同意の撤回だけでは収集済みイベントは削除されません/,
      /https:\/\/posthog.com\/privacy/,
      /https:\/\/www.revenuecat.com\/privacy/,
      /https:\/\/policies.google.com\/privacy/,
      /https:\/\/www.apple.com\/legal\/privacy\/jp\//,
    ]) {
      assert.match(privacy, disclosure, `${path}: ${disclosure}`);
    }
    assert.doesNotMatch(
      privacy,
      /文字起こしは追加画面のタイトル欄にだけ|文字起こしは追加画面にだけ/,
    );
  }
});

test('web and in-app terms explain voice confirmation, expired data, and statutory liability', () => {
  for (const path of [
    'docs/terms/index.html',
    'src/features/settings/screens/SettingsScreen.tsx',
  ]) {
    const terms = readLegalPage(path);
    assert.match(terms, /2026年11月28日/);
    assert.doesNotMatch(terms, /2026年11月17日/);
    assert.match(terms, /認識結果と日時を確認/);
    assert.match(terms, /予定日時を過ぎたリマインダーも、手動で削除するまで端末内に保持/);
    assert.doesNotMatch(terms, /自動整理は初期状態でON/);
    assert.match(terms, /6件を超えて登録済みのデータを削除・非表示にはしません/);
    assert.match(terms, /消費者契約法/);
    assert.match(terms, /日本法に準拠/);
    assert.match(terms, /Rion（個人開発）/);
    assert.match(terms, /rion\.developer\.apps@gmail\.com/);
    assert.doesNotMatch(terms, /学生の個人開発者/);
  }
});

test('privacy disclosures stay aligned on store review, voice gesture, deletion, and wording', () => {
  for (const path of [
    'docs/privacy/index.html',
    'docs/PRIVACY_POLICY.md',
    'src/features/settings/screens/SettingsScreen.tsx',
  ]) {
    const privacy = readLegalPage(path);
    assert.match(privacy, /2026年11月28日/, path);
    assert.doesNotMatch(privacy, /2026年11月17日/, path);
    assert.match(privacy, /アプリ内ストアレビュー依頼の表示条件を判定するための状態/, path);
    assert.match(privacy, /初回利用日時/, path);
    assert.match(privacy, /依頼回数/, path);
    assert.match(privacy, /アプリ内ストアレビュー依頼を呼び出したきっかけ・累計回数/, path);
    assert.match(privacy, /左右に傾けて音声入力/, path);
    assert.doesNotMatch(privacy, /通常のマイクボタン/, path);
    assert.match(privacy, /AndroidではOS設定から本アプリのストレージを消去/, path);
    assert.match(privacy, /iOSでは「アプリを削除」で削除/, path);
    assert.match(privacy, /PostHog US\s+Cloud/, path);
    assert.doesNotMatch(privacy, /PostHog\s*の\s*US\s*Cloud/, path);
  }
});

test('supporting docs reflect hybrid voice recognition, past-reminder retention, and fuwatto URLs', () => {
  const thirdPartyLicenses = readLegalPage('docs/THIRD_PARTY_LICENSES.md');
  assert.match(thirdPartyLicenses, /requiresOnDeviceRecognition: false/);
  assert.doesNotMatch(thirdPartyLicenses, /requiresOnDeviceRecognition: true/);
  assert.doesNotMatch(thirdPartyLicenses, /no network speech/);

  const googlePlayDataReview = readLegalPage('docs/GOOGLE_PLAY_DATA_REVIEW.md');
  assert.match(googlePlayDataReview, /手動削除するまで端末内に保持/);
  assert.match(googlePlayDataReview, /store_review_state/);
  assert.doesNotMatch(googlePlayDataReview, /初期ON、予定日の終了後に起動時などの整理処理で削除/);

  const storeListingDraft = readLegalPage('docs/STORE_LISTING_DRAFT.md');
  assert.doesNotMatch(storeListingDraft, /マイクボタンでの日本語音声入力/);

  const androidReleaseReadiness = readLegalPage('docs/ANDROID_RELEASE_READINESS.md');
  const currentPolicyStart = androidReleaseReadiness.indexOf(
    '### 現行の掲載情報・Data Safety・プライバシーポリシー',
  );
  const currentPolicyEnd = androidReleaseReadiness.indexOf('### Play Consoleの追加確認');
  assert.ok(currentPolicyStart !== -1 && currentPolicyEnd > currentPolicyStart);
  const currentPolicySection = androidReleaseReadiness.slice(currentPolicyStart, currentPolicyEnd);
  assert.match(currentPolicySection, /https:\/\/rion0918\.github\.io\/fuwatto\/privacy\//);
  assert.match(currentPolicySection, /https:\/\/rion0918\.github\.io\/fuwatto\/terms\//);
  assert.doesNotMatch(currentPolicySection, /github\.io\/pop-reminder/);

  const adrReadme = readLegalPage('docs/adr/README.md');
  assert.match(adrReadme, /https:\/\/github\.com\/rion0918\/fuwatto\/discussions\/categories\/adr/);
  assert.doesNotMatch(adrReadme, /github\.com\/rion0918\/pop-reminder/);
});
