const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();
const { logger } = require('../config/logger');

const CATEGORY_GROUPS = {
  "Tech & Digital": [
    "Tech", "Software Development", "Artificial Intelligence", "Cybersecurity", "Web Design",
    "Mobile Apps", "Data Science", "Blockchain", "Crypto", "Gadgets", "Gaming",
    "E-sports", "Virtual Reality", "Social Media", "Cloud Computing"
  ],
  "Business & Finance": [
    "Business", "Finance", "Investing", "Entrepreneurship", "Marketing", "E-commerce",
    "Real Estate", "Personal Finance", "Stocks", "Leadership", "Workplace",
    "Startups", "Economics", "Insurance", "Management"
  ],
  "Lifestyle & Wellness": [
    "Lifestyle", "Health", "Mental Health", "Fitness", "Yoga", "Nutrition",
    "Meditation", "Self Improvement", "Relationships", "Parenting", "Fashion",
    "Beauty", "Skincare", "Travel", "Digital Nomad", "Van Life", "Minimalism"
  ],
  "Food & Drink": [
    "Food", "Cooking", "Baking", "Recipes", "Vegan", "Restaurants", "Wine",
    "Coffee", "Craft Beer", "Home Brewing"
  ],
  "Arts & Entertainment": [
    "Music", "Movies", "TV Shows", "Books", "Literature", "Art", "Design",
    "Photography", "Graphic Design", "Architecture", "Comedy", "Theater",
    "Dance", "Anime"
  ],
  "Science & Education": [
    "Science", "Space", "Astronomy", "Biology", "Physics", "Education",
    "Online Learning", "History", "Philosophy", "Psychology", "Sociology",
    "Environment", "Climate Change", "Sustainability", "Renewable Energy"
  ],
  "Hobbies & Interests": [
    "DIY", "Crafts", "Gardening", "Pets", "Automotive", "Sports",
    "Outdoor Adventure", "Hiking", "Fishing", "Interior Design",
    "Home Decor", "Board Games"
  ],
  "News & Society": [
    "Politics", "News", "Law", "Human Rights", "Charity", "Volunteering",
    "Culture", "Urban Planning", "Transportation"
  ]
};

const CATEGORIES = Object.values(CATEGORY_GROUPS).flat();

class AIService {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async categorizeContent(title, contentText, type) {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key') {
      return CATEGORIES[0]; // fallback if not configured
    }

    try {
      const prompt = `
      Analyze the following blog post and categorize it into exactly ONE of the most relevant categories provided.
      Categories: ${CATEGORIES.join(', ')}
      
      Return ONLY the exact category name. Nothing else.
      
      Post Type: ${type}
      Title: ${title}
      Content: ${contentText || 'No text content'}
      `;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      const category = response.text.trim();
      if (CATEGORIES.includes(category)) {
        return category;
      }
      return CATEGORIES[0]; // default fallback
    } catch (error) {
      logger.error('AI Categorization failed', { title, error: error.message, stack: error.stack });
      return CATEGORIES[0]; // graceful fallback
    }
  }
}

module.exports = {
  aiService: new AIService(),
  CATEGORY_GROUPS,
  CATEGORIES
};
