import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

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

    console.log('🔑 API Key found, length:', apiKey.length);
    console.log('🔑 API Key starts with:', apiKey.substring(0, 10) + '...');

    // Initialize GoogleGenerativeAI with the API key
    const genAI = new GoogleGenerativeAI(apiKey.trim());

    // First, try to get the list of available models from the API
    console.log('🔍 Fetching available models from API...');
    let availableModels = await listAvailableModels(apiKey.trim());
    
    // Fallback models if API listing fails
    const fallbackModels = [
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-pro'
    ];
    
    // Use available models from API, or fallback to our list
    const modelsToTry = availableModels.length > 0 
      ? availableModels 
      : fallbackModels;
    
    console.log(`📝 Will try ${modelsToTry.length} models:`, modelsToTry);
    
    let model = null;
    let successfulModel = null;
    let lastError = null;
    
    // Try each model by actually testing it with a simple API call
    for (const modelName of modelsToTry) {
      try {
        const testModel = genAI.getGenerativeModel({ model: modelName });
        // Actually test the model with a simple call
        const testResult = await testModel.generateContent('test');
        const testResponse = testResult.response.text();
        
        // If we get here, the model works!
        model = testModel;
        successfulModel = modelName;
        console.log(`✅ Model ${modelName} is working!`);
        break;
      } catch (e) {
        console.log(`⚠️ Model ${modelName} failed: ${e.message?.substring(0, 150)}`);
        lastError = e;
        // Continue to next model
      }
    }
    
    if (!model) {
      const errorMsg = `Failed to find a working Gemini model. 

Tried models: ${modelsToTry.join(', ')}

Possible solutions:
1. Your API key may not have access to Gemini models
2. The API key might be restricted or blocked
3. Generative Language API may not be fully enabled yet (wait a few minutes)

Please:
- Visit https://aistudio.google.com/apikey
- Verify your API key is active
- Wait a few minutes after enabling the API for it to propagate
- Try creating a new API key

Last error: ${lastError?.message || 'Unknown error'}`;
      throw new Error(errorMsg);
    }
    
    console.log(`🎯 Using working model: ${successfulModel}`);

    const systemInstruction = `You are Omega, an AI code assistant specialized in generating high-quality code snippets. 
Provide clean, well-commented code that follows best practices. 
If the user asks for code in a specific language or framework, use that.
Always include a brief explanation of what the code does.
Format your response with code in markdown code blocks.

When repository context is provided, use it to:
- Understand the project structure and existing code patterns
- Match the coding style and conventions used in the repository
- Reference existing files and functions when relevant
- Suggest code that integrates well with the existing codebase
- Follow the project's architecture and patterns`;

    const userMessage = context 
      ? `${context}\n\nUser request: ${prompt}`
      : prompt;

    const fullPrompt = `${systemInstruction}\n\n${userMessage}`;

    console.log('🤖 Generating code for prompt:', prompt.substring(0, 50) + '...');
    console.log('📝 Full prompt length:', fullPrompt.length);

    let result;
    let response;
    
    try {
      // Generate content - pass string directly (simpler format)
      result = await model.generateContent(fullPrompt);
      response = result.response.text();
      console.log('✅ AI Response received, length:', response.length);
      console.log('📄 Response preview:', response.substring(0, 200));
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
    
    // Extract code blocks and explanation
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const codeBlocks = [];
    let match;
    let explanation = response;
    
    while ((match = codeBlockRegex.exec(response)) !== null) {
      const language = match[1] || 'javascript';
      const code = match[2];
      codeBlocks.push({ language, code });
      explanation = explanation.replace(match[0], '');
    }
    
    // If code blocks were found, use them; otherwise, it's a text-only response
    if (codeBlocks.length > 0) {
      // Has code blocks - return the first one as code, rest as explanation
      const finalCode = codeBlocks[0].code;
      const finalLanguage = codeBlocks[0].language || 'javascript';
      const finalExplanation = explanation.trim() || 'Code generated successfully';
      
      return {
        code: finalCode,
        language: finalLanguage,
        explanation: finalExplanation,
        allBlocks: codeBlocks
      };
    } else {
      // No code blocks - this is a text-only response
      return {
        code: null, // No code to display
        language: null,
        explanation: response.trim(), // Full response is the explanation/text
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
