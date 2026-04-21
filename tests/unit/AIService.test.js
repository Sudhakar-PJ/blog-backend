const { aiService } = require('../../src/services/AIService');
const { logger } = require('../../src/config/logger');

describe('AIService Unit Tests', () => {
  let generateContentSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = 'real-key-mock';
    // Use spyOn so we interact with the actual (or previously cached) instance safely
    generateContentSpy = jest.spyOn(aiService.ai.models, 'generateContent').mockResolvedValue({
      text: 'Gaming'
    });
  });

  afterAll(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it('should categorize content successfully with a valid category', async () => {
    const category = await aiService.categorizeContent('New GPU release', 'Text about tech and gaming', 'text');
    expect(category).toBe('Gaming');
  });

  it('should fallback to default category if AI returns an invalid one', async () => {
    // Override the mock for this specific call
    generateContentSpy.mockResolvedValueOnce({
      text: 'InvalidCategoryName'
    });

    const category = await aiService.categorizeContent('Title', 'Content', 'text');
    expect(category).toBe('Tech'); // First in CATEGORIES
  });

  it('should fallback to default if API key is missing or default', async () => {
    process.env.GEMINI_API_KEY = 'your_gemini_api_key';
    const category = await aiService.categorizeContent('Title', 'Content', 'text');
    expect(category).toBe('Tech');
  });

  it('should handle errors gracefully and return fallback', async () => {
    const spy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    generateContentSpy.mockRejectedValueOnce(new Error('API Failure'));

    const category = await aiService.categorizeContent('Title', 'Content', 'text');
    expect(category).toBe('Tech');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
