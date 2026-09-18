(() => {
  const status = document.getElementById("live-status");
  const follow = document.getElementById("follow-latest");
  const pause = document.getElementById("pause-live");
  const content = document.getElementById("content");
  const applicationPick = document.getElementById("pick-application");
  const chatPick = document.getElementById("pick-chat");
  const viewing = document.body.dataset;
  // Reading position belongs to a conversation, not to the viewer.
  const key = `hallvi-live-view:${viewing.chat}`;
  const remembered = JSON.parse(sessionStorage.getItem(key) || "null");
  let paused = remembered?.paused ?? false;
  follow.checked = remembered?.follow ?? true;
  let currentSignature = "";
  function remember() {
    const filter = document.querySelector(".filter-btn.active")?.dataset.filter;
    sessionStorage.setItem(
      key,
      JSON.stringify({
        follow: follow.checked,
        paused,
        top: content.scrollTop,
        filter,
        search: document.getElementById("tree-search")?.value ?? "",
        expanded: [...document.querySelectorAll("[id]")].flatMap((parent) =>
          [...parent.children].flatMap((child, index) =>
            child.classList.contains("expanded")
              ? [{ id: parent.id, index }]
              : [],
          ),
        ),
      }),
    );
  }
  function bottom() {
    content.scrollTop = content.scrollHeight;
  }
  function updatePause() {
    pause.textContent = paused ? "Resume updates" : "Pause updates";
  }
  updatePause();
  pause.onclick = () => {
    paused = !paused;
    updatePause();
    remember();
  };
  follow.onchange = () => {
    if (follow.checked) bottom();
    remember();
  };
  function show(application, chat) {
    remember();
    const url = new URL(location.href);
    url.searchParams.set("application", application);
    if (chat) url.searchParams.set("chat", chat);
    else url.searchParams.delete("chat");
    // Message anchors belong to the conversation being left.
    url.searchParams.delete("leafId");
    url.searchParams.delete("targetId");
    location.assign(url);
  }
  // Choosing an application lands on its main conversation.
  applicationPick.onchange = () => show(applicationPick.value, "");
  chatPick.onchange = () => show(applicationPick.value, chatPick.value);
  content.addEventListener(
    "wheel",
    (event) => {
      if (event.deltaY < 0) {
        follow.checked = false;
        remember();
      }
    },
    { passive: true },
  );
  content.addEventListener("keydown", (event) => {
    if (["ArrowUp", "PageUp", "Home"].includes(event.key)) {
      follow.checked = false;
      remember();
    }
  });
  window.addEventListener("pagehide", remember);
  requestAnimationFrame(() => {
    if (remembered?.filter)
      document.querySelector(`[data-filter="${remembered.filter}"]`)?.click();
    const search = document.getElementById("tree-search");
    if (search && remembered?.search) {
      search.value = remembered.search;
      search.dispatchEvent(new Event("input"));
    }
    for (const item of remembered?.expanded ?? [])
      document
        .getElementById(item.id)
        ?.children[item.index]?.classList.add("expanded");
    requestAnimationFrame(() => {
      if (follow.checked) bottom();
      else content.scrollTop = remembered?.top ?? 0;
    });
  });
  function renderCurrent(state) {
    const signature = JSON.stringify([state.response, state.executions]);
    const old = document.getElementById("live-current");
    if (signature === currentSignature && (old || !state.response)) return;
    currentSignature = signature;
    if (!state.response) {
      old?.remove();
      return;
    }
    const block = document.createElement("section");
    block.id = "live-current";
    const heading = document.createElement("h2");
    heading.textContent = "Current response · updating";
    block.append(heading);
    const text = document.createElement("pre");
    text.textContent =
      state.response.body ||
      "Pi is working. Recorded reasoning and tool results appear above as they are saved.";
    block.append(text);
    for (const execution of state.executions) {
      const detail = document.createElement("details");
      detail.open = true;
      const summary = document.createElement("summary");
      summary.textContent = `${execution.tool} · ${execution.status.replaceAll("-", " ")}`;
      const target = document.createElement("p");
      target.textContent = execution.target;
      const output = document.createElement("pre");
      output.textContent = `${execution.input}\n\n${execution.output || "Waiting for output…"}`;
      detail.append(summary, target, output);
      block.append(detail);
    }
    if (old) old.replaceWith(block);
    else document.getElementById("messages").append(block);
    if (follow.checked) bottom();
  }
  async function poll() {
    try {
      if (paused) {
        status.textContent = "Paused";
        return;
      }
      const response = await fetch(
        `/state?application=${viewing.application}&chat=${viewing.chat}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("read failed");
      const state = await response.json();
      status.textContent = `Live · ${state.status.replaceAll("-", " ")} · ${new Date().toLocaleTimeString()}`;
      if (state.version !== document.body.dataset.historyVersion) {
        remember();
        const url = new URL(location.href);
        if (follow.checked) {
          url.searchParams.delete("leafId");
          url.searchParams.delete("targetId");
        }
        location.replace(url);
        return;
      }
      renderCurrent(state);
    } catch {
      status.textContent = "Connection lost · retrying";
    } finally {
      setTimeout(poll, 750);
    }
  }
  poll();
})();
