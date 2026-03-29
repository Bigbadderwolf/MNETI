# MNETI - M-Pesa Networked Token Infrastructure
 
[![Solana](https://img.shields.io/badge/Built%20on-Solana-blue.svg)](https://solana.com/)
[![Rust](https://img.shields.io/badge/Language-Rust-orange.svg)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
 
**MNETI bridges African mobile money to global DeFi** - enabling seamless conversion of M-Pesa deposits into KESH stablecoins on Solana, with compliance, yield strategies, and cross-border remittance capabilities.
 
## 🌟 Key Features
 
- **🔗 M-Pesa Integration**: Real-time C2B callbacks from Safaricom's Daraja API
- **💰 KESH Stablecoin**: KES-pegged token backed 1:1 by deposited Kenyan shillings
- **📊 Price Oracles**: SIX Financial API for real FX rates and treasury yields
- **🛡️ Compliance Engine**: AML/KYC checks with configurable risk tiers
- **💸 Payment Streams**: Payroll and recurring payment automation
- **🌍 Cross-Border**: FATF-compliant Travel Rule for international transfers
- **📈 Yield Vault**: Automated harvesting from T-bill strategies
- **🔍 Real-Time Monitoring**: Comprehensive logging and transaction tracking
 
## 🏗️ Architecture
 
MNETI consists of **9 Solana programs** working together:
 
### Core Programs
| Program | Description | Key Features |
|---------|-------------|--------------|
| `mneti-kesh` | KESH stablecoin minting | 1:1 KES backing, fee collection |
| `mneti-oracle` | Price feed management | SIX API integration, rate updates |
| `mneti-compliance` | AML/KYC engine | Risk scoring, wallet freezing |
| `mneti-vault` | Yield strategies | T-bill investments, APY calculations |
| `mneti-payments` | Payment streams | Payroll automation, recurring tx |
| `mneti-travel-rule` | Cross-border compliance | VASP communication, PII exchange |
| `mneti-remittance` | FX corridors | Multi-currency swaps, fee routing |
 
### Infrastructure Programs
| Program | Description |
|---------|-------------|
| `mneti-rbac` | Role-based access control |
| `mneti-vault-registry` | Strategy registry |
 
### Data Flow
M-Pesa Deposit → Daraja Callback → Bridge Validation → KESH Mint → On-Chain Record ↓ Compliance Checks → Oracle Updates → Yield Distribution

 
## 🚀 Quick Start
 
### Prerequisites
- **Rust** 1.75+ (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- **Solana CLI** (`sh -c "$(curl -sSfL https://release.solana.com/v1.18.4/install)"`)
- **Anchor** 0.29.0 (`cargo install anchor-cli --git https://github.com/coral-xyz/anchor`)
- **Node.js** 18+ (`curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -`)
 
### Installation
 
```bash
# Clone repository
git clone https://github.com/Bigbadderwolf/MNETI.git
cd MNETI
 
# Install dependencies
npm install
cd backend && npm install && cd ..
cd app && npm install && cd ..
 
# Configure Solana for devnet
solana config set --url devnet
solana airdrop 5
 
# Build programs
anchor build
 
# Deploy to devnet
anchor deploy --provider.cluster devnet
Environment Setup
Create backend/.env:

bash
# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
 
# M-Pesa Daraja (Sandbox)
DARAJA_CONSUMER_KEY=your_sandbox_key
DARAJA_CONSUMER_SECRET=your_sandbox_secret
DARAJA_SHORTCODE=your_shortcode
 
# SIX Financial (Request access)
SIX_API_KEY=your_six_key
SIX_API_BASE_URL=https://web.api.six-group.com/api/findata/v1
 
# Program IDs (from anchor deploy output)
KESH_PROGRAM_ID=your_kesh_program_id
ORACLE_PROGRAM_ID=your_oracle_program_id
COMPLIANCE_PROGRAM_ID=your_compliance_program_id
VAULT_PROGRAM_ID=your_vault_program_id
PAYMENTS_PROGRAM_ID=your_payments_program_id
TRAVEL_RULE_PROGRAM_ID=your_travel_rule_program_id
REMITTANCE_PROGRAM_ID=your_remittance_program_id
Start Services
bash
# Terminal 1: Backend API
cd backend && npm run dev
 
# Terminal 2: Frontend Dashboard
cd app && npm start
 
# Terminal 3: Oracle Relay (in production)
cd backend && npm run oracle:relay
📱 Demo Walkthrough (2 Minutes)
Phase 1: Setup (0:00-0:15)
bash
solana config set --url devnet
solana airdrop 5
anchor build --provider.cluster devnet
anchor deploy --provider.cluster devnet
Phase 2: M-Pesa Deposit (0:15-0:45)
User sends KES 1,000 via M-Pesa
Daraja triggers C2B callback
Backend validates transaction
Oracle fetches KES/USD rate
KESH tokens minted to user's wallet
Phase 3: Payment Streams (0:45-1:15)
Employer creates payroll stream
Employees receive automated payments
Yield harvested from vault strategies
Phase 4: Cross-Border (1:15-2:00)
Travel Rule engine exchanges PII
FATF compliance between VASPs
Multi-currency corridor routing
📚 API Reference
REST Endpoints
Method	Path	Description
GET	/api/health	Service health check
POST	/api/mpesa/callback	M-Pesa C2B webhook
GET	/api/wallet/:address	Wallet state and balance
POST	/api/payroll/create	Create payment stream
GET	/api/oracle/rates	Current FX rates
POST	/api/remittance/quote	Get FX quote
Program Instructions
KESH Program
rust
// Mint KESH (split into 2 steps to avoid stack overflow)
create_bridge_deposit(kes_amount, mpesa_ref)
execute_mint(mpesa_ref)
 
// Burn KESH
burn_kesh(kesh_amount)
Oracle Program
rust
// Update rates
submit_six_price(feed_type, price, confidence)
 
// Get price feeds
get_price_feed(feed_type) -> {price, timestamp}
🧪 Testing
bash
# Run all tests
anchor test
 
# Run backend tests
cd backend && npm test
 
# Integration tests
npm run test:integration
 
# Load testing
npm run test:stress
Test Coverage
✅ 9 Solana programs - Unit and integration tests
✅ M-Pesa integration - Mock and live callback tests
✅ Oracle feeds - SIX API and Pyth fallback tests
✅ Compliance engine - Risk scoring and sanctions tests
✅ Payment streams - Payroll and automation tests
🚀 Deployment
Devnet Deployment
bash
# Configure for devnet
solana config set --url devnet
 
# Build optimized
anchor build --provider.cluster devnet
 
# Deploy all programs
anchor deploy --provider.cluster devnet
 
# Initialize programs
anchor run initialize
Production Deployment
bash
# Configure for mainnet
solana config set --url mainnet-beta
 
# Deploy with verified build
anchor build --verifiable
anchor deploy --provider.cluster mainnet-beta
 
# Set up monitoring
npm run deploy:monitoring
Environment Variables for Production
bash
# Use production M-Pesa credentials
DARAJA_ENVIRONMENT=production
 
# Enable SIX Financial production API
SIX_API_KEY=production_key
 
# Database and monitoring
DATABASE_URL=postgresql://...
LOG_LEVEL=info
SENTRY_DSN=your_sentry_key
🔧 Configuration
Program IDs (After Deployment)
Update these in your .env files:

bash
MNETI_KESH_PROGRAM_ID=AuTWVK7aWU1RZ2fESWmaWX1oPExAtqNMmJ8m8TerXXMR
MNETI_ORACLE_PROGRAM_ID=4XQ2yp1pxQsypbAQposX1a8jLzFZFbjar28Sf7ruiSRU
MNETI_COMPLIANCE_PROGRAM_ID=7D5hBC1HhbDa6eahWFeVz79EPGK56v7nxgSCzWqTCPP6
# ... etc for all 9 programs
Risk Parameters
bash
# Daily limits by tier
TIER0_DAILY_LIMIT_USD=100
TIER1_DAILY_LIMIT_USD=1000
TIER2_DAILY_LIMIT_USD=10000
 
# Oracle staleness limits
MAX_ORACLE_AGE_SECONDS=3600
 
# Compliance thresholds
AML_RISK_THRESHOLD=0.7
🐛 Troubleshooting
Common Issues
Issue	Solution
Anchor build fails	Update Rust: rustup update
Stack overflow warning	Fixed in v0.29.0 - MintKesh split into 2 instructions
M-Pesa callbacks not received	Check ngrok tunnel: ngrok http 4000
Oracle prices stale	Check SIX API key and network connectivity
Token minting fails	Verify program IDs in .env match deployed programs
Debug Commands
bash
# Check program deployment
solana program show <PROGRAM_ID>
 
# Monitor transactions
solana logs <PROGRAM_ID>
 
# Check wallet balance
solana balance
 
# View program accounts
anchor account <ACCOUNT_TYPE> <ADDRESS>
🤝 Contributing
Development Workflow
bash
# Create feature branch
git checkout -b feature/new-component
 
# Run tests before committing
anchor test
npm test
 
# Commit with conventional format
git commit -m "feat: add new payment stream functionality"
 
# Push and create PR
git push origin feature/new-component
Code Standards
Rust: Use clippy and format with rustfmt
TypeScript: ESLint and Prettier configuration
Documentation: Update README for new features
Testing: 80%+ coverage required
Program Development
bash
# Add new instruction
anchor new instruction_name
 
# Update IDL
anchor build
 
# Test locally
solana-test-validator
anchor test
📊 Performance
Transaction Speed: ~2 seconds confirmation on Solana
Throughput: 50,000+ TPS on Solana mainnet
Gas Costs: <$0.01 per transaction
Uptime: 99.9%+ availability target
Latency: <100ms API response times
🔐 Security
Audit Ready: Code reviewed and tested
Key Management: Secure key rotation procedures
Compliance: FATF Travel Rule implementation
Monitoring: Real-time security event detection
Backup: Multi-region deployment with failover
📈 Roadmap
Phase 1 (Current) ✅
M-Pesa integration
KESH stablecoin
Basic compliance
Phase 2 (Q2 2024)
Multi-country mobile money
Advanced yield strategies
Cross-border corridors
Phase 3 (Q3 2024)
Institutional VASPs
Advanced compliance features
Real-time settlement
📞 Support
Documentation: Full API Docs
Issues: GitHub Issues
Discussions: GitHub Discussions
Discord: Join our community
📜 License
This project is licensed under the MIT License - see the LICENSE file for details.

Built for the African DeFi revolution 🇰🇪🇺🇬🇹🇿🇷🇼

Enabling millions to access global finance through familiar mobile money interfaces
