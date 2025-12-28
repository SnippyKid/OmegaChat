import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

// Cache for working model to avoid testing on every call
let cachedWorkingModel = null;
let modelCacheTime = 0;
const MODEL_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Function to list available models from the API
async function listAvailableModels(apiKey) {
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models';
    const response = await axios.get(url, {
      headers: {
        'x-goog-api-key': apiKey
      }
    });
    
    if (response.data && response.data.models) {
      // Filter models that support generateContent
      const availableModels = response.data.models
        .filter(model => 
          model.supportedGenerationMethods && 
          model.supportedGenerationMethods.includes('generateContent')
        )
        .map(model => model.name.replace('models/', ''));
      
      console.log('📋 Available models:', availableModels);
      return availableModels;
    }
    return [];
  } catch (error) {
    console.log('⚠️ Could not list models from API:', error.message);
    return [];
  }
}

export async function generateCodeSnippet(prompt, context = '') {
  try {
    // Get API key fresh from environment each time
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      console.error('❌ GEMINI_API_KEY is not set or is empty');
      throw new Error('GEMINI_API_KEY is not set in environment variables. Please check your .env file.');
    }

    // Check for common API key issues
    if (apiKey.includes('your-gemini-api-key') || apiKey.includes('placeholder')) {
      console.error('❌ GEMINI_API_KEY appears to be a placeholder');
      throw new Error('GEMINI_API_KEY appears to be a placeholder. Please check your .env file and ensure you have a valid Gemini API key from https://aistudio.google.com/apikey');
    }
    
    if (!apiKey.startsWith('AIzaSy')) {
      console.error('❌ GEMINI_API_KEY format appears incorrect (should start with AIzaSy)');
      throw new Error('GEMINI_API_KEY format appears incorrect. Gemini API keys should start with "AIzaSy". Please verify your key at https://aistudio.google.com/apikey');
    }

    // Initialize GoogleGenerativeAI with the API key
    const genAI = new GoogleGenerativeAI(apiKey.trim());

    // Pick the fastest available model without doing multiple probe calls.
    // Order: explicit env override -> cached working -> default flash -> pro fallbacks.
    const now = Date.now();
    const modelCandidates = [
      process.env.GEMINI_MODEL?.trim(),
      (cachedWorkingModel && (now - modelCacheTime) < MODEL_CACHE_DURATION) ? cachedWorkingModel : null,
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-pro'
    ].filter(Boolean);

    const uniqueCandidates = [...new Set(modelCandidates)];

    let model = null;
    let successfulModel = null;

    for (const candidate of uniqueCandidates) {
      try {
        model = genAI.getGenerativeModel({ model: candidate });
        successfulModel = candidate;
        cachedWorkingModel = candidate;
        modelCacheTime = now;
        break;
      } catch (e) {
        console.log(`⚠️ Failed to init model ${candidate}:`, e.message);
      }
    }

    if (!model) {
      throw new Error('No valid Gemini model could be initialized. Check GEMINI_MODEL or try gemini-1.5-flash.');
    }

    const systemInstruction = `You are Omega, an AI code assistant. 

**IMPORTANT: Understand the user's intent first!**

- If the user is just greeting you (hi, hello, hey, etc.), respond naturally and conversationally. Do NOT generate code.
- If the user asks a question or needs help, respond conversationally first, then offer to help with code if relevant.
- Only generate code when the user explicitly asks for code, a function, a solution, or something technical.

**REPOSITORY CONTEXT ACCESS:**
When repository context is provided in the user message (you'll see "Repository Context:" section), you HAVE FULL ACCESS to the repository files and codebase. This means:
- You can read, explain, and reference any files mentioned in the repository context
- You can answer questions about the codebase, files, functions, and structure
- You can explain what files do, how they work, and their relationships
- When asked about a file (like "explain readme.md"), USE the repository context to find and explain that file
- The repository context contains actual file contents - use them to provide accurate answers
- If a user asks about a file that's in the repository context, you MUST use that context to answer, not say you don't have access

**When generating code, follow this format:**

1. **Explanation Section** (First):
   - Start with a clear, concise explanation of what the user is asking for
   - Explain the approach or solution strategy
   - Keep it simple and easy to understand (2-4 sentences max)

2. **Solution Section** (After explanation):
   - Provide the actual code solution
   - Use clean, well-commented code following best practices
   - Format code in markdown code blocks with language identifier

**Response Format (ONLY when code is needed):**
[Your explanation here - what the problem is and how we'll solve it]

\`\`\`[language]
[Your code solution here]
\`\`\`

**Rules:**
- Be friendly and conversational for greetings and questions
- Only generate code when explicitly requested
- Keep explanations simple and brief
- Code should be production-ready and well-commented
- If user asks for a specific language/framework, use that
- When repository context is provided, match existing code patterns and style
- **CRITICAL: If repository context is provided and user asks about files/code, USE that context to answer - you have access to those files!**
- Be concise - avoid unnecessary verbosity`;

    const userMessage = context 
      ? `${context}\n\nUser request: ${prompt}`
      : prompt;

    const fullPrompt = `${systemInstruction}\n\n${userMessage}`;

    let result;
    let response;
    
    try {
      // Generate content - ensure model is valid
      if (!model) {
        throw new Error('No valid model found. Please check your API key and model availability.');
      }
      
      result = await model.generateContent(fullPrompt);
      // text() is synchronous in Google Generative AI SDK
      response = result.response.text();
    } catch (apiError) {
      console.error('❌ Gemini API call failed:', apiError);
      console.error('API Error details:', {
        message: apiError.message,
        status: apiError.status,
        statusText: apiError.statusText,
        response: apiError.response?.data,
        errorDetails: apiError.cause
      });
      
      // Log the full error for debugging
      if (apiError.stack) {
        console.error('Full error stack:', apiError.stack);
      }
      
      // Provide helpful error messages for specific errors
      if (apiError.message?.includes('403') || apiError.message?.includes('Forbidden') || apiError.message?.includes('unregistered callers')) {
        const helpfulMessage = `Gemini API authentication failed (403 Forbidden). 

Possible causes:
1. API key is invalid or expired
2. API key has been blocked/leaked (check https://aistudio.google.com/apikey)
3. API key has restrictions that block this usage
4. API key format is incorrect

Please:
- Verify your API key at: https://aistudio.google.com/apikey
- Check if the key is blocked or needs to be regenerated
- Ensure API key restrictions allow "Generative Language API"
- Restart the server after updating .env

Original error: ${apiError.message}`;
        throw new Error(helpfulMessage);
      }
      
      if (apiError.message?.includes('404') || apiError.message?.includes('not found')) {
        const helpfulMessage = `Gemini API model not found (404). The model 'gemini-pro' should be available. 

Possible causes:
1. API key doesn't have access to the model
2. Model name is incorrect
3. API version mismatch

Please:
- Verify your API key has access to Gemini models
- Check API key permissions at: https://aistudio.google.com/apikey
- Try regenerating your API key

Original error: ${apiError.message}`;
        throw new Error(helpfulMessage);
      }
      
      throw new Error(`Gemini API error: ${apiError.message || 'Unknown API error'}`);
    }
    
    // Parse response to extract explanation and code
    // Expected format: [Explanation text]\n\n```[language]\n[code]\n```
    
    // Extract code blocks
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    const codeBlocks = [];
    let match;
    let responseWithoutCode = response;
    
    while ((match = codeBlockRegex.exec(response)) !== null) {
      const language = match[1] || 'javascript';
      const code = match[2].trim();
      codeBlocks.push({ language, code });
      // Remove code block from response to get explanation
      responseWithoutCode = responseWithoutCode.replace(match[0], '').trim();
    }
    
    // Clean up explanation - remove markdown formatting artifacts
    let explanation = responseWithoutCode
      .replace(/^\*\*Explanation:\*\*/i, '')
      .replace(/^\*\*Solution:\*\*/i, '')
      .replace(/^Explanation:/i, '')
      .replace(/^Solution:/i, '')
      .replace(/^#+\s*/g, '') // Remove markdown headers
      .trim();
    
    // If no explanation found before code, try to extract from beginning of response
    if (!explanation || explanation.length < 10) {
      // Look for text before first code block
      const firstCodeBlockIndex = response.indexOf('```');
      if (firstCodeBlockIndex > 0) {
        explanation = response.substring(0, firstCodeBlockIndex)
          .replace(/^\*\*.*?\*\*\s*/g, '')
          .replace(/^#+\s*/g, '')
          .trim();
      }
    }
    
    // If still no explanation, use a default
    if (!explanation || explanation.length < 10) {
      explanation = 'Here\'s the solution:';
    }
    
    // If code blocks were found, use them
    if (codeBlocks.length > 0) {
      const finalCode = codeBlocks[0].code;
      const finalLanguage = codeBlocks[0].language || 'javascript';
      
      return {
        code: finalCode,
        language: finalLanguage,
        explanation: explanation,
        allBlocks: codeBlocks
      };
    } else {
      // No code blocks - this is a text-only response
      return {
        code: null,
        language: null,
        explanation: response.trim(),
        allBlocks: []
      };
    }
  } catch (error) {
    console.error('❌ Gemini API Error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Return a helpful error message
    throw new Error(`Failed to generate code: ${error.message || 'Unknown error'}`);
  }
}
