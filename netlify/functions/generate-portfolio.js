const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { v4: uuidv4 } = require('uuid');
const pdfParse = require('pdf-parse');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

exports.handler = async (event) => {
  try {
    const { method } = event;
    
    if (method === 'GET') {
      // Health check
      return {
        statusCode: 200,
        body: JSON.stringify({ status: 'OK', message: 'PortfolioForge API is running' })
      };
    }
    
    if (method !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }
    
    const contentType = event.headers['content-type'];
    let body;
    
    if (contentType && contentType.includes('multipart/form-data')) {
      // Handle form data (for file uploads)
      // Note: Netlify Functions don't support multipart/form-data natively
      // This is a simplified version - in production, you'd need a different approach
      body = JSON.parse(event.body);
    } else {
      body = JSON.parse(event.body);
    }
    
    const { type, portfolioData, theme, profilePictureUrl } = body;
    
    if (type === 'manual') {
      // Manual portfolio creation
      const portfolioId = uuidv4();
      
      // Store in Supabase
      const { data, error } = await supabase
        .from('portfolios')
        .insert([{
          share_id: portfolioId,
          portfolio_data: portfolioData,
          profile_picture_url: profilePictureUrl,
          selected_theme: theme.name
        }]);
      
      if (error) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to save portfolio' })
        };
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          portfolioId,
          portfolioData,
          theme,
          profilePictureUrl
        })
      };
    }
    
    if (type === 'ai') {
      // AI portfolio generation
      // Note: This is a simplified version without actual file processing
      // In a real implementation, you'd need to handle file uploads differently
      
      // Simulate AI processing
      const parsedData = await parseResumeWithAI(body.resumeText || '');
      const selectedTheme = await classifyProfessionAndSelectTheme(parsedData);
      
      const portfolioId = uuidv4();
      
      // Store in Supabase
      const { data, error } = await supabase
        .from('portfolios')
        .insert([{
          share_id: portfolioId,
          portfolio_data: parsedData,
          profile_picture_url: body.profilePictureUrl || '',
          selected_theme: selectedTheme.name
        }]);
      
      if (error) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to save portfolio' })
        };
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          portfolioId,
          portfolioData: parsedData,
          theme: selectedTheme,
          profilePictureUrl: body.profilePictureUrl || ''
        })
      };
    }
    
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid request type' })
    };
    
  } catch (error) {
    console.error('Error in generate-portfolio function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

// Helper functions (simplified for Netlify Functions)
async function parseResumeWithAI(resumeText) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const prompt = `
      You are an expert resume parser. Analyze the following resume text and extract the information into a structured JSON object.
      The JSON object should have the following keys:
      - "personalInfo": An object with "name", "email", "phone", "website", "linkedin", and "github".
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
    
    if (!jsonText.startsWith('{')) {
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }
    }
    
    return JSON.parse(jsonText);
  } catch (e) {
    console.error("Failed to parse JSON from AI response:", e);
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
    
    return themes[profession] || themes['Default'];
  } catch (error) {
    console.error("Error classifying profession:", error);
    return themes['Default'];
  }
}