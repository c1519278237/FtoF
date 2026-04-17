# Interview Guide

An AI-assisted interview practice platform with resume analysis, mock interviews, voice interviews, video interview preview, interview scheduling, and knowledge base Q&A.

## Features

- Resume upload and analysis
- Text mock interview
- Voice mock interview with real-time WebSocket interaction
- Video interview page with camera preview and integrated voice interview flow
- Interview history and evaluation reports
- Interview schedule management
- Knowledge base management and RAG-style Q&A

## Tech Stack

### Backend

- Java 21
- Spring Boot
- Spring AI
- PostgreSQL + pgvector
- Redis + Redisson
- WebSocket
- Gradle

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Framer Motion

## Project Structure

```text
.
├── app/                  # Spring Boot backend
├── frontend/             # React frontend
├── docker/               # Docker-related initialization files
├── docs/                 # Optional project docs
├── docker-compose.yml    # Full local deployment
└── docker-compose.dev.yml
```

## Local Development

### 1. Prepare environment variables

Copy the example file and fill in your own keys:

```bash
cp .env.example .env
```

At minimum, set:

- `AI_BAILIAN_API_KEY`

Do not commit your real `.env` file.

### 2. Start dependencies only

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 3. Start backend

```bash
./gradlew.bat :app:bootRun
```

Backend runs at:

- `http://localhost:8080`

### 4. Start frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Frontend runs at:

- `http://localhost:5173`

## Docker Deployment

To start the full stack:

```bash
docker compose up -d --build
```

This brings up:

- PostgreSQL
- Redis
- Object storage service
- Backend service
- Frontend service

Frontend default entry:

- `http://localhost`

## Publishing Notes

Before pushing this project to GitHub:

- Keep `.env` local only
- Replace all real API keys with placeholders
- Review `LICENSE` and ensure your publication method is compatible with it
- Check project descriptions, screenshots, and branding so they match your own repository

## License

This repository includes a `LICENSE` file at the project root. Review it before redistributing or publishing modified versions of the project.
