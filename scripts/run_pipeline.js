// scripts/run_pipeline.js
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');

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
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1080, height=1920" />
  <meta data-composition-id="my-video" data-width="1080" data-height="1920" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <style>
    html, body { width: 1080px; height: 1920px; background: #F8FAFC; margin:0; display:flex; align-items:center; justify-content:center; }
    #stage { width: 1080px; height: 1920px; outline: 2px solid rgba(66,133,244,0.5); position:relative; overflow:hidden;}
    .topbar { display:flex; padding: 40px; font-size: 40px; }
    .clip { position: absolute; top: 0; left: 0; width: 100%; height: 100%; visibility: hidden; }
  </style>
</head>
<body>
  <div id="stage">
    <div id="el-title" class="clip" data-start="0" data-duration="5" data-track-index="0" style="display:flex; align-items:center; justify-content:center; flex-direction:column;">
      <div class="topbar">
        <span class="brand">@BigZip_Ai</span>
      </div>
      <h2 style="font-size: 60px;">${currentTopic}</h2>
    </div>
  </div>
  <script>
    var tl = gsap.timeline({ paused: true });
    tl.to("#el-title", { opacity: 1, duration: 0.5 }, 0);
    window.__timelines = window.__timelines || {};
    window.__timelines["my-video"] = tl;
  </script>
</body>
</html>`;
  const htmlPath = path.join(__dirname, '../hyperframes/index.html');
  await fs.writeFile(htmlPath, sampleHtml);

  // 4. VIDEO RENDER KARNA
  console.log("🎬 Hyperframes se Video render ho raha hai...");
  try {
     execSync('bunx hyperframes render', { cwd: path.join(__dirname, '../hyperframes'), stdio: 'inherit' });
     console.log("✅ Video Ban Gaya!");
  } catch (err) {
     console.error("❌ Error rendering video (Ensure Hyperframes command is correct)", err.message);
     // Note: If hyperframes throws an error here during setup, we don't delete the topic.
     // So tomorrow it will retry the same topic!
     process.exit(1); 
  }

  // 5. INSTAGRAM PAR POST KARNA (Via Temporary Public URL)
  console.log("🚀 Video ko Public URL dene ke liye upload kar rahe hain...");
  try {
    const hfDir = path.join(__dirname, '../hyperframes/renders');
    const files = await fs.readdir(hfDir);
    const mp4File = files.find(f => f.endsWith('.mp4'));
    
    if (!mp4File) {
        throw new Error("Rendered .mp4 file nahi mili!");
    }

    const mp4Path = path.join(hfDir, mp4File);
    let publicVideoUrl = '';

    try {
        console.log("🌐 Uploading to tmpfiles.org...");
        const formData = new FormData();
        formData.append('file', fs.createReadStream(mp4Path));
        
        const uploadRes = await axios.post('https://tmpfiles.org/api/v1/upload', formData, {
            headers: formData.getHeaders()
        });
        
        // tmpfiles.org returns a view URL (e.g. https://tmpfiles.org/123/video.mp4)
        // Instagram needs the direct download URL (e.g. https://tmpfiles.org/dl/123/video.mp4)
        const viewUrl = uploadRes.data.data.url;
        publicVideoUrl = viewUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
        
    } catch (uploadErr) {
        console.log("⚠️ tmpfiles.org fail ho gaya. Trying fallback (transfer.sh)...");
        const fileBuffer = await fs.readFile(mp4Path);
        const transferRes = await axios.put(`https://transfer.sh/${mp4File}`, fileBuffer);
        publicVideoUrl = transferRes.data.trim();
    }

    console.log("🔗 Public Video URL mil gaya:", publicVideoUrl);

    console.log("📱 Uploading to Instagram...", currentTopic);
    if (!IG_ACCESS_TOKEN || !IG_USER_ID) {
      console.log("⚠️ Instagram Secrets nahi mile. Posting skip kar rahe hain.");
    } else {
      // Create Media Container
      const containerRes = await axios.post(
        `https://graph.facebook.com/v19.0/${IG_USER_ID}/media`,
        {
          video_url: publicVideoUrl,
          caption: currentTopic,
          media_type: 'REELS'
        },
        { params: { access_token: IG_ACCESS_TOKEN } }
      );
      const creationId = containerRes.data.id;
      
      console.log(`⏳ Media container created (ID: ${creationId}). Instagram processing ke liye 20 sec wait kar rahe hain...`);
      await new Promise(r => setTimeout(r, 20000));

      // Publish Media
      const publishRes = await axios.post(
        `https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`,
        { creation_id: creationId },
        { params: { access_token: IG_ACCESS_TOKEN } }
      );
      console.log("✅ Successfully posted to Instagram! Post ID:", publishRes.data.id);
    }
  } catch(error) {
     console.error("❌ Instagram Upload Error:", error.response?.data || error.message);
     process.exit(1);
  }

  // 6. TOPIC KO LIST SE DELETE KARNA
  topics.shift(); // Pehla wala element nikal do
  const newContent = topics.join('\n') + '\n';
  await fs.writeFile(topicsPath, newContent);
  console.log(`📝 "${currentTopic}" list se hata diya gaya hai. Baki bache topics: ${topics.length}`);
  console.log("=== Pipeline Finished Successfully ===");
}

main();
