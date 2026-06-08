# SARA — Sustainable Analytics Recycling Assistant

Scan waste items with AI to identify materials, learn proper disposal methods, and earn points. SARA helps campuses and organizations make recycling smarter with real-time waste intelligence dashboards, a community feed, and organization-level management.

## Features

- **Material Identifier** — Snap a photo or upload an image; AI (Gemini/Groq) classifies the material and tells you whether it's recyclable
- **Campus Waste Intelligence** — Interactive Leaflet map with heatmaps and marker clusters, Chart.js analytics, and time-filtered scan stats per organization
- **Disposal Guide** — Filterable guide for every waste category with local disposal instructions
- **Community Feed** — Share tips, wins, and questions; like and comment on posts
- **Points & Gamification** — Earn 10 points per scan, track your total
- **Organization Management** — Register a campus/company, get a join code, manage bins, view member scan history via an admin panel
- **AI Chat** — Ask SARA recycling questions via Socket.io chat widget
- **Fully Responsive** — Works on phones, tablets, and desktops with a collapsible hamburger nav

## Tech Stack

- **Backend**: Node.js, Express 5, Socket.io (WebSocket)
- **Frontend**: Vanilla HTML/CSS/JS, Leaflet, Chart.js
- **AI**: Gemini Vision API / Groq for image analysis and chat
- **Database**: Firebase Firestore (organizations, bins, scans, community posts)
- **Auth**: JWT-based admin authentication, bcrypt password hashing

## Getting Started

```bash
npm install
npm start
```

The app runs at `http://localhost:3000`.

### Environment Variables

Copy `.env.example` (or create `.env`) with:

```
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
JWT_SECRET=your_jwt_secret
```

Firebase credentials are loaded from a service-account JSON file configured in `utils/firebase-admin.js`.

## Deployment

Supports one-click deploys via **Render** (`render.yaml`), **Vercel** (`vercel.json`), **Netlify** (`.netlify/`), or **Docker** (`Dockerfile`).

## Project Structure

```
├── public/            # Static frontend (9 pages)
│   ├── index.html     # Landing page
│   ├── scanner.html   # Material identifier
│   ├── dashboard.html # Campus waste intelligence
│   ├── disposal.html  # Disposal guide
│   ├── community.html # Community feed
│   ├── join.html      # Join an organization
│   ├── org-register.html  # Register organization
│   ├── admin-login.html   # Admin login
│   ├── admin-panel.html   # Admin control panel
│   ├── css/styles.css     # All styles
│   └── js/                # Per-page scripts + shared nav.js
├── routes/            # Express route handlers
├── utils/             # Firebase admin, Gemini/Groq clients
├── middleware/        # Auth middleware
├── server.js          # Entry point
└── docs/              # Specs and implementation plans
```