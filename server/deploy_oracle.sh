#!/bin/bash
# ==============================================================================
# 🚀 GupShupp Enterprise Pro: 1-Click Oracle Cloud 3 OCPU / 18 GB RAM Deployer
# Run this on your Oracle Linux / Ubuntu VM:
#   chmod +x deploy_oracle.sh
#   ./deploy_oracle.sh
# ==============================================================================

echo "======================================================================"
echo "🏛️ GUPSHUPP ORACLE CLUSTER DEPLOYMENT & KERNEL OPTIMIZER"
echo "======================================================================"

# 1. Optimize Linux Kernel Limits for Max WebSocket Capacity
echo "⚙️ Tuning Linux Kernel TCP and File Descriptor Limits..."
sudo sysctl -w fs.file-max=2097152 > /dev/null
sudo sysctl -w net.core.somaxconn=65535 > /dev/null
sudo sysctl -w net.ipv4.tcp_max_syn_backlog=65535 > /dev/null
sudo sysctl -w net.ipv4.ip_local_port_range="1024 65535" > /dev/null
sudo sysctl -w net.ipv4.tcp_tw_reuse=1 > /dev/null
ulimit -n 65535

# 2. Install/Update Dependencies
echo "📦 Installing Server Node.js Dependencies..."
npm install --production

# 3. Install PM2 Globally (if not installed)
if ! command -v pm2 &> /dev/null
then
    echo "📦 Installing PM2 Process Manager globally..."
    sudo npm install -g pm2
fi

# 4. Launch with 3-Core Multi-Worker Cluster & 18 GB RAM allocation
echo "🚀 Starting GupShupp 3-Core Clustered Multi-Worker Engine..."
pm2 stop gupshupp-backend 2>/dev/null || true
pm2 delete gupshupp-backend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo "======================================================================"
echo "✅ GUPSHUPP IS LIVE ON ORACLE CLOUD (3 OCPUs / 18 GB RAM UNLOCKED!)"
echo "📊 Check Live Status with: pm2 status OR pm2 monit"
echo "======================================================================"
