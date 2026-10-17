# Arduino / ESP32 Hardware Integration Guide

This directory contains the firmware for the **Smart Parking System with Wireless EV Charging**.

## File: `smart_parking_ev.ino`

### Pin Mapping

| Component | Arduino Pin | Description |
|-----------|-------------|-------------|
| Entry Gate Ultrasonic TRIG | Pin 2 | Emits 40kHz sonic burst |
| Entry Gate Ultrasonic ECHO | Pin 3 | Receives echo pulse |
| Exit Gate Ultrasonic TRIG | Pin 4 | Exit trigger pulse |
| Exit Gate Ultrasonic ECHO | Pin 5 | Exit echo pulse |
| Slot 01 Proximity Sensor | Pin 6 | Detects vehicle parked in Slot 1 |
| Slot 02 Proximity Sensor | Pin 7 | Detects vehicle parked in Slot 2 |
| Slot 03 Proximity Sensor | Pin 8 | Detects vehicle parked in Slot 3 |
| Slot 04 Proximity Sensor | Pin 11 | Detects vehicle parked in Slot 4 |
| Entry Servo Barrier Motor | Pin 9 | PWM Signal to Entrance Gate Barrier |
| Exit Servo Barrier Motor | Pin 10 | PWM Signal to Exit Gate Barrier |
| Wireless Charging Coil Relay 1 | Pin A0 | Energizes Wireless Inductive Pad 1 |
| Wireless Charging Coil Relay 2 | Pin A1 | Energizes Wireless Inductive Pad 2 |
| Wireless Charging Coil Relay 3 | Pin A2 | Energizes Wireless Inductive Pad 3 |
| Wireless Charging Coil Relay 4 | Pin A3 | Energizes Wireless Inductive Pad 4 |
| Temperature Sensor (LM35 / NTC)| Pin A4 | Real-time coil thermal monitoring |
| Alert Buzzer | Pin 12 | Sounds on entry, exit, or full parking alert |
| Status LED | Pin 13 | System heartbeat indicator |
| RFID RC522 SS (SDA) | Pin 53 (Mega) / Pin 10 (Uno) | SPI Slave Select |
| RFID RC522 RST | Pin 49 (Mega) / Pin 9 (Uno) | Reset pin |

### Required Libraries (Install via Arduino IDE Library Manager)
1. `Servo` by Michael Margolis (Built-in)
2. `MFRC522` by GithubCommunity
3. `SPI` (Built-in)

### Serial Protocol
- Baud Rate: `9600 bps`
- Output Events:
  - `ENTRY` (When car arrives at entry gate)
  - `EXIT` (When car passes exit gate)
  - `{"slotId": 1, "temp": 32, "type": "Charging", "current": 1.8}` (JSON telemetry packets)
  - `ALARM:THERMAL_CUTOFF:<temp>` (When coil temperature exceeds 45°C)
