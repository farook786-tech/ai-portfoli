require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const app = express();
const port = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const upload = multer({ storage: multer.memoryStorage() });
// Get local IP address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      if (interface.family === 'IPv4' && !interface.internal) {
        return interface.address;
      }
    }
  }
  return '127.0.0.1'; // fallback
}
const localIp = getLocalIpAddress();
// In-memory storage for portfolios
const portfolios = {};
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
// Add endpoint to get server info including IP
app.get('/api/server-info', (req, res) => {
  res.json({
    ip: localIp,
    port: port,
    url: `http://${localIp}:${port}`
  });
});
// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'PortfolioForge API is running' });
});
// Theme definitions
const themes = {
    'Software Developer': {
        name: 'Developer Dark',
        background: 'bg-gray-900 text-white',
        primaryColor: 'bg-blue-500',
        secondaryColor: 'text-blue-400',
        card: 'bg-gray-800',
        font: 'font-mono',
        buttonStyle: 'bg-blue-600 hover:bg-blue-700'
    },
    'Graphic Designer': {
        name: 'Designer Light',
        background: 'bg-white text-gray-800',
        primaryColor: 'bg-pink-500',
        secondaryColor: 'text-pink-500',
        card: 'bg-gray-50',
        font: 'font-sans',
        buttonStyle: 'bg-pink-600 hover:bg-pink-700'
    },
    'Data Scientist': {
        name: 'Data Green',
        background: 'bg-gray-800 text-gray-100',
        primaryColor: 'bg-green-500',
        secondaryColor: 'text-green-400',
        card: 'bg-gray-700',
        font: 'font-sans',
        buttonStyle: 'bg-green-600 hover:bg-green-700'
    },
    'Default': {
        name: 'Professional Blue',
        background: 'bg-gray-100 text-gray-900',
        primaryColor: 'bg-indigo-600',
        secondaryColor: 'text-indigo-500',
        card: 'bg-white',
        font: 'font-sans',
        buttonStyle: 'bg-indigo-600 hover:bg-indigo-700'
    }
};
// Helper function to convert username to URL
function convertUsernameToUrl(platform, username) {
    if (!username) return '';
    
    // If it's already a URL, return as is
    if (username.startsWith('http://') || username.startsWith('https://')) {
        return username;
    }
    
    if (platform === 'linkedin') {
        return `https://linkedin.com/in/${username}`;
    } else if (platform === 'github') {
        return `https://github.com/${username}`;
    }
    
    return username;
}
async function parseResumeWithAI(resumeText) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
        You are an expert resume parser. Analyze the following resume text and extract the information into a structured JSON object.
        The JSON object should have the following keys:
        - "personalInfo": An object with "name", "email", "phone", "website", "linkedin", and "github".
          For "linkedin" and "github", extract ONLY the username (without the full URL). 
          For example, if the resume has "https://linkedin.com/in/johndoe", extract "johndoe".
          If the resume only has the username (e.g., "johndoe"), use that as is.
        - "summary": A string containing the professional summary or objective.
        - "skills": An array of strings listing all technical and soft skills.
        - "experience": An array of objects, where each object has "company", "role", "dates", and "description" (as an array of strings).
        - "projects": An array of objects, where each object has "title", "description", and "link".
        - "education": An array of objects, where each object has "institution", "degree", and "dates".
        
        Important: For LinkedIn and GitHub, extract only the username, not the full URL.
        If a piece of information is not found, return null for its value.
        Ensure the output is ONLY the raw JSON object, without any markdown formatting like \`\`\`json.
    `;
    
    try {
        const result = await model.generateContent(prompt + "\n\n--- RESUME TEXT ---\n\n" + resumeText);
        const response = await result.response;
        let jsonText = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        
        // Sometimes the AI might return additional text, try to extract only the JSON
        if (!jsonText.startsWith('{')) {
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[0];
            }
        }
        
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse JSON from AI response:", e);
        console.log("AI Response:", response.text());
        throw new Error("AI model returned an invalid JSON format.");
    }
}
async function classifyProfessionAndSelectTheme(parsedData) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const skillsArray = Array.isArray(parsedData.skills) ? parsedData.skills : [];
    const professionalSummary = `Summary: ${parsedData.summary || ''}. Skills: ${skillsArray.join(', ')}.`;
    const prompt = `
        Based on the following professional summary and skills, classify the profession into one of these categories:
        - Software Developer
        - Graphic Designer
        - Data Scientist
        If the profession doesn't clearly fit, respond with "Default".
        Respond with ONLY the category name.
    `;
    try {
        const result = await model.generateContent(prompt + "\n\n" + professionalSummary);
        const response = await result.response;
        const profession = response.text().trim();
        
        console.log(`AI Classified Profession as: ${profession}`);
        return themes[profession] || themes['Default'];
    } catch (error) {
        console.error("Error classifying profession:", error);
        return themes['Default'];
    }
}
// Generate portfolio from resume
app.post('/api/generate-from-resume', upload.fields([{ name: 'resume', maxCount: 1 }, { name: 'photo', maxCount: 1 }]), async (req, res) => {
    if (!req.files || !req.files.resume) {
        return res.status(400).json({ error: 'Resume file (PDF) is required.' });
    }
    try {
        const resumeBuffer = req.files.resume[0].buffer;
        const resumeData = await pdfParse(resumeBuffer);
        const resumeText = resumeData.text;
        
        if (!resumeText || resumeText.trim().length === 0) {
            return res.status(400).json({ error: 'Could not extract text from the PDF. The file may be corrupted or scanned as an image.' });
        }
        
        const parsedData = await parseResumeWithAI(resumeText);
        const selectedTheme = await classifyProfessionAndSelectTheme(parsedData);
        
        // Convert LinkedIn and GitHub usernames to URLs
        if (parsedData.personalInfo.linkedin) {
            parsedData.personalInfo.linkedin = convertUsernameToUrl('linkedin', parsedData.personalInfo.linkedin);
        }
        if (parsedData.personalInfo.github) {
            parsedData.personalInfo.github = convertUsernameToUrl('github', parsedData.personalInfo.github);
        }
        
        let photoUrl = `https://placehold.co/150x150/222/fff?text=${parsedData.personalInfo.name ? parsedData.personalInfo.name.charAt(0) : 'P'}`;
        if (req.files.photo) {
            const photoBuffer = req.files.photo[0].buffer;
            photoUrl = `data:${req.files.photo[0].mimetype};base64,${photoBuffer.toString('base64')}`;
        }
        
        // Generate unique ID and store portfolio in memory
        const portfolioId = uuidv4();
        portfolios[portfolioId] = {
            data: parsedData,
            theme: selectedTheme,
            profilePictureUrl: photoUrl,
            createdAt: new Date()
        };
        
        console.log(`Portfolio created with ID: ${portfolioId}`);
        
        res.json({
            portfolioId,
            portfolioData: parsedData,
            theme: selectedTheme,
            profilePictureUrl: photoUrl
        });
    } catch (error) {
        console.error("Error processing request:", error);
        
        // Check if it's a PDF parsing error
        if (error.message && error.message.includes('bad XRef entry')) {
            return res.status(400).json({ 
                error: 'The PDF file appears to be corrupted or invalid. Please try uploading a different PDF file.' 
            });
        }
        
        res.status(500).json({ error: 'An unexpected error occurred while generating the portfolio. Please try again.' });
    }
});
// Update existing portfolio
app.post('/api/update-portfolio/:id', (req, res) => {
    const { id } = req.params;
    const { portfolioData, theme, profilePictureUrl } = req.body;
    
    if (!portfolios[id]) {
        return res.status(404).json({ error: 'Portfolio not found' });
    }
    
    // Convert LinkedIn and GitHub usernames to URLs
    if (portfolioData.personalInfo.linkedin) {
        portfolioData.personalInfo.linkedin = convertUsernameToUrl('linkedin', portfolioData.personalInfo.linkedin);
    }
    if (portfolioData.personalInfo.github) {
        portfolioData.personalInfo.github = convertUsernameToUrl('github', portfolioData.personalInfo.github);
    }
    
    portfolios[id] = {
        ...portfolios[id],
        data: portfolioData,
        theme,
        profilePictureUrl,
        updatedAt: new Date()
    };
    
    console.log(`Portfolio updated with ID: ${id}`);
    
    res.json({ success: true, portfolioId: id });
});
// Create manual portfolio
app.post('/api/create-manual-portfolio', upload.single('photo'), async (req, res) => {
    try {
        const { portfolioData, theme } = req.body;
        
        // Convert LinkedIn and GitHub usernames to URLs
        if (portfolioData.personalInfo.linkedin) {
            portfolioData.personalInfo.linkedin = convertUsernameToUrl('linkedin', portfolioData.personalInfo.linkedin);
        }
        if (portfolioData.personalInfo.github) {
            portfolioData.personalInfo.github = convertUsernameToUrl('github', portfolioData.personalInfo.github);
        }
        
        let photoUrl = `https://placehold.co/150x150/222/fff?text=${portfolioData.personalInfo.name ? portfolioData.personalInfo.name.charAt(0) : 'P'}`;
        
        if (req.file) {
            const photoBuffer = req.file.buffer;
            photoUrl = `data:${req.file.mimetype};base64,${photoBuffer.toString('base64')}`;
        }
        
        // Generate unique ID and store portfolio in memory
        const portfolioId = uuidv4();
        portfolios[portfolioId] = {
            data: portfolioData,
            theme: theme,
            profilePictureUrl: photoUrl,
            createdAt: new Date()
        };
        
        console.log(`Manual portfolio created with ID: ${portfolioId}`);
        
        res.json({
            portfolioId,
            portfolioData,
            theme,
            profilePictureUrl: photoUrl
        });
    } catch (error) {
        console.error("Error creating manual portfolio:", error);
        res.status(500).json({ error: 'An unexpected error occurred while creating the portfolio. Please try again.' });
    }
});
// Add this endpoint to serve portfolio images publicly
app.get('/api/portfolio-image/:id', (req, res) => {
    const { id } = req.params;
    
    if (!portfolios[id]) {
        return res.status(404).send('Portfolio not found');
    }
    
    const portfolio = portfolios[id];
    const profilePictureUrl = portfolio.profilePictureUrl;
    
    // Check if it's a data URL
    if (profilePictureUrl && profilePictureUrl.startsWith('data:')) {
        // Extract the base64 data and MIME type
        const matches = profilePictureUrl.match(/^data:(.+);base64,(.+)$/);
        
        if (matches && matches.length === 3) {
            const mimeType = matches[1];
            const base64Data = matches[2];
            
            // Convert base64 to Buffer
            const imageBuffer = Buffer.from(base64Data, 'base64');
            
            // Set the appropriate Content-Type header
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Length', imageBuffer.length);
            
            // Send the image
            return res.send(imageBuffer);
        }
    }
    
    // If not a data URL or something went wrong, return a placeholder
    const placeholderUrl = 'https://via.placeholder.com/1200x627/4F46E5/FFFFFF?text=Portfolio';
    
    // Redirect to placeholder or send it directly
    return res.redirect(placeholderUrl);
});
// Helper function to create error pages
function createErrorPage(title, message) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        </head>
        <body class="bg-gray-100 flex items-center justify-center min-h-screen">
            <div class="text-center p-8 bg-white rounded-lg shadow-lg max-w-md">
                <i class="fas fa-exclamation-triangle text-yellow-500 text-5xl mb-4"></i>
                <h1 class="text-2xl font-bold text-gray-800 mb-2">${title}</h1>
                <p class="text-gray-600 mb-6">${message}</p>
                <a href="/" class="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                    <i class="fas fa-home mr-2"></i>Go to Homepage
                </a>
            </div>
        </body>
        </html>
    `;
}
// Serve portfolio page with improved error handling
app.get('/portfolio/:id', (req, res) => {
    const { id } = req.params;
    
    console.log(`Request received for portfolio ID: ${id}`);
    console.log(`Available portfolio IDs: ${Object.keys(portfolios).join(', ')}`);
    
    // Validate the ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
        console.log(`Invalid portfolio ID format: ${id}`);
        return res.status(400).send(createErrorPage('Invalid Portfolio ID', 'The portfolio ID you provided is not valid. Please check the URL and try again.'));
    }
    
    const portfolio = portfolios[id];
    
    if (!portfolio) {
        console.log(`Portfolio not found for ID: ${id}`);
        return res.status(404).send(createErrorPage('Portfolio Not Found', 'The portfolio you\'re looking for doesn\'t exist or may have been deleted.'));
    }
    
    try {
        // Ensure personalInfo exists
        const personalInfo = portfolio.data.personalInfo || {};
        
        // Add proper headers for sharing
        res.set({
            'Content-Type': 'text/html',
            'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY'
        });
        
        // Determine the image URL
        let imageUrl;
        if (portfolio.profilePictureUrl) {
            if (portfolio.profilePictureUrl.startsWith('data:')) {
                // Use a placeholder for data URLs
                imageUrl = `https://via.placeholder.com/1200x627/4F46E5/FFFFFF?text=${encodeURIComponent(personalInfo.name || 'Portfolio')}`;
            } else {
                // Use the public image endpoint
                imageUrl = `${req.protocol}://${req.get('host')}/api/portfolio-image/${id}`;
            }
        } else {
            // Use a placeholder if no image is available
            imageUrl = `https://via.placeholder.com/1200x627/4F46E5/FFFFFF?text=${encodeURIComponent(personalInfo.name || 'Portfolio')}`;
        }
        
        // Ensure the URL is absolute and publicly accessible
        const portfolioUrl = `${req.protocol}://${req.get('host')}/portfolio/${id}`;
        
        // Generate the portfolio HTML with Open Graph tags for better sharing
        const portfolioHtml = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>${personalInfo.name || 'Portfolio'}</title>
                
                <!-- Open Graph / Facebook -->
                <meta property="og:type" content="website" />
                <meta property="og:url" content="${portfolioUrl}" />
                <meta property="og:title" content="${personalInfo.name || 'Portfolio'}" />
                <meta property="og:description" content="${portfolio.data.summary || 'Professional portfolio'}" />
                <meta property="og:image" content="${imageUrl}" />
                
                <!-- Twitter -->
                <meta property="twitter:card" content="summary_large_image" />
                <meta property="twitter:url" content="${portfolioUrl}" />
                <meta property="twitter:title" content="${personalInfo.name || 'Portfolio'}" />
                <meta property="twitter:description" content="${portfolio.data.summary || 'Professional portfolio'}" />
                <meta property="twitter:image" content="${imageUrl}" />
                
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                <style>
                    body { font-family: 'Inter', sans-serif; }
                    .font-mono { font-family: 'Roboto Mono', monospace; }
                    .social-link {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        width: 48px;
                        height: 48px;
                        border-radius: 50%;
                        transition: all 0.3s ease;
                    }
                    .social-link:hover {
                        transform: translateY(-3px);
                    }
                </style>
            </head>
            <body class="${portfolio.theme.background} ${portfolio.theme.font} min-h-screen">
                <div class="container mx-auto p-4 md:p-8 max-w-5xl">
                    <header class="flex flex-col md:flex-row items-center text-center md:text-left gap-8 mb-12">
                        <img src="${portfolio.profilePictureUrl}" alt="Profile Picture" class="w-36 h-36 rounded-full border-4 border-opacity-50 ${portfolio.theme.secondaryColor.replace('text-','border-')} object-cover shadow-lg">
                        <div>
                            <h1 class="text-4xl md:text-5xl font-bold">${personalInfo.name || 'Your Name'}</h1>
                            <p class="text-xl ${portfolio.theme.secondaryColor} mt-1">
                                ${personalInfo.email ? 
                                    `<a href="mailto:${personalInfo.email}" class="hover:underline">${personalInfo.email}</a>` : 
                                    'your.email@example.com'}
                            </p>
                            ${personalInfo.phone ? `<p class="text-gray-400 mb-4"><i class="fas fa-phone mr-2"></i>${personalInfo.phone}</p>` : ''}
                            <div class="flex justify-center md:justify-start gap-4 mt-4">
                                ${personalInfo.email ? `
                                    <a href="mailto:${personalInfo.email}" class="social-link ${portfolio.theme.secondaryColor} hover:text-white transition-colors" title="Email">
                                        <i class="fas fa-envelope text-xl"></i>
                                    </a>` : ''}
                                ${personalInfo.linkedin ? `
                                    <a href="${personalInfo.linkedin}" target="_blank" class="social-link ${portfolio.theme.secondaryColor} hover:text-white transition-colors" title="LinkedIn">
                                        <i class="fab fa-linkedin text-xl"></i>
                                    </a>` : ''}
                                ${personalInfo.github ? `
                                    <a href="${personalInfo.github}" target="_blank" class="social-link ${portfolio.theme.secondaryColor} hover:text-white transition-colors" title="GitHub">
                                        <i class="fab fa-github text-xl"></i>
                                    </a>` : ''}
                                ${personalInfo.website ? `
                                    <a href="${personalInfo.website}" target="_blank" class="social-link ${portfolio.theme.secondaryColor} hover:text-white transition-colors" title="Website">
                                        <i class="fas fa-globe text-xl"></i>
                                    </a>` : ''}
                            </div>
                        </div>
                    </header>
                    <div class="grid md:grid-cols-3 gap-8">
                        <div class="md:col-span-2 space-y-8">
                            <section>
                                <h2 class="text-2xl font-bold border-b-2 ${portfolio.theme.secondaryColor.replace('text-','border-')} pb-2 mb-4">Professional Summary</h2>
                                <p class="text-gray-300">${portfolio.data.summary || 'No summary provided.'}</p>
                            </section>
                            <section>
                                 <h2 class="text-2xl font-bold border-b-2 ${portfolio.theme.secondaryColor.replace('text-','border-')} pb-2 mb-4">Work Experience</h2>
                                 ${(portfolio.data.experience || []).map(job => `
                                    <div class="mb-4">
                                        <h4 class="text-lg font-bold">${job.role || 'Role'} at ${job.company || 'Company'}</h4>
                                        <p class="text-sm ${portfolio.theme.secondaryColor} mb-1">${job.dates || ''}</p>
                                        <ul class="list-disc list-inside text-gray-300">
                                            ${(job.description || []).map(d => `<li>${d}</li>`).join('')}
                                        </ul>
                                    </div>
                                 `).join('') || '<p class="text-gray-400">No work experience listed.</p>'}
                            </section>
                        </div>
                        <div class="md:col-span-1 space-y-8">
                            <section>
                                 <h2 class="text-2xl font-bold border-b-2 ${portfolio.theme.secondaryColor.replace('text-','border-')} pb-2 mb-4">Skills</h2>
                                 <div class="flex flex-wrap">
                                    ${(portfolio.data.skills || []).map(skill => `<span class="${portfolio.theme.primaryColor} text-white text-sm font-medium mr-2 mb-2 px-3 py-1 rounded-full">${skill}</span>`).join('') || '<p class="text-gray-400">No skills listed.</p>'}
                                 </div>
                            </section>
                            <section>
                                <h2 class="text-2xl font-bold border-b-2 ${portfolio.theme.secondaryColor.replace('text-','border-')} pb-2 mb-4">Projects</h2>
                                ${(portfolio.data.projects || []).map(proj => `
                                    <div class="${portfolio.theme.card} p-4 rounded-lg mb-4">
                                        <h4 class="font-bold ${portfolio.theme.secondaryColor}">${proj.title || 'Project Title'}</h4>
                                        <p class="text-gray-300 text-sm mt-1">${proj.description || ''}</p>
                                        ${proj.link ? `<a href="${proj.link}" target="_blank" class="text-blue-400 hover:underline text-sm mt-2 inline-block">View Project &rarr;</a>` : ''}
                                    </div>
                                `).join('') || '<p class="text-gray-400">No projects listed.</p>'}
                            </section>
                        </div>
                    </div>
                    
                    <!-- Add a footer with the portfolio URL -->
                    <footer class="mt-12 pt-6 border-t border-gray-700 text-center text-gray-500 text-sm">
                        <p>This portfolio is hosted at: ${portfolioUrl}</p>
                    </footer>
                </div>
            </body>
            </html>
        `;
        
        res.send(portfolioHtml);
    } catch (error) {
        console.error("Error serving portfolio:", error);
        res.status(500).send(createErrorPage('Server Error', 'We encountered an error while loading this portfolio. Please try again later.'));
    }
});
// Start server - listen on all interfaces
app.listen(port, '0.0.0.0', () => {
    console.log(`✅ PortfolioForge server is running at http://localhost:${port}`);
    console.log(`🔗 Portfolio URLs will be available at http://${localIp}:${port}/portfolio/:id`);
    console.log(`🌐 Shareable IP: http://${localIp}:${port}`);
    console.log(`🌐 Accessible from network at: http://0.0.0.0:${port}`);
});