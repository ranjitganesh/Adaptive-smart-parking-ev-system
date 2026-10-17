const fs = require("fs");
const path = require("path");

// Safe environment variables loader (works with or without dotenv package)
try {
  require("dotenv").config();
} catch (_) {
  try {
    const envPath = path.resolve(__dirname, ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      content.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const idx = trimmed.indexOf("=");
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim();
            if (!process.env[key]) process.env[key] = val;
          }
        }
      });
    }
  } catch (err) {}
}

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./db");
const Parking = require("./models/parking");

let SerialPort, ReadlineParser;
try {
  ({ SerialPort } = require("serialport"));
  ({ ReadlineParser } = require("@serialport/parser-readline"));
} catch (e) {
  console.warn("⚠️ serialport module not loaded:", e.message);
}

const app = express();
connectDB();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// =======================
// SYSTEM STATE (5 SLOTS MATCHING ARDUINO maxCars = 5)
// =======================

const initialSlots = [
  { id: 1, type: "Available", padHealth: 98, temp: 31, volt: 12, current: 0.0, eff: 95, battery: 0, vehicle: null },
  { id: 2, type: "Charging", padHealth: 96, temp: 32, volt: 12, current: 1.8, eff: 94, battery: 46, vehicle: "Target-A" },
  { id: 3, type: "Occupied", padHealth: 61, temp: 44, volt: 12, current: 0.0, eff: 82, battery: 78, vehicle: "Target-C" },
  { id: 4, type: "Charging", padHealth: 94, temp: 33, volt: 12, current: 2.0, eff: 93, battery: 15, vehicle: "Target-B" },
  { id: 5, type: "Available", padHealth: 99, temp: 30, volt: 12, current: 0.0, eff: 96, battery: 0, vehicle: null }
];

let systemHardwareState = {
  slots: JSON.parse(JSON.stringify(initialSlots)),
  selfHealingActive: false,
  activeAlarms: []
};

function calculateCarCount() {
  return systemHardwareState.slots.filter(s => s.type === "Charging" || s.type === "Occupied").length;
}

const maxCars = 5; // Matches Arduino maxCars = 5
let carCount = calculateCarCount();

async function logParkingToDB() {
  try {
    if (mongoose.connection.readyState === 1) {
      await Parking.create({
        carCount,
        availableSlots: Math.max(0, maxCars - carCount),
        status: carCount >= maxCars ? "FULL" : "AVAILABLE",
      });
      console.log("💾 Saved Parking Log to MongoDB");
    }
  } catch (err) {
    console.warn("⚠️ MongoDB save bypassed:", err.message);
  }
}

function broadcastState(actionContext = "SYSTEM_UPDATE") {
  carCount = calculateCarCount();
  const availableSlots = Math.max(0, maxCars - carCount);
  const status = carCount >= maxCars ? "FULL" : "AVAILABLE";

  const payload = {
    carCount,
    availableSlots,
    status,
    totalSlots: maxCars,
    actionContext,
    timestamp: new Date().toLocaleTimeString(),
    telemetry: systemHardwareState,
    serialConnected,
    activePort: activePortName,
  };

  io.emit("parkingUpdate", payload);
  return payload;
}

// Evaluate Self-Healing Protections
function evaluateSelfHealing() {
  let triggered = false;
  systemHardwareState.slots.forEach(slot => {
    if (slot.temp > 45) {
      triggered = true;
      const alarmMsg = `Pad 0${slot.id} Thermal Cutoff (${slot.temp}°C > 45°C)`;
      if (!systemHardwareState.activeAlarms.includes(alarmMsg)) {
        systemHardwareState.activeAlarms.push(alarmMsg);
      }
      slot.type = "Available";
      slot.current = 0.0;
    }
  });

  if (triggered) {
    systemHardwareState.selfHealingActive = true;
  }
}

// Vehicle Event Handlers
function handleEntry(vehicleId = "EV-" + Math.floor(100 + Math.random() * 900)) {
  const freeSlot = systemHardwareState.slots.find(s => s.type === "Available");
  if (freeSlot) {
    freeSlot.type = "Charging";
    freeSlot.current = +(1.6 + Math.random() * 0.8).toFixed(1);
    freeSlot.battery = Math.floor(15 + Math.random() * 30);
    freeSlot.vehicle = vehicleId;
    console.log(`🚗 ENTRY: Vehicle ${vehicleId} parked at Slot 0${freeSlot.id}`);
    evaluateSelfHealing();
    logParkingToDB();
    return broadcastState(`Car Entered: ${vehicleId} allocated to Slot 0${freeSlot.id}`);
  } else {
    console.log("⚠️ ENTRY REFUSED: Parking Full");
    return broadcastState("Entry Gate Blocked - Parking Full");
  }
}

