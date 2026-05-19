class EventBus {
  constructor() {
    this.events = new Map();
  }

  on(eventName, callback) {
    if (typeof callback !== "function") {
      throw new Error(`EventBus.on("${eventName}") cần callback là function.`);
    }

    if (!this.events.has(eventName)) {
      this.events.set(eventName, new Set());
    }

    this.events.get(eventName).add(callback);

    return () => {
      this.off(eventName, callback);
    };
  }

  once(eventName, callback) {
    const unsubscribe = this.on(eventName, (...args) => {
      unsubscribe();
      callback(...args);
    });

    return unsubscribe;
  }

  off(eventName, callback) {
    if (!this.events.has(eventName)) {
      return;
    }

    this.events.get(eventName).delete(callback);

    if (this.events.get(eventName).size === 0) {
      this.events.delete(eventName);
    }
  }

  emit(eventName, payload = null) {
    if (!this.events.has(eventName)) {
      return;
    }

    for (const callback of this.events.get(eventName)) {
      try {
        callback(payload);
      } catch (error) {
        console.error(`[EventBus] Lỗi khi xử lý event "${eventName}":`, error);
      }
    }
  }

  clear(eventName) {
    if (eventName) {
      this.events.delete(eventName);
      return;
    }

    this.events.clear();
  }
}

const eventBus = new EventBus();

export default eventBus;