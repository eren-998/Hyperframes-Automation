// scripts/run_pipeline.js
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { tavily } = require("@tavily/core");

// Update credentials from environment variables
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// Initialize clients
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const tvly = tavily({ apiKey: TAVILY_API_KEY });

async function generateHtmlWithGemini(topic) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY GitHub Secret is missing!");
  }
  
  let researchData = "No research data available.";
  if (TAVILY_API_KEY) {
      console.log(`🔎 Researching topic: "${topic}" via Tavily API...`);
      try {
          const searchResult = await tvly.search(topic, {
              searchDepth: "advanced",
              maxResults: 3
          });
          researchData = searchResult.results.map(r => `Source: ${r.url}\nContent: ${r.content}`).join('\n\n');
          console.log("✅ Research complete.");
      } catch (err) {
          console.error("⚠️ Tavily research failed (continuing without research):", err.message);
      }
  } else {
      console.log("⚠️ TAVILY_API_KEY GitHub Secret missing. Skipping research step.");
  }
  
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const systemPrompt = `
# @BigZip_Ai — HTML Video Generator Agent

## ROLE
You are an Elite AI Content Engineer and Motion Designer for the brand **@BigZip_Ai**. When given a 1–2 line topic and recent research data, you produce one complete self-contained \`.html\` file that plays as an animated slide-by-slide video.

## STRICT WORKFLOW

### STEP 1 — CONTENT PLAN (7-8 SLIDES)
Slide 1: Hook — Bold claim, brand logo, eyebrow label, subtext
Slide 2: Problem — Common mistakes
Slide 3: Core Value 1 (Use research data)
Slide 4: Core Value 2 (Use research data)
Slide 5: Core Value 3
Slide 6: Core Value 4
Slide 7: Results
Slide 8: CTA — Dark bg, BigZip_Ai logo, keyword to comment

### STEP 2 — HYPERFRAMES & GSAP REQUIREMENTS (CRITICAL)
Your output MUST be a valid Hyperframes template. If you fail these rules, the video will not render.
1. The \`<meta name="viewport">\` MUST be \`width=1080, height=1920\`.
2. You MUST include: \`<meta data-composition-id="my-video" data-width="1080" data-height="1920" />\`
3. You MUST include GSAP: \`<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>\`
4. The stage MUST be \`1080x1920\`.
5. Every animating element or slide MUST have \`class="clip"\` and data attributes: \`data-start\`, \`data-duration\`, \`data-track-index\`.
6. You MUST create a paused GSAP timeline and register it EXACTLY like this at the end of the body:
<script>
  var tl = gsap.timeline({ paused: true });
  // Add your tl.to() or tl.from() animations here
  window.__timelines = window.__timelines || {};
  window.__timelines["my-video"] = tl;
</script>
7. NEVER animate \`visibility\`. Only animate opacity, transform, x, y, scale.
8. Background should be \`#F8FAFC\` with a blue grid pattern.

### OUTPUT FORMAT
Return ONLY the complete HTML file content. No markdown formatting (do not wrap in \`\`\`html). Start with <!DOCTYPE html>.
`;

  console.log("🧠 Generating content with Gemini API...");
  const result = await model.generateContent([
    systemPrompt,
    `Topic: ${topic}\n\nRecent Research Data:\n${researchData}`
  ]);
  
  let html = result.response.text();
  
  // Clean up any markdown formatting if the model accidentally adds it
  html = html.replace(/^\s*```html/i, '').replace(/```\s*$/i, '').trim();
  return html;
}

async function main() {
  console.log("=== Starting Automation Pipeline ===");

  // 1. PADHNA AUR QUEUE (LIST) CHECK KARNA
  const topicsPath = path.join(__dirname, '../topics.txt');
  if (!fs.existsSync(topicsPath)) {
    console.error("❌ topics.txt file nahi mili. Please GitHub par ek banayein!");
    process.exit(1);
  }

  const fileContent = await fs.readFile(topicsPath, 'utf8');
  const topics = fileContent.split('\n').map(t => t.trim()).filter(t => t.length > 0);

  if (topics.length === 0) {
    console.log("✅ Queue khali hai. Sabhi videos post ho chuke hain. Please add new topics!");
    return;
  }

  // 2. PEHLA TOPIC UTHANA
  const currentTopic = topics[0];
  console.log(`📌 Aaj ka Topic: "${currentTopic}"`);

  // 3. HTML GENERATE KARNA
  let generatedHtml;
  try {
    generatedHtml = await generateHtmlWithGemini(currentTopic);
  } catch (apiError) {
    console.error("❌ Gemini API Error:", apiError.message);
    process.exit(1);
  }
  
  const htmlPath = path.join(__dirname, '../hyperframes/index.html');
  await fs.writeFile(htmlPath, generatedHtml);

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
