// PM2 process definition for the VPS. Named .cjs because the package is
// "type": "module" — PM2's own config loader expects CommonJS.
module.exports = {
  apps: [
    {
      name: 'pricem-api',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
