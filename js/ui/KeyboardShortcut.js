import eventBus from "../EventBus.js";

class KeyboardShortcut {
  constructor() {
    this.enabled = true;
  }

  init() {
    window.addEventListener("keydown", (event) => {
      if (!this.enabled) {
        return;
      }

      if (this.isTyping(event.target)) {
        this.handleTypingShortcut(event);
        return;
      }

      this.handleGlobalShortcut(event);
    });
  }

  isTyping(target) {
    if (!target) {
      return false;
    }

    const tagName = target.tagName?.toLowerCase();

    return (
      tagName === "input" ||
      tagName === "textarea" ||
      target.isContentEditable
    );
  }

  handleTypingShortcut(event) {
    if (event.key === "Enter") {
      eventBus.emit("ui:submit-search");
    }
  }

  handleGlobalShortcut(event) {
    switch (event.key) {
      case " ":
        event.preventDefault();
        eventBus.emit("ui:toggle-play");
        break;

      case "Enter":
        event.preventDefault();
        eventBus.emit("ui:submit-search");
        break;

      case "m":
      case "M":
        event.preventDefault();
        eventBus.emit("ui:toggle-mic");
        break;

      case "Escape":
        event.preventDefault();
        eventBus.emit("ui:collapse-panel");
        break;

      default:
        break;
    }
  }
}

export default KeyboardShortcut;