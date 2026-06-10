# 🎤 Karaoke 3D Online

Hệ thống karaoke trực tuyến tích hợp sân khấu 3D với avatar ca sĩ phản ứng theo giọng hát thời gian thực, phát video YouTube và chấm điểm tự động. Chạy trên Node.js (Express) với frontend Vanilla JS thuần.

---

## 📋 Mục lục

- [Tính năng](#tính-năng)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Cấu trúc project](#cấu-trúc-project)
- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Hướng dẫn chạy](#hướng-dẫn-chạy)
- [Biến môi trường](#biến-môi-trường)
- [Cấu hình](#cấu-hình)
- [Phím tắt](#phím-tắt)
- [Cơ chế chấm điểm](#cơ-chế-chấm-điểm)

---

## ✨ Tính năng

- **Sân khấu 3D**: Render sân khấu và 2 avatar ca sĩ bằng Three.js với model `.glb`, có animation phản ứng theo giọng hát.
- **Tích hợp YouTube**: Tìm kiếm, phát video karaoke YouTube qua IFrame API + YouTube Data API v3.
- **Hàng chờ nhạc**: Thêm bài vào queue, tự động phát bài tiếp theo sau khi kết thúc.
- **Nhận diện giọng hát**: Phân biệt 2 ca sĩ riêng biệt qua microphone, sử dụng kỹ thuật calibration voice profile (pitch + RMS).
- **Chấm điểm tự động**: Tính điểm cuối bài dựa trên 4 tiêu chí: cao độ, nhịp điệu, năng lượng và ổn định giọng.
- **Giao diện responsive**: Panel điều khiển có thể thu gọn/mở rộng, hỗ trợ phím tắt bàn phím.

---

## 🛠 Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Backend | Node.js + Express |
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES Modules) |
| 3D Rendering | [Three.js](https://threejs.org/) v0.160.0 |
| Audio Processing | Web Audio API |
| Video | YouTube IFrame API + YouTube Data API v3 |
| 3D Models | GLTF/GLB format |
| Kiến trúc | Event-driven (EventBus pattern) |

> **Không sử dụng framework frontend** — toàn bộ client-side viết bằng Vanilla JS thuần, không có bước build.

---

## 📁 Cấu trúc project

```
├── server.js                     # Express server: serve static files + API proxy YouTube
├── .env                          # Biến môi trường (YOUTUBE_API_KEY, PORT) — KHÔNG commit
├── .env.example                  # Template mẫu cho .env
├── package.json
└── public/
    ├── index.html                    # Entry point, định nghĩa importmap cho Three.js
    ├── css/
    │   └── style.css                 # Toàn bộ stylesheet (layers, panel, modal, toast...)
    ├── assets/
    │   └── models/
    │       ├── stage.glb             # Model sân khấu (fallback)
    │       ├── stage1.glb            # Model sân khấu chính (~10MB)
    │       ├── singer1.glb           # Avatar Ca sĩ 1
    │       └── singer2.glb           # Avatar Ca sĩ 2
    └── js/
        ├── config.js                 # Cấu hình toàn cục (audio, stage, scoring, UI)
        ├── main.js                   # Điểm khởi động ứng dụng (KaraokeApp)
        ├── EventBus.js               # Pub/Sub event system
        ├── audio/
        │   ├── AudioEngine.js        # Quản lý microphone, Web Audio API, vòng lặp phân tích
        │   ├── PitchDetector.js      # Phát hiện cao độ bằng autocorrelation
        │   ├── SpeakerDetector.js    # Nhận diện và calibration giọng 2 ca sĩ
        │   └── VoiceActivityDetector.js  # Phát hiện khi nào có giọng hát (VAD)
        ├── score/
        │   └── ScoreEngine.js        # Thu thập và tính điểm cuối bài
        ├── stage/
        │   ├── ThreeStage.js         # Khởi tạo scene Three.js, camera, ánh sáng, load model
        │   ├── AvatarController.js   # Điều khiển animation và chuyển động avatar theo giọng hát
        │   └── ModelLoader.js        # Load file .glb, tạo fallback geometry
        ├── ui/
        │   ├── ControlPanel.js       # Render và xử lý toàn bộ panel điều khiển
        │   ├── KeyboardShortcut.js   # Đăng ký phím tắt
        │   └── SfxManager.js        # Quản lý hiệu ứng âm thanh UI
        └── youtube/
            ├── YoutubePlayer.js      # Wrapper YouTube IFrame API
            ├── YoutubeSearch.js      # Gọi API tìm kiếm video (/api/youtube/search)
            ├── SuggestService.js     # Gợi ý từ khóa tìm kiếm
            └── VideoQueue.js         # Quản lý hàng chờ bài hát
```

---

## 🏗 Kiến trúc hệ thống

Project sử dụng **kiến trúc hướng sự kiện** — tất cả các module giao tiếp với nhau qua `EventBus` (singleton pub/sub), không phụ thuộc trực tiếp lẫn nhau. `KaraokeApp` (`main.js`) đóng vai trò điều phối trung tâm.

```
                        ┌─────────────────┐
                        │   KaraokeApp    │  ← điều phối toàn bộ
                        │   (main.js)     │
                        └────────┬────────┘
                                 │  EventBus (pub/sub)
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
   ┌──────▼──────┐       ┌───────▼──────┐      ┌───────▼──────┐
   │  YouTube    │       │    Audio     │      │    Stage     │
   │  Layer      │       │    Layer     │      │    Layer     │
   │             │       │              │      │              │
   │ YoutubePlayer│      │ AudioEngine  │      │ ThreeStage   │
   │ YoutubeSearch│      │ PitchDetector│      │ AvatarCtrl   │
   │ VideoQueue  │       │ SpeakerDetect│      │ ModelLoader  │
   │ SuggestSvc  │       │ VADetector   │      └──────────────┘
   └─────────────┘       └──────────────┘
                                 │
                        ┌────────▼────────┐
                        │  ScoreEngine    │
                        │  (chấm điểm)   │
                        └─────────────────┘
```

**Các luồng sự kiện chính:**

- `ui:search-submit` → `YoutubeSearch` → `youtube:search-results` → `ControlPanel`
- `youtube:select-video` → `YoutubePlayer.loadVideo()` → `youtube:state: playing` → `score:start`
- `audio:data` → `ScoreEngine.addAudioFrame()` + `singer:active` → `AvatarController.setVoiceData()`
- `youtube:ended` → `ScoreEngine.finish()` → `score:final` → modal kết quả

---

## 🚀 Hướng dẫn chạy

### Yêu cầu

- **Node.js** v18 trở lên
- **YouTube Data API v3 key** (xem hướng dẫn bên dưới)
- Trình duyệt hiện đại hỗ trợ ES Modules (Chrome 89+, Firefox 88+, Edge 89+)
- Microphone (để dùng tính năng hát & chấm điểm)

### 1. Cài dependencies

```bash
npm install
```

### 2. Tạo file `.env`

Tạo file `.env` ở thư mục gốc (cùng cấp với `server.js`):

```env
YOUTUBE_API_KEY=your_youtube_api_key_here
PORT=5500
```

> Xem chi tiết cách lấy API key tại mục [Biến môi trường](#biến-môi-trường).

### 3. Chạy server

```bash
node server.js
```

Truy cập: `http://localhost:5500`

> **Lưu ý:** Tính năng microphone yêu cầu HTTPS hoặc `localhost`. Không mở file HTML trực tiếp qua `file://` — Web Audio API sẽ không hoạt động.

---

## 🔑 Biến môi trường

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `YOUTUBE_API_KEY` | ✅ | API key YouTube Data API v3 |
| `PORT` | Không | Port server (mặc định: `5500`) |

### Cách lấy YouTube Data API v3 Key

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/)
2. Tạo project mới hoặc chọn project có sẵn
3. Vào **APIs & Services → Library**, tìm và bật **YouTube Data API v3**
4. Vào **APIs & Services → Credentials**, chọn **Create Credentials → API Key**
5. Sao chép key và dán vào file `.env`

> **Lưu ý bảo mật:** Không commit file `.env` lên Git. Thêm `.env` vào `.gitignore`.

### API endpoint

`server.js` chỉ expose một endpoint duy nhất để proxy tìm kiếm YouTube:

```
GET /api/youtube/search?q=<từ khóa>
```

Server tự động thêm từ khóa `karaoke` vào query nếu từ khóa chưa có. Kết quả trả về tối đa 8 video, lọc `videoEmbeddable=true`, ưu tiên nội dung tiếng Việt (`regionCode=VN`).

---

## ⚙️ Cấu hình

Toàn bộ cấu hình tập trung trong `js/config.js`:

### Audio

```js
audio: {
  preferredInputKeyword: "K300",    // Ưu tiên soundcard có tên chứa "K300"
  fftSize: 2048,                    // Độ phân giải FFT
  minRmsForVoice: 0.008,            // Ngưỡng nhạy mic (tăng nếu mic kém)
  silenceTimeoutMs: 700,            // Thời gian im lặng trước khi tắt VAD
  analysisIntervalMs: 33,           // ~30fps phân tích audio
  calibrationTargetSamples: 90      // Số mẫu cần để hoàn tất calibration
}
```

### Stage (3D)

```js
stage: {
  modelPaths: {
    stage: "./assets/models/stage.glb",
    singer1: "./assets/models/singer1.glb",
    singer2: "./assets/models/singer2.glb"
  },
  transforms: {
    singer1: { position: { x: -3, y: -1.5, z: 0 }, scale: { x: 0.5, ... } },
    singer2: { position: { x:  3, y: -1.5, z: 0 }, scale: { x: 0.5, ... } }
  }
}
```

### Chấm điểm

```js
scoring: {
  pitchWeight: 0.22,       // Trọng số cao độ
  rhythmWeight: 0.23,      // Trọng số nhịp điệu
  stabilityWeight: 0.2,    // Trọng số ổn định
  energyWeight: 0.35,      // Trọng số năng lượng
  friendlyBonus: 8,        // Điểm cộng thêm (friendly mode)
  baseScoreWhenSinging: 70 // Điểm nền tối thiểu khi có hát
}
```

---

## ⌨️ Phím tắt

| Phím | Hành động |
|---|---|
| `Enter` | Tìm kiếm bài hát |
| `M` | Bật / tắt Microphone |
| `Esc` | Thu gọn / mở panel điều khiển |

---

## 🎯 Cơ chế chấm điểm

Điểm số được tính **ngầm** trong suốt bài hát qua `ScoreEngine`, và chỉ hiển thị khi bài kết thúc.

**4 tiêu chí** (tổng 100 điểm):

| Tiêu chí | Trọng số | Mô tả |
|---|---|---|
| Cao độ (Pitch) | 22% | Độ ổn định và hợp lệ của cao độ qua autocorrelation |
| Nhịp điệu (Rhythm) | 23% | Tỉ lệ thời gian có giọng so với cả bài (voiceRatio) |
| Năng lượng (Energy) | 35% | Độ to của giọng hát so với ngưỡng chuẩn (RMS) |
| Ổn định (Stability) | 20% | Độ đều của RMS và pitch trong suốt bài |

**Cơ chế thân thiện:** Nếu người hát có đủ giọng, điểm nền tối thiểu là 70/100. Điểm bị giới hạn tối đa ≤ 25 nếu gần như không có giọng hát.

---

## 📝 Ghi chú kỹ thuật

- **Nhận diện 2 ca sĩ**: `SpeakerDetector` dùng khoảng cách Euclidean trên không gian `(log pitch, RMS)` so với voice profile đã calibrate để phân biệt giọng Singer 1 và Singer 2. Profile được lưu vào `localStorage`.
- **Fallback model**: Nếu file `.glb` không load được, hệ thống tự tạo geometry đơn giản (hình trụ cho avatar, mặt phẳng cho sân khấu) để UI không bị vỡ.
- **Root motion lock**: `AvatarController` khóa lại transform gốc của `animationRoot` sau mỗi frame để tránh model bị trôi do root motion trong animation clip.
- **Import map**: Three.js được load từ CDN (`unpkg.com`) thông qua `<script type="importmap">` trong `index.html`, không cần bundler.
