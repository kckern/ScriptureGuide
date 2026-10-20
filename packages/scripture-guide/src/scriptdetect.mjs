


import { removeOverlaps, calculateGaps, calculateNegativeSpace, mergeAdjacentMatches, buildFinalOutput, defaultTieBreaker, gapCanMerge } from './scriptlib.mjs';

const findMatchingBooks = (content,books) => {
    const matchingBooks = books.filter(i=>(new RegExp(i,"ig")).test(content));
    return matchingBooks;
}

const findMatches = (content,books,lang_extra) => {
    // Pre-process content to normalize HTML entities to Unicode dashes
    const htmlEntityMap = {
        '&ndash;': '–',
        '&mdash;': '—', 
        '&minus;': '−',
        '&#8211;': '–',
        '&#8212;': '—',
        '&#8722;': '−'
    };
    
    let normalizedContent = content;
    Object.entries(htmlEntityMap).forEach(([entity, unicode]) => {
        normalizedContent = normalizedContent.replace(new RegExp(entity, 'g'), unicode);
    });

    const tail = lang_extra.tail ? new RegExp(lang_extra.tail,"ig") : /[^0-9]+$/;
    const preBookMatch = lang_extra.book || `(First|I|1|1st|Second|II|2|2nd|Third|III|3|3rd|Fourth|IV|4|4th)*\\s*(books* of)*\\s*`;
    const matchingBooks = findMatchingBooks(normalizedContent,books);
    // Bind a book name to its chapter:verse. Structure (not a loose class) to
    // avoid ReDoS and cross-sentence false positives:
    //   <gap><number-core>
    // gap = horizontal whitespace + at most one newline (wrapped HTML) + an
    //   optional ", Sec." (D&C) + an optional "(" (Philippians (3:20)) — then a
    //   digit MUST follow, so "Genesis. 2" / "Amos 5. Section 3" don't bind.
    // core = digits joined by :.,;~ dashes, horizontal whitespace, single
    //   newlines, and the word connectors "and"/"cf" (\b-bounded). Every
    //   position matches exactly one alternative -> linear time.
    const gap = "[ \\t]*(?:\\n(?![ \\t]*\\n)[ \\t]*)?(?:,[ \\t]*sec(?:tion)?\\.?[ \\t]*)?\\(?[ \\t]*(?=[0-9])";
    const core = "(?:[0-9:.;,~—–-]|[ \\t]|\\n(?![ \\t]*\\n)|and\\b|cf\\b|\\()*[0-9]";
    const postBookMatch = lang_extra.chapter || (gap + core);
    const capitalizedOnlyAbbreviations = new Set(
        (lang_extra.capitalizedOnly || []).map(i=>String(i).toLowerCase())
    );
    const fullBookMatches = matchingBooks.map(bookMatch=>{
        const patternString =  preBookMatch + bookMatch ;
        const pattern = (new RegExp(patternString,"ig"));
        const stringMatch = pattern.test(normalizedContent) ? patternString : null;
        //console.log({pattern,content,stringMatch});
        return stringMatch;
    }).filter(x=>!!x);

    const bookSubStrings = fullBookMatches.map(bookMatch=>{
        const substrings = normalizedContent.match(new RegExp(bookMatch,"ig")).flat();
        return substrings;
    }).flat().reduce((prev,current)=>{
        if(prev.includes(current)) return prev;
        return [...prev,current]
    },[]).filter(i=>!!i).filter(substring=>{
        // A handful of abbreviations are also ordinary English words ("is" ->
        // Isaiah, "am" -> Amos, "he" -> Hebrews). Matching them case-insensitively
        // turns prose into citations: "the aspect ratio is 16:9" became
        // Isaiah 16:9. Require these to be capitalized, so "Is 16:9" still
        // resolves while the English verb does not. Only the listed short
        // abbreviations are affected -- full book names are not, so a lowercase
        // "leviticus 19" keeps matching.
        const token = substring.trim();
        if(!capitalizedOnlyAbbreviations.has(token.toLowerCase())) return true;
        return token !== token.toLowerCase();
    }).map(substring=>{
        substring = substring.trim();
        let positions = [];
        let index = normalizedContent.indexOf(substring);
        while (index !== -1) {
            positions.push(index);
            index = normalizedContent.indexOf(substring, index + 1);
        }        return [substring,positions];
    }).map(([substring,positions])=>{
        const preChars = positions.map(i=>normalizedContent.substring(i-1,i));
        positions = positions.filter((i,index)=>{
            const charRightBeforeMatch = preChars[index];
            const leadingCharIsInvalid = !/^(\s|\W|)$/.test(charRightBeforeMatch);  
            return !leadingCharIsInvalid;
        });
        if(!positions.length) return false;
        return [substring,positions];
    }).filter(i=>!!i);

    const possiblyOverlappingMatches = bookSubStrings.map(([substring,positions])=>{
        return positions.map(i=>{
            let pattern = null;
            try{
               pattern = new RegExp(substring+postBookMatch,"ig");
            }catch(e){
                return null;
            }
            const match = normalizedContent.slice(i).match(pattern)?.[0]?.replace(tail,"").trim();
            if(!match) return null;
            const len = match.length;
            const pos = i;
            const [posIn, posOut] = [pos,pos+len];
            // "Exodus 3D", "Genesis 4K": a product name, not a citation. Real
            // trailing annotations are lowercase (footnote markers "1 Ne 8.15-18n",
            // "Heb 11:1ff"), so only an uppercase letter fused to the closing digit
            // invalidates the match.
            if(/[0-9]$/.test(match) && /[A-Z]/.test(normalizedContent[posOut] || "")) return null;
            //console.log({content:content.slice(i),pattern,match,posIn,posOut});
            return [match,posIn,posOut];
        }
    )}).flat().filter(i=>!!i);
    const matchesWithReferences = possiblyOverlappingMatches.map(([string,start,end])=>{
        const overLappingItems = possiblyOverlappingMatches.filter(([s,s1,e1])=>s!==string && s1<end && e1>end);
        const hasOverlap = overLappingItems.length > 0;
        const newEnd = hasOverlap ? Math.min(...overLappingItems.map(([s,s1,e1])=>s1)) : end;
        const newString = normalizedContent.slice(start,newEnd);
        return newString.replace(tail,"").trim();
    }).filter(i=>!!i);
    const matches =  matchesWithReferences.map(string=>{
        // `string` is a literal matched span, re-found to enumerate occurrences;
        // it may contain regex metacharacters (e.g. "(" from "Philippians (3:20").
        const pattern = (new RegExp(string.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"ig"));
        const matches = normalizedContent.match(pattern)?.map(i=>i.trim().replace(tail,""));
        //console.log({string,matches,tail});
        return matches;
    }).flat()
    .reduce((prev,current)=>{
        if(prev.includes(current)) return prev;
        return [...prev,current]
    },[]).filter(i=>!!i);
    return matches;
}



