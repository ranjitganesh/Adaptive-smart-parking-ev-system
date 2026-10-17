import React, { useEffect, useState, useMemo } from "react";
import io from "socket.io-client";
import {
  FaCar,
  FaParking,
  FaRobot,
  FaHistory,
  FaChartPie,
  FaServer,
  FaBolt,
  FaHeartbeat,
  FaExchangeAlt,
  FaMedkit,
  FaCogs,
  FaMobileAlt,
  FaDoorOpen,
  FaUserShield,
  FaThermometerHalf,
  FaPlay,
  FaStop,
  FaRedo,
  FaChargingStation,
  FaMicrochip,
  FaSlidersH,
  FaDownload,
  FaTrash,
  FaCheckDouble,
  FaPowerOff,
  FaStethoscope,
  FaRoute,
  FaPlugCircleXmark
} from "react-icons/fa";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Radar } from "react-chartjs-2";
import "./App.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const socket = io(BACKEND_URL, {
  reconnectionAttempts: 10,
  timeout: 10000,
});

function App() {
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [logs, setLogs] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [isConnected, setIsConnected] = useState(false);
  const [arduinoOnline, setArduinoOnline] = useState(false);
  const [activePort, setActivePort] = useState("COM7");

  // Calibration Settings state
  const [settings, setSettings] = useState({
    tempCutoff: 45,
    maxCurrent: 3.5,
    capacity: 5
  });

  // Overview status
  const [data, setData] = useState({
    carCount: 2,
    availableSlots: 3,
    status: "AVAILABLE",
  });

  // 5 Inductive Bays mapped to user's Arduino capacity (maxCars = 5)
  const [slotsData, setSlotsData] = useState([
    { id: 1, type: "Available", padHealth: 98, temp: 31, volt: 12, current: 0.0, eff: 95, battery: 0, timeRemaining: 0, vehicle: null },
    { id: 2, type: "Charging", padHealth: 96, temp: 32, volt: 12, current: 1.8, eff: 94, battery: 46, timeRemaining: 35, vehicle: "Target-A" },
    { id: 3, type: "Occupied", padHealth: 61, temp: 44, volt: 12, current: 0.0, eff: 82, battery: 78, timeRemaining: 12, vehicle: "Target-C" },
    { id: 4, type: "Charging", padHealth: 94, temp: 33, volt: 12, current: 2.0, eff: 93, battery: 15, timeRemaining: 55, vehicle: "Target-B" },
    { id: 5, type: "Available", padHealth: 99, temp: 30, volt: 12, current: 0.0, eff: 96, battery: 0, timeRemaining: 0, vehicle: null },
  ]);

  const [selfHealingActive, setSelfHealingActive] = useState(false);
  const [activeAlarms, setActiveAlarms] = useState([]);

  // Clock Ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Socket Telemetry Receiver
  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected to Gateway:", socket.id);
      setIsConnected(true);
    });

    socket.on("parkingUpdate", (msg) => {
      console.log("Live Packet:", msg);

      setData({
        carCount: msg.carCount,
        availableSlots: msg.availableSlots,
        status: msg.status,
      });

      if (msg.serialConnected !== undefined) {
        setArduinoOnline(msg.serialConnected);
      }
      if (msg.activePort) {
        setActivePort(msg.activePort);
      }

      if (msg.telemetry) {
        if (msg.telemetry.slots && Array.isArray(msg.telemetry.slots)) {
          setSlotsData(
            msg.telemetry.slots.map((s) => ({
              ...s,
              timeRemaining:
                s.battery > 0 ? Math.max(5, Math.round((100 - s.battery) * 0.8)) : 0,
            }))
          );
        }
        setSelfHealingActive(!!msg.telemetry.selfHealingActive);
        if (msg.telemetry.activeAlarms) {
          setActiveAlarms(msg.telemetry.activeAlarms);
        }
      }

      const actionText = msg.actionContext || `System Update: ${msg.status}`;
      setLogs((prev) => [
        {
          action: actionText,
          cars: msg.carCount,
          time: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 49),
      ]);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from Gateway");
      setIsConnected(false);
      setArduinoOnline(false);
    });

    return () => {
      socket.off("parkingUpdate");
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);

  // Calculated Metrics
  const totalSlots = slotsData.length;
  const occupiedCount = useMemo(
    () => slotsData.filter((s) => s.type === "Occupied" || s.type === "Charging").length,
    [slotsData]
  );
  const chargingCount = useMemo(
    () => slotsData.filter((s) => s.type === "Charging").length,
    [slotsData]
  );
  const availableCount = useMemo(
    () => slotsData.filter((s) => s.type === "Available").length,
    [slotsData]
  );
  const avgHealth = useMemo(
    () =>
      slotsData.length > 0
        ? Math.round(
            slotsData.reduce((acc, s) => acc + (s.padHealth || 90), 0) / slotsData.length
          )
        : 95,
    [slotsData]
  );
  const activeFaultsCount = useMemo(
    () => slotsData.filter((s) => (s.temp && s.temp > settings.tempCutoff) || (s.padHealth && s.padHealth < 70)).length,
    [slotsData, settings.tempCutoff]
  );

  // Dynamic Chart Configurations
  const barData = {
    labels: ["Occupied", "Available", "Charging", "Faulty Pads"],
    datasets: [
      {
        label: "Bays",
        data: [occupiedCount, availableCount, chargingCount, activeFaultsCount],
        backgroundColor: ["#ff004c", "#00ff88", "#0066ff", "#ffcc00"],
        borderRadius: 6,
      },
    ],
  };

  const radarData = {
    labels: [
      "Parking Load",
      "Sensor Activity",
      "AI Accuracy",
      "Coil Health Index",
      "Power Flux",
      "Availability",
    ],
    datasets: [
      {
        label: "Coupling Matrix",
        data: [
          occupiedCount * 2,
          9,
          9,
          Math.min(10, Math.round(avgHealth / 10)),
          chargingCount * 2.2,
          availableCount * 2,
        ],
        backgroundColor: "rgba(0, 247, 255, 0.2)",
        borderColor: "#00f7ff",
        borderWidth: 2,
      },
    ],
  };

  // Interactive Hardware Controls Handlers
  const triggerEntry = () => socket.emit("triggerEntry");
  const triggerExit = () => socket.emit("triggerExit");
  const triggerThermalFault = () => socket.emit("triggerFault", 3);
  const resetProtections = () => socket.emit("resetHealing");
  const requestSwap = () => socket.emit("requestSlotExchange", { slotA: 2, slotB: 4 });

  const toggleSlotDirectly = (slotId) => {
    const slot = slotsData.find((s) => s.id === slotId);
    if (slot) {
      if (slot.type === "Available") {
        socket.emit("triggerEntry");
      } else {
        socket.emit("triggerExit", slotId);
      }
    }
  };

  const boostAmperage = () => {
    setSlotsData((prev) =>
      prev.map((s) => (s.type === "Charging" ? { ...s, current: +(s.current + 0.8).toFixed(1) } : s))
    );
    alert("⚡ Fast Boost Activated: Current draw boosted across all active resonant coils!");
  };

  const runDiagnostics = () => {
    alert("🩺 AI Diagnostic sweep completed: All 5 coil magnetic resonant frequencies verified locked at 85.0 kHz.");
  };

  const exportCSV = () => {
    let csv = "Event Action,Active Nodes,Timestamp\n";
    logs.forEach((l) => {
      csv += `"${l.action}","${l.cars}","${l.time}"\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "smart_parking_ev_logs.csv";
    a.click();
  };

  const clearLogs = () => setLogs([]);

  const saveCalibration = (e) => {
    e.preventDefault();
    alert(`Calibration Saved! Thermal Boundary: ${settings.tempCutoff}°C, Overload Threshold: ${settings.maxCurrent}A`);
  };

  return (
    <div className="app">
      {/* SIDEBAR NAVIGATION */}
      <div className={sidebarOpen ? "sidebar open" : "sidebar"}>
        <div className="logo-container">
          <FaBolt className="logo-icon" />
          <div className="logo-text">
            <h1>SMART EV PARK</h1>
            <span>WIRELESS IoT CHARGE</span>
          </div>
        </div>

        <ul className="nav-list">
          <li className={page === "dashboard" ? "nav-item active" : "nav-item"} onClick={() => setPage("dashboard")}>
            <FaCar /> Dashboard
          </li>
          <li className={page === "charging" ? "nav-item active" : "nav-item"} onClick={() => setPage("charging")}>
            <FaChargingStation /> Wireless Charging
          </li>
          <li className={page === "health" ? "nav-item active" : "nav-item"} onClick={() => setPage("health")}>
            <FaHeartbeat /> Charger Health
          </li>
          <li className={page === "ai" ? "nav-item active" : "nav-item"} onClick={() => setPage("ai")}>
            <FaRobot /> AI Prediction
          </li>
          <li className={page === "exchange" ? "nav-item active" : "nav-item"} onClick={() => setPage("exchange")}>
            <FaExchangeAlt /> Dynamic Swap
          </li>
          <li className={page === "healing" ? "nav-item active" : "nav-item"} onClick={() => setPage("healing")}>
            <FaMedkit /> Self-Healing
          </li>
          <li className={page === "analytics" ? "nav-item active" : "nav-item"} onClick={() => setPage("analytics")}>
            <FaChartPie /> Analytics
          </li>
          <li className={page === "logs" ? "nav-item active" : "nav-item"} onClick={() => setPage("logs")}>
            <FaHistory /> Machine Logs
          </li>
          <li className={page === "settings" ? "nav-item active" : "nav-item"} onClick={() => setPage("settings")}>
            <FaSlidersH /> Calibration
          </li>
          <li className={page === "mobile" ? "nav-item active" : "nav-item"} onClick={() => setPage("mobile")}>
            <FaMobileAlt /> Mobile App View
          </li>
        </ul>

        <div className="sidebar-footer">
          <span>Firmware: v2.1.0</span>
          <span style={{ color: "#00ff88" }}>● Active</span>
        </div>
      </div>

      {/* MAIN CONTAINER */}
      <div className="main">
        {/* TOPBAR HEADER */}
        <div className="topbar">
          <div className="topbar-left">
            <h2>INTELLIGENT WIRELESS EV PARKING</h2>
            <div className="topbar-sub">
              <span><i className="fa-regular fa-clock"></i> ⏰ {currentTime}</span>
              <span><FaMicrochip /> Arduino Uno ({activePort}) + ESP32 Gateway</span>
            </div>
          </div>
          <div className="topbar-badges">
            <div className={`badge-pill ${arduinoOnline ? "badge-live" : "badge-warn"}`}>
              <FaChargingStation /> {arduinoOnline ? `ARDUINO (${activePort}) ONLINE` : `SIMULATION MODE (${activePort})`}
            </div>
            <div className={`badge-pill ${isConnected ? "badge-live" : "badge-danger"}`}>
              <FaServer /> {isConnected ? "GATEWAY LIVE" : "OFFLINE"}
            </div>
          </div>
        </div>

        {/* GLOBAL HARDWARE SIMULATION TOOLBAR */}
        <div className="toolbar-bar">
          <span className="toolbar-label">Hardware Simulation Toolbar:</span>
          <button className="btn-action btn-entry" onClick={triggerEntry}>
            <FaPlay size={11} /> Simulate Entry
          </button>
          <button className="btn-action btn-exit" onClick={triggerExit}>
            <FaStop size={11} /> Simulate Exit
          </button>
          <button className="btn-action btn-fault" onClick={triggerThermalFault}>
            <FaThermometerHalf size={11} /> Overheat Fault (Pad 3)
          </button>
          <button className="btn-action btn-heal" onClick={resetProtections}>
            <FaRedo size={11} /> Reset Protections
          </button>
          <button className="btn-action btn-swap" onClick={requestSwap}>
            <FaExchangeAlt size={11} /> Slot 2 ↔ 4 Swap
          </button>
          <button className="btn-action btn-boost" onClick={boostAmperage}>
            <FaBolt size={11} /> Fast Boost Mode
          </button>
        </div>

        {/* ACTIVE ALARM BANNER */}
        {activeAlarms.length > 0 && (
          <div className="alarm-banner" style={{ display: "block" }}>
            <strong>⚠️ CRITICAL HARDWARE ALERTS:</strong>
            <ul style={{ marginLeft: "25px", marginTop: "6px" }}>
              {activeAlarms.map((alm, i) => (
                <li key={i}>{alm}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ==================== PAGE 1: DASHBOARD ==================== */}
        {page === "dashboard" && (
          <div className="page-section active">
            <div className="cards-row">
              <div className="stat-card">
                <div className="stat-header"><small>Total Capacity</small><FaCar /></div>
                <div className="stat-val">{totalSlots}</div>
                <div className="stat-meta">Configured inductive bays</div>
              </div>
              <div className="stat-card">
                <div className="stat-header"><small>Available Spaces</small><FaParking style={{ color: "#00ff88" }} /></div>
                <div className="stat-val" style={{ color: "#00ff88" }}>{availableCount}</div>
                <div className="stat-meta">Ready for vehicle docking</div>
              </div>
              <div className="stat-card">
                <div className="stat-header"><small>Charging / Occupied</small><FaBolt style={{ color: "#0066ff" }} /></div>
                <div className="stat-val" style={{ color: "#0066ff" }}>{occupiedCount}</div>
                <div className="stat-meta">Inductive field coupled</div>
              </div>
              <div className="stat-card">
                <div className="stat-header"><small>Avg Pad Health</small><FaHeartbeat /></div>
                <div className="stat-val">{avgHealth}%</div>
                <div className="stat-meta">Coil resonance profile</div>
              </div>
              <div className="stat-card">
                <div className="stat-header"><small>System Gate</small><FaDoorOpen /></div>
                <div className="stat-val" style={{ fontSize: "22px", color: availableCount === 0 ? "#ff004c" : "#00ff88" }}>
                  {data.status}
                </div>
                <div className="stat-meta">Barrier servo ready</div>
              </div>
            </div>

            {/* INTERACTIVE BLUEPRINT SCHEMATIC */}
            <div className="schematic-wrapper">
              <div className="schematic-head">
                <h3><FaDiagramProject /> Real-Time Inductive Bay Blueprint</h3>
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>💡 Click any slot to manually dock/clear vehicle</span>
              </div>
              <div className="schematic-track">
                <div className="gate-column">
                  <div className="gate-title">ENTRY GATE</div>
                  <div className={`gate-barrier-arm ${availableCount > 0 ? "arm-open" : "arm-closed"}`}>
                    <FaDoorOpen /> {availableCount > 0 ? "Clear Open" : "Barrier Down"}
                  </div>
                  <div className="car-flow-pulse">Car Inflow →</div>
                </div>

                <div className="slots-cluster">
                  {slotsData.map((slot) => (
                    <div
                      key={slot.id}
                      className={`bay-node ${slot.type.toLowerCase()}`}
                      onClick={() => toggleSlotDirectly(slot.id)}
                    >
                      <div className="bay-id-tag">SLOT 0{slot.id}</div>
                      <div className="bay-coil-icon">
                        {slot.type === "Charging" ? <FaBolt /> : slot.type === "Occupied" ? <FaCar /> : <FaParking />}
                      </div>
                      <div className="bay-status-badge">
                        {slot.type === "Available" ? "🟢 FREE" : slot.type === "Charging" ? "⚡ CHARGING" : "🔴 OCCUPIED"}
                      </div>
                      <div className="bay-telemetry-micro">
                        <span>HEALTH:</span> <b>{slot.padHealth}%</b><br />
                        <span>TEMP:</span> <b style={{ color: slot.temp > settings.tempCutoff ? "#ff004c" : "inherit" }}>{slot.temp}°C</b><br />
                        {slot.type === "Charging" ? (
                          <><span>BATT:</span> <b>{slot.battery}%</b></>
                        ) : (
                          <><span>LOAD:</span> 0.0A</>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="gate-column">
                  <div className="gate-title">EXIT GATE</div>
                  <div className="gate-barrier-arm arm-open">
                    <FaDoorOpen /> Outflow Clear
                  </div>
                  <div className="car-flow-pulse">← Departure</div>
                </div>
              </div>
            </div>

            {/* LIVE BAR CHART & RECENT LOGS */}
            <div className="grid-2">
              <div className="panel-card">
                <h4><span><FaChartPie /> Bay Allocation Breakdown</span> <small style={{ fontSize: "11px", color: "#94a3b8" }}>Real-Time</small></h4>
                <div style={{ height: "240px" }}><Bar data={barData} options={{ responsive: true, maintainAspectRatio: false }} /></div>
              </div>
              <div className="panel-card">
                <h4><span><FaHistory /> Recent Hardware Activity</span> <button className="btn-action" style={{ padding: "4px 10px", fontSize: "11px", background: "rgba(255,255,255,0.08)" }} onClick={() => setPage("logs")}>View All</button></h4>
                <table className="custom-table">
                  <thead><tr><th>Action Context</th><th>Nodes Active</th><th>Time</th></tr></thead>
                  <tbody>
                    {logs.slice(0, 5).map((log, i) => (
                      <tr key={i}><td>{log.action}</td><td>{log.cars} Units</td><td>{log.time}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAGE 2: WIRELESS CHARGING ==================== */}
        {page === "charging" && (
          <div className="page-section active">
            <div className="panel-card" style={{ marginBottom: "20px" }}>
              <h4><span><FaChargingStation /> Inductive Power Telemetry Matrix</span> <button className="btn-action btn-boost" onClick={boostAmperage}><FaBolt /> Boost All Amperage</button></h4>
              <p style={{ fontSize: "13px", color: "#94a3b8" }}>Real-time magnetic resonance coupling parameters for 85 kHz WPT coils embedded in bay floor.</p>
            </div>
            <div className="charging-grid">
              {slotsData.map((s) => (
                <div key={s.id} className="pad-card">
                  <h3>
                    <span><FaChargingStation style={{ color: "var(--accent-cyan)", marginRight: "8px" }} /> Bay 0{s.id} Coil Array</span>
                    <span className={`badge-pill ${s.type === 'Charging' ? 'badge-live' : s.type === 'Occupied' ? 'badge-danger' : 'badge-warn'}`} style={{ fontSize: "10px", padding: "3px 8px" }}>{s.type}</span>
                  </h3>
                  <div className="pad-specs-4col">
                    <div><small>Current</small><strong>{s.current} A</strong></div>
                    <div><small>Voltage</small><strong>{s.volt} V</strong></div>
                    <div><small>Thermal</small><strong style={{ color: s.temp > settings.tempCutoff ? "#ff004c" : "inherit" }}>{s.temp}°C</strong></div>
                    <div><small>Flux Eff</small><strong>{s.eff}%</strong></div>
                  </div>
                  <div className="progress-bar-wrap">
                    <label><span>Inductive Duty Cycle ({s.vehicle || 'Docked'}):</span> <b>{s.battery}%</b></label>
                    <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.max(5, s.battery)}%` }}></div></div>
                  </div>
                  <div style={{ marginTop: "15px", display: "flex", gap: "8px" }}>
                    <button className={`btn-action ${s.type === 'Charging' ? 'btn-exit' : 'btn-entry'}`} style={{ padding: "6px 12px", fontSize: "11px", flex: 1 }} onClick={() => toggleSlotDirectly(s.id)}>
                      <FaPowerOff /> {s.type === 'Charging' ? 'De-Energize Coil' : 'Energize Coil'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== PAGE 3: CHARGER HEALTH ==================== */}
        {page === "health" && (
          <div className="page-section active">
            <div className="panel-card">
              <h4><span><FaHeartbeat /> Pad Degradation & Thermal Watchdog Indexes</span> <button className="btn-action btn-heal" onClick={runDiagnostics}><FaStethoscope /> Run AI Diagnostics</button></h4>
              <table className="custom-table" style={{ marginTop: "15px" }}>
                <thead>
                  <tr>
                    <th>Coil Identifier</th>
                    <th>Health Index</th>
                    <th>Thermal Footprint</th>
                    <th>Current Draw</th>
                    <th>Resonant Freq</th>
                    <th>AI Diagnostic State</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {slotsData.map((s) => (
                    <tr key={s.id}>
                      <td><b>Coil Base Array #0{s.id}</b></td>
                      <td style={{ color: s.padHealth > 90 ? "#00ff88" : "#ffaa00", fontWeight: "700" }}>{s.padHealth}%</td>
                      <td style={{ color: s.temp > settings.tempCutoff ? "#ff004c" : "inherit" }}>{s.temp}°C</td>
                      <td>{s.current} A</td>
                      <td>{s.id * 125 + 95} Hz/c</td>
                      <td>
                        <span className={`badge-pill ${s.padHealth > 90 ? 'badge-live' : 'badge-warn'}`} style={{ fontSize: "10px", padding: "4px 8px" }}>
                          {s.padHealth > 90 ? 'Optimal Coupling' : 'Check Thermals'}
                        </span>
                      </td>
                      <td>
                        <button className="btn-action" style={{ padding: "4px 10px", fontSize: "11px", background: "rgba(255,255,255,0.08)" }} onClick={() => alert(`Diagnostic ping sent to Coil 0${s.id}. Status: OK`)}>
                          Ping
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== PAGE 4: AI PREDICTION ==================== */}
        {page === "ai" && (
          <div className="page-section active">
            <div className="grid-2">
              <div className="panel-card">
                <h4><span><FaRobot /> Neural Space-Time Demand Forecasting</span> <button className="btn-action btn-boost" onClick={() => alert("Space-Time Neural forecasting re-calculated based on current real-time occupancy.")}><FaRedo /> Re-Calculate</button></h4>
                <p style={{ fontSize: "13px", color: "#94a3b8" }}>Predicted sequential vehicle arrival profile for peak operational windows:</p>
                <div className="ai-forecast-bar">
                  <div className="forecast-col"><div className="forecast-bar-fill" style={{ height: "40%" }}></div><span className="forecast-time">9 AM (40%)</span></div>
                  <div className="forecast-col"><div className="forecast-bar-fill" style={{ height: "65%" }}></div><span className="forecast-time">10 AM (65%)</span></div>
                  <div className="forecast-col"><div className="forecast-bar-fill" style={{ height: "88%" }}></div><span className="forecast-time">11 AM (88%)</span></div>
                  <div className="forecast-col"><div className="forecast-bar-fill" style={{ height: "98%", background: "linear-gradient(180deg, #ff004c, #ffaa00)" }}></div><span className="forecast-time">12 PM (98%)</span></div>
                  <div className="forecast-col"><div className="forecast-bar-fill" style={{ height: "55%" }}></div><span className="forecast-time">1 PM (55%)</span></div>
                </div>
              </div>
              <div className="panel-card">
                <h4><FaHistory /> Predictive Queue Dwell Time</h4>
                <div style={{ background: "rgba(0,0,0,0.3)", padding: "15px", borderRadius: "10px", marginBottom: "15px" }}>
                  <p style={{ fontSize: "13px", marginBottom: "6px" }}>Next Hour Volatility Index: <b style={{ color: "var(--accent-cyan)" }}>94% Probability Peak</b></p>
                  <p style={{ fontSize: "13px" }}>Recommended Dynamic Reserve Capacity: <b style={{ color: "#00ff88" }}>2 Bays Free</b></p>
                </div>
                <div style={{ background: "rgba(0,0,0,0.3)", padding: "15px", borderRadius: "10px" }}>
                  <h5 style={{ color: "var(--accent-cyan)", marginBottom: "8px" }}>Vehicle Queue Projections:</h5>
                  <p style={{ fontSize: "12.5px", color: "#cbd5e1", marginBottom: "4px" }}>• Target-A (SoC 46%): <b>~28 mins to full charge</b></p>
                  <p style={{ fontSize: "12.5px", color: "#cbd5e1" }}>• Target-B (SoC 15%): <b>~52 mins to full charge (Priority Swap Advisable)</b></p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAGE 5: DYNAMIC SWAP ==================== */}
        {page === "exchange" && (
          <div className="page-section active">
            <div className="panel-card">
              <h4><FaExchangeAlt /> Priority Dynamic Power Slot Exchange Protocol</h4>
              <blockquote style={{ fontSize: "13px", color: "#94a3b8", borderLeft: "3px solid var(--accent-purple)", paddingLeft: "15px", margin: "15px 0" }}>
                <b>Patent Innovation:</b> Automatically reallocates charging coil energization between high-charged donors and critically depleted recipient vehicles to protect the power grid.
              </blockquote>
              <div className="exchange-box">
                <div className="node-box donor">
                  <h5 style={{ color: "var(--accent-cyan)", marginBottom: "6px" }}>High Charged Donor</h5>
                  <p style={{ fontSize: "13px", fontWeight: "700" }}>{slotsData[1]?.vehicle || "Target-A"}</p>
                  <h2 style={{ color: "var(--accent-cyan)", margin: "8px 0" }}>{slotsData[1]?.battery || 90}%</h2>
                  <small style={{ color: "#94a3b8" }}>Slot 02 Inductor</small>
                </div>
                <FaExchangeAlt className="swap-arrow-icon" />
                <div className="node-box recipient">
                  <h5 style={{ color: "#00ff88", marginBottom: "6px" }}>Depleted Recipient</h5>
                  <p style={{ fontSize: "13px", fontWeight: "700" }}>{slotsData[3]?.vehicle || "Target-B"}</p>
                  <h2 style={{ color: "#00ff88", margin: "8px 0" }}>{slotsData[3]?.battery || 15}%</h2>
                  <small style={{ color: "#94a3b8" }}>Slot 04 Inductor</small>
                </div>
              </div>
              <div style={{ textAlign: "center", marginTop: "20px" }}>
                <button className="btn-action btn-swap" style={{ padding: "12px 28px", fontSize: "14px" }} onClick={requestSwap}>
                  <FaCheckDouble /> Accept Optimization Swap Now
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAGE 6: SELF-HEALING ==================== */}
        {page === "healing" && (
          <div className="page-section active">
            <div className="panel-card">
              <h4><span><FaMedkit /> Autonomous Self-Healing Protection Sequencer</span> <button className="btn-action btn-heal" onClick={resetProtections}><FaRedo /> Reset Interlocks</button></h4>
              <div className="pipeline-row">
                <div className={`pipe-step ${selfHealingActive ? "faulted" : "active"}`}>
                  <div className="pipe-icon" style={{ color: "var(--accent-cyan)" }}><FaThermometerHalf /></div>
                  <h5 style={{ marginBottom: "4px" }}>Step 1: Sensor Trip</h5>
                  <p style={{ fontSize: "11px", color: "#94a3b8" }}>Continuous thermal check for &gt; {settings.tempCutoff}°C cutoff.</p>
                </div>
                <div className="pipe-step active">
                  <div className="pipe-icon" style={{ color: "var(--accent-blue)" }}><FaRobot /></div>
                  <h5 style={{ marginBottom: "4px" }}>Step 2: AI Isolation</h5>
                  <p style={{ fontSize: "11px", color: "#94a3b8" }}>Isolates thermal cascading risk automatically.</p>
                </div>
                <div className={`pipe-step ${selfHealingActive ? "active" : ""}`}>
                  <div className="pipe-icon" style={{ color: "var(--accent-yellow)" }}><FaPlugCircleXmark /></div>
                  <h5 style={{ marginBottom: "4px" }}>Step 3: Auto Mitigation</h5>
                  <p style={{ fontSize: "11px", color: "#94a3b8" }}>Relay de-energized. Current cut to 0.0A.</p>
                </div>
                <div className={`pipe-step ${selfHealingActive ? "active" : ""}`}>
                  <div className="pipe-icon" style={{ color: "#00ff88" }}><FaRoute /></div>
                  <h5 style={{ marginBottom: "4px" }}>Step 4: Re-Routing</h5>
                  <p style={{ fontSize: "11px", color: "#94a3b8" }}>Vehicles redirected to healthy secondary bay.</p>
                </div>
              </div>
              <div style={{ marginTop: "20px", display: "flex", gap: "12px" }}>
                <button className="btn-action btn-fault" onClick={triggerThermalFault}><FaThermometerHalf /> Inject 52°C Fault on Slot 03</button>
                <button className="btn-action btn-heal" onClick={resetProtections}><FaRedo /> Cool Down & Restore Relays</button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAGE 7: ANALYTICS ==================== */}
        {page === "analytics" && (
          <div className="page-section active">
            <div className="grid-2">
              <div className="panel-card">
                <h4><FaChartPie /> Multi-Bay Space Allocation</h4>
                <div style={{ height: "280px" }}><Bar data={barData} options={{ responsive: true, maintainAspectRatio: false }} /></div>
              </div>
              <div className="panel-card">
                <h4><FaHeartbeat /> Multi-Axis Operational Radar</h4>
                <div style={{ height: "280px" }}><Radar data={radarData} options={{ responsive: true, maintainAspectRatio: false }} /></div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAGE 8: MACHINE LOGS ==================== */}
        {page === "logs" && (
          <div className="page-section active">
            <div className="panel-card">
              <h4>
                <span><FaHistory /> Transaction Event Log Journal</span>
                <div>
                  <button className="btn-action" style={{ background: "rgba(255,255,255,0.08)", fontSize: "12px" }} onClick={exportCSV}>
                    <FaDownload /> Export CSV
                  </button>
                  <button className="btn-action" style={{ background: "rgba(255,0,76,0.2)", color: "var(--accent-red)", fontSize: "12px", marginLeft: "8px" }} onClick={clearLogs}>
                    <FaTrash /> Clear
                  </button>
                </div>
              </h4>
              <table className="custom-table" style={{ marginTop: "15px" }}>
                <thead><tr><th>Event Action</th><th>Nodes Active</th><th>Timestamp</th><th>Status</th></tr></thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={i}>
                      <td>{log.action}</td>
                      <td>{log.cars} Units Active</td>
                      <td>{log.time}</td>
                      <td><span className="badge-pill badge-live" style={{ fontSize: "9px", padding: "2px 6px" }}>COMPLETED</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== PAGE 9: SETTINGS ==================== */}
        {page === "settings" && (
          <div className="page-section active">
            <div className="panel-card" style={{ maxWidth: "650px" }}>
              <h4><FaSlidersH /> Hardware Thresholds & Calibration</h4>
              <form onSubmit={saveCalibration} style={{ display: "flex", flexDirection: "column", gap: "15px", marginTop: "20px" }}>
                <div>
                  <label style={{ fontSize: "13px", color: "#94a3b8", display: "block", marginBottom: "6px" }}>Coil Cutoff Temperature Threshold (°C):</label>
                  <input
                    type="number"
                    value={settings.tempCutoff}
                    onChange={(e) => setSettings({ ...settings, tempCutoff: Number(e.target.value) })}
                    style={{ width: "100%", padding: "10px 14px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "8px" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "13px", color: "#94a3b8", display: "block", marginBottom: "6px" }}>Max Amperage Overload Limit (Amps):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={settings.maxCurrent}
                    onChange={(e) => setSettings({ ...settings, maxCurrent: Number(e.target.value) })}
                    style={{ width: "100%", padding: "10px 14px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "8px" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "13px", color: "#94a3b8", display: "block", marginBottom: "6px" }}>Parking Bay Hardware Capacity:</label>
                  <input
                    type="number"
                    value={settings.capacity}
                    onChange={(e) => setSettings({ ...settings, capacity: Number(e.target.value) })}
                    style={{ width: "100%", padding: "10px 14px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "8px" }}
                  />
                </div>
                <div style={{ marginTop: "10px", display: "flex", gap: "12px" }}>
                  <button type="submit" className="btn-action btn-entry"><FaCheckDouble /> Save Calibration</button>
                  <button type="button" className="btn-action btn-exit" onClick={triggerThermalFault}><FaThermometerHalf /> Test Emergency Trip</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== PAGE 10: MOBILE APP VIEW ==================== */}
        {page === "mobile" && (
          <div className="page-section active">
            <div style={{ textAlign: "center", marginBottom: "10px" }}>
              <h4 style={{ color: "var(--accent-cyan)" }}><FaMobileAlt /> Driver Companion Mobile App Simulator</h4>
              <p style={{ fontSize: "12.5px", color: "#94a3b8" }}>Simulates user mobile reservation, wireless charge status, and dynamic swap authorization.</p>
            </div>
            <div className="phone-chassis">
              <div className="phone-notch"></div>
              <div className="phone-body">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                  <b style={{ color: "var(--accent-cyan)", fontSize: "14px" }}>Smart EV Pass</b>
                  <span style={{ fontSize: "11px", color: "#00ff88" }}>🔋 88%</span>
                </div>

                <div style={{ background: "rgba(255,255,255,0.04)", padding: "12px", borderRadius: "12px", marginBottom: "15px", display: "flex", justifyContent: "space-between", alignItem: "center" }}>
                  <div>
                    <small style={{ color: "#94a3b8", fontSize: "10px" }}>OPTIMAL BAY</small>
                    <h5 style={{ color: "#fff" }}>Slot 01 (Free)</h5>
                  </div>
                  <button className="btn-action btn-entry" style={{ padding: "5px 12px", fontSize: "11px" }} onClick={triggerEntry}>Reserve</button>
                </div>

                <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-color)", borderRadius: "14px", padding: "15px", textAlign: "center", marginBottom: "15px" }}>
                  <span style={{ fontSize: "11px", color: "#94a3b8" }}>LIVE INDUCTIVE CHARGE</span>
                  <div className="phone-meter">⚡ {slotsData[1]?.battery || 46}%</div>
                  <p style={{ fontSize: "11px", color: "#00ff88" }}>Magnetic Coupling Active</p>
                </div>

                <div style={{ background: "rgba(153, 51, 255, 0.15)", border: "1px solid var(--accent-purple)", borderRadius: "12px", padding: "12px", marginBottom: "15px" }}>
                  <h6 style={{ color: "#fff", fontSize: "11px", marginBottom: "4px" }}>🔔 Grid Swap Request</h6>
                  <p style={{ fontSize: "10.5px", color: "#cbd5e1", marginBottom: "8px" }}>Allow space exchange to help thermally balance the charging grid?</p>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button className="btn-action btn-swap" style={{ padding: "4px 10px", fontSize: "10px", flex: 1 }} onClick={requestSwap}>Approve</button>
                    <button className="btn-action" style={{ padding: "4px 10px", fontSize: "10px", background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={() => alert('Swap declined')}>Deny</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// Icon helper wrapper
function FaDiagramProject() {
  return <FaServer style={{ color: "var(--accent-cyan)", marginRight: "8px" }} />;
}

export default App;