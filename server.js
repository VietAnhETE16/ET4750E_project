import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5500;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/youtube/search", async (req, res) => {
  try {
    const keyword = String(req.query.q || "").trim();

    if (!keyword) {
      return res.status(400).json({
        error: "Thiếu từ khóa tìm kiếm."
      });
    }

    if (!YOUTUBE_API_KEY) {
      return res.status(500).json({
        error: "Server chưa cấu hình YOUTUBE_API_KEY."
      });
    }

    const query =
      keyword.toLowerCase().includes("karaoke") ||
      keyword.toLowerCase().includes("beat")
        ? keyword
        : `${keyword} karaoke`;

    const url = new URL("https://www.googleapis.com/youtube/v3/search");

    url.searchParams.set("key", YOUTUBE_API_KEY);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", query);
    url.searchParams.set("type", "video");
    url.searchParams.set("videoEmbeddable", "true");
    url.searchParams.set("safeSearch", "moderate");
    url.searchParams.set("maxResults", "8");
    url.searchParams.set("regionCode", "VN");
    url.searchParams.set("relevanceLanguage", "vi");

    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();

      return res.status(response.status).json({
        error: "YouTube Data API lỗi.",
        detail: text
      });
    }

    const data = await response.json();

    const items = (data.items || [])
      .map((item) => {
        const videoId = item?.id?.videoId;
        const snippet = item?.snippet || {};

        if (!videoId) {
          return null;
        }

        return {
          videoId,
          title: snippet.title || "Không có tiêu đề",
          channelTitle: snippet.channelTitle || "YouTube",
          description: snippet.description || "",
          thumbnail:
            snippet.thumbnails?.medium?.url ||
            snippet.thumbnails?.default?.url ||
            "",
          publishedAt: snippet.publishedAt || ""
        };
      })
      .filter(Boolean);

    return res.json({
      items
    });
  } catch (error) {
    console.error("[Server] Search error:", error);

    return res.status(500).json({
      error: "Server lỗi khi tìm kiếm YouTube."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Karaoke 3D server running at http://localhost:${PORT}`);
});

//