# MNETI Testnet Demo - 2 Minute Technical Walkthrough Script

> **Duration**: 2 minutes  
> **Target Audience**: Technical investors, developers, partners  
> **Focus**: Live demonstration of working protocol on Solana devnet

---

## 🎥 VIDEO SCRIPT (2 Minutes)

### **0:00-0:15 - INTRO & SETUP**
```
[SCREEN: Terminal showing Solana devnet connection]
VOICE: "MNETI - M-Pesa Networked Token Infrastructure. Let me show you the complete protocol running on Solana devnet."

[COMMANDS SHOWN]:
solana config set --url devnet
solana balance
anchor build --provider.cluster devnet
```

### **0:15-0:45 - DEPLOYMENT**
```
[SCREEN: Anchor deploying 6 programs]
VOICE: "First, we deploy all 6 programs that make up the MNETI stack..."

[PROGRAMS DEPLOYING]:
- mneti-kesh (KESH stablecoin)
- mneti-oracle (Price feeds)  
- mneti-compliance (AML/KYC)
- mneti-payments (Streams/Payroll)
- mneti-travel-rule (FATF compliance)
- mneti-vault (Yield strategies)

[SCREEN: Programs deployed with real addresses]
VOICE: "All programs live on devnet with real program IDs. The KESH token is now ready."
```

### **0:45-1:15 - MPESA DEPOSIT DEMO**
```
[SCREEN: Backend API running]
VOICE: "Now watch a real MPesa deposit flow. User sends KES 1,000 via MPesa..."

[SCREEN: Mobile phone MPesa screenshot → Backend logs]
VOICE: "MPesa triggers our C2B callback. The backend validates the transaction..."

[SCREEN: Solana Explorer showing mint transaction]
VOICE: "Compliance checks pass, oracle gets KES/USD price, and KESH tokens are minted to the user's wallet."

[SCREEN: Wallet showing KESH balance]
VOICE: "User now has KESH tokens - 1:1 backed by the deposited KES."
```

### **1:15-1:45 - PAYMENT STREAMS & YIELD**
```
[SCREEN: Dashboard creating payroll stream]
VOICE: "Now let's create a payment stream. Employer sets up payroll for 5 employees..."

[SCREEN: Payroll account created on-chain]
VOICE: "Payroll account created on-chain. The yield crank automatically funds it from vault yields..."

[SCREEN: Employees receiving automatic payments]
VOICE: "Employees receive KESH automatically every hour. All transparent on-chain."
```

### **1:45-2:00 - TRAVEL RULE & SUMMARY**
```
[SCREEN: Cross-border remittance flow]
VOICE: "For cross-border, our Travel Rule engine exchanges PII between VASPs compliant with FATF regulations..."

[SCREEN: Final dashboard showing all components]
VOICE: "MPesa integration, compliance, payments, yield, and Travel Rule - all working together on Solana devnet."
```

---

## 🎬 RECORDING CHECKLIST

### **Pre-Demo Setup (5 minutes)**
```bash
# 1. Clean devnet environment
solana config set --url devnet
solana airdrop 5

# 2. Build and deploy programs
anchor build --provider.cluster devnet
anchor deploy --provider.cluster devnet

# 3. Update program IDs in .env
# (Copy from anchor deploy output)

# 4. Start backend
cd backend
npm install
npm run dev

# 5. Open dashboard
cd ../app  
npm install
npm start
```

### **Environment Variables Ready**
```bash
# backend/.env
SOLANA_RPC_URL=https://api.devnet.solana.com
DARAJA_CONSUMER_KEY=your_sandbox_key
DARAJA_CONSUMER_SECRET=your_sandbox_secret
# (Use Safaricom sandbox credentials)
```

---

## 📱 SCREEN RECORDING FLOW

### **Terminal Window (Left Side)**
- Show commands being typed
- Display program deployment output
- Show backend logs during MPesa callback

### **Browser Window (Right Side)**
- Solana Explorer (devnet)
- MNETI Dashboard
- Mobile MPesa simulator (or screenshots)

### **Key Screens to Capture**
1. **Program Deployment** - All 6 programs deploying
2. **MPesa Callback** - Backend receiving C2B webhook
3. **KESH Mint Transaction** - Solana Explorer showing mint
4. **Payroll Creation** - Dashboard UI
5. **Yield Distribution** - Vault crank logs
6. **Travel Rule Exchange** - API logs between VASPs

---

## 🔧 TECHNICAL DEPTH POINTS

### **What to Highlight**
- **6 Solana Programs** - Show program IDs on explorer
- **Real MPesa Integration** - Live webhook handling
- **Compliance Engine** - Tier limits and AML checks
- **Yield Automation** - Crank harvesting and distributing
- **Travel Rule** - PII exchange between VASPs

### **Technical Metrics to Display**
- Transaction confirmation times (~2 seconds)
- Gas costs per operation
- Yield APY percentages
- Compliance check response times

---

## 🎯 SUCCESS CRITERIA

### **Must Show Working**
1. ✅ MPesa → KESH token mint
2. ✅ Payment stream creation & execution
3. ✅ Yield harvesting & distribution
4. ✅ Travel Rule data exchange
5. ✅ All transactions on Solana explorer

### **Common Issues & Solutions**
| Issue | Solution |
|-------|----------|
| Anchor deploy fails | Check devnet SOL balance |
| MPesa callback not received | Verify ngrok tunnel |
| Oracle price stale | Run price relay manually |
| Yield crank not running | Check crank process status |

---

## 📹 RECORDING SETTINGS

### **Recommended Tools**
- **OBS Studio** - Free, professional recording
- **Screen Resolution**: 1920x1080
- **Frame Rate**: 30fps
- **Audio**: Clear microphone, no background noise

### **Layout Setup**
```
┌─────────────────┬─────────────────┐
│   Terminal      │   Browser       │
│   (Commands)    │   (Dashboard)   │
│                 │                 │
│ 80% width      │ 80% width       │
└─────────────────┴─────────────────┘
```

---

## 🚀 POST-PROCESSING

### **Quick Edits (2 minutes)**
1. Trim start/end (remove setup time)
2. Add zoom highlights on key transactions
3. Add text overlays for program names
4. Speed up boring deployment parts
5. Add background music (optional)

### **Export Settings**
- **Format**: MP4
- **Resolution**: 1080p
- **Duration**: Exactly 2 minutes
- **File Size**: Under 50MB for easy sharing

---

## 📋 DEMO SCRIPT CHEAT SHEET

```bash
# QUICK COMMANDS FOR RECORDING
solana config set --url devnet
solana balance
anchor build --provider.cluster devnet
anchor deploy --provider.cluster devnet

# BACKEND
cd backend && npm run dev

# FRONTEND  
cd ../app && npm start

# YIELD CRANK (separate terminal)
cd backend && npm run crank:yield

# PAYROLL CRANK (separate terminal)
cd backend && npm run crank:payroll
```

---

## 🎪 LIVE DEMO TIPS

1. **Practice twice** - Know exactly where to click
2. **Have backups** - Screenshots of key screens ready
3. **Narrate clearly** - Explain what's happening technically
4. **Show the magic** - Highlight the MPesa → KESH transformation
5. **End strong** - Show all components working together

---

**Ready to record! This 2-minute demo showcases the complete MNETI protocol with real transactions on Solana devnet.**
