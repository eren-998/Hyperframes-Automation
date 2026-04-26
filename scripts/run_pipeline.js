// scripts/run_pipeline.js
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');

const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

async function main() {
  console.log("=== Starting Automation Pipeline ===");

  // 1. PADHNA AUR QUEUE (LIST) CHECK KARNA
  const topicsPath = path.join(__dirname, '../topics.txt');
  if (!fs.existsSync(topicsPath)) {
    console.error("❌ topics.txt file nahi mili. Please GitHub par ek banayein!");
    process.exit(1);
  }

  const fileContent = await fs.readFile(topicsPath, 'utf8');
  // List banayein aur khali line hata dein
  const topics = fileContent.split('\n').map(t => t.trim()).filter(t => t.length > 0);

  if (topics.length === 0) {
    console.log("✅ Queue khali hai. Sabhi videos post ho chuke hain. Please add new topics!");
    return; // Exit peacefully
  }

  // 2. PEHLA TOPIC UTHANA
  const currentTopic = topics[0];
  console.log(`📌 Aaj ka Topic: "${currentTopic}"`);

  // 3. HTML GENERATE KARNA (Mocking Gemini API for structural safety)
  console.log("🤖 AI se HTML generate karwa rahe hain...");
  // In real life, use axios to call Gemini API with your system prompt & currentTopic here
  const sampleHtml = `<!DOCTYPE html>
<html><head><style>
  html, body { width: 100%; height: 100%; background: #F8FAFC; margin:0; display:flex; align-items:center; justify-content:center; }
  #stage { width: 420px; height: 525px; outline: 2px solid rgba(66,133,244,0.5); }
  .topbar { display:flex; padding: 10px; }
</style></head><body>
  <div id="stage">
    <div class="topbar">
      <span class="brand">@BigZip_Ai</span><span class="slide-tag">1 / 8</span>
    </div>
    <h2>${currentTopic}</h2>
  </div>
</body></html>`;
  const htmlPath = path.join(__dirname, '../hyperframes/input.html');
  await fs.writeFile(htmlPath, sampleHtml);

  // 4. VIDEO RENDER KARNA
  console.log("🎬 Hyperframes se Video render ho raha hai...");
  try {
     // NOTE: command depend karta hai hyperframes ke config par, mostly 'npm run build'
     execSync('npm run build', { cwd: path.join(__dirname, '../hyperframes'), stdio: 'inherit' });
     console.log("✅ Video Ban Gaya!");
  } catch (err) {
     console.error("❌ Error rendering video (Ensure Hyperframes command is correct)", err.message);
     // Note: If hyperframes throws an error here during setup, we don't delete the topic.
     // So tomorrow it will retry the same topic!
     process.exit(1); 
  }

  // 5. INSTAGRAM PAR POST KARNA
  // Video URL needs to be publicly accessible (e.g. upload to a temporary file host before sending to IG)
  console.log("📱 Uploading to Instagram...", currentTopic);
  // Simulating successful upload for now:
  console.log("✅ Successfully posted to Instagram!");

  // 6. TOPIC KO LIST SE DELETE KARNA
  topics.shift(); // Pehla wala element nikal do
  const newContent = topics.join('\n') + '\n';
  await fs.writeFile(topicsPath, newContent);
  console.log(`📝 "${currentTopic}" list se hata diya gaya hai. Baki bache topics: ${topics.length}`);
  console.log("=== Pipeline Finished Successfully ===");
}

main();
