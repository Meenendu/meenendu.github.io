const scanBtn = document.getElementById("scanBtn");
const startScanBtn = document.getElementById("startScanBtn");
const stopScanBtn = document.getElementById("stopScanBtn");
const clearBtn = document.getElementById("clearBtn");
const deviceList = document.getElementById("deviceList");
const statusEl = document.getElementById("status");
const supportNotice = document.getElementById("supportNotice");
const secureNotice = document.getElementById("secureNotice");
const liveNotice = document.getElementById("liveNotice");
const deviceDebug = document.getElementById("deviceDebug");
const eventDebug = document.getElementById("eventDebug");

const devices = new Map();
let liveScan = null;

function setStatus(text) {
  statusEl.textContent = text;
}

function renderList() {
  deviceList.innerHTML = "";

  if (devices.size === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No devices yet. Tap Start Live Scan to add.";
    deviceList.appendChild(empty);
    return;
  }

  for (const device of devices.values()) {
    const li = document.createElement("li");
    li.className = "device";

    const name = document.createElement("div");
    name.className = "device-name";
    name.textContent = device.name || "(No name)";

    const id = document.createElement("div");
    id.className = "device-id";
    id.textContent = device.id || "(No id)";

    const rssi = document.createElement("div");
    rssi.className = "device-rssi";
    rssi.textContent = typeof device.rssi === "number" ? `RSSI: ${device.rssi} dBm` : "RSSI: n/a";

    const lastSeen = document.createElement("div");
    lastSeen.className = "device-last";
    lastSeen.textContent = device.lastSeen ? `Last seen: ${device.lastSeen}` : "";

    li.appendChild(name);
    li.appendChild(id);
    li.appendChild(rssi);
    li.appendChild(lastSeen);
    deviceList.appendChild(li);
  }
}

function formatTime(date) {
  return date.toLocaleTimeString();
}

function checkSupport() {
  const hasBluetooth = !!navigator.bluetooth;
  const isSecure = window.isSecureContext;
  const hasLiveScan = hasBluetooth && typeof navigator.bluetooth.requestLEScan === "function";

  supportNotice.hidden = hasBluetooth;
  secureNotice.hidden = isSecure;
  liveNotice.hidden = hasLiveScan;

  if (!hasBluetooth) {
    setStatus("Web Bluetooth not supported");
  } else if (!isSecure) {
    setStatus("Secure context required");
  } else if (!hasLiveScan) {
    setStatus("Live scan not supported");
  }

  startScanBtn.disabled = !hasBluetooth || !isSecure || !hasLiveScan;
  scanBtn.disabled = !hasBluetooth || !isSecure;
}

async function scanWithChooser() {
  try {
    setStatus("Opening device chooser...");

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
    });

    devices.set(device.id, {
      id: device.id,
      name: device.name,
      rssi: null,
      lastSeen: formatTime(new Date()),
    });

    renderList();
    setStatus(`Added ${device.name || "device"}`);
    updateDebug({ device });
  } catch (err) {
    if (err && err.name === "NotFoundError") {
      setStatus("No device selected");
      return;
    }
    console.error(err);
    setStatus("Scan failed");
  }
}

function onAdvertisement(event) {
  const id = event.device?.id || "";
  const name = event.device?.name || "";
  const now = formatTime(new Date());

  const existing = devices.get(id) || { id, name };
  devices.set(id, {
    ...existing,
    id,
    name: name || existing.name,
    rssi: typeof event.rssi === "number" ? event.rssi : existing.rssi,
    lastSeen: now,
  });

  renderList();
  updateDebug({ device: event.device, event });
  setStatus(`Live scanning... (${devices.size} devices)`);
}

function formatDataView(value) {
  if (!value) {
    return null;
  }
  const buffer = value.buffer ? value.buffer : value;
  const byteOffset = value.byteOffset || 0;
  const byteLength = value.byteLength || buffer.byteLength || 0;
  const bytes = new Uint8Array(buffer, byteOffset, byteLength);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

function formatMap(map) {
  if (!map || typeof map.forEach !== "function") {
    return null;
  }
  const entries = [];
  map.forEach((value, key) => {
    entries.push({ key, value: formatDataView(value) });
  });
  return entries;
}

function safeGet(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function summarizeDevice(device) {
  if (!device) {
    return null;
  }

  const gatt = safeGet(() => device.gatt, null);
  return {
    id: safeGet(() => device.id, null),
    name: safeGet(() => device.name, null),
    gatt: gatt
      ? {
          connected: safeGet(() => gatt.connected, null),
        }
      : null,
    hasWatchAdvertisements: typeof device.watchAdvertisements === "function",
    hasForget: typeof device.forget === "function",
    ownKeys: safeGet(() => Object.keys(device), []),
  };
}

function summarizeEvent(event) {
  if (!event) {
    return null;
  }

  return {
    name: event.name ?? null,
    uuids: event.uuids ?? null,
    appearance: event.appearance ?? null,
    txPower: event.txPower ?? null,
    rssi: event.rssi ?? null,
    manufacturerData: formatMap(event.manufacturerData),
    serviceData: formatMap(event.serviceData),
    ownKeys: safeGet(() => Object.keys(event), []),
  };
}

function updateDebug({ device = null, event = null }) {
  const deviceSummary = summarizeDevice(device);
  const eventSummary = summarizeEvent(event);

  deviceDebug.textContent = deviceSummary
    ? JSON.stringify(deviceSummary, null, 2)
    : "No device yet.";

  eventDebug.textContent = eventSummary
    ? JSON.stringify(eventSummary, null, 2)
    : "No advertisement yet.";
}

async function startLiveScan() {
  if (liveScan) {
    return;
  }

  try {
    setStatus("Starting live scan...");

    liveScan = await navigator.bluetooth.requestLEScan({
      acceptAllAdvertisements: true,
    });

    navigator.bluetooth.addEventListener("advertisementreceived", onAdvertisement);
    startScanBtn.disabled = true;
    stopScanBtn.disabled = false;
    setStatus("Live scanning...");
  } catch (err) {
    console.error(err);
    setStatus("Live scan failed");
  }
}

function stopLiveScan() {
  if (!liveScan) {
    return;
  }

  try {
    liveScan.stop();
  } catch (err) {
    console.warn(err);
  }

  navigator.bluetooth.removeEventListener("advertisementreceived", onAdvertisement);
  liveScan = null;
  startScanBtn.disabled = false;
  stopScanBtn.disabled = true;
  setStatus("Live scan stopped");
}

startScanBtn.addEventListener("click", startLiveScan);
stopScanBtn.addEventListener("click", stopLiveScan);
scanBtn.addEventListener("click", scanWithChooser);
clearBtn.addEventListener("click", () => {
  devices.clear();
  renderList();
  setStatus("Cleared");
  updateDebug({});
});

window.addEventListener("load", () => {
  checkSupport();
  renderList();
  updateDebug({});

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW registration failed", err);
    });
  }
});

window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    stopLiveScan();
  }
});
