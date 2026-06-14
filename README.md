# ResumeXpert

A full-stack resume builder — create, edit, and export professional resumes in minutes.

**Live Demo:** [resumexpert-frontend-6hgd.onrender.com](https://resumexpert-frontend-6hgd.onrender.com)

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| Database | MongoDB (Mongoose) |
| Auth | JWT |
| Storage | Multer (image uploads) |
| AI | Google Gemini API |

---

## Features

- Authentication — sign up / login with JWT
- Create, edit, and delete resumes
- Multiple resume templates
- Profile picture upload
- ATS score analysis powered by the Gemini API, with a heuristic fallback if the AI is unavailable

---

## Project Structure

```
ResumeXpert/
├── backend/       # Express server — routes, controllers, models, middleware
└── frontend/      # React + Vite app — components, pages, utilities
```

---

## Getting Started

### Prerequisites

- Node.js v16+
- MongoDB instance (local or Atlas)

### Backend

```bash
cd ResumeXpert/backend
npm install
cp .env.example .env   # fill in your values
npm run start
```

### Frontend

```bash
cd ResumeXpert/frontend
npm install
cp .env.example .env   # fill in your values
npm run dev
```

---

## Environment Variables

### Backend (`ResumeXpert/backend/.env`)

```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
PORT=4000
GEMINI_API_KEY=your_google_gemini_api_key
```

### Frontend (`ResumeXpert/frontend/.env`)

```env
VITE_API_BASE_URL=http://localhost:4000
```

> In production, set `VITE_API_BASE_URL` to your deployed backend URL.

---

## Contributing

1. Fork the repo
2. Create a feature branch — `git checkout -b feat/your-feature`
3. Commit and push
4. Open a pull request

Run `npm run lint` from `ResumeXpert/frontend` before submitting.

---

## License

This project does not currently specify a license.