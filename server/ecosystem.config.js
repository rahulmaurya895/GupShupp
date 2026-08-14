/**
 * 🏛️ GupShupp Enterprise Pro: Production PM2 Ecosystem Config
 * Ultra-Optimized for Oracle Cloud Always Free ARM (3 OCPUs / 18 GB RAM).
 * 
 * Usage on Oracle Server:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup
 */

module.exports = {
  apps: [
    {
      name: 'gupshupp-backend',
      script: 'src/server.js',
      instances: 3, // Specifically tuned for 3 OCPUs (3 Ampere ARM cores)
      exec_mode: 'cluster',
      max_memory_restart: '4G', // Each worker can utilize up to 4GB RAM from the 18GB pool
      node_args: '--max-old-space-size=4096 --expose-gc', // Unlocks 4096 MB V8 heap per core
      autorestart: true,
      restart_delay: 1000,
      max_restarts: 20,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        UV_THREADPOOL_SIZE: 128, // High-concurrency cryptographic and I/O threads
        CLUSTER_MODE: 'true'
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        CLUSTER_MODE: 'false'
      }
    }
  ]
};
