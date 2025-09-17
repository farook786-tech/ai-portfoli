const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with anon key for public access
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async (event) => {
  try {
    const shareId = event.queryStringParameters.id;
    
    // Fetch portfolio from Supabase
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('share_id', shareId)
      .single();
    
    if (error || !data) {
      return { 
        statusCode: 404, 
        headers: { 'Content-Type': 'text/html' },
        body: '<!DOCTYPE html><html><head><title>Portfolio Not Found</title></head><body><h1>Portfolio Not Found</h1><p>The portfolio you are looking for does not exist or may have expired.</p></body></html>'
      };
    }
    
    // Generate HTML for the portfolio
    const html = generatePortfolioHTML(data);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: html
    };
  } catch (error) {
    console.error('Error in get-portfolio function:', error);
    return { 
      statusCode: 500, 
      headers: { 'Content-Type': 'text/html' },
      body: '<!DOCTYPE html><html><head><title>Error</title></head><body><h1>Server Error</h1><p>We encountered an error while loading this portfolio. Please try again later.</p></body></html>'
    };
  }
};

function generatePortfolioHTML(data) {
  const { portfolio_data, profile_picture_url, selected_theme } = data;
  const { personalInfo, summary, skills, experience, projects } = portfolio_data;
  
  // Get theme styles
  const themeStyles = getThemeStyles(selected_theme);
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${personalInfo.name || 'Portfolio'} | Professional Portfolio</title>
        
        <!-- Open Graph / Facebook -->
        <meta property="og:type" content="website" />
        <meta property="og:url" content="${process.env.URL}/shared/${data.share_id}" />
        <meta property="og:title" content="${personalInfo.name || 'Portfolio'}" />
        <meta property="og:description" content="${summary || 'Professional portfolio'}" />
        <meta property="og:image" content="${profile_picture_url || 'https://via.placeholder.com/1200x627/4F46E5/FFFFFF?text=Portfolio'}" />
        
        <!-- Twitter -->
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="${process.env.URL}/shared/${data.share_id}" />
        <meta property="twitter:title" content="${personalInfo.name || 'Portfolio'}" />
        <meta property="twitter:description" content="${summary || 'Professional portfolio'}" />
        <meta property="twitter:image" content="${profile_picture_url || 'https://via.placeholder.com/1200x627/4F46E5/FFFFFF?text=Portfolio'}" />
        
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
            ${themeStyles}
        </style>
    </head>
    <body class="${themeStyles.bodyClass} min-h-screen">
        <div class="container mx-auto p-4 md:p-8 max-w-5xl">
            <header class="flex flex-col md:flex-row items-center text-center md:text-left gap-8 mb-12">
                <img src="${profile_picture_url || 'https://via.placeholder.com/150'}" alt="Profile Picture" class="w-36 h-36 rounded-full border-4 ${themeStyles.borderColor} object-cover shadow-lg">
                <div>
                    <h1 class="text-4xl md:text-5xl font-bold">${personalInfo.name || 'Your Name'}</h1>
                    <p class="text-xl ${themeStyles.secondaryColor} mt-1">
                        ${personalInfo.email ? 
                            `<a href="mailto:${personalInfo.email}" class="hover:underline">${personalInfo.email}</a>` : 
                            'your.email@example.com'}
                    </p>
                    ${personalInfo.phone ? `<p class="${themeStyles.textColor} mb-4"><i class="fas fa-phone mr-2"></i>${personalInfo.phone}</p>` : ''}
                    <div class="flex justify-center md:justify-start gap-4 mt-4">
                        ${personalInfo.email ? `
                            <a href="mailto:${personalInfo.email}" class="social-link ${themeStyles.socialBg} hover:${themeStyles.socialHover} transition-colors" title="Email">
                                <i class="fas fa-envelope text-xl"></i>
                            </a>` : ''}
                        ${personalInfo.linkedin ? `
                            <a href="${personalInfo.linkedin}" target="_blank" class="social-link ${themeStyles.socialBg} hover:${themeStyles.socialHover} transition-colors" title="LinkedIn">
                                <i class="fab fa-linkedin text-xl"></i>
                            </a>` : ''}
                        ${personalInfo.github ? `
                            <a href="${personalInfo.github}" target="_blank" class="social-link ${themeStyles.socialBg} hover:${themeStyles.socialHover} transition-colors" title="GitHub">
                                <i class="fab fa-github text-xl"></i>
                            </a>` : ''}
                        ${personalInfo.website ? `
                            <a href="${personalInfo.website}" target="_blank" class="social-link ${themeStyles.socialBg} hover:${themeStyles.socialHover} transition-colors" title="Website">
                                <i class="fas fa-globe text-xl"></i>
                            </a>` : ''}
                    </div>
                </div>
            </header>
            <div class="grid md:grid-cols-3 gap-8">
                <div class="md:col-span-2 space-y-8">
                    <section>
                        <h2 class="text-2xl font-bold border-b-2 ${themeStyles.borderColor} pb-2 mb-4">Professional Summary</h2>
                        <p class="${themeStyles.textColor}">${summary || 'No summary provided.'}</p>
                    </section>
                    <section>
                         <h2 class="text-2xl font-bold border-b-2 ${themeStyles.borderColor} pb-2 mb-4">Work Experience</h2>
                         ${(experience || []).map(job => `
                            <div class="mb-4">
                                <h4 class="text-lg font-bold">${job.role || 'Role'} at ${job.company || 'Company'}</h4>
                                <p class="text-sm ${themeStyles.secondaryColor} mb-1">${job.dates || ''}</p>
                                <ul class="list-disc list-inside ${themeStyles.textColor}">
                                    ${(job.description || []).map(d => `<li>${d}</li>`).join('')}
                                </ul>
                            </div>
                         `).join('') || '<p class="text-gray-500">No work experience listed.</p>'}
                    </section>
                </div>
                <div class="md:col-span-1 space-y-8">
                    <section>
                         <h2 class="text-2xl font-bold border-b-2 ${themeStyles.borderColor} pb-2 mb-4">Skills</h2>
                         <div class="flex flex-wrap">
                            ${(skills || []).map(skill => `<span class="${themeStyles.skillBg} ${themeStyles.skillText} text-sm font-medium mr-2 mb-2 px-3 py-1 rounded-full">${skill}</span>`).join('') || '<p class="text-gray-500">No skills listed.</p>'}
                         </div>
                    </section>
                    <section>
                        <h2 class="text-2xl font-bold border-b-2 ${themeStyles.borderColor} pb-2 mb-4">Projects</h2>
                        ${(projects || []).map(proj => `
                            <div class="${themeStyles.cardBg} p-4 rounded-lg mb-4 shadow">
                                <h4 class="font-bold ${themeStyles.secondaryColor}">${proj.title || 'Project Title'}</h4>
                                <p class="${themeStyles.textColor} text-sm mt-1">${proj.description || ''}</p>
                                ${proj.link ? `<a href="${proj.link}" target="_blank" class="text-blue-400 hover:underline text-sm mt-2 inline-block">View Project &rarr;</a>` : ''}
                            </div>
                        `).join('') || '<p class="text-gray-500">No projects listed.</p>'}
                    </section>
                </div>
            </div>
            
            <!-- Add a footer with the portfolio URL -->
            <footer class="mt-12 pt-6 border-t ${themeStyles.borderColor.replace('border-', 'border-')} text-center ${themeStyles.textColor} text-sm">
                <p>This portfolio was created with PortfolioForge AI</p>
                <p class="mt-2">Shared via: ${process.env.URL}/shared/${data.share_id}</p>
            </footer>
        </div>
    </body>
    </html>
  `;
}

function getThemeStyles(themeName) {
  switch (themeName) {
    case 'Software Developer':
      return {
        bodyClass: 'bg-gray-900 text-white',
        textColor: 'text-gray-300',
        secondaryColor: 'text-blue-400',
        borderColor: 'border-blue-400',
        skillBg: 'bg-blue-500',
        skillText: 'text-white',
        cardBg: 'bg-gray-800',
        socialBg: 'bg-gray-800',
        socialHover: 'bg-gray-700',
      };
    case 'Graphic Designer':
      return {
        bodyClass: 'bg-white text-gray-800',
        textColor: 'text-gray-700',
        secondaryColor: 'text-pink-500',
        borderColor: 'border-pink-500',
        skillBg: 'bg-pink-100',
        skillText: 'text-pink-800',
        cardBg: 'bg-gray-50',
        socialBg: 'bg-pink-100',
        socialHover: 'bg-pink-200',
      };
    case 'Data Scientist':
      return {
        bodyClass: 'bg-gray-800 text-gray-100',
        textColor: 'text-gray-300',
        secondaryColor: 'text-green-400',
        borderColor: 'border-green-400',
        skillBg: 'bg-green-500',
        skillText: 'text-white',
        cardBg: 'bg-gray-700',
        socialBg: 'bg-gray-700',
        socialHover: 'bg-gray-600',
      };
    default: // Default theme
      return {
        bodyClass: 'bg-gray-100 text-gray-900',
        textColor: 'text-gray-700',
        secondaryColor: 'text-indigo-500',
        borderColor: 'border-indigo-500',
        skillBg: 'bg-indigo-100',
        skillText: 'text-indigo-800',
        cardBg: 'bg-white',
        socialBg: 'bg-indigo-100',
        socialHover: 'bg-indigo-200',
      };
  }
}