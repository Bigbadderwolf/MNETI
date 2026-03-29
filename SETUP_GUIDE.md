# MNETI Testnet Demo Setup Guide

## 🚀 QUICK START (3 Services)

### **STEP 1: Backend Setup**
```bash
# Terminal 1 - Backend
cd MNETI/backend
npm install
cp .env.example .env
npm run dev
```

### **STEP 2: AI Scoring Server**
```bash
# Terminal 2 - AI Server
cd MNETI/ai
pip install -r requirements.txt
uvicorn api.main:app --port 8000 --reload
```

### **STEP 3: Web Dashboard**
```bash
# Terminal 3 - Web Dashboard
cd MNETI/web
npm install
npm run dev
```

---

## 🔧 ENVIRONMENT SETUP

### **Backend .env (Required for demo)**
```bash
# Copy this to MNETI/backend/.env
SOLANA_RPC_URL=https://api.devnet.solana.com
PORT=4000
NODE_ENV=development
LOG_LEVEL=info
AI_SCORING_URL=http://localhost:8000

# MPesa Sandbox (use test credentials)
DARAJA_CONSUMER_KEY=your_test_key
DARAJA_CONSUMER_SECRET=your_test_secret
DARAJA_PASSKEY=your_test_passkey
DARAJA_SHORTCODE=174379
DARAJA_ENVIRONMENT=sandbox
DARAJA_CALLBACK_URL=http://localhost:4000/api/mpesa/callback
```

### **Web Dashboard .env.local**
```bash
# Copy this to MNETI/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_AI_URL=http://localhost:8000
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

---

## 🐛 COMMON DEBUGGING STEPS

### **Backend Issues**
```bash
# Check if backend is running
curl http://localhost:4000/api/health

# If port 4000 is busy
netstat -ano | findstr :4000
# Kill the process: taskkill /PID <PID> /F

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### **AI Server Issues**
```bash
# Check if AI server is running
curl http://localhost:8000/api/pobf/health

# Python dependency issues
pip install --upgrade pip
pip install -r requirements.txt

# If TensorFlow fails (optional dependency)
# The AI server will fall back to rule-based scoring
```

### **Web Dashboard Issues**
```bash
# Check if web dashboard is running
curl http://localhost:3000

# Clear Next.js cache
rm -rf .next
npm run dev
```

---

## ✅ VERIFICATION CHECKLIST

### **1. Backend Health Check**
```bash
curl http://localhost:4000/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

### **2. AI Server Health Check**
```bash
curl http://localhost:8000/api/pobf/health
# Expected: {"status":"healthy","model_loaded":true}
```

### **3. Web Dashboard Access**
```
Open: http://localhost:3000
Expected: MNETI Dashboard loading
```

---

## 🎯 DEMO READY WHEN:

- ✅ Backend responds on port 4000
- ✅ AI server responds on port 8000  
- ✅ Web dashboard loads on port 3000
- ✅ All services show healthy status
- ✅ No console errors in any terminal

---

## 🚨 QUICK FIXES

| Problem | Solution |
|---------|----------|
| Port 4000 in use | `taskkill /PID <PID> /F` or change PORT in .env |
| Python module not found | `pip install -r requirements.txt` |
| Next.js build error | `rm -rf .next && npm run dev` |
| Solana connection failed | Check RPC URL, try devnet endpoint |
| MPesa sandbox errors | Use Safaricom test credentials |

---

## 📱 TESTNET DEMO FLOW

Once all services are running:

1. **Open Web Dashboard** - http://localhost:3000
2. **Connect Wallet** - Phantom/Solflare to devnet
3. **Test MPesa Flow** - Use sandbox MPesa simulator
4. **Check AI Scoring** - Business credit scoring
5. **Verify Transactions** - On Solana devnet explorer

---

**Start with Terminal 1 (Backend) and work through each service!**
