import type { MetaStorage } from "./meta";

export const NET_NAME_KEY = "balticmap-net-name";

export interface NetPanel {
  root: HTMLElement;
  name(): string;
  setVisible(v: boolean): void;
  setStatus(text: string): void;
  showInvite(link: string, peerId: string): void;
  showReconnect(fn: () => void): void;
  hideReconnect(): void;
}

/** The "Play with a friend" panel: host button, join field, name
 *  field, status line, invite link. Rudimentary by design - plain
 *  imperative DOM like the rest of the app. Player names are plain
 *  text; no card or faction name is ever rendered here, which is what
 *  keeps this file outside the rich-text rule. */
export function createNetPanel(
  app: HTMLElement,
  hooks: { onHost(): void; onJoin(hostId: string): void },
  storage: MetaStorage,
  defaultName: string,
): NetPanel {
  const root = document.createElement("div");
  root.className = "net-panel hidden";

  const title = document.createElement("div");
  title.className = "net-title";
  title.textContent = "Play with a friend";

  const nameRow = document.createElement("label");
  nameRow.className = "net-row";
  nameRow.textContent = "Your name ";
  const nameInput = document.createElement("input");
  nameInput.className = "net-name";
  nameInput.value = storage.getItem(NET_NAME_KEY) ?? defaultName;
  nameInput.addEventListener("change", () => {
    storage.setItem(NET_NAME_KEY, nameInput.value.trim());
  });
  nameRow.appendChild(nameInput);

  const hostBtn = document.createElement("button");
  hostBtn.className = "net-host";
  hostBtn.textContent = "Host a game";
  hostBtn.addEventListener("click", hooks.onHost);

  const joinRow = document.createElement("div");
  joinRow.className = "net-row";
  const joinInput = document.createElement("input");
  joinInput.className = "net-join-id";
  joinInput.placeholder = "Paste an invite link or id";
  const joinBtn = document.createElement("button");
  joinBtn.className = "net-join";
  joinBtn.textContent = "Join";
  joinBtn.addEventListener("click", () => {
    const raw = joinInput.value.trim();
    if (raw.length === 0) return;
    // A pasted full link carries the id as its join param.
    const fromUrl = /[?&]join=([^&]+)/.exec(raw)?.[1];
    hooks.onJoin(fromUrl !== undefined ? decodeURIComponent(fromUrl) : raw);
  });
  joinRow.append(joinInput, joinBtn);

  const invite = document.createElement("div");
  invite.className = "net-invite hidden";

  const status = document.createElement("div");
  status.className = "net-status";

  const reconnectBtn = document.createElement("button");
  reconnectBtn.className = "net-reconnect hidden";
  reconnectBtn.textContent = "Reconnect";
  let reconnectFn: (() => void) | null = null;
  reconnectBtn.addEventListener("click", () => reconnectFn?.());

  root.append(title, nameRow, hostBtn, joinRow, invite, status, reconnectBtn);
  app.appendChild(root);

  /** One copyable value with its Copy button. */
  const copyRow = (label: string, value: string): HTMLElement => {
    const row = document.createElement("div");
    row.className = "net-copy-row";
    const text = document.createElement("code");
    text.textContent = value;
    const btn = document.createElement("button");
    btn.textContent = `Copy ${label}`;
    btn.addEventListener("click", () => {
      void navigator.clipboard.writeText(value);
    });
    row.append(text, btn);
    return row;
  };

  return {
    root,
    name: () =>
      (nameInput.value.trim().length > 0 ? nameInput.value.trim() : defaultName),
    setVisible(v) {
      root.classList.toggle("hidden", !v);
    },
    setStatus(text) {
      status.textContent = text;
    },
    showInvite(link, peerId) {
      invite.replaceChildren(copyRow("link", link), copyRow("id", peerId));
      invite.classList.remove("hidden");
      hostBtn.classList.add("hidden");
      joinRow.classList.add("hidden");
    },
    showReconnect(fn) {
      reconnectFn = fn;
      reconnectBtn.classList.remove("hidden");
    },
    hideReconnect() {
      reconnectFn = null;
      reconnectBtn.classList.add("hidden");
    },
  };
}
