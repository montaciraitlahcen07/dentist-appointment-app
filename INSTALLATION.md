# DentaCare Clinic - Installation & Setup Guide

## Overview
This dental clinic website has been enhanced with:
- **Security**: Input validation, rate limiting, XSS protection, Helmet headers
- **Database**: PostgreSQL schema with connection pooling and migrations
- **Performance**: Gzip compression, HTTP caching, lazy loading
- **Accessibility**: Large CTAs for seniors, keyboard navigation, high contrast
- **SEO**: Schema.org markup, Open Graph tags, sitemap.xml, robots.txt
- **UX**: Double CTA buttons, calendar click modal, bigger interactive elements

---

## Prerequisites
- Node.js 16+ installed
- Neon PostgreSQL project created and accessible

---

## Installation Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Edit the `.env` file with your Neon connection string:
```env
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
DB_MAX_CONNECTIONS=10
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
OWNER_USERNAME=admin
OWNER_PASSWORD=change-me
SESSION_SECRET=replace-this-with-a-long-random-secret
```

### 3. Create PostgreSQL Database
Create the database in Neon first, then run the schema manually.
```bash
psql "postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require" -f schema.sql
```

### 4. Start the Server
```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start at `http://localhost:3000`

### 5. Deploy to Vercel
This repo is already structured for Vercel with [`vercel.json`](./vercel.json) routing all requests through the Express app in [`api/index.js`](./api/index.js).

Set these environment variables in the Vercel project:
```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
DB_MAX_CONNECTIONS=10
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
CORS_ORIGINS=https://your-project.vercel.app
OWNER_USERNAME=admin
OWNER_PASSWORD=change-me
SESSION_SECRET=replace-this-with-a-long-random-secret
```

Then deploy with one of these options:
```bash
# First deployment
npx vercel

# Production deployment
npx vercel --prod
```

Or import the Git repository in the Vercel dashboard and add the same environment variables there before deploying.

---

## Features Implemented

### Security
- Input validation (email, phone, date formats)
- Rate limiting (100 req/15min for API, 10 booking attempts/hour)
- XSS sanitization on all user inputs
- Helmet security headers (CSP, HSTS)
- CORS with restricted origins
- Prepared statements (SQL injection protection)

### Database (PostgreSQL)
- Connection pooling via `pg` with sane defaults
- Indexed tables for faster lookups plus a unique slot constraint
- Automatic table bootstrap in `initializeDatabase`
- Optimized for Neon / externally managed PostgreSQL databases
- Graceful shutdown handling

### Performance
- Gzip compression
- Static file caching (1 day)
- Lazy loading images
- Deferred JavaScript loading
- Preloaded Google Fonts

### Accessibility (Seniors 60+)
- Extra-large CTA buttons (60px+ height, 18px+ font)
- Big calendar cells (50px minimum)
- Large time slot buttons (56px height)
- High contrast colors (WCAG AA)
- Keyboard navigation support
- Focus indicators
- Reduced motion support

### SEO
- Schema.org JSON-LD (LocalBusiness/Dentist)
- Open Graph meta tags
- Twitter Card tags
- sitemap.xml
- robots.txt
- Canonical URLs
- Proper heading hierarchy

### UX Improvements
- Two clear CTA sections in hero
- Date info modal on calendar click
- Availability indicator
- Larger form inputs
- Clear booking summary

---

## File Structure
```
dentist-clinic/
├── .env                 # Environment variables
├── .gitignore          # Git ignore file
├── INSTALLATION.md     # This file
├── package.json        # Dependencies
├── schema.sql          # PostgreSQL schema
├── server.js           # Express server
└── public/
    ├── index.html      # Main HTML (SEO enhanced)
    ├── style.css       # Styles (accessibility enhanced)
    ├── script.js       # JavaScript (modal added)
    ├── robots.txt      # SEO robots file
    └── sitemap.xml     # SEO sitemap
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Health check |
| GET | /api/appointments | All appointments |
| GET | /api/appointments/:date | Appointments by date |
| POST | /api/appointments | Create appointment |
| DELETE | /api/appointments/:id | Cancel appointment |
| GET | /api/booked-times/:date | Booked times for date |

---

## Troubleshooting

### PostgreSQL Connection Fails
The server exits if it cannot connect. Double-check `DATABASE_URL`, make sure it includes `sslmode=require`, and verify it with:
```bash
psql "postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require"
```

### Port Already in Use
Change the PORT in `.env` file:
```env
PORT=3001
```

### CORS Errors
Add your frontend URL to CORS_ORIGINS in `.env`:
```env
CORS_ORIGINS=http://localhost:3000,http://your-frontend:port
```

---

## Browser Support
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

---

## License
© 2026 DentaCare Clinic. All rights reserved.
