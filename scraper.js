const http = require('http');
const fs = require('fs');
const { exec } = require('child_process');
const cheerio = require('cheerio');

// Add puppeteer - install with: npm install puppeteer
let puppeteer;
try {
    puppeteer = require('puppeteer');
} catch (e) {
    console.log('Puppeteer not installed. Run: npm install puppeteer');
    console.log('Will fall back to curl for all requests.');
}

const port = process.env.PORT || 3000;
const host = '0.0.0.0';

const server = http.createServer(function(req, res) {
    if (req.url === '/health' || req.url === '/ping') {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('OK');
        return;
    }
    if (req.url.startsWith('/api/scrape')) {
        scrapeWebsite(req, res);
    } else if (req.url.startsWith('/api/preview')) {
        previewPage(req, res);
    } else if (req.url.startsWith('/api/analyze-content')) {
        analyzeContent(req, res);
    } else if (req.url === '/api/test') {
        // Simple test endpoint for n8n
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ 
            status: 'ok', 
            message: 'Scraper API is running!',
            endpoints: {
                scrape: '/api/scrape?url=YOUR_URL',
                analyze: '/api/analyze-content?url=YOUR_URL&keywords=keyword1,keyword2',
                follow: '/api/follow-redirect?url=YOUR_URL'
            }
        }));
    } else if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, {'Content-Type': 'text/html'});
        fs.readFile('index.html', function(error, data) {
            if (error) {
                res.writeHead(404);
                res.write('Error: File Not Found');
            } else {
                res.write(data);
            }
            res.end();
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

function getBaseUrl(req) {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const hostname = req.headers.host;
    return `${protocol}://${hostname}`;
}

server.listen(port, host, function(error) {
    if (error) {
        console.log('Something went wrong', error);
    } else {
        console.log('Server is listening on ' + host + ':' + port);
        console.log('Environment: ' + (process.env.PORT ? 'Production (Render)' : 'Local Development'));
        if (!process.env.PORT) {
            console.log('Open http://localhost:' + port + ' in your browser');
        }
        if (puppeteer) {
            console.log('Puppeteer available - will use browser automation for protected sites');
        } else {
            console.log('Puppeteer not available - install with: npm install puppeteer');
        }
    }
});

// Smart detection: try to identify if browser automation is needed
function needsBrowserAutomation(url) {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.toLowerCase();
        
        // Known categories of sites that need browser automation
        const patterns = {
            // Social media - always JavaScript heavy
            social: ['linkedin', 'facebook', 'instagram', 'twitter', 'tiktok', 'snapchat', 'pinterest'],
            
            // Job boards - dynamic content loading
            jobs: ['indeed', 'glassdoor', 'ziprecruiter', 'lensa', 'monster', 'dice', 'careerbuilder'],
            
            // E-commerce - anti-scraping protection
            ecommerce: ['amazon', 'ebay', 'walmart', 'target', 'bestbuy', 'shopify', 'etsy', 'alibaba'],
            
            // Streaming/media - JavaScript rendered
            media: ['youtube', 'netflix', 'hulu', 'spotify', 'twitch', 'vimeo', 'soundcloud'],
            
            // Travel/booking - heavy JS + anti-bot
            travel: ['airbnb', 'booking', 'expedia', 'hotels', 'tripadvisor', 'kayak'],
            
            // High-security sites
            protected: ['nike', 'adidas', 'supreme', 'ticketmaster', 'stubhub'],
            
            // SPAs (Single Page Apps)
            spa: ['reddit', 'discord', 'slack', 'notion', 'airtable', 'asana', 'trello', 'figma'],
        };
        
        // Check all patterns
        for (const category in patterns) {
            if (patterns[category].some(site => domain.includes(site))) {
                console.log(`[DETECTION] ${domain} matched category: ${category} - using browser automation`);
                return true;
            }
        }
        
        // Check for anti-bot indicators in the domain itself
        if (domain.includes('cloudflare') || domain.includes('captcha')) {
            console.log(`[DETECTION] ${domain} has anti-bot protection - using browser automation`);
            return true;
        }
        
        console.log(`[DETECTION] ${domain} - using curl (will fallback to Puppeteer if needed)`);
        return false;
        
    } catch (e) {
        return false;
    }
}

// Scrape using Puppeteer (real browser)
async function scrapeWithPuppeteer(url) {
    console.log('Using Puppeteer (headless browser) for:', url);
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--window-size=1920,1080',
            '--disable-infobars',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
        ]
    });
    
    try {
        const page = await browser.newPage();
        
        // Advanced anti-detection measures
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
            
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {}
            };
            
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
            
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            window.navigator.__proto__.toString = () => '[object Navigator]';
        });
        
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.google.com/',
            'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
        });
        
        console.log('Loading page...');
        await page.goto(url, { 
            waitUntil: 'networkidle0',
            timeout: 60000
        });
        
        // Wait for initial content to load
        console.log('Waiting for content to load...');
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        // Check for anti-bot challenges
        const pageTitle = await page.title();
        const bodyText = await page.evaluate(() => document.body.innerText);
        
        if (bodyText.includes('Just a moment') || 
            bodyText.includes('Checking your browser') ||
            bodyText.includes('Cloudflare') ||
            pageTitle.includes('Just a moment')) {
            console.log('Challenge detected, waiting longer...');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
        // Scroll multiple times to trigger lazy-loaded content
        console.log('Scrolling to load dynamic content...');
        for (let scrollPass = 0; scrollPass < 3; scrollPass++) {
            console.log(`Scroll pass ${scrollPass + 1}/3`);
            
            await page.evaluate(async () => {
                await new Promise((resolve) => {
                    let totalHeight = 0;
                    const distance = 100;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        
                        if (totalHeight >= scrollHeight) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 100);
                });
            });
            
            // Wait for content to load after scrolling
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Final wait for any remaining content
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const html = await page.content();
        console.log('Page loaded successfully, HTML length:', html.length);
        
        await browser.close();
        return html;
        
    } catch (error) {
        await browser.close();
        throw error;
    }
}

