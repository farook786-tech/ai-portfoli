const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async (event) => {
  try {
    const { portfolioData, profilePictureUrl, selectedTheme } = JSON.parse(event.body);
    
    // Generate a unique share ID
    const shareId = uuidv4();
    
    // Store portfolio in Supabase
    const { data, error } = await supabase
      .from('portfolios')
      .insert([{
        share_id: shareId,
        portfolio_data: portfolioData,
        profile_picture_url: profilePictureUrl,
        selected_theme: selectedTheme
      }]);
    
    if (error) {
      console.error('Supabase error:', error);
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Failed to save portfolio' }) 
      };
    }
    
    // Return the shareable URL
    const shareUrl = `${process.env.URL}/shared/${shareId}`;
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        shareUrl, 
        shareId 
      })
    };
  } catch (error) {
    console.error('Error in share-portfolio function:', error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Internal server error' }) 
    };
  }
};