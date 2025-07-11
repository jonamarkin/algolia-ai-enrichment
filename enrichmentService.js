require('dotenv').config();
const { GoogleGenAI } = require('@google/genai'); 
const fs = require('fs/promises'); 

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// SDK Initialization
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const MODEL_NAME = "gemini-1.5-flash"; // Define model name as a constant

// Function to call Gemini for summarization and keyword extraction
async function enrichContentWithAI(content, objectId) {
    if (!content || typeof content !== 'string') {
        console.warn(`Skipping enrichment for objectID ${objectId}: Invalid content provided.`);
        return {
            summary: null,
            keywords: [],
            category: null,
            sentiment: null
        };
    }

    const prompt = `
    You are an expert content analyzer. For the following text, perform the following tasks:
    1. Summarize the content concisely, in about 2-3 sentences.
    2. Identify 5-7 main keywords or tags that accurately describe the content. Provide them as a comma-separated list.
    3. Categorize the content into one of these broad categories: Technology, Environment, Healthcare, Business, Education, Science, Arts & Culture, General. If none fit perfectly, use 'General'.
    4. Based on the overall tone, assign a sentiment: Positive, Neutral, or Negative.

    Provide the output in a JSON format with keys: "summary", "keywords", "category", "sentiment".

    Content:
    ---
    ${content}
    ---
    `;

    try {
        console.log(`Sending content for enrichment (ID: ${objectId})...`);

        const result = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        });

        // Check if candidates exist and have content parts
        if (!result || !result.candidates || result.candidates.length === 0 ||
            !result.candidates[0].content || !result.candidates[0].content.parts ||
            result.candidates[0].content.parts.length === 0 ||
            !result.candidates[0].content.parts[0].text) {

            console.error(`Debug: Unexpected API response structure for ${objectId}:`, JSON.stringify(result, null, 2));
            // If there's no successful candidate, check for prompt feedback (e.g., safety issues)
            if (result && result.promptFeedback && result.promptFeedback.safetyRatings) {
                console.error(`Debug: Prompt feedback safety ratings for ${objectId}:`, JSON.stringify(result.promptFeedback.safetyRatings, null, 2));
            }
            throw new Error("Gemini API did not return a valid text candidate.");
        }

        const text = result.candidates[0].content.parts[0].text; // Directly get the text!

        // Attempt to parse the JSON string from the model's response
        // The model is returning ````json\n{...}\n```\n`, so we need to remove that.
        const cleanedText = text.replace(/^```json\n|\n```$/g, '').trim();

        const jsonStartIndex = cleanedText.indexOf('{');
        const jsonEndIndex = cleanedText.lastIndexOf('}');
        let jsonString = '';
        if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
            jsonString = cleanedText.substring(jsonStartIndex, jsonEndIndex + 1);
        } else {
            console.warn(`Debug: Could not find valid JSON boundaries in Gemini response for ${objectId}: "${cleanedText.substring(0, 200)}..."`);
            throw new Error("Could not find valid JSON in Gemini response: " + cleanedText);
        }

        const parsedResult = JSON.parse(jsonString);

        console.log(`Enrichment successful for ID: ${objectId}`);
        return {
            summary: parsedResult.summary || null,
            keywords: parsedResult.keywords ? parsedResult.keywords.split(',').map(k => k.trim()) : [],
            category: parsedResult.category || null,
            sentiment: parsedResult.sentiment || null
        };
    } catch (error) {
        console.error(`Error enriching content for objectID ${objectId}:`, error.message);
        // Return default/empty values if enrichment fails to prevent pipeline breaks
        return {
            summary: null,
            keywords: [],
            category: null,
            sentiment: null
        };
    }
}

// Main function to read data and process it
async function processArticles(filePath) {
    try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const articles = JSON.parse(fileContent);

        const enrichedArticles = [];
        for (const article of articles) {
            const enrichment = await enrichContentWithAI(article.content, article.objectID);
            enrichedArticles.push({
                ...article,
                ai_summary: enrichment.summary,
                ai_keywords: enrichment.keywords,
                ai_category: enrichment.category,
                ai_sentiment: enrichment.sentiment
            });
        }
        return enrichedArticles;

    } catch (error) {
        console.error(`Error processing articles from ${filePath}:`, error);
        return [];
    }
}


async function testEnrichment() {
    console.log("Testing AI enrichment process...");
    const sampleFilePath = './data/articles.json';
    const enrichedData = await processArticles(sampleFilePath);
    console.log("\n--- Enriched Data Sample ---");
    if (enrichedData.length === 0) {
        console.log("No enriched data returned. Check for errors above.");
    } else {
        enrichedData.forEach(article => {
            console.log(`ID: ${article.objectID}`);
            console.log(`Title: ${article.title}`);
            console.log(`AI Summary: ${article.ai_summary}`);
            console.log(`AI Keywords: ${article.ai_keywords.join(', ')}`);
            console.log(`AI Category: ${article.ai_category}`);
            console.log(`AI Sentiment: ${article.ai_sentiment}`);
            console.log('---');
        });
    }
    console.log("\nTesting complete.");
}

testEnrichment();

module.exports = {
    processArticles,
    enrichContentWithAI
};