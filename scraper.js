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

const port = 3000;

const server = http.createServer(function(req, res) {
    if (req.url.startsWith('/api/scrape')) {
        scrapeWikipedia(req, res);
    } else if (req.url.startsWith('/api/preview')) {
        previewPage(req, res);
    } else if (req.url.startsWith('/api/follow-redirect')) {
        followRedirect(req, res);
    } else if (req.url.startsWith('/api/analyze-job')) {
        analyzeJob(req, res);
    } else if (req.url === '/api/test') {
        // Simple test endpoint for n8n
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ 
            status: 'ok', 
            message: 'Scraper API is running!',
            endpoints: {
                scrape: '/api/scrape?url=YOUR_URL',
                analyze: '/api/analyze-job?url=YOUR_URL&skills=python,javascript',
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

server.listen(port, function(error) {
    if (error) {
        console.log('Something went wrong', error);
    } else {
        console.log('Server is listening on port ' + port);
        console.log('Open http://localhost:' + port + ' in your browser');
        if (puppeteer) {
            console.log('Puppeteer available - will use browser automation for protected sites');
        } else {
            console.log('Puppeteer not available - install with: npm install puppeteer');
        }
    }
});

// Detect if site needs browser automation
function needsBrowserAutomation(url) {
    const heavyProtectionSites = [
        'indeed.com',
        'linkedin.com',
        'glassdoor.com',
        'amazon.com',
        'facebook.com',
        'instagram.com',
        'twitter.com',
        'nike.com',
        'adidas.com',
        'shopify.com',
        'walmart.com',
        'target.com',
        'bestbuy.com',
        'ebay.com',
        'airbnb.com',
        'booking.com',
        'expedia.com',
        'lensa.com',
        'ziprecruiter.com',
        'monster.com',
    ];
    
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.toLowerCase();
        return heavyProtectionSites.some(site => domain.includes(site));
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
            // Remove webdriver flag
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
            
            // Mock chrome object
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {}
            };
            
            // Mock plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
            // Mock languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
            
            // Mock permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // Override toString to hide proxy
            window.navigator.__proto__.toString = () => '[object Navigator]';
        });
        
        // Set realistic viewport
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Set user agent (latest Chrome)
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        // Set extra HTTP headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.google.com/',
            'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
        });
        
        // Navigate to page
        console.log('Loading page...');
        await page.goto(url, { 
            waitUntil: 'networkidle0',
            timeout: 60000  // Increased timeout for Cloudflare challenges
        });
        
        // Wait for potential Cloudflare challenge
        console.log('Waiting for content to load...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check if we hit a challenge page
        const pageTitle = await page.title();
        const bodyText = await page.evaluate(() => document.body.innerText);
        
        if (bodyText.includes('Just a moment') || 
            bodyText.includes('Checking your browser') ||
            bodyText.includes('Cloudflare') ||
            pageTitle.includes('Just a moment')) {
            console.log('Cloudflare challenge detected, waiting longer...');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
        // Scroll down to trigger lazy loading
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
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Get the HTML
        const html = await page.content();
        
        console.log('Page loaded successfully, HTML length:', html.length);
        
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
    
    const referrer = generateReferrer(url);
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
        const url = new URL(targetUrl);
        const domain = url.hostname;
        const protocol = url.protocol;
        
        const referrerStrategies = {
            'indeed.com': 'https://www.google.com/search?q=jobs',
            'linkedin.com': 'https://www.google.com/',
            'amazon.com': `${protocol}//${domain}/`,
            'ebay.com': 'https://www.google.com/',
            'glassdoor.com': 'https://www.google.com/',
            'stackoverflow.com': 'https://www.google.com/',
            'reddit.com': `${protocol}//${domain}/`,
            'github.com': 'https://www.google.com/',
        };
        
        for (const [site, referrer] of Object.entries(referrerStrategies)) {
            if (domain.includes(site)) {
                return referrer;
            }
        }
        
        return `${protocol}//${domain}/`;
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

async function followRedirect(req, res) {
    const urlParams = new URL(req.url, `http://localhost:${port}`);
    const url = urlParams.searchParams.get('url');
    
    if (!url) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: 'No URL provided' }));
        return;
    }
    
    console.log('[FOLLOW] Following redirect for:', url);
    
    try {
        // Use curl with -L flag to follow redirects and -w to get final URL
        const escapedUrl = url.replace(/"/g, '\\"');
        const curlCmd = `curl -Ls -o /dev/null -w "%{url_effective}" --max-time 10 "${escapedUrl}"`;
        
        exec(curlCmd, { timeout: 10000 }, (error, stdout, stderr) => {
            if (error) {
                console.error('[FOLLOW] Error:', error.message);
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({ error: error.message }));
                return;
            }
            
            const finalUrl = stdout.trim();
            console.log('[FOLLOW] Final URL:', finalUrl);
            
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                originalUrl: url,
                finalUrl: finalUrl,
                redirected: url !== finalUrl
            }));
        });
        
    } catch (error) {
        console.error('[FOLLOW] Error:', error.message);
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: error.message }));
    }
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

