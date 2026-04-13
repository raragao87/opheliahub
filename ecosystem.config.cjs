module.exports = {
  apps: [
    {
      name: "opheliahub",
      script: "node_modules/.bin/next",
      args: "start -p 5001",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "currency-rates",
      script: "npx",
      args: "tsx scripts/fetch-currency-rates.ts",
      cron_restart: "0 8 * * *",
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
