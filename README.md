# 🛍️ Shopify SEO Auditor

**SaaS Platform for Automated Shopify Store SEO Audits**

## 🎯 Features

### 🔍 SEO Analysis
- **Performance Metrics** (Lighthouse scores)
- **HTML Structure** (meta tags, headings, images)
- **Mobile Responsiveness** 
- **Shopify-specific** (apps, theme, structured data)
- **Security** (SSL, HTTP headers)

### 💰 Pricing Plans
- **Single Audit** : 9.99€
- **Pack of 5** : 39.99€ (20% discount)
- **Pack of 20** : 149.99€ (25% discount)
- **Unlimited Monthly** : 299.99€
- **Agency Plan** : 499.99€

### 📊 Reports
- **PDF Export** with detailed analysis
- **Actionable recommendations**
- **Competitor comparison**
- **Historical tracking**

## 🏗️ Architecture

### Tech Stack
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Cache/Queue**: Redis + Bull
- **Payments**: Stripe API
- **SEO Analysis**: Lighthouse + Puppeteer
- **PDF Generation**: Puppeteer
- **Email**: Resend
- **Storage**: Backblaze B2 / S3

### Infrastructure
- **Docker** containerization
- **Nginx** reverse proxy
- **Let's Encrypt** SSL
- **GitHub Actions** CI/CD
- **Prometheus + Grafana** monitoring

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### Local Development
```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/shopify-seo-auditor.git
cd shopify-seo-auditor

# Copy environment variables
cp .env.example .env

# Start with Docker
docker-compose up -d

# Or run locally
npm run dev:backend
npm run dev:frontend
```

### Environment Variables
```env
# Application
NODE_ENV=development
PORT=3001
APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/shopify_auditor

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your_jwt_secret_here

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# External APIs
GOOGLE_PAGESPEED_API_KEY=your_key
LIGHTHOUSE_API_KEY=your_key

# Email
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_password
EMAIL_FROM=audits@yourdomain.com

# Storage
S3_ENDPOINT=https://s3.eu-west-1.amazonaws.com
S3_REGION=eu-west-1
S3_BUCKET=shopify-audits
S3_ACCESS_KEY=your_key
S3_SECRET_KEY=your_secret
```

## 📁 Project Structure

```
shopify-seo-auditor/
├── backend/                 # Node.js API
│   ├── src/
│   │   ├── config/         # Configuration
│   │   ├── controllers/    # Route controllers
│   │   ├── middleware/     # Express middleware
│   │   ├── models/         # Database models
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── utils/          # Utilities
│   │   └── index.ts        # Entry point
│   ├── prisma/             # Database schema
│   ├── tests/              # Unit tests
│   └── package.json
├── frontend/               # Next.js application
│   ├── src/
│   │   ├── app/           # App router pages
│   │   ├── components/    # React components
│   │   ├── lib/          # Utilities & hooks
│   │   └── styles/       # Tailwind CSS
│   └── package.json
├── workers/               # Background workers
│   ├── seo-worker/       # SEO analysis worker
│   └── pdf-worker/       # PDF generation worker
├── docker-compose.yml    # Docker configuration
├── nginx/               # Nginx configuration
├── monitoring/          # Prometheus + Grafana
└── docs/               # Documentation
```

## 🔧 Development

### Backend Commands
```bash
cd backend

# Install dependencies
npm install

# Development
npm run dev

# Build
npm run build

# Database
npm run db:migrate
npm run db:generate
npm run db:seed

# Tests
npm test
```

### Frontend Commands
```bash
cd frontend

# Install dependencies
npm install

# Development
npm run dev

# Build
npm run build

# Production
npm start
```

## 🐳 Docker Deployment

### Production
```bash
# Build and start all services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Development
```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# Rebuild containers
docker-compose build --no-cache
```

## 📊 Database Schema

### Main Tables
- **users** - Platform users
- **audits** - SEO audit records
- **audit_results** - Detailed audit metrics
- **subscriptions** - User subscriptions
- **payments** - Payment records

### Relationships
```
users (1) ── (many) audits
users (1) ── (many) subscriptions
users (1) ── (many) payments
audits (1) ── (many) audit_results
subscriptions (1) ── (many) payments
```

## 🔐 Security

### Implemented
- **JWT Authentication** with refresh tokens
- **Rate Limiting** per IP/user
- **CORS** with allowed origins
- **Helmet.js** security headers
- **Input Validation** with Zod
- **SQL Injection Prevention** (Prisma)
- **XSS Protection**

### To Do
- **2FA** for admin accounts
- **IP Whitelisting** for admin panel
- **Audit Logging** for sensitive actions
- **DDoS Protection** (Cloudflare)

## 📈 Monitoring

### Metrics Collected
- **API Response Times**
- **Error Rates**
- **Database Query Performance**
- **Redis Cache Hit Rate**
- **Queue Processing Times**
- **User Activity**

### Alerts
- **High Error Rate** (>5%)
- **Slow Response Time** (>2s)
- **Database Connection Issues**
- **Payment Processing Failures**
- **Low Available Credits**

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is proprietary and confidential.

## 📞 Support

For support, email: support@yourdomain.com

---

**Built with ❤️ for Shopify store owners**