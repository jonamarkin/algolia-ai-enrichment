require('dotenv').config(); 
const { algoliasearch } = require('algoliasearch');
const { processArticles } = require('./enrichmentService'); 

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
const ALGOLIA_ADMIN_API_KEY = process.env.ALGOLIA_ADMIN_API_KEY;
const ALGOLIA_INDEX_NAME = 'articles_enriched_by_ai';

// Initialize Algolia client 
const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);

async function indexEnrichedData() {
    console.log(`Starting data enrichment and indexing to Algolia index: ${ALGOLIA_INDEX_NAME}`);
    try {
        const articlesFilePath = './data/articles.json';
        const enrichedArticles = await processArticles(articlesFilePath);

        if (enrichedArticles.length === 0) {
            console.warn("No articles were enriched. Nothing to index.");
            return;
        }

        console.log(`Successfully enriched ${enrichedArticles.length} articles. Now indexing to Algolia...`);

        const saveObjectsResponse = await client.saveObjects({
            indexName: ALGOLIA_INDEX_NAME,
            objects: enrichedArticles, 
        });


        const taskID = saveObjectsResponse[0].taskID; 

        if (typeof taskID === 'undefined' || taskID === null) {
            console.error("Error: taskID was not returned by client.saveObjects. Check Algolia API response structure.");
            console.error("saveObjectsResponse:", JSON.stringify(saveObjectsResponse, null, 2));
            throw new Error("Algolia indexing task ID missing.");
        }

        console.log(`Indexing task ${taskID} submitted. Waiting for task to complete...`);
        await client.waitForTask({
            indexName: ALGOLIA_INDEX_NAME,
            taskID: taskID
        });

        console.log(`Successfully indexed articles to Algolia index: ${ALGOLIA_INDEX_NAME}`);
        console.log(`\nVerification: Go to your Algolia dashboard, navigate to the '${ALGOLIA_INDEX_NAME}' index, and inspect the records.`);
        console.log("Look for 'ai_summary', 'ai_keywords', 'ai_category', and 'ai_sentiment' attributes.");

    } catch (error) {
        console.error("Error during data enrichment or Algolia indexing:", error);
        if (error.status && error.message) {
            console.error(`Algolia API Error: Status ${error.status} - ${error.message}`);
        }
        if (error.details) {
            console.error("Algolia Error Details:", JSON.stringify(error.details, null, 2));
        }
    }
}

// Run the indexing process
indexEnrichedData();