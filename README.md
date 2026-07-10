# 🚨 SecureOcte – Real-Time Safety & Alert Processing System

SecureOcte is a **real-time personal safety platform** designed to detect, process, and respond to user safety events with **low latency and high reliability**.

The system combines **on-device intelligence (edge computing)** with a **distributed backend architecture** to ensure alerts are generated instantly and handled reliably—even under poor network conditions.

---

## 🧠 System Overview

SecureOcte follows a **hybrid edge + cloud architecture**:

* 📱 **Mobile App (Edge Layer)**
  Performs real-time detection using sensor fusion and route deviation logic

* ⚙️ **Backend (Processing Layer)**
  Handles alert ingestion, queue-based processing, dispatch, and reliability

* 🖥️ **Dashboard (Control Layer)**
  Provides live monitoring, alert lifecycle management, and operator control

---

## 🏗️ Architecture

```
Mobile App (Edge)
   ↓
API Layer (Auth + Rate Limit)
   ↓
Queue System (Redis + BullMQ)
   ↓
Worker Pipeline (Async Processing)
   ↓
Dispatch & Notification System
   ↓
Monitoring Dashboard
```

---

## 📱 Mobile App (Edge Intelligence)

Located in: `mobile-app/`

### Key Features:

* 🔍 **Sensor Fusion-Based Detection**
  Combines location and device signals for real-time safety evaluation

* 📍 **Route Deviation Detection**
  Detects abnormal movement using threshold-based logic

* 🚨 **Manual + Automatic SOS Triggering**
  Multi-signal validation to reduce false positives

* 📡 **Adaptive GPS Polling (~5s)**
  Balances accuracy with battery and performance constraints

* 🌐 **Offline/Low-Network Handling**
  Alerts can be triggered even with unstable connectivity

---

## ⚙️ Backend (Event-Driven System)

Located in: `backend/`

### Core Features:

* ⚡ **Queue-Based Architecture (BullMQ + Redis)**
  Decouples alert ingestion from processing

* 🔁 **Retry + Exponential Backoff**
  Ensures fault-tolerant processing

* 🧠 **Idempotent Alert Handling**
  Prevents duplicate panic triggers

* 📊 **Backpressure Control**
  Protects system under high load

* 🔐 **Security Middleware**

  * JWT Authentication
  * Replay Protection
  * GPS Validation
  * Anomaly Detection

* 📡 **Distributed Rate Limiting**
  Prevents abuse and ensures fairness

* 🔄 **Event-Driven Worker Pipeline**
  Handles alert processing, dispatch logic, and analytics

---

## 🖥️ Dashboard (Control Panel)

Located in: `dashboard/`

The dashboard is a **lightweight HTML-based control interface** used for real-time monitoring and operational control.

### Features:

* 📡 **Live Alert Monitoring**
  Displays incoming alerts and user activity in real time

* 🔁 **Alert Lifecycle Management**

  * New → Acknowledged → Resolved

* 📌 **Priority Handling (Pinning System)**
  Highlights critical alerts for operators

* 🎯 **Action Controls**

  * Track user
  * Call user
  * Start stream
  * Forward to authorities
  * Mark alert as resolved

* 🗺️ **Map Integration (Google Maps API)**
  Visualizes user location and movement

### Notes:

* Built as a **static HTML + JavaScript interface**
* Communicates directly with backend APIs
* Designed for **low overhead and fast loading in control environments**


## 🔐 Design Principles

* ⚡ **Low Latency** → Critical detection happens on-device
* 🔁 **Reliability First** → Queue + retry ensures delivery
* 🧠 **Edge + Cloud Hybrid** → Best of both worlds
* 🔒 **Security by Design** → Validation, rate limiting, replay protection
* 📉 **Load Optimization** → Backend processes only meaningful alerts

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/SecureOcte.git
cd SecureOcte
```

---

### 2. Setup Backend

```bash
cd backend
npm install
```

Create `.env` file:

```
MONGO_URI=
CORS_ORIGIN=http://localhost:4000
GOOGLE_MAPS_KEY=
PUBLIC_BASE_URL=
GEMINI_API_KEY=
GOOGLE_SPEECH_API_KEY=
REDIS_URL=
JWT_SECRET=
ADMIN_USERNAME=
ADMIN_PASSWORD=
```

Run:

```bash
npm start
```

---

### 3. Run Mobile App

```bash
cd mobile-app
npm install
npx expo start
```
---

## 📦 Tech Stack

* **Frontend (Mobile):** React Native (Expo)
* **Backend:** Node.js, Express
* **Database:** MongoDB Atlas
* **Queue System:** Redis + BullMQ
* **Realtime:** WebSockets
* **Security:** JWT, Rate Limiting, Validation

---

## 📊 Key Engineering Highlights

* Hybrid **edge + cloud architecture**
* Real-time **event-driven system design**
* **Queue-based processing pipeline**
* **Fault-tolerant backend with retries and backpressure**
* **On-device intelligence for latency-critical decisions**

---

## 📌 Future Improvements

* Dead-letter queue for failed jobs
* Advanced dispatch (geo-based nearest unit selection)
* Multi-region deployment
* AI-based anomaly detection

---

## 👤 Author

**Manne Nikhil**
Full Stack and product Engineer

---