function handleExit(slotId = null) {
  let targetSlot;
  if (slotId) {
    targetSlot = systemHardwareState.slots.find(s => s.id === slotId && s.type !== "Available");
  } else {
    targetSlot = systemHardwareState.slots.find(s => s.type === "Occupied") ||
                 systemHardwareState.slots.find(s => s.type === "Charging");
  }

  if (targetSlot) {
    const exitedCar = targetSlot.vehicle || `Slot 0${targetSlot.id} Car`;
    targetSlot.type = "Available";
    targetSlot.current = 0.0;
    targetSlot.battery = 0;
    targetSlot.vehicle = null;
    console.log(`🚙 EXIT: Vehicle left Slot 0${targetSlot.id}`);
    logParkingToDB();
    return broadcastState(`Car Exited: ${exitedCar} cleared from Slot 0${targetSlot.id}`);
  } else {
    console.log("ℹ️ EXIT EVENT: Parking is already empty");
    return broadcastState("Exit Gate Checked - No Active Cars");
  }
}

// Synchronize count directly when Arduino sends exact number (e.g., "Total Cars: 2")
function syncCountFromArduino(exactCount) {
  let current = calculateCarCount();
  if (exactCount > current) {
    const diff = exactCount - current;
    for (let i = 0; i < diff; i++) {
      const freeSlot = systemHardwareState.slots.find(s => s.type === "Available");
      if (freeSlot) {
        freeSlot.type = "Charging";
        freeSlot.current = 1.8;
        freeSlot.battery = 35;
        freeSlot.vehicle = "EV-Uno-" + freeSlot.id;
      }
    }
  } else if (exactCount < current) {
    const diff = current - exactCount;
    for (let i = 0; i < diff; i++) {
      const occSlot = systemHardwareState.slots.find(s => s.type !== "Available");
      if (occSlot) {
        occSlot.type = "Available";
        occSlot.current = 0;
        occSlot.battery = 0;
        occSlot.vehicle = null;
      }
    }
  }
  logParkingToDB();
  return broadcastState(`Arduino Synchronized: ${exactCount} Cars in Bay`);
}

function handleSlotExchange(slotIdA = 2, slotIdB = 4) {
  const slotA = systemHardwareState.slots.find(s => s.id === slotIdA);
  const slotB = systemHardwareState.slots.find(s => s.id === slotIdB);

  if (slotA && slotB) {
    console.log(`🔄 Performing Dynamic Slot Swap: Slot 0${slotIdA} ↔ Slot 0${slotIdB}...`);
    const tempType = slotA.type;
    const tempBatt = slotA.battery;
    const tempCurr = slotA.current;
    const tempVeh = slotA.vehicle;

    slotA.type = slotB.type;
    slotA.battery = slotB.battery;
    slotA.current = slotB.current;
    slotA.vehicle = slotB.vehicle;

    slotB.type = tempType;
    slotB.battery = tempBatt;
    slotB.current = tempCurr;
    slotB.vehicle = tempVeh;

    return broadcastState(`Dynamic Swap Optimized: Slot 0${slotIdA} ↔ Slot 0${slotIdB}`);
  }
}

function resetSelfHealing() {
  systemHardwareState.selfHealingActive = false;
  systemHardwareState.activeAlarms = [];
  systemHardwareState.slots.forEach(s => {
    if (s.temp > 40) s.temp = 32;
  });
  return broadcastState("Self-Healing Circuit Reset: All Systems Normal");
}

function simulateThermalFault(slotId = 3) {
  const slot = systemHardwareState.slots.find(s => s.id === slotId);
  if (slot) {
    slot.temp = 52;
    evaluateSelfHealing();
    return broadcastState(`Thermal Fault Injected on Slot 0${slotId} (${slot.temp}°C)`);
  }
}

// =======================
// ARDUINO SERIAL AUTO-DETECTION & RESILIENT COMMUNICATION
// =======================

let serialConnected = false;
let activePortName = null;
let activePort = null;
let reconnectTimer = null;

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (!serialConnected) {
      console.log(`🔄 Attempting to re-connect to Arduino on ${activePortName || 'COM7'}...`);
      await setupSerialConnection();
    }
  }, 4000);
}

