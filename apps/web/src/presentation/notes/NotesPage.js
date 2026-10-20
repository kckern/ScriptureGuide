// notes.scripture.guide page, ported from PHP notes.php.
//
// The request path is a word id, `<verse_id>-<nnnn>`. The page lists the commentary notes
// (scripture_annotations) attached to that word, in annotation id order, in a jQuery UI accordion.
// The markup, including the PHP template's whitespace, matches the live page.

// <head> of notes.php, verbatim.
export const HEAD = "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n\t<title>Scriptue Guide Notes</title>\n  <script src=\"https://code.jquery.com/jquery-1.12.4.js\"></script>\n  <script src=\"https://code.jquery.com/ui/1.12.1/jquery-ui.js\"></script>\n  <script>\n  $( function() {\n    $( \"#accordion\" ).accordion({heightStyle: \"content\" });\n  } );\n  </script>\n\t<link rel=\"stylesheet\"  href=\"/css/style.css\"/>\n\t\t<style>\n\t\t.chrome .note\n\t\t{\n\t\t\tfont-weight:bold;\t\n\t\t}\n\t\t.note\n\t\t{\n\t\t\tfont-size:.7em;\n\t\t\tline-height:1.2em;\n\t\t\tpadding:1em;\n\t\t\tmax-height:450px;\n\t\t\toverflow:auto;;\n\t\t\tpadding-top:1.5em;\n\t\t}\n\t\tp\n\t\t{\n\t\t\t\n\t\t\tmargin:0;\n\t\t\tmargin-bottom:0.5em;\n\t\t}\n\t\th5\n\t\t{\n\t\t\tborder:1px dotted black;\n\t\t\tmargin:0;\n\t\t\tmargin-top:0.5em;\n\t\t\tmargin-bottom:0em;\n\t\t\tpadding-left:15px;\n\t\t\tpadding-right:15px;\n\t\t\tbackground-color:#351f14;\n\t\t\tcolor:white;\n\t\t\tcursor:pointer;\n\t\t}\n\t\t\n\t\th5 span.short\n\t\t{\n\t\t\tfloat:right;\n\t\t\tfont-style:italic;\n\t\t\tfont-size:.7em;\n\t\t\tfont-weight:400!important;\n\t\t}\n\t\t\n\t\tdiv.src\n\t\t{\n\t\t\tfloat:right;\n\t\t\tmargin-left:2em;\n\t\t\ttext-align:center;\n\t\t\tmax-width:100px;\n\t\t\tmin-height:150px;\n\t\t\tmargin-left:1em;\n\t\t}\n\t\tdiv.src img\n\t\t{\n\t\t\twidth:100px;\n\t\t\tmin-height:150px;\n\t\t\tborder:1px solid #444;\n\t\t\tborder-radius:10px;\n\t\t\tmargin-bottom:.3em;\n\t\t}\n\t\tdiv.src div\n\t\t{\n\t\t\tfont-weight:bold;\n\t\t\tfont-style:italic;\n\t\t\tline-height:1em;\n\t\t\tfont-size:.8em;\n\t\t}\n\t\t\n\t\th6\n\t\t{\n\t\t\tmargin:0;\n\t\t\tfont-size:1.3em;\n\t\t\tmargin-bottom:1em;\n\t\t}\n\t\tbody\n\t\t{\n\t\t\tmargin-bottom:8px;\n\t\t}\n\t\th3\n\t\t{\n\t\t\tfont-size:2em;\n\t\t\ttext-align:center;\n\t\t\tmargin:0;\n\t\t}\n\t</style>\n</head>\n";

// PHP scriptutil::getAnnotations: index rows → { [verse_id]: { word: { [word_id]: [annotation_id] } } }.
// Word ids are `<first verse_id>-<word_seq + j, zero-padded to 4>`, repeated for each verse the
// annotation spans.
export function wordAnnotations(indexRows) {
  const annotations = {};
  for (const item of indexRows) {
    const verseCount = Number(item.verse_count) || 0;
    for (let i = 0; i < verseCount; i++) {
      if (item.type !== 'word') continue;
      const wordCount = Number(item.word_count) || 0;
      for (let j = 0; j < wordCount; j++) {
        const wordId = `${item.verse_id}-${String((parseInt(item.word_seq, 10) || 0) + j).padStart(4, '0')}`;
        const verse = (annotations[Number(item.verse_id) + i] ??= {});
        ((verse.word ??= {})[wordId] ??= []).push(item.annotation_id);
      }
    }
  }
  return annotations;
}

// The verse id of a word id (PHP: preg_replace("/-\d+$/", "", $word_id)).
export const verseIdOf = wordId => String(wordId ?? '').replace(/-\d+$/, '');

function noteHtml(note, words = '') {
  return `  <h5>${note.source_title ?? ''}</h5>
  <div class="note">
  \t<div class='src'>
  \t\t<img src='http://bookofmormon.online/source/${note.source_slug ?? ''}'>
  \t\t<div>${note.source_name ?? ''}</div>
  \t\t  \t</div>
   <h6>“${words}”</h6>
   ${note.html ?? ''}  </div>
 `;
}

// Full page. Values are inserted unescaped, as the PHP template did. Lines holding a single
// space and the final blank line are in the live output too.
export function renderNotesPage({ ref = '', notes = [], browser = 'ie' }) {
  return HEAD +
    `\n<body class="${browser}">\n\t<div align="center">\n\t<div id="container">\n\t\t<h3>${ref}</h3>\n \n` +
    '<div id="accordion">\n\t' + notes.map(n => noteHtml(n)).join('') +
    '\n</div>\n \n\t</div></div>\n</body>\n</html>\n \n</body>\n</html>\n\n';
}

export default renderNotesPage;
