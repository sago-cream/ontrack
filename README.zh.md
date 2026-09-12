<h1 align="center">OnTrack</h1>

<p align="center">
  <a href="https://ontrack.hsichen.dev">ontrack.hsichen.dev</a> — 追求速度與自動化的台鐵App | <a href="./README.md">English</a>
</p>

<p align="center">
  <img alt="demo" src="https://raw.githubusercontent.com/sago-cream/ontrack/main/apps/web/public/demo.png" width="280" />
</p>

## 功能

- 自動偵測您的所在車站
- 依搭乘習慣預測路線
- 打開 App 即可掌握即時班次與延誤資訊
- 班次與抵達時間快速分享

## 專案結構

- `apps/ios`：iOS App、Xcode 專案與 Xcode 建置資源
- `apps/web`：網頁版與公開網站素材
- `apps/worker`：Cloudflare Worker 部署包裝
- `assets/screenshots`：由 `bun run ios:screenshots` 產生的 App Store 截圖

## 官方版本

官方 OnTrack App 與網站由 Hsi 發佈於
[ontrack.hsichen.dev](https://ontrack.hsichen.dev)。Fork 版本請使用自己的 App
名稱、bundle identifier、圖示、截圖、支援連結、隱私權政策與部署端點。

## 安裝

iPhone 與 iPad 使用者可於
[App Store](https://apps.apple.com/tw/app/ontrack/id6784708806) 下載 OnTrack。

Android 使用者可透過
[ontrack.hsichen.dev/app](https://ontrack.hsichen.dev/app) 安裝網頁版。

### Android（Chrome）

1. 用 Chrome 開啟 [ontrack.hsichen.dev/app](https://ontrack.hsichen.dev/app)
2. 點右上角 ⋮ 選單
3. 選擇「加到主畫面」或「安裝應用程式」

## 開發

安裝依賴：

```sh
bun install
```

啟動網頁版：

```sh
bun run dev
```

若要讓開發用網頁版指向其他後端，設定 `ONTRACK_API_ORIGIN`：

```sh
ONTRACK_API_ORIGIN=https://example.com bun run dev
```

建置網頁版與 Worker：

```sh
bun run build
```

填入 `apps/worker/wrangler.jsonc` 的 D1 佔位值後，部署開發用 Worker：

```sh
bun run deploy:dev
```

執行 lint：

```sh
bun run lint
```

在連接的 iPhone 上執行 iOS App：

```sh
bun run ios
```

建置 iOS App、開啟可用的模擬器，並安裝及啟動 App：

```sh
bun run ios:simulator
```

若只要編譯 iOS App、不開啟模擬器，請執行 `bun run ios:build`。

若要讓 iOS 腳本指向其他後端，設定 `IOS_API_ORIGIN`：

```sh
IOS_API_ORIGIN=https://example.com bun run ios
```

## 自行部署

OnTrack 透過 Cloudflare Worker 讀取 TDX 公開鐵路資料。已追蹤的
`apps/worker/wrangler.jsonc` 是適合公開的開發設定，D1 值為佔位值。若要部署
fork，請使用自己的基礎設施與憑證。

1. 建立自己的 Cloudflare D1 資料庫。
2. 複製 production 設定範本：

```sh
cp apps/worker/wrangler.production.example.jsonc apps/worker/wrangler.production.jsonc
```

3. 在被 git 忽略的 `apps/worker/wrangler.production.jsonc` 裡填入你的
   production route 與 D1 `database_id`。
4. 在 production 設定中把 `CORS_ALLOWED_ORIGINS` 設為你的網頁版 origin。
5. 視需要設定 Worker secrets：

```sh
wrangler secret put TDX_CLIENT_ID --config apps/worker/wrangler.production.jsonc
wrangler secret put TDX_CLIENT_SECRET --config apps/worker/wrangler.production.jsonc
wrangler secret put REFRESH_SECRET --config apps/worker/wrangler.production.jsonc
```

6. 部署：

```sh
bun run deploy
```

官方維護者也使用被 git 忽略的 production 設定，因此正式部署不需要修改已追蹤的公開設定。

TDX 憑證在開發時不是必要的；未設定時 Worker 會 fallback 到 Visitor Mode。

iOS 發佈請使用自己的 Apple Developer 帳號、bundle identifier、App Store listing、支援網址、隱私權政策與 app 內購買項目。

## 貢獻

歡迎提出 issue 與 pull request。設定方式與專案界線請見
[CONTRIBUTING.md](./CONTRIBUTING.md)。

## 授權

原始碼使用 MIT License。OnTrack 名稱、App 圖示、logo、截圖、App Store listing
素材、網域與其他品牌資產不授權重用。詳見 [BRAND.md](./BRAND.md)。