async function setupSerialConnection() {
  if (!SerialPort) return;

  try {
    const ports = await SerialPort.list();
    let targetPort = process.env.SERIAL_PORT;
    if (!targetPort) {
      const arduinoPort = ports.find(p => p.vendorId === "2341" || (p.friendlyName && p.friendlyName.includes("Arduino")));
      if (arduinoPort) {
        targetPort = arduinoPort.path;
      } else if (ports.some(p => p.path === "COM7")) {
        targetPort = "COM7";
      } else if (ports.length > 0) {
        targetPort = ports[0].path;
      } else {
        targetPort = "COM7";
      }
    }

    activePortName = targetPort;
    const baudRate = parseInt(process.env.SERIAL_BAUD, 10) || 9600;

    if (activePort && activePort.isOpen) {
      try { activePort.close(); } catch (_) {}
    }

    activePort = new SerialPort({
      path: targetPort,
      baudRate,
      autoOpen: false,
    });

    activePort.open((err) => {
      if (err) {
        serialConnected = false;
        console.warn(`⚠️ Arduino SerialPort (${targetPort}) offline:`, err.message);
        if (err.message.includes("Access denied")) {
          console.log("💡 Tip: Close the Arduino IDE Serial Monitor tab so Node.js can connect to COM7!");
        }
        console.log("ℹ️ Running in Mock / Simulation Mode while waiting for port...");
        scheduleReconnect();
        return;
      }
      serialConnected = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      console.log(`🔌 Arduino Uno Connected on ${targetPort} at ${baudRate} baud.`);
      broadcastState(`Arduino Hardware Online (${targetPort})`);
    });

    activePort.on("error", (err) => {
      serialConnected = false;
      console.warn(`⚠️ SerialPort (${targetPort}) notice:`, err.message);
      scheduleReconnect();
    });

    activePort.on("close", () => {
      serialConnected = false;
      console.warn(`⚠️ SerialPort (${targetPort}) closed.`);
      scheduleReconnect();
    });


    const parser = activePort.pipe(new ReadlineParser({ delimiter: "\r\n" }));

    parser.on("data", (line) => {
      const data = line.toString().trim();
      if (!data) return;
      console.log("📟 Arduino Raw Output:", data);

      // 1. User's exact Arduino sketch messages:
      // "Car Entered. Total Cars: 1"
      if (/Car Entered/i.test(data) || /ENTRY/i.test(data)) {
        const countMatch = data.match(/Total Cars:\s*(\d+)/i);
        if (countMatch) {
          syncCountFromArduino(parseInt(countMatch[1], 10));
        } else {
          handleEntry();
        }
      } 
      // "Car Exited. Total Cars: 0"
      else if (/Car Exited/i.test(data) || /EXIT/i.test(data)) {
        const countMatch = data.match(/Total Cars:\s*(\d+)/i);
        if (countMatch) {
          syncCountFromArduino(parseInt(countMatch[1], 10));
        } else {
          handleExit();
        }
      }
      // "Car Parking System Started"
      else if (/System Started/i.test(data)) {
        console.log("⚡ Arduino Parking System initialized.");
        broadcastState("Arduino Boot: Parking System Ready");
      }
      // "Parking Full!"
      else if (/Parking Full/i.test(data)) {
        console.log("⚠️ Arduino reports: Parking Full");
        broadcastState("Arduino Alert: Parking Full!");
      }
      // 2. Advanced JSON telemetry packets from ESP32 / Arduino WPT
      else if (data.startsWith("{") && data.endsWith("}")) {
        try {
          const packet = JSON.parse(data);
          if (packet.slotId && packet.temp !== undefined) {
            const s = systemHardwareState.slots.find(sl => sl.id === packet.slotId);
            if (s) {
              s.temp = packet.temp;
              if (packet.current !== undefined) s.current = packet.current;
              if (packet.type) s.type = packet.type;
              evaluateSelfHealing();
              broadcastState(`Telemetry update for Slot 0${packet.slotId}`);
            }
          }
        } catch (e) {
          console.warn("Invalid JSON packet from serial:", e.message);
        }
      }
    });

  } catch (err) {
    console.warn("⚠️ Failed to scan or open serial port:", err.message);
  }
}

setupSerialConnection();

// =======================
// SOCKET.IO REAL-TIME LOGIC
// =======================

