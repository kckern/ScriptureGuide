import { detectReferences, setLanguage } from 'scripture-guide';
import { decode as decodeHTML } from 'html-entities';

setLanguage('en');
var startTime = new Date().getTime();
var DEBUG_MODE = true;
function debugLog(message, data) {
    if (DEBUG_MODE || window.sgDebug) {
        console.log('[Scripture Guide Debug]', message, data || '');
    }
}
function cleanHTMLForScriptureDetection(html) {
    try {
        var cleaned = decodeHTML(html);
        cleaned = cleaned
            .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/&#x[0-9A-Fa-f]+;/g, function(match) {
                var code = parseInt(match.slice(3, -1), 16);
                if (code >= 32 && code <= 126) {
                    return String.fromCharCode(code);
                }
                return '';
            })
            .replace(/&#[0-9]+;/g, function(match) {
                var code = parseInt(match.slice(2, -1), 10);
                if (code >= 32 && code <= 126) {
                    return String.fromCharCode(code);
                }
                return '';
            })
            .replace(/\s+/g, ' ')
            .trim();
        return cleaned;
    } catch (e) {
        console.log('Scripture Guide: Error cleaning HTML:', e);
        return html;
    }
}
function loadKreonFont() {
    try {
        var link = document.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('type', 'text/css');
        link.setAttribute('href', chrome.runtime.getURL('fonts/kreon-local.css'));
        link.onerror = function() {
            console.log('Scripture Guide: Could not load local Kreon font');
            applyFallbackFont();
        };
        link.onload = function() {
            console.log('Scripture Guide: Local Kreon font loaded successfully');
            setTimeout(enforceFontStyles, 500);
        };
        document.getElementsByTagName('head')[0].appendChild(link);
        setTimeout(function() {
            if (document.fonts && document.fonts.check) {
                if (!document.fonts.check('16px Kreon')) {
                    console.log('Scripture Guide: Kreon font not available, using fallback');
                    applyFallbackFont();
                } else {
                    enforceFontStyles();
                }
            } else {
                enforceFontStyles();
            }
        }, 1000);
    } catch (e) {
        console.log('Scripture Guide: Error loading local Kreon font:', e);
        applyFallbackFont();
    }
}
function enforceFontStyles() {
    var enforceStyle = document.createElement('style');
    enforceStyle.setAttribute('id', 'sg-font-enforcer');
    enforceStyle.textContent = "a.sg_autolink, a.sg_autolink:link, a.sg_autolink:visited, a.sg_autolink:hover, a.sg_autolink:active { font-family: 'Kreon', Arial, 'Times New Roman', serif !important; font-weight: 400 !important; font-style: normal !important; font-variant: normal !important; font-stretch: normal !important; line-height: normal !important; }";
    document.head.appendChild(enforceStyle);
    var existingLinks = document.querySelectorAll('.sg_autolink');
    for (var i = 0; i < existingLinks.length; i++) {
        existingLinks[i].style.setProperty('font-family', "'Kreon', Arial, 'Times New Roman', serif", 'important');
        existingLinks[i].style.setProperty('font-weight', '400', 'important');
        existingLinks[i].style.setProperty('font-style', 'normal', 'important');
    }
}
function applyFallbackFont() {
    var fallbackStyle = document.createElement('style');
    fallbackStyle.setAttribute('id', 'sg-fallback-font');
    fallbackStyle.textContent = "a.sg_autolink, a.sg_autolink:link, a.sg_autolink:visited, a.sg_autolink:hover, a.sg_autolink:active { font-family: Arial, 'Times New Roman', 'DejaVu Serif', serif !important; font-weight: 400 !important; font-style: normal !important; }";
    document.head.appendChild(fallbackStyle);
}
loadKreonFont();
var style = document.createElement('style');
style.setAttribute('id', 'sg-font-styles');
style.textContent = "a.sg_autolink, a.sg_autolink:link, a.sg_autolink:visited, a.sg_autolink:hover, a.sg_autolink:active{ font-family: 'Kreon', Arial, 'Times New Roman', serif!important; font-weight: 400!important; font-style: normal!important; color: black!important; text-decoration: none!important; border-radius: 4px!important; border: 1px dotted #552B1B!important; padding: 0 .5em 0 .5em!important; background-color: #f2e5d9!important; display: inline!important; box-sizing: border-box!important; }a.sg_autolink:hover{ border-bottom: 1px solid #552B1B!important; color: #552B1B!important; font-weight: 400!important; background-color: #f2e5d9!important; }";
document.getElementsByTagName('head')[0].appendChild(style);
window.sgshow = function(el) {
    window.PopupCenter(el.href, "Scripture Guide", 1000, 750);
    return false;
};
window.PopupCenter = function(url, title, width, height) {
    var left = window.screenLeft !== undefined ? window.screenLeft : screen.left;
    var top = window.screenTop !== undefined ? window.screenTop : screen.top;
    var screenWidth = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width;
    var screenHeight = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height;
    var x = (screenWidth / 2) - (width / 2) + left;
    var y = (screenHeight / 2) - (height / 2) + top;
    var popup = window.open(url, title, "scrollbars=yes, width=" + width + ", height=" + height + ", top=" + y + ", left=" + x);
    if (window.focus && popup) {
        popup.focus();
    }
    return false;
};
var excludes = [
    "lds.org/scriptures",
    "biblehub",
    "biblegateway",
    "wikisource",
    "ebible",
    "goto-scrip",
    "scriptures.lds.org",
    "kckern.info",
    "publications/bible",
    "lecturesonfaith.com",
    "isaiahexplained.com",
    "scripture.guide"
];
var a_elements = document.getElementsByTagName('a');
var elements = document.querySelectorAll('div,span,blockquote,p,li,td,a,strong,em,label,b,strong,i,dd,cite,h1,h2,h3,h4,h5,h6');
var runme = true;
for (var i = 0; i < a_elements.length; i++) {
    if (a_elements[i].getAttribute("href") == null) continue;
    if (a_elements[i].getAttribute("href").match(excludes.join("|"))) {
        var content = document.createTextNode(a_elements[i].textContent);
        if (a_elements[i].getAttribute("href").match(/[0-9]/)==null) continue;
        if (content.textContent.match(/[0-9]/)==null) continue;
        a_elements[i].parentNode.insertBefore(content, a_elements[i]);
        a_elements[i].parentNode.removeChild(a_elements[i]);
        i--;
    }
}
if (runme) {
    var batchSize = 3; // Reduced batch size for better performance
    var currentIndex = 0;
    var processingTimeout = 10; // Reduced timeout for faster processing
    var elementsToProcess = [];
    
    function getTextNodes() {
        const treeWalker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];

        let currentNode = treeWalker.nextNode();
        while (currentNode) {
            // Trim the text content
            const trimmedText = currentNode.nodeValue.trim();
            // Filter out empty or whitespace-only nodes
            if (trimmedText !== '') {
                textNodes.push(currentNode);
            }
            currentNode = treeWalker.nextNode();
        }

        return textNodes;
    }
    
    function findTextNodesToProcess() {
        var textNodes = getTextNodes();
        var foundTextNodes = [];
        
        debugLog('Initial scan found text nodes', { totalCount: textNodes.length });
        
        for (var i = 0; i < textNodes.length; i++) {
            var textNode = textNodes[i];
            var parentEl = textNode.parentElement;
            
            if (!parentEl) continue;
            
            // Check if this text node contains Romans reference for debugging
            if (textNode.nodeValue && textNode.nodeValue.indexOf('Romans') > -1) {
                debugLog('Found text node containing "Romans"', {
                    nodeValue: textNode.nodeValue,
                    parentTagName: parentEl.tagName,
                    parentClassName: parentEl.className,
                    hasFlag: parentEl.getAttribute("sg-flag"),
                    hasLinks: !!parentEl.querySelector('.sg_autolink')
                });
            }
            
            // Skip if parent already processed and has links
            if (parentEl.getAttribute("sg-flag") && parentEl.querySelector('.sg_autolink')) {
                continue;
            }
            
            // Skip problematic parent elements
            var tagName = parentEl.tagName.toLowerCase();
            if (tagName === 'script' || tagName === 'style' || tagName === 'iframe' || 
                parentEl.hasAttribute('contenteditable')) {
                continue;
            }
            
            // Skip if text is too short
            if (textNode.nodeValue.trim().length < 5) {
                continue;
            }
            
            foundTextNodes.push(textNode);
        }
        
        debugLog('Text nodes queued for processing', { count: foundTextNodes.length });
        return foundTextNodes;
    }
    
    var textNodesToProcess = [];
    
    textNodesToProcess = findTextNodesToProcess();
    function processBatch() {
        var processed = 0;
        var startTime = Date.now();
        while (currentIndex < textNodesToProcess.length && processed < batchSize) {
            var textNode = textNodesToProcess[currentIndex];
            currentIndex++;
            
            var parentEl = textNode.parentElement;
            if (!parentEl || !document.contains(textNode)) {
                continue;
            }
            
            // Skip if parent already processed and has links
            if (parentEl.getAttribute("sg-flag") && parentEl.querySelector('.sg_autolink')) {
                continue;
            }
            
            try {
                var originalText = textNode.nodeValue;
                var cleanedText = cleanHTMLForScriptureDetection(originalText);
                
                debugLog('Processing text node', {
                    originalText: originalText.substring(0, 100) + (originalText.length > 100 ? '...' : ''),
                    cleanedText: cleanedText.substring(0, 100) + (cleanedText.length > 100 ? '...' : ''),
                    parentTagName: parentEl.tagName,
                    parentClassName: parentEl.className
                });
                
                var processedHTML = detectReferences(cleanedText, function(reference) {
                    debugLog('Scripture reference detected in text node', { reference: reference });
                    var link = reference.trim().toLowerCase().replace(/[\s:]+/g, '.').replace(/\.+/g, '.').replace(/;\./g, ';').replace(/,\./g, ',');
                    return '<a class="sg_autolink" sg-flag="true" href="https://scripture.guide/' + link + '" target="_blank">' + reference + '</a>';
                });
                
                if (processedHTML !== cleanedText) {
                    debugLog('Scripture references detected - processing parent element', {
                        originalText: cleanedText.substring(0, 100) + (cleanedText.length > 100 ? '...' : ''),
                        processedHTML: processedHTML.substring(0, 100) + (processedHTML.length > 100 ? '...' : '')
                    });
                    
                    // Process the entire parent element to maintain structure
                    var parentHTML = parentEl.innerHTML;
                    var newHTML = parentHTML.replace(originalText, processedHTML);
                    
                    if (newHTML !== parentHTML) {
                        parentEl.innerHTML = newHTML;
                        parentEl.setAttribute("sg-flag", "true");
                        debugLog('Parent element updated with scripture links');
                    } else {
                        // Fallback: try processing entire parent content
                        var fullProcessed = detectReferences(parentHTML, function(reference) {
                            var link = reference.trim().toLowerCase().replace(/[\s:]+/g, '.').replace(/\.+/g, '.').replace(/;\./g, ';').replace(/,\./g, ',');
                            return '<a class="sg_autolink" sg-flag="true" href="https://scripture.guide/' + link + '" target="_blank">' + reference + '</a>';
                        });
                        
                        if (fullProcessed !== parentHTML) {
                            parentEl.innerHTML = fullProcessed;
                            parentEl.setAttribute("sg-flag", "true");
                            debugLog('Parent element fully processed with scripture links');
                        } else {
                            parentEl.setAttribute("sg-flag", "true");
                        }
                    }
                } else {
                    debugLog('No scripture references found in text node');
                    parentEl.setAttribute("sg-flag", "true");
                }
            } catch (e) {
                debugLog('Error processing text node', e);
                parentEl.setAttribute("sg-flag", "true");
            }
            
            processed++;
            
            // Break early if we're taking too long to prevent violations
            if (Date.now() - startTime > 20) break;
        }
        if (currentIndex < textNodesToProcess.length) {
            setTimeout(processBatch, processingTimeout);
        } else {
            addEventListenersToLinks();
            setupSimpleMutationObserver();
            
            // Add periodic check for missed elements
            setInterval(function() {
                var newTextNodes = getTextNodes();
                var unprocessedTextNodes = [];
                
                for (var i = 0; i < newTextNodes.length && i < 15; i++) {
                    var textNode = newTextNodes[i];
                    var parentEl = textNode.parentElement;
                    if (parentEl && !parentEl.getAttribute("sg-flag") && textNode.nodeValue.trim().length > 10) {
                        unprocessedTextNodes.push(textNode);
                    }
                }
                
                if (unprocessedTextNodes.length > 0) {
                    debugLog('Periodic check found unprocessed text nodes', { count: unprocessedTextNodes.length });
                    processNewTextNodes(unprocessedTextNodes);
                }
            }, 2000); // Check every 2 seconds for missed elements
        }
    }
    var addEventListenersToLinks = function() {
        var allScriptureLinks = document.getElementsByClassName("sg_autolink");
        for (var i = 0; i < allScriptureLinks.length; i++) {
            if (!allScriptureLinks[i].hasAttribute('data-sg-listener')) {
                allScriptureLinks[i].addEventListener('click', function(e) {
                    e.preventDefault();
                    window.sgshow(this);
                    return false;
                });
                allScriptureLinks[i].setAttribute('data-sg-listener', 'true');
                allScriptureLinks[i].style.setProperty('font-family', "'Kreon', Arial, 'Times New Roman', serif", 'important');
                allScriptureLinks[i].style.setProperty('font-weight', '400', 'important');
                allScriptureLinks[i].style.setProperty('font-style', 'normal', 'important');
            }
        }
    };
    function setupSimpleMutationObserver() {
        var mutationTimeout;
        var pendingElements = [];
        
        function addToPending(element) {
            // Avoid duplicates
            for (var i = 0; i < pendingElements.length; i++) {
                if (pendingElements[i] === element) {
                    return;
                }
            }
            pendingElements.push(element);
        }
        
        /* 
         * Enhanced Mutation Observer for Dynamic Content Detection
         * - Tracks specific newly added elements and text nodes
         * - Uses text node analysis for better scripture detection
         * - Improved timeout handling for async content loading
         */
        var observer = new MutationObserver(function(mutations) {
            var hasNewContent = false;
            var newTextNodes = [];
            
            for (var i = 0; i < mutations.length; i++) {
                var mutation = mutations[i];
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (var j = 0; j < mutation.addedNodes.length; j++) {
                        var node = mutation.addedNodes[j];
                        
                        // Handle element nodes
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Get all text nodes within the added element
                            var walker = document.createTreeWalker(
                                node,
                                NodeFilter.SHOW_TEXT,
                                null,
                                false
                            );
                            
                            var textNode = walker.nextNode();
                            while (textNode) {
                                if (textNode.nodeValue && textNode.nodeValue.trim().length > 10) {
                                    var parentEl = textNode.parentElement;
                                    if (parentEl && !parentEl.getAttribute("sg-flag")) {
                                        newTextNodes.push(textNode);
                                        hasNewContent = true;
                                    }
                                }
                                textNode = walker.nextNode();
                            }
                        }
                        // Handle direct text node additions
                        else if (node.nodeType === Node.TEXT_NODE && node.nodeValue && node.nodeValue.trim().length > 10) {
                            var parentEl = node.parentElement;
                            if (parentEl && !parentEl.getAttribute("sg-flag")) {
                                newTextNodes.push(node);
                                hasNewContent = true;
                            }
                        }
                    }
                }
            }
            
            if (hasNewContent) {
                clearTimeout(mutationTimeout);
                mutationTimeout = setTimeout(function() {
                    debugLog('Mutation observer processing text nodes', { count: newTextNodes.length });
                    processNewTextNodes(newTextNodes);
                }, 200);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true // Also observe text changes
        });
    }
    function processNewTextNodes(textNodes) {
        if (!textNodes || textNodes.length === 0) return;
        
        debugLog('Processing new text nodes', { count: textNodes.length });
        
        for (var i = 0; i < textNodes.length; i++) {
            var textNode = textNodes[i];
            var parentEl = textNode.parentElement;
            
            if (!parentEl || !document.contains(textNode)) {
                continue;
            }
            
            // Skip if parent already processed and has links
            if (parentEl.getAttribute("sg-flag") && parentEl.querySelector('.sg_autolink')) {
                continue;
            }
            
            try {
                var originalText = textNode.nodeValue;
                var cleanedText = cleanHTMLForScriptureDetection(originalText);
                
                debugLog('Processing new text node', {
                    originalText: originalText.substring(0, 100) + (originalText.length > 100 ? '...' : ''),
                    cleanedText: cleanedText.substring(0, 100) + (cleanedText.length > 100 ? '...' : ''),
                    parentTagName: parentEl.tagName,
                    parentClassName: parentEl.className
                });
                
                var processedHTML = detectReferences(cleanedText, function(reference) {
                    debugLog('Scripture reference detected in new text node', { reference: reference });
                    var link = reference.trim().toLowerCase().replace(/[\s:]+/g, '.').replace(/\.+/g, '.').replace(/;\./g, ';').replace(/,\./g, ',');
                    return '<a class="sg_autolink" sg-flag="true" href="https://scripture.guide/' + link + '" target="_blank">' + reference + '</a>';
                });
                
                if (processedHTML !== cleanedText) {
                    debugLog('Scripture references found - processing parent element', {
                        originalText: cleanedText.substring(0, 100) + (cleanedText.length > 100 ? '...' : ''),
                        processedHTML: processedHTML.substring(0, 100) + (processedHTML.length > 100 ? '...' : '')
                    });
                    
                    // Process the entire parent element to maintain structure
                    var parentHTML = parentEl.innerHTML;
                    var newHTML = parentHTML.replace(originalText, processedHTML);
                    
                    if (newHTML !== parentHTML) {
                        parentEl.innerHTML = newHTML;
                        parentEl.setAttribute("sg-flag", "true");
                        debugLog('New parent element updated with scripture links');
                    } else {
                        // Fallback: try processing entire parent content
                        var fullProcessed = detectReferences(parentHTML, function(reference) {
                            var link = reference.trim().toLowerCase().replace(/[\s:]+/g, '.').replace(/\.+/g, '.').replace(/;\./g, ';').replace(/,\./g, ',');
                            return '<a class="sg_autolink" sg-flag="true" href="https://scripture.guide/' + link + '" target="_blank">' + reference + '</a>';
                        });
                        
                        if (fullProcessed !== parentHTML) {
                            parentEl.innerHTML = fullProcessed;
                            parentEl.setAttribute("sg-flag", "true");
                            debugLog('New parent element fully processed with scripture links');
                        } else {
                            parentEl.setAttribute("sg-flag", "true");
                        }
                    }
                } else {
                    debugLog('No scripture references found in new text node');
                    parentEl.setAttribute("sg-flag", "true");
                }
            } catch (e) {
                debugLog('Error processing new text node', e);
                parentEl.setAttribute("sg-flag", "true");
            }
        }
    }
        
        // Add event listeners to any new links
        addEventListenersToLinks();
    }
    if (textNodesToProcess.length > 0) {
        setTimeout(processBatch, 500);
    } else {
        addEventListenersToLinks();
    }
}
