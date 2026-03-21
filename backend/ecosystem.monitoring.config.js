/**
 * PM2 Ecosystem config — Monitoring AKILI Property
 * Usage : pm2 start ecosystem.monitoring.config.js
 */
module.exports = {
  apps: [
    {
      name:         'akili-monitor',
      script:       'dist/monitoring/monitor.js',
      cwd:          '/var/www/akili-property/backend',
      instances:    1,
      autorestart:  true,
      watch:        false,
      max_memory_restart: '100M',
      restart_delay: 10000,
      env: {
        NODE_ENV:    'production',
        // SMTP — à configurer dans /var/www/akili-property/backend/.env
      },
      env_file:     '/var/www/akili-property/backend/.env',
      error_file:   '/var/log/pm2/akili-monitor-error.log',
      out_file:     '/var/log/pm2/akili-monitor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }
  ]
}
