# Nexus Banking - Multi-User Banking System

A production-ready multi-user banking prototype with priority-based transaction processing, time-lock system for high-value transfers, and secure admin/customer flows.

## Features

- **Priority Queue Processing**: Weighted priority based on urgency, tier, and risk
- **Aging Mechanism**: Prevents transaction starvation
- **Time-Lock System**: 30-second delay for transfers > ₹10,000
- **Real-time Updates**: WebSocket-powered live dashboard
- **OTP Verification**: Mock SMS/email for account creation
- **Admin Dashboard**: Queue visualization, account management, manual transaction completion
- **Customer Dashboard**: Balance view, transfers, transaction history

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose

### 1. Start Infrastructure
```bash
docker-compose up -d
```

### 2. Setup Backend
```bash
cd backend
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

### 3. Setup Frontend
```bash
cd frontend
npm install
npm run dev
```

### 4. Access the Application
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000

## Demo Credentials

| Role | Account Number | PIN |
|------|---------------|-----|
| Admin | 000000000001 | 1234 |
| Customer (Basic) | 202602051001 | 1234 |
| Customer (Premium) | 202602051002 | 1234 |
| Customer (VIP) | 202602051003 | 1234 |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  Login │ Customer Dashboard │ Admin Dashboard            │
└─────────────────────┬───────────────────────────────────┘
                      │ REST + WebSocket
┌─────────────────────▼───────────────────────────────────┐
│                  Backend (Express.js)                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐    │
│  │   REST API  │ │  Socket.IO  │ │     Workers     │    │
│  └─────┬───────┘ └──────┬──────┘ └────────┬────────┘    │
│        │                │                  │             │
│  ┌─────▼────────────────▼──────────────────▼─────────┐  │
│  │                   Services                         │  │
│  │  Auth │ Account │ Transaction │ Queue │ Timelock  │  │
│  └───────────────────────┬───────────────────────────┘  │
└──────────────────────────┼──────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌──────────┐     ┌───────────┐     ┌───────────┐
   │PostgreSQL│     │   Redis   │     │  Workers  │
   │ Accounts │     │ Queues    │     │ Timelock  │
   │   Txns   │     │ Locks     │     │  Aging    │
   └──────────┘     └───────────┘     └───────────┘
```

## Priority Formula

```
BasePriority = (Urgency × 2.0) + (Tier × 1.5) - (Risk × 0.5)

Where:
- Urgency: NORMAL=1, EMI=3, MEDICAL=5
- Tier: BASIC=0, PREMIUM=2, VIP=4
- Risk: 0-10

EffectivePriority = BasePriority + (WaitSeconds × 0.1)
```

## API Endpoints

### Auth
- `POST /api/auth/admin/login` - Admin login

### Customer
- `POST /api/customer/login` - Customer login
- `POST /api/customer/pin/set` - First-time PIN setup
- `GET /api/customer/account` - Get account details
- `POST /api/customer/transfer` - Initiate transfer
- `GET /api/customer/transactions` - Transaction history

### Admin
- `POST /api/admin/accounts` - Create account
- `GET /api/admin/accounts` - List accounts
- `GET /api/admin/queues` - Queue status
- `GET /api/admin/pending` - Pending transactions
- `POST /api/admin/transactions/:id/complete` - Complete transaction
- `POST /api/admin/transactions/:id/cancel` - Cancel transaction

### OTP
- `POST /api/otp/send` - Send OTP
- `POST /api/otp/verify` - Verify OTP

## Environment Variables

See `.env.example` for all configuration options.

## Deployment

Recommended: **Railway** (includes PostgreSQL + Redis)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

## License

MIT
