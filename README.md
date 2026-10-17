# Smart Parking System with Wireless Electric Vehicle Charging Using IoT

This project implements an intelligent, automated IoT-based smart parking system featuring inductive Wireless Power Transfer (WPT), thermal watchdog self-healing protections, dynamic slot optimization swapping, and real-time telemetry streaming via WebSockets.

---

## 🏗️ System Architecture

1. **Hardware / Microcontroller (`/arduino`)**
   - **Board**: Arduino Uno / Mega / ESP32.
   - **Gate Access**: Dual ultrasonic sensors (HC-SR04) with servo motor barrier arms for automatic entry and exit clearance.
   - **Slot Occupancy**: 4 digital proximity/ultrasonic sensors monitoring parking bays.
   - **Wireless Power Transfer**: 4 active-LOW relays controlling magnetic resonance inductive charging coils.
   - **Thermal Watchdog**: Coil temperature monitoring with automatic emergency cutoff (> 45°C) and self-healing logic.
   - **RFID Reader**: MFRC522 module for vehicle authentication.

2. **Backend Server (`/backend`)**
   - **Framework**: Node.js & Express.
   - **Real-Time Gateway**: Socket.io broadcaster for live telemetry and hardware state.
   - **Fault-Tolerant Serial Interface**: Connects to Arduino over Serial COM port with automatic simulation fallback when hardware is disconnected.
   - **Database**: MongoDB (Local or MongoDB Atlas) for vehicle transaction logs and history tracking.
   - **Interactive REST APIs**: Endpoints for vehicle entry, exit, thermal fault injection, and dynamic slot exchange.

3. **Frontend Dashboard (`/frontend`)**
   - **Framework**: React.js with Chart.js and React-Icons.
   - **Live Telemetry State**: Dynamically reflects real-time slot occupancy, pad temperatures, amperage, and battery charge.
   - **Interactive Blueprint Schematic**: Visual animation of entry gates, parking bays, and exit barriers.
   - **Built-in Simulation Controls**: One-click test toolbar to simulate car entry, exit, overheat faults, and slot swaps right from the dashboard!
   - **Mobile Viewport Emulation**: Simulates driver companion mobile application with slot reservation and wireless charge progress.

---

## 🛠️ Resolved Bugs & Enhancements

1. **SerialPort Crash Prevention**:
   - Previously, if the Arduino was disconnected or `COM3` failed to open, Node.js crashed with an unhandled `error` event.
   - **Fix**: Wrapped in safe connection handler with `port.on("error")` catching and automatic fallback to mock/simulation mode.

2. **MongoDB Atlas & Environment Variable Loading**:
   - `db.js` previously ignored `.env` and crashed if local MongoDB wasn't running.
   - **Fix**: Implemented safe environment variable resolution supporting `MONGO_URL` / `MONGODB_URI` with graceful offline fallback.

3. **Live Telemetry React State Binding**:
   - Previously, `slotsData` in React was static and ignored `msg.telemetry` from the server.
   - **Fix**: Bound `slotsData`, `selfHealingActive`, and `activeAlarms` to incoming Socket.io packets with real-time UI updates.

4. **Dynamic Slot Swapping Interlock**:
   - The UI "Accept Optimization Swap" button previously only showed a browser alert.
   - **Fix**: Connected to `socket.emit("requestSlotExchange")` and `/api/swap` to execute live vehicle and charge redistribution.

5. **Missing Arduino Code**:
   - The `arduino/` folder was previously empty.
   - **Fix**: Generated complete production-grade Arduino sketch (`smart_parking_ev.ino`) with full pinout diagrams and documentation.

---

## 🚀 Getting Started

### 1. Run the Backend
```bash
cd backend
npm install
npm start
```
*Backend runs on `http://localhost:5000` (Health check: `http://localhost:5000/health`).*

### 2. Run the Frontend
```bash
cd frontend
npm install
npm start
```
*Dashboard opens at `http://localhost:3000`.*

### 3. Upload Arduino Code
1. Open `arduino/smart_parking_ev.ino` in Arduino IDE.
2. Select your board (Arduino Uno / Mega / ESP32) and COM Port.
3. Install required libraries: `Servo`, `MFRC522`.
4. Click **Upload**.

---

## 🧪 Simulation & Testing APIs

You can test the system without hardware using either the **dashboard simulation buttons** or HTTP requests:

- **Simulate Vehicle Entry**: `POST http://localhost:5000/api/entry`
- **Simulate Vehicle Exit**: `POST http://localhost:5000/api/exit`
- **Dynamic Slot Swap**: `POST http://localhost:5000/api/swap`
- **Trigger Overheat Fault**: `POST http://localhost:5000/api/fault` (Body: `{"slotId": 3}`)
- **Reset Protections**: `POST http://localhost:5000/api/reset-healing`
- **View Analytics**: `GET http://localhost:5000/analytics`