io.on("connection", (socket) => {
  console.log("🟢 Client Connected:", socket.id);

  socket.emit("parkingUpdate", {
    carCount: calculateCarCount(),
    availableSlots: Math.max(0, maxCars - calculateCarCount()),
    status: calculateCarCount() >= maxCars ? "FULL" : "AVAILABLE",
    totalSlots: maxCars,
    telemetry: systemHardwareState,
    serialConnected,
    activePort: activePortName,
  });

  socket.on("requestSlotExchange", (payload) => {
    const slotA = payload && payload.slotA ? payload.slotA : 2;
    const slotB = payload && payload.slotB ? payload.slotB : 4;
    handleSlotExchange(slotA, slotB);
  });

  socket.on("triggerEntry", () => handleEntry());
  socket.on("triggerExit", () => handleExit());
  socket.on("triggerFault", (slotId) => simulateThermalFault(slotId || 3));
  socket.on("resetHealing", () => resetSelfHealing());

  socket.on("disconnect", () => {
    console.log("🔴 Client Disconnected:", socket.id);
  });
});

// =======================
// REST API ENDPOINTS
// =======================

app.get("/analytics", (req, res) => {
  const cars = calculateCarCount();
  res.json({
    totalSlots: maxCars,
    totalCars: cars,
    availableSlots: Math.max(0, maxCars - cars),
    status: cars >= maxCars ? "FULL" : "AVAILABLE",
    serialConnected,
    activePort: activePortName,
    telemetry: systemHardwareState,
  });
});

app.post("/api/entry", (req, res) => {
  const vehicleId = req.body && req.body.vehicleId ? req.body.vehicleId : undefined;
  const result = handleEntry(vehicleId);
  res.json({ success: true, result });
});

app.post("/api/exit", (req, res) => {
  const slotId = req.body && req.body.slotId ? req.body.slotId : null;
  const result = handleExit(slotId);
  res.json({ success: true, result });
});

app.post("/api/swap", (req, res) => {
  const { slotA = 2, slotB = 4 } = req.body || {};
  const result = handleSlotExchange(slotA, slotB);
  res.json({ success: true, result });
});

app.post("/api/fault", (req, res) => {
  const { slotId = 3 } = req.body || {};
  const result = simulateThermalFault(slotId);
  res.json({ success: true, result });
});

app.post("/api/reset-healing", (req, res) => {
  const result = resetSelfHealing();
  res.json({ success: true, result });
});

app.post("/api/boost", (req, res) => {
  systemHardwareState.slots.forEach(s => {
    if (s.type === "Charging") s.current = +(s.current + 0.8).toFixed(1);
  });
  const result = broadcastState("Boost Mode Activated: Coil Amperage Elevated to High Output");
  res.json({ success: true, result });
});

app.post("/api/toggle-slot", (req, res) => {
  const { slotId } = req.body || {};
  const s = systemHardwareState.slots.find(sl => sl.id === parseInt(slotId, 10));
  if (s) {
    if (s.type === "Available") {
      s.type = "Charging";
      s.current = 1.9;
      s.battery = 30;
      s.vehicle = "EV-Dock-" + s.id;
      broadcastState(`Manual Coil Energized: Slot 0${s.id} Activated`);
    } else {
      s.type = "Available";
      s.current = 0.0;
      s.battery = 0;
      s.vehicle = null;
      broadcastState(`Manual Coil De-Energized: Slot 0${s.id} Released`);
    }
    logParkingToDB();
  }
  res.json({ success: true, telemetry: systemHardwareState });
});

app.post("/api/calibrate", (req, res) => {
  const { tempCutoff, maxCurrent } = req.body || {};
  broadcastState(`Calibration Saved: Thermal Limit ${tempCutoff || 45}°C, Amperage ${maxCurrent || 3.5}A`);
  res.json({ success: true });
});

app.get("/data", async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const data = await Parking.find().sort({ timestamp: -1 }).limit(50);
      return res.json(data);
    }
    res.json([
      { carCount: 2, availableSlots: 3, status: "AVAILABLE", timestamp: new Date() }
    ]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    system: "Smart Parking Wireless EV Server",
    version: "2.1.0",
    serialConnected,
    activePort: activePortName,
    mongoConnected: mongoose.connection.readyState === 1
  });
});

// =======================
// SERVER START
// =======================

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Smart Parking EV Server Running on port ${PORT}`);
  console.log(`📡 WebSocket Gateway ready on ws://localhost:${PORT}`);
});

// Also bind to port 3000 mirror so http://localhost:3000 loads the exact same dashboard instantly
try {
  const mirrorServer = http.createServer(app);
  mirrorServer.listen(3000, () => {
    console.log(`🌐 Dashboard mirror also ready on http://localhost:3000`);
  });
  mirrorServer.on("error", (e) => {
    // Port 3000 in use or skipped, primary dashboard on port 5000
    console.log(`ℹ️ Port 3000 notice: ${e.message} (Primary dashboard on port ${PORT})`);
  });
} catch (_) {}