async function analyzeJob(req, res) {
    const urlParams = new URL(req.url, `http://localhost:${port}`);
    const url = urlParams.searchParams.get('url');
    const skillsParam = urlParams.searchParams.get('skills');
    
    if (!url || !skillsParam) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: 'URL and skills required' }));
        return;
    }
    
    const userSkills = skillsParam.toLowerCase().split(',').map(s => s.trim());
    console.log('[ANALYZE] Analyzing job:', url);
    
    try {
        // Fetch the job page
        let html;
        if (puppeteer && needsBrowserAutomation(url)) {
            html = await scrapeWithPuppeteer(url);
        } else {
            html = await scrapeWithCurl(url);
        }
        
        const $ = cheerio.load(html);
        const pageText = $('body').text().toLowerCase();
        
        // Extract Open Graph data for link preview
        const openGraph = extractOpenGraphData($);
        
        // Common tech skills to look for
        const techSkills = [
            'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'ruby', 'go', 'rust', 'swift', 'kotlin',
            'react', 'angular', 'vue', 'node', 'express', 'django', 'flask', 'spring', 'rails',
            'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform',
            'sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch',
            'git', 'ci/cd', 'jenkins', 'github', 'gitlab',
            'machine learning', 'deep learning', 'ai', 'data science', 'nlp',
            'html', 'css', 'sass', 'tailwind',
            'api', 'rest', 'graphql', 'microservices',
            'agile', 'scrum', 'jira'
        ];
        
        // Find required skills mentioned in the page
        const requiredSkills = [];
        techSkills.forEach(skill => {
            if (pageText.includes(skill)) {
                requiredSkills.push(skill);
            }
        });
        
        // Find matched skills
        const matchedSkills = userSkills.filter(skill => 
            pageText.includes(skill) || requiredSkills.some(req => req.includes(skill))
        );
        
        // Extract experience requirements
        let experience = null;
        const expPatterns = [
            /(\d+)\+?\s*years?\s*(of)?\s*experience/i,
            /experience:\s*(\d+)\+?\s*years?/i,
            /minimum\s*(\d+)\s*years/i
        ];
        
        for (const pattern of expPatterns) {
            const match = $('body').text().match(pattern);
            if (match) {
                experience = match[0];
                break;
            }
        }
        
        // Extract education requirements
        let education = null;
        const eduKeywords = ['bachelor', 'master', 'phd', 'degree', 'bs', 'ms', 'ba', 'ma'];
        const sentences = $('body').text().split(/[.!?]/);
        
        for (const sentence of sentences) {
            const lower = sentence.toLowerCase();
            if (eduKeywords.some(keyword => lower.includes(keyword)) && 
                (lower.includes('require') || lower.includes('prefer') || lower.includes('education'))) {
                education = sentence.trim();
                break;
            }
        }
        
        // Calculate match score
        const matchScore = requiredSkills.length > 0 
            ? Math.round((matchedSkills.length / requiredSkills.length) * 100)
            : 50;
        
        const analysis = {
            requiredSkills: requiredSkills.slice(0, 15), // Top 15 skills
            matchedSkills: matchedSkills,
            matchScore: matchScore,
            experience: experience,
            education: education ? education.substring(0, 200) : null,
            preview: {
                title: openGraph.title,
                description: openGraph.description,
                image: openGraph.image,
                url: openGraph.url || url
            }
        };
        
        console.log('[ANALYZE] Match score:', matchScore + '%');
        
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(analysis));
        
    } catch (error) {
        console.error('[ANALYZE] Error:', error.message);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: error.message }));
    }
}