// Scrape using Puppeteer with enhanced stealth mode
async function scrapeWithPuppeteerStealth(url) {
    console.log('Using enhanced stealth Puppeteer for:', url);
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--window-size=1920,1080',
            '--disable-infobars',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        ]
    });
    
    try {
        const page = await browser.newPage();
        
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            
            window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {}, app: {} };
            
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
        });
        
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.google.com/',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        });
        
        console.log('Navigating to page with extended timeout...');
        await page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: 90000
        });
        
        await page.waitForSelector('body', { timeout: 30000 });
        
        // Wait for initial content
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        // Scroll multiple times to trigger lazy-loaded content
        console.log('Scrolling to load dynamic content...');
        for (let scrollPass = 0; scrollPass < 3; scrollPass++) {
            console.log(`Scroll pass ${scrollPass + 1}/3`);
            
            await page.evaluate(async () => {
                await new Promise((resolve) => {
                    let totalHeight = 0;
                    const distance = 100;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        
                        if (totalHeight >= scrollHeight) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 100);
                });
            });
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const html = await page.content();
        console.log('Stealth scrape successful, HTML length:', html.length);
        
        await browser.close();
        return html;
        
    } catch (error) {
        await browser.close();
        throw error;
    }
}

// Scrape using curl (fast, but limited)
async function scrapeWithCurl(url) {
    console.log('Using curl for:', url);
    
    const curlCmd = buildCurlCommand(url);
    
    return new Promise((resolve, reject) => {
        exec(curlCmd, { 
            maxBuffer: 1024 * 1024 * 10, 
            timeout: 10000  // 10 second timeout for faster failure
        }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
}

function generateReferrer(targetUrl) {
    try {
        // Always use Google as referrer - most sites accept traffic from Google
        // This simulates a user clicking a search result
        return 'https://www.google.com/';
        
    } catch (error) {
        return 'https://www.google.com/';
    }
}

function buildCurlCommand(url) {
    const referrer = generateReferrer(url);
    const escapedUrl = url.replace(/"/g, '\\"');
    const escapedReferrer = referrer.replace(/"/g, '\\"');
    
    const headers = [
        `-H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"`,
        `-H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"`,
        `-H "Accept-Language: en-US,en;q=0.9"`,
        `-H "Referer: ${escapedReferrer}"`,
        `-H "DNT: 1"`,
        `-H "Connection: keep-alive"`,
        `-H "Upgrade-Insecure-Requests: 1"`,
    ];
    
    return `curl -L -s -k --max-time 10 "${escapedUrl}" ${headers.join(' ')}`;
}

function deduplicateLinks(links) {
    const seen = new Set();
    const uniqueLinks = [];
    
    links.forEach(link => {
        if (!seen.has(link.url)) {
            seen.add(link.url);
            uniqueLinks.push(link);
        }
    });
    
    return uniqueLinks;
}

function filterUnwantedLinks(links) {
    const unwantedExtensions = ['.css', '.js', '.json', '.xml', '.woff', '.woff2', '.ttf', '.eot', '.svg', '.ico'];
    
    return links.filter(link => {
        try {
            const url = new URL(link.url);
            const pathname = url.pathname.toLowerCase();
            const hasUnwantedExtension = unwantedExtensions.some(ext => pathname.endsWith(ext));
            return !hasUnwantedExtension;
        } catch (e) {
            return true;
        }
    });
}

function extractOpenGraphData($) {
    const ogData = {};
    
    // Extract Open Graph meta tags
    $('meta[property^="og:"]').each((i, elem) => {
        const property = $(elem).attr('property');
        const content = $(elem).attr('content');
        if (property && content) {
            const key = property.replace('og:', '');
            ogData[key] = content;
        }
    });
    
    // Extract Twitter Card meta tags as fallback
    if (!ogData.title) {
        const twitterTitle = $('meta[name="twitter:title"]').attr('content');
        if (twitterTitle) ogData.title = twitterTitle;
    }
    if (!ogData.description) {
        const twitterDesc = $('meta[name="twitter:description"]').attr('content');
        if (twitterDesc) ogData.description = twitterDesc;
    }
    if (!ogData.image) {
        const twitterImage = $('meta[name="twitter:image"]').attr('content');
        if (twitterImage) ogData.image = twitterImage;
    }
    
    // Fallback to regular meta tags
    if (!ogData.title) {
        ogData.title = $('title').first().text() || $('h1').first().text();
    }
    if (!ogData.description) {
        ogData.description = $('meta[name="description"]').attr('content');
    }
    
    return ogData;
}

async function analyzeContent(req, res) {
    const urlParams = new URL(req.url, getBaseUrl(req));
    const url = urlParams.searchParams.get('url');
    const keywordsParam = urlParams.searchParams.get('keywords');
    
    if (!url || !keywordsParam) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: 'URL and keywords required' }));
        return;
    }
    
    const userKeywords = keywordsParam.toLowerCase().split(',').map(s => s.trim());
    console.log('[ANALYZE] Analyzing content:', url);
    
    try {
        // Fetch the page
        let html;
        if (puppeteer && needsBrowserAutomation(url)) {
            html = await scrapeWithPuppeteer(url);
        } else {
            html = await scrapeWithCurl(url);
        }
        
        const $ = cheerio.load(html);
        const pageText = $('body').text().toLowerCase();
        
        // Extract Open Graph data for preview
        const openGraph = extractOpenGraphData($);
        
        // Find which keywords appear in the page
        const matchedKeywords = userKeywords.filter(keyword => 
            pageText.includes(keyword)
        );
        
        const analysis = {
            matchedKeywords: matchedKeywords,
            totalKeywords: userKeywords.length,
            matchCount: matchedKeywords.length,
            preview: {
                title: openGraph.title,
                description: openGraph.description,
                image: openGraph.image,
                url: openGraph.url || url
            }
        };
        
        console.log('[ANALYZE] Matched:', matchedKeywords.length, 'of', userKeywords.length, 'keywords');
        
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(analysis));
        
    } catch (error) {
        console.error('[ANALYZE] Error:', error.message);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: error.message }));
    }
}

