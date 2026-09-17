const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 SecureID IAM Demo Server running on http://localhost:${PORT}`);
  console.log(`🔐 In-memory store initialized (resets on server restart)`);
  console.log(`📧 Simulated OTP codes will appear directly in this console`);
  console.log(`======================================================\n`);
});
