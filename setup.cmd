@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo.
echo === 搭乗記録 開発環境のセットアップ ===
echo.
where git >nul 2>&1
if errorlevel 1 (
  echo [NG] Git が見つかりません。https://git-scm.com/download/win から入れてから、もう一度実行してください。
  goto :fail
)
where node >nul 2>&1
if errorlevel 1 (
  echo [NG] Node.js が見つかりません。https://nodejs.org/ja から LTS 版を入れてから、もう一度実行してください。
  goto :fail
)
echo [1/4] GitHub のリポジトリとつなぐ
if not exist .git (
  git init -q -b main
  git remote add origin https://github.com/Luca3YT/flight-log.git
  git fetch -q origin
  if errorlevel 1 ( echo [NG] GitHub から履歴を取れませんでした。ネットにつながっているか確認してください。 & goto :fail )
  git reset -q origin/main
  git branch -q -u origin/main
)
git status >nul 2>&1
if errorlevel 1 (
  echo   このフォルダを安全なリポジトリとして登録します
  git config --global --add safe.directory "%CD:\=/%"
  git status >nul 2>&1
  if errorlevel 1 ( echo [NG] git status が失敗します。 & git status & goto :fail )
)
echo [2/4] 開発用パッケージを入れる（npm install）
call npm install
if errorlevel 1 goto :fail
echo [3/4] テスト用ブラウザを入れる（初回だけ数分かかります）
call npx playwright install chromium
if errorlevel 1 goto :fail
echo [4/4] 点検とテスト
call npm test
if errorlevel 1 goto :fail
echo.
echo セットアップ完了。claude を起動すれば作業を始められます。
pause
exit /b 0
:fail
echo.
echo セットアップが途中で止まりました。上のメッセージを確認してください。
pause
exit /b 1