function categorizeLinks(links) {
    const domainGroups = {};
    
    links.forEach((link, index) => {
        try {
            const urlObj = new URL(link.url);
            const domain = urlObj.hostname;
            const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
            
            if (!domainGroups[domain]) {
                domainGroups[domain] = {};
            }
            
            for (let depth = 1; depth <= Math.min(3, pathParts.length); depth++) {
                const pattern = pathParts.slice(0, depth).join('/');
                
                if (!domainGroups[domain][pattern]) {
                    domainGroups[domain][pattern] = [];
                }
                
                domainGroups[domain][pattern].push({
                    ...link,
                    index: index,
                    pathParts: pathParts,
                    depth: depth
                });
            }
        } catch (e) {
            // Skip invalid URLs
        }
    });
    
    const categories = [];
    const usedLinks = new Set();
    
    const allPatterns = [];
    for (const domain in domainGroups) {
        for (const pattern in domainGroups[domain]) {
            const groupLinks = domainGroups[domain][pattern];
            const depth = pattern.split('/').length;
            allPatterns.push({
                domain,
                pattern,
                depth,
                links: groupLinks
            });
        }
    }
    
    allPatterns.sort((a, b) => {
        if (b.depth !== a.depth) return b.depth - a.depth;
        return b.links.length - a.links.length;
    });
    
    for (const patternGroup of allPatterns) {
        const availableLinks = patternGroup.links.filter(link => !usedLinks.has(link.index));
        
        if (availableLinks.length >= 3) {
            const allPaths = availableLinks.map(l => l.pathParts);
            const commonParts = [];
            const maxLength = Math.min(...allPaths.map(p => p.length));
            
            for (let i = 0; i < maxLength; i++) {
                const firstPart = allPaths[0][i];
                if (allPaths.every(path => path[i] === firstPart)) {
                    commonParts.push(firstPart);
                } else {
                    break;
                }
            }
            
            const subcategories = availableLinks.map(link => {
                const varyingParts = link.pathParts.slice(commonParts.length);
                return varyingParts.join('/') || 'root';
            });
            
            const uniqueSubcats = [...new Set(subcategories)];
            
            if (uniqueSubcats.length > 1 || availableLinks.length >= 5) {
                categories.push({
                    domain: patternGroup.domain,
                    pattern: commonParts.join('/') || patternGroup.domain,
                    commonPath: commonParts,
                    count: availableLinks.length,
                    links: availableLinks,
                    subcategories: uniqueSubcats.slice(0, 10)
                });
                
                availableLinks.forEach(link => usedLinks.add(link.index));
            }
        }
    }
    
    categories.sort((a, b) => b.count - a.count);
    return categories;
}

