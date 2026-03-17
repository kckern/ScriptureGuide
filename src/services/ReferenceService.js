import { lookupReference, generateReference } from 'scripture-guide';
import { Reference } from '../domain/entities/Reference.js';

export class ReferenceService {
  parse(referenceString) {
    if (!referenceString || typeof referenceString !== 'string') {
      return new Reference({ query: '', normalized: '', verseIds: [] });
    }

    try {
      const result = lookupReference(referenceString);
      return Reference.fromLookup(result);
    } catch (error) {
      console.error('Reference parsing error:', error.message);
      return new Reference({
        query: referenceString,
        normalized: '',
        verseIds: []
      });
    }
  }

  format(verseIds) {
    if (!verseIds || verseIds.length === 0) {
      return '';
    }

    try {
      return generateReference(verseIds);
    } catch (error) {
      console.error('Reference generation error:', error.message);
      return '';
    }
  }

  isValidReference(referenceString) {
    const ref = this.parse(referenceString);
    return !ref.isEmpty;
  }
}

export default new ReferenceService();
