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
  // --- THIS IS THE FIX ---
  // Netlify provides the method in "event.httpMethod"
  const { httpMethod: method } = event;
  
  try {
    if (method === 'GET') {
      // Health check for the frontend
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
      // This part of your code handles resume uploads. No changes needed here.
      // In a real app, you might need a more robust parser for this.
      const base64Body = event.isBase64Encoded ? event.body : Buffer.from(event.body).toString('base64');
      const buffer = Buffer.from(base64Body, 'base64');
      const data = await pdfParse(buffer);
      body = { resumeText: data.text };

    } else {
      // This handles manual portfolio creation
      body = JSON.parse(event.body);
    }
    
    const { resumeText, manualData } = body;
    const portfolioData = resumeText ? await generateFromResume(resumeText) : await generateFromManual(manualData);
    const theme = themes[portfolioData.profession] || themes['Default'];
    
    // Save to Supabase and return the result
    const { data, error } = await supabase
      .from('portfolios')
      .insert([{ portfolio_data: portfolioData, selected_theme: theme }])
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase error: ${error.message}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ portfolio: data, theme })
    };

  } catch (error) {
    console.error('Error in generate-portfolio function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `An internal server error occurred: ${error.message}` })
    };
  }
};


// --- All helper functions below remain unchanged ---

async function generateFromResume(resumeText) {
  const model = genAI.getGenerativeModel({ model: "gemini-pro"});
  const prompt = `Analyze the following resume text and generate a JSON object for a personal portfolio. The JSON should have these exact keys: "name", "title", "bio" (a short, professional summary), "email", "linkedin" (URL if found), "github" (URL if found), "skills" (an array of key skills), and "projects" (an array of objects, where each object has "title", "description", and "link" keys). Extract all information directly from the resume. \n\nResume Text:\n${resumeText}`;
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = await response.text();

  const cleanedJsonString = text.replace(/```json\n|```/g, '').trim();
  const data = JSON.parse(cleanedJsonString);
  
  const professionModel = genAI.getGenerativeModel({ model: "gemini-pro" });
  const professionPrompt = `Based on the following resume text, classify the person's profession into one of these categories: 'Software Developer', 'Graphic Designer', 'Data Scientist', or 'Default'.\n\n${resumeText}`;
  
  const profResult = await professionModel.generateContent(professionPrompt);
  const profResponse = await profResult.response;
  data.profession = (await profResponse.text()).trim();

  return data;
}

async function generateFromManual(manualData) {
  // In a real app, you would process the manual data here.
  // For now, we just add a default profession.
  manualData.profession = 'Default';
  return manualData;
}

// Theme data remains unchanged
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
      buttonStyle: 'bg-indigo-700 hover:bg-indigo-800'
    }
};