async function scrapeWebsite(req, res) {
    console.log('Starting scraper...');
    
    const urlParams = new URL(req.url, getBaseUrl(req));
    const url = urlParams.searchParams.get('url') || 'https://en.wikipedia.org/wiki/Cat';
    const thoroughMode = urlParams.searchParams.get('thorough') === 'true';
    
    console.log('Scraping URL:', url);
    if (thoroughMode) {
        console.log('[THOROUGH MODE] Will try multiple methods and use the one with most links');
    }
    
    try {
        let html;
        let method = 'unknown';
        
        if (thoroughMode) {
            // THOROUGH MODE: Try both methods and use whichever gets more links
            console.log('[THOROUGH] Trying curl first...');
            let curlHtml = '';
            let curlLinkCount = 0;
            
            try {
                curlHtml = await scrapeWithCurl(url);
                const $curl = cheerio.load(curlHtml);
                curlLinkCount = $curl('a').length;
                console.log('[THOROUGH] Curl found', curlLinkCount, 'links');
            } catch (e) {
                console.log('[THOROUGH] Curl failed:', e.message);
            }
            
            if (puppeteer) {
                console.log('[THOROUGH] Trying Puppeteer...');
                let puppeteerHtml = '';
                let puppeteerLinkCount = 0;
                
                try {
                    puppeteerHtml = await scrapeWithPuppeteer(url);
                    const $puppeteer = cheerio.load(puppeteerHtml);
                    puppeteerLinkCount = $puppeteer('a').length;
                    console.log('[THOROUGH] Puppeteer found', puppeteerLinkCount, 'links');
                } catch (e) {
                    console.log('[THOROUGH] Puppeteer failed:', e.message);
                }
                
                // Use whichever method got more links
                if (puppeteerLinkCount > curlLinkCount) {
                    html = puppeteerHtml;
                    method = 'puppeteer';
                    console.log('[THOROUGH] Using Puppeteer (', puppeteerLinkCount, 'vs', curlLinkCount, 'links)');
                } else {
                    html = curlHtml;
                    method = 'curl';
                    console.log('[THOROUGH] Using curl (', curlLinkCount, 'vs', puppeteerLinkCount, 'links)');
                }
            } else {
                html = curlHtml;
                method = 'curl';
            }
            
        } else {
            // NORMAL MODE: Use smart detection
            const needsBrowser = needsBrowserAutomation(url);
            
            if (needsBrowser && puppeteer) {
                console.log('[SKIPPING CURL] Site requires browser automation');
                
                try {
                    console.log('[METHOD 1] Trying Puppeteer...');
                    html = await scrapeWithPuppeteer(url);
                    method = 'puppeteer';
                    console.log('[SUCCESS] Got HTML with Puppeteer, length:', html.length);
                } catch (puppeteerError) {
                    console.log('[FAILED] Puppeteer failed:', puppeteerError.message);
                    
                    try {
                        console.log('[METHOD 2] Trying Puppeteer with enhanced stealth...');
                        html = await scrapeWithPuppeteerStealth(url);
                        method = 'puppeteer-stealth';
                        console.log('[SUCCESS] Got HTML with stealth Puppeteer, length:', html.length);
                    } catch (stealthError) {
                        console.log('[FAILED] Stealth Puppeteer failed:', stealthError.message);
                        throw new Error('All scraping methods failed. Site may have strong anti-bot protection.');
                    }
                }
            } else {
                try {
                    console.log('[METHOD 1] Trying curl...');
                    html = await scrapeWithCurl(url);
                    method = 'curl';
                    console.log('[SUCCESS] Got HTML with curl, length:', html.length);
                } catch (curlError) {
                    console.log('[FAILED] Curl failed:', curlError.message);
                    
                    if (puppeteer) {
                        try {
                            console.log('[METHOD 2] Trying Puppeteer...');
                            html = await scrapeWithPuppeteer(url);
                            method = 'puppeteer';
                            console.log('[SUCCESS] Got HTML with Puppeteer, length:', html.length);
                        } catch (puppeteerError) {
                            console.log('[FAILED] Puppeteer failed:', puppeteerError.message);
                            
                            try {
                                console.log('[METHOD 3] Trying Puppeteer with enhanced stealth...');
                                html = await scrapeWithPuppeteerStealth(url);
                                method = 'puppeteer-stealth';
                                console.log('[SUCCESS] Got HTML with stealth Puppeteer, length:', html.length);
                            } catch (stealthError) {
                                console.log('[FAILED] Stealth Puppeteer failed:', stealthError.message);
                                throw new Error('All scraping methods failed. Site may have strong anti-bot protection.');
                            }
                        }
                    } else {
                        throw new Error('Curl failed and Puppeteer not available');
                    }
                }
            }
        }
        
        // Validate we got actual content
        if (!html || html.length < 100) {
            throw new Error('Received empty or invalid response');
        }
        
        console.log('HTML fetched, length:', html.length, 'using method:', method);
        
        const $ = cheerio.load(html);
        
        const pageTitle = $('h1').first().text() || $('title').text() || 'Untitled';
        console.log('Page title:', pageTitle);
        
        const linkPatterns = {
            absolute: 0,
            relative: 0,
            protocolRelative: 0,
            rcClk: 0,
            viewjob: 0,
            other: 0
        };
        
        const allLinks = [];
        
        $('a').each((i, elem) => {
            const href = $(elem).attr('href');
            const text = $(elem).text().trim();
            
            if (!href) return;
            
            if (href.startsWith('http://') || href.startsWith('https://')) {
                linkPatterns.absolute++;
            } else if (href.startsWith('//')) {
                linkPatterns.protocolRelative++;
            } else if (href.startsWith('/')) {
                linkPatterns.relative++;
                if (href.includes('/rc/clk')) linkPatterns.rcClk++;
                if (href.includes('/viewjob')) linkPatterns.viewjob++;
            } else {
                linkPatterns.other++;
            }
            
            let absoluteUrl;
            
            if (href.startsWith('http://') || href.startsWith('https://')) {
                absoluteUrl = href;
            } else if (href.startsWith('//')) {
                absoluteUrl = 'https:' + href;
            } else if (href.startsWith('/')) {
                try {
                    const baseUrl = new URL(url);
                    absoluteUrl = baseUrl.protocol + '//' + baseUrl.host + href;
                } catch (e) {
                    return;
                }
            } else {
                return;
            }
            
            allLinks.push({
                url: absoluteUrl,
                text: text || 'No text'
            });
        });
        
        console.log('Link patterns found:', linkPatterns);
        console.log('Total links found (with duplicates):', allLinks.length);
        
        let externalLinks = deduplicateLinks(allLinks);
        console.log('Unique external links:', externalLinks.length);
        
        const beforeFilter = externalLinks.length;
        externalLinks = filterUnwantedLinks(externalLinks);
        const resourcesFiltered = beforeFilter - externalLinks.length;
        console.log('After filtering resources:', externalLinks.length, '(removed', resourcesFiltered, 'resource files)');
        
        const categories = categorizeLinks(externalLinks);
        console.log('Categories found:', categories.length);
        
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
            title: pageTitle,
            sourceUrl: url,
            externalLinks: externalLinks,
            categories: categories,
            stats: {
                external: externalLinks.length,
                categories: categories.length,
                duplicatesRemoved: allLinks.length - beforeFilter,
                resourcesFiltered: resourcesFiltered
            },
            method: method,
            timestamp: new Date()
        }));
        
    } catch (error) {
        console.error('Scrape error:', error.message);
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: error.message }));
    }
}