function categorizeLinks(links) {
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

async function previewPage(req, res) {
    const urlParams = new URL(req.url, `http://localhost:${port}`);
    const url = urlParams.searchParams.get('url');
    
    if (!url) {
        res.writeHead(400, {'Content-Type': 'text/html'});
        res.end('<h1>Error: No URL provided</h1>');
        return;
    }
    
    console.log('[PREVIEW] Starting preview for:', url);
    
    // Set a timeout for the entire response
    const timeoutId = setTimeout(() => {
        console.error('[PREVIEW] Request timed out after 20 seconds');
        if (!res.headersSent) {
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(`
                <!DOCTYPE html>
                <html>
                <head><meta charset="UTF-8"></head>
                <body style="font-family: Arial; padding: 40px; text-align: center;">
                    <h1 style="color: #f44336;">Preview Timeout</h1>
                    <p>The preview took too long to load.</p>
                    <p><a href="${url}" target="_blank">Open original page →</a></p>
                </body>
                </html>
            `);
        }
    }, 20000);
    
    try {
        let html;
        
        // Use Puppeteer for complex sites that need JavaScript
        if (puppeteer && needsBrowserAutomation(url)) {
            console.log('[PREVIEW] Using Puppeteer for JavaScript-heavy site');
            html = await scrapeWithPuppeteer(url);
        } else {
            console.log('[PREVIEW] Using curl for simple site');
            html = await scrapeWithCurl(url);
        }
        
        clearTimeout(timeoutId);
        
        console.log('[PREVIEW] HTML fetched, length:', html.length);
        
        if (!res.headersSent) {
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(html);
        }
        
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('[PREVIEW] Error:', error.message);
        
        if (!res.headersSent) {
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            padding: 40px; 
                            text-align: center;
                            background-color: #f9f9f9;
                        }
                        h1 { color: #f44336; }
                        .error-box {
                            background-color: white;
                            border: 2px solid #f44336;
                            border-radius: 8px;
                            padding: 30px;
                            max-width: 600px;
                            margin: 0 auto;
                        }
                        a {
                            color: #2196F3;
                            text-decoration: none;
                            font-weight: bold;
                        }
                        .error-details {
                            background-color: #f5f5f5;
                            padding: 10px;
                            border-radius: 4px;
                            margin: 20px 0;
                            font-family: monospace;
                            font-size: 12px;
                            text-align: left;
                        }
                    </style>
                </head>
                <body>
                    <div class="error-box">
                        <h1>Preview Error</h1>
                        <p>Could not load preview for this page.</p>
                        <div class="error-details">${error.message}</div>
                        <p><a href="${url}" target="_blank">Open original page in new tab →</a></p>
                    </div>
                </body>
                </html>
            `);
        }
    }
}

async function scrapeWikipedia(req, res) {
    console.log('Starting scraper...');
    
    const urlParams = new URL(req.url, `http://localhost:${port}`);
    const url = urlParams.searchParams.get('url') || 'https://en.wikipedia.org/wiki/Cat';
    
    console.log('Scraping URL:', url);
    
    try {
        let html;
        
        // Decide which method to use
        if (puppeteer && needsBrowserAutomation(url)) {
            html = await scrapeWithPuppeteer(url);
        } else {
            console.log('Using curl (fast method)');
            html = await scrapeWithCurl(url);
        }
        
        console.log('HTML fetched, length:', html.length);
        
        const $ = cheerio.load(html);
        
        const pageTitle = $('h1').first().text() || $('title').text() || 'Untitled';
        console.log('Page title:', pageTitle);
        
        // DEBUG: Log different link patterns found
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
            
            // Track patterns
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
            
            // Handle absolute URLs
            if (href.startsWith('http://') || href.startsWith('https://')) {
                absoluteUrl = href;
            }
            // Handle protocol-relative URLs
            else if (href.startsWith('//')) {
                absoluteUrl = 'https:' + href;
            }
            // Handle relative URLs - convert to absolute
            else if (href.startsWith('/')) {
                try {
                    const baseUrl = new URL(url);
                    absoluteUrl = baseUrl.protocol + '//' + baseUrl.host + href;
                } catch (e) {
                    return;
                }
            }
            // Skip anchor links and other relative paths
            else {
                return;
            }
            
            // Add the link
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
            usedPuppeteer: puppeteer && needsBrowserAutomation(url),
            timestamp: new Date()
        }));
        
    } catch (error) {
        console.error('Scrape error:', error.message);
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: error.message }));
    }
}