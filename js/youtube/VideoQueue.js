class VideoQueue {
  constructor() {
    this.items = [];
  }

  enqueue(video) {
    if (!video || !video.videoId) {
      return false;
    }

    this.items.push({
      videoId: video.videoId,
      title: video.title || "Không có tiêu đề",
      channelTitle: video.channelTitle || "YouTube",
      thumbnail: video.thumbnail || ""
    });

    return true;
  }

  dequeue() {
    return this.items.shift() || null;
  }

  removeAt(index) {
    const safeIndex = Number(index);

    if (
      !Number.isInteger(safeIndex) ||
      safeIndex < 0 ||
      safeIndex >= this.items.length
    ) {
      return null;
    }

    const [removed] = this.items.splice(safeIndex, 1);

    return removed || null;
  }

  clear() {
    this.items = [];
  }

  hasNext() {
    return this.items.length > 0;
  }

  size() {
    return this.items.length;
  }

  getItems() {
    return [...this.items];
  }
}

export default VideoQueue;