function findMatchIndexes(content, matches,lookupReference, lang_extra) {
    const tail = lang_extra.tail ? new RegExp(lang_extra.tail,"ig") : /[^0-9]+$/;
    const indexes =  matches
    .sort((b, a) => b.length - a.length)
    .map(i=>{
        const length = i.length;
        let positions = [];
        let strPos = content.indexOf(i);

        while (strPos !== -1) {
            positions.push(strPos);
            strPos = content.indexOf(i, strPos + 1);
        }
        return positions.map(i=>[i,i+length+2]);
    }).flat()
    .map(a=>{

        const substring = content.substring(a[0],a[1]).trim().replace(tail,"").trim();
        if(!substring) return false;
        const verse_ids = lookupReference(substring).verse_ids;
        //console.log({substring,verse_ids});
        if(verse_ids.length > 0) return [a[0],a[0]+substring.length];

        return false;
    })
    .filter(i=>!!i)
    .sort((a, b) => a[0] - b[0])
    .map(([start, end], index, array) => {
        // Clip only when the next match starts inside this one AND is not
        // fully contained within it. A contained candidate (e.g. "Ne 8.15-18"
        // inside "1 Ne 8.15-18") must not truncate the longer validated span —
        // removeOverlaps' tie-breaker prefers the longer match instead.
        const next = array[index+1];
        if (next && next[0] < end && next[1] > end) {
            end = next[0];
            // Clipping cuts at the next match's start, which can leave trailing
            // separator/whitespace inside this span when the two citations are
            // written without a space ("...136:31;1 Cor. 10:13" -> the D&C span
            // keeps the ";"). Re-apply the tail trim so the span ends on the
            // reference itself; otherwise the joiner merge emits ";;".
            end = start + content.slice(start, end).replace(tail, "").length;
        }
        return [start,end];
    });

    if(!indexes.length) return false;

    // Use shared overlap removal with custom tie-breaker
    const preferenceResolver = (pair1, pair2, content) => defaultTieBreaker(pair1, pair2, content);
    const nonOverlappingIndeces = removeOverlaps(indexes, content, preferenceResolver)
        .filter(([start,end])=>start!==end);

    return nonOverlappingIndeces;



}





// Collect detected references as structured records with offsets into the
// original content: [{ start, end, text, ref, verse_ids }]. `text` is the
// verbatim matched span (content.slice(start,end) === text); `ref` is the
// normalized query from lookupReference. This is the position-based core that
// both processReferenceDetection (string output) and the public findReferences
// build on.
const collectReferences = (content,books,lang_extra,lookupReference) => {
    try{
        lang_extra = lang_extra || {};
        const matches = findMatches(content,books,lang_extra);
        const matchIndeces = findMatchIndexes(content,matches,lookupReference,lang_extra);
        if(!matchIndeces) return [];

        const gapsBetweenIndeces = calculateGaps(matchIndeces);
        const gapStrings = gapsBetweenIndeces.map(([start,end])=>content.substring(start,end).trim());
        const joiners = lang_extra.joiners || ["^[;, &]*(and|c\\.*f\\.*|&|cited\\s+at|see\\s+also|compare|cf|see)*\\s*$"];
        const gapThatMayBeMerged = gapsBetweenIndeces.map(([start,end],i)=>gapCanMerge(gapStrings[i], joiners));

        const mergedIndeces = mergeAdjacentMatches(matchIndeces, gapThatMayBeMerged);

        return mergedIndeces.map(([start,end])=>{
            const text = content.substring(start,end);
            const lookupResult = lookupReference(text);
            return { start, end, text, ref: lookupResult.query, verse_ids: lookupResult.verse_ids || [] };
        });
    }catch(e){
        return [];
    }
}

const processReferenceDetection = (content,books,lang_extra,lookupReference,callback) =>
{
    try{
    const found = collectReferences(content,books,lang_extra,lookupReference);
    if(!found.length) return content;

    const indices = found.map(({start,end})=>[start,end]);
    // Use shared negative space calculation
    const negativeSpace = calculateNegativeSpace(indices, content.length);

    const cutItems = found.map(({ref,verse_ids})=>callback(ref, verse_ids));
    const negativeItems = negativeSpace.map(([start,end])=>content.substring(start,end));
    const firstReferenceIsAtStart = indices[0][0] === 0;

    return buildFinalOutput(cutItems, negativeItems, firstReferenceIsAtStart);
    }catch(e){
        return content;
    }
}



export {
    collectReferences,
    processReferenceDetection,
    findMatches,
    findMatchIndexes
}