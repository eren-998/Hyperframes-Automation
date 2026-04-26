// scripts/run_pipeline.js
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');

const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;
// We need an AI model API key to generate the HTML based on your system prompt.
// We'll assume Gemini or OpenAI is configured in your environment.
const AI_API_KEY = process.env.GEMINI_API_KEY; 

async function generateHtml() {
  console.log("Generating HTML using System Prompt...");
  // 1. In a real scenario, this is where you call Gemini API with your @Downloads\for cli.txt prompt
  // For the pipeline, we generate a mock file or call an external script that uses the LLM.
  // For now, let's create a placeholder HTML that fits the system prompt rules.
  
  const sampleHtml = `<!DOCTYPE html>
<html>
<head>
<style>
  html, body { width: 100%; height: 100%; background: #F8FAFC; margin:0; display:flex; align-items:center; justify-content:center; }
  #stage { width: 420px; height: 525px; outline: 2px solid rgba(66,133,244,0.5); }
  .topbar { display:flex; padding: 10px; }
</style>
</head>
<body>
  <div id="stage">
    <div class="topbar">
      <span class="brand">@BigZip_Ai</span>
      <span class="slide-tag">1 / 8</span>
    </div>
    <h2>Automated Post Content</h2>
  </div>
</body>
</html>`;

  const htmlPath = path.join(__dirname, '../hyperframes/input.html');
  await fs.writeFile(htmlPath, sampleHtml);
  return htmlPath;
}

async function renderVideo(htmlPath) {
  console.log("Rendering video with Hyperframes...");
  // Hyperframes commands to convert HTML -> Video
  // As per their docs, usually you run a build/render script
  try {
     // This is a placeholder for the actual hyperframes render command.
     // It depends on their exact CLI API (e.g. `npx remotion render` or their wrapper)
     execSync('npm run build', { cwd: path.join(__dirname, '../hyperframes'), stdio: 'inherit' });
     
     // Let's assume it outputs to an `out/video.mp4` path.
     return path.join(__dirname, '../hyperframes/out/video.mp4');
  } catch (err) {
     console.error("Error rendering video", err);
     process.exit(1);
  }
}

async function uploadToInstagram(videoUrl, caption) {
  console.log("Uploading to Instagram...");
  try {
    // 1. Create Media Container
    const containerRes = await axios.post(
      `https://graph.facebook.com/v19.0/${IG_USER_ID}/media`,
      {
        video_url: videoUrl,
        caption: caption,
        media_type: 'REELS'
      },
      { params: { access_token: IG_ACCESS_TOKEN } }
    );
    const creationId = containerRes.data.id;

    // 2. Wait for processing (simplistic wait, normally you poll status)
    console.log(`Media created (ID: ${creationId}). Waiting for processing...`);
    await new Promise(r => setTimeout(r, 15000));

    // 3. Publish
    const publishRes = await axios.post(
      `https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`,
      { creation_id: creationId },
      { params: { access_token: IG_ACCESS_TOKEN } }
    );
    
    console.log("Successfully posted! Post ID:", publishRes.data.id);
  } catch (error) {
    console.error("Instagram API Error:", error.response?.data || error.message);
    process.exit(1);
  }
}

async function main() {
  const htmlPath = await generateHtml();
  
  // To post via API, Instagram requires the video to be hosted on a public URL.
  // In GitHub Actions, you need a step to upload the generated MP4 to an S3 bucket or Imgur/Cloudinary
  // before you can pass the URL to the Instagram Graph API.
  
  console.log("Pipeline script created successfully.");
}

main();
