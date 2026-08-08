const { Environment, LogLevel, Paddle } = require("@paddle/paddle-node-sdk");
require('dotenv').config({ path: '.env.local' });

async function testPaddle() {
  try {
    const paddle = new Paddle(
      process.env.PADDLE_API_KEY,
      { environment: Environment.sandbox, logLevel: LogLevel.error }
    );
    
    // Test API Key
    const products = await paddle.products.list();
    console.log("✅ Paddle API Key is VALID. Found", products.length, "products.");
    
    // Check tokens
    if (process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) {
      console.log("✅ Paddle Client Token is PRESENT.");
    } else {
      console.log("❌ Paddle Client Token is MISSING.");
    }
    
    if (process.env.PADDLE_WEBHOOK_SECRET_KEY) {
      console.log("✅ Paddle Webhook Secret Key is PRESENT.");
    } else {
      console.log("❌ Paddle Webhook Secret Key is MISSING.");
    }
    
  } catch (err) {
    console.error("❌ Paddle API Error:", err.message);
  }
}

testPaddle();
